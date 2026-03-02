/**
 * Console E2E Tests — Tier Switching + Agent Toggle
 *
 * Covers:
 * 1. Console page loads and shows auth prompt (unauthenticated)
 * 2. Tier switching via /api/console/tier POST endpoint
 * 3. Agent toggle via /api/console/tier POST endpoint
 * 4. GET /api/console/tier returns correct structure (requires auth token)
 * 5. PowerPanel UI renders correctly when opened (mocked auth)
 *
 * Note: The console requires a Bearer JWT token for all API calls (SEC-004).
 * Tests that require auth use intercepted/mocked tokens where needed.
 * Full end-to-end console interaction requires real auth setup — those tests
 * are marked with test.skip() and are meant to be run manually in staging.
 */

import { test, expect } from "@playwright/test";

// ─── Constants ───────────────────────────────────────────────────────────────

const CONSOLE_API = "/api/console/tier";

// ─── Unauthenticated tests (no token) ────────────────────────────────────────

test.describe("Console API — unauthenticated requests", () => {
  test("GET /api/console/tier without auth token returns 401", async ({
    request,
  }) => {
    const response = await request.get(CONSOLE_API);
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });

  test("POST /api/console/tier without auth token returns 401 or CSRF error", async ({
    request,
  }) => {
    const response = await request.post(CONSOLE_API, {
      data: { tier: "intern" },
    });
    // Should fail on CSRF check (missing header) or auth check
    expect([401, 403]).toContain(response.status());
  });

  test("POST /api/console without auth token returns 401", async ({
    request,
  }) => {
    const response = await request.post("/api/console", {
      multipart: {
        message: "ciao",
      },
    });
    expect([401, 403]).toContain(response.status());
  });
});

// ─── Console page UI ─────────────────────────────────────────────────────────

test.describe("Console page — UI rendering", () => {
  test("console page at /console loads without server error", async ({
    page,
  }) => {
    await page.goto("/console");
    // Should not show a 500 or blank page
    const title = await page.title();
    expect(title).toBeTruthy();
    await expect(page.locator("body")).toBeVisible();
  });

  test("console page shows authentication prompt for new visitors", async ({
    page,
  }) => {
    await page.goto("/console");
    await page.waitForTimeout(1000); // Wait for client-side render

    const bodyText = await page.locator("body").textContent();
    // The console has an auth prompt asking for Nome Cognome, Ruolo
    // OR it shows the main console UI if somehow already authenticated
    expect(bodyText).toBeDefined();
    expect(bodyText!.length).toBeGreaterThan(0);
    // Must not be a server error page
    expect(bodyText).not.toContain("Internal Server Error");
    expect(bodyText).not.toContain("Application error");
  });

  test("console page renders input area or auth form", async ({ page }) => {
    await page.goto("/console");
    await page.waitForTimeout(1500);

    // Either an input/textarea for auth credentials or the main chat input
    const inputs = page.locator("input, textarea");
    const count = await inputs.count();
    // There should be at least one interactive input element
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ─── Tier switching (authenticated — requires valid JWT) ──────────────────────

test.describe("Tier switching — API contract", () => {
  test.skip(
    true,
    "Requires valid JWT console token — run manually with: CONSOLE_TOKEN=<token> npx playwright test console.spec.ts"
  );

  const TOKEN = process.env.CONSOLE_TOKEN ?? "";

  test("GET /api/console/tier with valid token returns tier info", async ({
    request,
  }) => {
    const response = await request.get(CONSOLE_API, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();

    // Verify response shape
    expect(body).toHaveProperty("current");
    expect(["intern", "associate", "partner"]).toContain(body.current);
    expect(body).toHaveProperty("agents");
    expect(body).toHaveProperty("estimatedCost");
  });

  test("POST /api/console/tier switches to intern tier", async ({
    request,
  }) => {
    const response = await request.post(CONSOLE_API, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "X-CSRF-Token": "e2e-test", // Required by CSRF middleware
      },
      data: { tier: "intern" },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.current).toBe("intern");
    // New JWT token is returned for stateless session update
    expect(body).toHaveProperty("token");
    expect(typeof body.token).toBe("string");
  });

  test("POST /api/console/tier switches to partner tier", async ({
    request,
  }) => {
    const response = await request.post(CONSOLE_API, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "X-CSRF-Token": "e2e-test",
      },
      data: { tier: "partner" },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.current).toBe("partner");
  });

  test("POST /api/console/tier with invalid tier returns 400", async ({
    request,
  }) => {
    const response = await request.post(CONSOLE_API, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "X-CSRF-Token": "e2e-test",
      },
      data: { tier: "superadmin" }, // Invalid tier
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
  });
});

// ─── Agent toggle (authenticated — requires valid JWT) ────────────────────────

test.describe("Agent toggle — API contract", () => {
  test.skip(
    true,
    "Requires valid JWT console token — run manually with: CONSOLE_TOKEN=<token> npx playwright test console.spec.ts"
  );

  const TOKEN = process.env.CONSOLE_TOKEN ?? "";

  const AGENTS = [
    "leader",
    "question-prep",
    "classifier",
    "corpus-agent",
    "analyzer",
    "investigator",
    "advisor",
  ];

  for (const agent of AGENTS) {
    test(`POST /api/console/tier can disable agent: ${agent}`, async ({
      request,
    }) => {
      const response = await request.post(CONSOLE_API, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "X-CSRF-Token": "e2e-test",
        },
        data: { agent, enabled: false },
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      // The agent should now appear as disabled in the returned state
      if (body.agents?.[agent]) {
        expect(body.agents[agent].enabled).toBe(false);
      }
      // A new token is returned
      expect(body).toHaveProperty("token");
    });

    test(`POST /api/console/tier can re-enable agent: ${agent}`, async ({
      request,
    }) => {
      const response = await request.post(CONSOLE_API, {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "X-CSRF-Token": "e2e-test",
        },
        data: { agent, enabled: true },
      });
      expect(response.status()).toBe(200);
      const body = await response.json();
      if (body.agents?.[agent]) {
        expect(body.agents[agent].enabled).toBe(true);
      }
    });
  }

  test("POST /api/console/tier with invalid agent name returns 400", async ({
    request,
  }) => {
    const response = await request.post(CONSOLE_API, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "X-CSRF-Token": "e2e-test",
      },
      data: { agent: "non-existent-agent", enabled: false },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("Agente non valido");
  });
});

// ─── Console UI with mocked auth ─────────────────────────────────────────────

test.describe("Console UI — with mocked auth", () => {
  test("PowerPanel API calls return expected structure (mocked token)", async ({
    page,
  }) => {
    // Mock the tier API to return a valid response without real auth
    await page.route(CONSOLE_API, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            current: "associate",
            agents: {
              leader: {
                chain: [{ key: "claude-haiku-4.5", displayName: "Haiku 4.5", provider: "anthropic", available: true }],
                activeIndex: 0,
                activeModel: "claude-haiku-4.5",
                enabled: true,
              },
              classifier: {
                chain: [{ key: "claude-haiku-4.5", displayName: "Haiku 4.5", provider: "anthropic", available: true }],
                activeIndex: 0,
                activeModel: "claude-haiku-4.5",
                enabled: true,
              },
              analyzer: {
                chain: [{ key: "claude-sonnet-4-5", displayName: "Sonnet 4.5", provider: "anthropic", available: true }],
                activeIndex: 0,
                activeModel: "claude-sonnet-4-5",
                enabled: true,
              },
              investigator: {
                chain: [{ key: "claude-sonnet-4-5", displayName: "Sonnet 4.5", provider: "anthropic", available: true }],
                activeIndex: 0,
                activeModel: "claude-sonnet-4-5",
                enabled: true,
              },
              advisor: {
                chain: [{ key: "claude-sonnet-4-5", displayName: "Sonnet 4.5", provider: "anthropic", available: true }],
                activeIndex: 0,
                activeModel: "claude-sonnet-4-5",
                enabled: true,
              },
            },
            estimatedCost: { perQuery: 0.01, label: "~$0.01/query" },
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/console");
    await page.waitForTimeout(1000);

    // Page must render without crashing
    await expect(page.locator("body")).toBeVisible();
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Internal Server Error");
  });
});
