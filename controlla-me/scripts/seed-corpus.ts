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

import { createClient } from "@supabase/supabase-js";
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

// ─── Fetch Normattiva ───

async function fetchNormattivaArticles(source: CorpusSource): Promise<ArticleRow[]> {
  console.log(`\n  Fetching ${source.name} da Normattiva...`);
  console.log(`  URN: ${source.urn}`);

  // Normattiva espone gli atti in formato HTML.
  // Strategia: fetch della pagina completa e parsing degli articoli.
  // Per ora usiamo un approccio pragmatico con l'API multi-vigente.
  const articles: ArticleRow[] = [];

  try {
    // Normattiva URL per il testo vigente completo
    const url = `https://www.normattiva.it/uri-res/N2Ls?${source.urn}~art0!vig=`;
    console.log(`  URL: ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "controlla.me/1.0 (legal-corpus-loader)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "it-IT,it;q=0.9",
      },
    });

    if (!response.ok) {
      console.warn(`  WARN: HTTP ${response.status} per ${source.name}. Provo pagina principale...`);
      // Fallback: prova l'URL base
      const fallbackResp = await fetch(source.baseUrl, {
        headers: {
          "User-Agent": "controlla.me/1.0 (legal-corpus-loader)",
          "Accept": "text/html,application/xhtml+xml",
        },
      });
      if (!fallbackResp.ok) {
        console.error(`  ERRORE: Impossibile raggiungere ${source.name} (HTTP ${fallbackResp.status})`);
        return [];
      }
      const html = await fallbackResp.text();
      return parseNormattivaHtml(html, source);
    }

    const html = await response.text();
    return parseNormattivaHtml(html, source);
  } catch (err) {
    console.error(`  ERRORE fetching ${source.name}:`, err instanceof Error ? err.message : err);
    return articles;
  }
}

function parseNormattivaHtml(html: string, source: CorpusSource): ArticleRow[] {
  const articles: ArticleRow[] = [];

  // Pattern per estrarre articoli da HTML Normattiva
  // Gli articoli sono tipicamente in strutture come:
  // <div class="art-body"> o <div id="art123">
  // con il numero dell'articolo e il testo

  // Pattern 1: Cerca blocchi articolo con id "art" + numero
  const artBlockRegex = /<(?:div|section)[^>]*(?:id|class)=[^>]*art[^>]*>([\s\S]*?)(?=<(?:div|section)[^>]*(?:id|class)=[^>]*art[^>]*>|$)/gi;

  // Pattern 2: Cerca "Art. N" nel testo
  const artHeaderRegex = /Art(?:icolo)?\.?\s*(\d+(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)/gi;

  // Prima proviamo a estrarre articoli individuali dal testo puro
  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Split per articoli
  const artSplitRegex = /\n\s*Art(?:icolo)?\.?\s*(\d+(?:\s*(?:bis|ter|quater|quinquies|sexies|septies|octies|novies|decies))?)\s*[\.\-\n]/gi;
  const parts = textContent.split(artSplitRegex);

  // Gerarchia corrente (tracciata durante il parsing)
  let currentHierarchy: Record<string, string> = {};
  const hierarchyPatterns: Record<string, RegExp> = {
    book: /(?:LIBRO|Libro)\s+(I{1,3}V?|V?I{0,3}|PRIMO|SECONDO|TERZO|QUARTO|QUINTO|SESTO)\s*[\-—]\s*(.+)/i,
    part: /(?:PARTE|Parte)\s+(I{1,3}V?|V?I{0,3}|PRIMA|SECONDA|TERZA)\s*[\-—]\s*(.+)/i,
    title: /(?:TITOLO|Titolo)\s+(I{1,3}V?X{0,3}|X{0,3}I{0,3}V?|[IVX]+)\s*[\-—]?\s*(.+)/i,
    chapter: /(?:CAPO|Capo)\s+(I{1,3}V?X{0,3}|X{0,3}I{0,3}V?|[IVX]+)\s*[\-—]?\s*(.+)/i,
    section: /(?:SEZIONE|Sezione)\s+(I{1,3}V?X{0,3}|X{0,3}I{0,3}V?|[IVX]+)\s*[\-—]?\s*(.+)/i,
  };

  if (parts.length > 2) {
    // parts[0] = preambolo, parts[1] = num art 1, parts[2] = testo art 1, ecc.
    for (let i = 1; i < parts.length - 1; i += 2) {
      const artNum = parts[i].trim();
      const artText = (parts[i + 1] || "").trim();

      if (!artNum || !artText || artText.length < 10) continue;

      // Aggiorna gerarchia dal testo che precede
      const precedingText = i > 1 ? parts[i - 1] || "" : parts[0] || "";
      for (const [key, regex] of Object.entries(hierarchyPatterns)) {
        const match = precedingText.match(regex);
        if (match) {
          currentHierarchy[key] = `${key === "book" ? "Libro" : key === "part" ? "Parte" : key === "title" ? "Titolo" : key === "chapter" ? "Capo" : "Sezione"} ${match[1]} - ${match[2].trim()}`;
        }
      }

      // Estrai titolo articolo (prima riga non vuota dopo il numero)
      const firstLine = artText.split("\n")[0]?.trim();
      const title = firstLine && firstLine.length < 200 && !firstLine.match(/^\d/) ? firstLine : null;

      articles.push({
        source_id: source.id,
        source_name: source.name,
        source_type: source.type,
        article_number: artNum,
        article_title: title,
        article_text: artText.slice(0, 10000), // Max 10k chars per articolo
        hierarchy: { ...currentHierarchy },
        url: `${source.baseUrl}~art${artNum}`,
        in_force: true,
      });
    }
  }

  console.log(`  Estratti ${articles.length} articoli da ${source.name}`);
  return articles;
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

  // Rimuovi script/style, converti a testo
  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

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
