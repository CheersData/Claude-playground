/**
 * Register Daemon Skill Executors
 *
 * Registers read-only skill executors for department status retrieval.
 * Called at daemon startup (before analysis phase).
 *
 * These executors are lightweight and never fail — they return partial data
 * if the source files are missing.
 *
 * Departments exposed as callable tools:
 *   - quality-assurance:get-status
 *   - data-engineering:get-status
 *   - operations:get-status
 *   - trading:get-status
 */

import {
  registerSkillExecutor,
  hasSkillExecutor,
} from "./dept-as-tool";
import {
  readQAStatus,
  readDataEngineeringStatus,
  readOperationsStatus,
  readTradingStatus,
  readAllDepartmentStatuses,
  formatDepartmentStatusSummary,
} from "./department-status-reader";

/**
 * Register all daemon executors.
 * Call this once at daemon startup.
 */
export function registerDaemonExecutors(): void {
  console.log("[DAEMON-EXECUTORS] Registering skill executors...");

  // Quality Assurance
  if (!hasSkillExecutor("quality-assurance", "get-status")) {
    registerSkillExecutor(
      "quality-assurance",
      "get-status",
      async () => readQAStatus()
    );
  }

  // Data Engineering
  if (!hasSkillExecutor("data-engineering", "get-status")) {
    registerSkillExecutor(
      "data-engineering",
      "get-status",
      async () => readDataEngineeringStatus()
    );
  }

  // Operations
  if (!hasSkillExecutor("operations", "get-status")) {
    registerSkillExecutor(
      "operations",
      "get-status",
      async () => readOperationsStatus()
    );
  }

  // Trading
  if (!hasSkillExecutor("trading", "get-status")) {
    registerSkillExecutor(
      "trading",
      "get-status",
      async () => readTradingStatus()
    );
  }

  // Bulk status reader (returns all 4 departments)
  if (!hasSkillExecutor("operations", "get-all-status")) {
    registerSkillExecutor(
      "operations",
      "get-all-status",
      async () => readAllDepartmentStatuses()
    );
  }

  // Formatted summary (for prompt injection)
  if (!hasSkillExecutor("operations", "get-status-summary")) {
    registerSkillExecutor(
      "operations",
      "get-status-summary",
      async () => ({ summary: formatDepartmentStatusSummary() })
    );
  }

  console.log(
    "[DAEMON-EXECUTORS] Registered 6 status reader executors"
  );
}

/**
 * Check if all daemon executors are registered.
 * Useful for debugging.
 */
export function checkDaemonExecutorHealth(): {
  registered: boolean;
  missing: string[];
} {
  const required = [
    ["quality-assurance", "get-status"],
    ["data-engineering", "get-status"],
    ["operations", "get-status"],
    ["trading", "get-status"],
    ["operations", "get-all-status"],
    ["operations", "get-status-summary"],
  ];

  const missing: string[] = [];
  for (const [dept, skill] of required) {
    if (!hasSkillExecutor(dept, skill)) {
      missing.push(`${dept}:${skill}`);
    }
  }

  return { registered: missing.length === 0, missing };
}
