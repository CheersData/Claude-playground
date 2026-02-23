/**
 * Fetcher EUR-Lex CELLAR — Scarica regolamenti e direttive UE via CELLAR REST API.
 *
 * CELLAR REST API (zero auth!):
 * - Endpoint: https://publications.europa.eu/resource/celex/{CELEX}
 * - Content negotiation: Accept: application/xhtml+xml + Accept-Language: ita
 * - Restituisce XHTML strutturato
 * - Identificatori stabili (non dipendono dal layout del sito)
 *
 * Strategia:
 * 1. Prova CELLAR REST API (XHTML strutturato, zero auth)
 * 2. Fallback su HTML scraping classico (eurlex-html.ts)
 *
 * Documentazione: https://publications.europa.eu/en/web/cellar
 */

import * as cheerio from "cheerio";
import { fetchWithRetry, extractLegalTerms, cleanText } from "../lib/utils";
import { fetchEurLexHtml } from "./eurlex-html";
import type { LegalArticle } from "../lib/types";
import type { EurLexSource } from "../corpus-sources";

const CELLAR_BASE = "https://publications.europa.eu/resource/celex";

// ─── Fetch principale (CELLAR API-first, HTML fallback) ───

export async function fetchEurLex(source: EurLexSource): Promise<LegalArticle[]> {
  console.log(`\n  [EURLEX-API] Scaricamento ${source.name} via CELLAR REST API...`);

  try {
    const url = `${CELLAR_BASE}/${source.celex}`;
    console.log(`  [EURLEX-API] URL: ${url}`);

    const response = await fetchWithRetry(url, {
      headers: {
        "Accept": "application/xhtml+xml, text/html;q=0.9",
        "Accept-Language": "ita, it;q=0.9",
      },
    });

    if (!response.ok) {
      console.warn(`  [EURLEX-API] CELLAR HTTP ${response.status} — fallback HTML scraping`);
      return fetchEurLexHtml(source);
    }

    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();

    // Se la risposta non è HTML/XHTML, fallback
    if (!contentType.includes("html") && !contentType.includes("xml") && body.length < 500) {
      console.warn(`  [EURLEX-API] Risposta non-HTML (${contentType}) — fallback`);
      return fetchEurLexHtml(source);
    }

    const articles = parseXhtml(body, source);

    if (articles.length === 0) {
      console.warn(`  [EURLEX-API] Nessun articolo dal parsing CELLAR — fallback HTML`);
      return fetchEurLexHtml(source);
    }

    // Validazione soglia
    const pct = (articles.length / source.expectedArticles) * 100;
    if (pct < source.minThresholdPct) {
      console.warn(
        `  [EURLEX-API] ATTENZIONE: ${articles.length} articoli (${pct.toFixed(0)}% del previsto ${source.expectedArticles})`
      );
      // Se sotto soglia, prova HTML che potrebbe avere struttura diversa
      if (pct < 30) {
        console.log(`  [EURLEX-API] Troppo pochi — provo fallback HTML...`);
        const htmlArticles = await fetchEurLexHtml(source);
        if (htmlArticles.length > articles.length) return htmlArticles;
      }
    } else {
      console.log(
        `  [EURLEX-API] ${articles.length} articoli (${pct.toFixed(0)}% del previsto ${source.expectedArticles})`
      );
    }

    return articles;
  } catch (err) {
    console.error(`  [EURLEX-API] Errore CELLAR: ${err}`);
    console.log(`  [EURLEX-API] Fallback su HTML scraping...`);
    return fetchEurLexHtml(source);
  }
}

// ─── Parser XHTML (CELLAR response) ───

function parseXhtml(xhtml: string, source: EurLexSource): LegalArticle[] {
  const $ = cheerio.load(xhtml, { xmlMode: false });
  const articles: LegalArticle[] = [];

  let currentChapter = "";
  let currentSection = "";

  // CELLAR XHTML ha struttura simile all'HTML di EUR-Lex
  // Prova prima .eli-subdivision (stesso formato), poi fallback generico
  const subdivisions = $(".eli-subdivision");

  if (subdivisions.length > 0) {
    subdivisions.each((_, el) => {
      const $el = $(el);

      // Aggiorna gerarchia
      const sectionTitle = $el.find(".oj-ti-grseq, .oj-ti-section, .ti-section-1").first();
      if (sectionTitle.length) {
        const titleText = sectionTitle.text().trim();
        if (/^(?:CAPO|CAPITOLO|CHAPTER)\s+/i.test(titleText)) {
          currentChapter = titleText;
          currentSection = "";
        } else if (/^(?:SEZIONE|SECTION)\s+/i.test(titleText)) {
          currentSection = titleText;
        }
      }

      const article = extractArticleFromEl($, $el, source, currentChapter, currentSection);
      if (article) articles.push(article);
    });
  }

  // Fallback: cerca pattern Articolo N nel testo
  if (articles.length === 0) {
    console.log(`  [EURLEX-API] Fallback: parsing generico XHTML...`);

    // Cerca tutti gli elementi che contengono "Articolo N"
    $("div, section, p").each((_, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      const artMatch = text.match(/^Articolo\s+(\d+)/i);
      if (!artMatch) return;

      const artRef = `Art. ${artMatch[1]}`;
      // Evita duplicati
      if (articles.some((a) => a.articleReference === artRef)) return;

      const fullText = cleanText(text.replace(/^Articolo\s+\d+\s*/, ""));
      if (fullText.length < 10) return;

      const keywords = [...source.defaultKeywords];
      const institutes = [...source.defaultInstitutes];
      extractLegalTerms(fullText).forEach((t) => { if (!keywords.includes(t)) keywords.push(t); });

      const elId = $el.attr("id");
      const articleAnchor = elId || `art_${artMatch[1]}`;
      const articleUrl = source.sourceUrlPattern
        ? `${source.sourceUrlPattern}#${articleAnchor}`
        : undefined;

      articles.push({
        lawSource: source.lawSource,
        articleReference: artRef,
        articleTitle: null,
        articleText: fullText,
        hierarchy: {},
        keywords,
        relatedInstitutes: institutes,
        sourceUrl: articleUrl,
        isInForce: true,
      });
    });
  }

  // Fallback regex finale
  if (articles.length === 0) {
    console.log(`  [EURLEX-API] Fallback regex...`);
    const fullText = $.text();
    const regex = /Articolo\s+(\d+)\s*(?:[-–—]\s*)?([^\n]*?)?\n([\s\S]*?)(?=Articolo\s+\d|$)/gi;

    let match;
    while ((match = regex.exec(fullText)) !== null) {
      const artNum = match[1];
      const rubrica = match[2]?.trim() || null;
      const text = cleanText(match[3] || "");
      if (text.length < 10) continue;

      const keywords = [...source.defaultKeywords];
      const institutes = [...source.defaultInstitutes];
      extractLegalTerms(text).forEach((t) => { if (!keywords.includes(t)) keywords.push(t); });

      const articleUrl = source.sourceUrlPattern
        ? `${source.sourceUrlPattern}#art_${artNum}`
        : undefined;

      articles.push({
        lawSource: source.lawSource,
        articleReference: `Art. ${artNum}`,
        articleTitle: rubrica,
        articleText: text,
        hierarchy: {},
        keywords,
        relatedInstitutes: institutes,
        sourceUrl: articleUrl,
        isInForce: true,
      });
    }
  }

  // Deduplica
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.articleReference)) return false;
    seen.add(a.articleReference);
    return true;
  });
}

// ─── Estrazione articolo da elemento ───

function extractArticleFromEl(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<any>,
  source: EurLexSource,
  currentChapter: string,
  currentSection: string
): LegalArticle | null {
  const artTitleEl = $el.find(".oj-ti-art").first();
  if (!artTitleEl.length) return null;

  const artTitleText = artTitleEl.text().trim();
  const artMatch = artTitleText.match(/Articolo\s+(\d+)/i) || artTitleText.match(/Article\s+(\d+)/i);
  if (!artMatch) return null;

  const artRef = `Art. ${artMatch[1]}`;
  const rubrica = $el.find(".oj-sti-art").first().text().trim() || null;

  const paragraphs: string[] = [];
  $el.find("p, .oj-normal, .oj-ti-grseq-1").each((_, p) => {
    const pText = $(p).text().trim();
    if (pText === artTitleText || pText === rubrica) return;
    if (pText.length > 0) paragraphs.push(pText);
  });

  $el.find("table").each((_, table) => {
    const tableText = $(table).text().trim();
    if (tableText.length > 0) paragraphs.push(tableText);
  });

  const text = cleanText(paragraphs.join("\n\n"));
  if (text.length < 10) return null;

  const hierarchy: Record<string, string> = {};
  if (currentChapter) hierarchy.chapter = currentChapter;
  if (currentSection) hierarchy.section = currentSection;

  const keywords = [...source.defaultKeywords];
  const institutes = [...source.defaultInstitutes];
  extractLegalTerms(text).forEach((t) => { if (!keywords.includes(t)) keywords.push(t); });

  // URL articolo-specifico: aggiungi anchor con ID elemento o numero articolo
  const elId = $el.attr("id");
  const articleAnchor = elId || `art_${artMatch[1]}`;
  const articleUrl = source.sourceUrlPattern
    ? `${source.sourceUrlPattern}#${articleAnchor}`
    : undefined;

  return {
    lawSource: source.lawSource,
    articleReference: artRef,
    articleTitle: rubrica,
    articleText: text,
    hierarchy,
    keywords,
    relatedInstitutes: institutes,
    sourceUrl: articleUrl,
    isInForce: true,
  };
}
