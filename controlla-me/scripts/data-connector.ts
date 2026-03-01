#!/usr/bin/env npx tsx
/**
 * Data Connector CLI — Pipeline CONNECT → MODEL → LOAD.
 *
 * Comandi pipeline:
 *   npx tsx scripts/data-connector.ts connect <source_id>
 *   npx tsx scripts/data-connector.ts model <source_id>
 *   npx tsx scripts/data-connector.ts load <source_id> [--dry] [--limit N] [--skip-embeddings]
 *   npx tsx scripts/data-connector.ts pipeline <source_id> [--dry] [--limit N]
 *
 * Comandi delta:
 *   npx tsx scripts/data-connector.ts update <source_id>
 *   npx tsx scripts/data-connector.ts update-all
 *
 * Comandi info:
 *   npx tsx scripts/data-connector.ts status
 *   npx tsx scripts/data-connector.ts history <source_id>
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Carica env dal .env.local
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import {
  runPipeline,
  connectSource,
  modelSource,
  loadSource,
  updateSource,
  getAllSources,
  getLastSuccessfulSync,
  getSyncHistory,
} from "@/lib/staff/data-connector";

// ─── Verticali: import per auto-registrazione ───
// Ogni verticale registra le proprie fonti all'import (side-effect).
// Per aggiungere un nuovo verticale: creare il file e importarlo qui.
import "@/scripts/hr-sources";
// import "@/scripts/real-estate-sources";  // futuro
// import "@/scripts/consumer-sources";      // futuro

// ─── Helpers ───

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function parseArgs(args: string[]): {
  command: string;
  sourceId?: string;
  dryRun: boolean;
  limit?: number;
  skipEmbeddings: boolean;
} {
  const command = args[0] ?? "status";
  const sourceId = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
  const dryRun = args.includes("--dry");
  const skipEmbeddings = args.includes("--skip-embeddings");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : undefined;

  return { command, sourceId, dryRun, limit, skipEmbeddings };
}

// ─── Comandi ───

async function cmdStatus() {
  const sources = getAllSources();
  const byLifecycle: Record<string, typeof sources> = {};

  for (const s of sources) {
    const lc = s.lifecycle;
    if (!byLifecycle[lc]) byLifecycle[lc] = [];
    byLifecycle[lc].push(s);
  }

  console.log(`\n╔═══════════════════════════════════════════════╗`);
  console.log(`║          DATA CONNECTOR — STATUS              ║`);
  console.log(`╚═══════════════════════════════════════════════╝\n`);
  console.log(`Fonti totali: ${sources.length}\n`);

  const lifecycleOrder = ["delta-active", "loaded", "schema-ready", "api-tested", "planned"];
  for (const lc of lifecycleOrder) {
    const group = byLifecycle[lc];
    if (!group || group.length === 0) continue;

    const icon = {
      "delta-active": "●",
      loaded: "◉",
      "schema-ready": "◎",
      "api-tested": "○",
      planned: "◌",
    }[lc] ?? "?";

    console.log(`${icon} ${lc.toUpperCase()} (${group.length})`);
    for (const s of group) {
      const lastSync = await getLastSuccessfulSync(s.id);
      const syncInfo = lastSync
        ? ` | ultimo sync: ${lastSync.completedAt?.slice(0, 10)}`
        : "";
      console.log(
        `   ${s.shortName.padEnd(20)} ${s.id.padEnd(30)} ~${s.estimatedItems} art.${syncInfo}`
      );
    }
    console.log();
  }
}

async function cmdConnect(sourceId: string) {
  log(`CONNECT ${sourceId}`);
  const result = await connectSource(sourceId, log);
  console.log(`\nRisultato: ${result.ok ? "OK" : "FALLITO"}`);
  console.log(`  Items stimati: ${result.census.estimatedItems}`);
  console.log(`  Formati: ${result.census.availableFormats.join(", ")}`);
  console.log(`  Campi: ${result.census.sampleFields.join(", ")}`);
  if (result.census.sampleData && result.census.sampleData.length > 0) {
    console.log(`  Sample (primo record):`);
    console.log(JSON.stringify(result.census.sampleData[0], null, 2));
  }
}

async function cmdModel(sourceId: string) {
  log(`MODEL ${sourceId}`);
  const result = await modelSource(sourceId, log);
  console.log(`\nRisultato: ${result.ready ? "PRONTO" : "NON PRONTO"}`);
  console.log(`  ${result.message}`);
  if (!result.ready && result.spec.migrationSQL) {
    console.log(`\nMigration SQL suggerita:`);
    console.log(result.spec.migrationSQL);
  }
}

async function cmdLoad(
  sourceId: string,
  dryRun: boolean,
  limit?: number,
  skipEmbeddings?: boolean
) {
  log(`LOAD ${sourceId}${dryRun ? " (DRY RUN)" : ""}${limit ? ` (limit: ${limit})` : ""}`);
  const result = await loadSource(sourceId, { dryRun, limit, skipEmbeddings }, log);
  console.log(`\nRisultato:`);
  console.log(`  Inseriti: ${result.inserted}`);
  console.log(`  Aggiornati: ${result.updated}`);
  console.log(`  Saltati: ${result.skipped}`);
  console.log(`  Errori: ${result.errors}`);
  if (result.errorDetails.length > 0) {
    console.log(`  Dettagli errori:`);
    for (const e of result.errorDetails.slice(0, 10)) {
      console.log(`    - ${e.item}: ${e.error}`);
    }
  }
}

async function cmdPipeline(
  sourceId: string,
  dryRun: boolean,
  limit?: number
) {
  log(`PIPELINE COMPLETA | ${sourceId}${dryRun ? " (DRY RUN)" : ""}`);
  const result = await runPipeline(
    sourceId,
    { stopAfter: "load", dryRun, limit },
    log
  );

  console.log(`\n╔═══════════════════════════════════════════════╗`);
  console.log(`║          PIPELINE RESULT                      ║`);
  console.log(`╚═══════════════════════════════════════════════╝`);
  console.log(`  Fonte: ${sourceId}`);
  console.log(`  Fermato a: ${result.stoppedAt}`);
  console.log(`  Durata: ${(result.durationMs / 1000).toFixed(1)}s`);

  if (result.stoppedReason) {
    console.log(`  Motivo: ${result.stoppedReason}`);
  }
  if (result.connectResult) {
    console.log(`  CONNECT: ${result.connectResult.ok ? "OK" : "FALLITO"} | ${result.connectResult.census.estimatedItems} items`);
  }
  if (result.modelResult) {
    console.log(`  MODEL: ${result.modelResult.ready ? "PRONTO" : "NON PRONTO"} | ${result.modelResult.message}`);
  }
  if (result.loadResult) {
    console.log(
      `  LOAD: ${result.loadResult.inserted} inseriti | ${result.loadResult.errors} errori`
    );
  }
}

async function cmdUpdate(sourceId: string) {
  log(`DELTA UPDATE | ${sourceId}`);
  const result = await updateSource(sourceId, log);
  console.log(`\nRisultato delta:`);
  console.log(`  Inseriti: ${result.inserted}`);
  console.log(`  Aggiornati: ${result.updated}`);
  console.log(`  Errori: ${result.errors}`);
}

async function cmdUpdateAll() {
  const sources = getAllSources().filter(
    (s) => s.lifecycle === "loaded" || s.lifecycle === "delta-active"
  );

  if (sources.length === 0) {
    console.log("Nessuna fonte in stato loaded o delta-active.");
    return;
  }

  console.log(`Delta update per ${sources.length} fonti:\n`);

  for (const source of sources) {
    try {
      log(`DELTA | ${source.id}`);
      const result = await updateSource(source.id, log);
      console.log(
        `  ${source.shortName}: ${result.inserted} inseriti | ${result.errors} errori`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ${source.shortName}: ERRORE — ${msg}`);
    }
  }
}

async function cmdHistory(sourceId: string) {
  const history = await getSyncHistory(sourceId, 20);

  if (history.length === 0) {
    console.log(`Nessuno storico sync per "${sourceId}".`);
    return;
  }

  console.log(`\nStorico sync per "${sourceId}" (ultimi ${history.length}):\n`);
  console.log(
    "  Data                  Tipo       Fase      Status     Items   Errori"
  );
  console.log("  " + "─".repeat(72));

  for (const entry of history) {
    const date = entry.startedAt.slice(0, 19).replace("T", " ");
    const type = (entry.syncType ?? "").padEnd(10);
    const phase = (entry.phase ?? "—").padEnd(9);
    const status = entry.status.padEnd(10);
    const items = String(entry.itemsInserted).padStart(5);
    const errors = String(entry.errors).padStart(6);
    console.log(`  ${date}  ${type} ${phase} ${status} ${items} ${errors}`);
  }
}

function printUsage() {
  console.log(`
Data Connector CLI — Pipeline CONNECT → MODEL → LOAD

Comandi pipeline:
  status                              Stato tutte le fonti + lifecycle
  connect <source_id>                 FASE 1: censimento + test API
  model <source_id>                   FASE 2: verifica schema DB
  load <source_id> [opzioni]          FASE 3: trasforma + carica
  pipeline <source_id> [opzioni]      Esegue connect → model → load

Comandi delta:
  update <source_id>                  Delta update singola fonte
  update-all                          Delta tutte le fonti loaded

Comandi info:
  history <source_id>                 Storico sync

Opzioni:
  --dry                               Dry run (parse only, no DB)
  --limit N                           Limita a N articoli
  --skip-embeddings                   Salta generazione embeddings

Esempio:
  npx tsx scripts/data-connector.ts connect codice_consumo
  npx tsx scripts/data-connector.ts load codice_consumo --dry --limit 5
  npx tsx scripts/data-connector.ts pipeline dlgs_122_2005
`);
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2);
  const { command, sourceId, dryRun, limit, skipEmbeddings } = parseArgs(args);

  try {
    switch (command) {
      case "status":
        await cmdStatus();
        break;

      case "connect":
        if (!sourceId) {
          console.error("Specificare source_id. Uso: connect <source_id>");
          process.exit(1);
        }
        await cmdConnect(sourceId);
        break;

      case "model":
        if (!sourceId) {
          console.error("Specificare source_id. Uso: model <source_id>");
          process.exit(1);
        }
        await cmdModel(sourceId);
        break;

      case "load":
        if (!sourceId) {
          console.error("Specificare source_id. Uso: load <source_id>");
          process.exit(1);
        }
        await cmdLoad(sourceId, dryRun, limit, skipEmbeddings);
        break;

      case "pipeline":
        if (!sourceId) {
          console.error("Specificare source_id. Uso: pipeline <source_id>");
          process.exit(1);
        }
        await cmdPipeline(sourceId, dryRun, limit);
        break;

      case "update":
        if (!sourceId) {
          console.error("Specificare source_id. Uso: update <source_id>");
          process.exit(1);
        }
        await cmdUpdate(sourceId);
        break;

      case "update-all":
        await cmdUpdateAll();
        break;

      case "history":
        if (!sourceId) {
          console.error("Specificare source_id. Uso: history <source_id>");
          process.exit(1);
        }
        await cmdHistory(sourceId);
        break;

      case "help":
      case "--help":
      case "-h":
        printUsage();
        break;

      default:
        console.error(`Comando sconosciuto: "${command}"`);
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nERRORE: ${msg}`);
    process.exit(1);
  }
}

main();
