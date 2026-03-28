"use client";

import { useState } from "react";
import { AlertTriangle, AlertOctagon, ChevronDown, ChevronUp } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DaemonSignal {
  deptId: string;
  sourceId: string;
  title: string;
  description?: string;
  priority: "low" | "medium" | "high" | "critical";
  routing?: string;
  requiresHuman?: boolean;
}

interface SignalsListProps {
  signals: DaemonSignal[] | null | undefined;
}

// ─── Priority config ─────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  critical: {
    label: "Critico",
    color: "var(--error)",
    bg: "rgba(229,141,120,0.08)",
    border: "rgba(229,141,120,0.15)",
    icon: AlertOctagon,
  },
  high: {
    label: "Alto",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.08)",
    border: "rgba(245,158,11,0.15)",
    icon: AlertTriangle,
  },
  medium: {
    label: "Medio",
    color: "#60A5FA",
    bg: "rgba(96,165,250,0.08)",
    border: "rgba(96,165,250,0.15)",
    icon: AlertTriangle,
  },
  low: {
    label: "Basso",
    color: "var(--fg-invisible)",
    bg: "transparent",
    border: "var(--border-dark-subtle)",
    icon: AlertTriangle,
  },
};

const DEPT_LABELS: Record<string, string> = {
  "ufficio-legale": "Legale",
  "data-engineering": "Data",
  "quality-assurance": "QA",
  architecture: "Arch",
  finance: "Finance",
  operations: "Ops",
  security: "Security",
  strategy: "Strategy",
  marketing: "Marketing",
  trading: "Trading",
  integration: "Integr.",
  music: "Musica",
  protocols: "Protoc.",
  "ux-ui": "UX/UI",
  acceleration: "Accel.",
};

// ─── Signal item ─────────────────────────────────────────────────────────────

function SignalItem({ signal }: { signal: DaemonSignal }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = PRIORITY_CONFIG[signal.priority] ?? PRIORITY_CONFIG.low;
  const Icon = cfg.icon;
  const deptLabel = DEPT_LABELS[signal.deptId] ?? signal.deptId;
  const hasDescription = signal.description && signal.description !== signal.title;

  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <div className="flex items-start gap-2">
        <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: cfg.color }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`text-xs leading-snug ${expanded ? "" : "line-clamp-2"}`}
              style={{ color: "var(--fg-secondary)" }}
            >
              {signal.title}
            </p>
            {hasDescription && (
              <button
                onClick={() => setExpanded((p) => !p)}
                className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                style={{ color: "var(--fg-secondary)" }}
              >
                {expanded ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            )}
          </div>
          {expanded && hasDescription && (
            <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "var(--fg-invisible)" }}>
              {signal.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            {/* Priority badge */}
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: `${cfg.color}18`, color: cfg.color }}
            >
              {cfg.label}
            </span>
            {/* Dept tag */}
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                background: "var(--bg-overlay)",
                color: "var(--fg-invisible)",
              }}
            >
              {deptLabel}
            </span>
            {signal.requiresHuman && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  background: "rgba(255,107,53,0.1)",
                  color: "var(--accent)",
                }}
              >
                Human
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function SignalsList({ signals }: SignalsListProps) {
  const [showAll, setShowAll] = useState(false);

  // Filter to high/critical by default, show all when expanded
  const filtered = (signals ?? []).filter(
    (s) => s.priority === "critical" || s.priority === "high"
  );
  const all = signals ?? [];
  const displayList = showAll ? all : filtered;
  const hasMore = !showAll && all.length > filtered.length;

  if (all.length === 0) {
    return (
      <div
        className="rounded-xl p-5 flex flex-col gap-2"
        style={{
          background: "var(--bg-raised)",
          border: "1px solid var(--border-dark-subtle)",
        }}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
          style={{ color: "var(--fg-secondary)" }}
        >
          <AlertTriangle className="w-4 h-4" />
          Segnali
        </h3>
        <p className="text-sm" style={{ color: "var(--fg-invisible)" }}>
          Nessun segnale attivo.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3"
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dark-subtle)",
      }}
    >
      <div className="flex items-center justify-between">
        <h3
          className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
          style={{ color: "var(--fg-secondary)" }}
        >
          <AlertTriangle className="w-4 h-4" />
          Segnali
          {filtered.length > 0 && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{
                background: "rgba(245,158,11,0.12)",
                color: "#f59e0b",
              }}
            >
              {filtered.length} critici/alti
            </span>
          )}
        </h3>
        <span className="text-[10px]" style={{ color: "var(--fg-invisible)" }}>
          {all.length} totali
        </span>
      </div>

      <div className="space-y-2">
        {displayList.map((signal) => (
          <SignalItem key={signal.sourceId} signal={signal} />
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setShowAll(true)}
          className="text-xs py-1.5 rounded-lg transition-colors"
          style={{
            color: "var(--fg-secondary)",
            background: "var(--bg-overlay)",
          }}
        >
          Mostra tutti ({all.length - filtered.length} segnali minori)
        </button>
      )}
      {showAll && all.length > filtered.length && (
        <button
          onClick={() => setShowAll(false)}
          className="text-xs py-1.5 rounded-lg transition-colors"
          style={{
            color: "var(--fg-secondary)",
            background: "var(--bg-overlay)",
          }}
        >
          Mostra solo critici/alti
        </button>
      )}
    </div>
  );
}
