import { defineConfig, devices } from "@playwright/test";
import { config as dotenvConfig } from "dotenv";
import path from "path";

// Load .env so TEST_PORT can be overridden via env file and all base vars are
// available when the playwright config is evaluated.
dotenvConfig({ path: path.resolve(__dirname, ".env") });

// Allow overriding the test port to avoid conflicts with a running dev server.
// Usage: TEST_PORT=3001 pnpm e2e
const TEST_PORT = process.env["TEST_PORT"] ? Number(process.env["TEST_PORT"]) : 3000;
const BASE_URL = `http://localhost:${TEST_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // Give server-side actions (PDF render, DB calls) generous time
    actionTimeout: 60_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `NEXTAUTH_URL=${BASE_URL} AUTH_URL=${BASE_URL} PORT=${TEST_PORT} pnpm dev`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
