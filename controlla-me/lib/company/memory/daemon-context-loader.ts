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

import { readFileSync } from "fs";
import { join } from "path";
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
    keyDecisions: string[];
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
  sessionBlock: string; // Recent sessions text for prompt injection
  memoryBlock: string; // Text for prompt injection
  goalBlock: string; // Text for prompt injection
  statusBlock: string; // Text for prompt injection
  daemonBlock: string; // Daemon report signals + board state from disk
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
  const sessionBlock = formatSessionBlock(context);
  const memoryBlock = formatMemoryBlock(context);
  const goalBlock = formatGoalBlock(context);
  const statusBlock = departmentStatusText;

  // Load daemon report from disk (always available, $0 cost)
  const daemonBlock = loadDaemonReportBlock();

  const elapsedMs = Date.now() - startTime;
  console.log(
    `[FORMA-MENTIS] Context loaded in ${elapsedMs}ms | ` +
      `${sessions.length} sessions | ` +
      `${deptMemories.length} memories | ` +
      `${goals.length} goals | ` +
      `${decisions.length} pending decisions | ` +
      `daemonBlock: ${daemonBlock.length} chars`
  );

  return { context, sessionBlock, memoryBlock, goalBlock, statusBlock, daemonBlock };
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
    keyDecisions: string[];
  }>
> {
  const sessions = await getRecentSessions(undefined, 5);
  return sessions
    .filter((s) => s.endedAt && s.summary)
    .map((s) => ({
      department: s.department ?? "n/a",
      summary:
        s.summary.slice(0, 200) +
        (s.summary.length > 200 ? "..." : ""),
      duration_ms: s.durationMs ?? 0,
      ended_at: s.endedAt!,
      keyDecisions: (s.keyDecisions ?? [])
        .slice(0, 3)
        .map((d) => `${d.decision} (${d.impact})`),
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
 * Format recent sessions into a text block for prompt injection.
 * This is the critical block that tells CME what happened in previous sessions,
 * preventing re-proposal of completed work and providing continuity.
 */
function formatSessionBlock(context: FormaMentisContext): string {
  if (context.recentSessions.length === 0) {
    return "";
  }

  const lines = ["## SESSIONI RECENTI (cosa è stato fatto — NON ripetere)"];

  for (const s of context.recentSessions) {
    const endDate = new Date(s.ended_at);
    const dateStr = endDate.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const durationMin = Math.round(s.duration_ms / 60_000);
    const deptLabel = s.department !== "n/a" ? s.department : "cross-dept";
    lines.push(`- [${dateStr}] ${deptLabel} (${durationMin}min): ${s.summary}`);

    // Include key decisions if available
    if (s.keyDecisions.length > 0) {
      for (const d of s.keyDecisions) {
        lines.push(`  -> ${d}`);
      }
    }
  }

  return lines.join("\n");
}

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

// ────────────────────────────────────────────────────────────
// Daemon Report from Disk (filesystem fallback — always available)
// ────────────────────────────────────────────────────────────

/**
 * Load daemon-report.json from disk and format as a text block.
 * This is the primary source of company context when Supabase tables
 * are empty or unavailable. The daemon writes this file every ~10 minutes
 * with signals, board state, and the cmeDirective.
 *
 * Cost: $0 (filesystem read only).
 */
function loadDaemonReportBlock(): string {
  try {
    const reportPath = join(process.cwd(), "company", "daemon-report.json");
    const raw = readFileSync(reportPath, "utf-8");
    const report = JSON.parse(raw);

    const lines: string[] = ["## DAEMON REPORT (ultimo scan aziendale)"];

    // Timestamp
    if (report.timestamp) {
      const ts = new Date(report.timestamp);
      lines.push(`Ultimo scan: ${ts.toLocaleDateString("it-IT")} ${ts.toLocaleTimeString("it-IT")}`);
    }

    // Board state
    if (report.board) {
      const b = report.board;
      lines.push(`\n### Board: ${b.total ?? 0} task totali | Open: ${b.open ?? 0} | In Progress: ${b.inProgress ?? 0} | Done: ${b.done ?? 0}`);
    }

    // Signals — group by priority for readability
    if (Array.isArray(report.signals) && report.signals.length > 0) {
      const highPriority = report.signals.filter(
        (s: { priority?: string }) => s.priority === "high" || s.priority === "critical"
      );
      const mediumPriority = report.signals.filter(
        (s: { priority?: string }) => s.priority === "medium"
      );

      if (highPriority.length > 0) {
        lines.push(`\n### SEGNALI PRIORITA ALTA (${highPriority.length})`);
        for (const s of highPriority.slice(0, 10)) {
          const dept = s.deptId ?? "?";
          const desc = (s.description ?? s.title ?? "").slice(0, 120);
          const human = s.requiresHuman ? " [RICHIEDE BOSS]" : "";
          lines.push(`- [${dept}] ${desc}${human}`);
        }
      }

      if (mediumPriority.length > 0) {
        lines.push(`\n### SEGNALI PRIORITA MEDIA (${mediumPriority.length})`);
        for (const s of mediumPriority.slice(0, 8)) {
          const dept = s.deptId ?? "?";
          const desc = (s.description ?? s.title ?? "").slice(0, 120);
          lines.push(`- [${dept}] ${desc}`);
        }
      }
    }

    // CME Directive
    if (report.cmeDirective) {
      const d = report.cmeDirective;
      lines.push(`\n### CME DIRECTIVE`);
      lines.push(`Modo: ${d.mode ?? "unknown"}`);
      if (d.instructions) {
        lines.push(d.instructions.slice(0, 500));
      }
    }

    // Goal checks
    if (Array.isArray(report.goalChecks) && report.goalChecks.length > 0) {
      lines.push(`\n### Goal Checks: ${report.goalChecks.length} verifiche`);
      for (const gc of report.goalChecks.slice(0, 5)) {
        lines.push(`- ${gc.title ?? gc.goalId ?? "?"}: ${gc.status ?? "?"} (${gc.progress ?? 0}%)`);
      }
    }

    console.log(`[FORMA-MENTIS] Daemon report loaded from disk: ${lines.length} lines, ${report.signals?.length ?? 0} signals`);
    return lines.join("\n");
  } catch (err) {
    console.warn(
      "[FORMA-MENTIS] daemon-report.json not available:",
      err instanceof Error ? err.message : err
    );
    return "";
  }
}
