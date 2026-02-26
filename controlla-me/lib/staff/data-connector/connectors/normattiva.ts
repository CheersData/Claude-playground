/**
 * Normattiva Connector — Connettore per Normattiva Open Data API.
 *
 * Base URL: https://api.normattiva.it/t/normattiva.api/bff-opendata/v1/api/v1/
 *
 * Endpoint usati:
 * - GET  tipologiche/estensioni         → formati disponibili
 * - POST ricerca/semplice               → ricerca per keyword
 * - POST ricerca/avanzata               → ricerca strutturata
 * - POST ricerca/aggiornati             → atti modificati tra date (per delta)
 * - POST ricerca-asincrona/nuova-ricerca → bulk async (step 1)
 * - POST ricerca-asincrona/conferma      → bulk async (step 2)
 * - GET  ricerca-asincrona/download      → bulk async (step 3, ZIP)
 *
 * Licenza: CC BY 4.0, nessuna autenticazione.
 * ATTENZIONE: URN dirette bloccate da WAF. Usare sempre gli endpoint di ricerca.
 */

import { BaseConnector } from "./base";
import { parseAkn } from "../parsers/akn-parser";
import type {
  ConnectResult,
  FetchResult,
  ParsedArticle,
  DataSource,
} from "../types";

const API_BASE =
  "https://api.normattiva.it/t/normattiva.api/bff-opendata/v1/api/v1";

interface NormattivaSearchResult {
  urn?: string;
  titolo?: string;
  tipoAtto?: string;
  dataAtto?: string;
  numeroAtto?: string;
  estensioniDisponibili?: string[];
}

interface NormattivaSearchResponse {
  risultati?: NormattivaSearchResult[];
  totaleRisultati?: number;
  paginaCorrente?: number;
  totalePagine?: number;
}

export class NormattivaConnector extends BaseConnector<ParsedArticle> {
  constructor(source: DataSource, log: (msg: string) => void = console.log) {
    super(source, log);
  }

  async connect(): Promise<ConnectResult> {
    const sourceId = this.source.id;

    try {
      // 1. Test API: verifica formati disponibili
      this.log(`[NORMATTIVA] Test API formati...`);
      const formats = await this.fetchJSON<{ estensioni?: string[] }>(
        `${API_BASE}/tipologiche/estensioni`
      ).catch(() => ({ estensioni: [] }));

      const availableFormats = formats.estensioni ?? ["akn", "json", "html"];
      this.log(`[NORMATTIVA] Formati: ${availableFormats.join(", ")}`);

      // 2. Ricerca atto tramite search terms
      const searchTerms = (this.source.config.normattivaSearchTerms as string[]) ?? [];
      const urn = this.source.config.urn as string | undefined;

      let searchResponse: NormattivaSearchResponse = {};
      let estimatedItems = this.source.estimatedItems;

      if (searchTerms.length > 0) {
        this.log(`[NORMATTIVA] Ricerca: "${searchTerms[0]}"...`);
        searchResponse = await this.searchSemplice(searchTerms[0]);

        if (searchResponse.totaleRisultati) {
          this.log(
            `[NORMATTIVA] Trovati ${searchResponse.totaleRisultati} risultati`
          );
        }
      }

      // 3. Prova a scaricare un sample per verificare il parsing
      const sampleData: ParsedArticle[] = [];
      const sampleFields = [
        "articleNumber",
        "articleTitle",
        "articleText",
        "hierarchy",
      ];

      if (urn) {
        try {
          const sampleArticles = await this.fetchAknByUrn(urn, 3);
          sampleData.push(...sampleArticles);
          this.log(
            `[NORMATTIVA] Sample: ${sampleArticles.length} articoli parsati`
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.log(`[NORMATTIVA] Sample fallito (non bloccante): ${msg}`);
        }
      }

      return {
        sourceId,
        ok: true,
        message: `API attiva | ~${estimatedItems} articoli stimati | formati: ${availableFormats.join(", ")}`,
        census: {
          estimatedItems,
          availableFormats: availableFormats.map(String),
          sampleFields,
          sampleData: sampleData.length > 0 ? sampleData : undefined,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        sourceId,
        ok: false,
        message: `Errore connessione Normattiva: ${msg}`,
        census: {
          estimatedItems: 0,
          availableFormats: [],
          sampleFields: [],
        },
      };
    }
  }

  async fetchAll(
    options?: { limit?: number }
  ): Promise<FetchResult<ParsedArticle>> {
    const urn = this.source.config.urn as string | undefined;
    if (!urn) {
      throw new Error(
        `URN mancante per fonte "${this.source.id}". Impossibile fare fetch.`
      );
    }

    this.log(`[NORMATTIVA] Fetch completo per ${this.source.id} (URN: ${urn})`);
    const articles = await this.fetchAknByUrn(urn, options?.limit);
    this.log(`[NORMATTIVA] Parsati ${articles.length} articoli`);

    return {
      sourceId: this.source.id,
      items: articles,
      fetchedAt: new Date().toISOString(),
      metadata: { urn, format: "akn" },
    };
  }

  async fetchDelta(
    since: string,
    options?: { limit?: number }
  ): Promise<FetchResult<ParsedArticle>> {
    this.log(
      `[NORMATTIVA] Delta dal ${since} per ${this.source.id}`
    );

    try {
      // Usa endpoint ricerca/aggiornati
      const updates = await this.searchAggiornati(since);
      const urn = this.source.config.urn as string | undefined;

      // Filtra solo risultati per il nostro atto (matching URN)
      const matching = updates.filter((r) => {
        if (urn && r.urn) return r.urn.includes(urn);
        return false;
      });

      if (matching.length === 0) {
        this.log(`[NORMATTIVA] Nessun aggiornamento dal ${since}`);
        return {
          sourceId: this.source.id,
          items: [],
          fetchedAt: new Date().toISOString(),
          metadata: { since, updatesFound: 0 },
        };
      }

      this.log(`[NORMATTIVA] ${matching.length} aggiornamenti trovati, re-fetch...`);
      // Se ci sono aggiornamenti, re-fetch l'intero atto (gli atti sono atomici)
      return this.fetchAll(options);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`[NORMATTIVA] Delta fallito: ${msg}. Fallback a full fetch.`);
      return this.fetchAll(options);
    }
  }

  // ─── Metodi interni ───

  private async searchSemplice(
    keyword: string,
    page = 1
  ): Promise<NormattivaSearchResponse> {
    return this.fetchJSON<NormattivaSearchResponse>(
      `${API_BASE}/ricerca/semplice`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testoCercato: keyword,
          numeroPagina: page,
          dimensionePagina: 10,
        }),
      }
    );
  }

  private async searchAggiornati(
    since: string
  ): Promise<NormattivaSearchResult[]> {
    const today = new Date().toISOString().slice(0, 10);
    const response = await this.fetchJSON<NormattivaSearchResponse>(
      `${API_BASE}/ricerca/aggiornati`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataInizio: since.slice(0, 10),
          dataFine: today,
          numeroPagina: 1,
          dimensionePagina: 50,
        }),
      }
    );
    return response.risultati ?? [];
  }

  /**
   * Scarica un atto in formato AKN via ricerca asincrona (3 step)
   * oppure via ricerca semplice per atti piccoli.
   */
  private async fetchAknByUrn(
    urn: string,
    limit?: number
  ): Promise<ParsedArticle[]> {
    // Prova prima la ricerca semplice per ottenere l'atto
    const searchTerms = (this.source.config.normattivaSearchTerms as string[]) ?? [];
    const searchTerm = searchTerms[0] ?? this.source.name;

    this.log(`[NORMATTIVA] Ricerca atto: "${searchTerm}"...`);
    const searchResult = await this.searchSemplice(searchTerm);
    await this.rateLimitPause();

    const results = searchResult.risultati ?? [];
    if (results.length === 0) {
      throw new Error(
        `Nessun risultato per "${searchTerm}". Verificare normattivaSearchTerms.`
      );
    }

    // Trova il risultato che matcha la nostra URN
    let match = results.find((r) => r.urn && urn.includes(r.urn));
    if (!match) {
      // Fallback: usa il primo risultato
      match = results[0];
      this.log(
        `[NORMATTIVA] URN non matchata, uso primo risultato: "${match?.titolo}"`
      );
    }

    if (!match?.urn) {
      throw new Error(`Risultato senza URN per "${searchTerm}".`);
    }

    // Scarica in formato AKN tramite il download endpoint
    // L'API potrebbe richiedere il 3-step async per atti grandi
    const aknFormats = match.estensioniDisponibili?.filter(
      (f) => f.toLowerCase().includes("akn") || f.toLowerCase().includes("xml")
    );

    let xml: string;
    if (aknFormats && aknFormats.length > 0) {
      xml = await this.downloadAkn(match.urn);
    } else {
      // Fallback: prova JSON e converti
      this.log(
        `[NORMATTIVA] AKN non disponibile, provo download diretto...`
      );
      xml = await this.downloadAkn(match.urn);
    }

    // Parsa AKN → ParsedArticle[]
    const articles = parseAkn(xml, this.source.shortName);
    this.log(`[NORMATTIVA] Parsati ${articles.length} articoli da AKN`);

    if (limit && articles.length > limit) {
      return articles.slice(0, limit);
    }

    return articles;
  }

  /**
   * Download atto in formato AKN via API asincrona (3 step).
   */
  private async downloadAkn(urn: string): Promise<string> {
    // Step 1: Nuova ricerca
    this.log(`[NORMATTIVA] Async download step 1: nuova-ricerca...`);
    const step1 = await this.fetchJSON<{ idRicerca?: string }>(
      `${API_BASE}/ricerca-asincrona/nuova-ricerca`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urn,
          formato: "akn",
        }),
      }
    );

    const searchId = step1.idRicerca;
    if (!searchId) {
      // Fallback: prova download diretto via URL alternativo
      return this.downloadDirect(urn);
    }

    await this.rateLimitPause();

    // Step 2: Conferma
    this.log(`[NORMATTIVA] Async download step 2: conferma...`);
    await this.fetchJSON(
      `${API_BASE}/ricerca-asincrona/conferma`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idRicerca: searchId }),
      }
    );

    await this.rateLimitPause();

    // Step 3: Download (potrebbe restituire ZIP)
    this.log(`[NORMATTIVA] Async download step 3: download...`);
    const response = await this.fetchWithRetry(
      `${API_BASE}/ricerca-asincrona/download?idRicerca=${searchId}`
    );

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("xml") || contentType.includes("text")) {
      return response.text();
    }

    // Se ZIP, per ora prendiamo il testo raw
    const text = await response.text();
    if (text.includes("<akomaNtoso") || text.includes("<an:akomaNtoso")) {
      return text;
    }

    throw new Error(
      `Formato risposta inatteso: ${contentType}. Primi 200 char: ${text.slice(0, 200)}`
    );
  }

  /**
   * Tentativo di download diretto (fallback se async non funziona).
   */
  private async downloadDirect(urn: string): Promise<string> {
    this.log(`[NORMATTIVA] Fallback: download diretto AKN...`);

    // Prova endpoint diretto con formato AKN
    const url = `${API_BASE}/atti/${encodeURIComponent(urn)}?formato=akn`;
    const response = await this.fetchWithRetry(url);
    const text = await response.text();

    if (text.includes("<akomaNtoso") || text.includes("<an:akomaNtoso")) {
      return text;
    }

    // Se fallisce, prova con formato JSON e costruisci un AKN fittizio
    throw new Error(
      `Download diretto fallito per URN "${urn}". Risposta: ${text.slice(0, 200)}`
    );
  }
}
