/**
 * task-runner-api.ts — Task runner via API diretta (ADR-009)
 *
 * Usa agent-runner con catena di fallback free-tier:
 *   Gemini Flash → Cerebras → Groq → Mistral
 *
 * Vantaggi rispetto al task-runner.ts (CLI):
 * - Zero consumo subscription (modelli free)
 * - Fallback automatico su provider errors/429
 * - Cost logging automatico (agent_cost_log)
 * - Funziona in ambiente demo senza `claude` nel PATH
 *
 * Usage:
 *   npx tsx scripts/task-runner-api.ts --task-id <id>      # singolo task
 *   npx tsx scripts/task-runner-api.ts --dept <dept>        # tutti open del dipartimento
 *   npx tsx scripts/task-runner-api.ts --all                # tutti open
 *
 * NOTA: Usa agent-runner direttamente — non serve claude CLI.
 */

import * as dotenv from "dotenv";
import { resolve } from "path";
import * as fs from "fs";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { runAgent } from "../lib/ai-sdk/agent-runner";
import {
  getTask,
  getOpenTasks,
  claimTask,
  updateTask,
} from "../lib/company/tasks";
import type { Task, Department } from "../lib/company/types";

// ─── Config ───

const MAX_TASKS_PER_RUN = 10;
const COMPANY_DIR = resolve(__dirname, "../company");

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

// ─── Lettura context dipartimento ───

function getDepartmentContext(dept: string): string {
  const deptFile = resolve(COMPANY_DIR, dept, "department.md");
  try {
    return fs.readFileSync(deptFile, "utf-8").slice(0, 2000);
  } catch {
    return `Dipartimento: ${dept}`;
  }
}

// ─── Esecuzione task ───

interface TaskResult {
  success: boolean;
  summary: string;
  recommendations?: string[];
}

async function executeTask(task: Task): Promise<{ success: boolean; summary: string }> {
  const start = Date.now();
  log(`  → Esecuzione [${task.priority}] ${task.title}`);

  const deptContext = getDepartmentContext(task.department);

  const prompt = `Sei un agente AI della virtual company Controlla.me (app analisi legale AI).

CONTESTO DIPARTIMENTO:
${deptContext}

TASK DA ESEGUIRE:
- Titolo: ${task.title}
- Descrizione: ${task.description ?? "Nessuna descrizione."}
- Dipartimento: ${task.department}
- Priorità: ${task.priority}

Esegui il task e rispondi con JSON puro (no markdown, no backtick):
{
  "success": true,
  "summary": "Resoconto concreto di cosa hai analizzato/proposto (max 400 parole)",
  "recommendations": ["Azione 1", "Azione 2"]
}

Sii diretto e concreto. No intro generiche. Produci output utile e azionabile.`;

  try {
    const result = await runAgent<TaskResult>("task-executor", prompt, {
      maxTokens: 4096,
      temperature: 0.2,
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const modelUsed = result.usedModelKey;
    const fallback = result.usedFallback ? " (fallback)" : "";

    log(`     ✓ Completato in ${elapsed}s — ${modelUsed}${fallback}`);

    return {
      success: result.parsed.success !== false,
      summary: result.parsed.summary ?? "Task eseguito senza output strutturato.",
    };
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const errMsg = err instanceof Error ? err.message : String(err);
    log(`     ✗ Errore dopo ${elapsed}s: ${errMsg.slice(0, 200)}`);
    return {
      success: false,
      summary: `ERRORE ESECUZIONE (${elapsed}s): ${errMsg.slice(0, 400)}`,
    };
  }
}

// ─── MAIN ───

async function main() {
  const args = process.argv.slice(2);

  const taskIdIdx = args.indexOf("--task-id");
  const deptIdx = args.indexOf("--dept");
  const allMode = args.includes("--all");

  let tasks: Task[] = [];

  if (taskIdIdx !== -1 && args[taskIdIdx + 1]) {
    const taskId = args[taskIdIdx + 1];
    const task = await getTask(taskId);
    if (!task) {
      console.error(`Task ${taskId} non trovato.`);
      process.exit(1);
    }
    tasks = [task];
  } else if (deptIdx !== -1 && args[deptIdx + 1]) {
    const dept = args[deptIdx + 1] as Department;
    tasks = await getOpenTasks({ department: dept, status: "open", limit: MAX_TASKS_PER_RUN });
  } else if (allMode) {
    tasks = await getOpenTasks({ status: "open", limit: MAX_TASKS_PER_RUN });
  } else {
    console.log(`
task-runner-api — Esecuzione task via API free (ADR-009)

Usage:
  npx tsx scripts/task-runner-api.ts --task-id <id>    Singolo task
  npx tsx scripts/task-runner-api.ts --dept <dept>     Tutti open del dipartimento
  npx tsx scripts/task-runner-api.ts --all             Tutti open (max ${MAX_TASKS_PER_RUN})

Catena fallback: Gemini Flash → Cerebras → Groq → Mistral (tutti free tier)
    `);
    process.exit(0);
  }

  if (tasks.length === 0) {
    log("Nessun task da eseguire.");
    return;
  }

  log(`=== Task Runner API (free tier) — ${tasks.length} task ===\n`);

  let completed = 0;
  let failed = 0;

  for (const task of tasks) {
    // Claim task
    try {
      await claimTask(task.id, "task-runner-api");
    } catch {
      log(`  ⚠ Task ${task.id.slice(0, 8)} già claimed, skip.`);
      continue;
    }

    // Execute
    const result = await executeTask(task);

    // Update status
    if (result.success) {
      await updateTask(task.id, {
        status: "done",
        resultSummary: result.summary,
      });
      completed++;
    } else {
      await updateTask(task.id, {
        status: "blocked",
        resultSummary: result.summary,
      });
      failed++;
    }
  }

  log(`\n=== Riepilogo: ${completed} completati, ${failed} bloccati ===`);
}

main().catch((err) => {
  console.error("Errore fatale:", err.message);
  process.exit(1);
});
