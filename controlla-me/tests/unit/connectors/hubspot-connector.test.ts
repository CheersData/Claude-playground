import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSource } from "@/lib/staff/data-connector/types";

// Mock auth handler before importing connector
vi.mock("@/lib/staff/data-connector/auth", () => ({
  createAuthHandler: vi.fn().mockImplementation(() => ({
    authenticate: vi.fn().mockResolvedValue(undefined),
    isValid: vi.fn().mockReturnValue(true),
    refresh: vi.fn().mockResolvedValue(undefined),
    getHeaders: vi.fn().mockReturnValue({}),
    strategyType: "none",
  })),
}));

import { HubSpotConnector } from "@/lib/staff/data-connector/connectors/hubspot";

// ─── Helpers ───

function makeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: "hubspot_test",
    name: "HubSpot CRM Test",
    shortName: "HUBSPOT",
    dataType: "crm-records",
    vertical: "legal",
    connector: "hubspot",
    config: {},
    lifecycle: "planned",
    estimatedItems: 100,
    // BUG 8 FIX: Include rateLimit to match production config (integration-sources.ts).
    // Parent's AuthenticatedBaseConnector.rateLimitPause() reads this value.
    // 5 req/s = 200ms pause — same as old hardcoded value.
    rateLimit: { requestsPerSecond: 5 },
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

function makeHubSpotObject(id: string, type: string, props: Record<string, string | null> = {}) {
  return {
    id,
    properties: props,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-15T00:00:00Z",
    archived: false,
  };
}

function makeListResponse(results: unknown[], nextAfter?: string) {
  return {
    results,
    paging: nextAfter ? { next: { after: nextAfter, link: "" } } : undefined,
  };
}

function makeSearchResponse(results: unknown[], total: number, nextAfter?: string) {
  return {
    total,
    results,
    paging: nextAfter ? { next: { after: nextAfter } } : undefined,
  };
}

describe("HubSpotConnector", () => {
  let connector: HubSpotConnector;
  let logSpy: ReturnType<typeof vi.fn<(msg: string) => void>>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.fn();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // Use API key mode for testing
    connector = new HubSpotConnector(makeSource(), logSpy, {
      accessToken: "test-api-key",
    });
    vi.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── connect() ───

  describe("connect", () => {
    it("returns ok=true when API responds successfully", async () => {
      // 1. Test API (contacts limit=1)
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "contact")])));
      // 2-5. Census for 4 types
      for (let i = 0; i < 4; i++) {
        fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "x")])));
      }
      // 6. Sample fetch
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeListResponse([
            makeHubSpotObject("1", "contact", { email: "test@example.com", firstname: "John", lastname: "Doe" }),
          ])
        )
      );

      const result = await connector.connect();

      expect(result.ok).toBe(true);
      expect(result.message).toContain("API OK");
      expect(result.message).toContain("Explicit Token");
      expect(result.census.availableFormats).toContain("json");
    });

    it("returns ok=false when API returns error", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchError(401, "Unauthorized"));

      const result = await connector.connect();

      expect(result.ok).toBe(false);
      expect(result.message).toContain("401");
    });

    it("returns ok=false when fetch throws", async () => {
      fetchMock.mockRejectedValue(new Error("Network error"));

      const result = await connector.connect();

      expect(result.ok).toBe(false);
      expect(result.message).toContain("Network error");
    });

    it("estimates count per object type", async () => {
      // Test API
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "contact")])));
      // Census: company (hasMore=true → estimate 50)
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeListResponse([makeHubSpotObject("1", "x")], "next_cursor"))
      );
      // contact (no more → 1)
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "x")])));
      // deal (no more → 0 results)
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));
      // ticket (no more → 1)
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "x")])));
      // engagement (no more → 0)
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));
      // Sample
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      const result = await connector.connect();

      expect(result.ok).toBe(true);
      // company=50 (has_more estimate) + contact=1 + deal=0 + ticket=1 + engagement=0 = 52
      expect(result.census.estimatedItems).toBe(52);
    });
  });

  // ─── fetchAll() ───

  describe("fetchAll", () => {
    it("fetches all 5 object types", async () => {
      const company = makeHubSpotObject("co1", "company", { name: "Acme" });
      const contact = makeHubSpotObject("c1", "contact", { email: "a@b.com", firstname: "A" });
      const deal = makeHubSpotObject("d1", "deal", { dealname: "Big Deal" });
      const ticket = makeHubSpotObject("t1", "ticket", { subject: "Help" });

      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([company])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([contact])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([deal])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([ticket])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([]))); // engagement

      const result = await connector.fetchAll();

      expect(result.items).toHaveLength(4);
      expect(result.items[0].objectType).toBe("company");
      expect(result.items[1].objectType).toBe("contact");
      expect(result.items[2].objectType).toBe("deal");
      expect(result.items[3].objectType).toBe("ticket");
    });

    it("respects global limit", async () => {
      const contacts = Array.from({ length: 3 }, (_, i) =>
        makeHubSpotObject(`c${i}`, "contact", { email: `c${i}@test.com` })
      );
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse(contacts)));

      const result = await connector.fetchAll({ limit: 2 });

      // Should stop after getting 2 records (all contacts since batch ≤ limit)
      // but then stop before fetching next type
      expect(result.items.length).toBeLessThanOrEqual(3);
    });

    it("handles pagination with cursor", async () => {
      const page1 = [makeHubSpotObject("c1", "contact")];
      const page2 = [makeHubSpotObject("c2", "contact")];

      // contacts: page1 with next cursor, page2 without
      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeListResponse(page1, "cursor_2")))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse(page2)))
        // company, deal, ticket: empty
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      const result = await connector.fetchAll();

      expect(result.items).toHaveLength(2);
      // Verify second call includes 'after' parameter
      const secondCallUrl = fetchMock.mock.calls[1][0] as string;
      expect(secondCallUrl).toContain("after=cursor_2");
    });

    it("includes metadata with counts per type", async () => {
      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))                               // company
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("c1", "contact")]))) // contact
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("d1", "deal")])))  // deal
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))                               // ticket
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])));                              // engagement

      const result = await connector.fetchAll();

      expect(result.metadata.counts).toEqual({
        company: 0,
        contact: 1,
        deal: 1,
        ticket: 0,
        engagement: 0,
      });
    });

    it("handles API error during fetch", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchError(500, "Internal Server Error"));
      // Other types proceed normally
      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      const result = await connector.fetchAll();

      // Should have logged error but continued (company is first in SYNC_TYPES)
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Error listing company"));
    });
  });

  // ─── fetchDelta() ───

  describe("fetchDelta", () => {
    it("uses Search API with lastmodifieddate filter", async () => {
      const since = "2026-03-01T00:00:00Z";
      const sinceMs = new Date(since).getTime();

      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)))                          // company
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([makeHubSpotObject("c1", "contact")], 1))) // contact
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)))                          // deal
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)))                          // ticket
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)));                         // engagement

      const result = await connector.fetchDelta(since);

      expect(result.items).toHaveLength(1);
      expect(result.metadata.since).toBe(since);

      // Verify Search API was called with POST and correct body (first call is company)
      const firstCall = fetchMock.mock.calls[0];
      const url = firstCall[0] as string;
      expect(url).toContain("/crm/v3/objects/companies/search");
      const options = firstCall[1] as RequestInit;
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body as string);
      expect(body.filterGroups[0].filters[0].propertyName).toBe("lastmodifieddate");
      expect(body.filterGroups[0].filters[0].operator).toBe("GTE");
      expect(body.filterGroups[0].filters[0].value).toBe(String(sinceMs));
    });

    it("respects limit in delta mode", async () => {
      const contacts = Array.from({ length: 5 }, (_, i) =>
        makeHubSpotObject(`c${i}`, "contact")
      );
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeSearchResponse(contacts, 5)));

      const result = await connector.fetchDelta("2026-01-01T00:00:00Z", { limit: 3 });

      // Gets 5 contacts from first type, then should stop before next type
      expect(result.items.length).toBeLessThanOrEqual(5);
    });
  });

  // ─── Auth ───

  describe("auth", () => {
    it("injects Bearer token from API key", async () => {
      fetchMock.mockResolvedValue(mockFetchOk(makeListResponse([])));

      await connector.fetchAll();

      const firstCall = fetchMock.mock.calls[0];
      const options = firstCall[1] as RequestInit;
      const headers = options.headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer test-api-key");
    });

    it("uses OAuth2 when no API key provided", async () => {
      // Create connector without API key
      const oauthConnector = new HubSpotConnector(makeSource(), logSpy);

      fetchMock.mockResolvedValue(mockFetchOk(makeListResponse([])));

      await oauthConnector.fetchAll();

      // Should have called fetch (OAuth2 path delegates to AuthenticatedBaseConnector)
      expect(fetchMock).toHaveBeenCalled();
    });
  });

  // ─── URL construction ───

  describe("URL construction", () => {
    it("uses plural object names in URL", async () => {
      fetchMock.mockResolvedValue(mockFetchOk(makeListResponse([])));

      await connector.fetchAll();

      const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(urls[0]).toContain("/crm/v3/objects/companies");
      expect(urls[1]).toContain("/crm/v3/objects/contacts");
      expect(urls[2]).toContain("/crm/v3/objects/deals");
      expect(urls[3]).toContain("/crm/v3/objects/tickets");
      expect(urls[4]).toContain("/crm/v3/objects/engagements");
    });

    it("includes properties in URL", async () => {
      fetchMock.mockResolvedValue(mockFetchOk(makeListResponse([])));

      await connector.fetchAll();

      // First call is company (SYNC_TYPES order), second is contact
      const contactUrl = fetchMock.mock.calls[1][0] as string;
      expect(contactUrl).toContain("properties=email");
      expect(contactUrl).toContain("firstname");
      expect(contactUrl).toContain("lastname");
    });

    it("pluralizes 'company' to 'companies'", async () => {
      fetchMock.mockResolvedValue(mockFetchOk(makeListResponse([])));

      await connector.fetchAll();

      // company is first in SYNC_TYPES
      const companyUrl = fetchMock.mock.calls[0][0] as string;
      expect(companyUrl).toContain("/crm/v3/objects/companies");
      expect(companyUrl).not.toContain("/crm/v3/objects/companys");
    });
  });

  // ─── connect() edge cases ───

  describe("connect edge cases", () => {
    it("includes sampleData when sample fetch succeeds", async () => {
      // Test API
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "contact")])));
      // Census: 5 types (company, contact, deal, ticket, engagement)
      for (let i = 0; i < 5; i++) {
        fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));
      }
      // Sample: 2 contacts
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeListResponse([
            makeHubSpotObject("s1", "contact", { email: "sample@test.com", firstname: "Test", lastname: "User" }),
            makeHubSpotObject("s2", "contact", { email: "sample2@test.com" }),
          ])
        )
      );

      const result = await connector.connect();

      expect(result.ok).toBe(true);
      expect(result.census.sampleData).toBeDefined();
      expect(result.census.sampleData).toHaveLength(2);
      expect((result.census.sampleData![0] as Record<string, unknown>).email).toBe("sample@test.com");
    });

    it("succeeds even when sample fetch fails", async () => {
      // Test API
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "contact")])));
      // Census: 5 types (company, contact, deal, ticket, engagement)
      for (let i = 0; i < 5; i++) {
        fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));
      }
      // Sample: network error
      fetchMock.mockRejectedValueOnce(new Error("Sample fetch timeout"));

      const result = await connector.connect();

      expect(result.ok).toBe(true);
      expect(result.census.sampleData).toBeUndefined();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Sample fetch warning"));
    });

    it("reports sampleFields in census", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "contact")])));
      // Census: 5 types
      for (let i = 0; i < 5; i++) {
        fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));
      }
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      const result = await connector.connect();

      expect(result.census.sampleFields).toContain("externalId");
      expect(result.census.sampleFields).toContain("objectType");
      expect(result.census.sampleFields).toContain("email");
    });
  });

  // ─── fetchDelta() edge cases ───

  describe("fetchDelta edge cases", () => {
    it("handles search pagination with cursor", async () => {
      const page1 = [makeHubSpotObject("c1", "contact")];
      const page2 = [makeHubSpotObject("c2", "contact")];

      fetchMock
        // contacts: page1 with cursor, page2 without
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse(page1, 2, "search_cursor")))
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse(page2, 2)))
        // company, deal, ticket: empty
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)))
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)))
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)));

      const result = await connector.fetchDelta("2026-01-01T00:00:00Z");

      expect(result.items).toHaveLength(2);
      // Verify second call includes 'after' in body
      const secondCall = fetchMock.mock.calls[1];
      const body = JSON.parse(secondCall[1].body as string);
      expect(body.after).toBe("search_cursor");
    });

    it("includes properties in search body", async () => {
      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)))  // company
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)))  // contact
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)))  // deal
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)))  // ticket
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0))); // engagement

      await connector.fetchDelta("2026-01-01T00:00:00Z");

      // Second call is contact (first is company)
      const contactCall = fetchMock.mock.calls[1];
      const body = JSON.parse(contactCall[1].body as string);
      expect(body.properties).toEqual(
        expect.arrayContaining(["email", "firstname", "lastname"])
      );
    });

    it("continues to next type when search API returns error", async () => {
      fetchMock
        // company: error
        .mockResolvedValueOnce(mockFetchError(500, "Server Error"))
        // contact, deal, ticket, engagement: ok
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([makeHubSpotObject("c1", "contact")], 1)))
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)))
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)))
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)));

      const result = await connector.fetchDelta("2026-01-01T00:00:00Z");

      expect(result.items).toHaveLength(1);
      expect(result.items[0].objectType).toBe("contact");
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Search company error"));
    });

    it("uses search URL with type+s pluralization", async () => {
      fetchMock.mockResolvedValue(mockFetchOk(makeSearchResponse([], 0)));

      await connector.fetchDelta("2026-01-01T00:00:00Z");

      const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
      // Note: getPluralType correctly handles company → companies
      expect(urls[0]).toContain("/crm/v3/objects/companies/search");
      expect(urls[1]).toContain("/crm/v3/objects/contacts/search");
      expect(urls[2]).toContain("/crm/v3/objects/deals/search");
      expect(urls[3]).toContain("/crm/v3/objects/tickets/search");
      expect(urls[4]).toContain("/crm/v3/objects/engagements/search");
    });
  });

  // ─── fetchAll() edge cases ───

  describe("fetchAll edge cases", () => {
    it("stops fetching type on empty results page", async () => {
      // contacts: page1 with cursor, page2 empty
      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("c1", "contact")], "cur1")))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        // company, deal, ticket: empty
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      const result = await connector.fetchAll();

      expect(result.items).toHaveLength(1);
    });

    it("logs error but continues on network failure mid-type", async () => {
      // company: fetchWithRetry has maxRetries=3 → 4 total attempts (all fail)
      fetchMock
        .mockRejectedValueOnce(new Error("ECONNRESET"))
        .mockRejectedValueOnce(new Error("ECONNRESET"))
        .mockRejectedValueOnce(new Error("ECONNRESET"))
        .mockRejectedValueOnce(new Error("ECONNRESET"))
        // contact, deal, ticket, engagement: ok
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("c1", "contact")])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      const result = await connector.fetchAll();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].objectType).toBe("contact");
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Error fetching company page"));
    });

    it("calculates per-type limit correctly when global limit is reached", async () => {
      // contacts: 2 records
      fetchMock
        .mockResolvedValueOnce(
          mockFetchOk(makeListResponse([
            makeHubSpotObject("c1", "contact"),
            makeHubSpotObject("c2", "contact"),
          ]))
        )
        // company: 1 record (limit should be 1 since global=3 and we have 2)
        .mockResolvedValueOnce(
          mockFetchOk(makeListResponse([makeHubSpotObject("co1", "company")]))
        );
      // deal and ticket should not be fetched if limit=3 is reached

      const result = await connector.fetchAll({ limit: 3 });

      expect(result.items.length).toBeLessThanOrEqual(3);
    });
  });

  // ─── API key env var via auth handler ───

  describe("API key env var via auth handler", () => {
    it("delegates to parent auth handler when no accessToken provided", async () => {
      // BUG 4 FIX: HubSpot connector no longer reads HUBSPOT_API_KEY directly.
      // Instead, when source.auth = { type: "api-key", envVar: "HUBSPOT_API_KEY", ... }
      // the parent's ApiKeyAuthHandler handles header injection.
      // With our mock auth handler (returns empty headers), no Authorization header is set.
      const envConnector = new HubSpotConnector(makeSource(), logSpy);
      vi.spyOn(envConnector as any, "sleep").mockResolvedValue(undefined);

      fetchMock.mockResolvedValue(mockFetchOk(makeListResponse([])));

      await envConnector.fetchAll();

      // Auth handler is mocked to return empty headers — verifies delegation path
      expect(fetchMock).toHaveBeenCalled();
      const firstCall = fetchMock.mock.calls[0];
      const options = firstCall[1] as RequestInit;
      const headers = options.headers as Record<string, string>;
      // No manual Authorization injection — parent auth handler is responsible
      expect(headers.authorization).toBeUndefined();
    });
  });

  // ─── Rate limiting ───

  describe("rate limiting", () => {
    it("calls rateLimitPause between pages", async () => {
      const sleepSpy = vi.spyOn(connector as any, "sleep");
      sleepSpy.mockResolvedValue(undefined);

      // contacts: 2 pages
      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("c1", "contact")], "next")))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("c2", "contact")])))
        // rest empty
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      await connector.fetchAll();

      // Source has rateLimit: { requestsPerSecond: 5 }, so pause = 1000/5 = 200ms
      expect(sleepSpy).toHaveBeenCalledWith(200);
    });

    it("uses source.rateLimit.requestsPerSecond when configured", async () => {
      const customSource = makeSource({
        rateLimit: { requestsPerSecond: 10 },
      });
      const customConnector = new HubSpotConnector(customSource, logSpy, {
        accessToken: "test-key",
      });
      const sleepSpy = vi.spyOn(customConnector as any, "sleep");
      sleepSpy.mockResolvedValue(undefined);

      // contacts: 2 pages to trigger rateLimitPause
      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("c1", "contact")], "next")))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("c2", "contact")])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      await customConnector.fetchAll();

      // 1000/10 = 100ms pause
      expect(sleepSpy).toHaveBeenCalledWith(100);
    });

    it("uses source.rateLimit.requestsPerMinute when requestsPerSecond absent", async () => {
      const customSource = makeSource({
        rateLimit: { requestsPerSecond: undefined, requestsPerMinute: 120 },
      });
      const customConnector = new HubSpotConnector(customSource, logSpy, {
        accessToken: "test-key",
      });
      const sleepSpy = vi.spyOn(customConnector as any, "sleep");
      sleepSpy.mockResolvedValue(undefined);

      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("c1", "contact")], "next")))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("c2", "contact")])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      await customConnector.fetchAll();

      // 60000/120 = 500ms pause
      expect(sleepSpy).toHaveBeenCalledWith(500);
    });

    it("calls rateLimitPause between delta search pages", async () => {
      const sleepSpy = vi.spyOn(connector as any, "sleep");
      sleepSpy.mockResolvedValue(undefined);

      // contacts: 2 search pages
      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([makeHubSpotObject("c1", "contact")], 2, "s_cursor")))
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([makeHubSpotObject("c2", "contact")], 2)))
        // other types empty
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)))
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)))
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)));

      await connector.fetchDelta("2026-01-01T00:00:00Z");

      // rateLimitPause called between search pages
      expect(sleepSpy).toHaveBeenCalled();
    });
  });

  // ─── Auth mode display in connect() ───

  describe("auth mode in connect message", () => {
    it("shows 'Explicit Token' when accessToken is provided", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "contact")])));
      // Census: 5 types + sample
      for (let i = 0; i < 5; i++) {
        fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));
      }
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      const result = await connector.connect();

      expect(result.ok).toBe(true);
      expect(result.message).toContain("Explicit Token");
    });

    it("shows 'None' when no auth is configured", async () => {
      const noAuthConnector = new HubSpotConnector(makeSource(), logSpy);
      vi.spyOn(noAuthConnector as any, "sleep").mockResolvedValue(undefined);

      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "contact")])));
      // Census: 5 types + sample
      for (let i = 0; i < 5; i++) {
        fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));
      }
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      const result = await noAuthConnector.connect();

      expect(result.ok).toBe(true);
      expect(result.message).toContain("None");
    });
  });

  // ─── Constructor options ───

  describe("constructor options", () => {
    it("passes vault and userId to parent AuthenticatedBaseConnector", () => {
      const mockVault = {
        getCredential: vi.fn(),
        storeCredential: vi.fn(),
        refreshCredential: vi.fn(),
        revokeCredential: vi.fn(),
        listForUser: vi.fn(),
      };
      const userId = "user-123";

      // Should not throw — vault/userId are forwarded to parent
      const vaultConnector = new HubSpotConnector(makeSource(), logSpy, {
        vault: mockVault,
        userId,
      });

      expect(vaultConnector).toBeInstanceOf(HubSpotConnector);
    });

    it("defaults vault and userId to null when not provided", () => {
      const defaultConnector = new HubSpotConnector(makeSource(), logSpy);
      expect(defaultConnector).toBeInstanceOf(HubSpotConnector);
    });

    it("sets explicitToken to null when no accessToken provided", async () => {
      const noTokenConnector = new HubSpotConnector(makeSource(), logSpy);
      vi.spyOn(noTokenConnector as any, "sleep").mockResolvedValue(undefined);

      fetchMock.mockResolvedValue(mockFetchOk(makeListResponse([])));

      await noTokenConnector.fetchAll();

      // Without explicit token, the Authorization header should NOT be injected
      // by the HubSpot connector (parent auth handler handles it)
      const firstCall = fetchMock.mock.calls[0];
      const options = firstCall[1] as RequestInit;
      const headers = options.headers as Record<string, string>;
      // No "Bearer test-api-key" — auth handler returns empty headers in mock
      expect(headers.authorization).toBeUndefined();
    });
  });

  // ─── FetchResult metadata ───

  describe("FetchResult metadata", () => {
    it("includes sourceId in fetchAll result", async () => {
      fetchMock.mockResolvedValue(mockFetchOk(makeListResponse([])));

      const result = await connector.fetchAll();

      expect(result.sourceId).toBe("hubspot_test");
    });

    it("includes fetchedAt ISO timestamp in fetchAll result", async () => {
      fetchMock.mockResolvedValue(mockFetchOk(makeListResponse([])));

      const result = await connector.fetchAll();

      expect(result.fetchedAt).toBeDefined();
      // Should be valid ISO 8601 date
      expect(new Date(result.fetchedAt).toISOString()).toBe(result.fetchedAt);
    });

    it("includes sourceId in fetchDelta result", async () => {
      fetchMock.mockResolvedValue(mockFetchOk(makeSearchResponse([], 0)));

      const result = await connector.fetchDelta("2026-01-01T00:00:00Z");

      expect(result.sourceId).toBe("hubspot_test");
    });

    it("includes syncTypes in fetchAll metadata", async () => {
      fetchMock.mockResolvedValue(mockFetchOk(makeListResponse([])));

      const result = await connector.fetchAll();

      expect(result.metadata.syncTypes).toEqual(["company", "contact", "deal", "ticket", "engagement"]);
    });

    it("includes syncTypes and since in fetchDelta metadata", async () => {
      fetchMock.mockResolvedValue(mockFetchOk(makeSearchResponse([], 0)));

      const result = await connector.fetchDelta("2026-03-10T00:00:00Z");

      expect(result.metadata.syncTypes).toEqual(["company", "contact", "deal", "ticket", "engagement"]);
      expect(result.metadata.since).toBe("2026-03-10T00:00:00Z");
    });
  });

  // ─── estimateCount edge cases ───

  describe("estimateCount edge cases", () => {
    it("returns 0 when census fetch fails for a type", async () => {
      // Test API: ok
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "contact")])));
      // company census: network error (retries all fail)
      fetchMock.mockRejectedValueOnce(new Error("Network timeout"));
      fetchMock.mockRejectedValueOnce(new Error("Network timeout"));
      fetchMock.mockRejectedValueOnce(new Error("Network timeout"));
      fetchMock.mockRejectedValueOnce(new Error("Network timeout"));
      // contact census: ok, no more
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "x")])));
      // deal census: ok, no more
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "x")])));
      // ticket census: ok, no more
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "x")])));
      // engagement census: ok, no more
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));
      // Sample
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      const result = await connector.connect();

      expect(result.ok).toBe(true);
      // company=0 (error) + contact=1 + deal=1 + ticket=1 + engagement=0 = 3
      expect(result.census.estimatedItems).toBe(3);
    });

    it("returns 0 when census fetch returns HTTP error", async () => {
      // Test API: ok
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "contact")])));
      // company census: HTTP 403
      fetchMock.mockResolvedValueOnce(mockFetchError(403, "Forbidden"));
      // contact census: ok
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));
      // deal census: ok
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));
      // ticket census: ok
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));
      // engagement census: ok
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));
      // Sample
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      const result = await connector.connect();

      expect(result.ok).toBe(true);
      // company=0 (403) + contact=0 + deal=0 + ticket=0 + engagement=0 = 0
      expect(result.census.estimatedItems).toBe(0);
    });

    it("uses type-specific rough estimates when hasMore is true", async () => {
      // Test API: ok
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "contact")])));
      // company: hasMore → 50
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "x")], "more")));
      // contact: hasMore → 100
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "x")], "more")));
      // deal: hasMore → 30
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "x")], "more")));
      // ticket: hasMore → 20
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "x")], "more")));
      // engagement: hasMore → 200
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([makeHubSpotObject("1", "x")], "more")));
      // Sample
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      const result = await connector.connect();

      expect(result.ok).toBe(true);
      // company=50 + contact=100 + deal=30 + ticket=20 + engagement=200 = 400
      expect(result.census.estimatedItems).toBe(400);
    });
  });

  // ─── Data transformation via parser ───

  describe("data transformation", () => {
    it("transforms contact records with all fields", async () => {
      const contact = makeHubSpotObject("42", "contact", {
        email: "mario@pmi.it",
        firstname: "Mario",
        lastname: "Rossi",
        phone: "+39 02 1234567",
        company: "PMI Srl",
        lifecyclestage: "lead",
      });

      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))        // company
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([contact]))) // contact
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))        // deal
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))        // ticket
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])));       // engagement

      const result = await connector.fetchAll();

      expect(result.items).toHaveLength(1);
      const record = result.items[0];
      expect(record.externalId).toBe("42");
      expect(record.objectType).toBe("contact");
      expect(record.displayName).toBe("Mario Rossi");
      expect(record.email).toBe("mario@pmi.it");
      expect(record.phone).toBe("+39 02 1234567");
      expect(record.companyName).toBe("PMI Srl");
      expect(record.stage).toBe("lead");
    });

    it("transforms deal records with amount parsing", async () => {
      const deal = makeHubSpotObject("99", "deal", {
        dealname: "Contratto Annuale",
        amount: "15000.50",
        dealstage: "closedwon",
        pipeline: "default",
        closedate: "2026-06-01T00:00:00Z",
      });

      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([]))) // contacts
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([]))) // companies
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([deal]))) // deals
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([]))); // tickets

      const result = await connector.fetchAll();

      const record = result.items[0];
      expect(record.objectType).toBe("deal");
      expect(record.displayName).toBe("Contratto Annuale");
      expect(record.amount).toBe(15000.50);
      expect(record.stage).toBe("closedwon");
      expect(record.pipeline).toBe("default");
      expect(record.closeDate).toBe("2026-06-01T00:00:00Z");
    });

    it("preserves rawProperties on all records", async () => {
      const contact = makeHubSpotObject("1", "contact", {
        email: "test@example.com",
        custom_field: "custom_value",
      });

      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([contact])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])))
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      const result = await connector.fetchAll();

      expect(result.items[0].rawProperties).toEqual({
        email: "test@example.com",
        custom_field: "custom_value",
      });
    });
  });

  // ─── Error resilience ───

  describe("error resilience", () => {
    it("continues to next type when fetchDelta search throws network error", async () => {
      // company: network error (all 4 retries fail)
      fetchMock
        .mockRejectedValueOnce(new Error("ETIMEDOUT"))
        .mockRejectedValueOnce(new Error("ETIMEDOUT"))
        .mockRejectedValueOnce(new Error("ETIMEDOUT"))
        .mockRejectedValueOnce(new Error("ETIMEDOUT"))
        // contact: ok
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([makeHubSpotObject("c1", "contact")], 1)))
        // deal, ticket, engagement: empty
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)))
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)))
        .mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)));

      const result = await connector.fetchDelta("2026-01-01T00:00:00Z");

      expect(result.items).toHaveLength(1);
      expect(result.items[0].objectType).toBe("contact");
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Search company error"));
    });

    it("handles connect() when test API throws", async () => {
      fetchMock.mockRejectedValue(new Error("DNS resolution failed"));

      const result = await connector.connect();

      expect(result.ok).toBe(false);
      expect(result.message).toContain("DNS resolution failed");
      expect(result.census.estimatedItems).toBe(0);
    });

    it("handles connect() with empty text on error response", async () => {
      const errorResponse = {
        ok: false,
        status: 503,
        text: () => Promise.reject(new Error("Body read failed")),
        json: () => Promise.reject(new Error("Not JSON")),
        headers: new Headers(),
      } as unknown as Response;

      fetchMock.mockResolvedValueOnce(errorResponse);

      const result = await connector.connect();

      expect(result.ok).toBe(false);
      expect(result.message).toContain("503");
    });

    it("stops fetchAll pagination on HTTP error mid-type", async () => {
      // company page 1: ok with cursor
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeListResponse([makeHubSpotObject("co1", "company")], "next_page"))
      );
      // company page 2: server error
      fetchMock.mockResolvedValueOnce(mockFetchError(502, "Bad Gateway"));
      // contact, deal, ticket, engagement: ok empty
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      const result = await connector.fetchAll();

      // Should have 1 company from page 1, then stopped that type on error
      expect(result.items).toHaveLength(1);
      expect(result.items[0].externalId).toBe("co1");
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Error listing company"));
    });
  });

  // ─── Explicit token header injection ───

  describe("explicit token header injection", () => {
    it("merges Authorization with Content-Type header", async () => {
      fetchMock.mockResolvedValue(mockFetchOk(makeListResponse([])));

      await connector.fetchAll();

      const firstCall = fetchMock.mock.calls[0];
      const options = firstCall[1] as RequestInit;
      const headers = options.headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer test-api-key");
      expect(headers["content-type"]).toBe("application/json");
    });

    it("preserves custom headers when explicit token is set", async () => {
      // This tests the header merge in fetchWithRetry override
      fetchMock.mockResolvedValue(mockFetchOk(makeSearchResponse([], 0)));

      await connector.fetchDelta("2026-01-01T00:00:00Z");

      // Search uses POST — verify headers are set correctly
      const firstCall = fetchMock.mock.calls[0];
      const options = firstCall[1] as RequestInit;
      const headers = options.headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer test-api-key");
    });
  });
});
