import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock authenticated-base to break circular dependency (base.ts re-exports authenticated-base.ts)
vi.mock("@/lib/staff/data-connector/connectors/authenticated-base", () => ({
  AuthenticatedBaseConnector: class {},
}));

import { NormattivaConnector } from "@/lib/staff/data-connector/connectors/normattiva";
import type { DataSource } from "@/lib/staff/data-connector/types";

// ─── Mock adm-zip ───
vi.mock("adm-zip", () => {
  return {
    default: class MockAdmZip {
      getEntries() {
        return [];
      }
    },
  };
});

// ─── Mock akn-parser ───
vi.mock("@/lib/staff/data-connector/parsers/akn-parser", () => ({
  parseAkn: vi.fn().mockReturnValue([
    {
      articleNumber: "1",
      articleTitle: "Test Article",
      articleText: "Test text of article 1.",
      hierarchy: { titolo: "Titolo I" },
    },
    {
      articleNumber: "2",
      articleTitle: "Second Article",
      articleText: "Test text of article 2.",
      hierarchy: { titolo: "Titolo I" },
    },
  ]),
}));

// ─── Helpers ───

const API_BASE =
  "https://api.normattiva.it/t/normattiva.api/bff-opendata/v1/api/v1";

function makeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: "codice_civile",
    name: "Codice Civile",
    shortName: "CC",
    dataType: "legal-articles",
    vertical: "legal",
    connector: "normattiva",
    config: {
      urn: "urn:nir:stato:regio.decreto:1942-03-16;262",
      normattivaSearchTerms: ["codice civile"],
    },
    lifecycle: "planned",
    estimatedItems: 2969,
    ...overrides,
  };
}

function mockFetchOk(body: unknown, status = 200): Response {
  const text =
    typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(typeof body === "string" ? JSON.parse(body) : body),
    headers: new Headers(),
    arrayBuffer: () =>
      Promise.resolve(new TextEncoder().encode(text).buffer),
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

describe("NormattivaConnector", () => {
  let connector: NormattivaConnector;
  let logSpy: ReturnType<typeof vi.fn<(msg: string) => void>>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.fn();
    connector = new NormattivaConnector(makeSource(), logSpy);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── connect() ───

  describe("connect", () => {
    it("tests API with tipologiche/estensioni endpoint", async () => {
      // 1. tipologiche/estensioni -> formats
      fetchMock.mockResolvedValueOnce(
        mockFetchOk([
          { label: "AKN", value: "akn" },
          { label: "PDF", value: "pdf" },
        ])
      );

      // 2. ricerca/semplice -> found act
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({
          listaAtti: [
            {
              codiceRedazionale: "042G0262",
              denominazioneAtto: "PRD",
              annoProvvedimento: "1942",
              numeroProvvedimento: "262",
              titoloAtto: "Codice Civile",
              dataUltimaModifica: null,
            },
          ],
          numeroAttiTrovati: 1,
        })
      );

      // 3. Collection download -> ZIP (will be mocked with empty entries)
      fetchMock.mockResolvedValueOnce(
        mockFetchOk("fake-zip-content")
      );

      const result = await connector.connect();

      expect(result.sourceId).toBe("codice_civile");
      // API was reached (tipologiche endpoint)
      expect(fetchMock.mock.calls[0][0]).toContain(
        "tipologiche/estensioni"
      );
    });

    it("constructs correct URL for ricerca/semplice", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk([])); // formats
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({ listaAtti: [], numeroAttiTrovati: 0 })
      ); // search

      const promise = connector.connect();
      // Advance past rateLimitPause after the search term loop iteration
      await vi.advanceTimersByTimeAsync(1000);

      await promise;

      // Second call should be POST to ricerca/semplice
      const searchCall = fetchMock.mock.calls[1];
      expect(searchCall[0]).toBe(`${API_BASE}/ricerca/semplice`);
      expect(searchCall[1].method).toBe("POST");

      const body = JSON.parse(searchCall[1].body);
      expect(body.testoRicerca).toBe("codice civile");
      expect(body.paginazione).toEqual({
        paginaCorrente: 1,
        numeroElementiPerPagina: 10,
      });
    });

    it("returns ok=false when API connection fails", async () => {
      fetchMock.mockRejectedValue(new Error("Network error"));

      const promise = connector.connect();
      // Advance through retries (3 retries: 2s + 4s + 8s)
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      await vi.advanceTimersByTimeAsync(8000);

      const result = await promise;
      expect(result.ok).toBe(false);
      expect(result.message).toContain("Errore connessione Normattiva");
    });

    it("tries all search terms when first does not match", async () => {
      const source = makeSource({
        id: "codice_consumo",
        config: {
          urn: "urn:nir:stato:decreto.legislativo:2005-09-06;206",
          normattivaSearchTerms: [
            "codice consumo",
            "decreto legislativo 206 2005",
          ],
        },
      });
      connector = new NormattivaConnector(source, logSpy);

      // formats
      fetchMock.mockResolvedValueOnce(
        mockFetchOk([{ label: "AKN", value: "akn" }])
      );

      // 1st search -> no match (wrong anno)
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({
          listaAtti: [
            {
              codiceRedazionale: "WRONG",
              denominazioneAtto: "PLE",
              annoProvvedimento: "1999",
              numeroProvvedimento: "100",
              titoloAtto: "Wrong Act",
            },
          ],
        })
      );

      // 2nd search -> match (after rateLimitPause)
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({
          listaAtti: [
            {
              codiceRedazionale: "005G0232",
              denominazioneAtto: "PLL",
              annoProvvedimento: "2005",
              numeroProvvedimento: "206",
              titoloAtto: "Codice del consumo",
            },
          ],
        })
      );

      // Collection download attempt (codice_consumo is in SOURCE_COLLECTION_MAP as "Codici")
      fetchMock.mockResolvedValueOnce(
        mockFetchOk("fake-zip")
      );

      const promise = connector.connect();
      // Advance past rate limit pause between search terms
      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result.ok).toBe(true);
      // Both search terms were tried: formats + 2 searches + collection download
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("returns estimated items and available formats in census", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk([
          { label: "AKN", value: "akn" },
          { label: "HTML", value: "html" },
        ])
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({ listaAtti: [], numeroAttiTrovati: 0 })
      );

      const promise = connector.connect();
      // Advance past rateLimitPause after search loop iteration
      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result.census.availableFormats).toEqual(["AKN", "HTML"]);
    });
  });

  // ─── fetchAll() ───

  describe("fetchAll", () => {
    it("finds codiceRedazionale then downloads from collection for mapped sources", async () => {
      // ricerca/semplice -> found act
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({
          listaAtti: [
            {
              codiceRedazionale: "042G0262",
              denominazioneAtto: "PRD",
              annoProvvedimento: "1942",
              numeroProvvedimento: "262",
              titoloAtto: "CC",
            },
          ],
        })
      );

      // Collection download -> ZIP
      fetchMock.mockResolvedValueOnce(
        mockFetchOk("fake-zip")
      );

      // AdmZip is mocked to return empty entries, so extractAknFromZip will throw
      // "Nessun file XML trovato nel ZIP"
      await expect(connector.fetchAll()).rejects.toThrow(
        "Nessun file XML trovato nel ZIP"
      );

      // Verify collection URL was called with correct params
      const collectionCall = fetchMock.mock.calls[1];
      expect(collectionCall[0]).toContain(
        "collection-preconfezionata"
      );
      expect(collectionCall[0]).toContain("nome=Codici");
      expect(collectionCall[0]).toContain("formato=AKN");
      expect(collectionCall[0]).toContain("formatoRichiesta=V");
    });

    it("uses directAkn strategy when configured", async () => {
      const source = makeSource({
        id: "statuto_lavoratori",
        config: {
          urn: "urn:nir:stato:legge:1970-05-20;300",
          normattivaSearchTerms: ["statuto lavoratori"],
          directAkn: true,
          codiceRedazionale: "070U0300",
          normattivaDataGU: "19700527",
        },
      });
      connector = new NormattivaConnector(source, logSpy);

      // ricerca/semplice -> found act
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({
          listaAtti: [
            {
              codiceRedazionale: "070U0300",
              denominazioneAtto: "PLE",
              annoProvvedimento: "1970",
              numeroProvvedimento: "300",
              titoloAtto: "Statuto dei lavoratori",
            },
          ],
        })
      );

      // Step 1: fetch page for session cookie
      const pageResp = mockFetchOk("<html></html>");
      (pageResp.headers as Headers).set(
        "set-cookie",
        "JSESSIONID=abc123; Path=/"
      );
      fetchMock.mockResolvedValueOnce(pageResp);

      // Step 2: caricaAKN fetch -> returns XML
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          '<?xml version="1.0"?><akomaNtoso>' +
            "<body>".padEnd(600, "x") +
            "</body></akomaNtoso>"
        )
      );

      const result = await connector.fetchAll();
      // parseAkn is mocked to return 2 articles
      expect(result.items).toHaveLength(2);
      expect(result.sourceId).toBe("statuto_lavoratori");

      // Verify the web caricaAKN URL
      const aknCall = fetchMock.mock.calls[2];
      expect(aknCall[0]).toContain("www.normattiva.it/do/atto/caricaAKN");
      expect(aknCall[0]).toContain("dataGU=19700527");
      expect(aknCall[0]).toContain("codiceRedaz=070U0300");
    });

    it("applies limit to results", async () => {
      const { parseAkn } = await import(
        "@/lib/staff/data-connector/parsers/akn-parser"
      );
      vi.mocked(parseAkn).mockReturnValueOnce([
        {
          articleNumber: "1",
          articleTitle: "A1",
          articleText: "T1",
          hierarchy: {},
        },
        {
          articleNumber: "2",
          articleTitle: "A2",
          articleText: "T2",
          hierarchy: {},
        },
        {
          articleNumber: "3",
          articleTitle: "A3",
          articleText: "T3",
          hierarchy: {},
        },
      ]);

      // Use directAkn without dataGU (Open Data API path)
      const source = makeSource({
        id: "test_direct",
        config: {
          urn: "urn:nir:stato:decreto.legislativo:2008-04-09;81",
          normattivaSearchTerms: ["sicurezza lavoro"],
          directAkn: true,
        },
      });
      connector = new NormattivaConnector(source, logSpy);

      // ricerca/semplice
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({
          listaAtti: [
            {
              codiceRedazionale: "008G0104",
              denominazioneAtto: "PLL",
              annoProvvedimento: "2008",
              numeroProvvedimento: "81",
              titoloAtto: "Sicurezza lavoro",
            },
          ],
        })
      );

      // caricaAKN API
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          '<?xml version="1.0"?><akomaNtoso>' +
            "<body>".padEnd(600, "x") +
            "</body></akomaNtoso>"
        )
      );

      const result = await connector.fetchAll({ limit: 2 });
      expect(result.items).toHaveLength(2);
    });

    it("throws when no matching act found in search", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({ listaAtti: [], numeroAttiTrovati: 0 })
      );

      const promise = connector.fetchAll().catch((e: Error) => e);
      // Advance past rateLimitPause after failed search
      await vi.advanceTimersByTimeAsync(1000);

      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(
        'Atto non trovato per "codice_civile"'
      );
    });
  });

  // ─── fetchDelta() ───

  describe("fetchDelta", () => {
    it("returns empty items when no updates found", async () => {
      // ricerca/aggiornati -> empty
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({ listaAtti: [] })
      );

      const result = await connector.fetchDelta("2024-01-01");
      expect(result.items).toEqual([]);
      expect(result.metadata).toHaveProperty("updatesFound", 0);
    });

    it("constructs correct request body for aggiornati endpoint", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({ listaAtti: [] })
      );

      await connector.fetchDelta("2024-06-15T00:00:00Z");

      const call = fetchMock.mock.calls[0];
      expect(call[0]).toBe(`${API_BASE}/ricerca/aggiornati`);
      expect(call[1].method).toBe("POST");

      const body = JSON.parse(call[1].body);
      expect(body.dataInizioAggiornamento).toBe("2024-06-15T00:00:00Z");
      expect(body.dataFineAggiornamento).toBeDefined();
    });

    it("returns empty items when updates exist but not for our act", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({
          listaAtti: [
            {
              codiceRedazionale: "OTHER",
              annoProvvedimento: "2020",
              numeroProvvedimento: "999",
              titoloAtto: "Other Act",
            },
          ],
        })
      );

      const result = await connector.fetchDelta("2024-01-01");
      expect(result.items).toEqual([]);
    });

    it("returns empty items with error metadata when delta fails", async () => {
      fetchMock.mockRejectedValue(new Error("Connection timeout"));

      const promise = connector.fetchDelta("2024-01-01");
      // Advance through retries
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);
      await vi.advanceTimersByTimeAsync(8000);

      const result = await promise;
      expect(result.items).toEqual([]);
      expect(result.metadata).toHaveProperty("error");
    });
  });

  // ─── URL construction ───

  describe("URL construction", () => {
    it("uses correct API base URL", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk([]));
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({ listaAtti: [] })
      );

      const promise = connector.connect();
      // Advance past rateLimitPause after search loop
      await vi.advanceTimersByTimeAsync(1000);

      await promise;

      for (const call of fetchMock.mock.calls) {
        expect(call[0]).toMatch(
          /^https:\/\/api\.normattiva\.it\/t\/normattiva\.api\/bff-opendata\/v1\/api\/v1\//
        );
      }
    });

    it("constructs collection download URL with correct query params", async () => {
      // To test collection URL construction, trigger fetchAll on a collection-mapped source
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({
          listaAtti: [
            {
              codiceRedazionale: "042G0262",
              denominazioneAtto: "PRD",
              annoProvvedimento: "1942",
              numeroProvvedimento: "262",
              titoloAtto: "CC",
            },
          ],
        })
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchOk("fake-zip")
      );

      try {
        await connector.fetchAll();
      } catch {
        // Expected: no XML in mocked ZIP
      }

      const collectionCall = fetchMock.mock.calls[1];
      const url = new URL(collectionCall[0]);
      expect(url.pathname).toContain("collection-preconfezionata");
      expect(url.searchParams.get("nome")).toBe("Codici");
      expect(url.searchParams.get("formato")).toBe("AKN");
      expect(url.searchParams.get("formatoRichiesta")).toBe("V");
    });
  });

  // ─── URN parsing ───

  describe("URN parsing (via findMatchingAtto)", () => {
    it("matches act by anno + numero + tipo from URN", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk([{ label: "AKN", value: "akn" }])
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({
          listaAtti: [
            {
              codiceRedazionale: "WRONG",
              denominazioneAtto: "PLE",
              annoProvvedimento: "1942",
              numeroProvvedimento: "262",
              titoloAtto: "Wrong type",
            },
            {
              codiceRedazionale: "042G0262",
              denominazioneAtto: "PRD",
              annoProvvedimento: "1942",
              numeroProvvedimento: "262",
              titoloAtto: "Codice Civile",
            },
          ],
        })
      );
      // Collection download
      fetchMock.mockResolvedValueOnce(mockFetchOk("fake-zip"));

      const result = await connector.connect();
      // Should have found the correct act (PRD, not PLE)
      expect(result.message).toContain("042G0262");
    });

    it("handles source without URN by falling back to first result", async () => {
      const source = makeSource({
        config: {
          normattivaSearchTerms: ["test"],
          // no URN
        },
      });
      connector = new NormattivaConnector(source, logSpy);

      fetchMock.mockResolvedValueOnce(
        mockFetchOk([{ label: "AKN", value: "akn" }])
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({
          listaAtti: [
            {
              codiceRedazionale: "FIRST",
              denominazioneAtto: "PLL",
              annoProvvedimento: "2020",
              numeroProvvedimento: "100",
              titoloAtto: "First result",
            },
          ],
        })
      );
      fetchMock.mockResolvedValueOnce(mockFetchOk("zip"));

      const result = await connector.connect();
      expect(result.message).toContain("FIRST");
    });
  });

  // ─── Error handling ───

  describe("error handling", () => {
    it("handles HTTP error from collection download", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk([{ label: "AKN", value: "akn" }])
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({
          listaAtti: [
            {
              codiceRedazionale: "042G0262",
              denominazioneAtto: "PRD",
              annoProvvedimento: "1942",
              numeroProvvedimento: "262",
              titoloAtto: "CC",
            },
          ],
        })
      );
      // Collection download fails with 500
      fetchMock.mockResolvedValueOnce(mockFetchError(500, "Server Error"));

      // connect() catches sample download errors as non-blocking
      const result = await connector.connect();
      expect(result.ok).toBe(true); // sample failure is non-blocking
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("Sample Codici fallito")
      );
    });

    it("handles non-XML response from caricaAKN", async () => {
      const source = makeSource({
        id: "test_direct_noxml",
        config: {
          urn: "urn:nir:stato:legge:1970-05-20;300",
          normattivaSearchTerms: ["test"],
          directAkn: true,
          codiceRedazionale: "070U0300",
        },
      });
      connector = new NormattivaConnector(source, logSpy);

      // ricerca/semplice
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({
          listaAtti: [
            {
              codiceRedazionale: "070U0300",
              denominazioneAtto: "PLE",
              annoProvvedimento: "1970",
              numeroProvvedimento: "300",
              titoloAtto: "Test",
            },
          ],
        })
      );

      // caricaAKN returns non-XML (too short)
      fetchMock.mockResolvedValueOnce(mockFetchOk("short"));

      await expect(connector.fetchAll()).rejects.toThrow(
        "risposta non XML"
      );
    });
  });
});
