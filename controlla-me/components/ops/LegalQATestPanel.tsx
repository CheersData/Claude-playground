"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getConsoleAuthHeaders, getConsoleJsonHeaders } from "@/lib/utils/console-client";
import {
  Loader2,
  Play,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Eye,
  EyeOff,
  AlertTriangle,
  Cpu,
} from "lucide-react";

type TierName = "intern" | "associate" | "partner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoringHints {
  prep: string;
  search: string;
  quality: string;
}

interface TestCase {
  id: string;
  block: string;
  blockName: string;
  type: string;
  cpc: boolean;
  giur: boolean;
  difficulty: "easy" | "medium" | "hard";
  question: string;
  legalQuery: string;
  multiQuery: string;
  institutes: string[];
  scope: string;
  expected: string;
  trapType: string | null;
  scoringHints: ScoringHints;
}

interface OpusEvaluation {
  prep: number;
  search: number;
  quality: number;
  total: number;
  verdict: "PASS" | "BORDERLINE" | "FAIL";
  reasoning: string;
}

interface RunResult {
  testId: string;
  question: string;
  agentAnswer: string;
  expectedAnswer: string;
  scoringHints: ScoringHints;
  trapType: string | null;
  institutes: string[];
  scope: string;
  tier: TierName;
  evaluation: OpusEvaluation | null;
  runAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DIFFICULTY_BADGE: Record<string, { bg: string; text: string }> = {
  hard:   { bg: "bg-red-500/20",    text: "text-red-400" },
  medium: { bg: "bg-yellow-500/20", text: "text-yellow-400" },
  easy:   { bg: "bg-green-500/20",  text: "text-green-400" },
};

const BLOCK_COLORS: Record<string, string> = {
  A: "border-blue-500/40",
  B: "border-orange-500/40",
  C: "border-purple-500/40",
  D: "border-teal-500/40",
  E: "border-yellow-500/40",
  F: "border-pink-500/40",
  G: "border-indigo-500/40",
  H: "border-green-500/40",
};

// ─── Sub-component: TestCard ──────────────────────────────────────────────────

function TestCard({ tc, tier }: { tc: TestCase; tier: TierName }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showExpected, setShowExpected] = useState(false);

  const diffBadge = DIFFICULTY_BADGE[tc.difficulty] ?? DIFFICULTY_BADGE.medium;
  const blockColor = BLOCK_COLORS[tc.block] ?? "border-zinc-700";

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    setExpanded(true);
    setShowExpected(false);

    try {
      const res = await fetch("/api/company/legal-qa-tests", {
        method: "POST",
        headers: getConsoleJsonHeaders(),
        body: JSON.stringify({
          action: "run",
          testId: tc.id,
          question: tc.question,
          tier,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.message ?? json.error ?? "Errore sconosciuto");
      } else {
        setResult(json as RunResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di rete");
    } finally {
      setRunning(false);
    }
  };

  const verdictColors = {
    PASS:       { bg: "bg-green-500/20",  text: "text-green-400"  },
    BORDERLINE: { bg: "bg-yellow-500/20", text: "text-yellow-400" },
    FAIL:       { bg: "bg-red-500/20",    text: "text-red-400"    },
  };

  const scoreBarColor = (val: number, max: number) => {
    const ratio = val / max;
    if (ratio >= 0.8) return "bg-green-500";
    if (ratio >= 0.5) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className={`border-l-2 ${blockColor} bg-zinc-800/40 rounded-lg overflow-hidden`}>
      {/* Card header */}
      <div className="flex items-start gap-3 px-4 py-3">
        {/* ID + badges */}
        <div className="flex-shrink-0 flex flex-col items-start gap-1.5 pt-0.5">
          <span className="text-xs font-mono font-bold text-zinc-300">{tc.id}</span>
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${diffBadge.bg} ${diffBadge.text}`}
          >
            {tc.difficulty}
          </span>
          {tc.trapType && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" />
              TRAPPOLA
            </span>
          )}
          {tc.cpc && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
              CPC
            </span>
          )}
          {tc.giur && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400">
              GIUR
            </span>
          )}
        </div>

        {/* Question text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 leading-relaxed">{tc.question}</p>
          {tc.institutes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tc.institutes.map((inst) => (
                <span
                  key={inst}
                  className="text-[10px] bg-zinc-700/60 text-zinc-400 px-1.5 py-0.5 rounded"
                >
                  {inst.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <button
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF6B35]/15 hover:bg-[#FF6B35]/25 disabled:opacity-50 disabled:cursor-not-allowed text-[#FF6B35] rounded-lg text-xs font-medium transition-colors"
          >
            {running ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            {running ? "..." : "Testa"}
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg hover:bg-zinc-700 transition-colors text-zinc-500 hover:text-zinc-300"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expandable body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-zinc-700/50 pt-3">

              {/* Scope */}
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 font-medium">
                  Scope / Riferimenti
                </p>
                <p className="text-xs text-zinc-400 leading-relaxed">{tc.scope}</p>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}

              {/* Result */}
              {result && (
                <div className="space-y-3">
                  {/* Agent answer */}
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 font-medium">
                      Risposta agente
                    </p>
                    <div className="bg-zinc-900/70 rounded-lg p-3 border border-zinc-700/50">
                      <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                        {result.agentAnswer}
                      </p>
                    </div>
                  </div>

                  {/* Show expected toggle */}
                  <div>
                    <button
                      onClick={() => setShowExpected((v) => !v)}
                      className="flex items-center gap-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors mb-1.5 font-medium uppercase tracking-widest"
                    >
                      {showExpected ? (
                        <EyeOff className="w-3 h-3" />
                      ) : (
                        <Eye className="w-3 h-3" />
                      )}
                      {showExpected ? "Nascondi atteso" : "Mostra risposta attesa"}
                    </button>

                    <AnimatePresence initial={false}>
                      {showExpected && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="bg-zinc-900/70 rounded-lg p-3 border border-zinc-700/50">
                            <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">
                              {result.expectedAnswer}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Opus evaluation */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Cpu className="w-3 h-3 text-purple-400" />
                      <p className="text-[10px] text-purple-400 uppercase tracking-widest font-medium">
                        Valutazione Opus 4.5
                      </p>
                    </div>

                    {result.evaluation ? (
                      <div className="space-y-2">
                        {/* Score bars */}
                        {(
                          [
                            { label: "PREP",    val: result.evaluation.prep,    max: 30 },
                            { label: "SEARCH",  val: result.evaluation.search,  max: 30 },
                            { label: "QUALITY", val: result.evaluation.quality, max: 40 },
                          ] as const
                        ).map(({ label, val, max }) => (
                          <div key={label}>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[10px] text-zinc-500">{label}</span>
                              <span className="text-[10px] font-bold text-zinc-300">
                                {val}/{max}
                              </span>
                            </div>
                            <div className="h-1.5 bg-zinc-700/60 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${scoreBarColor(val, max)}`}
                                style={{ width: `${(val / max) * 100}%` }}
                              />
                            </div>
                          </div>
                        ))}

                        {/* Total + verdict */}
                        <div className="flex items-center justify-between pt-1.5 border-t border-zinc-700/50">
                          <span className="text-xs text-zinc-400 font-medium">
                            Totale
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-zinc-200">
                              {result.evaluation.total}/100
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                verdictColors[result.evaluation.verdict].bg
                              } ${verdictColors[result.evaluation.verdict].text}`}
                            >
                              {result.evaluation.verdict}
                            </span>
                          </div>
                        </div>

                        {/* Reasoning */}
                        <div className="bg-purple-500/5 border border-purple-500/15 rounded-lg p-2.5">
                          <p className="text-[10px] text-zinc-400 leading-relaxed">
                            {result.evaluation.reasoning}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-zinc-800/60 rounded-lg p-2.5">
                        <p className="text-[10px] text-zinc-500">
                          Valutazione Opus non disponibile (API non raggiunta o crediti insufficienti).
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Run timestamp */}
                  <p className="text-[10px] text-zinc-600">
                    Eseguito: {new Date(result.runAt).toLocaleString("it-IT")}
                  </p>
                </div>
              )}

              {/* Scoring hints (before run) */}
              {!result && !running && (
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5 font-medium">
                    Criteri di valutazione
                  </p>
                  <div className="space-y-1">
                    <p className="text-[10px] text-zinc-500">
                      <span className="text-zinc-400 font-medium">PREP:</span> {tc.scoringHints.prep}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      <span className="text-zinc-400 font-medium">SEARCH:</span> {tc.scoringHints.search}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      <span className="text-zinc-400 font-medium">QUALITY:</span> {tc.scoringHints.quality}
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

// ─── Block Section ────────────────────────────────────────────────────────────

function BlockSection({
  blockName,
  tests,
  defaultOpen,
  tier,
}: {
  blockName: string;
  tests: TestCase[];
  defaultOpen: boolean;
  tier: TierName;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const block = tests[0]?.block ?? "";
  const blockColor = BLOCK_COLORS[block] ?? "border-zinc-700";

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border-l-2 ${blockColor} bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors`}
      >
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-widest">
          BLOCCO {block} — {blockName}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded-full">
            {tests.length}
          </span>
          {open ? (
            <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pl-1">
              {tests.map((tc) => (
                <TestCard key={tc.id} tc={tc} tier={tier} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

interface Filters {
  block: string;
  difficulty: string;
  type: string;
}

function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {/* Block */}
      <select
        value={filters.block}
        onChange={(e) => onChange({ ...filters, block: e.target.value })}
        className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-[#FF6B35]/50 cursor-pointer"
      >
        <option value="">Tutti i blocchi</option>
        {["A", "B", "C", "D", "E", "F", "G", "H"].map((b) => (
          <option key={b} value={b}>
            Blocco {b}
          </option>
        ))}
      </select>

      {/* Difficulty */}
      <select
        value={filters.difficulty}
        onChange={(e) => onChange({ ...filters, difficulty: e.target.value })}
        className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-[#FF6B35]/50 cursor-pointer"
      >
        <option value="">Tutte le difficoltà</option>
        <option value="easy">Easy</option>
        <option value="medium">Medium</option>
        <option value="hard">Hard</option>
      </select>

      {/* Type */}
      <select
        value={filters.type}
        onChange={(e) => onChange({ ...filters, type: e.target.value })}
        className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-[#FF6B35]/50 cursor-pointer"
      >
        <option value="">Tutti i tipi</option>
        <option value="trap">Solo trappole</option>
        <option value="specific">Solo specifiche</option>
      </select>
    </div>
  );
}

// ─── Tier Selector ────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<TierName, { label: string; desc: string; color: string }> = {
  intern:    { label: "Intern",    desc: "Groq / Cerebras",        color: "border-zinc-600 text-zinc-400" },
  associate: { label: "Associate", desc: "Gemini / Haiku",         color: "border-blue-500/50 text-blue-400" },
  partner:   { label: "Partner",   desc: "Sonnet / Gemini Pro",    color: "border-[#FF6B35]/50 text-[#FF6B35]" },
};

function TierSelector({ value, onChange }: { value: TierName; onChange: (t: TierName) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-zinc-600 uppercase tracking-widest mr-1">Tier</span>
      {(["intern", "associate", "partner"] as TierName[]).map((t) => {
        const cfg = TIER_CONFIG[t];
        const active = value === t;
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            className={`px-2.5 py-1 rounded-lg border text-[10px] font-medium transition-all ${
              active
                ? `${cfg.color} bg-zinc-800`
                : "border-zinc-700/50 text-zinc-600 hover:text-zinc-400 hover:border-zinc-600"
            }`}
          >
            {cfg.label}
            <span className="ml-1 opacity-60">{cfg.desc}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function LegalQATestPanel() {
  const [allTests, setAllTests] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [tier, setTier] = useState<TierName>("partner");
  const [filters, setFilters] = useState<Filters>({
    block: "",
    difficulty: "",
    type: "",
  });

  const fetchTests = async (f?: Filters) => {
    setLoading(true);
    setError(null);

    const currentFilters = f ?? filters;
    const params = new URLSearchParams();
    if (currentFilters.block) params.set("block", currentFilters.block);
    if (currentFilters.difficulty) params.set("difficulty", currentFilters.difficulty);
    if (currentFilters.type) params.set("type", currentFilters.type);
    params.set("limit", "50");

    try {
      const res = await fetch(`/api/company/legal-qa-tests?${params.toString()}`, {
        headers: getConsoleAuthHeaders(),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Errore caricamento test");
      }

      const json = await res.json();
      setAllTests(json.tests as TestCase[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore di rete");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (newFilters: Filters) => {
    setFilters(newFilters);
    fetchTests(newFilters);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/company/legal-qa-tests", {
        method: "POST",
        headers: getConsoleJsonHeaders(),
        body: JSON.stringify({
          action: "generate",
          block: filters.block || undefined,
          count: 10,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Errore generazione");
      }

      const json = await res.json();
      const newTests = json.tests as TestCase[];

      // Add new tests that are not already in the list
      setAllTests((prev) => {
        const existingIds = new Set(prev.map((t) => t.id));
        const toAdd = newTests.filter((t) => !existingIds.has(t.id));
        return [...prev, ...toAdd];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore generazione");
    } finally {
      setGenerating(false);
    }
  };

  // Group by block
  const byBlock: Record<string, { blockName: string; tests: TestCase[] }> = {};
  for (const tc of allTests) {
    if (!byBlock[tc.block]) {
      byBlock[tc.block] = { blockName: tc.blockName, tests: [] };
    }
    byBlock[tc.block].tests.push(tc);
  }

  const blockKeys = Object.keys(byBlock).sort();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Stress Test Agente Legale</h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              {allTests.length} domande-trappola — valutazione automatica Opus 4.5
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 rounded-lg text-xs font-medium transition-colors border border-zinc-700"
          >
            {generating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Genera Nuove
          </button>
        </div>
        {/* Tier selector */}
        <TierSelector value={tier} onChange={setTier} />
      </div>

      {/* Filters */}
      <FilterBar filters={filters} onChange={handleFilterChange} />

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Caricamento test cases...</span>
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={() => fetchTests()}
            className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
          >
            Riprova
          </button>
        </div>
      ) : allTests.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <p className="text-sm">Nessun test case trovato con i filtri selezionati.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {blockKeys.map((block, i) => (
            <BlockSection
              key={block}
              blockName={byBlock[block].blockName}
              tests={byBlock[block].tests}
              defaultOpen={i === 0}
              tier={tier}
            />
          ))}
        </div>
      )}
    </div>
  );
}
