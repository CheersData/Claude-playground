/**
 * Akoma Ntoso (AKN) Parser — Parsing XML legislativo italiano.
 *
 * Struttura AKN:
 *   <akomaNtoso> → <act> → <body> → <book>/<title>/<chapter>/<section>/<article>
 *
 * Ogni <article> ha:
 *   - eId: identificativo univoco
 *   - <num>: numero articolo
 *   - <heading>: titolo articolo
 *   - <content>/<p>: testo articolo
 *   - Gerarchia dai parent elements
 */

import { XMLParser } from "fast-xml-parser";
import type { ParsedArticle } from "../types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) => {
    // Elementi che possono essere multipli
    return [
      "book", "title", "chapter", "section", "article",
      "paragraph", "p", "content", "part",
    ].includes(name);
  },
});

/**
 * Parsa un documento AKN e ritorna un array di ParsedArticle.
 */
export function parseAkn(
  xml: string,
  lawSource: string
): ParsedArticle[] {
  const parsed = parser.parse(xml);
  const articles: ParsedArticle[] = [];

  // Naviga la struttura AKN: akomaNtoso > act > body
  const root = parsed.akomaNtoso ?? parsed["an:akomaNtoso"] ?? parsed;
  const act = root.act ?? root["an:act"] ?? root;
  const body = act.body ?? act["an:body"] ?? act;

  if (!body) return articles;

  // Raccoglie articoli ricorsivamente attraverso la gerarchia
  collectArticles(body, {}, articles, lawSource);

  return articles;
}

/**
 * Raccoglie articoli ricorsivamente, tracciando la gerarchia corrente.
 */
function collectArticles(
  node: unknown,
  currentHierarchy: Record<string, string>,
  articles: ParsedArticle[],
  lawSource: string
): void {
  if (!node || typeof node !== "object") return;

  const obj = node as Record<string, unknown>;

  // Cerca gerarchia: book, part, title, chapter, section
  for (const level of ["book", "part", "title", "chapter", "section"]) {
    const elements = obj[level] ?? obj[`an:${level}`];
    if (!elements) continue;

    const list = Array.isArray(elements) ? elements : [elements];
    for (const el of list) {
      if (!el || typeof el !== "object") continue;
      const elObj = el as Record<string, unknown>;

      // Estrai nome del livello gerarchico
      const levelName = extractText(elObj.num ?? elObj["an:num"]);
      const levelHeading = extractText(elObj.heading ?? elObj["an:heading"]);
      const label = [levelName, levelHeading].filter(Boolean).join(" — ");

      const updatedHierarchy = { ...currentHierarchy };
      if (label) updatedHierarchy[level] = label;

      // Cerca articoli in questo livello
      collectArticles(elObj, updatedHierarchy, articles, lawSource);
    }
  }

  // Cerca articoli direttamente
  const articleElements = obj.article ?? obj["an:article"];
  if (articleElements) {
    const list = Array.isArray(articleElements) ? articleElements : [articleElements];
    for (const artEl of list) {
      const article = parseArticleElement(artEl, currentHierarchy, lawSource);
      if (article) articles.push(article);
    }
  }
}

/**
 * Parsa un singolo elemento <article> in ParsedArticle.
 */
function parseArticleElement(
  artNode: unknown,
  hierarchy: Record<string, string>,
  lawSource: string
): ParsedArticle | null {
  if (!artNode || typeof artNode !== "object") return null;
  const art = artNode as Record<string, unknown>;

  // Numero articolo
  const numRaw = extractText(art.num ?? art["an:num"]);
  const articleNumber = cleanArticleNumber(numRaw);
  if (!articleNumber) return null;

  // Titolo
  const articleTitle = extractText(art.heading ?? art["an:heading"]) || null;

  // Testo: raccoglie da content, paragraph, p
  const articleText = extractArticleText(art);
  if (!articleText || articleText.length < 5) return null;

  // eId per URL
  const eId = (art["@_eId"] ?? art["@_id"] ?? "") as string;

  return {
    articleNumber,
    articleTitle,
    articleText: cleanText(articleText),
    hierarchy,
    sourceUrl: eId ? `normattiva:${lawSource}#${eId}` : undefined,
    isInForce: !isAbrogated(art),
  };
}

/**
 * Estrai testo ricorsivamente da un nodo, concatenando tutti i #text.
 */
function extractText(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node.trim();
  if (typeof node === "number") return String(node);

  if (Array.isArray(node)) {
    return node.map(extractText).filter(Boolean).join(" ");
  }

  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    // Testo diretto
    if ("#text" in obj) return String(obj["#text"]).trim();

    // Raccoglie ricorsivamente
    const parts: string[] = [];
    for (const value of Object.values(obj)) {
      if (typeof value === "string" || typeof value === "number") {
        parts.push(String(value).trim());
      } else {
        const sub = extractText(value);
        if (sub) parts.push(sub);
      }
    }
    return parts.join(" ");
  }

  return "";
}

/**
 * Estrai il testo completo di un articolo da content/paragraph/p.
 */
function extractArticleText(art: Record<string, unknown>): string {
  const parts: string[] = [];

  // Cerca in content, paragraph, alinea, p — a qualsiasi livello
  for (const key of ["content", "an:content", "paragraph", "an:paragraph"]) {
    const contentNode = art[key];
    if (!contentNode) continue;

    const list = Array.isArray(contentNode) ? contentNode : [contentNode];
    for (const item of list) {
      const text = extractText(item);
      if (text) parts.push(text);
    }
  }

  // Se nulla trovato, prova testo diretto
  if (parts.length === 0) {
    const directText = extractText(art);
    if (directText) parts.push(directText);
  }

  return parts.join("\n\n");
}

/**
 * Pulisce il numero articolo: "Art. 1537" → "1537", "1537-bis" resta "1537-bis".
 */
function cleanArticleNumber(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/^art\.?\s*/i, "")
    .replace(/\.$/, "")
    .trim();
}

/**
 * Controlla se un articolo e' abrogato (status = "abrogated" o testo contiene indicazione).
 */
function isAbrogated(art: Record<string, unknown>): boolean {
  const status = (art["@_status"] ?? "") as string;
  if (status.toLowerCase().includes("abrogat")) return true;

  const text = extractText(art);
  if (text.toLowerCase().includes("articolo abrogato")) return true;
  if (text.toLowerCase().includes("comma abrogato")) return true;

  return false;
}

/**
 * Pulizia testo: entita HTML, spazi multipli, trim.
 */
function cleanText(text: string): string {
  return text
    .replace(/&egrave;/gi, "e")
    .replace(/&agrave;/gi, "a")
    .replace(/&ograve;/gi, "o")
    .replace(/&ugrave;/gi, "u")
    .replace(/&igrave;/gi, "i")
    .replace(/&Egrave;/gi, "E")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}
