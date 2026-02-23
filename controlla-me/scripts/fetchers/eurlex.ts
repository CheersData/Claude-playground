/**
 * Fetcher EUR-Lex — Scarica regolamenti e direttive UE.
 *
 * EUR-Lex offre due modalità:
 * 1. REST API (via CELLAR) — accesso SPARQL, complesso ma strutturato
 * 2. HTML scraping — più semplice, HTML ben strutturato con classi CSS prevedibili
 *
 * Usiamo l'approccio HTML perché:
 * - L'HTML di EUR-Lex è molto ben strutturato (classi .eli-subdivision, .oj-ti-art)
 * - Il SPARQL restituisce metadati ma non il testo degli articoli
 * - Per il testo completo serve comunque l'HTML
 *
 * Fonti supportate: GDPR, Dir. 93/13, Dir. 2011/83, Dir. 2019/771, Roma I, DSA
 */

import * as cheerio from "cheerio";
import { fetchWithRetry, extractLegalTerms, cleanText, BROWSER_HEADERS } from "../lib/utils";
import type { LegalArticle } from "../lib/types";
import type { EurLexSource } from "../corpus-sources";

// ─── Fetch principale ───

export async function fetchEurLex(source: EurLexSource): Promise<LegalArticle[]> {
  console.log(`\n  [EURLEX] Scaricamento ${source.name}...`);

  const url = `https://eur-lex.europa.eu/legal-content/${source.lang}/TXT/HTML/?uri=CELEX:${source.celex}`;
  console.log(`  [EURLEX] URL: ${url}`);

  try {
    const response = await fetchWithRetry(url, { headers: BROWSER_HEADERS });

    if (!response.ok) {
      console.error(`  [EURLEX] HTTP ${response.status} per ${source.celex}`);
      return [];
    }

    const html = await response.text();
    const articles = parseHtml(html, source);

    // Validazione soglia
    const pct = (articles.length / source.expectedArticles) * 100;
    if (pct < source.minThresholdPct) {
      console.warn(
        `  [EURLEX] ATTENZIONE: ${articles.length} articoli (${pct.toFixed(0)}% del previsto ${source.expectedArticles})`
      );
    } else {
      console.log(
        `  [EURLEX] ${articles.length} articoli (${pct.toFixed(0)}% del previsto ${source.expectedArticles})`
      );
    }

    return articles;
  } catch (err) {
    console.error(`  [EURLEX] Errore: ${err}`);
    return [];
  }
}

// ─── Parser HTML EUR-Lex ───

function parseHtml(html: string, source: EurLexSource): LegalArticle[] {
  const $ = cheerio.load(html);
  const articles: LegalArticle[] = [];

  let currentChapter = "";
  let currentSection = "";

  // EUR-Lex usa .eli-subdivision per tutte le suddivisioni
  $(".eli-subdivision").each((_, el) => {
    const $el = $(el);

    // Aggiorna gerarchia dai titoli di sezione
    const sectionTitle = $el.find(".oj-ti-grseq, .oj-ti-section").first();
    if (sectionTitle.length) {
      const titleText = sectionTitle.text().trim();
      if (/^(?:CAPO|CAPITOLO|CHAPTER)\s+/i.test(titleText)) {
        currentChapter = titleText;
        currentSection = "";
      } else if (/^(?:SEZIONE|SECTION)\s+/i.test(titleText)) {
        currentSection = titleText;
      }
    }

    // Cerca titolo articolo
    const artTitleEl = $el.find(".oj-ti-art").first();
    if (!artTitleEl.length) return;

    const artTitleText = artTitleEl.text().trim();
    const artMatch = artTitleText.match(/Articolo\s+(\d+)/i) || artTitleText.match(/Article\s+(\d+)/i);
    if (!artMatch) return;

    const artRef = `Art. ${artMatch[1]}`;

    // Rubrica
    const rubrica = $el.find(".oj-sti-art").first().text().trim() || null;

    // Testo: tutti i paragrafi
    const paragraphs: string[] = [];
    $el.find("p, .oj-normal, .oj-ti-grseq-1").each((_, p) => {
      const pText = $(p).text().trim();
      if (pText === artTitleText || pText === rubrica) return;
      if (pText.length > 0) paragraphs.push(pText);
    });

    // Tabelle
    $el.find("table").each((_, table) => {
      const tableText = $(table).text().trim();
      if (tableText.length > 0) paragraphs.push(tableText);
    });

    const text = cleanText(paragraphs.join("\n\n"));
    if (text.length < 10) return;

    // Hierarchy
    const hierarchy: Record<string, string> = {};
    if (currentChapter) hierarchy.chapter = currentChapter;
    if (currentSection) hierarchy.section = currentSection;

    // Keywords
    const keywords = [...source.defaultKeywords];
    const institutes = [...source.defaultInstitutes];
    extractLegalTerms(text).forEach((t) => { if (!keywords.includes(t)) keywords.push(t); });

    articles.push({
      lawSource: source.lawSource,
      articleReference: artRef,
      articleTitle: rubrica,
      articleText: text,
      hierarchy,
      keywords,
      relatedInstitutes: institutes,
      sourceUrl: source.sourceUrlPattern ?? undefined,
      isInForce: true,
    });
  });

  // Fallback: regex se .eli-subdivision non ha funzionato
  if (articles.length === 0) {
    console.log(`  [EURLEX] Fallback regex...`);
    parseWithRegex($, source, articles);
  }

  // Deduplica
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.articleReference)) return false;
    seen.add(a.articleReference);
    return true;
  });
}

function parseWithRegex(
  $: cheerio.CheerioAPI,
  source: EurLexSource,
  articles: LegalArticle[]
): void {
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

    articles.push({
      lawSource: source.lawSource,
      articleReference: `Art. ${artNum}`,
      articleTitle: rubrica,
      articleText: text,
      hierarchy: {},
      keywords,
      relatedInstitutes: institutes,
      sourceUrl: source.sourceUrlPattern ?? undefined,
      isInForce: true,
    });
  }
}
