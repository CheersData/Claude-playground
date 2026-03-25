/**
 * Auto-Update Department Status — ADR-015 Step 1
 *
 * Updates each department's status.json based on real task board data.
 * No LLM calls — pure deterministic logic.
 *
 * Usage:
 *   npx tsx scripts/auto-update-dept-status.ts              # Update all departments
 *   npx tsx scripts/auto-update-dept-status.ts --dept trading  # Update single department
 *
 * Trigger: called by cme-autorun.ts before auto-plenary, or by company-tasks.ts done hook.
 * Idempotent: can run N times without side effects.
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { getOpenTasks } from "../lib/company/tasks";
import type { Task } from "../lib/company/types";

// ─── Config ───────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..");
const COMPANY_DIR = path.join(ROOT, "company");

/** All known departments (matches lib/company/types.ts Department type + extras with status.json). */
const ALL_DEPARTMENTS: string[] = [
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
  "integration",
  "music",
];

/** Days to look back for "recent" completed tasks. */
const RECENT_DAYS = 7;

/** Days to look back for 30-day completion metrics. */
const METRICS_DAYS = 30;

/** Max items in completed_recently array. */
const MAX_COMPLETED_RECENTLY = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusJsonPath(dept: string): string {
  return path.join(COMPANY_DIR, dept, "status.json");
}

function readStatusJson(dept: string): Record<string, unknown> | null {
  const p = statusJsonPath(dept);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    console.warn(`  WARN: ${dept}/status.json parse error — will create fresh`);
    return null;
  }
}

function writeStatusJson(dept: string, data: Record<string, unknown>): void {
  const p = statusJsonPath(dept);
  const dir = path.dirname(p);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf-8");
  } catch (err) {
    console.error(`[auto-update-dept-status] Failed to write ${p}:`, err);
  }
}

function isWithinDays(dateStr: string, days: number): boolean {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return new Date(dateStr).getTime() >= cutoff;
}

// ─── Health Calculation ───────────────────────────────────────────────────────

interface DeptTaskStats {
  open: Task[];
  inProgress: Task[];
  blocked: Task[];
  recentDone: Task[];
  allDone: Task[];
}

function calculateHealth(
  stats: DeptTaskStats,
  existingStatus: Record<string, unknown> | null
): "ok" | "warning" | "critical" {
  // Critical: any gap with severity=critical in existing status
  const gaps = existingStatus?.gaps as Array<{ severity?: string }> | undefined;
  if (gaps?.some((g) => g.severity === "critical")) {
    return "critical";
  }

  // Warning conditions
  if (stats.blocked.length > 0) return "warning";
  if (stats.open.length > 3) return "warning";
  if (
    stats.recentDone.length === 0 &&
    stats.open.length === 0 &&
    stats.inProgress.length === 0
  ) {
    return "warning"; // department idle — no activity at all
  }

  return "ok";
}

function generateSummary(stats: DeptTaskStats): string {
  const parts: string[] = [];

  if (stats.inProgress.length > 0) {
    parts.push(`${stats.inProgress.length} task in corso`);
  }
  if (stats.open.length > 0) {
    parts.push(`${stats.open.length} task aperti`);
  }
  if (stats.blocked.length > 0) {
    parts.push(`${stats.blocked.length} bloccati`);
  }
  if (stats.recentDone.length > 0) {
    parts.push(`${stats.recentDone.length} completati (ultimi 7gg)`);
  }
  if (stats.allDone.length > 0) {
    parts.push(`${stats.allDone.length} completati (totale)`);
  }

  if (parts.length === 0) {
    return "Nessuna attività recente.";
  }

  return parts.join(". ") + ".";
}

// ─── Completed Recently ─────────────────────────────────────────────────────

interface CompletedRecentlyItem {
  id: string;
  title: string;
  summary: string | null;
  completedAt: string;
  priority: string;
}

function buildCompletedRecently(allDone: Task[]): CompletedRecentlyItem[] {
  return allDone
    .filter((t) => t.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
    .slice(0, MAX_COMPLETED_RECENTLY)
    .map((t) => ({
      id: t.id.slice(0, 8),
      title: t.title,
      summary: t.resultSummary ?? null,
      completedAt: t.completedAt!,
      priority: t.priority,
    }));
}

// ─── Completion Metrics ─────────────────────────────────────────────────────

/** Compact completion stats (task-spec: total_completed, last_7_days, last_30_days). */
interface CompletionStats {
  total_completed: number;
  last_7_days: number;
  last_30_days: number;
}

interface CompletionMetrics {
  completed_7d: number;
  completed_30d: number;
  total_completed: number;
  completion_rate_7d: number;
  avg_cycle_time_hours: number | null;
}

function buildCompletionStats(stats: DeptTaskStats): CompletionStats {
  const done30d = stats.allDone.filter(
    (t) => t.completedAt && isWithinDays(t.completedAt, METRICS_DAYS)
  );
  return {
    total_completed: stats.allDone.length,
    last_7_days: stats.recentDone.length,
    last_30_days: done30d.length,
  };
}

function buildCompletionMetrics(stats: DeptTaskStats, allDeptTasks: Task[]): CompletionMetrics {
  const done30d = allDeptTasks.filter(
    (t) => t.status === "done" && t.completedAt && isWithinDays(t.completedAt, METRICS_DAYS)
  );

  const completed7d = stats.recentDone.length;
  const totalActive = completed7d + stats.open.length + stats.inProgress.length;
  const completionRate7d = totalActive > 0 ? Math.round((completed7d / totalActive) * 100) / 100 : 0;

  // Average cycle time for tasks completed in last 30 days that have both createdAt and completedAt
  const cycleTimes: number[] = [];
  for (const t of done30d) {
    if (t.createdAt && t.completedAt) {
      const created = new Date(t.createdAt).getTime();
      const completed = new Date(t.completedAt).getTime();
      if (completed > created) {
        cycleTimes.push((completed - created) / (1000 * 60 * 60)); // hours
      }
    }
  }
  const avgCycleTime = cycleTimes.length > 0
    ? Math.round((cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length) * 10) / 10
    : null;

  return {
    completed_7d: completed7d,
    completed_30d: done30d.length,
    total_completed: stats.allDone.length,
    completion_rate_7d: completionRate7d,
    avg_cycle_time_hours: avgCycleTime,
  };
}

// ─── Priority Tracker ───────────────────────────────────────────────────────

interface PriorityTrackerItem {
  label: string;
  status: "not_started" | "in_progress" | "done";
  related_tasks: { open: number; in_progress: number; done: number };
  last_activity: string | null;
}

/**
 * Parse priority lines from department.md.
 * Matches patterns like:  1. **[P0] Some label** — description
 */
function parseDeptPriorities(dept: string): string[] {
  const deptMdPath = path.join(COMPANY_DIR, dept, "department.md");
  if (!fs.existsSync(deptMdPath)) return [];

  try {
    const content = fs.readFileSync(deptMdPath, "utf-8");
    const lines = content.split("\n");
    const priorities: string[] = [];

    let inPrioritySection = false;
    for (const line of lines) {
      // Detect priority section header
      if (/priorit[àa]\s+operative/i.test(line)) {
        inPrioritySection = true;
        continue;
      }
      // End of section: next heading or blank line after items
      if (inPrioritySection && /^##\s/.test(line)) {
        break;
      }
      // Match numbered priority lines: "1. **[P0] Label** — desc"
      const match = line.match(/^\d+\.\s+\*?\*?\[P\d\]\s*(.+?)(?:\*\*)?(?:\s*[-—]\s*(.*))?$/);
      if (match && inPrioritySection) {
        // Full label including P-tag: extract from the raw line
        const fullMatch = line.match(/\[P\d\]\s*([^*]+)/);
        const label = fullMatch ? `${line.match(/\[P\d\]/)![0]} ${fullMatch[1].trim()}` : match[1].trim();
        priorities.push(label);
      }
    }
    return priorities;
  } catch {
    return [];
  }
}

/**
 * Extract keywords from a string for fuzzy matching (words > 3 chars, lowercased).
 */
function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-zA-Z0-9àèéìòùäöüß\s-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
  );
}

/**
 * Check if a task title is related to a priority label via keyword overlap.
 * Requires at least 1 keyword match.
 */
function isTaskRelatedToPriority(task: Task, priorityKeywords: Set<string>): boolean {
  const taskKeywords = extractKeywords(task.title);
  for (const kw of taskKeywords) {
    if (priorityKeywords.has(kw)) return true;
  }
  // Also check description if available
  if (task.description) {
    const descKeywords = extractKeywords(task.description);
    for (const kw of descKeywords) {
      if (priorityKeywords.has(kw)) return true;
    }
  }
  return false;
}

function buildPriorityTracker(dept: string, deptTasks: Task[]): PriorityTrackerItem[] {
  const priorityLabels = parseDeptPriorities(dept);
  if (priorityLabels.length === 0) return [];

  return priorityLabels.map((label) => {
    const priorityKeywords = extractKeywords(label);

    const related = { open: 0, in_progress: 0, done: 0 };
    let lastActivity: string | null = null;

    for (const t of deptTasks) {
      if (!isTaskRelatedToPriority(t, priorityKeywords)) continue;

      if (t.status === "open") related.open++;
      else if (t.status === "in_progress") related.in_progress++;
      else if (t.status === "done") related.done++;

      // Track latest activity timestamp
      const ts = t.completedAt || t.startedAt || t.createdAt;
      if (ts && (!lastActivity || new Date(ts).getTime() > new Date(lastActivity).getTime())) {
        lastActivity = ts;
      }
    }

    // Derive status from related task counts
    let status: PriorityTrackerItem["status"] = "not_started";
    const totalRelated = related.open + related.in_progress + related.done;
    if (totalRelated > 0) {
      if (related.done > 0 && related.open === 0 && related.in_progress === 0) {
        status = "done";
      } else if (related.in_progress > 0 || related.done > 0) {
        status = "in_progress";
      }
    }

    return { label, status, related_tasks: related, last_activity: lastActivity };
  });
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

async function updateDepartment(dept: string, allTasks: Task[]): Promise<void> {
  const deptTasks = allTasks.filter((t) => t.department === dept);

  const stats: DeptTaskStats = {
    open: deptTasks.filter((t) => t.status === "open"),
    inProgress: deptTasks.filter((t) => t.status === "in_progress"),
    blocked: deptTasks.filter((t) => t.status === "blocked"),
    recentDone: deptTasks.filter(
      (t) =>
        t.status === "done" &&
        t.completedAt &&
        isWithinDays(t.completedAt, RECENT_DAYS)
    ),
    allDone: deptTasks.filter((t) => t.status === "done"),
  };

  const existingStatus = readStatusJson(dept);
  const health = calculateHealth(stats, existingStatus);
  const summary = generateSummary(stats);

  // Build open_tasks list
  const openTasksList = [...stats.open, ...stats.inProgress].map((t) => ({
    id: t.id.slice(0, 8),
    title: t.title,
    priority: t.priority,
    status: t.status,
  }));

  // Build blockers list
  const blockersList = stats.blocked.map((t) => ({
    id: t.id.slice(0, 8),
    title: t.title,
    priority: t.priority,
  }));

  // Build new computed fields
  const completedRecently = buildCompletedRecently(stats.allDone);
  const completionStats = buildCompletionStats(stats);
  const completionMetrics = buildCompletionMetrics(stats, deptTasks);
  const priorityTracker = buildPriorityTracker(dept, deptTasks);

  // Merge: preserve ALL existing fields, only update computed ones
  const updated: Record<string, unknown> = {};

  // Copy all existing fields first (preserves custom dept-specific data)
  if (existingStatus) {
    for (const [key, value] of Object.entries(existingStatus)) {
      updated[key] = value;
    }
  }

  // Update computed fields
  updated._meta = {
    ...((existingStatus?._meta as Record<string, unknown>) ?? {}),
    dept,
    schema_version: "1.2",
    last_updated: new Date().toISOString(),
    updated_by: "auto-update-dept-status",
  };
  updated.health = health;
  updated.summary = summary;
  updated.open_tasks = openTasksList;
  updated.blockers = blockersList;
  updated.completed_recently = completedRecently;
  updated.completion_stats = completionStats;
  updated.completion_metrics = completionMetrics;
  updated.priority_tracker = priorityTracker;

  writeStatusJson(dept, updated);

  const icon = health === "ok" ? "OK" : health === "warning" ? "WARN" : "CRIT";
  const rateStr = completionMetrics.completion_rate_7d > 0 ? `, rate7d=${completionMetrics.completion_rate_7d}` : "";
  const ptStr = priorityTracker.length > 0 ? `, priorities=${priorityTracker.length}` : "";
  console.log(
    `  [${icon}] ${dept}: ${summary} (open=${stats.open.length}, blocked=${stats.blocked.length}, done7d=${stats.recentDone.length}${rateStr}${ptStr})`
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const singleDept = args.indexOf("--dept") !== -1 ? args[args.indexOf("--dept") + 1] : undefined;

  console.log("\n[auto-update-dept-status] Updating department status.json files...\n");

  // Fetch all tasks once (efficient: single DB query)
  const allTasks = await getOpenTasks({ limit: 1000 });

  const departments = singleDept ? [singleDept] : ALL_DEPARTMENTS;

  for (const dept of departments) {
    const deptDir = path.join(COMPANY_DIR, dept);
    if (!fs.existsSync(deptDir)) {
      console.log(`  [SKIP] ${dept}: directory not found`);
      continue;
    }

    try {
      await updateDepartment(dept, allTasks);
    } catch (err) {
      console.warn(
        `  [ERR] ${dept}: ${(err as Error).message}`
      );
    }
  }

  console.log("\n[auto-update-dept-status] Done.\n");
}

main().catch((err) => {
  console.error("\nERROR:", err.message ?? err);
  process.exit(1);
});
