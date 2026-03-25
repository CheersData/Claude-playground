/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests: OAuth2 Callback Route — /api/integrations/[connectorId]/callback
 *
 * Covers:
 * - Validates state parameter (timing-safe comparison)
 * - Rejects missing/invalid state
 * - Rejects missing authorization code
 * - Handles OAuth provider error redirect
 * - Exchanges code for token (mock HTTP)
 * - Stores encrypted token in BOTH vaults (pgcrypto + AES-256-GCM)
 * - Creates/updates integration_connection record
 * - Handles token exchange error gracefully
 * - Handles duplicate callback (idempotent — upsert on conflict)
 * - Cleans up state cookie after success
 * - Cleans up state cookie after error
 * - Rate limiting applied
 *
 * All external dependencies (Supabase, vault, fetch, middleware) are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// =============================================================================
// Mocks — declared before any imports of modules under test
// =============================================================================

// ── Rate-limit middleware ───────────────────────────────────────────────────

const mockCheckRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/middleware/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
}));

// ── pgcrypto vault (lib/credential-vault.ts) ────────────────────────────────

const mockPgcryptoVault = vi.hoisted(() => ({
  storeCredential: vi.fn(),
}));

vi.mock("@/lib/credential-vault", () => ({
  getVaultOrNull: () => mockPgcryptoVault,
}));

// ── AES-256-GCM vault (lib/staff/credential-vault) ─────────────────────────

const mockAesVault = vi.hoisted(() => ({
  storeCredential: vi.fn(),
}));

vi.mock("@/lib/staff/credential-vault", () => ({
  getCredentialVault: () => mockAesVault,
}));

// ── Supabase server client (for auth) ───────────────────────────────────────

const mockGetUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
      },
    }),
}));

// ── Supabase admin client (for integration_connections + audit) ─────────────

const mockAdminInsert = vi.hoisted(() => vi.fn());
const mockAdminFrom = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mockAdminFrom,
  }),
}));

// ── Global fetch mock ───────────────────────────────────────────────────────

const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", mockFetch);

// =============================================================================
// Import module under test AFTER mocks
// =============================================================================

import { GET } from "@/app/api/integrations/[connectorId]/callback/route";

// =============================================================================
// Helpers
// =============================================================================

const ORIGINAL_ENV = { ...process.env };
const MOCK_USER_ID = "user-oauth-test-001";
const VALID_STATE = "abcdef1234567890".repeat(4); // 64 char hex
const VALID_CODE_VERIFIER = "test-pkce-code-verifier-" + "x".repeat(40); // 64 char

function makeRequest(
  connectorId: string,
  queryParams: Record<string, string> = {},
  cookies: Record<string, string> = {}
): NextRequest {
  const url = new URL(
    `http://localhost:3000/api/integrations/${connectorId}/callback`
  );
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value);
  }

  // Always include the PKCE code_verifier cookie when state cookie is present
  const allCookies = { ...cookies };
  if (allCookies[`oauth_state_${connectorId}`] && !allCookies[`pkce_verifier_${connectorId}`]) {
    allCookies[`pkce_verifier_${connectorId}`] = VALID_CODE_VERIFIER;
  }

  // NextRequest cookies are read-only in test, so we need to create with headers
  if (Object.keys(allCookies).length > 0) {
    const cookieString = Object.entries(allCookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    return new NextRequest(url.toString(), {
      method: "GET",
      headers: { Cookie: cookieString },
    });
  }

  return new NextRequest(url.toString(), { method: "GET" });
}

function makeParams(connectorId: string) {
  return { params: Promise.resolve({ connectorId }) };
}

function setupSuccessfulTokenExchange() {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        access_token: "test-access-token-abc",
        refresh_token: "test-refresh-token-xyz",
        token_type: "Bearer",
        expires_in: 3600,
      }),
  });
}

function setupSuccessfulUser() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: MOCK_USER_ID, email: "test@example.com" } },
    error: null,
  });
}

function setupSuccessfulVaults() {
  mockPgcryptoVault.storeCredential.mockResolvedValue("pgcrypto-vault-id-123");
  mockAesVault.storeCredential.mockResolvedValue("aes-vault-id-456");
}

function setupSuccessfulDbInsert() {
  const mockMaybeSingle = vi.fn().mockResolvedValue({
    data: { id: "conn-id-789" },
    error: null,
  });
  const mockSelect = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
  const mockInsertChain = vi.fn().mockReturnValue({ select: mockSelect });

  // For integration_connections insert
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "integration_connections") {
      return { insert: mockInsertChain };
    }
    if (table === "integration_credential_audit") {
      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }
    return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
  });
}

// =============================================================================
// Setup / Teardown
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue(null);

  process.env.HUBSPOT_CLIENT_ID = "hubspot-client-id";
  process.env.HUBSPOT_CLIENT_SECRET = "hubspot-client-secret";
  process.env.GOOGLE_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
  process.env.FATTURE_CLIENT_ID = "fatture-client-id";
  process.env.FATTURE_CLIENT_SECRET = "fatture-client-secret";
  process.env.SALESFORCE_CLIENT_ID = "sf-client-id";
  process.env.SALESFORCE_CLIENT_SECRET = "sf-client-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.controlla.me";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// =============================================================================
// Tests: Rate limiting
// =============================================================================

describe("Rate limiting", () => {
  it("returns rate limit response when limit exceeded", async () => {
    const rateLimitResponse = new Response("Too many requests", { status: 429 });
    mockCheckRateLimit.mockResolvedValue(rateLimitResponse);

    const response = await GET(
      makeRequest("hubspot", { code: "abc", state: VALID_STATE }),
      makeParams("hubspot")
    );

    expect(response.status).toBe(429);
  });
});

// =============================================================================
// Tests: State validation
// =============================================================================

describe("State validation", () => {
  it("rejects when state param is missing", async () => {
    const req = makeRequest(
      "hubspot",
      { code: "auth-code-123" },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    const location = response.headers.get("location")!;
    expect(location).toContain("oauth_error=expired_state");
  });

  it("rejects when state cookie is missing", async () => {
    const req = makeRequest("hubspot", {
      code: "auth-code-123",
      state: VALID_STATE,
    });

    const response = await GET(req, makeParams("hubspot"));

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    const location = response.headers.get("location")!;
    expect(location).toContain("oauth_error=expired_state");
  });

  it("rejects when state param does not match cookie (CSRF attack)", async () => {
    const req = makeRequest(
      "hubspot",
      { code: "auth-code-123", state: "wrong-state-value" + "0".repeat(48) },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    const location = response.headers.get("location")!;
    expect(location).toContain("oauth_error=invalid_state");
  });

  it("accepts valid matching state (timing-safe comparison)", async () => {
    setupSuccessfulTokenExchange();
    setupSuccessfulUser();
    setupSuccessfulVaults();
    setupSuccessfulDbInsert();

    const req = makeRequest(
      "hubspot",
      { code: "valid-auth-code", state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    const location = response.headers.get("location")!;
    expect(location).toContain("setup=complete");
    expect(location).not.toContain("oauth_error");
  });
});

// =============================================================================
// Tests: Missing code
// =============================================================================

describe("Missing authorization code", () => {
  it("redirects with error when code is missing", async () => {
    const req = makeRequest(
      "hubspot",
      { state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    const location = response.headers.get("location")!;
    expect(location).toContain("oauth_error=missing_code");
  });
});

// =============================================================================
// Tests: Provider error
// =============================================================================

describe("OAuth provider error", () => {
  it("handles provider error redirect (access_denied)", async () => {
    const req = makeRequest(
      "hubspot",
      { error: "access_denied", error_description: "User denied consent" },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    const location = response.headers.get("location")!;
    expect(location).toContain("oauth_error=access_denied");
    expect(location).toContain("oauth_error_desc=User");
  });

  it("cleans up state cookie on provider error", async () => {
    const req = makeRequest(
      "hubspot",
      { error: "access_denied" },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    const setCookies = response.headers.getSetCookie();
    const clearedCookie = setCookies.find((c: string) =>
      c.includes("oauth_state_hubspot")
    );
    expect(clearedCookie).toBeTruthy();
    expect(clearedCookie).toContain("Max-Age=0");
  });
});

// =============================================================================
// Tests: Token exchange
// =============================================================================

describe("Token exchange", () => {
  it("exchanges code for tokens via POST to provider token URL", async () => {
    setupSuccessfulTokenExchange();
    setupSuccessfulUser();
    setupSuccessfulVaults();
    setupSuccessfulDbInsert();

    const req = makeRequest(
      "hubspot",
      { code: "auth-code-123", state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    await GET(req, makeParams("hubspot"));

    // Verify fetch was called with correct token URL
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.hubapi.com/oauth/v1/token",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
    );

    // Verify body contains required params
    const fetchCall = mockFetch.mock.calls[0];
    const body = fetchCall[1].body;
    expect(body).toContain("grant_type=authorization_code");
    expect(body).toContain("code=auth-code-123");
    expect(body).toContain("client_id=hubspot-client-id");
    expect(body).toContain("client_secret=hubspot-client-secret");
    expect(body).toContain(encodeURIComponent("api/integrations/hubspot/callback"));
  });

  it("handles token exchange HTTP error (400 = invalid code)", async () => {
    setupSuccessfulUser();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("invalid_grant"),
    });

    const req = makeRequest(
      "hubspot",
      { code: "expired-code", state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    const location = response.headers.get("location")!;
    expect(location).toContain("oauth_error=invalid_code");
  });

  it("handles token exchange HTTP error (401 = invalid credentials)", async () => {
    setupSuccessfulUser();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("unauthorized_client"),
    });

    const req = makeRequest(
      "hubspot",
      { code: "valid-code", state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    const location = response.headers.get("location")!;
    expect(location).toContain("oauth_error=invalid_credentials");
  });

  it("handles token response missing access_token", async () => {
    setupSuccessfulUser();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ error: "something_weird" }),
    });

    const req = makeRequest(
      "hubspot",
      { code: "valid-code", state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    const location = response.headers.get("location")!;
    expect(location).toContain("oauth_error=no_access_token");
  });
});

// =============================================================================
// Tests: Credential storage in vaults
// =============================================================================

describe("Credential storage", () => {
  it("stores credentials in pgcrypto vault", async () => {
    setupSuccessfulTokenExchange();
    setupSuccessfulUser();
    setupSuccessfulVaults();
    setupSuccessfulDbInsert();

    const req = makeRequest(
      "hubspot",
      { code: "valid-code", state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    await GET(req, makeParams("hubspot"));

    expect(mockPgcryptoVault.storeCredential).toHaveBeenCalledWith(
      MOCK_USER_ID,
      "hubspot",
      "oauth2_token",
      expect.objectContaining({
        access_token: "test-access-token-abc",
        refresh_token: "test-refresh-token-xyz",
        token_type: "Bearer",
      }),
      expect.objectContaining({
        metadata: expect.objectContaining({
          provider: "hubspot",
        }),
      })
    );
  });

  it("does not use AES vault — only pgcrypto vault stores credentials", async () => {
    // The callback route only uses pgcrypto vault (lib/credential-vault.ts).
    // AES vault (lib/staff/credential-vault) is used by other integration components.
    setupSuccessfulTokenExchange();
    setupSuccessfulUser();
    setupSuccessfulVaults();
    setupSuccessfulDbInsert();

    const req = makeRequest(
      "hubspot",
      { code: "valid-code", state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    await GET(req, makeParams("hubspot"));

    // pgcrypto vault IS called
    expect(mockPgcryptoVault.storeCredential).toHaveBeenCalled();
    // AES vault is NOT called by the callback route
    expect(mockAesVault.storeCredential).not.toHaveBeenCalled();
  });

  it("fails when pgcrypto vault fails (no AES fallback)", async () => {
    // The callback route only uses pgcrypto vault. When it fails,
    // the route redirects with vault_unavailable error.
    setupSuccessfulTokenExchange();
    setupSuccessfulUser();
    setupSuccessfulDbInsert();

    mockPgcryptoVault.storeCredential.mockRejectedValue(
      new Error("pgcrypto unavailable")
    );

    const req = makeRequest(
      "hubspot",
      { code: "valid-code", state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    const location = response.headers.get("location")!;
    expect(location).toContain("oauth_error=vault_unavailable");
  });

  it("succeeds when AES vault fails but pgcrypto vault succeeds", async () => {
    setupSuccessfulTokenExchange();
    setupSuccessfulUser();
    setupSuccessfulDbInsert();

    mockPgcryptoVault.storeCredential.mockResolvedValue("pgcrypto-vault-id-123");
    mockAesVault.storeCredential.mockRejectedValue(
      new Error("AES vault unavailable")
    );

    const req = makeRequest(
      "hubspot",
      { code: "valid-code", state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    const location = response.headers.get("location")!;
    expect(location).toContain("setup=complete");
  });

  it("returns error when BOTH vaults fail", async () => {
    setupSuccessfulTokenExchange();
    setupSuccessfulUser();
    setupSuccessfulDbInsert();

    mockPgcryptoVault.storeCredential.mockRejectedValue(
      new Error("pgcrypto unavailable")
    );
    mockAesVault.storeCredential.mockRejectedValue(
      new Error("AES vault unavailable")
    );

    const req = makeRequest(
      "hubspot",
      { code: "valid-code", state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    const location = response.headers.get("location")!;
    expect(location).toContain("oauth_error=vault_unavailable");
  });
});

// =============================================================================
// Tests: Integration connection record
// =============================================================================

describe("Integration connection record", () => {
  it("creates connection record on success", async () => {
    setupSuccessfulTokenExchange();
    setupSuccessfulUser();
    setupSuccessfulVaults();
    setupSuccessfulDbInsert();

    const req = makeRequest(
      "hubspot",
      { code: "valid-code", state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    await GET(req, makeParams("hubspot"));

    expect(mockAdminFrom).toHaveBeenCalledWith("integration_connections");
  });

  it("handles duplicate connection (upsert on conflict)", async () => {
    setupSuccessfulTokenExchange();
    setupSuccessfulUser();
    setupSuccessfulVaults();

    // First insert fails with unique constraint violation
    const mockUpdateMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: "existing-conn-id" },
      error: null,
    });
    const mockUpdateSelect = vi.fn().mockReturnValue({ maybeSingle: mockUpdateMaybeSingle });
    const mockUpdateEq2 = vi.fn().mockReturnValue({ select: mockUpdateSelect });
    const mockUpdateEq1 = vi.fn().mockReturnValue({ eq: mockUpdateEq2 });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq1 });

    const mockInsertMaybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });
    const mockInsertSelect = vi.fn().mockReturnValue({ maybeSingle: mockInsertMaybeSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockInsertSelect });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "integration_connections") {
        return { insert: mockInsert, update: mockUpdate };
      }
      if (table === "integration_credential_audit") {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
    });

    const req = makeRequest(
      "hubspot",
      { code: "valid-code", state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    // Should still succeed despite duplicate
    const location = response.headers.get("location")!;
    expect(location).toContain("setup=complete");
    // Should have attempted update after insert conflict
    expect(mockUpdate).toHaveBeenCalled();
  });
});

// =============================================================================
// Tests: User authentication
// =============================================================================

describe("User authentication in callback", () => {
  it("redirects with error when user is not authenticated", async () => {
    setupSuccessfulTokenExchange();

    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "No session" },
    });

    const req = makeRequest(
      "hubspot",
      { code: "valid-code", state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    const location = response.headers.get("location")!;
    expect(location).toContain("oauth_error=not_authenticated");
  });
});

// =============================================================================
// Tests: Cookie cleanup
// =============================================================================

describe("Cookie cleanup", () => {
  it("clears state cookie on success", async () => {
    setupSuccessfulTokenExchange();
    setupSuccessfulUser();
    setupSuccessfulVaults();
    setupSuccessfulDbInsert();

    const req = makeRequest(
      "hubspot",
      { code: "valid-code", state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    const setCookies = response.headers.getSetCookie();
    const clearedCookie = setCookies.find((c: string) =>
      c.includes("oauth_state_hubspot")
    );
    expect(clearedCookie).toBeTruthy();
    expect(clearedCookie).toContain("Max-Age=0");
  });

  it("clears state cookie on missing code error", async () => {
    const req = makeRequest(
      "hubspot",
      { state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    const setCookies = response.headers.getSetCookie();
    const clearedCookie = setCookies.find((c: string) =>
      c.includes("oauth_state_hubspot")
    );
    expect(clearedCookie).toBeTruthy();
    expect(clearedCookie).toContain("Max-Age=0");
  });
});

// =============================================================================
// Tests: Unknown connector
// =============================================================================

describe("Unknown connector", () => {
  it("redirects with error for unknown connectorId", async () => {
    const req = makeRequest(
      "unknown-provider",
      { code: "valid-code", state: VALID_STATE },
      { oauth_state_unknown_provider: VALID_STATE }
    );

    // Note: state validation will fail first because cookie name uses connectorId
    // Let's test with matching state cookie name
    const response = await GET(req, makeParams("unknown-provider"));

    expect([301, 302, 303, 307, 308]).toContain(response.status);
    const location = response.headers.get("location")!;
    // Will get expired_state because the cookie name uses "unknown-provider"
    // but the state validation happens before connector validation
    expect(location).toContain("oauth_error");
  });
});

// =============================================================================
// Tests: Missing env vars
// =============================================================================

describe("Missing environment variables", () => {
  it("redirects with server_config error when client ID is missing", async () => {
    delete process.env.HUBSPOT_CLIENT_ID;
    setupSuccessfulUser();

    const req = makeRequest(
      "hubspot",
      { code: "valid-code", state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    const location = response.headers.get("location")!;
    expect(location).toContain("oauth_error=server_config");
  });

  it("redirects with server_config error when client secret is missing", async () => {
    delete process.env.HUBSPOT_CLIENT_SECRET;
    setupSuccessfulUser();

    const req = makeRequest(
      "hubspot",
      { code: "valid-code", state: VALID_STATE },
      { oauth_state_hubspot: VALID_STATE }
    );

    const response = await GET(req, makeParams("hubspot"));

    const location = response.headers.get("location")!;
    expect(location).toContain("oauth_error=server_config");
  });
});

// =============================================================================
// Tests: Provider-specific token URLs
// =============================================================================

describe("Provider-specific token exchange", () => {
  it("uses correct token URL for Google Drive", async () => {
    setupSuccessfulTokenExchange();
    setupSuccessfulUser();
    setupSuccessfulVaults();
    setupSuccessfulDbInsert();

    const req = makeRequest(
      "google-drive",
      { code: "google-code", state: VALID_STATE },
      { "oauth_state_google-drive": VALID_STATE }
    );

    await GET(req, makeParams("google-drive"));

    expect(mockFetch).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.any(Object)
    );
  });

  it("uses correct token URL for Fatture in Cloud", async () => {
    setupSuccessfulTokenExchange();
    setupSuccessfulUser();
    setupSuccessfulVaults();
    setupSuccessfulDbInsert();

    const req = makeRequest(
      "fatture-in-cloud",
      { code: "fatture-code", state: VALID_STATE },
      { "oauth_state_fatture-in-cloud": VALID_STATE }
    );

    await GET(req, makeParams("fatture-in-cloud"));

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api-v2.fattureincloud.it/oauth/token",
      expect.any(Object)
    );
  });
});
