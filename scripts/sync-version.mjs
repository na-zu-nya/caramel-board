#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');
const appPackagePaths = [
  'apps/desktop/package.json',
  'apps/docker-migration/package.json',
  'apps/chrome-extension/package.json',
];

const readText = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const writeText = (relativePath, content) =>
  fs.writeFileSync(path.join(repoRoot, relativePath), content);
const readJson = (relativePath) => JSON.parse(readText(relativePath));
const writeJson = (relativePath, value) =>
  writeText(relativePath, `${JSON.stringify(value, null, 2)}\n`);

const rootPackage = readJson('package.json');
const version = rootPackage.version;

if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`package.json の version が SemVer として扱えません: ${version}`);
}

const deriveWindowsInstallerVersion = (sourceVersion) => {
  const [core] = sourceVersion.split('-', 2);
  const [major, minor, patch] = core.split('.').map((part) => Number.parseInt(part, 10));

  if (![major, minor, patch].every(Number.isInteger)) {
    throw new Error(`Windows インストーラーバージョンを導出できません: ${sourceVersion}`);
  }

  if (major > 255 || minor > 255 || patch > 65535) {
    throw new Error(`Windows インストーラーバージョンの数値が大きすぎます: ${sourceVersion}`);
  }

  // beta / rc / stable は suffix ではなく数値部分で順序を管理する。
  // Windows Installer にはラベルを除いた 3 フィールドだけを渡す。
  return `${major}.${minor}.${patch}`;
};

const deriveChromeExtensionVersion = (sourceVersion) => {
  const [core] = sourceVersion.split('-', 2);
  const segments = core.split('.').map((part) => Number.parseInt(part, 10));

  if (segments.length !== 3 || !segments.every(Number.isInteger)) {
    throw new Error(`Chrome拡張バージョンを導出できません: ${sourceVersion}`);
  }

  return segments.join('.');
};

const updatePackageVersion = (relativePath) => {
  const packageJson = readJson(relativePath);
  packageJson.version = version;

  writeJson(relativePath, packageJson);
};

const updatePackageLock = () => {
  const packageLock = readJson('package-lock.json');
  packageLock.version = version;

  const packages = packageLock.packages ?? {};
  if (packages['']) {
    packages[''].version = version;
  }

  for (const relativePath of appPackagePaths) {
    const packageDir = path.dirname(relativePath);
    if (packages[packageDir]) {
      packages[packageDir].version = version;
    }
  }

  writeJson('package-lock.json', packageLock);
};

const replaceRequired = (relativePath, pattern, replacement) => {
  const current = readText(relativePath);
  const nonGlobalPattern = new RegExp(pattern.source, pattern.flags.replace('g', ''));
  if (!nonGlobalPattern.test(current)) {
    throw new Error(`${relativePath} の更新対象が見つかりませんでした`);
  }
  const next = current.replace(pattern, replacement);
  writeText(relativePath, next);
};

const replaceOrInsertAfter = (relativePath, pattern, replacement, insertAfterPattern) => {
  const current = readText(relativePath);
  const nonGlobalPattern = new RegExp(pattern.source, pattern.flags.replace('g', ''));

  if (nonGlobalPattern.test(current)) {
    writeText(relativePath, current.replace(pattern, replacement));
    return;
  }

  const next = current.replace(insertAfterPattern, `$&\n${replacement}`);
  if (next === current) {
    throw new Error(`${relativePath} の挿入位置が見つかりませんでした`);
  }

  writeText(relativePath, next);
};

const updateTauriConfig = (windowsInstallerVersion) => {
  replaceRequired(
    'apps/desktop/src-tauri/tauri.conf.json',
    /^ {2}"version": ".*",$/m,
    `  "version": "${version}",`
  );
  replaceRequired(
    'apps/desktop/src-tauri/tauri.conf.json',
    /("template": "wix\/main\.wxs")(,\r?\n {8}"version": ".*")?/,
    `$1,\n        "version": "${windowsInstallerVersion}"`
  );
};

const updateWindowsTauriConfig = (windowsInstallerVersion) => {
  const config = {
    bundle: {
      windows: {
        wix: {
          version: windowsInstallerVersion,
        },
      },
    },
  };
  writeJson('apps/desktop/src-tauri/tauri.windows.conf.json', config);
};

const updateCargoVersion = () => {
  replaceRequired(
    'apps/desktop/src-tauri/Cargo.toml',
    /^version = ".*"$/m,
    `version = "${version}"`
  );
  replaceRequired(
    'apps/desktop/src-tauri/Cargo.lock',
    /(\[\[package\]\]\r?\nname = "caramel-board-desktop"\r?\nversion = ")[^"]+(")/,
    `$1${version}$2`
  );
};

const updateDocs = () => {
  replaceRequired(
    'docs/desktop-packaging.md',
    /Caramel Board_[^_]+_aarch64\.dmg/g,
    `Caramel Board_${version}_aarch64.dmg`
  );
};

const updateChromeExtensionManifest = (chromeExtensionVersion) => {
  replaceRequired(
    'apps/chrome-extension/manifest.json',
    /^ {2}"version": ".*",$/m,
    `  "version": "${chromeExtensionVersion}",`
  );
  replaceOrInsertAfter(
    'apps/chrome-extension/manifest.json',
    /^ {2}"version_name": ".*",$/m,
    `  "version_name": "${version}",`,
    /^ {2}"version": ".*",$/m
  );
};

for (const relativePath of appPackagePaths) {
  updatePackageVersion(relativePath);
}

const windowsInstallerVersion = deriveWindowsInstallerVersion(version);

updatePackageLock();
updateTauriConfig(windowsInstallerVersion);
updateWindowsTauriConfig(windowsInstallerVersion);
updateCargoVersion();
updateDocs();
updateChromeExtensionManifest(deriveChromeExtensionVersion(version));

console.log(`Synced Caramel Board version: ${version}`);
