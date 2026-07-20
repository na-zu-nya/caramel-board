#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const desktopRoot = path.resolve(__dirname, '..');
const dmgDir = path.join(desktopRoot, 'src-tauri/target/release/bundle/dmg');

const run = (command, args) => {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit' });
};

const hasNotarizationCredentials = () =>
  Boolean(
    process.env.APPLE_API_KEY && process.env.APPLE_API_ISSUER && process.env.APPLE_API_KEY_PATH
  );

const findLatestDmg = () => {
  if (!fs.existsSync(dmgDir)) return null;

  const dmgFiles = fs
    .readdirSync(dmgDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.dmg'))
    .map((entry) => {
      const fullPath = path.join(dmgDir, entry.name);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    });

  if (dmgFiles.length === 0) return null;

  dmgFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return dmgFiles[0].fullPath;
};

const notarizeDmg = (dmgPath) => {
  run('xcrun', [
    'notarytool',
    'submit',
    dmgPath,
    '--key',
    process.env.APPLE_API_KEY_PATH,
    '--key-id',
    process.env.APPLE_API_KEY,
    '--issuer',
    process.env.APPLE_API_ISSUER,
    '--wait',
  ]);
};

const stapleDmg = (dmgPath) => {
  run('xcrun', ['stapler', 'staple', dmgPath]);
};

const main = () => {
  if (process.platform !== 'darwin') {
    console.log('Skipped DMG notarization: skipped (not macOS)');
    return;
  }

  if (!hasNotarizationCredentials()) {
    console.log('Skipped DMG notarization: skipped (no notarization credentials)');
    return;
  }

  const dmgPath = findLatestDmg();
  if (!dmgPath) {
    console.log(`Skipped DMG notarization: no .dmg found in ${dmgDir}`);
    return;
  }

  console.log(`Notarizing DMG: ${dmgPath}`);
  notarizeDmg(dmgPath);
  stapleDmg(dmgPath);
  console.log(`Notarized and stapled DMG: ${dmgPath}`);
};

main();
