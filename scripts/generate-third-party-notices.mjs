#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const packageLockPath = path.join(repoRoot, 'package-lock.json');
const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
const rootPackageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const licenseFileText = fs.readFileSync(path.join(repoRoot, 'LICENSE'), 'utf8').trim();
const projectLicense = {
  name: 'Caramel Board Source Available License 1.0',
  fileName: 'LICENSE',
  text: licenseFileText,
};

const runtimeScopes = [
  {
    name: 'Client application',
    workspacePath: 'apps/client',
    packageJsonPath: 'apps/client/package.json',
  },
  {
    name: 'Desktop settings UI',
    workspacePath: 'apps/desktop',
    packageJsonPath: 'apps/desktop/package.json',
  },
  {
    name: 'Bundled server runtime',
    workspacePath: null,
    dependencyNames: ['dotenv', 'fs-extra', 'sharp'],
  },
];

const bundledComponents = [
  {
    name: 'Caramel Board',
    version: rootPackageJson.version,
    license: 'Caramel Board Source Available License 1.0',
    note: 'The application code is governed by the project LICENSE file.',
  },
  {
    name: 'Tauri and Rust crates',
    version: 'See apps/desktop/src-tauri/Cargo.lock',
    license: 'See each crate license',
    note: 'The desktop shell is built with Tauri and Rust crates recorded in Cargo.lock.',
  },
  {
    name: 'Node.js runtime',
    version: process.env.CARAMEL_NODE_VERSION ?? 'Resolved during desktop packaging',
    license: 'MIT',
    note: 'Desktop packages may include a Node.js runtime for the bundled local server.',
  },
  {
    name: 'uv runtime',
    version: process.env.CARAMEL_UV_VERSION ?? 'Resolved during desktop packaging',
    license: 'Apache-2.0 OR MIT',
    note: 'Desktop packages may include uv for optional local integrations.',
  },
];

const optionalExternalTools = [
  {
    name: 'FFmpeg',
    purpose: 'GIF and video preview generation',
    note: 'Installed separately by the user or administrator unless a distributor bundles it.',
  },
  {
    name: 'Poppler',
    purpose: 'PDF rasterization',
    note: 'Installed separately by the user or administrator unless a distributor bundles it.',
  },
  {
    name: 'JoyTag / AutoTag dependencies',
    purpose: 'Optional local image tagging',
    note: 'Installed or prepared separately for AutoTag; review their own licenses before redistribution.',
  },
];

const rootDependencyPackagePath = (packageName) => path.posix.join('node_modules', packageName);

const platformMatches = (constraints, currentValue) => {
  if (!Array.isArray(constraints)) return true;
  if (constraints.some((constraint) => constraint === `!${currentValue}`)) return false;

  const included = constraints.filter((constraint) => !constraint.startsWith('!'));
  return included.length === 0 || included.includes(currentValue);
};

const packageSupportsCurrentPlatform = (packageEntry) =>
  platformMatches(packageEntry.os, process.platform) &&
  platformMatches(packageEntry.cpu, process.arch);

const resolveDependencyPackagePath = (fromPackagePath, dependencyName) => {
  let current = fromPackagePath ?? '.';
  const candidates = [];

  while (current && current !== '.') {
    candidates.push(path.posix.join(current, 'node_modules', dependencyName));
    current = path.posix.dirname(current);
  }
  candidates.push(rootDependencyPackagePath(dependencyName));

  return candidates.find((candidate) => packageLock.packages[candidate]);
};

const packageNameFromLockPath = (packagePath) => {
  const marker = 'node_modules/';
  const index = packagePath.lastIndexOf(marker);
  if (index < 0) return packagePath;

  const relative = packagePath.slice(index + marker.length);
  const parts = relative.split('/');
  return relative.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
};

const readJsonIfExists = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const stringifyLicense = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyLicense(item))
      .filter(Boolean)
      .join(' OR ');
  }
  if (typeof value === 'object') {
    if (typeof value.type === 'string') return value.type;
    if (typeof value.name === 'string') return value.name;
  }
  return null;
};

const repositoryUrl = (value) => {
  if (!value) return null;
  const raw = typeof value === 'string' ? value : typeof value.url === 'string' ? value.url : null;
  if (!raw) return null;

  const withoutGitPrefix = raw.replace(/^git\+/, '');
  if (withoutGitPrefix.startsWith('git://github.com/')) {
    return `https://github.com/${withoutGitPrefix.slice('git://github.com/'.length)}`.replace(
      /\.git$/,
      ''
    );
  }
  if (withoutGitPrefix.startsWith('git@github.com:')) {
    return `https://github.com/${withoutGitPrefix.slice('git@github.com:'.length)}`.replace(
      /\.git$/,
      ''
    );
  }
  if (/^https?:\/\//.test(withoutGitPrefix)) {
    return withoutGitPrefix.replace(/\.git$/, '');
  }
  return withoutGitPrefix;
};

const findNoticeFiles = (packageDir) => {
  if (!fs.existsSync(packageDir)) return [];

  return fs
    .readdirSync(packageDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => {
      const name = entry.name.toUpperCase();
      return (
        name.startsWith('LICENSE') ||
        name.startsWith('LICENCE') ||
        name.startsWith('COPYING') ||
        name.startsWith('NOTICE')
      );
    })
    .map((entry) => {
      const filePath = path.join(packageDir, entry.name);
      return {
        name: entry.name,
        text: fs.readFileSync(filePath, 'utf8').trim(),
      };
    })
    .filter((file) => file.text.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
};

const addUniqueTextFile = (files, nextFile) => {
  if (!files.some((file) => file.name === nextFile.name && file.text === nextFile.text)) {
    files.push(nextFile);
  }
};

const collectScopePackagePaths = (scope) => {
  const dependencies =
    scope.dependencyNames ??
    Object.keys(readJsonIfExists(path.join(repoRoot, scope.packageJsonPath))?.dependencies ?? {});
  const seen = new Set();

  const walk = (packagePath) => {
    if (seen.has(packagePath)) return;

    const packageEntry = packageLock.packages[packagePath];
    if (!packageEntry || !packageSupportsCurrentPlatform(packageEntry)) return;

    seen.add(packagePath);

    for (const dependencyName of Object.keys(packageEntry.dependencies ?? {})) {
      const resolved = resolveDependencyPackagePath(packagePath, dependencyName);
      if (resolved) walk(resolved);
    }

    for (const dependencyName of Object.keys(packageEntry.optionalDependencies ?? {})) {
      const resolved = resolveDependencyPackagePath(packagePath, dependencyName);
      if (resolved) walk(resolved);
    }
  };

  for (const dependencyName of dependencies) {
    const startPath = scope.workspacePath
      ? resolveDependencyPackagePath(scope.workspacePath, dependencyName)
      : rootDependencyPackagePath(dependencyName);
    if (startPath) walk(startPath);
  }

  return seen;
};

const collectPackages = () => {
  const packagesByKey = new Map();

  for (const scope of runtimeScopes) {
    const packagePaths = collectScopePackagePaths(scope);

    for (const packagePath of packagePaths) {
      const packageEntry = packageLock.packages[packagePath];
      const packageDir = path.join(repoRoot, packagePath);
      const packageJson = readJsonIfExists(path.join(packageDir, 'package.json'));
      const name = packageJson?.name ?? packageNameFromLockPath(packagePath);
      const version = packageJson?.version ?? packageEntry.version ?? 'unknown';
      const license =
        stringifyLicense(packageJson?.license) ??
        stringifyLicense(packageJson?.licenses) ??
        stringifyLicense(packageEntry.license) ??
        'UNKNOWN';
      const key = `${name}@${version}`;
      const existing = packagesByKey.get(key);
      const target = existing ?? {
        name,
        version,
        license,
        scopes: [],
        packagePaths: [],
        homepage: packageJson?.homepage ?? null,
        repository: repositoryUrl(packageJson?.repository),
        noticeFiles: [],
      };

      if (!target.scopes.includes(scope.name)) target.scopes.push(scope.name);
      if (!target.packagePaths.includes(packagePath)) target.packagePaths.push(packagePath);
      for (const noticeFile of findNoticeFiles(packageDir)) {
        addUniqueTextFile(target.noticeFiles, noticeFile);
      }
      packagesByKey.set(key, target);
    }
  }

  return [...packagesByKey.values()].sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`)
  );
};

const collectLicenseSummary = (packages) => {
  const counts = new Map();
  for (const item of packages) {
    counts.set(item.license, (counts.get(item.license) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([license, count]) => ({ license, count }))
    .sort((a, b) => b.count - a.count || a.license.localeCompare(b.license));
};

const manifest = {
  generatedAt: new Date().toISOString(),
  sourceFiles: ['package-lock.json', 'apps/client/package.json', 'apps/desktop/package.json'],
  packageCount: 0,
  bundledComponents,
  optionalExternalTools,
  projectLicense,
  licenseSummary: [],
  packages: collectPackages(),
};
manifest.packageCount = manifest.packages.length;
manifest.licenseSummary = collectLicenseSummary(manifest.packages);

const markdownLines = [
  '# Third-Party Notices',
  '',
  `Generated at: ${manifest.generatedAt}`,
  '',
  'This generated notice is based on runtime dependency lockfiles and package notice files available at build time.',
  '',
  '## Bundled Components',
  '',
  '### Caramel Board License',
  '',
  '```text',
  manifest.projectLicense.text,
  '```',
  '',
  ...manifest.bundledComponents.flatMap((item) => [
    `### ${item.name}`,
    '',
    `- Version: ${item.version}`,
    `- License: ${item.license}`,
    `- Note: ${item.note}`,
    '',
  ]),
  '## Optional External Tools',
  '',
  ...manifest.optionalExternalTools.flatMap((item) => [
    `### ${item.name}`,
    '',
    `- Purpose: ${item.purpose}`,
    `- Note: ${item.note}`,
    '',
  ]),
  '## npm Runtime Packages',
  '',
  ...manifest.packages.flatMap((item) =>
    [
      `### ${item.name} ${item.version}`,
      '',
      `- License: ${item.license}`,
      `- Scopes: ${item.scopes.join(', ')}`,
      item.homepage ? `- Homepage: ${item.homepage}` : null,
      item.repository ? `- Repository: ${item.repository}` : null,
      '',
      ...item.noticeFiles.flatMap((file) => [
        `#### ${file.name}`,
        '',
        '```text',
        file.text,
        '```',
        '',
      ]),
    ].filter(Boolean)
  ),
];

const plainTextLines = [
  'Third-Party Notices',
  '',
  `Generated at: ${manifest.generatedAt}`,
  '',
  'This generated notice is based on runtime dependency lockfiles and package notice files available at build time.',
  '',
  'Bundled Components',
  '',
  'Caramel Board License',
  '',
  manifest.projectLicense.text,
  '',
  ...manifest.bundledComponents.flatMap((item) => [
    item.name,
    '',
    `Version: ${item.version}`,
    `License: ${item.license}`,
    `Note: ${item.note}`,
    '',
  ]),
  'Optional External Tools',
  '',
  ...manifest.optionalExternalTools.flatMap((item) => [
    item.name,
    '',
    `Purpose: ${item.purpose}`,
    `Note: ${item.note}`,
    '',
  ]),
  'npm Runtime Packages',
  '',
  ...manifest.packages.flatMap((item) =>
    [
      `${item.name} ${item.version}`,
      '',
      `License: ${item.license}`,
      `Scopes: ${item.scopes.join(', ')}`,
      item.homepage ? `Homepage: ${item.homepage}` : null,
      item.repository ? `Repository: ${item.repository}` : null,
      '',
      ...item.noticeFiles.flatMap((file) => [file.name, '', file.text, '']),
    ].filter(Boolean)
  ),
];

const writeFile = (relativePath, content) => {
  const targetPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content);
};

writeFile('THIRD_PARTY_NOTICES.generated.md', `${markdownLines.join('\n')}\n`);
writeFile('apps/client/public/legal/THIRD_PARTY_NOTICES.txt', `${plainTextLines.join('\n')}\n`);
writeFile('apps/desktop/public/legal/THIRD_PARTY_NOTICES.txt', `${plainTextLines.join('\n')}\n`);
writeFile('apps/client/public/legal/LICENSE.txt', `${licenseFileText}\n`);
writeFile('apps/desktop/public/legal/LICENSE.txt', `${licenseFileText}\n`);

console.log(`Generated notices for ${manifest.packageCount} runtime npm packages.`);
