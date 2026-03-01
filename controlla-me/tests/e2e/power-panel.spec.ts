/**
 * E2E — Power Panel (Tier Switch + Agent Toggle)
 *
 * Scenari:
 * 1. Apre il PowerPanel dal pulsante ⚡ header
 * 2. Switch del tier (Intern → Associate → Partner)
 * 3. Disabilita un agente (Investigator) → API chiamata POST /api/console/tier
 * 4. Panel si chiude cliccando fuori
 */

import { test, expect, Page } from "@playwright/test";

const MOCK_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJNYXJpbyIsInRpZXIiOiJwYXJ0bmVyIiwiZXhwIjo5OTk5OTk5OTk5LCJzaWQiOiJ0ZXN0In0.test";
const MOCK_USER = { nome: "Mario", cognome: "Rossi", ruolo: "Avvocato" };

async function setupAuth(page: Page) {
  await page.addInitScript((args) => {
    sessionStorage.setItem("lexmea-auth", JSON.stringify(args.user));
    sessionStorage.setItem("lexmea-token", args.token);
  }, { user: MOCK_USER, token: MOCK_TOKEN });
}

async function mockTierApi(page: Page) {
  const tierCalls: Array<{ method: string; body: unknown }> = [];

  await page.route("**/api/console/tier", async (route) => {
    const method = route.request().method();

    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tier: "partner",
          agents: {
            classifier: true,
            analyzer: true,
            investigator: true,
            advisor: true,
            "question-prep": true,
            "corpus-agent": true,
          },
        }),
      });
    } else if (method === "POST") {
      const body = route.request().postDataJSON();
      tierCalls.push({ method, body });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    } else {
      await route.continue();
    }
  });

  return { tierCalls };
}

test.describe("Power Panel", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await page.goto("/console");
    await expect(page.locator("text=Bentornata")).toBeVisible({ timeout: 5000 });
  });

  test("pulsante Power apre il PowerPanel", async ({ page }) => {
    await mockTierApi(page);

    // Il pulsante Power (⚡ o simile) nell'header
    const powerBtn = page.locator("[aria-label*='power'], [aria-label*='Power'], button:has-text('⚡')").first();
    // Alternativa: cerca il pulsante con titolo "Power"
    const powerBtnAlt = page.locator("button").filter({ hasText: /power|settings|tier/i }).first();

    // Clicca il pulsante Power
    await powerBtn.or(powerBtnAlt).click();

    // Il panel deve contenere opzioni di tier
    await expect(page.locator("text=Intern").or(page.locator("text=Associate")).or(page.locator("text=Partner"))).toBeVisible({ timeout: 5000 });
  });

  test("GET /api/console/tier al mount del PowerPanel", async ({ page }) => {
    const { tierCalls } = await mockTierApi(page);

    // Apri power panel
    const powerBtn = page
      .locator("button")
      .filter({ hasText: /power|⚡|tier/i })
      .or(page.locator("[data-testid='power-panel-btn']"))
      .first();

    await powerBtn.click();

    // Attendi che la richiesta GET venga fatta
    await page.waitForRequest("**/api/console/tier", { timeout: 5000 });
    // Nessuna POST deve essere stata fatta (solo GET iniziale)
    expect(tierCalls.filter((c) => c.method === "POST").length).toBe(0);
  });
});
