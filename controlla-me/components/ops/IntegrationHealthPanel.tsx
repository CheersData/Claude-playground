"use client";

/**
 * IntegrationHealthPanel — Monitoraggio salute connettori dati.
 *
 * Mostra:
 *   - Griglia connector status cards con health dot
 *   - Sync history bar chart (7 giorni, CSS puro)
 *   - Error log collassabile e filtrabile
 *   - Auto-refresh ogni 60s
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  Database,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  Filter,
  HelpCircle,
  RotateCcw,
  Pause,
  ScrollText,
  Heart,
} from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";

// ── Types ────────────────────────────────────────────────────────────────────

interface ConnectorStatus {
  id: string;
  name: string;
  status: "healthy" | "warning" | "error" | "unknown";
  articleCount: number;
  lastSyncAt: string | null;
  lastSyncDuration: number | null;
  lastSyncResult: "success" | "partial" | "failed" | null;
  errorCount7d: number;
  articlesAdded7d: number;
  articlesUpdated7d: number;
}

interface SyncHistoryDay {
  date: string;
  dayLabel: string;
  success: number;
  failed: number;
  partial: number;
}

interface SyncError {
  id: string;
  sourceId: string;
  sourceName: string;
  timestamp: string;
  severity: "error" | "warning" | "info";
  message: string;
  details?: string;
  resolved: boolean;
}

interface IntegrationData {
  connectors: ConnectorStatus[];
  syncHistory: SyncHistoryDay[];
  errors: SyncError[];
  summary: {
    totalConnectors: number;
    healthy: number;
    warning: number;
    error: number;
    unknown: number;
    totalArticles: number;
    lastGlobalSync: string | null;
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ConnectorStatus["status"],
  { color: string; bgGlow: string; label: string; icon: typeof CheckCircle }
> = {
  healthy: {
    color: "#4ECDC4",
    bgGlow: "rgba(78, 205, 196, 0.15)",
    label: "Operativo",
    icon: CheckCircle,
  },
  warning: {
    color: "#FFC832",
    bgGlow: "rgba(255, 200, 50, 0.15)",
    label: "Attenzione",
    icon: AlertTriangle,
  },
  error: {
    color: "#FF6B6B",
    bgGlow: "rgba(255, 107, 107, 0.15)",
    label: "Errore",
    icon: XCircle,
  },
  unknown: {
    color: "#6B7280",
    bgGlow: "rgba(107, 114, 128, 0.1)",
    label: "Mai sincronizzato",
    icon: HelpCircle,
  },
};

const SEVERITY_STYLES: Record<string, { dot: string; text: string }> = {
  error: { dot: "bg-[#FF6B6B]", text: "text-[#FF6B6B]" },
  warning: { dot: "bg-[#FFC832]", text: "text-[#FFC832]" },
  info: { dot: "bg-[var(--fg-invisible)]", text: "text-[var(--fg-secondary)]" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number | null): string {
  if (ms === null) return "--";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function formatTimeAgo(iso: string | null): string {
  if (!iso) return "Mai";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "ora";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min fa`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h fa`;
  return `${Math.floor(diff / 86_400_000)}g fa`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" }) +
    " " +
    d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ConnectorCard({
  connector,
  index,
  onRetry,
  onPause,
  onViewLogs,
  loadingAction,
}: {
  connector: ConnectorStatus;
  index: number;
  onRetry?: (id: string) => void;
  onPause?: (id: string) => void;
  onViewLogs?: (id: string) => void;
  loadingAction?: { id: string; type: string } | null;
}) {
  const cfg = STATUS_CONFIG[connector.status];
  const StatusIcon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      className="rounded-lg border overflow-hidden"
      style={{
        background: "var(--bg-raised)",
        borderColor: "var(--border-dark-subtle)",
      }}
    >
      {/* Header with status dot */}
      <div className="px-3 py-2.5 flex items-center gap-2.5">
        <motion.div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{
            background: cfg.color,
            boxShadow: `0 0 8px ${cfg.bgGlow}`,
          }}
          animate={
            connector.status === "healthy"
              ? {}
              : connector.status === "error"
                ? {
                    boxShadow: [
                      `0 0 4px ${cfg.bgGlow}`,
                      `0 0 12px ${cfg.bgGlow}`,
                      `0 0 4px ${cfg.bgGlow}`,
                    ],
                  }
                : {}
          }
          transition={
            connector.status === "error"
              ? { duration: 2, repeat: Infinity, ease: "easeInOut" }
              : undefined
          }
          aria-label={`Stato: ${cfg.label}`}
        />
        <div className="flex-1 min-w-0">
          <span
            className="text-xs font-semibold uppercase tracking-wider truncate block"
            style={{ color: "var(--fg-primary)" }}
          >
            {connector.name}
          </span>
        </div>
        <StatusIcon
          className="w-3.5 h-3.5 shrink-0"
          style={{ color: cfg.color }}
          aria-hidden="true"
        />
      </div>

      {/* Stats */}
      <div
        className="px-3 pb-2 pt-1 space-y-1.5"
        style={{ borderTop: "1px solid var(--border-dark-subtle)" }}
      >
        {/* Article count */}
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--fg-secondary)" }}>
            Articoli
          </span>
          <span
            className="text-xs font-mono font-medium"
            style={{ color: "var(--fg-primary)" }}
          >
            {connector.articleCount.toLocaleString("it-IT")}
          </span>
        </div>

        {/* Last sync */}
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--fg-secondary)" }}>
            Ultimo sync
          </span>
          <span
            className="text-xs font-mono"
            style={{
              color:
                connector.lastSyncResult === "failed"
                  ? "#FF6B6B"
                  : "var(--fg-primary)",
            }}
          >
            {connector.lastSyncResult === "failed"
              ? "FALLITO"
              : formatTimeAgo(connector.lastSyncAt)}
          </span>
        </div>

        {/* Duration */}
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--fg-secondary)" }}>
            Durata
          </span>
          <span
            className="text-xs font-mono"
            style={{ color: "var(--fg-primary)" }}
          >
            {formatDuration(connector.lastSyncDuration)}
          </span>
        </div>

        {/* Error count */}
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--fg-secondary)" }}>
            Errori (7g)
          </span>
          <span
            className="text-xs font-mono font-medium"
            style={{
              color:
                connector.errorCount7d > 0
                  ? connector.errorCount7d >= 5
                    ? "#FF6B6B"
                    : "#FFC832"
                  : "var(--success)",
            }}
          >
            {connector.errorCount7d}
          </span>
        </div>

        {/* 7d activity */}
        {(connector.articlesAdded7d > 0 ||
          connector.articlesUpdated7d > 0) && (
          <div
            className="flex items-center gap-2 pt-1"
            style={{ borderTop: "1px solid var(--border-dark-subtle)" }}
          >
            {connector.articlesAdded7d > 0 && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  background: "rgba(78, 205, 196, 0.1)",
                  color: "#4ECDC4",
                }}
              >
                +{connector.articlesAdded7d} nuovi
              </span>
            )}
            {connector.articlesUpdated7d > 0 && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  background: "rgba(167, 139, 250, 0.1)",
                  color: "#A78BFA",
                }}
              >
                {connector.articlesUpdated7d} aggiornati
              </span>
            )}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div
        className="px-3 py-2 flex items-center gap-1.5"
        style={{ borderTop: "1px solid var(--border-dark-subtle)" }}
      >
        {/* Retry sync — visible when error or warning */}
        {(connector.status === "error" || connector.status === "warning") && (
          <button
            onClick={() => onRetry?.(connector.id)}
            disabled={loadingAction?.id === connector.id && loadingAction?.type === "retry"}
            aria-label={`Riprova sincronizzazione per ${connector.name}`}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
            style={{
              background: "var(--bg-overlay)",
              color: "var(--fg-secondary)",
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.background = "var(--bg-active)";
                e.currentTarget.style.color = "var(--accent)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-overlay)";
              e.currentTarget.style.color = "var(--fg-secondary)";
            }}
          >
            <RotateCcw className={`w-3 h-3 ${loadingAction?.id === connector.id && loadingAction?.type === "retry" ? "animate-spin" : ""}`} aria-hidden="true" />
            {loadingAction?.id === connector.id && loadingAction?.type === "retry" ? "Invio..." : "Riprova"}
          </button>
        )}

        {/* Pause — visible when healthy */}
        {connector.status === "healthy" && (
          <button
            onClick={() => onPause?.(connector.id)}
            disabled={loadingAction?.id === connector.id && loadingAction?.type === "pause"}
            aria-label={`Metti in pausa ${connector.name}`}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
            style={{
              background: "var(--bg-overlay)",
              color: "var(--fg-secondary)",
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.background = "var(--bg-active)";
                e.currentTarget.style.color = "#FFC832";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-overlay)";
              e.currentTarget.style.color = "var(--fg-secondary)";
            }}
          >
            <Pause className={`w-3 h-3 ${loadingAction?.id === connector.id && loadingAction?.type === "pause" ? "animate-pulse" : ""}`} aria-hidden="true" />
            {loadingAction?.id === connector.id && loadingAction?.type === "pause" ? "Invio..." : "Pausa"}
          </button>
        )}

        {/* View logs — always visible */}
        <button
          onClick={() => onViewLogs?.(connector.id)}
          aria-label={`Visualizza log di ${connector.name}`}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
          style={{
            background: "var(--bg-overlay)",
            color: "var(--fg-secondary)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-active)";
            e.currentTarget.style.color = "var(--info-bright)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-overlay)";
            e.currentTarget.style.color = "var(--fg-secondary)";
          }}
        >
          <ScrollText className="w-3 h-3" aria-hidden="true" />
          Log
        </button>
      </div>
    </motion.div>
  );
}

function SyncHistoryChart({ history }: { history: SyncHistoryDay[] }) {
  const maxTotal = useMemo(() => {
    return Math.max(
      ...history.map((d) => d.success + d.failed + d.partial),
      1,
    );
  }, [history]);

  return (
    <div className="space-y-2">
      {/* Chart bars */}
      <div className="flex items-end gap-1.5 h-20">
        {history.map((day, i) => {
          const total = day.success + day.failed + day.partial;
          const heightPct = (total / maxTotal) * 100;
          const successPct = total > 0 ? (day.success / total) * 100 : 0;
          const failedPct = total > 0 ? (day.failed / total) * 100 : 0;

          return (
            <motion.div
              key={day.date}
              className="flex-1 flex flex-col items-center gap-1"
              initial={{ opacity: 0, scaleY: 0 }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              style={{ transformOrigin: "bottom" }}
            >
              {/* Stacked bar */}
              <div
                className="w-full rounded-sm overflow-hidden flex flex-col-reverse"
                style={{ height: `${Math.max(heightPct, 4)}%` }}
                title={`${day.dayLabel}: ${day.success} ok, ${day.failed} falliti, ${day.partial} parziali`}
              >
                {/* Success (bottom) */}
                <div
                  style={{
                    height: `${successPct}%`,
                    background: "#4ECDC4",
                    minHeight: day.success > 0 ? "2px" : "0",
                  }}
                />
                {/* Failed (middle) */}
                <div
                  style={{
                    height: `${failedPct}%`,
                    background: "#FF6B6B",
                    minHeight: day.failed > 0 ? "2px" : "0",
                  }}
                />
                {/* Partial (top) */}
                <div
                  style={{
                    height: `${100 - successPct - failedPct}%`,
                    background: "#6B7280",
                    minHeight: day.partial > 0 ? "2px" : "0",
                  }}
                />
              </div>

              {/* Day label — bumped from fg-invisible to fg-faint for WCAG AA contrast */}
              <span
                className="text-[9px] font-mono"
                style={{ color: "var(--fg-faint)" }}
              >
                {day.dayLabel}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 justify-center">
        <LegendDot color="#4ECDC4" label="Successo" />
        <LegendDot color="#FF6B6B" label="Fallito" />
        <LegendDot color="#6B7280" label="Parziale" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-2 h-2 rounded-full"
        style={{ background: color }}
        aria-hidden="true"
      />
      <span className="text-[10px]" style={{ color: "var(--fg-secondary)" }}>
        {label}
      </span>
    </div>
  );
}

function ErrorLog({
  errors,
  connectors,
}: {
  errors: SyncError[];
  connectors: ConnectorStatus[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [expandedError, setExpandedError] = useState<string | null>(null);

  const sourceOptions = useMemo(() => {
    const ids = new Set(errors.map((e) => e.sourceId));
    return connectors.filter((c) => ids.has(c.id));
  }, [errors, connectors]);

  const filtered = useMemo(() => {
    if (filter === "all") return errors;
    return errors.filter((e) => e.sourceId === filter);
  }, [errors, filter]);

  if (errors.length === 0) return null;

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{
        background: "var(--bg-raised)",
        borderColor: "var(--border-dark-subtle)",
      }}
    >
      {/* Toggle header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-controls="error-log-content"
        aria-label={`Log errori — ${errors.filter((e) => !e.resolved).length} aperti. ${expanded ? "Comprimi" : "Espandi"}`}
        className="w-full px-4 py-3 flex items-center gap-2 transition-colors focus:outline-2 focus:outline-offset-[-2px] focus:outline-[var(--accent)]"
        style={{ color: "var(--fg-primary)" }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--bg-overlay)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "transparent")
        }
      >
        <AlertTriangle
          className="w-3.5 h-3.5 shrink-0"
          style={{ color: "#FF6B6B" }}
          aria-hidden="true"
        />
        <span className="text-xs font-semibold uppercase tracking-wider flex-1 text-left">
          Log Errori
        </span>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded"
          style={{
            background: "rgba(255, 107, 107, 0.1)",
            color: "#FF6B6B",
          }}
          aria-hidden="true"
        >
          {errors.filter((e) => !e.resolved).length} aperti
        </span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          style={{ color: "var(--fg-invisible)" }}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            id="error-log-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Filter bar */}
            <div
              className="px-4 py-2 flex items-center gap-2"
              style={{
                borderTop: "1px solid var(--border-dark-subtle)",
                borderBottom: "1px solid var(--border-dark-subtle)",
              }}
            >
              <Filter
                className="w-3 h-3"
                style={{ color: "var(--fg-invisible)" }}
                aria-hidden="true"
              />
              <label htmlFor="error-log-filter" className="sr-only">Filtra per connettore</label>
              <select
                id="error-log-filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="text-xs bg-transparent border-none outline-none cursor-pointer focus:ring-1 focus:ring-[var(--accent)]"
                style={{ color: "var(--fg-secondary)" }}
              >
                <option value="all">Tutti i connettori</option>
                {sourceOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Error rows */}
            <div className="max-h-64 overflow-y-auto">
              {filtered.map((err) => {
                const sev = SEVERITY_STYLES[err.severity] ?? SEVERITY_STYLES.info;
                const isOpen = expandedError === err.id;

                return (
                  <div
                    key={err.id}
                    className="border-b last:border-b-0"
                    style={{ borderColor: "var(--border-dark-subtle)" }}
                  >
                    <button
                      onClick={() =>
                        setExpandedError(isOpen ? null : err.id)
                      }
                      aria-expanded={err.details ? isOpen : undefined}
                      aria-label={`${err.severity === "error" ? "Errore" : err.severity === "warning" ? "Attenzione" : "Info"}: ${err.message} — ${err.sourceName}${err.resolved ? " (risolto)" : ""}`}
                      className="w-full px-4 py-2 flex items-start gap-2.5 text-left transition-colors focus:outline-2 focus:outline-offset-[-2px] focus:outline-[var(--accent)]"
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "var(--bg-overlay)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${sev.dot}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-xs font-mono"
                            style={{ color: "var(--fg-invisible)" }}
                          >
                            {formatTimestamp(err.timestamp)}
                          </span>
                          <span
                            className="text-xs font-semibold uppercase px-1.5 py-0.5 rounded"
                            style={{
                              background: "var(--bg-overlay)",
                              color: "var(--fg-secondary)",
                              fontSize: "9px",
                            }}
                          >
                            {err.sourceName}
                          </span>
                          {err.resolved && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{
                                background: "rgba(78, 205, 196, 0.1)",
                                color: "#4ECDC4",
                                fontSize: "9px",
                              }}
                            >
                              risolto
                            </span>
                          )}
                        </div>
                        <p
                          className={`text-xs mt-0.5 ${sev.text}`}
                        >
                          {err.message}
                        </p>
                      </div>
                      {err.details && (
                        <ChevronDown
                          className={`w-3 h-3 shrink-0 mt-1 transition-transform ${isOpen ? "rotate-180" : ""}`}
                          style={{ color: "var(--fg-invisible)" }}
                        />
                      )}
                    </button>

                    {/* Expanded details */}
                    <AnimatePresence>
                      {isOpen && err.details && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div
                            className="px-4 pb-3 pt-0 ml-4"
                          >
                            <pre
                              className="text-xs font-mono whitespace-pre-wrap rounded p-2"
                              style={{
                                background: "var(--bg-base)",
                                color: "var(--fg-secondary)",
                                border: "1px solid var(--border-dark-subtle)",
                              }}
                            >
                              {err.details}
                            </pre>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function IntegrationHealthPanel() {
  const [data, setData] = useState<IntegrationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ id: string; type: string } | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ops/integration/status", {
        headers: getConsoleAuthHeaders(),
      });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Non autorizzato");
        throw new Error(`HTTP ${res.status}`);
      }
      const json: IntegrationData = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ── Quick action handlers ───────────────────────────────────────────────────

  const handleRetry = useCallback(async (connectorId: string) => {
    setActionFeedback({ id: connectorId, type: "retry" });
    try {
      const res = await fetch(`/api/ops/integration/${connectorId}/retry`, {
        method: "POST",
        headers: {
          ...getConsoleAuthHeaders(),
          "Content-Type": "application/json",
          "x-csrf-token": "1",
        },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        console.log(`[IntegrationHealth] Retry queued for ${connectorId}:`, json);
        setActionFeedback({ id: connectorId, type: "retry-ok" });
      } else {
        console.error(`[IntegrationHealth] Retry failed for ${connectorId}:`, json.error);
        setActionFeedback({ id: connectorId, type: "retry-error" });
      }
    } catch (err) {
      console.error(`[IntegrationHealth] Retry error for ${connectorId}:`, err);
      setActionFeedback({ id: connectorId, type: "retry-error" });
    }
    setTimeout(() => setActionFeedback(null), 3000);
  }, []);

  const handlePause = useCallback(async (connectorId: string) => {
    setActionFeedback({ id: connectorId, type: "pause" });
    try {
      const res = await fetch(`/api/ops/integration/${connectorId}/pause`, {
        method: "POST",
        headers: {
          ...getConsoleAuthHeaders(),
          "Content-Type": "application/json",
          "x-csrf-token": "1",
        },
        body: JSON.stringify({ action: "pause" }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        console.log(`[IntegrationHealth] Pause confirmed for ${connectorId}:`, json);
        setActionFeedback({ id: connectorId, type: "pause-ok" });
        // Refresh data to reflect new state
        setTimeout(() => fetchData(true), 1000);
      } else {
        console.error(`[IntegrationHealth] Pause failed for ${connectorId}:`, json.error);
        setActionFeedback({ id: connectorId, type: "pause-error" });
      }
    } catch (err) {
      console.error(`[IntegrationHealth] Pause error for ${connectorId}:`, err);
      setActionFeedback({ id: connectorId, type: "pause-error" });
    }
    setTimeout(() => setActionFeedback(null), 3000);
  }, [fetchData]);

  const handleViewLogs = useCallback((connectorId: string) => {
    setActionFeedback({ id: connectorId, type: "logs" });
    // Scroll to error log section and auto-filter by this connector
    const errorLogSection = document.querySelector("[data-error-log]");
    if (errorLogSection) {
      errorLogSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    console.log(`[IntegrationHealth] View logs for: ${connectorId}`);
    setTimeout(() => setActionFeedback(null), 2000);
  }, []);

  // ── Computed health score (0-100) ─────────────────────────────────────────

  const healthScore = useMemo(() => {
    if (!data) return null;
    const { totalConnectors, healthy, warning, error: errCount, unknown } = data.summary;
    if (totalConnectors === 0) return null;
    // Weights: healthy=100, warning=50, error=0, unknown=25
    const score = Math.round(
      ((healthy * 100 + warning * 50 + unknown * 25 + errCount * 0) / (totalConnectors * 100)) * 100
    );
    return score;
  }, [data]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 60s
  useEffect(() => {
    const iv = setInterval(() => fetchData(true), 60_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <RefreshCw
            className="w-4 h-4 animate-spin"
            style={{ color: "var(--fg-invisible)" }}
          />
          <span className="text-xs" style={{ color: "var(--fg-secondary)" }}>
            Caricamento stato connettori...
          </span>
        </div>
        {/* Skeleton cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-36 rounded-lg animate-pulse"
              style={{ background: "var(--bg-overlay)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (error && !data) {
    return (
      <div
        className="rounded-lg p-4 text-center"
        style={{
          background: "rgba(255, 107, 107, 0.08)",
          border: "1px solid rgba(255, 107, 107, 0.2)",
        }}
      >
        <XCircle className="w-5 h-5 mx-auto mb-2" style={{ color: "#FF6B6B" }} />
        <p className="text-xs" style={{ color: "#FF6B6B" }}>
          {error}
        </p>
        <button
          onClick={() => fetchData()}
          className="text-xs underline mt-2"
          style={{ color: "var(--fg-secondary)" }}
        >
          Riprova
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Database
            className="w-4 h-4"
            style={{ color: "var(--accent)" }}
          />
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--fg-primary)" }}
          >
            Salute Integrazioni
          </h3>
        </div>

        {/* Overall health score */}
        {healthScore !== null && (
          <HealthScoreBadge score={healthScore} />
        )}

        {/* Summary pills */}
        <div className="flex items-center gap-1.5">
          {data.summary.healthy > 0 && (
            <SummaryPill
              count={data.summary.healthy}
              color="#4ECDC4"
              label="operativi"
            />
          )}
          {data.summary.warning > 0 && (
            <SummaryPill
              count={data.summary.warning}
              color="#FFC832"
              label="attenzione"
            />
          )}
          {data.summary.error > 0 && (
            <SummaryPill
              count={data.summary.error}
              color="#FF6B6B"
              label="errore"
            />
          )}
        </div>

        <div className="flex-1" />

        {/* Total articles */}
        <span
          className="text-xs font-mono hidden sm:block"
          style={{ color: "var(--fg-secondary)" }}
        >
          {data.summary.totalArticles.toLocaleString("it-IT")} articoli totali
        </span>

        {/* Refresh button */}
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs transition-all disabled:opacity-40"
          style={{
            background: "var(--bg-overlay)",
            color: "var(--fg-secondary)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--border-dark)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "var(--bg-overlay)")
          }
        >
          <RefreshCw
            className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`}
          />
          Aggiorna
        </button>
      </div>

      {/* ── Action feedback toast ─────────────────────────────────────────── */}
      <AnimatePresence>
        {actionFeedback && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium"
            style={{
              background: "var(--bg-overlay)",
              border: "1px solid var(--border-dark-subtle)",
              color: "var(--fg-secondary)",
            }}
          >
            {actionFeedback.type === "retry" && (
              <>
                <RotateCcw className="w-3 h-3 animate-spin" style={{ color: "var(--accent)" }} />
                Invio richiesta di sync per {actionFeedback.id}...
              </>
            )}
            {actionFeedback.type === "retry-ok" && (
              <>
                <CheckCircle className="w-3 h-3" style={{ color: "#4ECDC4" }} />
                Sincronizzazione accodata per {actionFeedback.id}
              </>
            )}
            {actionFeedback.type === "retry-error" && (
              <>
                <XCircle className="w-3 h-3" style={{ color: "#FF6B6B" }} />
                Errore nell&apos;accodamento del retry per {actionFeedback.id}
              </>
            )}
            {actionFeedback.type === "pause" && (
              <>
                <Pause className="w-3 h-3" style={{ color: "#FFC832" }} />
                Messa in pausa di {actionFeedback.id}...
              </>
            )}
            {actionFeedback.type === "pause-ok" && (
              <>
                <CheckCircle className="w-3 h-3" style={{ color: "#4ECDC4" }} />
                Connettore {actionFeedback.id} messo in pausa
              </>
            )}
            {actionFeedback.type === "pause-error" && (
              <>
                <XCircle className="w-3 h-3" style={{ color: "#FF6B6B" }} />
                Errore nella pausa di {actionFeedback.id}
              </>
            )}
            {actionFeedback.type === "logs" && (
              <>
                <ScrollText className="w-3 h-3" style={{ color: "var(--info-bright)" }} />
                Apertura log per {actionFeedback.id}...
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Connector Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.connectors.map((connector, i) => (
          <ConnectorCard
            key={connector.id}
            connector={connector}
            index={i}
            onRetry={handleRetry}
            onPause={handlePause}
            onViewLogs={handleViewLogs}
            loadingAction={actionFeedback}
          />
        ))}
      </div>

      {/* ── Sync History ────────────────────────────────────────────────────── */}
      <div
        className="rounded-lg border p-4"
        style={{
          background: "var(--bg-raised)",
          borderColor: "var(--border-dark-subtle)",
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Activity
            className="w-3.5 h-3.5"
            style={{ color: "var(--fg-invisible)" }}
          />
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--fg-secondary)" }}
          >
            Storico Sync (7 giorni)
          </span>
        </div>
        <SyncHistoryChart history={data.syncHistory} />
      </div>

      {/* ── Error Log ───────────────────────────────────────────────────────── */}
      <div data-error-log>
        <ErrorLog errors={data.errors} connectors={data.connectors} />
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      {data.summary.lastGlobalSync && (
        <div className="flex items-center gap-2 justify-center">
          <Clock
            className="w-3 h-3"
            style={{ color: "var(--fg-invisible)" }}
          />
          <span
            className="text-xs"
            style={{ color: "var(--fg-invisible)" }}
          >
            Ultimo sync globale: {formatTimeAgo(data.summary.lastGlobalSync)} | Aggiornamento automatico ogni 60s
          </span>
        </div>
      )}
    </div>
  );
}

function HealthScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "#4ECDC4"
      : score >= 50
        ? "#FFC832"
        : "#FF6B6B";
  const label =
    score >= 80
      ? "Buona"
      : score >= 50
        ? "Attenzione"
        : "Critica";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
      style={{
        background: `${color}12`,
        border: `1px solid ${color}25`,
      }}
    >
      <Heart className="w-3 h-3" style={{ color }} />
      <span
        className="text-xs font-bold font-mono"
        style={{ color }}
      >
        {score}%
      </span>
      <span
        className="text-[10px] font-medium"
        style={{ color: "var(--fg-secondary)" }}
      >
        {label}
      </span>
    </motion.div>
  );
}

function SummaryPill({
  count,
  color,
  label,
}: {
  count: number;
  color: string;
  label: string;
}) {
  return (
    <span
      className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
      style={{
        background: `${color}15`,
        color,
        border: `1px solid ${color}30`,
      }}
    >
      {count} {label}
    </span>
  );
}
