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
import { CheckCircle, XCircle, RefreshCw, ChevronRight, Zap } from "lucide-react";
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

interface ProviderHealthData {
  [provider: string]: {
    lastCallAt: string | null;
    recentCalls: number;
    recentErrors: number;
    status: "ok" | "degraded" | "error";
  };
}

// ─── Left column sections ─────────────────────────────────────────────────────

function TierSection({ data }: { data: TierData | null }) {
  if (!data) return null;

  const tierColor: Record<string, string> = {
    intern: "text-[var(--ops-teal)]",
    associate: "text-[var(--ops-id-cost)]",
    partner: "text-[var(--ops-cyan)]",
  };

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[var(--ops-muted)] uppercase tracking-wider">
          Tier & Agenti
        </h3>
        <span className={`text-sm font-bold uppercase ${tierColor[data.current] ?? "text-[var(--ops-fg)]"}`}>
          {data.current}
          <span className="ml-2 text-xs font-normal text-[var(--ops-muted)] normal-case">
            {data.estimatedCost.label}/q
          </span>
        </span>
      </div>

      {/* Agents table */}
      <div className="rounded-xl border border-[var(--ops-border-subtle)] overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--ops-border-subtle)] bg-[var(--ops-surface)]">
              <th className="text-left px-3 py-3 text-[var(--ops-muted)] font-medium text-xs uppercase tracking-wider">Agente</th>
              <th className="text-center px-3 py-3 text-[var(--ops-muted)] font-medium text-xs uppercase tracking-wider">On</th>
              <th className="text-left px-3 py-3 text-[var(--ops-muted)] font-medium text-xs uppercase tracking-wider">Modello attivo</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.agents).map(([name, info]) => (
              <tr key={name} className="border-b border-[var(--ops-border-subtle)] last:border-0 hover:bg-[rgba(255,255,255,0.03)]">
                <td className="px-3 py-3 font-mono text-[var(--ops-fg)] truncate max-w-[90px]">{name}</td>
                <td className="px-3 py-3 text-center">
                  {info.enabled ? (
                    <CheckCircle className="w-4 h-4 text-[var(--ops-teal)] mx-auto" />
                  ) : (
                    <XCircle className="w-4 h-4 text-[var(--ops-error)] mx-auto" />
                  )}
                </td>
                <td className="px-3 py-3 font-mono text-[var(--ops-accent)] truncate max-w-[120px]">
                  {info.chain[info.activeIndex]?.displayName ?? info.activeModel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Fallback chains — collapsible via HTML details */}
      <details className="group">
        <summary className="flex items-center gap-1 text-xs text-[var(--ops-muted)] cursor-pointer select-none hover:text-[var(--ops-fg-muted)] transition-colors list-none">
          <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform shrink-0" />
          Catene fallback
        </summary>
        <div className="mt-2 space-y-2 pl-1">
          {Object.entries(data.agents).map(([name, info]) => (
            <div key={name}>
              <div className="text-xs text-[var(--ops-muted)] font-mono mb-1">{name}</div>
              <div className="flex flex-wrap gap-1">
                {info.chain.map((m, i) => (
                  <span
                    key={m.key}
                    className={`px-2 py-0.5 rounded text-xs font-mono ${
                      i === info.activeIndex
                        ? "bg-[rgba(255,107,53,0.12)] text-[var(--ops-accent)] ring-1 ring-[rgba(255,107,53,0.3)]"
                        : m.available
                        ? "bg-[var(--ops-surface)] text-[var(--ops-fg-muted)]"
                        : "bg-[var(--ops-bg)] text-[var(--ops-muted)] line-through"
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
    <div className="p-5 space-y-4 border-t border-[var(--ops-border-subtle)]">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[var(--ops-muted)] uppercase tracking-wider">
          Environment
        </h3>
        <span className="text-xs text-[var(--ops-muted)]">
          {presentCount}/{total} configurate
        </span>
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.label} className="rounded-xl border border-[var(--ops-border-subtle)] overflow-hidden">
            <div className="px-3 py-2 bg-[var(--ops-surface)] text-xs text-[var(--ops-muted)] font-semibold uppercase tracking-wider">
              {group.label}
            </div>
            <div className="divide-y divide-[var(--ops-border-subtle)]">
              {group.keys.map((k) => {
                const present = data.vars[k] ?? false;
                return (
                  <div key={k} className="flex items-center justify-between px-3 py-2 hover:bg-[rgba(255,255,255,0.03)]">
                    <span className="text-xs font-mono text-[var(--ops-fg-muted)] truncate">{k}</span>
                    {present ? (
                      <CheckCircle className="w-4 h-4 text-[var(--ops-teal)] shrink-0 ml-2" />
                    ) : (
                      <XCircle className="w-4 h-4 text-[var(--ops-error)] shrink-0 ml-2" />
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
    <div className="flex-none px-4 py-3 border-b border-[var(--ops-border-subtle)] space-y-2">
      {/* Header + summary inline */}
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-xs font-semibold text-[var(--ops-muted)] uppercase tracking-wider">
          Costi API 7d
        </h3>
        <div className="flex items-center gap-3 ml-auto text-xs font-mono">
          <span className="text-[var(--ops-fg)]">{data.total > 0 ? `$${data.total.toFixed(5)}` : "$0.00"}</span>
          <span className="text-[var(--ops-muted)]">{data.calls} chiamate</span>
          <span className={`${data.fallbackRate > 0.3 ? "text-[var(--ops-error)]" : "text-[var(--ops-muted)]"}`}>{(data.fallbackRate * 100).toFixed(0)}% fallback</span>
        </div>
      </div>

      {/* Agent badges */}
      {topAgents.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {topAgents.map((e) => (
            <span
              key={e.agent}
              className="inline-flex items-center gap-2 px-2 py-1 bg-[var(--ops-surface)] rounded-md text-xs font-mono border border-[var(--ops-border-subtle)]"
            >
              <span className="text-[var(--ops-fg-muted)]">{e.agent}</span>
              <span className="text-[var(--ops-accent)]">
                {e.cost > 0 ? `$${e.cost.toFixed(4)}` : "~gratis"}
              </span>
              <span className="text-[var(--ops-muted)]">{"\u00d7"}{e.calls}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[var(--ops-muted)]">Nessuna chiamata negli ultimi 7 giorni.</p>
      )}
    </div>
  );
}

// ─── Right column — Provider Health (compact, flex-none) ──────────────────────

function ProviderHealthSection({ data }: { data: ProviderHealthData | null }) {
  if (!data || Object.keys(data).length === 0) return null;

  const statusIcon = (status: "ok" | "degraded" | "error") => {
    switch (status) {
      case "ok":
        return <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: "var(--ops-teal)" }} />;
      case "degraded":
        return <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: "var(--ops-id-cost)" }} />;
      case "error":
        return <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: "var(--ops-error)" }} />;
    }
  };

  const statusLabel = (status: "ok" | "degraded" | "error") => {
    switch (status) {
      case "ok": return "OK";
      case "degraded": return "Rate limited";
      case "error": return "Errori";
    }
  };

  const formatLastCall = (iso: string | null): string => {
    if (!iso) return "—";
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return `${diff}s fa`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m fa`;
    return `${Math.floor(diff / 3600)}h fa`;
  };

  // Sort: errors first, then degraded, then ok
  const sortedProviders = Object.entries(data).sort(([, a], [, b]) => {
    const order = { error: 0, degraded: 1, ok: 2 };
    return order[a.status] - order[b.status];
  });

  const totalErrors = Object.values(data).reduce((s, p) => s + p.recentErrors, 0);

  return (
    <div className="flex-none px-4 py-3 border-b border-[var(--ops-border-subtle)] space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-xs font-semibold text-[var(--ops-muted)] uppercase tracking-wider flex items-center gap-2">
          <Zap className="w-3 h-3" />
          Provider Health 1h
        </h3>
        <div className="flex items-center gap-3 ml-auto text-xs font-mono">
          <span className="text-[var(--ops-muted)]">{sortedProviders.length} providers</span>
          {totalErrors > 0 && (
            <span className="text-[var(--ops-error)]">{totalErrors} errori</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
        {sortedProviders.map(([name, info]) => (
          <div
            key={name}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-mono"
            style={{
              backgroundColor: info.status === "error" ? "rgba(229, 141, 120, 0.06)" :
                               info.status === "degraded" ? "rgba(255, 200, 50, 0.04)" :
                               "var(--ops-surface)",
              borderColor: info.status === "error" ? "rgba(229, 141, 120, 0.3)" :
                           info.status === "degraded" ? "rgba(255, 200, 50, 0.2)" :
                           "var(--ops-border-subtle)",
            }}
          >
            {statusIcon(info.status)}
            <span className="text-[var(--ops-fg-muted)] font-semibold truncate">{name}</span>
            <span className="ml-auto text-[var(--ops-muted)] shrink-0">
              {info.recentCalls} calls
            </span>
            {info.recentErrors > 0 && (
              <span className="shrink-0" style={{ color: info.status === "error" ? "var(--ops-error)" : "var(--ops-id-cost)" }}>
                {info.recentErrors} err
              </span>
            )}
            <span className="text-[var(--ops-muted)] shrink-0" title={info.lastCallAt ?? undefined}>
              {formatLastCall(info.lastCallAt)}
            </span>
            <span
              className="shrink-0 text-xs"
              style={{
                color: info.status === "ok" ? "var(--ops-teal)" :
                       info.status === "degraded" ? "var(--ops-id-cost)" :
                       "var(--ops-error)",
              }}
            >
              {statusLabel(info.status)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main DebugPanel ──────────────────────────────────────────────────────────

export function DebugPanel() {
  const [tierData, setTierData] = useState<TierData | null>(null);
  const [envData, setEnvData] = useState<EnvVars | null>(null);
  const [costsData, setCostsData] = useState<CostsData | null>(null);
  const [providerHealth, setProviderHealth] = useState<ProviderHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getConsoleAuthHeaders();
      const [tierRes, envRes, costsRes, healthRes] = await Promise.all([
        fetch("/api/console/tier", { headers }),
        fetch("/api/company/env-check", { headers }),
        fetch("/api/company/costs?view=total&days=7", { headers }),
        fetch("/api/company/costs?view=provider-health", { headers }),
      ]);
      const [tier, env, costs, health] = await Promise.all([
        tierRes.ok ? tierRes.json() : null,
        envRes.ok ? envRes.json() : null,
        costsRes.ok ? costsRes.json() : null,
        healthRes.ok ? healthRes.json() : null,
      ]);
      setTierData(tier);
      setEnvData(env);
      setCostsData(costs);
      setProviderHealth(health);
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
    <div className="h-full flex flex-col bg-[var(--ops-bg)]">
      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex-none h-12 px-5 border-b border-[var(--ops-border-subtle)] flex items-center gap-4 bg-[var(--ops-surface)]">
        <span className="text-sm font-semibold text-[var(--ops-fg)]">Stato Sistema</span>
        {lastFetch && (
          <span className="text-xs text-[var(--ops-muted)]">aggiornato {timeSince()}</span>
        )}
        <button
          onClick={fetchAll}
          disabled={loading}
          className="ml-auto flex items-center gap-2 px-3 h-7 bg-[var(--ops-surface-2)] hover:bg-[var(--ops-border)] rounded-lg text-xs text-[var(--ops-fg-muted)] transition-all duration-150 disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Aggiorna
        </button>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────────── */}
      {error && (
        <div className="flex-none px-4 py-2 bg-[rgba(229,141,120,0.08)] border-b border-[var(--ops-error)]/20 text-xs text-[var(--ops-error)]">
          {error}
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      {loading && !tierData ? (
        <div className="flex-1 flex items-center justify-center text-[var(--ops-muted)] text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Caricamento stato sistema…
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex">
          {/* ── Left column: Tier + Env (scrollable) ─────────────────────── */}
          <div className="w-72 flex-none border-r border-[var(--ops-border-subtle)] overflow-y-auto">
            <TierSection data={tierData} />
            <EnvSection data={envData} />
          </div>

          {/* ── Right column: Costs + Provider Health (fixed) + LiveConsole (fills) */}
          <div className="flex-1 flex flex-col min-h-0">
            <CostsSection data={costsData} />
            <ProviderHealthSection data={providerHealth} />
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
