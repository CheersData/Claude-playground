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
import type { Task, Department } from "../lib/company/types";

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
];

/** Days to look back for "recent" completed tasks. */
const RECENT_DAYS = 7;

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
    schema_version: "1.0",
    last_updated: new Date().toISOString(),
    updated_by: "auto-update-dept-status",
  };
  updated.health = health;
  updated.summary = summary;
  updated.open_tasks = openTasksList;
  updated.blockers = blockersList;

  writeStatusJson(dept, updated);

  const icon = health === "ok" ? "OK" : health === "warning" ? "WARN" : "CRIT";
  console.log(
    `  [${icon}] ${dept}: ${summary} (open=${stats.open.length}, blocked=${stats.blocked.length}, done7d=${stats.recentDone.length})`
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
