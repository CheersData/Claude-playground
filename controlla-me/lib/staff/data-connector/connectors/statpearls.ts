/**
 * StatPearls Connector — NCBI Bookshelf (Entrez E-utilities API)
 *
 * StatPearls è un'enciclopedia medica open access peer-reviewed su NCBI.
 * 9000+ articoli su patologie, procedure, farmaci. Aggiornata continuamente.
 *
 * API: NCBI E-utilities (Entrez)
 *   - esearch: cerca articoli per keyword
 *   - esummary: metadati articolo
 *   - efetch: contenuto full-text (XML)
 *
 * Rate limit: 3 req/sec senza API key, 10 req/sec con API key.
 * Docs: https://www.ncbi.nlm.nih.gov/books/NBK25500/
 */

import { BaseConnector } from "./base";
import type {
  ConnectResult,
  FetchResult,
  ParsedArticle,
} from "../types";

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const BOOKSHELF_BOOK_ID = "NBK430685"; // StatPearls book ID

interface ESearchResult {
  esearchresult: {
    count: string;
    idlist: string[];
    retmax: string;
  };
}

interface ESummaryResult {
  result: Record<
    string,
    {
      uid: string;
      title: string;
      authors?: Array<{ name: string }>;
      lastauthor?: string;
      pubdate?: string;
      fulljournalname?: string;
    }
  >;
}

export class StatPearlsConnector extends BaseConnector<ParsedArticle> {
  async connect(): Promise<ConnectResult> {
    const sourceId = this.source.id;
    this.log(`[STATPEARLS] Testando connessione a NCBI Bookshelf...`);

    try {
      // Search for StatPearls articles
      const searchUrl = `${EUTILS_BASE}/esearch.fcgi?db=books&term=statpearls[book]&retmax=3&retmode=json`;
      const searchData = await this.fetchJSON<ESearchResult>(searchUrl);

      const count = parseInt(searchData.esearchresult.count, 10);
      const sampleIds = searchData.esearchresult.idlist;

      this.log(`[STATPEARLS] Trovati ${count} articoli. Sample IDs: ${sampleIds.join(", ")}`);

      // Get sample metadata
      let sampleData: unknown[] = [];
      if (sampleIds.length > 0) {
        await this.rateLimitPause();
        const summaryUrl = `${EUTILS_BASE}/esummary.fcgi?db=books&id=${sampleIds.join(",")}&retmode=json`;
        try {
          const summaryData = await this.fetchJSON<ESummaryResult>(summaryUrl);
          sampleData = sampleIds
            .map((id) => summaryData.result?.[id])
            .filter(Boolean)
            .slice(0, 3);
        } catch (err) {
          this.log(`[STATPEARLS] Warning: esummary fallito (non bloccante): ${err}`);
        }
      }

      return {
        sourceId,
        ok: true,
        message: `NCBI Bookshelf raggiungibile. ${count} articoli StatPearls trovati.`,
        census: {
          estimatedItems: count,
          availableFormats: ["json", "xml"],
          sampleFields: ["uid", "title", "authors", "pubdate"],
          sampleData,
        },
      };
    } catch (err) {
      return {
        sourceId,
        ok: false,
        message: `Errore connessione NCBI: ${err instanceof Error ? err.message : String(err)}`,
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
    this.log(`[STATPEARLS] Fetching fino a ${limit} articoli...`);

    const items: ParsedArticle[] = [];
    let retstart = 0;
    const batchSize = Math.min(limit, 20); // NCBI max retmax per books

    while (items.length < limit) {
      const currentBatch = Math.min(batchSize, limit - items.length);

      // Search for IDs
      const searchUrl = `${EUTILS_BASE}/esearch.fcgi?db=books&term=statpearls[book]&retmax=${currentBatch}&retstart=${retstart}&retmode=json`;
      const searchData = await this.fetchJSON<ESearchResult>(searchUrl);
      const ids = searchData.esearchresult.idlist;

      if (ids.length === 0) break;

      // Get summaries for this batch
      await this.rateLimitPause();
      const summaryUrl = `${EUTILS_BASE}/esummary.fcgi?db=books&id=${ids.join(",")}&retmode=json`;

      try {
        const summaryData = await this.fetchJSON<ESummaryResult>(summaryUrl);

        for (const id of ids) {
          const entry = summaryData.result?.[id];
          if (!entry || !entry.title) continue;

          const title = this.cleanText(entry.title);

          items.push({
            articleNumber: `SP-${entry.uid}`,
            articleTitle: title,
            articleText: title, // Full text requires efetch XML parsing — MVP uses title+summary
            hierarchy: {
              category: "StatPearls",
              specialty: this.inferSpecialty(title),
            },
            sourceUrl: `https://www.ncbi.nlm.nih.gov/books/${entry.uid}/`,
            isInForce: true,
            rawMeta: {
              uid: entry.uid,
              authors: entry.authors?.map((a) => a.name),
              pubdate: entry.pubdate,
            },
          });
        }
      } catch (err) {
        this.log(`[STATPEARLS] Warning: batch ${retstart} fallito: ${err}`);
      }

      retstart += currentBatch;
      await this.rateLimitPause();
    }

    this.log(`[STATPEARLS] Fetched ${items.length} articoli.`);

    return {
      sourceId,
      items,
      fetchedAt: new Date().toISOString(),
      metadata: {
        source: "NCBI Bookshelf",
        bookId: BOOKSHELF_BOOK_ID,
        totalFetched: items.length,
      },
    };
  }

  async fetchDelta(
    since: string,
    options?: { limit?: number }
  ): Promise<FetchResult<ParsedArticle>> {
    // NCBI doesn't have great delta support for books — use datetype filter
    const limit = options?.limit ?? 50;
    const sinceDate = since.split("T")[0].replace(/-/g, "/"); // YYYY/MM/DD

    this.log(`[STATPEARLS] Fetching delta dal ${sinceDate}, limit ${limit}...`);

    const searchUrl = `${EUTILS_BASE}/esearch.fcgi?db=books&term=statpearls[book]&datetype=mdat&mindate=${sinceDate}&retmax=${limit}&retmode=json`;
    const searchData = await this.fetchJSON<ESearchResult>(searchUrl);
    const ids = searchData.esearchresult.idlist;

    if (ids.length === 0) {
      return {
        sourceId: this.source.id,
        items: [],
        fetchedAt: new Date().toISOString(),
        metadata: { deltaFrom: since, found: 0 },
      };
    }

    // Reuse fetchAll logic with found IDs
    return this.fetchAll({ limit: ids.length });
  }

  /** Inferisce la specialità medica dal titolo dell'articolo */
  private inferSpecialty(title: string): string {
    const lower = title.toLowerCase();
    const specialtyMap: Record<string, string[]> = {
      cardiologia: ["cardiac", "heart", "myocardial", "coronary", "arrhythmia", "hypertension"],
      neurologia: ["neuro", "brain", "stroke", "epilepsy", "headache", "dementia"],
      pneumologia: ["pulmonary", "lung", "pneumonia", "asthma", "copd", "respiratory"],
      gastroenterologia: ["gastro", "liver", "hepat", "pancrea", "intestin", "colitis"],
      endocrinologia: ["diabetes", "thyroid", "adrenal", "pituitary", "insulin"],
      ematologia: ["anemia", "leukemia", "lymphoma", "platelet", "coagul", "thromb"],
      oncologia: ["cancer", "tumor", "carcinoma", "melanoma", "sarcoma", "neoplasm"],
      nefrologia: ["renal", "kidney", "nephro", "dialysis", "glomerul"],
      reumatologia: ["arthritis", "lupus", "vasculit", "rheumat", "autoimmun"],
      farmacologia: ["drug", "pharmacol", "dosage", "toxicol", "medication"],
      anatomia: ["anatomy", "histolog", "embryo"],
      chirurgia: ["surgery", "surgical", "operative"],
      dermatologia: ["skin", "dermat", "psoriasis", "eczema"],
      ortopedia: ["fracture", "orthoped", "bone", "joint", "spine"],
      pediatria: ["pediatr", "child", "neonat", "infant"],
      microbiologia: ["bacteri", "virus", "fung", "parasit", "infection", "antibiotic"],
    };

    for (const [specialty, keywords] of Object.entries(specialtyMap)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        return specialty;
      }
    }
    return "medicina_generale";
  }
}
