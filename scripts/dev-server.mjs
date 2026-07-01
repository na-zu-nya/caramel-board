#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnNpm, terminateChild } from './npm-runner.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const serverRoot = path.join(repoRoot, 'apps/server');
const appIdentifier = 'app.caramel-board.desktop';

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const readSettingsPath = () => {
  if (process.env.CARAMEL_SETTINGS_PATH) {
    return path.resolve(process.env.CARAMEL_SETTINGS_PATH);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library/Application Support', appIdentifier, 'settings.json');
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, appIdentifier, 'settings.json');
  }
  const configRoot = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configRoot, appIdentifier, 'settings.json');
};

const readSettings = () => {
  const settingsPath = readSettingsPath();
  if (!fs.existsSync(settingsPath)) {
    throw new Error(`desktop settings not found at ${settingsPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  if (!isRecord(parsed)) {
    throw new Error(`desktop settings must be an object: ${settingsPath}`);
  }
  return { settings: parsed, settingsPath };
};

const readString = (settings, key) => {
  const value = settings[key];
  return typeof value === 'string' ? value : '';
};

const readBoolean = (settings, key) => settings[key] === true;

const readPort = (settings) => {
  const value = settings.port;
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return String(value);
  }
  return '6777';
};

const optionalEnv = (env, key, value) => {
  if (value !== '') {
    env[key] = value;
  }
};

const standaloneEnv = () => {
  const { settings, settingsPath } = readSettings();
  if (!readBoolean(settings, 'setupCompleted')) {
    throw new Error(`desktop setup is not completed: ${settingsPath}`);
  }

  const dbPath = readString(settings, 'dbPath');
  const libraryPath = readString(settings, 'libraryPath');
  if (dbPath === '') {
    throw new Error(`dbPath is not configured in ${settingsPath}`);
  }
  if (libraryPath === '') {
    throw new Error(`libraryPath is not configured in ${settingsPath}`);
  }

  const allowExternalNetwork = readBoolean(settings, 'allowExternalNetwork');
  const configuredDbPath =
    process.env.STANDALONE_SQLITE_PATH || process.env.SQLITE_DB_PATH || dbPath;
  const env = {
    PORT: process.env.PORT || readPort(settings),
    HOST: process.env.HOST || (allowExternalNetwork ? '0.0.0.0' : '127.0.0.1'),
    CARAMEL_ALLOW_EXTERNAL:
      process.env.CARAMEL_ALLOW_EXTERNAL || (allowExternalNetwork ? '1' : '0'),
    STANDALONE_SQLITE_PATH: configuredDbPath,
    SQLITE_DB_PATH: configuredDbPath,
    FILES_STORAGE: process.env.FILES_STORAGE || libraryPath,
    STATIC_ROOT: process.env.STATIC_ROOT || path.join(repoRoot, 'apps/client/dist'),
  };

  optionalEnv(env, 'CARAMEL_UI_LANGUAGE', readString(settings, 'language'));
  optionalEnv(env, 'CARAMEL_BASIC_AUTH_USERNAME', readString(settings, 'basicAuthUsername'));
  optionalEnv(env, 'CARAMEL_BASIC_AUTH_PASSWORD', readString(settings, 'basicAuthPassword'));
  optionalEnv(env, 'FFMPEG_PATH', readString(settings, 'ffmpegPath'));
  optionalEnv(env, 'PDF_RASTERIZER_PATH', readString(settings, 'pdfRasterizerPath'));

  if (readBoolean(settings, 'basicAuthEnabled')) {
    env.CARAMEL_BASIC_AUTH_ENABLED = '1';
  }
  if (typeof settings.autoTagPort === 'number' && Number.isInteger(settings.autoTagPort)) {
    env.JOYTAG_SERVER_URL = `http://127.0.0.1:${settings.autoTagPort}`;
  }

  console.log(`[server] standalone settings: ${settingsPath}`);
  console.log(`[server] standalone storage: ${libraryPath}`);
  return env;
};

const resolveEnv = (mode) => {
  if (mode === 'standalone') {
    return standaloneEnv();
  }
  if (mode === 'next') {
    return {
      STANDALONE_SQLITE_PATH:
        process.env.STANDALONE_SQLITE_PATH || '../../exports/imported-reference-check.sqlite',
      PORT: process.env.PORT || '9000',
    };
  }
  return {};
};

const mode = process.argv[2] || 'default';
let env;

try {
  env = resolveEnv(mode);
} catch (error) {
  console.error(`[server] failed to resolve dev environment: ${error.message}`);
  process.exit(1);
}

console.log('[server] dev watch enabled: apps/server/src -> apps/server/dist/entry.node.mjs');

const child = spawnNpm(
  [
    'exec',
    '--',
    'nodemon',
    '--watch',
    'src',
    '--ext',
    'ts',
    '--exec',
    'npm run build && node dist/entry.node.mjs',
  ],
  { cwd: serverRoot, env }
);

let shuttingDown = false;

const exitCodeForSignal = (signal) => {
  if (signal === 'SIGINT') return 130;
  if (signal === 'SIGTERM') return 143;
  return 1;
};

const stopChild = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  terminateChild(child, signal);
};

child.on('exit', (code, signal) => {
  if (shuttingDown) {
    process.exit(code ?? (signal ? exitCodeForSignal(signal) : 0));
  }
  if (signal) {
    process.exit(exitCodeForSignal(signal));
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(`[server] failed to start dev: ${error.message}`);
  process.exit(1);
});

process.on('SIGINT', () => {
  stopChild('SIGINT');
});

process.on('SIGTERM', () => {
  stopChild('SIGTERM');
});
