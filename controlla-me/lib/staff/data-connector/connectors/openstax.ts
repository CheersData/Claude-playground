/**
 * OpenStax Connector — OpenStax REST API (CNX/OERP)
 *
 * Manuali universitari open access (CC BY 4.0).
 * Struttura: Book → Chapter → Section → Page.
 *
 * API: OpenStax Archive API (RESTful)
 *   - /contents/{uuid} → book table of contents
 *   - /contents/{uuid}:{page_uuid} → individual page content
 *
 * Il contenuto è in formato CNXML (derivato XML) o HTML nel campo "content".
 *
 * Rate limit: Nessun limite documentato. Best practice: 5 req/sec.
 * Docs: https://openstax.org/api/v1/docs (legacy), Archive API non documentata ufficialmente.
 */

import { BaseConnector } from "./base";
import type {
  ConnectResult,
  FetchResult,
  ParsedArticle,
} from "../types";

const OPENSTAX_ARCHIVE = "https://openstax.org/apps/archive";
const OPENSTAX_API = "https://openstax.org/apps/cms/api/v2";

interface OpenStaxBookInfo {
  id: string;
  title: string;
  slug: string;
  book_state: string;
  content_url: string;
}

interface OpenStaxTOC {
  id: string;
  title: string;
  tree: {
    id: string;
    title: string;
    slug: string;
    contents?: OpenStaxTOCEntry[];
  };
}

interface OpenStaxTOCEntry {
  id: string;
  title: string;
  slug?: string;
  contents?: OpenStaxTOCEntry[];
}

interface OpenStaxPage {
  id: string;
  title: string;
  content: string; // HTML content
  abstract?: string;
}

export class OpenStaxConnector extends BaseConnector<ParsedArticle> {
  private getBookSlug(): string {
    const config = this.source.config as { bookSlug?: string };
    return config.bookSlug || this.inferSlugFromSource();
  }

  private inferSlugFromSource(): string {
    const name = this.source.name.toLowerCase();
    if (name.includes("anatomy")) return "anatomy-and-physiology-2e";
    if (name.includes("microbiology")) return "microbiology";
    if (name.includes("biology")) return "biology-2e";
    if (name.includes("chemistry")) return "chemistry-2e";
    return "anatomy-and-physiology-2e"; // default
  }

  async connect(): Promise<ConnectResult> {
    const sourceId = this.source.id;
    const bookSlug = this.getBookSlug();
    this.log(`[OPENSTAX] Testando connessione per libro: ${bookSlug}...`);

    try {
      // Get book info from CMS API
      const booksUrl = `${OPENSTAX_API}/pages/?type=books.Book&fields=id,title,slug,book_state,content_url&slug=${bookSlug}`;
      const booksData = await this.fetchJSON<{ items: OpenStaxBookInfo[] }>(booksUrl);

      if (!booksData.items || booksData.items.length === 0) {
        return {
          sourceId,
          ok: false,
          message: `Libro "${bookSlug}" non trovato su OpenStax.`,
          census: {
            estimatedItems: 0,
            availableFormats: [],
            sampleFields: [],
          },
        };
      }

      const book = booksData.items[0];
      this.log(`[OPENSTAX] Libro trovato: "${book.title}" (${book.book_state})`);

      // Get TOC to count chapters/sections
      let sectionCount = 0;
      const sampleData: unknown[] = [];

      if (book.content_url) {
        try {
          await this.rateLimitPause();
          const tocData = await this.fetchJSON<OpenStaxTOC>(book.content_url);
          sectionCount = this.countSections(tocData.tree);

          // Get sample entries from TOC
          const flatEntries = this.flattenTOC(tocData.tree);
          for (const entry of flatEntries.slice(0, 3)) {
            sampleData.push({
              id: entry.id,
              title: entry.title,
            });
          }
        } catch (err) {
          this.log(`[OPENSTAX] Warning: TOC fetch fallito: ${err}`);
          sectionCount = this.source.estimatedItems || 200;
        }
      }

      return {
        sourceId,
        ok: true,
        message: `OpenStax "${book.title}" raggiungibile. ~${sectionCount} sezioni trovate.`,
        census: {
          estimatedItems: sectionCount,
          availableFormats: ["html", "cnxml"],
          sampleFields: ["id", "title", "content", "abstract"],
          sampleData,
        },
      };
    } catch (err) {
      return {
        sourceId,
        ok: false,
        message: `Errore connessione OpenStax: ${err instanceof Error ? err.message : String(err)}`,
        census: {
          estimatedItems: 0,
          availableFormats: [],
          sampleFields: [],
        },
      };
    }
  }

  async fetchAll(options?: { limit?: number }): Promise<FetchResult<ParsedArticle>> {
    const limit = options?.limit ?? 500;
    const sourceId = this.source.id;
    const bookSlug = this.getBookSlug();

    this.log(`[OPENSTAX] Fetching libro "${bookSlug}", limit ${limit}...`);

    // Step 1: Get book metadata from CMS API
    const booksUrl = `${OPENSTAX_API}/pages/?type=books.Book&fields=id,title,slug,content_url&slug=${bookSlug}`;
    const booksData = await this.fetchJSON<{ items: OpenStaxBookInfo[] }>(booksUrl);

    if (!booksData.items || booksData.items.length === 0) {
      throw new Error(`Libro "${bookSlug}" non trovato su OpenStax`);
    }

    const book = booksData.items[0];

    // Step 2: Get TOC
    if (!book.content_url) {
      throw new Error(`content_url mancante per "${book.title}"`);
    }

    const tocData = await this.fetchJSON<OpenStaxTOC>(book.content_url);
    const entries = this.flattenTOC(tocData.tree);

    this.log(`[OPENSTAX] TOC: ${entries.length} sezioni trovate.`);

    // Step 3: Fetch each section's content
    const items: ParsedArticle[] = [];
    const archiveBase = book.content_url.replace(/\/[^/]+$/, ""); // Base URL for pages

    for (const entry of entries) {
      if (items.length >= limit) break;

      try {
        await this.sleep(200); // Light rate limit (5 req/sec)

        const pageUrl = `${archiveBase}/${entry.id}`;
        const page = await this.fetchJSON<OpenStaxPage>(pageUrl);

        const text = this.stripHTML(page.content || "");
        if (text.length < 50) continue; // Skip empty/trivial pages

        items.push({
          articleNumber: entry.chapterSection || entry.id,
          articleTitle: this.cleanText(page.title || entry.title),
          articleText: this.cleanText(text),
          hierarchy: {
            ...(entry.unit ? { unit: entry.unit } : {}),
            ...(entry.chapter ? { chapter: entry.chapter } : {}),
            ...(entry.section ? { section: entry.section } : {}),
          },
          sourceUrl: `https://openstax.org/books/${bookSlug}/pages/${entry.slug || entry.id}`,
          isInForce: true,
          rawMeta: {
            bookTitle: book.title,
            bookSlug,
            pageId: entry.id,
          },
        });

        if (items.length % 20 === 0) {
          this.log(`[OPENSTAX] Progresso: ${items.length}/${Math.min(entries.length, limit)} sezioni`);
        }
      } catch (err) {
        this.log(`[OPENSTAX] Warning: sezione ${entry.id} fallita: ${err}`);
      }
    }

    this.log(`[OPENSTAX] Fetched ${items.length} sezioni da "${book.title}".`);

    return {
      sourceId,
      items,
      fetchedAt: new Date().toISOString(),
      metadata: {
        source: "OpenStax",
        bookTitle: book.title,
        bookSlug,
        totalSections: entries.length,
        totalFetched: items.length,
      },
    };
  }

  async fetchDelta(
    _since: string,
    options?: { limit?: number }
  ): Promise<FetchResult<ParsedArticle>> {
    // OpenStax books are versioned (2e, 3e), not incrementally updated.
    // Delta = full refetch (books change very rarely).
    this.log(`[OPENSTAX] Delta non supportato per libri OpenStax. Eseguo full fetch.`);
    return this.fetchAll(options);
  }

  // ─── Helpers ───

  private countSections(node: { contents?: OpenStaxTOCEntry[] }): number {
    let count = 0;
    for (const child of node.contents || []) {
      if (child.contents && child.contents.length > 0) {
        count += this.countSections(child);
      } else {
        count++;
      }
    }
    return count;
  }

  private flattenTOC(
    node: { title: string; contents?: OpenStaxTOCEntry[] },
    path: { unit?: string; chapter?: string; section?: string } = {},
    chapterIdx = 0
  ): Array<{
    id: string;
    title: string;
    slug?: string;
    unit?: string;
    chapter?: string;
    section?: string;
    chapterSection?: string;
  }> {
    const results: Array<{
      id: string;
      title: string;
      slug?: string;
      unit?: string;
      chapter?: string;
      section?: string;
      chapterSection?: string;
    }> = [];

    for (let i = 0; i < (node.contents || []).length; i++) {
      const child = node.contents![i];

      if (child.contents && child.contents.length > 0) {
        // This is a chapter or unit — recurse
        const isUnit = child.title.toLowerCase().startsWith("unit");
        const newPath = isUnit
          ? { ...path, unit: child.title }
          : { ...path, chapter: child.title };

        results.push(
          ...this.flattenTOC(child, newPath, isUnit ? chapterIdx : i + 1)
        );
      } else {
        // This is a leaf section
        const sectionNum = `${chapterIdx || ""}.${i + 1}`.replace(/^\./, "");
        results.push({
          id: child.id,
          title: child.title,
          slug: child.slug,
          ...path,
          section: child.title,
          chapterSection: sectionNum,
        });
      }
    }

    return results;
  }

  /** Strip HTML tags and normalize whitespace */
  private stripHTML(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}
