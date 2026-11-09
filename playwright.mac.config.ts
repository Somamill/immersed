import { defineConfig } from "@playwright/test";
export default defineConfig({
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  testDir: "./tests/mac",
  testMatch: "**/*.spec.ts",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4777",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "node desktop/server.cjs",
    url: "http://127.0.0.1:4777",
    reuseExistingServer: false,
    env: {
      IMMERSED_MAC_PORT: "4777",
      IMMERSED_DATA_ROOT: "test-results/mac-runtime",
    },
  },
});
