#!/usr/bin/env npx tsx
/**
 * loader.ts — Orchestratore generico per il caricamento di fonti normative.
 *
 * Tool generico riusabile da ogni agente per importare da fonti note,
 * utilizzando API dove censite o HTML parsing come backup.
 *
 * Il "corpus legislativo" è un profilo attivabile, domani si potranno
 * aggiungere: giurisprudenza, contratti tipo, circolari ministeriali, ecc.
 *
 * Uso:
 *   npx tsx scripts/loader.ts                                     # Profilo default (corpus-legislativo)
 *   npx tsx scripts/loader.ts --profile corpus-legislativo         # Profilo esplicito
 *   npx tsx scripts/loader.ts --source normattiva                  # Solo fonti Normattiva
 *   npx tsx scripts/loader.ts --source eurlex                      # Solo EUR-Lex
 *   npx tsx scripts/loader.ts --source huggingface                 # Solo HuggingFace
 *   npx tsx scripts/loader.ts --force                              # Forza ricaricamento (no delta)
 *   npx tsx scripts/loader.ts --force --source eurlex              # Forza solo EUR-Lex
 *   npx tsx scripts/loader.ts --list-profiles                      # Elenca profili disponibili
 *
 * npm:
 *   npm run loader                    # Profilo default
 *   npm run loader:corpus             # Profilo corpus-legislativo
 *   npm run loader -- --source eurlex --force
 */

import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import type { CorpusSource, SourceType } from "./corpus-sources";
import { getSourcesSummary } from "./corpus-sources";
import { fetchHuggingFace } from "./fetchers/huggingface";
import { fetchNormattiva } from "./fetchers/normattiva-api";
import { fetchEurLex } from "./fetchers/eurlex-cellar";
import { computeDelta, forceDeleteSource } from "./lib/delta";
import { generateEmbeddingsAndUpload } from "./lib/embeddings-batch";
import type { LegalArticle, SourceResult, LoaderProfile } from "./lib/types";

// ─── Profili disponibili ───

async function loadProfile(profileId: string): Promise<LoaderProfile> {
  try {
    const mod = await import(`./loader-profiles/${profileId}`);
    return mod.default;
  } catch {
    console.error(`\nProfilo "${profileId}" non trovato.`);
    console.error(`Profili disponibili in: scripts/loader-profiles/\n`);
    await listProfiles();
    process.exit(1);
  }
}

async function listProfiles(): Promise<void> {
  const fs = await import("fs");
  const profilesDir = path.resolve(__dirname, "loader-profiles");

  if (!fs.existsSync(profilesDir)) {
    console.log("  Nessun profilo trovato.\n");
    return;
  }

  const files = fs.readdirSync(profilesDir).filter((f: string) => f.endsWith(".ts"));
  console.log("\n  Profili disponibili:");
  console.log("  " + "─".repeat(50));

  for (const file of files) {
    try {
      const mod = await import(`./loader-profiles/${file.replace(".ts", "")}`);
      const profile: LoaderProfile = mod.default;
      console.log(`  ${profile.id.padEnd(25)} ${profile.description}`);
    } catch {
      console.log(`  ${file.replace(".ts", "").padEnd(25)} (errore caricamento)`);
    }
  }
  console.log("");
}

// ─── CLI Args ───

interface CliArgs {
  profile: string;
  source: SourceType | "all";
  force: boolean;
  listProfiles: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let profile = "corpus-legislativo";
  let source: SourceType | "all" = "all";
  let force = false;
  let doListProfiles = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--profile" && args[i + 1]) {
      profile = args[i + 1];
      i++;
    } else if (args[i] === "--source" && args[i + 1]) {
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
    } else if (args[i] === "--list-profiles") {
      doListProfiles = true;
    }
  }

  return { profile, source, force, listProfiles: doListProfiles };
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

  // Fetch — usa API dove censite, HTML come backup (gestito internamente dai fetcher)
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

  // Tag articoli con source ID per il DB
  for (const a of articles) a.sourceId = source.id;

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
  const cliArgs = parseArgs();

  // --list-profiles
  if (cliArgs.listProfiles) {
    await listProfiles();
    return;
  }

  // Carica profilo
  const profile = await loadProfile(cliArgs.profile);

  console.log("\n");
  console.log("==============================================================");
  console.log(`  controlla.me — Loader [${profile.name}]`);
  console.log(`  ${profile.description}`);
  console.log("  API-first (Normattiva OpenData, CELLAR REST) + HTML fallback");
  console.log("  Delta loading + Voyage AI embeddings + Supabase");
  console.log("==============================================================\n");

  console.log(getSourcesSummary());
  console.log(`\nProfilo: ${profile.id} | Fonte: ${cliArgs.source === "all" ? "TUTTE" : cliArgs.source} | Force: ${cliArgs.force ? "SI" : "no (delta)"}\n`);

  // Check env
  const requiredEnv: Array<[string, string]> = [
    ["VOYAGE_API_KEY", "Voyage AI"],
    ["NEXT_PUBLIC_SUPABASE_URL", "Supabase URL"],
    ["SUPABASE_SERVICE_ROLE_KEY", "Supabase Key"],
  ];

  for (const [key, label] of requiredEnv) {
    const ok = !!process.env[key];
    console.log(`  ${ok ? "[OK]" : "[!!]"} ${label}: ${ok ? "configurato" : "MANCANTE!"}`);
    if (!ok) { console.error("\nConfigura le variabili in .env.local\n"); process.exit(1); }
  }

  const supabase = await createSupabaseAdmin();

  // Seleziona fonti dal profilo, filtra per --source
  let sources: CorpusSource[] = profile.getSources();

  if (cliArgs.source !== "all") {
    sources = sources.filter((s) => s.type === cliArgs.source);
  }

  console.log(`\nFonti: ${sources.length}\n`);

  // Processa
  const results: SourceResult[] = [];
  for (const src of sources) {
    results.push(await processSource(supabase, src, cliArgs.force));
  }

  // Report
  console.log("\n\n==================================================================");
  console.log(`  REPORT FINALE — ${profile.name}`);
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
