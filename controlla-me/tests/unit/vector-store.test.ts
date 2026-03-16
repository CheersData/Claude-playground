/**
 * Tests: lib/vector-store.ts (P0 — RAG pipeline)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerateEmbedding = vi.hoisted(() => vi.fn());
const mockGenerateEmbeddings = vi.hoisted(() => vi.fn());
const mockIsVectorDBEnabled = vi.hoisted(() => vi.fn());
const mockTruncateForEmbedding = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/embeddings", () => ({
  generateEmbedding: mockGenerateEmbedding,
  generateEmbeddings: mockGenerateEmbeddings,
  isVectorDBEnabled: mockIsVectorDBEnabled,
  truncateForEmbedding: mockTruncateForEmbedding,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      delete: () => ({ eq: mockEq }),
      insert: mockInsert,
    }),
    rpc: mockRpc,
  }),
}));

import { chunkText, indexDocument } from "@/lib/vector-store";
import type { ClassificationResult } from "@/lib/types";

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
  mockEq.mockResolvedValue({ error: null });
  mockInsert.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ data: [], error: null });
});

describe("chunkText", () => {
  it("empty/short text => empty array", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("Short.")).toEqual([]);
  });

  it("meaningful text => chunks with metadata", () => {
    const chunks = chunkText("Legal content. ".repeat(30), { src: "test" });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0].metadata.src).toBe("test");
    expect(typeof chunks[0].metadata.charStart).toBe("number");
  });

  it("long text => multiple chunks, sequential indices", () => {
    const chunks = chunkText("A".repeat(3000));
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => expect(c.index).toBe(i));
  });

  it("100K chars no infinite loop", () => {
    const chunks = chunkText("Legal. ".repeat(15000));
    expect(chunks.length).toBeGreaterThan(10);
    expect(chunks.length).toBeLessThan(500);
  });
});

describe("indexDocument", () => {
  it("disabled => null", async () => {
    mockIsVectorDBEnabled.mockReturnValue(false);
    expect(await indexDocument("id", "text", makeClassification())).toBeNull();
  });

  it("short text => chunksIndexed 0", async () => {
    expect(await indexDocument("id", "Short", makeClassification())).toEqual({ chunksIndexed: 0 });
  });

  it("embeddings fail => null", async () => {
    mockGenerateEmbeddings.mockResolvedValue(null);
    expect(await indexDocument("id", "Legal content. ".repeat(30), makeClassification())).toBeNull();
  });

  it("success => deletes old, inserts new, returns count", async () => {
    mockGenerateEmbeddings.mockResolvedValue([[0.1]]);
    const result = await indexDocument("a1", "Legal content. ".repeat(30), makeClassification());
    expect(mockEq).toHaveBeenCalledWith("analysis_id", "a1");
    expect(mockInsert).toHaveBeenCalled();
    expect(result!.chunksIndexed).toBeGreaterThanOrEqual(1);
  });
});
