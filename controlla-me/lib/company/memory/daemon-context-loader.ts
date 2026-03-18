/**
 * Daemon Context Loader — assemble Forma Mentis context at daemon startup
 *
 * Combines data from:
 *   Layer 1 (MEMORIA): Recent sessions, department memories, company knowledge
 *   Layer 3 (COSCIENZA): Active goals, goal checks, recent daemon reports
 *   Layer 4 (RIFLESSIONE): Decisions pending review
 *   SINAPSI: Department status snapshot
 *
 * Returns a structured context object and formatted text blocks for prompt injection.
 *
 * Used by cme-autorun.ts at startup to enrich the analysis prompt with company state.
 *
 * ADR: ADR-forma-mentis.md (Integration section)
 */

import { getRecentSessions } from "./session-recorder";
import { getDepartmentMemories } from "./department-memory";
import { getRecentReports } from "../coscienza/daemon-reports";
import { getActiveGoals } from "../coscienza/goal-monitor";
import { getDecisionsPendingReview } from "../riflessione/decision-journal";
import { formatDepartmentStatusSummary } from "../collaborazione/department-status-reader";

// ────────────────────────────────────────────────────────────
// Context Types
// ────────────────────────────────────────────────────────────

export interface FormaMentisContext {
  timestamp: string;
  recentSessions: Array<{
    department: string;
    summary: string;
    duration_ms: number;
    ended_at: string;
  }>;
  departmentMemories: Array<{
    department: string;
    category: string;
    key: string;
    content: string;
  }>;
  activeGoals: Array<{
    department: string;
    title: string;
    status: string;
    progress: number; // 0-100
  }>;
  pendingDecisions: number;
  recentReports: Array<{
    created_at: string;
    signal_count: number;
    alert_count: number;
  }>;
  departmentStatuses: string; // formatted text block
}

// ────────────────────────────────────────────────────────────
// Main Loader
// ────────────────────────────────────────────────────────────

/**
 * Load complete Forma Mentis context at daemon startup.
 * This is called once per daemon cycle, before the analysis prompt is built.
 *
 * All promises are run in parallel for speed.
 * Failures are caught and logged, never propagated — always returns partial data.
 *
 * @returns A structured context object + formatted text blocks for prompt injection
 */
export async function loadFormaMentisContext(): Promise<{
  context: FormaMentisContext;
  memoryBlock: string; // Text for prompt injection
  goalBlock: string; // Text for prompt injection
  statusBlock: string; // Text for prompt injection
}> {
  const startTime = Date.now();
  console.log("[FORMA-MENTIS] Loading context...");

  // Run all queries in parallel
  const [sessions, goals, decisions, reports] = await Promise.all([
    loadRecentSessionsSummary().catch((e) => {
      console.error("[FORMA-MENTIS] Failed to load sessions:", e);
      return [];
    }),
    loadActiveGoalsSummary().catch((e) => {
      console.error("[FORMA-MENTIS] Failed to load goals:", e);
      return [];
    }),
    getDecisionsPendingReview().catch((e) => {
      console.error("[FORMA-MENTIS] Failed to load decisions:", e);
      return [];
    }),
    getRecentReports(2).catch((e) => {
      console.error("[FORMA-MENTIS] Failed to load reports:", e);
      return [];
    }),
  ]);

  // Load department memories in parallel
  const deptMemories = await loadAllDepartmentMemories().catch((e) => {
    console.error("[FORMA-MENTIS] Failed to load dept memories:", e);
    return [];
  });

  // Department statuses (synchronous, cheap)
  const departmentStatusText = formatDepartmentStatusSummary();

  // Build context object
  const context: FormaMentisContext = {
    timestamp: new Date().toISOString(),
    recentSessions: sessions,
    departmentMemories: deptMemories,
    activeGoals: goals,
    pendingDecisions: decisions.length,
    recentReports: reports.map((r) => ({
      created_at: r.createdAt || new Date().toISOString(),
      signal_count: (r.signals || []).length,
      alert_count: (r.alerts || []).length,
    })),
    departmentStatuses: departmentStatusText,
  };

  // Build formatted text blocks
  const memoryBlock = formatMemoryBlock(context);
  const goalBlock = formatGoalBlock(context);
  const statusBlock = departmentStatusText;

  const elapsedMs = Date.now() - startTime;
  console.log(
    `[FORMA-MENTIS] Context loaded in ${elapsedMs}ms | ` +
      `${sessions.length} sessions | ` +
      `${deptMemories.length} memories | ` +
      `${goals.length} goals | ` +
      `${decisions.length} pending decisions`
  );

  return { context, memoryBlock, goalBlock, statusBlock };
}

// ────────────────────────────────────────────────────────────
// Loaders for individual layers
// ────────────────────────────────────────────────────────────

/**
 * Load last 3 sessions across all departments.
 * Summarize what happened recently.
 */
async function loadRecentSessionsSummary(): Promise<
  Array<{
    department: string;
    summary: string;
    duration_ms: number;
    ended_at: string;
  }>
> {
  const sessions = await getRecentSessions(undefined, 3);
  return sessions
    .filter((s) => s.endedAt)
    .map((s) => ({
      department: s.department ?? "n/a",
      summary:
        s.summary.slice(0, 120) +
        (s.summary.length > 120 ? "..." : ""),
      duration_ms: s.durationMs ?? 0,
      ended_at: s.endedAt!,
    }));
}

/**
 * Load active goals across all departments.
 * Include progress ratio.
 */
async function loadActiveGoalsSummary(): Promise<
  Array<{
    department: string;
    title: string;
    status: string;
    progress: number;
  }>
> {
  const goals = await getActiveGoals();
  return goals
    .filter((g) => g.status === "active" || g.status === "at_risk")
    .map((g) => {
      const progress =
        g.targetValue !== 0
          ? Math.min(
              100,
              Math.round((g.currentValue / g.targetValue) * 100)
            )
          : 0;
      return {
        department: g.department ?? "n/a",
        title: g.title,
        status: g.status,
        progress,
      };
    });
}

/**
 * Load active department memories from ALL departments.
 * Categories: warning (highest priority), learning, context.
 */
async function loadAllDepartmentMemories(): Promise<
  Array<{
    department: string;
    category: string;
    key: string;
    content: string;
  }>
> {
  const DEPARTMENTS = [
    "ufficio-legale",
    "trading",
    "data-engineering",
    "quality-assurance",
    "architecture",
    "finance",
    "operations",
    "security",
    "strategy",
    "marketing",
    "ux-ui",
    "protocols",
    "acceleration",
  ];

  const results: Array<{
    department: string;
    category: string;
    key: string;
    content: string;
  }> = [];

  const promises = DEPARTMENTS.map(async (dept) => {
    try {
      // Prioritize warnings, then learnings
      const memories = await getDepartmentMemories(dept, {
        categories: ["warning", "learning", "context"],
        limit: 3,
      });

      return memories.map((m) => ({
        department: dept,
        category: m.category,
        key: m.key,
        content:
          m.content.slice(0, 150) +
          (m.content.length > 150 ? "..." : ""),
      }));
    } catch {
      return [];
    }
  });

  const allMemories = await Promise.all(promises);
  return allMemories.flat();
}

// ────────────────────────────────────────────────────────────
// Formatting helpers
// ────────────────────────────────────────────────────────────

/**
 * Format department memories into a text block for prompt injection.
 */
function formatMemoryBlock(context: FormaMentisContext): string {
  if (context.departmentMemories.length === 0) {
    return "";
  }

  const lines = ["## DEPARTMENT MEMORIES (warnings, learnings, context)"];

  // Group by department, prioritize warnings
  const byDept = new Map<string, typeof context.departmentMemories>();
  for (const mem of context.departmentMemories) {
    const existing = byDept.get(mem.department) || [];
    existing.push(mem);
    byDept.set(mem.department, existing);
  }

  for (const [dept, mems] of Array.from(byDept.entries())) {
    const warnings = mems.filter((m) => m.category === "warning");
    const others = mems.filter((m) => m.category !== "warning");

    const allMems = [...warnings, ...others];
    const deptLines = allMems
      .slice(0, 2)
      .map((m) => `  - [${m.category}] ${m.key}: ${m.content}`);

    if (deptLines.length > 0) {
      lines.push(`\n### ${dept}`);
      lines.push(...deptLines);
    }
  }

  return lines.join("\n");
}

/**
 * Format active goals into a text block for prompt injection.
 */
function formatGoalBlock(context: FormaMentisContext): string {
  if (context.activeGoals.length === 0) {
    return "";
  }

  const lines = ["## ACTIVE GOALS (progress tracking)"];

  // Group by department, prioritize at_risk
  const byDept = new Map<string, typeof context.activeGoals>();
  for (const goal of context.activeGoals) {
    const existing = byDept.get(goal.department) || [];
    existing.push(goal);
    byDept.set(goal.department, existing);
  }

  for (const [dept, goals] of Array.from(byDept.entries())) {
    const atRisk = goals.filter((g) => g.status === "at_risk");
    const active = goals.filter((g) => g.status === "active");

    const allGoals = [...atRisk, ...active];
    const goalLines = allGoals
      .slice(0, 2)
      .map((g) => {
        const progressBar = Math.floor(g.progress / 10);
        const bar =
          "█".repeat(progressBar) + "░".repeat(10 - progressBar);
        return `  - [${bar}] ${g.title} (${g.progress}%) — ${g.status}`;
      });

    if (goalLines.length > 0) {
      lines.push(`\n### ${dept}`);
      lines.push(...goalLines);
    }
  }

  if (context.pendingDecisions > 0) {
    lines.push(
      `\n⚠️ ${context.pendingDecisions} decision(s) pending review`
    );
  }

  return lines.join("\n");
}
