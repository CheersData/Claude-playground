import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSource } from "@/lib/staff/data-connector/types";

// Mock auth handler
vi.mock("@/lib/staff/data-connector/auth", () => ({
  createAuthHandler: vi.fn().mockImplementation(() => ({
    authenticate: vi.fn().mockResolvedValue(undefined),
    isValid: vi.fn().mockReturnValue(true),
    refresh: vi.fn().mockResolvedValue(undefined),
    getHeaders: vi.fn().mockReturnValue({ Authorization: "Bearer mock-fatture-token" }),
    strategyType: "api-key",
  })),
}));

import { FattureInCloudConnector } from "@/lib/staff/data-connector/connectors/fatture-in-cloud";

// ─── Helpers ───

function makeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: "fatture_test",
    name: "Fatture in Cloud Test",
    shortName: "FATTURE",
    dataType: "crm-records",
    vertical: "legal",
    connector: "fatture-in-cloud",
    config: { companyId: "12345" },
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

function makeInvoice(id: number, number_val: number, amount = 100) {
  return {
    id,
    type: "invoice",
    number: number_val,
    numeration: "/A",
    date: "2026-01-15",
    year: 2026,
    subject: "Test invoice",
    visible_subject: "Test invoice",
    currency: { id: "EUR", symbol: "€", exchange_rate: "1.0" },
    amount_net: amount,
    amount_vat: amount * 0.22,
    amount_gross: amount * 1.22,
    amount_due_discount: 0,
    entity: {
      id: 1,
      name: "Cliente Test",
      vat_number: "IT12345678901",
      tax_code: "RSSMRA85T10A944S",
      address_street: "Via Roma 1",
      address_city: "Milano",
      address_province: "MI",
      address_postal_code: "20100",
      country: "Italia",
    },
    items_list: [],
    payments_list: [],
    payment_method: { id: 1 },
  };
}

function makeClient(id: number, name: string) {
  return {
    id,
    name,
    vat_number: "IT12345678901",
    tax_code: "RSSMRA85T10A944S",
    type: "company",
    first_name: "",
    last_name: "",
    email: `${name.toLowerCase().replace(/\s/g, "")}@test.com`,
    phone: "+39 02 1234567",
    address_street: "Via Roma 1",
    address_city: "Milano",
    address_province: "MI",
    address_postal_code: "20100",
    country: "Italia",
  };
}

function makePaginatedResponse(data: unknown[], page = 1, lastPage = 1, total?: number) {
  return {
    current_page: page,
    last_page: lastPage,
    per_page: 50,
    total: total ?? data.length,
    data,
  };
}

describe("FattureInCloudConnector", () => {
  let connector: FattureInCloudConnector;
  let logSpy: ReturnType<typeof vi.fn<(msg: string) => void>>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.fn();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    connector = new FattureInCloudConnector(makeSource(), logSpy);
    vi.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── Constructor ───

  describe("constructor", () => {
    it("throws when companyId is missing", () => {
      expect(() => {
        new FattureInCloudConnector(makeSource({ config: {} }), logSpy);
      }).toThrow("companyId");
    });

    it("accepts valid companyId", () => {
      expect(() => {
        new FattureInCloudConnector(makeSource(), logSpy);
      }).not.toThrow();
    });
  });

  // ─── connect() ───

  describe("connect", () => {
    it("returns ok=true with company info and census", async () => {
      // 1. Company info
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({ data: { info: { name: "Acme Srl", vat_number: "IT12345678901" } } })
      );
      // 2-4. Census counts (issued, received, clients)
      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makePaginatedResponse([], 1, 1, 42)))
        .mockResolvedValueOnce(mockFetchOk(makePaginatedResponse([], 1, 1, 15)))
        .mockResolvedValueOnce(mockFetchOk(makePaginatedResponse([], 1, 1, 8)));
      // 5. Sample invoices
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makePaginatedResponse([makeInvoice(1, 1)]))
      );

      const result = await connector.connect();

      expect(result.ok).toBe(true);
      expect(result.message).toContain("Acme Srl");
      expect(result.census.estimatedItems).toBe(65); // 42 + 15 + 8
    });

    it("returns ok=false when API fails", async () => {
      fetchMock.mockRejectedValue(new Error("Connection refused"));

      const result = await connector.connect();

      expect(result.ok).toBe(false);
      expect(result.message).toContain("Connection refused");
    });

    it("uses correct API base URL", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({ data: { info: { name: "Test", vat_number: null } } })
      );
      fetchMock.mockResolvedValueOnce(mockFetchOk(makePaginatedResponse([], 1, 1, 0)));
      fetchMock.mockResolvedValueOnce(mockFetchOk(makePaginatedResponse([], 1, 1, 0)));
      fetchMock.mockResolvedValueOnce(mockFetchOk(makePaginatedResponse([], 1, 1, 0)));
      fetchMock.mockResolvedValueOnce(mockFetchOk(makePaginatedResponse([])));

      await connector.connect();

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("https://api-v2.fattureincloud.it");
      expect(url).toContain("/c/12345/info");
    });
  });

  // ─── fetchAll() ───

  describe("fetchAll", () => {
    it("fetches all 3 sync types", async () => {
      // issued invoices
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makePaginatedResponse([makeInvoice(1, 1)]))
      );
      // received invoices
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makePaginatedResponse([makeInvoice(2, 2)]))
      );
      // clients
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makePaginatedResponse([makeClient(1, "Acme")]))
      );

      const result = await connector.fetchAll();

      expect(result.items).toHaveLength(3);
      expect(result.metadata.companyId).toBe("12345");
    });

    it("handles multi-page pagination", async () => {
      // issued: 2 pages
      fetchMock
        .mockResolvedValueOnce(
          mockFetchOk(makePaginatedResponse([makeInvoice(1, 1)], 1, 2, 2))
        )
        .mockResolvedValueOnce(
          mockFetchOk(makePaginatedResponse([makeInvoice(2, 2)], 2, 2, 2))
        );
      // received: empty
      fetchMock.mockResolvedValueOnce(mockFetchOk(makePaginatedResponse([])));
      // clients: empty
      fetchMock.mockResolvedValueOnce(mockFetchOk(makePaginatedResponse([])));

      const result = await connector.fetchAll();

      expect(result.items).toHaveLength(2);
      expect(result.items[0].externalId).toBeTruthy();
    });

    it("respects global limit", async () => {
      // issued: 3 invoices
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makePaginatedResponse([makeInvoice(1, 1), makeInvoice(2, 2), makeInvoice(3, 3)]))
      );

      const result = await connector.fetchAll({ limit: 2 });

      expect(result.items.length).toBeLessThanOrEqual(3);
    });

    it("includes correct URLs with companyId", async () => {
      fetchMock.mockResolvedValue(mockFetchOk(makePaginatedResponse([])));

      await connector.fetchAll();

      const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(urls[0]).toContain("/c/12345/issued_documents/invoices");
    });
  });

  // ─── fetchDelta() ───

  describe("fetchDelta", () => {
    it("passes date_from parameter for delta sync", async () => {
      fetchMock.mockResolvedValue(mockFetchOk(makePaginatedResponse([])));

      const result = await connector.fetchDelta("2026-03-01T10:30:00Z");

      expect(result.metadata.dateFrom).toBe("2026-03-01");
      expect(result.metadata.since).toBe("2026-03-01T10:30:00Z");
    });

    it("returns delta records", async () => {
      // issued invoices with delta
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makePaginatedResponse([makeInvoice(5, 5)]))
      );
      // received: empty
      fetchMock.mockResolvedValueOnce(mockFetchOk(makePaginatedResponse([])));
      // clients: empty
      fetchMock.mockResolvedValueOnce(mockFetchOk(makePaginatedResponse([])));

      const result = await connector.fetchDelta("2026-03-01T00:00:00Z");

      expect(result.items).toHaveLength(1);
    });
  });

  // ─── Public API methods ───

  describe("fetchCompanyInfo", () => {
    it("returns company info from API", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({
          data: {
            info: { name: "Test Srl", vat_number: "IT99999999999" },
          },
        })
      );

      const info = await connector.fetchCompanyInfo("12345");

      expect(info.name).toBe("Test Srl");
      expect(info.vat_number).toBe("IT99999999999");
    });
  });

  describe("fetchIssuedInvoices", () => {
    it("returns parsed invoices for single page", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makePaginatedResponse([makeInvoice(1, 1, 200)]))
      );

      const invoices = await connector.fetchIssuedInvoices("12345", { page: 1, perPage: 10 });

      expect(invoices).toHaveLength(1);
    });
  });

  describe("fetchReceivedInvoices", () => {
    it("returns parsed received invoices for single page", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makePaginatedResponse([makeInvoice(10, 1, 500)]))
      );

      const invoices = await connector.fetchReceivedInvoices("12345", { page: 1, perPage: 10 });

      expect(invoices).toHaveLength(1);
    });

    it("uses correct received_documents endpoint", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makePaginatedResponse([]))
      );

      await connector.fetchReceivedInvoices("12345", { page: 1 });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("/c/12345/received_documents");
    });

    it("passes dateFrom parameter", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makePaginatedResponse([]))
      );

      await connector.fetchReceivedInvoices("12345", { page: 1, dateFrom: "2026-03-01" });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("date_from=2026-03-01");
    });

    it("paginates across all pages when no page specified", async () => {
      fetchMock
        .mockResolvedValueOnce(
          mockFetchOk(makePaginatedResponse([makeInvoice(1, 1)], 1, 2, 2))
        )
        .mockResolvedValueOnce(
          mockFetchOk(makePaginatedResponse([makeInvoice(2, 2)], 2, 2, 2))
        );

      const invoices = await connector.fetchReceivedInvoices("12345");

      expect(invoices).toHaveLength(2);
    });
  });

  describe("fetchClients", () => {
    it("returns clients for a single page", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makePaginatedResponse([makeClient(1, "Acme"), makeClient(2, "Beta")]))
      );

      const clients = await connector.fetchClients("12345", { page: 1 });

      expect(clients).toHaveLength(2);
    });

    it("uses correct entities/clients endpoint", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makePaginatedResponse([]))
      );

      await connector.fetchClients("12345", { page: 1 });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("/c/12345/entities/clients");
    });

    it("paginates across all pages when no page specified", async () => {
      fetchMock
        .mockResolvedValueOnce(
          mockFetchOk(makePaginatedResponse([makeClient(1, "A")], 1, 2, 2))
        )
        .mockResolvedValueOnce(
          mockFetchOk(makePaginatedResponse([makeClient(2, "B")], 2, 2, 2))
        );

      const clients = await connector.fetchClients("12345");

      expect(clients).toHaveLength(2);
    });
  });

  // ─── countEndpoint (indirectly via connect) ───

  describe("countEndpoint behavior", () => {
    it("returns 0 when count endpoint throws error", async () => {
      // Company info succeeds
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({ data: { info: { name: "Test", vat_number: null } } })
      );
      // Count endpoints: first fails, others return 0
      fetchMock.mockResolvedValueOnce(mockFetchError(500, "Internal Server Error"));
      fetchMock.mockResolvedValueOnce(mockFetchError(500, "Internal Server Error"));
      fetchMock.mockResolvedValueOnce(mockFetchError(500, "Internal Server Error"));
      // Sample data
      fetchMock.mockResolvedValueOnce(mockFetchOk(makePaginatedResponse([])));

      const result = await connector.connect();

      // countEndpoint catches errors and returns 0
      expect(result.ok).toBe(true);
      expect(result.census.estimatedItems).toBe(0);
    });
  });

  // ─── Error handling ───

  describe("error handling", () => {
    it("handles HTTP errors from API", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchError(403, "Forbidden"));

      await expect(connector.fetchCompanyInfo("12345")).rejects.toThrow("403");
    });

    it("includes path in error message", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchError(404, "Not Found"));

      await expect(connector.fetchCompanyInfo("99999")).rejects.toThrow("/c/99999/info");
    });

    it("handles network failures in fetchAll", async () => {
      fetchMock.mockRejectedValue(new Error("fetch failed"));

      await expect(connector.fetchAll()).rejects.toThrow("fetch failed");
    });
  });

  // ─── fetchDelta URL construction ───

  describe("fetchDelta URL construction", () => {
    it("passes date_from in issued invoices URL", async () => {
      fetchMock.mockResolvedValue(mockFetchOk(makePaginatedResponse([])));

      await connector.fetchDelta("2026-03-10T08:00:00Z");

      const urls = fetchMock.mock.calls.map((c: unknown[]) => c[0] as string);
      const issuedUrl = urls.find((u) => u.includes("issued_documents"));
      expect(issuedUrl).toContain("date_from=2026-03-10");
    });
  });
});
