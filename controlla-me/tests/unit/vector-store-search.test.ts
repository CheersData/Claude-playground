/**
 * Tests: lib/vector-store.ts — Search & RAG functions (Part 2/2)
 *
 * Coverage:
 * - searchSimilarDocuments: disabled, embedding fail, RPC error, success with mapping
 * - searchLegalKnowledge: disabled, embedding fail, RPC error, success, re-ranking by timesSeen, category filter
 * - searchAll: disabled, parallel execution, combined results
 * - buildRAGContext: disabled, no results, category filtering, maxChars truncation, output format
 *
 * Split from vector-store.test.ts to avoid Vitest worker crash on Windows (large file + forks pool).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const mockGenerateEmbedding = vi.hoisted(() => vi.fn());
const mockGenerateEmbeddings = vi.hoisted(() => vi.fn());
const mockIsVectorDBEnabled = vi.hoisted(() => vi.fn());
const mockTruncateForEmbedding = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn().mockReturnValue({
    delete: vi.fn().mockReturnValue({
      eq: mockEq,
    }),
    insert: mockInsert,
  }),
  rpc: mockRpc,
}));

vi.mock("@/lib/embeddings", () => ({
  generateEmbedding: mockGenerateEmbedding,
  generateEmbeddings: mockGenerateEmbeddings,
  isVectorDBEnabled: mockIsVectorDBEnabled,
  truncateForEmbedding: mockTruncateForEmbedding,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockSupabase),
}));

import {
  searchSimilarDocuments,
  searchLegalKnowledge,
  searchAll,
  buildRAGContext,
} from "@/lib/vector-store";

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockIsVectorDBEnabled.mockReturnValue(true);
  mockTruncateForEmbedding.mockImplementation((t: string) => t);
  mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  mockGenerateEmbeddings.mockResolvedValue([[0.1, 0.2, 0.3]]);
  mockEq.mockResolvedValue({ error: null });
  mockInsert.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ data: [], error: null });
  // Reset from() mock chain after clearAllMocks
  mockSupabase.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ eq: mockEq }),
    insert: mockInsert,
  });
});

// =============================================================================
// searchSimilarDocuments
// =============================================================================

describe("searchSimilarDocuments", () => {
  it("returns empty array when vector DB is disabled", async () => {
    mockIsVectorDBEnabled.mockReturnValue(false);
    const results = await searchSimilarDocuments("test query");
    expect(results).toEqual([]);
  });

  it("returns empty array when embedding generation fails", async () => {
    mockGenerateEmbedding.mockResolvedValue(null);
    const results = await searchSimilarDocuments("test query");
    expect(results).toEqual([]);
  });

  it("returns empty array on RPC error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: null, error: { message: "RPC error" } });

    const results = await searchSimilarDocuments("test query");
    expect(results).toEqual([]);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("returns empty array when RPC returns null data", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const results = await searchSimilarDocuments("test query");
    expect(results).toEqual([]);
  });

  it("returns mapped results on success", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: "chunk-1",
          content: "Articolo 1571 del codice civile...",
          metadata: { documentType: "contratto" },
          similarity: 0.85,
        },
        {
          id: "chunk-2",
          content: "La penale contrattuale...",
          metadata: { documentType: "locazione" },
          similarity: 0.72,
        },
      ],
      error: null,
    });

    const results = await searchSimilarDocuments("clausola penale");
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("chunk-1");
    expect(results[0].content).toContain("Articolo 1571");
    expect(results[0].similarity).toBe(0.85);
    expect(results[0].metadata).toEqual({ documentType: "contratto" });
  });

  it("uses default threshold 0.5 and limit 5", async () => {
    await searchSimilarDocuments("query");
    expect(mockRpc).toHaveBeenCalledWith("match_document_chunks", {
      query_embedding: expect.any(String),
      match_threshold: 0.5,
      match_count: 5,
    });
  });

  it("respects custom threshold and limit", async () => {
    await searchSimilarDocuments("query", { threshold: 0.5, limit: 10 });
    expect(mockRpc).toHaveBeenCalledWith("match_document_chunks", {
      query_embedding: expect.any(String),
      match_threshold: 0.5,
      match_count: 10,
    });
  });

  it("calls generateEmbedding with 'query' input type", async () => {
    await searchSimilarDocuments("test query");
    expect(mockGenerateEmbedding).toHaveBeenCalledWith("test query", "query");
  });
});

// =============================================================================
// searchLegalKnowledge
// =============================================================================

describe("searchLegalKnowledge", () => {
  it("returns empty array when vector DB is disabled", async () => {
    mockIsVectorDBEnabled.mockReturnValue(false);
    const results = await searchLegalKnowledge("test query");
    expect(results).toEqual([]);
  });

  it("returns empty array when embedding generation fails", async () => {
    mockGenerateEmbedding.mockResolvedValue(null);
    const results = await searchLegalKnowledge("test query");
    expect(results).toEqual([]);
  });

  it("returns empty array on RPC error", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockRpc.mockResolvedValue({ data: null, error: { message: "RPC failed" } });

    const results = await searchLegalKnowledge("test query");
    expect(results).toEqual([]);
    consoleSpy.mockRestore();
  });

  it("returns mapped results with all fields on success", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: "know-1",
          content: "Art. 1384 c.c. — riduzione della penale...",
          metadata: { reference: "Art. 1384 c.c." },
          similarity: 0.78,
          category: "law_reference",
          title: "Art. 1384 c.c.",
          times_seen: 5,
        },
      ],
      error: null,
    });

    const results = await searchLegalKnowledge("clausola penale");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("know-1");
    expect(results[0].category).toBe("law_reference");
    expect(results[0].title).toBe("Art. 1384 c.c.");
    expect(results[0].timesSeen).toBe(5);
    expect(results[0].similarity).toBe(0.78);
  });

  it("uses default threshold 0.4 and limit 5", async () => {
    await searchLegalKnowledge("query");
    expect(mockRpc).toHaveBeenCalledWith("match_legal_knowledge", {
      query_embedding: expect.any(String),
      filter_category: null,
      match_threshold: 0.4,
      match_count: 5,
    });
  });

  it("passes category filter when specified", async () => {
    await searchLegalKnowledge("query", { category: "court_case" });
    expect(mockRpc).toHaveBeenCalledWith("match_legal_knowledge", {
      query_embedding: expect.any(String),
      filter_category: "court_case",
      match_threshold: 0.4,
      match_count: 5,
    });
  });

  it("respects custom threshold and limit", async () => {
    await searchLegalKnowledge("query", { threshold: 0.3, limit: 20 });
    expect(mockRpc).toHaveBeenCalledWith("match_legal_knowledge", {
      query_embedding: expect.any(String),
      filter_category: null,
      match_threshold: 0.3,
      match_count: 20,
    });
  });

  it("re-ranks results by timesSeen (boost frequently seen entries)", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: "a",
          content: "Content A",
          metadata: {},
          similarity: 0.70,
          category: "law_reference",
          title: "Title A",
          times_seen: 100, // Very frequently seen
        },
        {
          id: "b",
          content: "Content B",
          metadata: {},
          similarity: 0.72,
          category: "clause_pattern",
          title: "Title B",
          times_seen: 1, // Rarely seen
        },
      ],
      error: null,
    });

    const results = await searchLegalKnowledge("query");
    expect(results).toHaveLength(2);
    // A has lower similarity (0.70) but much higher timesSeen (100)
    // scoreA = 0.70 * 0.8 + min(log10(101)/2, 0.25) = 0.56 + 0.25 = 0.81
    // scoreB = 0.72 * 0.8 + min(log10(2)/2, 0.25) = 0.576 + 0.15 = 0.726
    // A should rank higher
    expect(results[0].id).toBe("a");
    expect(results[1].id).toBe("b");
  });

  it("re-ranking does not change order when timesSeen is equal", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: "high-sim",
          content: "Content",
          metadata: {},
          similarity: 0.90,
          category: "law_reference",
          title: "High Sim",
          times_seen: 1,
        },
        {
          id: "low-sim",
          content: "Content",
          metadata: {},
          similarity: 0.60,
          category: "law_reference",
          title: "Low Sim",
          times_seen: 1,
        },
      ],
      error: null,
    });

    const results = await searchLegalKnowledge("query");
    expect(results[0].id).toBe("high-sim");
    expect(results[1].id).toBe("low-sim");
  });

  it("handles null timesSeen gracefully (defaults to 1 in formula)", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: "no-seen",
          content: "Content",
          metadata: {},
          similarity: 0.80,
          category: "law_reference",
          title: "Title",
          times_seen: null, // DB can return null
        },
      ],
      error: null,
    });

    const results = await searchLegalKnowledge("query");
    expect(results).toHaveLength(1);
    // Should not throw; timesSeen defaults to 1 via ?? operator
    expect(results[0].timesSeen).toBeNull();
  });
});

// =============================================================================
// searchAll
// =============================================================================

describe("searchAll", () => {
  it("returns empty documents and knowledge when vector DB is disabled", async () => {
    mockIsVectorDBEnabled.mockReturnValue(false);
    const result = await searchAll("query");
    expect(result).toEqual({ documents: [], knowledge: [] });
  });

  it("returns results from both searches on success", async () => {
    // First call is for searchSimilarDocuments, second for searchLegalKnowledge
    // Both use generateEmbedding internally
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2]);
    mockRpc
      .mockResolvedValueOnce({
        data: [{ id: "doc-1", content: "Doc content", metadata: {}, similarity: 0.8 }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: "know-1", content: "Know content", metadata: {}, similarity: 0.75, category: "law_reference", title: "Art. 1", times_seen: 3 }],
        error: null,
      });

    const result = await searchAll("clausola penale");
    expect(result.documents).toHaveLength(1);
    expect(result.knowledge).toHaveLength(1);
    expect(result.documents[0].id).toBe("doc-1");
    expect(result.knowledge[0].id).toBe("know-1");
  });

  it("uses provided threshold and limit for both searches", async () => {
    mockGenerateEmbedding.mockResolvedValue([0.1]);
    mockRpc.mockResolvedValue({ data: [], error: null });

    await searchAll("query", { threshold: 0.4, limit: 3 });

    // Both RPCs should have been called with the custom options
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockRpc).toHaveBeenCalledWith("match_document_chunks", expect.objectContaining({
      match_threshold: 0.4,
      match_count: 3,
    }));
    expect(mockRpc).toHaveBeenCalledWith("match_legal_knowledge", expect.objectContaining({
      match_threshold: 0.4,
      match_count: 3,
    }));
  });

  it("uses default threshold 0.4 and limit 5", async () => {
    mockGenerateEmbedding.mockResolvedValue([0.1]);
    mockRpc.mockResolvedValue({ data: [], error: null });

    await searchAll("query");

    // searchSimilarDocuments uses threshold from searchAll (0.4), not its own default (0.5)
    expect(mockRpc).toHaveBeenCalledWith("match_document_chunks", expect.objectContaining({
      match_threshold: 0.4,
      match_count: 5,
    }));
  });

  it("handles one search failing while other succeeds", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockGenerateEmbedding.mockResolvedValue([0.1]);
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { message: "doc search failed" } }) // documents fail
      .mockResolvedValueOnce({
        data: [{ id: "k1", content: "c", metadata: {}, similarity: 0.7, category: "law_reference", title: "T", times_seen: 1 }],
        error: null,
      });

    const result = await searchAll("query");
    expect(result.documents).toEqual([]);
    expect(result.knowledge).toHaveLength(1);
    consoleSpy.mockRestore();
  });
});

// =============================================================================
// buildRAGContext
// =============================================================================

describe("buildRAGContext", () => {
  it("returns empty string when vector DB is disabled", async () => {
    mockIsVectorDBEnabled.mockReturnValue(false);
    const context = await buildRAGContext("query");
    expect(context).toBe("");
  });

  it("returns empty string when no search results", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    const context = await buildRAGContext("query");
    expect(context).toBe("");
  });

  it("returns empty string when embedding generation fails", async () => {
    mockGenerateEmbedding.mockResolvedValue(null);
    const context = await buildRAGContext("query");
    expect(context).toBe("");
  });

  it("produces correctly formatted output with header and footer", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: "r1",
          content: "Art. 1384 c.c. — riduzione della penale",
          metadata: {},
          similarity: 0.80,
          category: "law_reference",
          title: "Art. 1384 c.c.",
          times_seen: 3,
        },
      ],
      error: null,
    });

    const context = await buildRAGContext("clausola penale");
    expect(context).toContain("CONTESTO DA ANALISI PRECEDENTI");
    expect(context).toContain("FINE CONTESTO");
    expect(context).toContain("[LAW_REFERENCE]");
    expect(context).toContain("Art. 1384 c.c.");
    expect(context).toContain("80%"); // similarity formatted
    expect(context).toContain("3x"); // timesSeen
  });

  it("respects maxChars limit and truncates entries", async () => {
    // Create results that would exceed a small maxChars limit
    const longContent = "A".repeat(500);
    mockRpc.mockResolvedValue({
      data: [
        { id: "r1", content: longContent, metadata: {}, similarity: 0.8, category: "law_reference", title: "Entry 1", times_seen: 1 },
        { id: "r2", content: longContent, metadata: {}, similarity: 0.75, category: "clause_pattern", title: "Entry 2", times_seen: 1 },
        { id: "r3", content: longContent, metadata: {}, similarity: 0.70, category: "risk_pattern", title: "Entry 3", times_seen: 1 },
      ],
      error: null,
    });

    const context = await buildRAGContext("query", { maxChars: 700 });
    // Should include the header + at most 1-2 entries before hitting the limit
    expect(context.length).toBeLessThanOrEqual(800); // Some slack for header/footer
    expect(context).toContain("CONTESTO DA ANALISI PRECEDENTI");
    expect(context).toContain("FINE CONTESTO");
  });

  it("filters by categories when specified", async () => {
    mockRpc.mockResolvedValue({
      data: [
        { id: "r1", content: "Law content", metadata: {}, similarity: 0.8, category: "law_reference", title: "Law 1", times_seen: 1 },
        { id: "r2", content: "Case content", metadata: {}, similarity: 0.75, category: "court_case", title: "Case 1", times_seen: 1 },
        { id: "r3", content: "Clause content", metadata: {}, similarity: 0.7, category: "clause_pattern", title: "Clause 1", times_seen: 1 },
      ],
      error: null,
    });

    const context = await buildRAGContext("query", { categories: ["law_reference"] });
    expect(context).toContain("[LAW_REFERENCE]");
    expect(context).not.toContain("[COURT_CASE]");
    expect(context).not.toContain("[CLAUSE_PATTERN]");
  });

  it("returns empty string when category filter excludes all results", async () => {
    mockRpc.mockResolvedValue({
      data: [
        { id: "r1", content: "Case content", metadata: {}, similarity: 0.8, category: "court_case", title: "Case 1", times_seen: 1 },
      ],
      error: null,
    });

    const context = await buildRAGContext("query", { categories: ["law_reference"] });
    expect(context).toBe("");
  });

  it("uses default maxChars of 3000", async () => {
    // Generate many results that would exceed 3000 chars
    const entries = Array.from({ length: 20 }, (_, i) => ({
      id: `r${i}`,
      content: `Legal content entry ${i}. `.repeat(20),
      metadata: {},
      similarity: 0.8 - i * 0.01,
      category: "law_reference",
      title: `Entry ${i}`,
      times_seen: 1,
    }));
    mockRpc.mockResolvedValue({ data: entries, error: null });

    const context = await buildRAGContext("query");
    // Should be truncated near 3000 chars
    expect(context.length).toBeLessThanOrEqual(3500); // Some slack
    expect(context).toContain("CONTESTO DA ANALISI PRECEDENTI");
    expect(context).toContain("FINE CONTESTO");
  });

  it("searches with threshold 0.4 and limit 8", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buildRAGContext("query");

    expect(mockRpc).toHaveBeenCalledWith("match_legal_knowledge", expect.objectContaining({
      match_threshold: 0.4,
      match_count: 8,
    }));
  });

  it("includes multiple entry types in output", async () => {
    mockRpc.mockResolvedValue({
      data: [
        { id: "r1", content: "Law content", metadata: {}, similarity: 0.85, category: "law_reference", title: "Art. 1384", times_seen: 5 },
        { id: "r2", content: "Case content", metadata: {}, similarity: 0.80, category: "court_case", title: "Cass. 123/2022", times_seen: 2 },
        { id: "r3", content: "Risk content", metadata: {}, similarity: 0.75, category: "risk_pattern", title: "Penale eccessiva", times_seen: 8 },
      ],
      error: null,
    });

    const context = await buildRAGContext("query");
    expect(context).toContain("[LAW_REFERENCE]");
    expect(context).toContain("[COURT_CASE]");
    expect(context).toContain("[RISK_PATTERN]");
    expect(context).toContain("Art. 1384");
    expect(context).toContain("Cass. 123/2022");
    expect(context).toContain("Penale eccessiva");
  });
});
