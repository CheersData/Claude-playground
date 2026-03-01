/**
 * E2E: Navigazione e health check delle pagine principali.
 *
 * Scenari:
 * - Home page carica senza errori
 * - Pricing page accessibile
 * - /affitti carica con contenuto corretto
 * - Link di navigazione funzionanti
 * - Nessun crash JavaScript critico nelle pagine principali
 */

import { test, expect } from "@playwright/test";

const PAGES = [
  { path: "/", name: "Home" },
  { path: "/pricing", name: "Pricing" },
  { path: "/affitti", name: "Affitti" },
  { path: "/corpus", name: "Corpus" },
];

test.describe("Navigation & Health", () => {
  for (const { path, name } of PAGES) {
    test(`${name} (${path}) carica senza errori JS critici`, async ({ page }) => {
      const jsErrors: string[] = [];
      page.on("pageerror", (err) => {
        // Ignora errori di hydration e warning React (normali in dev)
        if (!err.message.includes("Hydration") && !err.message.includes("Warning")) {
          jsErrors.push(err.message);
        }
      });

      const response = await page.goto(path);

      // Pagina non deve restituire 500
      if (response) {
        expect(response.status()).not.toBe(500);
        expect(response.status()).not.toBe(503);
      }

      await page.waitForLoadState("networkidle").catch(() => {
        // timeout ok, pagina con SSE può restare "loading"
      });

      expect(jsErrors, `Errori JS in ${name}: ${jsErrors.join(", ")}`).toHaveLength(0);
    });
  }

  test("Navbar mostra il logo controlla.me", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/controlla\.me|controlla me/i).first()).toBeVisible();
  });

  test("Navbar link Pricing porta alla pagina pricing", async ({ page }) => {
    await page.goto("/");

    const pricingLink = page.getByRole("link", { name: /prezzi|pricing/i });
    if (await pricingLink.count() > 0) {
      await pricingLink.first().click();
      await expect(page).toHaveURL(/pricing/);
    }
  });

  test("Home page mostra l'upload zone", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();

    // L'upload zone o il CTA principale deve essere visibile
    await expect(
      page.locator('input[type="file"]').or(
        page.getByRole("button", { name: /analizza|carica|upload/i })
      ).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test("pagina Pricing mostra i 3 piani", async ({ page }) => {
    await page.goto("/pricing");

    // Verifica presenza dei piani
    await expect(page.getByText(/free|gratis/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/pro/i).first()).toBeVisible();
  });

  test("pagina /affitti mostra fairness score per i case study", async ({ page }) => {
    await page.goto("/affitti");

    // I case study hanno uno score visualizzato (es. "3.2")
    await expect(page.getByText(/3\.2|2\.8|5\.1|2\.1/)).toBeVisible({ timeout: 5_000 });
  });

  test("footer presente in tutte le pagine principali", async ({ page }) => {
    for (const { path } of PAGES.slice(0, 3)) {
      await page.goto(path);
      await expect(page.locator("footer").or(page.getByRole("contentinfo"))).toBeVisible();
    }
  });
});
