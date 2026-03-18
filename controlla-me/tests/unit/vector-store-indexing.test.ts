import { describe, it, expect, vi } from "vitest";

const mockGenerateEmbedding = vi.hoisted(() => vi.fn());
const mockGenerateEmbeddings = vi.hoisted(() => vi.fn());
const mockIsVectorDBEnabled = vi.hoisted(() => vi.fn());
const mockTruncateForEmbedding = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn().mockReturnValue({
    delete: vi.fn().mockReturnValue({ eq: mockEq }),
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

import { chunkText } from "@/lib/vector-store";

describe("chunkText", () => {
  it("test 1", () => {
    expect(chunkText("")).toEqual([]);
  });

  it("test 2", () => {
    expect(chunkText("Short.")).toEqual([]);
  });
});
