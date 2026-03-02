/**
 * E2E helpers — Mock SSE e utilities comuni per i test Playwright.
 */

import { Page, Route } from "@playwright/test";

// ─── Mock SSE ─────────────────────────────────────────────────────────────────

/**
 * Costruisce una risposta SSE completa con tutti gli eventi dell'analisi.
 */
export function buildAnalysisSSE(overrides?: {
  sessionId?: string;
  error?: { phase: string; message: string };
}) {
  const sessionId = overrides?.sessionId ?? "mock-session-abc123";

  const events: string[] = [];

  function sse(event: string, data: unknown) {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  events.push(sse("timing", { classifier: 2, analyzer: 3, investigator: 4, advisor: 2 }));
  events.push(sse("session", { sessionId }));

  if (overrides?.error) {
    events.push(sse("progress", { phase: overrides.error.phase, status: "running" }));
    events.push(sse("error", { phase: overrides.error.phase, error: overrides.error.message }));
    return events.join("");
  }

  // Flusso normale
  events.push(sse("progress", { phase: "classifier", status: "running" }));
  events.push(
    sse("progress", {
      phase: "classifier",
      status: "done",
      data: {
        documentType: "rental_contract",
        documentTypeLabel: "Contratto di Locazione",
        jurisdiction: "IT",
        applicableLaws: [{ reference: "L. 431/1998", description: "Locazioni abitative" }],
      },
    })
  );

  events.push(sse("progress", { phase: "analyzer", status: "running" }));
  events.push(
    sse("progress", {
      phase: "analyzer",
      status: "done",
      data: {
        clauses: [
          {
            id: "c1",
            title: "Deposito cauzionale",
            riskLevel: "critical",
            issue: "Deposito richiesto superiore a 3 mensilità",
            originalText: "Si richiede deposito pari a 6 mensilità",
            recommendation: "Riduci il deposito al massimo consentito dalla legge (3 mensilità)",
          },
        ],
        missingElements: [],
        overallRisk: "high",
      },
    })
  );

  events.push(sse("progress", { phase: "investigator", status: "running" }));
  events.push(
    sse("progress", {
      phase: "investigator",
      status: "done",
      data: { findings: [] },
    })
  );

  events.push(sse("progress", { phase: "advisor", status: "running" }));
  const advice = {
    summary: "Contratto squilibrato con clausole illegali sul deposito cauzionale.",
    risks: [
      {
        title: "Deposito cauzionale illegale",
        description: "Richieste 6 mensilità, massimo 3 per legge",
        severity: "critical",
        legalBasis: "Art. 11 L. 392/1978",
      },
    ],
    actions: [
      {
        title: "Negozia il deposito",
        description: "Chiedi al locatore di ridurre il deposito a massimo 3 mensilità",
        priority: "immediate",
      },
    ],
    fairnessScore: 3.2,
    scores: { legalCompliance: 3, contractBalance: 3, industryPractice: 4 },
    needsLawyer: false,
  };
  events.push(sse("complete", { advice }));

  return events.join("");
}

/**
 * Mock dell'endpoint POST /api/analyze con SSE simulata.
 */
export async function mockAnalyzeEndpoint(
  page: Page,
  options?: Parameters<typeof buildAnalysisSSE>[0]
) {
  await page.route("**/api/analyze", async (route: Route) => {
    const body = buildAnalysisSSE(options);
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
      body,
    });
  });
}

/**
 * Mock dell'endpoint POST /api/corpus/ask.
 */
export async function mockCorpusAskEndpoint(page: Page) {
  await page.route("**/api/corpus/ask", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        answer:
          "Secondo l'art. 11 della L. 392/1978, il deposito cauzionale non può superare tre mensilità del canone di locazione.",
        citedArticles: [
          {
            id: "mock-article-1",
            lawSource: "L. 392/1978",
            articleReference: "Art. 11",
            articleTitle: "Deposito cauzionale",
          },
        ],
        confidence: 0.92,
        followUp: ["Cosa succede se il locatore trattiene il deposito?"],
      }),
    });
  });
}

/**
 * Mock dell'endpoint POST /api/upload.
 */
export async function mockUploadEndpoint(page: Page) {
  await page.route("**/api/upload", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        text: "CONTRATTO DI LOCAZIONE\nIl conduttore versa una cauzione pari a 6 mensilità del canone mensile.",
        fileName: "contratto_test.pdf",
        fileSize: 1024,
        charCount: 120,
      }),
    });
  });
}

/**
 * Mock per il tier/console endpoints.
 */
export async function mockConsoleEndpoints(page: Page) {
  await page.route("**/api/console/tier", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          tier: "partner",
          agents: { classifier: true, analyzer: true, investigator: true, advisor: true },
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    }
  });

  await page.route("**/api/console/auth", async (route: Route) => {
    const body = route.request().postDataJSON();
    const validPassword = "test-console-password";
    if (body?.password === validPassword) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "mock-console-token-abc" }),
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Password non valida" }),
      });
    }
  });
}
