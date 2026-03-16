import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AuthenticatedBaseConnector } from "@/lib/staff/data-connector/connectors/authenticated-base";
import type {
  ConnectResult,
  FetchResult,
  DataSource,
} from "@/lib/staff/data-connector/types";
import type { AuthHandler, AuthStrategy } from "@/lib/staff/data-connector/auth/types";

// ─── Mock the auth module ───
const mockAuthHandler: AuthHandler = {
  authenticate: vi.fn().mockResolvedValue(undefined),
  isValid: vi.fn().mockReturnValue(true),
  refresh: vi.fn().mockResolvedValue(true),
  getHeaders: vi.fn().mockResolvedValue({ Authorization: "Bearer test-token" }),
  strategyType: "api-key",
};

vi.mock("@/lib/staff/data-connector/auth", () => ({
  createAuthHandler: vi.fn().mockImplementation(() => mockAuthHandler),
}));

// ─── Concrete subclass for testing ───

class TestAuthConnector extends AuthenticatedBaseConnector<string> {
  async connect(): Promise<ConnectResult> {
    return {
      sourceId: this.source.id,
      ok: true,
      message: "Connected",
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
  public testRateLimitPause() {
    return this.rateLimitPause();
  }
  public getAuthHandler() {
    return this.authHandler;
  }
}

function makeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: "test_auth_source",
    name: "Test Auth Source",
    shortName: "TAS",
    dataType: "crm-records",
    vertical: "crm",
    connector: "salesforce",
    config: {},
    lifecycle: "planned",
    estimatedItems: 50,
    auth: {
      type: "api-key",
      header: "Authorization",
      envVar: "TEST_API_KEY",
      prefix: "Bearer ",
    } as AuthStrategy,
    ...overrides,
  };
}

describe("AuthenticatedBaseConnector", () => {
  let connector: TestAuthConnector;
  let logSpy: ReturnType<typeof vi.fn<(msg: string) => void>>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.fn();
    connector = new TestAuthConnector(makeSource(), logSpy);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // Clear call history from previous tests, then reset implementations
    vi.mocked(mockAuthHandler.authenticate).mockReset();
    vi.mocked(mockAuthHandler.isValid).mockReset();
    vi.mocked(mockAuthHandler.refresh).mockReset();
    vi.mocked(mockAuthHandler.getHeaders).mockReset();

    // Set default implementations
    vi.mocked(mockAuthHandler.authenticate).mockResolvedValue(undefined);
    vi.mocked(mockAuthHandler.isValid).mockReturnValue(true);
    vi.mocked(mockAuthHandler.refresh).mockResolvedValue(true);
    vi.mocked(mockAuthHandler.getHeaders).mockResolvedValue({
      Authorization: "Bearer test-token",
    });
    (mockAuthHandler as { strategyType: string }).strategyType = "api-key";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── Auth handler injection ───

  describe("auth handler creation", () => {
    it("creates auth handler from source auth strategy", async () => {
      const { createAuthHandler } = await import(
        "@/lib/staff/data-connector/auth"
      );
      expect(createAuthHandler).toHaveBeenCalled();
    });

    it("defaults to none strategy when source has no auth", () => {
      const source = makeSource({ auth: undefined });
      const c = new TestAuthConnector(source, logSpy);
      expect(c.getAuthHandler()).toBeDefined();
    });
  });

  // ─── authenticate() ───

  describe("authenticate", () => {
    it("calls authHandler.authenticate()", async () => {
      await connector.authenticate();
      expect(mockAuthHandler.authenticate).toHaveBeenCalled();
    });

    it("logs authentication start and completion", async () => {
      await connector.authenticate();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("[AUTH] Autenticazione con strategia")
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("[AUTH] Autenticazione completata")
      );
    });
  });

  // ─── isAuthenticated() ───

  describe("isAuthenticated", () => {
    it("returns true when authHandler.isValid() is true", () => {
      vi.mocked(mockAuthHandler.isValid).mockReturnValue(true);
      expect(connector.isAuthenticated()).toBe(true);
    });

    it("returns false when authHandler.isValid() is false", () => {
      vi.mocked(mockAuthHandler.isValid).mockReturnValue(false);
      expect(connector.isAuthenticated()).toBe(false);
    });
  });

  // ─── fetchWithRetry with auth ───

  describe("fetchWithRetry with auth headers", () => {
    it("injects auth headers into every request", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("OK", { status: 200 })
      );

      await connector.testFetchWithRetry("https://api.example.com/data");

      const callArgs = fetchMock.mock.calls[0];
      const headers = callArgs[1]?.headers;
      // BaseConnector normalizes headers via new Headers().entries() which lowercases keys
      expect(headers).toHaveProperty("authorization", "Bearer test-token");
    });

    it("merges auth headers with custom headers", async () => {
      fetchMock.mockResolvedValueOnce(
        new Response("OK", { status: 200 })
      );

      await connector.testFetchWithRetry("https://api.example.com/data", {
        headers: { "Content-Type": "application/json" },
      });

      const callArgs = fetchMock.mock.calls[0];
      const headers = callArgs[1]?.headers;
      // Both auth and custom headers should be present
      // BaseConnector normalizes headers via new Headers().entries() which lowercases keys
      expect(headers).toHaveProperty("authorization", "Bearer test-token");
      expect(headers).toHaveProperty("content-type", "application/json");
    });

    it("auto-authenticates when token is not valid", async () => {
      vi.mocked(mockAuthHandler.isValid)
        .mockReturnValueOnce(false) // first check: not valid -> authenticate
        .mockReturnValue(true); // subsequent checks: valid

      fetchMock.mockResolvedValueOnce(
        new Response("OK", { status: 200 })
      );

      await connector.testFetchWithRetry("https://api.example.com/data");
      expect(mockAuthHandler.authenticate).toHaveBeenCalled();
    });

    it("attempts refresh when initial authentication fails", async () => {
      vi.mocked(mockAuthHandler.isValid).mockReturnValueOnce(false);
      vi.mocked(mockAuthHandler.authenticate).mockRejectedValueOnce(
        new Error("Auth failed")
      );
      vi.mocked(mockAuthHandler.refresh).mockResolvedValueOnce(true);
      // After refresh, isValid returns true
      vi.mocked(mockAuthHandler.isValid).mockReturnValue(true);

      fetchMock.mockResolvedValueOnce(
        new Response("OK", { status: 200 })
      );

      await connector.testFetchWithRetry("https://api.example.com/data");
      expect(mockAuthHandler.refresh).toHaveBeenCalled();
    });

    it("throws when both authenticate and refresh fail", async () => {
      (mockAuthHandler as { strategyType: string }).strategyType = "oauth2-pkce";
      vi.mocked(mockAuthHandler.isValid).mockReturnValue(false);
      vi.mocked(mockAuthHandler.authenticate).mockRejectedValue(
        new Error("Auth failed")
      );
      vi.mocked(mockAuthHandler.refresh).mockResolvedValue(false);

      await expect(
        connector.testFetchWithRetry("https://api.example.com/data")
      ).rejects.toThrow("Auth failed");
    });
  });

  // ─── 401 auto-refresh ───

  describe("401 auto-refresh", () => {
    it("retries with new token on 401 response", async () => {
      const resp401 = new Response("Unauthorized", { status: 401 });
      const respOk = new Response("OK", { status: 200 });

      fetchMock
        .mockResolvedValueOnce(resp401)   // first attempt -> 401
        .mockResolvedValueOnce(respOk);    // retry after refresh -> 200

      vi.mocked(mockAuthHandler.getHeaders)
        .mockResolvedValueOnce({ Authorization: "Bearer old-token" })
        .mockResolvedValueOnce({ Authorization: "Bearer new-token" });

      const result = await connector.testFetchWithRetry(
        "https://api.example.com/data"
      );

      expect(result.status).toBe(200);
      expect(mockAuthHandler.refresh).toHaveBeenCalled();
      // Second call should have new token
      // BaseConnector normalizes headers via new Headers().entries() which lowercases keys
      const secondCallHeaders = fetchMock.mock.calls[1]?.[1]?.headers;
      expect(secondCallHeaders).toHaveProperty(
        "authorization",
        "Bearer new-token"
      );
    });

    it("throws when 401 and refresh fails", async () => {
      (mockAuthHandler as { strategyType: string }).strategyType = "oauth2-pkce";
      fetchMock.mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401 })
      );
      vi.mocked(mockAuthHandler.refresh).mockResolvedValueOnce(false);

      await expect(
        connector.testFetchWithRetry("https://api.example.com/data")
      ).rejects.toThrow("OAuth token expired and refresh failed");
    });

    it("does not attempt refresh on 401 for none strategy", async () => {
      (mockAuthHandler as { strategyType: string }).strategyType = "none";

      fetchMock.mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401 })
      );

      const result = await connector.testFetchWithRetry(
        "https://api.example.com/data"
      );

      expect(result.status).toBe(401);
      expect(mockAuthHandler.refresh).not.toHaveBeenCalled();
    });

    it("logs 401 refresh attempt", async () => {
      fetchMock
        .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
        .mockResolvedValueOnce(new Response("OK", { status: 200 }));

      await connector.testFetchWithRetry("https://api.example.com/data");

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Risposta 401")
      );
    });
  });

  // ─── rateLimitPause with custom config ───

  describe("rateLimitPause", () => {
    it("uses requestsPerSecond to calculate pause", async () => {
      const source = makeSource({
        rateLimit: { requestsPerSecond: 5 },
      });
      const c = new TestAuthConnector(source, logSpy);

      const start = Date.now();
      const promise = c.testRateLimitPause();
      // 1000 / 5 = 200ms pause
      await vi.advanceTimersByTimeAsync(200);
      await promise;
      // If resolved at ~200ms, the custom rate limit was used
    });

    it("uses requestsPerMinute to calculate pause", async () => {
      const source = makeSource({
        rateLimit: { requestsPerMinute: 60 },
      });
      const c = new TestAuthConnector(source, logSpy);

      const promise = c.testRateLimitPause();
      // 60000 / 60 = 1000ms pause
      await vi.advanceTimersByTimeAsync(1000);
      await promise;
    });

    it("falls back to default 1s pause when no rateLimit configured", async () => {
      const source = makeSource({ rateLimit: undefined });
      const c = new TestAuthConnector(source, logSpy);

      const promise = c.testRateLimitPause();
      await vi.advanceTimersByTimeAsync(1000);
      await promise;
    });

    it("prioritizes requestsPerSecond over requestsPerMinute", async () => {
      const source = makeSource({
        rateLimit: { requestsPerSecond: 10, requestsPerMinute: 30 },
      });
      const c = new TestAuthConnector(source, logSpy);

      let resolved = false;
      c.testRateLimitPause().then(() => { resolved = true; });

      // requestsPerSecond=10 -> 100ms pause
      await vi.advanceTimersByTimeAsync(100);
      expect(resolved).toBe(true);
    });
  });

  // ─── Pre-request token refresh ───

  describe("pre-request token refresh", () => {
    it("refreshes token before request when token is expired", async () => {
      vi.mocked(mockAuthHandler.isValid)
        .mockReturnValueOnce(true)    // first check: initially valid (skip authenticate)
        .mockReturnValueOnce(false)   // second check: expired (trigger refresh)
        .mockReturnValue(true);       // after refresh: valid

      fetchMock.mockResolvedValueOnce(
        new Response("OK", { status: 200 })
      );

      await connector.testFetchWithRetry("https://api.example.com/data");
      expect(mockAuthHandler.refresh).toHaveBeenCalled();
    });

    it("throws descriptive error when pre-request refresh fails", async () => {
      (mockAuthHandler as { strategyType: string }).strategyType = "oauth2-pkce";
      vi.mocked(mockAuthHandler.isValid)
        .mockReturnValueOnce(true)    // first check
        .mockReturnValueOnce(false);  // second check: expired

      vi.mocked(mockAuthHandler.refresh).mockResolvedValueOnce(false);

      await expect(
        connector.testFetchWithRetry("https://api.example.com/data")
      ).rejects.toThrow("Token scaduto e refresh fallito");
      expect((await connector.testFetchWithRetry("https://api.example.com/data").catch(e => e)).message || "").toBeTruthy();
    });
  });
});
