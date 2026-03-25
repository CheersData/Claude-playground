/**
 * company-plan.ts — Generazione e approvazione piani CME
 *
 * Un piano viene generato automaticamente quando il board è a 0 open + 0 in_progress.
 * Ogni piano richiede approvazione esplicita del boss prima che i task vengano creati.
 * Possono esserci più piani in una giornata (es. se un batch di task si chiude la mattina
 * e un altro il pomeriggio).
 *
 * Usage:
 *   npx tsx scripts/company-plan.ts check              → genera piano se board è vuoto
 *   npx tsx scripts/company-plan.ts list               → lista tutti i piani
 *   npx tsx scripts/company-plan.ts view <id>          → dettaglio piano
 *   npx tsx scripts/company-plan.ts approve <id>       → approva e crea task
 *   npx tsx scripts/company-plan.ts reject <id>        → rifiuta piano
 *   npx tsx scripts/company-plan.ts pending            → mostra piani in attesa
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createTask, getTaskBoard } from "../lib/company/tasks";
import type { Department, TaskPriority } from "../lib/company/types";

// ─── Tipi ───

interface ProposedTask {
  title: string;
  dept: Department;
  priority: TaskPriority;
  desc: string;
  why: string;
}

interface Plan {
  id: string;
  generatedAt: string;
  status: "pending" | "approved" | "rejected";
  triggerContext: string; // cosa ha triggerato il piano
  recentlyCompleted: string[]; // ultimi task completati (titoli)
  proposedTasks: ProposedTask[];
  approvedAt: string | null;
  rejectedAt: string | null;
  createdTaskIds: string[];
}

// ─── Paths ───

const PLANS_DIR = path.resolve(__dirname, "../company/plans");
const INDEX_FILE = path.join(PLANS_DIR, "index.json");

// ─── Filesystem helpers ───

function ensurePlansDir() {
  if (!fs.existsSync(PLANS_DIR)) {
    fs.mkdirSync(PLANS_DIR, { recursive: true });
  }
}

function readIndex(): Plan[] {
  if (!fs.existsSync(INDEX_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8")) as Plan[];
  } catch {
    return [];
  }
}

function writeIndex(plans: Plan[]) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(plans, null, 2), "utf-8");
}

function savePlan(plan: Plan) {
  ensurePlansDir();
  fs.writeFileSync(
    path.join(PLANS_DIR, `${plan.id}.json`),
    JSON.stringify(plan, null, 2),
    "utf-8"
  );
  const index = readIndex();
  const existing = index.findIndex((p) => p.id === plan.id);
  if (existing >= 0) {
    index[existing] = plan;
  } else {
    index.unshift(plan);
  }
  writeIndex(index);
}

function loadPlan(id: string): Plan | null {
  const file = path.join(PLANS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as Plan;
  } catch {
    return null;
  }
}

function generatePlanId(): string {
  const now = new Date();
  const date = now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  return `PLAN-${date}`;
}

// ─── Contesto aziendale per il modello ───

const COMPANY_CONTEXT = `
Poimandres è una piattaforma AI con verticale legale (contratti) con 4 agenti: Classifier, Analyzer, Investigator, Advisor.
Stack: Next.js 15, TypeScript, Supabase/pgvector, Claude/Gemini/Groq, Tailwind 4.
Fase attuale: pre-lancio commerciale PMI. Priorità: qualità prodotto, copertura test, EU AI Act compliance.

=== BACKLOG FEATURE INCOMPLETE (CLAUDE.md §17) ===
- OCR immagini: tesseract.js rimosso — reinstallare quando si implementa
- /analysis/[id]/page.tsx usa mock data — serve GET /api/analyses/[id] con RLS
- Sistema referral avvocati: tabelle DB esistono, nessuna UI — richiede ADR GDPR
- Test coverage gap: agent-runner.ts, tiers.ts, generate.ts, console-token.ts, analysis-cache.ts
- CI/CD: pipeline GitHub Actions non completamente configurata
- UI scoring multidimensionale: backend pronto (legalCompliance, contractBalance, industryPractice), frontend mostra solo fairnessScore
- Statuto dei Lavoratori (L. 300/1970): unica fonte non caricata — API Normattiva produce ZIP vuoti
- Verticale HR: non avviato — fonti mappate in hr-sources.ts

=== TECH DEBT (CLAUDE.md §19) ===
- lib/tiers.ts: global mutable state (currentTier) — documentato, non urgente
- getAverageTimings(): cleanup TTL fire-and-forget — meglio cron dedicato

=== SECURITY (CLAUDE.md §18) ===
- DPA con provider AI (Anthropic, Google, Mistral) — prerequisito lancio commerciale PMI
- Consulente EU AI Act — scadenza agosto 2026
- CSP unsafe-eval — necessario per Next.js dev, rimuovere in prod con nonce-based CSP
- Whitelist console AUTHORIZED_USERS hardcoded — bassa priorità

=== UFFICIO TRADING ===
Fase 1 completata (infrastruttura Python, schema DB, scheduler, bat avvio).
Fase 2 prevista: backtest con dati storici 2 anni, Sharpe > 1.0.
Prima del paper trading serve: backtest framework + dati storici.

=== STACK PROVIDERS AI ===
Free tier disponibili: Groq (1000 req/giorno), Cerebras (1M tok/giorno), Mistral (tutti i modelli, 2 RPM), Gemini (250 req/giorno).
`;

// ─── Generazione piano con AI ───

async function generatePlanContent(
  recentlyCompleted: string[],
  triggerContext: string
): Promise<ProposedTask[]> {
  const groqKey = process.env.GROQ_API_KEY;
  const cerebrasKey = process.env.CEREBRAS_API_KEY;
  const mistralKey = process.env.MISTRAL_API_KEY;

  const apiKey = groqKey || cerebrasKey || mistralKey;
  const baseUrl = groqKey
    ? "https://api.groq.com/openai/v1"
    : cerebrasKey
    ? "https://api.cerebras.ai/v1"
    : "https://api.mistral.ai/v1";
  const model = groqKey
    ? "llama-3.3-70b-versatile"
    : cerebrasKey
    ? "llama-3.3-70b"
    : "mistral-small-latest";

  const recentContext =
    recentlyCompleted.length > 0
      ? `\nTask appena completati (contesto):\n${recentlyCompleted.map((t) => `- ${t}`).join("\n")}`
      : "";

  const prompt = `${COMPANY_CONTEXT}
${recentContext}

Il task board è ora VUOTO (0 open, 0 in_progress). ${triggerContext}

Proponi i prossimi 3-6 task concreti e prioritari per far avanzare Poimandres.
Scegli dai backlog noti. Bilancia: almeno un task di qualità (QA/Security) e uno di feature/prodotto.
Dipartimenti disponibili: architecture, data-engineering, quality-assurance, security, finance, operations, strategy, marketing, ufficio-legale, trading.

Rispondi SOLO con JSON valido, senza markdown, senza backtick:
{
  "tasks": [
    {
      "title": "Titolo breve max 10 parole",
      "dept": "nome-dipartimento",
      "priority": "low|medium|high|critical",
      "desc": "Cosa fare esattamente in 2-3 frasi",
      "why": "Perché ora — 1 frase"
    }
  ]
}`;

  if (!apiKey) {
    // Fallback deterministico
    return getDefaultTasks();
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
        temperature: 0.3,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message?.content ?? "";

    // Parse JSON robusto
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Nessun JSON trovato nella risposta");
    const parsed = JSON.parse(jsonMatch[0]) as { tasks: ProposedTask[] };

    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
      throw new Error("Formato tasks non valido");
    }

    return parsed.tasks;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`[PLAN] Errore AI (${errMsg}) — uso tasks default`);
    return getDefaultTasks();
  }
}

// ─── Task default (fallback deterministico) ───

function getDefaultTasks(): ProposedTask[] {
  return [
    {
      title: "Copertura test agent-runner.ts e tiers.ts",
      dept: "quality-assurance",
      priority: "high",
      desc:
        "Scrivere test unitari per lib/ai-sdk/agent-runner.ts (catena fallback, timeout) e lib/tiers.ts (getAgentChain, setCurrentTier). Gap P1 e P2 del backlog QA.",
      why:
        "I due file core del tier system non hanno copertura — rischio regressioni su fallback AI.",
    },
    {
      title: "UI scoring multidimensionale nella ResultsView",
      dept: "architecture",
      priority: "medium",
      desc:
        "Il backend Advisor produce già legalCompliance, contractBalance, industryPractice. Aggiornare ResultsView.tsx e FairnessScore.tsx per mostrare i 3 punteggi separati oltre al fairnessScore medio.",
      why: "Feature completa lato backend da settimane, effort frontend minimo (1-2h).",
    },
    {
      title: "DPA con provider AI — mappatura dati trasmessi",
      dept: "security",
      priority: "high",
      desc:
        "Prima del lancio commerciale PMI, produrre un documento che mappa quali dati personali vengono trasmessi ad Anthropic, Google, Mistral. Base per la DPA compliance e il registro trattamenti GDPR.",
      why: "Prerequisito legale per vendere a PMI italiane — scadenza lancio.",
    },
    {
      title: "Opportunity Brief verticale HR",
      dept: "strategy",
      priority: "medium",
      desc:
        "Analizzare il mercato HR-tech per l'analisi di contratti di lavoro. Competitor, target, pricing, barriere. Fonti mappate in hr-sources.ts (D.Lgs. 81/2008, 276/2003, 23/2015).",
      why:
        "Il verticale HR è il naturale secondo mercato dopo i contratti commerciali — validation rapida.",
    },
  ];
}

// ─── CHECK — Genera piano se board è vuoto ───

async function commandCheck() {
  console.log("\n=== CME Plan Check ===\n");

  // 1. Leggi stato board
  const board = await getTaskBoard();
  const openCount = board.byStatus.open + board.byStatus.in_progress;

  console.log(
    `Board: ${board.byStatus.open} open | ${board.byStatus.in_progress} in_progress | ${board.byStatus.done} done`
  );

  if (openCount > 0) {
    console.log(`\n✗ Board non vuoto (${openCount} task attivi). Nessun piano generato.\n`);
    return;
  }

  // 2. Verifica se esiste già un piano PENDING
  const plans = readIndex();
  const pendingPlans = plans.filter((p) => p.status === "pending");

  if (pendingPlans.length > 0) {
    console.log(
      `\n⚠ Esiste già un piano in attesa di approvazione: ${pendingPlans[0].id}`
    );
    console.log(`  Esegui: npx tsx scripts/company-plan.ts view ${pendingPlans[0].id}`);
    console.log(`  Oppure approva: npx tsx scripts/company-plan.ts approve ${pendingPlans[0].id}\n`);
    return;
  }

  // 3. Board vuoto + nessun piano pending → genera
  console.log("\n⚡ Board vuoto. Generazione piano in corso...\n");

  const recentTasks = board.recent
    .filter((t) => t.status === "done")
    .slice(0, 8)
    .map((t) => `${t.title} [${t.department}]`);

  const triggerContext =
    recentTasks.length > 0
      ? `Ultimo batch completato: ${recentTasks.slice(0, 3).join(", ")}.`
      : "Board azzerato manualmente o a inizio sessione.";

  const proposedTasks = await generatePlanContent(recentTasks, triggerContext);

  const plan: Plan = {
    id: generatePlanId(),
    generatedAt: new Date().toISOString(),
    status: "pending",
    triggerContext,
    recentlyCompleted: recentTasks,
    proposedTasks,
    approvedAt: null,
    rejectedAt: null,
    createdTaskIds: [],
  };

  ensurePlansDir();
  savePlan(plan);

  console.log(`✓ Piano generato: ${plan.id}`);
  console.log(`\n=== PIANO PROPOSTO ===\n`);
  printPlanTasks(plan);
  console.log(
    `\nIn attesa di approvazione boss.`
  );
  console.log(`  Approva:  npx tsx scripts/company-plan.ts approve ${plan.id}`);
  console.log(`  Rifiuta:  npx tsx scripts/company-plan.ts reject ${plan.id}\n`);
}

// ─── LIST ───

function commandList() {
  const plans = readIndex();

  if (plans.length === 0) {
    console.log("\nNessun piano generato.\n");
    return;
  }

  console.log(`\n=== Piani CME (${plans.length} totali) ===\n`);

  for (const plan of plans) {
    const statusIcon =
      plan.status === "pending"
        ? "⏳"
        : plan.status === "approved"
        ? "✓"
        : "✗";
    const date = new Date(plan.generatedAt).toLocaleString("it-IT");
    console.log(
      `${statusIcon} ${plan.id} | ${plan.status.toUpperCase()} | ${date} | ${plan.proposedTasks.length} task proposti`
    );
    if (plan.status === "pending") {
      console.log(
        `   → npx tsx scripts/company-plan.ts view ${plan.id}`
      );
    }
  }
  console.log("");
}

// ─── PENDING ───

function commandPending() {
  const plans = readIndex();
  const pending = plans.filter((p) => p.status === "pending");

  if (pending.length === 0) {
    console.log("\n✓ Nessun piano in attesa di approvazione.\n");
    return;
  }

  console.log(`\n⏳ ${pending.length} piano/i in attesa di approvazione:\n`);

  for (const plan of pending) {
    const date = new Date(plan.generatedAt).toLocaleString("it-IT");
    console.log(`Piano: ${plan.id} — generato ${date}`);
    console.log(`Contesto: ${plan.triggerContext}`);
    printPlanTasks(plan);
    console.log(`  Approva:  npx tsx scripts/company-plan.ts approve ${plan.id}`);
    console.log(`  Rifiuta:  npx tsx scripts/company-plan.ts reject ${plan.id}`);
    console.log("");
  }
}

// ─── VIEW ───

function commandView(id: string) {
  const plan = loadPlan(id);

  if (!plan) {
    // Prova ricerca parziale
    const all = readIndex();
    const match = all.find((p) => p.id.includes(id));
    if (match) return commandView(match.id);
    console.error(`\nPiano "${id}" non trovato.\n`);
    process.exit(1);
  }

  const date = new Date(plan.generatedAt).toLocaleString("it-IT");
  const statusIcon =
    plan.status === "pending" ? "⏳" : plan.status === "approved" ? "✓" : "✗";

  console.log(`\n=== Piano ${plan.id} ===`);
  console.log(`${statusIcon} Status: ${plan.status.toUpperCase()}`);
  console.log(`Generato: ${date}`);
  console.log(`Contesto: ${plan.triggerContext}`);

  if (plan.recentlyCompleted.length > 0) {
    console.log(`\nTask completati di recente:`);
    for (const t of plan.recentlyCompleted) {
      console.log(`  - ${t}`);
    }
  }

  console.log(`\nTask proposti:`);
  printPlanTasks(plan);

  if (plan.status === "approved") {
    console.log(
      `\nApprovato: ${new Date(plan.approvedAt!).toLocaleString("it-IT")}`
    );
    if (plan.createdTaskIds.length > 0) {
      console.log(`Task creati (${plan.createdTaskIds.length}):`);
      for (const id of plan.createdTaskIds) {
        console.log(`  - ${id.slice(0, 8)}`);
      }
    }
  } else if (plan.status === "rejected") {
    console.log(
      `\nRifiutato: ${new Date(plan.rejectedAt!).toLocaleString("it-IT")}`
    );
  } else {
    console.log(`\n  Approva:  npx tsx scripts/company-plan.ts approve ${plan.id}`);
    console.log(`  Rifiuta:  npx tsx scripts/company-plan.ts reject ${plan.id}`);
  }

  console.log("");
}

// ─── APPROVE ───

async function commandApprove(id: string) {
  const plan = loadPlan(id);

  if (!plan) {
    const all = readIndex();
    const match = all.find((p) => p.id.includes(id));
    if (match) return commandApprove(match.id);
    console.error(`\nPiano "${id}" non trovato.\n`);
    process.exit(1);
  }

  if (plan.status !== "pending") {
    console.error(`\nPiano ${plan.id} è già ${plan.status}. Solo piani "pending" possono essere approvati.\n`);
    process.exit(1);
  }

  console.log(`\n=== Approvazione Piano ${plan.id} ===\n`);
  console.log(`Creo ${plan.proposedTasks.length} task sul board...\n`);

  const createdIds: string[] = [];

  for (const proposed of plan.proposedTasks) {
    try {
      const task = await createTask({
        title: proposed.title,
        department: proposed.dept,
        priority: proposed.priority,
        createdBy: "cme",
        description: `${proposed.desc}\n\nPerché ora: ${proposed.why}\n\n[Piano: ${plan.id}]`,
      });
      createdIds.push(task.id);
      console.log(`  ✓ [${proposed.dept}] ${proposed.title}`);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`  ✗ Errore creazione task "${proposed.title}": ${errMsg}`);
    }
  }

  plan.status = "approved";
  plan.approvedAt = new Date().toISOString();
  plan.createdTaskIds = createdIds;
  savePlan(plan);

  console.log(`\n✓ Piano ${plan.id} approvato.`);
  console.log(`  ${createdIds.length}/${plan.proposedTasks.length} task creati sul board.\n`);
  console.log(`  Board aggiornato: npx tsx scripts/company-tasks.ts board\n`);
}

// ─── REJECT ───

function commandReject(id: string) {
  const plan = loadPlan(id);

  if (!plan) {
    const all = readIndex();
    const match = all.find((p) => p.id.includes(id));
    if (match) return commandReject(match.id);
    console.error(`\nPiano "${id}" non trovato.\n`);
    process.exit(1);
  }

  if (plan.status !== "pending") {
    console.error(`\nPiano ${plan.id} è già ${plan.status}.\n`);
    process.exit(1);
  }

  plan.status = "rejected";
  plan.rejectedAt = new Date().toISOString();
  savePlan(plan);

  console.log(`\n✗ Piano ${plan.id} rifiutato.`);
  console.log(`  Genera un nuovo piano: npx tsx scripts/company-plan.ts check\n`);
}

// ─── Helper display ───

function printPlanTasks(plan: Plan) {
  const priorityIcon = (p: string) =>
    p === "critical" ? "🔴" : p === "high" ? "🟠" : p === "medium" ? "🟡" : "⚪";

  for (const [i, task] of plan.proposedTasks.entries()) {
    console.log(
      `  ${i + 1}. ${priorityIcon(task.priority)} [${task.dept}] ${task.title}`
    );
    console.log(`     ${task.desc}`);
    console.log(`     → ${task.why}`);
  }
}

// ─── MAIN ───

const args = process.argv.slice(2);
const command = args[0];
const arg1 = args[1];

(async () => {
  switch (command) {
    case "check":
      await commandCheck();
      break;
    case "list":
      commandList();
      break;
    case "pending":
      commandPending();
      break;
    case "view":
      if (!arg1) {
        console.error("Usage: view <plan-id>");
        process.exit(1);
      }
      commandView(arg1);
      break;
    case "approve":
      if (!arg1) {
        console.error("Usage: approve <plan-id>");
        process.exit(1);
      }
      await commandApprove(arg1);
      break;
    case "reject":
      if (!arg1) {
        console.error("Usage: reject <plan-id>");
        process.exit(1);
      }
      commandReject(arg1);
      break;
    default:
      console.log(`
Usage: npx tsx scripts/company-plan.ts <command>

Commands:
  check              Genera piano se board è 0 open + 0 in_progress
  list               Lista tutti i piani (pending, approved, rejected)
  pending            Mostra solo piani in attesa di approvazione
  view <id>          Dettaglio piano
  approve <id>       Approva piano e crea i task sul board
  reject <id>        Rifiuta piano
`);
  }
})().catch(console.error);
