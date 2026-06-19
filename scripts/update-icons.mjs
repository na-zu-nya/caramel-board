import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const desktopRoot = path.join(repoRoot, 'apps', 'desktop');
const clientPublic = path.join(repoRoot, 'apps', 'client', 'public');
const desktopIcons = path.join(desktopRoot, 'src-tauri', 'icons');
const desktopTrayIcons = path.join(desktopIcons, 'tray');
const brandAssets = path.join(repoRoot, 'assets', 'brand');

const explicitSourcePath = process.argv[2] ? path.resolve(process.argv[2]) : null;
const macIconSource = explicitSourcePath ?? path.join(brandAssets, 'app-icon-source-fill.png');
const windowsIconSource = explicitSourcePath ?? path.join(brandAssets, 'app-icon-source-trans.png');
const faviconPngSource = explicitSourcePath ?? windowsIconSource;
const faviconSvgSource = path.join(brandAssets, 'app-icon-source.svg');
const traySources = {
  color: path.join(brandAssets, 'tray-color.png'),
  menubarRunning: path.join(brandAssets, 'tray-menubar-running.png'),
  menubarStopped: path.join(brandAssets, 'tray-menubar-stopped.png'),
};

const requiredSources = [
  ['macOS app icon', macIconSource],
  ['Windows app icon', windowsIconSource],
  ['favicon PNG', faviconPngSource],
  ['tray color icon', traySources.color],
  ['macOS running menu bar icon', traySources.menubarRunning],
  ['macOS stopped menu bar icon', traySources.menubarStopped],
];

for (const [label, filePath] of requiredSources) {
  if (!existsSync(filePath)) {
    console.error(`${label} source was not found: ${filePath}`);
    process.exit(1);
  }
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tempDirs = [];

const generateIconSet = (label, sourcePath) => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), `caramel-board-${label}-icons-`));
  tempDirs.push(tempDir);

  const result = spawnSync(npmCommand, ['exec', '--', 'tauri', 'icon', sourcePath, '-o', tempDir], {
    cwd: desktopRoot,
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  const generated = {
    png: path.join(tempDir, 'icon.png'),
    ico: path.join(tempDir, 'icon.ico'),
    icns: path.join(tempDir, 'icon.icns'),
  };

  for (const [label, filePath] of Object.entries(generated)) {
    if (!existsSync(filePath)) {
      console.error(`Tauri icon generator did not create ${label}: ${filePath}`);
      process.exit(1);
    }
  }

  return generated;
};

try {
  const macIcons = generateIconSet('macos', macIconSource);
  const windowsIcons = generateIconSet('windows', windowsIconSource);

  mkdirSync(desktopTrayIcons, { recursive: true });

  copyFileSync(windowsIcons.ico, path.join(clientPublic, 'favicon.ico'));
  copyFileSync(faviconPngSource, path.join(clientPublic, 'favicon.png'));
  if (existsSync(faviconSvgSource)) {
    copyFileSync(faviconSvgSource, path.join(clientPublic, 'favicon.svg'));
  }

  copyFileSync(windowsIcons.png, path.join(desktopIcons, 'icon.png'));
  copyFileSync(windowsIcons.ico, path.join(desktopIcons, 'icon.ico'));
  copyFileSync(macIcons.icns, path.join(desktopIcons, 'icon.icns'));

  copyFileSync(traySources.color, path.join(desktopTrayIcons, 'tray-color.png'));
  copyFileSync(traySources.menubarRunning, path.join(desktopTrayIcons, 'tray-menubar-running.png'));
  copyFileSync(traySources.menubarStopped, path.join(desktopTrayIcons, 'tray-menubar-stopped.png'));

  console.log(`Updated macOS icon from ${path.relative(repoRoot, macIconSource)}`);
  console.log(`Updated Windows icon from ${path.relative(repoRoot, windowsIconSource)}`);
  console.log(`Updated tray icons from ${path.relative(repoRoot, brandAssets)}`);
} finally {
  for (const tempDir of tempDirs) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
