import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const desktopRoot = path.join(repoRoot, 'apps', 'desktop');
const clientPublic = path.join(repoRoot, 'apps', 'client', 'public');
const desktopIcons = path.join(desktopRoot, 'src-tauri', 'icons');

const defaultPng = path.join(clientPublic, 'favicon.png');
const defaultSvg = path.join(clientPublic, 'favicon.svg');
const sourcePath = path.resolve(
  process.argv[2] ?? (existsSync(defaultPng) ? defaultPng : defaultSvg)
);

if (!existsSync(sourcePath)) {
  console.error(`Icon source was not found: ${sourcePath}`);
  process.exit(1);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'caramel-board-icons-'));

try {
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

  copyFileSync(generated.ico, path.join(clientPublic, 'favicon.ico'));
  copyFileSync(generated.png, path.join(desktopIcons, 'icon.png'));
  copyFileSync(generated.ico, path.join(desktopIcons, 'icon.ico'));
  copyFileSync(generated.icns, path.join(desktopIcons, 'icon.icns'));

  console.log(`Updated icons from ${path.relative(repoRoot, sourcePath)}`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
