"use client";

import { Activity, DollarSign, ClipboardList, AlertTriangle, Clock } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OpsData {
  board: {
    total: number;
    byStatus: Record<string, number>;
    byDepartment: Record<string, { total: number; open: number; done: number }>;
    recent: unknown[];
  };
  costs: {
    total: number;
    calls: number;
    avgPerCall: number;
    fallbackRate: number;
    byProvider: Record<string, { cost: number; calls: number }>;
  } | null;
}

interface DaemonData {
  lastReport?: {
    signals?: Array<{ priority: string }>;
    board?: { open: number; inProgress: number };
  };
  goalChecks?: Array<{ status: string }>;
  cmeDirective?: { mode: string };
}

interface KPIHeaderProps {
  data: OpsData | null;
  lastRefresh: Date;
  daemonData: DaemonData | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeSince(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s fa`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m fa`;
  return `${Math.floor(m / 60)}h fa`;
}

function getHealthStatus(data: OpsData | null, signals: Array<{ priority: string }> = []) {
  if (!data) return { color: "var(--fg-invisible)", label: "Caricamento" };
  const blocked = data.board.byStatus?.blocked ?? 0;
  const critical = signals.filter((s) => s.priority === "critical").length;
  const high = signals.filter((s) => s.priority === "high").length;

  if (critical > 0 || blocked > 0) return { color: "var(--error)", label: "Critico" };
  if (high > 0) return { color: "#f59e0b", label: "Attenzione" };
  return { color: "var(--success)", label: "OK" };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function KPIHeader({ data, lastRefresh, daemonData }: KPIHeaderProps) {
  const signals = daemonData?.lastReport?.signals ?? [];
  const health = getHealthStatus(data, signals);
  const goalsAtRisk = (daemonData?.goalChecks ?? []).filter((g) => g.status === "at_risk").length;
  const open = data?.board.byStatus?.open ?? 0;
  const inProgress = data?.board.byStatus?.in_progress ?? 0;
  const costs = data?.costs?.total ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-2 md:gap-3 px-1">
      {/* Health pill */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
        style={{
          background: health.color === "var(--success)"
            ? "rgba(93,228,199,0.08)"
            : health.color === "var(--error)"
              ? "rgba(229,141,120,0.08)"
              : "rgba(245,158,11,0.08)",
          border: `1px solid ${health.color}40`,
          color: health.color,
        }}
      >
        <span
          className={`w-2 h-2 rounded-full ${health.label !== "OK" ? "animate-pulse" : ""}`}
          style={{ background: health.color }}
        />
        <Activity className="w-3 h-3" />
        {health.label}
      </div>

      {/* Goals at risk */}
      {goalsAtRisk > 0 && (
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.2)",
            color: "#f59e0b",
          }}
        >
          <AlertTriangle className="w-3 h-3" />
          {goalsAtRisk} goal a rischio
        </div>
      )}

      {/* Task counters */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
        style={{
          background: "var(--bg-overlay)",
          border: "1px solid var(--border-dark-subtle)",
          color: "var(--fg-secondary)",
        }}
      >
        <ClipboardList className="w-3 h-3" />
        <span>
          <span style={{ color: "var(--info)" }}>{open} open</span>
          <span className="mx-1" style={{ color: "var(--fg-invisible)" }}>/</span>
          <span style={{ color: "var(--identity-gold)" }}>{inProgress} in corso</span>
        </span>
      </div>

      {/* Cost */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
        style={{
          background: "var(--bg-overlay)",
          border: "1px solid var(--border-dark-subtle)",
          color: "var(--fg-secondary)",
        }}
      >
        <DollarSign className="w-3 h-3" />
        <span className="tabular-nums" style={{ color: "var(--fg-primary)" }}>
          ${costs.toFixed(2)}
        </span>
        <span style={{ color: "var(--fg-invisible)" }}>7d</span>
      </div>

      {/* Freshness */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs ml-auto"
        style={{
          color: "var(--fg-invisible)",
        }}
      >
        <Clock className="w-3 h-3" />
        Aggiornato {timeSince(lastRefresh)}
      </div>
    </div>
  );
}
