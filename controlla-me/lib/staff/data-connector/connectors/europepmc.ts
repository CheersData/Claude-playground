/**
 * EuropePMC Connector — Europe PubMed Central REST API
 *
 * Repository di paper biomedici open access europei.
 * 8M+ full-text articles. Focus su evidenze cliniche e review sistematiche.
 *
 * API: Europe PMC RESTful Web Service
 *   - search: ricerca per query + filtri (open access, review, ecc.)
 *   - fullTextXML: full text per PMC articles
 *
 * Rate limit: Nessun limite esplicito documentato, ma best practice 10 req/sec.
 * Docs: https://europepmc.org/RestfulWebService
 */

import { BaseConnector } from "./base";
import type {
  ConnectResult,
  FetchResult,
  ParsedArticle,
} from "../types";

const EUROPEPMC_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest";

interface EPMCSearchResponse {
  hitCount: number;
  nextCursorMark?: string;
  resultList: {
    result: EPMCArticle[];
  };
}

interface EPMCArticle {
  id: string;
  source: string; // "MED", "PMC", etc.
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title: string;
  authorString?: string;
  journalTitle?: string;
  pubYear?: string;
  abstractText?: string;
  isOpenAccess?: string; // "Y" or "N"
  citedByCount?: number;
  firstPublicationDate?: string;
}

export class EuropePMCConnector extends BaseConnector<ParsedArticle> {
  async connect(): Promise<ConnectResult> {
    const sourceId = this.source.id;
    this.log(`[EUROPEPMC] Testando connessione a Europe PMC...`);

    try {
      // Search for medical review articles (high quality, open access)
      const query = encodeURIComponent(
        '(OPEN_ACCESS:y) AND (SRC:PMC) AND (PUB_TYPE:"review")'
      );
      const searchUrl = `${EUROPEPMC_BASE}/search?query=${query}&pageSize=3&format=json&sort=CITED%20desc`;
      const data = await this.fetchJSON<EPMCSearchResponse>(searchUrl);

      const count = data.hitCount;
      const sampleData = data.resultList.result.slice(0, 3).map((r) => ({
        id: r.id,
        title: r.title,
        journal: r.journalTitle,
        year: r.pubYear,
        citations: r.citedByCount,
      }));

      this.log(`[EUROPEPMC] Trovati ${count} articoli open access review.`);

      return {
        sourceId,
        ok: true,
        message: `Europe PMC raggiungibile. ${count} review open access trovati.`,
        census: {
          estimatedItems: Math.min(count, 50000), // Cap at 50K most cited
          availableFormats: ["json", "xml"],
          sampleFields: [
            "id",
            "title",
            "abstractText",
            "authorString",
            "journalTitle",
            "pubYear",
            "citedByCount",
          ],
          sampleData,
        },
      };
    } catch (err) {
      return {
        sourceId,
        ok: false,
        message: `Errore connessione Europe PMC: ${err instanceof Error ? err.message : String(err)}`,
        census: {
          estimatedItems: 0,
          availableFormats: [],
          sampleFields: [],
        },
      };
    }
  }

  async fetchAll(options?: { limit?: number }): Promise<FetchResult<ParsedArticle>> {
    const limit = options?.limit ?? 100;
    const sourceId = this.source.id;
    const config = this.source.config as {
      query?: string;
      minCitations?: number;
      sortBy?: string;
    };

    // Default: open access reviews sorted by citations
    const baseQuery =
      config.query ??
      '(OPEN_ACCESS:y) AND (SRC:PMC) AND (PUB_TYPE:"review")';
    const sortBy = config.sortBy ?? "CITED desc";

    this.log(`[EUROPEPMC] Fetching fino a ${limit} articoli...`);

    const items: ParsedArticle[] = [];
    let cursorMark = "*";
    const pageSize = Math.min(limit, 25); // EuropePMC max 25 per page

    while (items.length < limit) {
      const query = encodeURIComponent(baseQuery);
      const url = `${EUROPEPMC_BASE}/search?query=${query}&pageSize=${pageSize}&cursorMark=${cursorMark}&format=json&sort=${encodeURIComponent(sortBy)}`;

      const data = await this.fetchJSON<EPMCSearchResponse>(url);
      const results = data.resultList.result;

      if (results.length === 0) break;

      for (const article of results) {
        if (items.length >= limit) break;

        // Skip articles without abstract
        if (!article.abstractText && !article.title) continue;

        const text = [
          article.abstractText || "",
          // Full text would require separate fetch — MVP uses abstract
        ]
          .filter(Boolean)
          .join("\n\n");

        if (text.length < 50) continue; // Skip very short entries

        items.push({
          articleNumber: article.pmcid || article.pmid || article.id,
          articleTitle: this.cleanText(article.title || ""),
          articleText: this.cleanText(text),
          hierarchy: {
            journal: article.journalTitle || "Unknown",
            year: article.pubYear || "Unknown",
          },
          sourceUrl: article.pmcid
            ? `https://europepmc.org/article/PMC/${article.pmcid}`
            : article.pmid
            ? `https://europepmc.org/article/MED/${article.pmid}`
            : undefined,
          isInForce: true,
          rawMeta: {
            doi: article.doi,
            authors: article.authorString,
            citations: article.citedByCount,
            openAccess: article.isOpenAccess === "Y",
            firstPublished: article.firstPublicationDate,
          },
        });
      }

      // Move to next page
      if (!data.nextCursorMark || data.nextCursorMark === cursorMark) break;
      cursorMark = data.nextCursorMark;
      await this.rateLimitPause();
    }

    this.log(`[EUROPEPMC] Fetched ${items.length} articoli.`);

    return {
      sourceId,
      items,
      fetchedAt: new Date().toISOString(),
      metadata: {
        source: "Europe PMC",
        query: baseQuery,
        totalFetched: items.length,
      },
    };
  }

  async fetchDelta(
    since: string,
    options?: { limit?: number }
  ): Promise<FetchResult<ParsedArticle>> {
    const limit = options?.limit ?? 50;
    const sinceDate = since.split("T")[0]; // YYYY-MM-DD

    this.log(`[EUROPEPMC] Fetching delta dal ${sinceDate}, limit ${limit}...`);

    // EuropePMC supports date filtering via FIRST_PDATE
    const config = this.source.config as { query?: string };
    const baseQuery =
      config.query ??
      '(OPEN_ACCESS:y) AND (SRC:PMC) AND (PUB_TYPE:"review")';
    const deltaQuery = `${baseQuery} AND (FIRST_PDATE:[${sinceDate} TO *])`;

    // Temporarily override config for fetchAll
    const originalConfig = this.source.config;
    this.source.config = { ...originalConfig, query: deltaQuery };

    const result = await this.fetchAll({ limit });

    // Restore config
    this.source.config = originalConfig;

    return {
      ...result,
      metadata: { ...result.metadata, deltaFrom: since },
    };
  }
}
