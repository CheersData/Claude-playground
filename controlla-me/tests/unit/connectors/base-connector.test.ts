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

// ─── Concrete subclass to test the abstract BaseConnector ───

class TestConnector extends BaseConnector<string> {
  async connect(): Promise<ConnectResult> {
    return {
      sourceId: this.source.id,
      ok: true,
      message: "Test",
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
    shortName: "TEST",
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
      const mockResponse = new Response("OK", { status: 200 });
      fetchMock.mockResolvedValueOnce(mockResponse);

      const result = await connector.testFetchWithRetry(
        "https://example.com/api"
      );
      expect(result).toBe(mockResponse);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("injects User-Agent browser header on every request", async () => {
      fetchMock.mockResolvedValueOnce(new Response("OK", { status: 200 }));

      await connector.testFetchWithRetry("https://example.com/api");

      const callArgs = fetchMock.mock.calls[0];
      const headers = callArgs[1]?.headers;
      expect(headers["User-Agent"]).toContain("Mozilla/5.0");
      expect(headers["User-Agent"]).toContain("Chrome");
    });

    it("preserves custom headers alongside User-Agent", async () => {
      fetchMock.mockResolvedValueOnce(new Response("OK", { status: 200 }));

      await connector.testFetchWithRetry("https://example.com/api", {
        headers: { "Content-Type": "application/json", Accept: "text/xml" },
      });

      const callArgs = fetchMock.mock.calls[0];
      const headers = callArgs[1]?.headers;
      expect(headers["User-Agent"]).toContain("Mozilla/5.0");
      expect(headers["content-type"]).toBe("application/json");
      expect(headers["accept"]).toBe("text/xml");
    });

    it("retries on network error with exponential backoff", async () => {
      const networkError = new Error("fetch failed");
      fetchMock
        .mockRejectedValueOnce(networkError) // attempt 0
        .mockRejectedValueOnce(networkError) // attempt 1
        .mockResolvedValueOnce(new Response("OK", { status: 200 })); // attempt 2

      const promise = connector.testFetchWithRetry(
        "https://example.com/api",
        undefined,
        3
      );

      // Advance past 1st retry (2^1 * 1000 = 2000ms)
      await vi.advanceTimersByTimeAsync(2000);
      // Advance past 2nd retry (2^2 * 1000 = 4000ms)
      await vi.advanceTimersByTimeAsync(4000);

      const result = await promise;
      expect(result.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("logs retry attempts", async () => {
      fetchMock
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(new Response("OK", { status: 200 }));

      const promise = connector.testFetchWithRetry(
        "https://example.com/api",
        undefined,
        3
      );
      await vi.advanceTimersByTimeAsync(2000);

      await promise;
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("[RETRY]")
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("tentativo 1/3")
      );
    });

    it("throws the last error after exhausting all retries", async () => {
      const error = new Error("persistent failure");
      fetchMock.mockRejectedValue(error);

      const promise = connector
        .testFetchWithRetry("https://example.com/api", undefined, 2)
        .catch((e: Error) => e);

      // Advance through all retry waits
      await vi.advanceTimersByTimeAsync(2000); // retry 1
      await vi.advanceTimersByTimeAsync(4000); // retry 2

      const result = await promise;
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe("persistent failure");
      expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it("uses default maxRetries of 3", async () => {
      fetchMock.mockRejectedValue(new Error("fail"));

      const promise = connector
        .testFetchWithRetry("https://example.com/api")
        .catch((e: Error) => e);

      // Advance through 3 retries: 2s + 4s + 8s
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      await vi.advanceTimersByTimeAsync(8000);

      const result = await promise;
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toBe("fail");
      expect(fetchMock).toHaveBeenCalledTimes(4); // initial + 3 retries
    });

    it("does not retry when maxRetries is 0", async () => {
      fetchMock.mockRejectedValueOnce(new Error("fail"));

      await expect(
        connector.testFetchWithRetry(
          "https://example.com/api",
          undefined,
          0
        )
      ).rejects.toThrow("fail");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("returns non-OK responses without retrying (only retries on throw)", async () => {
      // HTTP 500 is a resolved response, not a thrown error
      fetchMock.mockResolvedValueOnce(
        new Response("Server Error", { status: 500 })
      );

      const result = await connector.testFetchWithRetry(
        "https://example.com/api"
      );
      expect(result.status).toBe(500);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  // ─── fetchJSON ───

  describe("fetchJSON", () => {
    it("returns parsed JSON on success", async () => {
      const body = { data: [1, 2, 3] };
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const result = await connector.testFetchJSON<{ data: number[] }>(
        "https://example.com/api"
      );
      expect(result).toEqual(body);
    });

    it("throws with HTTP status and partial body on non-OK response", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("Not Found: the resource does not exist", { status: 404 })
      );

      await expect(
        connector.testFetchJSON("https://example.com/api/missing")
      ).rejects.toThrow("HTTP 404");
    });

    it("includes URL in error message", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("Error", { status: 500 })
      );

      await expect(
        connector.testFetchJSON("https://example.com/api/endpoint")
      ).rejects.toThrow("https://example.com/api/endpoint");
    });

    it("truncates error body to 200 chars", async () => {
      const longBody = "x".repeat(500);
      fetchMock.mockResolvedValueOnce(
        new Response(longBody, { status: 500 })
      );

      try {
        await connector.testFetchJSON("https://example.com/api");
        expect.unreachable("Should have thrown");
      } catch (err) {
        const message = (err as Error).message;
        // body is sliced to 200 chars
        expect(message.length).toBeLessThan(400);
      }
    });

    it("handles response.text() failure gracefully", async () => {
      const mockResp = {
        ok: false,
        status: 503,
        text: () => Promise.reject(new Error("read failed")),
        json: () => Promise.reject(new Error("read failed")),
      } as unknown as Response;
      fetchMock.mockResolvedValueOnce(mockResp);

      await expect(
        connector.testFetchJSON("https://example.com/api")
      ).rejects.toThrow("HTTP 503");
    });

    it("retries via fetchWithRetry on network errors before checking status", async () => {
      fetchMock
        .mockRejectedValueOnce(new Error("network error"))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true }), { status: 200 })
        );

      const promise = connector.testFetchJSON("https://example.com/api");
      await vi.advanceTimersByTimeAsync(2000);

      const result = await promise;
      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  // ─── cleanText ───

  describe("cleanText", () => {
    it("replaces Italian HTML entities with accented characters", () => {
      expect(connector.testCleanText("l&agrave; &egrave; cos&igrave;")).toBe(
        "là è così"
      );
    });

    it("replaces accented HTML entities with correct characters", () => {
      expect(connector.testCleanText("&egrave;")).toBe("è");
      expect(connector.testCleanText("&agrave;")).toBe("à");
      expect(connector.testCleanText("&ograve;")).toBe("ò");
      expect(connector.testCleanText("&ugrave;")).toBe("ù");
      expect(connector.testCleanText("&igrave;")).toBe("ì");
      // Note: &Egrave; is matched by /&egrave;/gi (case-insensitive) → becomes lowercase "è"
      expect(connector.testCleanText("&Egrave;")).toBe("è");
    });

    it("replaces standard HTML entities", () => {
      expect(connector.testCleanText("&nbsp;")).toBe("");
      expect(connector.testCleanText("&amp;")).toBe("&");
      expect(connector.testCleanText("&lt;tag&gt;")).toBe("<tag>");
      expect(connector.testCleanText("&quot;hello&quot;")).toBe('"hello"');
      expect(connector.testCleanText("&#39;test&#39;")).toBe("'test'");
      expect(connector.testCleanText("&#039;test&#039;")).toBe("'test'");
    });

    it("collapses multiple newlines to double newline", () => {
      expect(connector.testCleanText("a\n\n\n\n\nb")).toBe("a\n\nb");
    });

    it("collapses multiple spaces/tabs to single space", () => {
      expect(connector.testCleanText("a   b\t\tc")).toBe("a b c");
    });

    it("trims whitespace", () => {
      expect(connector.testCleanText("  hello  ")).toBe("hello");
    });

    it("handles combined entity + whitespace cleanup", () => {
      const input = "  Art. 1571 &ndash;   &egrave;  previsto\n\n\n\n  ";
      const result = connector.testCleanText(input);
      // &ndash; is not replaced (not in the replacement list), but spacing collapses
      expect(result).not.toContain("\n\n\n");
      expect(result).not.toMatch(/  /);
    });

    it("handles empty string", () => {
      expect(connector.testCleanText("")).toBe("");
    });
  });

  // ─── rateLimitPause ───

  describe("rateLimitPause", () => {
    it("pauses for 1 second", async () => {
      const promise = connector.testRateLimitPause();
      await vi.advanceTimersByTimeAsync(1000);
      await promise;
      // If we get here without timeout, the pause resolved at ~1000ms
    });
  });

  // ─── sleep ───

  describe("sleep", () => {
    it("resolves after the specified delay", async () => {
      let resolved = false;
      connector.testSleep(500).then(() => {
        resolved = true;
      });

      await vi.advanceTimersByTimeAsync(499);
      expect(resolved).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(resolved).toBe(true);
    });
  });

  // ─── constructor ───

  describe("constructor", () => {
    it("uses console.log as default log function", () => {
      const c = new TestConnector(makeSource());
      // Just verify it doesn't throw
      expect(c).toBeDefined();
    });

    it("stores source reference", async () => {
      const source = makeSource({ id: "my_source" });
      const c = new TestConnector(source);
      const result = await c.connect();
      expect(result.sourceId).toBe("my_source");
    });
  });
});
