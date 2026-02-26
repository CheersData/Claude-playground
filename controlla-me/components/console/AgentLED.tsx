"use client";

import type { ConsolePhaseStatus } from "@/lib/types";

interface AgentLEDProps {
  status: ConsolePhaseStatus | "idle";
  label: string;
  summary?: string;
  timing?: number;
}

export default function AgentLED({ status, label, summary, timing }: AgentLEDProps) {
  const ledClass = {
    idle: "pipboy-led-idle",
    running: "pipboy-led-running",
    done: "pipboy-led-done",
    error: "pipboy-led-error",
    skipped: "pipboy-led-skipped",
  }[status];

  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <div className={`pipboy-led ${ledClass} mt-0.5`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-medium tracking-wide ${
              status === "idle" ? "text-[var(--pb-text-dim)] opacity-50" : ""
            } ${status === "error" ? "text-[var(--pb-red)]" : ""}`}
          >
            {label}
          </span>
          {timing != null && (
            <span className="text-[10px] text-[var(--pb-text-dim)]">
              {(timing / 1000).toFixed(1)}s
            </span>
          )}
        </div>
        {summary && status !== "idle" && (
          <p className="text-[10px] text-[var(--pb-text-dim)] truncate mt-0.5">
            {summary}
          </p>
        )}
      </div>
    </div>
  );
}
