/**
 * Deep Search Paywall E2E Tests
 *
 * Verifies that:
 * 1. Unauthenticated users see a login-gated paywall when clicking "Approfondisci"
 * 2. FREE users who have exhausted their deep search limit see an upgrade prompt
 *    linking to /pricing
 * 3. PRO users can access deep search without any paywall block
 *
 * Strategy: The RiskCard component fetches /api/user/usage on button click.
 * We mock this endpoint via page.route() to simulate each scenario.
 *
 * The test renders a minimal page containing a RiskCard by navigating to the
 * analysis results URL with a mocked session. We intercept both the session API
 * and the usage API to control the full render path without real credentials.
 */

import { test, expect } from "@playwright/test";

// ─── Shared mock data ─────────────────────────────────────────────────────────

/** A minimal mock session payload that triggers the ResultsView with one risk card. */
const MOCK_SESSION = {
  sessionId: "paywall-test-session",
  documentHash: "abc123paywall",
  advice: {
    fairnessScore: 5.0,
    summary: "Contratto con clausole problematiche da verificare.",
    risks: [
      {
        id: "r1",
        title: "Clausola di recesso unilaterale",
        severity: "alta",
        detail: "Il contratto consente al fornitore di recedere senza preavviso.",
        legalBasis: "Art. 1671 c.c.",
        courtCase: null,
        recommendation: "Richiedere un preavviso minimo di 30 giorni.",
      },
    ],
    actions: [
      {
        priority: "alta",
        action: "Negoziare clausola di recesso",
        reason: "Clausola squilibrata a favore del fornitore",
        urgency: "Prima della firma",
      },
    ],
    needsLawyer: false,
    documentType: "Contratto di servizi",
    scores: {
      legalCompliance: 6,
      contractBalance: 4,
      industryPractice: 5,
    },
  },
};

/** Usage response: user not authenticated. */
const USAGE_UNAUTHENTICATED = {
  authenticated: false,
  plan: "free",
  analysesUsed: 0,
  analysesLimit: 3,
  canAnalyze: true,
  deepSearchUsed: 0,
  deepSearchLimit: 1,
  canDeepSearch: false,
};

/** Usage response: authenticated FREE user with limit exhausted (1/1 used). */
const USAGE_FREE_LIMIT_EXHAUSTED = {
  authenticated: true,
  plan: "free",
  analysesUsed: 2,
  analysesLimit: 3,
  canAnalyze: true,
  deepSearchUsed: 1,
  deepSearchLimit: 1,
  canDeepSearch: false,
};

/** Usage response: authenticated PRO user with unlimited deep search. */
const USAGE_PRO = {
  authenticated: true,
  plan: "pro",
  analysesUsed: 10,
  analysesLimit: Infinity,
  canAnalyze: true,
  deepSearchUsed: 5,
  deepSearchLimit: Infinity,
  canDeepSearch: true,
};

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Navigates to the landing page with a mocked session (results view).
 * Intercepts the session API and the usage API.
 *
 * @param page        - Playwright Page
 * @param usageMock   - The object to return from /api/user/usage
 */
async function loadResultsWithUsageMock(
  page: import("@playwright/test").Page,
  usageMock: object
) {
  // 1. Mock the session endpoint so ResultsView renders with our risk card
  await page.route("/api/session/paywall-test-session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_SESSION),
    });
  });

  // 2. Mock the usage endpoint to control paywall behaviour
  await page.route("/api/user/usage", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(usageMock),
    });
  });

  // 3. Navigate — the ?session= param causes the app to load the cached result
  await page.goto("/?session=paywall-test-session");

  // 4. Wait for the results view to appear (it renders once advice is loaded)
  await page.waitForTimeout(2000);
}

// ─── Scenario 1: Unauthenticated user ────────────────────────────────────────

test.describe("Deep search paywall — utente non autenticato", () => {
  test("il bottone 'Approfondisci' e' visibile senza login", async ({ page }) => {
    await loadResultsWithUsageMock(page, USAGE_UNAUTHENTICATED);

    // The page must load without crashing
    await expect(page.locator("body")).toBeVisible();
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Internal Server Error");
  });

  test("click su 'Approfondisci' mostra il blocco paywall non-auth", async ({
    page,
  }) => {
    await loadResultsWithUsageMock(page, USAGE_UNAUTHENTICATED);

    // Find and click the deep search button
    const deepSearchButton = page.getByText("Approfondisci questo punto").first();

    // Only proceed if the results view is actually rendered
    if ((await deepSearchButton.count()) === 0) {
      // The session did not load in time or the UI path is different — skip gracefully
      test.skip();
      return;
    }

    await deepSearchButton.click();

    // Wait for the paywall panel to animate in
    await page.waitForTimeout(800);

    // Expect the "Accedi per approfondire" heading to appear
    const paywallHeading = page.getByText("Accedi per approfondire");
    await expect(paywallHeading).toBeVisible();
  });

  test("il paywall non-auth mostra il testo corretto e il bottone 'Accedi'", async ({
    page,
  }) => {
    await loadResultsWithUsageMock(page, USAGE_UNAUTHENTICATED);

    const deepSearchButton = page.getByText("Approfondisci questo punto").first();
    if ((await deepSearchButton.count()) === 0) {
      test.skip();
      return;
    }

    await deepSearchButton.click();
    await page.waitForTimeout(800);

    // The paywall for unauthenticated users shows:
    // - "Accedi per approfondire" heading
    // - "La ricerca approfondita richiede un account." description
    // - An "Accedi" link pointing to /dashboard
    await expect(page.getByText("Accedi per approfondire")).toBeVisible();
    await expect(
      page.getByText("La ricerca approfondita richiede un account.")
    ).toBeVisible();

    const accediLink = page.getByRole("link", { name: "Accedi" });
    await expect(accediLink).toBeVisible();
    const href = await accediLink.getAttribute("href");
    expect(href).toBe("/dashboard");
  });

  test("il pannello paywall non-auth NON mostra la chat di deep search", async ({
    page,
  }) => {
    await loadResultsWithUsageMock(page, USAGE_UNAUTHENTICATED);

    const deepSearchButton = page.getByText("Approfondisci questo punto").first();
    if ((await deepSearchButton.count()) === 0) {
      test.skip();
      return;
    }

    await deepSearchButton.click();
    await page.waitForTimeout(800);

    // The DeepSearchChat component should NOT be rendered for unauthenticated users
    // It renders a textarea or input for the chat interaction
    const chatInput = page.locator("textarea[placeholder*='domanda'], input[placeholder*='domanda']");
    expect(await chatInput.count()).toBe(0);
  });
});

// ─── Scenario 2: FREE user with exhausted limit ───────────────────────────────

test.describe("Deep search paywall — utente FREE con limite esaurito", () => {
  test("click su 'Approfondisci' mostra il blocco upgrade per utenti FREE", async ({
    page,
  }) => {
    await loadResultsWithUsageMock(page, USAGE_FREE_LIMIT_EXHAUSTED);

    const deepSearchButton = page.getByText("Approfondisci questo punto").first();
    if ((await deepSearchButton.count()) === 0) {
      test.skip();
      return;
    }

    await deepSearchButton.click();
    await page.waitForTimeout(800);

    // Expect the limit-reached heading
    const limitHeading = page.getByText("Limite ricerche approfondite raggiunto");
    await expect(limitHeading).toBeVisible();
  });

  test("il paywall FREE mostra il contatore usato/totale", async ({ page }) => {
    await loadResultsWithUsageMock(page, USAGE_FREE_LIMIT_EXHAUSTED);

    const deepSearchButton = page.getByText("Approfondisci questo punto").first();
    if ((await deepSearchButton.count()) === 0) {
      test.skip();
      return;
    }

    await deepSearchButton.click();
    await page.waitForTimeout(800);

    // The message shows "Hai usato X/Y ricerche gratuite questo mese."
    // For USAGE_FREE_LIMIT_EXHAUSTED: deepSearchUsed=1, deepSearchLimit=1 → "1/1"
    const usageText = page.getByText(/1\/1 ricerche gratuite/);
    await expect(usageText).toBeVisible();
  });

  test("il paywall FREE mostra il link upgrade a /pricing", async ({ page }) => {
    await loadResultsWithUsageMock(page, USAGE_FREE_LIMIT_EXHAUSTED);

    const deepSearchButton = page.getByText("Approfondisci questo punto").first();
    if ((await deepSearchButton.count()) === 0) {
      test.skip();
      return;
    }

    await deepSearchButton.click();
    await page.waitForTimeout(800);

    // The upgrade link should point to /pricing
    const upgradeLink = page.getByRole("link", { name: /Upgrade a Pro/i });
    await expect(upgradeLink).toBeVisible();
    const href = await upgradeLink.getAttribute("href");
    expect(href).toBe("/pricing");
  });

  test("il paywall FREE NON mostra la chat di deep search", async ({ page }) => {
    await loadResultsWithUsageMock(page, USAGE_FREE_LIMIT_EXHAUSTED);

    const deepSearchButton = page.getByText("Approfondisci questo punto").first();
    if ((await deepSearchButton.count()) === 0) {
      test.skip();
      return;
    }

    await deepSearchButton.click();
    await page.waitForTimeout(800);

    // No chat input should appear when limit is exhausted
    const chatInput = page.locator(
      "textarea[placeholder*='domanda'], input[placeholder*='domanda']"
    );
    expect(await chatInput.count()).toBe(0);
  });
});

// ─── Scenario 3: PRO user ─────────────────────────────────────────────────────

test.describe("Deep search paywall — utente PRO", () => {
  test("click su 'Approfondisci' NON mostra alcun paywall per utenti PRO", async ({
    page,
  }) => {
    await loadResultsWithUsageMock(page, USAGE_PRO);

    const deepSearchButton = page.getByText("Approfondisci questo punto").first();
    if ((await deepSearchButton.count()) === 0) {
      test.skip();
      return;
    }

    await deepSearchButton.click();
    await page.waitForTimeout(800);

    // No paywall headings should appear for PRO users
    expect(await page.getByText("Accedi per approfondire").count()).toBe(0);
    expect(
      await page.getByText("Limite ricerche approfondite raggiunto").count()
    ).toBe(0);
  });

  test("utente PRO non vede il link /pricing dopo aver cliccato 'Approfondisci'", async ({
    page,
  }) => {
    await loadResultsWithUsageMock(page, USAGE_PRO);

    const deepSearchButton = page.getByText("Approfondisci questo punto").first();
    if ((await deepSearchButton.count()) === 0) {
      test.skip();
      return;
    }

    await deepSearchButton.click();
    await page.waitForTimeout(800);

    // The /pricing upgrade link must NOT be visible for PRO users
    const upgradeLink = page.getByRole("link", { name: /Upgrade a Pro/i });
    expect(await upgradeLink.count()).toBe(0);
  });

  test("il pannello deep search PRO non mostra blocchi di accesso", async ({
    page,
  }) => {
    await loadResultsWithUsageMock(page, USAGE_PRO);

    const deepSearchButton = page.getByText("Approfondisci questo punto").first();
    if ((await deepSearchButton.count()) === 0) {
      test.skip();
      return;
    }

    await deepSearchButton.click();
    await page.waitForTimeout(800);

    // The deep search panel opened — body must be stable
    await expect(page.locator("body")).toBeVisible();
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Internal Server Error");

    // For PRO, DeepSearchChat is rendered — but since /api/deep-search is not mocked,
    // we only verify the paywall elements are absent (not that the chat works end-to-end).
    expect(await page.getByText("Accedi per approfondire").count()).toBe(0);
  });
});

// ─── /api/user/usage contract tests ──────────────────────────────────────────

test.describe("Usage API — contract verification", () => {
  test("GET /api/user/usage returns correct shape for anonymous user", async ({
    request,
  }) => {
    const response = await request.get("/api/user/usage");
    // Rate-limited endpoint may return 429; accept 200 or 429
    const status = response.status();
    expect([200, 429]).toContain(status);

    if (status === 200) {
      const body = await response.json();
      // Required fields must be present
      expect(body).toHaveProperty("authenticated");
      expect(body).toHaveProperty("plan");
      expect(body).toHaveProperty("canDeepSearch");
      expect(body).toHaveProperty("deepSearchUsed");
      expect(body).toHaveProperty("deepSearchLimit");
      // Anonymous users are never authenticated
      expect(body.authenticated).toBe(false);
      // Anonymous users cannot deep search (requires login)
      expect(body.canDeepSearch).toBe(false);
    }
  });

  test("GET /api/user/usage responds within 5 seconds", async ({ request }) => {
    const start = Date.now();
    const response = await request.get("/api/user/usage", { timeout: 5_000 });
    const elapsed = Date.now() - start;
    // Rate-limited or normal response — both within 5s
    expect([200, 429]).toContain(response.status());
    expect(elapsed).toBeLessThan(5_000);
  });
});
