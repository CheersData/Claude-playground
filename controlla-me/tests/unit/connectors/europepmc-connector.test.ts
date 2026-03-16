import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSource } from "@/lib/staff/data-connector/types";

// Mock authenticated-base to break circular dependency (base.ts ↔ authenticated-base.ts)
vi.mock("@/lib/staff/data-connector/connectors/authenticated-base", () => ({
  AuthenticatedBaseConnector: class {},
}));

import { EuropePMCConnector } from "@/lib/staff/data-connector/connectors/europepmc";

// ─── Helpers ───

function makeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: "europepmc_test",
    name: "Europe PMC Test",
    shortName: "EPMC",
    dataType: "medical-articles",
    vertical: "medical",
    connector: "europepmc",
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

function makeSearchResponse(
  articles: Array<{
    id: string;
    title: string;
    abstractText?: string;
    pmcid?: string;
    journalTitle?: string;
    pubYear?: string;
    citedByCount?: number;
  }>,
  hitCount: number,
  nextCursorMark?: string
) {
  return {
    hitCount,
    nextCursorMark,
    resultList: {
      result: articles.map((a) => ({
        id: a.id,
        source: "PMC",
        pmcid: a.pmcid ?? `PMC${a.id}`,
        title: a.title,
        abstractText: a.abstractText ?? `Abstract for ${a.title}. This is a test abstract with enough text.`,
        journalTitle: a.journalTitle ?? "Test Journal",
        pubYear: a.pubYear ?? "2026",
        citedByCount: a.citedByCount ?? 10,
        isOpenAccess: "Y",
        authorString: "Author A, Author B",
      })),
    },
  };
}

describe("EuropePMCConnector", () => {
  let connector: EuropePMCConnector;
  let logSpy: ReturnType<typeof vi.fn<(msg: string) => void>>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.fn();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    connector = new EuropePMCConnector(makeSource(), logSpy);
    vi.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── connect() ───

  describe("connect", () => {
    it("returns ok=true with hit count", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSearchResponse(
            [
              { id: "1", title: "Systematic Review of X" },
              { id: "2", title: "Meta-Analysis of Y" },
            ],
            150000
          )
        )
      );

      const result = await connector.connect();

      expect(result.ok).toBe(true);
      expect(result.message).toContain("150000");
      expect(result.census.estimatedItems).toBe(50000); // capped at 50K
      expect(result.census.sampleFields).toContain("abstractText");
    });

    it("returns ok=false on connection error", async () => {
      fetchMock.mockRejectedValue(new Error("DNS resolution failed"));

      const result = await connector.connect();

      expect(result.ok).toBe(false);
      expect(result.message).toContain("DNS resolution failed");
    });

    it("uses correct Europe PMC API URL", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)));

      await connector.connect();

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("ebi.ac.uk/europepmc/webservices/rest/search");
      expect(url).toContain("OPEN_ACCESS");
      expect(url).toContain("format=json");
    });
  });

  // ─── fetchAll() ───

  describe("fetchAll", () => {
    it("fetches articles with cursor pagination", async () => {
      // Page 1
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSearchResponse(
            [{ id: "1", title: "Article One" }],
            100,
            "cursor_page2"
          )
        )
      );
      // Page 2
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSearchResponse(
            [{ id: "2", title: "Article Two" }],
            100
          )
        )
      );

      const result = await connector.fetchAll({ limit: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].articleNumber).toBe("PMC1");
      expect(result.items[1].articleNumber).toBe("PMC2");
    });

    it("respects limit parameter", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSearchResponse(
            [
              { id: "1", title: "Article 1" },
              { id: "2", title: "Article 2" },
            ],
            100,
            "next"
          )
        )
      );

      const result = await connector.fetchAll({ limit: 1 });

      expect(result.items).toHaveLength(1);
    });

    it("skips articles without abstract and title", async () => {
      const response = makeSearchResponse([], 1);
      response.resultList.result = [
        {
          id: "1",
          source: "PMC",
          title: "",
          abstractText: "",
          journalTitle: "J",
          pubYear: "2026",
          citedByCount: 0,
          isOpenAccess: "Y",
          authorString: "",
        } as never,
      ];
      fetchMock.mockResolvedValueOnce(mockFetchOk(response));

      const result = await connector.fetchAll({ limit: 10 });

      expect(result.items).toHaveLength(0);
    });

    it("skips articles with very short text", async () => {
      const response = makeSearchResponse([], 1);
      response.resultList.result = [
        {
          id: "1",
          source: "PMC",
          pmcid: "PMC1",
          title: "Short",
          abstractText: "Too short",
          journalTitle: "J",
          pubYear: "2026",
          citedByCount: 0,
          isOpenAccess: "Y",
          authorString: "",
        } as never,
      ];
      fetchMock.mockResolvedValueOnce(mockFetchOk(response));

      const result = await connector.fetchAll({ limit: 10 });

      expect(result.items).toHaveLength(0); // < 50 chars
    });

    it("includes hierarchy with journal and year", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSearchResponse(
            [{ id: "1", title: "Test Article", journalTitle: "Nature Medicine", pubYear: "2025" }],
            1
          )
        )
      );

      const result = await connector.fetchAll({ limit: 10 });

      expect(result.items[0].hierarchy.journal).toBe("Nature Medicine");
      expect(result.items[0].hierarchy.year).toBe("2025");
    });

    it("builds correct source URL", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSearchResponse([{ id: "1", title: "Test", pmcid: "PMC12345" }], 1)
        )
      );

      const result = await connector.fetchAll({ limit: 10 });

      expect(result.items[0].sourceUrl).toContain("europepmc.org/article/PMC/PMC12345");
    });

    it("uses custom query from config", async () => {
      const customConnector = new EuropePMCConnector(
        makeSource({ config: { query: "custom AND query" } }),
        logSpy
      );

      fetchMock.mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)));

      await customConnector.fetchAll({ limit: 10 });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain(encodeURIComponent("custom AND query"));
    });

    it("includes metadata in result", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)));

      const result = await connector.fetchAll();

      expect(result.metadata.source).toBe("Europe PMC");
    });
  });

  // ─── fetchDelta() ───

  describe("fetchDelta", () => {
    it("adds FIRST_PDATE filter for delta sync", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)));

      await connector.fetchDelta("2026-03-01T00:00:00Z", { limit: 10 });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("FIRST_PDATE");
      expect(url).toContain("2026-03-01");
    });

    it("includes deltaFrom in metadata", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeSearchResponse([], 0)));

      const result = await connector.fetchDelta("2026-03-01T00:00:00Z");

      expect(result.metadata.deltaFrom).toBe("2026-03-01T00:00:00Z");
    });

    it("returns delta articles", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSearchResponse([{ id: "new1", title: "New Study on X" }], 1)
        )
      );

      const result = await connector.fetchDelta("2026-03-10T00:00:00Z", { limit: 10 });

      expect(result.items).toHaveLength(1);
    });
  });
});
