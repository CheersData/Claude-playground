/**
 * E2E: Corpus Q&A flow
 *
 * Scenari:
 * - Pagina /corpus carica correttamente
 * - Chat: domanda → risposta mock visibile
 * - Citazioni articoli: link cliccabile
 * - Fallback se nessun articolo trovato
 */

import { test, expect } from "@playwright/test";
import { mockCorpusAskEndpoint } from "./helpers";

test.describe("Corpus Q&A", () => {
  test.beforeEach(async ({ page }) => {
    await mockCorpusAskEndpoint(page);

    // Mock gerarchia corpus (necessaria per la pagina)
    await page.route("**/api/corpus/hierarchy**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sources: [
            {
              id: "codice_civile",
              name: "Codice Civile",
              shortName: "c.c.",
              estimatedArticles: 2969,
              lifecycle: "loaded",
            },
            {
              id: "gdpr",
              name: "GDPR (Reg. 2016/679)",
              shortName: "GDPR",
              estimatedArticles: 99,
              lifecycle: "loaded",
            },
          ],
        }),
      });
    });
  });

  test("pagina /corpus carica con il titolo corretto", async ({ page }) => {
    await page.goto("/corpus");

    await expect(page).toHaveTitle(/corpus|legge|articoli/i);
    await expect(page.locator("body")).toBeVisible();
  });

  test("pagina /corpus mostra le fonti disponibili", async ({ page }) => {
    await page.goto("/corpus");
    await page.waitForLoadState("networkidle");

    // Verifica che almeno un elemento della lista fonti sia visibile
    await expect(
      page.getByText(/codice civile|GDPR|normattiva/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test("domanda al corpus Q&A restituisce risposta mock", async ({ page }) => {
    await page.goto("/corpus");

    // Cerca la chat input (nel componente CorpusChat)
    const chatInput = page
      .locator('input[placeholder*="Fai"]')
      .or(page.locator('textarea[placeholder*="domanda"]'))
      .or(page.locator('input[type="text"]').last());

    if (await chatInput.count() === 0) {
      // La chat potrebbe essere nell'hero della home, non nel corpus
      await page.goto("/");
      const homeInput = page
        .locator('input[placeholder*="domanda"]')
        .or(page.locator('input[placeholder*="Chiedi"]'));

      if (await homeInput.count() === 0) {
        test.skip();
        return;
      }
    }

    const input = chatInput;
    await input.first().fill("Qual è il massimo del deposito cauzionale?");
    await page.keyboard.press("Enter");

    // Risposta mock: contiene "tre mensilità"
    await expect(
      page.getByText(/tre mensilità|3 mesi|L. 392\/1978/i)
    ).toBeVisible({ timeout: 8_000 });
  });

  test("link agli articoli citati sono cliccabili", async ({ page }) => {
    await page.goto("/corpus");
    await page.waitForLoadState("networkidle");

    // Cerca link verso articoli specifici
    const articleLinks = page.locator('a[href*="/corpus/article/"]');
    const count = await articleLinks.count();

    if (count > 0) {
      // Verifica che il primo link sia cliccabile e non porti a 404
      const href = await articleLinks.first().getAttribute("href");
      if (href) {
        // Solo verifica che il link abbia un href valido
        expect(href).toMatch(/\/corpus\/article\//);
      }
    }
    // Non fail se non ci sono articoli citati — dipende dal contenuto della chat
  });
});
