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
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export function PipelineStatus({ pipeline }: PipelineStatusProps) {
  return (
    <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-400 flex items-center gap-2 mb-4">
        <Database className="w-4 h-4" />
        DATA PIPELINE
      </h3>

      {pipeline.length === 0 ? (
        <p className="text-zinc-500 text-sm">Nessun dato pipeline</p>
      ) : (
        <div className="space-y-2">
          {pipeline.slice(0, 8).map((source) => {
            const isOk = source.lastSync?.status === "completed";
            return (
              <div key={source.sourceId} className="flex items-center gap-3 text-sm">
                <span className={`w-2 h-2 rounded-full ${isOk ? "bg-green-500" : "bg-red-500"}`} />
                <span className="text-zinc-300 flex-1 truncate">
                  {source.sourceId}
                </span>
                <span className="text-xs text-zinc-500">
                  {source.lastSync?.itemsFetched ?? 0} art.
                </span>
                <span className="text-xs text-zinc-500">
                  {source.lastSync?.completedAt ? timeAgo(source.lastSync.completedAt) : "never"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
