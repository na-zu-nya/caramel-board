#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopRoot, '..', '..');
const resourcesRoot = path.join(desktopRoot, 'resources');
const serverResource = path.join(resourcesRoot, 'server');
const clientResource = path.join(resourcesRoot, 'client');
const runtimeResource = path.join(resourcesRoot, 'runtime');
const nodeRuntimeResource = path.join(runtimeResource, 'node');
const uvRuntimeResource = path.join(runtimeResource, 'uv');
const serverRoot = path.join(repoRoot, 'apps/server');
const clientRoot = path.join(repoRoot, 'apps/client');
const rootPackageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const rootPackageLock = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
const nodeMajor = Number(process.env.CARAMEL_NODE_MAJOR || 24);

const npmCommand = () => (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const isWindowsCommandScript = (command) => /\.(cmd|bat)$/i.test(command);

const run = (command, args, options = {}) => {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32' && isWindowsCommandScript(command),
    ...options,
  });
};

const ensureEmptyDir = (dir) => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
};

const copyDir = (from, to) => {
  fs.cpSync(from, to, {
    recursive: true,
    force: true,
    filter: (source) => {
      const rel = path.relative(from, source);
      if (!rel) return true;
      return !rel.split(path.sep).some((part) => part === 'node_modules' || part === '.turbo');
    },
  });
};

const findFile = (root, fileName) => {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === fileName) {
      return entryPath;
    }
    if (entry.isDirectory()) {
      const found = findFile(entryPath, fileName);
      if (found) return found;
    }
  }
  return null;
};

const download = (url) =>
  new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'caramel-board-desktop-packager' } }, (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume();
          download(new URL(response.headers.location, url).toString()).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`download failed: ${response.statusCode} ${url}`));
          response.resume();
          return;
        }
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });

const resolveLatestNodeVersion = async () => {
  if (process.env.CARAMEL_NODE_VERSION) return process.env.CARAMEL_NODE_VERSION;
  const raw = await download('https://nodejs.org/dist/index.json');
  const releases = JSON.parse(raw.toString('utf8'));
  const release = releases.find((item) => item.version.startsWith(`v${nodeMajor}.`));
  if (!release) {
    throw new Error(`Node ${nodeMajor} release was not found`);
  }
  return release.version;
};

const nodePlatform = () => {
  if (process.platform === 'darwin') return 'darwin';
  if (process.platform === 'win32') return 'win';
  if (process.platform === 'linux') return 'linux';
  throw new Error(`unsupported platform: ${process.platform}`);
};

const nodeArch = () => {
  if (process.arch === 'arm64') return 'arm64';
  if (process.arch === 'x64') return 'x64';
  throw new Error(`unsupported arch: ${process.arch}`);
};

const uvTarget = () => {
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'aarch64-apple-darwin';
  if (process.platform === 'darwin' && process.arch === 'x64') return 'x86_64-apple-darwin';
  if (process.platform === 'win32' && process.arch === 'arm64') return 'aarch64-pc-windows-msvc';
  if (process.platform === 'win32' && process.arch === 'x64') return 'x86_64-pc-windows-msvc';
  if (process.platform === 'linux' && process.arch === 'arm64') return 'aarch64-unknown-linux-gnu';
  if (process.platform === 'linux' && process.arch === 'x64') return 'x86_64-unknown-linux-gnu';
  throw new Error(`unsupported uv target: ${process.platform}-${process.arch}`);
};

const extractTarGzWithSystemTar = (archivePath, destination) => {
  run('tar', ['-xzf', archivePath, '-C', destination]);
};

const extractZipWithPowershell = (archivePath, destination) => {
  run('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -Force ${JSON.stringify(archivePath)} ${JSON.stringify(destination)}`,
  ]);
};

const nodeExecutableName = () => (process.platform === 'win32' ? 'node.exe' : 'node');

const findNodeExecutable = (root) => {
  const executableName = nodeExecutableName();
  const candidates =
    process.platform === 'win32'
      ? [path.join(root, executableName), path.join(root, 'bin', executableName)]
      : [path.join(root, 'bin', executableName), path.join(root, executableName)];
  return candidates.find((candidate) => fs.existsSync(candidate));
};

const installNodeExecutable = (sourceRoot) => {
  const executable = findNodeExecutable(sourceRoot);
  if (!executable) {
    throw new Error(`Node archive did not include ${nodeExecutableName()}`);
  }
  const target = path.join(nodeRuntimeResource, nodeExecutableName());
  fs.copyFileSync(executable, target);
  fs.chmodSync(target, 0o755);
};

const installNodeRuntime = async () => {
  ensureEmptyDir(nodeRuntimeResource);

  if (process.env.CARAMEL_NODE_SOURCE === 'local') {
    const localNode = process.execPath;
    const target = path.join(nodeRuntimeResource, nodeExecutableName());
    fs.copyFileSync(localNode, target);
    fs.chmodSync(target, 0o755);
    console.log(`Copied local Node runtime: ${localNode}`);
    return;
  }

  const version = await resolveLatestNodeVersion();
  const platform = nodePlatform();
  const arch = nodeArch();
  const extension = process.platform === 'win32' ? 'zip' : 'tar.gz';
  const baseName = `node-${version}-${platform}-${arch}`;
  const url = `https://nodejs.org/dist/${version}/${baseName}.${extension}`;
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'caramel-node-'));
  const archivePath = path.join(tmpRoot, `${baseName}.${extension}`);

  console.log(`Downloading ${url}`);
  fs.writeFileSync(archivePath, await download(url));

  if (process.platform === 'win32') {
    extractZipWithPowershell(archivePath, tmpRoot);
  } else {
    extractTarGzWithSystemTar(archivePath, tmpRoot);
  }

  const extracted = path.join(tmpRoot, baseName);
  if (!fs.existsSync(extracted)) {
    throw new Error(`Node archive did not extract to ${extracted}`);
  }

  installNodeExecutable(extracted);
  console.log(`Installed Node runtime ${version} for ${platform}-${arch}`);
};

const installUvRuntime = async () => {
  ensureEmptyDir(uvRuntimeResource);

  if (process.env.CARAMEL_UV_SOURCE === 'local') {
    const localUv = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['uv'], {
      encoding: 'utf8',
    })
      .trim()
      .split(/\r?\n/)[0];
    const target = path.join(uvRuntimeResource, process.platform === 'win32' ? 'uv.exe' : 'uv');
    fs.copyFileSync(localUv, target);
    fs.chmodSync(target, 0o755);
    console.log(`Copied local uv runtime: ${localUv}`);
    return;
  }

  const target = uvTarget();
  const extension = process.platform === 'win32' ? 'zip' : 'tar.gz';
  const baseName = `uv-${target}`;
  const version = process.env.CARAMEL_UV_VERSION;
  const releasePath = version ? `download/${version}` : 'latest/download';
  const url = `https://github.com/astral-sh/uv/releases/${releasePath}/${baseName}.${extension}`;
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'caramel-uv-'));
  const archivePath = path.join(tmpRoot, `${baseName}.${extension}`);

  console.log(`Downloading ${url}`);
  fs.writeFileSync(archivePath, await download(url));

  if (process.platform === 'win32') {
    extractZipWithPowershell(archivePath, tmpRoot);
  } else {
    extractTarGzWithSystemTar(archivePath, tmpRoot);
  }

  const executableName = process.platform === 'win32' ? 'uv.exe' : 'uv';
  const extractedUv = findFile(tmpRoot, executableName);
  if (!extractedUv) {
    throw new Error(`uv archive did not include ${executableName}`);
  }

  const targetPath = path.join(uvRuntimeResource, executableName);
  fs.copyFileSync(extractedUv, targetPath);
  fs.chmodSync(targetPath, 0o755);
  console.log(`Installed uv runtime ${version ?? 'latest'} for ${target}`);
};

const writeRuntimeServerPackageJson = () => {
  const raw = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8'));
  const packageJson = {
    name: '@caramelboard/runtime-server',
    private: true,
    version: rootPackageJson.version,
    type: 'module',
    dependencies: raw.dependencies,
  };
  fs.writeFileSync(
    path.join(serverResource, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`
  );
};

const rootDependencyPackagePath = (packageName) => path.posix.join('node_modules', packageName);

const platformMatches = (constraints, currentValue) => {
  if (!Array.isArray(constraints)) return true;
  const excluded = constraints.some((constraint) => constraint === `!${currentValue}`);
  if (excluded) return false;

  const included = constraints.filter((constraint) => !constraint.startsWith('!'));
  return included.length === 0 || included.includes(currentValue);
};

const packageSupportsCurrentPlatform = (packageEntry) => {
  return (
    platformMatches(packageEntry.os, process.platform) &&
    platformMatches(packageEntry.cpu, process.arch)
  );
};

const resolveDependencyPackagePath = (fromPackagePath, dependencyName) => {
  let current = fromPackagePath;
  const candidates = [];

  while (current && current !== '.') {
    candidates.push(path.posix.join(current, 'node_modules', dependencyName));
    current = path.posix.dirname(current);
  }
  candidates.push(rootDependencyPackagePath(dependencyName));

  return candidates.find((candidate) => rootPackageLock.packages[candidate]);
};

const copyLockedPackage = (packagePath) => {
  const source = path.join(repoRoot, packagePath);
  if (!fs.existsSync(source)) {
    throw new Error(`Installed package was not found: ${packagePath}`);
  }
  const target = path.join(serverResource, packagePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, {
    recursive: true,
    force: true,
    verbatimSymlinks: true,
  });
};

const copyRuntimeDependencyClosure = (packagePath, copiedPackagePaths) => {
  if (copiedPackagePaths.has(packagePath)) return;

  const packageEntry = rootPackageLock.packages[packagePath];
  if (!packageEntry) {
    throw new Error(`Package lock entry was not found: ${packagePath}`);
  }
  if (!packageSupportsCurrentPlatform(packageEntry)) return;

  copyLockedPackage(packagePath);
  copiedPackagePaths.add(packagePath);

  for (const dependencyName of Object.keys(packageEntry.dependencies ?? {})) {
    const resolvedPackagePath = resolveDependencyPackagePath(packagePath, dependencyName);
    if (!resolvedPackagePath) {
      throw new Error(`Dependency lock entry was not found: ${packagePath} -> ${dependencyName}`);
    }
    copyRuntimeDependencyClosure(resolvedPackagePath, copiedPackagePaths);
  }

  for (const dependencyName of Object.keys(packageEntry.optionalDependencies ?? {})) {
    const resolvedPackagePath = resolveDependencyPackagePath(packagePath, dependencyName);
    if (resolvedPackagePath) {
      copyRuntimeDependencyClosure(resolvedPackagePath, copiedPackagePaths);
    }
  }
};

const installServerRuntimeDependencies = () => {
  const raw = JSON.parse(fs.readFileSync(path.join(serverRoot, 'package.json'), 'utf8'));
  const copiedPackagePaths = new Set();
  fs.mkdirSync(path.join(serverResource, 'node_modules'), { recursive: true });

  for (const dependencyName of Object.keys(raw.dependencies ?? {})) {
    copyRuntimeDependencyClosure(rootDependencyPackagePath(dependencyName), copiedPackagePaths);
  }
  console.log(`Copied ${copiedPackagePaths.size} runtime packages from root node_modules`);
};

const removeIfExists = (target) => {
  fs.rmSync(target, { recursive: true, force: true });
};

const removeFilesByExtension = (root, extensions) => {
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      removeFilesByExtension(entryPath, extensions);
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      fs.rmSync(entryPath, { force: true });
    }
  }
};

const pruneServerRuntime = () => {
  const nodeModules = path.join(serverResource, 'node_modules');
  removeIfExists(path.join(nodeModules, '.bin'));
  removeFilesByExtension(nodeModules, ['.map', '.d.ts', '.d.mts']);
};

const prepareServerRuntime = () => {
  ensureEmptyDir(serverResource);
  fs.mkdirSync(path.join(serverResource, 'dist'), { recursive: true });
  fs.cpSync(path.join(serverRoot, 'dist'), path.join(serverResource, 'dist'), {
    recursive: true,
    force: true,
  });
  fs.cpSync(path.join(serverRoot, 'sqlite'), path.join(serverResource, 'sqlite'), {
    recursive: true,
    force: true,
  });
  fs.cpSync(path.join(serverRoot, 'scripts'), path.join(serverResource, 'scripts'), {
    recursive: true,
    force: true,
  });
  writeRuntimeServerPackageJson();

  installServerRuntimeDependencies();
  pruneServerRuntime();
};

const prepareClientRuntime = () => {
  ensureEmptyDir(clientResource);
  copyDir(path.join(clientRoot, 'dist'), path.join(clientResource, 'dist'));
};

const prepareAutoTagBridge = () => {
  const source = path.join(repoRoot, 'integrations/joytag');
  const target = path.join(resourcesRoot, 'integrations/joytag');
  ensureEmptyDir(target);
  fs.cpSync(source, target, {
    recursive: true,
    force: true,
    filter: (file) => !file.includes('__pycache__'),
  });
};

const main = async () => {
  run(npmCommand(), ['run', '-w', '@caramelboard/server', 'build']);
  run(npmCommand(), ['run', '-w', '@caramelboard/client', 'build']);

  fs.mkdirSync(resourcesRoot, { recursive: true });
  await installNodeRuntime();
  await installUvRuntime();
  prepareServerRuntime();
  prepareClientRuntime();
  prepareAutoTagBridge();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
