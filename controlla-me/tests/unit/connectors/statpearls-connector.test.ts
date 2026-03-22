import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSource } from "@/lib/staff/data-connector/types";

// Mock authenticated-base to break circular dependency (base.ts ↔ authenticated-base.ts)
vi.mock("@/lib/staff/data-connector/connectors/authenticated-base", () => ({
  AuthenticatedBaseConnector: class {},
}));

import { StatPearlsConnector } from "@/lib/staff/data-connector/connectors/statpearls";

// ─── Helpers ───

function makeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: "statpearls_test",
    name: "StatPearls Test",
    shortName: "SP",
    dataType: "medical-articles",
    vertical: "medical",
    connector: "statpearls",
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

function makeESearchResult(count: number, ids: string[]) {
  return {
    esearchresult: {
      count: String(count),
      idlist: ids,
      retmax: String(ids.length),
    },
  };
}

function makeESummaryResult(entries: Record<string, { uid: string; title: string; authors?: Array<{ name: string }>; pubdate?: string }>) {
  return { result: entries };
}

describe("StatPearlsConnector", () => {
  let connector: StatPearlsConnector;
  let logSpy: ReturnType<typeof vi.fn<(msg: string) => void>>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.fn();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    connector = new StatPearlsConnector(makeSource(), logSpy);
    vi.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── connect() ───

  describe("connect", () => {
    it("returns ok=true with article count", async () => {
      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeESearchResult(9500, ["NBK1", "NBK2", "NBK3"])))
        .mockResolvedValueOnce(
          mockFetchOk(
            makeESummaryResult({
              NBK1: { uid: "NBK1", title: "Cardiac Anatomy" },
              NBK2: { uid: "NBK2", title: "Hypertension Management" },
            })
          )
        );

      const result = await connector.connect();

      expect(result.ok).toBe(true);
      expect(result.census.estimatedItems).toBe(9500);
      expect(result.message).toContain("9500");
      expect(result.census.sampleFields).toContain("title");
    });

    it("returns ok=false when esearch fails", async () => {
      fetchMock.mockRejectedValueOnce(new Error("NCBI unreachable"));

      const result = await connector.connect();

      expect(result.ok).toBe(false);
      expect(result.message).toContain("NCBI");
    });

    it("handles esummary failure gracefully", async () => {
      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeESearchResult(100, ["NBK1"])))
        .mockRejectedValueOnce(new Error("esummary timeout"));

      const result = await connector.connect();

      // Should still succeed (esummary failure is non-blocking)
      expect(result.ok).toBe(true);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("esummary fallito"));
    });

    it("uses correct NCBI API URL", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeESearchResult(0, [])));

      await connector.connect();

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
      expect(url).toContain("db=books");
      expect(url).toContain("statpearls");
    });
  });

  // ─── fetchAll() ───

  describe("fetchAll", () => {
    it("fetches articles in batches", async () => {
      // Batch 1: esearch → 2 IDs
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeESearchResult(50, ["NBK1", "NBK2"])));
      // Batch 1: esummary
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeESummaryResult({
            NBK1: { uid: "NBK1", title: "Cardiac Arrest Management" },
            NBK2: { uid: "NBK2", title: "Diabetes Mellitus Type 2" },
          })
        )
      );
      // Batch 2: esearch → 0 IDs (end of results)
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeESearchResult(50, [])));

      const result = await connector.fetchAll({ limit: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].articleNumber).toBe("SP-NBK1");
      expect(result.items[0].articleTitle).toBe("Cardiac Arrest Management");
      expect(result.items[0].hierarchy.category).toBe("StatPearls");
    });

    it("respects limit parameter", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeESearchResult(100, ["NBK1"])));
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeESummaryResult({ NBK1: { uid: "NBK1", title: "Test" } }))
      );
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeESearchResult(100, [])));

      const result = await connector.fetchAll({ limit: 1 });

      expect(result.items.length).toBeLessThanOrEqual(1);
    });

    it("infers medical specialty from title", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeESearchResult(2, ["NBK1", "NBK2"])));
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeESummaryResult({
            NBK1: { uid: "NBK1", title: "Myocardial Infarction Pathophysiology" },
            NBK2: { uid: "NBK2", title: "Brain Tumor Classification" },
          })
        )
      );
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeESearchResult(2, [])));

      const result = await connector.fetchAll({ limit: 10 });

      expect(result.items[0].hierarchy.specialty).toBe("cardiologia");
      expect(result.items[1].hierarchy.specialty).toBe("neurologia");
    });

    it("defaults to medicina_generale for unknown specialty", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeESearchResult(1, ["NBK1"])));
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeESummaryResult({ NBK1: { uid: "NBK1", title: "General Review" } }))
      );
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeESearchResult(1, [])));

      const result = await connector.fetchAll({ limit: 10 });

      expect(result.items[0].hierarchy.specialty).toBe("medicina_generale");
    });

    it("skips entries without title", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeESearchResult(2, ["NBK1", "NBK2"])));
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeESummaryResult({
            NBK1: { uid: "NBK1", title: "" },
            NBK2: { uid: "NBK2", title: "Valid Article" },
          })
        )
      );
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeESearchResult(2, [])));

      const result = await connector.fetchAll({ limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].articleTitle).toBe("Valid Article");
    });

    it("includes metadata in result", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeESearchResult(0, [])));

      const result = await connector.fetchAll();

      expect(result.metadata.source).toBe("NCBI Bookshelf");
      expect(result.metadata.bookId).toBeDefined();
    });
  });

  // ─── fetchDelta() ───

  describe("fetchDelta", () => {
    it("uses mindate parameter for delta sync", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeESearchResult(0, [])));

      await connector.fetchDelta("2026-03-01T12:00:00Z");

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("datetype=mdat");
      expect(url).toContain("mindate=2026/03/01");
    });

    it("returns empty when no updates found", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeESearchResult(0, [])));

      const result = await connector.fetchDelta("2026-03-14T00:00:00Z");

      expect(result.items).toHaveLength(0);
      expect(result.metadata.deltaFrom).toBe("2026-03-14T00:00:00Z");
    });
  });
});
