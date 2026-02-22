/**
 * eurlex-client.ts — Client per scaricare normative UE da EUR-Lex CELLAR.
 *
 * Accesso aperto (no registrazione).
 *
 * Strategia:
 * 1. Fetch HTML italiano del regolamento/direttiva via CELEX number
 * 2. Parse degli articoli dall'HTML
 *
 * URL pattern:
 *   https://eur-lex.europa.eu/legal-content/IT/TXT/HTML/?uri=CELEX:{celex}
 *
 * L'HTML di EUR-Lex è molto strutturato con <div class="eli-subdivision">
 * per ogni articolo.
 */

import type { LawSourceConfig, HierarchyRange, InstituteMapping } from "./corpus-sources";

export interface ParsedEUArticle {
  lawSource: string;
  articleNumber: number;
  articleReference: string;
  articleTitle: string | null;
  articleText: string;
  hierarchy: Record<string, string>;
  keywords: string[];
  relatedInstitutes: string[];
  sourceUrl: string;
  isInForce: boolean;
}

// ─── Config ───

const EURLEX_HTML_BASE = "https://eur-lex.europa.eu/legal-content/IT/TXT/HTML/?uri=CELEX:";

// ─── Download e parsing ───

/**
 * Scarica tutti gli articoli di un atto UE da EUR-Lex.
 */
export async function downloadFromEurLex(
  config: LawSourceConfig
): Promise<ParsedEUArticle[]> {
  if (!config.celexNumber) {
    console.error(`[EUR-LEX] Nessun CELEX number per ${config.id}`);
    return [];
  }

  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  Download: ${config.name.slice(0, 42).padEnd(42)}║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
  console.log(`  CELEX: ${config.celexNumber}`);
  console.log(`  Articoli stimati: ~${config.estimatedArticles}`);

  const url = `${EURLEX_HTML_BASE}${config.celexNumber}`;

  let html: string;
  try {
    html = await fetchWithRetry(url);
  } catch (err) {
    console.error(`[EUR-LEX] Errore download ${config.id}: ${(err as Error).message}`);
    return [];
  }

  if (!html || html.length < 500) {
    console.error(`[EUR-LEX] HTML vuoto o troppo corto per ${config.id}`);
    return [];
  }

  console.log(`  [EUR-LEX] HTML scaricato: ${(html.length / 1024).toFixed(0)} KB`);

  // Parse articoli dall'HTML
  const articles = parseEurLexHtml(html, config);

  console.log(`\n  [EUR-LEX] Parsing completato: ${articles.length} articoli per ${config.id}\n`);
  return articles;
}

// ─── Parsing HTML EUR-Lex ───

function parseEurLexHtml(
  html: string,
  config: LawSourceConfig
): ParsedEUArticle[] {
  const articles: ParsedEUArticle[] = [];

  // EUR-Lex HTML ha struttura molto regolare.
  // Ogni articolo inizia con pattern "Articolo N" o "Article N"

  // Strategy 1: Split by "Articolo" headers
  const articlePattern = /(?:<[^>]*>)*\s*Articolo\s+(\d+)\s*(?:<[^>]*>)*/gi;
  const splits: Array<{ num: number; startIndex: number }> = [];

  let match;
  while ((match = articlePattern.exec(html)) !== null) {
    splits.push({ num: parseInt(match[1], 10), startIndex: match.index });
  }

  if (splits.length === 0) {
    // Fallback: try "Article" (English version)
    const enPattern = /(?:<[^>]*>)*\s*Article\s+(\d+)\s*(?:<[^>]*>)*/gi;
    while ((match = enPattern.exec(html)) !== null) {
      splits.push({ num: parseInt(match[1], 10), startIndex: match.index });
    }
  }

  console.log(`  [EUR-LEX] Trovati ${splits.length} marcatori articolo`);

  for (let i = 0; i < splits.length; i++) {
    const start = splits[i].startIndex;
    const end = i + 1 < splits.length ? splits[i + 1].startIndex : html.length;
    const artNum = splits[i].num;

    const chunk = html.slice(start, end);

    // Extract title (first line after "Articolo N")
    let articleTitle: string | null = null;
    const titleMatch = chunk.match(
      /Articolo\s+\d+\s*(?:<[^>]*>)*\s*(?:<[^>]*>)*\s*([^<]+)/i
    );
    if (titleMatch && titleMatch[1].trim().length > 2 && titleMatch[1].trim().length < 200) {
      articleTitle = titleMatch[1].trim();
    }

    // Extract text
    let articleText = cleanHtml(chunk);

    // Remove the "Articolo N" header from the text body
    articleText = articleText
      .replace(/^Articolo\s+\d+\s*/i, "")
      .replace(/^Article\s+\d+\s*/i, "")
      .trim();

    // Remove the title from the text body if present
    if (articleTitle && articleText.startsWith(articleTitle)) {
      articleText = articleText.slice(articleTitle.length).trim();
    }

    if (articleText.length < 10) continue;

    const articleReference = `Art. ${artNum}`;
    const hierarchy = getHierarchyForArticle(artNum, config.hierarchy);
    const { institutes, keywords } = getInstitutesForArticle(artNum, config.institutes);

    // Extract keywords from title
    if (articleTitle) {
      const titleWords = articleTitle
        .toLowerCase()
        .replace(/[^\w\sàèéìòùç]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3);
      for (const w of titleWords) {
        if (!keywords.includes(w)) keywords.push(w);
      }
    }

    articles.push({
      lawSource: config.id,
      articleNumber: artNum,
      articleReference,
      articleTitle,
      articleText,
      hierarchy,
      keywords,
      relatedInstitutes: institutes,
      sourceUrl: `${config.webUrl}#${articleReference.replace(" ", "")}`,
      isInForce: true,
    });
  }

  return articles;
}

// ─── Helpers ───

function cleanHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function getHierarchyForArticle(
  articleNum: number,
  ranges: HierarchyRange[]
): Record<string, string> {
  let best: Record<string, string> = {};
  for (const range of ranges) {
    if (articleNum >= range.from && articleNum <= range.to) {
      best = { ...range.hierarchy } as Record<string, string>;
    }
  }
  return best;
}

function getInstitutesForArticle(
  articleNum: number,
  mappings: InstituteMapping[]
): { institutes: string[]; keywords: string[] } {
  const institutes = new Set<string>();
  const keywords = new Set<string>();

  for (const mapping of mappings) {
    if (articleNum >= mapping.from && articleNum <= mapping.to) {
      mapping.institutes.forEach((i) => institutes.add(i));
      mapping.keywords.forEach((k) => keywords.add(k));
    }
  }

  return {
    institutes: Array.from(institutes),
    keywords: Array.from(keywords),
  };
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "controlla-me/1.0 (legal-corpus-builder)",
          Accept: "text/html",
          "Accept-Language": "it",
        },
        redirect: "follow",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt + 1) * 1000;
        console.log(`  [EUR-LEX] Retry ${attempt + 1}/${maxRetries} — attendo ${waitMs / 1000}s...`);
        await sleep(waitMs);
      }
    }
  }

  throw lastError || new Error("Fetch failed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
