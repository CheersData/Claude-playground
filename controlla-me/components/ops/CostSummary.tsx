"use client";

import { DollarSign } from "lucide-react";

interface CostSummaryProps {
  costs: {
    total: number;
    calls: number;
    avgPerCall: number;
    byProvider: Record<string, { cost: number; calls: number }>;
    fallbackRate: number;
  } | null;
  /** Time window in days. Shown in the header label. Defaults to 7. */
  days?: number;
}

function formatWindow(days: number): string {
  if (days === 1) return "24h";
  return `${days}d`;
}

export function CostSummary({ costs, days = 7 }: CostSummaryProps) {
  return (
    <div className="bg-[var(--bg-raised)] rounded-xl p-5 border border-[var(--border-dark-subtle)]">
      <h3 className="text-sm font-semibold text-[var(--fg-secondary)] flex items-center gap-2 mb-3">
        <DollarSign className="w-4 h-4" />
        COSTS ({formatWindow(days)})
      </h3>

      {!costs ? (
        <p className="text-[var(--fg-invisible)] text-sm">Caricamento...</p>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-2xl font-bold text-[var(--fg-primary)]">
              ${costs.total.toFixed(2)}
            </div>
            <div className="text-xs text-[var(--fg-invisible)]">
              {costs.calls} calls &middot; ${costs.avgPerCall.toFixed(4)}/call
            </div>
          </div>

          <div className="space-y-2">
            {Object.entries(costs.byProvider)
              .sort(([, a], [, b]) => b.cost - a.cost)
              .map(([provider, info]) => (
                <div key={provider} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--fg-secondary)] capitalize">{provider}</span>
                  <span className="text-[var(--fg-primary)]">${info.cost.toFixed(2)}</span>
                </div>
              ))}
          </div>

          <div className="pt-2 border-t border-[var(--border-dark-subtle)]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--fg-invisible)]">Fallback rate</span>
              <span className={costs.fallbackRate > 0.3 ? "text-[var(--error)]" : "text-[var(--success)]"}>
                {(costs.fallbackRate * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
