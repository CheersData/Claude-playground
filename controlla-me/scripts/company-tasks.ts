/**
 * CLI Company Tasks — Interfaccia CLI per CME e agenti.
 *
 * Usage:
 *   npx tsx scripts/company-tasks.ts board
 *   npx tsx scripts/company-tasks.ts list [--dept <dept>] [--status <status>] [--by <creator>]
 *   npx tsx scripts/company-tasks.ts create --title "..." --dept <dept> [--priority <p>] --by <creator> [--desc "..."]
 *   npx tsx scripts/company-tasks.ts get <id>
 *   npx tsx scripts/company-tasks.ts claim <id> --agent <agent>
 *   npx tsx scripts/company-tasks.ts done <id> [--summary "..."] [--data '{"key":"value"}'] [--benefit-status achieved|partial|missed] [--benefit-notes "..."] [--next "..."]
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

/** Controlla se un flag booleano è presente (es. --routing-exempt, senza valore). */
function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

/** Resolve partial UUID (prefix match), full UUID, or #N (seq_num) to full UUID. */
async function resolveId(partial: string): Promise<string> {
  // Support #N format (sequential number)
  if (partial.startsWith('#')) {
    const seqNum = parseInt(partial.slice(1), 10);
    if (isNaN(seqNum)) throw new Error(`Numero sequenziale non valido: "${partial}"`);
    const all = await getOpenTasks({ limit: 500 });
    const match = all.find((t) => t.seqNum === seqNum);
    if (match) return match.id;
    throw new Error(`Nessun task trovato con seq_num ${seqNum}`);
  }
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
      // Outcome counter from benefit_status
      {
        const allTasks = await getOpenTasks({ limit: 1000 });
        const outcomeAchieved = allTasks.filter((t) => t.benefitStatus === 'achieved').length;
        const outcomePartial = allTasks.filter((t) => t.benefitStatus === 'partial').length;
        const outcomeMissed = allTasks.filter((t) => t.benefitStatus === 'missed').length;
        const outcomePending = allTasks.filter((t) => !t.benefitStatus || t.benefitStatus === 'pending').length;
        console.log(
          `  Outcome: ${outcomeAchieved} achieved | ${outcomePartial} partial | ${outcomeMissed} missed | ${outcomePending} pending`
        );
      }
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
          const seqLabel = task.seqNum != null ? `#${task.seqNum} ` : '';
          console.log(
            `  ${pri} [${task.status}] ${seqLabel}${task.title} (${task.department}) — ${task.id.slice(0, 8)}`
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
        if (task.routing) console.log(`    routing: ${task.routing}`);
        if (task.routingExempt) console.log(`    routing: EXEMPT — ${task.routingReason ?? "(no reason)"}`);
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
      const routing = getFlag("routing");
      const routingExempt = hasFlag("routing-exempt");
      const routingReason = getFlag("routing-reason");
      const tagsRaw = getFlag("tags");
      const benefit = getFlag("benefit");

      if (!title || !dept || !by) {
        console.error("Usage: create --title '...' --dept <dept> --by <creator> --desc '...' --routing 'tree:class' [--priority <p>] [--assign <agent>] [--tags 'tag1,tag2'] [--benefit 'testo']");
        console.error("       create --title '...' --dept <dept> --by <creator> --desc '...' --routing-exempt --routing-reason 'motivo'");
        process.exit(1);
      }
      if (!desc) {
        console.error("ERRORE: --desc è obbligatorio. Ogni task deve avere una descrizione esplicativa.");
        console.error("Esempio: --desc 'Analizzare le fragilità del retrieval RAG e proporre miglioramenti architetturali'");
        process.exit(1);
      }
      if (!benefit) {
        console.warn("ATTENZIONE: --benefit non specificato. Raccomandato: descrivere il beneficio concreto atteso.");
      }

      // ─── Routing enforcement ───
      if (routingExempt) {
        if (!routingReason) {
          console.error("ERRORE: --routing-exempt richiede --routing-reason 'motivo del bypass'.");
          console.error("Esempio: --routing-exempt --routing-reason 'task operativo routine pre-approvato'");
          process.exit(1);
        }
      } else {
        if (!routing) {
          console.error("ERRORE: --routing è obbligatorio. Specifica la classificazione dal decision tree.");
          console.error("Esempi:");
          console.error("  --routing 'feature-request:medium'");
          console.error("  --routing 'trading-operations:routine'");
          console.error("  --routing 'data-operations:corpus-update'");
          console.error("  --routing 'infrastructure:maintenance'");
          console.error("  --routing 'company-operations:prompt-change'");
          console.error("Per bypassare (solo se autorizzato): --routing-exempt --routing-reason 'motivo'");
          process.exit(1);
        }
      }

      const parsedTags = tagsRaw
        ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
        : undefined;

      const task = await createTask({
        title,
        department: dept,
        priority: priority ?? "medium",
        createdBy: by,
        description: desc,
        assignedTo: assign ?? undefined,
        routing: routing ?? undefined,
        routingExempt,
        routingReason: routingReason ?? undefined,
        tags: parsedTags,
        expectedBenefit: benefit ?? undefined,
      });
      const statusLabel = task.assignedTo ? `in_progress → ${task.assignedTo}` : "open";
      const seqLabel = task.seqNum != null ? ` #${task.seqNum}` : '';
      console.log(`\n✓ Task creato:${seqLabel} ${task.id.slice(0, 8)} [${statusLabel}]`);
      console.log(`  "${task.title}" → ${task.department} [${task.priority}]`);
      if (task.routing) console.log(`  routing: ${task.routing}`);
      if (task.routingExempt) console.log(`  routing: EXEMPT — ${task.routingReason}`);
      if (task.tags && task.tags.length > 0) console.log(`  tags: ${task.tags.join(', ')}`);
      if (task.expectedBenefit) console.log(`  benefit: ${task.expectedBenefit}`);
      console.log("");
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
      const seqPrefix = task.seqNum != null ? `#${task.seqNum} — ` : '';
      console.log(`\n${seqPrefix}${task.title}`);
      console.log(`  ID: ${task.id}`);
      console.log(`  Status: ${task.status}`);
      console.log(`  Department: ${task.department}`);
      console.log(`  Priority: ${task.priority}`);
      console.log(`  Created by: ${task.createdBy}`);
      console.log(`  Assigned to: ${task.assignedTo ?? "-"}`);
      console.log(`  Created: ${task.createdAt}`);
      if (task.startedAt) console.log(`  Started: ${task.startedAt}`);
      if (task.completedAt) console.log(`  Completed: ${task.completedAt}`);
      if (task.startedAt && task.completedAt) {
        const durationMs = new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime();
        const durationMin = (durationMs / 60000).toFixed(1);
        console.log(`  Duration: ${durationMin} min`);
      }
      if (task.description) console.log(`  Description: ${task.description}`);
      if (task.labels && task.labels.length > 0) console.log(`  Labels: ${task.labels.join(", ")}`);
      if (task.tags && task.tags.length > 0) console.log(`  Tags: ${task.tags.join(', ')}`);
      if (task.routing) console.log(`  Routing: ${task.routing}`);
      if (task.routingExempt) console.log(`  Routing: EXEMPT — ${task.routingReason ?? "(no reason)"}`);
      if (task.expectedBenefit) console.log(`  Beneficio atteso: ${task.expectedBenefit}`);
      if (task.benefitStatus && task.benefitStatus !== 'pending') {
        const outcomeStr = task.benefitNotes ? `${task.benefitStatus} — ${task.benefitNotes}` : task.benefitStatus;
        console.log(`  Outcome: ${outcomeStr}`);
      }
      if (task.suggestedNext) console.log(`  Next: ${task.suggestedNext}`);
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
      const dataRaw = getFlag("data");
      const benefitStatusRaw = getFlag("benefit-status") as 'achieved' | 'partial' | 'missed' | undefined;
      const benefitNotes = getFlag("benefit-notes");
      const suggestedNext = getFlag("next");
      if (!rawId) {
        console.error("Usage: done <task-id> [--summary '...'] [--data '{\"key\":\"value\"}'] [--benefit-status achieved|partial|missed] [--benefit-notes '...'] [--next '...']");
        process.exit(1);
      }
      let resultData: Record<string, unknown> | undefined;
      if (dataRaw) {
        try {
          resultData = JSON.parse(dataRaw);
        } catch {
          console.error("ERRORE: --data deve essere JSON valido.");
          process.exit(1);
        }
      }
      // Default benefit_status to 'achieved' when closing a task
      const resolvedBenefitStatus = benefitStatusRaw ?? 'achieved';
      const id = await resolveId(rawId);
      const task = await updateTask(id, {
        status: "done",
        resultSummary: summary ?? undefined,
        resultData,
        benefitStatus: resolvedBenefitStatus,
        benefitNotes: benefitNotes ?? undefined,
        suggestedNext: suggestedNext ?? undefined,
      });
      console.log(`\n✓ Task ${task.id.slice(0, 8)} completato`);
      if (summary) console.log(`  Summary: ${summary}`);
      if (resultData) console.log(`  Data: ${JSON.stringify(resultData, null, 2)}`);
      console.log(`  Outcome: ${resolvedBenefitStatus}${benefitNotes ? ` — ${benefitNotes}` : ''}`);
      if (suggestedNext) console.log(`  Next: ${suggestedNext}`);
      console.log("");

      // ─── Hook: controlla se il board è vuoto dopo la chiusura ───
      try {
        const board = await getTaskBoard();
        const activeCount = board.byStatus.open + board.byStatus.in_progress;
        if (activeCount === 0) {
          console.log("⚡ Board vuoto (0 open, 0 in_progress).");
          console.log("   Genera il prossimo piano: npx tsx scripts/company-plan.ts check\n");
        }
      } catch {
        // Non bloccare se il check fallisce
      }

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
  board                          Stato azienda (riepilogo + outcome counter)
  list [--dept X] [--status Y]   Lista task con filtri
  create --title "..." --dept X --by Y --desc "..." --routing "tree:class" [--priority Z] [--assign <agent>] [--tags "t1,t2"] [--benefit "..."]
  create ... --routing-exempt --routing-reason "motivo"   Bypass routing (escape hatch)
  get <id|#N>                    Dettaglio task (mostra routing, tags, benefit, outcome, next)
  claim <id|#N> --agent <name>   Prendi in carico un task
  done <id|#N> [--summary "..."] [--data '{"k":"v"}'] [--benefit-status achieved|partial|missed] [--benefit-notes "..."] [--next "..."]
  update <id|#N> --status <status>  Aggiorna stato

Routing obbligatorio (--routing):
  feature-request:low/medium/high    Nuove feature
  trading-operations:routine/critical Trading pipeline
  data-operations:corpus-update      Pipeline dati
  infrastructure:maintenance/upgrade Infrastruttura
  company-operations:prompt-change   Modifiche prompt/config

ID format: UUID completo, prefisso UUID (es. "abc12345"), o #N (es. "#42")
      `);
  }
}

main().catch((err) => {
  console.error("Errore:", err.message);
  process.exit(1);
});
