"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronRight,
  FlaskConical,
} from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";
import type { TestSpec } from "@/app/api/company/qa-status/route";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QAStatusData {
  specs: TestSpec[];
  summary: {
    total: number;
    e2e: number;
    unit: number;
    totalTests: number;
    avgScore: number;
    passCount: number;
    unknownCount: number;
    failCount: number;
  };
  timestamp: string;
}

interface Suggestion {
  id: string;
  priority: "high" | "medium" | "low";
  target: string;
  description: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 9
      ? "text-green-400 bg-green-500/10 border-green-500/20"
      : score >= 7
      ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
      : "text-red-400 bg-red-500/10 border-red-500/20";
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${color}`}>
      {score}/10
    </span>
  );
}

function StatusIcon({ status }: { status: TestSpec["status"] }) {
  if (status === "pass")
    return <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />;
  if (status === "fail")
    return <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />;
  return <Clock className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />;
}

function TypeBadge({ type }: { type: "e2e" | "unit" }) {
  return type === "e2e" ? (
    <span className="text-[10px] font-mono bg-violet-500/10 text-violet-400 border border-violet-500/20 px-1.5 py-0.5 rounded">
      E2E
    </span>
  ) : (
    <span className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded">
      UNIT
    </span>
  );
}

function PriorityDot({ priority }: { priority: "high" | "medium" | "low" }) {
  const colors = {
    high: "bg-orange-400",
    medium: "bg-yellow-400",
    low: "bg-zinc-500",
  };
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors[priority]}`} />;
}

// ─── SpecRow ─────────────────────────────────────────────────────────────────

function SpecRow({ spec }: { spec: TestSpec }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-[var(--ops-border-subtle)] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/40 transition-colors text-left group"
      >
        <StatusIcon status={spec.status} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={spec.type} />
            <span className="text-sm text-zinc-200 font-medium group-hover:text-white transition-colors truncate">
              {spec.name}
            </span>
          </div>
          <p className="text-[10px] text-zinc-500 mt-0.5 font-mono">{spec.file}</p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-zinc-400">{spec.testCount} test</p>
            <p className="text-[10px] text-zinc-600">{spec.category}</p>
          </div>
          <ScoreBadge score={spec.score} />
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-3 border-t border-[var(--ops-border-subtle)] bg-zinc-900/50 space-y-3">
              {/* Comment */}
              <p className="text-xs text-zinc-400 leading-relaxed border-l-2 border-[#FF6B35]/40 pl-3 py-0.5">
                {spec.comment}
              </p>

              {/* Coverage areas */}
              <div>
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1.5 font-medium">
                  Aree coperte
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {spec.coverage.map((area, i) => (
                    <span
                      key={i}
                      className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-[var(--ops-border-subtle)]"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function QASuitePanel() {
  const [data, setData] = useState<QAStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"e2e" | "unit">("e2e");
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsNote, setSuggestionsNote] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/company/qa-status", {
        headers: getConsoleAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(`Impossibile caricare i dati: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleGenerateSuggestions = async () => {
    setLoadingSuggestions(true);
    setSuggestions(null);
    try {
      const res = await fetch("/api/company/qa-status", {
        method: "POST",
        headers: getConsoleAuthHeaders(),
      });
      const json = await res.json();
      setSuggestions(json.suggestions ?? []);
      setSuggestionsNote(json.note ?? null);
    } catch {
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500 gap-3">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Caricamento suite test...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={fetchData} className="text-xs text-[#FF6B35] hover:underline">
          Riprova
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { summary, specs } = data;
  const filteredSpecs = specs.filter((s) => s.type === activeTab);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-[#FF6B35]" />
            Suite Test — Quality Assurance
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {summary.total} spec · {summary.totalTests} test totali
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
          aria-label="Aggiorna"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-800/50 rounded-lg px-3 py-3 text-center">
          <p className="text-xl font-bold text-white">{summary.totalTests}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Test totali</p>
        </div>
        <div className="bg-zinc-800/50 rounded-lg px-3 py-3 text-center">
          <p className={`text-xl font-bold ${summary.passCount > 0 ? "text-green-400" : "text-zinc-600"}`}>
            {summary.passCount}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Suite pass</p>
        </div>
        <div className="bg-zinc-800/50 rounded-lg px-3 py-3 text-center">
          <p className={`text-xl font-bold ${summary.unknownCount > 0 ? "text-zinc-400" : "text-zinc-600"}`}>
            {summary.unknownCount}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Non eseguiti</p>
        </div>
        <div className="bg-zinc-800/50 rounded-lg px-3 py-3 text-center">
          <p
            className={`text-xl font-bold ${
              summary.avgScore >= 9
                ? "text-green-400"
                : summary.avgScore >= 7
                ? "text-yellow-400"
                : "text-red-400"
            }`}
          >
            {summary.avgScore.toFixed(1)}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Score medio</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-zinc-800/50 rounded-lg w-fit">
        {(["e2e", "unit"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded text-xs font-medium transition-colors ${
              activeTab === tab
                ? "bg-zinc-700 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab === "e2e" ? `E2E Playwright (${summary.e2e})` : `Unit Vitest (${summary.unit})`}
          </button>
        ))}
      </div>

      {/* Spec list */}
      <div className="space-y-2">
        {filteredSpecs.map((spec) => (
          <SpecRow key={spec.id} spec={spec} />
        ))}
      </div>

      {/* Generate suggestions */}
      <div className="border-t border-[var(--ops-border-subtle)] pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-300 font-medium">Genera Nuove Domande di Test</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">
              Suggerimenti basati su gap di copertura identificati
            </p>
          </div>
          <button
            onClick={handleGenerateSuggestions}
            disabled={loadingSuggestions}
            className="flex items-center gap-2 px-4 py-2 bg-[#FF6B35]/10 hover:bg-[#FF6B35]/20 border border-[#FF6B35]/30 text-[#FF6B35] rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingSuggestions ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Genera Domande
          </button>
        </div>

        <AnimatePresence>
          {suggestions && suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="space-y-2"
            >
              {suggestionsNote && (
                <p className="text-[10px] text-zinc-600 italic">{suggestionsNote}</p>
              )}
              {suggestions.map((sug) => {
                const targetSpec = data.specs.find((s) => s.id === sug.target);
                return (
                  <div
                    key={sug.id}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-zinc-800/40 border border-[var(--ops-border-subtle)]"
                  >
                    <PriorityDot priority={sug.priority} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {targetSpec && (
                          <span className="text-[10px] font-mono text-zinc-500 bg-zinc-700/50 px-1.5 py-0.5 rounded">
                            {targetSpec.file}
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-medium ${
                            sug.priority === "high"
                              ? "text-orange-400"
                              : sug.priority === "medium"
                              ? "text-yellow-400"
                              : "text-zinc-500"
                          }`}
                        >
                          {sug.priority}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">{sug.description}</p>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}

          {suggestions && suggestions.length === 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-zinc-500"
            >
              Nessun suggerimento disponibile.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
