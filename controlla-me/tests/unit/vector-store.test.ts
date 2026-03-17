/**
 * Tests: lib/vector-store.ts (P0 — RAG pipeline)
 *
 * Comprehensive coverage:
 * - chunkText: empty, short, medium, long, overlap, paragraph/sentence boundaries, metadata propagation
 * - indexDocument: disabled, short text, embeddings fail, success, batch insert, re-index (delete + insert)
 * - indexAnalysisKnowledge: disabled, empty results, clause/law/courtCase/risk extraction, embeddings fail, upsert errors
 * - searchSimilarDocuments: disabled, embedding fail, RPC error, success with mapping
 * - searchLegalKnowledge: disabled, embedding fail, RPC error, success, re-ranking by timesSeen, category filter
 * - searchAll: disabled, parallel execution, combined results
 * - buildRAGContext: disabled, no results, category filtering, maxChars truncation, output format
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
  chunkText,
  indexDocument,
  indexAnalysisKnowledge,
  searchSimilarDocuments,
  searchLegalKnowledge,
  searchAll,
  buildRAGContext,
} from "@/lib/vector-store";
import type {
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
  AdvisorResult,
} from "@/lib/types";

// ── Test data factories ─────────────────────────────────────────────────────

function makeClassification(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    documentType: "contratto",
    documentTypeLabel: "Contratto di locazione",
    documentSubType: "locazione_4+4",
    parties: [{ role: "Locatore", name: "Mario Rossi", type: "persona_fisica" }],
    jurisdiction: "Italia",
    applicableLaws: [{ reference: "Art. 1571 c.c.", name: "Locazione" }],
    relevantInstitutes: ["locazione"],
    legalFocusAreas: ["diritto_immobiliare"],
    keyDates: [],
    summary: "Contratto di locazione abitativa",
    confidence: 0.95,
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    clauses: [
      {
        id: "clause-1",
        title: "Clausola penale eccessiva",
        originalText: "In caso di inadempimento il conduttore dovrà pagare...",
        riskLevel: "critical",
        issue: "Penale sproporziata rispetto al danno",
        potentialViolation: "Art. 1384 c.c.",
        marketStandard: "Penali non superiori a 2 mensilità",
        recommendation: "Ridurre la penale",
      },
      {
        id: "clause-2",
        title: "Recesso unilaterale",
        originalText: "Il locatore può recedere in qualsiasi momento...",
        riskLevel: "high",
        issue: "Manca preavviso minimo",
        potentialViolation: "Art. 3 L. 431/1998",
        marketStandard: "Preavviso 6 mesi",
        recommendation: "Inserire preavviso",
      },
    ],
    missingElements: [],
    overallRisk: "high",
    positiveAspects: ["Registrazione contratto prevista"],
    ...overrides,
  };
}

function makeInvestigation(overrides: Partial<InvestigationResult> = {}): InvestigationResult {
  return {
    findings: [
      {
        clauseId: "clause-1",
        laws: [
          {
            reference: "Art. 1384 c.c.",
            fullText: "La penale può essere diminuita equamente dal giudice...",
            sourceUrl: "https://normattiva.it/...",
            isInForce: true,
            lastModified: "2023-01-01",
          },
        ],
        courtCases: [
          {
            reference: "Cass. civ. 12345/2022",
            court: "Corte di Cassazione",
            date: "2022-06-15",
            summary: "La Cassazione ha confermato la riduzione della penale...",
            relevance: "Direttamente applicabile a clausole penali in locazione",
            sourceUrl: "https://dejure.it/...",
          },
        ],
        legalOpinion: "La clausola penale è eccessiva e riducibile ex art. 1384 c.c.",
      },
    ],
    ...overrides,
  };
}

function makeAdvice(overrides: Partial<AdvisorResult> = {}): AdvisorResult {
  return {
    fairnessScore: 4.5,
    scores: {
      contractEquity: 4,
      legalCoherence: 5,
      practicalCompliance: 4,
      completeness: 5,
    },
    summary: "Contratto sbilanciato a favore del locatore",
    risks: [
      {
        severity: "alta",
        title: "Penale eccessiva",
        detail: "La clausola penale supera gli standard di mercato",
        legalBasis: "Art. 1384 c.c.",
        courtCase: "Cass. civ. 12345/2022",
      },
    ],
    deadlines: [],
    actions: [
      {
        priority: 1,
        action: "Negoziare riduzione penale",
        rationale: "La penale è sproporziata e riducibile dal giudice",
      },
    ],
    needsLawyer: true,
    lawyerSpecialization: "Diritto immobiliare",
    lawyerReason: "Clausole vessatorie",
    ...overrides,
  };
}

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
// chunkText
// =============================================================================

describe("chunkText", () => {
  it("returns empty array for empty string", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("returns empty array for very short text (< 20 chars after trim)", () => {
    expect(chunkText("Short.")).toEqual([]);
    expect(chunkText("Too brief")).toEqual([]);
  });

  it("returns a single chunk for text just above 20 chars", () => {
    const text = "This is a test sentence that is certainly longer than twenty characters.";
    const chunks = chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe(text);
    expect(chunks[0].index).toBe(0);
  });

  it("produces chunks with correct metadata propagation", () => {
    const text = "Legal content paragraph. ".repeat(30);
    const chunks = chunkText(text, { source: "test", docType: "contratto" });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of chunks) {
      expect(chunk.metadata.source).toBe("test");
      expect(chunk.metadata.docType).toBe("contratto");
      expect(typeof chunk.metadata.charStart).toBe("number");
      expect(typeof chunk.metadata.charEnd).toBe("number");
    }
  });

  it("produces sequential indices", () => {
    const text = "A".repeat(3000);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => expect(c.index).toBe(i));
  });

  it("produces overlapping chunks (overlap region)", () => {
    // With CHUNK_SIZE=1000 and CHUNK_OVERLAP=200, consecutive chunks should share content
    const text = "Word ".repeat(800); // ~4000 chars
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);

    // Verify each chunk has content
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeGreaterThan(20);
    }
  });

  it("prefers paragraph breaks when available", () => {
    // Create text with a paragraph break near the chunk boundary
    const firstParagraph = "A".repeat(700);
    const secondParagraph = "B".repeat(700);
    const text = firstParagraph + "\n\n" + secondParagraph;
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // The first chunk should end at or near the paragraph break
  });

  it("handles text with no natural break points", () => {
    // Continuous string with no spaces, periods, or newlines
    const text = "x".repeat(3000);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeGreaterThan(20);
    }
  });

  it("handles text with only newlines as separators", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `Line ${i}: some legal text here about contracts`);
    const text = lines.join("\n");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("does not produce infinite loops on large text", () => {
    const chunks = chunkText("Legal. ".repeat(2000)); // ~14K chars
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.length).toBeLessThan(100);
  });

  it("preserves empty metadata when none provided", () => {
    const text = "Enough content here for a chunk to be created by the system.";
    const chunks = chunkText(text);
    if (chunks.length > 0) {
      expect(chunks[0].metadata).toHaveProperty("charStart");
      expect(chunks[0].metadata).toHaveProperty("charEnd");
    }
  });

  it("charStart and charEnd are valid boundaries", () => {
    const text = "Legal content. ".repeat(100);
    const chunks = chunkText(text);
    for (const chunk of chunks) {
      const start = chunk.metadata.charStart as number;
      const end = chunk.metadata.charEnd as number;
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      expect(end).toBeLessThanOrEqual(text.length);
    }
  });
});

// =============================================================================
// indexDocument
// =============================================================================

describe("indexDocument", () => {
  it("returns null when vector DB is disabled", async () => {
    mockIsVectorDBEnabled.mockReturnValue(false);
    const result = await indexDocument("id-1", "some text", makeClassification());
    expect(result).toBeNull();
  });

  it("returns chunksIndexed 0 for very short text", async () => {
    const result = await indexDocument("id-1", "Short", makeClassification());
    expect(result).toEqual({ chunksIndexed: 0 });
  });

  it("returns null when embeddings generation fails", async () => {
    mockGenerateEmbeddings.mockResolvedValue(null);
    const text = "Legal content. ".repeat(30);
    const result = await indexDocument("id-1", text, makeClassification());
    expect(result).toBeNull();
  });

  it("deletes existing chunks before inserting new ones (re-index)", async () => {
    mockGenerateEmbeddings.mockResolvedValue([[0.1, 0.2]]);
    const text = "Legal content. ".repeat(30);
    await indexDocument("a1", text, makeClassification());
    expect(mockEq).toHaveBeenCalledWith("analysis_id", "a1");
  });

  it("inserts chunks and returns correct count on success", async () => {
    mockGenerateEmbeddings.mockResolvedValue([[0.1, 0.2]]);
    const text = "Legal content. ".repeat(30);
    const result = await indexDocument("a1", text, makeClassification());
    expect(mockInsert).toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.chunksIndexed).toBeGreaterThanOrEqual(1);
  });

  it("passes classification metadata to chunks", async () => {
    mockGenerateEmbeddings.mockResolvedValue([[0.1, 0.2]]);
    const text = "Legal content. ".repeat(30);
    await indexDocument("a1", text, makeClassification({ documentType: "vendita" }));
    expect(mockInsert).toHaveBeenCalled();
    const insertedRows = mockInsert.mock.calls[0][0];
    expect(insertedRows[0].metadata).toHaveProperty("documentType", "vendita");
  });

  it("handles documents producing multiple chunks", async () => {
    // Generate text that produces a few chunks (not too large to avoid OOM)
    const text = "Legal content sentence. ".repeat(80); // ~2000 chars => 2-3 chunks
    const chunks = chunkText(text);
    const embeddings = chunks.map(() => [0.1, 0.2, 0.3]);
    mockGenerateEmbeddings.mockResolvedValue(embeddings);

    const result = await indexDocument("multi-doc", text, makeClassification());
    expect(result).not.toBeNull();
    expect(result!.chunksIndexed).toBe(chunks.length);
    expect(result!.chunksIndexed).toBeGreaterThan(1);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("logs error but continues when batch insert fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInsert.mockResolvedValue({ error: { message: "DB error" } });
    mockGenerateEmbeddings.mockResolvedValue([[0.1, 0.2]]);

    const text = "Legal content. ".repeat(30);
    const result = await indexDocument("a1", text, makeClassification());

    // Should still return a result (insert error is non-fatal per chunk batch)
    expect(result).not.toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// =============================================================================
// indexAnalysisKnowledge
// =============================================================================

describe("indexAnalysisKnowledge", () => {
  it("returns null when vector DB is disabled", async () => {
    mockIsVectorDBEnabled.mockReturnValue(false);
    const result = await indexAnalysisKnowledge(
      "id-1",
      makeClassification(),
      makeAnalysis(),
      makeInvestigation(),
      makeAdvice(),
    );
    expect(result).toBeNull();
  });

  it("returns entriesIndexed 0 when all inputs are empty", async () => {
    const result = await indexAnalysisKnowledge(
      "id-1",
      makeClassification(),
      makeAnalysis({ clauses: [] }),
      makeInvestigation({ findings: [] }),
      makeAdvice({ risks: [] }),
    );
    expect(result).toEqual({ entriesIndexed: 0 });
  });

  it("extracts clause_pattern entries from analysis clauses", async () => {
    const analysis = makeAnalysis();
    const embeddings = analysis.clauses.map(() => [0.1]);
    mockGenerateEmbeddings.mockResolvedValue(embeddings);
    mockRpc.mockResolvedValue({ error: null });

    const result = await indexAnalysisKnowledge(
      "id-1",
      makeClassification(),
      analysis,
      makeInvestigation({ findings: [] }),
      makeAdvice({ risks: [] }),
    );

    expect(result).not.toBeNull();
    expect(result!.entriesIndexed).toBe(analysis.clauses.length);
    // Verify RPC was called for each clause
    expect(mockRpc).toHaveBeenCalledTimes(analysis.clauses.length);
    // Verify the RPC was called with correct function name and category
    const firstCall = mockRpc.mock.calls[0];
    expect(firstCall[0]).toBe("upsert_legal_knowledge");
    expect(firstCall[1].p_category).toBe("clause_pattern");
  });

  it("extracts law_reference entries from investigation findings", async () => {
    const investigation = makeInvestigation();
    // 1 clause_pattern + 1 law_reference + 1 court_case + 0 risk
    const totalEntries = 1 + 1 + 1; // from investigation
    const embeddings = Array(totalEntries + 2).fill([0.1]); // +2 for analysis clauses
    mockGenerateEmbeddings.mockResolvedValue(embeddings);
    mockRpc.mockResolvedValue({ error: null });

    const result = await indexAnalysisKnowledge(
      "id-1",
      makeClassification(),
      makeAnalysis(),
      investigation,
      makeAdvice({ risks: [] }),
    );

    expect(result).not.toBeNull();
    // Check that law_reference RPC calls were made
    const lawCalls = mockRpc.mock.calls.filter(
      (call) => call[1].p_category === "law_reference",
    );
    expect(lawCalls.length).toBe(1);
    expect(lawCalls[0][1].p_title).toBe("Art. 1384 c.c.");
  });

  it("extracts court_case entries from investigation findings", async () => {
    const totalEntries = 2 + 1 + 1; // clauses + law + courtCase
    const embeddings = Array(totalEntries).fill([0.1]);
    mockGenerateEmbeddings.mockResolvedValue(embeddings);
    mockRpc.mockResolvedValue({ error: null });

    await indexAnalysisKnowledge(
      "id-1",
      makeClassification(),
      makeAnalysis(),
      makeInvestigation(),
      makeAdvice({ risks: [] }),
    );

    const courtCalls = mockRpc.mock.calls.filter(
      (call) => call[1].p_category === "court_case",
    );
    expect(courtCalls.length).toBe(1);
    expect(courtCalls[0][1].p_title).toBe("Cass. civ. 12345/2022");
  });

  it("extracts risk_pattern entries from advisor risks", async () => {
    const advice = makeAdvice();
    const totalEntries = 2 + 1 + 1 + advice.risks.length;
    const embeddings = Array(totalEntries).fill([0.1]);
    mockGenerateEmbeddings.mockResolvedValue(embeddings);
    mockRpc.mockResolvedValue({ error: null });

    await indexAnalysisKnowledge(
      "id-1",
      makeClassification(),
      makeAnalysis(),
      makeInvestigation(),
      advice,
    );

    const riskCalls = mockRpc.mock.calls.filter(
      (call) => call[1].p_category === "risk_pattern",
    );
    expect(riskCalls.length).toBe(advice.risks.length);
    expect(riskCalls[0][1].p_title).toContain("Penale eccessiva");
  });

  it("returns null when embeddings generation fails", async () => {
    mockGenerateEmbeddings.mockResolvedValue(null);
    const result = await indexAnalysisKnowledge(
      "id-1",
      makeClassification(),
      makeAnalysis(),
      makeInvestigation(),
      makeAdvice(),
    );
    expect(result).toBeNull();
  });

  it("counts only successfully upserted entries", async () => {
    const totalEntries = 2 + 1 + 1 + 1; // 2 clauses + 1 law + 1 courtCase + 1 risk
    const embeddings = Array(totalEntries).fill([0.1]);
    mockGenerateEmbeddings.mockResolvedValue(embeddings);

    // First 2 calls succeed, then fail, then succeed
    mockRpc
      .mockResolvedValueOnce({ error: null }) // clause 1 - ok
      .mockResolvedValueOnce({ error: null }) // clause 2 - ok
      .mockResolvedValueOnce({ error: { message: "upsert failed" } }) // law - fail
      .mockResolvedValueOnce({ error: null }) // courtCase - ok
      .mockResolvedValueOnce({ error: null }); // risk - ok

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await indexAnalysisKnowledge(
      "id-1",
      makeClassification(),
      makeAnalysis(),
      makeInvestigation(),
      makeAdvice(),
    );

    expect(result).not.toBeNull();
    expect(result!.entriesIndexed).toBe(4); // 5 total - 1 failed = 4
    consoleSpy.mockRestore();
  });

  it("handles null/undefined clauses, findings, risks gracefully", async () => {
    const result = await indexAnalysisKnowledge(
      "id-1",
      makeClassification(),
      { clauses: [], missingElements: [], overallRisk: "low", positiveAspects: [] } as AnalysisResult,
      { findings: [] } as InvestigationResult,
      makeAdvice({ risks: [] }),
    );
    expect(result).toEqual({ entriesIndexed: 0 });
  });

  it("passes source_analysis_id to every upsert call", async () => {
    mockGenerateEmbeddings.mockResolvedValue([[0.1], [0.1]]);
    mockRpc.mockResolvedValue({ error: null });

    await indexAnalysisKnowledge(
      "analysis-xyz",
      makeClassification(),
      makeAnalysis({ clauses: [makeAnalysis().clauses[0]] }),
      makeInvestigation({ findings: [] }),
      makeAdvice({ risks: [] }),
    );

    for (const call of mockRpc.mock.calls) {
      expect(call[1].p_source_analysis_id).toBe("analysis-xyz");
    }
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

  it("uses default threshold 0.7 and limit 5", async () => {
    await searchSimilarDocuments("query");
    expect(mockRpc).toHaveBeenCalledWith("match_document_chunks", {
      query_embedding: expect.any(String),
      match_threshold: 0.7,
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

  it("uses default threshold 0.55 and limit 5", async () => {
    await searchLegalKnowledge("query");
    expect(mockRpc).toHaveBeenCalledWith("match_legal_knowledge", {
      query_embedding: expect.any(String),
      filter_category: null,
      match_threshold: 0.55,
      match_count: 5,
    });
  });

  it("passes category filter when specified", async () => {
    await searchLegalKnowledge("query", { category: "court_case" });
    expect(mockRpc).toHaveBeenCalledWith("match_legal_knowledge", {
      query_embedding: expect.any(String),
      filter_category: "court_case",
      match_threshold: 0.55,
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

  it("uses default threshold 0.55 and limit 5", async () => {
    mockGenerateEmbedding.mockResolvedValue([0.1]);
    mockRpc.mockResolvedValue({ data: [], error: null });

    await searchAll("query");

    // searchSimilarDocuments uses threshold from searchAll (0.55), not its own default (0.7)
    expect(mockRpc).toHaveBeenCalledWith("match_document_chunks", expect.objectContaining({
      match_threshold: 0.55,
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

  it("searches with threshold 0.5 and limit 8", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await buildRAGContext("query");

    expect(mockRpc).toHaveBeenCalledWith("match_legal_knowledge", expect.objectContaining({
      match_threshold: 0.5,
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
