#!/usr/bin/env node

import { spawnNpm } from './npm-runner.mjs';

const mode = process.argv[2] || 'default';
const env =
  mode === 'next'
    ? {
        STANDALONE_SQLITE_PATH:
          process.env.STANDALONE_SQLITE_PATH || '../../exports/imported-reference-check.sqlite',
        PORT: process.env.PORT || '9000',
      }
    : {};

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
  { env }
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(`[server] failed to start dev: ${error.message}`);
  process.exit(1);
});
