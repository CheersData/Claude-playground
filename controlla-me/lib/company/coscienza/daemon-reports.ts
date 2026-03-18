/**
 * COSCIENZA Layer 3 — Versioned Daemon Reports
 *
 * Replaces the overwritten daemon-report.json with persistent,
 * append-only, queryable report history in Supabase.
 *
 * The daemon still writes daemon-report.json for backward compatibility,
 * but also saves each cycle to the daemon_reports table.
 *
 * Pattern: fire-and-forget (errors logged, never propagated).
 * ADR: ADR-forma-mentis.md Layer 3.2
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  DaemonReport,
  DaemonBoardSummary,
  DaemonSignal,
  DaemonSuggestion,
  DaemonAlert,
  GoalCheckResult,
} from "./types";

// ─── Save ───

/**
 * Save a daemon report to the database (append-only).
 * Returns the report ID if successful, null on error.
 */
export async function saveDaemonReport(report: {
  board: DaemonBoardSummary;
  signals: DaemonSignal[];
  llmAnalysis?: string | null;
  llmSuggestions?: DaemonSuggestion[];
  alerts?: DaemonAlert[];
  goalChecks?: GoalCheckResult[];
  durationMs?: number;
  cycleNumber?: number;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("daemon_reports")
    .insert({
      board: report.board,
      signals: report.signals,
      llm_analysis: report.llmAnalysis ?? null,
      llm_suggestions: report.llmSuggestions ?? [],
      alerts: report.alerts ?? [],
      goal_checks: report.goalChecks ?? [],
      duration_ms: report.durationMs ?? null,
      cycle_number: report.cycleNumber ?? null,
      metadata: report.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) {
    console.error("[COSCIENZA] Error saving daemon report:", error.message);
    return null;
  }

  return data!.id as string;
}

// ─── Query ───

/**
 * Get recent daemon reports in chronological order (newest first).
 */
export async function getRecentReports(
  limit: number = 10
): Promise<DaemonReport[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("daemon_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.error("[COSCIENZA] Error fetching recent reports:", error?.message);
    return [];
  }

  return data.map(mapReportRow);
}

/**
 * Get daemon reports within a time window.
 * @param hours — how many hours back to look (default 24)
 */
export async function getReportHistory(
  hours: number = 24
): Promise<DaemonReport[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("daemon_reports")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.error("[COSCIENZA] Error fetching report history:", error?.message);
    return [];
  }

  return data.map(mapReportRow);
}

/**
 * Get a specific report by ID.
 */
export async function getReport(
  reportId: string
): Promise<DaemonReport | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("daemon_reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();

  if (error || !data) return null;
  return mapReportRow(data);
}

/**
 * Get the latest report (most recent cycle).
 */
export async function getLatestReport(): Promise<DaemonReport | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("daemon_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return mapReportRow(data);
}

// ─── Diff ───

/**
 * Compute a diff between two daemon reports.
 * Highlights what changed between cycles: new signals, resolved signals,
 * goal status changes, board count changes.
 */
export function getDaemonReportDiff(
  currentReport: DaemonReport,
  previousReport: DaemonReport
): DaemonReportDiff {
  // Board changes
  const boardDelta = {
    total: currentReport.board.total - previousReport.board.total,
    open: currentReport.board.open - previousReport.board.open,
    inProgress: currentReport.board.inProgress - previousReport.board.inProgress,
    done: currentReport.board.done - previousReport.board.done,
  };

  // Signal diff: identify new and resolved signals by sourceId
  const prevSignalIds = new Set(
    previousReport.signals.map((s) => s.sourceId)
  );
  const currSignalIds = new Set(
    currentReport.signals.map((s) => s.sourceId)
  );

  const newSignals = currentReport.signals.filter(
    (s) => !prevSignalIds.has(s.sourceId)
  );
  const resolvedSignals = previousReport.signals.filter(
    (s) => !currSignalIds.has(s.sourceId)
  );

  // Priority changes: signals that exist in both but changed priority
  const priorityChanges: Array<{
    sourceId: string;
    from: string;
    to: string;
  }> = [];
  for (const curr of currentReport.signals) {
    if (prevSignalIds.has(curr.sourceId)) {
      const prev = previousReport.signals.find(
        (s) => s.sourceId === curr.sourceId
      );
      if (prev && prev.priority !== curr.priority) {
        priorityChanges.push({
          sourceId: curr.sourceId,
          from: prev.priority,
          to: curr.priority,
        });
      }
    }
  }

  // Goal check status transitions
  const goalTransitions: Array<{
    goalId: string;
    goalTitle: string;
    from: string;
    to: string;
  }> = [];

  for (const check of currentReport.goalChecks) {
    if (check.status !== check.previousStatus) {
      goalTransitions.push({
        goalId: check.goalId,
        goalTitle: check.goalTitle,
        from: check.previousStatus,
        to: check.status,
      });
    }
  }

  // Alert count comparison
  const newAlerts = currentReport.alerts.length - previousReport.alerts.length;

  return {
    currentCycle: currentReport.cycleNumber,
    previousCycle: previousReport.cycleNumber,
    timeBetween: timeDelta(previousReport.createdAt, currentReport.createdAt),
    boardDelta,
    newSignals,
    resolvedSignals,
    priorityChanges,
    goalTransitions,
    newAlertsDelta: newAlerts,
    hasChanges:
      boardDelta.total !== 0 ||
      newSignals.length > 0 ||
      resolvedSignals.length > 0 ||
      priorityChanges.length > 0 ||
      goalTransitions.length > 0,
  };
}

export interface DaemonReportDiff {
  currentCycle: number | null;
  previousCycle: number | null;
  /** Human-readable time between reports, e.g. "15m", "2h 30m" */
  timeBetween: string;
  boardDelta: {
    total: number;
    open: number;
    inProgress: number;
    done: number;
  };
  newSignals: DaemonSignal[];
  resolvedSignals: DaemonSignal[];
  priorityChanges: Array<{ sourceId: string; from: string; to: string }>;
  goalTransitions: Array<{
    goalId: string;
    goalTitle: string;
    from: string;
    to: string;
  }>;
  newAlertsDelta: number;
  hasChanges: boolean;
}

// ─── Cleanup ───

/**
 * Delete daemon reports older than a given number of days.
 * Default: 30 days (per ADR spec).
 * Returns the number of deleted reports.
 */
export async function cleanupOldReports(
  olderThanDays: number = 30
): Promise<number> {
  const admin = createAdminClient();
  const cutoff = new Date(
    Date.now() - olderThanDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await admin
    .from("daemon_reports")
    .delete()
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    console.error("[COSCIENZA] Error cleaning up old reports:", error.message);
    return 0;
  }

  const count = data?.length ?? 0;
  if (count > 0) {
    console.log(
      `[COSCIENZA] Cleaned up ${count} daemon reports older than ${olderThanDays} days`
    );
  }
  return count;
}

// ─── Helpers ───

function timeDelta(from: string, to: string): string {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (ms < 0) return "0m";

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function mapReportRow(row: Record<string, unknown>): DaemonReport {
  return {
    id: row.id as string,
    board: row.board as DaemonBoardSummary,
    signals: (row.signals as DaemonSignal[]) ?? [],
    llmAnalysis: (row.llm_analysis as string) ?? null,
    llmSuggestions: (row.llm_suggestions as DaemonSuggestion[]) ?? [],
    alerts: (row.alerts as DaemonAlert[]) ?? [],
    goalChecks: (row.goal_checks as GoalCheckResult[]) ?? [],
    durationMs: (row.duration_ms as number) ?? null,
    cycleNumber: (row.cycle_number as number) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
  };
}
