/**
 * Fetcher Normattiva HTML — Scarica leggi italiane via export completo.
 *
 * Strategia (scoperta 2026-02-23):
 * 1. Fetch pagina atto via URN → ottieni cookie sessione
 * 2. Fetch export completo /esporta/attoCompleto → HTML con TUTTI gli articoli (AKN classes)
 * 3. Parse singoli articoli dall'HTML (article-num-akn, article-heading-akn, art-commi-div-akn)
 *
 * Vantaggi: 2 richieste HTTP invece di 250+. Tutti gli articoli inclusi (anche bis/ter/quater).
 *
 * NOTA: Usato come fallback quando l'API OpenData non è disponibile.
 */

import { sleep, extractLegalTerms, cleanText, BROWSER_HEADERS } from "../lib/utils";
import type { LegalArticle } from "../lib/types";
import type { NormattivaSource } from "../corpus-sources";

const NORMATTIVA_BASE = "https://www.normattiva.it";

// ─── Fetch principale ───

export async function fetchNormattivaHtml(source: NormattivaSource): Promise<LegalArticle[]> {
  console.log(`\n  [NORM] Scaricamento ${source.name}...`);

  if (source.id === "codice-civile") {
    console.log(`  [SKIP] ${source.name} — usa fonte HuggingFace`);
    return [];
  }

  // Step 1: Fetch pagina atto → cookie sessione
  const treeUrl = `${NORMATTIVA_BASE}/uri-res/N2Ls?${source.urn}!vig=`;
  console.log(`  [NORM] Step 1: Sessione...`);

  let cookies: string;
  try {
    const treeResp = await fetch(treeUrl, { headers: BROWSER_HEADERS, redirect: "follow" });
    if (!treeResp.ok) {
      console.error(`  [NORM] HTTP ${treeResp.status} per pagina atto`);
      return [];
    }
    cookies = extractCookies(treeResp);
    await treeResp.text(); // consume body
    console.log(`  [NORM] Cookie: ${cookies ? "OK" : "mancante"}`);
  } catch (err) {
    console.error(`  [NORM] Errore sessione: ${err}`);
    return [];
  }

  await sleep(500);

  // Step 2: Export completo con cookie
  const exportUrl = `${NORMATTIVA_BASE}/esporta/attoCompleto?atto.dataPubblicazioneGazzetta=${source.dataPubblicazioneGU}&atto.codiceRedazionale=${source.codiceRedazionale}`;
  console.log(`  [NORM] Step 2: Export completo...`);

  let html: string;
  try {
    const headers: Record<string, string> = { ...BROWSER_HEADERS };
    if (cookies) headers["Cookie"] = cookies;

    const exportResp = await fetch(exportUrl, { headers, redirect: "follow" });
    if (!exportResp.ok) {
      console.error(`  [NORM] HTTP ${exportResp.status} per export`);
      return [];
    }
    html = await exportResp.text();
    console.log(`  [NORM] Export scaricato: ${(html.length / 1024).toFixed(0)} KB`);
  } catch (err) {
    console.error(`  [NORM] Errore export: ${err}`);
    return [];
  }

  // Verifica che non sia una pagina di errore
  if (html.includes("<title>Normattiva - Errore</title>") || html.length < 5000) {
    console.error(`  [NORM] Export restituisce pagina di errore (${html.length} bytes)`);
    return [];
  }

  // Step 3: Parse articoli dall'HTML
  const articles = parseExportHtml(html, source);

  const pct = (articles.length / source.expectedArticles) * 100;
  console.log(
    `  [NORM] Completato: ${articles.length} articoli (${pct.toFixed(0)}% del previsto ${source.expectedArticles})`
  );

  return articles;
}

// ─── Parse HTML export completo ───

function parseExportHtml(html: string, source: NormattivaSource): LegalArticle[] {
  const articles: LegalArticle[] = [];

  // Trova tutti gli articoli via regex su classi AKN
  // Struttura: <h2 class="article-num-akn" id="art_N">Art. N</h2>
  //            <div class="article-heading-akn">Rubrica</div>
  //            <div class="art-commi-div-akn">...commi...</div>

  // Split HTML per articolo: ogni articolo inizia con article-num-akn
  const artSplitRegex = /(?=<h\d[^>]*class="article-num-akn")/gi;
  const artChunks = html.split(artSplitRegex).filter((chunk) =>
    chunk.includes("article-num-akn")
  );

  // Estrai gerarchia corrente dal contesto (parti/titoli/capi prima di ogni articolo)
  const hierarchyTracker = new HierarchyTracker(html);

  for (const chunk of artChunks) {
    const article = parseArticleChunk(chunk, source, hierarchyTracker);
    if (article) articles.push(article);
  }

  // Deduplica per articleReference
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.articleReference)) return false;
    seen.add(a.articleReference);
    return true;
  });
}

function parseArticleChunk(
  chunk: string,
  source: NormattivaSource,
  hierarchyTracker: HierarchyTracker
): LegalArticle | null {
  // Numero articolo
  const numMatch = chunk.match(/class="article-num-akn"[^>]*id="([^"]*)"[^>]*>([^<]+)/i);
  if (!numMatch) return null;

  const artId = numMatch[1]; // es. "art_1", "art_15-bis"
  const artDisplay = numMatch[2].trim(); // es. "Art. 1", "Art. 15-bis"

  // Rubrica
  const headingMatch = chunk.match(/class="article-heading-akn"[^>]*>([\s\S]*?)(?=<\/(?:div|h\d)>)/i);
  let rubrica = headingMatch
    ? headingMatch[1].replace(/<[^>]+>/g, " ").replace(/\(\(/g, "").replace(/\)\)/g, "").trim()
    : null;
  if (rubrica) {
    rubrica = cleanText(rubrica).replace(/^\(+|\)+$/g, "").trim();
    if (rubrica === "" || rubrica.length < 2) rubrica = null;
  }

  // Testo dai commi
  let text = "";

  // Metodo 1: container commi AKN
  const commiMatch = chunk.match(/class="art-commi-div-akn">([\s\S]*?)(?=<div class="vigore|$)/i);
  if (commiMatch) {
    text = commiMatch[1].replace(/<[^>]+>/g, " ").trim();
  }

  // Metodo 2: singoli testi comma
  if (!text || text.length < 10) {
    const commaTexts: string[] = [];
    const commaRegex = /class="art_text_in_comma"[^>]*>([\s\S]*?)<\/span>/gi;
    let m;
    while ((m = commaRegex.exec(chunk)) !== null) {
      commaTexts.push(m[1].replace(/<[^>]+>/g, " ").trim());
    }
    if (commaTexts.length > 0) text = commaTexts.join("\n");
  }

  // Metodo 3: bodyTesto
  if (!text || text.length < 10) {
    const bodyMatch = chunk.match(/class="bodyTesto"[^>]*>([\s\S]*?)<\/div>/i);
    if (bodyMatch) text = bodyMatch[1].replace(/<[^>]+>/g, " ").trim();
  }

  text = cleanText(text);
  if (text.length < 10) return null;

  // Filtra preambolo
  if (isPreamble(text)) return null;

  // Filtra indici/TOC
  const artRefs = (text.match(/\bart\.\s*\d+/gi) || []).length;
  if (artRefs > 5 && artRefs > text.length / 80) return null;

  // Gerarchia
  const hierarchy = hierarchyTracker.getHierarchyFor(artId);

  // Keywords
  const keywords = [...source.defaultKeywords];
  const institutes = [...source.defaultInstitutes];

  if (rubrica) {
    rubrica
      .toLowerCase()
      .replace(/[^\w\sàèéìòùç]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .forEach((w) => { if (!keywords.includes(w)) keywords.push(w); });
  }

  extractLegalTerms(text).forEach((t) => { if (!keywords.includes(t)) keywords.push(t); });

  // Article reference: normalizza
  const artRef = artDisplay.startsWith("Art.") ? artDisplay : `Art. ${artDisplay}`;

  // Article number per source URL
  const artNum = artId.replace("art_", "").replace(/-/g, "");

  return {
    lawSource: source.lawSource,
    articleReference: artRef,
    articleTitle: rubrica,
    articleText: text,
    hierarchy,
    keywords,
    relatedInstitutes: institutes,
    sourceUrl: source.sourceUrlPattern?.replace("{N}", artNum) ?? undefined,
    isInForce: true,
  };
}

// ─── Gerarchia dal contesto HTML ───

class HierarchyTracker {
  private sections: Array<{ level: string; label: string; position: number }> = [];
  private articlePositions: Map<string, number> = new Map();

  constructor(html: string) {
    let m: RegExpExecArray | null;

    // Normattiva export usa <span class="dentro"> con <br/> separatori
    // Es: <span class="dentro">Parte I<br />DISPOSIZIONI GENERALI<br />Titolo I<br />...</span>
    const dentroRegex = /<span class="dentro">([\s\S]*?)<\/span>/gi;
    while ((m = dentroRegex.exec(html)) !== null) {
      const content = m[1]
        .replace(/<br\s*\/?>/g, " — ")
        .replace(/<[^>]+>/g, "")
        .replace(/\(\(/g, "").replace(/\)\)/g, "")
        .trim();
      const pos = m.index;

      // Estrai livelli gerarchici dal contenuto
      const lines = content.split(" — ").map((s) => s.trim()).filter(Boolean);
      for (const line of lines) {
        if (/^Parte\s/i.test(line)) {
          // "Parte I" + next line is description
          const idx = lines.indexOf(line);
          const desc = lines[idx + 1] || "";
          this.sections.push({ level: "book", label: `${line} — ${desc}`.trim(), position: pos });
        } else if (/^Libro\s/i.test(line)) {
          const idx = lines.indexOf(line);
          const desc = lines[idx + 1] || "";
          this.sections.push({ level: "book", label: `${line} — ${desc}`.trim(), position: pos });
        } else if (/^Titolo\s/i.test(line)) {
          const idx = lines.indexOf(line);
          const desc = lines[idx + 1] || "";
          this.sections.push({ level: "title", label: `${line} — ${desc}`.trim(), position: pos });
        } else if (/^Capo\s/i.test(line)) {
          const idx = lines.indexOf(line);
          const desc = lines[idx + 1] || "";
          this.sections.push({ level: "chapter", label: `${line} — ${desc}`.trim(), position: pos });
        } else if (/^Sezione\s/i.test(line)) {
          const idx = lines.indexOf(line);
          const desc = lines[idx + 1] || "";
          this.sections.push({ level: "section", label: `${line} — ${desc}`.trim(), position: pos });
        }
      }
    }

    // Fallback: cerca anche <em> e pattern inline (per sezioni modificate)
    const inlineRegex = /<em>\(\(((?:Parte|Libro|Titolo|Capo|Sezione)\s+[^)]+)\)\)<\/em>/gi;
    while ((m = inlineRegex.exec(html)) !== null) {
      const label = m[1].replace(/<[^>]+>/g, "").trim();
      let level = "book";
      if (/^Titolo/i.test(label)) level = "title";
      else if (/^Capo/i.test(label)) level = "chapter";
      else if (/^Sezione/i.test(label)) level = "section";
      this.sections.push({ level, label, position: m.index });
    }

    // Trova posizioni articoli
    const artRegex = /class="article-num-akn"[^>]*id="([^"]+)"/gi;
    while ((m = artRegex.exec(html)) !== null) {
      this.articlePositions.set(m[1], m.index);
    }
  }

  getHierarchyFor(artId: string): Record<string, string> {
    const artPos = this.articlePositions.get(artId);
    if (artPos === undefined) return {};

    const result: Record<string, string> = {};
    const levels = ["book", "title", "chapter", "section"];

    for (const level of levels) {
      let best: string | null = null;
      for (const section of this.sections) {
        if (section.level === level && section.position < artPos) {
          best = section.label;
        }
      }
      if (best) result[level] = cleanText(best);
    }

    return result;
  }
}

// ─── Utility ───

function extractCookies(response: Response): string {
  const setCookies = response.headers.getSetCookie?.() ?? [];

  if (setCookies.length === 0) {
    const raw = response.headers.get("set-cookie");
    if (raw) {
      return raw.split(",")
        .map((c) => c.split(";")[0].trim())
        .filter(Boolean)
        .join("; ");
    }
    return "";
  }

  return setCookies
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

const PREAMBLE_PATTERNS = [
  /^visti?\s+gli?\s+articol/i,
  /^vista?\s+la?\s+(legge|deliberazione|costituzione)/i,
  /^sentito?\s+il\s+consiglio/i,
  /^udito?\s+il\s+consiglio/i,
  /abbiamo decretato e decretiamo/i,
  /sulla proposta del/i,
  /è promulgata la seguente legge/i,
  /dato a roma/i,
];

function isPreamble(text: string): boolean {
  const first200 = text.slice(0, 200);
  return PREAMBLE_PATTERNS.some((p) => p.test(first200));
}
