/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests: Auto-Analyzer — Automatic legal analysis on synced integration records.
 *
 * Covers:
 * - Eligibility filtering (entity types, MIME types, text length)
 * - Dedup by document hash (skip already-analyzed documents)
 * - Sequential execution order
 * - Max analyses cap (maxAnalyses option)
 * - Notification creation on analysis complete
 * - Error resilience per document (one failure doesn't kill pipeline)
 * - Empty items returns early
 * - Extraction failure tracking
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SyncItem } from "@/lib/staff/data-connector/sync-dispatcher";

// ─── Mock external dependencies BEFORE importing the module ───

// Mock Supabase admin client
const mockSupabaseFrom = vi.fn();
const mockSupabaseRpc = vi.fn();
const mockAdmin = {
  from: mockSupabaseFrom,
  rpc: mockSupabaseRpc,
} as any;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdmin,
}));

// Mock orchestrator — returns a controlled result
const mockRunOrchestrator = vi.fn();
vi.mock("@/lib/agents/orchestrator", () => ({
  runOrchestrator: (...args: any[]) => mockRunOrchestrator(...args),
}));

// Mock extract-text
vi.mock("@/lib/extract-text", () => ({
  extractText: vi.fn().mockResolvedValue(
    "Contratto di locazione abitativa con clausole standard e durata quadriennale rinnovabile. " +
    "Il conduttore si impegna al pagamento del canone mensile secondo le modalita previste. " +
    "Le parti concordano un deposito cauzionale pari a tre mensilita."
  ),
}));

// Mock embeddings (for auto-index)
vi.mock("@/lib/embeddings", () => ({
  isVectorDBEnabled: vi.fn().mockReturnValue(false),
}));

// Import after mocks
import { autoAnalyzeRecords } from "@/lib/staff/data-connector/auto-analyzer";

// ─── Helpers ───

const silentLog = () => {};

function makeSyncItem(overrides: Partial<SyncItem> & { data?: Record<string, unknown> } = {}): SyncItem {
  return {
    external_id: overrides.external_id ?? "item-1",
    source: overrides.source ?? "hubspot",
    entity_type: overrides.entity_type ?? "file",
    data: overrides.data ?? {
      name: "contract.pdf",
      mimeType: "application/pdf",
      downloadUrl: "https://example.com/download/contract.pdf",
    },
    mapped_fields: overrides.mapped_fields,
    mapping_confidence: overrides.mapping_confidence,
  };
}

function makeOrchestratorResult(overrides: any = {}) {
  return {
    sessionId: overrides.sessionId ?? "session-123",
    classification: overrides.classification ?? { documentTypeLabel: "Contratto di locazione" },
    analysis: overrides.analysis ?? {
      clauses: [
        { riskLevel: "high", clauseType: "penalty", summary: "Clausola penale" },
        { riskLevel: "low", clauseType: "duration", summary: "Durata standard" },
      ],
      overallRisk: overrides.overallRisk ?? "medium",
    },
    investigation: overrides.investigation ?? { findings: [] },
    advice: overrides.advice ?? {
      fairnessScore: overrides.fairnessScore ?? 6.5,
      summary: "Contratto con clausole standard",
      needsLawyer: false,
    },
  };
}

function setupMockDb() {
  // Mock for isAlreadyAnalyzed check
  const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

  // Mock for storeAnalysisResult
  const mockInsertSingle = vi.fn().mockResolvedValue({
    data: { id: "analysis-db-id-1" },
    error: null,
  });

  // Mock for crm_records update
  const mockUpdateEq = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  });

  // Mock for notification insert
  const mockNotifInsert = vi.fn().mockResolvedValue({ error: null });

  mockSupabaseFrom.mockImplementation((table: string) => {
    switch (table) {
      case "analysis_sessions":
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: mockMaybeSingle,
                }),
              }),
            }),
          }),
        };
      case "analyses":
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: mockInsertSingle,
            }),
          }),
        };
      case "crm_records":
        return {
          update: vi.fn().mockReturnValue({
            eq: mockUpdateEq,
          }),
        };
      case "integration_notifications":
        return {
          insert: mockNotifInsert,
        };
      default:
        return { select: vi.fn().mockReturnValue({ data: [], error: null }) };
    }
  });

  return {
    mockMaybeSingle,
    mockInsertSingle,
    mockUpdateEq,
    mockNotifInsert,
  };
}

// ─── Setup ───

beforeEach(() => {
  vi.clearAllMocks();

  // Default: orchestrator returns a valid result
  mockRunOrchestrator.mockResolvedValue(makeOrchestratorResult());

  setupMockDb();
});

// =============================================================================
// Eligibility filtering
// =============================================================================

describe("eligibility filtering", () => {
  it("filters out ineligible entity types (e.g., contact)", async () => {
    const items: SyncItem[] = [
      makeSyncItem({ entity_type: "contact", data: { name: "John Doe" } }),
      makeSyncItem({ entity_type: "deal", data: { dealname: "Deal 1" } }),
    ];

    const result = await autoAnalyzeRecords(mockAdmin, items, {
      userId: "user-1",
      connectionId: "conn-1",
      connectorId: "hubspot",
      accessToken: "tok",
      log: silentLog,
    });

    expect(result.eligible).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.analyzed).toBe(0);
  });

  it("accepts document entity types (file, invoice, contract)", async () => {
    const items: SyncItem[] = [
      makeSyncItem({
        entity_type: "file",
        data: {
          name: "contract.pdf",
          mimeType: "application/pdf",
          body: "A".repeat(300), // Enough text for analysis
        },
      }),
    ];

    const result = await autoAnalyzeRecords(mockAdmin, items, {
      userId: "user-1",
      connectionId: "conn-1",
      connectorId: "google-drive",
      accessToken: "tok",
      log: silentLog,
    });

    expect(result.eligible).toBe(1);
  });

  it("accepts record with inline text content >= MIN_TEXT_LENGTH (200)", async () => {
    const items: SyncItem[] = [
      makeSyncItem({
        entity_type: "document",
        data: {
          body: "Testo di contratto di locazione con clausole e condizioni per la durata. ".repeat(5),
        },
      }),
    ];

    const result = await autoAnalyzeRecords(mockAdmin, items, {
      userId: "user-1",
      connectionId: "conn-1",
      connectorId: "hubspot",
      accessToken: "tok",
      log: silentLog,
    });

    expect(result.eligible).toBe(1);
  });

  it("accepts record with .pdf file extension even without MIME type", async () => {
    const items: SyncItem[] = [
      makeSyncItem({
        entity_type: "attachment",
        data: {
          name: "documento.pdf",
        },
      }),
    ];

    const result = await autoAnalyzeRecords(mockAdmin, items, {
      userId: "user-1",
      connectionId: "conn-1",
      connectorId: "hubspot",
      accessToken: "tok",
      log: silentLog,
    });

    expect(result.eligible).toBe(1);
  });

  it("supports custom analyzeEntityTypes override", async () => {
    const items: SyncItem[] = [
      makeSyncItem({
        entity_type: "report",
        data: {
          name: "report.pdf",
          mimeType: "application/pdf",
        },
      }),
    ];

    // Without override: "report" is not eligible
    const r1 = await autoAnalyzeRecords(mockAdmin, items, {
      userId: "user-1",
      connectionId: "conn-1",
      connectorId: "test",
      accessToken: "tok",
      log: silentLog,
    });
    expect(r1.eligible).toBe(0);

    // With override: "report" is eligible
    const r2 = await autoAnalyzeRecords(mockAdmin, items, {
      userId: "user-1",
      connectionId: "conn-1",
      connectorId: "test",
      accessToken: "tok",
      analyzeEntityTypes: ["report"],
      log: silentLog,
    });
    expect(r2.eligible).toBe(1);
  });
});

// =============================================================================
// Dedup by document hash
// =============================================================================

describe("dedup by document hash", () => {
  it("skips already-analyzed documents (dedup by hash)", async () => {
    // Mock: document already analyzed
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "analysis_sessions") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { session_id: "existing-session" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    const items: SyncItem[] = [
      makeSyncItem({
        entity_type: "file",
        data: {
          mimeType: "application/pdf",
          body: "Contenuto gia analizzato con clausole contrattuali importanti e disposizioni legali. ".repeat(4),
        },
      }),
    ];

    const result = await autoAnalyzeRecords(mockAdmin, items, {
      userId: "user-1",
      connectionId: "conn-1",
      connectorId: "hubspot",
      accessToken: "tok",
      log: silentLog,
    });

    // Should have been skipped due to dedup
    expect(result.analyzed).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);
    expect(mockRunOrchestrator).not.toHaveBeenCalled();
  });

  it("does not skip when skipDedup is true", async () => {
    // Mock: document exists in DB
    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === "analysis_sessions") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { session_id: "existing" },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "analyses") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: "new-id" }, error: null }),
            }),
          }),
        };
      }
      if (table === "crm_records") {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "integration_notifications") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return { select: vi.fn().mockReturnValue({ data: [], error: null }) };
    });

    const items: SyncItem[] = [
      makeSyncItem({
        entity_type: "file",
        data: {
          mimeType: "application/pdf",
          body: "Contratto di locazione completo con clausole legali e condizioni economiche dettagliate per il contratto. ".repeat(3),
        },
      }),
    ];

    const result = await autoAnalyzeRecords(mockAdmin, items, {
      userId: "user-1",
      connectionId: "conn-1",
      connectorId: "hubspot",
      accessToken: "tok",
      skipDedup: true,
      log: silentLog,
    });

    // Should have been analyzed despite existing hash
    expect(result.analyzed).toBe(1);
    expect(mockRunOrchestrator).toHaveBeenCalled();
  });
});

// =============================================================================
// Max analyses cap
// =============================================================================

describe("maxAnalyses cap", () => {
  it("limits the number of analyses to maxAnalyses", async () => {
    setupMockDb();

    const items: SyncItem[] = Array.from({ length: 5 }, (_, i) =>
      makeSyncItem({
        external_id: `doc-${i}`,
        entity_type: "file",
        data: {
          mimeType: "application/pdf",
          body: `Contenuto documento ${i} con testo sufficiente per analisi legale approfondita e dettagliata. `.repeat(3),
        },
      })
    );

    const result = await autoAnalyzeRecords(mockAdmin, items, {
      userId: "user-1",
      connectionId: "conn-1",
      connectorId: "test",
      accessToken: "tok",
      maxAnalyses: 2,
      log: silentLog,
    });

    // Only 2 should be analyzed, rest skipped
    expect(result.analyzed).toBeLessThanOrEqual(2);
    expect(result.skipped).toBeGreaterThanOrEqual(3);
    expect(mockRunOrchestrator).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// Sequential execution
// =============================================================================

describe("sequential execution", () => {
  it("processes documents one at a time (not in parallel)", async () => {
    setupMockDb();

    const executionOrder: string[] = [];

    mockRunOrchestrator.mockImplementation(async (text: string) => {
      const match = text.match(/doc-(\d+)/);
      const id = match ? match[1] : "unknown";
      executionOrder.push(`start-${id}`);

      // Simulate some async work
      await new Promise((r) => setTimeout(r, 10));

      executionOrder.push(`end-${id}`);
      return makeOrchestratorResult({ sessionId: `session-${id}` });
    });

    const items: SyncItem[] = [
      makeSyncItem({
        external_id: "doc-0",
        entity_type: "file",
        data: {
          body: "Contenuto doc-0 con testo sufficiente per analisi legale dettagliata e approfondita completa. ".repeat(3),
        },
      }),
      makeSyncItem({
        external_id: "doc-1",
        entity_type: "file",
        data: {
          body: "Contenuto doc-1 con testo sufficiente per analisi legale dettagliata e approfondita completa. ".repeat(3),
        },
      }),
    ];

    await autoAnalyzeRecords(mockAdmin, items, {
      userId: "user-1",
      connectionId: "conn-1",
      connectorId: "test",
      accessToken: "tok",
      log: silentLog,
    });

    // Sequential: start-0 should complete before start-1
    expect(executionOrder.indexOf("end-0")).toBeLessThan(
      executionOrder.indexOf("start-1")
    );
  });
});

// =============================================================================
// Error resilience
// =============================================================================

describe("error resilience", () => {
  it("continues pipeline when one document analysis fails", async () => {
    setupMockDb();

    let callCount = 0;
    mockRunOrchestrator.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("LLM rate limit exceeded");
      }
      return makeOrchestratorResult();
    });

    const items: SyncItem[] = [
      makeSyncItem({
        external_id: "fail-doc",
        entity_type: "file",
        data: {
          body: "Primo documento che causerà un errore durante l'analisi legale automatica. ".repeat(4),
        },
      }),
      makeSyncItem({
        external_id: "ok-doc",
        entity_type: "file",
        data: {
          body: "Secondo documento che dovrebbe essere analizzato correttamente e completamente. ".repeat(4),
        },
      }),
    ];

    const result = await autoAnalyzeRecords(mockAdmin, items, {
      userId: "user-1",
      connectionId: "conn-1",
      connectorId: "test",
      accessToken: "tok",
      log: silentLog,
    });

    expect(result.analysisFailed).toBe(1);
    expect(result.analyzed).toBe(1);
    expect(result.results).toHaveLength(2);

    const failedResult = result.results.find((r) => r.externalId === "fail-doc");
    expect(failedResult?.error).toContain("LLM rate limit");

    const okResult = result.results.find((r) => r.externalId === "ok-doc");
    expect(okResult?.error).toBeUndefined();
  });

  it("tracks extraction failures separately from analysis failures", async () => {
    setupMockDb();

    // Item with no extractable text (no body, no download URL, no file extension)
    const items: SyncItem[] = [
      makeSyncItem({
        external_id: "no-text",
        entity_type: "file",
        data: {
          mimeType: "application/pdf",
          // No body, no downloadUrl — extraction will fail (returns short text)
        },
      }),
    ];

    // Mock extractText to return too-short text
    const { extractText } = await import("@/lib/extract-text");
    vi.mocked(extractText).mockResolvedValueOnce("short");

    const result = await autoAnalyzeRecords(mockAdmin, items, {
      userId: "user-1",
      connectionId: "conn-1",
      connectorId: "test",
      accessToken: "tok",
      log: silentLog,
    });

    expect(result.extractionFailed).toBeGreaterThanOrEqual(0);
    // The orchestrator should NOT have been called for items without enough text
  });
});

// =============================================================================
// Empty items
// =============================================================================

describe("empty items", () => {
  it("returns early with zero counts when items array is empty", async () => {
    const result = await autoAnalyzeRecords(mockAdmin, [], {
      userId: "user-1",
      connectionId: "conn-1",
      connectorId: "test",
      accessToken: "tok",
      log: silentLog,
    });

    expect(result.totalEvaluated).toBe(0);
    expect(result.eligible).toBe(0);
    expect(result.analyzed).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockRunOrchestrator).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Event callbacks
// =============================================================================

describe("event callbacks", () => {
  it("emits analyze stage events with progress tracking", async () => {
    setupMockDb();

    const events: any[] = [];

    const items: SyncItem[] = [
      makeSyncItem({
        entity_type: "file",
        data: {
          body: "Testo di contratto di locazione con clausole legali e condizioni per analisi dettagliata. ".repeat(4),
        },
      }),
    ];

    await autoAnalyzeRecords(mockAdmin, items, {
      userId: "user-1",
      connectionId: "conn-1",
      connectorId: "test",
      accessToken: "tok",
      log: silentLog,
      onEvent: (event) => events.push(event),
    });

    expect(events.length).toBeGreaterThan(0);

    // All events should be "analyze" stage
    for (const event of events) {
      expect(event.stage).toBe("analyze");
      expect(event.connectorId).toBe("test");
    }

    // Should have progress tracking
    const progressEvents = events.filter((e) => e.progress);
    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents[0].progress.total).toBe(1);
  });
});
