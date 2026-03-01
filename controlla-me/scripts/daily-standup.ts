/**
 * Daily Standup — Piano di lavoro giornaliero per ogni dipartimento.
 *
 * Genera un file markdown in company/daily-plans/YYYY-MM-DD.md
 * basandosi sullo stato attuale del task board.
 *
 * Usage:
 *   npx tsx scripts/daily-standup.ts           # Genera piano del giorno
 *   npx tsx scripts/daily-standup.ts --view    # Mostra piano del giorno corrente
 *   npx tsx scripts/daily-standup.ts --list    # Lista tutti i piani storici
 *   npx tsx scripts/daily-standup.ts --date 2026-02-28  # Visualizza piano di una data specifica
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import { execSync } from "child_process";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { getOpenTasks, getTaskBoard } from "../lib/company/tasks";
import { upsertDepartmentAnalysis } from "../lib/company/department-analyses";
import type { Task, Department } from "../lib/company/types";
import { ensureDailyControls, checkIdleAndPlan } from "./daily-controls";

// ─── Config ───────────────────────────────────────────────────────────────────

const PLANS_DIR = path.resolve(__dirname, "../company/daily-plans");

const DEPT_LABELS: Record<string, { emoji: string; label: string }> = {
  "ufficio-legale":   { emoji: "⚖️",  label: "Ufficio Legale" },
  "data-engineering": { emoji: "🔧",  label: "Data Engineering" },
  "quality-assurance":{ emoji: "✅",  label: "Quality Assurance" },
  "architecture":     { emoji: "🏗️",  label: "Architecture" },
  "finance":          { emoji: "💰",  label: "Finance" },
  "operations":       { emoji: "📡",  label: "Operations" },
  "security":         { emoji: "🛡️",  label: "Security" },
  "strategy":         { emoji: "🎯",  label: "Strategy" },
  "marketing":        { emoji: "📣",  label: "Marketing" },
};

const PRIORITY_ICON: Record<string, string> = {
  critical: "🔴",
  high:     "🟠",
  medium:   "🟡",
  low:      "⚪",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function planFilePath(date: string): string {
  return path.join(PLANS_DIR, `${date}.md`);
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString("it-IT", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

// ─── Generate Plan ────────────────────────────────────────────────────────────

interface DeptPlan {
  dept: string;
  inProgress: Task[];
  open: Task[];
  blocked: Task[];
  completedToday: Task[];
}

async function buildDeptPlans(): Promise<DeptPlan[]> {
  const allTasks = await getOpenTasks({ limit: 500 });
  const depts = Object.keys(DEPT_LABELS);

  return depts.map((dept) => {
    const deptTasks = allTasks.filter((t) => t.department === dept);
    return {
      dept,
      inProgress: deptTasks.filter((t) => t.status === "in_progress"),
      open: deptTasks.filter((t) => t.status === "open"),
      blocked: deptTasks.filter((t) => t.status === "blocked"),
      completedToday: deptTasks.filter((t) => {
        if (t.status !== "done" || !t.completedAt) return false;
        return t.completedAt.slice(0, 10) === today();
      }),
    };
  });
}

function renderTask(task: Task): string {
  const pri = PRIORITY_ICON[task.priority] ?? "⚪";
  const id = task.id.slice(0, 8);
  const assignee = task.assignedTo ? ` → ${task.assignedTo}` : "";
  return `  - ${pri} \`${id}\` **${task.title}**${assignee}`;
}

async function generatePlan(date: string): Promise<string> {
  const board = await getTaskBoard();
  const deptPlans = await buildDeptPlans();

  const totalInProgress = deptPlans.reduce((sum, d) => sum + d.inProgress.length, 0);
  const totalOpen = deptPlans.reduce((sum, d) => sum + d.open.length, 0);
  const totalBlocked = deptPlans.reduce((sum, d) => sum + d.blocked.length, 0);
  const totalDone = board.byStatus.done ?? 0;

  const lines: string[] = [];

  // ── Header ──
  lines.push(`# Daily Plan — ${formatDate(date)}`);
  lines.push("");
  lines.push(`> Generato: ${new Date().toISOString()} | Task board: **${board.total}** totali | In corso: **${totalInProgress}** | Aperti: **${totalOpen}** | Bloccati: **${totalBlocked}** | Completati: **${totalDone}**`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // ── Alert idle (board quasi vuoto) ──
  const IDLE_THRESHOLD = 5;
  if (totalOpen + totalInProgress < IDLE_THRESHOLD) {
    lines.push("## ⚡ IDLE ALERT — BOARD QUASI VUOTO");
    lines.push("");
    lines.push(`> Solo **${totalOpen + totalInProgress}** task attivi (soglia: ${IDLE_THRESHOLD}). Tutti i dipartimenti stanno pianificando il prossimo ciclo.`);
    lines.push("");
    lines.push("Task di pianificazione creati automaticamente per: Strategy, Marketing, Architecture, QA, Security, Data Engineering.");
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // ── Alert se ci sono bloccati ──
  if (totalBlocked > 0) {
    lines.push("## ⚠️ BLOCCHI ATTIVI — RICHIEDE ATTENZIONE CME");
    lines.push("");
    for (const dp of deptPlans) {
      for (const t of dp.blocked) {
        const { emoji, label } = DEPT_LABELS[dp.dept] ?? { emoji: "🏢", label: dp.dept };
        lines.push(`- ${emoji} **${label}**: \`${t.id.slice(0,8)}\` ${t.title}`);
        if (t.blockedBy?.length > 0) {
          lines.push(`  *Bloccato da: ${t.blockedBy.join(", ")}*`);
        }
      }
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // ── Piano per dipartimento ──
  lines.push("## Piano per Dipartimento");
  lines.push("");

  for (const dp of deptPlans) {
    const { emoji, label } = DEPT_LABELS[dp.dept] ?? { emoji: "🏢", label: dp.dept };
    const hasWork = dp.inProgress.length > 0 || dp.open.length > 0 || dp.blocked.length > 0;

    lines.push(`### ${emoji} ${label}`);
    lines.push("");

    if (!hasWork) {
      lines.push("_Nessun task attivo. Disponibile per nuove attività._");
      // Suggerimento specifico per dipartimento
      const suggestions: Record<string, string> = {
        "strategy":  "💡 Suggerimento: considera avviare la Quarterly Review o un'analisi competitor.",
        "marketing": "💡 Suggerimento: considera pianificare il content calendar del mese.",
        "finance":   "💡 Suggerimento: considera generare il cost report mensile.",
        "operations":"💡 Suggerimento: considera verificare lo status degli agenti runtime.",
        "security":  "💡 Suggerimento: considera schedulare un security audit periodico.",
      };
      if (suggestions[dp.dept]) {
        lines.push("");
        lines.push(suggestions[dp.dept]);
      }
    } else {
      if (dp.inProgress.length > 0) {
        lines.push("**🔄 In corso:**");
        dp.inProgress.forEach((t) => lines.push(renderTask(t)));
      }

      if (dp.open.length > 0) {
        lines.push("");
        // Mostra solo i top 3 per priorità
        const topOpen = [...dp.open]
          .sort((a, b) => {
            const order = { critical: 0, high: 1, medium: 2, low: 3 };
            return (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
          })
          .slice(0, 3);
        lines.push(`**📋 Da fare** (${dp.open.length} totali, mostrati i top ${topOpen.length}):`);
        topOpen.forEach((t) => lines.push(renderTask(t)));
        if (dp.open.length > 3) {
          lines.push(`  _... e altri ${dp.open.length - 3} task aperti_`);
        }
      }

      if (dp.blocked.length > 0) {
        lines.push("");
        lines.push("**🚫 Bloccati:**");
        dp.blocked.forEach((t) => lines.push(renderTask(t)));
      }
    }

    lines.push("");
  }

  lines.push("---");
  lines.push("");

  // ── KPI del giorno ──
  lines.push("## 📊 KPI del Giorno");
  lines.push("");
  lines.push(`| Metrica | Valore |`);
  lines.push(`|---------|--------|`);
  lines.push(`| Task in corso | ${totalInProgress} |`);
  lines.push(`| Task aperti (backlog) | ${totalOpen} |`);
  lines.push(`| Task bloccati | ${totalBlocked} |`);
  lines.push(`| Task completati (totale storico) | ${totalDone} |`);
  lines.push(`| Dipartimenti con lavoro attivo | ${deptPlans.filter(d => d.inProgress.length > 0 || d.open.length > 0).length} / ${deptPlans.length} |`);
  lines.push("");

  // ── Focus CME ──
  lines.push("## 🎯 Focus Raccomandato per CME");
  lines.push("");

  // Identifica il dipartimento più urgente
  const critical = deptPlans.flatMap(d =>
    [...d.inProgress, ...d.open].filter(t => t.priority === "critical" || t.priority === "high")
  );

  if (critical.length > 0) {
    lines.push("**Priorità alte oggi:**");
    critical.slice(0, 3).forEach((t) => {
      const dept = deptPlans.find(d =>
        [...d.inProgress, ...d.open].some(x => x.id === t.id)
      );
      const { emoji, label } = DEPT_LABELS[dept?.dept ?? ""] ?? { emoji: "🏢", label: dept?.dept };
      lines.push(`- ${emoji} ${label}: ${PRIORITY_ICON[t.priority]} ${t.title}`);
    });
  } else if (totalInProgress === 0) {
    lines.push("_Nessun task in corso. È il momento di pianificare nuovi sprint._");
    lines.push("");
    lines.push("Suggerimento: esegui `npx tsx scripts/company-tasks.ts board` e assegna priorità.");
  } else {
    lines.push("_Tutte le priorità sono in corso. Monitora il progresso e rimuovi i blocchi._");
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`_Piano generato automaticamente da \`scripts/daily-standup.ts\`_`);
  lines.push(`_Per aggiornare: \`npx tsx scripts/daily-standup.ts\`_`);

  return lines.join("\n");
}

// ─── Department AI Analyses ───────────────────────────────────────────────────

interface DeptAnalysisJSON {
  summary: string;
  status_label: "on-track" | "at-risk" | "idle" | "blocked";
  key_points: string[];
}

/**
 * Genera analisi AI per ogni dipartimento usando `claude -p` CLI.
 *
 * REGOLA DEMO: questo script usa il CLI, MAI il SDK @anthropic-ai/sdk.
 * Deve girare dal terminale ESTERNO (non dentro una sessione Claude Code attiva).
 */
async function generateDepartmentAnalyses(
  deptPlans: DeptPlan[],
  date: string
): Promise<void> {
  console.log("\n🤖 Generando analisi AI per dipartimento...\n");

  for (const dp of deptPlans) {
    const { emoji, label } = DEPT_LABELS[dp.dept] ?? { emoji: "🏢", label: dp.dept };
    const hasWork =
      dp.inProgress.length > 0 || dp.open.length > 0 || dp.blocked.length > 0;

    const taskSummary = [
      `In corso: ${dp.inProgress.length}`,
      `Aperti: ${dp.open.length}`,
      `Bloccati: ${dp.blocked.length}`,
      `Completati oggi: ${dp.completedToday.length}`,
    ].join(", ");

    const taskDetails = [
      ...dp.inProgress.map((t) => `[IN_PROGRESS] ${t.priority.toUpperCase()}: ${t.title}`),
      ...dp.open.slice(0, 3).map((t) => `[OPEN] ${t.priority.toUpperCase()}: ${t.title}`),
      ...dp.blocked.map((t) => `[BLOCKED] ${t.title}`),
    ].join("\n");

    const prompt = `Sei un analista aziendale che valuta lo stato del dipartimento "${label}" della virtual company controlla.me (app di analisi legale AI).

Stato attuale (${date}):
${taskSummary}

Task principali:
${taskDetails || "Nessun task attivo."}

Genera un'analisi breve in JSON puro. NON usare backtick o markdown. Inizia con { e finisci con }:
{
  "summary": "Una o due frasi che descrivono lo stato del dipartimento oggi.",
  "status_label": "on-track|at-risk|idle|blocked",
  "key_points": ["punto 1", "punto 2", "punto 3"]
}

Regole:
- summary: max 2 frasi, italiano, conciso e diretto
- status_label: "on-track" se lavoro avanza normalmente, "at-risk" se ci sono blocchi o ritardi, "idle" se nessun task attivo, "blocked" se task bloccati senza soluzione imminente
- key_points: max 3 bullet, ogni punto max 80 caratteri, italiano`;

    try {
      const raw = execSync(`claude -p ${JSON.stringify(prompt)}`, {
        encoding: "utf-8",
        timeout: 30_000,
      }).trim();

      // Parse JSON robusto (stesso pattern di lib/anthropic.ts)
      let parsed: DeptAnalysisJSON | null = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsed = JSON.parse(match[0]);
          } catch {
            // parse fallito
          }
        }
      }

      if (!parsed) {
        console.warn(`  ⚠️  ${emoji} ${label}: JSON parse fallito, skip.`);
        continue;
      }

      await upsertDepartmentAnalysis({
        department: dp.dept as Department,
        date,
        summary: parsed.summary ?? "Nessuna analisi disponibile.",
        statusLabel: parsed.status_label ?? (hasWork ? "on-track" : "idle"),
        keyPoints: parsed.key_points ?? [],
        openCount: dp.open.length,
        inProgressCount: dp.inProgress.length,
        blockedCount: dp.blocked.length,
        doneTodayCount: dp.completedToday.length,
      });

      console.log(`  ✅ ${emoji} ${label}: ${parsed.status_label}`);
    } catch (err) {
      console.warn(
        `  ⚠️  ${emoji} ${label}: errore (non bloccante): ${(err as Error).message}`
      );
    }
  }

  console.log("\n✅ Analisi dipartimentali salvate nel DB.\n");
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdGenerate(): Promise<void> {
  const date = today();

  // Assicura che la directory esista
  if (!fs.existsSync(PLANS_DIR)) {
    fs.mkdirSync(PLANS_DIR, { recursive: true });
  }

  console.log("\n📋 Generating daily plan...\n");

  // ── 1. Daily Controls: crea task ricorrenti di controllo se non esistono ──
  try {
    const ctrlResult = await ensureDailyControls(date);
    if (ctrlResult.created > 0) {
      console.log(`🔧 Daily controls: ${ctrlResult.created} task creati per oggi\n`);
    }
  } catch (err) {
    console.warn("⚠️  Daily controls: errore (non bloccante):", (err as Error).message);
  }

  // ── 2. Idle Trigger: se pochi task aperti, consulta tutti i dipartimenti ──
  try {
    const idleResult = await checkIdleAndPlan(date);
    if (idleResult.isIdle && idleResult.tasksCreated > 0) {
      console.log(`⚡ IDLE TRIGGER: solo ${idleResult.openCount} task attivi → creati ${idleResult.tasksCreated} task di pianificazione\n`);
    }
  } catch (err) {
    console.warn("⚠️  Idle trigger: errore (non bloccante):", (err as Error).message);
  }

  // ── 3. Genera piano del giorno ──
  const deptPlans = await buildDeptPlans();
  const content = await generatePlan(date);
  const filePath = planFilePath(date);
  fs.writeFileSync(filePath, content, "utf-8");

  console.log(content);
  console.log(`\n✅ Piano salvato in: company/daily-plans/${date}.md\n`);

  // ── 4. Genera analisi AI per ogni dipartimento (usa claude -p CLI) ──
  // Nota: eseguire dal terminale ESTERNO — non funziona dentro una sessione Claude Code attiva.
  try {
    await generateDepartmentAnalyses(deptPlans, date);
  } catch (err) {
    console.warn("⚠️  Department analyses: errore (non bloccante):", (err as Error).message);
  }
}

async function cmdView(date: string): Promise<void> {
  const filePath = planFilePath(date);
  if (!fs.existsSync(filePath)) {
    console.log(`\n❌ Nessun piano trovato per ${date}`);
    console.log(`   Genera con: npx tsx scripts/daily-standup.ts\n`);
    return;
  }
  const content = fs.readFileSync(filePath, "utf-8");
  console.log("\n" + content);
}

function cmdList(): void {
  if (!fs.existsSync(PLANS_DIR)) {
    console.log("\n❌ Nessun piano giornaliero trovato. Genera il primo con:");
    console.log("   npx tsx scripts/daily-standup.ts\n");
    return;
  }

  const files = fs.readdirSync(PLANS_DIR)
    .filter((f) => f.endsWith(".md") && f !== ".gitkeep")
    .sort()
    .reverse();

  if (files.length === 0) {
    console.log("\n❌ Nessun piano giornaliero trovato.\n");
    return;
  }

  console.log(`\n📅 Piani giornalieri (${files.length} totali):\n`);
  files.forEach((f) => {
    const date = f.replace(".md", "");
    const isToday = date === today();
    console.log(`  ${isToday ? "→" : " "} ${date}${isToday ? " (oggi)" : ""}`);
  });
  console.log(`\nVisualizza: npx tsx scripts/daily-standup.ts --view --date YYYY-MM-DD\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (hasFlag(args, "list")) {
    cmdList();
    return;
  }

  if (hasFlag(args, "view")) {
    const date = getFlag(args, "date") ?? today();
    await cmdView(date);
    return;
  }

  // Default: genera piano del giorno
  await cmdGenerate();
}

main().catch((err) => {
  console.error("\n❌ Errore:", err.message ?? err);
  process.exit(1);
});
