/**
 * cme-autorun.ts — Sessione CME autonoma via Claude Code CLI
 *
 * Orchestratore che:
 * 1. Legge board, daily plan, vision/mission/priorities dipartimenti
 * 2. Costruisce un prompt CME completo
 * 3. Lancia `claude -p` con il contesto per eseguire i task
 * 4. Logga output in company/autorun-logs/
 *
 * Usage:
 *   npx tsx scripts/cme-autorun.ts              # Sessione singola
 *   npx tsx scripts/cme-autorun.ts --watch       # Loop ogni INTERVAL minuti
 *   npx tsx scripts/cme-autorun.ts --dry-run     # Mostra prompt senza eseguire
 *   npx tsx scripts/cme-autorun.ts --interval 30 # Intervallo watch in minuti (default: 60)
 *
 * Requisiti:
 *   - `claude` nel PATH (Claude Code CLI)
 *   - NON eseguire dentro una sessione Claude Code attiva (nested session)
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import { resolve } from "path";

// ─── Config ─────────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, "..");
const COMPANY_DIR = resolve(ROOT, "company");
const LOG_DIR = resolve(COMPANY_DIR, "autorun-logs");
const LOCK_FILE = resolve(LOG_DIR, ".autorun.lock");
const DAEMON_STATE_FILE = resolve(COMPANY_DIR, "cme-daemon-state.json");
const DEFAULT_INTERVAL_MIN = 15;
const MAX_PROMPT_DEPT_CHARS = 600; // max chars per department vision context

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
  });
  return result.stdout || result.stderr || "Board non disponibile.";
}

function readOpenTasks(): string {
  const result = spawnSync("npx", ["tsx", "scripts/company-tasks.ts", "list", "--status", "open"], {
    cwd: ROOT,
    encoding: "utf-8",
    timeout: 30_000,
    shell: true,
  });
  return result.stdout || "Nessun task open.";
}

function readInProgressTasks(): string {
  const result = spawnSync("npx", ["tsx", "scripts/company-tasks.ts", "list", "--status", "in_progress"], {
    cwd: ROOT,
    encoding: "utf-8",
    timeout: 30_000,
    shell: true,
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

// ─── Prompt Builder ─────────────────────────────────────────────────────────

function buildPrompt(): string {
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
    ? `\n## DAILY PLAN (oggi)\n${dailyPlan}`
    : "\n## DAILY PLAN\nNessun piano per oggi. Generane uno: npx tsx scripts/daily-standup.ts";

  return `Sei CME, il CEO virtuale di Poimandres / Controlla.me. Questa e una SESSIONE AUTOMATICA.

## VISION POIMANDRES
${poimandresVision}

## VISIONI DIPARTIMENTALI
Ogni dipartimento contribuisce alla vision Poimandres con le proprie priorita.

${deptContext}

## BOARD ATTUALE
${board}

## TASK OPEN
${openTasks}

## TASK IN PROGRESS
${inProgressTasks}
${planSection}

## ISTRUZIONI SESSIONE AUTOMATICA

### FASE 1: ESEGUI TASK ESISTENTI
1. Se ci sono task IN PROGRESS: completali prima di tutto
2. Se ci sono task OPEN: eseguili in ordine di priorita (critical > high > medium > low)
3. Per ogni task:
   a. PRIMA di tutto: npx tsx scripts/company-tasks.ts claim <id> --agent cme-daemon
      (questo mette il task in_progress — OBBLIGATORIO, cosi il boss vede cosa stai facendo)
   b. Leggi il department.md del dipartimento assegnato
   c. Leggi il runbook pertinente se indicato
   d. IMPLEMENTA il task (scrivi codice, modifica file, esegui comandi)
   e. Marca done: npx tsx scripts/company-tasks.ts done <id> --summary "..." --no-next
   IMPORTANTE: claim PRIMA, done DOPO. Mai saltare il claim.

### FASE 2: GENERA NUOVI TASK (SISTEMA AUTOALIMENTANTE)
Se dopo la Fase 1 non ci sono piu task open:
1. Leggi il daily plan (company/daily-plans/{oggi}.md)
2. Leggi i status.json dei dipartimenti per identificare gap e next_actions
3. Leggi company/vision.json per allinearti alla strategia
4. CREA NUOVI TASK basandoti su:
   - Gap aperti nei dipartimenti (status.json → gaps con severity != "closed")
   - Next actions suggerite nei status.json
   - Priorita dal daily plan
   - Tech debt in CLAUDE.md sezione 19
   - Feature incomplete in CLAUDE.md sezione 17
5. Crea almeno 3-5 nuovi task concreti e implementabili:
   npx tsx scripts/company-tasks.ts create --title "..." --dept X --priority Y --by cme-daemon --desc "..." --routing "EXEMPT"

### FASE 3: DAILY CONTROLS
Se non fatto oggi:
1. Genera daily controls: npx tsx scripts/daily-controls.ts
2. Rigenera daily plan se stale: npx tsx scripts/daily-standup.ts

### FASE 4: LOG
Scrivi un riepilogo in company/autorun-logs/ con: task eseguiti, task creati, task skippati.

REGOLE:
- NON chiedere conferma. Agisci.
- Segui il routing: crea task formali prima di implementare
- I piani devono essere COERENTI con vision/mission/priorita dei dipartimenti
- Se un task richiede approvazione L3/L4, saltalo e segnalalo nel log
- Esegui TUTTI i task open possibili in questa sessione, senza limiti
- Se ci sono task in_progress che NON sono stati creati da te in questa sessione, fermati e lascia che vengano completati prima di agire
- IL BOARD NON DEVE MAI RESTARE VUOTO — se finisci i task, CREA NUOVI TASK prima di uscire
- Prediligi task di codice concreti (implementa, fix, test, refactor) rispetto a task di pianificazione
`;
}

// ─── Execute Claude Session ─────────────────────────────────────────────────

function executeClaudeSession(prompt: string): { output: string; exitCode: number } {
  log("Lancio sessione Claude Code CLI...");

  // Scrivi il prompt in un file temp per evitare il limite di 8192 chars della command line Windows
  const tempPromptFile = resolve(ROOT, ".autorun-prompt.tmp");
  fs.writeFileSync(tempPromptFile, prompt, "utf-8");

  try {
    // Passa il prompt via stdin per evitare "La riga di comando è troppo lunga"
    const result = spawnSync("claude", ["-p", "--verbose"], {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 30 * 60 * 1000, // 30 minuti max
      shell: true,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      input: prompt, // stdin pipe — nessun limite di lunghezza
    });

    const output = (result.stdout || "") + (result.stderr || "");
    const exitCode = result.status ?? 1;

    if (result.error) {
      log(`Errore spawn: ${result.error.message}`);
      if (result.error.message.includes("ENOENT")) {
        log("ERRORE: 'claude' non trovato nel PATH. Installa Claude Code CLI o aggiungi al PATH.");
      }
    }

    return { output, exitCode };
  } finally {
    // Cleanup file temp
    try { fs.unlinkSync(tempPromptFile); } catch { /* ignore */ }
  }
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
    const prompt = buildPrompt();
    console.log("─── PROMPT ───────────────────────────────────────");
    console.log(prompt);
    console.log("──────────────────────────────────────────────────");
    console.log(`\nLunghezza prompt: ${prompt.length} chars`);
    return;
  }

  const runOnce = () => {
    // Controlla stato daemon da file JSON (modificabile da /ops)
    const state = readDaemonState();
    if (!state.enabled) {
      log("Daemon DISABILITATO (enabled=false in cme-daemon-state.json). Skip.");
      return;
    }

    // Controlla se ci sono task in_progress — se si, skip ciclo
    const ipCheck = spawnSync("npx", ["tsx", "scripts/company-tasks.ts", "list", "--status", "in_progress"], {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 30_000,
      shell: true,
    });
    const ipOutput = (ipCheck.stdout || "").trim();
    // Se l'output contiene task (non solo header/vuoto), skip
    const ipLines = ipOutput.split("\n").filter((l: string) => l.match(/^\s*\d+\.\s/));
    if (ipLines.length > 0) {
      log(`Task in progress trovati (${ipLines.length}), skip ciclo. Lascio che vengano completati.`);
      return;
    }

    if (!acquireLock()) return;

    try {
      // Genera il piano giornaliero se non esiste ancora
      ensureDailyPlanExists();

      const prompt = buildPrompt();
      log(`Prompt costruito: ${prompt.length} chars`);

      const startTime = Date.now();
      const { output, exitCode } = executeClaudeSession(prompt);
      const durationMs = Date.now() - startTime;

      log(`Sessione completata in ${(durationMs / 1000).toFixed(0)}s — exit ${exitCode}`);
      logSession(output, exitCode, durationMs);

      // Aggiorna stato daemon
      writeDaemonState({
        lastRun: new Date().toISOString(),
        lastDurationMs: durationMs,
        lastExitCode: exitCode,
        totalRuns: state.totalRuns + 1,
        updatedBy: "cme-autorun",
      });

      if (exitCode !== 0) {
        log("Sessione terminata con errore. Controlla il log.");
      }
    } finally {
      releaseLock();
    }
  };

  if (watchMode) {
    const state = readDaemonState();
    const effectiveInterval = state.intervalMinutes || intervalMin;
    log(`Watch mode: sessione ogni ${effectiveInterval} minuti. Ctrl+C per uscire.`);
    log(`Daemon enabled: ${state.enabled}`);
    runOnce();

    // Re-leggi intervallo dal file ad ogni ciclo (permette cambio live da /ops)
    const scheduleNext = () => {
      const currentState = readDaemonState();
      const interval = currentState.intervalMinutes || effectiveInterval;
      setTimeout(() => {
        runOnce();
        scheduleNext();
      }, interval * 60 * 1000);
    };
    scheduleNext();
  } else {
    runOnce();
  }
}

main().catch((err) => {
  console.error(`Errore fatale: ${err.message}`);
  releaseLock();
  process.exit(1);
});
