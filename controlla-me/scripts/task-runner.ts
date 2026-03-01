/**
 * task-runner.ts — Autonomous task runner per la virtual company CME.
 *
 * Logica:
 *   1. Se esistono task in_progress → EXIT (batch già in corso, non sovrapporre)
 *   2. Se esistono task open → claim top 10 per priorità, esegui via `claude -p`, marca done/blocked
 *   3. Se in_progress E open sono entrambi vuoti → convoca tutti i dipartimenti, genera
 *      Sprint N, metti i task in status "review" per approvazione del boss
 *
 * I sprint richiedono APPROVAZIONE ESPLICITA del boss prima di diventare operativi.
 * Report di tutti i dipartimenti inclusi nel file sprint.
 *
 * Usage:
 *   npx tsx scripts/task-runner.ts           # single run
 *   npx tsx scripts/task-runner.ts --watch   # loop ogni 5 minuti
 *
 * NOTA: Deve essere eseguito da un terminale ESTERNO — le sessioni annidate
 *       non sono supportate per `claude -p` (CLAUDE.md regola assoluta).
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import * as fs from "fs";
import { spawnSync } from "child_process";
import {
  getTaskBoard,
  getOpenTasks,
  claimTask,
  updateTask,
  createTask,
} from "../lib/company/tasks";
import type { Task, TaskPriority, Department } from "../lib/company/types";

// ─── Config ───

const WATCH_INTERVAL_MS = 5 * 60 * 1000; // 5 minuti
const MAX_TASKS_PER_RUN = 10;
const COMPANY_DIR = path.resolve(__dirname, "../company");
const SPRINTS_DIR = path.join(COMPANY_DIR, "sprints");
const SPRINT_COUNTER_FILE = path.join(SPRINTS_DIR, ".sprint-counter");
const LOG_FILE = path.join(COMPANY_DIR, "task-runner-log.md");
const NOTIFICATION_FILE = path.join(COMPANY_DIR, "NOTIFICATION.md");

const DEPARTMENTS: Department[] = [
  "ufficio-legale",
  "data-engineering",
  "quality-assurance",
  "architecture",
  "finance",
  "operations",
  "security",
  "strategy",
  "marketing",
];

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// ─── Logging ───

function log(msg: string): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + "\n");
}

// ─── Sprint counter ───

function getNextSprintNumber(): number {
  if (!fs.existsSync(SPRINT_COUNTER_FILE)) return 1;
  const raw = fs.readFileSync(SPRINT_COUNTER_FILE, "utf-8").trim();
  const n = parseInt(raw, 10);
  return isNaN(n) ? 1 : n + 1;
}

function saveSprintNumber(n: number): void {
  fs.writeFileSync(SPRINT_COUNTER_FILE, String(n), "utf-8");
}

// ─── Claude CLI ───

/**
 * Chiama `claude -p` con il prompt dato.
 * Usa spawnSync (array di args) per evitare problemi di shell escaping cross-platform.
 * DEVE essere eseguito da terminale esterno (no sessioni annidate — CLAUDE.md).
 */
function callClaude(prompt: string, timeoutMs = 120_000): string {
  // claude -p legge da stdin: echo "prompt" | claude -p
  const result = spawnSync("claude", ["-p"], {
    input: prompt,           // passa il prompt via stdin
    encoding: "utf-8",
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
    shell: true,             // necessario su Windows per risolvere claude.cmd
  });

  if (result.error) throw result.error;

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? "";
    const stdout = result.stdout?.trim() ?? "";
    throw new Error(
      `claude -p exit ${result.status}${stderr ? ` | stderr: ${stderr.slice(0, 300)}` : ""}${stdout ? ` | stdout: ${stdout.slice(0, 300)}` : ""}`
    );
  }

  return result.stdout?.trim() ?? "";
}

// ─── Utilities ───

function sortByPriority(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  );
}

function readFileSafe(filePath: string, maxChars = 800): string {
  if (!fs.existsSync(filePath)) return "";
  const content = fs.readFileSync(filePath, "utf-8");
  return content.length > maxChars
    ? content.slice(0, maxChars) + "\n[...troncato...]"
    : content;
}

function writeNotification(content: string): void {
  fs.writeFileSync(NOTIFICATION_FILE, content, "utf-8");
  log(`📄 Notifica scritta in: company/NOTIFICATION.md`);
}

// ─── Task Execution ───

function buildTaskPrompt(task: Task): string {
  return `Sei un agente AI che lavora per CME (Controlla.Me virtual company) nel dipartimento "${task.department}".

Devi completare il seguente task:

TASK ID: ${task.id.slice(0, 8)}
TITOLO: ${task.title}
PRIORITÀ: ${task.priority}
DIPARTIMENTO: ${task.department}
DESCRIZIONE:
${task.description ?? "(nessuna descrizione fornita)"}

CONTESTO PROGETTO:
controlla.me è un'app di analisi legale AI (Next.js 15, TypeScript, 7 agenti AI, 7 provider AI,
tier system, vector DB pgvector, corpus legislativo italiano ~5600 articoli).
Codebase: ${path.resolve(__dirname, "..").replace(/\\/g, "/")}

ISTRUZIONE:
Esegui il task in modo autonomo. Scrivi il codice, leggi i file, fai le modifiche necessarie.
Alla fine, rispondi con un breve summary (max 300 parole) di cosa hai fatto.`;
}

async function executeTask(
  task: Task
): Promise<{ success: boolean; summary: string }> {
  const start = Date.now();
  log(`  → Eseguendo [${task.priority}] ${task.title}`);

  try {
    const prompt = buildTaskPrompt(task);
    const output = callClaude(prompt, 180_000); // 3 min per task
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log(`     ✅ Completato in ${elapsed}s`);
    return { success: true, summary: output.slice(0, 1500) };
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const errMsg = err instanceof Error ? err.message : String(err);
    log(`     ❌ Errore dopo ${elapsed}s: ${errMsg.slice(0, 200)}`);
    return {
      success: false,
      summary: `ERRORE ESECUZIONE (${elapsed}s): ${errMsg.slice(0, 400)}`,
    };
  }
}

// ─── Sprint Planning (quando backlog è vuoto) ───

/**
 * Genera il report di un singolo dipartimento via `claude -p`.
 * Legge il department.md come contesto.
 */
function generateDeptReport(dept: Department, deptContext: string): string {
  const prompt = `Sei il responsabile del dipartimento "${dept}" di Controlla.Me, app di analisi legale AI.

CONTESTO DIPARTIMENTO:
${deptContext || "(nessun file department.md trovato)"}

PROGETTO: controlla.me — analisi legale AI, Next.js 15, TypeScript, 7 agenti AI multi-provider,
tier system, vector DB, corpus legislativo italiano ~5600 articoli.

COMPITO: Genera un report breve (max 200 parole) con:
1. Stato attuale del dipartimento
2. Principali aree di miglioramento
3. 3-5 task concreti da eseguire nel prossimo sprint (titolo + descrizione breve)

Formato risposta:
STATO: [una riga]
AREE: [bullet points]
TASK PROPOSTI:
- [titolo]: [descrizione breve]
- ...`;

  try {
    return callClaude(prompt, 60_000);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return `[Errore generazione report: ${errMsg.slice(0, 150)}]`;
  }
}

interface ProposedTask {
  title: string;
  description: string;
  department: Department;
  priority: TaskPriority;
}

/**
 * Sintetizza tutti i report dipartimentali in un piano sprint strutturato.
 * Ritorna i task come array da creare in status "review".
 */
function synthesizeSprintPlan(
  sprintNumber: number,
  reports: Record<Department, string>
): ProposedTask[] {
  const reportsText = DEPARTMENTS.map(
    (dept) => `### ${dept}\n${reports[dept] ?? "(nessun report)"}`
  ).join("\n\n");

  const prompt = `Sei CME, CEO di Controlla.Me (app analisi legale AI).

Stai pianificando lo Sprint ${sprintNumber}.

Hai ricevuto i report di tutti i dipartimenti:

${reportsText}

PROGETTO: controlla.me — Next.js 15, TypeScript, 7 agenti AI, tier system, vector DB, corpus legislativo.

COMPITO: Sintetizza i report e crea il piano per lo Sprint ${sprintNumber} con 10-15 task concreti e prioritizzati.
Seleziona le attività più impattanti e urgenti tra quelle proposte dai dipartimenti.

Rispondi con SOLO un array JSON (nessun testo prima o dopo):
[
  {
    "title": "Titolo task conciso (max 80 chars)",
    "description": "Descrizione esplicativa: cosa fare e perché. Min 50 chars.",
    "department": "nome-dipartimento",
    "priority": "critical|high|medium|low"
  }
]

Dipartimenti validi: ${DEPARTMENTS.join(", ")}`;

  try {
    const output = callClaude(prompt, 90_000);

    const jsonMatch = output.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      log("⚠️  Nessun JSON trovato nella risposta del piano sprint.");
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      title: string;
      description: string;
      department: string;
      priority: string;
    }>;

    return parsed
      .filter((t) => t.title && t.description && t.department)
      .map((t) => ({
        title: t.title.slice(0, 80),
        description: t.description,
        department: (DEPARTMENTS.includes(t.department as Department)
          ? t.department
          : "operations") as Department,
        priority: (["critical", "high", "medium", "low"].includes(t.priority)
          ? t.priority
          : "medium") as TaskPriority,
      }));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    log(`❌ Errore sintesi sprint: ${errMsg.slice(0, 200)}`);
    return [];
  }
}

async function runSprintPlanning(): Promise<void> {
  const sprintNumber = getNextSprintNumber();
  const sprintLabel = `Sprint ${sprintNumber}`;
  const sprintDate = new Date().toISOString().split("T")[0];

  log(`🏃 Backlog vuoto — avvio pianificazione ${sprintLabel} (${sprintDate})`);
  log(`   Raccolta report da ${DEPARTMENTS.length} dipartimenti...`);

  // 1. Report per ogni dipartimento
  const reports: Partial<Record<Department, string>> = {};

  for (const dept of DEPARTMENTS) {
    log(`  📝 Report: ${dept}`);
    const deptFile = path.join(COMPANY_DIR, dept, "department.md");
    const deptContext = readFileSafe(deptFile, 1000);
    reports[dept] = generateDeptReport(dept, deptContext);
  }

  log(`  🧠 Sintesi report → piano ${sprintLabel}...`);

  // 2. Sintetizza piano sprint
  const proposedTasks = synthesizeSprintPlan(
    sprintNumber,
    reports as Record<Department, string>
  );

  if (proposedTasks.length === 0) {
    log("⚠️  Nessun task generato. Controlla il log per dettagli.");
    writeNotification(
      `# ⚠️ ${sprintLabel} — ${sprintDate}\n\nErrore: nessun task generato.\nControlla \`company/task-runner-log.md\` per dettagli.\n`
    );
    return;
  }

  // 3. Crea task in status "review" (APPROVAZIONE BOSS OBBLIGATORIA)
  let created = 0;
  const createdTasks: (ProposedTask & { id: string })[] = [];

  for (const t of proposedTasks) {
    try {
      const task = await createTask({
        title: t.title,
        description: t.description,
        department: t.department,
        priority: t.priority,
        status: "review", // ← boss deve approvare
        createdBy: "task-runner",
        labels: [sprintLabel.toLowerCase().replace(" ", "-")], // es. "sprint-3"
      });
      created++;
      createdTasks.push({ ...t, id: task.id });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`  ⚠️  Errore creazione task "${t.title}": ${errMsg.slice(0, 150)}`);
    }
  }

  // 4. Salva sprint file in company/sprints/sprint-NNN.md
  const sprintPadded = String(sprintNumber).padStart(3, "0");
  const sprintFile = path.join(SPRINTS_DIR, `sprint-${sprintPadded}.md`);

  const reportsSection = DEPARTMENTS.map(
    (dept) => `## 📋 ${dept}\n\n${reports[dept] ?? "(nessun report)"}`
  ).join("\n\n---\n\n");

  const taskTable = createdTasks
    .map(
      (t) =>
        `| \`${t.id.slice(0, 8)}\` | ${t.priority} | ${t.department} | ${t.title} |`
    )
    .join("\n");

  const sprintContent = `# ${sprintLabel} — ${sprintDate}
> Status: **IN ATTESA DI APPROVAZIONE** 🔴

## Come approvare

Revisionare i task qui sotto e approvare quelli che si vogliono eseguire:
\`\`\`bash
# Vedere tutti i task in review
npx tsx scripts/company-tasks.ts list --status review

# Approvare un task (lo mette open → entra nel prossimo batch)
npx tsx scripts/company-tasks.ts update <id> --status open

# Rifiutare un task
npx tsx scripts/company-tasks.ts update <id> --status blocked
\`\`\`

## Task proposti (${created} totali)

| ID | Priorità | Dipartimento | Titolo |
|----|----------|-------------|--------|
${taskTable}

### Dettaglio task

${createdTasks.map((t) => `### \`${t.id.slice(0, 8)}\` [${t.priority.toUpperCase()}] ${t.title}\n**Dipartimento:** ${t.department}\n\n${t.description}`).join("\n\n")}

---

# Report Dipartimentali

${reportsSection}

---
*${sprintLabel} generato da task-runner il ${new Date().toISOString()}*
`;

  fs.writeFileSync(sprintFile, sprintContent, "utf-8");
  log(`📄 Sprint salvato: company/sprints/sprint-${sprintPadded}.md`);

  // 5. Aggiorna counter e notifica
  saveSprintNumber(sprintNumber);

  const notification = `# 🏃 ${sprintLabel} pronto — Approvazione richiesta

> Data: ${sprintDate} | Task proposti: ${created}

**Il ${sprintLabel} è in attesa della tua approvazione.**

I report di tutti i ${DEPARTMENTS.length} dipartimenti sono stati raccolti.
${created} task sono stati generati e sono in status \`review\`.

## Azione richiesta

Leggi il piano completo:
\`\`\`
company/sprints/sprint-${sprintPadded}.md
\`\`\`

Poi approva i task che vuoi eseguire:
\`\`\`bash
npx tsx scripts/company-tasks.ts list --status review
npx tsx scripts/company-tasks.ts update <id> --status open
\`\`\`

*Task-runner riprenderà il batch al prossimo run (ogni 5 minuti in modalità --watch).*
`;

  writeNotification(notification);
  log(
    `📢 NOTIFICA BOSS: ${sprintLabel} pronto — ${created} task in review (company/sprints/sprint-${sprintPadded}.md)`
  );
}

// ─── Main run logic ───

async function runOnce(): Promise<void> {
  const runStart = Date.now();
  log("🔍 Checking task board...");

  const board = await getTaskBoard();

  // REGOLA 1: Task in_progress → non sovrapporre
  if (board.inProgress.length > 0) {
    log(
      `⏸️  ${board.inProgress.length} task già in corso — skip (no overlap).`
    );
    for (const t of board.inProgress.slice(0, 5)) {
      log(
        `   → [in_progress] ${t.title.slice(0, 60)} (${t.assignedTo ?? "?"}) — ${t.id.slice(0, 8)}`
      );
    }
    return;
  }

  // REGOLA 2: Nessun task open → pianifica prossimo sprint
  if (board.byStatus.open === 0) {
    await runSprintPlanning();
    return;
  }

  // REGOLA 3: Prendi top N task per priorità, esegui via claude -p
  const allOpen = await getOpenTasks({ status: "open", limit: 200 });
  const sorted = sortByPriority(allOpen);
  const batch = sorted.slice(0, MAX_TASKS_PER_RUN);

  log(
    `📋 ${allOpen.length} task open — batch di ${batch.length} (${batch.map((t) => `${t.priority}`).join(", ")})`
  );

  const results: Array<{
    task: Task;
    success: boolean;
    summary: string;
  }> = [];

  for (const task of batch) {
    await claimTask(task.id, "task-runner");

    const result = await executeTask(task);
    results.push({ task, ...result });

    if (result.success) {
      await updateTask(task.id, {
        status: "done",
        resultSummary: result.summary,
      });
    } else {
      await updateTask(task.id, {
        status: "blocked",
        resultSummary: result.summary,
      });
    }
  }

  const done = results.filter((r) => r.success).length;
  const blocked = results.filter((r) => !r.success).length;
  const elapsed = ((Date.now() - runStart) / 1000).toFixed(0);
  const remaining = allOpen.length - batch.length;

  log(
    `\n📢 BATCH COMPLETATO in ${elapsed}s: ${done} ✅ done, ${blocked} ❌ blocked`
  );
  if (remaining > 0) {
    log(
      `   ${remaining} task open rimasti — verranno processati al prossimo run`
    );
  }

  // Notifica batch
  const taskLines = results.map((r) => {
    const icon = r.success ? "✅" : "❌";
    const summary =
      r.summary.length > 200 ? r.summary.slice(0, 200) + "…" : r.summary;
    return `### ${icon} ${r.task.title}\n- **ID**: \`${r.task.id.slice(0, 8)}\`\n- **Priorità**: ${r.task.priority} | **Dipartimento**: ${r.task.department}\n- **Risultato**: ${summary}`;
  });

  const notification = `# 🤖 Task Runner — Batch completato
> ${new Date().toISOString()} | Durata: ${elapsed}s

| ✅ Done | ❌ Blocked | 📋 Remaining |
|--------|-----------|-------------|
| ${done} | ${blocked} | ${remaining} |

## Dettaglio

${taskLines.join("\n\n")}

---
Esegui \`npx tsx scripts/company-tasks.ts board\` per lo stato completo.
`;

  writeNotification(notification);
}

// ─── Entry point ───

async function main(): Promise<void> {
  const isWatch = process.argv.includes("--watch");

  // Init dirs e log
  if (!fs.existsSync(SPRINTS_DIR)) {
    fs.mkdirSync(SPRINTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(
      LOG_FILE,
      `# Task Runner Log\n\nCreato: ${new Date().toISOString()}\n\n`,
      "utf-8"
    );
  }

  log("═══════════════════════════════════════════════════════");
  log(
    `🚀 Task Runner CME${isWatch ? ` — watch mode (ogni ${WATCH_INTERVAL_MS / 60000} min)` : " — single run"}`
  );
  log("═══════════════════════════════════════════════════════");

  if (isWatch) {
    await runOnce().catch((err: Error) =>
      log(`❌ Errore run: ${err.message}`)
    );

    const scheduleNext = (): void => {
      log(
        `⏳ Prossimo run tra ${WATCH_INTERVAL_MS / 60000} minuti...`
      );
      setTimeout(async () => {
        await runOnce().catch((err: Error) =>
          log(`❌ Errore run: ${err.message}`)
        );
        scheduleNext();
      }, WATCH_INTERVAL_MS);
    };

    scheduleNext();
  } else {
    await runOnce();
    log("✓ Single run completato.");
  }
}

main().catch((err: Error) => {
  console.error("Errore fatale:", err.message);
  process.exit(1);
});
