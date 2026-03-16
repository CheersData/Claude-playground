"use client";

/**
 * SyncHistory — Recent sync activity table with status badges.
 *
 * Columns: Connettore, Data, Stato, Elementi, Durata
 * Status badges: success (green), partial (yellow), error (red), running (blue pulse)
 *
 * Design: Poimandres dark theme.
 */

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  Filter,
} from "lucide-react";

// ─── Types ───

export type SyncResultStatus = "success" | "partial" | "error" | "running";

export interface SyncHistoryEntry {
  id: string;
  connector: string;
  connectorIcon?: string;
  timestamp: string;
  status: SyncResultStatus;
  recordsSynced: number;
  recordsFailed: number;
  duration: number; // milliseconds
  errorMessage?: string;
  details?: string;
}

interface SyncHistoryProps {
  entries: SyncHistoryEntry[];
  loading?: boolean;
  maxVisible?: number;
}

// ─── Constants ───

const STATUS_CONFIG: Record<
  SyncResultStatus,
  { label: string; color: string; bgColor: string; Icon: typeof CheckCircle }
> = {
  success: {
    label: "Completato",
    color: "var(--success)",
    bgColor: "rgba(93, 228, 199, 0.1)",
    Icon: CheckCircle,
  },
  partial: {
    label: "Parziale",
    color: "var(--caution)",
    bgColor: "rgba(255, 250, 194, 0.1)",
    Icon: AlertTriangle,
  },
  error: {
    label: "Errore",
    color: "var(--error)",
    bgColor: "rgba(229, 141, 120, 0.1)",
    Icon: XCircle,
  },
  running: {
    label: "In corso",
    color: "var(--info-bright)",
    bgColor: "rgba(137, 221, 255, 0.1)",
    Icon: Loader2,
  },
};

// ─── Helpers ───

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) {
    const diffMins = Math.floor(diffMs / (1000 * 60));
    return `${diffMins}min fa`;
  }
  if (diffHours < 24) return `${diffHours}h fa`;

  return d.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Component ───

export default function SyncHistory({ entries, loading = false, maxVisible = 10 }: SyncHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<SyncResultStatus | "all">("all");
  const [showAll, setShowAll] = useState(false);

  // Filter
  const filteredEntries = useMemo(() => {
    if (filterStatus === "all") return entries;
    return entries.filter((e) => e.status === filterStatus);
  }, [entries, filterStatus]);

  // Paginate
  const visibleEntries = useMemo(() => {
    if (showAll) return filteredEntries;
    return filteredEntries.slice(0, maxVisible);
  }, [filteredEntries, showAll, maxVisible]);

  const hasMore = filteredEntries.length > maxVisible;

  // Status counts for filter badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: entries.length };
    for (const e of entries) {
      counts[e.status] = (counts[e.status] || 0) + 1;
    }
    return counts;
  }, [entries]);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 shrink-0" style={{ color: "var(--fg-muted)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>
            Attivita recente
          </h3>
          <span className="text-xs" style={{ color: "var(--fg-invisible)" }}>
            ({filteredEntries.length})
          </span>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <Filter className="w-3.5 h-3.5" style={{ color: "var(--fg-invisible)" }} />
          {(["all", "success", "partial", "error", "running"] as const).map((status) => {
            const isActive = filterStatus === status;
            const count = statusCounts[status] || 0;
            if (status !== "all" && count === 0) return null;

            const label =
              status === "all"
                ? "Tutti"
                : STATUS_CONFIG[status].label;

            return (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
                style={{
                  background: isActive ? "rgba(255, 107, 53, 0.15)" : "var(--bg-overlay)",
                  color: isActive ? "var(--accent)" : "var(--fg-muted)",
                  border: isActive ? "1px solid rgba(255, 107, 53, 0.3)" : "1px solid transparent",
                }}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--bg-raised)",
          border: "1px solid var(--border-dark-subtle)",
        }}
      >
        {/* Table header */}
        <div
          className="hidden md:grid grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr] gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-wider"
          style={{
            color: "var(--fg-invisible)",
            borderBottom: "1px solid var(--border-dark-subtle)",
          }}
        >
          <span>Connettore</span>
          <span>Data</span>
          <span>Stato</span>
          <span>Elementi</span>
          <span>Durata</span>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 rounded-lg animate-pulse"
                style={{ background: "var(--bg-overlay)" }}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filteredEntries.length === 0 && (
          <div className="text-center py-12">
            <Database className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--fg-muted)" }} />
            <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
              Nessuna attivita di sincronizzazione
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--fg-muted)" }}>
              {filterStatus !== "all"
                ? "Prova a cambiare il filtro"
                : "Le sincronizzazioni appariranno qui una volta avviate"}
            </p>
          </div>
        )}

        {/* Rows */}
        {!loading && visibleEntries.length > 0 && (
          <div>
            {visibleEntries.map((entry, i) => {
              const statusConfig = STATUS_CONFIG[entry.status];
              const StatusIcon = statusConfig.Icon;
              const isExpanded = expandedId === entry.id;
              const isLast = i === visibleEntries.length - 1;

              return (
                <div key={entry.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className="w-full text-left grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr] gap-2 md:gap-4 px-5 py-3.5 transition-colors hover-bg-hover"
                    style={{
                      borderBottom: isLast && !isExpanded ? "none" : "1px solid var(--border-dark-subtle)",
                    }}
                    aria-expanded={isExpanded}
                  >
                    {/* Connector name */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
                        {entry.connector}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 md:hidden" style={{ color: "var(--fg-muted)" }} />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 md:hidden" style={{ color: "var(--fg-muted)" }} />
                      )}
                    </div>

                    {/* Timestamp */}
                    <span className="text-sm" style={{ color: "var(--fg-muted)" }}>
                      {formatTimestamp(entry.timestamp)}
                    </span>

                    {/* Status badge */}
                    <div className="flex items-center gap-1.5">
                      <StatusIcon
                        className={`w-3.5 h-3.5 shrink-0 ${entry.status === "running" ? "animate-spin" : ""}`}
                        style={{ color: statusConfig.color }}
                      />
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          background: statusConfig.bgColor,
                          color: statusConfig.color,
                        }}
                      >
                        {statusConfig.label}
                      </span>
                    </div>

                    {/* Records */}
                    <div className="flex items-center gap-1.5 text-sm">
                      <span style={{ color: "var(--info-bright)" }}>
                        {entry.recordsSynced.toLocaleString("it-IT")}
                      </span>
                      {entry.recordsFailed > 0 && (
                        <>
                          <span style={{ color: "var(--fg-invisible)" }}>/</span>
                          <span style={{ color: "var(--error)" }}>
                            {entry.recordsFailed} falliti
                          </span>
                        </>
                      )}
                    </div>

                    {/* Duration */}
                    <span className="text-sm" style={{ color: "var(--fg-muted)" }}>
                      {entry.status === "running" ? "..." : formatDuration(entry.duration)}
                    </span>
                  </button>

                  {/* Expanded detail */}
                  <AnimatePresence>
                    {isExpanded && entry.errorMessage && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div
                          className="px-5 py-3 ml-5"
                          style={{ borderBottom: isLast ? "none" : "1px solid var(--border-dark-subtle)" }}
                        >
                          <div
                            className="rounded-lg p-3 text-sm"
                            style={{
                              background: statusConfig.bgColor,
                              border: `1px solid ${statusConfig.color}20`,
                            }}
                          >
                            <p style={{ color: statusConfig.color }}>{entry.errorMessage}</p>
                            {entry.details && (
                              <pre
                                className="text-xs font-mono mt-2 p-2 rounded overflow-x-auto"
                                style={{ background: "var(--bg-base)", color: "var(--fg-muted)" }}
                              >
                                {entry.details}
                              </pre>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}

        {/* Show more */}
        {!loading && hasMore && !showAll && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full px-5 py-3 text-sm font-medium transition-colors text-center hover-bg-hover"
            style={{
              color: "var(--info)",
              borderTop: "1px solid var(--border-dark-subtle)",
            }}
          >
            Mostra tutti ({filteredEntries.length - maxVisible} altri)
          </button>
        )}
      </div>
    </div>
  );
}
