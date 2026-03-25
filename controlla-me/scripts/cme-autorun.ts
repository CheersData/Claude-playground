/**
 * cme-autorun.ts — Daemon PURE SENSOR per CME
 *
 * Il daemon è un SENSORE PURO: scansiona file, scrive un report, pinga Telegram, e BASTA.
 * CME nel terminale del boss fa il resto. ZERO chiamate LLM.
 *
 * Flusso:
 *   FASE 1: Daily plan check ($0)
 *   FASE 2: Sensor scan ($0) — file reads only
 *   FASE 2.5: Forma Mentis context ($0) — Supabase reads only
 *   FASE 3: Report write ($0) — daemon-report.json
 *   FASE 4: Telegram ping ($0) — notify boss if critical/high signals
 *   FASE 4.5: Zombie reaper ($0) — kills stale killable node processes (>30min)
 *   FASE 5: CME trigger via claude -p ($0 subscription) — headless task execution
 *   STOP — aggiorna stato daemon
 *
 * Usage:
 *   npx tsx scripts/cme-autorun.ts              # Sessione singola (sensor + report + telegram)
 *   npx tsx scripts/cme-autorun.ts --watch       # Loop ogni INTERVAL minuti
 *   npx tsx scripts/cme-autorun.ts --dry-run     # Mostra signal senza scrivere report
 *   npx tsx scripts/cme-autorun.ts --interval 30 # Intervallo watch in minuti (default: 15)
 *   npx tsx scripts/cme-autorun.ts --scan        # Solo vision scan (mostra signal)
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import { resolve } from "path";
// Telegram notification for daemon ping
import { isTelegramConfigured, notifyDaemonReport } from "../lib/telegram";
import { fileRegisterSession, fileUnregisterSession } from "../lib/company/sessions";

// Zombie reaper (FASE 4.5) — kills stale killable node processes
import { reapZombies } from "../lib/company/self-preservation";

// Forma Mentis integration (Layer 3 + Layer 4) — Supabase reads only, ZERO LLM/embedding calls
import { saveDaemonReport as persistDaemonReport, getRecentReports, getDaemonReportDiff } from "../lib/company/coscienza/daemon-reports";
import { checkGoals } from "../lib/company/coscienza/goal-monitor";
import { getDecisionsPendingReview } from "../lib/company/riflessione/decision-journal";

// Forma Mentis Layer 1: Memory — Supabase reads only
// NOTE: indexCompanyKnowledge REMOVED — it calls generateEmbedding (Voyage AI API, costs $)
// NOTE: recordDecision REMOVED — it calls generateEmbedding (Voyage AI API, costs $)
import { getDepartmentMemories, expireDepartmentMemories } from "../lib/company/memory/department-memory";
import { loadFormaMentisContext } from "../lib/company/memory/daemon-context-loader";
import { loadDepartments } from "../lib/company/departments";

// Forma Mentis Layer 5: COLLABORAZIONE
import { createFanOut, isFanOutComplete, aggregateFanOutResults } from "../lib/company/collaborazione/fan-out";
import { registerDaemonExecutors } from "../lib/company/collaborazione/register-daemon-executors";
import { invokeDepartmentSkill } from "../lib/company/collaborazione/dept-as-tool";

// ─── Config ─────────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, "..");
const COMPANY_DIR = resolve(ROOT, "company");
const LOG_DIR = resolve(COMPANY_DIR, "autorun-logs");
const LOCK_FILE = resolve(LOG_DIR, ".autorun.lock");
const DAEMON_STATE_FILE = resolve(COMPANY_DIR, "cme-daemon-state.json");
const DEFAULT_INTERVAL_MIN = 15;
const REPORT_FILE = resolve(COMPANY_DIR, "daemon-report.json"); // Ultimo report strutturato per CME

// ─── Vision Scanner Types ───────────────────────────────────────────────────

interface ActionableItem {
  deptId: string;
  sourceId: string;
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  routing: string;
  requiresHuman: boolean;
}

/** Report strutturato che il daemon produce per CME */
interface DaemonReport {
  timestamp: string;
  durationMs: number;
  board: { total: number; open: number; inProgress: number; done: number };
  signals: ActionableItem[];
  /** @deprecated Pure sensor: always null. Kept for backward compat with CME report reader. */
  llmAnalysis: null;
  /** @deprecated Pure sensor: always []. Kept for backward compat with CME report reader. */
  llmSuggestions: [];
  /** @deprecated Pure sensor: always []. Kept for backward compat with CME report reader. */
  alerts: [];
  /** Forma Mentis Layer 3: goal check results from this cycle */
  goalChecks: Array<{ goalId: string; goalTitle: string; department: string; metric: string; previousValue: number; currentValue: number; targetValue: number; progressRatio: number; status: string; previousStatus: string; actionTaken: string | null }>;
  /** Forma Mentis Layer 4: count of decisions pending review */
  pendingDecisionReviews: number;
  /** Direttiva operativa per CME: cosa fare quando si sveglia */
  cmeDirective: CmeDirective;
}

/** Direttiva operativa generata dal daemon per CME */
interface CmeDirective {
  /** Modalità operativa: smaltimento task, audit in_progress, o plenaria */
  mode: "smaltimento" | "audit_in_progress" | "plenaria" | "misto";
  /** Istruzioni in linguaggio naturale per CME */
  instructions: string;
  /** Task open da smaltire (max 5 alla volta) */
  openTasksBatch: string[];
  /** Task in_progress da verificare */
  inProgressToAudit: string[];
  /** Task in_progress stale (>2h senza aggiornamento) — richiedono azione immediata */
  staleInProgressIds: string[];
  /** Se true, CME deve fare riunione plenaria dopo aver smaltito */
  requiresPlenary: boolean;
}

// Patterns that indicate a task requires physical human action
const HUMAN_REQUIRED_PATTERNS = [
  /\bDPA\b/i, /\bfirma(re|to)?\b/i, /\bconsulente\b/i,
  /\btelefonat[ae]\b/i, /\bgo[\s-]?live\b/i,
  /\bdeploy\s+(a\s+)?prod/i, /\bapprovazione\s+boss\b/i,
  /\bGoogle\s+Search\s+Console\b/i, /\bGA4\s+setup\b/i,
  /\bcontratto\s+provider\b/i, /\bvendor\b/i,
  /\bingaggiare\b/i, /\bregistrar(si|e)\s+/i,
  /\bpagament[oi]\s+(esterno|reale)/i,
  /\bterminale\s+esterno\b/i, /\bsessione\s+dedicata\b/i,
  /\bWindows\s+Task\s+Scheduler\b/i,
  /\baccesso\s+fisico\b/i, /\bcredenziali\s+produzione\b/i,
  /\bVercel\s+dashboard\b/i, /\bStripe\s+dashboard\b/i,
];

// ─── Daemon State ───────────────────────────────────────────────────────────

interface DaemonState {
  enabled: boolean;
  intervalMinutes: number;
  lastRun: string | null;
  lastDurationMs: number | null;
  lastExitCode: number | null;
  lastTasksExecuted: number;
  totalRuns: number;
  updatedAt: string | null;
  updatedBy: string;
  /** G5: Daemon heartbeat — written at key points in the cycle for liveness detection */
  lastHeartbeat?: string | null;
}

function readDaemonState(): DaemonState {
  try {
    return JSON.parse(fs.readFileSync(DAEMON_STATE_FILE, "utf-8"));
  } catch {
    return {
      enabled: true,
      intervalMinutes: DEFAULT_INTERVAL_MIN,
      lastRun: null,
      lastDurationMs: null,
      lastExitCode: null,
      lastTasksExecuted: 0,
      totalRuns: 0,
      updatedAt: null,
      updatedBy: "system",
    };
  }
}

function writeDaemonState(patch: Partial<DaemonState>): void {
  const current = readDaemonState();
  const updated = { ...current, ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(DAEMON_STATE_FILE, JSON.stringify(updated, null, 2) + "\n", "utf-8");
}

/** G5: Write a heartbeat timestamp to daemon state for liveness detection by Process Monitor. */
function writeDaemonHeartbeat(): void {
  writeDaemonState({ lastHeartbeat: new Date().toISOString() });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ts(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function log(msg: string): void {
  console.log(`[${ts()}] ${msg}`);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Lock ───────────────────────────────────────────────────────────────────

function acquireLock(): boolean {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = fs.readFileSync(LOCK_FILE, "utf-8");
      const lockTime = new Date(lockData.trim()).getTime();
      const elapsed = Date.now() - lockTime;
      // Stale lock: se piu di 30 minuti, ignora
      if (elapsed < 30 * 60 * 1000) {
        log("Altra sessione in corso (lock attivo). Skip.");
        return false;
      }
      log("Lock stale (>30min), sovrascrivo.");
    }
    fs.writeFileSync(LOCK_FILE, new Date().toISOString());
    return true;
  } catch {
    return false;
  }
}

function releaseLock(): void {
  try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
}

// ─── Board Reader ───────────────────────────────────────────────────────────

function readBoard(): string {
  const result = spawnSync("npx", ["tsx", "scripts/company-tasks.ts", "board"], {
    cwd: ROOT,
    encoding: "utf-8",
    timeout: 30_000,
    shell: true,
    windowsHide: true,
  });
  return result.stdout || result.stderr || "Board non disponibile.";
}

function readOpenTasks(): string {
  const result = spawnSync("npx", ["tsx", "scripts/company-tasks.ts", "list", "--status", "open"], {
    cwd: ROOT,
    encoding: "utf-8",
    timeout: 30_000,
    shell: true,
    windowsHide: true,
  });
  return result.stdout || "Nessun task open.";
}

function readInProgressTasks(): string {
  const result = spawnSync("npx", ["tsx", "scripts/company-tasks.ts", "list", "--status", "in_progress"], {
    cwd: ROOT,
    encoding: "utf-8",
    timeout: 30_000,
    shell: true,
    windowsHide: true,
  });
  return result.stdout || "Nessun task in_progress.";
}

// readDepartmentVisions RIMOSSO — usato solo dal vecchio LLM prompt builder

// ─── Stale Task Detection ────────────────────────────────────────────────────

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

interface StaleTask {
  id: string;
  title: string;
  department: string;
  startedAt: string;
  hoursStale: number;
}

/**
 * Query Supabase for in_progress tasks whose started_at is older than 2 hours.
 * Returns stale tasks with their age in hours. Pure read, $0.
 */
async function detectStaleTasks(): Promise<StaleTask[]> {
  try {
    const { createAdminClient } = await import("../lib/supabase/admin");
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("company_tasks")
      .select("id, title, department, started_at")
      .eq("status", "in_progress")
      .order("started_at", { ascending: true });

    if (error || !data) {
      log(`[STALE] Query error: ${error?.message ?? "no data"}`);
      return [];
    }

    const now = Date.now();
    const stale: StaleTask[] = [];
    for (const row of data) {
      const startedAt = row.started_at as string | null;
      if (!startedAt) continue;
      const elapsed = now - new Date(startedAt).getTime();
      if (elapsed > STALE_THRESHOLD_MS) {
        stale.push({
          id: row.id as string,
          title: row.title as string,
          department: row.department as string,
          startedAt,
          hoursStale: Math.round(elapsed / (60 * 60 * 1000) * 10) / 10,
        });
      }
    }

    if (stale.length > 0) {
      log(`[STALE] Detected ${stale.length} stale in_progress task(s) (>2h)`);
    }
    return stale;
  } catch (err) {
    log(`[STALE] Detection failed: ${err}`);
    return [];
  }
}

// ─── CME Directive Generator ────────────────────────────────────────────────

/**
 * Genera la direttiva operativa per CME basata sullo stato del board.
 *
 * Logica:
 * - IN_PROGRESS > 0 → audit: CME verifica se sono realmente in lavorazione
 * - OPEN > 0 → smaltimento: CME prende i primi 5 per priorità, li routing e li esegue
 * - OPEN = 0 e IN_PROGRESS = 0 → plenaria: riunione su vision/gap, nuovi piani
 * - IN_PROGRESS > 0 e OPEN > 0 → misto: prima audit, poi smaltimento
 */
function generateCmeDirective(
  boardStats: { open: number; inProgress: number; done: number; total: number },
  openTasksRaw: string,
  inProgressTasksRaw: string,
  staleTasks: StaleTask[] = [],
): CmeDirective {
  // Parse task titoli e ID dal list output
  // Formato output:
  //   [status] PRIORITY | Titolo del task
  //     dept: xxx | by: yyy | id: abcd1234
  const parseTaskLines = (raw: string): string[] => {
    const lines: string[] = [];
    const rawLines = raw.split('\n');
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i].trim();
      // Match linea titolo: [open] HIGH | Titolo  oppure  [in_progress] MEDIUM | Titolo
      const titleMatch = line.match(/^\[(?:open|in_progress)\]\s+(\w+)\s*\|\s*(.+)$/);
      if (titleMatch) {
        const priority = titleMatch[1];
        const title = titleMatch[2].trim();
        // Cerca la riga successiva per dept e id
        let dept = "?";
        let id = "?";
        if (i + 1 < rawLines.length) {
          const nextLine = rawLines[i + 1].trim();
          const deptMatch = nextLine.match(/dept:\s*([\w-]+)/);
          const idMatch = nextLine.match(/id:\s*([a-f0-9]+)/);
          if (deptMatch) dept = deptMatch[1];
          if (idMatch) id = idMatch[1];
        }
        lines.push(`[${priority}] ${title} (${dept}) — id:${id}`);
      }
    }
    return lines;
  };

  const openTasks = parseTaskLines(openTasksRaw);
  const inProgressTasks = parseTaskLines(inProgressTasksRaw);

  const hasOpen = boardStats.open > 0;
  const hasInProgress = boardStats.inProgress > 0;

  // Stale task IDs for the directive
  const staleIds = staleTasks.map(t => t.id);
  const staleWarning = staleTasks.length > 0
    ? `⚠ ATTENZIONE: ${staleTasks.length} task stale in_progress da >2h. Verifica e chiudi o riapri PRIMA di smaltire.\n` +
      staleTasks.map(t => `  • id:${t.id} "${t.title}" (${t.department}) — ${t.hoursStale}h`).join('\n') +
      `\n\n`
    : '';

  let directive: CmeDirective;

  // CASO 1: ci sono task in_progress E open → misto (prima audit, poi smaltimento)
  if (hasInProgress && hasOpen) {
    const batch = openTasks.slice(0, 5);
    directive = {
      mode: "misto",
      instructions: [
        `PRIORITÀ 1 — AUDIT: Ci sono ${boardStats.inProgress} task in_progress. Verifica OGNUNO:`,
        `  • Se bloccato/fermo da troppo tempo → rimetti a "open" (company-tasks.ts reopen <id>)`,
        `  • Se completato ma non chiuso → chiudi con "done" (company-tasks.ts done <id> --summary "...")`,
        `  • Se effettivamente in lavorazione → lascia in_progress`,
        ``,
        `PRIORITÀ 2 — SMALTIMENTO: Dopo l'audit, ci sono ${boardStats.open} task open.`,
        `  Prendi i primi 5 per priorità, fai routing con i decision trees, e smaltisci UNO ALLA VOLTA.`,
        `  Per ogni task: routing → crea/assegna al dipartimento → il dipartimento esegue → verifica → done.`,
        `  Quando finisci i 5, il daemon al prossimo ciclo genererà i prossimi 5.`,
      ].join('\n'),
      openTasksBatch: batch,
      inProgressToAudit: inProgressTasks,
      staleInProgressIds: staleIds,
      requiresPlenary: false,
    };
  }

  // CASO 2: ci sono SOLO task in_progress (nessun open) → audit
  else if (hasInProgress && !hasOpen) {
    directive = {
      mode: "audit_in_progress",
      instructions: [
        `AUDIT IN_PROGRESS: Ci sono ${boardStats.inProgress} task in_progress e 0 open.`,
        `Verifica OGNUNO:`,
        `  • Se bloccato/fermo da troppo tempo → rimetti a "open"`,
        `  • Se completato ma non chiuso → chiudi con "done"`,
        `  • Se effettivamente in lavorazione → lascia in_progress`,
        ``,
        `Dopo l'audit: se tutti sono chiusi/riaperti e il board è vuoto → fai RIUNIONE PLENARIA.`,
        `Se alcuni sono riaperti → smaltiscili 5 alla volta con routing.`,
      ].join('\n'),
      openTasksBatch: [],
      inProgressToAudit: inProgressTasks,
      staleInProgressIds: staleIds,
      requiresPlenary: true,
    };
  }

  // CASO 3: ci sono task open (nessun in_progress) → smaltimento
  else if (hasOpen && !hasInProgress) {
    const batch = openTasks.slice(0, 5);
    directive = {
      mode: "smaltimento",
      instructions: [
        `SMALTIMENTO: Ci sono ${boardStats.open} task open, 0 in_progress. Board pulito.`,
        `Prendi i primi 5 per priorità e smaltiscili UNO ALLA VOLTA:`,
        `  1. Leggi il task (description, dept)`,
        `  2. Routing con decision tree appropriato`,
        `  3. Assegna al dipartimento competente`,
        `  4. Il dipartimento esegue (exec o builder)`,
        `  5. Verifica risultato → done`,
        ``,
        `Quando finisci i 5, il daemon al prossimo ciclo genererà i prossimi 5.`,
        `Se finisci tutti i task open → fai RIUNIONE PLENARIA.`,
      ].join('\n'),
      openTasksBatch: batch,
      inProgressToAudit: [],
      staleInProgressIds: staleIds,
      requiresPlenary: boardStats.open <= 5,
    };
  }

  // CASO 4: nessun task open né in_progress → plenaria
  else {
    directive = {
      mode: "plenaria",
      instructions: [
        `BOARD VUOTO: 0 open, 0 in_progress. Tutti i task sono completati.`,
        ``,
        `AZIONE: Riunione plenaria obbligatoria.`,
        `  1. Scansiona status.json di tutti i dipartimenti (vision, gap, blockers)`,
        `  2. Leggi i signal del daemon report (opportunità, rischi)`,
        `  3. Controlla goal a rischio (Forma Mentis Layer 3)`,
        `  4. Controlla decisioni pending review (Layer 4)`,
        `  5. Proponi al boss i nuovi piani di lavoro con priorità`,
        `  6. Dopo approvazione boss → crea i task per i dipartimenti`,
        ``,
        `DOPO LA PLENARIA: il board avrà nuovi task open → al prossimo risveglio,`,
        `il daemon genererà direttiva "smaltimento" e il ciclo ricomincia.`,
      ].join('\n'),
      openTasksBatch: [],
      inProgressToAudit: [],
      staleInProgressIds: staleIds,
      requiresPlenary: true,
    };
  }

  // Prepend stale warning to instructions if there are stale tasks
  if (staleWarning) {
    directive.instructions = staleWarning + directive.instructions;
  }

  return directive;
}

// ─── Daily Plan ─────────────────────────────────────────────────────────────

function todayPlanPath(): string {
  const today = new Date().toISOString().slice(0, 10);
  return resolve(COMPANY_DIR, "daily-plans", `${today}.md`);
}

function _readDailyPlan(): string | null {
  try {
    return fs.readFileSync(todayPlanPath(), "utf-8").slice(0, 3000);
  } catch {
    return null;
  }
}

/**
 * Verifica se il piano giornaliero esiste. Se mancante, genera un piano minimo
 * basato SOLO su file reads (board + open tasks). ZERO chiamate LLM.
 *
 * Nota: daily-standup.ts contiene callLLM() per analisi dipartimentali.
 * Il daemon NON lo invoca — è responsabilità del boss generare il piano completo
 * con `npx tsx scripts/daily-standup.ts` in sessione interattiva.
 */
function ensureDailyPlanExists(): boolean {
  const planPath = todayPlanPath();
  if (fs.existsSync(planPath)) {
    log("Daily plan di oggi esiste già.");
    return true;
  }

  log("Daily plan mancante — genero piano minimo dal board (pure sensor, $0)...");

  // Pure file-read: genera un piano minimo leggendo direttamente il board
  const board = readBoard();
  const openTasks = readOpenTasks();
  const today = new Date().toISOString().slice(0, 10);
  const minimalPlan = `# Daily Plan — ${today}

> Generato automaticamente da CME Daemon (piano minimo — pure sensor, $0)
> Per il piano completo con analisi AI: \`npx tsx scripts/daily-standup.ts\`

## Focus Raccomandato

Portare avanti tutti i task open sulla board, in ordine di priorità.

## Board Status

${board.slice(0, 2000)}

## Task Open

${openTasks.slice(0, 3000)}

## Piano

Eseguire i task open dalla board. Priorità: critical > high > medium > low.
`;
  ensureDir(resolve(COMPANY_DIR, "daily-plans"));
  fs.writeFileSync(planPath, minimalPlan, "utf-8");
  log("Piano minimo generato dal board ($0).");
  return true;
}

// readPoimandresVision RIMOSSO — usato solo dal vecchio LLM prompt builder

// AnalysisResult RIMOSSO — il daemon è un sensore puro, zero LLM calls

// ─── Forma Mentis Context Loader ─────────────────────────────────────────────

/**
 * Load last N daemon reports from Supabase to avoid re-analyzing known issues.
 * Returns a summary of recent signals and their status.
 */
async function loadRecentDaemonReports(limit = 3): Promise<{
  reports: Awaited<ReturnType<typeof getRecentReports>>;
  knownSignalIds: Set<string>;
}> {
  try {
    const reports = await getRecentReports(limit);
    const knownSignalIds = new Set<string>();

    for (const report of reports) {
      for (const signal of report.signals) {
        knownSignalIds.add(signal.sourceId);
      }
    }

    log(`[FORMA-MENTIS] Loaded ${reports.length} recent reports, ${knownSignalIds.size} known signal IDs`);
    return { reports, knownSignalIds };
  } catch (err) {
    console.error("[DAEMON] Failed to load recent reports:", err);
    return { reports: [], knownSignalIds: new Set() };
  }
}

// loadAllDepartmentMemories RIMOSSO — usato solo dal vecchio LLM prompt builder

/**
 * Expire old department memories and log the count.
 */
async function expireAllDepartmentMemories(): Promise<void> {
  try {
    const allDepts = await loadDepartments();
    const deptSlugs = allDepts.map((d) => d.id);

    const results = await Promise.all(
      deptSlugs.map((dept) => expireDepartmentMemories(dept))
    );
    const totalExpired = results.reduce((sum, n) => sum + n, 0);
    if (totalExpired > 0) {
      log(`[FORMA-MENTIS] Expired ${totalExpired} stale department memories`);
    }
  } catch (err) {
    console.error("[DAEMON] Memory expiration failed:", err);
  }
}

// saveAnalysisInsights RIMOSSO — il daemon è un sensore puro, zero LLM calls
// saveCycleSummary RIMOSSO — usava indexCompanyKnowledge (generateEmbedding = costs $)
// Critical signals are captured in daemon-report.json and persistDaemonReport (Supabase)

/**
 * Load per-department memories keyed by dept ID.
 * Returns a Map<string, string> for quick access during signal enrichment.
 */
async function loadDeptMemoryMap(): Promise<Map<string, string>> {
  const memoryMap = new Map<string, string>();

  try {
    const allDepts = await loadDepartments();
    const deptSlugs = allDepts.map((d) => d.id);

    const promises = deptSlugs.map(async (dept) => {
      const memories = await getDepartmentMemories(dept, {
        categories: ["warning", "learning", "context", "fact"],
        limit: 5,
      });
      if (memories.length === 0) return { dept, text: "" };
      const text = memories
        .map((m) => `[${m.category}] ${m.key}: ${m.content}`)
        .join("\n");
      return { dept, text };
    });

    const results = await Promise.all(promises);
    for (const { dept, text } of results) {
      if (text) memoryMap.set(dept, text);
    }

    log(`[FORMA-MENTIS] Loaded per-dept memory map: ${memoryMap.size} departments with active memories`);
  } catch (err) {
    console.error("[DAEMON] Failed to load dept memory map:", err);
  }

  return memoryMap;
}

/**
 * Enrich signals with relevant department memory context.
 * Appends memory context to signal descriptions for departments that have active memories.
 * This gives the LLM analysis richer context per-department without a separate query.
 */
function enrichSignalsWithDeptMemory(
  signals: ActionableItem[],
  deptMemoryMap: Map<string, string>,
): void {
  let enrichedCount = 0;

  for (const signal of signals) {
    const deptMemory = deptMemoryMap.get(signal.deptId);
    if (!deptMemory) continue;

    // Don't append if description is already very long
    if (signal.description.length > 400) continue;

    // Check if memory is relevant to this signal (simple keyword overlap)
    const signalWords = new Set(
      signal.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    );
    const memoryLines = deptMemory.split("\n");
    const relevantLines = memoryLines.filter((line) => {
      const lineWords = line.toLowerCase().split(/\s+/);
      return lineWords.some((w) => signalWords.has(w));
    });

    if (relevantLines.length > 0) {
      signal.description += ` [Dept memory: ${relevantLines.slice(0, 2).join("; ").slice(0, 200)}]`;
      enrichedCount++;
    }
  }

  if (enrichedCount > 0) {
    log(`[FORMA-MENTIS] Enriched ${enrichedCount} signals with department memory context`);
  }
}

/**
 * Detect multi-department signals and create fan-out tasks.
 * A signal is "multi-dept" if the same issue type appears across 2+ departments.
 * Now includes department memory context in the fan-out shared context.
 */
async function handleMultiDeptSignals(
  signals: ActionableItem[],
  deptMemoryMap?: Map<string, string>,
): Promise<void> {
  // Group signals by title pattern (first 40 chars normalized)
  const signalGroups = new Map<string, ActionableItem[]>();
  for (const signal of signals) {
    if (signal.requiresHuman) continue;
    if (signal.priority !== "critical" && signal.priority !== "high") continue;

    const normalizedTitle = signal.title.slice(0, 40).toLowerCase().replace(/\s+/g, " ");
    const group = signalGroups.get(normalizedTitle) || [];
    group.push(signal);
    signalGroups.set(normalizedTitle, group);
  }

  // Fan-out for signals that span 2+ departments
  for (const [, group] of Array.from(signalGroups.entries())) {
    const uniqueDepts = Array.from(new Set(group.map((s) => s.deptId)));
    if (uniqueDepts.length < 2) continue;

    const representativeSignal = group[0];

    // Collect department memory context for all involved departments
    const deptMemoryContext: Record<string, string> = {};
    if (deptMemoryMap) {
      for (const dept of uniqueDepts) {
        const mem = deptMemoryMap.get(dept);
        if (mem) deptMemoryContext[dept] = mem.slice(0, 300);
      }
    }

    try {
      const departments = uniqueDepts as Parameters<typeof createFanOut>[0]["departments"];
      const { parentTaskId, subtaskIds } = await createFanOut({
        departments,
        templateTitle: `Cross-dept: ${representativeSignal.title.slice(0, 60)}`,
        templateDesc: `This issue was detected across ${uniqueDepts.length} departments (${uniqueDepts.join(", ")}). ` +
          `Description: ${representativeSignal.description.slice(0, 300)}. ` +
          `Each department should evaluate impact and propose resolution.`,
        priority: representativeSignal.priority === "critical" ? "critical" : "high",
        createdBy: "cme-daemon",
        routing: representativeSignal.routing,
        sharedContext: Object.keys(deptMemoryContext).length > 0
          ? { departmentMemories: deptMemoryContext, signalCount: group.length }
          : undefined,
      });
      log(`[FORMA-MENTIS] Fan-out created for cross-dept signal: parent=${parentTaskId}, depts=${Object.keys(subtaskIds).join(",")}`);
    } catch (err) {
      console.error("[DAEMON] Fan-out creation failed:", err);
    }
  }
}

// saveCycleSummary RIMOSSO — usava indexCompanyKnowledge che chiama Voyage AI (generateEmbedding).
// Il daemon è un sensore puro: $0 di costo. I cycle summary sono già nel daemon-report.json
// e nel Supabase daemon_reports (persistDaemonReport). Se serve knowledge indexing,
// CME lo fa in sessione interattiva.

// buildAnalysisPrompt RIMOSSO — il daemon è un sensore puro, zero LLM calls

/**
 * Scrive il report strutturato per CME.
 * CME legge questo file all'avvio della sessione interattiva e decide cosa fare.
 */
function writeDaemonReport(report: DaemonReport): void {
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + "\n", "utf-8");
  log(`Report scritto: ${REPORT_FILE} (${report.signals.length} signal, ${report.goalChecks.length} goals, ${report.pendingDecisionReviews} pending decisions)`);
}

// ─── Log Session ────────────────────────────────────────────────────────────

function logSession(output: string, exitCode: number, durationMs: number): string {
  ensureDir(LOG_DIR);
  const now = new Date();
  const fileName = `${now.toISOString().slice(0, 16).replace(/[T:]/g, "-")}.md`;
  const logPath = resolve(LOG_DIR, fileName);

  const content = `# CME Autorun — ${now.toLocaleString("it-IT")}

- Durata: ${(durationMs / 1000).toFixed(0)}s
- Exit code: ${exitCode}
- Status: ${exitCode === 0 ? "OK" : "ERRORE"}

## Output

\`\`\`
${output.slice(0, 50_000)}
\`\`\`
`;

  fs.writeFileSync(logPath, content, "utf-8");
  log(`Log salvato: ${logPath}`);
  return logPath;
}

// ─── Log Rotation ────────────────────────────────────────────────────────────

function rotateAutorunLogs(logsDir: string, retentionDays: number = 7): number {
  const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.md'));
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let cleaned = 0;
  for (const file of files) {
    const match = file.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      const fileDate = new Date(match[1]).getTime();
      if (fileDate < cutoff) {
        fs.unlinkSync(resolve(logsDir, file));
        cleaned++;
      }
    }
  }
  return cleaned;
}

// ─── Vision Scanner ─────────────────────────────────────────────────────────

function isHumanRequired(text: string): boolean {
  return HUMAN_REQUIRED_PATTERNS.some((p) => p.test(text));
}

function severityToPriority(
  severity: string
): "critical" | "high" | "medium" | "low" {
  switch (severity) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "low":
      return "low";
    default:
      return "medium";
  }
}

function deptRouting(dept: string, severity?: string): string {
  const isHigh = severity === "high" || severity === "critical";
  switch (dept) {
    case "trading":
      return "trading-operations:routine";
    case "data-engineering":
      return "data-operations:routine_sync";
    case "ux-ui":
      return "ui-ux-request:polish";
    default:
      return isHigh ? "feature-request:medium" : "feature-request:small";
  }
}

function _mapDeptName(dirName: string): string {
  // Accept any valid slug (dynamic departments supported).
  // Fallback to "architecture" only for empty/invalid strings.
  if (!dirName || dirName.trim() === "") return "architecture";
  return dirName;
}

// Vision tracker rimosso — il daemon non crea più task, solo report

/**
 * Scans all department status.json files AND DB-only departments,
 * extracting actionable items (gaps, blockers, next_actions, features_incomplete,
 * risks, opportunities, content_calendar).
 *
 * Merge logic:
 * - Filesystem departments: read company/{dept}/status.json as before
 * - DB-only departments (no filesystem folder): read `status` JSONB from company_departments table
 * - No duplicates: DB departments are only scanned if they don't have a filesystem status.json
 */
async function scanDepartmentStatus(): Promise<ActionableItem[]> {
  const items: ActionableItem[] = [];
  const scannedDepts = new Set<string>();

  // ── Phase A: Filesystem scan (existing behavior) ──
  let deptDirs: string[];
  try {
    deptDirs = fs
      .readdirSync(COMPANY_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    deptDirs = [];
  }

  for (const dept of deptDirs) {
    const statusPath = resolve(COMPANY_DIR, dept, "status.json");
    if (!fs.existsSync(statusPath)) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let status: Record<string, any>;
    try {
      status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
    } catch {
      continue;
    }
    scannedDepts.add(dept);
    extractSignalsFromStatus(dept, status, items);
  }

  // ── Phase B: DB-only departments (no filesystem status.json) ──
  try {
    const allDepts = await loadDepartments();
    for (const deptMeta of allDepts) {
      if (scannedDepts.has(deptMeta.id)) continue; // already scanned from filesystem

      // Try to load status from DB (company_departments.status JSONB)
      try {
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const admin = createAdminClient();
        const { data } = await admin
          .from("company_departments")
          .select("status")
          .eq("name", deptMeta.id)
          .limit(1)
          .single();

        if (data?.status && typeof data.status === "object" && Object.keys(data.status as object).length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          extractSignalsFromStatus(deptMeta.id, data.status as Record<string, any>, items);
          scannedDepts.add(deptMeta.id);
        }
      } catch {
        // DB not reachable or dept not found — skip silently
      }
    }
  } catch {
    // loadDepartments failed (DB unreachable) — we already have filesystem results
    log("[FASE 2] DB department scan failed (non-fatal), using filesystem only");
  }

  return items;
}

/**
 * Extracts actionable signals from a department status object.
 * Shared between filesystem and DB-sourced department statuses.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractSignalsFromStatus(dept: string, status: Record<string, any>, items: ActionableItem[]): void {

    // 1. gaps[]
    if (Array.isArray(status.gaps)) {
      for (const gap of status.gaps) {
        if (!gap.description) continue;
        // Skip closed/resolved gaps
        if (gap.severity === "closed" || /^CHIUSO|^RISOLTO|^COMPLETATO/i.test(gap.description)) continue;
        const text = gap.description;
        items.push({
          deptId: dept,
          sourceId: gap.id || `gap-${dept}-${items.length}`,
          title: text.slice(0, 80),
          description: text,
          priority: severityToPriority(gap.severity || "medium"),
          routing: deptRouting(dept, gap.severity),
          requiresHuman: isHumanRequired(text),
        });
      }
    }

    // 2. blockers[]
    if (Array.isArray(status.blockers)) {
      for (const b of status.blockers) {
        const desc = typeof b === "string" ? b : b?.description || "";
        if (!desc) continue;
        const suggested = typeof b === "object" ? b.suggested_path || "" : "";
        const fullDesc = suggested ? `${desc}. Suggested: ${suggested}` : desc;
        items.push({
          deptId: dept,
          sourceId: (typeof b === "object" && b.id) || `blocker-${dept}-${items.length}`,
          title: desc.slice(0, 80),
          description: fullDesc,
          priority: "high",
          routing: deptRouting(dept, "high"),
          requiresHuman: isHumanRequired(fullDesc),
        });
      }
    }

    // 3. next_actions[] (trading and others)
    if (Array.isArray(status.next_actions)) {
      for (let i = 0; i < status.next_actions.length; i++) {
        const action = status.next_actions[i];
        if (!action || typeof action !== "string") continue;
        items.push({
          deptId: dept,
          sourceId: `action-${dept}-${i}`,
          title: action.slice(0, 80),
          description: action,
          priority: "medium",
          routing: deptRouting(dept),
          requiresHuman: isHumanRequired(action),
        });
      }
    }

    // 4. features_incomplete[]
    if (Array.isArray(status.features_incomplete)) {
      for (let i = 0; i < status.features_incomplete.length; i++) {
        const f = status.features_incomplete[i];
        if (!f || typeof f !== "string") continue;
        items.push({
          deptId: dept,
          sourceId: `feature-${dept}-${i}`,
          title: `Implement: ${f.slice(0, 70)}`,
          description: f,
          priority: "medium",
          routing: deptRouting(dept),
          requiresHuman: isHumanRequired(f),
        });
      }
    }

    // 5. risks[] (strategy)
    if (Array.isArray(status.risks)) {
      for (const r of status.risks) {
        if (!r.description || r.severity === "closed") continue;
        const text = `${r.description}. Mitigation: ${r.mitigation || "TBD"}`;
        items.push({
          deptId: dept,
          sourceId: r.id || `risk-${dept}-${items.length}`,
          title: r.description.slice(0, 80),
          description: text,
          priority: severityToPriority(r.severity || "medium"),
          routing: deptRouting(dept, r.severity),
          requiresHuman: isHumanRequired(text),
        });
      }
    }

    // 6. decisions_pending_boss[] — always human_required
    if (Array.isArray(status.decisions_pending_boss)) {
      for (const d of status.decisions_pending_boss) {
        if (!d.description) continue;
        items.push({
          deptId: dept,
          sourceId: d.id || `decision-${dept}-${items.length}`,
          title: d.description.slice(0, 80),
          description: d.description,
          priority: "high",
          routing: deptRouting(dept, "high"),
          requiresHuman: true,
        });
      }
    }

    // 7. opportunities[] — only if not done/launched
    if (Array.isArray(status.opportunities)) {
      for (const o of status.opportunities) {
        if (!o.title || o.status === "done" || o.status === "launched") continue;
        const desc = `${o.title}. Next action: ${o.next_action || "TBD"}`;
        items.push({
          deptId: dept,
          sourceId: o.id || `opp-${dept}-${items.length}`,
          title: o.title.slice(0, 80),
          description: desc,
          priority: o.priority === "P0" ? "critical" : o.priority === "P1" ? "high" : "medium",
          routing: "feature-request:medium",
          requiresHuman: isHumanRequired(desc),
        });
      }
    }

    // 8. content_calendar (marketing) — entries not yet published
    if (status.content_calendar && typeof status.content_calendar === "object") {
      for (const [period, entries] of Object.entries(status.content_calendar)) {
        if (!Array.isArray(entries)) continue;
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i] as {
            title?: string; status?: string; target_keyword?: string; type?: string;
          };
          if (!entry?.title || entry.status === "done" || entry.status === "published") continue;
          items.push({
            deptId: dept,
            sourceId: `content-${dept}-${period}-${i}`,
            title: `Write content: ${entry.title.slice(0, 60)}`,
            description: `Content: "${entry.title}". Type: ${entry.type || "article"}. Keyword: ${entry.target_keyword || "TBD"}`,
            priority: "medium",
            routing: "feature-request:small",
            requiresHuman: false,
          });
        }
      }
    }

    // 9. completed_recently[] — positive signals for high/critical completions in last 24h
    if (Array.isArray(status.completed_recently)) {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      for (const c of status.completed_recently) {
        if (!c.completedAt || !c.title) continue;
        if (c.priority !== "high" && c.priority !== "critical") continue;
        if (new Date(c.completedAt).getTime() < oneDayAgo) continue;
        items.push({
          deptId: dept,
          sourceId: `completed-${c.id || dept}-${items.length}`,
          title: `Completed: "${c.title}" (${c.priority})`,
          description: `[${dept}] Completed: "${c.title}" (${c.priority})${c.resultSummary ? `. Result: ${c.resultSummary.slice(0, 150)}` : ""}`,
          priority: "low",
          routing: deptRouting(dept),
          requiresHuman: false,
        });
      }
    }
}

// autoGenerateTasks RIMOSSO — il daemon non crea task, produce solo report per CME

// ─── Fan-In: Aggregate completed fan-outs ────────────────────────────────────

/**
 * Queries company_tasks for open [FAN-OUT] parent tasks and aggregates
 * results for any that have all subtasks completed.
 * Called every daemon cycle to close out finished fan-outs.
 */
async function aggregateCompletedFanOuts(): Promise<void> {
  try {
    const { createAdminClient } = await import("../lib/supabase/admin");
    const admin = createAdminClient();

    // Find open fan-out parent tasks
    const { data: fanOutTasks, error } = await admin
      .from("company_tasks")
      .select("id, title")
      .like("title", "[FAN-OUT]%")
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      log(`[FAN-IN] Query error: ${error.message}`);
      return;
    }

    if (!fanOutTasks || fanOutTasks.length === 0) {
      return; // No open fan-outs to check
    }

    let aggregatedCount = 0;
    for (const task of fanOutTasks) {
      try {
        const complete = await isFanOutComplete(task.id);
        if (complete) {
          await aggregateFanOutResults(task.id);
          aggregatedCount++;
          log(`[FAN-IN] Aggregated fan-out: ${task.id} (${task.title})`);
        }
      } catch (err) {
        // Non-fatal per-task: log and continue
        log(`[FAN-IN] Error checking fan-out ${task.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (aggregatedCount > 0) {
      log(`[FAN-IN] Aggregated ${aggregatedCount}/${fanOutTasks.length} completed fan-outs`);
    }
  } catch (err) {
    log(`[FAN-IN] Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// CME Executor RIMOSSO — il daemon è un sensore puro.
// CME nel terminale del boss fa l'esecuzione.


/**
 * Determines if there are actionable signals worth pinging the boss about.
 * Simple check: are there critical or high priority signals?
 */
function hasActionableSignals(signals: ActionableItem[]): { hasCriticalHigh: boolean; criticalCount: number; highCount: number } {
  const critical = signals.filter(s => s.priority === "critical");
  const high = signals.filter(s => s.priority === "high");
  return {
    hasCriticalHigh: critical.length > 0 || high.length > 0,
    criticalCount: critical.length,
    highCount: high.length,
  };
}

/**
 * Send Telegram notification with daemon report summary.
 * Only sends if there are critical/high signals.
 */
async function sendTelegramPing(report: DaemonReport): Promise<boolean> {
  if (!isTelegramConfigured()) {
    log("[TELEGRAM] Non configurato (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID mancanti). Skip.");
    return false;
  }

  const criticalSignals = report.signals.filter(s => s.priority === "critical");
  const highSignals = report.signals.filter(s => s.priority === "high");

  if (criticalSignals.length === 0 && highSignals.length === 0) {
    log("[TELEGRAM] Nessun signal critical/high. Skip notifica.");
    return false;
  }

  // Build top signals list (critical first, then high)
  const topSignals = [...criticalSignals, ...highSignals]
    .slice(0, 3)
    .map(s => ({ deptId: s.deptId, title: s.title, priority: s.priority }));

  try {
    const sent = await notifyDaemonReport({
      totalSignals: report.signals.length,
      criticalCount: criticalSignals.length,
      highCount: highSignals.length,
      topSignals,
      board: report.board,
      goalChecks: report.goalChecks.length,
      pendingDecisions: report.pendingDecisionReviews,
    });

    if (sent) {
      log(`[TELEGRAM] Notifica inviata: ${criticalSignals.length} critical, ${highSignals.length} high.`);
    } else {
      log("[TELEGRAM] Invio fallito (API Telegram ha risposto ok=false).");
    }
    return sent;
  } catch (err) {
    log(`[TELEGRAM] Errore invio: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const watchMode = args.includes("--watch");
  const dryRun = args.includes("--dry-run");

  const intervalIdx = args.indexOf("--interval");
  const intervalMin = intervalIdx !== -1 && args[intervalIdx + 1]
    ? parseInt(args[intervalIdx + 1], 10)
    : DEFAULT_INTERVAL_MIN;

  log("=== CME Autorun (PURE SENSOR) ===");

  if (dryRun) {
    log("Modo dry-run: mostro signal senza scrivere report.\n");
    const items = await scanDepartmentStatus();
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    items.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));
    console.log(`\nSignal totali: ${items.length}`);
    for (const item of items.slice(0, 20)) {
      console.log(`  [${item.priority}] ${item.deptId} | ${item.title}`);
    }
    console.log("\nCosto: $0.00 (pure sensor, zero LLM)");
    return;
  }

  // Scan-only mode: mostra signal dai dipartimenti (no report write)
  if (args.includes("--scan")) {
    log("Modo scan: mostro signal dai dipartimenti.\n");
    const items = await scanDepartmentStatus();

    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    items.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

    const actionable = items.filter((i) => !i.requiresHuman);
    const humanReq = items.filter((i) => i.requiresHuman);

    console.log(`\n─── VISION SCAN (REPORT MODE) ───────────────────`);
    console.log(`Signal totali: ${items.length}`);
    console.log(`  → Azionabili da CME: ${actionable.length}`);
    console.log(`  → Richiedono intervento umano: ${humanReq.length}\n`);

    if (actionable.length > 0) {
      console.log("─── SIGNAL AZIONABILI ──────────────────────────");
      for (const item of actionable.slice(0, 20)) {
        console.log(`  [${item.priority}] ${item.deptId} | ${item.title}`);
        if (item.description !== item.title) console.log(`    └─ ${item.description.slice(0, 120)}`);
      }
    }
    if (humanReq.length > 0) {
      console.log("\n─── RICHIEDONO BOSS ────────────────────────────");
      for (const item of humanReq.slice(0, 10)) {
        console.log(`  [${item.priority}] ${item.deptId} | ${item.title}`);
      }
    }

    console.log("\nNota: il daemon NON crea task. CME legge questi signal e decide.");
    console.log("──────────────────────────────────────────────────");
    return;
  }

  // ─── CME Trigger via claude -p ─────────────────────────────────────
  const AUTORUN_LOG_DIR = resolve(COMPANY_DIR, "autorun-logs");

  function triggerCME(report: DaemonReport): void {
    const { cmeDirective, board, signals } = report;

    // Skip if nothing actionable
    if (board.open === 0 && board.inProgress === 0 && signals.length === 0) {
      log("[CME-TRIGGER] Skip: board vuoto e nessun segnale.");
      return;
    }

    // Build minimal prompt based on directive mode
    let modeInstruction = "";
    switch (cmeDirective.mode) {
      case "smaltimento":
        modeInstruction = "Smaltisci i task open per priorità.";
        break;
      case "audit_in_progress":
        modeInstruction = "Audita i task in_progress: chiudi i completati, riapri i bloccati.";
        break;
      case "plenaria":
        modeInstruction = "Prepara plenaria: aggiorna status dept, ri-prioritizza, crea nuovi task con auto-plenary.ts.";
        break;
      case "misto":
        modeInstruction = "Prima audita in_progress, poi smaltisci open.";
        break;
    }

    const prompt = [
      `Sei CME headless. Leggi company/daemon-report.json, segui la cmeDirective.`,
      `Modo: ${cmeDirective.mode}`,
      `Board: ${board.open} open, ${board.inProgress} in_progress, ${board.done} done.`,
      modeInstruction,
      `Usa scripts/company-tasks.ts per creare/chiudere task. Alla fine scrivi un breve summary di cosa hai fatto.`,
    ].join("\n");

    log(`[CME-TRIGGER] Launching claude -p (mode=${cmeDirective.mode}, timeout=120s)...`);
    const triggerStart = Date.now();

    try {
      const result = spawnSync("/usr/bin/claude", ["-p", "--dangerously-skip-permissions"], {
        input: prompt,
        cwd: ROOT,
        encoding: "utf-8",
        timeout: 120_000,
        windowsHide: true,
      });

      const triggerDuration = Date.now() - triggerStart;
      const exitCode = result.status ?? -1;

      if (exitCode === 0) {
        log(`[CME-TRIGGER] Success in ${(triggerDuration / 1000).toFixed(1)}s (exit ${exitCode})`);
      } else {
        log(`[CME-TRIGGER] Failed (exit ${exitCode}) in ${(triggerDuration / 1000).toFixed(1)}s`);
        if (result.stderr) {
          log(`[CME-TRIGGER] stderr: ${result.stderr.slice(0, 500)}`);
        }
      }

      // Save response for debugging
      try {
        if (!fs.existsSync(AUTORUN_LOG_DIR)) {
          fs.mkdirSync(AUTORUN_LOG_DIR, { recursive: true });
        }
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const logFile = resolve(AUTORUN_LOG_DIR, `cme-response-${ts}.txt`);
        const content = [
          `# CME Trigger Response — ${new Date().toISOString()}`,
          `# Mode: ${cmeDirective.mode} | Exit: ${exitCode} | Duration: ${triggerDuration}ms`,
          `# Board: open=${board.open} inProgress=${board.inProgress} done=${board.done}`,
          "",
          "## STDOUT",
          result.stdout || "(empty)",
          "",
          "## STDERR",
          result.stderr || "(empty)",
        ].join("\n");
        fs.writeFileSync(logFile, content, "utf-8");
      } catch (logErr) {
        log(`[CME-TRIGGER] Failed to save response log: ${logErr instanceof Error ? logErr.message : String(logErr)}`);
      }
    } catch (err) {
      const triggerDuration = Date.now() - triggerStart;
      log(`[CME-TRIGGER] Error after ${(triggerDuration / 1000).toFixed(1)}s: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const runOnce = async () => {
    // Controlla stato daemon da file JSON (modificabile da /ops)
    const state = readDaemonState();
    if (!state.enabled) {
      log("Daemon DISABILITATO (enabled=false in cme-daemon-state.json). Skip.");
      return;
    }

    if (!acquireLock()) return;

    // Register daemon session in the active session tracker
    fileRegisterSession({
      pid: process.pid,
      type: "daemon",
      target: "daemon",
      startedAt: new Date(),
      status: "active",
    });

    const startTime = Date.now();

    try {
      // Register daemon skill executors at startup (read-only department status readers)
      try {
        registerDaemonExecutors();
      } catch (err) {
        log(`[DAEMON] Executor registration warning: ${err instanceof Error ? err.message : String(err)}`);
      }

      // ─── FASE 1: Daily plan ────────────────────────────────────────────
      ensureDailyPlanExists();

      // G5: Heartbeat at start of sensor scan
      writeDaemonHeartbeat();

      // ─── FASE 2: Vision scanner — scansiona status.json, produce SIGNAL ─
      const signals = await scanDepartmentStatus();
      const uniqueDepts = new Set(signals.map((i) => i.deptId)).size;
      log(`[FASE 2] ${signals.length} signal da ${uniqueDepts} dipartimenti.`);

      // ─── FASE 2.5: Forma Mentis context (Supabase reads only) ──────────
      let formaMentisContext = {
        context: { timestamp: new Date().toISOString(), recentSessions: [], departmentMemories: [], activeGoals: [], pendingDecisions: 0, recentReports: [], departmentStatuses: "" },
        sessionBlock: "",
        memoryBlock: "",
        goalBlock: "",
        statusBlock: "",
      };

      writeDaemonHeartbeat();

      try {
        formaMentisContext = await loadFormaMentisContext();
      } catch (err) {
        log(`[FORMA-MENTIS] Context loading failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
      }

      // Layer 5: Try dept-as-tool for status summary (richer than direct file read)
      try {
        const skillResult = await invokeDepartmentSkill('operations', 'get-status-summary');
        if (skillResult.success && skillResult.result) {
          const resultObj = skillResult.result as { summary?: string };
          if (resultObj.summary) {
            formaMentisContext.statusBlock = resultObj.summary;
            log(`[DEPT-AS-TOOL] Status summary loaded via operations:get-status-summary (${skillResult.durationMs}ms)`);
          }
        }
      } catch (err) {
        log(`[DEPT-AS-TOOL] Fallback to direct file read for status: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Load additional context (report history + diff)
      const recentReportsData = await loadRecentDaemonReports(3);

      // Compute report diff if we have previous reports
      let reportDiffSummary = "";
      if (recentReportsData.reports.length >= 2) {
        try {
          const diff = getDaemonReportDiff(
            recentReportsData.reports[0],
            recentReportsData.reports[1],
          );
          if (diff.hasChanges) {
            const parts: string[] = [];
            if (diff.boardDelta.total !== 0) parts.push(`Board: ${diff.boardDelta.total > 0 ? "+" : ""}${diff.boardDelta.total} tasks`);
            if (diff.newSignals.length > 0) parts.push(`${diff.newSignals.length} nuovi signal`);
            if (diff.resolvedSignals.length > 0) parts.push(`${diff.resolvedSignals.length} signal risolti`);
            if (diff.goalTransitions.length > 0) {
              parts.push(`Goal transitions: ${diff.goalTransitions.map(t => `${t.goalTitle}: ${t.from}->${t.to}`).join(", ")}`);
            }
            reportDiffSummary = parts.join(". ");
            log(`[FORMA-MENTIS] Report diff: ${reportDiffSummary}`);
          }
        } catch (err) {
          console.error("[DAEMON] Report diff failed:", err);
        }
      }

      // Expire stale department memories (fire-and-forget, non-blocking)
      expireAllDepartmentMemories().catch(() => {});

      // Per-Department Memory Loading + Signal Enrichment
      let deptMemoryMap = new Map<string, string>();
      try {
        deptMemoryMap = await loadDeptMemoryMap();
        if (deptMemoryMap.size > 0) {
          enrichSignalsWithDeptMemory(signals, deptMemoryMap);
        }
      } catch (err) {
        log(`[FORMA-MENTIS] Dept memory loading failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
      }

      // Forma Mentis Layer 3: Check goals
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let goalCheckResults: any[] = [];
      try {
        goalCheckResults = await checkGoals();
        if (goalCheckResults.length > 0) {
          log(`[DAEMON] Goal checks: ${goalCheckResults.length} goals evaluated`);
        }
      } catch (err) {
        console.error('[DAEMON] Goal check failed:', err);
      }

      // Forma Mentis Layer 4: Check pending decision reviews
      let pendingDecisionReviewCount = 0;
      try {
        const pendingReviews = await getDecisionsPendingReview();
        pendingDecisionReviewCount = pendingReviews.length;
        if (pendingReviews.length > 0) {
          log(`[DAEMON] ${pendingReviews.length} decisions pending review`);
          // Add to signals so they appear in the report
          for (const review of pendingReviews.slice(0, 5)) {
            signals.push({
              deptId: review.department,
              sourceId: `decision-review-${review.id}`,
              title: `Decision review due: ${review.title.slice(0, 60)}`,
              description: `Decision "${review.title}" is past its review date. Expected outcome: ${(review.expectedOutcome || '').slice(0, 100)}`,
              priority: "medium",
              routing: "feature-request:medium",
              requiresHuman: false,
            });
          }
        }
      } catch (err) {
        console.error('[DAEMON] Decision review check failed:', err);
      }

      const durationMs = Date.now() - startTime;

      // Parse board stats dal board output
      const boardOutput = readBoard();
      const boardStats = { total: 0, open: 0, inProgress: 0, done: 0 };
      const totalMatch = boardOutput.match(/Totale:\s*(\d+)/);
      const openMatch = boardOutput.match(/Open:\s*(\d+)/);
      const ipMatch = boardOutput.match(/In Progress:\s*(\d+)/);
      const doneMatch = boardOutput.match(/Done:\s*(\d+)/);
      if (totalMatch) boardStats.total = parseInt(totalMatch[1]);
      if (openMatch) boardStats.open = parseInt(openMatch[1]);
      if (ipMatch) boardStats.inProgress = parseInt(ipMatch[1]);
      if (doneMatch) boardStats.done = parseInt(doneMatch[1]);

      // ─── FASE 2.9: Generate CME Directive ($0) ────────────────────────
      // Leggi task open e in_progress per generare la direttiva operativa
      const openTasksRaw = boardStats.open > 0 ? readOpenTasks() : "";
      const inProgressTasksRaw = boardStats.inProgress > 0 ? readInProgressTasks() : "";

      // Detect stale in_progress tasks (>2h) via Supabase query
      const staleTasks = boardStats.inProgress > 0 ? await detectStaleTasks() : [];
      // Generate signals for stale tasks
      for (const stale of staleTasks) {
        signals.push({
          deptId: stale.department,
          sourceId: `stale-task-${stale.id}`,
          title: `Task stale in_progress da ${stale.hoursStale}h`,
          description: `Task ${stale.id.slice(0, 8)} "${stale.title}" in_progress da ${stale.hoursStale}h senza aggiornamento — probabile sessione chiusa senza completare`,
          priority: "high",
          routing: "company-operations:high",
          requiresHuman: false,
        });
      }
      if (staleTasks.length > 0) {
        log(`[STALE] Added ${staleTasks.length} stale task signal(s) to report`);
      }

      const cmeDirective = generateCmeDirective(boardStats, openTasksRaw, inProgressTasksRaw, staleTasks);
      log(`[DIRECTIVE] mode=${cmeDirective.mode} | open_batch=${cmeDirective.openTasksBatch.length} | audit=${cmeDirective.inProgressToAudit.length} | stale=${cmeDirective.staleInProgressIds.length} | plenary=${cmeDirective.requiresPlenary}`);

      // ─── FASE 3: Write report ($0) ─────────────────────────────────────
      const report: DaemonReport = {
        timestamp: new Date().toISOString(),
        durationMs,
        board: boardStats,
        signals,
        llmAnalysis: null,         // Pure sensor: no LLM analysis
        llmSuggestions: [],        // Pure sensor: no LLM suggestions
        alerts: [],                // Pure sensor: no LLM alerts
        goalChecks: goalCheckResults,
        pendingDecisionReviews: pendingDecisionReviewCount,
        cmeDirective,
      };
      writeDaemonReport(report);

      // Persist report to Supabase (append-only)
      try {
        const elapsed = Date.now() - startTime;
        await persistDaemonReport({
          board: { total: boardStats.total, open: boardStats.open, inProgress: boardStats.inProgress, done: boardStats.done },
          signals: signals.map(s => ({
            deptId: s.deptId,
            sourceId: s.sourceId,
            title: s.title,
            description: s.description,
            priority: s.priority === "critical" ? "high" as const : s.priority as "high" | "medium" | "low",
            routing: s.routing,
            requiresHuman: s.requiresHuman,
          })),
          llmAnalysis: null,
          llmSuggestions: [],
          alerts: [],
          goalChecks: goalCheckResults,
          durationMs: elapsed,
          cycleNumber: state.totalRuns,
          metadata: {
            formaMentisVersion: 3,
            pureSensor: true,
            memoryContextLoaded: !!formaMentisContext.memoryBlock,
            previousReportsLoaded: recentReportsData.reports.length,
            reportDiffAvailable: !!reportDiffSummary,
          },
        });
      } catch (err) {
        console.error('[DAEMON] Failed to persist report to Supabase:', err);
      }

      // ─── Forma Mentis: Post-Scan Persistence ──────────────────────────

      // Layer 5: Fan-out for multi-department signals (with dept memory context)
      try {
        await handleMultiDeptSignals(signals, deptMemoryMap);
      } catch (err) {
        console.error('[DAEMON] Multi-dept fan-out failed (non-blocking):', err);
      }

      // Layer 5: Fan-in — aggregate results from completed fan-outs
      try {
        await aggregateCompletedFanOuts();
      } catch (err) {
        console.error('[DAEMON] Fan-in aggregation failed (non-blocking):', err);
      }

      // saveCycleSummary RIMOSSO — usava indexCompanyKnowledge (Voyage AI embeddings, costs $)
      // recordDecision RIMOSSO — usava generateEmbedding (Voyage AI embeddings, costs $)
      // Entrambi i dati sono già catturati nel daemon-report.json e in persistDaemonReport (Supabase).
      // CME in sessione interattiva può creare decisions e knowledge se necessario.

      // Log session sensor (testo per archivio umano)
      log(`[SENSOR] Completato in ${(durationMs / 1000).toFixed(0)}s — $0.00 (pure sensor, zero LLM)`);
      const sensorOutput = `Costo: $0.00 (pure sensor)\nSignal: ${signals.length}\nBoard: open=${boardStats.open} inProgress=${boardStats.inProgress} done=${boardStats.done}\nDirective: ${cmeDirective.mode}\nGoals: ${goalCheckResults.length}\nPending decisions: ${pendingDecisionReviewCount}\nForma Mentis: memories=${!!formaMentisContext.memoryBlock} reports=${recentReportsData.reports.length} diff=${!!reportDiffSummary}`;
      logSession(sensorOutput, 0, durationMs);

      // ─── FASE 4: Telegram ping ($0) ────────────────────────────────────
      // Notify boss via Telegram if there are critical/high signals
      writeDaemonHeartbeat();
      await sendTelegramPing(report);

      // ─── FASE 4.5: Zombie reaper ($0) ──────────────────────────────
      // Scan and kill stale node processes (killable only, 30min threshold)
      try {
        const reaperResult = reapZombies();
        if (reaperResult.killed > 0) {
          log(`[ZOMBIE-REAPER] Killed ${reaperResult.killed}/${reaperResult.scanned} zombie processes`);
          for (const d of reaperResult.details) {
            if (d.killed) {
              log(`  → PID ${d.pid} [${d.category}] age ${Math.round(d.ageMs / 60000)}min — KILLED`);
            }
          }
        } else if (reaperResult.scanned > 0) {
          log(`[ZOMBIE-REAPER] Scanned ${reaperResult.scanned} processes, no zombies found.`);
        }
      } catch (err) {
        log(`[ZOMBIE-REAPER] Failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
      }

      // Log rotation
      const rotated = rotateAutorunLogs(LOG_DIR);
      if (rotated > 0) log(`Log rotation: ${rotated} file eliminati.`);

      // Ops alerting (costs, blocked tasks, sync failures)
      try {
        const alertResult = spawnSync('npx', ['tsx', 'scripts/ops-alerting.ts', 'check'], {
          cwd: ROOT, encoding: 'utf-8', timeout: 30000, shell: true, windowsHide: true,
        });
        if (alertResult.stdout) log(`[ALERTING] ${alertResult.stdout.trim()}`);
      } catch (e) {
        log(`[ALERTING] Check failed: ${e}`);
      }

      // ─── FASE 5: CME Trigger via claude -p ($0 subscription) ──────────
      // Fire-and-forget: if claude is unavailable, daemon continues as pure sensor
      try {
        triggerCME(report);
      } catch (err) {
        log(`[CME-TRIGGER] Unexpected error (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
      }

      // ─── STOP — Aggiorna stato daemon e basta ──────────────────────────
      const totalDuration = Date.now() - startTime;
      writeDaemonState({
        lastRun: new Date().toISOString(),
        lastDurationMs: totalDuration,
        lastExitCode: 0,
        totalRuns: state.totalRuns + 1,
        updatedBy: "cme-autorun-pure-sensor",
      });

      const { criticalCount, highCount } = hasActionableSignals(signals);
      log(`[DONE] ${signals.length} signal (${criticalCount} critical, ${highCount} high). Telegram: ${isTelegramConfigured() ? "configured" : "not configured"}. STOP.`);
    } finally {
      releaseLock();
      // Unregister daemon session from active session tracker
      fileUnregisterSession(process.pid);
    }
  };

  if (watchMode) {
    const state = readDaemonState();
    const effectiveInterval = state.intervalMinutes || intervalMin;
    log(`Watch mode [PURE SENSOR $0.00/ciclo]: sessione ogni ${effectiveInterval} minuti. Ctrl+C per uscire.`);
    log(`Daemon enabled: ${state.enabled}`);
    await runOnce();

    // Re-leggi intervallo dal file ad ogni ciclo (permette cambio live da /ops)
    const scheduleNext = () => {
      const currentState = readDaemonState();
      const interval = currentState.intervalMinutes || effectiveInterval;
      setTimeout(async () => {
        try {
          await runOnce();
        } catch (err) {
          log(`[WATCH] Errore nel ciclo: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
          scheduleNext();
        }
      }, interval * 60 * 1000);
    };
    scheduleNext();
  } else {
    await runOnce();
  }
}

main().catch((err) => {
  console.error(`Errore fatale: ${err.message}`);
  releaseLock();
  fileUnregisterSession(process.pid);
  process.exit(1);
});
