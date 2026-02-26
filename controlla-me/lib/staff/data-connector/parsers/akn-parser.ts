/**
 * Akoma Ntoso (AKN) Parser — Parsing XML legislativo italiano.
 *
 * Due formati supportati:
 *
 * 1. Formato standard (D.Lgs., Leggi):
 *    <akomaNtoso> → <act> → <body> → <book>/<title>/<chapter>/<section>/<article>
 *
 * 2. Formato attachment (Regi Decreti — Codice Penale, Codice Civile):
 *    <akomaNtoso> → <act> → <body> (3 art. decreto) + <attachments>
 *    Ogni <attachment> → <doc name="Codice Penale-art. N"> → <mainBody> → testo inline
 *    Articolo numero e titolo embedded nel testo: "Art. N. (Titolo) Testo..."
 */

import { XMLParser } from "fast-xml-parser";
import type { ParsedArticle } from "../types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) => {
    return [
      "book", "title", "chapter", "section", "article",
      "paragraph", "p", "content", "part", "attachment",
    ].includes(name);
  },
});

/**
 * Parsa un documento AKN e ritorna un array di ParsedArticle.
 * Gestisce sia il formato standard (body con gerarchia) sia il formato
 * attachment (Regi Decreti con articoli in <attachments>).
 */
export function parseAkn(
  xml: string,
  lawSource: string
): ParsedArticle[] {
  const parsed = parser.parse(xml);
  const articles: ParsedArticle[] = [];

  // Naviga la struttura AKN: akomaNtoso > act
  const root = parsed.akomaNtoso ?? parsed["an:akomaNtoso"] ?? parsed;
  const act = root.act ?? root["an:act"] ?? root;

  // 1. Formato standard: body > book/title/chapter/article
  const body = act.body ?? act["an:body"];
  if (body) {
    collectArticles(body, {}, articles, lawSource);
  }

  // 2. Formato attachment: attachments > attachment > doc > mainBody
  //    Usato dai Regi Decreti (Codice Penale, Codice Civile)
  const attachments = act.attachments ?? act["an:attachments"];
  if (attachments) {
    const attArticles = parseAttachments(attachments, lawSource);
    // Se gli attachment producono piu articoli del body, sono quelli veri
    if (attArticles.length > articles.length) {
      return attArticles;
    }
  }

  return articles;
}

// ─── Formato attachment (Regi Decreti) ───

/**
 * Parsa articoli dal formato attachment.
 * Ogni <attachment> contiene <doc name="Codice Penale-art. N"> → <mainBody> con testo inline.
 * Testo formato: "Art. N. (Titolo) Corpo dell'articolo..."
 */
function parseAttachments(
  attachmentsNode: unknown,
  lawSource: string
): ParsedArticle[] {
  if (!attachmentsNode || typeof attachmentsNode !== "object") return [];
  const obj = attachmentsNode as Record<string, unknown>;

  const attachmentList = obj.attachment ?? obj["an:attachment"];
  if (!attachmentList) return [];

  const attachments = Array.isArray(attachmentList)
    ? attachmentList
    : [attachmentList];

  const articles: ParsedArticle[] = [];

  for (const att of attachments) {
    if (!att || typeof att !== "object") continue;
    const attObj = att as Record<string, unknown>;

    // Ogni attachment ha un <doc> con name e <mainBody>
    const doc = attObj.doc ?? attObj["an:doc"];
    if (!doc || typeof doc !== "object") continue;
    const docObj = doc as Record<string, unknown>;

    const docName = (docObj["@_name"] ?? "") as string;
    const mainBody = docObj.mainBody ?? docObj["an:mainBody"];
    if (!mainBody) continue;

    // Estrai tutto il testo dal mainBody
    const rawText = extractText(mainBody);
    if (!rawText || rawText.length < 10) continue;

    // Parsa numero articolo dal nome doc: "Codice Penale-art. 1 bis" → "1-bis"
    const artFromName = parseArticleNumberFromDocName(docName);

    // Parsa numero, titolo e testo dal contenuto inline
    const parsed = parseInlineArticle(rawText, artFromName);
    if (!parsed) continue;

    const article: ParsedArticle = {
      articleNumber: parsed.number,
      articleTitle: parsed.title,
      articleText: cleanText(parsed.text),
      hierarchy: {},
      sourceUrl: `normattiva:${lawSource}#art_${parsed.number}`,
      isInForce: !rawText.toLowerCase().includes("articolo abrogato"),
    };

    if (article.articleText.length >= 5) {
      articles.push(article);
    }
  }

  return articles;
}

/**
 * Estrae il numero articolo dal nome del doc attachment.
 * Es: "Codice Penale-art. 1" → "1"
 *     "Codice Penale-art. 3 bis" → "3-bis"
 *     "Codice civile-art. 2645 ter" → "2645-ter"
 */
function parseArticleNumberFromDocName(name: string): string {
  const match = name.match(/art\.\s*(\d+(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)/i);
  if (!match) return "";
  return match[1].replace(/\s+/g, "-").trim();
}

/**
 * Parsa un articolo dal testo inline nel formato attachment.
 * Formato tipico: "Art. 1. (Titolo dell'articolo) Testo del corpo..."
 * Varianti: con/senza titolo, con/senza punto dopo numero, con suffisso bis/ter.
 */
function parseInlineArticle(
  rawText: string,
  fallbackNumber: string
): { number: string; title: string | null; text: string } | null {
  // Pulisci testo: rimuovi (( )) da inserimenti, normalizza spazi
  let text = rawText
    .replace(/\(\(/g, "")
    .replace(/\)\)/g, "")
    .trim();

  // Pattern: "Art. N[-bis]. (Titolo) Testo..."
  // o anche: "CODICE PENALE Art. 1. (Titolo) Testo..." (primo articolo con prefisso)
  const artPattern = /^(?:.*?\s)?Art\.\s*(\d+(?:-(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)\.?\s*/i;
  const artMatch = text.match(artPattern);

  let articleNumber = fallbackNumber;
  if (artMatch) {
    articleNumber = artMatch[1];
    text = text.slice(artMatch[0].length);
  }

  if (!articleNumber) return null;

  // Rimuovi punteggiatura residua dopo "Art. N" (es. ". " da ref elements)
  text = text.replace(/^[.\s]+/, "");

  // Estrai titolo tra parentesi: "(Titolo dell'articolo)"
  let title: string | null = null;
  const titlePattern = /^\(([^)]+)\)\s*/;
  const titleMatch = text.match(titlePattern);
  if (titleMatch) {
    title = titleMatch[1].trim();
    text = text.slice(titleMatch[0].length);
  }

  // Rimuovi punteggiatura residua anche dopo il titolo
  text = text.replace(/^[.\s]+/, "");

  // Pulisci il testo rimanente
  text = text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (!text || text.length < 5) return null;

  return { number: articleNumber, title, text };
}

// ─── Formato standard (body con gerarchia) ───

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

  // Titolo — pulisce prefisso legislativo "(L)" / "(R)" dai Testi Unici
  const rawTitle = extractText(art.heading ?? art["an:heading"]);
  const articleTitle = rawTitle
    ? rawTitle.replace(/^\s*\([LR]\)\s*/i, "").trim() || null
    : null;

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

    // Raccoglie ricorsivamente, escludendo attributi XML (@_eId, @_status, ecc.)
    const parts: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith("@_")) continue; // Salta attributi XML
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
    .replace(/\(\(/g, "")
    .replace(/\)\)/g, "")
    .replace(/&egrave;/gi, "è")
    .replace(/&agrave;/gi, "à")
    .replace(/&ograve;/gi, "ò")
    .replace(/&ugrave;/gi, "ù")
    .replace(/&igrave;/gi, "ì")
    .replace(/&Egrave;/gi, "È")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}
