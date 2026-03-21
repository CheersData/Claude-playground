/**
 * Server Health Watchdog — Lightweight server metrics checker for the daemon.
 *
 * Checks RAM, disk, swap, and load average against configurable thresholds.
 * Returns a structured health report with per-metric status (ok/warning/critical).
 *
 * Used by: scripts/cme-autorun.ts (Phase 5: Server Health Watchdog)
 *
 * Design: $0/cycle — uses only os module + execSync for disk/swap.
 * No LLM calls, no external APIs, no network requests.
 */

import * as os from "os";
import { execSync } from "child_process";

// ─── Types ────────────────────────────────────────────────────────────────────

export type HealthStatus = "ok" | "warning" | "critical";

export interface MetricStatus<T extends Record<string, number> = Record<string, number>> {
  status: HealthStatus;
  values: T;
}

export interface ServerHealthCheck {
  memory: MetricStatus<{ usedPercent: number; totalGB: number; usedGB: number }>;
  disk: MetricStatus<{ usedPercent: number; totalGB: number; usedGB: number }>;
  load: MetricStatus<{ avg1m: number; cores: number; normalized: number }>;
  swap: MetricStatus<{ usedMB: number; totalMB: number }>;
  overall: HealthStatus;
  timestamp: string;
}

// ─── Thresholds (configurable) ────────────────────────────────────────────────

export interface WatchdogThresholds {
  memory: { warning: number; critical: number };   // percent used
  disk: { warning: number; critical: number };      // percent used
  load: { warning: number; critical: number };      // normalized load (load/cores)
  swap: { warning: number; critical: number };      // MB used
}

export const DEFAULT_THRESHOLDS: WatchdogThresholds = {
  memory: { warning: 75, critical: 90 },
  disk: { warning: 80, critical: 95 },
  load: { warning: 2.0, critical: 4.0 },
  swap: { warning: 100, critical: 500 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function evaluateStatus(value: number, thresholds: { warning: number; critical: number }): HealthStatus {
  if (value >= thresholds.critical) return "critical";
  if (value >= thresholds.warning) return "warning";
  return "ok";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Metric Collectors ────────────────────────────────────────────────────────

function checkMemory(thresholds: WatchdogThresholds["memory"]): ServerHealthCheck["memory"] {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;
  const usedPercent = round2((usedBytes / totalBytes) * 100);
  const totalGB = round2(totalBytes / 1073741824);
  const usedGB = round2(usedBytes / 1073741824);

  return {
    status: evaluateStatus(usedPercent, thresholds),
    values: { usedPercent, totalGB, usedGB },
  };
}

function checkDisk(thresholds: WatchdogThresholds["disk"]): ServerHealthCheck["disk"] {
  try {
    const output = execSync("df -B1 / | tail -1", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    const parts = output.split(/\s+/);
    if (parts.length < 5) throw new Error("Unexpected df output");

    const totalBytes = parseInt(parts[1], 10);
    const usedBytes = parseInt(parts[2], 10);
    const usedPercent = parseInt(parts[4], 10); // "85%" -> 85

    return {
      status: evaluateStatus(isNaN(usedPercent) ? 0 : usedPercent, thresholds),
      values: {
        usedPercent: isNaN(usedPercent) ? 0 : usedPercent,
        totalGB: round2(totalBytes / 1073741824),
        usedGB: round2(usedBytes / 1073741824),
      },
    };
  } catch {
    return {
      status: "ok", // Can't check = assume ok (don't false-alarm)
      values: { usedPercent: 0, totalGB: 0, usedGB: 0 },
    };
  }
}

function checkLoad(thresholds: WatchdogThresholds["load"]): ServerHealthCheck["load"] {
  const avg1m = os.loadavg()[0];
  const cores = os.cpus().length;
  const normalized = round2(avg1m / Math.max(cores, 1));

  return {
    status: evaluateStatus(normalized, thresholds),
    values: { avg1m: round2(avg1m), cores, normalized },
  };
}

function checkSwap(thresholds: WatchdogThresholds["swap"]): ServerHealthCheck["swap"] {
  try {
    const output = execSync("free -b | grep -i swap", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    const parts = output.split(/\s+/);
    const totalBytes = parseInt(parts[1], 10);
    const usedBytes = parseInt(parts[2], 10);
    const usedMB = round2(usedBytes / 1048576);
    const totalMB = round2(totalBytes / 1048576);

    return {
      status: evaluateStatus(usedMB, thresholds),
      values: { usedMB, totalMB },
    };
  } catch {
    return {
      status: "ok",
      values: { usedMB: 0, totalMB: 0 },
    };
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Check all server health metrics against thresholds.
 * Returns a structured report with per-metric status and an overall status.
 *
 * Cost: $0 — uses only os module + 2 execSync calls (df, free).
 */
export function checkServerHealth(
  thresholds: WatchdogThresholds = DEFAULT_THRESHOLDS,
): ServerHealthCheck {
  const memory = checkMemory(thresholds.memory);
  const disk = checkDisk(thresholds.disk);
  const load = checkLoad(thresholds.load);
  const swap = checkSwap(thresholds.swap);

  // Overall = worst status across all metrics
  const statuses = [memory.status, disk.status, load.status, swap.status];
  let overall: HealthStatus = "ok";
  if (statuses.includes("critical")) overall = "critical";
  else if (statuses.includes("warning")) overall = "warning";

  return {
    memory,
    disk,
    load,
    swap,
    overall,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format a health check into a human-readable summary line for logging.
 */
export function formatHealthSummary(health: ServerHealthCheck): string {
  const parts = [
    `RAM ${health.memory.values.usedPercent}% (${health.memory.values.usedGB}/${health.memory.values.totalGB}GB) [${health.memory.status}]`,
    `Disk ${health.disk.values.usedPercent}% (${health.disk.values.usedGB}/${health.disk.values.totalGB}GB) [${health.disk.status}]`,
    `Load ${health.load.values.avg1m} (${health.load.values.normalized}x${health.load.values.cores}cores) [${health.load.status}]`,
    `Swap ${health.swap.values.usedMB}MB [${health.swap.status}]`,
  ];
  return `Server [${health.overall.toUpperCase()}]: ${parts.join(" | ")}`;
}
