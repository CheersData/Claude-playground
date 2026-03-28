"use client";

import { useState } from "react";
import { Zap, ChevronDown, ChevronUp } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type DirectiveMode = "smaltimento" | "audit_in_progress" | "plenaria" | "misto";

interface CmeDirective {
  mode: DirectiveMode;
  reason?: string;
  priority?: string[];
  tasks?: string[];
}

interface DaemonBannerProps {
  directive: CmeDirective | null | undefined;
}

// ─── Mode config ─────────────────────────────────────────────────────────────

const MODE_CONFIG: Record<
  DirectiveMode,
  { label: string; color: string; bg: string; border: string }
> = {
  smaltimento: {
    label: "Smaltimento",
    color: "#4ECDC4",
    bg: "rgba(78,205,196,0.06)",
    border: "rgba(78,205,196,0.2)",
  },
  audit_in_progress: {
    label: "Audit In Progress",
    color: "#A78BFA",
    bg: "rgba(167,139,250,0.06)",
    border: "rgba(167,139,250,0.2)",
  },
  plenaria: {
    label: "Plenaria",
    color: "#FFC832",
    bg: "rgba(255,200,50,0.06)",
    border: "rgba(255,200,50,0.2)",
  },
  misto: {
    label: "Misto",
    color: "#FF6B35",
    bg: "rgba(255,107,53,0.06)",
    border: "rgba(255,107,53,0.2)",
  },
};

// ─── Component ──────────────────────────────────────────────────────────────

export function DaemonBanner({ directive }: DaemonBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (!directive) return null;

  const mode = directive.mode ?? "smaltimento";
  const cfg = MODE_CONFIG[mode] ?? MODE_CONFIG.smaltimento;
  const hasTasks = directive.tasks && directive.tasks.length > 0;

  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: cfg.color }} />
          <div className="min-w-0">
            {/* Mode badge + reason */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  background: `${cfg.color}20`,
                  color: cfg.color,
                }}
              >
                {cfg.label}
              </span>
              {directive.reason && (
                <span className="text-xs" style={{ color: "var(--fg-secondary)" }}>
                  {directive.reason}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Expand toggle — only if there are task details */}
        {hasTasks && (
          <button
            onClick={() => setExpanded((p) => !p)}
            className="shrink-0 p-0.5 rounded transition-opacity opacity-60 hover:opacity-100"
            style={{ color: cfg.color }}
            aria-label={expanded ? "Comprimi" : "Espandi"}
          >
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Expanded: priority list + tasks */}
      {expanded && hasTasks && (
        <div className="mt-3 space-y-1 pl-5">
          {directive.priority && directive.priority.length > 0 && (
            <div className="text-xs mb-2" style={{ color: "var(--fg-invisible)" }}>
              Priorità: {directive.priority.join(", ")}
            </div>
          )}
          {directive.tasks!.map((t, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs" style={{ color: "var(--fg-secondary)" }}>
              <span style={{ color: cfg.color }}>→</span>
              <span>{t}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
