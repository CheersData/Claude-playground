"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";
import {
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Target,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  XCircle,
  Eye,
  EyeOff,
  Filter,
  Clock,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpusEvaluation {
  prep: number;
  search: number;
  quality: number;
  total: number;
  verdict: "PASS" | "BORDERLINE" | "FAIL";
  reasoning: string;
}

interface QAResult {
  testId: string;
  question: string;
  agentAnswer: string;
  expectedAnswer: string;
  scoringHints: { prep: string; search: string; quality: string };
  trapType: string | null;
  institutes: string[];
  scope: string;
  tier: string;
  evaluation: OpusEvaluation | null;
  evaluator?: string;
  runAt: string;
}

interface TierStats {
  count: number;
  score: number;
  pass: number;
  borderline: number;
  fail: number;
}

interface DashboardStats {
  total: number;
  evaluated: number;
  pass: number;
  borderline: number;
  fail: number;
  avgScore: number;
  byTier: Record<string, TierStats>;
  byBlock: Record<string, TierStats>;
}

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

// ─── Constants ────────────────────────────────────────────────────────────────

const VERDICT_CONFIG = {
  PASS: { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-400", icon: CheckCircle2, label: "PASS" },
  BORDERLINE: { bg: "bg-amber-500/15", border: "border-amber-500/30", text: "text-amber-400", icon: MinusCircle, label: "BORDERLINE" },
  FAIL: { bg: "bg-red-500/15", border: "border-red-500/30", text: "text-red-400", icon: XCircle, label: "FAIL" },
} as const;

const TIER_LABELS: Record<string, string> = {
  intern: "Intern",
  associate: "Associate",
  partner: "Partner",
};

const SCORE_RANGES = [
  { min: 90, max: 100, label: "90-100", color: "bg-emerald-500" },
  { min: 80, max: 89, label: "80-89", color: "bg-emerald-500/60" },
  { min: 70, max: 79, label: "70-79", color: "bg-amber-500" },
  { min: 60, max: 69, label: "60-69", color: "bg-amber-500/60" },
  { min: 50, max: 59, label: "50-59", color: "bg-orange-500" },
  { min: 40, max: 49, label: "40-49", color: "bg-red-500/70" },
  { min: 0, max: 39, label: "0-39", color: "bg-red-500" },
];

// ─── Score Bar helper ─────────────────────────────────────────────────────────

function scoreBarColor(val: number, max: number) {
  const ratio = val / max;
  if (ratio >= 0.8) return "bg-emerald-500";
  if (ratio >= 0.6) return "bg-amber-500";
  return "bg-red-500";
}

// ─── Sub-component: KPI Card ──────────────────────────────────────────────────

function KPICard({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="p-3 rounded-xl bg-[var(--bg-raised)] border border-[var(--border-dark-subtle)]">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[10px] text-[var(--fg-invisible)] uppercase tracking-widest font-medium">
          {label}
        </span>
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--fg-invisible)] mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Sub-component: Score Distribution Chart ──────────────────────────────────

function ScoreDistribution({ results }: { results: QAResult[] }) {
  const evaluated = results.filter((r) => r.evaluation);
  if (evaluated.length === 0) return null;

  const distribution = SCORE_RANGES.map((range) => ({
    ...range,
    count: evaluated.filter(
      (r) => r.evaluation!.total >= range.min && r.evaluation!.total <= range.max
    ).length,
  }));

  const maxCount = Math.max(...distribution.map((d) => d.count), 1);

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-[var(--fg-secondary)] uppercase tracking-widest">
        Distribuzione Punteggi
      </h4>
      <div className="space-y-1.5">
        {distribution.map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--fg-invisible)] w-10 text-right font-mono">
              {d.label}
            </span>
            <div className="flex-1 h-4 bg-[var(--bg-overlay)]/40 rounded overflow-hidden">
              <motion.div
                className={`h-full ${d.color} rounded`}
                initial={{ width: 0 }}
                animate={{ width: `${(d.count / maxCount) * 100}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
            <span className="text-[10px] text-[var(--fg-secondary)] w-6 text-right font-mono font-bold">
              {d.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sub-component: Block Breakdown ───────────────────────────────────────────

function BlockBreakdown({ byBlock }: { byBlock: Record<string, TierStats> }) {
  const blocks = Object.entries(byBlock).sort(([a], [b]) => a.localeCompare(b));
  if (blocks.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-[var(--fg-secondary)] uppercase tracking-widest">
        Per Blocco
      </h4>
      <div className="space-y-1.5">
        {blocks.map(([block, stats]) => {
          const avg = stats.count > 0 ? Math.round(stats.score / stats.count) : 0;
          const passRate = stats.count > 0 ? Math.round((stats.pass / stats.count) * 100) : 0;
          return (
            <div key={block} className="flex items-center gap-2 py-1">
              <span className="text-[10px] text-[var(--fg-secondary)] flex-1 truncate">
                {block}
              </span>
              <span className="text-[10px] text-[var(--fg-invisible)] w-6 text-right">{stats.count}</span>
              <span className={`text-[10px] font-bold w-8 text-right ${avg >= 80 ? "text-emerald-400" : avg >= 60 ? "text-amber-400" : "text-red-400"}`}>
                {avg}
              </span>
              <div className="w-16 h-1.5 bg-[var(--bg-overlay)]/40 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${passRate >= 60 ? "bg-emerald-500" : passRate >= 30 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${passRate}%` }}
                />
              </div>
              <span className="text-[10px] text-[var(--fg-invisible)] w-8 text-right">{passRate}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sub-component: Result Row ────────────────────────────────────────────────

function ResultRow({ result }: { result: QAResult }) {
  const [expanded, setExpanded] = useState(false);
  const [showExpected, setShowExpected] = useState(false);
  const ev = result.evaluation;

  const verdictCfg = ev ? VERDICT_CONFIG[ev.verdict] : null;

  return (
    <div className="border border-[var(--border-dark-subtle)] rounded-lg overflow-hidden bg-[var(--bg-overlay)]/20">
      {/* Row header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-overlay)]/30 transition-colors"
      >
        {/* Test ID */}
        <span className="text-xs font-mono font-bold text-[var(--fg-secondary)] w-10 flex-shrink-0">
          {result.testId}
        </span>

        {/* Score + verdict */}
        {ev && verdictCfg ? (
          <div className="flex items-center gap-1.5 flex-shrink-0 w-24">
            <span className={`text-sm font-bold ${verdictCfg.text}`}>{ev.total}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${verdictCfg.bg} ${verdictCfg.text} ${verdictCfg.border} border`}>
              {ev.verdict}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-[var(--fg-invisible)] w-24">no eval</span>
        )}

        {/* Tier badge */}
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)]/60 text-[var(--fg-invisible)] flex-shrink-0">
          {result.tier}
        </span>

        {/* Question preview */}
        <span className="text-xs text-[var(--fg-secondary)] truncate flex-1">
          {result.question}
        </span>

        {/* Timestamp */}
        <span className="text-[10px] text-[var(--fg-invisible)] flex-shrink-0">
          {new Date(result.runAt).toLocaleString("it-IT", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>

        {/* Expand icon */}
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5 text-[var(--fg-invisible)] flex-shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-[var(--fg-invisible)] flex-shrink-0" />
        )}
      </button>

      {/* Expanded details */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-2 space-y-3 border-t border-[var(--border-dark-subtle)]">
              {/* Question */}
              <div>
                <p className="text-[10px] text-[var(--fg-invisible)] uppercase tracking-widest mb-1 font-medium">
                  Domanda
                </p>
                <p className="text-xs text-[var(--fg-secondary)] leading-relaxed">
                  {result.question}
                </p>
              </div>

              {/* Institutes */}
              {result.institutes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {result.institutes.map((inst) => (
                    <span
                      key={inst}
                      className="text-[10px] bg-[var(--bg-hover)]/60 text-[var(--fg-invisible)] px-1.5 py-0.5 rounded"
                    >
                      {inst.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}

              {/* Agent answer */}
              <div>
                <p className="text-[10px] text-[var(--fg-invisible)] uppercase tracking-widest mb-1 font-medium">
                  Risposta Agente
                </p>
                <div className="bg-[var(--bg-raised)]/70 rounded-lg p-2.5 border border-[var(--border-dark-subtle)] max-h-48 overflow-y-auto">
                  <p className="text-[11px] text-[var(--fg-secondary)] leading-relaxed whitespace-pre-wrap">
                    {result.agentAnswer}
                  </p>
                </div>
              </div>

              {/* Expected answer toggle */}
              <div>
                <button
                  onClick={() => setShowExpected((v) => !v)}
                  className="flex items-center gap-1.5 text-[10px] text-[var(--fg-invisible)] hover:text-[var(--fg-secondary)] transition-colors font-medium uppercase tracking-widest"
                >
                  {showExpected ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showExpected ? "Nascondi atteso" : "Mostra risposta attesa"}
                </button>
                <AnimatePresence initial={false}>
                  {showExpected && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden mt-1.5"
                    >
                      <div className="bg-[var(--bg-raised)]/70 rounded-lg p-2.5 border border-[var(--border-dark-subtle)]">
                        <p className="text-[11px] text-[var(--fg-secondary)] leading-relaxed whitespace-pre-wrap">
                          {result.expectedAnswer}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Evaluation scores */}
              {ev && (
                <div className="space-y-2">
                  <p className="text-[10px] text-purple-400 uppercase tracking-widest font-medium">
                    Valutazione ({result.evaluator ?? "auto"})
                  </p>
                  {(
                    [
                      { label: "PREP", val: ev.prep, max: 30 },
                      { label: "SEARCH", val: ev.search, max: 30 },
                      { label: "QUALITY", val: ev.quality, max: 40 },
                    ] as const
                  ).map(({ label, val, max }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-[var(--fg-invisible)]">{label}</span>
                        <span className="text-[10px] font-bold text-[var(--fg-secondary)]">
                          {val}/{max}
                        </span>
                      </div>
                      <div className="h-1 bg-[var(--bg-hover)]/60 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${scoreBarColor(val, max)}`}
                          style={{ width: `${(val / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="bg-purple-500/5 border border-purple-500/15 rounded-lg p-2.5 mt-2">
                    <p className="text-[11px] text-[var(--fg-secondary)] leading-relaxed">
                      {ev.reasoning}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function QAResultsDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allResults, setAllResults] = useState<QAResult[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // Document stress test data
  const [stressRuns, setStressRuns] = useState<StressTestRun[]>([]);

  // Filters
  const [filterTier, setFilterTier] = useState<string>("");
  const [filterVerdict, setFilterVerdict] = useState<string>("");
  const [activeView, setActiveView] = useState<"qa" | "documents">("qa");

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [qaRes, stressRes] = await Promise.all([
        fetch("/api/company/legal-qa-tests?mode=dashboard", {
          headers: getConsoleAuthHeaders(),
        }),
        fetch("/api/company/stress-test-results", {
          headers: getConsoleAuthHeaders(),
        }),
      ]);

      if (qaRes.ok) {
        const qaData = await qaRes.json();
        setAllResults(qaData.allResults ?? []);
        setStats(qaData.stats ?? null);
      }

      if (stressRes.ok) {
        const stressData = await stressRes.json();
        setStressRuns(stressData.runs ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter results
  const filtered = useMemo(() => {
    let r = allResults;
    if (filterTier) r = r.filter((x) => x.tier === filterTier);
    if (filterVerdict) r = r.filter((x) => x.evaluation?.verdict === filterVerdict);
    return r;
  }, [allResults, filterTier, filterVerdict]);

  const filteredEvaluated = useMemo(
    () => filtered.filter((r) => r.evaluation),
    [filtered]
  );

  // ── Loading/Error ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-[var(--fg-secondary)]">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Caricamento risultati...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48 text-red-400">
        <AlertTriangle className="w-4 h-4 mr-2" />
        {error}
        <button onClick={fetchData} className="ml-3 text-xs underline">Riprova</button>
      </div>
    );
  }

  // ── Stress test stats ──
  const latestStress = stressRuns[0];
  const stressResults = latestStress?.results ?? [];
  const stressSuccess = stressResults.filter((r) => r.success).length;

  return (
    <div className="space-y-5">
      {/* ── Tab toggle ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[var(--bg-overlay)]/40 border border-[var(--border-dark-subtle)]">
          <button
            onClick={() => setActiveView("qa")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeView === "qa"
                ? "bg-[#FF6B35]/20 text-[#FF6B35] border border-[#FF6B35]/30"
                : "text-[var(--fg-invisible)] hover:text-[var(--fg-secondary)] border border-transparent"
            }`}
          >
            Q&A Corpus Agent ({stats?.total ?? 0})
          </button>
          <button
            onClick={() => setActiveView("documents")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeView === "documents"
                ? "bg-[#FF6B35]/20 text-[#FF6B35] border border-[#FF6B35]/30"
                : "text-[var(--fg-invisible)] hover:text-[var(--fg-secondary)] border border-transparent"
            }`}
          >
            Pipeline Documenti ({stressResults.length})
          </button>
        </div>
        <button
          onClick={fetchData}
          className="p-1.5 rounded-lg hover:bg-[var(--bg-overlay)] text-[var(--fg-invisible)] hover:text-[var(--fg-secondary)] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* Q&A VIEW */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeView === "qa" && stats && (
        <div className="space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KPICard
              icon={BarChart3}
              label="Test Eseguiti"
              value={stats.total}
              sub={`${stats.evaluated} valutati`}
              color="text-[var(--fg-primary)]"
            />
            <KPICard
              icon={Target}
              label="Media"
              value={`${stats.avgScore}/100`}
              sub={stats.avgScore >= 80 ? "Buono" : stats.avgScore >= 60 ? "Sufficiente" : "Insufficiente"}
              color={stats.avgScore >= 80 ? "text-emerald-400" : stats.avgScore >= 60 ? "text-amber-400" : "text-red-400"}
            />
            <KPICard
              icon={CheckCircle2}
              label="PASS"
              value={stats.pass}
              sub={stats.evaluated > 0 ? `${Math.round((stats.pass / stats.evaluated) * 100)}%` : "—"}
              color="text-emerald-400"
            />
            <KPICard
              icon={MinusCircle}
              label="BORDERLINE"
              value={stats.borderline}
              sub={stats.evaluated > 0 ? `${Math.round((stats.borderline / stats.evaluated) * 100)}%` : "—"}
              color="text-amber-400"
            />
            <KPICard
              icon={XCircle}
              label="FAIL"
              value={stats.fail}
              sub={stats.evaluated > 0 ? `${Math.round((stats.fail / stats.evaluated) * 100)}%` : "—"}
              color="text-red-400"
            />
          </div>

          {/* Verdict distribution bar */}
          {stats.evaluated > 0 && (
            <div className="space-y-1.5">
              <div className="flex h-3 rounded-full overflow-hidden bg-[var(--bg-overlay)]/40">
                {stats.pass > 0 && (
                  <div
                    className="bg-emerald-500 transition-all"
                    style={{ width: `${(stats.pass / stats.evaluated) * 100}%` }}
                  />
                )}
                {stats.borderline > 0 && (
                  <div
                    className="bg-amber-500 transition-all"
                    style={{ width: `${(stats.borderline / stats.evaluated) * 100}%` }}
                  />
                )}
                {stats.fail > 0 && (
                  <div
                    className="bg-red-500 transition-all"
                    style={{ width: `${(stats.fail / stats.evaluated) * 100}%` }}
                  />
                )}
              </div>
              <div className="flex items-center justify-center gap-4 text-[10px]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[var(--fg-invisible)]">Pass {Math.round((stats.pass / stats.evaluated) * 100)}%</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-[var(--fg-invisible)]">Borderline {Math.round((stats.borderline / stats.evaluated) * 100)}%</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-[var(--fg-invisible)]">Fail {Math.round((stats.fail / stats.evaluated) * 100)}%</span>
                </span>
              </div>
            </div>
          )}

          {/* 2-col: Distribution + Block breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 rounded-xl bg-[var(--bg-raised)] border border-[var(--border-dark-subtle)]">
              <ScoreDistribution results={allResults} />
            </div>
            <div className="p-3 rounded-xl bg-[var(--bg-raised)] border border-[var(--border-dark-subtle)]">
              <BlockBreakdown byBlock={stats.byBlock} />
            </div>
          </div>

          {/* Tier breakdown cards */}
          {Object.keys(stats.byTier).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-[var(--fg-secondary)] uppercase tracking-widest mb-2">
                Per Tier
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {Object.entries(stats.byTier).map(([tier, ts]) => {
                  const avg = ts.count > 0 ? Math.round(ts.score / ts.count) : 0;
                  const passRate = ts.count > 0 ? Math.round((ts.pass / ts.count) * 100) : 0;
                  return (
                    <div
                      key={tier}
                      className="p-3 rounded-xl bg-[var(--bg-raised)] border border-[var(--border-dark-subtle)]"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-[var(--fg-secondary)]">
                          {TIER_LABELS[tier] ?? tier}
                        </span>
                        <span className="text-[10px] text-[var(--fg-invisible)]">{ts.count} test</span>
                      </div>
                      <div className="flex items-baseline gap-3">
                        <span className={`text-xl font-bold ${avg >= 80 ? "text-emerald-400" : avg >= 60 ? "text-amber-400" : "text-red-400"}`}>
                          {avg}
                        </span>
                        <span className="text-xs text-[var(--fg-invisible)]">media</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-1.5 bg-[var(--bg-overlay)]/40 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${passRate >= 60 ? "bg-emerald-500" : passRate >= 30 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${passRate}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-[var(--fg-invisible)]">{passRate}% pass</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                        <span className="text-emerald-400">{ts.pass} pass</span>
                        <span className="text-amber-400">{ts.borderline} border</span>
                        <span className="text-red-400">{ts.fail} fail</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-[var(--fg-invisible)]" />
            <select
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value)}
              className="bg-[var(--bg-overlay)] border border-[var(--border-dark)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--fg-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-base)] cursor-pointer"
            >
              <option value="">Tutti i tier</option>
              <option value="intern">Intern</option>
              <option value="associate">Associate</option>
              <option value="partner">Partner</option>
            </select>
            <select
              value={filterVerdict}
              onChange={(e) => setFilterVerdict(e.target.value)}
              className="bg-[var(--bg-overlay)] border border-[var(--border-dark)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--fg-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-base)] cursor-pointer"
            >
              <option value="">Tutti i verdetti</option>
              <option value="PASS">PASS</option>
              <option value="BORDERLINE">BORDERLINE</option>
              <option value="FAIL">FAIL</option>
            </select>
            <span className="text-[10px] text-[var(--fg-invisible)]">
              {filtered.length} risultati {filterTier || filterVerdict ? "(filtrati)" : ""}
            </span>
          </div>

          {/* Results list */}
          <div className="space-y-1.5">
            {filtered.map((result, i) => (
              <ResultRow key={`${result.testId}-${result.runAt}-${i}`} result={result} />
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-[var(--fg-invisible)]">
              <p className="text-sm">Nessun risultato trovato con i filtri selezionati.</p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════ */}
      {/* DOCUMENTS VIEW (stress test pipeline) */}
      {/* ════════════════════════════════════════════════════════════════════════ */}
      {activeView === "documents" && (
        <div className="space-y-5">
          {stressResults.length === 0 ? (
            <div className="text-center py-12 text-[var(--fg-invisible)]">
              <p className="text-sm">Nessun risultato stress test pipeline trovato.</p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard
                  icon={BarChart3}
                  label="Test"
                  value={stressResults.length}
                  sub={latestStress ? new Date(latestStress.date).toLocaleDateString("it-IT") : ""}
                  color="text-[var(--fg-primary)]"
                />
                <KPICard
                  icon={CheckCircle2}
                  label="Successo"
                  value={`${stressSuccess}/${stressResults.length}`}
                  sub={stressResults.length > 0 ? `${Math.round((stressSuccess / stressResults.length) * 100)}%` : "—"}
                  color={stressSuccess === stressResults.length ? "text-emerald-400" : "text-red-400"}
                />
                <KPICard
                  icon={Target}
                  label="Fairness Medio"
                  value={
                    stressResults.filter((r) => r.success).length > 0
                      ? (
                          stressResults
                            .filter((r) => r.success)
                            .reduce((s, r) => s + r.fairnessScore, 0) /
                          stressResults.filter((r) => r.success).length
                        ).toFixed(1)
                      : "—"
                  }
                  color="text-amber-400"
                />
                <KPICard
                  icon={Clock}
                  label="Tempo Medio"
                  value={
                    stressResults.length > 0
                      ? `${(stressResults.reduce((s, r) => s + r.totalTimeMs, 0) / stressResults.length / 1000).toFixed(1)}s`
                      : "—"
                  }
                  color="text-[var(--accent)]"
                />
              </div>

              {/* Individual results */}
              <div className="space-y-2">
                {stressResults.map((r, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border ${
                      r.success
                        ? "bg-[var(--bg-raised)] border-[var(--border-dark-subtle)]"
                        : "bg-red-500/5 border-red-500/20"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {r.success ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                        )}
                        <span className="text-xs font-medium text-[var(--fg-secondary)]">
                          {r.contract}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)]/60 text-[var(--fg-invisible)]">
                          {r.tier}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {r.success && (
                          <span className={`text-sm font-bold ${r.fairnessScore >= 7 ? "text-emerald-400" : r.fairnessScore >= 5 ? "text-amber-400" : "text-red-400"}`}>
                            {r.fairnessScore.toFixed(1)}
                          </span>
                        )}
                        <span className="text-[10px] text-[var(--fg-invisible)]">
                          {(r.totalTimeMs / 1000).toFixed(1)}s
                        </span>
                      </div>
                    </div>
                    {r.error && (
                      <p className="text-[10px] text-red-400 mt-1.5 pl-5">
                        {r.error.slice(0, 200)}
                      </p>
                    )}
                    {r.success && r.risksFound.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2 pl-5">
                        {r.risksFound.map((risk, j) => (
                          <span
                            key={j}
                            className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          >
                            {risk}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Multiple runs selector */}
              {stressRuns.length > 1 && (
                <div className="text-[10px] text-[var(--fg-invisible)]">
                  {stressRuns.length} run disponibili — mostro l&apos;ultimo
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
