/**
 * Minimal test to isolate worker crash in vector-store tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateEmbedding = vi.hoisted(() => vi.fn());
const mockGenerateEmbeddings = vi.hoisted(() => vi.fn());
const mockIsVectorDBEnabled = vi.hoisted(() => vi.fn());
const mockTruncateForEmbedding = vi.hoisted(() => vi.fn());

vi.mock("@/lib/embeddings", () => ({
  generateEmbedding: mockGenerateEmbedding,
  generateEmbeddings: mockGenerateEmbeddings,
  isVectorDBEnabled: mockIsVectorDBEnabled,
  truncateForEmbedding: mockTruncateForEmbedding,
}));

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn().mockReturnValue({
    delete: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  }),
  rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
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

function makeClassification(): ClassificationResult {
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
    summary: "Test",
    confidence: 0.95,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsVectorDBEnabled.mockReturnValue(true);
  mockTruncateForEmbedding.mockImplementation((t: string) => t);
  mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  mockGenerateEmbeddings.mockResolvedValue([[0.1, 0.2, 0.3]]);
});

describe("chunkText", () => {
  it("returns empty for empty string", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("handles 100K chars", () => {
    const chunks = chunkText("Legal. ".repeat(15000));
    expect(chunks.length).toBeGreaterThan(10);
  });
});

describe("indexDocument", () => {
  it("disabled => null", async () => {
    mockIsVectorDBEnabled.mockReturnValue(false);
    expect(await indexDocument("id", "text", makeClassification())).toBeNull();
  });
});

describe("searchSimilarDocuments", () => {
  it("disabled => empty", async () => {
    mockIsVectorDBEnabled.mockReturnValue(false);
    expect(await searchSimilarDocuments("q")).toEqual([]);
  });
});

describe("searchLegalKnowledge", () => {
  it("disabled => empty", async () => {
    mockIsVectorDBEnabled.mockReturnValue(false);
    expect(await searchLegalKnowledge("q")).toEqual([]);
  });
});

describe("buildRAGContext", () => {
  it("disabled => empty string", async () => {
    mockIsVectorDBEnabled.mockReturnValue(false);
    expect(await buildRAGContext("q")).toBe("");
  });
});
