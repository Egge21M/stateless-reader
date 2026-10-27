import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.pw.ts",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun apps/frontend/tests/server.ts",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
