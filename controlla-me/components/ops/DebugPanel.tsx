"use client";

/**
 * DebugPanel — 2-column debug workspace.
 *
 * Left column  (w-72, scrollable): Tier & Agents config + Environment check
 * Right column (flex-1):           API Costs (compact, flex-none) + LiveConsolePanel (fills height)
 *
 * Always-open sections — no collapsible toggles.
 * Designed for h-full usage inside the /ops Debug workspace.
 */

import { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, RefreshCw, ChevronRight } from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";
import { LiveConsolePanel } from "@/components/ops/LiveConsolePanel";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChainModel {
  key: string;
  displayName: string;
  provider: string;
  available: boolean;
}

interface AgentTierInfo {
  chain: ChainModel[];
  activeIndex: number;
  activeModel: string;
  enabled: boolean;
}

interface TierData {
  current: string;
  agents: Record<string, AgentTierInfo>;
  estimatedCost: { perQuery: number; label: string };
}

interface EnvVars {
  vars: Record<string, boolean>;
}

interface CostsData {
  total: number;
  calls: number;
  avgPerCall: number;
  byAgent: Record<string, { cost: number; calls: number }>;
  byProvider: Record<string, { cost: number; calls: number }>;
  fallbackRate: number;
}

// ─── Left column sections ─────────────────────────────────────────────────────

function TierSection({ data }: { data: TierData | null }) {
  if (!data) return null;

  const tierColor: Record<string, string> = {
    intern: "text-emerald-400",
    associate: "text-amber-400",
    partner: "text-blue-400",
  };

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          Tier & Agenti
        </h3>
        <span className={`text-xs font-bold uppercase ${tierColor[data.current] ?? "text-white"}`}>
          {data.current}
          <span className="ml-1.5 text-[10px] font-normal text-zinc-500 normal-case">
            {data.estimatedCost.label}/q
          </span>
        </span>
      </div>

      {/* Agents table */}
      <div className="rounded border border-zinc-700/50 overflow-hidden">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-zinc-700/50 bg-zinc-800/50">
              <th className="text-left px-2 py-1.5 text-zinc-400 font-medium">Agente</th>
              <th className="text-center px-2 py-1.5 text-zinc-400 font-medium">On</th>
              <th className="text-left px-2 py-1.5 text-zinc-400 font-medium">Modello attivo</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.agents).map(([name, info]) => (
              <tr key={name} className="border-b border-zinc-800/80 last:border-0">
                <td className="px-2 py-1.5 font-mono text-zinc-200 truncate max-w-[80px]">{name}</td>
                <td className="px-2 py-1.5 text-center">
                  {info.enabled ? (
                    <CheckCircle className="w-3 h-3 text-emerald-400 mx-auto" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-400 mx-auto" />
                  )}
                </td>
                <td className="px-2 py-1.5 font-mono text-[#FF6B35] truncate max-w-[110px]">
                  {info.chain[info.activeIndex]?.displayName ?? info.activeModel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Fallback chains — collapsible via HTML details */}
      <details className="group">
        <summary className="flex items-center gap-1 text-[10px] text-zinc-500 cursor-pointer select-none hover:text-zinc-400 transition-colors list-none">
          <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform shrink-0" />
          Catene fallback
        </summary>
        <div className="mt-2 space-y-2 pl-1">
          {Object.entries(data.agents).map(([name, info]) => (
            <div key={name}>
              <div className="text-[10px] text-zinc-500 font-mono mb-1">{name}</div>
              <div className="flex flex-wrap gap-1">
                {info.chain.map((m, i) => (
                  <span
                    key={m.key}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                      i === info.activeIndex
                        ? "bg-[#FF6B35]/20 text-[#FF6B35] ring-1 ring-[#FF6B35]/40"
                        : m.available
                        ? "bg-zinc-700/50 text-zinc-300"
                        : "bg-zinc-800 text-zinc-500 line-through"
                    }`}
                  >
                    {m.displayName}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function EnvSection({ data }: { data: EnvVars | null }) {
  if (!data) return null;

  const groups = [
    {
      label: "AI Providers",
      keys: [
        "ANTHROPIC_API_KEY",
        "GEMINI_API_KEY",
        "OPENAI_API_KEY",
        "MISTRAL_API_KEY",
        "GROQ_API_KEY",
        "CEREBRAS_API_KEY",
        "DEEPSEEK_API_KEY",
      ],
    },
    {
      label: "Data & Storage",
      keys: ["VOYAGE_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "STRIPE_SECRET_KEY"],
    },
    {
      label: "Infrastruttura",
      keys: ["TELEGRAM_BOT_TOKEN", "UPSTASH_REDIS_REST_URL", "CONSOLE_JWT_SECRET", "CRON_SECRET"],
    },
  ];

  const presentCount = Object.values(data.vars).filter(Boolean).length;
  const total = Object.keys(data.vars).length;

  return (
    <div className="p-4 space-y-3 border-t border-zinc-800">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          Environment
        </h3>
        <span className="text-[10px] text-zinc-500">
          {presentCount}/{total} configurate
        </span>
      </div>

      <div className="space-y-2">
        {groups.map((group) => (
          <div key={group.label} className="rounded border border-zinc-700/50 overflow-hidden">
            <div className="px-2 py-1 bg-zinc-800/60 text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">
              {group.label}
            </div>
            <div className="divide-y divide-zinc-800/80">
              {group.keys.map((k) => {
                const present = data.vars[k] ?? false;
                return (
                  <div key={k} className="flex items-center justify-between px-2 py-1.5 hover:bg-zinc-800/20">
                    <span className="text-[10px] font-mono text-zinc-300 truncate">{k}</span>
                    {present ? (
                      <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0 ml-2" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-400 shrink-0 ml-2" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Right column — Costs (compact, flex-none) ───────────────────────────────

function CostsSection({ data }: { data: CostsData | null }) {
  if (!data) return null;

  const topAgents = Object.entries(data.byAgent)
    .map(([agent, info]) => ({ agent, cost: info.cost, calls: info.calls }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 6);

  return (
    <div className="flex-none px-4 py-3 border-b border-zinc-800 space-y-2">
      {/* Header + summary inline */}
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          Costi API 24h
        </h3>
        <div className="flex items-center gap-3 ml-auto text-[11px] font-mono">
          <span className="text-zinc-300">{data.total > 0 ? `$${data.total.toFixed(5)}` : "$0.00"}</span>
          <span className="text-zinc-500">{data.calls} chiamate</span>
          <span className="text-zinc-500">{(data.fallbackRate * 100).toFixed(0)}% fallback</span>
        </div>
      </div>

      {/* Agent badges */}
      {topAgents.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {topAgents.map((e) => (
            <span
              key={e.agent}
              className="inline-flex items-center gap-1.5 px-2 py-1 bg-zinc-800/60 rounded-md text-[10px] font-mono"
            >
              <span className="text-zinc-300">{e.agent}</span>
              <span className="text-[#FF6B35]">
                {e.cost > 0 ? `$${e.cost.toFixed(4)}` : "~gratis"}
              </span>
              <span className="text-zinc-500">×{e.calls}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-zinc-500">Nessuna chiamata nelle ultime 24h.</p>
      )}
    </div>
  );
}

// ─── Main DebugPanel ──────────────────────────────────────────────────────────

export function DebugPanel() {
  const [tierData, setTierData] = useState<TierData | null>(null);
  const [envData, setEnvData] = useState<EnvVars | null>(null);
  const [costsData, setCostsData] = useState<CostsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getConsoleAuthHeaders();
      const [tierRes, envRes, costsRes] = await Promise.all([
        fetch("/api/console/tier", { headers }),
        fetch("/api/company/env-check", { headers }),
        fetch("/api/company/costs?view=total&days=1", { headers }),
      ]);
      const [tier, env, costs] = await Promise.all([
        tierRes.ok ? tierRes.json() : null,
        envRes.ok ? envRes.json() : null,
        costsRes.ok ? costsRes.json() : null,
      ]);
      setTierData(tier);
      setEnvData(env);
      setCostsData(costs);
      setLastFetch(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento dei dati debug");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const timeSince = () => {
    if (!lastFetch) return "";
    const diff = Math.floor((Date.now() - lastFetch.getTime()) / 1000);
    if (diff < 60) return `${diff}s fa`;
    return `${Math.floor(diff / 60)}m fa`;
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex-none h-10 px-4 border-b border-zinc-800 flex items-center gap-3 bg-zinc-900/60">
        <span className="text-xs font-semibold text-zinc-300">Debug</span>
        {lastFetch && (
          <span className="text-[10px] text-zinc-500">aggiornato {timeSince()}</span>
        )}
        <button
          onClick={fetchAll}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-2.5 h-6 bg-zinc-800 hover:bg-zinc-700 rounded text-[11px] text-zinc-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Aggiorna
        </button>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex-none px-4 py-2 bg-red-900/20 border-b border-red-700/40 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      {loading && !tierData ? (
        <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Caricamento stato sistema…
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex">
          {/* ── Left column: Tier + Env (scrollable) ─────────────────────── */}
          <div className="w-72 flex-none border-r border-zinc-800 overflow-y-auto">
            <TierSection data={tierData} />
            <EnvSection data={envData} />
          </div>

          {/* ── Right column: Costs (fixed) + LiveConsole (fills) ────────── */}
          <div className="flex-1 flex flex-col min-h-0">
            <CostsSection data={costsData} />
            {/* LiveConsolePanel takes remaining height */}
            <div className="flex-1 min-h-0 p-3">
              <LiveConsolePanel />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
