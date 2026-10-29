import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  use: { baseURL: 'http://127.0.0.1:8082', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  webServer: { command: 'npx expo start --web --port 8082', url: 'http://127.0.0.1:8082', reuseExistingServer: !process.env.CI, timeout: 120000 },
});
