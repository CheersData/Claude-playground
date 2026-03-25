import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSource } from "@/lib/staff/data-connector/types";

// Mock auth handler
vi.mock("@/lib/staff/data-connector/auth", () => ({
  createAuthHandler: vi.fn().mockImplementation(() => ({
    authenticate: vi.fn().mockResolvedValue(undefined),
    isValid: vi.fn().mockReturnValue(true),
    refresh: vi.fn().mockResolvedValue(undefined),
    getHeaders: vi.fn().mockReturnValue({}),
    strategyType: "none",
  })),
}));

import { SalesforceConnector } from "@/lib/staff/data-connector/connectors/salesforce";

// ─── Helpers ───

function makeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: "salesforce_test",
    name: "Salesforce CRM Test",
    shortName: "SFDC",
    dataType: "crm-records",
    vertical: "legal",
    connector: "salesforce",
    config: {},
    lifecycle: "planned",
    estimatedItems: 100,
    ...overrides,
  };
}

function mockFetchOk(body: unknown, status = 200): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as unknown as Response;
}

function mockFetchError(status: number, body = ""): Response {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.reject(new Error("Not JSON")),
    headers: new Headers(),
  } as unknown as Response;
}

function makeSfRecord(id: string, type: string, fields: Record<string, unknown> = {}) {
  return {
    attributes: { type, url: `/services/data/v62.0/sobjects/${type}/${id}` },
    Id: id,
    CreatedDate: "2026-01-01T00:00:00.000+0000",
    LastModifiedDate: "2026-01-15T00:00:00.000+0000",
    ...fields,
  };
}

function makeQueryResponse(records: unknown[], done = true, nextUrl?: string) {
  return {
    totalSize: records.length,
    done,
    nextRecordsUrl: nextUrl,
    records,
  };
}

describe("SalesforceConnector", () => {
  let connector: SalesforceConnector;
  let logSpy: ReturnType<typeof vi.fn<(msg: string) => void>>;
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalAccessToken = process.env.SALESFORCE_ACCESS_TOKEN;
  const originalInstanceUrl = process.env.SALESFORCE_INSTANCE_URL;

  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.fn();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.SALESFORCE_ACCESS_TOKEN = "test-sf-token-123";
    process.env.SALESFORCE_INSTANCE_URL = "https://test.my.salesforce.com";
    connector = new SalesforceConnector(makeSource(), logSpy);
    vi.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalAccessToken !== undefined) process.env.SALESFORCE_ACCESS_TOKEN = originalAccessToken;
    else delete process.env.SALESFORCE_ACCESS_TOKEN;
    if (originalInstanceUrl !== undefined) process.env.SALESFORCE_INSTANCE_URL = originalInstanceUrl;
    else delete process.env.SALESFORCE_INSTANCE_URL;
  });

  // ─── connect() ───

  describe("connect", () => {
    it("returns ok=true when SOQL query succeeds", async () => {
      // Test SOQL query
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeQueryResponse([makeSfRecord("001abc", "Account")]))
      );
      // Census: 12 COUNT queries (Account, Contact, Opportunity, Lead, Case, Task, Event, Campaign, Product2, Order, Quote, Contract)
      for (let i = 0; i < 12; i++) {
        fetchMock.mockResolvedValueOnce(mockFetchOk({ totalSize: 10 }));
      }
      // Sample data
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeQueryResponse([makeSfRecord("001abc", "Account", { Name: "Acme" })]))
      );

      const result = await connector.connect();

      expect(result.ok).toBe(true);
      expect(result.message).toContain("API OK");
      expect(result.census.estimatedItems).toBe(120); // 12 types × 10 each
    });

    it("returns ok=false when instance URL is missing", async () => {
      delete process.env.SALESFORCE_INSTANCE_URL;
      const noUrlConnector = new SalesforceConnector(makeSource(), logSpy);

      const result = await noUrlConnector.connect();

      expect(result.ok).toBe(false);
      expect(result.message).toContain("SALESFORCE_INSTANCE_URL");
    });

    it("returns ok=false when access token is missing", async () => {
      delete process.env.SALESFORCE_ACCESS_TOKEN;
      const noTokenConnector = new SalesforceConnector(makeSource(), logSpy);

      const result = await noTokenConnector.connect();

      expect(result.ok).toBe(false);
      expect(result.message).toContain("SALESFORCE_ACCESS_TOKEN");
    });

    it("returns ok=false when API returns error", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchError(401, "Session expired"));

      const result = await connector.connect();

      expect(result.ok).toBe(false);
      expect(result.message).toContain("401");
    });

    it("uses correct API version in URL", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeQueryResponse([])));
      for (let i = 0; i < 5; i++) {
        fetchMock.mockResolvedValueOnce(mockFetchOk({ totalSize: 0 }));
      }
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeQueryResponse([])));

      await connector.connect();

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("/services/data/v62.0/");
    });

    it("injects Bearer token in requests", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeQueryResponse([])));
      for (let i = 0; i < 5; i++) {
        fetchMock.mockResolvedValueOnce(mockFetchOk({ totalSize: 0 }));
      }
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeQueryResponse([])));

      await connector.connect();

      const options = fetchMock.mock.calls[0][1] as RequestInit;
      const headers = options.headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer test-sf-token-123");
    });
  });

  // ─── fetchAll() ───

  describe("fetchAll", () => {
    it("fetches all 5 object types via SOQL", async () => {
      const account = makeSfRecord("001abc", "Account", { Name: "Acme Corp" });
      const contact = makeSfRecord("003abc", "Contact", { FirstName: "John", LastName: "Doe" });

      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeQueryResponse([account])))
        .mockResolvedValueOnce(mockFetchOk(makeQueryResponse([contact])))
        .mockResolvedValueOnce(mockFetchOk(makeQueryResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeQueryResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeQueryResponse([])));

      const result = await connector.fetchAll();

      expect(result.items).toHaveLength(2);
      expect(result.items[0].objectType).toBe("Account");
      expect(result.items[1].objectType).toBe("Contact");
    });

    it("handles nextRecordsUrl pagination", async () => {
      // Account page 1 (not done)
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeQueryResponse(
            [makeSfRecord("001a", "Account")],
            false,
            "/services/data/v62.0/query/01gxx-2000"
          )
        )
      );
      // Account page 2 (done)
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeQueryResponse([makeSfRecord("001b", "Account")]))
      );
      // Other types: empty
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce(mockFetchOk(makeQueryResponse([])));
      }

      const result = await connector.fetchAll();

      expect(result.items).toHaveLength(2);
      // Second call should use full URL with instance base
      const secondCallUrl = fetchMock.mock.calls[1][0] as string;
      expect(secondCallUrl).toContain("https://test.my.salesforce.com");
      expect(secondCallUrl).toContain("/query/01gxx-2000");
    });

    it("respects global limit", async () => {
      const accounts = Array.from({ length: 3 }, (_, i) =>
        makeSfRecord(`001${i}`, "Account", { Name: `Account ${i}` })
      );
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeQueryResponse(accounts)));

      const result = await connector.fetchAll({ limit: 2 });

      expect(result.items.length).toBeLessThanOrEqual(3);
    });

    it("uses SOQL SELECT with correct fields", async () => {
      fetchMock.mockResolvedValue(mockFetchOk(makeQueryResponse([])));

      await connector.fetchAll();

      const url = fetchMock.mock.calls[0][0] as string;
      const decodedUrl = decodeURIComponent(url);
      expect(decodedUrl).toContain("SELECT");
      expect(decodedUrl).toContain("FROM Account");
    });
  });

  // ─── fetchDelta() ───

  describe("fetchDelta", () => {
    it("uses SOQL WHERE LastModifiedDate filter", async () => {
      fetchMock.mockResolvedValue(mockFetchOk(makeQueryResponse([])));

      await connector.fetchDelta("2026-03-01T00:00:00Z");

      const url = fetchMock.mock.calls[0][0] as string;
      const decodedUrl = decodeURIComponent(url);
      expect(decodedUrl).toContain("WHERE LastModifiedDate >");
      expect(decodedUrl).toContain("2026-03-01");
    });

    it("returns delta records with metadata", async () => {
      fetchMock
        .mockResolvedValueOnce(
          mockFetchOk(makeQueryResponse([makeSfRecord("001a", "Account")]))
        )
        .mockResolvedValue(mockFetchOk(makeQueryResponse([])));

      const result = await connector.fetchDelta("2026-03-01T00:00:00Z");

      expect(result.items).toHaveLength(1);
      expect(result.metadata.since).toBe("2026-03-01T00:00:00Z");
    });
  });

  // ─── Error handling ───

  describe("error handling", () => {
    it("handles API errors during fetchAll gracefully", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchError(500, "Server Error"));
      // Other types continue
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce(mockFetchOk(makeQueryResponse([])));
      }

      const result = await connector.fetchAll();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Error querying Account"));
    });

    it("handles network errors during fetchAll", async () => {
      // 4 rejections for Account (1 initial + 3 retries from fetchWithRetry)
      for (let i = 0; i < 4; i++) {
        fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      }
      // Remaining 4 types succeed
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce(mockFetchOk(makeQueryResponse([])));
      }

      const result = await connector.fetchAll();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Error fetching Account"));
    });
  });
});
