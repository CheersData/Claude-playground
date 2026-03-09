"use client";

import { useState, useEffect, type ComponentType } from "react";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, CheckCircle, Clock, RefreshCw, Scale } from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StressTestResult {
  tier: string;
  contract: string;
  success: boolean;
  totalTimeMs: number;
  phases: Record<string, { status: string; timeMs: number }>;
  fairnessScore: number;
  scores: Record<string, number>;
  risksCount: number;
  actionsCount: number;
  needsLawyer: boolean;
  risksFound: string[];
  error?: string;
}

interface StressTestRun {
  fileName: string;
  date: string;
  results: StressTestResult[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TIERS = ["intern", "associate", "partner"] as const;
const CONTRACTS = ["locazione_4+4", "compravendita_immobile", "lavoro_subordinato"] as const;

const TIER_LABELS: Record<string, string> = {
  intern: "Intern",
  associate: "Associate",
  partner: "Partner",
};

const CONTRACT_LABELS: Record<string, string> = {
  "locazione_4+4": "Locazione 4+4",
  compravendita_immobile: "Compravendita",
  lavoro_subordinato: "Lavoro",
};

const SCORE_LABELS: Record<string, string> = {
  contractEquity: "Equita",
  legalCoherence: "Coerenza",
  practicalCompliance: "Praticita",
  completeness: "Completezza",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fairnessColor(score: number): string {
  if (score >= 7) return "text-emerald-400";
  if (score >= 5) return "text-amber-400";
  return "text-red-400";
}

function fairnessBg(score: number): string {
  if (score >= 7) return "bg-emerald-500/20 border-emerald-500/30";
  if (score >= 5) return "bg-amber-500/20 border-amber-500/30";
  return "bg-red-500/20 border-red-500/30";
}

function formatTime(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function StressTestResultsPanel() {
  const [runs, setRuns] = useState<StressTestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState(0);
  const [expandedCell, setExpandedCell] = useState<string | null>(null);

  const fetchResults = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/company/stress-test-results", {
        headers: getConsoleAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchResults(); }, []);

  const currentRun = runs[selectedRun];

  // ── Loading/Error states ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-[var(--fg-secondary)]">
        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
        Caricamento risultati stress test...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48 text-red-400">
        <AlertTriangle className="w-4 h-4 mr-2" />
        {error}
      </div>
    );
  }

  if (!currentRun || currentRun.results.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-[var(--fg-secondary)]">
        Nessun risultato stress test trovato.
      </div>
    );
  }

  // ── Aggregated stats ──────────────────────────────────────────────────────

  const results = currentRun.results;
  const avgFairness = results.reduce((s, r) => s + r.fairnessScore, 0) / results.length;
  const avgTime = results.reduce((s, r) => s + r.totalTimeMs, 0) / results.length;
  const allSuccess = results.every(r => r.success);
  const allNeedLawyer = results.every(r => r.needsLawyer);

  // ── Group by tier for stats ───────────────────────────────────────────────

  const byTier = TIERS.map(tier => {
    const tierResults = results.filter(r => r.tier === tier);
    return {
      tier,
      avgFairness: tierResults.reduce((s, r) => s + r.fairnessScore, 0) / tierResults.length,
      avgTime: tierResults.reduce((s, r) => s + r.totalTimeMs, 0) / tierResults.length,
      count: tierResults.length,
    };
  });

  // ── Get cell data ─────────────────────────────────────────────────────────

  const getCell = (tier: string, contract: string) =>
    results.find(r => r.tier === tier && r.contract === contract);

  // ── Render ────────────────────────────────────────────────────────────────

  const runDate = new Date(currentRun.date).toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-[var(--fg-primary)]">
            Stress Test Pipeline Legale
          </h3>
          <p className="text-xs text-[var(--fg-secondary)] mt-0.5">
            {results.length} test &middot; {runDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {runs.length > 1 && (
            <select
              className="text-xs bg-[var(--bg-raised)] border border-[var(--border-dark)] rounded px-2 py-1 text-[var(--fg-primary)]"
              value={selectedRun}
              onChange={e => setSelectedRun(Number(e.target.value))}
            >
              {runs.map((run, i) => (
                <option key={i} value={i}>
                  {new Date(run.date).toLocaleDateString("it-IT")} ({run.results.length} test)
                </option>
              ))}
            </select>
          )}
          <button
            onClick={fetchResults}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--fg-secondary)]"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          icon={Scale}
          label="Fairness medio"
          value={avgFairness.toFixed(1)}
          color={fairnessColor(avgFairness)}
        />
        <StatCard
          icon={Clock}
          label="Tempo medio"
          value={formatTime(avgTime)}
          color="text-[var(--accent)]"
        />
        <StatCard
          icon={allSuccess ? CheckCircle : AlertTriangle}
          label="Successo"
          value={`${results.filter(r => r.success).length}/${results.length}`}
          color={allSuccess ? "text-emerald-400" : "text-red-400"}
        />
        <StatCard
          icon={AlertTriangle}
          label="Avvocato"
          value={allNeedLawyer ? "Sempre" : "Parziale"}
          color="text-amber-400"
        />
      </div>

      {/* ── Tier comparison ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {byTier.map(t => (
          <div
            key={t.tier}
            className="p-3 rounded-lg bg-[var(--bg-raised)] border border-[var(--border-dark)]"
          >
            <div className="text-xs font-medium text-[var(--fg-secondary)] mb-2">
              {TIER_LABELS[t.tier]}
            </div>
            <div className="flex items-baseline gap-3">
              <span className={`text-xl font-bold ${fairnessColor(t.avgFairness)}`}>
                {t.avgFairness.toFixed(1)}
              </span>
              <span className="text-xs text-[var(--fg-secondary)]">
                {formatTime(t.avgTime)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Results matrix ──────────────────────────────────────────── */}
      <div>
        <h4 className="text-sm font-medium text-[var(--fg-primary)] mb-3">
          Matrice Contratti x Tier
        </h4>

        {/* Header row */}
        <div className="grid grid-cols-[140px_1fr_1fr_1fr] gap-2 mb-2">
          <div />
          {TIERS.map(t => (
            <div key={t} className="text-xs font-medium text-[var(--fg-secondary)] text-center">
              {TIER_LABELS[t]}
            </div>
          ))}
        </div>

        {/* Data rows */}
        {CONTRACTS.map(contract => (
          <div key={contract} className="grid grid-cols-[140px_1fr_1fr_1fr] gap-2 mb-2">
            <div className="text-xs text-[var(--fg-secondary)] flex items-center">
              {CONTRACT_LABELS[contract]}
            </div>
            {TIERS.map(tier => {
              const cell = getCell(tier, contract);
              if (!cell) return <div key={tier} className="h-16" />;
              const cellKey = `${tier}-${contract}`;
              const isExpanded = expandedCell === cellKey;

              return (
                <motion.button
                  key={tier}
                  onClick={() => setExpandedCell(isExpanded ? null : cellKey)}
                  className={`p-2 rounded-lg border text-left transition-colors ${cell.success ? fairnessBg(cell.fairnessScore) : "bg-red-500/20 border-red-500/30"} hover:brightness-110`}
                  layout
                >
                  <div className="flex items-baseline justify-between">
                    <span className={`text-lg font-bold ${fairnessColor(cell.fairnessScore)}`}>
                      {cell.fairnessScore.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-[var(--fg-secondary)]">
                      {formatTime(cell.totalTimeMs)}
                    </span>
                  </div>

                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-2 space-y-2"
                    >
                      {/* Score breakdown */}
                      <div className="grid grid-cols-2 gap-1">
                        {Object.entries(cell.scores).map(([key, val]) => (
                          <div key={key} className="flex items-center justify-between text-[10px]">
                            <span className="text-[var(--fg-secondary)]">{SCORE_LABELS[key] || key}</span>
                            <span className={fairnessColor(val)}>{val}</span>
                          </div>
                        ))}
                      </div>

                      {/* Phase timing */}
                      <div className="space-y-0.5">
                        {Object.entries(cell.phases).map(([phase, data]) => (
                          <div key={phase} className="flex items-center justify-between text-[10px]">
                            <span className="text-[var(--fg-secondary)] capitalize">{phase}</span>
                            <span className="text-[var(--fg-primary)]">
                              {data.timeMs > 0 ? formatTime(data.timeMs) : "skip"}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Error */}
                      {cell.error && (
                        <div className="text-[10px] text-red-400 flex items-start gap-1">
                          <AlertTriangle className="w-2.5 h-2.5 mt-0.5 text-red-400 shrink-0" />
                          {cell.error}
                        </div>
                      )}

                      {/* Risks */}
                      <div className="space-y-0.5">
                        {cell.risksFound.map((risk, i) => (
                          <div key={i} className="text-[10px] text-[var(--fg-secondary)] flex items-start gap-1">
                            <AlertTriangle className="w-2.5 h-2.5 mt-0.5 text-amber-400 shrink-0" />
                            {risk}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Unique risks ────────────────────────────────────────────── */}
      <div>
        <h4 className="text-sm font-medium text-[var(--fg-primary)] mb-2">
          Rischi trovati ({new Set(results.flatMap(r => r.risksFound)).size} unici)
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {[...new Set(results.flatMap(r => r.risksFound))].map((risk, i) => (
            <span
              key={i}
              className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"
            >
              {risk}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-[var(--bg-raised)] border border-[var(--border-dark)]">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[10px] text-[var(--fg-secondary)]">{label}</span>
      </div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

