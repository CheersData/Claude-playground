/**
 * CLI Company Tasks — Interfaccia CLI per CME e agenti.
 *
 * Usage:
 *   npx tsx scripts/company-tasks.ts board
 *   npx tsx scripts/company-tasks.ts list [--dept <dept>] [--status <status>] [--by <creator>]
 *   npx tsx scripts/company-tasks.ts create --title "..." --dept <dept> [--priority <p>] --by <creator> [--desc "..."]
 *   npx tsx scripts/company-tasks.ts get <id>
 *   npx tsx scripts/company-tasks.ts claim <id> --agent <agent>
 *   npx tsx scripts/company-tasks.ts done <id> [--summary "..."]
 *   npx tsx scripts/company-tasks.ts update <id> --status <status>
 */

import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import {
  createTask,
  claimTask,
  updateTask,
  getTask,
  getOpenTasks,
  getTaskBoard,
} from "../lib/company/tasks";
import type { Department, TaskPriority, TaskStatus } from "../lib/company/types";

const args = process.argv.slice(2);
const command = args[0];

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

/** Resolve partial UUID (prefix match) to full UUID. */
async function resolveId(partial: string): Promise<string> {
  if (partial.length >= 36) return partial;
  const all = await getOpenTasks({ limit: 200 });
  const matches = all.filter((t) => t.id.startsWith(partial));
  if (matches.length === 0) {
    // Try also in done tasks
    const task = await getTask(partial);
    if (task) return task.id;
    throw new Error(`Nessun task trovato con prefisso "${partial}"`);
  }
  if (matches.length > 1) {
    throw new Error(`Prefisso "${partial}" ambiguo: ${matches.map((t) => t.id.slice(0, 8)).join(", ")}`);
  }
  return matches[0].id;
}

async function main() {
  switch (command) {
    case "board": {
      const board = await getTaskBoard();
      console.log("\n╔══════════════════════════════════════════════╗");
      console.log("║        CONTROLLA.ME — TASK BOARD             ║");
      console.log("╚══════════════════════════════════════════════╝\n");
      console.log(`Total tasks: ${board.total}`);
      console.log(
        `  Open: ${board.byStatus.open} | In Progress: ${board.byStatus.in_progress} | Review: ${board.byStatus.review} | Done: ${board.byStatus.done} | Blocked: ${board.byStatus.blocked}`
      );
      console.log("\nPer dipartimento:");
      for (const [dept, info] of Object.entries(board.byDepartment)) {
        const status = info.open > 0 ? "⚠" : "✓";
        console.log(
          `  ${status} ${dept}: ${info.total} totali (${info.open} open, ${info.done} done)`
        );
      }
      if (board.recent.length > 0) {
        console.log("\nTask recenti:");
        for (const task of board.recent.slice(0, 5)) {
          const pri = task.priority === "critical" ? "🔴" : task.priority === "high" ? "🟠" : task.priority === "medium" ? "🟡" : "⚪";
          console.log(
            `  ${pri} [${task.status}] ${task.title} (${task.department}) — ${task.id.slice(0, 8)}`
          );
          if (task.description) {
            const preview = task.description.length > 100 ? task.description.slice(0, 100) + "…" : task.description;
            console.log(`     └ ${preview}`);
          }
        }
      }
      console.log("");
      break;
    }

    case "list": {
      const dept = getFlag("dept") as Department | undefined;
      const status = getFlag("status") as TaskStatus | undefined;
      const by = getFlag("by");
      const tasks = await getOpenTasks({
        department: dept,
        status: status,
        createdBy: by ?? undefined,
      });
      console.log(`\nTasks found: ${tasks.length}\n`);
      for (const task of tasks) {
        console.log(
          `  [${task.status}] ${task.priority.toUpperCase()} | ${task.title}`
        );
        console.log(
          `    dept: ${task.department} | by: ${task.createdBy} | assigned: ${task.assignedTo ?? "-"} | id: ${task.id.slice(0, 8)}`
        );
        if (task.description) {
          const preview = task.description.length > 120 ? task.description.slice(0, 120) + "…" : task.description;
          console.log(`    desc: ${preview}`);
        }
        if (task.resultSummary) console.log(`    result: ${task.resultSummary}`);
        console.log("");
      }
      break;
    }

    case "create": {
      const title = getFlag("title");
      const dept = getFlag("dept") as Department;
      const priority = getFlag("priority") as TaskPriority | undefined;
      const by = getFlag("by");
      const desc = getFlag("desc");
      const assign = getFlag("assign");

      if (!title || !dept || !by) {
        console.error("Usage: create --title '...' --dept <dept> --by <creator> --desc '...' [--priority <p>] [--assign <agent>]");
        process.exit(1);
      }
      if (!desc) {
        console.error("ERRORE: --desc è obbligatorio. Ogni task deve avere una descrizione esplicativa.");
        console.error("Esempio: --desc 'Analizzare le fragilità del retrieval RAG e proporre miglioramenti architetturali'");
        process.exit(1);
      }

      const task = await createTask({
        title,
        department: dept,
        priority: priority ?? "medium",
        createdBy: by,
        description: desc,
        assignedTo: assign ?? undefined,
      });
      const statusLabel = task.assignedTo ? `in_progress → ${task.assignedTo}` : "open";
      console.log(`\n✓ Task creato: ${task.id.slice(0, 8)} [${statusLabel}]`);
      console.log(`  "${task.title}" → ${task.department} [${task.priority}]\n`);
      break;
    }

    case "get": {
      const rawId = args[1];
      if (!rawId) {
        console.error("Usage: get <task-id>");
        process.exit(1);
      }
      const id = await resolveId(rawId);
      const task = await getTask(id);
      if (!task) {
        console.error(`Task ${id} non trovato`);
        process.exit(1);
      }
      console.log(`\nTask: ${task.title}`);
      console.log(`  ID: ${task.id}`);
      console.log(`  Status: ${task.status}`);
      console.log(`  Department: ${task.department}`);
      console.log(`  Priority: ${task.priority}`);
      console.log(`  Created by: ${task.createdBy}`);
      console.log(`  Assigned to: ${task.assignedTo ?? "-"}`);
      console.log(`  Created: ${task.createdAt}`);
      if (task.description) console.log(`  Description: ${task.description}`);
      if (task.resultSummary) console.log(`  Result: ${task.resultSummary}`);
      if (task.resultData) console.log(`  Data: ${JSON.stringify(task.resultData, null, 2)}`);
      console.log("");
      break;
    }

    case "claim": {
      const rawId = args[1];
      const agent = getFlag("agent");
      if (!rawId || !agent) {
        console.error("Usage: claim <task-id> --agent <agent-name>");
        process.exit(1);
      }
      const id = await resolveId(rawId);
      const task = await claimTask(id, agent);
      console.log(`\n✓ Task ${task.id.slice(0, 8)} claimed by ${agent}\n`);
      break;
    }

    case "done": {
      const rawId = args[1];
      const summary = getFlag("summary");
      if (!rawId) {
        console.error("Usage: done <task-id> [--summary '...']");
        process.exit(1);
      }
      const id = await resolveId(rawId);
      const task = await updateTask(id, {
        status: "done",
        resultSummary: summary ?? undefined,
      });
      console.log(`\n✓ Task ${task.id.slice(0, 8)} completato`);
      if (summary) console.log(`  Summary: ${summary}`);
      console.log("");
      break;
    }

    case "update": {
      const rawId = args[1];
      const status = getFlag("status") as TaskStatus | undefined;
      if (!rawId || !status) {
        console.error("Usage: update <task-id> --status <status>");
        process.exit(1);
      }
      const id = await resolveId(rawId);
      const task = await updateTask(id, { status });
      console.log(`\n✓ Task ${task.id.slice(0, 8)} aggiornato a "${status}"\n`);
      break;
    }

    default:
      console.log(`
Company Tasks CLI — Gestione task per la virtual company

Commands:
  board                          Stato azienda (riepilogo)
  list [--dept X] [--status Y]   Lista task con filtri
  create --title "..." --dept X --by Y --desc "..." [--priority Z] [--assign <agent>]
  get <id>                       Dettaglio task
  claim <id> --agent <name>      Prendi in carico un task
  done <id> [--summary "..."]    Completa un task
  update <id> --status <status>  Aggiorna stato
      `);
  }
}

main().catch((err) => {
  console.error("Errore:", err.message);
  process.exit(1);
});
