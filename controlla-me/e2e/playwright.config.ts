import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for controlla.me
 *
 * Runs against http://localhost:3000 (Next.js dev server).
 * To run tests: npm run test:e2e
 * To run with UI:  npm run test:e2e:ui
 * To debug:        npm run test:e2e:debug
 */
export default defineConfig({
  testDir: "./e2e",
  // Fail the build on CI if any test.only was accidentally committed
  forbidOnly: !!process.env.CI,
  // Retry on CI to reduce flakiness from timing issues
  retries: process.env.CI ? 2 : 0,
  // Parallel workers
  workers: process.env.CI ? 1 : undefined,
  // Reporter
  reporter: "html",
  use: {
    // Base URL for all page.goto('/...') calls
    baseURL: "http://localhost:3000",
    // Capture traces on first retry of failing tests
    trace: "on-first-retry",
    // Screenshots on failure
    screenshot: "only-on-failure",
    // Default navigation timeout
    navigationTimeout: 15_000,
    // Default action timeout (clicks, fills, etc.)
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Start local dev server automatically if not already running
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
