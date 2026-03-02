/**
 * EUR-Lex HTML Parser — Parsing HTML italiano di atti legislativi EU.
 *
 * Struttura tipica EUR-Lex HTML:
 *   <div class="eli-subdivision" id="art_N"> → articolo
 *   <p class="sti-art">Articolo N</p> → numero
 *   <p class="stitle-article-norm">Titolo</p> → titolo
 *   <p class="normal">Testo paragrafo</p> → contenuto
 *   Gerarchia da <p class="ti-section-1"> (capitoli/sezioni)
 */

import type { ParsedArticle } from "../types";

/**
 * Parsa HTML EUR-Lex in italiano e ritorna ParsedArticle[].
 * Parser regex-based per evitare dipendenze DOM (server-side).
 */
export function parseEurLexHtml(
  html: string,
  lawSource: string
): ParsedArticle[] {
  const articles: ParsedArticle[] = [];

  // Pre-scan: estrai gerarchia globale (capitoli/sezioni) con posizione nel testo
  const hierarchyMap = buildHierarchyMap(html);

  // Suddividi per articoli usando pattern eli-subdivision o id="art_"
  const artPattern =
    /<div[^>]*class="[^"]*eli-subdivision[^"]*"[^>]*id="(art_[^"]*)"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*eli-subdivision[^"]*"|<\/body>|$)/gi;

  let match;
  while ((match = artPattern.exec(html)) !== null) {
    const [, artId, content] = match;
    // Trova la gerarchia corrente in base alla posizione nel testo
    const hierarchy = getHierarchyAtPosition(hierarchyMap, match.index);
    const article = parseArticleBlock(artId, content, hierarchy, lawSource);
    if (article) articles.push(article);
  }

  // Se il pattern eli-subdivision non trova nulla, prova pattern alternativo
  if (articles.length === 0) {
    const altResult = parseWithAlternativePattern(html, lawSource);
    if (altResult.length > 0) return altResult;

    // Ultimo fallback: formato vecchio EUR-Lex (pre-2010, HTML con <p>Articolo N</p>)
    return parseLegacyEurLexHtml(html, lawSource);
  }

  return articles;
}

/**
 * Parsa un singolo blocco articolo.
 */
function parseArticleBlock(
  artId: string,
  content: string,
  hierarchy: Record<string, string>,
  lawSource: string
): ParsedArticle | null {
  // Estrai numero articolo: prima da id, poi da oj-ti-art / ti-art
  let articleNumber = "";

  // 1. Prova da id="art_N"
  const idNum = artId.replace(/^art_/, "");
  if (idNum && /^\d+/.test(idNum)) {
    articleNumber = idNum;
  }

  // 2. Prova da <p class="oj-ti-art"> o <p class="ti-art"> ("Articolo N")
  if (!articleNumber) {
    const tiMatch = content.match(
      /<p[^>]*class="[^"]*(?:oj-)?ti-art[^"]*"[^>]*>([\s\S]*?)<\/p>/i
    );
    if (tiMatch) {
      const ref = cleanHtml(tiMatch[1]);
      articleNumber = ref.replace(/^articolo\s*/i, "").trim();
    }
  }

  // 3. Fallback: sti-art (potrebbe essere titolo in vecchio formato)
  if (!articleNumber) {
    const numMatch = content.match(
      /<p[^>]*class="[^"]*sti-art[^"]*"[^>]*>([\s\S]*?)<\/p>/i
    );
    const articleRef = numMatch ? cleanHtml(numMatch[1]) : "";
    articleNumber = articleRef.replace(/^articolo\s*/i, "").trim();
  }

  if (!articleNumber) return null;

  // Estrai titolo: da oj-sti-art, sti-art (se diverso dal numero), o stitle-article-norm
  let articleTitle: string | null = null;
  const stiMatch = content.match(
    /<p[^>]*class="[^"]*(?:oj-)?sti-art[^"]*"[^>]*>([\s\S]*?)<\/p>/i
  );
  if (stiMatch) {
    const candidate = cleanHtml(stiMatch[1]);
    // È titolo solo se NON è "Articolo N"
    if (!/^articolo\s+\d/i.test(candidate)) {
      articleTitle = candidate;
    }
  }
  if (!articleTitle) {
    const titleMatch = content.match(
      /<p[^>]*class="[^"]*stitle-article-norm[^"]*"[^>]*>([\s\S]*?)<\/p>/i
    );
    articleTitle = titleMatch ? cleanHtml(titleMatch[1]) : null;
  }

  // Estrai testo (tutti i <p class="normal"> e simili)
  const textParts: string[] = [];
  const pPattern =
    /<p[^>]*class="[^"]*(?:normal|oj-normal|ti-grseq-1|sti-art-sub)[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pPattern.exec(content)) !== null) {
    const text = cleanHtml(pMatch[1]).trim();
    if (text && text.length > 2) textParts.push(text);
  }

  // Se nessun <p class="normal">, prova tutti i <p>
  if (textParts.length === 0) {
    const allP = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    while ((pMatch = allP.exec(content)) !== null) {
      const text = cleanHtml(pMatch[1]).trim();
      // Escludi numero e titolo gia estratti
      if (
        text &&
        text.length > 5 &&
        !text.match(/^articolo\s+\d/i) &&
        text !== articleTitle
      ) {
        textParts.push(text);
      }
    }
  }

  const articleText = textParts.join("\n\n");
  if (!articleText || articleText.length < 10) return null;

  // Estrai gerarchia dal contesto (capitoli, sezioni nel blocco)
  updateHierarchyFromContent(content, hierarchy);

  return {
    articleNumber,
    articleTitle,
    articleText,
    hierarchy: { ...hierarchy },
    sourceUrl: `eurlex:${lawSource}#${artId}`,
    isInForce: true,
  };
}

/**
 * Pattern alternativo: cerca articoli per <p class="sti-art">.
 */
function parseWithAlternativePattern(
  html: string,
  lawSource: string
): ParsedArticle[] {
  const articles: ParsedArticle[] = [];
  const hierarchy: Record<string, string> = {};

  // Trova tutti gli header di articolo
  const artHeaders: Array<{ index: number; number: string }> = [];
  const headerPattern =
    /<p[^>]*class="[^"]*sti-art[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  let hMatch;
  while ((hMatch = headerPattern.exec(html)) !== null) {
    const text = cleanHtml(hMatch[1]);
    const num = text.replace(/^articolo\s*/i, "").trim();
    if (num) {
      artHeaders.push({ index: hMatch.index, number: num });
    }
  }

  // Per ogni articolo, estrai il testo fino al prossimo articolo
  for (let i = 0; i < artHeaders.length; i++) {
    const start = artHeaders[i].index;
    const end = i + 1 < artHeaders.length ? artHeaders[i + 1].index : html.length;
    const block = html.slice(start, end);

    // Titolo
    const titleMatch = block.match(
      /<p[^>]*class="[^"]*stitle-article-norm[^"]*"[^>]*>([\s\S]*?)<\/p>/i
    );
    const articleTitle = titleMatch ? cleanHtml(titleMatch[1]) : null;

    // Testo
    const textParts: string[] = [];
    const pPattern = /<p[^>]*class="[^"]*normal[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    while ((pMatch = pPattern.exec(block)) !== null) {
      const text = cleanHtml(pMatch[1]).trim();
      if (text && text.length > 2) textParts.push(text);
    }

    const articleText = textParts.join("\n\n");
    if (!articleText || articleText.length < 10) continue;

    // Gerarchia
    updateHierarchyFromContent(block, hierarchy);

    articles.push({
      articleNumber: artHeaders[i].number,
      articleTitle,
      articleText,
      hierarchy: { ...hierarchy },
      sourceUrl: `eurlex:${lawSource}#art_${artHeaders[i].number}`,
      isInForce: true,
    });
  }

  return articles;
}

/**
 * Aggiorna gerarchia dal contenuto (titoli di capitolo/sezione).
 */
function updateHierarchyFromContent(
  content: string,
  hierarchy: Record<string, string>
): void {
  // Capitolo
  const chapterMatch = content.match(
    /<p[^>]*class="[^"]*ti-section-1[^"]*"[^>]*>([\s\S]*?)<\/p>/i
  );
  if (chapterMatch) {
    hierarchy.chapter = cleanHtml(chapterMatch[1]);
  }

  // Sezione
  const sectionMatch = content.match(
    /<p[^>]*class="[^"]*ti-section-2[^"]*"[^>]*>([\s\S]*?)<\/p>/i
  );
  if (sectionMatch) {
    hierarchy.section = cleanHtml(sectionMatch[1]);
  }
}

// ─── Gerarchia globale ───

interface HierarchyEntry {
  position: number;
  level: "chapter" | "section";
  text: string;
}

/**
 * Pre-scan dell'intero HTML per costruire una mappa posizionale della gerarchia.
 * Cerca pattern oj-ti-section-1 (CAPO/Sezione) e oj-ti-section-2 (titolo).
 */
function buildHierarchyMap(html: string): HierarchyEntry[] {
  const entries: HierarchyEntry[] = [];

  // Pattern per oj-ti-section-1 (CAPO X, Sezione X) e ti-section-1
  const sectionPattern =
    /<p[^>]*class="[^"]*(?:oj-)?ti-section-1[^"]*"[^>]*>([\s\S]*?)(?:<\/p>|(?=<p[^>]*class))/gi;

  let match;
  while ((match = sectionPattern.exec(html)) !== null) {
    const text = cleanHtml(match[1]).trim();
    if (!text) continue;

    // Determina se è un capitolo (CAPO/CHAPTER/TITOLO) o una sezione
    const isChapter = /^(CAPO|CHAPTER|TITOLO|TITLE|PARTE|PART)\s/i.test(text);
    entries.push({
      position: match.index,
      level: isChapter ? "chapter" : "section",
      text,
    });
  }

  // Cerca anche ti-section-2 per i titoli descrittivi (es. "Principi")
  const descPattern =
    /<p[^>]*class="[^"]*(?:oj-)?ti-section-2[^"]*"[^>]*>([\s\S]*?)(?:<\/p>|(?=<p[^>]*class))/gi;

  while ((match = descPattern.exec(html)) !== null) {
    const text = cleanHtml(match[1]).trim();
    if (!text || text.length < 3) continue;

    // Associa al precedente entry come descrizione
    // Trova l'entry più recente prima di questa posizione
    const prev = entries
      .filter((e) => e.position < match!.index)
      .pop();
    if (prev) {
      prev.text = `${prev.text} — ${text}`;
    }
  }

  return entries.sort((a, b) => a.position - b.position);
}

/**
 * Trova la gerarchia attiva a una data posizione nel testo.
 */
function getHierarchyAtPosition(
  entries: HierarchyEntry[],
  position: number
): Record<string, string> {
  const hierarchy: Record<string, string> = {};

  for (const entry of entries) {
    if (entry.position > position) break;
    if (entry.level === "chapter") {
      hierarchy.chapter = entry.text;
      // Reset sezione quando cambia capitolo
      delete hierarchy.section;
    } else {
      hierarchy.section = entry.text;
    }
  }

  return hierarchy;
}

/**
 * Parser per formato vecchio EUR-Lex (pre-2010): HTML semplice con
 * <p>Articolo N</p> e testo nei <p> successivi, senza classi CSS semantiche.
 * Usato per direttive come Dir. 93/13/CEE.
 */
function parseLegacyEurLexHtml(
  html: string,
  lawSource: string
): ParsedArticle[] {
  const articles: ParsedArticle[] = [];

  // Trova tutti i paragrafi
  const paragraphs: Array<{ text: string; index: number }> = [];
  const pPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pPattern.exec(html)) !== null) {
    const text = cleanHtml(pMatch[1]).trim();
    if (text) paragraphs.push({ text, index: pMatch.index });
  }

  // Trova gli indici dei paragrafi che sono header di articolo
  const artIndices: Array<{ paragraphIdx: number; number: string }> = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const match = paragraphs[i].text.match(/^Articolo\s+(\d+)\s*$/i);
    if (match) {
      artIndices.push({ paragraphIdx: i, number: match[1] });
    }
  }

  if (artIndices.length === 0) return [];

  // Per ogni articolo, raccogli i paragrafi fino al prossimo articolo o fine
  for (let a = 0; a < artIndices.length; a++) {
    const startP = artIndices[a].paragraphIdx + 1;
    const endP =
      a + 1 < artIndices.length
        ? artIndices[a + 1].paragraphIdx
        : paragraphs.length;

    const textParts: string[] = [];
    for (let p = startP; p < endP; p++) {
      const t = paragraphs[p].text;
      // Escludi paragrafi vuoti o che sono header di sezione di alto livello
      if (t.length > 5 && !t.match(/^Articolo\s+\d+/i)) {
        textParts.push(t);
      }
    }

    const articleText = textParts.join("\n\n");
    if (!articleText || articleText.length < 10) continue;

    articles.push({
      articleNumber: artIndices[a].number,
      articleTitle: null,
      articleText,
      hierarchy: {},
      sourceUrl: `eurlex:${lawSource}#art_${artIndices[a].number}`,
      isInForce: true,
    });
  }

  return articles;
}

/**
 * Rimuove tag HTML e decodifica entita.
 */
function cleanHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#039;/g, "'")
    .replace(/&egrave;/gi, "è")
    .replace(/&agrave;/gi, "à")
    .replace(/&ograve;/gi, "ò")
    .replace(/&ugrave;/gi, "ù")
    .replace(/&igrave;/gi, "ì")
    .replace(/\s+/g, " ")
    .trim();
}
