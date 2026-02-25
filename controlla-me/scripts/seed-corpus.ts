#!/usr/bin/env npx tsx
/**
 * seed-corpus.ts — Load corpus for a given domain via parametric config.
 *
 * Usage:
 *   npx tsx scripts/seed-corpus.ts --domain=legal
 *   npx tsx scripts/seed-corpus.ts --domain=fiscal
 *   npx tsx scripts/seed-corpus.ts                    # defaults to legal
 *
 * Requirements:
 *   - VOYAGE_API_KEY in .env.local
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   - Migration 003_vector_db.sql + 004_domain_support.sql executed
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load env from .env.local (must be before any imports that use env)
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// ─── Proxy setup (for containerized environments) ───
import { ProxyAgent, setGlobalDispatcher } from "undici";

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxyUrl) {
  console.log(`  [PROXY] Using proxy: ${proxyUrl.replace(/jwt_[^@]+/, "jwt_***")}`);
  const proxyAgent = new ProxyAgent(proxyUrl);
  setGlobalDispatcher(proxyAgent);
}

import { loadCorpusFromConfig } from "../lib/corpus-loader";
import type { CorpusConfig } from "../lib/types/corpus-config";

// ─── Parse args ───

function parseArgs(): { domain: string } {
  const args = process.argv.slice(2);
  let domain = "legal";

  for (const arg of args) {
    const match = arg.match(/^--domain=(.+)$/);
    if (match) domain = match[1];
  }

  return { domain };
}

// ─── Main ───

async function main() {
  const { domain } = parseArgs();

  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  controlla.me — Seed Corpus                                ║");
  console.log(`║  Domain: ${domain.padEnd(51)}║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Check env
  const envChecks = [
    { key: "VOYAGE_API_KEY", label: "Voyage AI" },
    { key: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase URL" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase Service Key" },
  ];

  let envOk = true;
  for (const check of envChecks) {
    const exists = !!process.env[check.key];
    console.log(`  ${exists ? "✓" : "✗"} ${check.label}: ${exists ? "configurato" : "MANCANTE!"}`);
    if (!exists) envOk = false;
  }

  if (!envOk) {
    console.error("\n❌ Configura le variabili mancanti in controlla-me/.env.local e riprova.\n");
    process.exit(1);
  }

  // Load config
  const configPath = path.resolve(__dirname, `../corpus-configs/${domain}.json`);
  if (!fs.existsSync(configPath)) {
    console.error(`\n❌ Config non trovata: ${configPath}`);
    console.error(`   Crea il file corpus-configs/${domain}.json e riprova.\n`);
    process.exit(1);
  }

  const config: CorpusConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  console.log(`\n  Config: ${config.name}`);
  console.log(`  Embedding model: ${config.embeddingModel}`);
  console.log(`  Sources: ${config.dataSources.map((s) => s.name).join(", ")}\n`);

  // Run the loader
  const result = await loadCorpusFromConfig(config);

  // Summary
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  RISULTATO FINALE                                ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║  Domain:             ${result.domain}`);
  console.log(`║  Articoli processati: ${String(result.totalProcessed).padStart(5)}`);
  console.log(`║  Inseriti/aggiornati: ${String(result.inserted).padStart(5)}`);
  console.log(`║  Errori:             ${String(result.errors).padStart(5)}`);
  for (const src of result.sources) {
    console.log(`║  - ${src.name}: ${src.articlesProcessed} articoli`);
  }
  console.log("╚══════════════════════════════════════════════════╝\n");

  console.log("✅ Seed corpus completato!\n");
}

main().catch((err) => {
  console.error("\n❌ Errore fatale:", err);
  process.exit(1);
});
