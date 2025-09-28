import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Viteの環境変数システムを使用
  const env = loadEnv(mode, process.cwd(), '');

  // APIのURLを決定（優先順位: 環境変数 > デフォルト）
  const apiUrl = env.VITE_API_URL || 'http://localhost:6766';

  const packageJsonPath = resolve(process.cwd(), '..', '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  let gitHash = env.VITE_APP_GIT_HASH;
  if (!gitHash) {
    try {
      gitHash = execSync('git rev-parse --short HEAD').toString().trim();
    } catch (error) {
      console.warn('⚠️  Failed to read git hash:', error);
      gitHash = 'unknown';
    }
  }

  const appVersion = env.VITE_APP_VERSION || packageJson.version || '0.0.0';

  console.log(`🚀 API Proxy Target: ${apiUrl}`);

  return {
    plugins: [TanStackRouterVite({ autoCodeSplitting: true }), viteReact(), tailwindcss()],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      'import.meta.env.VITE_APP_GIT_HASH': JSON.stringify(gitHash),
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
      // Workspacesやローカルリンク時のReact二重取り込みを防止
      dedupe: ['react', 'react-dom'],
    },
    server: {
      port: 3000,
      proxy: {
        '^/api': {
          target: apiUrl,
          changeOrigin: true,
          configure: (proxy, options) => {
            proxy.on('error', (err, _req, _res) => {
              console.error('Proxy error:', err);
            });
            proxy.on('proxyReq', (_proxyReq, req, _res) => {
              console.log(`Proxying ${req.method} ${req.url} -> ${options.target}${req.url}`);
            });
          },
        },
        '^/files': {
          target: apiUrl,
          changeOrigin: true,
        },
      },
    },
  };
});
