#!/usr/bin/env npx tsx
/**
 * seed-corpus.ts — Orchestratore caricamento corpus legislativo (14 fonti).
 *
 * Uso:
 *   npx tsx scripts/seed-corpus.ts                     # Tutte le fonti (delta)
 *   npx tsx scripts/seed-corpus.ts --source normattiva # Solo Normattiva
 *   npx tsx scripts/seed-corpus.ts --source eurlex     # Solo EUR-Lex
 *   npx tsx scripts/seed-corpus.ts --source huggingface # Solo Codice Civile HF
 *   npx tsx scripts/seed-corpus.ts --force             # Forza ricaricamento
 *   npx tsx scripts/seed-corpus.ts --force --source eurlex  # Forza solo EUR-Lex
 *
 * npm:
 *   npm run seed:corpus
 *   npm run seed:corpus -- --source eurlex --force
 */

import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import {
  NORMATTIVA_SOURCES,
  EURLEX_SOURCES,
  HUGGINGFACE_SOURCES,
  getSourcesSummary,
  type CorpusSource,
  type SourceType,
} from "./corpus-sources";
import { fetchHuggingFace } from "./fetchers/huggingface";
import { fetchNormattiva } from "./fetchers/normattiva";
import { fetchEurLex } from "./fetchers/eurlex";
import { computeDelta, forceDeleteSource } from "./lib/delta";
import { generateEmbeddingsAndUpload } from "./lib/embeddings-batch";
import type { LegalArticle, SourceResult } from "./lib/types";

// ─── CLI Args ───

function parseArgs(): { source: SourceType | "all"; force: boolean } {
  const args = process.argv.slice(2);
  let source: SourceType | "all" = "all";
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source" && args[i + 1]) {
      const val = args[i + 1].toLowerCase();
      if (val === "normattiva" || val === "eurlex" || val === "huggingface") {
        source = val;
      } else {
        console.error(`Fonte sconosciuta: "${val}". Valori: normattiva, eurlex, huggingface`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === "--force") {
      force = true;
    }
  }

  return { source, force };
}

// ─── Supabase Admin ───

async function createSupabaseAdmin() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ─── Processo singola fonte ───

async function processSource(
  supabase: Awaited<ReturnType<typeof createSupabaseAdmin>>,
  source: CorpusSource,
  force: boolean
): Promise<SourceResult> {
  const start = Date.now();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${source.name} (${source.type}) | ~${source.expectedArticles} art.`);
  console.log(`${"=".repeat(60)}`);

  // Force delete
  if (force) await forceDeleteSource(supabase, source.lawSource);

  // Fetch
  let articles: LegalArticle[] = [];
  try {
    if (source.type === "huggingface") articles = await fetchHuggingFace(source as any);
    else if (source.type === "normattiva") articles = await fetchNormattiva(source as any);
    else if (source.type === "eurlex") articles = await fetchEurLex(source as any);
  } catch (err) {
    console.error(`  [ERR] Fetch fallito: ${err}`);
    return { sourceId: source.id, sourceName: source.name, fetched: 0, inserted: 0, skipped: 0, errors: 1, elapsed: (Date.now() - start) / 1000 };
  }

  if (articles.length === 0) {
    console.warn(`  [WARN] Nessun articolo per ${source.name}`);
    return { sourceId: source.id, sourceName: source.name, fetched: 0, inserted: 0, skipped: 0, errors: 0, elapsed: (Date.now() - start) / 1000 };
  }

  // Delta loading
  let toUpload = articles;
  let skipped = 0;
  if (!force) {
    const delta = await computeDelta(supabase, articles, source.lawSource);
    toUpload = delta.toInsert;
    skipped = delta.skipped;
  }

  if (toUpload.length === 0) {
    console.log(`  [OK] Tutti ${articles.length} articoli gia aggiornati`);
    return { sourceId: source.id, sourceName: source.name, fetched: articles.length, inserted: 0, skipped, errors: 0, elapsed: (Date.now() - start) / 1000 };
  }

  // Embeddings + Upload
  console.log(`  [UPLOAD] ${toUpload.length} da caricare (${skipped} invariati)...`);
  const { inserted, errors } = await generateEmbeddingsAndUpload(supabase, toUpload);

  const elapsed = (Date.now() - start) / 1000;
  console.log(`  [DONE] ${inserted} caricati, ${skipped} skip, ${errors} err (${elapsed.toFixed(1)}s)`);

  return { sourceId: source.id, sourceName: source.name, fetched: articles.length, inserted, skipped, errors, elapsed };
}

// ─── Main ───

async function main() {
  const { source, force } = parseArgs();

  console.log("\n");
  console.log("==============================================================");
  console.log("  controlla.me — Seed Corpus Legislativo (14 fonti)");
  console.log("  8 IT (Normattiva/HuggingFace) + 6 EU (EUR-Lex)");
  console.log("  Delta loading + Voyage AI embeddings + Supabase");
  console.log("==============================================================\n");

  console.log(getSourcesSummary());
  console.log(`\nModalita: ${source === "all" ? "TUTTE" : source} | Force: ${force ? "SI" : "no (delta)"}\n`);

  // Check env
  for (const [key, label] of [
    ["VOYAGE_API_KEY", "Voyage AI"],
    ["NEXT_PUBLIC_SUPABASE_URL", "Supabase URL"],
    ["SUPABASE_SERVICE_ROLE_KEY", "Supabase Key"],
  ] as const) {
    const ok = !!process.env[key];
    console.log(`  ${ok ? "[OK]" : "[!!]"} ${label}: ${ok ? "configurato" : "MANCANTE!"}`);
    if (!ok) { console.error("\nConfigura le variabili in .env.local\n"); process.exit(1); }
  }

  const supabase = await createSupabaseAdmin();

  // Seleziona fonti
  let sources: CorpusSource[] = [];
  if (source === "all") sources = [...HUGGINGFACE_SOURCES, ...NORMATTIVA_SOURCES, ...EURLEX_SOURCES];
  else if (source === "huggingface") sources = [...HUGGINGFACE_SOURCES];
  else if (source === "normattiva") sources = [...NORMATTIVA_SOURCES];
  else if (source === "eurlex") sources = [...EURLEX_SOURCES];

  console.log(`\nFonti: ${sources.length}\n`);

  // Processa
  const results: SourceResult[] = [];
  for (const src of sources) {
    results.push(await processSource(supabase, src, force));
  }

  // Report
  console.log("\n\n==================================================================");
  console.log("  REPORT FINALE");
  console.log("==================================================================");

  let tF = 0, tI = 0, tS = 0, tE = 0;
  for (const r of results) {
    const st = r.errors > 0 ? "[!!]" : r.inserted > 0 ? "[OK]" : "[--]";
    console.log(`  ${st} ${r.sourceName.padEnd(40)} ${String(r.fetched).padStart(5)} | ${String(r.inserted).padStart(5)} up | ${String(r.skipped).padStart(5)} skip | ${String(r.errors).padStart(3)} err`);
    tF += r.fetched; tI += r.inserted; tS += r.skipped; tE += r.errors;
  }

  console.log("------------------------------------------------------------------");
  console.log(`  TOTALE${" ".repeat(37)} ${String(tF).padStart(5)} | ${String(tI).padStart(5)} up | ${String(tS).padStart(5)} skip | ${String(tE).padStart(3)} err`);
  console.log("==================================================================\n");

  if (tE > 0) console.log(`Attenzione: ${tE} errori.\n`);
}

main().catch((err) => { console.error("\nErrore fatale:", err); process.exit(1); });
