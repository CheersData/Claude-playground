#!/usr/bin/env npx tsx
/**
 * Model Census Agent — verifica aggiornamenti modelli dai provider.
 *
 * Interroga le API di ogni provider per listare modelli disponibili,
 * confronta con lib/models.ts, segnala nuovi/deprecati/variazioni.
 *
 * Uso:
 *   npx tsx scripts/model-census-agent.ts          # Report completo
 *   npx tsx scripts/model-census-agent.ts --update  # Suggerisce entry da aggiungere
 */

import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { MODELS, type Provider } from "@/lib/models";

// ─── Types ───

interface RemoteModel {
  id: string;
  provider: Provider;
  created?: number;
  owned_by?: string;
}

interface CensusReport {
  provider: Provider;
  registered: string[];
  remote: string[];
  newModels: string[];
  missingFromRemote: string[];
  error?: string;
}

// ─── Provider Fetchers ───

async function fetchAnthropic(): Promise<RemoteModel[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.data ?? []).map((m: { id: string; created_at?: string }) => ({
      id: m.id,
      provider: "anthropic" as const,
    }));
  } catch (err) {
    console.error("[CENSUS] Anthropic fetch error:", err);
    return [];
  }
}

async function fetchOpenAI(): Promise<RemoteModel[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.data ?? []).map((m: { id: string; created?: number; owned_by?: string }) => ({
      id: m.id,
      provider: "openai" as const,
      created: m.created,
      owned_by: m.owned_by,
    }));
  } catch (err) {
    console.error("[CENSUS] OpenAI fetch error:", err);
    return [];
  }
}

async function fetchMistral(): Promise<RemoteModel[]> {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.mistral.ai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.data ?? []).map((m: { id: string; created?: number; owned_by?: string }) => ({
      id: m.id,
      provider: "mistral" as const,
      created: m.created,
      owned_by: m.owned_by,
    }));
  } catch (err) {
    console.error("[CENSUS] Mistral fetch error:", err);
    return [];
  }
}

async function fetchGroq(): Promise<RemoteModel[]> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.data ?? []).map((m: { id: string; created?: number; owned_by?: string }) => ({
      id: m.id,
      provider: "groq" as const,
      created: m.created,
      owned_by: m.owned_by,
    }));
  } catch (err) {
    console.error("[CENSUS] Groq fetch error:", err);
    return [];
  }
}

async function fetchCerebras(): Promise<RemoteModel[]> {
  const key = process.env.CEREBRAS_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.cerebras.ai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.data ?? []).map((m: { id: string; created?: number; owned_by?: string }) => ({
      id: m.id,
      provider: "cerebras" as const,
      created: m.created,
      owned_by: m.owned_by,
    }));
  } catch (err) {
    console.error("[CENSUS] Cerebras fetch error:", err);
    return [];
  }
}

async function fetchGemini(): Promise<RemoteModel[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.models ?? []).map((m: { name: string }) => ({
      id: m.name.replace("models/", ""),
      provider: "gemini" as const,
    }));
  } catch (err) {
    console.error("[CENSUS] Gemini fetch error:", err);
    return [];
  }
}

// ─── Census Logic ───

function getRegisteredModelsByProvider(): Record<Provider, string[]> {
  const result: Record<Provider, string[]> = {
    anthropic: [], gemini: [], openai: [], mistral: [],
    groq: [], cerebras: [], deepseek: [],
  };
  for (const [, config] of Object.entries(MODELS)) {
    result[config.provider].push(config.model);
  }
  return result;
}

async function runCensus(): Promise<CensusReport[]> {
  const registered = getRegisteredModelsByProvider();

  const fetchers: Array<{ provider: Provider; fn: () => Promise<RemoteModel[]> }> = [
    { provider: "anthropic", fn: fetchAnthropic },
    { provider: "openai", fn: fetchOpenAI },
    { provider: "mistral", fn: fetchMistral },
    { provider: "groq", fn: fetchGroq },
    { provider: "cerebras", fn: fetchCerebras },
    { provider: "gemini", fn: fetchGemini },
  ];

  const reports: CensusReport[] = [];

  for (const { provider, fn } of fetchers) {
    console.log(`\n[CENSUS] Fetching ${provider}...`);

    try {
      const remote = await fn();
      const remoteIds = remote.map((m) => m.id);
      const registeredIds = registered[provider];

      const newModels = remoteIds.filter(
        (id) => !registeredIds.some((r) => id.includes(r) || r.includes(id))
      );

      const missingFromRemote = registeredIds.filter(
        (id) => !remoteIds.some((r) => r.includes(id) || id.includes(r))
      );

      reports.push({
        provider,
        registered: registeredIds,
        remote: remoteIds,
        newModels,
        missingFromRemote,
      });
    } catch (err) {
      reports.push({
        provider,
        registered: registered[provider],
        remote: [],
        newModels: [],
        missingFromRemote: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return reports;
}

// ─── Output ───

function printReport(reports: CensusReport[], showUpdate: boolean) {
  console.log("\n" + "=".repeat(60));
  console.log("MODEL CENSUS REPORT");
  console.log("=".repeat(60));
  console.log(`Data: ${new Date().toISOString()}`);
  console.log(`Modelli registrati: ${Object.keys(MODELS).length}`);
  console.log("");

  let totalNew = 0;
  let totalMissing = 0;

  for (const report of reports) {
    const icon = report.error ? "!" : report.newModels.length > 0 ? "+" : "=";
    console.log(
      `[${icon}] ${report.provider.toUpperCase()} — ${report.registered.length} registrati, ${report.remote.length} remoti`
    );

    if (report.error) {
      console.log(`    Errore: ${report.error}`);
      continue;
    }

    if (report.newModels.length > 0) {
      console.log(`    Nuovi (${report.newModels.length}):`);
      for (const m of report.newModels.slice(0, 20)) {
        console.log(`      + ${m}`);
      }
      if (report.newModels.length > 20) {
        console.log(`      ... e altri ${report.newModels.length - 20}`);
      }
      totalNew += report.newModels.length;
    }

    if (report.missingFromRemote.length > 0) {
      console.log(`    Non trovati sul remoto (${report.missingFromRemote.length}):`);
      for (const m of report.missingFromRemote) {
        console.log(`      ? ${m}`);
      }
      totalMissing += report.missingFromRemote.length;
    }

    if (report.newModels.length === 0 && report.missingFromRemote.length === 0) {
      console.log("    Tutto allineato.");
    }

    console.log("");
  }

  console.log("─".repeat(60));
  console.log(`Riepilogo: ${totalNew} nuovi modelli, ${totalMissing} potenzialmente deprecati`);

  if (showUpdate && totalNew > 0) {
    console.log("\n" + "=".repeat(60));
    console.log("SUGGERIMENTI DI AGGIORNAMENTO");
    console.log("=".repeat(60));
    console.log(
      "Aggiungi i modelli rilevanti a lib/models.ts con il formato:"
    );
    console.log(`
  "model-key": {
    provider: "provider" as const,
    model: "model-id",
    displayName: "Display Name",
    inputCostPer1M: 0.0,
    outputCostPer1M: 0.0,
    contextWindow: 128_000,
  },`);
  }
}

// ─── Main ───

async function main() {
  const args = process.argv.slice(2);
  const showUpdate = args.includes("--update");

  console.log("[CENSUS] Model Census Agent — controlla.me");
  console.log(`[CENSUS] Modalita: ${showUpdate ? "update" : "report"}`);

  const reports = await runCensus();
  printReport(reports, showUpdate);

  // Save JSON report
  const fs = await import("fs");
  const reportPath = path.resolve(
    __dirname,
    `census-report-${Date.now()}.json`
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        registeredCount: Object.keys(MODELS).length,
        reports: reports.map((r) => ({
          provider: r.provider,
          registeredCount: r.registered.length,
          remoteCount: r.remote.length,
          newModels: r.newModels,
          missingFromRemote: r.missingFromRemote,
          error: r.error,
        })),
      },
      null,
      2
    )
  );
  console.log(`\n[CENSUS] Report salvato: ${reportPath}`);
}

main().catch(console.error);
