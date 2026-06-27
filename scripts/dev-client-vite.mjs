#!/usr/bin/env node

import { spawnNpm } from './npm-runner.mjs';

const defaultApiUrl = process.argv[2] || 'http://localhost:6766';
const child = spawnNpm(['exec', '--', 'vite', '--port', '3000', '--host'], {
  env: {
    VITE_API_URL: process.env.VITE_API_URL || defaultApiUrl,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(`[client] failed to start Vite: ${error.message}`);
  process.exit(1);
});
