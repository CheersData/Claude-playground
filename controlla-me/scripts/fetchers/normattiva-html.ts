/**
 * Fetcher Normattiva HTML — Scarica leggi italiane da normattiva.it via scraping.
 *
 * Strategia:
 * - Pagina singola per atti brevi (< 200 art.)
 * - Paginazione server-side per codici grandi (CPC, CP)
 * - Rate limit gentile: 1.5s tra pagine
 * - Fallback regex se i selettori CSS non funzionano
 *
 * NOTA: Usato come fallback quando l'API OpenData non è disponibile.
 */

import * as cheerio from "cheerio";
import { fetchWithRetry, sleep, extractLegalTerms, cleanText, BROWSER_HEADERS } from "../lib/utils";
import type { LegalArticle } from "../lib/types";
import type { NormattivaSource } from "../corpus-sources";

// ─── Fetch principale ───

export async function fetchNormattivaHtml(source: NormattivaSource): Promise<LegalArticle[]> {
  console.log(`\n  [NORM-HTML] Scaricamento ${source.name}...`);

  // Per il Codice Civile, usa HuggingFace (più affidabile)
  if (source.id === "codice-civile") {
    console.log(`  [SKIP] ${source.name} — usa fonte HuggingFace`);
    return [];
  }

  const url = buildUrl(source, 1);
  console.log(`  [NORM-HTML] URL: ${url}`);

  try {
    const response = await fetchWithRetry(url, { headers: BROWSER_HEADERS });

    if (!response.ok) {
      console.warn(`  [NORM-HTML] HTTP ${response.status} — provo paginazione...`);
      return fetchMultiPage(source);
    }

    const html = await response.text();
    const articles = parseHtml(html, source);

    if (articles.length === 0) {
      console.warn(`  [NORM-HTML] Nessun articolo dal parsing. Provo paginazione...`);
      return fetchMultiPage(source);
    }

    // Se pochi articoli rispetto al previsto, prova paginazione
    if (articles.length < source.expectedArticles * 0.5 && source.expectedArticles > 50) {
      console.log(`  [NORM-HTML] Solo ${articles.length}/${source.expectedArticles} — provo paginazione...`);
      const paged = await fetchMultiPage(source);
      if (paged.length > articles.length) return paged;
    }

    logValidation(articles.length, source);
    return articles;
  } catch (err) {
    console.error(`  [NORM-HTML] Errore: ${err}`);
    return fetchMultiPage(source);
  }
}

// ─── Fetch paginato ───

async function fetchMultiPage(source: NormattivaSource): Promise<LegalArticle[]> {
  console.log(`  [NORM-HTML] Paginazione per ${source.name}...`);

  const allArticles: LegalArticle[] = [];
  const seenRefs = new Set<string>();
  let page = 1;
  let consecutiveEmpty = 0;
  const maxPages = Math.ceil(source.expectedArticles / 15) + 10;

  while (page <= maxPages && consecutiveEmpty < 3) {
    try {
      const url = buildUrl(source, page);
      const response = await fetchWithRetry(url, { headers: BROWSER_HEADERS });

      if (!response.ok) {
        consecutiveEmpty++;
        page++;
        continue;
      }

      const html = await response.text();
      const pageArticles = parseHtml(html, source);

      // Filtra duplicati
      const newArticles = pageArticles.filter((a) => {
        if (seenRefs.has(a.articleReference)) return false;
        seenRefs.add(a.articleReference);
        return true;
      });

      if (newArticles.length === 0) {
        consecutiveEmpty++;
      } else {
        consecutiveEmpty = 0;
        allArticles.push(...newArticles);
        if (page % 10 === 0) {
          console.log(`  [NORM-HTML] Pagina ${page}: ${allArticles.length} articoli`);
        }
      }
    } catch {
      consecutiveEmpty++;
    }

    page++;
    await sleep(1500);
  }

  console.log(`  [NORM-HTML] Paginazione: ${allArticles.length} articoli in ${page - 1} pagine`);
  logValidation(allArticles.length, source);
  return allArticles;
}

// ─── Parser HTML ───

function parseHtml(html: string, source: NormattivaSource): LegalArticle[] {
  const $ = cheerio.load(html);
  const articles: LegalArticle[] = [];

  // Contesto gerarchia
  let currentBook = "";
  let currentTitle = "";
  let currentChapter = "";

  // Aggiorna gerarchia dai titoli
  $("h2, h3, h4, .rubrica-sezione, .titolo-sezione, .libro-sezione").each((_, el) => {
    const text = $(el).text().trim();
    if (/^libro\s+/i.test(text)) { currentBook = text; currentTitle = ""; currentChapter = ""; }
    else if (/^titolo\s+/i.test(text)) { currentTitle = text; currentChapter = ""; }
    else if (/^capo\s+/i.test(text)) currentChapter = text;
  });

  // Prova vari selettori
  const selectors = [".art-container", "[id^='art']", "div.articolo", ".corpo-articolo"];

  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const $el = $(el);
      const article = extractArticle($, $el, source, { currentBook, currentTitle, currentChapter });
      if (article) articles.push(article);
    });

    if (articles.length > 0) break;
  }

  // Fallback regex
  if (articles.length === 0) {
    parseWithRegex($.text(), source, articles);
  }

  // Deduplica
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.articleReference)) return false;
    seen.add(a.articleReference);
    return true;
  });
}

function extractArticle(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<any>,
  source: NormattivaSource,
  ctx: { currentBook: string; currentTitle: string; currentChapter: string }
): LegalArticle | null {
  // Estrai riferimento articolo
  let artRef = "";

  const numEl = $el.find(".art-num, .numero-articolo").first();
  if (numEl.length) {
    artRef = numEl.text().trim();
  } else {
    const id = $el.attr("id") || $el.attr("name") || "";
    const m = id.match(/art[_-]?(\d+\w*)/i);
    if (m) artRef = `Art. ${m[1]}`;
  }

  if (!artRef) return null;
  if (!artRef.startsWith("Art.")) artRef = `Art. ${artRef.replace(/^art\.?\s*/i, "")}`;

  // Rubrica
  const rubrica = $el.find(".art-rubrica, .rubrica, .rubrica-articolo").first().text().trim() || null;

  // Testo
  const bodyEl = $el.find(".art-body, .corpo, .testo-articolo").first();
  let text = bodyEl.length ? bodyEl.text().trim() : $el.text().trim();
  if (artRef) text = text.replace(artRef, "").trim();
  if (rubrica) text = text.replace(rubrica, "").trim();
  text = cleanText(text);

  if (text.length < 10) return null;

  // Filtra preambolo/formula di promulgazione
  if (isPreambleText(text) || (rubrica && isPreambleText(rubrica))) return null;

  // Hierarchy
  const hierarchy: Record<string, string> = {};
  if (ctx.currentBook) hierarchy.book = ctx.currentBook;
  if (ctx.currentTitle) hierarchy.title = ctx.currentTitle;
  if (ctx.currentChapter) hierarchy.chapter = ctx.currentChapter;

  // Keywords
  const keywords = [...source.defaultKeywords];
  const institutes = [...source.defaultInstitutes];
  extractLegalTerms(text).forEach((t) => { if (!keywords.includes(t)) keywords.push(t); });

  return {
    lawSource: source.lawSource,
    articleReference: artRef,
    articleTitle: rubrica,
    articleText: text,
    hierarchy,
    keywords,
    relatedInstitutes: institutes,
    sourceUrl: source.sourceUrlPattern?.replace("{N}", artRef.replace("Art. ", "")) ?? undefined,
    isInForce: true,
  };
}

/** Pattern che indicano testo di preambolo/formula di promulgazione, non contenuto normativo */
const PREAMBLE_PATTERNS = [
  /udito il consiglio/i,
  /abbiamo decretato e decretiamo/i,
  /sulla proposta del/i,
  /ministro segretario di stato/i,
  /della legge predetta/i,
  /visto il regio decreto/i,
  /il presidente della repubblica/i,
  /gazzetta ufficiale/i,
  /vista la deliberazione/i,
  /sentito il consiglio di stato/i,
  /è promulgata la seguente legge/i,
];

function isPreambleText(text: string): boolean {
  return PREAMBLE_PATTERNS.some((p) => p.test(text));
}

function parseWithRegex(fullText: string, source: NormattivaSource, articles: LegalArticle[]): void {
  const regex = /Art\.\s*(\d+(?:-(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)\s*(?:[-–—]\s*)?([^\n]*?)?\n([\s\S]*?)(?=Art\.\s*\d|$)/gi;

  let match;
  while ((match = regex.exec(fullText)) !== null) {
    const artNum = match[1];
    const rubrica = match[2]?.trim() || null;
    const text = cleanText(match[3] || "");
    if (text.length < 10) continue;

    // Filtra preambolo/formula di promulgazione
    if (isPreambleText(text) || (rubrica && isPreambleText(rubrica))) continue;

    const keywords = [...source.defaultKeywords];
    const institutes = [...source.defaultInstitutes];
    extractLegalTerms(text).forEach((t) => { if (!keywords.includes(t)) keywords.push(t); });

    articles.push({
      lawSource: source.lawSource,
      articleReference: `Art. ${artNum}`,
      articleTitle: rubrica,
      articleText: text,
      hierarchy: {},
      keywords,
      relatedInstitutes: institutes,
      sourceUrl: source.sourceUrlPattern?.replace("{N}", artNum) ?? undefined,
      isInForce: true,
    });
  }
}

// ─── Utility ───

function buildUrl(source: NormattivaSource, page: number): string {
  return `https://www.normattiva.it/atto/caricaDettaglioAtto?atto.dataPubblicazioneGazzetta=${source.dataPubblicazioneGU}&atto.codiceRedazionale=${source.codiceRedazionale}&atto.tipoAtto=${encodeURIComponent(source.tipoAtto)}&currentPage=${page}`;
}

function logValidation(count: number, source: NormattivaSource): void {
  const pct = (count / source.expectedArticles) * 100;
  if (pct < source.minThresholdPct) {
    console.warn(
      `  [NORM-HTML] ATTENZIONE: ${count} articoli (${pct.toFixed(0)}% del previsto ${source.expectedArticles})`
    );
  } else {
    console.log(
      `  [NORM-HTML] ${count} articoli (${pct.toFixed(0)}% del previsto ${source.expectedArticles})`
    );
  }
}
