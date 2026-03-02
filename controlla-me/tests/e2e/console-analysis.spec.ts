/**
 * E2E — Console Document Analysis Flow
 *
 * Scenari:
 * 1. Upload testo → pipeline completa → risultati visualizzati
 * 2. Abort mid-stream → stato torna a idle, nessun risultato parziale mostrato
 * 3. Errore provider → messaggio errore + pulsante Riprova
 * 4. Timeout → messaggio timeout + pulsante Riprova
 * 5. Session memory: seconda domanda usa contesto della prima
 */

import { test, expect, Page } from "@playwright/test";

// ─── Helpers locali ─────────────────────────────────────────────────────────

const MOCK_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJNYXJpbyIsInRpZXIiOiJwYXJ0bmVyIiwiZXhwIjo5OTk5OTk5OTk5LCJzaWQiOiJ0ZXN0In0.test";
const MOCK_USER = { nome: "Mario", cognome: "Rossi", ruolo: "Avvocato" };

async function setupAuth(page: Page) {
  await page.addInitScript((args) => {
    sessionStorage.setItem("lexmea-auth", JSON.stringify(args.user));
    sessionStorage.setItem("lexmea-token", args.token);
  }, { user: MOCK_USER, token: MOCK_TOKEN });
}

function buildConsoleSseResponse(route: "corpus-qa" | "document-analysis", opts?: { error?: boolean }) {
  const events: string[] = [];
  const enc = (evt: string, data: unknown) => `event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`;

  // Leader
  events.push(enc("agent", { phase: "leader", status: "running" }));
  events.push(enc("agent", { phase: "leader", status: "done", summary: `Route: ${route}`, decision: { route }, output: { route, reasoning: "test" } }));

  if (opts?.error) {
    events.push(enc("error", { message: "Provider non disponibile: tutti i modelli falliti." }));
    return events.join("");
  }

  if (route === "corpus-qa") {
    events.push(enc("agent", { phase: "question-prep", status: "running" }));
    events.push(enc("agent", { phase: "question-prep", status: "done", summary: "Domanda riformulata", output: { legalQuery: "deposito cauzionale massimo", suggestedInstitutes: ["deposito_cauzionale"] } }));
    events.push(enc("agent", { phase: "corpus-search", status: "running" }));
    events.push(enc("agent", { phase: "corpus-search", status: "done", summary: "3 articoli trovati", output: { articles: [{ reference: "Art. 11", source: "L. 392/1978", title: "Deposito cauzionale" }] } }));
    events.push(enc("agent", { phase: "corpus-agent", status: "running" }));
    events.push(enc("agent", { phase: "corpus-agent", status: "done", summary: "Confidence: 92%", output: { answer: "Il deposito cauzionale non può superare tre mensilità.", citedArticles: [], confidence: 0.92 } }));
  } else {
    events.push(enc("agent", { phase: "classifier", status: "running" }));
    events.push(enc("agent", { phase: "classifier", status: "done", output: { documentType: "rental_contract", documentTypeLabel: "Contratto di Locazione" } }));
    events.push(enc("agent", { phase: "analyzer", status: "running" }));
    events.push(enc("agent", { phase: "analyzer", status: "done", output: { clauses: [{ id: "c1", title: "Deposito", riskLevel: "critical", issue: "Deposito > 3 mensilità" }], overallRisk: "high" } }));
    events.push(enc("agent", { phase: "investigator", status: "running" }));
    events.push(enc("agent", { phase: "investigator", status: "done", output: { findings: [] } }));
    events.push(enc("agent", { phase: "advisor", status: "running" }));
    events.push(enc("agent", { phase: "advisor", status: "done", output: {} }));
    events.push(enc("result", { type: "document-analysis", advice: { fairnessScore: 3.2, summary: "Contratto squilibrato." } }));
  }

  events.push(enc("complete", { route }));
  return events.join("");
}

async function mockConsoleRoute(page: Page, route: "corpus-qa" | "document-analysis", opts?: { error?: boolean }) {
  await page.route("**/api/console", async (r) => {
    const body = buildConsoleSseResponse(route, opts);
    await r.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      body,
    });
  });
}

// ─── Test ─────────────────────────────────────────────────────────────────────

test.describe("Console Analysis Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await page.goto("/console");
    // Attendi che la pagina sia pronta (autenticata)
    await expect(page.locator("text=Bentornata")).toBeVisible({ timeout: 5000 });
  });

  test("Corpus Q&A: invia domanda → pipeline → risposta visibile", async ({ page }) => {
    await mockConsoleRoute(page, "corpus-qa");

    const input = page.locator("textarea").first();
    await input.fill("Qual è il massimo deposito cauzionale?");
    await page.keyboard.press("Enter");

    // Leader deve apparire
    await expect(page.locator("text=Leader")).toBeVisible({ timeout: 5000 });
    // Question-prep e corpus-agent devono comparire
    await expect(page.locator("text=Question Prep")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Corpus Agent")).toBeVisible({ timeout: 15000 });
    // Risposta finale
    await expect(page.locator("text=tre mensilità")).toBeVisible({ timeout: 15000 });
  });

  test("Errore provider → messaggio errore + pulsante Riprova", async ({ page }) => {
    await mockConsoleRoute(page, "corpus-qa", { error: true });

    const input = page.locator("textarea").first();
    await input.fill("Domanda che genera errore");
    await page.keyboard.press("Enter");

    await expect(page.locator("text=Provider non disponibile")).toBeVisible({ timeout: 10000 });
    // Pulsante Riprova deve essere visibile
    await expect(page.locator("text=Riprova")).toBeVisible({ timeout: 5000 });
  });

  test("Abort: pulsante 'Interrompi' ferma l'elaborazione", async ({ page }) => {
    // Mock che non risponde subito (delay artificiale)
    const resolver: { fn: (() => void) | null } = { fn: null };
    const routePromise = new Promise<void>((res) => { resolver.fn = res; });

    await page.route("**/api/console", async (route) => {
      // Aspetta fino a quando il test non lo sblocca
      await routePromise;
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body: buildConsoleSseResponse("corpus-qa"),
      });
    });

    const input = page.locator("textarea").first();
    await input.fill("Domanda da interrompere");
    await page.keyboard.press("Enter");

    // Clicca Interrompi mentre processa
    await expect(page.locator("text=Interrompi elaborazione")).toBeVisible({ timeout: 5000 });
    await page.locator("text=Interrompi elaborazione").click();

    // Risolve la route (ma la risposta viene ignorata)
    resolver.fn?.();

    // Dopo abort, lo stato deve tornare a idle (input disponibile)
    await expect(page.locator("text=Interrompi elaborazione")).not.toBeVisible({ timeout: 5000 });
  });
});
