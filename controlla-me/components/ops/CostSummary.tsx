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
}

export function CostSummary({ costs }: CostSummaryProps) {
  return (
    <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
      <h3 className="text-sm font-semibold text-zinc-400 flex items-center gap-2 mb-3">
        <DollarSign className="w-4 h-4" />
        COSTS (7 days)
      </h3>

      {!costs ? (
        <p className="text-zinc-500 text-sm">Caricamento...</p>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-2xl font-bold text-white">
              ${costs.total.toFixed(2)}
            </div>
            <div className="text-xs text-zinc-500">
              {costs.calls} calls &middot; ${costs.avgPerCall.toFixed(4)}/call
            </div>
          </div>

          <div className="space-y-1.5">
            {Object.entries(costs.byProvider)
              .sort(([, a], [, b]) => b.cost - a.cost)
              .map(([provider, info]) => (
                <div key={provider} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400 capitalize">{provider}</span>
                  <span className="text-white">${info.cost.toFixed(2)}</span>
                </div>
              ))}
          </div>

          <div className="pt-2 border-t border-zinc-800">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Fallback rate</span>
              <span className={costs.fallbackRate > 0.3 ? "text-red-400" : "text-green-400"}>
                {(costs.fallbackRate * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
