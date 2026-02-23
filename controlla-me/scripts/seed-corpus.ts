#!/usr/bin/env npx tsx
/**
 * seed-corpus.ts — Caricamento corpus giuridico nel DB Supabase.
 *
 * Logica DELTA: prima di caricare una fonte, conta gli articoli gia presenti.
 * Se il count >= soglia, skippa quella fonte (es. Codice Civile gia caricato).
 *
 * Utilizzo:
 *   npx tsx scripts/seed-corpus.ts all          # Tutte le fonti (delta auto)
 *   npx tsx scripts/seed-corpus.ts normattiva   # Solo fonti italiane
 *   npx tsx scripts/seed-corpus.ts eurlex       # Solo fonti EU
 *   npx tsx scripts/seed-corpus.ts --source codice_penale   # Singola fonte
 *   npx tsx scripts/seed-corpus.ts --force all  # Forza ricaricamento (cancella e ricarica)
 *
 * Requisiti env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

// Carica variabili d'ambiente da .env.local
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";
import {
  ALL_SOURCES,
  NORMATTIVA_SOURCES,
  EURLEX_SOURCES,
  type CorpusSource,
} from "./corpus-sources";

// ─── Config ───

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Batch size per upsert
const BATCH_SIZE = 50;

// Soglia delta: se una fonte ha >= (estimatedArticles * DELTA_THRESHOLD) articoli, skippa
const DELTA_THRESHOLD = 0.8; // 80%

// ─── Tipi ───

interface ArticleRow {
  source_id: string;
  source_name: string;
  source_type: string;
  article_number: string;
  article_title: string | null;
  article_text: string;
  hierarchy: Record<string, string>;
  url: string | null;
  in_force: boolean;
}

// ─── HTML entity decoder ───

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
    "&apos;": "'", "&laquo;": "«", "&raquo;": "»", "&ndash;": "–", "&mdash;": "—",
    "&Egrave;": "È", "&egrave;": "è", "&Eacute;": "É", "&eacute;": "é",
    "&Agrave;": "À", "&agrave;": "à", "&Aacute;": "Á", "&aacute;": "á",
    "&Igrave;": "Ì", "&igrave;": "ì", "&Iacute;": "Í", "&iacute;": "í",
    "&Ograve;": "Ò", "&ograve;": "ò", "&Oacute;": "Ó", "&oacute;": "ó",
    "&Ugrave;": "Ù", "&ugrave;": "ù", "&Uacute;": "Ú", "&uacute;": "ú",
    "&ccedil;": "ç", "&Ccedil;": "Ç", "&ntilde;": "ñ", "&Ntilde;": "Ñ",
    "&deg;": "°", "&euro;": "€", "&sect;": "§", "&copy;": "©",
  };
  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replaceAll(entity, char);
  }
  // Numeric entities: &#123; and &#x1F;
  result = result.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
  return result;
}

// ─── Fetch Normattiva via Akoma Ntoso XML API ───

const NORMATTIVA_HEADERS = {
  "User-Agent": "controlla.me/1.0 (legal-corpus-loader)",
  "Accept": "text/html,application/xhtml+xml,application/xml",
  "Accept-Language": "it-IT,it;q=0.9",
  "Referer": "https://www.normattiva.it/",
};

/**
 * Step 1: Visita la pagina HTML dell'atto su Normattiva.
 * Estrai dataGU, codiceRedaz, dataVigenza dai campi hidden del form.
 */
async function extractAknParams(source: CorpusSource): Promise<{
  dataGU: string;
  codiceRedaz: string;
  dataVigenza: string;
} | null> {
  const url = source.baseUrl;
  console.log(`  Step 1: Estraggo parametri AKN da ${url}`);

  const resp = await fetch(url, { headers: NORMATTIVA_HEADERS, redirect: "follow" });
  if (!resp.ok) {
    console.error(`  ERRORE: HTTP ${resp.status} per ${source.name}`);
    return null;
  }
  const html = await resp.text();

  // Cerca i campi hidden nel form
  const dataGUMatch = html.match(/name=["']atto\.dataPubblicazioneGazzetta["'][^>]*value=["']([^"']+)["']/i)
    || html.match(/value=["']([^"']+)["'][^>]*name=["']atto\.dataPubblicazioneGazzetta["']/i);
  const codiceMatch = html.match(/name=["']atto\.codiceRedazionale["'][^>]*value=["']([^"']+)["']/i)
    || html.match(/value=["']([^"']+)["'][^>]*name=["']atto\.codiceRedazionale["']/i);
  const vigenzaMatch = html.match(/name=["']dataVigenza["'][^>]*value=["']([^"']+)["']/i)
    || html.match(/value=["']([^"']+)["'][^>]*name=["']dataVigenza["']/i);

  if (!codiceMatch) {
    console.error(`  ERRORE: codiceRedaz non trovato per ${source.name}`);
    return null;
  }

  const codiceRedaz = codiceMatch[1];

  // dataGU: formato DD/MM/YYYY → YYYYMMDD
  let dataGU = "";
  if (dataGUMatch) {
    const raw = dataGUMatch[1];
    if (raw.includes("/")) {
      const [d, m, y] = raw.split("/");
      dataGU = `${y}${m.padStart(2, "0")}${d.padStart(2, "0")}`;
    } else {
      dataGU = raw;
    }
  }

  // dataVigenza: usa data corrente se non trovata
  let dataVigenza = "";
  if (vigenzaMatch) {
    const raw = vigenzaMatch[1];
    if (raw.includes("/")) {
      const [d, m, y] = raw.split("/");
      dataVigenza = `${y}${m.padStart(2, "0")}${d.padStart(2, "0")}`;
    } else {
      dataVigenza = raw;
    }
  } else {
    const now = new Date();
    dataVigenza = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  }

  console.log(`  Parametri: codice=${codiceRedaz}, dataGU=${dataGU}, vigenza=${dataVigenza}`);
  return { dataGU, codiceRedaz, dataVigenza };
}

/**
 * Step 2: Scarica l'XML Akoma Ntoso dall'endpoint caricaAKN.
 */
async function downloadAkomaNtoso(params: {
  dataGU: string;
  codiceRedaz: string;
  dataVigenza: string;
}): Promise<string | null> {
  const url = `https://www.normattiva.it/do/atto/caricaAKN?dataGU=${params.dataGU}&codiceRedaz=${params.codiceRedaz}&dataVigenza=${params.dataVigenza}`;
  console.log(`  Step 2: Download AKN XML da /do/atto/caricaAKN`);

  const resp = await fetch(url, { headers: NORMATTIVA_HEADERS });
  if (!resp.ok) {
    console.error(`  ERRORE: HTTP ${resp.status} per AKN download`);
    return null;
  }

  const xml = await resp.text();
  // Verifica che sia XML valido
  if (!xml.includes("<?xml") && !xml.includes("<akomaNtoso") && !xml.includes("<akn:akomaNtoso")) {
    console.error(`  ERRORE: Risposta non e XML Akoma Ntoso (primi 200 chars: ${xml.slice(0, 200)})`);
    return null;
  }

  console.log(`  AKN XML scaricato: ${(xml.length / 1024).toFixed(0)} KB`);
  return xml;
}

/**
 * Step 3: Parsa l'XML Akoma Ntoso per estrarre articoli con gerarchia.
 * La struttura AKN e gerarchica: book > title > chapter > section > article.
 */
function parseAkomaNtoso(xml: string, source: CorpusSource): ArticleRow[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    isArray: (name) => ["book", "part", "title", "chapter", "section", "article",
      "paragraph", "content", "p", "num", "heading", "list", "item", "point",
      "akn:book", "akn:part", "akn:title", "akn:chapter", "akn:section",
      "akn:article", "akn:paragraph", "akn:content", "akn:p", "akn:num",
      "akn:heading", "akn:list", "akn:item", "akn:point"].includes(name),
  });

  const doc = parser.parse(xml);

  // Normattiva puo usare namespace akn: o nessuno
  const root = doc["akomaNtoso"] || doc["akn:akomaNtoso"] || doc;
  const act = root?.["act"] || root?.["akn:act"] || root;
  const body = act?.["body"] || act?.["akn:body"] || act;

  if (!body) {
    console.error(`  ERRORE: Body non trovato nell'XML AKN`);
    return [];
  }

  const articles: ArticleRow[] = [];

  // Estrai testo da un nodo AKN (ricorsivo, raccoglie tutti i <p> e testo)
  function extractText(node: any): string {
    if (!node) return "";
    if (typeof node === "string") return node;
    if (typeof node === "number") return String(node);

    const parts: string[] = [];

    if (node["#text"]) parts.push(String(node["#text"]));

    // Raccogli testo da <p>, <content>, <paragraph> ecc.
    const textTags = ["p", "akn:p", "content", "akn:content", "paragraph", "akn:paragraph",
      "list", "akn:list", "item", "akn:item", "point", "akn:point",
      "intro", "akn:intro", "wrapUp", "akn:wrapUp"];

    for (const tag of textTags) {
      const child = node[tag];
      if (!child) continue;
      const arr = Array.isArray(child) ? child : [child];
      for (const c of arr) {
        const text = extractText(c);
        if (text.trim()) parts.push(text.trim());
      }
    }

    return parts.join("\n");
  }

  // Estrai num e heading da un nodo
  function getNumHeading(node: any): { num: string; heading: string } {
    const numNode = node?.["num"] || node?.["akn:num"];
    const headingNode = node?.["heading"] || node?.["akn:heading"];

    let num = "";
    if (numNode) {
      const arr = Array.isArray(numNode) ? numNode : [numNode];
      num = arr.map((n: any) => typeof n === "string" ? n : n?.["#text"] || "").join("").trim();
    }

    let heading = "";
    if (headingNode) {
      const arr = Array.isArray(headingNode) ? headingNode : [headingNode];
      heading = arr.map((h: any) => typeof h === "string" ? h : h?.["#text"] || "").join("").trim();
    }

    return { num: decodeHtmlEntities(num), heading: decodeHtmlEntities(heading) };
  }

  // Estrai articoli ricorsivamente, tracciando la gerarchia
  function walkNode(node: any, hierarchy: Record<string, string>) {
    if (!node || typeof node !== "object") return;

    const hierarchyLevels: Array<{ tag: string; key: string; label: string }> = [
      { tag: "book", key: "book", label: "Libro" },
      { tag: "akn:book", key: "book", label: "Libro" },
      { tag: "part", key: "part", label: "Parte" },
      { tag: "akn:part", key: "part", label: "Parte" },
      { tag: "title", key: "title", label: "Titolo" },
      { tag: "akn:title", key: "title", label: "Titolo" },
      { tag: "chapter", key: "chapter", label: "Capo" },
      { tag: "akn:chapter", key: "chapter", label: "Capo" },
      { tag: "section", key: "section", label: "Sezione" },
      { tag: "akn:section", key: "section", label: "Sezione" },
    ];

    // Processa nodi gerarchici
    for (const { tag, key, label } of hierarchyLevels) {
      const children = node[tag];
      if (!children) continue;
      const arr = Array.isArray(children) ? children : [children];
      for (const child of arr) {
        const { num, heading } = getNumHeading(child);
        const newHierarchy = { ...hierarchy };
        if (num || heading) {
          newHierarchy[key] = heading ? `${num} - ${heading}`.replace(/^\s*-\s*/, "") : num;
        }
        walkNode(child, newHierarchy);
      }
    }

    // Processa articoli
    const articleNodes = node["article"] || node["akn:article"];
    if (articleNodes) {
      const arr = Array.isArray(articleNodes) ? articleNodes : [articleNodes];
      for (const artNode of arr) {
        const { num, heading } = getNumHeading(artNode);

        // Estrai numero articolo dal tag <num> (es. "Art. 1.", "1", "Art. 1321")
        let artNum = num.replace(/^Art\.?\s*/i, "").replace(/\.\s*$/, "").trim();
        if (!artNum) {
          // Prova dall'attributo eId
          const eId = artNode?.["@_eId"] || "";
          const match = eId.match(/art[_-]?(\w+)/i);
          artNum = match ? match[1] : "";
        }
        if (!artNum) continue;

        // Testo completo dell'articolo
        const text = decodeHtmlEntities(extractText(artNode));
        if (!text || text.length < 5) continue;

        // Heading come titolo
        const artTitle = heading || null;

        articles.push({
          source_id: source.id,
          source_name: source.name,
          source_type: source.type,
          article_number: artNum,
          article_title: artTitle,
          article_text: text.slice(0, 10000),
          hierarchy: { ...hierarchy },
          url: `${source.baseUrl}~art${artNum}`,
          in_force: true,
        });
      }
    }
  }

  walkNode(body, {});

  console.log(`  Estratti ${articles.length} articoli da AKN XML`);
  return articles;
}

/**
 * Fetch articoli Normattiva: prima prova via AKN XML API, poi fallback HTML.
 */
async function fetchNormattivaArticles(source: CorpusSource): Promise<ArticleRow[]> {
  console.log(`\n  Fetching ${source.name} da Normattiva (Akoma Ntoso XML)...`);
  console.log(`  URN: ${source.urn}`);

  try {
    // Step 1: Estrai parametri dalla pagina HTML
    const params = await extractAknParams(source);
    if (!params) {
      console.warn(`  WARN: Parametri AKN non trovati, skip ${source.name}`);
      return [];
    }

    // Step 2: Scarica XML Akoma Ntoso
    const xml = await downloadAkomaNtoso(params);
    if (!xml) {
      console.warn(`  WARN: XML AKN non disponibile per ${source.name}`);
      return [];
    }

    // Step 3: Parsa XML
    const articles = parseAkomaNtoso(xml, source);
    if (articles.length === 0) {
      console.warn(`  WARN: Nessun articolo estratto dall'XML per ${source.name}`);
    }
    return articles;
  } catch (err) {
    console.error(`  ERRORE fetching ${source.name}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

// ─── Fetch EUR-Lex ───

async function fetchEurLexArticles(source: CorpusSource): Promise<ArticleRow[]> {
  console.log(`\n  Fetching ${source.name} da EUR-Lex...`);
  console.log(`  CELEX: ${source.celexId}`);

  const articles: ArticleRow[] = [];

  try {
    // EUR-Lex URL per il testo in italiano
    const url = `https://eur-lex.europa.eu/legal-content/IT/TXT/HTML/?uri=CELEX:${source.celexId}`;
    console.log(`  URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "controlla.me/1.0 (legal-corpus-loader)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "it-IT,it;q=0.9",
      },
    });

    if (!response.ok) {
      console.error(`  ERRORE: HTTP ${response.status} per ${source.name}`);
      return [];
    }

    const html = await response.text();
    return parseEurLexHtml(html, source);
  } catch (err) {
    console.error(`  ERRORE fetching ${source.name}:`, err instanceof Error ? err.message : err);
    return articles;
  }
}

function parseEurLexHtml(html: string, source: CorpusSource): ArticleRow[] {
  const articles: ArticleRow[] = [];

  // Rimuovi script/style/nav, converti a testo
  const textContent = decodeHtmlEntities(
    html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );

  // Split per articoli
  const artSplitRegex = /\n\s*Articolo\s+(\d+(?:\s*(?:bis|ter|quater))?)\s*\n/gi;
  const parts = textContent.split(artSplitRegex);

  let currentHierarchy: Record<string, string> = {};

  const chapterRegex = /(?:CAPO|Capo)\s+(I{1,3}V?X{0,3}|X{0,3}I{0,3}V?|[IVX]+)\s*[\-—]?\s*(.+)/i;
  const sectionRegex = /(?:SEZIONE|Sezione)\s+(\d+|I{1,3}V?X{0,3}|[IVX]+)\s*[\-—]?\s*(.+)/i;

  if (parts.length > 2) {
    for (let i = 1; i < parts.length - 1; i += 2) {
      const artNum = parts[i].trim();
      const artText = (parts[i + 1] || "").trim();

      if (!artNum || !artText || artText.length < 5) continue;

      // Aggiorna gerarchia
      const precedingText = i > 1 ? parts[i - 1] || "" : parts[0] || "";
      const chMatch = precedingText.match(chapterRegex);
      if (chMatch) {
        currentHierarchy = { chapter: `Capo ${chMatch[1]} - ${chMatch[2].trim()}` };
      }
      const secMatch = precedingText.match(sectionRegex);
      if (secMatch) {
        currentHierarchy.section = `Sezione ${secMatch[1]} - ${secMatch[2].trim()}`;
      }

      // Titolo articolo (prima riga se corta)
      const firstLine = artText.split("\n")[0]?.trim();
      const title = firstLine && firstLine.length < 200 && !firstLine.match(/^\d/) ? firstLine : null;

      articles.push({
        source_id: source.id,
        source_name: source.name,
        source_type: source.type,
        article_number: artNum,
        article_title: title,
        article_text: artText.slice(0, 10000),
        hierarchy: { ...currentHierarchy },
        url: `${source.baseUrl}#${source.celexId}_art${artNum}`,
        in_force: true,
      });
    }
  }

  console.log(`  Estratti ${articles.length} articoli da ${source.name}`);
  return articles;
}

// ─── Delta Check ───

async function getExistingCount(sourceId: string): Promise<number> {
  const { count, error } = await supabase
    .from("legal_articles")
    .select("*", { count: "exact", head: true })
    .eq("source_id", sourceId);

  if (error) {
    console.warn(`  WARN: Errore conteggio per ${sourceId}:`, error.message);
    return 0;
  }
  return count || 0;
}

async function shouldSkipSource(source: CorpusSource): Promise<boolean> {
  const existing = await getExistingCount(source.id);
  const threshold = Math.floor(source.estimatedArticles * DELTA_THRESHOLD);

  if (existing >= threshold) {
    console.log(`  SKIP ${source.name}: ${existing} articoli gia presenti (soglia: ${threshold})`);
    return true;
  }

  if (existing > 0) {
    console.log(`  DELTA ${source.name}: ${existing} presenti, ne mancano ~${source.estimatedArticles - existing}`);
  }

  return false;
}

// ─── Upsert in batch ───

async function upsertArticles(articles: ArticleRow[]): Promise<number> {
  if (articles.length === 0) return 0;

  let inserted = 0;

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from("legal_articles")
      .upsert(batch, {
        onConflict: "source_id,article_number",
        ignoreDuplicates: false, // aggiorna se esiste
      });

    if (error) {
      console.error(`  ERRORE upsert batch ${i}-${i + batch.length}:`, error.message);
      // Prova uno alla volta
      for (const article of batch) {
        const { error: singleErr } = await supabase
          .from("legal_articles")
          .upsert(article, { onConflict: "source_id,article_number" });
        if (singleErr) {
          console.error(`  ERRORE articolo ${article.source_id} art. ${article.article_number}:`, singleErr.message);
        } else {
          inserted++;
        }
      }
    } else {
      inserted += batch.length;
    }

    // Progress
    const pct = Math.round(((i + batch.length) / articles.length) * 100);
    process.stdout.write(`\r  Caricati ${Math.min(i + batch.length, articles.length)}/${articles.length} (${pct}%)`);
  }

  process.stdout.write("\n");
  return inserted;
}

// ─── Seed per tipo ───

async function seedSource(source: CorpusSource, force: boolean): Promise<number> {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Fonte: ${source.name} (${source.id})`);
  console.log(`Tipo: ${source.type} | Articoli stimati: ~${source.estimatedArticles}`);

  // Delta check
  if (!force && await shouldSkipSource(source)) {
    return 0;
  }

  // Se force, cancella prima
  if (force) {
    console.log(`  FORCE: Cancello articoli esistenti per ${source.id}...`);
    const { error } = await supabase
      .from("legal_articles")
      .delete()
      .eq("source_id", source.id);
    if (error) console.error(`  ERRORE cancellazione:`, error.message);
  }

  // Fetch articoli
  let articles: ArticleRow[];
  if (source.type === "normattiva") {
    articles = await fetchNormattivaArticles(source);
  } else {
    articles = await fetchEurLexArticles(source);
  }

  if (articles.length === 0) {
    console.log(`  ATTENZIONE: Nessun articolo estratto per ${source.name}`);
    return 0;
  }

  // Upsert
  const inserted = await upsertArticles(articles);
  console.log(`  Completato: ${inserted} articoli caricati per ${source.name}`);

  // Pausa tra fonti per evitare rate limiting dei siti
  await new Promise((r) => setTimeout(r, 2000));

  return inserted;
}

async function seedNormattiva(force: boolean): Promise<number> {
  console.log("\n" + "=".repeat(60));
  console.log("FASE 1: Fonti italiane (Normattiva)");
  console.log("=".repeat(60));

  let total = 0;
  for (const source of NORMATTIVA_SOURCES) {
    total += await seedSource(source, force);
  }
  return total;
}

async function seedEurLex(force: boolean): Promise<number> {
  console.log("\n" + "=".repeat(60));
  console.log("FASE 2: Fonti EU (EUR-Lex)");
  console.log("=".repeat(60));

  let total = 0;
  for (const source of EURLEX_SOURCES) {
    total += await seedSource(source, force);
  }
  return total;
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const filteredArgs = args.filter((a) => a !== "--force");

  const command = filteredArgs[0] || "all";
  const specificSource = filteredArgs.includes("--source") ? filteredArgs[filteredArgs.indexOf("--source") + 1] : null;

  console.log("\n" + "=".repeat(60));
  console.log("SEED CORPUS GIURIDICO — controlla.me");
  console.log("=".repeat(60));
  console.log(`Comando: ${command}${force ? " (FORCE)" : ""}`);
  console.log(`Data: ${new Date().toISOString()}`);

  if (specificSource) {
    const source = ALL_SOURCES.find((s) => s.id === specificSource);
    if (!source) {
      console.error(`Fonte non trovata: ${specificSource}`);
      console.log("Fonti disponibili:", ALL_SOURCES.map((s) => s.id).join(", "));
      process.exit(1);
    }
    const count = await seedSource(source, force);
    console.log(`\nTotale: ${count} articoli caricati`);
  } else {
    let totalNormattiva = 0;
    let totalEurLex = 0;

    if (command === "all" || command === "normattiva") {
      totalNormattiva = await seedNormattiva(force);
    }

    if (command === "all" || command === "eurlex") {
      totalEurLex = await seedEurLex(force);
    }

    console.log("\n" + "=".repeat(60));
    console.log("RIEPILOGO");
    console.log("=".repeat(60));
    if (command === "all" || command === "normattiva") {
      console.log(`Normattiva: ${totalNormattiva} articoli`);
    }
    if (command === "all" || command === "eurlex") {
      console.log(`EUR-Lex:    ${totalEurLex} articoli`);
    }
    console.log(`Totale:     ${totalNormattiva + totalEurLex} articoli caricati`);
  }

  // Statistiche finali dal DB
  console.log("\nStatistiche DB:");
  for (const source of ALL_SOURCES) {
    const count = await getExistingCount(source.id);
    if (count > 0) {
      console.log(`  ${source.name.padEnd(50)} ${count} articoli`);
    }
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Errore fatale:", err);
  process.exit(1);
});
