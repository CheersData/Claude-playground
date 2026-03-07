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

interface AlertState { lastAlerts: Record<string, number>; }

function loadState(): AlertState {
  try { return JSON.parse(fs.readFileSync(DEDUP_FILE, "utf-8")); }
  catch { return { lastAlerts: {} }; }
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
  const sb = getSupabase();
  if (!sb) { console.log("  [skip] Supabase non configurato"); return 0; }
  const today = new Date().toISOString().split("T")[0];
  const { data } = await sb.from("agent_cost_log").select("estimated_cost").gte("created_at", today);
  if (!data || data.length === 0) { console.log("  [ok] Nessun costo oggi"); return 0; }
  const totalCost = data.reduce((sum: number, r: { estimated_cost: number }) => sum + (r.estimated_cost ?? 0), 0);
  console.log(`  Costo oggi: $${totalCost.toFixed(4)} (soglia: $${COST_THRESHOLD_DAILY})`);
  if (totalCost > COST_THRESHOLD_DAILY && shouldAlert(state, "cost_spike")) {
    await notifyCostSpike("all", totalCost, COST_THRESHOLD_DAILY);
    markAlerted(state, "cost_spike");
    console.log("  [alert] Cost spike notificato!");
    return 1;
  }
  return 0;
}
async function checkBlockedTasks(state: AlertState): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const cutoff = new Date(Date.now() - BLOCKED_THRESHOLD_HOURS * 3600_000).toISOString();
  const { data } = await sb.from("company_tasks").select("id, title, department, updated_at").in("status", ["open", "in_progress"]).lt("updated_at", cutoff);
  if (!data || data.length === 0) { console.log("  [ok] Nessun task bloccato"); return 0; }
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
  return sent;
}
async function checkSyncFailures(state: AlertState): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const { data } = await sb.from("connector_sync_log").select("source_id, status, error_message, synced_at").eq("status", "error").order("synced_at", { ascending: false }).limit(10);
  if (!data || data.length === 0) { console.log("  [ok] Nessun errore sync"); return 0; }
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
  return sent;
}

async function cmdCheck() {
  console.log("
Ops Alerting Check
" + "=".repeat(40));
  if (!isTelegramConfigured()) {
    console.log("[warn] Telegram non configurato");
    console.log("  Simulazione: alert loggati ma non inviati.
");
  }
  const state = loadState();
  let totalAlerts = 0;
  console.log("
[1/3] Checking costs...");
  totalAlerts += await checkCosts(state);
  console.log("
[2/3] Checking blocked tasks...");
  totalAlerts += await checkBlockedTasks(state);
  console.log("
[3/3] Checking sync failures...");
  totalAlerts += await checkSyncFailures(state);
  saveState(state);
  console.log(`
Done. ${totalAlerts} alert inviati.
`);
}

async function cmdStatus() {
  console.log("
Ops Alert State
" + "=".repeat(40));
  const state = loadState();
  const entries = Object.entries(state.lastAlerts);
  if (entries.length === 0) { console.log("Nessun alert inviato.
"); return; }
  for (const [key, ts] of entries) {
    const ago = Math.floor((Date.now() - ts) / 60_000);
    const canRefire = Date.now() - ts > DEDUP_WINDOW_MS;
    console.log(`  ${key}: ${ago}min ago ${canRefire ? "(can refire)" : "(deduped)"}`);
  }
  console.log();
}

const cmd = process.argv[2];
if (cmd === "check") cmdCheck().catch(console.error);
else if (cmd === "status") cmdStatus().catch(console.error);
else { console.log("Usage: npx tsx scripts/ops-alerting.ts <check|status>"); process.exit(1); }