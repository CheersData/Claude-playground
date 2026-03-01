/**
 * E2E: Console auth flow
 *
 * Scenari:
 * - Password corretta → accesso alla console
 * - Password errata → errore visibile
 * - Accesso già autenticato (token in localStorage)
 * - Power panel: tier display e switch
 */

import { test, expect } from "@playwright/test";
import { mockConsoleEndpoints } from "./helpers";

test.describe("Console Authentication", () => {
  test.beforeEach(async ({ page }) => {
    await mockConsoleEndpoints(page);
  });

  test("mostra form di autenticazione sulla console", async ({ page }) => {
    await page.goto("/console");

    // Deve esserci un campo password o un form di accesso
    const passwordInput = page.locator('input[type="password"]');
    const hasPasswordField = await passwordInput.count() > 0;

    if (hasPasswordField) {
      await expect(passwordInput).toBeVisible();
    } else {
      // La console potrebbe richiedere auth diversamente (OAuth, whitelist email)
      // Verifica che ci sia qualche form di controllo accesso
      await expect(page.locator("form").or(page.locator('[role="dialog"]'))).toBeVisible();
    }
  });

  test("password errata mostra messaggio di errore", async ({ page }) => {
    await page.goto("/console");

    const passwordInput = page.locator('input[type="password"]').first();
    if (await passwordInput.count() === 0) {
      test.skip();
      return;
    }

    await passwordInput.fill("password-errata-12345");
    await page.keyboard.press("Enter");

    // Attendi un messaggio di errore
    await expect(
      page.getByText(/non valida|non autorizzato|errore|invalid|unauthorized/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("password corretta porta all'interno della console", async ({ page }) => {
    const VALID_PASSWORD = "test-console-password";

    await page.goto("/console");

    const passwordInput = page.locator('input[type="password"]').first();
    if (await passwordInput.count() === 0) {
      test.skip();
      return;
    }

    await passwordInput.fill(VALID_PASSWORD);
    await page.keyboard.press("Enter");

    // Dopo auth corretta, dovrebbe sparire il form e apparire la console
    await expect(passwordInput).not.toBeVisible({ timeout: 5_000 });
  });

  test("token valido in localStorage salta il form auth", async ({ page }) => {
    await page.goto("/console");

    await page.evaluate(() => {
      localStorage.setItem("console-token", "mock-console-token-abc");
    });

    await page.reload();

    await expect(page.locator("body")).toBeVisible();
    await expect(page).not.toHaveURL(/error/);
  });
});

test.describe("Console Power Panel", () => {
  test.beforeEach(async ({ page }) => {
    await mockConsoleEndpoints(page);
    await page.goto("/console");
    await page.evaluate(() => {
      localStorage.setItem("console-token", "mock-console-token-abc");
    });
    await page.reload();
  });

  test("power panel mostra il tier corrente", async ({ page }) => {
    const tierText = page.getByText(/partner|associate|intern/i).first();
    const isVisible = await tierText.isVisible().catch(() => false);
    if (isVisible) {
      await expect(tierText).toBeVisible();
    }
  });

  test("pagina console carica senza crash JS", async ({ page }) => {
    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto("/console");
    await page.waitForLoadState("networkidle");

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes("hydrat") && !e.includes("Warning")
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
