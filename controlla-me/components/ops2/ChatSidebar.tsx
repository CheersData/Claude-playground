"use client";

import { ClipboardList, Zap, ChevronRight } from "lucide-react";
import type { TaskItem } from "@/components/ops/TaskModal";

// ─── Types ──────────────────────────────────────────────────────────────────

interface OpsData {
  board: {
    byStatus: Record<string, number>;
    recent: TaskItem[];
  };
}

type DirectiveMode = "smaltimento" | "audit_in_progress" | "plenaria" | "misto";

interface DaemonData {
  cmeDirective?: { mode: DirectiveMode; reason?: string };
}

interface ChatSidebarProps {
  data: OpsData | null;
  daemonData: DaemonData | null;
  onSelectTask: (task: TaskItem) => void;
}

// ─── Mode labels ─────────────────────────────────────────────────────────────

const MODE_LABELS: Record<DirectiveMode, { label: string; color: string }> = {
  smaltimento: { label: "Smaltimento", color: "#4ECDC4" },
  audit_in_progress: { label: "Audit", color: "#A78BFA" },
  plenaria: { label: "Plenaria", color: "#FFC832" },
  misto: { label: "Misto", color: "#FF6B35" },
};

const STATUS_COLORS: Record<string, string> = {
  open: "var(--info)",
  in_progress: "var(--identity-gold)",
  review: "#A78BFA",
  blocked: "var(--error)",
  done: "var(--success)",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function ChatSidebar({ data, daemonData, onSelectTask }: ChatSidebarProps) {
  const open = data?.board.byStatus?.open ?? 0;
  const inProgress = data?.board.byStatus?.in_progress ?? 0;
  const recentTasks = (data?.board.recent ?? []).slice(0, 5);
  const directive = daemonData?.cmeDirective;
  const modeConfig = directive ? MODE_LABELS[directive.mode] : null;

  return (
    <div
      className="w-56 shrink-0 flex flex-col gap-3 p-3 overflow-y-auto"
      style={{
        borderRight: "1px solid var(--border-dark-subtle)",
        background: "var(--bg-raised)",
      }}
    >
      {/* Daemon directive indicator */}
      {modeConfig && (
        <div
          className="rounded-lg px-3 py-2"
          style={{
            background: `${modeConfig.color}10`,
            border: `1px solid ${modeConfig.color}30`,
          }}
        >
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3" style={{ color: modeConfig.color }} />
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: modeConfig.color }}>
              {modeConfig.label}
            </span>
          </div>
          {directive?.reason && (
            <p className="mt-1 text-[10px] leading-snug line-clamp-2" style={{ color: "var(--fg-invisible)" }}>
              {directive.reason}
            </p>
          )}
        </div>
      )}

      {/* Mini task board counters */}
      <div
        className="rounded-lg px-3 py-2"
        style={{
          background: "var(--bg-overlay)",
          border: "1px solid var(--border-dark-subtle)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <ClipboardList className="w-3 h-3" style={{ color: "var(--fg-secondary)" }} />
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-secondary)" }}>
            Board
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: "rgba(96,165,250,0.15)", color: "var(--info)" }}
          >
            {open} open
          </span>
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: "rgba(255,200,50,0.12)", color: "var(--identity-gold)" }}
          >
            {inProgress} in corso
          </span>
        </div>
      </div>

      {/* Recent tasks */}
      {recentTasks.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: "var(--fg-invisible)" }}>
            Task recenti
          </p>
          <div className="space-y-1">
            {recentTasks.map((task) => (
              <button
                key={task.id}
                onClick={() => onSelectTask(task)}
                className="w-full flex items-start gap-2 px-2 py-1.5 rounded-lg text-left transition-colors group"
                style={{ color: "var(--fg-secondary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                  style={{ background: STATUS_COLORS[task.status] ?? "var(--fg-invisible)" }}
                />
                <span className="text-[11px] line-clamp-2 flex-1 leading-snug" style={{ color: "var(--fg-secondary)" }}>
                  {task.title}
                </span>
                <ChevronRight className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
