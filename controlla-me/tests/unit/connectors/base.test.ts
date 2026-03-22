import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock authenticated-base to break circular dependency (base.ts re-exports authenticated-base.ts)
vi.mock("@/lib/staff/data-connector/connectors/authenticated-base", () => ({
  AuthenticatedBaseConnector: class {},
}));

import { BaseConnector } from "@/lib/staff/data-connector/connectors/base";
import type {
  ConnectResult,
  FetchResult,
  DataSource,
} from "@/lib/staff/data-connector/types";

// ─── Concrete subclass for testing abstract BaseConnector ───

class TestConnector extends BaseConnector<string> {
  async connect(): Promise<ConnectResult> {
    return {
      sourceId: this.source.id,
      ok: true,
      message: "test",
      census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
    };
  }
  async fetchAll(): Promise<FetchResult<string>> {
    return {
      sourceId: this.source.id,
      items: [],
      fetchedAt: new Date().toISOString(),
      metadata: {},
    };
  }
  async fetchDelta(): Promise<FetchResult<string>> {
    return {
      sourceId: this.source.id,
      items: [],
      fetchedAt: new Date().toISOString(),
      metadata: {},
    };
  }

  // Expose protected methods for testing
  public testFetchWithRetry(
    url: string,
    options?: RequestInit,
    maxRetries?: number
  ) {
    return this.fetchWithRetry(url, options, maxRetries);
  }
  public testFetchJSON<R = unknown>(url: string, options?: RequestInit) {
    return this.fetchJSON<R>(url, options);
  }
  public testCleanText(text: string) {
    return this.cleanText(text);
  }
  public testRateLimitPause() {
    return this.rateLimitPause();
  }
  public testSleep(ms: number) {
    return this.sleep(ms);
  }
}

function makeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: "test_source",
    name: "Test Source",
    shortName: "Test",
    dataType: "legal-articles",
    vertical: "legal",
    connector: "test",
    config: {},
    lifecycle: "planned",
    estimatedItems: 100,
    ...overrides,
  };
}

describe("BaseConnector", () => {
  let connector: TestConnector;
  let logSpy: ReturnType<typeof vi.fn<(msg: string) => void>>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.fn();
    connector = new TestConnector(makeSource(), logSpy);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── fetchWithRetry ───

  describe("fetchWithRetry", () => {
    it("returns response on successful first attempt", async () => {
      const mockResponse = new Response("ok", { status: 200 });
      fetchMock.mockResolvedValueOnce(mockResponse);

      const result = await connector.testFetchWithRetry("https://example.com");
      expect(result).toBe(mockResponse);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("injects browser User-Agent header", async () => {
      fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));

      await connector.testFetchWithRetry("https://example.com");

      const callArgs = fetchMock.mock.calls[0];
      const headers = callArgs[1]?.headers;
      expect(headers).toBeDefined();
      expect(headers["User-Agent"]).toContain("Mozilla/5.0");
      expect(headers["User-Agent"]).toContain("Chrome");
    });

    it("preserves custom headers alongside User-Agent", async () => {
      fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));

      await connector.testFetchWithRetry("https://example.com", {
        headers: { "Content-Type": "application/json", "X-Custom": "value" },
      });

      const callArgs = fetchMock.mock.calls[0];
      const headers = callArgs[1]?.headers;
      expect(headers["User-Agent"]).toContain("Mozilla");
      expect(headers["content-type"]).toBe("application/json");
      expect(headers["x-custom"]).toBe("value");
    });

    it("retries on network error with exponential backoff", async () => {
      const networkError = new Error("ECONNREFUSED");
      fetchMock
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(new Response("ok", { status: 200 }));

      const resultPromise = connector.testFetchWithRetry(
        "https://example.com",
        undefined,
        3
      );

      // First retry: 2^1 * 1000 = 2000ms
      await vi.advanceTimersByTimeAsync(2000);
      // Second retry: 2^2 * 1000 = 4000ms
      await vi.advanceTimersByTimeAsync(4000);

      const result = await resultPromise;
      expect(result.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("logs retry attempts", async () => {
      fetchMock
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(new Response("ok", { status: 200 }));

      const resultPromise = connector.testFetchWithRetry(
        "https://example.com",
        undefined,
        2
      );

      await vi.advanceTimersByTimeAsync(2000);

      await resultPromise;
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("[RETRY]")
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("test_source")
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("tentativo 1/2")
      );
    });

    it("throws last error after all retries exhausted", async () => {
      const error1 = new Error("first");
      const error2 = new Error("second");
      const error3 = new Error("third");
      const finalError = new Error("final");
      fetchMock
        .mockRejectedValueOnce(error1)
        .mockRejectedValueOnce(error2)
        .mockRejectedValueOnce(error3)
        .mockRejectedValueOnce(finalError);

      const resultPromise = connector
        .testFetchWithRetry("https://example.com", undefined, 3)
        .catch((e: Error) => e);

      // Advance through all backoff delays: 2s + 4s + 8s
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      await vi.advanceTimersByTimeAsync(8000);

      const result = await resultPromise;
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe("final");
      expect(fetchMock).toHaveBeenCalledTimes(4); // initial + 3 retries
    });

    it("respects maxRetries=0 (no retries)", async () => {
      fetchMock.mockRejectedValueOnce(new Error("fail"));

      await expect(
        connector.testFetchWithRetry("https://example.com", undefined, 0)
      ).rejects.toThrow("fail");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not retry on successful HTTP error responses (4xx, 5xx)", async () => {
      // fetchWithRetry only retries on network exceptions, not on HTTP error status codes
      fetchMock.mockResolvedValueOnce(
        new Response("Not Found", { status: 404 })
      );

      const result = await connector.testFetchWithRetry("https://example.com");
      expect(result.status).toBe(404);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("passes through other RequestInit options (method, body)", async () => {
      fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));

      await connector.testFetchWithRetry("https://example.com", {
        method: "POST",
        body: JSON.stringify({ key: "value" }),
      });

      const callArgs = fetchMock.mock.calls[0];
      expect(callArgs[1]?.method).toBe("POST");
      expect(callArgs[1]?.body).toBe('{"key":"value"}');
    });
  });

  // ─── fetchJSON ───

  describe("fetchJSON", () => {
    it("returns parsed JSON on success", async () => {
      const data = { items: [1, 2, 3] };
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(data), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const result = await connector.testFetchJSON<{ items: number[] }>(
        "https://example.com/api"
      );
      expect(result).toEqual(data);
    });

    it("throws with HTTP status on non-OK response", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("Server Error", { status: 500 })
      );

      await expect(
        connector.testFetchJSON("https://example.com/api")
      ).rejects.toThrow("HTTP 500");
    });

    it("includes URL in error message", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("Forbidden", { status: 403 })
      );

      await expect(
        connector.testFetchJSON("https://example.com/api/data")
      ).rejects.toThrow("https://example.com/api/data");
    });

    it("truncates long error bodies to 200 chars", async () => {
      const longBody = "x".repeat(500);
      fetchMock.mockResolvedValueOnce(
        new Response(longBody, { status: 400 })
      );

      try {
        await connector.testFetchJSON("https://example.com");
        expect.unreachable("should have thrown");
      } catch (err) {
        const msg = (err as Error).message;
        // The error body should be truncated
        expect(msg).toContain("HTTP 400");
        expect(msg.length).toBeLessThan(500);
      }
    });

    it("handles text() failure gracefully in error path", async () => {
      const mockResponse = {
        ok: false,
        status: 502,
        text: () => Promise.reject(new Error("text read failure")),
        json: () => Promise.reject(new Error("json read failure")),
      } as unknown as Response;
      fetchMock.mockResolvedValueOnce(mockResponse);

      await expect(
        connector.testFetchJSON("https://example.com")
      ).rejects.toThrow("HTTP 502");
    });
  });

  // ─── cleanText ───

  describe("cleanText", () => {
    it("replaces Italian HTML entities", () => {
      expect(connector.testCleanText("caff&egrave;")).toBe("caffè");
      expect(connector.testCleanText("citt&agrave;")).toBe("città");
      expect(connector.testCleanText("per&ograve;")).toBe("però");
      expect(connector.testCleanText("gi&ugrave;")).toBe("giù");
      expect(connector.testCleanText("cos&igrave;")).toBe("così");
      // Note: &Egrave; is matched by /&egrave;/gi (case-insensitive) → becomes lowercase "è"
      expect(connector.testCleanText("&Egrave; vero")).toBe("è vero");
    });

    it("replaces common HTML entities", () => {
      expect(connector.testCleanText("&nbsp;")).toBe("");
      expect(connector.testCleanText("A &amp; B")).toBe("A & B");
      expect(connector.testCleanText("&lt;tag&gt;")).toBe("<tag>");
      expect(connector.testCleanText("&quot;hello&quot;")).toBe('"hello"');
      expect(connector.testCleanText("it&#39;s")).toBe("it's");
      expect(connector.testCleanText("it&#039;s")).toBe("it's");
    });

    it("collapses multiple newlines to double", () => {
      expect(connector.testCleanText("a\n\n\n\n\nb")).toBe("a\n\nb");
    });

    it("collapses multiple spaces and tabs to single space", () => {
      expect(connector.testCleanText("hello   world")).toBe("hello world");
      expect(connector.testCleanText("hello\t\tworld")).toBe("hello world");
      expect(connector.testCleanText("hello \t world")).toBe("hello world");
    });

    it("trims leading and trailing whitespace", () => {
      expect(connector.testCleanText("  hello  ")).toBe("hello");
    });

    it("handles combined entities and whitespace", () => {
      const input = "  Art. 1 &mdash; Caff&egrave;  &amp;  T&egrave;   ";
      const result = connector.testCleanText(input);
      expect(result).toContain("Caffè");
      expect(result).toContain("& Tè");
    });

    it("handles empty string", () => {
      expect(connector.testCleanText("")).toBe("");
    });
  });

  // ─── rateLimitPause ───

  describe("rateLimitPause", () => {
    it("pauses for 1 second", async () => {
      const start = Date.now();
      const pausePromise = connector.testRateLimitPause();
      await vi.advanceTimersByTimeAsync(1000);
      await pausePromise;
      // With fake timers, 1000ms should have been advanced
      expect(Date.now() - start).toBe(1000);
    });
  });

  // ─── sleep ───

  describe("sleep", () => {
    it("resolves after specified ms", async () => {
      const start = Date.now();
      const sleepPromise = connector.testSleep(500);
      await vi.advanceTimersByTimeAsync(500);
      await sleepPromise;
      expect(Date.now() - start).toBe(500);
    });
  });

  // ─── Constructor ───

  describe("constructor", () => {
    it("accepts a custom log function", () => {
      const customLog = vi.fn();
      const c = new TestConnector(makeSource(), customLog);
      // The log function is stored internally — verify via a method that logs
      fetchMock
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(new Response("ok"));

      const promise = c.testFetchWithRetry("https://example.com", undefined, 1);
      vi.advanceTimersByTimeAsync(2000).then(() => promise.catch(() => {}));

      // After the timer advances, the retry log should have been called
      return vi.advanceTimersByTimeAsync(2000).then(async () => {
        await promise;
        expect(customLog).toHaveBeenCalled();
      });
    });

    it("defaults to console.log when no log function provided", () => {
      // Should not throw
      const c = new TestConnector(makeSource());
      expect(c).toBeDefined();
    });
  });
});
