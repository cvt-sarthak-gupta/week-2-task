import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/core/testing/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {
        'src/features/filters/ast/**': { branches: 100 },
        'src/core/offline/queue/**': { branches: 100 },
        'src/core/offline/sync/diff.ts': { branches: 100 },
      },
    },
    benchmark: {
      reporters: ['default'],
    },
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
