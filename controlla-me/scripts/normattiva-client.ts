/**
 * normattiva-client.ts — Client per scaricare articoli da Normattiva.
 *
 * Strategia: fetch HTML della pagina "multivigenza" di ciascun atto
 * tramite l'URN resolver di Normattiva, poi parsing degli articoli.
 *
 * URL pattern:
 *   https://www.normattiva.it/uri-res/N2Ls?{URN}~art{N}
 *   https://www.normattiva.it/uri-res/N2Ls?{URN}  (intero atto)
 *
 * L'HTML di Normattiva contiene gli articoli in blocchi <div class="art-body">
 * o simili. Facciamo parsing con regex (no DOM parser necessario in Node).
 */

import type { LawSourceConfig, HierarchyRange, InstituteMapping } from "./corpus-sources";

export interface ParsedArticle {
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

const BASE_URL = "https://www.normattiva.it/uri-res/N2Ls";
const RATE_LIMIT_MS = 500; // Pausa tra richieste per non sovraccaricare

// ─── Fetch intero atto e parsing articoli ───

/**
 * Scarica tutti gli articoli di un atto da Normattiva.
 * Usa la versione vigente (multivigenza).
 */
export async function downloadFromNormattiva(
  config: LawSourceConfig
): Promise<ParsedArticle[]> {
  if (!config.normattivaUrn) {
    console.error(`[NORMATTIVA] Nessun URN per ${config.id}`);
    return [];
  }

  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  Download: ${config.name.slice(0, 42).padEnd(42)}║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
  console.log(`  URN: ${config.normattivaUrn}`);
  console.log(`  Articoli stimati: ~${config.estimatedArticles}`);

  const articles: ParsedArticle[] = [];

  // Strategia: scarica articolo per articolo usando ~artN
  // Per codici grandi (>100 art) facciamo range; per leggi piccole tutti
  const maxArt = config.estimatedArticles + 50; // Margine per articoli bis/ter

  let consecutiveMisses = 0;
  const MAX_CONSECUTIVE_MISSES = 30; // Dopo 30 articoli vuoti di fila, fermati
  let downloaded = 0;

  for (let artNum = 1; artNum <= maxArt && consecutiveMisses < MAX_CONSECUTIVE_MISSES; artNum++) {
    const url = `${BASE_URL}?${config.normattivaUrn}~art${artNum}`;

    try {
      const html = await fetchWithRetry(url);

      if (!html || html.includes("Articolo non trovato") || html.includes("404") || html.length < 200) {
        consecutiveMisses++;
        continue;
      }

      // Parse articolo dall'HTML
      const parsed = parseArticleHtml(html, artNum, config);

      if (parsed && parsed.articleText.length > 10) {
        articles.push(parsed);
        consecutiveMisses = 0;
        downloaded++;

        if (downloaded % 50 === 0) {
          console.log(`  [NORMATTIVA] ${downloaded} articoli scaricati...`);
        }
      } else {
        consecutiveMisses++;
      }
    } catch (err) {
      console.error(`  [NORMATTIVA] Errore art. ${artNum}: ${(err as Error).message}`);
      consecutiveMisses++;
    }

    // Rate limit
    await sleep(RATE_LIMIT_MS);
  }

  // Prova anche articoli bis, ter, quater per i numeri che abbiamo trovato
  const foundNumbers = articles.map((a) => a.articleNumber);
  const suffixes = ["bis", "ter", "quater", "quinquies", "sexies", "septies", "octies"];

  for (const artNum of foundNumbers) {
    for (const suffix of suffixes) {
      const url = `${BASE_URL}?${config.normattivaUrn}~art${artNum}${suffix}`;

      try {
        const html = await fetchWithRetry(url);
        if (!html || html.length < 200) continue;

        const parsed = parseArticleHtml(html, artNum, config, suffix);
        if (parsed && parsed.articleText.length > 10) {
          articles.push(parsed);
          downloaded++;
        }
      } catch {
        // Ignora — molti articoli non hanno varianti
      }

      await sleep(RATE_LIMIT_MS);
    }
  }

  console.log(`\n  [NORMATTIVA] Download completato: ${articles.length} articoli per ${config.id}\n`);
  return articles;
}

// ─── Parsing HTML di un singolo articolo ───

function parseArticleHtml(
  html: string,
  articleNum: number,
  config: LawSourceConfig,
  suffix?: string
): ParsedArticle | null {
  // Normattiva wraps article content in various possible structures.
  // We try multiple strategies to extract text.

  let articleText = "";
  let articleTitle: string | null = null;

  // Strategy 1: Look for <div class="bodyArticolo"> or similar
  const bodyMatch = html.match(
    /<div[^>]*class="[^"]*(?:bodyArticolo|art-body|corpo_articolo|testoArticolo)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  );

  if (bodyMatch) {
    articleText = cleanHtml(bodyMatch[1]);
  }

  // Strategy 2: Look for <pre> tags containing article text
  if (!articleText) {
    const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (preMatch) {
      articleText = cleanHtml(preMatch[1]);
    }
  }

  // Strategy 3: Look for content between article header and next section
  if (!articleText) {
    const artHeaderMatch = html.match(
      /Art\.\s*\d+[^<]*(?:bis|ter|quater|quinquies|sexies|septies|octies)?\s*[-—.]?\s*([^<]*)/i
    );
    if (artHeaderMatch) {
      articleTitle = artHeaderMatch[1]?.trim() || null;
    }

    // Get the main content block
    const mainContent = html.match(
      /<div[^>]*(?:id="corpo"|class="[^"]*(?:content|testo|articolo)[^"]*")[^>]*>([\s\S]*?)<\/div>/i
    );
    if (mainContent) {
      articleText = cleanHtml(mainContent[1]);
    }
  }

  // Strategy 4: Broad extraction — get all <p> tags
  if (!articleText || articleText.length < 20) {
    const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
    const texts = paragraphs
      .map((p) => cleanHtml(p))
      .filter((t) => t.length > 5 && !t.startsWith("<!--"));

    if (texts.length > 0) {
      articleText = texts.join("\n\n");
    }
  }

  // Extract title from rubrica/heading
  if (!articleTitle) {
    const rubrMatch = html.match(
      /<[^>]*class="[^"]*(?:rubrica|titoloArticolo|art-title)[^"]*"[^>]*>([\s\S]*?)<\//i
    );
    if (rubrMatch) {
      articleTitle = cleanHtml(rubrMatch[1]).trim();
    }
  }

  if (!articleText || articleText.length < 10) return null;

  // Build reference
  const suffixStr = suffix ? `-${suffix}` : "";
  const articleReference = `Art. ${articleNum}${suffixStr}`;

  // Apply hierarchy and institutes from config
  const hierarchy = getHierarchyForArticle(articleNum, config.hierarchy);
  const { institutes, keywords } = getInstitutesForArticle(articleNum, config.institutes);

  // Extract additional keywords from title
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

  return {
    lawSource: config.id,
    articleNumber: articleNum,
    articleReference,
    articleTitle,
    articleText,
    hierarchy,
    keywords,
    relatedInstitutes: institutes,
    sourceUrl: `${BASE_URL}?${config.normattivaUrn}~art${articleNum}${suffixStr}`,
    isInForce: true,
  };
}

// ─── Helpers ───

function cleanHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "") // Strip all tags
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

      if (response.status === 404) return "";
      if (response.status === 429) {
        console.log(`  [NORMATTIVA] Rate limit — attendo 5s...`);
        await sleep(5000);
        continue;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt + 1) * 1000;
        await sleep(waitMs);
      }
    }
  }

  throw lastError || new Error("Fetch failed");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
