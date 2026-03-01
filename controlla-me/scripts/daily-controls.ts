/**
 * Daily Controls — Attività di controllo giornaliere automatiche.
 *
 * Ogni giorno crea task ricorrenti di controllo per ogni dipartimento operativo.
 * Se i task di oggi esistono già, non li ricrea (idempotente).
 *
 * Eseguito automaticamente da daily-standup.ts all'avvio.
 * Può essere eseguito manualmente:
 *
 *   npx tsx scripts/daily-controls.ts           # Crea task controllo oggi
 *   npx tsx scripts/daily-controls.ts --status  # Mostra task controllo oggi
 *   npx tsx scripts/daily-controls.ts --idle    # Forza pianificazione dipartimenti (idle trigger)
 */

import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createTask, getOpenTasks, getTaskBoard } from "../lib/company/tasks";

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Soglia task aperti sotto la quale scatta l'idle trigger.
 * Se open tasks < IDLE_THRESHOLD → consulta tutti i dipartimenti per pianificare.
 */
const IDLE_THRESHOLD = 5;

/**
 * Tag usato nei titoli per identificare task di controllo giornalieri.
 * Formato: [CTRL-YYYY-MM-DD]
 */
function dailyTag(date: string): string {
  return `[CTRL-${date}]`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Definizione controlli giornalieri ────────────────────────────────────────

interface DailyControl {
  dept: string;
  title: string;
  priority: "high" | "medium" | "low";
  desc: string;
}

function buildDailyControls(date: string): DailyControl[] {
  const tag = dailyTag(date);
  return [
    {
      dept: "quality-assurance",
      title: `Daily QA — test suite + typecheck ${tag}`,
      priority: "high",
      desc:
        "Esegui suite completa: npm test, npx tsc --noEmit, npm run lint. " +
        "Se ci sono fallimenti: crea task fix con priorità high. " +
        "Runbook: company/quality-assurance/runbooks/run-full-suite.md",
    },
    {
      dept: "operations",
      title: `Daily OPS — health check agenti + pipeline ${tag}`,
      priority: "medium",
      desc:
        "Verifica: 7 agenti runtime attivi, catene fallback configurate in lib/tiers.ts, " +
        "data connector sync status (npx tsx scripts/data-connector.ts status). " +
        "Se anomalia: crea alert task. Runbook: company/operations/runbooks/status-report.md",
    },
    {
      dept: "security",
      title: `Daily SEC — check variabili e route ${tag}`,
      priority: "medium",
      desc:
        "Verifica veloce: nessun segreto esposto in log/output, " +
        "route API critiche hanno ancora requireAuth(), " +
        "nessun nuovo npm audit --audit-level=high alert. " +
        "Se anomalia: crea task fix con priorità high. Runbook: company/security/runbooks/security-audit.md",
    },
    {
      dept: "finance",
      title: `Daily FIN — cost tracking ${tag}`,
      priority: "low",
      desc:
        "Controlla costi API del giorno via GET /api/company/costs?days=1. " +
        "Se spesa > $1/giorno: crea alert a CME. " +
        "Se 0 chiamate: verifica che gli agenti siano attivi. " +
        "Runbook: company/finance/runbooks/cost-report.md",
    },
    {
      dept: "data-engineering",
      title: `Daily DE — corpus sync check ${tag}`,
      priority: "low",
      desc:
        "Verifica stato corpus: npx tsx scripts/data-connector.ts status. " +
        "Controllo: nessuna fonte in errore, ultimo sync < 7 giorni. " +
        "Se anomalia: crea task di re-sync con priorità medium.",
    },
  ];
}

// ─── Definizione task di pianificazione idle ──────────────────────────────────

interface IdlePlanningTask {
  dept: string;
  title: string;
  priority: "high" | "medium" | "low";
  desc: string;
}

function buildIdlePlanningTasks(date: string): IdlePlanningTask[] {
  const tag = `[IDLE-${date}]`;
  return [
    {
      dept: "strategy",
      title: `Strategy planning — prossimo ciclo ${tag}`,
      priority: "high",
      desc:
        "Board quasi vuoto: consulta Strategy per nuove opportunità. " +
        "Esegui: opportunity scouting, competitor snapshot, " +
        "aggiornamento roadmap.md, proposta OKR prossimo ciclo. " +
        "Runbook: company/strategy/runbooks/feature-prioritization.md",
    },
    {
      dept: "marketing",
      title: `Marketing planning — nuovi contenuti ${tag}`,
      priority: "medium",
      desc:
        "Board quasi vuoto: pianifica prossimo ciclo contenuti. " +
        "Esegui: keyword research, content calendar, growth analysis. " +
        "Runbook: company/marketing/runbooks/content-calendar.md",
    },
    {
      dept: "architecture",
      title: `Architecture review — tech debt e miglioramenti ${tag}`,
      priority: "medium",
      desc:
        "Board quasi vuoto: revisione tech debt e proposte miglioramento. " +
        "Analizza: ADR da aggiornare, dipendenze npm da aggiornare, " +
        "feature incomplete in CLAUDE.md da pianificare. " +
        "Runbook: company/architecture/runbooks/evaluate-solution.md",
    },
    {
      dept: "quality-assurance",
      title: `QA planning — copertura test ${tag}`,
      priority: "medium",
      desc:
        "Board quasi vuoto: valuta copertura test attuale e pianifica miglioramenti. " +
        "Analizza: file senza test, test obsoleti, nuovi scenari da coprire. " +
        "Runbook: company/quality-assurance/runbooks/run-full-suite.md",
    },
    {
      dept: "security",
      title: `Security planning — audit completo ${tag}`,
      priority: "medium",
      desc:
        "Board quasi vuoto: pianifica security audit completo. " +
        "Esegui: npm audit, revisione route API, verifica header, " +
        "review variabili d'ambiente. " +
        "Runbook: company/security/runbooks/security-audit.md",
    },
    {
      dept: "data-engineering",
      title: `DE planning — nuove fonti da ingestire ${tag}`,
      priority: "low",
      desc:
        "Board quasi vuoto: valuta nuove fonti legislative da aggiungere. " +
        "Esegui: verifica lista sorgenti PLANNED in corpus-sources.ts, " +
        "proponi nuovo corpus su indicazione Strategy. " +
        "Runbook: company/data-engineering/runbooks/add-new-source.md",
    },
  ];
}

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Crea i task di controllo giornalieri per oggi se non esistono già.
 * Restituisce quanti task sono stati creati (0 = già esistevano tutti).
 */
export async function ensureDailyControls(date: string): Promise<{
  created: number;
  skipped: number;
  controls: DailyControl[];
}> {
  const controls = buildDailyControls(date);
  const tag = dailyTag(date);

  // Recupera tutti i task aperti / in corso / review per cercare duplicati
  const existing = await getOpenTasks({ limit: 500 });
  const existingTitles = new Set(existing.map((t) => t.title));

  let created = 0;
  let skipped = 0;

  for (const ctrl of controls) {
    // Controlla se esiste già un task con questo titolo (o che contiene il tag)
    const alreadyExists = existing.some((t) => t.title.includes(tag) && t.department === ctrl.dept);

    if (alreadyExists) {
      skipped++;
      continue;
    }

    await createTask({
      title: ctrl.title,
      description: ctrl.desc,
      department: ctrl.dept as Parameters<typeof createTask>[0]["department"],
      priority: ctrl.priority,
      createdBy: "cme-daily-controls",
    });
    created++;
  }

  return { created, skipped, controls };
}

/**
 * Controlla se il board è in stato "idle" (pochi task aperti).
 * Se sì, crea task di pianificazione per tutti i dipartimenti chiave.
 */
export async function checkIdleAndPlan(date: string): Promise<{
  isIdle: boolean;
  openCount: number;
  threshold: number;
  tasksCreated: number;
}> {
  const board = await getTaskBoard();
  const openCount = board.byStatus.open ?? 0;
  const inProgressCount = board.byStatus.in_progress ?? 0;
  const totalActive = openCount + inProgressCount;

  if (totalActive >= IDLE_THRESHOLD) {
    return { isIdle: false, openCount: totalActive, threshold: IDLE_THRESHOLD, tasksCreated: 0 };
  }

  // Board idle: crea task di pianificazione per tutti i dipartimenti
  const planningTasks = buildIdlePlanningTasks(date);
  const tag = `[IDLE-${date}]`;
  const existing = await getOpenTasks({ limit: 500 });

  let tasksCreated = 0;
  for (const pt of planningTasks) {
    const alreadyExists = existing.some((t) => t.title.includes(tag) && t.department === pt.dept);
    if (alreadyExists) continue;

    await createTask({
      title: pt.title,
      description: pt.desc,
      department: pt.dept as Parameters<typeof createTask>[0]["department"],
      priority: pt.priority,
      status: "review",              // richiede approvazione boss prima di diventare open
      labels: ["needs-approval"],
      createdBy: "cme-idle-trigger",
    });
    tasksCreated++;
  }

  return { isIdle: true, openCount: totalActive, threshold: IDLE_THRESHOLD, tasksCreated };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const date = today();

  if (args.includes("--status")) {
    // Mostra task di controllo di oggi
    const existing = await getOpenTasks({ limit: 500 });
    const tag = dailyTag(date);
    const todayControls = existing.filter((t) => t.title.includes(tag));

    console.log(`\n📋 Daily Controls — ${date}\n`);
    if (todayControls.length === 0) {
      console.log("  Nessun task di controllo creato oggi. Esegui senza --status per crearli.");
    } else {
      for (const t of todayControls) {
        const icon = t.status === "done" ? "✅" : t.status === "in_progress" ? "🔄" : "⏳";
        console.log(`  ${icon} [${t.department}] ${t.title} (${t.status})`);
      }
    }
    console.log();
    return;
  }

  if (args.includes("--idle")) {
    // Forza idle trigger
    console.log("\n⚡ Forzando idle trigger...\n");
    const result = await checkIdleAndPlan(date);
    console.log(`  Task pianificazione creati: ${result.tasksCreated}`);
    console.log();
    return;
  }

  // Default: crea task di controllo + verifica idle
  console.log(`\n🔧 Daily Controls — ${date}\n`);

  const ctrlResult = await ensureDailyControls(date);
  if (ctrlResult.created > 0) {
    console.log(`  ✅ Creati ${ctrlResult.created} task di controllo giornalieri`);
  } else {
    console.log(`  ✓ Task di controllo già presenti (${ctrlResult.skipped} saltati)`);
  }

  const idleResult = await checkIdleAndPlan(date);
  if (idleResult.isIdle) {
    console.log(`\n  ⚡ IDLE TRIGGER: solo ${idleResult.openCount} task attivi (soglia: ${idleResult.threshold})`);
    if (idleResult.tasksCreated > 0) {
      console.log(`  📋 Creati ${idleResult.tasksCreated} task di pianificazione per tutti i dipartimenti`);
    } else {
      console.log(`  ✓ Task di pianificazione già presenti per oggi`);
    }
  }

  console.log();
}

main().catch((err) => {
  console.error("Errore daily-controls:", err);
  process.exit(1);
});
