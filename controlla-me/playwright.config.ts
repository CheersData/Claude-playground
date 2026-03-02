import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration per controlla.me.
 *
 * Scenari coperti:
 * 1. Auth console (whitelist OK / non-whitelist rejected)
 * 2. Document analysis flow (upload → SSE → risultato)
 * 3. Corpus Q&A flow
 * 4. Power panel (tier switch + agent toggle)
 * 5. Error scenario (timeout → retry UI)
 *
 * Suite directory:
 * - tests/e2e/  — suite originale (mocked flows, console auth, corpus Q&A)
 * - e2e/        — suite QA task e029c424 (auth, upload API, analysis SSE, tier/agent API)
 *
 * API calls reali vengono intercettate con page.route() per velocità e stabilità.
 * Richiede: npm run dev (http://localhost:3000) avviato prima di npx playwright test
 */

export default defineConfig({
  testDir: ".",
  testMatch: ["tests/e2e/**/*.spec.ts", "e2e/**/*.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: [["html", { outputFolder: "playwright-report" }], ["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
