/**
 * state-of-company.ts — Generatore automatico di State of the Company giornaliero.
 *
 * Genera un file markdown in company/state-of-company-YYYY-MM-DD.md
 * con snapshot di: task board, corpus, trading, costi, agenti.
 *
 * Non usa LLM — pura aggregazione di dati strutturati.
 * Chiamato da daily-standup.ts a ogni generazione del piano.
 */

import * as fs from "fs";
import * as path from "path";
import { getTaskBoard, getOpenTasks } from "@/lib/company/tasks";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("it-IT", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ─── Corpus Status ────────────────────────────────────────────────────────────

interface CorpusStats {
  total: number;
  loaded: number;
  planned: number;
  verticals: string[];
}

async function getCorpusStats(): Promise<CorpusStats> {
  try {
    // Import dynamic per evitare side effects (registrazione verticali)
    const { getAllSourcesAcrossVerticals } = await import("@/scripts/corpus-sources");
    // Importa verticali per registrazione
    await Promise.all([
      import("@/scripts/hr-sources").catch(() => {}),
      import("@/scripts/tax-sources").catch(() => {}),
      import("@/scripts/commercial-sources").catch(() => {}),
    ]);
    const sources = getAllSourcesAcrossVerticals();
    const loaded = sources.filter(s => s.lifecycle === "loaded" || s.lifecycle === "delta-active").length;
    const planned = sources.filter(s => s.lifecycle === "planned").length;
    const verticalSet = new Set(sources.map(s => s.vertical ?? "legal"));
    return {
      total: sources.length,
      loaded,
      planned,
      verticals: Array.from(verticalSet),
    };
  } catch {
    return { total: 0, loaded: 0, planned: 0, verticals: [] };
  }
}

// ─── Cost Stats ───────────────────────────────────────────────────────────────

interface CostStats {
  total7d: number;
  calls7d: number;
  byProvider: Record<string, { cost: number; calls: number }>;
}

async function getCostStats(): Promise<CostStats | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return null;

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const url = `${supabaseUrl}/rest/v1/agent_cost_log?select=provider,cost_usd&created_at=gte.${since}`;
    const res = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return null;
    const rows: Array<{ provider: string; cost_usd: number }> = await res.json();

    const total7d = rows.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
    const calls7d = rows.length;
    const byProvider: Record<string, { cost: number; calls: number }> = {};
    for (const r of rows) {
      if (!byProvider[r.provider]) byProvider[r.provider] = { cost: 0, calls: 0 };
      byProvider[r.provider].cost += r.cost_usd ?? 0;
      byProvider[r.provider].calls++;
    }
    return { total7d, calls7d, byProvider };
  } catch {
    return null;
  }
}

// ─── Trading Status ───────────────────────────────────────────────────────────

interface TradingStatus {
  mode: string;
  enabled: boolean;
  killSwitch: boolean;
}

async function getTradingStatus(): Promise<TradingStatus | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return null;

    const url = `${supabaseUrl}/rest/v1/trading_config?select=mode,enabled,kill_switch_active&limit=1`;
    const res = await fetch(url, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return null;
    const rows: Array<{ mode: string; enabled: boolean; kill_switch_active: boolean }> = await res.json();
    if (!rows[0]) return null;
    return {
      mode: rows[0].mode,
      enabled: rows[0].enabled,
      killSwitch: rows[0].kill_switch_active,
    };
  } catch {
    return null;
  }
}

// ─── Generate State of Company ────────────────────────────────────────────────

export async function generateStateOfCompany(date: string): Promise<string> {
  const [board, openTasks, corpusStats, costs, trading] = await Promise.all([
    getTaskBoard(),
    getOpenTasks({ limit: 20 }),
    getCorpusStats(),
    getCostStats(),
    getTradingStatus(),
  ]);

  const lines: string[] = [];

  // ── Header ──
  lines.push(`# State of the Company — Controlla.me`);
  lines.push(`**Data:** ${formatDate(date)}`);
  lines.push(`**Prodotto da:** Poimanetres (CME) — auto-generato`);
  lines.push(`**Classificazione:** INTERNO — MANAGEMENT`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  // ── Task Board Snapshot ──
  lines.push(`## 1. Task Board`);
  lines.push(``);
  lines.push(`| Metrica | Valore |`);
  lines.push(`|---------|--------|`);
  lines.push(`| Totale | ${board.total} |`);
  lines.push(`| Open | ${board.byStatus.open ?? 0} |`);
  lines.push(`| In Progress | ${board.byStatus.in_progress ?? 0} |`);
  lines.push(`| Review | ${board.byStatus.review ?? 0} |`);
  lines.push(`| Done | ${board.byStatus.done ?? 0} |`);
  lines.push(`| Blocked | ${board.byStatus.blocked ?? 0} |`);
  lines.push(``);

  // Open tasks summary
  if (openTasks.length > 0) {
    lines.push(`### Task aperti (top ${Math.min(openTasks.length, 10)})`);
    lines.push(``);
    const priorityIcon: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "⚪" };
    openTasks.slice(0, 10).forEach(t => {
      const icon = priorityIcon[t.priority] ?? "⚪";
      lines.push(`- ${icon} \`${t.id.slice(0,8)}\` [${t.department}] ${t.title}`);
    });
    lines.push(``);
  }

  // By department
  lines.push(`### Per dipartimento`);
  lines.push(``);
  lines.push(`| Dipartimento | Open | In Progress | Done |`);
  lines.push(`|-------------|------|-------------|------|`);
  const depts = Object.entries(board.byDepartment).sort((a, b) => (b[1].open + b[1].inProgress) - (a[1].open + a[1].inProgress));
  for (const [dept, stats] of depts) {
    if (stats.total > 0) {
      lines.push(`| ${dept} | ${stats.open} | ${stats.inProgress} | ${stats.done} |`);
    }
  }
  lines.push(``);

  // ── Corpus ──
  lines.push(`## 2. Corpus Legislativo`);
  lines.push(``);
  lines.push(`| Metrica | Valore |`);
  lines.push(`|---------|--------|`);
  lines.push(`| Fonti totali | ${corpusStats.total} |`);
  lines.push(`| Fonti caricate | ${corpusStats.loaded} |`);
  lines.push(`| Fonti pianificate | ${corpusStats.planned} |`);
  lines.push(`| Verticali | ${corpusStats.verticals.join(", ") || "—"} |`);
  lines.push(``);

  // ── Trading ──
  lines.push(`## 3. Ufficio Trading`);
  lines.push(``);
  if (trading) {
    lines.push(`| Metrica | Valore |`);
    lines.push(`|---------|--------|`);
    lines.push(`| Modalità | ${trading.mode} |`);
    lines.push(`| Abilitato | ${trading.enabled ? "✅ Sì" : "❌ No"} |`);
    lines.push(`| Kill Switch | ${trading.killSwitch ? "🔴 ATTIVO" : "🟢 Off"} |`);
  } else {
    lines.push(`_Dati trading non disponibili (tabella non accessibile o sistema non avviato)_`);
  }
  lines.push(``);

  // ── Costi API ──
  lines.push(`## 4. Costi API (ultimi 7 giorni)`);
  lines.push(``);
  if (costs) {
    lines.push(`**Totale:** $${costs.total7d.toFixed(4)} | **Chiamate:** ${costs.calls7d}`);
    lines.push(``);
    lines.push(`| Provider | Costo | Chiamate |`);
    lines.push(`|----------|-------|---------|`);
    for (const [provider, stats] of Object.entries(costs.byProvider).sort((a, b) => b[1].cost - a[1].cost)) {
      lines.push(`| ${provider} | $${stats.cost.toFixed(4)} | ${stats.calls} |`);
    }
  } else {
    lines.push(`_Costi non disponibili (SUPABASE_SERVICE_ROLE_KEY mancante)_`);
  }
  lines.push(``);

  // ── Stato Agenti ──
  lines.push(`## 5. Stato Agenti Runtime`);
  lines.push(``);
  try {
    const { getCurrentTier, isAgentEnabled } = await import("@/lib/tiers");
    const tier = getCurrentTier();
    const agents = ["classifier", "analyzer", "investigator", "advisor", "corpus-agent", "question-prep"];
    lines.push(`**Tier corrente:** ${tier}`);
    lines.push(``);
    lines.push(`| Agente | Stato |`);
    lines.push(`|--------|-------|`);
    for (const agent of agents) {
      const enabled = isAgentEnabled(agent);
      lines.push(`| ${agent} | ${enabled ? "✅ Attivo" : "⏸️ Disabilitato"} |`);
    }
  } catch {
    lines.push(`_Stato agenti non disponibile_`);
  }
  lines.push(``);

  // ── Footer ──
  lines.push(`---`);
  lines.push(``);
  lines.push(`_Generato automaticamente da \`scripts/lib/state-of-company.ts\` il ${new Date().toISOString()}_`);
  lines.push(`_Aggiorna con: \`npx tsx scripts/daily-standup.ts\`_`);

  return lines.join("\n");
}

// ─── Save ─────────────────────────────────────────────────────────────────────

export async function saveStateOfCompany(date: string): Promise<string> {
  const COMPANY_DIR = path.resolve(__dirname, "../../company");
  const filePath = path.join(COMPANY_DIR, `state-of-company-${date}.md`);
  const content = await generateStateOfCompany(date);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}
