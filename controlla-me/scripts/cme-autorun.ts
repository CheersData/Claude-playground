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
 *   npx tsx scripts/cme-autorun.ts --scan        # Solo vision scan (mostra actionable items)
 *   npx tsx scripts/cme-autorun.ts --scan --create # Vision scan + crea task sul board
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
const VISION_TRACKER_FILE = resolve(COMPANY_DIR, "vision-scanner-created.json");
const MIN_OPEN_DAEMON_TASKS = 5; // Board should always have at least this many daemon-executable tasks
const MAX_GENERATE_PER_CYCLE = 10; // Max tasks to create per scanner run

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

interface VisionTrackerData {
  created: Record<string, string>; // sourceId → ISO timestamp
  lastScan: string | null;
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

AZIONE IMMEDIATA — fai questo SUBITO, PRIMA di qualsiasi ragionamento:
1. Prendi il PRIMO task open con priorita piu alta (critical > high > medium > low)
2. Claimalo IMMEDIATAMENTE: npx tsx scripts/company-tasks.ts claim <id> --agent cme-daemon
3. Implementalo direttamente (Edit, Write, Bash)
4. Marca done: npx tsx scripts/company-tasks.ts done <id> --summary "..." --no-next

Poi ripeti per il task successivo. Dopo il primo task, puoi parallelizzare:
- Se ci sono 2+ task INDIPENDENTI (file diversi), usa lo strumento Agent per lanciarli in parallelo
- Ogni sub-agente (subagent_type: "general-purpose") riceve: task ID, cosa fare, file da modificare
- Massimo 3 sub-agenti contemporanei
- Claim tutti i task PRIMA di lanciare i sub-agenti

IMPORTANTE: Il primo task deve essere claimato entro 30 secondi dall'inizio della sessione.
Il boss ha PRE-APPROVATO tutti i task sul board. Esegui TUTTI, inclusi L3/L4. Non saltare nulla.
UNICA ECCEZIONE: task con tag "human_required" nel campo tags → saltali e passa al successivo.
Tutti gli altri task DEVONO essere eseguiti. Non classificare task come "boss-dependent" a tuo giudizio.
Se un task sembra difficile, PROVA comunque. Se fallisce, logga l'errore e vai al successivo.

### FASE 2: PIANO NUOVO (SISTEMA AUTOALIMENTANTE)
Se dopo la Fase 1 non ci sono piu task open FATTIBILI (tutti i task rimasti hanno tag "human_required"), NON restare idle. Genera un PIANO NUOVO:
1. Leggi il daily plan (company/daily-plans/{oggi}.md)
2. Leggi i status.json dei dipartimenti: npx tsx scripts/update-dept-status.ts --view --all
3. Leggi company/vision.json per allinearti alla strategia
4. ANALIZZA lo stato reale del codebase:
   - npx tsc --noEmit (errori TypeScript?)
   - npm run build 2>&1 | tail -20 (build rotto?)
   - Controlla tech debt in CLAUDE.md sezione 19
   - Controlla feature incomplete in CLAUDE.md sezione 17
5. CREA 5-10 nuovi task CONCRETI e IMPLEMENTABILI (codice, fix, test, refactor — MAI task vaghi):
   npx tsx scripts/company-tasks.ts create --title "..." --dept X --priority Y --by cme-daemon --desc "..." --routing "EXEMPT"
6. ESEGUI SUBITO i task appena creati (non aspettare la prossima sessione)

### FASE 3: DAILY CONTROLS + ALERTING
Se non fatto oggi:
1. Esegui alerting check: npx tsx scripts/ops-alerting.ts check
2. Genera daily controls: npx tsx scripts/daily-controls.ts
3. Rigenera daily plan se stale: npx tsx scripts/daily-standup.ts

### FASE 4: LOG
Scrivi un riepilogo in company/autorun-logs/ con: task eseguiti, task creati, task skippati.

REGOLE:
- NON chiedere conferma. Agisci.
- DELEGA ai sub-agenti. Tu sei CME, un router — lanci Agent tool e raccogli risultati.
- USA PARALLELISMO AGGRESSIVO: task indipendenti = sempre sub-agenti paralleli in un singolo blocco tool_use
- Segui il routing: crea task formali prima di implementare
- I piani devono essere COERENTI con vision/mission/priorita dei dipartimenti
- Il boss ha pre-approvato TUTTI i task. Esegui anche L3/L4. Salta SOLO task con tag "human_required"
- Esegui TUTTI i task open possibili in questa sessione, senza limiti
- Se ci sono task in_progress che NON sono stati creati da te in questa sessione, fermati e lascia che vengano completati prima di agire
- IL BOARD NON DEVE MAI RESTARE VUOTO — se finisci i task, CREA NUOVI TASK prima di uscire
- Prediligi task di codice concreti (implementa, fix, test, refactor) rispetto a task di pianificazione
- Ogni sub-agente deve ricevere contesto COMPLETO: path dei file, cosa modificare, il dipartimento owner
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

// ─── Task Counter ────────────────────────────────────────────────────────────

function countCompletedTasks(output: string): number {
  const doneMatches = output.match(/company-tasks\.ts\s+done/g);
  return doneMatches ? doneMatches.length : 0;
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

function mapDeptName(dirName: string): string {
  const valid = new Set([
    "ufficio-legale", "trading", "data-engineering", "quality-assurance",
    "architecture", "finance", "operations", "security",
    "strategy", "marketing", "ux-ui", "protocols", "acceleration",
  ]);
  return valid.has(dirName) ? dirName : "architecture";
}

function readVisionTracker(): VisionTrackerData {
  try {
    return JSON.parse(fs.readFileSync(VISION_TRACKER_FILE, "utf-8"));
  } catch {
    return { created: {}, lastScan: null };
  }
}

function writeVisionTracker(data: VisionTrackerData): void {
  fs.writeFileSync(VISION_TRACKER_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

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

/**
 * Counts open tasks that the daemon can actually execute (no human_required tag)
 */
function countDaemonExecutableOpenTasks(): number {
  const result = spawnSync(
    "npx", ["tsx", "scripts/company-tasks.ts", "list", "--status", "open"],
    { cwd: ROOT, encoding: "utf-8", timeout: 30_000, shell: true }
  );
  const output = result.stdout || "";
  const taskBlocks = output.split(/\[open\]/g).slice(1);
  let executable = 0;
  for (const block of taskBlocks) {
    if (!block.includes("human_required")) executable++;
  }
  return executable;
}

/**
 * Main auto-generation function: scans dept visions, creates tasks if board is low.
 * Runs BEFORE the Claude session to ensure the daemon always has work.
 */
function autoGenerateTasks(): number {
  const executableCount = countDaemonExecutableOpenTasks();

  if (executableCount >= MIN_OPEN_DAEMON_TASKS) {
    log(`[VISION] Board ha ${executableCount} task eseguibili (min: ${MIN_OPEN_DAEMON_TASKS}). Skip generazione.`);
    return 0;
  }

  const needed = Math.max(MIN_OPEN_DAEMON_TASKS - executableCount, 3);
  log(`[VISION] Board ha ${executableCount} task eseguibili. Servono almeno ${needed} nuovi task.`);

  // Scan departments
  const allItems = scanDepartmentStatus();
  const uniqueDepts = new Set(allItems.map((i) => i.deptId)).size;
  log(`[VISION] Trovati ${allItems.length} actionable items da ${uniqueDepts} dipartimenti.`);

  // Sort: daemon-executable first, then by priority
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  allItems.sort((a, b) => {
    if (a.requiresHuman !== b.requiresHuman) return a.requiresHuman ? 1 : -1;
    return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
  });

  // Load dedup tracker
  const tracker = readVisionTracker();
  let created = 0;

  for (const item of allItems) {
    if (created >= Math.min(needed + 2, MAX_GENERATE_PER_CYCLE)) break;

    // Skip if already created in a previous cycle
    if (tracker.created[item.sourceId]) continue;

    // Build tags
    const tags = [`auto:${item.sourceId}`];
    if (item.requiresHuman) tags.push("human_required");

    const deptName = mapDeptName(item.deptId);
    const args = [
      "tsx", "scripts/company-tasks.ts", "create",
      "--title", item.title,
      "--dept", deptName,
      "--priority", item.priority,
      "--by", "vision-scanner",
      "--desc", item.description.slice(0, 500),
      "--routing-exempt",
      "--routing-reason", `Auto-generated from ${item.deptId}/status.json (${item.sourceId})`,
      "--tags", tags.join(","),
    ];

    const result = spawnSync("npx", args, {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 15_000,
      shell: true,
    });

    if (result.status === 0) {
      created++;
      tracker.created[item.sourceId] = new Date().toISOString();
      const humanTag = item.requiresHuman ? " [human_required]" : "";
      log(`  → Creato: [${item.priority}] ${item.title} (${deptName})${humanTag}`);
    } else {
      const err = (result.stderr || "").split("\n").pop() || "unknown error";
      log(`  → ERRORE creazione task "${item.title}": ${err.slice(0, 120)}`);
    }
  }

  // Save tracker
  tracker.lastScan = new Date().toISOString();
  writeVisionTracker(tracker);

  log(`[VISION] Creati ${created} nuovi task. Tracker aggiornato.`);
  return created;
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

  // Scan-only mode: run vision scanner without starting a Claude session
  if (args.includes("--scan")) {
    log("Modo scan: eseguo solo il vision scanner.\n");
    const items = scanDepartmentStatus();
    const tracker = readVisionTracker();
    console.log(`\n─── VISION SCAN ─────────────────────────────────`);
    console.log(`Actionable items trovati: ${items.length}`);
    console.log(`Già creati (tracker): ${Object.keys(tracker.created).length}`);
    console.log(`Ultimo scan: ${tracker.lastScan || "mai"}\n`);

    const newItems = items.filter((i) => !tracker.created[i.sourceId]);
    const daemonExec = newItems.filter((i) => !i.requiresHuman);
    const humanReq = newItems.filter((i) => i.requiresHuman);

    console.log(`Nuovi (non ancora creati): ${newItems.length}`);
    console.log(`  → Daemon-executable: ${daemonExec.length}`);
    console.log(`  → Human-required: ${humanReq.length}\n`);

    if (daemonExec.length > 0) {
      console.log("─── DAEMON-EXECUTABLE ──────────────────────────");
      for (const item of daemonExec.slice(0, 15)) {
        console.log(`  [${item.priority}] ${item.deptId} | ${item.title}`);
      }
    }
    if (humanReq.length > 0) {
      console.log("\n─── HUMAN-REQUIRED ─────────────────────────────");
      for (const item of humanReq.slice(0, 10)) {
        console.log(`  [${item.priority}] ${item.deptId} | ${item.title}`);
      }
    }

    // If --scan --create, actually create the tasks
    if (args.includes("--create")) {
      console.log("\n─── CREATING TASKS ─────────────────────────────");
      const created = autoGenerateTasks();
      console.log(`\nCreati: ${created} task.`);
    }

    console.log("──────────────────────────────────────────────────");
    return;
  }

  const runOnce = () => {
    // Controlla stato daemon da file JSON (modificabile da /ops)
    const state = readDaemonState();
    if (!state.enabled) {
      log("Daemon DISABILITATO (enabled=false in cme-daemon-state.json). Skip.");
      return;
    }

    // Controlla task in_progress — auto-unclaim quelli stale (>30min, assegnati al daemon)
    const ipCheck = spawnSync("npx", ["tsx", "scripts/company-tasks.ts", "list", "--status", "in_progress"], {
      cwd: ROOT,
      encoding: "utf-8",
      timeout: 30_000,
      shell: true,
    });
    const ipOutput = (ipCheck.stdout || "").trim();
    // Estrai task ID e controlla se sono stale
    const ipTaskIds = [...ipOutput.matchAll(/id:\s+([a-f0-9]+)/g)].map(m => m[1]);
    const ipAssignedToDaemon = ipOutput.includes("cme-daemon");

    if (ipTaskIds.length > 0) {
      if (ipAssignedToDaemon) {
        // Auto-unclaim: se il daemon ha task in_progress da una sessione precedente,
        // li rimette in open (la sessione che li aveva claimati è già terminata)
        log(`Task in_progress del daemon trovati (${ipTaskIds.length}). Auto-unclaim task stale...`);
        for (const tid of ipTaskIds) {
          spawnSync("npx", [
            "tsx", "scripts/company-tasks.ts", "update", tid,
            "--status", "open", "--assigned", "",
          ], { cwd: ROOT, encoding: "utf-8", timeout: 15_000, shell: true });
          log(`  → ${tid} rimesso in open.`);
        }
      } else {
        // Task in_progress di qualcun altro (sessione interattiva CME) → skip
        log(`Task in progress di altri agenti (${ipTaskIds.length}), skip ciclo.`);
        return;
      }
    }

    if (!acquireLock()) return;

    try {
      // Genera il piano giornaliero se non esiste ancora
      ensureDailyPlanExists();

      // VISION SCANNER: auto-genera task dalle visioni dei dipartimenti
      // Gira PRIMA della sessione Claude per garantire che il board abbia sempre lavoro
      const generatedCount = autoGenerateTasks();
      if (generatedCount > 0) {
        log(`[VISION] ${generatedCount} nuovi task creati. Board alimentato.`);
      }

      const prompt = buildPrompt();
      log(`Prompt costruito: ${prompt.length} chars`);

      const startTime = Date.now();
      const { output, exitCode } = executeClaudeSession(prompt);
      const durationMs = Date.now() - startTime;

      log(`Sessione completata in ${(durationMs / 1000).toFixed(0)}s — exit ${exitCode}`);
      logSession(output, exitCode, durationMs);

      // Log rotation: elimina log piu vecchi di 7 giorni
      const rotated = rotateAutorunLogs(LOG_DIR);
      if (rotated > 0) {
        log(`Log rotation: ${rotated} file eliminati (>7 giorni).`);
      }

      // PHASE 3: Daily Controls + Alerting
      try {
        const alertResult = spawnSync('npx', ['tsx', 'scripts/ops-alerting.ts', 'check'], {
          cwd: ROOT,
          encoding: 'utf-8',
          timeout: 30000,
          shell: true,
        });
        if (alertResult.stdout) {
          log(`[PHASE 3] Alerting: ${alertResult.stdout.trim()}`);
        }
      } catch (e) {
        log(`[PHASE 3] Alerting check failed: ${e}`);
      }

      // Aggiorna stato daemon
      const tasksCompleted = countCompletedTasks(output);
      writeDaemonState({
        lastRun: new Date().toISOString(),
        lastDurationMs: durationMs,
        lastExitCode: exitCode,
        lastTasksExecuted: tasksCompleted,
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
