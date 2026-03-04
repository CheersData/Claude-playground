/**
 * scheduler-approval.ts
 *
 * Utility condivisa per approvare o rifiutare un piano del company scheduler
 * direttamente da Claude Code (CME), senza passare per Telegram.
 *
 * Il daemon rileva il cambio mtime del file di stato e aggiorna il messaggio
 * Telegram di conseguenza (rimuove bottoni, aggiunge esito).
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// ─── Tipi (mirrors company-scheduler-daemon.ts) ───────────────────────────────

interface TaskProposal {
  dept: string;
  title: string;
  priority: "low" | "medium" | "high" | "critical";
  desc: string;
}

interface PendingPlan {
  planNumber: number;
  generatedAt: string;
  messageId: number | null;
  planText: string;
  tasks: TaskProposal[];
}

interface DaemonState {
  updateOffset: number;
  pendingPlan: PendingPlan | null;
  planCountToday: number;
  lastPlanDate: string;
  lastCancelledAt: string | null;
  lastApprovedAt: string | null;
  lastPlanGeneratedAt: string | null;
  chatHistory: unknown[];
  startupInterview: unknown | null;
}

// ─── Paths ───────────────────────────────────────────────────────────────────

const STATE_FILE = path.resolve(__dirname, "../../company/scheduler-daemon-state.json");
const ROOT = path.resolve(__dirname, "../..");

// ─── I/O ─────────────────────────────────────────────────────────────────────

export function loadSchedulerState(): DaemonState | null {
  if (!fs.existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as DaemonState;
  } catch {
    return null;
  }
}

export function saveSchedulerState(state: DaemonState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

// ─── Operazioni ───────────────────────────────────────────────────────────────

/**
 * Approva il piano pendente:
 * 1. Crea i task sul board via CLI company-tasks.ts
 * 2. Azzera pendingPlan + imposta lastApprovedAt
 * 3. Salva il file di stato (il daemon rileverà il cambio mtime)
 *
 * @returns { created: number, titles: string[] }
 */
export function approveSchedulerPlan(state: DaemonState): { created: number; titles: string[] } {
  if (!state.pendingPlan) throw new Error("Nessun piano pendente da approvare");

  const tasks = state.pendingPlan.tasks;
  const created: string[] = [];

  for (const t of tasks) {
    execSync(
      `npx tsx scripts/company-tasks.ts create --title ${JSON.stringify(t.title)} --dept ${t.dept} --priority ${t.priority} --by cme --desc ${JSON.stringify(t.desc)}`,
      { cwd: ROOT, stdio: "pipe" }
    );
    created.push(t.title);
  }

  state.pendingPlan = null;
  state.lastApprovedAt = new Date().toISOString();
  saveSchedulerState(state);

  return { created: created.length, titles: created };
}

/**
 * Rifiuta il piano pendente:
 * 1. Azzera pendingPlan + imposta lastCancelledAt
 * 2. Salva il file di stato (il daemon rileverà il cambio mtime)
 */
export function rejectSchedulerPlan(state: DaemonState): void {
  if (!state.pendingPlan) throw new Error("Nessun piano pendente da rifiutare");

  state.pendingPlan = null;
  state.lastCancelledAt = new Date().toISOString();
  saveSchedulerState(state);
}

/**
 * Controlla se c'è un piano pendente nel file di stato.
 */
export function hasPendingPlan(): boolean {
  const state = loadSchedulerState();
  return !!state?.pendingPlan;
}

/**
 * Formatta il piano pendente in testo leggibile per CME.
 */
export function formatPendingPlan(state: DaemonState): string {
  if (!state.pendingPlan) return "Nessun piano pendente.";

  const p = state.pendingPlan;
  const lines: string[] = [
    `Piano #${p.planNumber} — generato ${new Date(p.generatedAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" })}`,
    "",
    p.planText,
    "",
    `Task proposti (${p.tasks.length}):`,
    ...p.tasks.map((t, i) => `  ${i + 1}. [${t.dept}] ${t.priority.toUpperCase()} — ${t.title}`),
  ];

  return lines.join("\n");
}
