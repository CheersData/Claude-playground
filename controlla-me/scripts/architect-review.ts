/**
 * Architect Review — parere tecnico su un task in attesa di approvazione.
 *
 * Usage:
 *   npx tsx scripts/architect-review.ts <task-id-prefix>
 *
 * Esempio:
 *   npx tsx scripts/architect-review.ts cd9f32f1
 *
 * Output:
 *   - Stampa il parere in console
 *   - Salva il parere in task.resultData.architectReview (visibile nella TaskModal)
 *
 * Usa `claude -p` CLI (Claude Code) invece dell'API Anthropic diretta.
 * Esegui da un terminale esterno (non dentro una sessione Claude Code attiva).
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { execSync } from "child_process";
import { getOpenTasks, updateTask } from "../lib/company/tasks";

// ─── Config ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sei l'architetto tecnico senior di Controlla.me.
Il CEO ti chiede un parere su un task da approvare. Sii diretto, pratico, senza fronzoli.

Rispondi con JSON puro. Nessun testo extra. Inizia con { e finisci con }.

{
  "feasibility": "alta" | "media" | "bassa",
  "effort": "S" | "M" | "L" | "XL",
  "recommendation": "approva" | "rivedi" | "rifiuta",
  "notes": "3-5 frasi: analisi tecnica, rischi, dipendenze, consiglio concreto",
  "dependencies": ["dipendenza1"]
}

Effort: S=ore, M=1-2gg, L=settimana, XL=sprint.`;

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  amber: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  white: "\x1b[97m",
};

function print(msg: string) { process.stdout.write(msg + "\n"); }
function header(msg: string) { print(`\n${C.bold}${C.white}${msg}${C.reset}`); }
function ok(msg: string) { print(`${C.green}✓${C.reset} ${msg}`); }
function warn(msg: string) { print(`${C.amber}⚠${C.reset} ${msg}`); }
function err(msg: string) { print(`${C.red}✗${C.reset} ${msg}`); }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const taskPrefix = args[0];

  if (!taskPrefix) {
    err("Uso: npx tsx scripts/architect-review.ts <task-id>");
    err("Es:  npx tsx scripts/architect-review.ts cd9f32f1");
    process.exit(1);
  }

  print(`\n${C.bold}${C.amber}🏛️  Architect Review — Claude Opus${C.reset}`);
  print(`${C.gray}Task prefix: ${taskPrefix}${C.reset}`);

  // ── Find task ──
  const all = await getOpenTasks({ limit: 500 });
  const task = all.find((t) => t.id.startsWith(taskPrefix) || t.id === taskPrefix);

  if (!task) {
    err(`Task "${taskPrefix}" non trovato.`);
    print(`${C.gray}Task disponibili (review):${C.reset}`);
    const review = all.filter((t) => t.status === "review");
    review.forEach((t) => print(`  ${C.gray}${t.id.slice(0, 8)}${C.reset} ${t.title.slice(0, 60)}`));
    process.exit(1);
  }

  header(`Task: ${task.title}`);
  print(`${C.gray}Dipartimento: ${task.department} | Stato: ${task.status} | Priorità: ${task.priority}${C.reset}`);
  if (task.assignedTo) print(`${C.gray}In carico a: ${task.assignedTo}${C.reset}`);

  // ── Build prompt ──
  const prompt = `Task da valutare:
Titolo: ${task.title}
Dipartimento: ${task.department}
Priorità: ${task.priority}
Creato da: ${task.createdBy}
Labels: ${task.labels?.join(", ") || "nessuna"}

Descrizione:
${task.description ?? "(nessuna descrizione)"}

Dai il tuo parere tecnico approfondito su questo task.`;

  // ── Call Claude CLI ──
  print(`\n${C.cyan}→ Chiamando claude CLI...${C.reset}`);
  const start = Date.now();

  const fullPrompt = `${SYSTEM_PROMPT}\n\n${prompt}`;

  let rawText: string;
  try {
    rawText = execSync(`claude -p ${JSON.stringify(fullPrompt)}`, {
      encoding: "utf-8",
      timeout: 60_000,
    }).trim();
    print(`${C.gray}← claude CLI (${Date.now() - start}ms)${C.reset}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`claude CLI fallito: ${msg.slice(0, 200)}`);
  }

  // ── Parse JSON ──
  let review: Record<string, unknown>;
  try {
    const clean = rawText.trim().replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
    review = JSON.parse(clean);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      err("Risposta non parsabile:");
      print(rawText.slice(0, 300));
      process.exit(1);
    }
    review = JSON.parse(match[0]);
  }

  // ── Display ──
  const recColor = review.recommendation === "approva" ? C.green :
    review.recommendation === "rifiuta" ? C.red : C.amber;

  header("Parere Architetto:");
  print(`  ${C.bold}Fattibilità:${C.reset}     ${review.feasibility}`);
  print(`  ${C.bold}Effort:${C.reset}          ${review.effort}`);
  print(`  ${C.bold}Raccomandazione:${C.reset} ${recColor}${C.bold}${String(review.recommendation).toUpperCase()}${C.reset}`);
  print(`\n  ${C.bold}Note:${C.reset}`);
  print(`  ${String(review.notes).split("\n").join("\n  ")}`);
  if (Array.isArray(review.dependencies) && review.dependencies.length > 0) {
    print(`\n  ${C.bold}Dipendenze:${C.reset} ${review.dependencies.join(", ")}`);
  }

  // ── Save to task ──
  print(`\n${C.gray}Salvataggio parere nel task...${C.reset}`);
  const updatedResultData = { ...(task.resultData ?? {}), architectReview: review };
  await updateTask(task.id, { resultData: updatedResultData });
  ok(`Parere salvato in task ${task.id.slice(0, 8)} (visibile nella TaskModal /ops)`);

  // ── Approve prompt ──
  print(`\n${C.gray}Per approvare:  ${C.reset}${C.cyan}npx tsx scripts/company-tasks.ts claim ${task.id.slice(0, 8)} --agent boss${C.reset}`);
  print(`${C.gray}Oppure apri /ops e approva dalla TaskModal.${C.reset}\n`);
}

main().catch((e) => {
  process.stderr.write(`ERRORE: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
