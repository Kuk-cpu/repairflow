import { defineConfig, devices } from "@playwright/test";
import { config as loadEnvironment } from "dotenv";

loadEnvironment({ path: ".env", quiet: true });

const baseURL = "http://127.0.0.1:3100";
const databaseURL = process.env.CI ? process.env.DATABASE_URL : process.env.TEST_DATABASE_URL;
if (!databaseURL) throw new Error("A dedicated test database is required for Playwright.");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3100",
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: databaseURL,
      BETTER_AUTH_URL: baseURL,
      APP_ORIGIN: baseURL,
      UPLOAD_DIR: ".data/e2e-uploads",
      E2E_MODE: "true",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
