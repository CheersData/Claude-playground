/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests: Sync Dispatcher — Dynamic dispatch for integration sync route.
 *
 * Covers:
 * - registerSyncHandler / hasSyncHandler / listSyncHandlers (registry CRUD)
 * - executeSyncForConnector with mock connector (happy path)
 * - executeSyncForConnector with unknown connector (error path)
 * - executeSyncForConnector with fetch failure (error path)
 * - executeSyncForConnector with custom transformer
 * - executeSyncForConnector with skipMapping option
 * - executeSyncForConnector with connectionConfig merge
 * - Default transformer fallback logic
 * - Built-in registrations (google-drive, hubspot, salesforce, fatture-in-cloud, stripe)
 *
 * NOTE: The sync-dispatcher module registers 5 built-in handlers at import time.
 * These tests work WITH those defaults and add test-specific handlers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock external dependencies BEFORE importing the module ───

// Mock integration-sources to provide controlled DataSource configs
vi.mock("@/scripts/integration-sources", () => ({
  getIntegrationSourcesByConnector: vi.fn().mockReturnValue([]),
}));

// Mock the FieldMapper to avoid loading real mapping rules/Supabase.
// Use a class so `new FieldMapper()` works correctly in the module under test.
const mockMapFieldsFn = vi.fn().mockResolvedValue({
  fields: { normalized_name: "Test" },
  confidence: 0.95,
});

vi.mock("@/lib/staff/data-connector/mapping", () => {
  return {
    FieldMapper: class MockFieldMapper {
      mapFields = mockMapFieldsFn;
    },
  };
});

// Mock connectors used by built-in registrations (require() calls)
vi.mock("@/lib/staff/data-connector/connectors/hubspot", () => ({
  HubSpotConnector: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    fetchAll: vi.fn().mockResolvedValue({ sourceId: "hs", items: [], fetchedAt: "", metadata: {} }),
    fetchDelta: vi.fn(),
  })),
}));

vi.mock("@/lib/staff/data-connector/connectors/salesforce", () => ({
  SalesforceConnector: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    fetchAll: vi.fn().mockResolvedValue({ sourceId: "sf", items: [], fetchedAt: "", metadata: {} }),
    fetchDelta: vi.fn(),
  })),
}));

vi.mock("@/lib/staff/data-connector/connectors/stripe", () => ({
  StripeConnector: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    fetchAll: vi.fn().mockResolvedValue({ sourceId: "str", items: [], fetchedAt: "", metadata: {} }),
    fetchDelta: vi.fn(),
  })),
}));

// Mock Supabase admin client for persistSyncItems / executeFullSync tests
const mockUpsert = vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [{ id: "1" }], error: null }) });
const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
const mockFrom = vi.fn().mockReturnValue({
  upsert: mockUpsert,
  update: mockUpdate,
});
const mockAdmin = { from: mockFrom } as any;

// Mock embeddings (for indexer)
vi.mock("@/lib/embeddings", () => ({
  isVectorDBEnabled: vi.fn().mockReturnValue(false),
  generateEmbeddings: vi.fn().mockResolvedValue(null),
  generateEmbedding: vi.fn().mockResolvedValue(null),
  truncateForEmbedding: vi.fn((t: string) => t),
}));

// Mock supabase admin (for sync-indexer)
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue(mockAdmin),
}));

// Mock extract-text
vi.mock("@/lib/extract-text", () => ({
  extractText: vi.fn().mockResolvedValue("Testo estratto dal documento di prova con contenuto sufficiente."),
}));

// Mock orchestrator
vi.mock("@/lib/agents/orchestrator", () => ({
  runOrchestrator: vi.fn().mockImplementation(async (_text: string, callbacks: any) => {
    callbacks.onProgress("classifier", "running");
    callbacks.onProgress("classifier", "done", {});
    callbacks.onComplete({ fairnessScore: 7.5 });
    return {
      sessionId: "mock-session-123",
      classification: { documentType: "contract" },
      analysis: { overallRisk: "medium", clauses: [] },
      investigation: { findings: [] },
      advice: { fairnessScore: 7.5, risks: [], actions: [] },
    };
  }),
}));

import {
  registerSyncHandler,
  hasSyncHandler,
  listSyncHandlers,
  executeSyncForConnector,
  executeFullSync,
  persistSyncItems,
} from "@/lib/staff/data-connector/sync-dispatcher";
import type { SyncItem } from "@/lib/staff/data-connector/sync-dispatcher";
import { getIntegrationSourcesByConnector } from "@/scripts/integration-sources";
import type { DataSource } from "@/lib/staff/data-connector/types";

// ─── Helpers ───

function makeDataSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: "test-source",
    name: "Test Source",
    shortName: "test",
    dataType: "crm-records",
    vertical: "business",
    connector: "test-sync-connector",
    config: { foo: "bar" },
    lifecycle: "planned",
    estimatedItems: 100,
    ...overrides,
  } as DataSource;
}

const silentLog = () => {};

// =============================================================================
// Registry: registerSyncHandler / hasSyncHandler / listSyncHandlers
// =============================================================================

describe("Sync Registry — registerSyncHandler / hasSyncHandler / listSyncHandlers", () => {
  it("registers a sync handler and confirms it exists", () => {
    registerSyncHandler("test-registry-a", (_s, _t, _l) => ({
      connect: async () => ({ sourceId: "", ok: true, message: "", census: { estimatedItems: 0, availableFormats: [], sampleFields: [] } }),
      fetchAll: async () => ({ sourceId: "", items: [], fetchedAt: "", metadata: {} }),
      fetchDelta: async () => ({ sourceId: "", items: [], fetchedAt: "", metadata: {} }),
    }));

    expect(hasSyncHandler("test-registry-a")).toBe(true);
  });

  it("returns false for unregistered connector", () => {
    expect(hasSyncHandler("nonexistent-connector-xyz-999")).toBe(false);
  });

  it("lists all registered handler IDs", () => {
    const handlers = listSyncHandlers();

    expect(Array.isArray(handlers)).toBe(true);
    // Should include test handler we just registered
    expect(handlers).toContain("test-registry-a");
  });

  it("registers handler with custom transformer", () => {
    const customTransformer = (record: Record<string, unknown>) => ({
      externalId: String(record.customId ?? ""),
      entityType: "custom-entity",
    });

    registerSyncHandler(
      "test-registry-b",
      (_s, _t, _l) => ({
        connect: async () => ({ sourceId: "", ok: true, message: "", census: { estimatedItems: 0, availableFormats: [], sampleFields: [] } }),
        fetchAll: async () => ({ sourceId: "", items: [], fetchedAt: "", metadata: {} }),
        fetchDelta: async () => ({ sourceId: "", items: [], fetchedAt: "", metadata: {} }),
      }),
      customTransformer
    );

    expect(hasSyncHandler("test-registry-b")).toBe(true);
  });
});

// =============================================================================
// Built-in Registrations
// =============================================================================

describe("Built-in sync handler registrations", () => {
  it("registers google-drive at import time", () => {
    expect(hasSyncHandler("google-drive")).toBe(true);
  });

  it("registers hubspot at import time", () => {
    expect(hasSyncHandler("hubspot")).toBe(true);
  });

  it("registers salesforce at import time", () => {
    expect(hasSyncHandler("salesforce")).toBe(true);
  });

  it("registers fatture-in-cloud at import time", () => {
    expect(hasSyncHandler("fatture-in-cloud")).toBe(true);
  });

  it("registers stripe at import time", () => {
    expect(hasSyncHandler("stripe")).toBe(true);
  });

  it("lists all 5 built-in handlers", () => {
    const handlers = listSyncHandlers();

    for (const id of ["google-drive", "hubspot", "salesforce", "fatture-in-cloud", "stripe"]) {
      expect(handlers).toContain(id);
    }
  });
});

// =============================================================================
// executeSyncForConnector — Happy paths
// =============================================================================

describe("executeSyncForConnector — happy paths", () => {
  const mockSource = makeDataSource({ connector: "test-exec-happy" });

  beforeEach(() => {
    vi.mocked(getIntegrationSourcesByConnector).mockReset();
  });

  it("returns items from a registered connector", async () => {
    // Register a test handler that returns 2 mock records
    registerSyncHandler("test-exec-happy", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id,
        ok: true,
        message: "OK",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => ({
        sourceId: source.id,
        items: [
          { id: "rec-1", name: "Record One", objectType: "contact" },
          { id: "rec-2", name: "Record Two", objectType: "deal" },
        ],
        fetchedAt: new Date().toISOString(),
        metadata: {},
      }),
      fetchDelta: async () => ({
        sourceId: source.id,
        items: [],
        fetchedAt: new Date().toISOString(),
        metadata: {},
      }),
    }));

    // Mock integration-sources to return the test source
    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([mockSource]);

    const result = await executeSyncForConnector("test-exec-happy", "fake-token", {
      log: silentLog,
    });

    expect(result.error).toBeUndefined();
    expect(result.itemCount).toBe(2);
    expect(result.items).toHaveLength(2);

    // Check first item structure
    expect(result.items[0]).toMatchObject({
      external_id: "rec-1",
      source: "test-exec-happy",
      entity_type: "contact",
      data: { id: "rec-1", name: "Record One", objectType: "contact" },
    });

    // Second item
    expect(result.items[1]).toMatchObject({
      external_id: "rec-2",
      source: "test-exec-happy",
      entity_type: "deal",
    });
  });

  it("applies field mapping by default", async () => {
    registerSyncHandler("test-exec-mapping", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => ({
        sourceId: source.id,
        items: [{ id: "m-1", name: "Mapped" }],
        fetchedAt: "", metadata: {},
      }),
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-exec-mapping" }),
    ]);

    const result = await executeSyncForConnector("test-exec-mapping", "tok", {
      log: silentLog,
    });

    expect(result.itemCount).toBe(1);
    // FieldMapper mock returns mapped_fields
    expect(result.items[0].mapped_fields).toEqual({ normalized_name: "Test" });
    expect(result.items[0].mapping_confidence).toBe(0.95);
  });

  it("skips mapping when skipMapping is true", async () => {
    registerSyncHandler("test-exec-skip-map", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => ({
        sourceId: source.id,
        items: [{ id: "s-1" }],
        fetchedAt: "", metadata: {},
      }),
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-exec-skip-map" }),
    ]);

    const result = await executeSyncForConnector("test-exec-skip-map", "tok", {
      skipMapping: true,
      log: silentLog,
    });

    expect(result.itemCount).toBe(1);
    expect(result.items[0].mapped_fields).toBeUndefined();
    expect(result.items[0].mapping_confidence).toBeUndefined();
  });

  it("merges connectionConfig into DataSource.config", async () => {
    let capturedConfig: Record<string, unknown> | undefined;

    registerSyncHandler("test-exec-connconfig", (source, _token, _log) => {
      capturedConfig = source.config;
      return {
        connect: async () => ({
          sourceId: source.id, ok: true, message: "",
          census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
        }),
        fetchAll: async () => ({
          sourceId: source.id,
          items: [],
          fetchedAt: "", metadata: {},
        }),
        fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
      };
    });

    const templateSource = makeDataSource({
      connector: "test-exec-connconfig",
      config: { baseUrl: "https://api.example.com", defaultLimit: 50 },
    });
    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([templateSource]);

    await executeSyncForConnector("test-exec-connconfig", "tok", {
      connectionConfig: { companyId: "12345", region: "EU" },
      log: silentLog,
    });

    // Connection config should be merged into source.config
    expect(capturedConfig).toMatchObject({
      baseUrl: "https://api.example.com",
      defaultLimit: 50,
      companyId: "12345",
      region: "EU",
    });
  });

  it("passes fetchLimit to connector.fetchAll", async () => {
    let capturedLimit: number | undefined;

    registerSyncHandler("test-exec-limit", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async (options) => {
        capturedLimit = options?.limit;
        return { sourceId: source.id, items: [], fetchedAt: "", metadata: {} };
      },
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-exec-limit" }),
    ]);

    await executeSyncForConnector("test-exec-limit", "tok", {
      fetchLimit: 42,
      log: silentLog,
    });

    expect(capturedLimit).toBe(42);
  });

  it("defaults fetchLimit to 200", async () => {
    let capturedLimit: number | undefined;

    registerSyncHandler("test-exec-default-limit", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async (options) => {
        capturedLimit = options?.limit;
        return { sourceId: source.id, items: [], fetchedAt: "", metadata: {} };
      },
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-exec-default-limit" }),
    ]);

    await executeSyncForConnector("test-exec-default-limit", "tok", {
      log: silentLog,
    });

    expect(capturedLimit).toBe(200);
  });
});

// =============================================================================
// executeSyncForConnector — Custom transformer
// =============================================================================

describe("executeSyncForConnector — custom transformer", () => {
  beforeEach(() => {
    vi.mocked(getIntegrationSourcesByConnector).mockReset();
  });

  it("uses a custom transformer to extract externalId and entityType", async () => {
    registerSyncHandler(
      "test-exec-custom-tx",
      (source, _token, _log) => ({
        connect: async () => ({
          sourceId: source.id, ok: true, message: "",
          census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
        }),
        fetchAll: async () => ({
          sourceId: source.id,
          items: [{ myCustomId: "CX-42", myType: "invoice" }],
          fetchedAt: "", metadata: {},
        }),
        fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
      }),
      // Custom transformer
      (record) => ({
        externalId: String(record.myCustomId ?? ""),
        entityType: String(record.myType ?? "unknown"),
      })
    );

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-exec-custom-tx" }),
    ]);

    const result = await executeSyncForConnector("test-exec-custom-tx", "tok", {
      skipMapping: true,
      log: silentLog,
    });

    expect(result.items[0].external_id).toBe("CX-42");
    expect(result.items[0].entity_type).toBe("invoice");
  });
});

// =============================================================================
// executeSyncForConnector — Error paths
// =============================================================================

describe("executeSyncForConnector — error paths", () => {
  beforeEach(() => {
    vi.mocked(getIntegrationSourcesByConnector).mockReset();
  });

  it("returns error for unknown connector", async () => {
    const result = await executeSyncForConnector("totally-unknown-connector", "tok", {
      log: silentLog,
    });

    expect(result.itemCount).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("totally-unknown-connector");
  });

  it("returns error when no DataSource config found", async () => {
    registerSyncHandler("test-exec-no-source", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    // Return empty array — no DataSource config
    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([]);

    const result = await executeSyncForConnector("test-exec-no-source", "tok", {
      log: silentLog,
    });

    expect(result.itemCount).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.error).toContain("Nessuna configurazione trovata");
    expect(result.error).toContain("test-exec-no-source");
  });

  it("returns error when fetchAll throws", async () => {
    registerSyncHandler("test-exec-fetch-fail", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => {
        throw new Error("Network timeout: connection refused");
      },
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-exec-fetch-fail" }),
    ]);

    const result = await executeSyncForConnector("test-exec-fetch-fail", "tok", {
      log: silentLog,
    });

    expect(result.itemCount).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.error).toContain("Network timeout");
  });

  it("handles non-Error throw in fetchAll", async () => {
    registerSyncHandler("test-exec-throw-string", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => {
        throw "string error";
      },
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-exec-throw-string" }),
    ]);

    const result = await executeSyncForConnector("test-exec-throw-string", "tok", {
      log: silentLog,
    });

    expect(result.itemCount).toBe(0);
    expect(result.error).toBe("string error");
  });

  it("continues sync when mapping fails for individual items", async () => {
    // Override the shared mockMapFieldsFn for this test:
    // first call rejects, second call resolves
    mockMapFieldsFn
      .mockReset()
      .mockRejectedValueOnce(new Error("Mapping crashed"))
      .mockResolvedValueOnce({ fields: { ok: true }, confidence: 0.9 });

    registerSyncHandler("test-exec-map-partial-fail", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => ({
        sourceId: source.id,
        items: [
          { id: "fail-1", name: "Will Fail" },
          { id: "ok-2", name: "Will Succeed" },
        ],
        fetchedAt: "", metadata: {},
      }),
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-exec-map-partial-fail" }),
    ]);

    const result = await executeSyncForConnector("test-exec-map-partial-fail", "tok", {
      log: silentLog,
    });

    // Both items should still be returned, even though mapping failed for the first
    expect(result.itemCount).toBe(2);
    expect(result.error).toBeUndefined();

    // First item: mapping failed — no mapped_fields
    expect(result.items[0].mapped_fields).toBeUndefined();

    // Reset mockMapFieldsFn to default behavior for other tests
    mockMapFieldsFn.mockReset().mockResolvedValue({
      fields: { normalized_name: "Test" },
      confidence: 0.95,
    });
  });
});

// =============================================================================
// Default transformer logic
// =============================================================================

describe("Default transformer behavior", () => {
  beforeEach(() => {
    vi.mocked(getIntegrationSourcesByConnector).mockReset();
  });

  it("extracts externalId from 'id' field", async () => {
    registerSyncHandler("test-default-tx-id", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => ({
        sourceId: source.id,
        items: [{ id: "abc-123" }],
        fetchedAt: "", metadata: {},
      }),
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));
    // No custom transformer — uses default

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-default-tx-id" }),
    ]);

    const result = await executeSyncForConnector("test-default-tx-id", "tok", {
      skipMapping: true,
      log: silentLog,
    });

    expect(result.items[0].external_id).toBe("abc-123");
  });

  it("extracts externalId from 'externalId' field (priority)", async () => {
    registerSyncHandler("test-default-tx-extid", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => ({
        sourceId: source.id,
        items: [{ externalId: "ext-456", id: "fallback-789" }],
        fetchedAt: "", metadata: {},
      }),
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-default-tx-extid" }),
    ]);

    const result = await executeSyncForConnector("test-default-tx-extid", "tok", {
      skipMapping: true,
      log: silentLog,
    });

    // externalId should take priority over id
    expect(result.items[0].external_id).toBe("ext-456");
  });

  it("falls back to connectorId_record when no objectType found", async () => {
    registerSyncHandler("test-default-tx-notype", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => ({
        sourceId: source.id,
        items: [{ id: "no-type-1" }],
        fetchedAt: "", metadata: {},
      }),
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-default-tx-notype" }),
    ]);

    const result = await executeSyncForConnector("test-default-tx-notype", "tok", {
      skipMapping: true,
      log: silentLog,
    });

    // Should fall back to "{connectorId}_record"
    expect(result.items[0].entity_type).toBe("test-default-tx-notype_record");
  });

  it("extracts entityType from 'objectType' field", async () => {
    registerSyncHandler("test-default-tx-objtype", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => ({
        sourceId: source.id,
        items: [{ id: "ot-1", objectType: "customer" }],
        fetchedAt: "", metadata: {},
      }),
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-default-tx-objtype" }),
    ]);

    const result = await executeSyncForConnector("test-default-tx-objtype", "tok", {
      skipMapping: true,
      log: silentLog,
    });

    expect(result.items[0].entity_type).toBe("customer");
  });
});

// =============================================================================
// executeSyncForConnector — passes accessToken to factory
// =============================================================================

describe("executeSyncForConnector — accessToken handling", () => {
  beforeEach(() => {
    vi.mocked(getIntegrationSourcesByConnector).mockReset();
  });

  it("passes the accessToken to the factory function", async () => {
    let receivedToken: string | undefined;

    registerSyncHandler("test-exec-token", (source, accessToken, _log) => {
      receivedToken = accessToken;
      return {
        connect: async () => ({
          sourceId: source.id, ok: true, message: "",
          census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
        }),
        fetchAll: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
        fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
      };
    });

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-exec-token" }),
    ]);

    await executeSyncForConnector("test-exec-token", "my-secret-oauth-token", {
      log: silentLog,
    });

    expect(receivedToken).toBe("my-secret-oauth-token");
  });
});

// =============================================================================
// executeSyncForConnector — empty result
// =============================================================================

describe("executeSyncForConnector — empty result", () => {
  beforeEach(() => {
    vi.mocked(getIntegrationSourcesByConnector).mockReset();
  });

  it("returns zero items when fetchAll returns empty array", async () => {
    registerSyncHandler("test-exec-empty", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => ({
        sourceId: source.id,
        items: [],
        fetchedAt: new Date().toISOString(),
        metadata: {},
      }),
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-exec-empty" }),
    ]);

    const result = await executeSyncForConnector("test-exec-empty", "tok", {
      log: silentLog,
    });

    expect(result.itemCount).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.error).toBeUndefined();
  });
});

// =============================================================================
// persistSyncItems
// =============================================================================

describe("persistSyncItems", () => {
  beforeEach(() => {
    mockFrom.mockClear();
    mockUpsert.mockClear();
    mockUpsert.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: "1" }], error: null }),
    });
  });

  it("returns zero counts for empty items array", async () => {
    const result = await persistSyncItems(mockAdmin, "user-1", "test-connector", []);
    expect(result.stored).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.errors).toEqual([]);
    // Should not call admin.from at all
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("upserts items into crm_records with correct structure", async () => {
    const items: SyncItem[] = [
      {
        external_id: "ext-1",
        source: "test",
        entity_type: "contact",
        data: { name: "Test Contact" },
        mapped_fields: { full_name: "Test Contact" },
      },
    ];

    const selectFn = vi.fn().mockResolvedValue({ data: [{ id: "uuid-1" }], error: null });
    mockUpsert.mockReturnValue({ select: selectFn });
    mockFrom.mockReturnValue({ upsert: mockUpsert });

    const result = await persistSyncItems(mockAdmin, "user-1", "test-connector", items);

    expect(result.stored).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockFrom).toHaveBeenCalledWith("crm_records");

    // Verify upsert was called with correct data shape
    const upsertArgs = mockUpsert.mock.calls[0];
    expect(upsertArgs[0]).toHaveLength(1);
    expect(upsertArgs[0][0]).toMatchObject({
      user_id: "user-1",
      connector_source: "test-connector",
      object_type: "contact",
      external_id: "ext-1",
      data: { name: "Test Contact" },
      mapped_fields: { full_name: "Test Contact" },
    });
    expect(upsertArgs[1]).toMatchObject({
      onConflict: "user_id,connector_source,object_type,external_id",
      ignoreDuplicates: false,
    });
  });

  it("handles batch upsert failure with individual fallback", async () => {
    const items: SyncItem[] = [
      { external_id: "a", source: "t", entity_type: "contact", data: {} },
      { external_id: "b", source: "t", entity_type: "contact", data: {} },
    ];

    let callCount = 0;
    // First call (batch) fails, subsequent individual calls succeed
    mockUpsert.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Batch upsert fails
        return {
          select: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Batch insert error" },
          }),
        };
      }
      // Individual upserts succeed
      return {
        select: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
    mockFrom.mockReturnValue({ upsert: mockUpsert });

    // Need to suppress console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await persistSyncItems(mockAdmin, "user-1", "test", items);

    // Both individual inserts should succeed
    expect(result.stored).toBe(2);
    expect(result.failed).toBe(0);

    consoleSpy.mockRestore();
  });
});

// =============================================================================
// executeFullSync — Happy path (skipAnalysis)
// =============================================================================

describe("executeFullSync — persist-only (skipAnalysis)", () => {
  beforeEach(() => {
    vi.mocked(getIntegrationSourcesByConnector).mockReset();
    mockFrom.mockClear();
    mockUpsert.mockClear();
  });

  it("executes full pipeline: fetch → map → persist → notify", async () => {
    // Register test connector
    registerSyncHandler("test-full-sync", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => ({
        sourceId: source.id,
        items: [
          { id: "fs-1", name: "Record 1", objectType: "contact" },
          { id: "fs-2", name: "Record 2", objectType: "deal" },
        ],
        fetchedAt: "", metadata: {},
      }),
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-full-sync" }),
    ]);

    // Mock successful persist
    const selectFn = vi.fn().mockResolvedValue({ data: [{ id: "1" }, { id: "2" }], error: null });
    mockUpsert.mockReturnValue({ select: selectFn });
    mockFrom.mockReturnValue({ upsert: mockUpsert, update: mockUpdate });

    const events: any[] = [];

    const result = await executeFullSync(
      mockAdmin,
      "user-123",
      "test-full-sync",
      "fake-token",
      {
        skipAnalysis: true,
        log: silentLog,
        onEvent: (event) => events.push(event),
      }
    );

    // Verify result structure
    expect(result.itemsFetched).toBe(2);
    expect(result.itemsMapped).toBeGreaterThanOrEqual(0);
    expect(result.persist.stored).toBeGreaterThan(0);
    expect(result.fetchError).toBeUndefined();
    expect(result.analysisSkipped).toBe(2);
    expect(result.analysisResults).toEqual([]);
    expect(result.notified).toBe(true);
    expect(result.durationMs).toBeGreaterThan(0);

    // Verify stage durations are tracked
    expect(result.stageDurations.fetchMs).toBeGreaterThanOrEqual(0);
    expect(result.stageDurations.persistMs).toBeGreaterThanOrEqual(0);

    // Verify events were emitted
    expect(events.length).toBeGreaterThan(0);
    const stages = events.map((e) => e.stage);
    expect(stages).toContain("fetch");
    expect(stages).toContain("persist");
    expect(stages).toContain("complete");
  });

  it("handles fetch error in full sync pipeline", async () => {
    registerSyncHandler("test-full-sync-err", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => {
        throw new Error("API rate limit exceeded");
      },
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-full-sync-err" }),
    ]);

    const events: any[] = [];

    const result = await executeFullSync(
      mockAdmin,
      "user-123",
      "test-full-sync-err",
      "tok",
      {
        log: silentLog,
        onEvent: (event) => events.push(event),
      }
    );

    expect(result.fetchError).toContain("API rate limit exceeded");
    expect(result.itemsFetched).toBe(0);
    expect(result.persist.stored).toBe(0);

    // Should emit error event
    const errorEvents = events.filter((e) => e.stage === "error");
    expect(errorEvents.length).toBeGreaterThan(0);
  });

  it("passes connectionConfig through to dispatcher", async () => {
    let capturedConfig: Record<string, unknown> | undefined;

    registerSyncHandler("test-full-sync-cfg", (source, _token, _log) => {
      capturedConfig = source.config;
      return {
        connect: async () => ({
          sourceId: source.id, ok: true, message: "",
          census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
        }),
        fetchAll: async () => ({
          sourceId: source.id, items: [], fetchedAt: "", metadata: {},
        }),
        fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
      };
    });

    const templateSource = makeDataSource({
      connector: "test-full-sync-cfg",
      config: { baseUrl: "https://api.test.com" },
    });
    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([templateSource]);
    mockFrom.mockReturnValue({ upsert: mockUpsert, update: mockUpdate });

    await executeFullSync(
      mockAdmin,
      "user-123",
      "test-full-sync-cfg",
      "tok",
      {
        skipAnalysis: true,
        connectionConfig: { companyId: "c-456" },
        log: silentLog,
      }
    );

    expect(capturedConfig).toMatchObject({
      baseUrl: "https://api.test.com",
      companyId: "c-456",
    });
  });
});

// =============================================================================
// executeFullSync — Analysis pipeline
// =============================================================================

describe("executeFullSync — with analysis", () => {
  beforeEach(() => {
    vi.mocked(getIntegrationSourcesByConnector).mockReset();
    mockFrom.mockClear();
    mockUpsert.mockClear();
    mockMapFieldsFn.mockReset().mockResolvedValue({
      fields: { normalized_name: "Test" },
      confidence: 0.95,
    });
  });

  it("analyzes document-type records when skipAnalysis is false", async () => {
    registerSyncHandler("test-full-sync-analyze", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => ({
        sourceId: source.id,
        items: [
          // This is a document record (entity_type = "file", has PDF mimeType)
          {
            id: "doc-1",
            name: "contratto.pdf",
            mimeType: "application/pdf",
            objectType: "file",
            description: "Contratto di locazione abitativa con clausole importanti da verificare per il conduttore.",
          },
          // This is a non-document record (entity_type = "contact")
          {
            id: "contact-1",
            name: "Mario Rossi",
            objectType: "contact",
          },
        ],
        fetchedAt: "", metadata: {},
      }),
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-full-sync-analyze" }),
    ]);

    // Mock successful persist
    const selectFn = vi.fn().mockResolvedValue({ data: [{ id: "1" }, { id: "2" }], error: null });
    mockUpsert.mockReturnValue({ select: selectFn });
    const eqFn = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });
    mockUpdate.mockReturnValue({ eq: eqFn });
    mockFrom.mockReturnValue({ upsert: mockUpsert, update: mockUpdate });

    const result = await executeFullSync(
      mockAdmin,
      "user-123",
      "test-full-sync-analyze",
      "fake-token",
      {
        skipAnalysis: false,
        maxAnalysisRecords: 5,
        log: silentLog,
      }
    );

    // Should have fetched both records
    expect(result.itemsFetched).toBe(2);

    // At least the file record should have been analyzed
    // (the contact record is not a document type)
    expect(result.analysisResults.length).toBeGreaterThanOrEqual(1);

    // The file record should have been analyzed
    const fileAnalysis = result.analysisResults.find((r) => r.externalId === "doc-1");
    if (fileAnalysis) {
      expect(fileAnalysis.analysisId).toBe("mock-session-123");
      expect(fileAnalysis.fairnessScore).toBe(7.5);
    }
  });

  it("respects maxAnalysisRecords cap", async () => {
    registerSyncHandler("test-full-sync-cap", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => ({
        sourceId: source.id,
        items: [
          { id: "d-1", name: "doc1.pdf", mimeType: "application/pdf", objectType: "file", description: "Contenuto documento 1 con testo sufficiente per analisi legale approfondita." },
          { id: "d-2", name: "doc2.pdf", mimeType: "application/pdf", objectType: "file", description: "Contenuto documento 2 con testo sufficiente per analisi legale approfondita." },
          { id: "d-3", name: "doc3.pdf", mimeType: "application/pdf", objectType: "file", description: "Contenuto documento 3 con testo sufficiente per analisi legale approfondita." },
        ],
        fetchedAt: "", metadata: {},
      }),
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-full-sync-cap" }),
    ]);

    const selectFn = vi.fn().mockResolvedValue({ data: [{ id: "1" }], error: null });
    mockUpsert.mockReturnValue({ select: selectFn });
    const eqFn = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });
    mockUpdate.mockReturnValue({ eq: eqFn });
    mockFrom.mockReturnValue({ upsert: mockUpsert, update: mockUpdate });

    const result = await executeFullSync(
      mockAdmin,
      "user-123",
      "test-full-sync-cap",
      "tok",
      {
        skipAnalysis: false,
        maxAnalysisRecords: 2, // Only analyze 2 of 3
        log: silentLog,
      }
    );

    // Should only analyze 2 records
    expect(result.analysisResults.length).toBeLessThanOrEqual(2);
    // The 3rd document should be counted as skipped
    expect(result.analysisSkipped).toBeGreaterThan(0);
  });

  it("allows custom analyzeEntityTypes to override defaults", async () => {
    registerSyncHandler("test-full-sync-custom-types", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => ({
        sourceId: source.id,
        items: [
          // Custom entity type "report" — not in default DOCUMENT_ENTITY_TYPES
          {
            id: "r-1",
            objectType: "report",
            description: "Report di analisi trimestrale con molte clausole contrattuali e disposizioni legali importanti.",
          },
        ],
        fetchedAt: "", metadata: {},
      }),
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-full-sync-custom-types" }),
    ]);

    const selectFn = vi.fn().mockResolvedValue({ data: [{ id: "1" }], error: null });
    mockUpsert.mockReturnValue({ select: selectFn });
    const eqFn = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });
    mockUpdate.mockReturnValue({ eq: eqFn });
    mockFrom.mockReturnValue({ upsert: mockUpsert, update: mockUpdate });

    // With default entity types — should NOT analyze "report"
    const result1 = await executeFullSync(
      mockAdmin, "user-123", "test-full-sync-custom-types", "tok",
      { skipAnalysis: false, log: silentLog }
    );
    expect(result1.analysisResults.length).toBe(0);

    // With custom entity types including "report" — should analyze it
    const result2 = await executeFullSync(
      mockAdmin, "user-123", "test-full-sync-custom-types", "tok",
      { skipAnalysis: false, analyzeEntityTypes: ["report"], log: silentLog }
    );
    expect(result2.analysisResults.length).toBe(1);
    expect(result2.analysisResults[0].externalId).toBe("r-1");
  });
});

// =============================================================================
// executeFullSync — Event notification
// =============================================================================

describe("executeFullSync — event notifications", () => {
  beforeEach(() => {
    vi.mocked(getIntegrationSourcesByConnector).mockReset();
    mockFrom.mockClear();
  });

  it("emits events for each pipeline stage", async () => {
    registerSyncHandler("test-full-sync-events", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => ({
        sourceId: source.id,
        items: [{ id: "ev-1", objectType: "contact" }],
        fetchedAt: "", metadata: {},
      }),
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-full-sync-events" }),
    ]);

    const selectFn = vi.fn().mockResolvedValue({ data: [{ id: "1" }], error: null });
    mockUpsert.mockReturnValue({ select: selectFn });
    mockFrom.mockReturnValue({ upsert: mockUpsert, update: mockUpdate });

    const events: any[] = [];

    await executeFullSync(
      mockAdmin, "user-123", "test-full-sync-events", "tok",
      {
        skipAnalysis: true,
        log: silentLog,
        onEvent: (event) => events.push(event),
      }
    );

    // Verify event stages and structure
    const stageNames = events.map((e) => e.stage);
    expect(stageNames).toContain("fetch");
    expect(stageNames).toContain("map");
    expect(stageNames).toContain("persist");
    expect(stageNames).toContain("complete");

    // All events should have connectorId
    for (const event of events) {
      expect(event.connectorId).toBe("test-full-sync-events");
      expect(typeof event.message).toBe("string");
    }

    // Complete event should have summary data
    const completeEvent = events.find((e) => e.stage === "complete");
    expect(completeEvent).toBeDefined();
    expect(completeEvent.data).toBeDefined();
    expect(completeEvent.data.itemsFetched).toBe(1);
    expect(completeEvent.data.stored).toBeGreaterThanOrEqual(0);
    expect(completeEvent.data.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("works without onEvent callback (no crash)", async () => {
    registerSyncHandler("test-full-sync-no-cb", (source, _token, _log) => ({
      connect: async () => ({
        sourceId: source.id, ok: true, message: "",
        census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
      }),
      fetchAll: async () => ({
        sourceId: source.id,
        items: [],
        fetchedAt: "", metadata: {},
      }),
      fetchDelta: async () => ({ sourceId: source.id, items: [], fetchedAt: "", metadata: {} }),
    }));

    vi.mocked(getIntegrationSourcesByConnector).mockReturnValue([
      makeDataSource({ connector: "test-full-sync-no-cb" }),
    ]);
    mockFrom.mockReturnValue({ upsert: mockUpsert, update: mockUpdate });

    // Should not throw even without onEvent
    const result = await executeFullSync(
      mockAdmin, "user-123", "test-full-sync-no-cb", "tok",
      { skipAnalysis: true, log: silentLog }
    );

    expect(result.notified).toBe(true);
  });
});
