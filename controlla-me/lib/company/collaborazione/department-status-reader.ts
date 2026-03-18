/**
 * Department Status Reader — read-only executors for department status.json files
 *
 * Provides lightweight, fire-and-forget status reads for QA, data-engineering,
 * operations, and trading departments. These are registered as callable skills
 * in the dept-as-tool system.
 *
 * Used by the daemon to gather department health snapshot without executing expensive operations.
 *
 * Pattern: synchronous file reads with try-catch, never throw.
 */

import * as fs from "fs";
import * as path from "path";

const COMPANY_DIR = path.resolve(process.cwd(), "company");

// ────────────────────────────────────────────────────────────
// Status Reader Functions
// ────────────────────────────────────────────────────────────

interface DepartmentStatus {
  department: string;
  status: "operational" | "degraded" | "blocked" | "unknown";
  lastUpdate: string | null;
  currentFocus?: string;
  activeMetrics?: Record<string, unknown>;
  errors?: string[];
  summary?: string;
}

/**
 * Read QA department status from company/quality-assurance/status.json
 * Returns simplified health snapshot.
 */
export function readQAStatus(): DepartmentStatus {
  try {
    const statusPath = path.join(COMPANY_DIR, "quality-assurance", "status.json");
    if (!fs.existsSync(statusPath)) {
      return {
        department: "quality-assurance",
        status: "unknown",
        lastUpdate: null,
        summary: "status.json not found",
      };
    }

    const raw = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
    return {
      department: "quality-assurance",
      status: raw.status ?? "unknown",
      lastUpdate: raw.lastUpdate ?? raw.updated_at ?? null,
      currentFocus: raw.currentFocus || raw.focus || undefined,
      activeMetrics: {
        testSuites: raw.testSuites || raw.test_suites,
        coverage: raw.coverage,
        failureRate: raw.failureRate || raw.failure_rate,
      },
      errors: raw.errors,
      summary: raw.summary,
    };
  } catch (err) {
    return {
      department: "quality-assurance",
      status: "unknown",
      lastUpdate: null,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

/**
 * Read Data Engineering department status from company/data-engineering/status.json
 * Returns pipeline health and connector status.
 */
export function readDataEngineeringStatus(): DepartmentStatus {
  try {
    const statusPath = path.join(COMPANY_DIR, "data-engineering", "status.json");
    if (!fs.existsSync(statusPath)) {
      return {
        department: "data-engineering",
        status: "unknown",
        lastUpdate: null,
        summary: "status.json not found",
      };
    }

    const raw = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
    return {
      department: "data-engineering",
      status: raw.status ?? "unknown",
      lastUpdate: raw.lastUpdate ?? raw.updated_at ?? null,
      currentFocus: raw.currentFocus || raw.focus || undefined,
      activeMetrics: {
        pipelineStatus: raw.pipelineStatus || raw.pipeline_status,
        connectors: raw.connectors,
        lastSyncTime: raw.lastSyncTime || raw.last_sync_time,
        recordsProcessed: raw.recordsProcessed || raw.records_processed,
      },
      errors: raw.errors,
      summary: raw.summary,
    };
  } catch (err) {
    return {
      department: "data-engineering",
      status: "unknown",
      lastUpdate: null,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

/**
 * Read Operations department status from company/operations/status.json
 * Returns monitoring and deployment status.
 */
export function readOperationsStatus(): DepartmentStatus {
  try {
    const statusPath = path.join(COMPANY_DIR, "operations", "status.json");
    if (!fs.existsSync(statusPath)) {
      return {
        department: "operations",
        status: "unknown",
        lastUpdate: null,
        summary: "status.json not found",
      };
    }

    const raw = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
    return {
      department: "operations",
      status: raw.status ?? "unknown",
      lastUpdate: raw.lastUpdate ?? raw.updated_at ?? null,
      currentFocus: raw.currentFocus || raw.focus || undefined,
      activeMetrics: {
        deploymentStatus: raw.deploymentStatus || raw.deployment_status,
        monitoringHealth: raw.monitoringHealth || raw.monitoring_health,
        alertsActive: raw.alertsActive || raw.alerts_active,
        uptimePercent: raw.uptimePercent || raw.uptime_percent,
      },
      errors: raw.errors,
      summary: raw.summary,
    };
  } catch (err) {
    return {
      department: "operations",
      status: "unknown",
      lastUpdate: null,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

/**
 * Read Trading department status from company/trading/status.json
 * Returns trading mode, strategy performance, and risk status.
 */
export function readTradingStatus(): DepartmentStatus {
  try {
    const statusPath = path.join(COMPANY_DIR, "trading", "status.json");
    if (!fs.existsSync(statusPath)) {
      return {
        department: "trading",
        status: "unknown",
        lastUpdate: null,
        summary: "status.json not found",
      };
    }

    const raw = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
    return {
      department: "trading",
      status: raw.status ?? "unknown",
      lastUpdate: raw.lastUpdate ?? raw.updated_at ?? null,
      currentFocus: raw.currentFocus || raw.focus || undefined,
      activeMetrics: {
        mode: raw.mode, // paper, backtest, live
        phase: raw.phase, // backtest cycle, paper trading, go-live
        pnlPercent: raw.pnlPercent || raw.pnl_percent,
        sharpeRatio: raw.sharpeRatio || raw.sharpe_ratio,
        killSwitchActive: raw.killSwitchActive || raw.kill_switch_active,
        positionsOpen: raw.positionsOpen || raw.positions_open,
      },
      errors: raw.errors,
      summary: raw.summary,
    };
  } catch (err) {
    return {
      department: "trading",
      status: "unknown",
      lastUpdate: null,
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
}

/**
 * Batch read all department statuses.
 * Returns a map of department -> status.
 * Fire-and-forget: never throws, always returns partial data.
 */
export function readAllDepartmentStatuses(): Record<string, DepartmentStatus> {
  return {
    "quality-assurance": readQAStatus(),
    "data-engineering": readDataEngineeringStatus(),
    operations: readOperationsStatus(),
    trading: readTradingStatus(),
  };
}

/**
 * Format all department statuses into a text summary for prompt injection.
 * Returns a markdown block suitable for inclusion in LLM prompts.
 */
export function formatDepartmentStatusSummary(): string {
  const statuses = readAllDepartmentStatuses();
  const lines: string[] = ["## DEPARTMENT STATUS SNAPSHOT"];

  for (const [dept, status] of Object.entries(statuses)) {
    const icon =
      status.status === "operational"
        ? "🟢"
        : status.status === "degraded"
          ? "🟡"
          : status.status === "blocked"
            ? "🔴"
            : "⚪";

    lines.push(
      `\n### ${icon} ${dept} (${status.status})`
    );

    if (status.lastUpdate) {
      lines.push(`- Last update: ${status.lastUpdate}`);
    }

    if (status.currentFocus) {
      lines.push(`- Focus: ${status.currentFocus}`);
    }

    if (status.activeMetrics) {
      const metricsLines = Object.entries(status.activeMetrics)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(
          ([k, v]) =>
            `- ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`
        );
      lines.push(...metricsLines);
    }

    if (status.summary) {
      lines.push(`- Summary: ${status.summary}`);
    }

    if (status.errors && status.errors.length > 0) {
      lines.push(
        `- ⚠️ Errors: ${status.errors.slice(0, 2).join("; ")}`
      );
    }
  }

  return lines.join("\n");
}
