"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Terminal,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClauseDef {
  keyword: string;
  minSeverity: "critical" | "high" | "medium";
  description: string;
}

interface ClauseCheckResult {
  check: { keyword: string; minSeverity: string; description: string };
  passed: boolean;
  foundIn?: string;
  detectedSeverity?: string;
}

interface LastResult {
  passed: boolean;
  passedChecks: number;
  totalChecks: number;
  durationMs: number;
  actualScore: number | null;
  actualNeedsLawyer: boolean | null;
  failedChecks: string[];
  error: string | null;
  documentTypeCheck: { expected: string; actual: string; passed: boolean } | null;
  clauseChecks: ClauseCheckResult[];
}

interface TestCase {
  id: string;
  name: string;
  expectedDocumentType: string;
  maxFairnessScore: number;
  expectNeedsLawyer: boolean;
  legalNotes: string;
  clauseCount: number;
  clauses: ClauseDef[];
  lastResult: LastResult | null;
}

interface QAData {
  tests: TestCase[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    notRun: number;
    lastRunAt: string | null;
    historyCount: number;
  };
  history: Array<{
    file: string;
    runAt: string | null;
    total: number;
    passed: number;
    failed: number;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
};

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ result }: { result: LastResult | null }) {
  if (!result) {
    return (
      <span className="flex items-center gap-1 text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
        <Clock className="w-3 h-3" />
        Mai eseguito
      </span>
    );
  }
  if (result.error) {
    return (
      <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
        <XCircle className="w-3 h-3" />
        Errore
      </span>
    );
  }
  if (result.passed) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="w-3 h-3" />
        Passato
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
      <XCircle className="w-3 h-3" />
      Fallito
    </span>
  );
}

// ─── TestRow ─────────────────────────────────────────────────────────────────

function TestRow({ test, index }: { test: TestCase; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const result = test.lastResult;
  const accuracy = result
    ? Math.round((result.passedChecks / result.totalChecks) * 100)
    : null;

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      {/* Row header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-4 px-4 py-3.5 hover:bg-zinc-800/40 transition-colors text-left group"
      >
        {/* Index */}
        <span className="text-xs text-zinc-600 font-mono mt-0.5 flex-shrink-0 w-5">
          {String(index + 1).padStart(2, "0")}
        </span>

        {/* Name + doc type */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 group-hover:text-white transition-colors font-medium">
            {test.name}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-mono bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">
              {test.expectedDocumentType}
            </span>
            <span className="text-[10px] text-zinc-600">
              {test.clauseCount} clausole · max score {test.maxFairnessScore}
            </span>
            {test.expectNeedsLawyer && (
              <span className="text-[10px] text-orange-400/70">avvocato atteso</span>
            )}
          </div>
        </div>

        {/* Score from last run */}
        {result && !result.error && (
          <div className="text-right flex-shrink-0">
            <p
              className={`text-sm font-bold ${
                result.actualScore !== null
                  ? result.actualScore <= test.maxFairnessScore
                    ? "text-green-400"
                    : "text-red-400"
                  : "text-zinc-500"
              }`}
            >
              {result.actualScore !== null ? result.actualScore.toFixed(1) : "—"}
            </p>
            <p className="text-[10px] text-zinc-600">fairness</p>
          </div>
        )}

        {/* Accuracy bar */}
        {accuracy !== null && (
          <div className="text-right flex-shrink-0 w-14">
            <p
              className={`text-sm font-bold ${
                accuracy >= 80
                  ? "text-green-400"
                  : accuracy >= 50
                  ? "text-yellow-400"
                  : "text-red-400"
              }`}
            >
              {accuracy}%
            </p>
            <p className="text-[10px] text-zinc-600">
              {result!.passedChecks}/{result!.totalChecks}
            </p>
          </div>
        )}

        {/* Status */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge result={result} />
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-600" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-zinc-800 pt-3 space-y-3 bg-zinc-900/50">
              {/* Legal notes */}
              <div className="text-xs text-zinc-400 leading-relaxed border-l-2 border-[#FF6B35]/40 pl-3 py-0.5">
                {test.legalNotes}
              </div>

              {/* Clause checks */}
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 font-medium">
                  Clausole da rilevare
                </p>
                <div className="space-y-1.5">
                  {test.clauses.map((clause, i) => {
                    // Find matching clause check result if available
                    const checkResult = result?.clauseChecks?.find(
                      (cr) => cr.check.keyword === clause.keyword
                    );
                    const isPassed = checkResult?.passed ?? null;

                    return (
                      <div
                        key={i}
                        className={`flex items-start gap-2.5 px-2.5 py-2 rounded border text-xs ${
                          isPassed === null
                            ? "bg-zinc-800/50 border-zinc-700/50"
                            : isPassed
                            ? "bg-green-500/5 border-green-500/15"
                            : "bg-red-500/5 border-red-500/15"
                        }`}
                      >
                        {isPassed === null ? (
                          <span className="w-3 h-3 rounded-full border border-zinc-600 flex-shrink-0 mt-0.5" />
                        ) : isPassed ? (
                          <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <code className="text-zinc-300 font-mono bg-zinc-700/50 px-1 rounded text-[10px]">
                              {clause.keyword}
                            </code>
                            <span
                              className={`text-[10px] font-medium ${
                                SEVERITY_COLORS[clause.minSeverity] ?? "text-zinc-500"
                              }`}
                            >
                              {clause.minSeverity}
                            </span>
                            {checkResult?.foundIn && (
                              <span className="text-[10px] text-zinc-500 truncate">
                                → in &quot;{checkResult.foundIn}&quot;
                              </span>
                            )}
                          </div>
                          <p className="text-zinc-500 leading-relaxed">{clause.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Failed checks list */}
              {result && result.failedChecks.length > 0 && (
                <div>
                  <p className="text-[10px] text-red-400/70 uppercase tracking-widest mb-1.5 font-medium">
                    Check falliti ({result.failedChecks.length})
                  </p>
                  <div className="space-y-1">
                    {result.failedChecks.map((fc, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 text-xs text-red-300/80 bg-red-500/5 border border-red-500/10 px-2.5 py-1.5 rounded"
                      >
                        <span className="text-red-500 flex-shrink-0">↳</span>
                        {fc}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {result?.error && (
                <div className="text-xs text-red-300 bg-red-500/5 border border-red-500/20 px-3 py-2 rounded flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                  {result.error}
                </div>
              )}

              {/* Duration */}
              {result && (
                <p className="text-[10px] text-zinc-600">
                  Durata: {fmtDuration(result.durationMs)}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function QALegalPanel() {
  const [data, setData] = useState<QAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "demo_error">("idle");
  const [runMessage, setRunMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/company/qa-legal", {
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

  const handleRunEval = async () => {
    setRunStatus("running");
    setRunMessage(null);
    try {
      const res = await fetch("/api/company/qa-legal", {
        method: "POST",
        headers: getConsoleAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok) {
        setRunStatus("demo_error");
        setRunMessage(json.message ?? "Errore sconosciuto");
      } else {
        setRunStatus("idle");
        await fetchData();
      }
    } catch (err) {
      setRunStatus("demo_error");
      setRunMessage(`Errore: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500 gap-3">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Caricamento QA report...</span>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={fetchData}
          className="text-xs text-[#FF6B35] hover:underline"
        >
          Riprova
        </button>
      </div>
    );
  }

  if (!data) return null;
  const { summary, tests, history } = data;

  const hasResults = summary.notRun < summary.total;
  const accuracy = hasResults
    ? Math.round(((summary.passed) / (summary.total - summary.notRun)) * 100)
    : null;

  return (
    <div className="space-y-5">
      {/* Header + stats */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">QA Report — Agenti Legali</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {summary.total} contratti golden · Eval suite adversariale
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
            aria-label="Aggiorna dati"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleRunEval}
            disabled={runStatus === "running"}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF6B35]/10 hover:bg-[#FF6B35]/20 border border-[#FF6B35]/30 text-[#FF6B35] rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {runStatus === "running" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Terminal className="w-3.5 h-3.5" />
            )}
            Esegui Eval
          </button>
        </div>
      </div>

      {/* Demo mode message */}
      <AnimatePresence>
        {runStatus === "demo_error" && runMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-lg px-4 py-3"
          >
            <Terminal className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-amber-300 font-medium mb-1">Ambiente demo</p>
              <p className="text-xs text-zinc-400 leading-relaxed">{runMessage}</p>
              <code className="block mt-1.5 text-xs font-mono bg-zinc-800 text-zinc-300 px-2.5 py-1.5 rounded">
                npx tsx tests/eval/eval-runner.ts
              </code>
            </div>
            <button
              onClick={() => { setRunStatus("idle"); setRunMessage(null); }}
              className="text-zinc-600 hover:text-zinc-400 text-xs transition-colors flex-shrink-0"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-800/50 rounded-lg px-3 py-3 text-center">
          <p className="text-xl font-bold text-white">{summary.total}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Test totali</p>
        </div>
        <div className="bg-zinc-800/50 rounded-lg px-3 py-3 text-center">
          <p className={`text-xl font-bold ${summary.passed > 0 ? "text-green-400" : "text-zinc-600"}`}>
            {summary.passed}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Passati</p>
        </div>
        <div className="bg-zinc-800/50 rounded-lg px-3 py-3 text-center">
          <p className={`text-xl font-bold ${summary.failed > 0 ? "text-red-400" : "text-zinc-600"}`}>
            {summary.failed}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Falliti</p>
        </div>
        <div className="bg-zinc-800/50 rounded-lg px-3 py-3 text-center">
          <p className={`text-xl font-bold ${accuracy !== null ? (accuracy >= 80 ? "text-green-400" : accuracy >= 50 ? "text-yellow-400" : "text-red-400") : "text-zinc-600"}`}>
            {accuracy !== null ? `${accuracy}%` : "—"}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Accuracy</p>
        </div>
      </div>

      {/* Last run info */}
      {summary.lastRunAt ? (
        <p className="text-xs text-zinc-600">
          Ultimo run: {fmtDate(summary.lastRunAt)}
          {summary.historyCount > 1 && ` · ${summary.historyCount} run storici`}
        </p>
      ) : (
        <div className="flex items-center gap-2 bg-zinc-800/40 border border-zinc-700/50 rounded-lg px-3 py-2">
          <Clock className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
          <p className="text-xs text-zinc-500">
            Nessun eval eseguito. I risultati appariranno dopo il primo run da terminale esterno.
          </p>
        </div>
      )}

      {/* Test cases table */}
      <div>
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 font-medium">
          Contratti golden ({tests.length})
        </p>
        <div className="space-y-2">
          {tests.map((test, i) => (
            <TestRow key={test.id} test={test} index={i} />
          ))}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 font-medium">
            Storico run ({history.length})
          </p>
          <div className="space-y-1">
            {history.map((run, i) => (
              <div
                key={run.file}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-800/30 text-xs"
              >
                <span className="text-zinc-600 font-mono text-[10px] w-4">{i + 1}</span>
                <span className="text-zinc-500 flex-1">{fmtDate(run.runAt)}</span>
                <span className="flex items-center gap-1 text-green-400"><CheckCircle2 size={10} />{run.passed}</span>
                {run.failed > 0 && <span className="flex items-center gap-1 text-red-400"><XCircle size={10} />{run.failed}</span>}
                <span className="text-zinc-600 text-[10px]">
                  {Math.round((run.passed / run.total) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
