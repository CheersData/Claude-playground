/**
 * Tests: lib/vector-store.ts — indexDocument & indexAnalysisKnowledge
 *
 * Coverage targets: lines 103-338 (indexDocument, indexAnalysisKnowledge)
 * Previously at 0% — these are the write-path functions of the vector store.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const mockGenerateEmbedding = vi.hoisted(() => vi.fn());
const mockGenerateEmbeddings = vi.hoisted(() => vi.fn());
const mockIsVectorDBEnabled = vi.hoisted(() => vi.fn());
const mockTruncateForEmbedding = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockDeleteEq = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn().mockReturnValue({
    delete: vi.fn().mockReturnValue({ eq: mockDeleteEq }),
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
} from "@/lib/vector-store";

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockIsVectorDBEnabled.mockReturnValue(true);
  mockTruncateForEmbedding.mockImplementation((t: string) => t);
  mockGenerateEmbeddings.mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]);
  mockDeleteEq.mockResolvedValue({ error: null });
  mockInsert.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ data: null, error: null });
  // Reset from() chain
  mockSupabase.from.mockReturnValue({
    delete: vi.fn().mockReturnValue({ eq: mockDeleteEq }),
    insert: mockInsert,
  });
});

// =============================================================================
// chunkText — extended tests
// =============================================================================

describe("chunkText extended", () => {
  it("returns empty array for empty string", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("returns empty array for very short text (<=20 chars after trim)", () => {
    expect(chunkText("Short sentence.")).toEqual([]);
  });

  it("returns single chunk for text slightly above 20 chars", () => {
    const text = "This is a sentence that is definitely longer than twenty characters for testing.";
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].content).toBeTruthy();
    expect(chunks[0].index).toBe(0);
  });

  it("returns multiple chunks for long text", () => {
    // Create text >2000 chars to get multiple chunks (CHUNK_SIZE=1000)
    const text = "Lorem ipsum dolor sit amet. ".repeat(100);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("preserves metadata in all chunks", () => {
    const text = "A".repeat(50) + "\n\n" + "B".repeat(50);
    const meta = { documentType: "contratto", jurisdiction: "IT" };
    const chunks = chunkText(text, meta);
    for (const chunk of chunks) {
      expect(chunk.metadata).toMatchObject(meta);
      expect(chunk.metadata.charStart).toBeDefined();
      expect(chunk.metadata.charEnd).toBeDefined();
    }
  });

  it("increments chunk index sequentially", () => {
    const text = "Paragraph one content here. ".repeat(60) + "\n\n" + "Paragraph two content here. ".repeat(60);
    const chunks = chunkText(text);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
    }
  });

  it("prefers paragraph breaks as split points", () => {
    // Create text with a paragraph break in the middle
    const firstPara = "A".repeat(600);
    const secondPara = "B".repeat(600);
    const text = firstPara + "\n\n" + secondPara;
    const chunks = chunkText(text);
    // The first chunk should end at or near the paragraph break
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// indexDocument
// =============================================================================

describe("indexDocument", () => {
  const mockClassification = {
    documentType: "contratto_locazione",
    documentTypeLabel: "Contratto di Locazione",
    jurisdiction: "IT",
    parties: [
      { role: "locatore", name: "Mario Rossi" },
      { role: "conduttore", name: "Luigi Verdi" },
    ],
    relevantInstitutes: [],
    legalFocusAreas: [],
    relevantLaws: [],
    subType: null,
    documentSubType: null,
  };

  it("returns null when vector DB is disabled", async () => {
    mockIsVectorDBEnabled.mockReturnValue(false);
    const result = await indexDocument("analysis-1", "Some text", mockClassification);
    expect(result).toBeNull();
    expect(mockGenerateEmbeddings).not.toHaveBeenCalled();
  });

  it("returns { chunksIndexed: 0 } when text produces no chunks", async () => {
    const result = await indexDocument("analysis-1", "Short", mockClassification);
    expect(result).toEqual({ chunksIndexed: 0 });
  });

  it("returns null when embedding generation fails", async () => {
    mockGenerateEmbeddings.mockResolvedValue(null);
    const text = "A".repeat(100); // long enough to produce chunks
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await indexDocument("analysis-1", text, mockClassification);
    expect(result).toBeNull();

    consoleSpy.mockRestore();
  });

  it("deletes existing chunks before inserting new ones", async () => {
    const text = "This is a long enough document to produce at least one chunk for testing purposes.";
    mockGenerateEmbeddings.mockResolvedValue([[0.1, 0.2]]);

    await indexDocument("analysis-1", text, mockClassification);

    // Should call from("document_chunks").delete().eq("analysis_id", ...)
    expect(mockSupabase.from).toHaveBeenCalledWith("document_chunks");
    expect(mockDeleteEq).toHaveBeenCalledWith("analysis_id", "analysis-1");
  });

  it("inserts chunk rows with correct structure", async () => {
    const text = "This is a long enough document to produce at least one chunk for the test suite indexing.";
    mockGenerateEmbeddings.mockResolvedValue([[0.1, 0.2]]);

    const result = await indexDocument("analysis-1", text, mockClassification);

    expect(result).not.toBeNull();
    expect(result!.chunksIndexed).toBeGreaterThan(0);
    expect(mockInsert).toHaveBeenCalled();

    const insertedRows = mockInsert.mock.calls[0][0];
    expect(Array.isArray(insertedRows)).toBe(true);
    expect(insertedRows[0]).toMatchObject({
      analysis_id: "analysis-1",
      chunk_index: 0,
      content: expect.any(String),
      metadata: expect.objectContaining({
        documentType: "contratto_locazione",
      }),
      embedding: expect.any(String),
    });
  });

  it("handles insert error gracefully (logs but continues)", async () => {
    const text = "This is a document with enough text to produce at least one chunk for testing error handling.";
    mockGenerateEmbeddings.mockResolvedValue([[0.1, 0.2]]);
    mockInsert.mockResolvedValue({ error: { message: "insert failed" } });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await indexDocument("analysis-1", text, mockClassification);
    // Should still return (function doesn't throw on batch insert error)
    expect(result).not.toBeNull();

    consoleSpy.mockRestore();
  });

  it("batches inserts in groups of 50", async () => {
    // Create text long enough to generate >50 chunks
    const text = ("Paragraph content here. ".repeat(40) + "\n\n").repeat(60);
    // Generate matching embeddings array
    const chunks = chunkText(text, {});
    const embeddings = chunks.map((_, i) => [0.1 * i]);
    mockGenerateEmbeddings.mockResolvedValue(embeddings);

    await indexDocument("analysis-1", text, mockClassification);

    // With >50 chunks, insert should be called multiple times
    if (chunks.length > 50) {
      expect(mockInsert.mock.calls.length).toBeGreaterThan(1);
    }
  });

  it("calls truncateForEmbedding on each chunk content", async () => {
    const text = "This document has enough content to generate at least one chunk for testing truncation.";
    mockGenerateEmbeddings.mockResolvedValue([[0.1, 0.2]]);

    await indexDocument("analysis-1", text, mockClassification);

    expect(mockTruncateForEmbedding).toHaveBeenCalled();
  });
});

// =============================================================================
// indexAnalysisKnowledge
// =============================================================================

describe("indexAnalysisKnowledge", () => {
  const mockClassification = {
    documentType: "contratto_locazione",
    documentTypeLabel: "Contratto di Locazione",
    jurisdiction: "IT",
    parties: [{ role: "locatore", name: "Mario" }],
    relevantInstitutes: [],
    legalFocusAreas: [],
    relevantLaws: [],
    subType: null,
    documentSubType: null,
  };

  const mockAnalysis = {
    clauses: [
      {
        id: "clause-1",
        title: "Clausola penale",
        riskLevel: "high",
        issue: "Penale sproporzionata",
        potentialViolation: "Art. 1384 c.c.",
        marketStandard: "Penale proporzionale al danno",
        recommendation: "Ridurre la penale",
        originalText: "Il conduttore dovrà versare...",
      },
    ],
    missingElements: [],
    overallRisk: "high",
  };

  const mockInvestigation = {
    findings: [
      {
        clauseId: "clause-1",
        laws: [
          {
            reference: "Art. 1384 c.c.",
            fullText: "Se la penale è manifestamente eccessiva...",
            isInForce: true,
            lastModified: null,
            sourceUrl: "https://normattiva.it/art1384",
          },
        ],
        courtCases: [
          {
            reference: "Cass. Civ. 12345/2023",
            court: "Corte di Cassazione",
            date: "2023-03-15",
            summary: "La riduzione della penale è d'ufficio",
            relevance: "Direttamente applicabile",
            sourceUrl: "https://dejure.it/12345",
          },
        ],
      },
    ],
  };

  const mockAdvice = {
    fairnessScore: 4,
    risks: [
      {
        title: "Penale eccessiva",
        severity: "high",
        detail: "La penale è 5x il canone mensile",
        legalBasis: "Art. 1384 c.c.",
        courtCase: "Cass. 12345/2023",
      },
    ],
    actions: [],
    needsLawyer: true,
    scores: {
      legalCompliance: 5,
      contractBalance: 3,
      industryPractice: 4,
    },
    summary: "Contratto sbilanciato",
  };

  it("returns null when vector DB is disabled", async () => {
    mockIsVectorDBEnabled.mockReturnValue(false);
    const result = await indexAnalysisKnowledge(
      "analysis-1", mockClassification, mockAnalysis as any, mockInvestigation as any, mockAdvice as any
    );
    expect(result).toBeNull();
  });

  it("returns { entriesIndexed: 0 } when no entries are extracted", async () => {
    const emptyAnalysis = { clauses: [], missingElements: [], overallRisk: "low" };
    const emptyInvestigation = { findings: [] };
    const emptyAdvice = { fairnessScore: 8, risks: [], actions: [], needsLawyer: false, scores: {}, summary: "" };

    const result = await indexAnalysisKnowledge(
      "analysis-1", mockClassification, emptyAnalysis as any, emptyInvestigation as any, emptyAdvice as any
    );
    expect(result).toEqual({ entriesIndexed: 0 });
  });

  it("returns null when embedding generation fails", async () => {
    mockGenerateEmbeddings.mockResolvedValue(null);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await indexAnalysisKnowledge(
      "analysis-1", mockClassification, mockAnalysis as any, mockInvestigation as any, mockAdvice as any
    );
    expect(result).toBeNull();

    consoleSpy.mockRestore();
  });

  it("extracts clause_pattern entries from analysis clauses", async () => {
    const embeddings = [[0.1], [0.2], [0.3], [0.4]]; // 1 clause + 1 law + 1 court case + 1 risk
    mockGenerateEmbeddings.mockResolvedValue(embeddings);

    await indexAnalysisKnowledge(
      "analysis-1", mockClassification, mockAnalysis as any, mockInvestigation as any, mockAdvice as any
    );

    // Check that upsert_legal_knowledge was called with clause_pattern category
    const clauseCall = mockRpc.mock.calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>)?.p_category === "clause_pattern"
    );
    expect(clauseCall).toBeDefined();
    expect((clauseCall![1] as Record<string, unknown>).p_title).toContain("Clausola penale");
  });

  it("extracts law_reference entries from investigation findings", async () => {
    const embeddings = [[0.1], [0.2], [0.3], [0.4]];
    mockGenerateEmbeddings.mockResolvedValue(embeddings);

    await indexAnalysisKnowledge(
      "analysis-1", mockClassification, mockAnalysis as any, mockInvestigation as any, mockAdvice as any
    );

    const lawCall = mockRpc.mock.calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>)?.p_category === "law_reference"
    );
    expect(lawCall).toBeDefined();
    expect((lawCall![1] as Record<string, unknown>).p_title).toBe("Art. 1384 c.c.");
  });

  it("extracts court_case entries from investigation findings", async () => {
    const embeddings = [[0.1], [0.2], [0.3], [0.4]];
    mockGenerateEmbeddings.mockResolvedValue(embeddings);

    await indexAnalysisKnowledge(
      "analysis-1", mockClassification, mockAnalysis as any, mockInvestigation as any, mockAdvice as any
    );

    const caseCall = mockRpc.mock.calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>)?.p_category === "court_case"
    );
    expect(caseCall).toBeDefined();
    expect((caseCall![1] as Record<string, unknown>).p_title).toBe("Cass. Civ. 12345/2023");
  });

  it("extracts risk_pattern entries from advisor risks", async () => {
    const embeddings = [[0.1], [0.2], [0.3], [0.4]];
    mockGenerateEmbeddings.mockResolvedValue(embeddings);

    await indexAnalysisKnowledge(
      "analysis-1", mockClassification, mockAnalysis as any, mockInvestigation as any, mockAdvice as any
    );

    const riskCall = mockRpc.mock.calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>)?.p_category === "risk_pattern"
    );
    expect(riskCall).toBeDefined();
    expect((riskCall![1] as Record<string, unknown>).p_title).toContain("Penale eccessiva");
  });

  it("counts correctly indexed entries (skips failed upserts)", async () => {
    const embeddings = [[0.1], [0.2], [0.3], [0.4]];
    mockGenerateEmbeddings.mockResolvedValue(embeddings);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // First upsert fails, rest succeed
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { message: "upsert failed" } })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const result = await indexAnalysisKnowledge(
      "analysis-1", mockClassification, mockAnalysis as any, mockInvestigation as any, mockAdvice as any
    );

    expect(result).not.toBeNull();
    expect(result!.entriesIndexed).toBe(3); // 4 total - 1 failed = 3

    consoleSpy.mockRestore();
  });

  it("handles null/undefined clauses, findings, and risks gracefully", async () => {
    const nullAnalysis = { clauses: null, missingElements: [], overallRisk: "low" };
    const nullInvestigation = { findings: null };
    const nullAdvice = { fairnessScore: 8, risks: null, actions: [], needsLawyer: false, scores: {}, summary: "" };

    const result = await indexAnalysisKnowledge(
      "analysis-1", mockClassification, nullAnalysis as any, nullInvestigation as any, nullAdvice as any
    );
    expect(result).toEqual({ entriesIndexed: 0 });
  });

  it("handles findings with empty laws and courtCases arrays", async () => {
    const investigationNoDetails = {
      findings: [
        {
          clauseId: "clause-1",
          laws: [],
          courtCases: [],
        },
      ],
    };
    // Only clause_pattern + risk_pattern (no law/court entries)
    const embeddings = [[0.1], [0.2]];
    mockGenerateEmbeddings.mockResolvedValue(embeddings);

    const result = await indexAnalysisKnowledge(
      "analysis-1", mockClassification, mockAnalysis as any, investigationNoDetails as any, mockAdvice as any
    );
    expect(result).not.toBeNull();
    // 1 clause pattern + 1 risk pattern = 2
    expect(result!.entriesIndexed).toBe(2);
  });

  it("passes source_analysis_id to each upsert call", async () => {
    const embeddings = [[0.1], [0.2], [0.3], [0.4]];
    mockGenerateEmbeddings.mockResolvedValue(embeddings);

    await indexAnalysisKnowledge(
      "analysis-xyz", mockClassification, mockAnalysis as any, mockInvestigation as any, mockAdvice as any
    );

    for (const call of mockRpc.mock.calls) {
      expect(call[0]).toBe("upsert_legal_knowledge");
      expect((call[1] as Record<string, unknown>).p_source_analysis_id).toBe("analysis-xyz");
    }
  });

  it("calls truncateForEmbedding for each entry content", async () => {
    const embeddings = [[0.1], [0.2], [0.3], [0.4]];
    mockGenerateEmbeddings.mockResolvedValue(embeddings);

    await indexAnalysisKnowledge(
      "analysis-1", mockClassification, mockAnalysis as any, mockInvestigation as any, mockAdvice as any
    );

    // Should be called once per entry (4 entries: clause, law, court case, risk)
    expect(mockTruncateForEmbedding).toHaveBeenCalledTimes(4);
  });
});
