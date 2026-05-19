import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'src',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: [['html', { outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    { command: 'npm run dev:server', port: 3001, reuseExistingServer: !process.env['CI'] },
    { command: 'npm run dev:client', port: 5173, reuseExistingServer: !process.env['CI'] },
  ],
});
