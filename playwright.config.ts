import { defineConfig } from '@playwright/test';
const port = process.env.IMMERSED_TEST_PORT || '8082';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  testIgnore: '**/mac/**', // Desktop tests use playwright.mac.config.ts and their own local API.
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  webServer: { command: `npx expo start --web --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: !process.env.CI, timeout: 120000 },
});
