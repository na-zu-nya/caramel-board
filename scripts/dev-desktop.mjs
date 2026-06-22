#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const preflight = spawnSync(npmCommand, ['run', '-w', '@caramelboard/server', 'build'], {
  env: process.env,
  stdio: 'inherit',
});

if (preflight.status !== 0) {
  process.exit(preflight.status ?? 1);
}

const commands = [
  {
    name: 'desktop',
    args: ['run', '-w', '@caramelboard/desktop', 'dev'],
  },
  {
    name: 'client',
    args: ['run', '-w', '@caramelboard/client', 'dev:standalone'],
  },
  {
    name: 'storybook',
    args: ['run', '-w', '@caramelboard/client', 'dev:storybook'],
  },
];

const children = new Map();
let shuttingDown = false;
let exitCode = 0;

const exitIfDone = () => {
  if (shuttingDown && children.size === 0) {
    process.exit(exitCode);
  }
};

const stopAll = (signal = 'SIGTERM') => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children.values()) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
  exitIfDone();
};

for (const command of commands) {
  const child = spawn(npmCommand, command.args, {
    env: process.env,
    stdio: 'inherit',
  });
  children.set(command.name, child);

  child.on('exit', (code, signal) => {
    children.delete(command.name);
    if (code && code !== 0) {
      exitCode = code;
    } else if (signal && exitCode === 0) {
      exitCode = 1;
    }
    if (shuttingDown) {
      exitIfDone();
      return;
    }
    stopAll();
  });
}

process.on('SIGINT', () => {
  exitCode = 130;
  stopAll('SIGINT');
});

process.on('SIGTERM', () => {
  exitCode = 143;
  stopAll('SIGTERM');
});
