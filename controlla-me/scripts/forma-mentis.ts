/**
 * Forma Mentis CLI — Bridge between Forma Mentis infrastructure and CME operations.
 *
 * Unified CLI for all Forma Mentis layers:
 *   Layer 1 (MEMORIA): sessions, department memory, company knowledge
 *   Layer 2 (SINAPSI): department discovery, capability search
 *   Layer 3 (COSCIENZA): goals, goal monitoring
 *   Layer 4 (RIFLESSIONE): decision journal, pending reviews
 *
 * Usage:
 *   npx tsx scripts/forma-mentis.ts context [--dept <dept>] [--limit <n>]
 *   npx tsx scripts/forma-mentis.ts remember --dept <dept> --key <key> --content <content> [--category <cat>]
 *   npx tsx scripts/forma-mentis.ts decide --title <title> --dept <dept> --description <desc> --expected <outcome> [--type <type>] [--review-days <n>]
 *   npx tsx scripts/forma-mentis.ts goals [--dept <dept>] [--status <status>]
 *   npx tsx scripts/forma-mentis.ts goals create --title "..." --dept <dept> --type okr [--target <n>] [--desc "..."] [--deadline YYYY-MM-DD] [--metric "..."] [--unit <unit>] [--status active]
 *   npx tsx scripts/forma-mentis.ts goals update <goalId> [--current <n>] [--desc "..."] [--source "..."]
 *   npx tsx scripts/forma-mentis.ts goals set-status <goalId> --status <active|at_risk|achieved|missed|paused>
 *   npx tsx scripts/forma-mentis.ts goal-create --title "..." --dept <dept> --metric "..." --target <n> [--unit <unit>] [--deadline YYYY-MM-DD] [--type okr|kpi|milestone]
 *   npx tsx scripts/forma-mentis.ts goal-update <goalId> --value <n> --source "..."
 *   npx tsx scripts/forma-mentis.ts goal-set-status <goalId> --status <active|at_risk|achieved|missed|paused>
 *   npx tsx scripts/forma-mentis.ts discover [--capability <cap>] [--skill <skill>] [--dept <dept>]
 *   npx tsx scripts/forma-mentis.ts session-open --type <type> --by <who>
 *   npx tsx scripts/forma-mentis.ts session-close <sessionId> --summary <summary> [--decisions '<json>'] [--files-modified file1,file2]
 *   npx tsx scripts/forma-mentis.ts search <query>
 *   npx tsx scripts/forma-mentis.ts approve --proposal "Lancio verticale HR" [--task-id abc123] [--timeout 300000]
 */

import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// Self-timeout: auto-exit after 5 min to prevent zombie accumulation
import { enableSelfTimeout } from "../lib/company/self-preservation";
enableSelfTimeout(5 * 60 * 1000);

// ─── Layer 1: MEMORIA ───
import {
  openSession,
  closeSession,
  getRecentSessions,
  getDepartmentMemories,
  upsertDepartmentMemory,
  getRecentKnowledge,
} from "../lib/company/memory";
import type {
  CompanySession,
  SessionDecision,
  DepartmentMemoryEntry,
  // CompanyKnowledgeEntry removed — unused
} from "../lib/company/memory";

// ─── Layer 2: SINAPSI ───
import {
  loadDepartmentCards,
  findByCapability,
  findSkill,
  getCapabilitySummary,
} from "../lib/company/sinapsi";

// ─── Layer 3: COSCIENZA ───
import { getActiveGoals, createGoal, updateGoalValue, updateGoal } from "../lib/company/coscienza";
import type { CompanyGoal, GoalStatus } from "../lib/company/coscienza";

// ─── Layer 4: RIFLESSIONE ───
import {
  recordDecision,
  getDecisionsPendingReview,
} from "../lib/company/riflessione";
import type { DecisionType } from "../lib/company/riflessione";

// ─── Admin client for direct queries ───
import { createAdminClient } from "../lib/supabase/admin";

// ─── Telegram Approval ───
import {
  sendApprovalRequest,
  waitForApproval,
  isTelegramConfigured as isTgConfigured,
} from "../lib/company/telegram-approval";

// ─── CLI Parsing ───

const args = process.argv.slice(2);
const command = args[0];

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

// ─── Formatting Helpers ───

function formatDate(iso: string | null): string {
  if (!iso) return "?";
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number | null): string {
  if (!ms) return "?";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}min`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

function progressBar(current: number, target: number, width = 20): string {
  const ratio = target > 0 ? Math.min(current / target, 1) : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const pct = Math.round(ratio * 100);
  return `[${"#".repeat(filled)}${"-".repeat(empty)}] ${pct}%`;
}

// ─── Supabase availability check ───

function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ─── Commands ───

async function cmdContext() {
  const dept = getFlag("dept");
  const limit = parseInt(getFlag("limit") ?? "5", 10);

  if (!isSupabaseConfigured()) {
    console.log("[WARN] Supabase non configurato. Context non disponibile.");
    console.log("       Imposta NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY in .env.local");
    return;
  }

  console.log("\n" + "=".repeat(60));
  console.log("  FORMA MENTIS — CONTEXT STARTUP");
  if (dept) console.log(`  Filtro dipartimento: ${dept}`);
  console.log("=".repeat(60));

  // ── 1. Recent sessions ──
  try {
    const sessions = await getRecentSessions(dept ?? undefined, limit);
    console.log(`\n--- SESSIONI RECENTI (${sessions.length}) ---`);
    if (sessions.length === 0) {
      console.log("  Nessuna sessione registrata.");
    } else {
      for (const s of sessions) {
        const dateStr = formatDate(s.startedAt);
        const durationStr = formatDuration(s.durationMs);
        const deptStr = s.department ?? "cross-dept";
        console.log(`  [${s.sessionType.toUpperCase()}] ${dateStr} | ${deptStr} | ${durationStr} | by: ${s.startedBy}`);
        if (s.summary) {
          console.log(`    ${truncate(s.summary, 120)}`);
        }
        if (s.keyDecisions.length > 0) {
          for (const d of s.keyDecisions.slice(0, 3)) {
            console.log(`    -> ${d.decision} (${d.impact})`);
          }
        }
        if (s.errorsEncountered.length > 0) {
          console.log(`    ! ${s.errorsEncountered.length} errori durante la sessione`);
        }
      }
    }
  } catch (err) {
    console.log("\n--- SESSIONI RECENTI ---");
    console.log(`  [ERRORE] ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 2. Active warnings from department_memory ──
  try {
    let warnings: DepartmentMemoryEntry[] = [];
    if (dept) {
      warnings = await getDepartmentMemories(dept, { categories: ["warning"], limit: 10 });
    } else {
      // Get warnings across all departments
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("department_memory")
        .select("*")
        .eq("category", "warning")
        .eq("is_active", true)
        .order("last_accessed_at", { ascending: false, nullsFirst: false })
        .limit(10);

      if (!error && data) {
        warnings = data.map((row: Record<string, unknown>) => ({
          id: row.id as string,
          department: row.department as string,
          category: row.category as DepartmentMemoryEntry["category"],
          key: row.key as string,
          content: row.content as string,
          confidence: (row.confidence as number) ?? 1.0,
          sourceSessionId: null,
          sourceTaskId: null,
          timesAccessed: (row.times_accessed as number) ?? 0,
          lastAccessedAt: (row.last_accessed_at as string) ?? null,
          expiresAt: (row.expires_at as string) ?? null,
          isActive: true,
        }));
      }
    }

    if (warnings.length > 0) {
      console.log(`\n--- AVVISI ATTIVI (${warnings.length}) ---`);
      for (const w of warnings) {
        console.log(`  [!] ${w.department}/${w.key}: ${truncate(w.content, 100)}`);
      }
    }
  } catch (err) {
    console.log(`\n  [ERRORE warnings] ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 3. Goals at risk ──
  try {
    const goals = await getActiveGoals(dept ?? undefined);
    const atRisk = goals.filter(
      (g) => g.status === "at_risk" || (g.status === "active" && g.targetValue > 0 && g.currentValue / g.targetValue < 0.3)
    );

    if (atRisk.length > 0) {
      console.log(`\n--- GOAL A RISCHIO (${atRisk.length}) ---`);
      for (const g of atRisk) {
        const pct = g.targetValue > 0 ? Math.round((g.currentValue / g.targetValue) * 100) : 0;
        const statusLabel = g.status === "at_risk" ? "AT RISK" : "LOW PROGRESS";
        console.log(
          `  [${statusLabel}] ${g.title} | ${g.currentValue}/${g.targetValue}${g.unit} (${pct}%) | dept: ${g.department}`
        );
        if (g.deadline) {
          console.log(`    Deadline: ${formatDate(g.deadline)}`);
        }
      }
    }
  } catch (err) {
    console.log(`\n  [ERRORE goals] ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 4. Pending decision reviews ──
  try {
    const pendingReviews = await getDecisionsPendingReview();
    const filtered = dept
      ? pendingReviews.filter((d) => d.department === dept)
      : pendingReviews;

    if (filtered.length > 0) {
      console.log(`\n--- DECISIONI DA RIVEDERE (${filtered.length}) ---`);
      for (const d of filtered) {
        const dueStr = formatDate(d.reviewDueAt);
        console.log(`  [REVIEW] ${d.title} | dept: ${d.department} | tipo: ${d.decisionType} | scadenza: ${dueStr}`);
        console.log(`    Outcome atteso: ${truncate(d.expectedOutcome, 100)}`);
      }
    }
  } catch (err) {
    console.log(`\n  [ERRORE decisions] ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 5. Recent company knowledge ──
  try {
    const knowledge = await getRecentKnowledge(limit);
    const filtered = dept
      ? knowledge.filter((k) => k.departments.includes(dept) || k.departments.length === 0)
      : knowledge;

    if (filtered.length > 0) {
      console.log(`\n--- KNOWLEDGE RECENTE (${filtered.length}) ---`);
      for (const k of filtered) {
        const deptsStr = k.departments.length > 0 ? k.departments.join(", ") : "all";
        console.log(`  [${k.category.toUpperCase()}] ${k.title} | depts: ${deptsStr}`);
        console.log(`    ${truncate(k.content, 120)}`);
      }
    }
  } catch (err) {
    console.log(`\n  [ERRORE knowledge] ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log("\n" + "=".repeat(60) + "\n");
}

async function cmdRemember() {
  const dept = getFlag("dept");
  const key = getFlag("key");
  const content = getFlag("content");
  const category = (getFlag("category") ?? "fact") as DepartmentMemoryEntry["category"];

  if (!dept || !key || !content) {
    console.error("Usage: remember --dept <dept> --key <key> --content <content> [--category fact|learning|warning|preference|context]");
    process.exit(1);
  }

  if (!isSupabaseConfigured()) {
    console.error("[ERRORE] Supabase non configurato.");
    process.exit(1);
  }

  const validCategories = ["fact", "learning", "warning", "preference", "context"];
  if (!validCategories.includes(category)) {
    console.error(`Categoria non valida: "${category}". Valori ammessi: ${validCategories.join(", ")}`);
    process.exit(1);
  }

  await upsertDepartmentMemory({
    department: dept,
    category,
    key,
    content,
  });

  console.log(`\n  Memorizzato: ${dept}/${key} [${category}]`);
  console.log(`  Contenuto: ${truncate(content, 100)}\n`);
}

async function cmdDecide() {
  const title = getFlag("title");
  const dept = getFlag("dept");
  const description = getFlag("description");
  const expected = getFlag("expected");
  const type = (getFlag("type") ?? "operational") as DecisionType;
  const reviewDays = parseInt(getFlag("review-days") ?? "14", 10);

  if (!title || !dept || !description || !expected) {
    console.error("Usage: decide --title <title> --dept <dept> --description <desc> --expected <outcome> [--type architectural|operational|strategic|tactical] [--review-days 14]");
    process.exit(1);
  }

  if (!isSupabaseConfigured()) {
    console.error("[ERRORE] Supabase non configurato.");
    process.exit(1);
  }

  const validTypes = ["architectural", "operational", "strategic", "tactical"];
  if (!validTypes.includes(type)) {
    console.error(`Tipo non valido: "${type}". Valori ammessi: ${validTypes.join(", ")}`);
    process.exit(1);
  }

  const reviewDueAt = new Date(Date.now() + reviewDays * 24 * 60 * 60 * 1000).toISOString();

  const decision = await recordDecision({
    title,
    description,
    department: dept,
    decisionType: type,
    decidedBy: "cme",
    expectedOutcome: expected,
    reviewDueAt,
  });

  console.log(`\n  Decisione registrata: ${decision.id.slice(0, 8)}`);
  console.log(`  Titolo: ${title}`);
  console.log(`  Tipo: ${type} | Dipartimento: ${dept}`);
  console.log(`  Review prevista: ${formatDate(reviewDueAt)} (${reviewDays} giorni)`);
  console.log(`  Outcome atteso: ${truncate(expected, 100)}\n`);
}

async function cmdGoals() {
  // Check for sub-commands: goals create | goals update <id> | goals set-status <id>
  const subCommand = args[1];

  if (subCommand === "create") {
    return cmdGoalsCreate();
  }
  if (subCommand === "update") {
    return cmdGoalsUpdate();
  }
  if (subCommand === "set-status") {
    return cmdGoalsSetStatus();
  }

  // Default: list goals
  const dept = getFlag("dept");
  const statusFilter = getFlag("status");

  if (!isSupabaseConfigured()) {
    console.error("[ERRORE] Supabase non configurato.");
    process.exit(1);
  }

  let goals: CompanyGoal[];

  if (statusFilter && !["active", "at_risk", "achieved", "missed", "paused"].includes(statusFilter)) {
    console.error(`Status non valido: "${statusFilter}". Valori ammessi: active, at_risk, achieved, missed, paused`);
    process.exit(1);
  }

  if (statusFilter) {
    // Query with specific status filter
    const admin = createAdminClient();
    let query = admin
      .from("company_goals")
      .select("*")
      .eq("status", statusFilter)
      .order("created_at", { ascending: false });

    if (dept) {
      query = query.eq("department", dept);
    }

    const { data, error } = await query;
    if (error) {
      console.error(`[ERRORE] ${error.message}`);
      process.exit(1);
    }

    // Map rows manually (same as getActiveGoals internal mapping)
    goals = (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      title: row.title as string,
      description: (row.description as string) ?? null,
      metric: row.metric as string,
      targetValue: Number(row.target_value),
      currentValue: Number(row.current_value),
      unit: (row.unit as string) ?? "",
      department: row.department as string,
      ownerAgent: (row.owner_agent as string) ?? null,
      deadline: (row.deadline as string) ?? null,
      status: row.status as CompanyGoal["status"],
      actionsIfBehind: (row.actions_if_behind as CompanyGoal["actionsIfBehind"]) ?? [],
      lastCheckedAt: (row.last_checked_at as string) ?? null,
      checkIntervalMinutes: (row.check_interval_minutes as number) ?? 60,
      valueHistory: (row.value_history as CompanyGoal["valueHistory"]) ?? [],
      parentGoalId: (row.parent_goal_id as string) ?? null,
      tags: (row.tags as string[]) ?? [],
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));
  } else {
    goals = await getActiveGoals(dept ?? undefined);
  }

  console.log(`\n--- GOALS (${goals.length}) ---`);
  if (goals.length === 0) {
    console.log("  Nessun goal trovato.\n");
    return;
  }

  // Table header
  console.log(
    "  " +
    "Titolo".padEnd(40) +
    "Metrica".padEnd(20) +
    "Progresso".padEnd(28) +
    "Stato".padEnd(10) +
    "Dept".padEnd(15)
  );
  console.log("  " + "-".repeat(113));

  for (const g of goals) {
    const titleStr = truncate(g.title, 38).padEnd(40);
    const metricStr = truncate(g.metric, 18).padEnd(20);
    const bar = progressBar(g.currentValue, g.targetValue);
    const progressStr = `${bar}`.padEnd(28);
    const statusStr = g.status.padEnd(10);
    const deptStr = g.department.padEnd(15);
    console.log(`  ${titleStr}${metricStr}${progressStr}${statusStr}${deptStr}`);
  }
  console.log("");
}

/**
 * goals create — Create a new goal.
 * Usage: goals create --title "..." --dept <dept> --type okr [--target <n>] [--desc "..."] [--deadline YYYY-MM-DD] [--metric "..."] [--unit <unit>] [--status active]
 */
async function cmdGoalsCreate() {
  const title = getFlag("title");
  const dept = getFlag("dept");
  const type = getFlag("type");
  const targetRaw = getFlag("target");
  const desc = getFlag("desc");
  const deadline = getFlag("deadline");
  const metric = getFlag("metric");
  const unit = getFlag("unit") ?? "";
  const status = getFlag("status") ?? "active";

  if (!title || !dept || !type) {
    console.error("Usage: goals create --title <title> --dept <dept> --type <okr|kpi|milestone> [--target <number>] [--desc \"...\"] [--deadline YYYY-MM-DD] [--metric \"...\"] [--unit <unit>] [--status active]");
    process.exit(1);
  }

  if (!isSupabaseConfigured()) {
    console.error("[ERRORE] Supabase non configurato.");
    process.exit(1);
  }

  const validTypes = ["okr", "kpi", "milestone"];
  if (!validTypes.includes(type)) {
    console.error(`Tipo non valido: "${type}". Valori ammessi: ${validTypes.join(", ")}`);
    process.exit(1);
  }

  const validStatuses = ["active", "at_risk", "achieved", "missed", "paused"];
  if (!validStatuses.includes(status)) {
    console.error(`Status non valido: "${status}". Valori ammessi: ${validStatuses.join(", ")}`);
    process.exit(1);
  }

  const targetValue = targetRaw ? parseFloat(targetRaw) : 100;
  if (targetRaw && isNaN(targetValue)) {
    console.error(`Valore target non valido: "${targetRaw}". Deve essere un numero.`);
    process.exit(1);
  }

  // Use title as metric fallback if --metric not provided
  const goalMetric = metric ?? title;

  const goal = await createGoal({
    title,
    description: desc,
    department: dept,
    metric: goalMetric,
    targetValue,
    unit,
    deadline: deadline ?? undefined,
    tags: [type],
  });

  // If status is not "active" (the default), update it
  if (status !== "active") {
    await updateGoal(goal.id, { status: status as GoalStatus });
  }

  console.log(`\n  Goal creato: ${goal.id}`);
  console.log(`  Titolo: ${title}`);
  console.log(`  Metrica: ${goalMetric} | Target: ${targetValue}${unit ? " " + unit : ""}`);
  console.log(`  Dipartimento: ${dept} | Tipo: ${type} | Status: ${status}`);
  if (desc) console.log(`  Descrizione: ${truncate(desc, 100)}`);
  if (deadline) console.log(`  Deadline: ${deadline}`);
  console.log("");
}

/**
 * goals update — Update an existing goal's current_value and/or description.
 * Usage: goals update <goalId> [--current <number>] [--desc "..."] [--source "..."]
 */
async function cmdGoalsUpdate() {
  const goalId = args[2];

  if (!goalId) {
    console.error("Usage: goals update <goalId> [--current <number>] [--desc \"...\"] [--source \"...\"]");
    process.exit(1);
  }

  if (!isSupabaseConfigured()) {
    console.error("[ERRORE] Supabase non configurato.");
    process.exit(1);
  }

  const currentRaw = getFlag("current");
  const desc = getFlag("desc");
  const source = getFlag("source") ?? "manual";

  if (!currentRaw && !desc) {
    console.error("Almeno uno tra --current e --desc è obbligatorio.");
    console.error("Usage: goals update <goalId> [--current <number>] [--desc \"...\"]");
    process.exit(1);
  }

  let currentValue: number | undefined;
  if (currentRaw) {
    currentValue = parseFloat(currentRaw);
    if (isNaN(currentValue)) {
      console.error(`Valore non valido: "${currentRaw}". Deve essere un numero.`);
      process.exit(1);
    }
  }

  // If updating current_value, use updateGoalValue to append to value_history
  if (currentValue !== undefined) {
    const updated = await updateGoalValue(goalId, currentValue, source);
    if (!updated) {
      console.error(`Goal "${goalId}" non trovato.`);
      process.exit(1);
    }

    // If also updating description, do a separate updateGoal call
    if (desc) {
      await updateGoal(goalId, { description: desc });
    }

    const bar = progressBar(updated.currentValue, updated.targetValue);
    console.log(`\n  Goal aggiornato: ${updated.id.slice(0, 8)}`);
    console.log(`  Titolo: ${updated.title}`);
    console.log(`  Valore: ${updated.currentValue}/${updated.targetValue}${updated.unit ? " " + updated.unit : ""}`);
    console.log(`  Progresso: ${bar}`);
    if (desc) console.log(`  Descrizione aggiornata: ${truncate(desc, 100)}`);
    console.log("");
  } else if (desc) {
    // Only updating description
    const updated = await updateGoal(goalId, { description: desc });
    console.log(`\n  Goal aggiornato: ${updated.id.slice(0, 8)}`);
    console.log(`  Titolo: ${updated.title}`);
    console.log(`  Descrizione aggiornata: ${truncate(desc, 100)}`);
    console.log("");
  }
}

/**
 * goals set-status — Change the status of a goal.
 * Usage: goals set-status <goalId> --status <active|at_risk|achieved|missed|paused>
 */
async function cmdGoalsSetStatus() {
  const goalId = args[2];
  const status = getFlag("status");

  if (!goalId || !status) {
    console.error("Usage: goals set-status <goalId> --status <active|at_risk|achieved|missed|paused>");
    process.exit(1);
  }

  if (!isSupabaseConfigured()) {
    console.error("[ERRORE] Supabase non configurato.");
    process.exit(1);
  }

  const validStatuses = ["active", "at_risk", "achieved", "missed", "paused"];
  if (!validStatuses.includes(status)) {
    console.error(`Status non valido: "${status}". Valori ammessi: ${validStatuses.join(", ")}`);
    process.exit(1);
  }

  const updated = await updateGoal(goalId, { status: status as GoalStatus });

  console.log(`\n  Goal status aggiornato: ${updated.id.slice(0, 8)}`);
  console.log(`  Titolo: ${updated.title}`);
  console.log(`  Nuovo status: ${status}`);
  console.log("");
}

async function cmdGoalCreate() {
  const title = getFlag("title");
  const dept = getFlag("dept");
  const metric = getFlag("metric");
  const targetRaw = getFlag("target");
  const unit = getFlag("unit") ?? "";
  const deadline = getFlag("deadline");
  const type = getFlag("type") ?? "kpi";

  if (!title || !dept || !metric || !targetRaw) {
    console.error("Usage: goal-create --title <title> --dept <dept> --metric <metric> --target <number> [--unit <unit>] [--deadline YYYY-MM-DD] [--type okr|kpi|milestone]");
    process.exit(1);
  }

  if (!isSupabaseConfigured()) {
    console.error("[ERRORE] Supabase non configurato.");
    process.exit(1);
  }

  const targetValue = parseFloat(targetRaw);
  if (isNaN(targetValue)) {
    console.error(`Valore target non valido: "${targetRaw}". Deve essere un numero.`);
    process.exit(1);
  }

  const validTypes = ["okr", "kpi", "milestone"];
  if (!validTypes.includes(type)) {
    console.error(`Tipo non valido: "${type}". Valori ammessi: ${validTypes.join(", ")}`);
    process.exit(1);
  }

  const goal = await createGoal({
    title,
    department: dept,
    metric,
    targetValue,
    unit,
    deadline: deadline ?? undefined,
    tags: [type],
  });

  console.log(`\n  Goal creato: ${goal.id}`);
  console.log(`  Titolo: ${title}`);
  console.log(`  Metrica: ${metric} | Target: ${targetValue}${unit ? " " + unit : ""}`);
  console.log(`  Dipartimento: ${dept} | Tipo: ${type}`);
  if (deadline) console.log(`  Deadline: ${deadline}`);
  console.log("");
}

async function cmdGoalUpdate() {
  const goalId = args[1];
  const valueRaw = getFlag("value");
  const source = getFlag("source");

  if (!goalId || !valueRaw || !source) {
    console.error("Usage: goal-update <goalId> --value <number> --source <source>");
    process.exit(1);
  }

  if (!isSupabaseConfigured()) {
    console.error("[ERRORE] Supabase non configurato.");
    process.exit(1);
  }

  const value = parseFloat(valueRaw);
  if (isNaN(value)) {
    console.error(`Valore non valido: "${valueRaw}". Deve essere un numero.`);
    process.exit(1);
  }

  const updated = await updateGoalValue(goalId, value, source);
  if (!updated) {
    console.error(`Goal "${goalId}" non trovato.`);
    process.exit(1);
  }

  const bar = progressBar(updated.currentValue, updated.targetValue);
  console.log(`\n  Goal aggiornato: ${updated.id.slice(0, 8)}`);
  console.log(`  Titolo: ${updated.title}`);
  console.log(`  Valore: ${updated.currentValue}/${updated.targetValue}${updated.unit ? " " + updated.unit : ""}`);
  console.log(`  Progresso: ${bar}`);
  console.log(`  Source: ${source}`);
  console.log("");
}

async function cmdGoalSetStatus() {
  const goalId = args[1];
  const status = getFlag("status");

  if (!goalId || !status) {
    console.error("Usage: goal-set-status <goalId> --status <active|at_risk|achieved|missed|paused>");
    process.exit(1);
  }

  if (!isSupabaseConfigured()) {
    console.error("[ERRORE] Supabase non configurato.");
    process.exit(1);
  }

  const validStatuses = ["active", "at_risk", "achieved", "missed", "paused"];
  if (!validStatuses.includes(status)) {
    console.error(`Status non valido: "${status}". Valori ammessi: ${validStatuses.join(", ")}`);
    process.exit(1);
  }

  const updated = await updateGoal(goalId, { status: status as GoalStatus });

  console.log(`\n  Goal status aggiornato: ${updated.id.slice(0, 8)}`);
  console.log(`  Titolo: ${updated.title}`);
  console.log(`  Nuovo status: ${status}`);
  console.log("");
}

async function cmdDiscover() {
  const capability = getFlag("capability");
  const skill = getFlag("skill");
  const dept = getFlag("dept");

  if (!capability && !skill && !dept) {
    // Show all departments and their capabilities
    const summary = getCapabilitySummary();

    if (summary.length === 0) {
      console.log("\n  Nessun department-card.json trovato.");
      console.log("  I file department-card.json vanno creati in company/<dept>/department-card.json\n");
      return;
    }

    console.log("\n--- DIPARTIMENTI & CAPABILITY ---");
    for (const s of summary) {
      console.log(`\n  ${s.department.toUpperCase()} [${s.status}]`);
      if (s.capabilities.length > 0) {
        console.log(`    Capabilities: ${s.capabilities.join(", ")}`);
      }
      if (s.skills.length > 0) {
        console.log(`    Skills: ${s.skills.join(", ")}`);
      }
    }
    console.log("");
    return;
  }

  if (capability) {
    const results = findByCapability(capability);
    if (results.length === 0) {
      console.log(`\n  Nessun dipartimento offre la capability "${capability}".\n`);
    } else {
      console.log(`\n  Capability "${capability}" trovata in:`);
      for (const card of results) {
        const cap = card.capabilities.find((c) => c.id === capability);
        console.log(`    ${card.id}: ${cap?.description ?? "?"}`);
        if (cap?.costEstimate) console.log(`      Costo stimato: ${cap.costEstimate}`);
        if (cap?.estimatedDurationMs) console.log(`      Durata stimata: ${formatDuration(cap.estimatedDurationMs)}`);
      }
      console.log("");
    }
    return;
  }

  if (skill) {
    const result = findSkill(skill);
    if (!result) {
      console.log(`\n  Skill "${skill}" non trovata.\n`);
    } else {
      console.log(`\n  Skill "${skill}" in ${result.card.id}:`);
      console.log(`    Descrizione: ${result.skill.description}`);
      console.log(`    Direct callable: ${result.skill.isDirectCallable ? "si" : "no"}`);
      console.log(`    Returns: ${result.skill.returns}`);
      if (result.skill.parameters.length > 0) {
        console.log("    Parametri:");
        for (const p of result.skill.parameters) {
          const reqStr = p.required ? " (obbligatorio)" : "";
          console.log(`      --${p.name}: ${p.type}${reqStr} — ${p.description}`);
        }
      }
      console.log("");
    }
    return;
  }

  if (dept) {
    const cards = loadDepartmentCards();
    const card = cards.get(dept);
    if (!card) {
      console.log(`\n  Nessun department-card.json per "${dept}".\n`);
      return;
    }

    console.log(`\n  ${card.name} [${card.status}]`);
    console.log(`  ID: ${card.id}`);
    console.log(`  Input: ${card.inputModes.join(", ")}`);
    console.log(`  Output: ${card.outputModes.join(", ")}`);

    if (card.capabilities.length > 0) {
      console.log("\n  Capabilities:");
      for (const c of card.capabilities) {
        console.log(`    - ${c.id}: ${c.description}`);
      }
    }

    if (card.skills.length > 0) {
      console.log("\n  Skills:");
      for (const s of card.skills) {
        const callStr = s.isDirectCallable ? " [direct]" : "";
        console.log(`    - ${s.id}${callStr}: ${s.description}`);
      }
    }

    if (card.directQueryTargets.length > 0) {
      console.log(`\n  Puo interrogare direttamente: ${card.directQueryTargets.join(", ")}`);
    }
    if (card.directQuerySources.length > 0) {
      console.log(`  Interrogabile da: ${card.directQuerySources.join(", ")}`);
    }
    console.log("");
    return;
  }
}

async function cmdSessionOpen() {
  const sessionType = (getFlag("type") ?? "interactive") as CompanySession["sessionType"];
  const startedBy = getFlag("by") ?? "boss";
  const dept = getFlag("dept");

  if (!isSupabaseConfigured()) {
    console.error("[ERRORE] Supabase non configurato.");
    process.exit(1);
  }

  const validTypes = ["interactive", "console", "task-runner", "daemon"];
  if (!validTypes.includes(sessionType)) {
    console.error(`Tipo sessione non valido: "${sessionType}". Valori ammessi: ${validTypes.join(", ")}`);
    process.exit(1);
  }

  const sessionId = await openSession({
    sessionType,
    department: dept ?? undefined,
    startedBy,
  });

  console.log(`\n  Sessione aperta: ${sessionId}`);
  console.log(`  Tipo: ${sessionType} | By: ${startedBy}${dept ? ` | Dept: ${dept}` : ""}`);
  console.log(`\n  Per chiudere: npx tsx scripts/forma-mentis.ts session-close ${sessionId.slice(0, 8)} --summary "..."\n`);
}

async function cmdSessionClose() {
  const sessionId = args[1];
  const summary = getFlag("summary");
  const decisionsRaw = getFlag("decisions");
  const filesModifiedRaw = getFlag("files-modified");

  if (!sessionId || !summary) {
    console.error("Usage: session-close <sessionId> --summary <summary> [--decisions '<json>'] [--files-modified file1,file2]");
    process.exit(1);
  }

  if (!isSupabaseConfigured()) {
    console.error("[ERRORE] Supabase non configurato.");
    process.exit(1);
  }

  // Resolve partial session ID
  let fullSessionId = sessionId;
  if (sessionId.length < 36) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("company_sessions")
      .select("id")
      .ilike("id", `${sessionId}%`)
      .limit(1)
      .single();

    if (data) {
      fullSessionId = data.id as string;
    } else {
      console.error(`Sessione con prefisso "${sessionId}" non trovata.`);
      process.exit(1);
    }
  }

  let keyDecisions: SessionDecision[] | undefined;
  if (decisionsRaw) {
    try {
      keyDecisions = JSON.parse(decisionsRaw);
    } catch {
      console.error("ERRORE: --decisions deve essere JSON valido.");
      console.error('Esempio: --decisions \'[{"decision":"Usato Voyage AI","rationale":"Migliore per testi legali","department":"architecture","impact":"medium"}]\'');
      process.exit(1);
    }
  }

  const filesModified = filesModifiedRaw
    ? filesModifiedRaw.split(",").map((f) => f.trim())
    : undefined;

  await closeSession(fullSessionId, {
    summary,
    keyDecisions,
    filesModified,
  });

  console.log(`\n  Sessione chiusa: ${fullSessionId.slice(0, 8)}`);
  console.log(`  Summary: ${truncate(summary, 100)}`);
  if (keyDecisions) console.log(`  Decisioni: ${keyDecisions.length}`);
  if (filesModified) console.log(`  File modificati: ${filesModified.length}`);
  console.log("");
}

async function cmdSearch() {
  const query = args.slice(1).join(" ");

  if (!query) {
    console.error("Usage: search <query>");
    console.error('Esempio: npx tsx scripts/forma-mentis.ts search "normattiva zip download failure"');
    process.exit(1);
  }

  if (!isSupabaseConfigured()) {
    console.error("[ERRORE] Supabase non configurato.");
    process.exit(1);
  }

  console.log(`\n--- RICERCA: "${query}" ---`);

  // Check if vector DB is available for semantic search
  const hasVoyageKey = !!process.env.VOYAGE_API_KEY;

  if (hasVoyageKey) {
    // Semantic search across all memory layers via buildCompanyRAGContext
    // Import dynamically to avoid loading embedding code unless needed
    const { buildCompanyRAGContext } = await import("../lib/company/memory/company-rag");
    const context = await buildCompanyRAGContext(query, { maxChars: 4000 });

    if (context) {
      console.log(context);
    } else {
      console.log("  Nessun risultato semantico trovato.");
    }
  } else {
    // Fallback: text matching against recent entries
    console.log("  [VOYAGE_API_KEY non configurata — ricerca testo semplice]\n");

    const admin = createAdminClient();
    const queryLower = query.toLowerCase();
    let foundAny = false;

    // Search department_memory (text match on key + content)
    try {
      const { data: memories } = await admin
        .from("department_memory")
        .select("department, category, key, content")
        .eq("is_active", true)
        .order("last_accessed_at", { ascending: false, nullsFirst: false })
        .limit(100);

      const matches = (memories ?? []).filter((m: Record<string, unknown>) => {
        const k = (m.key as string).toLowerCase();
        const c = (m.content as string).toLowerCase();
        return k.includes(queryLower) || c.includes(queryLower);
      });

      if (matches.length > 0) {
        foundAny = true;
        console.log(`  [DEPARTMENT MEMORY] ${matches.length} risultati:`);
        for (const m of matches.slice(0, 10)) {
          console.log(`    [${(m.category as string).toUpperCase()}] ${m.department}/${m.key}`);
          console.log(`      ${truncate(m.content as string, 120)}`);
        }
        console.log("");
      }
    } catch {
      // Silently skip if table does not exist
    }

    // Search company_knowledge (text match on title + content)
    try {
      const { data: knowledge } = await admin
        .from("company_knowledge")
        .select("category, title, content, departments")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(100);

      const matches = (knowledge ?? []).filter((k: Record<string, unknown>) => {
        const t = (k.title as string).toLowerCase();
        const c = (k.content as string).toLowerCase();
        return t.includes(queryLower) || c.includes(queryLower);
      });

      if (matches.length > 0) {
        foundAny = true;
        console.log(`  [COMPANY KNOWLEDGE] ${matches.length} risultati:`);
        for (const k of matches.slice(0, 10)) {
          const deptsStr = (k.departments as string[])?.length > 0 ? (k.departments as string[]).join(", ") : "all";
          console.log(`    [${(k.category as string).toUpperCase()}] ${k.title} (depts: ${deptsStr})`);
          console.log(`      ${truncate(k.content as string, 120)}`);
        }
        console.log("");
      }
    } catch {
      // Silently skip if table does not exist
    }

    // Search company_sessions (text match on summary)
    try {
      const { data: sessions } = await admin
        .from("company_sessions")
        .select("session_type, department, summary, key_decisions, started_at, duration_ms")
        .order("started_at", { ascending: false })
        .limit(50);

      const matches = (sessions ?? []).filter((s: Record<string, unknown>) => {
        const summary = ((s.summary as string) ?? "").toLowerCase();
        const decisions = JSON.stringify(s.key_decisions ?? []).toLowerCase();
        return summary.includes(queryLower) || decisions.includes(queryLower);
      });

      if (matches.length > 0) {
        foundAny = true;
        console.log(`  [SESSIONI] ${matches.length} risultati:`);
        for (const s of matches.slice(0, 5)) {
          const dateStr = formatDate(s.started_at as string);
          const deptStr = (s.department as string) ?? "cross-dept";
          console.log(`    [${(s.session_type as string).toUpperCase()}] ${dateStr} | ${deptStr}`);
          console.log(`      ${truncate((s.summary as string) ?? "", 120)}`);
        }
        console.log("");
      }
    } catch {
      // Silently skip if table does not exist
    }

    if (!foundAny) {
      console.log("  Nessun risultato trovato.\n");
    }
  }
}

// ─── Approve (Telegram) ───

async function cmdApprove() {
  const proposal = getFlag("proposal");
  const taskId = getFlag("task-id");
  const timeoutStr = getFlag("timeout");
  const timeoutMs = timeoutStr ? parseInt(timeoutStr, 10) : 5 * 60 * 1000; // 5 min default per CLI

  if (!proposal) {
    console.error("Usage: approve --proposal <testo> [--task-id <id>] [--timeout <ms>]");
    process.exit(1);
  }

  if (!isTgConfigured()) {
    console.error("[ERRORE] Telegram non configurato (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID richiesti).");
    process.exit(1);
  }

  console.log(`\n  Invio richiesta approvazione via Telegram...`);
  console.log(`  Proposta: ${truncate(proposal, 120)}`);
  if (taskId) console.log(`  Task ID: ${taskId}`);
  console.log(`  Timeout: ${Math.round(timeoutMs / 1000)}s\n`);

  const messageId = await sendApprovalRequest(proposal, taskId);
  if (messageId < 0) {
    console.error("[ERRORE] Impossibile inviare il messaggio Telegram.");
    process.exit(1);
  }

  console.log(`  Messaggio inviato (ID: ${messageId}). In attesa di risposta...\n`);

  const result = await waitForApproval(messageId, timeoutMs);

  const icons: Record<string, string> = {
    approved: "APPROVATO",
    rejected: "RIFIUTATO",
    timeout: "SCADUTO (nessuna risposta)",
  };

  console.log(`  Risultato: ${icons[result]}\n`);
  process.exit(result === "approved" ? 0 : 1);
}

// ─── Help ───

function showHelp() {
  console.log(`
Forma Mentis CLI — Bridge tra Forma Mentis e operazioni CME

Commands:
  context [--dept <dept>] [--limit <n>]
    Carica il contesto completo per l'avvio sessione CME:
    sessioni recenti, avvisi, goal a rischio, decisioni da rivedere, knowledge.

  remember --dept <dept> --key <key> --content <content> [--category fact|learning|warning|preference|context]
    Salva un'informazione nella memoria del dipartimento.
    Esempio: remember --dept trading --key "slope_threshold" --content "0.01% ottimale" --category learning

  decide --title <title> --dept <dept> --description <desc> --expected <outcome> [--type architectural|operational|strategic|tactical] [--review-days 14]
    Registra una decisione nel diario decisionale.
    Esempio: decide --title "Use Voyage AI" --dept architecture --description "Scelto per legal domain" --expected "Similarity >0.7" --type architectural

  goals [--dept <dept>] [--status active|at_risk|achieved|missed|paused]
    Mostra i goal aziendali con progresso.

  goals create --title <title> --dept <dept> --type <okr|kpi|milestone> [--target <n>] [--desc "..."] [--deadline YYYY-MM-DD] [--metric "..."] [--unit <unit>] [--status active]
    Crea un nuovo goal aziendale.
    Esempio: goals create --title "Sharpe ratio > 1.0" --dept trading --type kpi --target 1.0 --unit "ratio" --deadline 2026-06-01 --desc "Backtest deve superare Sharpe 1.0"

  goals update <goalId> [--current <number>] [--desc "..."] [--source "..."]
    Aggiorna current_value e/o description di un goal esistente.
    Esempio: goals update abc12345 --current 0.975 --desc "Aggiornamento post backtest cycle 4"

  goals set-status <goalId> --status <active|at_risk|achieved|missed|paused>
    Cambia lo status di un goal.
    Esempio: goals set-status abc12345 --status achieved

  goal-create --title <title> --dept <dept> --metric <metric> --target <number> [--unit <unit>] [--deadline YYYY-MM-DD] [--type okr|kpi|milestone]
    (Legacy) Crea un nuovo goal aziendale.

  goal-update <goalId> --value <number> --source <source>
    (Legacy) Aggiorna il valore corrente di un goal.

  goal-set-status <goalId> --status <active|at_risk|achieved|missed|paused>
    (Legacy) Cambia lo status di un goal.

  discover [--capability <cap>] [--skill <skill>] [--dept <dept>]
    Scopri le capability dei dipartimenti.
    Esempio: discover --capability cost-estimation
    Esempio: discover --dept quality-assurance

  session-open --type <interactive|console|task-runner|daemon> --by <who> [--dept <dept>]
    Apri una sessione. Ritorna il session ID.

  session-close <sessionId> --summary <summary> [--decisions '<json>'] [--files-modified file1,file2]
    Chiudi la sessione con un riepilogo.

  search <query>
    Ricerca semantica (con VOYAGE_API_KEY) o testo semplice su tutta la memoria.
    Esempio: search "normattiva zip download failure"

  approve --proposal <testo> [--task-id <id>] [--timeout <ms>]
    Invia una richiesta di approvazione al boss via Telegram (bottoni inline).
    Aspetta la risposta (default timeout: 5 minuti per CLI).
    Esempio: approve --proposal "Lancio verticale HR" --task-id abc123
  `);
}

// ─── Main ───

async function main() {
  switch (command) {
    case "context":
      await cmdContext();
      break;

    case "remember":
      await cmdRemember();
      break;

    case "decide":
      await cmdDecide();
      break;

    case "goals":
      await cmdGoals();
      break;

    case "goal-create":
      await cmdGoalCreate();
      break;

    case "goal-update":
      await cmdGoalUpdate();
      break;

    case "goal-set-status":
      await cmdGoalSetStatus();
      break;

    case "discover":
      await cmdDiscover();
      break;

    case "session-open":
      await cmdSessionOpen();
      break;

    case "session-close":
      await cmdSessionClose();
      break;

    case "search":
      await cmdSearch();
      break;

    case "approve":
      await cmdApprove();
      break;

    default:
      showHelp();
      break;
  }
}

main().catch((err) => {
  console.error("Errore:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
