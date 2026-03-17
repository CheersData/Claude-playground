/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests: OAuth2 Authorize Route — /api/integrations/[connectorId]/authorize
 *
 * Covers:
 * - Generates correct authorize URL per provider (Fatture, HubSpot, Google Drive)
 * - Sets state cookie (HttpOnly, Secure in production, SameSite=Lax)
 * - Includes correct scopes per provider
 * - Includes redirect_uri pointing to callback
 * - Rate limiting applied
 * - Auth required (unauthenticated request redirected)
 * - Unknown connector returns 400
 * - Missing client ID env var returns 500
 *
 * All external dependencies (Supabase, middleware) are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// =============================================================================
// Mocks — declared before any imports of modules under test
// =============================================================================

// ── Auth middleware ──────────────────────────────────────────────────────────

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockIsAuthError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/middleware/auth", () => ({
  requireAuth: mockRequireAuth,
  isAuthError: mockIsAuthError,
}));

// ── Rate-limit middleware ───────────────────────────────────────────────────

const mockCheckRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/middleware/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
}));

// ── Crypto (deterministic state for tests) ──────────────────────────────────

vi.mock("crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("crypto")>();
  return {
    ...actual,
    randomBytes: vi.fn().mockReturnValue({
      toString: () => "a1b2c3d4".repeat(8), // 64 char hex string
    }),
  };
});

// =============================================================================
// Import module under test AFTER mocks
// =============================================================================

import { GET } from "@/app/api/integrations/[connectorId]/authorize/route";

// =============================================================================
// Helpers
// =============================================================================

const ORIGINAL_ENV = { ...process.env };

function makeRequest(connectorId: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/integrations/${connectorId}/authorize`,
    { method: "GET" }
  );
}

function makeParams(connectorId: string): { params: Promise<{ connectorId: string }> } {
  return { params: Promise.resolve({ connectorId }) };
}

// =============================================================================
// Setup / Teardown
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();

  // Default: rate limit passes
  mockCheckRateLimit.mockResolvedValue(null);

  // Default: authenticated user
  mockRequireAuth.mockResolvedValue({
    user: { id: "user-123", email: "test@example.com" },
  });
  mockIsAuthError.mockReturnValue(false);

  // Set required env vars
  process.env.GOOGLE_CLIENT_ID = "google-client-id-123";
  process.env.HUBSPOT_CLIENT_ID = "hubspot-client-id-456";
  process.env.FATTURE_CLIENT_ID = "fatture-client-id-789";
  process.env.SALESFORCE_CLIENT_ID = "sf-client-id-000";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.controlla.me";
  process.env.NODE_ENV = "production";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// =============================================================================
// Tests: Rate limiting
// =============================================================================

describe("Rate limiting", () => {
  it("returns rate limit response when limit exceeded", async () => {
    const rateLimitResponse = new Response(
      JSON.stringify({ error: "Rate limit exceeded" }),
      { status: 429 }
    );
    mockCheckRateLimit.mockResolvedValue(rateLimitResponse);

    const response = await GET(makeRequest("hubspot"), makeParams("hubspot"));

    expect(response.status).toBe(429);
    expect(mockCheckRateLimit).toHaveBeenCalled();
  });

  it("calls checkRateLimit with the request", async () => {
    const req = makeRequest("hubspot");
    await GET(req, makeParams("hubspot"));

    expect(mockCheckRateLimit).toHaveBeenCalledWith(req);
  });
});

// =============================================================================
// Tests: Authentication
// =============================================================================

describe("Authentication", () => {
  it("redirects to integration page when user is not authenticated", async () => {
    const authResponse = { status: 401 };
    mockRequireAuth.mockResolvedValue(authResponse);
    mockIsAuthError.mockReturnValue(true);

    const response = await GET(makeRequest("hubspot"), makeParams("hubspot"));

    // Should be a redirect (302 or 307)
    expect([301, 302, 303, 307, 308]).toContain(response.status);
    const location = response.headers.get("location");
    expect(location).toContain("/integrazione/hubspot");
    expect(location).toContain("oauth_error=not_authenticated");
  });
});

// =============================================================================
// Tests: Generate correct authorize URL per provider
// =============================================================================

describe("Google Drive authorize URL", () => {
  it("generates correct authorize URL with all required params", async () => {
    const response = await GET(
      makeRequest("google-drive"),
      makeParams("google-drive")
    );

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    const location = response.headers.get("location")!;
    const url = new URL(location);

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("google-client-id-123");
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/drive.readonly"
    );
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("includes redirect_uri pointing to callback", async () => {
    const response = await GET(
      makeRequest("google-drive"),
      makeParams("google-drive")
    );

    const location = response.headers.get("location")!;
    const url = new URL(location);
    const redirectUri = url.searchParams.get("redirect_uri");

    expect(redirectUri).toBe(
      "https://app.controlla.me/api/integrations/google-drive/callback"
    );
  });

  it("includes provider-specific extraParams (access_type, prompt)", async () => {
    const response = await GET(
      makeRequest("google-drive"),
      makeParams("google-drive")
    );

    const location = response.headers.get("location")!;
    const url = new URL(location);

    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });
});

describe("HubSpot authorize URL", () => {
  it("generates correct authorize URL with CRM scopes", async () => {
    const response = await GET(makeRequest("hubspot"), makeParams("hubspot"));

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    const location = response.headers.get("location")!;
    const url = new URL(location);

    expect(url.origin).toBe("https://app.hubspot.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("hubspot-client-id-456");

    const scopes = url.searchParams.get("scope")!;
    expect(scopes).toContain("oauth");
    expect(scopes).toContain("crm.objects.contacts.read");
    expect(scopes).toContain("crm.objects.companies.read");
    expect(scopes).toContain("crm.objects.deals.read");
    expect(scopes).toContain("crm.objects.tickets.read");
  });

  it("includes redirect_uri pointing to callback", async () => {
    const response = await GET(makeRequest("hubspot"), makeParams("hubspot"));

    const location = response.headers.get("location")!;
    const url = new URL(location);

    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.controlla.me/api/integrations/hubspot/callback"
    );
  });
});

describe("Fatture in Cloud authorize URL", () => {
  it("generates correct authorize URL with Italian invoicing scopes", async () => {
    const response = await GET(
      makeRequest("fatture-in-cloud"),
      makeParams("fatture-in-cloud")
    );

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    const location = response.headers.get("location")!;
    const url = new URL(location);

    expect(url.origin).toBe("https://api-v2.fattureincloud.it");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("fatture-client-id-789");

    const scopes = url.searchParams.get("scope")!;
    expect(scopes).toContain("entity.clients:r");
    expect(scopes).toContain("entity.suppliers:r");
    expect(scopes).toContain("issued_documents:r");
    expect(scopes).toContain("received_documents:r");
  });

  it("includes redirect_uri pointing to callback", async () => {
    const response = await GET(
      makeRequest("fatture-in-cloud"),
      makeParams("fatture-in-cloud")
    );

    const location = response.headers.get("location")!;
    const url = new URL(location);

    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.controlla.me/api/integrations/fatture-in-cloud/callback"
    );
  });
});

// =============================================================================
// Tests: State cookie
// =============================================================================

describe("State cookie", () => {
  it("sets httpOnly state cookie with correct name per provider", async () => {
    const response = await GET(makeRequest("hubspot"), makeParams("hubspot"));

    const setCookies = response.headers.getSetCookie();
    const stateCookie = setCookies.find((c: string) =>
      c.includes("oauth_state_hubspot")
    );

    expect(stateCookie).toBeTruthy();
    expect(stateCookie).toContain("HttpOnly");
    // Next.js serializes SameSite as lowercase "lax"
    expect(stateCookie?.toLowerCase()).toContain("samesite=lax");
    expect(stateCookie).toContain("Path=/");
  });

  it("sets Secure flag in production", async () => {
    process.env.NODE_ENV = "production";

    const response = await GET(makeRequest("hubspot"), makeParams("hubspot"));

    const setCookies = response.headers.getSetCookie();
    const stateCookie = setCookies.find((c: string) =>
      c.includes("oauth_state_hubspot")
    );

    expect(stateCookie).toContain("Secure");
  });

  it("sets Max-Age=600 (10 minutes) on state cookie", async () => {
    const response = await GET(makeRequest("hubspot"), makeParams("hubspot"));

    const setCookies = response.headers.getSetCookie();
    const stateCookie = setCookies.find((c: string) =>
      c.includes("oauth_state_hubspot")
    );

    expect(stateCookie).toContain("Max-Age=600");
  });

  it("state value in cookie matches state param in URL", async () => {
    const response = await GET(makeRequest("hubspot"), makeParams("hubspot"));

    // Extract state from URL
    const location = response.headers.get("location")!;
    const url = new URL(location);
    const urlState = url.searchParams.get("state");

    // Extract state from cookie
    const setCookies = response.headers.getSetCookie();
    const stateCookie = setCookies.find((c: string) =>
      c.includes("oauth_state_hubspot")
    );
    // Cookie format: oauth_state_hubspot=VALUE; ...
    const cookieValue = stateCookie?.split("=")[1]?.split(";")[0];

    expect(urlState).toBeTruthy();
    expect(cookieValue).toBe(urlState);
  });
});

// =============================================================================
// Tests: Error cases
// =============================================================================

describe("Error cases", () => {
  it("returns 400 for unknown connector", async () => {
    const response = await GET(
      makeRequest("unknown-connector"),
      makeParams("unknown-connector")
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("non supporta OAuth");
  });

  it("returns 500 when client ID env var is missing", async () => {
    delete process.env.HUBSPOT_CLIENT_ID;

    const response = await GET(makeRequest("hubspot"), makeParams("hubspot"));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain("HUBSPOT_CLIENT_ID");
  });

  it("uses localhost fallback when NEXT_PUBLIC_APP_URL is not set", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;

    const response = await GET(makeRequest("hubspot"), makeParams("hubspot"));

    const location = response.headers.get("location")!;
    const url = new URL(location);
    const redirectUri = url.searchParams.get("redirect_uri");

    expect(redirectUri).toContain("http://localhost:3000");
  });
});

// =============================================================================
// Tests: Salesforce (additional provider coverage)
// =============================================================================

describe("Salesforce authorize URL", () => {
  it("generates authorize URL with correct scopes and prompt=consent", async () => {
    const response = await GET(
      makeRequest("salesforce"),
      makeParams("salesforce")
    );

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    const location = response.headers.get("location")!;
    const url = new URL(location);

    expect(url.origin).toBe("https://login.salesforce.com");
    expect(url.pathname).toBe("/services/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("sf-client-id-000");

    const scopes = url.searchParams.get("scope")!;
    expect(scopes).toContain("api");
    expect(scopes).toContain("refresh_token");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });
});
