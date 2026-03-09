/**
 * cme-autorun.ts — Daemon SENSOR + PING per CME
 *
 * Il daemon scansiona i dipartimenti e produce un ping per la sessione Claude Code attiva.
 * NIENTE LLM (spreco di quote). NIENTE claude -p (non funziona in nested session).
 *
 * Flusso:
 *   FASE 1: Sensor ($0) → scansiona dipartimenti, produce signal
 *   FASE 2: Report → scrive daemon-report.json strutturato
 *   FASE 3: Ping → scrive riassunto in clipboard + company/daemon-ping.txt
 *           Il boss incolla il ping nella chat Claude Code → CME agisce.
 *
 * Il daemon è gli occhi. La sessione Claude Code attiva è il cervello e le mani.
 * Il boss incolla il ping → CME legge i segnali → agisce.
 *
 * Usage:
 *   npx tsx scripts/cme-autorun.ts              # Sessione singola (sensor + executor)
 *   npx tsx scripts/cme-autorun.ts --watch       # Loop ogni INTERVAL minuti
 *   npx tsx scripts/cme-autorun.ts --dry-run     # Mostra prompt senza eseguire
 *   npx tsx scripts/cme-autorun.ts --interval 30 # Intervallo watch in minuti (default: 15)
 *   npx tsx scripts/cme-autorun.ts --scan        # Solo vision scan (mostra signal)
 *   npx tsx scripts/cme-autorun.ts --sensor-only  # Solo sensor, no executor (debug)
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import { resolve } from "path";
import { callLLM, parseJSON } from "../lib/llm";

// ─── Config ─────────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, "..");
const COMPANY_DIR = resolve(ROOT, "company");
const LOG_DIR = resolve(COMPANY_DIR, "autorun-logs");
const LOCK_FILE = resolve(LOG_DIR, ".autorun.lock");
const DAEMON_STATE_FILE = resolve(COMPANY_DIR, "cme-daemon-state.json");
const DEFAULT_INTERVAL_MIN = 15;
const MAX_PROMPT_DEPT_CHARS = 600; // max chars per department vision context
const REPORT_FILE = resolve(COMPANY_DIR, "daemon-report.json"); // Ultimo report strutturato per CME
const CME_SESSION_LOG_DIR = resolve(COMPANY_DIR, "cme-sessions"); // Log sessioni CME autonome
const MAX_CME_SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minuti max per sessione claude -p
const MIN_SIGNALS_TO_TRIGGER = 1; // Minimo signal critical/high per triggerare CME

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
  llmAnalysis: string | null;
  llmSuggestions: Array<{ title: string; dept: string; priority: string; description: string }>;
  alerts: string[];
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
  /** Rate limit backoff: non triggerare CME prima di questo timestamp ISO */
  rateLimitUntil?: string | null;
  /** Contatore sessioni consecutive senza azioni utili → cooldown progressivo */
  consecutiveNoOp?: number;
  /** Timestamp ISO dell'ultima plenaria automatica (max 1 al giorno) */
  lastPlenaryAt?: string | null;
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
  return result.stdout || "Nessun task in progress.";
}

// ─── Department Visions ─────────────────────────────────────────────────────

interface DeptVisionData {
  name: string;
  vision: string;
  mission: string;
  priorities: string[];
}

function readDepartmentVisions(): DeptVisionData[] {
  // Read directly from departments.ts registry (compiled at runtime)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DEPARTMENTS, DEPT_ORDER } = require("../lib/company/departments");
    return DEPT_ORDER.map((id: string) => {
      const d = DEPARTMENTS[id];
      return {
        name: d.label,
        vision: (d.vision || "").slice(0, MAX_PROMPT_DEPT_CHARS),
        mission: (d.mission || "").slice(0, MAX_PROMPT_DEPT_CHARS),
        priorities: (d.priorities || []).slice(0, 3),
      };
    });
  } catch {
    // Fallback: leggi i department.md direttamente
    const depts = [
      "ufficio-legale", "trading", "data-engineering", "quality-assurance",
      "architecture", "finance", "operations", "security",
      "strategy", "marketing", "ux-ui",
    ];
    return depts.map((id) => {
      const mdPath = resolve(COMPANY_DIR, id, "department.md");
      try {
        const content = fs.readFileSync(mdPath, "utf-8").slice(0, MAX_PROMPT_DEPT_CHARS * 2);
        // Estrai vision/mission dal markdown
        const visionMatch = content.match(/## Visione.*?\n\n([\s\S]*?)(?=\n## |\n---|\n$)/i);
        const missionMatch = content.match(/## Missione.*?\n\n([\s\S]*?)(?=\n## |\n---|\n$)/i);
        return {
          name: id,
          vision: visionMatch?.[1]?.trim().slice(0, MAX_PROMPT_DEPT_CHARS) ?? "",
          mission: missionMatch?.[1]?.trim().slice(0, MAX_PROMPT_DEPT_CHARS) ?? "",
          priorities: [],
        };
      } catch {
        return { name: id, vision: "", mission: "", priorities: [] };
      }
    });
  }
}

// ─── Daily Plan ─────────────────────────────────────────────────────────────

function todayPlanPath(): string {
  const today = new Date().toISOString().slice(0, 10);
  return resolve(COMPANY_DIR, "daily-plans", `${today}.md`);
}

function readDailyPlan(): string | null {
  try {
    return fs.readFileSync(todayPlanPath(), "utf-8").slice(0, 3000);
  } catch {
    return null;
  }
}

/**
 * Genera il piano giornaliero se mancante.
 * Esegue daily-standup.ts direttamente (non dentro la sessione Claude).
 * Anche in demo mode produce un piano parziale basato sui task.
 */
function ensureDailyPlanExists(): boolean {
  const planPath = todayPlanPath();
  if (fs.existsSync(planPath)) {
    log("Daily plan di oggi esiste già.");
    return true;
  }

  log("Daily plan mancante — genero automaticamente...");
  const result = spawnSync("npx", ["tsx", "scripts/daily-standup.ts"], {
    cwd: ROOT,
    encoding: "utf-8",
    timeout: 90_000, // 90s max
    shell: true,
    windowsHide: true,
  });

  if (result.status === 0 || fs.existsSync(planPath)) {
    log("Daily plan generato con successo.");
    return true;
  }

  log(`Daily plan generazione fallita (exit ${result.status}). Creo piano minimo dal board...`);

  // Fallback: crea un piano minimo leggendo direttamente il board
  const board = readBoard();
  const openTasks = readOpenTasks();
  const today = new Date().toISOString().slice(0, 10);
  const minimalPlan = `# Daily Plan — ${today}

> Generato automaticamente da CME Daemon (piano minimo — daily-standup.ts non disponibile)

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
  log("Piano minimo generato dal board.");
  return true;
}

// ─── Poimandres Vision ──────────────────────────────────────────────────────

function readPoimandresVision(): string {
  // La vision Poimandres e nel DB (company_vision table)
  // Fallback: leggi dal file se salvato localmente
  try {
    const stateFile = resolve(COMPANY_DIR, "vision.json");
    if (fs.existsSync(stateFile)) {
      const data = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
      return `Vision: ${data.vision}\nMission: ${data.mission}`;
    }
  } catch { /* ignore */ }
  return "Vision Poimandres: Diventare la prima e piu potente AGI.";
}

// ─── Prompt Builder (ZERO COSTI — analisi e pianificazione, NO esecuzione codice) ──

function buildAnalysisPrompt(): string {
  const board = readBoard();
  const openTasks = readOpenTasks();
  const inProgressTasks = readInProgressTasks();
  const deptVisions = readDepartmentVisions();
  const dailyPlan = readDailyPlan();
  const poimandresVision = readPoimandresVision();

  const deptContext = deptVisions
    .map((d) => {
      const prios = d.priorities.length > 0
        ? d.priorities.map((p, i) => `  P${i}: ${p}`).join("\n")
        : "  (nessuna priorita definita)";
      return `### ${d.name}\nVision: ${d.vision}\nMission: ${d.mission}\nPriorita:\n${prios}`;
    })
    .join("\n\n");

  const planSection = dailyPlan
    ? `\n## DAILY PLAN (oggi)\n${dailyPlan.slice(0, 1500)}`
    : "";

  return `Sei il sensore automatico di Poimandres / Controlla.me.
Il tuo compito è ANALIZZARE lo stato dell'azienda e produrre un REPORT per CME (il CEO virtuale).
Tu NON crei task. Tu osservi, analizzi, e segnali. CME decide cosa fare.

## VISION
${poimandresVision}

## DIPARTIMENTI
${deptContext}

## BOARD
${board.slice(0, 2000)}

## TASK OPEN
${openTasks.slice(0, 2000)}

## TASK IN PROGRESS
${inProgressTasks.slice(0, 1000)}
${planSection}

## ISTRUZIONI

Produci un report per CME. Rispondi SOLO in JSON puro (inizia con { e finisci con }).

Formato:
{
  "analysis": "Analisi dello stato aziendale: cosa funziona, cosa no, dove intervenire (max 300 parole)",
  "suggestions": [
    {
      "title": "Cosa andrebbe fatto (max 80 char)",
      "dept": "dipartimento suggerito",
      "priority": "critical|high|medium|low",
      "description": "Perché è importante e cosa comporta (max 200 char)"
    }
  ],
  "alerts": ["Problemi urgenti che CME deve vedere subito"],
  "deptHealth": {
    "nome-dept": "green|yellow|red — motivazione breve"
  }
}

REGOLE:
- Questo è un REPORT, non una lista di ordini. CME valuterà se e come agire
- Sii specifico e concreto nelle osservazioni, non generico
- Segnala pattern: dipartimenti fermi, task bloccati da giorni, aree senza copertura
- alerts[] solo per cose urgenti (produzione rotta, sicurezza, perdita dati)
- Dept validi: ufficio-legale, trading, data-engineering, quality-assurance, architecture, finance, operations, security, strategy, marketing, ux-ui
- Priorita: critical solo per emergenze, high per cose importanti, medium per miglioramenti, low per nice-to-have
`;
}

// ─── Execute Free LLM Session (ZERO COSTI) ──────────────────────────────────

interface AnalysisResult {
  analysis: string;
  suggestions: Array<{
    title: string;
    dept: string;
    priority: string;
    description: string;
  }>;
  alerts: string[];
  deptHealth: Record<string, string>;
}

async function _executeFreeSession(prompt: string): Promise<{ output: string; analysis: AnalysisResult | null; exitCode: number }> {
  log("Lancio analisi via LLM gratuiti (ZERO COSTI)...");

  try {
    const response = await callLLM(prompt, {
      callerName: "cme-daemon",
      maxTokens: 4096,
      temperature: 0.3,
      jsonOutput: true,
    });

    log(`LLM response ricevuta: ${response.length} chars`);

    let analysis: AnalysisResult | null = null;
    try {
      analysis = parseJSON<AnalysisResult>(response);
    } catch (e) {
      log(`Parsing JSON fallito: ${e instanceof Error ? e.message : String(e)}`);
    }

    return { output: response, analysis, exitCode: 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`ERRORE LLM gratuito: ${msg}`);
    return { output: msg, analysis: null, exitCode: 1 };
  }
}

/**
 * Scrive il report strutturato per CME.
 * CME legge questo file all'avvio della sessione interattiva e decide cosa fare.
 */
function writeDaemonReport(report: DaemonReport): void {
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + "\n", "utf-8");
  log(`Report scritto: ${REPORT_FILE} (${report.signals.length} signal, ${report.llmSuggestions.length} suggestions, ${report.alerts.length} alerts)`);
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
  const valid = new Set([
    "ufficio-legale", "trading", "data-engineering", "quality-assurance",
    "architecture", "finance", "operations", "security",
    "strategy", "marketing", "ux-ui", "protocols", "acceleration",
  ]);
  return valid.has(dirName) ? dirName : "architecture";
}

// Vision tracker rimosso — il daemon non crea più task, solo report

/**
 * Scans all department status.json files and extracts actionable items
 * (gaps, blockers, next_actions, features_incomplete, risks, opportunities, content_calendar)
 */
function scanDepartmentStatus(): ActionableItem[] {
  const items: ActionableItem[] = [];

  let deptDirs: string[];
  try {
    deptDirs = fs
      .readdirSync(COMPANY_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return items;
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
  }

  return items;
}

// autoGenerateTasks RIMOSSO — il daemon non crea task, produce solo report per CME

// ─── CME Executor (claude -p, Max subscription) ────────────────────────────

/**
 * Determina se il report ha signal che meritano di triggerare una sessione CME.
 * Trigger solo su signal critical/high NON human_required.
 */
/**
 * Conta i task open che NON sono human_required.
 * Legge la lista task e filtra via HUMAN_REQUIRED_PATTERNS.
 */
function countAutomatableTasks(): number {
  const openTasksText = readOpenTasks();
  // Ogni task nel list output ha formato: "ID | title | dept | status | desc"
  // Splitta per riga e filtra righe che contengono dati task (non headers/separators)
  const lines = openTasksText.split("\n").filter((l) => l.includes("|") && !l.includes("---"));
  let automatable = 0;
  for (const line of lines) {
    const isHuman = HUMAN_REQUIRED_PATTERNS.some((p) => p.test(line));
    if (!isHuman) automatable++;
  }
  return automatable;
}

function shouldTriggerCME(report: DaemonReport): { trigger: boolean; reason: string; actionableCount: number } {
  // F2: Rate limit backoff — se siamo in cooldown, non triggerare
  const state = readDaemonState();
  if (state.rateLimitUntil) {
    const until = new Date(state.rateLimitUntil).getTime();
    if (Date.now() < until) {
      const remainMin = Math.ceil((until - Date.now()) / 60000);
      return { trigger: false, reason: `Rate limit backoff attivo (${remainMin}min rimanenti)`, actionableCount: 0 };
    }
    // Reset: siamo oltre il backoff
    writeDaemonState({ rateLimitUntil: null });
  }

  // F1: Cooldown progressivo — se N sessioni consecutive senza azioni, backoff
  const consecutiveNoOp = state.consecutiveNoOp ?? 0;
  if (consecutiveNoOp >= 6) {
    // Dopo 6 sessioni vuote, triggera solo ogni N cicli
    const skipCycles = Math.min(consecutiveNoOp - 4, 5); // max 5 cicli di skip
    const cycleNum = state.totalRuns % (skipCycles + 1);
    if (cycleNum !== 0) {
      return { trigger: false, reason: `Cooldown progressivo (${consecutiveNoOp} sessioni no-op, skip ciclo ${cycleNum}/${skipCycles + 1})`, actionableCount: 0 };
    }
  }

  // Conta TUTTI i signal azionabili (non solo critical/high)
  const actionableCritHigh = report.signals.filter(
    (s) => !s.requiresHuman && (s.priority === "critical" || s.priority === "high")
  );
  const actionableMedium = report.signals.filter(
    (s) => !s.requiresHuman && s.priority === "medium"
  );
  const totalActionable = actionableCritHigh.length + actionableMedium.length;

  // Trigger anche se ci sono alert dal LLM
  const hasAlerts = report.alerts.length > 0;

  // Trigger su task open automatizzabili
  const automatableTasks = countAutomatableTasks();
  const hasAutomatableTasks = automatableTasks > 0;

  // Trigger su suggerimenti LLM
  const hasSuggestions = report.llmSuggestions.length > 0;

  if (actionableCritHigh.length >= MIN_SIGNALS_TO_TRIGGER) {
    return { trigger: true, reason: `${actionableCritHigh.length} signal critical/high azionabili + ${actionableMedium.length} medium`, actionableCount: totalActionable };
  }
  if (hasAlerts) {
    return { trigger: true, reason: `${report.alerts.length} alert urgenti`, actionableCount: report.alerts.length };
  }
  if (hasAutomatableTasks) {
    return { trigger: true, reason: `${automatableTasks} task open automatizzabili (${report.board.open} totali)`, actionableCount: automatableTasks };
  }
  if (hasSuggestions) {
    return { trigger: true, reason: `${report.llmSuggestions.length} suggerimenti LLM da valutare`, actionableCount: report.llmSuggestions.length };
  }
  // Trigger anche su signal medium se ce ne sono abbastanza (almeno 3)
  if (actionableMedium.length >= 3) {
    return { trigger: true, reason: `${actionableMedium.length} signal medium azionabili (nessun critical/high)`, actionableCount: actionableMedium.length };
  }

  // Nessun trigger — loghiamo perché (utile per debug)
  if (report.board.open > 0 && !hasAutomatableTasks) {
    return { trigger: false, reason: `${report.board.open} task open ma TUTTI human_required — skip`, actionableCount: 0 };
  }

  return { trigger: false, reason: "Nessun signal azionabile", actionableCount: 0 };
}

/**
 * Costruisce il prompt per claude -p. Claude -p diventa CME:
 * legge CLAUDE.md, il report del daemon, crea task mirati, li esegue.
 *
 * PRINCIPIO: claude -p deve avere abbastanza contesto per agire autonomamente.
 * Non filtrare troppo — dare visibilità completa e lasciare che CME decida.
 */
function buildCMEPrompt(report: DaemonReport): string {
  // Signal azionabili (non human_required) — TUTTI, non solo critical/high
  const actionableSignals = report.signals
    .filter((s) => !s.requiresHuman)
    .sort((a, b) => {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
    })
    .slice(0, 20);

  // Signal che richiedono il boss — per contesto (CME può preparare il terreno)
  const humanSignals = report.signals
    .filter((s) => s.requiresHuman && (s.priority === "critical" || s.priority === "high"))
    .slice(0, 5);

  const actionableList = actionableSignals
    .map((s) => `- [${s.priority}] ${s.deptId}: ${s.title}\n  ${s.description.slice(0, 200)}\n  routing: ${s.routing}`)
    .join("\n");

  const humanList = humanSignals
    .map((s) => `- [${s.priority}] ${s.deptId}: ${s.title} (⚠️ richiede boss)`)
    .join("\n");

  const suggestionList = report.llmSuggestions
    .slice(0, 5)
    .map((s) => `- [${s.priority}] ${s.dept}: ${s.title} — ${s.description}`)
    .join("\n");

  const alertList = report.alerts.map((a) => `- ${a}`).join("\n");

  // Leggi i task aperti per includerli nel prompt
  const openTasksText = readOpenTasks().slice(0, 3000);
  const inProgressText = readInProgressTasks().slice(0, 2000);

  return `Sei CME, il CEO virtuale di Controlla.me.

## IL TUO COMPITO

Il daemon ha scansionato i dipartimenti e prodotto un report con ${report.signals.length} signal.
Di questi, ${actionableSignals.length} sono AZIONABILI da te (non richiedono intervento umano).
Tu DEVI analizzarli e agire: crea task, eseguili, chiudili.

## PRIMA DI TUTTO

1. Leggi CLAUDE.md per capire il progetto e le convenzioni
2. Leggi company/cme.md per il tuo ruolo e le regole
3. Usa \`npx tsx scripts/dept-context.ts <dept>\` per avere il contesto rapido di un dipartimento

## STATO BOARD
- Totale: ${report.board.total} | Open: ${report.board.open} | In Progress: ${report.board.inProgress} | Done: ${report.board.done}

## TASK APERTI (da eseguire subito)
${openTasksText || "(nessuno)"}

## TASK IN PROGRESS
${inProgressText || "(nessuno)"}

## SIGNAL AZIONABILI (puoi agire su questi)
${actionableList || "(nessuno — i signal azionabili sono esauriti)"}

## SIGNAL CHE RICHIEDONO IL BOSS (solo contesto)
${humanList || "(nessuno)"}

## SUGGERIMENTI LLM
${suggestionList || "(nessuno — LLM analysis non disponibile)"}

## ALERT
${alertList || "(nessuno)"}

## ANALISI LLM
${report.llmAnalysis?.slice(0, 800) || "(non disponibile — provider gratuiti esauriti, agisci sui signal grezzi)"}

## COME LAVORARE

### Se ci sono task OPEN o IN_PROGRESS:
1. Eseguili SUBITO — sono già approvati
2. Per ogni task: \`npx tsx scripts/company-tasks.ts exec <id>\` → leggi il delegation brief → implementa
3. Quando completi: \`npx tsx scripts/company-tasks.ts done <id> --summary "..."\`

### Se NON ci sono task ma ci sono signal azionabili:
1. Scegli i TOP 3 signal più impattanti
2. Per ognuno crea un task:
   \`npx tsx scripts/company-tasks.ts create --title "..." --dept <dept> --priority <p> --by cme --routing "<routing>" --desc "Cosa fare e perché"\`
3. Eseguilo: \`npx tsx scripts/company-tasks.ts exec <id>\`
4. Implementa il lavoro seguendo il department.md e i runbook
5. Chiudi: \`npx tsx scripts/company-tasks.ts done <id> --summary "..." --no-next\`

### Cosa puoi fare (esempi):
- Scrivere/aggiornare codice (app/, lib/, trading/, scripts/)
- Scrivere test (vitest, playwright)
- Aggiornare configurazioni e documentazione
- Fixare bug rilevati dai signal
- Aggiornare status.json dei dipartimenti
- Creare contenuti marketing/SEO
- Migliorare prompt degli agenti AI

### Cosa NON puoi fare (richiede il boss):
- Deploy in produzione
- Firmare DPA/contratti
- Go-live trading
- Configurare servizi esterni (GSC, GA4, Stripe dashboard)

## REGOLE (NON NEGOZIABILI)

1. OGNI modifica a file in app/, lib/, trading/src/, scripts/ DEVE avere un task formale
2. Max 3 task per sessione — meglio 3 fatti bene che 10 a metà
3. Logga cosa hai fatto alla fine della sessione (riassunto)
4. Se un task fallisce, segnalalo nel summary e vai avanti al prossimo
5. NON restare inattivo — se hai signal azionabili, DEVI creare almeno 1 task e completarlo
`;
}

/**
 * Lancia claude -p come CME autonomo.
 * Usa la subscription Max del boss (nessun costo aggiuntivo).
 */
function executeCMESession(report: DaemonReport): { success: boolean; output: string; durationMs: number } {
  const prompt = buildCMEPrompt(report);

  log("[CME] Lancio sessione autonoma via claude -p (Max subscription)...");
  const startTime = Date.now();

  // F3: Usa spawnSync con `input` diretto — più affidabile di pipe via shell su Windows.
  // Il vecchio approccio (type file | claude -p) causava troncamento intermittente del prompt.
  // Se `input` non funziona, fallback su file temporaneo + pipe.
  const promptFile = resolve(LOG_DIR, ".cme-prompt.tmp");

  try {
    // Metodo primario: stdin diretto via `input` — no shell, no pipe, no troncamento
    let result: ReturnType<typeof spawnSync>;
    const claudeCmd = process.platform === "win32" ? "claude.cmd" : "claude";

    try {
      result = spawnSync(claudeCmd, ["-p", "--verbose"], {
        cwd: ROOT,
        encoding: "utf-8",
        timeout: MAX_CME_SESSION_TIMEOUT,
        input: prompt,
        env: { ...process.env },
        windowsHide: true,
      });

      // Verifica: se exit code null e output vuoto, il metodo input non ha funzionato → fallback
      if (result.status === null && !(result.stdout || "").trim() && !(result.stderr || "").trim()) {
        throw new Error("spawnSync input method returned empty — fallback to pipe");
      }
    } catch (inputErr) {
      // Fallback: file + pipe (vecchio metodo)
      log(`[CME] Input diretto fallito (${inputErr instanceof Error ? inputErr.message : inputErr}), fallback a pipe`);
      fs.writeFileSync(promptFile, prompt, "utf-8");
      const pipeCmd = process.platform === "win32"
        ? `type "${promptFile}" | claude -p --verbose`
        : `cat "${promptFile}" | claude -p --verbose`;
      result = spawnSync(pipeCmd, [], {
        cwd: ROOT,
        encoding: "utf-8",
        timeout: MAX_CME_SESSION_TIMEOUT,
        shell: true,
        env: { ...process.env },
        windowsHide: true,
      });
    }

    const durationMs = Date.now() - startTime;
    const output = (result.stdout || "") + (result.stderr || "");

    // Log sessione CME
    ensureDir(CME_SESSION_LOG_DIR);
    const now = new Date();
    const sessionFile = `${now.toISOString().slice(0, 16).replace(/[T:]/g, "-")}.md`;
    const sessionLog = `# CME Session Autonoma — ${now.toLocaleString("it-IT")}

- Durata: ${(durationMs / 1000).toFixed(0)}s
- Exit code: ${result.status}
- Trigger: ${report.signals.filter((s) => !s.requiresHuman && (s.priority === "critical" || s.priority === "high")).length} signal + ${report.board.open} task open

## Prompt

\`\`\`
${prompt.slice(0, 5000)}
\`\`\`

## Output

\`\`\`
${output.slice(0, 50_000)}
\`\`\`
`;
    fs.writeFileSync(resolve(CME_SESSION_LOG_DIR, sessionFile), sessionLog, "utf-8");

    if (result.status === 0) {
      log(`[CME] Sessione completata in ${(durationMs / 1000).toFixed(0)}s`);
      return { success: true, output, durationMs };
    } else {
      log(`[CME] Sessione fallita (exit ${result.status}): ${output.slice(0, 200)}`);
      return { success: false, output, durationMs };
    }
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);
    log(`[CME] Errore sessione: ${msg}`);
    return { success: false, output: msg, durationMs };
  } finally {
    // Pulisci file temporaneo
    try { fs.unlinkSync(promptFile); } catch { /* ignore */ }
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

  log("=== CME Autorun ===");

  if (dryRun) {
    log("Modo dry-run: mostro il prompt senza eseguire.\n");
    const prompt = buildAnalysisPrompt();
    console.log("─── PROMPT (FREE LLM — $0.00) ────────────────────");
    console.log(prompt);
    console.log("──────────────────────────────────────────────────");
    console.log(`\nLunghezza prompt: ${prompt.length} chars`);
    console.log("Costo stimato: $0.00 (provider gratuiti)");
    return;
  }

  // Scan-only mode: mostra signal dai dipartimenti (no task creation)
  if (args.includes("--scan")) {
    log("Modo scan: mostro signal dai dipartimenti.\n");
    const items = scanDepartmentStatus();

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

  const runOnce = async () => {
    // Controlla stato daemon da file JSON (modificabile da /ops)
    const state = readDaemonState();
    if (!state.enabled) {
      log("Daemon DISABILITATO (enabled=false in cme-daemon-state.json). Skip.");
      return;
    }

    if (!acquireLock()) return;

    const startTime = Date.now();

    try {
      // FASE 1: Daily plan
      ensureDailyPlanExists();

      // FASE 2: Vision scanner — scansiona status.json, produce SIGNAL (no task creation)
      const signals = scanDepartmentStatus();
      const uniqueDepts = new Set(signals.map((i) => i.deptId)).size;
      log(`[VISION] ${signals.length} signal da ${uniqueDepts} dipartimenti.`);

      // FASE 3: SKIP LLM — il daemon non spreca chiamate API.
      // I segnali vanno direttamente nel ping per la sessione Claude Code attiva.
      const durationMs = Date.now() - startTime;
      const analysis: { analysis: string | null; suggestions: string[]; alerts: string[] } = {
        analysis: null, suggestions: [], alerts: [],
      };
      const exitCode = 0;
      log(`[SENSOR-ONLY] Skip LLM — ${signals.length} signal pronti per ping.`);

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

      // SCRIVI REPORT STRUTTURATO per CME
      const report: DaemonReport = {
        timestamp: new Date().toISOString(),
        durationMs,
        board: boardStats,
        signals,
        llmAnalysis: analysis?.analysis || null,
        llmSuggestions: analysis?.suggestions || [],
        alerts: analysis?.alerts || [],
      };
      writeDaemonReport(report);

      // Log session sensor (testo per archivio umano)
      log(`[SENSOR] Completato in ${(durationMs / 1000).toFixed(0)}s — exit ${exitCode} — $0.00`);
      logSession(
        `Costo: $0.00\nSignal: ${signals.length}\nSuggestions: ${report.llmSuggestions.length}\nAlerts: ${report.alerts.length}\n\n${output}`,
        exitCode,
        durationMs
      );

      // FASE 3.5: Idle detection → auto-plenary (zero LLM cost)
      // Se il board ha pochi task eseguibili, genera nuovi task da plenaria automatica
      const IDLE_THRESHOLD = 3;
      const feasibleOpen = countAutomatableTasks();
      if (feasibleOpen < IDLE_THRESHOLD) {
        const daemonState = readDaemonState();
        const lastPlenary = daemonState.lastPlenaryAt ? new Date(daemonState.lastPlenaryAt).getTime() : 0;
        const oneDayMs = 24 * 60 * 60 * 1000;
        const plenaryDue = Date.now() - lastPlenary > oneDayMs;

        if (plenaryDue) {
          log(`[PLENARY] Board quasi vuoto (${feasibleOpen} task eseguibili < ${IDLE_THRESHOLD}). Avvio plenaria automatica...`);

          // Step 1: Aggiorna tutti i status.json dai dati reali del board
          try {
            const updateResult = spawnSync("npx", ["tsx", "scripts/auto-update-dept-status.ts"], {
              cwd: ROOT, encoding: "utf-8", timeout: 30000, shell: true, windowsHide: true,
            });
            if (updateResult.status === 0) {
              log(`[PLENARY] Status dipartimenti aggiornati.`);
            } else {
              log(`[PLENARY] Warning: auto-update-dept-status fallito: ${updateResult.stderr?.slice(0, 200)}`);
            }
          } catch (e) {
            log(`[PLENARY] Warning: auto-update-dept-status errore: ${e}`);
          }

          // Step 2: Genera task dalla plenaria
          try {
            const plenaryResult = spawnSync("npx", ["tsx", "scripts/auto-plenary.ts"], {
              cwd: ROOT, encoding: "utf-8", timeout: 60000, shell: true, windowsHide: true,
            });
            if (plenaryResult.status === 0 && plenaryResult.stdout) {
              // auto-plenary.ts emette JSON con i task proposti su stdout
              try {
                const proposed = JSON.parse(plenaryResult.stdout.trim());
                const tasks = Array.isArray(proposed) ? proposed : proposed.tasks || [];
                let created = 0;
                for (const task of tasks.slice(0, 15)) {
                  const createResult = spawnSync("npx", [
                    "tsx", "scripts/company-tasks.ts", "create",
                    "--title", task.title || "Auto-plenary task",
                    "--dept", task.dept || "architecture",
                    "--priority", task.priority || "medium",
                    "--by", "cme-plenary",
                    "--desc", task.desc || task.title || "Generated by auto-plenary",
                    "--routing-exempt", "--routing-reason", "auto-generated from plenary",
                  ], {
                    cwd: ROOT, encoding: "utf-8", timeout: 15000, shell: true, windowsHide: true,
                  });
                  if (createResult.status === 0) created++;
                }
                log(`[PLENARY] ${created}/${tasks.length} task creati dalla plenaria.`);
              } catch (_parseErr) {
                log(`[PLENARY] Warning: output plenaria non parsabile: ${plenaryResult.stdout.slice(0, 200)}`);
              }
            } else {
              log(`[PLENARY] Warning: auto-plenary fallito: ${plenaryResult.stderr?.slice(0, 200)}`);
            }
          } catch (e) {
            log(`[PLENARY] Warning: auto-plenary errore: ${e}`);
          }

          writeDaemonState({ lastPlenaryAt: new Date().toISOString() });
        } else {
          log(`[PLENARY] Skip: ultima plenaria meno di 24h fa.`);
        }
      }

      // FASE 4: PING — scrive riassunto in clipboard + file per sessione Claude Code attiva.
      // NIENTE claude -p. NIENTE LLM. Il boss incolla il ping nella chat.
      const sensorOnly = process.argv.includes("--sensor-only");
      const { trigger, reason, actionableCount } = shouldTriggerCME(report);

      if (trigger && !sensorOnly) {
        log(`[EXECUTOR] Trigger CME: ${reason}`);

        // Costruisci ping message compatto
        const criticalHigh = signals.filter(s => !s.requiresHuman && (s.priority === "critical" || s.priority === "high"));
        const medium = signals.filter(s => !s.requiresHuman && s.priority === "medium");
        const pingLines: string[] = [
          `DAEMON PING — ${new Date().toLocaleString("it-IT")}`,
          `Board: ${boardStats.open} open | ${boardStats.inProgress} in-progress | ${boardStats.done} done`,
          `Signal: ${criticalHigh.length} critical/high + ${medium.length} medium`,
          "",
        ];

        if (criticalHigh.length > 0) {
          pingLines.push("PRIORITÀ:");
          for (const s of criticalHigh.slice(0, 5)) {
            pingLines.push(`  [${s.deptId}] ${s.title}`);
          }
          pingLines.push("");
        }

        if (medium.length > 0) {
          pingLines.push(`MEDIUM (top ${Math.min(medium.length, 8)}):`);
          for (const s of medium.slice(0, 8)) {
            pingLines.push(`  [${s.deptId}] ${s.title}`);
          }
          pingLines.push("");
        }

        pingLines.push("Incolla in Claude Code → CME agisce.");
        const pingText = pingLines.join("\n");

        // Scrivi ping su file
        const pingFile = resolve(ROOT, "company", "daemon-ping.txt");
        fs.writeFileSync(pingFile, pingText, "utf-8");

        // Copia in clipboard (Windows: clip, macOS: pbcopy, Linux: xclip)
        try {
          const clipCmd = process.platform === "win32" ? "clip" : process.platform === "darwin" ? "pbcopy" : "xclip";
          spawnSync(clipCmd, [], {
            input: pingText, encoding: "utf-8", timeout: 5000, windowsHide: true,
          });
          log(`[PING] ✅ Copiato in clipboard — Ctrl+V nella chat Claude Code.`);
        } catch {
          log(`[PING] Clipboard non disponibile — leggi company/daemon-ping.txt`);
        }

        // Stampa nel terminale daemon
        console.log("\n" + "=".repeat(60));
        console.log(pingText);
        console.log("=".repeat(60) + "\n");

        writeDaemonState({ consecutiveNoOp: 0 });
      } else if (sensorOnly) {
        log(`[EXECUTOR] Skip (--sensor-only). Signal azionabili: ${actionableCount}`);
      } else {
        log(`[EXECUTOR] Skip: ${reason}`);
        if (!reason.includes("backoff") && !reason.includes("Cooldown")) {
          writeDaemonState({ consecutiveNoOp: 0 });
        }
      }

      // Log rotation
      const rotated = rotateAutorunLogs(LOG_DIR);
      if (rotated > 0) log(`Log rotation: ${rotated} file eliminati.`);

      // Alerting
      try {
        const alertResult = spawnSync('npx', ['tsx', 'scripts/ops-alerting.ts', 'check'], {
          cwd: ROOT, encoding: 'utf-8', timeout: 30000, shell: true, windowsHide: true,
        });
        if (alertResult.stdout) log(`[ALERTING] ${alertResult.stdout.trim()}`);
      } catch (e) {
        log(`[ALERTING] Check failed: ${e}`);
      }

      // Aggiorna stato daemon
      const totalDuration = Date.now() - startTime;
      writeDaemonState({
        lastRun: new Date().toISOString(),
        lastDurationMs: totalDuration,
        lastExitCode: exitCode,
        lastTasksExecuted: trigger && !sensorOnly ? 1 : 0,
        totalRuns: state.totalRuns + 1,
        updatedBy: "cme-autorun-autoalimentante",
      });

      log(`[DONE] ${signals.length} signal, ${report.llmSuggestions.length} suggestions, ${report.alerts.length} alerts. CME triggered: ${trigger && !sensorOnly}`);
    } finally {
      releaseLock();
    }
  };

  if (watchMode) {
    const state = readDaemonState();
    const effectiveInterval = state.intervalMinutes || intervalMin;
    log(`Watch mode [FREE $0.00/ciclo]: sessione ogni ${effectiveInterval} minuti. Ctrl+C per uscire.`);
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
        }
        scheduleNext();
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
  process.exit(1);
});
