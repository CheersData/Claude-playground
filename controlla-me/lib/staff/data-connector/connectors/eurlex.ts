/**
 * EUR-Lex Connector — Connettore per legislazione EU via Cellar API + SPARQL.
 *
 * API:
 * - SPARQL: https://publications.europa.eu/webapi/rdf/sparql
 * - Cellar: http://publications.europa.eu/resource/cellar/{id}
 *   (content negotiation: Accept + Accept-Language per formato e lingua)
 *
 * NOTA: eur-lex.europa.eu è dietro AWS WAF con challenge JavaScript.
 * Usiamo direttamente il Cellar API che è accessibile senza restrizioni.
 *
 * Free, nessuna autenticazione.
 */

import { BaseConnector } from "./base";
import { parseEurLexHtml } from "../parsers/html-parser";
import type {
  ConnectResult,
  FetchResult,
  ParsedArticle,
  DataSource,
} from "../types";

const SPARQL_ENDPOINT =
  "https://publications.europa.eu/webapi/rdf/sparql";

const CELLAR_BASE = "http://publications.europa.eu/resource/cellar/";

interface SparqlBindings {
  bindings?: Array<Record<string, { value?: string }>>;
}

export class EurLexConnector extends BaseConnector<ParsedArticle> {
  constructor(source: DataSource, log: (msg: string) => void = console.log) {
    super(source, log);
  }

  async connect(): Promise<ConnectResult> {
    const sourceId = this.source.id;
    const celexId = this.source.config.celexId as string | undefined;

    if (!celexId) {
      return {
        sourceId,
        ok: false,
        message: `CELEX ID mancante per fonte "${sourceId}"`,
        census: {
          estimatedItems: 0,
          availableFormats: [],
          sampleFields: [],
        },
      };
    }

    try {
      // 1. Trova Cellar URI e verifica esistenza via SPARQL SELECT
      this.log(`[EURLEX] Verifica CELEX ${celexId} via SPARQL...`);
      const cellarUri = await this.findCellarUri(celexId);

      if (!cellarUri) {
        return {
          sourceId,
          ok: false,
          message: `CELEX ${celexId} non trovato su EUR-Lex`,
          census: {
            estimatedItems: 0,
            availableFormats: [],
            sampleFields: [],
          },
        };
      }

      this.log(`[EURLEX] Cellar URI: ${cellarUri}`);

      // 2. Scarica HTML italiano dal Cellar e prova parsing sample
      this.log(`[EURLEX] Download HTML italiano dal Cellar...`);
      const html = await this.downloadFromCellar(cellarUri);
      const sampleArticles = parseEurLexHtml(html, this.source.shortName);

      this.log(
        `[EURLEX] Parsati ${sampleArticles.length} articoli (stimati: ${this.source.estimatedItems})`
      );

      return {
        sourceId,
        ok: true,
        message: `CELEX ${celexId} trovato | ${sampleArticles.length} articoli parsati | Cellar HTML IT`,
        census: {
          estimatedItems: sampleArticles.length || this.source.estimatedItems,
          availableFormats: ["xhtml", "html"],
          sampleFields: [
            "articleNumber",
            "articleTitle",
            "articleText",
            "hierarchy",
          ],
          sampleData: sampleArticles.slice(0, 3),
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        sourceId,
        ok: false,
        message: `Errore connessione EUR-Lex: ${msg}`,
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
    const celexId = this.source.config.celexId as string;
    if (!celexId) {
      throw new Error(
        `CELEX ID mancante per fonte "${this.source.id}".`
      );
    }

    this.log(`[EURLEX] Fetch completo: CELEX ${celexId}`);
    const cellarUri = await this.findCellarUri(celexId);
    if (!cellarUri) {
      throw new Error(`Cellar URI non trovata per CELEX ${celexId}`);
    }

    const html = await this.downloadFromCellar(cellarUri);
    let articles = parseEurLexHtml(html, this.source.shortName);

    this.log(`[EURLEX] Parsati ${articles.length} articoli`);

    if (options?.limit && articles.length > options.limit) {
      articles = articles.slice(0, options.limit);
    }

    return {
      sourceId: this.source.id,
      items: articles,
      fetchedAt: new Date().toISOString(),
      metadata: { celexId, cellarUri, format: "html" },
    };
  }

  async fetchDelta(
    since: string,
    options?: { limit?: number }
  ): Promise<FetchResult<ParsedArticle>> {
    this.log(`[EURLEX] Delta dal ${since} per ${this.source.id}`);

    // Legislazione EU cambia raramente. Verifica data ultima modifica via SPARQL.
    const celexId = this.source.config.celexId as string;
    const lastModified = await this.getLastModified(celexId);

    if (lastModified && lastModified < since) {
      this.log(
        `[EURLEX] Nessuna modifica (ultimo: ${lastModified}, richiesto: ${since})`
      );
      return {
        sourceId: this.source.id,
        items: [],
        fetchedAt: new Date().toISOString(),
        metadata: { since, lastModified, changed: false },
      };
    }

    // Se modificato (o non verificabile), re-fetch completo
    this.log(`[EURLEX] Possibile modifica, re-fetch completo...`);
    return this.fetchAll(options);
  }

  // ─── Metodi interni ───

  /**
   * Trova la Cellar URI per un CELEX ID via SPARQL SELECT.
   * NOTA: SPARQL ASK con stringa esatta può dare falsi negativi per
   * differenze di datatype. Usiamo SELECT con FILTER per robustezza.
   */
  private async findCellarUri(celexId: string): Promise<string | null> {
    const query = `
      PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
      SELECT ?work WHERE {
        ?work cdm:resource_legal_id_celex ?celex .
        FILTER(STR(?celex) = "${celexId}")
      }
      LIMIT 1
    `;

    try {
      const result = await this.executeSparql(query);
      const results = result.results as SparqlBindings | undefined;
      const bindings = results?.bindings ?? [];
      if (bindings.length > 0 && bindings[0].work?.value) {
        return bindings[0].work.value;
      }
    } catch (err) {
      this.log(`[EURLEX] SPARQL fallito: ${err instanceof Error ? err.message : String(err)}`);
    }

    return null;
  }

  /**
   * Ottieni data ultima modifica via SPARQL.
   */
  private async getLastModified(celexId: string): Promise<string | null> {
    const query = `
      PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
      SELECT ?date WHERE {
        ?work cdm:resource_legal_id_celex ?celex .
        FILTER(STR(?celex) = "${celexId}")
        ?work cdm:work_date_document ?date .
      }
      LIMIT 1
    `;

    try {
      const result = await this.executeSparql(query);
      const results = result.results as SparqlBindings | undefined;
      const bindings = results?.bindings ?? [];
      if (bindings.length > 0 && bindings[0].date?.value) {
        return bindings[0].date.value;
      }
    } catch {
      // Non critico
    }

    return null;
  }

  /**
   * Esegui query SPARQL.
   */
  private async executeSparql(
    query: string
  ): Promise<Record<string, unknown>> {
    const params = new URLSearchParams({
      query: query.trim(),
      format: "application/sparql-results+json",
    });

    const response = await this.fetchWithRetry(
      `${SPARQL_ENDPOINT}?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error(`SPARQL HTTP ${response.status}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  /**
   * Scarica HTML italiano dall'atto via Cellar API con content negotiation.
   *
   * Strategia:
   * 1. Prova application/xhtml+xml (documenti moderni, con eli-subdivision)
   * 2. Fallback text/html (documenti vecchi, HTML semplice)
   *
   * Il Cellar risponde con 303 redirect alla risorsa concreta.
   */
  private async downloadFromCellar(cellarUri: string): Promise<string> {
    // Prova XHTML prima (formato moderno con struttura semantica)
    for (const accept of ["application/xhtml+xml", "text/html"]) {
      this.log(`[EURLEX] Cellar download (${accept})...`);

      const response = await this.fetchWithRetry(cellarUri, {
        headers: {
          Accept: accept,
          "Accept-Language": "it",
        },
        redirect: "follow",
      });

      if (response.ok) {
        const html = await response.text();
        if (html.length > 500) {
          this.log(`[EURLEX] OK | ${accept} | ${html.length} bytes`);
          return html;
        }
      }

      this.log(`[EURLEX] ${accept} → HTTP ${response.status}`);
    }

    throw new Error(`Nessun formato HTML disponibile dal Cellar per ${cellarUri}`);
  }
}
