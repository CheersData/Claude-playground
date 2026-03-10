/**
 * CLI Company Tasks — Interfaccia CLI per CME e agenti.
 *
 * Usage:
 *   npx tsx scripts/company-tasks.ts board
 *   npx tsx scripts/company-tasks.ts list [--dept <dept>] [--status <status>] [--by <creator>]
 *   npx tsx scripts/company-tasks.ts create --title "..." --dept <dept> [--priority <p>] --by <creator> [--desc "..."] [--parent <task-id>]
 *   npx tsx scripts/company-tasks.ts get <id>
 *   npx tsx scripts/company-tasks.ts claim <id> --agent <agent>
 *   npx tsx scripts/company-tasks.ts done <id> [--summary "..."] [--data '{"key":"value"}'] [--benefit-status achieved|partial|missed] [--benefit-notes "..."] [--next "..."] [--commit] [--files "path1 path2"]
 *   npx tsx scripts/company-tasks.ts update <id> --status <status>
 *   npx tsx scripts/company-tasks.ts exec <id> [--runbook <name>]
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import {
  createTask,
  claimTask,
  updateTask,
  getTask,
  getOpenTasks,
  getTaskBoard,
} from "../lib/company/tasks";
import type { Department, TaskPriority, TaskStatus, CreateTaskInput } from "../lib/company/types";
import { validateRouting, getAllValidRoutings, classifyRequest } from "../lib/company/routing";

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
  const all = await getOpenTasks({ limit: 1000 });
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
      const approvalFilter = getFlag("approval");  // es. --approval L3
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
      // In-progress tasks (visibility su cosa sta lavorando CME)
      if (board.inProgress.length > 0) {
        console.log("\n🔨 In progress:");
        for (const task of board.inProgress) {
          const seqLabel = task.seqNum != null ? `#${task.seqNum} ` : '';
          const assignLabel = task.assignedTo ? ` → ${task.assignedTo}` : '';
          const routingLabel = task.approvalLevel ? ` [${task.approvalLevel}]` : '';
          console.log(
            `  ${seqLabel}${task.title} (${task.department}${assignLabel}${routingLabel}) — ${task.id.slice(0, 8)}`
          );
        }
      }
      if (board.recent.length > 0) {
        console.log("\nTask recenti:");
        for (const task of board.recent.slice(0, 5)) {
          const pri = task.priority === "critical" ? "🔴" : task.priority === "high" ? "🟠" : task.priority === "medium" ? "🟡" : "⚪";
          const seqLabel = task.seqNum != null ? `#${task.seqNum} ` : '';
          const routingShort = task.approvalLevel ? ` [${task.approvalLevel}]` : '';
          console.log(
            `  ${pri} [${task.status}] ${seqLabel}${task.title} (${task.department})${routingShort} — ${task.id.slice(0, 8)}`
          );
          if (task.description) {
            const preview = task.description.length > 100 ? task.description.slice(0, 100) + "…" : task.description;
            console.log(`     └ ${preview}`);
          }
        }
      }
      // Filtro per approval level (es. board --approval L3 per task che richiedono boss)
      if (approvalFilter) {
        const allOpen = await getOpenTasks({ limit: 500 });
        const filtered = allOpen.filter(
          (t) => t.approvalLevel === approvalFilter && t.status !== "done"
        );
        if (filtered.length > 0) {
          console.log(`\n📋 Task con approvazione ${approvalFilter}:`);
          for (const task of filtered) {
            const pri = task.priority === "critical" ? "🔴" : task.priority === "high" ? "🟠" : task.priority === "medium" ? "🟡" : "⚪";
            const seqLabel = task.seqNum != null ? `#${task.seqNum} ` : '';
            const consultStr = task.consultDepts && task.consultDepts.length > 0 ? ` (consult: ${task.consultDepts.join(',')})` : '';
            console.log(
              `  ${pri} [${task.status}] ${seqLabel}${task.title} (${task.department})${consultStr} — ${task.id.slice(0, 8)}`
            );
          }
        } else {
          console.log(`\n  Nessun task attivo con approvazione ${approvalFilter}`);
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
        if (task.routing) {
          const approvalStr = task.approvalLevel ? ` | approval: ${task.approvalLevel}` : '';
          const consultStr = task.consultDepts && task.consultDepts.length > 0 ? ` | consult: ${task.consultDepts.join(',')}` : '';
          console.log(`    routing: ${task.routing}${approvalStr}${consultStr}`);
        }
        if (task.routingExempt) console.log(`    routing: EXEMPT — ${task.routingReason ?? "(no reason)"}`);
        if (task.parentTaskId) console.log(`    parent: ${task.parentTaskId.slice(0, 8)}`);
        if (task.tags && task.tags.length > 0) console.log(`    tags: ${task.tags.join(', ')}`);
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
      const tagsRaw = getFlag("tags");
      const benefit = getFlag("benefit");
      const parentRaw = getFlag("parent");

      if (!title || !dept || !by) {
        console.error("Usage: create --title '...' --dept <dept> --by <creator> --desc '...' --routing 'tree:class' [--priority <p>] [--assign <agent>] [--tags 'tag1,tag2'] [--benefit 'testo'] [--parent <task-id>]");
        process.exit(1);
      }
      if (!desc) {
        console.error("ERRORE: --desc è obbligatorio. Ogni task deve avere una descrizione esplicativa.");
        console.error("Esempio: --desc 'Analizzare le fragilità del retrieval RAG e proporre miglioramenti architetturali'");
        process.exit(1);
      }
      if (desc.length < 20) {
        console.error("ERRORE: --desc deve contenere almeno 20 caratteri. Ricevuto: " + desc.length + " char");
        process.exit(1);
      }
      if (!benefit) {
        console.warn("ATTENZIONE: --benefit non specificato. Raccomandato: descrivere il beneficio concreto atteso.");
      }

      // ─── Reject "EXEMPT" as routing value ───
      if (routing !== undefined && (routing.toUpperCase() === "EXEMPT" || routing.trim() === "")) {
        console.error("❌ Routing EXEMPT eliminato (audit V-006/V-007). Ogni task DEVE avere routing tree:sub-type.");
        console.error("   Esempio: --routing 'feature-request:small'");
        console.error("   Per aiuto: npx tsx scripts/company-tasks.ts route 'descrizione richiesta'");
        process.exit(1);
      }

      // ─── Resolve parent task ID ───
      let parentTaskId: string | undefined;
      if (parentRaw) {
        try {
          parentTaskId = await resolveId(parentRaw);
          const parentTask = await getTask(parentTaskId);
          if (!parentTask) {
            console.error(`ERRORE: task parent "${parentRaw}" non trovato.`);
            process.exit(1);
          }
          console.log(`  Parent: #${parentTask.seqNum ?? "?"} ${parentTask.title} (${parentTask.id.slice(0, 8)})`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`ERRORE: impossibile risolvere parent "${parentRaw}" — ${msg}`);
          process.exit(1);
        }
      }

      // ─── Routing enforcement (validato contro decision tree YAML — EXEMPT eliminato, audit V-006/V-007) ───
      if (!routing) {
        console.error("ERRORE: --routing è obbligatorio. Ogni task DEVE avere routing tree:sub-type.");
        console.error("\nCombinazioni valide (da YAML):");
        for (const r of getAllValidRoutings()) {
          console.error(`  --routing '${r}'`);
        }
        console.error("\nPer aiuto: npx tsx scripts/company-tasks.ts route 'descrizione richiesta'");
        process.exit(1);
      }
      // Validazione contro i decision tree YAML reali
      const routingResult = validateRouting(routing);
      if (!routingResult.valid) {
        console.error(`ERRORE ROUTING: ${routingResult.error}`);
        if (routingResult.validOptions) {
          console.error("\nOpzioni valide:");
          for (const opt of routingResult.validOptions) {
            console.error(`  --routing '${opt}'`);
          }
        }
        console.error("\nPer aiuto: npx tsx scripts/company-tasks.ts route 'descrizione richiesta'");
        process.exit(1);
      }
      // Mostra i vincoli del nodo scelto dal decision tree
      const node = routingResult.node!;
      console.log(`\n  Routing validato: ${routing}`);
      console.log(`  Tipo: ${node.type} | Approvazione: ${node.approval}`);
      if (node.consult.length > 0) console.log(`  Consultare: ${node.consult.join(", ")}`);
      if (node.review && node.review.length > 0) console.log(`  Review: ${node.review.join(", ")}`);
      if (node.requirement) console.log(`  Requisito: ${node.requirement}`);

      // Auto-extract approval metadata dal decision tree
      let autoApprovalLevel: string | undefined;
      let autoConsultDepts: string[] | undefined;
      {
        const rr = validateRouting(routing);
        if (rr.valid && rr.node) {
          autoApprovalLevel = rr.node.approval;
          autoConsultDepts = rr.node.consult.length > 0 ? rr.node.consult : undefined;
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
        parentTaskId,
        routing: routing,
        tags: parsedTags,
        expectedBenefit: benefit ?? undefined,
        approvalLevel: autoApprovalLevel as CreateTaskInput['approvalLevel'],
        consultDepts: autoConsultDepts,
      });
      const statusLabel = task.assignedTo ? `in_progress → ${task.assignedTo}` : "open";
      const seqLabel = task.seqNum != null ? ` #${task.seqNum}` : '';
      console.log(`\n✓ Task creato:${seqLabel} ${task.id.slice(0, 8)} [${statusLabel}]`);
      console.log(`  "${task.title}" → ${task.department} [${task.priority}]`);
      if (task.parentTaskId) console.log(`  parent: ${task.parentTaskId.slice(0, 8)}`);
      if (task.routing) console.log(`  routing: ${task.routing}`);
      if (task.approvalLevel) console.log(`  approval: ${task.approvalLevel}`);
      if (task.consultDepts && task.consultDepts.length > 0) console.log(`  consult: ${task.consultDepts.join(', ')}`);
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
      if (task.parentTaskId) console.log(`  Parent: ${task.parentTaskId}`);
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
      const noNext = hasFlag("no-next");
      const doCommit = hasFlag("commit");
      const commitFiles = getFlag("files");
      if (!rawId) {
        console.error("Usage: done <task-id> --summary '...' --next '...' [--data '{\"key\":\"value\"}'] [--benefit-status achieved|partial|missed] [--benefit-notes '...'] [--commit] [--files 'path1 path2']");
        console.error("       done <task-id> --summary '...' --no-next    (solo se il task non ha follow-up)");
        process.exit(1);
      }
      // ─── --next enforcement: ogni task deve generare il prossimo ───
      if (!suggestedNext && !noNext) {
        console.error("ERRORE: --next è obbligatorio. Ogni task completato deve indicare il prossimo passo.");
        console.error("Esempio: --next 'Aggiungere test per la nuova funzionalità'");
        console.error("Se il task non ha follow-up: --no-next");
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

      // ─── Hook: --commit automatico ───
      if (doCommit) {
        const { execSync } = await import("child_process");
        const shortId = task.id.slice(0, 8);
        const dept = task.department;
        const commitMsg = `[${dept}/${shortId}] ${task.title}`;
        try {
          if (commitFiles) {
            execSync(`git add ${commitFiles}`, { stdio: "inherit" });
          } else {
            execSync("git add -A", { stdio: "inherit" });
          }
          execSync(`git commit -m ${JSON.stringify(commitMsg)}`, { stdio: "inherit" });
          console.log(`  git: "${commitMsg}"\n`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`  WARN: commit fallito — ${msg}`);
          console.warn(`  Esegui manualmente: git add -A && git commit -m ${JSON.stringify(commitMsg)}\n`);
        }
      }

      // ─── Hook: aggiorna status.json del dipartimento dopo chiusura task ───
      try {
        const { spawnSync } = await import("child_process");
        const deptToUpdate = task.department;
        const updateResult = spawnSync("npx", ["tsx", "scripts/auto-update-dept-status.ts", "--dept", deptToUpdate], {
          cwd: resolve(__dirname, ".."),
          encoding: "utf-8",
          timeout: 15000,
          shell: true,
          windowsHide: true,
        });
        if (updateResult.status === 0) {
          console.log(`  📊 Status ${deptToUpdate} aggiornato`);
        }
      } catch {
        // Non bloccare se l'update fallisce
      }

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

    case "exec": {
      /**
       * exec <task-id> [--runbook <name>]
       *
       * Stampa il "delegation brief" per un task: contesto del dipartimento (department.md),
       * runbook pertinente, e istruzioni per il leader. CME usa questo output per passare
       * dal ruolo di orchestratore al ruolo di leader del dipartimento, mantenendo il routing
       * formale anche in assenza di API (task-runner non disponibile in ambiente demo).
       *
       * Questo comando permette a CME di rimanere ROUTER: decide routing, crea il task,
       * poi DELEGA al leader del dipartimento (che è ancora CME, ma con il contesto esplicito
       * del dipartimento). Ogni task ha accountability, runbook e owner chiaro.
       */
      const rawId = args[1];
      const runbookName = getFlag("runbook");
      if (!rawId) {
        console.error("Usage: exec <task-id> [--runbook <name>]");
        process.exit(1);
      }
      const id = await resolveId(rawId);
      const task = await getTask(id);
      if (!task) {
        console.error(`Task ${rawId} non trovato.`);
        process.exit(1);
      }

      const ROOT = path.resolve(__dirname, "..");
      const dept = task.department;
      const deptDir = path.join(ROOT, "company", dept);
      const deptMdPath = path.join(deptDir, "department.md");
      const runbooksDir = path.join(deptDir, "runbooks");
      const agentsDir = path.join(deptDir, "agents");

      // Leggi department.md
      let deptContent = "";
      if (fs.existsSync(deptMdPath)) {
        deptContent = fs.readFileSync(deptMdPath, "utf-8");
      } else {
        deptContent = `[department.md non trovato per ${dept}]`;
      }

      // Lista runbooks disponibili
      let runbooksList: string[] = [];
      if (fs.existsSync(runbooksDir)) {
        runbooksList = fs.readdirSync(runbooksDir).filter((f) => f.endsWith(".md"));
      }

      // Carica runbook specifico (flag) o auto-detect da titolo task
      let runbookContent = "";
      let runbookUsed = "";
      if (runbookName) {
        const rb = runbookName.endsWith(".md") ? runbookName : `${runbookName}.md`;
        const rbPath = path.join(runbooksDir, rb);
        if (fs.existsSync(rbPath)) {
          runbookContent = fs.readFileSync(rbPath, "utf-8");
          runbookUsed = rb;
        } else {
          runbookContent = `[Runbook "${rb}" non trovato]`;
        }
      } else if (runbooksList.length > 0) {
        // Auto-detect: usa il primo runbook che matcha parole del titolo
        const titleLower = (task.title ?? "").toLowerCase();
        const autoMatch = runbooksList.find((rb) =>
          titleLower.includes(rb.replace(".md", "").replace(/-/g, " ").split("-")[0])
        );
        const fallback = runbooksList[0];
        const chosen = autoMatch ?? fallback;
        runbookContent = fs.readFileSync(path.join(runbooksDir, chosen), "utf-8");
        runbookUsed = chosen;
      }

      // Lista agenti del dipartimento
      let agentCards: string[] = [];
      if (fs.existsSync(agentsDir)) {
        agentCards = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md")).map((f) => f.replace(".md", ""));
      }

      // Trova leader dal department.md (prima riga con "Leader" o "lead")
      const leaderMatch = deptContent.match(/leader[:\s]+([^\n]+)/i);
      const leaderName = leaderMatch ? leaderMatch[1].trim() : `${dept}-lead`;

      // Stampa il delegation brief
      console.log("\n" + "═".repeat(60));
      console.log(`  DELEGAZIONE — ${dept.toUpperCase()}`);
      console.log("═".repeat(60));
      console.log(`\nTask #${task.seqNum ?? "?"}: ${task.title}`);
      console.log(`Priorità: ${task.priority.toUpperCase()} | Status: ${task.status}`);
      if (task.description) console.log(`\nDescrizione:\n${task.description}`);
      console.log(`\nLeader: ${leaderName}`);
      if (agentCards.length > 0) {
        console.log(`Agenti disponibili: ${agentCards.join(", ")}`);
      }
      console.log("\n" + "─".repeat(60));
      console.log("  CONTESTO DIPARTIMENTO (department.md)");
      console.log("─".repeat(60));
      // Stampa prime 80 righe del department.md (non tutto per brevità)
      const deptLines = deptContent.split("\n");
      const deptPreview = deptLines.slice(0, 80).join("\n");
      console.log(deptPreview);
      if (deptLines.length > 80) console.log(`\n[... ${deptLines.length - 80} righe omesse — leggi ${deptMdPath} per il testo completo]`);

      if (runbookContent) {
        console.log("\n" + "─".repeat(60));
        console.log(`  RUNBOOK: ${runbookUsed}`);
        console.log("─".repeat(60));
        const rbLines = runbookContent.split("\n");
        const rbPreview = rbLines.slice(0, 60).join("\n");
        console.log(rbPreview);
        if (rbLines.length > 60) console.log(`\n[... ${rbLines.length - 60} righe omesse]`);
      }

      if (runbooksList.length > 1) {
        console.log(`\nAltri runbook disponibili: ${runbooksList.filter((r) => r !== runbookUsed).join(", ")}`);
      }

      console.log("\n" + "═".repeat(60));
      console.log(`  → Tu sei il ${leaderName} del dipartimento ${dept}.`);
      console.log(`    Esegui il task seguendo il runbook e le convenzioni del dipartimento.`);
      console.log(`    Quando completato: npx tsx scripts/company-tasks.ts done ${task.id.slice(0, 8)} --summary "..."`);
      console.log("═".repeat(60) + "\n");

      break;
    }

    case "update": {
      const rawId = args[1];
      const status = getFlag("status") as TaskStatus | undefined;
      const updateTagsRaw = getFlag("tags");
      const updateAssigned = getFlag("assigned");
      if (!rawId || (!status && !updateTagsRaw && updateAssigned === undefined)) {
        console.error("Usage: update <task-id> --status <status> [--tags 'tag1,tag2'] [--assigned <agent|''>]");
        process.exit(1);
      }
      const id = await resolveId(rawId);
      const updatePayload: UpdateTaskInput = {};
      if (status) updatePayload.status = status;
      if (updateTagsRaw) updatePayload.tags = updateTagsRaw.split(',').map(t => t.trim()).filter(Boolean);
      if (updateAssigned !== undefined) updatePayload.assignedTo = updateAssigned || "";
      const task = await updateTask(id, updatePayload);
      const changes: string[] = [];
      if (status) changes.push(`status="${status}"`);
      if (updateTagsRaw) changes.push(`tags=[${(task.tags || []).join(', ')}]`);
      if (updateAssigned !== undefined) changes.push(`assigned="${task.assignedTo ?? '-'}"`);
      console.log(`\n✓ Task ${task.id.slice(0, 8)} aggiornato: ${changes.join(', ')}\n`);
      break;
    }

    case "route": {
      const text = args.slice(1).join(" ");
      if (!text) {
        console.error("Usage: route <descrizione richiesta>");
        console.error("Esempio: npx tsx scripts/company-tasks.ts route 'aggiungi scoring multidimensionale alla UI'");
        process.exit(1);
      }

      const matches = classifyRequest(text);

      if (matches.length === 0) {
        console.log("\nNessun decision tree corrisponde alla richiesta.");
        console.log("Routing manuale necessario (L2 CME) o verifica i decision trees in:");
        console.log("  company/protocols/decision-trees/\n");
      } else {
        console.log(`\n── ROUTING per: "${text}" ──\n`);
        for (const match of matches.slice(0, 3)) {
          console.log(`Tree: ${match.treeName} (score: ${match.score.toFixed(1)})`);
          console.log(`  ${match.treeDescription}`);
          console.log("  Categorie:");
          for (const cat of match.categories) {
            console.log(`    --routing '${cat.routing}'`);
            console.log(`      ${cat.condition} [${cat.type}, ${cat.approval}]`);
            if (cat.consult.length > 0) console.log(`      Consultare: ${cat.consult.join(", ")}`);
          }
          console.log("");
        }
      }
      break;
    }

    default:
      console.log(`
Company Tasks CLI — Gestione task per la virtual company

Commands:
  board                          Stato azienda (riepilogo + outcome counter)
  list [--dept X] [--status Y]   Lista task con filtri
  create --title "..." --dept X --by Y --desc "..." --routing "tree:class" [--priority Z] [--assign <agent>] [--tags "t1,t2"] [--benefit "..."] [--parent <id|#N>]
  create ... --routing-exempt --routing-reason "motivo"   Bypass routing (escape hatch)
  get <id|#N>                    Dettaglio task (mostra routing, tags, benefit, outcome, next)
  claim <id|#N> --agent <name>   Prendi in carico un task
  done <id|#N> --summary "..." --next "..." [--data '{"k":"v"}'] [--benefit-status achieved|partial|missed] [--benefit-notes "..."] [--commit] [--files "f1 f2"]
  done <id|#N> --summary "..." --no-next   (solo se il task non ha follow-up)
  exec <id|#N> [--runbook <name>]  Delegation brief: contesto dept + runbook + istruzioni leader
  update <id|#N> --status <status>  Aggiorna stato
  route <testo richiesta>          Classifica richiesta e suggerisci routing (da YAML)

Routing: validato contro decision tree YAML in company/protocols/decision-trees/
  Per vedere le combinazioni valide: ometti --routing e il CLI le elenca
  Per classificare una richiesta: route 'descrizione della richiesta'
  Per bypassare (solo se autorizzato): --routing-exempt --routing-reason 'motivo'

ID format: UUID completo, prefisso UUID (es. "abc12345"), o #N (es. "#42")
      `);
  }
}

main().catch((err) => {
  console.error("Errore:", err.message);
  process.exit(1);
});
