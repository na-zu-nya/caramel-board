import tailwindcss from '@tailwindcss/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import { resolve } from 'node:path';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Viteの環境変数システムを使用
  const env = loadEnv(mode, process.cwd(), '');

  // APIのURLを決定（優先順位: 環境変数 > デフォルト）
  const apiUrl = env.VITE_API_URL || 'http://localhost:9000';

  console.log(`🚀 API Proxy Target: ${apiUrl}`);

  return {
    plugins: [TanStackRouterVite({ autoCodeSplitting: true }), viteReact(), tailwindcss()],
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
