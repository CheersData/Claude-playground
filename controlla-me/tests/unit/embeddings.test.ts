import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for lib/embeddings.ts
 *
 * The module uses global fetch() to call Voyage AI API.
 * We mock fetch to avoid real HTTP calls.
 *
 * Note: vitest.setup.ts deletes VOYAGE_API_KEY, so by default
 * the vector DB features are disabled. We set/unset it per test.
 *
 * Coverage:
 * - EMBEDDING_DIMENSIONS constant
 * - isVectorDBEnabled: with key, without key, empty key
 * - truncateForEmbedding: under limit, at limit, over limit, custom limit, empty, zero limit
 * - generateEmbedding: no key, success, query input_type, custom model, delegates to generateEmbeddings
 * - generateEmbeddings: no key, empty input, single text, multiple texts, index sorting,
 *   non-429 error, 429 retry success, 429 retry failure, batching (128),
 *   custom model, Authorization header, 401 error, 403 error,
 *   single item batch, exactly 128 items (boundary), 3 batches (384 items),
 *   retry sorts results correctly, endpoint URL, Content-Type header
 */

import {
  isVectorDBEnabled,
  generateEmbedding,
  generateEmbeddings,
  truncateForEmbedding,
  EMBEDDING_DIMENSIONS,
} from "@/lib/embeddings";

// Helper to create a mock Voyage API response
function makeVoyageResponse(
  embeddings: number[][],
  totalTokens: number = 100
) {
  return {
    data: embeddings.map((emb, i) => ({ embedding: emb, index: i })),
    usage: { total_tokens: totalTokens },
  };
}

// Helper to create a mock Response
function mockFetchResponse(body: unknown, status: number = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe("lib/embeddings", () => {
  let originalVoyageKey: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalVoyageKey = process.env.VOYAGE_API_KEY;
  });

  afterEach(() => {
    // Restore original state
    if (originalVoyageKey !== undefined) {
      process.env.VOYAGE_API_KEY = originalVoyageKey;
    } else {
      delete process.env.VOYAGE_API_KEY;
    }
    vi.restoreAllMocks();
  });

  describe("EMBEDDING_DIMENSIONS", () => {
    it("exports 1024 dimensions", () => {
      expect(EMBEDDING_DIMENSIONS).toBe(1024);
    });

    it("is a number", () => {
      expect(typeof EMBEDDING_DIMENSIONS).toBe("number");
    });
  });

  describe("isVectorDBEnabled", () => {
    it("returns false when VOYAGE_API_KEY is not set", () => {
      delete process.env.VOYAGE_API_KEY;
      expect(isVectorDBEnabled()).toBe(false);
    });

    it("returns true when VOYAGE_API_KEY is set", () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";
      expect(isVectorDBEnabled()).toBe(true);
    });

    it("returns false when VOYAGE_API_KEY is empty string", () => {
      process.env.VOYAGE_API_KEY = "";
      expect(isVectorDBEnabled()).toBe(false);
    });

    it("returns true for any non-empty VOYAGE_API_KEY value", () => {
      process.env.VOYAGE_API_KEY = "x";
      expect(isVectorDBEnabled()).toBe(true);
    });
  });

  describe("truncateForEmbedding", () => {
    it("returns text unchanged when under limit", () => {
      const text = "Short text";
      expect(truncateForEmbedding(text)).toBe(text);
    });

    it("returns text unchanged when exactly at limit", () => {
      const text = "x".repeat(8000);
      expect(truncateForEmbedding(text)).toBe(text);
    });

    it("truncates text over default limit and appends ellipsis", () => {
      const text = "x".repeat(8001);
      const result = truncateForEmbedding(text);
      expect(result.length).toBe(8003); // 8000 chars + "..."
      expect(result.endsWith("...")).toBe(true);
    });

    it("respects custom maxChars parameter", () => {
      const text = "Hello, this is a test sentence that goes over the limit.";
      const result = truncateForEmbedding(text, 10);
      expect(result).toBe("Hello, thi...");
      expect(result.length).toBe(13); // 10 + "..."
    });

    it("handles empty string", () => {
      expect(truncateForEmbedding("")).toBe("");
    });

    it("handles maxChars=0 (truncates everything, appends ellipsis)", () => {
      const result = truncateForEmbedding("some text", 0);
      expect(result).toBe("...");
    });

    it("handles single character over limit", () => {
      const text = "ab";
      const result = truncateForEmbedding(text, 1);
      expect(result).toBe("a...");
    });

    it("preserves content before the truncation point", () => {
      const text = "ABCDEFGHIJ";
      const result = truncateForEmbedding(text, 5);
      expect(result.startsWith("ABCDE")).toBe(true);
      expect(result).toBe("ABCDE...");
    });
  });

  describe("generateEmbedding (single text)", () => {
    it("returns null when VOYAGE_API_KEY is not set", async () => {
      delete process.env.VOYAGE_API_KEY;
      const result = await generateEmbedding("test text");
      expect(result).toBeNull();
    });

    it("does not call fetch when VOYAGE_API_KEY is not set", async () => {
      delete process.env.VOYAGE_API_KEY;
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await generateEmbedding("test text");

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("calls Voyage API and returns the embedding vector", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";
      const mockEmbedding = [0.1, 0.2, 0.3];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse([mockEmbedding], 50))
      );

      const result = await generateEmbedding("test text");
      expect(result).toEqual(mockEmbedding);

      // Verify fetch was called with correct params
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.voyageai.com/v1/embeddings",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer pa-test-key",
          },
        })
      );

      // Verify body contains correct model and input
      const callArgs = vi.mocked(globalThis.fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.model).toBe("voyage-law-2");
      expect(body.input).toEqual(["test text"]);
      expect(body.input_type).toBe("document");
    });

    it("uses query input_type when specified", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse([[0.1, 0.2]], 30))
      );

      await generateEmbedding("search query", "query");

      const callArgs = vi.mocked(globalThis.fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.input_type).toBe("query");
    });

    it("uses custom model when specified", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse([[0.1]], 20))
      );

      await generateEmbedding("text", "document", "voyage-3");

      const callArgs = vi.mocked(globalThis.fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.model).toBe("voyage-3");
    });

    it("wraps single text into array (delegates to generateEmbeddings)", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse([[0.5, 0.6]], 25))
      );

      await generateEmbedding("single text");

      const callArgs = vi.mocked(globalThis.fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.input).toEqual(["single text"]);
      expect(body.input).toHaveLength(1);
    });

    it("returns null when API returns error for single text", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse({ error: "Bad request" }, 400)
      );

      const result = await generateEmbedding("test");
      expect(result).toBeNull();
    });
  });

  describe("generateEmbeddings (batch)", () => {
    it("returns null when VOYAGE_API_KEY is not set", async () => {
      delete process.env.VOYAGE_API_KEY;
      const result = await generateEmbeddings(["text1", "text2"]);
      expect(result).toBeNull();
    });

    it("does not call fetch when VOYAGE_API_KEY is not set", async () => {
      delete process.env.VOYAGE_API_KEY;
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await generateEmbeddings(["text1"]);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns empty array for empty input", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";
      const result = await generateEmbeddings([]);
      expect(result).toEqual([]);
    });

    it("does not call fetch for empty input array", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await generateEmbeddings([]);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("generates embeddings for multiple texts", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";
      const emb1 = [0.1, 0.2];
      const emb2 = [0.3, 0.4];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse([emb1, emb2], 100))
      );

      const result = await generateEmbeddings(["text1", "text2"]);
      expect(result).toEqual([emb1, emb2]);
    });

    it("generates embedding for a single text", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";
      const emb = [0.1, 0.2, 0.3, 0.4];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse([emb], 50))
      );

      const result = await generateEmbeddings(["only one text"]);
      expect(result).toEqual([emb]);
      expect(result).toHaveLength(1);
    });

    it("sorts results by index to maintain order", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";

      // Return in reverse index order to test sorting
      const responseBody = {
        data: [
          { embedding: [0.3, 0.4], index: 1 },
          { embedding: [0.1, 0.2], index: 0 },
        ],
        usage: { total_tokens: 80 },
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(responseBody)
      );

      const result = await generateEmbeddings(["text1", "text2"]);
      // Should be sorted by index: index 0 first, index 1 second
      expect(result).toEqual([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);
    });

    it("sorts results correctly with 3 items in scrambled order", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";

      const responseBody = {
        data: [
          { embedding: [0.7, 0.8], index: 2 },
          { embedding: [0.1, 0.2], index: 0 },
          { embedding: [0.4, 0.5], index: 1 },
        ],
        usage: { total_tokens: 120 },
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(responseBody)
      );

      const result = await generateEmbeddings(["a", "b", "c"]);
      expect(result).toEqual([
        [0.1, 0.2],
        [0.4, 0.5],
        [0.7, 0.8],
      ]);
    });

    it("returns null on non-429 API error", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse({ error: "Internal Server Error" }, 500)
      );

      const result = await generateEmbeddings(["test text"]);
      expect(result).toBeNull();
    });

    it("returns null on 401 unauthorized", async () => {
      process.env.VOYAGE_API_KEY = "pa-invalid-key";

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse({ error: "Invalid API key" }, 401)
      );

      const result = await generateEmbeddings(["test"]);
      expect(result).toBeNull();
    });

    it("returns null on 403 forbidden", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse({ error: "Forbidden" }, 403)
      );

      const result = await generateEmbeddings(["test"]);
      expect(result).toBeNull();
    });

    it("retries once on 429 rate limit and succeeds", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";
      const mockEmb = [0.5, 0.6];

      // Use fake timers to avoid the real 5s delay
      vi.useFakeTimers();

      const fetchMock = vi.spyOn(globalThis, "fetch");

      // First call: 429 rate limit
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse({ error: "Rate limit exceeded" }, 429)
      );
      // Second call (retry): success
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse([mockEmb], 50))
      );

      const resultPromise = generateEmbeddings(["test text"]);

      // Advance past the 5s delay
      await vi.advanceTimersByTimeAsync(5000);

      const result = await resultPromise;
      expect(result).toEqual([mockEmb]);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("retry after 429 sorts results by index correctly", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";

      vi.useFakeTimers();

      const fetchMock = vi.spyOn(globalThis, "fetch");

      // First call: 429
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse({ error: "Rate limit exceeded" }, 429)
      );
      // Retry: success with reversed indices
      const retryResponse = {
        data: [
          { embedding: [0.3, 0.4], index: 1 },
          { embedding: [0.1, 0.2], index: 0 },
        ],
        usage: { total_tokens: 80 },
      };
      fetchMock.mockResolvedValueOnce(mockFetchResponse(retryResponse));

      const resultPromise = generateEmbeddings(["text1", "text2"]);
      await vi.advanceTimersByTimeAsync(5000);

      const result = await resultPromise;
      expect(result).toEqual([
        [0.1, 0.2],
        [0.3, 0.4],
      ]);

      vi.useRealTimers();
    });

    it("returns null when retry after 429 also fails", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";

      vi.useFakeTimers();

      const fetchMock = vi.spyOn(globalThis, "fetch");

      // First call: 429
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse({ error: "Rate limit exceeded" }, 429)
      );
      // Retry: also fails
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse({ error: "Still rate limited" }, 429)
      );

      const resultPromise = generateEmbeddings(["test text"]);

      await vi.advanceTimersByTimeAsync(5000);

      const result = await resultPromise;
      expect(result).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("processes large input in batches of 128", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";

      // Create 200 texts (should be split into 2 batches: 128 + 72)
      const texts = Array.from({ length: 200 }, (_, i) => `text-${i}`);
      const batch1Embeddings = Array.from({ length: 128 }, () => [0.1]);
      const batch2Embeddings = Array.from({ length: 72 }, () => [0.2]);

      const fetchMock = vi.spyOn(globalThis, "fetch");
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse(batch1Embeddings, 500))
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse(batch2Embeddings, 300))
      );

      const result = await generateEmbeddings(texts);
      expect(result).toHaveLength(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Verify first batch has 128 inputs
      const call1Body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
      expect(call1Body.input).toHaveLength(128);

      // Verify second batch has 72 inputs
      const call2Body = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
      expect(call2Body.input).toHaveLength(72);
    });

    it("handles exactly 128 items in a single batch (boundary)", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";
      const texts = Array.from({ length: 128 }, (_, i) => `text-${i}`);
      const embeddings = Array.from({ length: 128 }, () => [0.1]);

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse(embeddings, 500))
      );

      const result = await generateEmbeddings(texts);
      expect(result).toHaveLength(128);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("handles 129 items in 2 batches (128 + 1)", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";
      const texts = Array.from({ length: 129 }, (_, i) => `text-${i}`);
      const batch1 = Array.from({ length: 128 }, () => [0.1]);
      const batch2 = [[0.2]];

      const fetchMock = vi.spyOn(globalThis, "fetch");
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse(batch1, 500))
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse(batch2, 10))
      );

      const result = await generateEmbeddings(texts);
      expect(result).toHaveLength(129);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("handles 3 batches (384 items = 128 + 128 + 128)", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";
      const texts = Array.from({ length: 384 }, (_, i) => `text-${i}`);

      const fetchMock = vi.spyOn(globalThis, "fetch");
      for (let b = 0; b < 3; b++) {
        const batchEmbs = Array.from({ length: 128 }, () => [0.1 * (b + 1)]);
        fetchMock.mockResolvedValueOnce(
          mockFetchResponse(makeVoyageResponse(batchEmbs, 300))
        );
      }

      const result = await generateEmbeddings(texts);
      expect(result).toHaveLength(384);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("uses default model voyage-law-2", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse([[0.1]], 10))
      );

      await generateEmbeddings(["text"]);

      const callArgs = vi.mocked(globalThis.fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.model).toBe("voyage-law-2");
    });

    it("uses custom model when specified", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse([[0.1]], 10))
      );

      await generateEmbeddings(["text"], "document", "voyage-3");

      const callArgs = vi.mocked(globalThis.fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.model).toBe("voyage-3");
    });

    it("passes Authorization header with Voyage API key", async () => {
      process.env.VOYAGE_API_KEY = "pa-my-secret-key";

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse([[0.1]], 10))
      );

      await generateEmbeddings(["text"]);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer pa-my-secret-key",
          }),
        })
      );
    });

    it("sends POST request to the correct Voyage API URL", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse([[0.1]], 10))
      );

      await generateEmbeddings(["text"]);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.voyageai.com/v1/embeddings",
        expect.any(Object)
      );
    });

    it("sends Content-Type application/json header", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse([[0.1]], 10))
      );

      await generateEmbeddings(["text"]);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
        })
      );
    });

    it("sends input_type in the request body", async () => {
      process.env.VOYAGE_API_KEY = "pa-test-key";

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        mockFetchResponse(makeVoyageResponse([[0.1]], 10))
      );

      await generateEmbeddings(["query text"], "query");

      const callArgs = vi.mocked(globalThis.fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.input_type).toBe("query");
    });
  });
});
