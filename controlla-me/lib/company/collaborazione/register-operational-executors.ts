/**
 * Register Operational Skill Executors
 *
 * Registers REAL operational executors that run commands and return structured results.
 * Called at daemon startup (after registerDaemonExecutors).
 *
 * Unlike daemon executors (read-only status readers), these actually execute
 * operations: running tests, type-checking, building, querying APIs, etc.
 *
 * Departments exposed as callable tools:
 *   - quality-assurance:run-tests
 *   - quality-assurance:type-check
 *   - quality-assurance:lint-check
 *   - operations:get-task-board
 *   - data-engineering:data-connector-status
 *   - finance:get-cost-summary
 *   - trading:check-kill-switch
 *   - acceleration:profile-build
 */

import { execSync } from "child_process";
import { resolve } from "path";
import {
  registerSkillExecutor,
  hasSkillExecutor,
} from "./dept-as-tool";

const ROOT = resolve(__dirname, "../../..");
const COMMAND_TIMEOUT = 120_000; // 120s for long-running commands

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

interface CommandResult {
  success: boolean;
  output: string;
  durationMs: number;
  exitCode: number;
}

/**
 * Run a shell command with timeout and structured result.
 * Never throws — returns structured error on failure.
 */
function runCommand(
  command: string,
  options?: { timeout?: number; cwd?: string }
): CommandResult {
  const start = Date.now();
  const timeout = options?.timeout ?? COMMAND_TIMEOUT;
  const cwd = options?.cwd ?? ROOT;

  try {
    const output = execSync(command, {
      encoding: "utf-8",
      timeout,
      cwd,
      maxBuffer: 10 * 1024 * 1024, // 10MB
      stdio: ["pipe", "pipe", "pipe"],
    });
    return {
      success: true,
      output: output.slice(0, 50_000), // Cap output at 50KB
      durationMs: Date.now() - start,
      exitCode: 0,
    };
  } catch (err: unknown) {
    const error = err as {
      status?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const stdout = (error.stdout || "").slice(0, 30_000);
    const stderr = (error.stderr || "").slice(0, 20_000);
    return {
      success: false,
      output: stdout + (stderr ? `\n--- STDERR ---\n${stderr}` : ""),
      durationMs: Date.now() - start,
      exitCode: error.status ?? 1,
    };
  }
}

// ────────────────────────────────────────────────────────
// Executor Implementations
// ────────────────────────────────────────────────────────

/**
 * quality-assurance:run-tests
 * Runs vitest with optional filter parameter.
 * Params: { filter?: string } — e.g. "unit", "e2e", "agents"
 */
async function executeRunTests(
  params: Record<string, unknown>
): Promise<unknown> {
  const filter = typeof params.filter === "string" ? params.filter : "";
  const cmd = filter
    ? `npx vitest run ${filter} --reporter=verbose`
    : `npx vitest run --reporter=verbose`;

  const result = runCommand(cmd);

  // Parse test summary from vitest output
  const passMatch = result.output.match(/(\d+)\s+passed/);
  const failMatch = result.output.match(/(\d+)\s+failed/);
  const skipMatch = result.output.match(/(\d+)\s+skipped/);

  return {
    success: result.success,
    passed: passMatch ? parseInt(passMatch[1], 10) : null,
    failed: failMatch ? parseInt(failMatch[1], 10) : null,
    skipped: skipMatch ? parseInt(skipMatch[1], 10) : null,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    output: result.output,
    filter: filter || "all",
  };
}

/**
 * quality-assurance:type-check
 * Runs TypeScript compiler in check-only mode.
 */
async function executeTypeCheck(): Promise<unknown> {
  const result = runCommand("npx tsc --noEmit");

  // Count errors from tsc output
  const errorLines = result.output
    .split("\n")
    .filter((l) => l.includes("error TS"));

  return {
    success: result.success,
    errors: errorLines.length,
    errorDetails: errorLines.slice(0, 20), // First 20 errors
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    output: result.output,
  };
}

/**
 * quality-assurance:lint-check
 * Runs ESLint via npm run lint.
 */
async function executeLintCheck(): Promise<unknown> {
  const result = runCommand("npm run lint");

  // Count warning/error lines
  const warningCount = (result.output.match(/warning/gi) || []).length;
  const errorCount = (result.output.match(/error(?!s)/gi) || []).length;

  return {
    success: result.success,
    warnings: warningCount,
    errors: errorCount,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    output: result.output,
  };
}

/**
 * operations:get-task-board
 * Reads the company task board.
 */
async function executeGetTaskBoard(): Promise<unknown> {
  const result = runCommand("npx tsx scripts/company-tasks.ts board", {
    timeout: 30_000,
  });

  // Parse board stats
  const totalMatch = result.output.match(/Totale:\s*(\d+)/);
  const openMatch = result.output.match(/Open:\s*(\d+)/);
  const ipMatch = result.output.match(/In Progress:\s*(\d+)/);
  const doneMatch = result.output.match(/Done:\s*(\d+)/);

  return {
    success: result.success,
    board: {
      total: totalMatch ? parseInt(totalMatch[1], 10) : null,
      open: openMatch ? parseInt(openMatch[1], 10) : null,
      inProgress: ipMatch ? parseInt(ipMatch[1], 10) : null,
      done: doneMatch ? parseInt(doneMatch[1], 10) : null,
    },
    durationMs: result.durationMs,
    output: result.output,
  };
}

/**
 * data-engineering:data-connector-status
 * Gets data connector pipeline status.
 */
async function executeDataConnectorStatus(): Promise<unknown> {
  const result = runCommand("npx tsx scripts/data-connector.ts status", {
    timeout: 30_000,
  });

  return {
    success: result.success,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    output: result.output,
  };
}

/**
 * finance:get-cost-summary
 * Reads cost summary. Tries the local API first, falls back to reading
 * the daemon report for cached cost data.
 */
async function executeGetCostSummary(
  params: Record<string, unknown>
): Promise<unknown> {
  const days = typeof params.days === "number" ? params.days : 7;

  // Try reading from the API via curl (localhost)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const result = runCommand(
    `curl -s --max-time 10 "${appUrl}/api/company/costs?days=${days}"`,
    { timeout: 15_000 }
  );

  if (result.success && result.output.startsWith("{")) {
    try {
      const data = JSON.parse(result.output);
      return {
        success: true,
        source: "api",
        days,
        data,
        durationMs: result.durationMs,
      };
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: try reading cost data from Supabase directly
  try {
    const { createAdminClient } = await import("../../supabase/admin");
    const admin = createAdminClient();
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await admin
      .from("agent_cost_log")
      .select("agent_name, model, estimated_cost, created_at")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return {
        success: false,
        source: "supabase",
        error: error.message,
        durationMs: Date.now(),
      };
    }

    const totalCost = (data || []).reduce(
      (sum: number, row: { estimated_cost?: number }) =>
        sum + (row.estimated_cost || 0),
      0
    );

    return {
      success: true,
      source: "supabase",
      days,
      totalCost,
      entries: (data || []).length,
      durationMs: result.durationMs,
    };
  } catch (err) {
    return {
      success: false,
      source: "none",
      error: err instanceof Error ? err.message : String(err),
      durationMs: result.durationMs,
    };
  }
}

/**
 * trading:check-kill-switch
 * Reads trading_config from Supabase to check kill switch status.
 */
async function executeCheckKillSwitch(): Promise<unknown> {
  try {
    const { createAdminClient } = await import("../../supabase/admin");
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("trading_config")
      .select(
        "mode, enabled, kill_switch_active, kill_switch_reason, kill_switch_triggered_at, max_daily_loss_pct, max_weekly_loss_pct"
      )
      .limit(1)
      .single();

    if (error) {
      return {
        success: false,
        error: error.message,
        killSwitchActive: null,
      };
    }

    return {
      success: true,
      killSwitchActive: data?.kill_switch_active ?? false,
      killSwitchReason: data?.kill_switch_reason ?? null,
      killSwitchTriggeredAt: data?.kill_switch_triggered_at ?? null,
      tradingMode: data?.mode ?? "unknown",
      tradingEnabled: data?.enabled ?? false,
      maxDailyLossPct: data?.max_daily_loss_pct ?? null,
      maxWeeklyLossPct: data?.max_weekly_loss_pct ?? null,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      killSwitchActive: null,
    };
  }
}

/**
 * acceleration:profile-build
 * Runs npm run build and captures timing.
 */
async function executeProfileBuild(): Promise<unknown> {
  const result = runCommand("npm run build", { timeout: COMMAND_TIMEOUT });

  // Extract timing info from Next.js build output
  const routeLines = result.output
    .split("\n")
    .filter((l) => l.includes("Route") || l.includes("Size") || l.includes("First Load"));

  // Look for build completion time
  const buildTimeMatch = result.output.match(
    /(?:compiled|built|Compiled)\s+(?:successfully\s+)?in\s+([0-9.]+)\s*(s|ms|m)/i
  );

  let buildTimeMs: number | null = null;
  if (buildTimeMatch) {
    const val = parseFloat(buildTimeMatch[1]);
    const unit = buildTimeMatch[2];
    if (unit === "s") buildTimeMs = val * 1000;
    else if (unit === "m") buildTimeMs = val * 60000;
    else buildTimeMs = val;
  }

  return {
    success: result.success,
    buildTimeMs: buildTimeMs ?? result.durationMs,
    wallTimeMs: result.durationMs,
    exitCode: result.exitCode,
    routeSummary: routeLines.slice(0, 30),
    output: result.output,
  };
}

// ────────────────────────────────────────────────────────
// Registration
// ────────────────────────────────────────────────────────

/**
 * Register all operational executors.
 * Call this once at daemon startup, after registerDaemonExecutors().
 */
export function registerOperationalExecutors(): void {
  console.log("[OPERATIONAL-EXECUTORS] Registering skill executors...");

  // Quality Assurance: run-tests
  if (!hasSkillExecutor("quality-assurance", "run-tests")) {
    registerSkillExecutor(
      "quality-assurance",
      "run-tests",
      executeRunTests
    );
  }

  // Quality Assurance: type-check
  if (!hasSkillExecutor("quality-assurance", "type-check")) {
    registerSkillExecutor(
      "quality-assurance",
      "type-check",
      async () => executeTypeCheck()
    );
  }

  // Quality Assurance: lint-check
  if (!hasSkillExecutor("quality-assurance", "lint-check")) {
    registerSkillExecutor(
      "quality-assurance",
      "lint-check",
      async () => executeLintCheck()
    );
  }

  // Operations: get-task-board
  if (!hasSkillExecutor("operations", "get-task-board")) {
    registerSkillExecutor(
      "operations",
      "get-task-board",
      async () => executeGetTaskBoard()
    );
  }

  // Data Engineering: data-connector-status
  if (!hasSkillExecutor("data-engineering", "data-connector-status")) {
    registerSkillExecutor(
      "data-engineering",
      "data-connector-status",
      async () => executeDataConnectorStatus()
    );
  }

  // Finance: get-cost-summary
  if (!hasSkillExecutor("finance", "get-cost-summary")) {
    registerSkillExecutor(
      "finance",
      "get-cost-summary",
      executeGetCostSummary
    );
  }

  // Trading: check-kill-switch
  if (!hasSkillExecutor("trading", "check-kill-switch")) {
    registerSkillExecutor(
      "trading",
      "check-kill-switch",
      async () => executeCheckKillSwitch()
    );
  }

  // Acceleration: profile-build
  if (!hasSkillExecutor("acceleration", "profile-build")) {
    registerSkillExecutor(
      "acceleration",
      "profile-build",
      async () => executeProfileBuild()
    );
  }

  console.log(
    "[OPERATIONAL-EXECUTORS] Registered 8 operational executors"
  );
}

/**
 * Check if all operational executors are registered.
 * Useful for debugging.
 */
export function checkOperationalExecutorHealth(): {
  registered: boolean;
  missing: string[];
} {
  const required = [
    ["quality-assurance", "run-tests"],
    ["quality-assurance", "type-check"],
    ["quality-assurance", "lint-check"],
    ["operations", "get-task-board"],
    ["data-engineering", "data-connector-status"],
    ["finance", "get-cost-summary"],
    ["trading", "check-kill-switch"],
    ["acceleration", "profile-build"],
  ];

  const missing: string[] = [];
  for (const [dept, skill] of required) {
    if (!hasSkillExecutor(dept, skill)) {
      missing.push(`${dept}:${skill}`);
    }
  }

  return { registered: missing.length === 0, missing };
}
