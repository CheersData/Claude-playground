"use client";

import { Database } from "lucide-react";

interface PipelineStatusProps {
  pipeline: Array<{
    sourceId: string;
    lastSync: { completedAt: string | null; status: string; itemsFetched: number } | null;
    totalSyncs: number;
  }>;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 1) return "ora";
  if (mins < 60) return `${mins}m fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1g fa";
  return `${days}g fa`;
}

export function PipelineStatus({ pipeline }: PipelineStatusProps) {
  return (
    <div className="bg-[var(--ops-surface)] rounded-xl p-6 border border-[var(--ops-border-subtle)]">
      <h3 className="text-[11px] font-semibold text-[var(--ops-muted)] flex items-center gap-2 mb-4 uppercase tracking-wider">
        <Database className="w-4 h-4" />
        Data Pipeline
      </h3>

      {pipeline.length === 0 ? (
        <p className="text-[var(--ops-muted)] text-sm">Nessun dato pipeline</p>
      ) : (
        <div className="space-y-2">
          {pipeline.slice(0, 8).map((source) => {
            const isOk = source.lastSync?.status === "completed";
            return (
              <div key={source.sourceId} className="flex items-center gap-3 text-sm">
                <span className={`w-2 h-2 rounded-full ${isOk ? "bg-[var(--ops-teal)]" : "bg-[var(--ops-error)]"}`} />
                <span className="text-[var(--ops-fg-muted)] flex-1 truncate">
                  {source.sourceId}
                </span>
                <span className="text-xs text-[var(--ops-muted)] font-mono">
                  {source.lastSync?.itemsFetched ?? 0} art.
                </span>
                <span className="text-xs text-[var(--ops-muted)]">
                  {source.lastSync?.completedAt ? timeAgo(source.lastSync.completedAt) : "mai"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
