import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const packageJson = JSON.parse(
    readFileSync(resolve(process.cwd(), '..', '..', 'package.json'), 'utf-8')
  );
  const envVersion = env.VITE_APP_VERSION;
  const envGitHash = env.VITE_APP_GIT_HASH;
  let gitHash = envGitHash;

  if (!gitHash) {
    try {
      gitHash = execSync('git rev-parse --short HEAD').toString().trim();
    } catch (error) {
      console.warn('Failed to read git hash:', error);
      gitHash = 'unknown';
    }
  }

  const appVersion = envVersion || packageJson.version || '0.0.0';

  return {
    plugins: [react()],
    clearScreen: false,
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      'import.meta.env.VITE_APP_GIT_HASH': JSON.stringify(gitHash),
    },
    server: {
      strictPort: true,
    },
  };
});
