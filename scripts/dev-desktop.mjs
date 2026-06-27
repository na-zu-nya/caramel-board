#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { npmArgs, spawnNpm, terminateChild } from './npm-runner.mjs';

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'npm';

const preflightArgs = ['run', '-w', '@caramelboard/server', 'build'];
const preflight = spawnSync(npmCommand, npmArgs(preflightArgs), {
  env: process.env,
  stdio: 'inherit',
});

if (preflight.status !== 0) {
  if (preflight.error) {
    console.error(`[dev] preflight failed: ${preflight.error.message}`);
  } else if (preflight.signal) {
    console.error(`[dev] preflight exited with signal ${preflight.signal}`);
  } else {
    console.error(`[dev] preflight exited with code ${preflight.status ?? 1}`);
  }
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
    env: {
      STORYBOOK_DISABLE_TELEMETRY: process.env.STORYBOOK_DISABLE_TELEMETRY || '1',
    },
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
    terminateChild(child, signal);
  }
  exitIfDone();
};

for (const command of commands) {
  console.log(`[dev] starting ${command.name}: npm ${command.args.join(' ')}`);
  const child = spawnNpm(command.args, {
    env: {
      ...(command.env ?? {}),
    },
  });
  children.set(command.name, child);

  child.on('error', (error) => {
    children.delete(command.name);
    console.error(`[dev] failed to start ${command.name}: ${error.message}`);
    if (exitCode === 0) {
      exitCode = 1;
    }
    if (shuttingDown) {
      exitIfDone();
      return;
    }
    stopAll();
  });

  child.on('exit', (code, signal) => {
    children.delete(command.name);
    if (!shuttingDown) {
      const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
      console.error(`[dev] ${command.name} exited with ${reason}; stopping remaining processes`);
    }
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
