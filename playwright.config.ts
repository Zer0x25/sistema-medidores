import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL,
    extraHTTPHeaders: {
      "x-e2e-client": "playwright",
    },
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run start:dev",
    url: new URL("/readyz", baseURL).href,
    env: { PORT: new URL(baseURL).port || "3000" },
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
