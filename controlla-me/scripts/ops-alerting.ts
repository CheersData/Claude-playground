#!/usr/bin/env npx tsx
/**
 * scripts/ops-alerting.ts -- CLI per alerting automatico Telegram
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";
import {
  isTelegramConfigured,
  notifyCostSpike,
  notifyBlockedTask,
  notifySyncFailure,
} from "../lib/telegram";

const DEDUP_FILE = "company/ops-alert-state.json";
const DEDUP_WINDOW_MS = 12 * 60 * 60 * 1000;
const COST_THRESHOLD_DAILY = 5.0;
const BLOCKED_THRESHOLD_HOURS = 48;

interface AuditEntry {
  timestamp: string;
  check: "costs" | "blocked" | "sync";
  result: "ok" | "alert" | "error";
  message: string;
}

interface AlertState {
  lastAlerts: Record<string, number>;
  auditTrail: AuditEntry[];
}

function loadState(): AlertState {
  try {
    const raw = JSON.parse(fs.readFileSync(DEDUP_FILE, "utf-8"));
    return { lastAlerts: raw.lastAlerts ?? {}, auditTrail: raw.auditTrail ?? [] };
  }
  catch { return { lastAlerts: {}, auditTrail: [] }; }
}

function addAuditEntry(
  state: AlertState,
  check: AuditEntry["check"],
  result: AuditEntry["result"],
  message: string
): void {
  state.auditTrail.push({
    timestamp: new Date().toISOString(),
    check,
    result,
    message,
  });
  // Keep only the last 50 entries
  if (state.auditTrail.length > 50) {
    state.auditTrail = state.auditTrail.slice(-50);
  }
}

function saveState(state: AlertState): void {
  fs.writeFileSync(DEDUP_FILE, JSON.stringify(state, null, 2));
}

function shouldAlert(state: AlertState, key: string): boolean {
  const last = state.lastAlerts[key] ?? 0;
  return Date.now() - last > DEDUP_WINDOW_MS;
}

function markAlerted(state: AlertState, key: string): void {
  state.lastAlerts[key] = Date.now();
}
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function checkCosts(state: AlertState): Promise<number> {
  try {
    const sb = getSupabase();
    if (!sb) {
      console.log("  [skip] Supabase non configurato");
      addAuditEntry(state, "costs", "ok", "Supabase non configurato — skip");
      return 0;
    }
    const today = new Date().toISOString().split("T")[0];
    const { data } = await sb.from("agent_cost_log").select("estimated_cost").gte("created_at", today);
    if (!data || data.length === 0) {
      console.log("  [ok] Nessun costo oggi");
      addAuditEntry(state, "costs", "ok", "Nessun costo oggi");
      return 0;
    }
    const totalCost = data.reduce((sum: number, r: { estimated_cost: number }) => sum + (r.estimated_cost ?? 0), 0);
    console.log(`  Costo oggi: $${totalCost.toFixed(4)} (soglia: $${COST_THRESHOLD_DAILY})`);
    if (totalCost > COST_THRESHOLD_DAILY && shouldAlert(state, "cost_spike")) {
      await notifyCostSpike("all", totalCost, COST_THRESHOLD_DAILY);
      markAlerted(state, "cost_spike");
      console.log("  [alert] Cost spike notificato!");
      addAuditEntry(state, "costs", "alert", `Cost spike: $${totalCost.toFixed(4)} > $${COST_THRESHOLD_DAILY}`);
      return 1;
    }
    addAuditEntry(state, "costs", "ok", `Costo $${totalCost.toFixed(4)} sotto soglia`);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  [error] checkCosts failed: ${msg}`);
    addAuditEntry(state, "costs", "error", `checkCosts failed: ${msg}`);
    return 0;
  }
}
async function checkBlockedTasks(state: AlertState): Promise<number> {
  try {
    const sb = getSupabase();
    if (!sb) {
      addAuditEntry(state, "blocked", "ok", "Supabase non configurato — skip");
      return 0;
    }
    const cutoff = new Date(Date.now() - BLOCKED_THRESHOLD_HOURS * 3600_000).toISOString();
    const { data } = await sb.from("company_tasks").select("id, title, department, updated_at").in("status", ["open", "in_progress"]).lt("updated_at", cutoff);
    if (!data || data.length === 0) {
      console.log("  [ok] Nessun task bloccato");
      addAuditEntry(state, "blocked", "ok", "Nessun task bloccato");
      return 0;
    }
    let sent = 0;
    for (const task of data) {
      const key = `blocked_${task.id}`;
      const days = Math.floor((Date.now() - new Date(task.updated_at).getTime()) / 86400_000);
      if (shouldAlert(state, key)) {
        await notifyBlockedTask(task.id, task.title, task.department, days);
        markAlerted(state, key);
        sent++;
        console.log(`  [alert] Task bloccato: ${task.title} (${days}gg)`);
      }
    }
    if (sent === 0) console.log(`  [ok] ${data.length} task stale ma gia notificati`);
    addAuditEntry(state, "blocked", sent > 0 ? "alert" : "ok", `${data.length} stale, ${sent} notificati`);
    return sent;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  [error] checkBlockedTasks failed: ${msg}`);
    addAuditEntry(state, "blocked", "error", `checkBlockedTasks failed: ${msg}`);
    return 0;
  }
}
async function checkSyncFailures(state: AlertState): Promise<number> {
  try {
    const sb = getSupabase();
    if (!sb) {
      addAuditEntry(state, "sync", "ok", "Supabase non configurato — skip");
      return 0;
    }
    const { data } = await sb.from("connector_sync_log").select("source_id, status, error_message, synced_at").eq("status", "error").order("synced_at", { ascending: false }).limit(10);
    if (!data || data.length === 0) {
      console.log("  [ok] Nessun errore sync");
      addAuditEntry(state, "sync", "ok", "Nessun errore sync");
      return 0;
    }
    let sent = 0;
    for (const row of data) {
      const key = `sync_${row.source_id}`;
      if (shouldAlert(state, key)) {
        await notifySyncFailure(row.source_id, row.error_message ?? "unknown");
        markAlerted(state, key);
        sent++;
      }
    }
    console.log(`  [sync] ${data.length} errori, ${sent} notificati`);
    addAuditEntry(state, "sync", sent > 0 ? "alert" : "ok", `${data.length} errori sync, ${sent} notificati`);
    return sent;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  [error] checkSyncFailures failed: ${msg}`);
    addAuditEntry(state, "sync", "error", `checkSyncFailures failed: ${msg}`);
    return 0;
  }
}

async function cmdCheck() {
  console.log(`\nOps Alerting Check\n${"=".repeat(40)}`);
  if (!isTelegramConfigured()) {
    console.log("[warn] Telegram non configurato");
    console.log("  Simulazione: alert loggati ma non inviati.\n");
  }
  const state = loadState();
  let totalAlerts = 0;
  console.log("\n[1/3] Checking costs...");
  totalAlerts += await checkCosts(state);
  console.log("\n[2/3] Checking blocked tasks...");
  totalAlerts += await checkBlockedTasks(state);
  console.log("\n[3/3] Checking sync failures...");
  totalAlerts += await checkSyncFailures(state);
  saveState(state);
  console.log(`
Done. ${totalAlerts} alert inviati.
`);
}

async function cmdStatus() {
  console.log(`\nOps Alert State\n${"=".repeat(40)}`);
  const state = loadState();
  const entries = Object.entries(state.lastAlerts);
  if (entries.length === 0) { console.log("Nessun alert inviato.\n"); }
  else {
    console.log("\nDedup state:");
    for (const [key, ts] of entries) {
      const ago = Math.floor((Date.now() - ts) / 60_000);
      const canRefire = Date.now() - ts > DEDUP_WINDOW_MS;
      console.log(`  ${key}: ${ago}min ago ${canRefire ? "(can refire)" : "(deduped)"}`);
    }
  }
  if (state.auditTrail.length > 0) {
    console.log(`\nAudit trail (last ${state.auditTrail.length} entries):`);
    for (const entry of state.auditTrail.slice(-10)) {
      const ts = entry.timestamp.replace("T", " ").slice(0, 19);
      const icon = entry.result === "error" ? "[ERR]" : entry.result === "alert" ? "[ALT]" : "[ ok]";
      console.log(`  ${ts} ${icon} ${entry.check}: ${entry.message}`);
    }
    if (state.auditTrail.length > 10) {
      console.log(`  ... and ${state.auditTrail.length - 10} older entries`);
    }
  } else {
    console.log("\nAudit trail: vuoto");
  }
  console.log();
}

const cmd = process.argv[2];
if (cmd === "check") cmdCheck().catch(console.error);
else if (cmd === "status") cmdStatus().catch(console.error);
else { console.log("Usage: npx tsx scripts/ops-alerting.ts <check|status>"); process.exit(1); }