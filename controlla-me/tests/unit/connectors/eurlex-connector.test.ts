import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock authenticated-base to break circular dependency (base.ts re-exports authenticated-base.ts)
vi.mock("@/lib/staff/data-connector/connectors/authenticated-base", () => ({
  AuthenticatedBaseConnector: class {},
}));

import { EurLexConnector } from "@/lib/staff/data-connector/connectors/eurlex";
import type { DataSource } from "@/lib/staff/data-connector/types";

// ─── Mock html-parser ───
vi.mock("@/lib/staff/data-connector/parsers/html-parser", () => ({
  parseEurLexHtml: vi.fn().mockReturnValue([
    {
      articleNumber: "1",
      articleTitle: "Oggetto",
      articleText: "Il presente regolamento tutela le persone fisiche...",
      hierarchy: { capo: "I", sezione: "1" },
    },
    {
      articleNumber: "2",
      articleTitle: "Ambito di applicazione materiale",
      articleText: "Il presente regolamento si applica...",
      hierarchy: { capo: "I", sezione: "1" },
    },
    {
      articleNumber: "3",
      articleTitle: "Ambito di applicazione territoriale",
      articleText: "Il presente regolamento si applica...",
      hierarchy: { capo: "I", sezione: "1" },
    },
  ]),
}));

// ─── Helpers ───

const SPARQL_ENDPOINT =
  "https://publications.europa.eu/webapi/rdf/sparql";

function makeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: "gdpr",
    name: "Regolamento Generale sulla Protezione dei Dati (GDPR)",
    shortName: "GDPR",
    dataType: "legal-articles",
    vertical: "legal",
    connector: "eurlex",
    config: {
      celexId: "32016R0679",
    },
    lifecycle: "planned",
    estimatedItems: 99,
    ...overrides,
  };
}

function mockFetchOk(body: unknown, status = 200): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
    json: () =>
      Promise.resolve(typeof body === "string" ? JSON.parse(body) : body),
    headers: new Headers(),
  } as unknown as Response;
}

function mockFetchError(status: number, body = ""): Response {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.reject(new Error("not json")),
    headers: new Headers(),
  } as unknown as Response;
}

function makeSparqlResult(bindings: Array<Record<string, { value?: string }>>): unknown {
  return {
    results: { bindings },
  };
}

describe("EurLexConnector", () => {
  let connector: EurLexConnector;
  let logSpy: ReturnType<typeof vi.fn<(msg: string) => void>>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.fn();
    connector = new EurLexConnector(makeSource(), logSpy);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── connect() ───

  describe("connect", () => {
    it("returns ok=false when celexId is missing", async () => {
      const source = makeSource({ config: {} });
      connector = new EurLexConnector(source, logSpy);

      const result = await connector.connect();
      expect(result.ok).toBe(false);
      expect(result.message).toContain("CELEX ID mancante");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("queries SPARQL to find Cellar URI", async () => {
      // SPARQL query -> found
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSparqlResult([
            {
              work: {
                value:
                  "http://publications.europa.eu/resource/cellar/abc123",
              },
            },
          ])
        )
      );

      // Cellar download -> HTML (try XHTML first)
      fetchMock.mockResolvedValueOnce(
        mockFetchOk("<html>" + "x".repeat(600) + "</html>")
      );

      const result = await connector.connect();

      // Verify SPARQL was called
      const sparqlCall = fetchMock.mock.calls[0];
      expect(sparqlCall[0]).toContain(SPARQL_ENDPOINT);
      expect(sparqlCall[0]).toContain("32016R0679");

      expect(result.ok).toBe(true);
      expect(result.message).toContain("CELEX 32016R0679 trovato");
    });

    it("constructs proper SPARQL SELECT query with CELEX filter", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeSparqlResult([]))
      );

      const result = await connector.connect();

      const sparqlCall = fetchMock.mock.calls[0];
      const url = new URL(sparqlCall[0]);
      const query = url.searchParams.get("query") ?? "";

      expect(query).toContain("SELECT ?work");
      expect(query).toContain("cdm:resource_legal_id_celex");
      expect(query).toContain('FILTER(STR(?celex) = "32016R0679")');
      expect(query).toContain("LIMIT 1");

      expect(result.ok).toBe(false);
      expect(result.message).toContain("non trovato");
    });

    it("returns ok=false when Cellar URI not found", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeSparqlResult([]))
      );

      const result = await connector.connect();
      expect(result.ok).toBe(false);
      expect(result.message).toContain("non trovato su EUR-Lex");
    });

    it("returns census with parsed article count and sample data", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSparqlResult([
            {
              work: {
                value:
                  "http://publications.europa.eu/resource/cellar/abc123",
              },
            },
          ])
        )
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchOk("<html>" + "x".repeat(600) + "</html>")
      );

      const result = await connector.connect();
      expect(result.census.estimatedItems).toBe(3); // mocked parser returns 3
      expect(result.census.availableFormats).toEqual(["xhtml", "html"]);
      expect(result.census.sampleData).toHaveLength(3);
    });

    it("returns ok=false on connection error", async () => {
      fetchMock.mockRejectedValue(new Error("DNS resolution failed"));

      const promise = connector.connect();
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      await vi.advanceTimersByTimeAsync(8000);

      const result = await promise;
      expect(result.ok).toBe(false);
      // findCellarUri catches the error internally and returns null,
      // so connect() sees "not found" rather than a connection error
      expect(result.message).toContain("non trovato su EUR-Lex");
    });
  });

  // ─── fetchAll() ───

  describe("fetchAll", () => {
    it("throws when celexId is missing", async () => {
      const source = makeSource({ config: {} });
      connector = new EurLexConnector(source, logSpy);

      await expect(connector.fetchAll()).rejects.toThrow(
        "CELEX ID mancante"
      );
    });

    it("fetches via SPARQL + Cellar and returns parsed articles", async () => {
      // SPARQL
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSparqlResult([
            {
              work: {
                value:
                  "http://publications.europa.eu/resource/cellar/def456",
              },
            },
          ])
        )
      );
      // Cellar HTML
      fetchMock.mockResolvedValueOnce(
        mockFetchOk("<html>" + "x".repeat(600) + "</html>")
      );

      const result = await connector.fetchAll();
      expect(result.sourceId).toBe("gdpr");
      expect(result.items).toHaveLength(3); // mocked parser returns 3
      expect(result.metadata).toHaveProperty("celexId", "32016R0679");
      expect(result.metadata).toHaveProperty(
        "cellarUri",
        "http://publications.europa.eu/resource/cellar/def456"
      );
      expect(result.metadata).toHaveProperty("format", "html");
    });

    it("applies limit to results", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSparqlResult([
            {
              work: {
                value: "http://publications.europa.eu/resource/cellar/xyz",
              },
            },
          ])
        )
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchOk("<html>" + "x".repeat(600) + "</html>")
      );

      const result = await connector.fetchAll({ limit: 1 });
      expect(result.items).toHaveLength(1);
    });

    it("throws when Cellar URI not found", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeSparqlResult([]))
      );

      await expect(connector.fetchAll()).rejects.toThrow(
        "Cellar URI non trovata"
      );
    });
  });

  // ─── fetchDelta() ───

  describe("fetchDelta", () => {
    it("returns empty items when act has not been modified since given date", async () => {
      // getLastModified SPARQL
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSparqlResult([
            { date: { value: "2023-01-15" } },
          ])
        )
      );

      const result = await connector.fetchDelta("2024-01-01");
      expect(result.items).toEqual([]);
      expect(result.metadata).toHaveProperty("changed", false);
      expect(result.metadata).toHaveProperty("lastModified", "2023-01-15");
    });

    it("re-fetches all when act may have been modified", async () => {
      // getLastModified -> modified after 'since'
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSparqlResult([
            { date: { value: "2024-06-01" } },
          ])
        )
      );
      // fetchAll -> SPARQL
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSparqlResult([
            {
              work: {
                value: "http://publications.europa.eu/resource/cellar/xyz",
              },
            },
          ])
        )
      );
      // fetchAll -> Cellar HTML
      fetchMock.mockResolvedValueOnce(
        mockFetchOk("<html>" + "x".repeat(600) + "</html>")
      );

      const result = await connector.fetchDelta("2024-01-01");
      expect(result.items).toHaveLength(3); // full re-fetch
    });

    it("re-fetches all when lastModified date is not available", async () => {
      // getLastModified -> empty bindings (date not found)
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeSparqlResult([]))
      );
      // fetchAll -> SPARQL
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSparqlResult([
            {
              work: {
                value: "http://publications.europa.eu/resource/cellar/abc",
              },
            },
          ])
        )
      );
      // fetchAll -> Cellar HTML
      fetchMock.mockResolvedValueOnce(
        mockFetchOk("<html>" + "x".repeat(600) + "</html>")
      );

      const result = await connector.fetchDelta("2024-01-01");
      expect(result.items).toHaveLength(3);
    });

    it("re-fetches when SPARQL for lastModified fails", async () => {
      // SPARQL error
      fetchMock.mockResolvedValueOnce(mockFetchError(500, "Internal Server Error"));
      // Advance through retries for the SPARQL call
      const sparqlPromise = connector.fetchDelta("2024-01-01");

      // The SPARQL call will be retried 3 times by fetchWithRetry,
      // but since executeSparql checks response.ok and throws, the
      // error is caught by getLastModified which returns null -> triggers fetchAll

      // fetchAll -> SPARQL (for cellar URI)
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSparqlResult([
            {
              work: {
                value: "http://publications.europa.eu/resource/cellar/xxx",
              },
            },
          ])
        )
      );
      // fetchAll -> Cellar
      fetchMock.mockResolvedValueOnce(
        mockFetchOk("<html>" + "x".repeat(600) + "</html>")
      );

      const result = await sparqlPromise;
      expect(result.items).toHaveLength(3);
    });
  });

  // ─── Cellar content negotiation ───

  describe("downloadFromCellar", () => {
    it("tries XHTML first, falls back to text/html", async () => {
      // SPARQL for cellar URI
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSparqlResult([
            {
              work: {
                value: "http://publications.europa.eu/resource/cellar/test",
              },
            },
          ])
        )
      );
      // XHTML request -> 406 not acceptable (too short body)
      fetchMock.mockResolvedValueOnce(
        mockFetchOk("short", 200) // OK but body < 500 chars
      );
      // text/html request -> success
      fetchMock.mockResolvedValueOnce(
        mockFetchOk("<html>" + "x".repeat(600) + "</html>")
      );

      const result = await connector.fetchAll();
      expect(result.items).toHaveLength(3);

      // XHTML was tried first
      // Note: fetchWithRetry normalizes headers via new Headers().entries() which lowercases keys
      const xhtmlCall = fetchMock.mock.calls[1];
      expect(xhtmlCall[1]?.headers?.["accept"]).toBe(
        "application/xhtml+xml"
      );

      // Then text/html
      const htmlCall = fetchMock.mock.calls[2];
      expect(htmlCall[1]?.headers?.["accept"]).toBe("text/html");
    });

    it("sends Accept-Language: it header", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSparqlResult([
            {
              work: {
                value: "http://publications.europa.eu/resource/cellar/test",
              },
            },
          ])
        )
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchOk("<html>" + "x".repeat(600) + "</html>")
      );

      await connector.fetchAll();

      // Note: fetchWithRetry normalizes headers via new Headers().entries() which lowercases keys
      const cellarCall = fetchMock.mock.calls[1];
      expect(cellarCall[1]?.headers?.["accept-language"]).toBe("it");
    });

    it("throws when both XHTML and HTML return insufficient content", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeSparqlResult([
            {
              work: {
                value: "http://publications.europa.eu/resource/cellar/test",
              },
            },
          ])
        )
      );
      // Both return short responses
      fetchMock.mockResolvedValueOnce(mockFetchOk("short"));
      fetchMock.mockResolvedValueOnce(mockFetchOk("also short"));

      await expect(connector.fetchAll()).rejects.toThrow(
        "Nessun formato HTML disponibile"
      );
    });
  });

  // ─── SPARQL query format ───

  describe("SPARQL query format", () => {
    it("requests JSON format for SPARQL results", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeSparqlResult([]))
      );

      await connector.connect();

      const sparqlCall = fetchMock.mock.calls[0];
      const url = new URL(sparqlCall[0]);
      expect(url.searchParams.get("format")).toBe(
        "application/sparql-results+json"
      );
    });

    it("uses correct SPARQL endpoint URL", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeSparqlResult([]))
      );

      await connector.connect();

      const sparqlCall = fetchMock.mock.calls[0];
      expect(sparqlCall[0]).toContain(SPARQL_ENDPOINT);
    });
  });

  // ─── Error handling ───

  describe("error handling", () => {
    it("handles SPARQL timeout gracefully in connect", async () => {
      fetchMock.mockRejectedValue(new Error("ETIMEDOUT"));

      const promise = connector.connect();
      await vi.advanceTimersByTimeAsync(2000 + 4000 + 8000);

      const result = await promise;
      expect(result.ok).toBe(false);
    });

    it("handles SPARQL HTTP error in findCellarUri", async () => {
      // SPARQL returns 500
      fetchMock.mockResolvedValueOnce(mockFetchError(500));

      const result = await connector.connect();
      // findCellarUri catches the error and returns null -> "non trovato"
      expect(result.ok).toBe(false);
    });
  });
});
