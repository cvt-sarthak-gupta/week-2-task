import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';

// Gzip budget check plugin — fails build if initial chunk exceeds 100KB
function bundleBudgetPlugin(budgetBytes: number) {
  return {
    name: 'bundle-budget',
    generateBundle(_opts: unknown, bundle: Record<string, { type: string; code?: string }>) {
      const initial = Object.values(bundle)
        .filter((c) => c.type === 'chunk' && !c.code?.includes('__vite_lazy'))
        .reduce((sum, c) => sum + (c.code?.length ?? 0), 0);
      // rough gzip estimate: ~40% of raw
      const estimated = initial * 0.4;
      if (estimated > budgetBytes) {
        throw new Error(
          `Bundle budget exceeded: ~${Math.round(estimated / 1024)}KB gzip estimated (budget: ${Math.round(budgetBytes / 1024)}KB)`,
        );
      }
    },
  };
}

// Copies sqlite3.wasm to public/ so @sqlite.org/sqlite-wasm can load it at runtime.
// The WASM module looks for the file at the page root (/sqlite3.wasm) when document.currentScript
// is unavailable (which is always the case for ES module dynamic imports).
function sqliteWasmPlugin() {
  return {
    name: 'sqlite-wasm',
    buildStart() {
      const src = resolve(__dirname, 'node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm');
      const publicDir = resolve(__dirname, 'public');
      if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
      copyFileSync(src, resolve(publicDir, 'sqlite3.wasm'));
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    sqliteWasmPlugin(),
    // Only enforce budget in production builds
    ...(process.env['NODE_ENV'] === 'production' ? [bundleBudgetPlugin(100 * 1024)] : []),
  ],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'antd-vendor': ['antd', '@ant-design/icons'],
          'query-vendor': ['@tanstack/react-query'],
          zustand: ['zustand'],
        },
      },
    },
    sourcemap: true,
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/ws': { target: 'ws://localhost:3001', ws: true },
      '/sse': { target: 'http://localhost:3001', changeOrigin: true },
    },
  },
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
});
