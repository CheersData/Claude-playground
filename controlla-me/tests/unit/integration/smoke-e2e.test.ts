/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SMOKE TEST — Integration End-to-End Flow
 *
 * Simulates the full integration lifecycle at the unit level:
 *
 *   1. GET  /api/integrations/status   → connector catalog (public + per-user)
 *   2. POST /api/integrations/setup    → wizard saves config + connection + mappings
 *   3. POST /api/integrations/[id]/sync → vault → dispatcher → persist → sync log
 *   4. GET  /api/integrations/dashboard → connections + sync status + errors
 *   5. POST /api/integrations/credentials → store credential
 *   6. GET  /api/integrations/credentials → list credentials (metadata only)
 *   7. DELETE /api/integrations/credentials → revoke credential
 *   8. GET  /api/integrations           → list user connections
 *   9. POST /api/integrations           → create new connection
 *  10. DELETE /api/integrations         → disconnect + vault revoke
 *
 * Error scenarios:
 *   - Vault unavailable (missing VAULT_ENCRYPTION_KEY)
 *   - Missing credentials in vault when syncing
 *   - Unknown connector ID in sync route
 *   - Setup with missing required fields
 *   - Credentials route with invalid credential type
 *
 * All external dependencies (Supabase, vault RPCs, fetch, middleware) are mocked.
 * No real DB, no real API calls, no real credentials.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// =============================================================================
// Mocks — declared before any imports of modules under test
// =============================================================================

// ── Supabase admin client ───────────────────────────────────────────────────

const mockAdminRpc = vi.hoisted(() => vi.fn());
const mockAdminFrom = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mockAdminRpc,
    from: mockAdminFrom,
  }),
}));

// ── Supabase server client (RLS-scoped, for GET routes) ─────────────────────

const mockServerFrom = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      from: mockServerFrom,
    }),
}));

// ── Auth middleware: default = authenticated user ────────────────────────────

const MOCK_USER_ID = "user-smoke-test-001";

vi.mock("@/lib/middleware/auth", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    user: { id: MOCK_USER_ID, email: "smoke@test.it" },
  }),
  isAuthError: vi.fn().mockReturnValue(false),
}));

// ── CSRF middleware: no-op ──────────────────────────────────────────────────

vi.mock("@/lib/middleware/csrf", () => ({
  checkCsrf: vi.fn().mockReturnValue(null),
}));

// ── Rate-limit middleware: no-op ────────────────────────────────────────────

vi.mock("@/lib/middleware/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
}));

// ── Audit log: no-op ───────────────────────────────────────────────────────

vi.mock("@/lib/middleware/audit-log", () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
  extractRequestMeta: vi.fn().mockReturnValue({}),
}));

// ── Vault middleware (for credentials route) ────────────────────────────────

const mockVaultInstance = vi.hoisted(() => ({
  storeCredential: vi.fn(),
  getCredential: vi.fn(),
  refreshCredential: vi.fn(),
  revokeCredential: vi.fn(),
  listForUser: vi.fn(),
}));

vi.mock("@/lib/middleware/vault-middleware", () => ({
  withVaultAuth: vi.fn().mockResolvedValue({
    user: { id: MOCK_USER_ID, email: "smoke@test.it" },
    vault: mockVaultInstance,
  }),
  isVaultError: vi.fn().mockReturnValue(false),
}));

// ── Credential vault (for sync route + integrations root) ───────────────────

vi.mock("@/lib/credential-vault", () => ({
  SupabaseCredentialVault: vi.fn(),
  getVault: vi.fn().mockReturnValue(mockVaultInstance),
  getVaultOrNull: vi.fn().mockReturnValue(mockVaultInstance),
}));

// ── Sync dispatcher (for sync route) ────────────────────────────────────────

const mockExecuteSyncForConnector = vi.hoisted(() => vi.fn());
const mockHasSyncHandler = vi.hoisted(() => vi.fn());
const mockListSyncHandlers = vi.hoisted(() => vi.fn());

vi.mock("@/lib/staff/data-connector/sync-dispatcher", () => ({
  executeSyncForConnector: mockExecuteSyncForConnector,
  hasSyncHandler: mockHasSyncHandler,
  listSyncHandlers: mockListSyncHandlers,
}));

// =============================================================================
// Helpers
// =============================================================================

const ORIGINAL_ENV = { ...process.env };

/** Creates a NextRequest suitable for testing API routes. */
function makeRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>
): NextRequest {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "https://controlla.me",
    },
  };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(new URL(url, "https://controlla.me"), init);
}

/**
 * Creates a chained Supabase query mock.
 * Supports: .from().select().eq().neq().is().order().limit().in().maybeSingle().single()
 *           .from().insert().select().single()
 *           .from().update().eq().select().maybeSingle()
 *           .from().upsert()
 *
 * Returns the configured terminal result (data/error).
 */
function makeChainMock(result: { data: any; error: any }) {
  // Two-step: create object first, then wire self-references.
  // `const` with self-reference in initializer causes TDZ error.
  const chain: any = {};

  chain.select = vi.fn().mockImplementation(() => chain);
  chain.eq = vi.fn().mockImplementation(() => chain);
  chain.neq = vi.fn().mockImplementation(() => chain);
  chain.is = vi.fn().mockImplementation(() => chain);
  chain.in = vi.fn().mockImplementation(() => chain);
  chain.gte = vi.fn().mockImplementation(() => chain);
  chain.lte = vi.fn().mockImplementation(() => chain);
  chain.order = vi.fn().mockImplementation(() => chain);
  chain.limit = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.insert = vi.fn().mockImplementation(() => chain);
  chain.update = vi.fn().mockImplementation(() => chain);
  chain.upsert = vi.fn().mockImplementation(() => chain);
  // Make the chain itself thenable so `await admin.from(...)...` resolves
  chain.then = (resolve: any) => resolve(result);

  return chain;
}

// =============================================================================
// Setup / teardown
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VAULT_ENCRYPTION_KEY = "a".repeat(32);
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

// =============================================================================
// 1. GET /api/integrations/status — Connector Catalog
// =============================================================================

describe("GET /api/integrations/status — connector catalog", () => {
  it("returns the static connector catalog (unauthenticated)", async () => {
    // Override auth to simulate unauthenticated user
    const { requireAuth, isAuthError } = await import(
      "@/lib/middleware/auth"
    );
    vi.mocked(requireAuth).mockResolvedValueOnce({
      error: "Not authenticated",
    } as any);
    vi.mocked(isAuthError).mockReturnValueOnce(true);

    const { GET } = await import("@/app/api/integrations/status/route");
    const req = makeRequest("GET", "/api/integrations/status");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.connectors).toBeDefined();
    expect(Array.isArray(body.connectors)).toBe(true);
    expect(body.connectors.length).toBeGreaterThanOrEqual(5);

    // Verify expected connectors exist
    const ids = body.connectors.map((c: any) => c.id);
    expect(ids).toContain("hubspot");
    expect(ids).toContain("stripe");
    expect(ids).toContain("google-drive");
    expect(ids).toContain("salesforce");
  });

  it("merges per-user connection status when authenticated", async () => {
    // Setup: user has a connected Stripe
    const serverChain = makeChainMock({
      data: [
        {
          connector_type: "stripe",
          status: "active",
          last_sync_at: "2026-03-15T10:00:00Z",
          last_sync_items: 42,
        },
      ],
      error: null,
    });
    mockServerFrom.mockReturnValue(serverChain);

    const { GET } = await import("@/app/api/integrations/status/route");
    const req = makeRequest("GET", "/api/integrations/status");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);

    const stripe = body.connectors.find((c: any) => c.id === "stripe");
    expect(stripe).toBeDefined();
    expect(stripe.status).toBe("connected");
    expect(stripe.entityCount).toBe(42);
    expect(stripe.lastSync).toBe("2026-03-15T10:00:00Z");

    // Non-connected connectors keep default status
    const hubspot = body.connectors.find((c: any) => c.id === "hubspot");
    expect(hubspot.status).toBe("not_connected");
    expect(hubspot.entityCount).toBe(0);
  });

  it("includes expected fields for each connector", async () => {
    mockServerFrom.mockReturnValue(
      makeChainMock({ data: [], error: null })
    );

    const { GET } = await import("@/app/api/integrations/status/route");
    const req = makeRequest("GET", "/api/integrations/status");
    const res = await GET(req);
    const body = await res.json();

    for (const c of body.connectors) {
      expect(c).toHaveProperty("id");
      expect(c).toHaveProperty("name");
      expect(c).toHaveProperty("category");
      expect(c).toHaveProperty("status");
      expect(c).toHaveProperty("description");
      expect(c).toHaveProperty("icon");
      expect(c).toHaveProperty("entityCount");
    }
  });

  it("gracefully handles DB query failure", async () => {
    // Supabase query throws — should return static defaults
    mockServerFrom.mockImplementation(() => {
      throw new Error("DB connection timeout");
    });

    const { GET } = await import("@/app/api/integrations/status/route");
    const req = makeRequest("GET", "/api/integrations/status");
    const res = await GET(req);
    const body = await res.json();

    // Should still return 200 with static catalog
    expect(res.status).toBe(200);
    expect(body.connectors.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// 2. POST /api/integrations/setup — Wizard Config Save
// =============================================================================

describe("POST /api/integrations/setup — wizard config save", () => {
  it("creates a new connection and returns success", async () => {
    // Mock: no existing connection
    const selectChain = makeChainMock({ data: null, error: null });
    // Mock: insert returns connection ID
    const insertChain = makeChainMock({
      data: { id: "conn-001" },
      error: null,
    });
    // Mock: sync log creation
    const syncLogChain = makeChainMock({
      data: { id: "log-001" },
      error: null,
    });

    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "integration_connections") {
        callCount++;
        // First call is SELECT (check existing), second is INSERT
        return callCount === 1 ? selectChain : insertChain;
      }
      if (table === "entity_mapping_configs") {
        return makeChainMock({ data: null, error: null });
      }
      if (table === "integration_sync_log") {
        return syncLogChain;
      }
      return makeChainMock({ data: null, error: null });
    });

    const { POST } = await import("@/app/api/integrations/setup/route");
    const req = makeRequest("POST", "/api/integrations/setup", {
      connectorId: "hubspot",
      selectedEntities: ["contacts", "deals"],
      frequency: "daily",
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.connectorId).toBe("hubspot");
    expect(body.connectorName).toBe("HubSpot");
    expect(body.selectedEntities).toEqual(["contacts", "deals"]);
    expect(body.frequency).toBe("daily");
  });

  it("updates existing connection config", async () => {
    // Mock: existing connection found
    const selectChain = makeChainMock({
      data: { id: "conn-existing" },
      error: null,
    });
    const updateChain = makeChainMock({ data: null, error: null });
    const syncLogChain = makeChainMock({
      data: { id: "log-002" },
      error: null,
    });

    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "integration_connections") {
        callCount++;
        return callCount === 1 ? selectChain : updateChain;
      }
      if (table === "integration_sync_log") return syncLogChain;
      return makeChainMock({ data: null, error: null });
    });

    const { POST } = await import("@/app/api/integrations/setup/route");
    const req = makeRequest("POST", "/api/integrations/setup", {
      connectorId: "stripe",
      selectedEntities: ["payments"],
      frequency: "hourly",
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.connectionId).toBe("conn-existing");
  });

  it("returns 400 when connectorId is missing", async () => {
    const { POST } = await import("@/app/api/integrations/setup/route");
    const req = makeRequest("POST", "/api/integrations/setup", {
      selectedEntities: ["contacts"],
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("connectorId");
  });

  it("returns 400 when selectedEntities is empty", async () => {
    const { POST } = await import("@/app/api/integrations/setup/route");
    const req = makeRequest("POST", "/api/integrations/setup", {
      connectorId: "hubspot",
      selectedEntities: [],
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("entita");
  });

  it("saves field mappings when provided", async () => {
    const selectChain = makeChainMock({ data: null, error: null });
    const insertChain = makeChainMock({
      data: { id: "conn-mapped" },
      error: null,
    });
    const archiveChain = makeChainMock({ data: null, error: null });
    const upsertChain = makeChainMock({ data: null, error: null });
    const syncLogChain = makeChainMock({
      data: { id: "log-003" },
      error: null,
    });

    let connCallCount = 0;
    let mappingCallCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "integration_connections") {
        connCallCount++;
        return connCallCount === 1 ? selectChain : insertChain;
      }
      if (table === "entity_mapping_configs") {
        mappingCallCount++;
        // First call: archive existing, second call: upsert new
        return mappingCallCount === 1 ? archiveChain : upsertChain;
      }
      if (table === "integration_sync_log") return syncLogChain;
      return makeChainMock({ data: null, error: null });
    });

    const { POST } = await import("@/app/api/integrations/setup/route");
    const req = makeRequest("POST", "/api/integrations/setup", {
      connectorId: "hubspot",
      selectedEntities: ["contacts"],
      frequency: "daily",
      mappings: [
        {
          entityId: "contacts",
          entityName: "Contacts",
          mappings: [
            {
              sourceField: "firstname",
              targetField: "first_name",
              confidence: 0.95,
              autoMapped: true,
            },
            {
              sourceField: "email",
              targetField: "email",
              confidence: 1.0,
              autoMapped: false,
            },
          ],
        },
      ],
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.mappingsCount).toBe(2);
  });
});

// =============================================================================
// 3. POST /api/integrations/[connectorId]/sync — Trigger Sync
// =============================================================================

describe("POST /api/integrations/[connectorId]/sync — trigger sync", () => {
  it("executes full sync flow: vault -> dispatcher -> persist -> response", async () => {
    // Setup: handler registered, vault has credentials, connection active
    mockHasSyncHandler.mockReturnValue(true);
    mockVaultInstance.getCredential.mockResolvedValue({
      access_token: "tok-abc-123",
      refresh_token: "ref-xyz",
    });

    // Admin queries for connection and sync log
    const connectionChain = makeChainMock({
      data: { id: "conn-sync-1", status: "active", config: {} },
      error: null,
    });
    const syncLogInsertChain = makeChainMock({
      data: { id: "synclog-1" },
      error: null,
    });
    const upsertChain = makeChainMock({
      data: [{ id: "rec-1" }, { id: "rec-2" }],
      error: null,
    });
    const syncLogUpdateChain = makeChainMock({ data: null, error: null });
    const connUpdateChain = makeChainMock({ data: null, error: null });

    let connCalls = 0;
    let syncLogCalls = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "integration_connections") {
        connCalls++;
        return connCalls === 1 ? connectionChain : connUpdateChain;
      }
      if (table === "integration_sync_log") {
        syncLogCalls++;
        return syncLogCalls === 1 ? syncLogInsertChain : syncLogUpdateChain;
      }
      if (table === "crm_records") return upsertChain;
      return makeChainMock({ data: null, error: null });
    });

    // Dispatcher returns 2 items
    mockExecuteSyncForConnector.mockResolvedValue({
      itemCount: 2,
      items: [
        {
          external_id: "ext-1",
          source: "hubspot",
          entity_type: "contact",
          data: { id: "ext-1", name: "Alice" },
          mapped_fields: { first_name: "Alice" },
        },
        {
          external_id: "ext-2",
          source: "hubspot",
          entity_type: "deal",
          data: { id: "ext-2", name: "Deal A" },
        },
      ],
    });

    const { POST } = await import(
      "@/app/api/integrations/[connectorId]/sync/route"
    );
    const req = makeRequest("POST", "/api/integrations/hubspot/sync");
    const res = await POST(req, {
      params: Promise.resolve({ connectorId: "hubspot" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.itemCount).toBe(2);
    expect(body.itemsStored).toBe(2);
    expect(body.itemsFailed).toBe(0);
    expect(body.itemsMapped).toBe(1); // only first item has mapped_fields
    expect(body.durationMs).toBeGreaterThanOrEqual(0);

    // Verify dispatcher was called with correct token
    expect(mockExecuteSyncForConnector).toHaveBeenCalledWith(
      "hubspot",
      "tok-abc-123",
      expect.objectContaining({
        fetchLimit: 200,
      })
    );
  });

  it("returns 400 when connector has no sync handler", async () => {
    mockHasSyncHandler.mockReturnValue(false);
    mockListSyncHandlers.mockReturnValue(["hubspot", "stripe"]);

    const { POST } = await import(
      "@/app/api/integrations/[connectorId]/sync/route"
    );
    const req = makeRequest("POST", "/api/integrations/unknown-crm/sync");
    const res = await POST(req, {
      params: Promise.resolve({ connectorId: "unknown-crm" }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("unknown-crm");
    expect(body.error).toContain("hubspot");
  });

  it("returns 500 when vault is not configured", async () => {
    mockHasSyncHandler.mockReturnValue(true);
    const { getVaultOrNull } = await import("@/lib/credential-vault");
    vi.mocked(getVaultOrNull).mockReturnValueOnce(null);

    const { POST } = await import(
      "@/app/api/integrations/[connectorId]/sync/route"
    );
    const req = makeRequest("POST", "/api/integrations/hubspot/sync");
    const res = await POST(req, {
      params: Promise.resolve({ connectorId: "hubspot" }),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain("vault");
  });

  it("returns 401 when credentials not found in vault", async () => {
    mockHasSyncHandler.mockReturnValue(true);
    mockVaultInstance.getCredential.mockResolvedValue(null);

    const { POST } = await import(
      "@/app/api/integrations/[connectorId]/sync/route"
    );
    const req = makeRequest("POST", "/api/integrations/hubspot/sync");
    const res = await POST(req, {
      params: Promise.resolve({ connectorId: "hubspot" }),
    });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toContain("Credenziali");
  });

  it("returns 404 when connection not found or inactive", async () => {
    mockHasSyncHandler.mockReturnValue(true);
    mockVaultInstance.getCredential.mockResolvedValue({
      access_token: "tok",
    });

    mockAdminFrom.mockImplementation(() =>
      makeChainMock({ data: null, error: null })
    );

    const { POST } = await import(
      "@/app/api/integrations/[connectorId]/sync/route"
    );
    const req = makeRequest("POST", "/api/integrations/hubspot/sync");
    const res = await POST(req, {
      params: Promise.resolve({ connectorId: "hubspot" }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toContain("non trovata");
  });

  it("returns 502 when dispatcher reports a fetch error", async () => {
    mockHasSyncHandler.mockReturnValue(true);
    mockVaultInstance.getCredential.mockResolvedValue({
      access_token: "tok",
    });

    const connectionChain = makeChainMock({
      data: { id: "conn-err", status: "active", config: {} },
      error: null,
    });
    const syncLogChain = makeChainMock({
      data: { id: "log-err" },
      error: null,
    });
    const updateChain = makeChainMock({ data: null, error: null });

    let connCalls = 0;
    let syncLogCalls = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "integration_connections") {
        connCalls++;
        return connCalls === 1 ? connectionChain : updateChain;
      }
      if (table === "integration_sync_log") {
        syncLogCalls++;
        return syncLogCalls === 1 ? syncLogChain : updateChain;
      }
      return makeChainMock({ data: null, error: null });
    });

    mockExecuteSyncForConnector.mockResolvedValue({
      itemCount: 0,
      items: [],
      error: "HubSpot API returned 403 Forbidden",
    });

    const { POST } = await import(
      "@/app/api/integrations/[connectorId]/sync/route"
    );
    const req = makeRequest("POST", "/api/integrations/hubspot/sync");
    const res = await POST(req, {
      params: Promise.resolve({ connectorId: "hubspot" }),
    });
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.error).toContain("403");
  });
});

// =============================================================================
// 4. GET /api/integrations/dashboard — Dashboard Data
// =============================================================================

describe("GET /api/integrations/dashboard — dashboard data", () => {
  it("returns integrations, errors, and syncHistory for authenticated user", async () => {
    // Active connections
    const connectionsChain = makeChainMock({
      data: [
        {
          id: "conn-d1",
          connector_type: "stripe",
          status: "active",
          last_sync_at: "2026-03-15T10:00:00Z",
          last_sync_items: 50,
          sync_frequency: "daily",
          config: { selectedEntities: ["payments", "invoices"] },
          created_at: "2026-03-01T00:00:00Z",
        },
        {
          id: "conn-d2",
          connector_type: "hubspot",
          status: "error",
          last_sync_at: "2026-03-14T08:00:00Z",
          last_sync_items: 0,
          sync_frequency: "hourly",
          config: { selectedEntities: ["contacts"] },
          created_at: "2026-03-02T00:00:00Z",
        },
      ],
      error: null,
    });

    // All sync logs (last 7 days) — includes error and success entries
    const allSyncLogsChain = makeChainMock({
      data: [
        {
          connection_id: "conn-d2",
          status: "error",
          started_at: "2026-03-14T08:00:00Z",
          completed_at: "2026-03-14T08:01:00Z",
          items_processed: 0,
          items_failed: 5,
          error_details: { message: "OAuth token expired" },
        },
        {
          connection_id: "conn-d1",
          status: "success",
          started_at: "2026-03-15T10:00:00Z",
          completed_at: "2026-03-15T10:02:00Z",
          items_processed: 50,
          items_failed: 0,
          error_details: null,
        },
      ],
      error: null,
    });

    let serverCallCount = 0;
    mockServerFrom.mockImplementation(() => {
      serverCallCount++;
      return serverCallCount === 1 ? connectionsChain : allSyncLogsChain;
    });

    const { GET } = await import(
      "@/app/api/integrations/dashboard/route"
    );
    const req = makeRequest("GET", "/api/integrations/dashboard");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.integrations).toHaveLength(2);
    expect(body.errors).toHaveLength(1);
    expect(body.syncHistory).toBeDefined();
    expect(Array.isArray(body.syncHistory)).toBe(true);
    // syncHistory has 7 entries (one per day)
    expect(body.syncHistory).toHaveLength(7);

    // Stripe should be synced
    const stripe = body.integrations.find((i: any) => i.id === "stripe");
    expect(stripe).toBeDefined();
    expect(stripe.status).toBe("synced");
    expect(stripe.recordCount).toBe(50);
    expect(stripe.entities).toHaveLength(2);
    expect(stripe.nextSync).toBeDefined(); // calculated from last_sync + frequency

    // HubSpot should be error
    const hubspot = body.integrations.find((i: any) => i.id === "hubspot");
    expect(hubspot).toBeDefined();
    expect(hubspot.status).toBe("error");
    expect(hubspot.error).toBe("OAuth token expired");

    // Error log entry
    expect(body.errors[0].connector).toBe("HubSpot");
    expect(body.errors[0].message).toBe("OAuth token expired");
  });

  it("returns empty arrays when user has no connections", async () => {
    mockServerFrom.mockReturnValue(
      makeChainMock({ data: [], error: null })
    );

    const { GET } = await import(
      "@/app/api/integrations/dashboard/route"
    );
    const req = makeRequest("GET", "/api/integrations/dashboard");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.integrations).toEqual([]);
    expect(body.errors).toEqual([]);
    expect(body.syncHistory).toEqual([]);
  });

  it("returns 500 on DB error", async () => {
    mockServerFrom.mockReturnValue(
      makeChainMock({
        data: null,
        error: { message: "Connection refused" },
      })
    );

    const { GET } = await import(
      "@/app/api/integrations/dashboard/route"
    );
    const req = makeRequest("GET", "/api/integrations/dashboard");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain("Errore");
  });
});

// =============================================================================
// 5-7. /api/integrations/credentials — CRUD
// =============================================================================

describe("/api/integrations/credentials — CRUD", () => {
  describe("POST — store credential", () => {
    it("stores a credential and returns vault ID", async () => {
      mockVaultInstance.storeCredential.mockResolvedValue("vault-uuid-001");

      const { POST } = await import(
        "@/app/api/integrations/credentials/route"
      );
      const req = makeRequest("POST", "/api/integrations/credentials", {
        connectorSource: "hubspot",
        credentialType: "oauth2_token",
        data: { access_token: "tok-abc", refresh_token: "ref-xyz" },
        metadata: { label: "My HubSpot" },
      });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.id).toBe("vault-uuid-001");
      expect(body.connectorSource).toBe("hubspot");
      expect(body.credentialType).toBe("oauth2_token");
    });

    it("returns 400 when required fields are missing", async () => {
      const { POST } = await import(
        "@/app/api/integrations/credentials/route"
      );
      const req = makeRequest("POST", "/api/integrations/credentials", {
        connectorSource: "hubspot",
        // missing credentialType and data
      });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toContain("obbligatori");
    });

    it("returns 400 for invalid credential type", async () => {
      const { POST } = await import(
        "@/app/api/integrations/credentials/route"
      );
      const req = makeRequest("POST", "/api/integrations/credentials", {
        connectorSource: "hubspot",
        credentialType: "invalid_type",
        data: { key: "val" },
      });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toContain("credentialType");
    });

    it("returns 400 for invalid connector source format", async () => {
      const { POST } = await import(
        "@/app/api/integrations/credentials/route"
      );
      const req = makeRequest("POST", "/api/integrations/credentials", {
        connectorSource: "invalid source with spaces!!!",
        credentialType: "api_key",
        data: { key: "val" },
      });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toContain("connectorSource");
    });
  });

  describe("GET — list credentials", () => {
    it("returns credential metadata (no secrets)", async () => {
      mockVaultInstance.listForUser.mockResolvedValue([
        {
          id: "vault-1",
          connectorSource: "hubspot",
          credentialType: "oauth2_token",
          metadata: { label: "HubSpot Prod" },
          expiresAt: "2026-12-31T00:00:00Z",
          lastUsedAt: "2026-03-15T10:00:00Z",
          lastRefreshedAt: null,
          createdAt: "2026-03-01T00:00:00Z",
          updatedAt: "2026-03-15T10:00:00Z",
        },
      ]);

      const { GET } = await import(
        "@/app/api/integrations/credentials/route"
      );
      const req = makeRequest("GET", "/api/integrations/credentials");
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.credentials).toHaveLength(1);
      expect(body.count).toBe(1);
      expect(body.credentials[0].connectorSource).toBe("hubspot");
      // No secrets should be present
      expect(body.credentials[0]).not.toHaveProperty("access_token");
      expect(body.credentials[0]).not.toHaveProperty("data");
    });
  });

  describe("DELETE — revoke credential", () => {
    it("revokes a credential and returns success", async () => {
      mockVaultInstance.revokeCredential.mockResolvedValue(true);

      const { DELETE } = await import(
        "@/app/api/integrations/credentials/route"
      );
      const req = makeRequest(
        "DELETE",
        "/api/integrations/credentials?connectorSource=hubspot&credentialType=oauth2_token"
      );
      const res = await DELETE(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.connectorSource).toBe("hubspot");
      expect(body.message).toContain("revocata");
    });

    it("returns 404 when credential not found", async () => {
      mockVaultInstance.revokeCredential.mockResolvedValue(false);

      const { DELETE } = await import(
        "@/app/api/integrations/credentials/route"
      );
      const req = makeRequest(
        "DELETE",
        "/api/integrations/credentials?connectorSource=hubspot&credentialType=oauth2_token"
      );
      const res = await DELETE(req);
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.error).toContain("non trovata");
    });

    it("returns 400 when query params are missing", async () => {
      const { DELETE } = await import(
        "@/app/api/integrations/credentials/route"
      );
      const req = makeRequest(
        "DELETE",
        "/api/integrations/credentials"
      );
      const res = await DELETE(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toContain("obbligatori");
    });
  });
});

// =============================================================================
// 8-10. /api/integrations — Root CRUD
// =============================================================================

describe("/api/integrations — root CRUD", () => {
  describe("GET — list user connections", () => {
    it("returns connections with summary stats", async () => {
      const chain = makeChainMock({
        data: [
          {
            id: "conn-r1",
            connector_type: "stripe",
            status: "active",
            last_sync_at: "2026-03-15T10:00:00Z",
            last_sync_items: 100,
            sync_frequency: "daily",
            created_at: "2026-03-01T00:00:00Z",
          },
          {
            id: "conn-r2",
            connector_type: "hubspot",
            status: "error",
            last_sync_at: null,
            last_sync_items: 0,
            sync_frequency: "hourly",
            created_at: "2026-03-02T00:00:00Z",
          },
        ],
        error: null,
      });
      mockServerFrom.mockReturnValue(chain);

      const { GET } = await import("@/app/api/integrations/route");
      const req = makeRequest("GET", "/api/integrations");
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.connections).toHaveLength(2);
      expect(body.summary.totalActive).toBe(1);
      expect(body.summary.totalItems).toBe(100);
      expect(body.summary.errorCount).toBe(1);
      expect(body.summary.totalConnections).toBe(2);

      // Connector name resolution
      expect(body.connections[0].connectorName).toBe("Stripe");
      expect(body.connections[1].connectorName).toBe("HubSpot");
    });
  });

  describe("POST — create new connection", () => {
    it("creates a new connection and returns it", async () => {
      // No existing connection
      const checkChain = makeChainMock({ data: null, error: null });
      // Insert returns new row
      const insertChain = makeChainMock({
        data: {
          id: "conn-new-1",
          connector_type: "salesforce",
          status: "active",
          last_sync_at: null,
          last_sync_items: 0,
          sync_frequency: "daily",
          created_at: "2026-03-17T00:00:00Z",
        },
        error: null,
      });

      let callCount = 0;
      mockAdminFrom.mockImplementation(() => {
        callCount++;
        return callCount === 1 ? checkChain : insertChain;
      });

      const { POST } = await import("@/app/api/integrations/route");
      const req = makeRequest("POST", "/api/integrations", {
        connectorId: "salesforce",
        frequency: "daily",
        selectedEntities: ["accounts", "contacts"],
      });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.connection.connectorId).toBe("salesforce");
      expect(body.connection.connectorName).toBe("Salesforce");
      expect(body.connection.status).toBe("active");
      expect(body.message).toContain("successo");
    });

    it("returns 409 when connection already exists", async () => {
      mockAdminFrom.mockReturnValue(
        makeChainMock({
          data: { id: "conn-duplicate" },
          error: null,
        })
      );

      const { POST } = await import("@/app/api/integrations/route");
      const req = makeRequest("POST", "/api/integrations", {
        connectorId: "hubspot",
      });
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error).toContain("gia configurato");
    });

    it("returns 400 when connectorId is missing", async () => {
      const { POST } = await import("@/app/api/integrations/route");
      const req = makeRequest("POST", "/api/integrations", {});
      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toContain("connectorId");
    });
  });

  describe("DELETE — disconnect connector", () => {
    it("soft-deletes connection and revokes vault credential", async () => {
      // Update returns the disconnected row
      const updateChain = makeChainMock({
        data: { id: "conn-del-1", connector_type: "hubspot" },
        error: null,
      });
      mockAdminFrom.mockReturnValue(updateChain);
      mockVaultInstance.revokeCredential.mockResolvedValue(true);

      const { DELETE } = await import("@/app/api/integrations/route");
      const req = makeRequest(
        "DELETE",
        "/api/integrations?connectorId=hubspot"
      );
      const res = await DELETE(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.connectorId).toBe("hubspot");
      expect(body.connectorName).toBe("HubSpot");
      expect(body.message).toContain("rimossa");

      // Vault revoke should have been called
      expect(mockVaultInstance.revokeCredential).toHaveBeenCalledWith(
        MOCK_USER_ID,
        "hubspot",
        "oauth2_token"
      );
    });

    it("returns 404 when connection does not exist", async () => {
      mockAdminFrom.mockReturnValue(
        makeChainMock({ data: null, error: null })
      );

      const { DELETE } = await import("@/app/api/integrations/route");
      const req = makeRequest(
        "DELETE",
        "/api/integrations?connectorId=nonexistent"
      );
      const res = await DELETE(req);
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.error).toContain("non trovato");
    });

    it("returns 400 when connectorId param is missing", async () => {
      const { DELETE } = await import("@/app/api/integrations/route");
      const req = makeRequest("DELETE", "/api/integrations");
      const res = await DELETE(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toContain("obbligatorio");
    });
  });
});

// =============================================================================
// Dashboard POST actions (pause, resume, sync, disconnect)
// =============================================================================

describe("POST /api/integrations/dashboard — actions", () => {
  it("pauses a connection", async () => {
    // Find connection
    const findChain = makeChainMock({
      data: { id: "conn-act-1", status: "active" },
      error: null,
    });
    // Update to paused
    const updateChain = makeChainMock({ data: null, error: null });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? findChain : updateChain;
    });

    const { POST } = await import(
      "@/app/api/integrations/dashboard/route"
    );
    const req = makeRequest("POST", "/api/integrations/dashboard", {
      action: "pause",
      connectorId: "stripe",
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.status).toBe("paused");
  });

  it("resumes a paused connection", async () => {
    const findChain = makeChainMock({
      data: { id: "conn-act-2", status: "paused" },
      error: null,
    });
    const updateChain = makeChainMock({ data: null, error: null });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? findChain : updateChain;
    });

    const { POST } = await import(
      "@/app/api/integrations/dashboard/route"
    );
    const req = makeRequest("POST", "/api/integrations/dashboard", {
      action: "resume",
      connectorId: "stripe",
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.status).toBe("active");
  });

  it("disconnects a connection", async () => {
    const findChain = makeChainMock({
      data: { id: "conn-act-3", status: "active" },
      error: null,
    });
    const updateChain = makeChainMock({ data: null, error: null });

    let callCount = 0;
    mockAdminFrom.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? findChain : updateChain;
    });

    const { POST } = await import(
      "@/app/api/integrations/dashboard/route"
    );
    const req = makeRequest("POST", "/api/integrations/dashboard", {
      action: "disconnect",
      connectorId: "stripe",
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.status).toBe("disconnected");
  });

  it("returns 400 for invalid JSON body", async () => {
    const { POST } = await import(
      "@/app/api/integrations/dashboard/route"
    );
    const req = new NextRequest(
      new URL("/api/integrations/dashboard", "https://controlla.me"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://controlla.me",
        },
        body: "not-json",
      }
    );
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("JSON");
  });

  it("returns 400 when action or connectorId is missing", async () => {
    const { POST } = await import(
      "@/app/api/integrations/dashboard/route"
    );
    const req = makeRequest("POST", "/api/integrations/dashboard", {
      action: "pause",
      // connectorId missing
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("obbligatori");
  });

  it("returns 404 when connection not found", async () => {
    mockAdminFrom.mockReturnValue(
      makeChainMock({ data: null, error: null })
    );

    const { POST } = await import(
      "@/app/api/integrations/dashboard/route"
    );
    const req = makeRequest("POST", "/api/integrations/dashboard", {
      action: "pause",
      connectorId: "ghost-connector",
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toContain("non trovata");
  });

  it("returns 400 for unrecognized action", async () => {
    const findChain = makeChainMock({
      data: { id: "conn-x", status: "active" },
      error: null,
    });
    mockAdminFrom.mockReturnValue(findChain);

    const { POST } = await import(
      "@/app/api/integrations/dashboard/route"
    );
    const req = makeRequest("POST", "/api/integrations/dashboard", {
      action: "explode",
      connectorId: "stripe",
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("non riconosciuta");
  });
});
