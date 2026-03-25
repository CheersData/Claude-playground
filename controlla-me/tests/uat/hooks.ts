/**
 * UAT Hooks — Task system integration utilities.
 *
 * Determines whether UAT should run after a task completes,
 * and which scenarios to execute based on department and priority.
 *
 * The actual hook into the task system (company-tasks.ts) will be wired later.
 * This module provides the decision logic.
 */

import * as fs from "fs";
import * as path from "path";
import type { UATManifest, UATScenario } from "./types";

const COMPANY_DIR = path.resolve(__dirname, "../../company");

interface TaskInfo {
  dept: string;
  routing?: string;    // L1, L2, L3, L4
  priority?: string;   // low, medium, high, critical
  tags?: string[];
}

/**
 * Departments exempt from UAT (no code changes, documentation/research only).
 */
const EXEMPT_DEPARTMENTS = [
  "marketing",
  "finance",
  "protocols",
  "strategy",
];

/**
 * Determine if UAT should run for a given completed task.
 *
 * Rules:
 * - Skip for documentation-only departments
 * - Always run for high/critical priority tasks
 * - Run for L2+ routing (cross-department changes)
 * - Skip for trivial operational tasks
 */
export function shouldRunUAT(task: TaskInfo): boolean {
  // Exempt departments never trigger UAT
  if (EXEMPT_DEPARTMENTS.includes(task.dept)) {
    return false;
  }

  // Critical/high priority always trigger UAT
  if (task.priority === "critical" || task.priority === "high") {
    return true;
  }

  // L2+ routing (cross-department) always triggers UAT
  if (task.routing && ["L2", "L3", "L4"].includes(task.routing)) {
    return true;
  }

  // Default: run UAT for code-producing departments
  const codeDepartments = [
    "ufficio-legale",
    "trading",
    "integration",
    "music",
    "architecture",
    "data-engineering",
    "quality-assurance",
    "operations",
    "security",
    "ux-ui",
    "acceleration",
  ];

  return codeDepartments.includes(task.dept);
}

/**
 * Get scenario IDs to run for a given department, optionally filtered by tags.
 *
 * @param dept - Department name (must match company/<dept>/uat-scenarios.json)
 * @param tags - Optional tag filter (e.g. ["smoke", "critical"])
 * @returns Array of scenario IDs
 */
export function getScenariosForDept(dept: string, tags?: string[]): string[] {
  const manifestPath = path.join(COMPANY_DIR, dept, "uat-scenarios.json");

  if (!fs.existsSync(manifestPath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    const manifest: UATManifest = JSON.parse(raw);

    let scenarios: UATScenario[] = manifest.scenarios;

    // Filter by tags if provided
    if (tags && tags.length > 0) {
      scenarios = scenarios.filter(
        (s) => s.tags && s.tags.some((t) => tags.includes(t))
      );
    }

    return scenarios.map((s) => s.id);
  } catch {
    return [];
  }
}

/**
 * Get the full manifest for a department.
 */
export function getManifest(dept: string): UATManifest | null {
  const manifestPath = path.join(COMPANY_DIR, dept, "uat-scenarios.json");

  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    return JSON.parse(raw) as UATManifest;
  } catch {
    return null;
  }
}

/**
 * Get all departments that have UAT manifests.
 */
export function getDepartmentsWithUAT(): string[] {
  if (!fs.existsSync(COMPANY_DIR)) {
    return [];
  }

  return fs
    .readdirSync(COMPANY_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .filter((e) => fs.existsSync(path.join(COMPANY_DIR, e.name, "uat-scenarios.json")))
    .map((e) => e.name);
}
