/**
 * API Legal Q&A Tests — stress-test funzionale per l'agente legale (corpus agent)
 *
 * GET  → lista test case (filtrabili per block, type, cpc, giur, difficulty)
 * POST → { action: "generate", block?, count? } → N domande casuali dal DB
 *        { action: "run", testId, question, tier? } → esegue il test contro il corpus agent
 *          - tier: "intern" | "associate" | "partner" (default "partner")
 *          - agentAnswer: risposta del corpus agent nel tier selezionato
 *          - evaluation: valutazione automatica di Claude Opus 4.5 (prep/search/quality/verdict/reasoning)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { sessionTierStore, type TierName } from "@/lib/tiers";
import { askCorpusAgent } from "@/lib/agents/corpus-agent";
import { runAgent } from "@/lib/ai-sdk/agent-runner";
import { broadcastConsoleAgent } from "@/lib/agent-broadcast";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 180; // 3 min: question-prep + corpus-agent + eval = 3 LLM calls

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoringHints {
  prep: string;
  search: string;
  quality: string;
}

export interface OpusEvaluation {
  prep: number;
  search: number;
  quality: number;
  total: number;
  verdict: "PASS" | "BORDERLINE" | "FAIL";
  reasoning: string;
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

// ─── Load test cases ─────────────────────────────────────────────────────────

// Using require for JSON import compatibility across Next.js versions
// eslint-disable-next-line @typescript-eslint/no-require-imports
const testCasesRaw = require("../../../../tests/legal-qa/test-cases.json") as TestCase[];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildSummary(tests: TestCase[]) {
  const byBlock: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};

  for (const t of tests) {
    byBlock[t.blockName] = (byBlock[t.blockName] ?? 0) + 1;
    byDifficulty[t.difficulty] = (byDifficulty[t.difficulty] ?? 0) + 1;
  }

  return {
    total: tests.length,
    byBlock,
    byDifficulty,
  };
}

// ─── Load saved results ─────────────────────────────────────────────────────

interface SavedResult {
  testId: string;
  question: string;
  agentAnswer: string;
  expectedAnswer: string;
  scoringHints: ScoringHints;
  trapType: string | null;
  institutes: string[];
  scope: string;
  tier: string;
  evaluation: OpusEvaluation | null;
  evaluator?: string;
  runAt: string;
}

function loadSavedResults(): Record<string, SavedResult> {
  const qaDir = path.join(process.cwd(), "company", "qa-results");
  if (!fs.existsSync(qaDir)) return {};

  const files = fs.readdirSync(qaDir).filter((f) => f.startsWith("qa-") && f.endsWith(".json"));
  const latest: Record<string, { result: SavedResult; ts: number }> = {};

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(qaDir, file), "utf-8");
      const parsed = JSON.parse(raw) as SavedResult;
      if (!parsed.testId) continue;

      // Extract timestamp from filename: qa-TC21-intern-1773052182330.json
      const tsMatch = file.match(/(\d{13})\.json$/);
      const ts = tsMatch ? parseInt(tsMatch[1], 10) : 0;

      const existing = latest[parsed.testId];
      if (!existing || ts > existing.ts) {
        latest[parsed.testId] = { result: parsed, ts };
      }
    } catch {
      // Skip corrupt files
    }
  }

  const out: Record<string, SavedResult> = {};
  for (const [id, entry] of Object.entries(latest)) {
    out[id] = entry.result;
  }
  return out;
}

/** Load results deduped by testId — solo l'ultimo risultato per ogni test case */
function loadLatestResults(): SavedResult[] {
  const qaDir = path.join(process.cwd(), "company", "qa-results");
  if (!fs.existsSync(qaDir)) return [];

  const files = fs.readdirSync(qaDir).filter((f) => f.startsWith("qa-") && f.endsWith(".json"));
  const latest: Record<string, { result: SavedResult; ts: number }> = {};

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(qaDir, file), "utf-8");
      const parsed = JSON.parse(raw) as SavedResult;
      if (!parsed.testId) continue;

      // Extract timestamp from filename: qa-TC21-intern-1773052182330.json
      const tsMatch = file.match(/(\d{13})\.json$/);
      const ts = tsMatch ? parseInt(tsMatch[1], 10) : 0;

      const existing = latest[parsed.testId];
      if (!existing || ts > existing.ts) {
        latest[parsed.testId] = { result: parsed, ts };
      }
    } catch {
      // Skip corrupt files
    }
  }

  // Sort by testId numerico (TC21, TC22, ..., TC70)
  return Object.values(latest)
    .map((entry) => entry.result)
    .sort((a, b) => a.testId.localeCompare(b.testId, undefined, { numeric: true }));
}

function buildResultsSummary(savedResults: Record<string, SavedResult>) {
  let pass = 0, borderline = 0, fail = 0, totalScore = 0, evaluated = 0;

  for (const r of Object.values(savedResults)) {
    if (!r.evaluation) continue;
    evaluated++;
    totalScore += r.evaluation.total;
    if (r.evaluation.verdict === "PASS") pass++;
    else if (r.evaluation.verdict === "BORDERLINE") borderline++;
    else fail++;
  }

  return {
    totalResults: Object.keys(savedResults).length,
    evaluated,
    pass,
    borderline,
    fail,
    avgScore: evaluated > 0 ? Math.round(totalScore / evaluated) : 0,
  };
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireConsoleAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode") ?? null;

  // Dashboard mode: return ALL historical results (no dedup)
  if (mode === "dashboard") {
    const allResults = loadLatestResults();

    // Build comprehensive stats
    let pass = 0, borderline = 0, fail = 0, totalScore = 0, evaluated = 0;
    const byTier: Record<string, { count: number; score: number; pass: number; borderline: number; fail: number }> = {};
    const byBlock: Record<string, { count: number; score: number; pass: number; borderline: number; fail: number }> = {};

    for (const r of allResults) {
      if (!r.evaluation) continue;
      evaluated++;
      totalScore += r.evaluation.total;
      if (r.evaluation.verdict === "PASS") pass++;
      else if (r.evaluation.verdict === "BORDERLINE") borderline++;
      else fail++;

      // By tier
      if (!byTier[r.tier]) byTier[r.tier] = { count: 0, score: 0, pass: 0, borderline: 0, fail: 0 };
      byTier[r.tier].count++;
      byTier[r.tier].score += r.evaluation.total;
      if (r.evaluation.verdict === "PASS") byTier[r.tier].pass++;
      else if (r.evaluation.verdict === "BORDERLINE") byTier[r.tier].borderline++;
      else byTier[r.tier].fail++;
    }

    // Match testId to test case for block info
    const testCaseMap: Record<string, TestCase> = {};
    for (const tc of testCasesRaw as TestCase[]) {
      testCaseMap[tc.id] = tc;
    }

    for (const r of allResults) {
      if (!r.evaluation) continue;
      const tc = testCaseMap[r.testId];
      const blockKey = tc ? `${tc.block}: ${tc.blockName}` : "Sconosciuto";
      if (!byBlock[blockKey]) byBlock[blockKey] = { count: 0, score: 0, pass: 0, borderline: 0, fail: 0 };
      byBlock[blockKey].count++;
      byBlock[blockKey].score += r.evaluation.total;
      if (r.evaluation.verdict === "PASS") byBlock[blockKey].pass++;
      else if (r.evaluation.verdict === "BORDERLINE") byBlock[blockKey].borderline++;
      else byBlock[blockKey].fail++;
    }

    return NextResponse.json({
      mode: "dashboard",
      allResults,
      stats: {
        total: allResults.length,
        evaluated,
        pass,
        borderline,
        fail,
        avgScore: evaluated > 0 ? Math.round((totalScore / evaluated) * 10) / 10 : 0,
        byTier,
        byBlock,
      },
    });
  }

  // Standard mode: return test cases + latest results
  const block = searchParams.get("block") ?? null;
  const type = searchParams.get("type") ?? null;
  const cpcParam = searchParams.get("cpc") ?? null;
  const giurParam = searchParams.get("giur") ?? null;
  const difficulty = searchParams.get("difficulty") ?? null;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  let filtered = testCasesRaw as TestCase[];

  if (block) {
    filtered = filtered.filter((t) => t.block === block);
  }
  if (type) {
    filtered = filtered.filter((t) => t.type === type);
  }
  if (cpcParam !== null) {
    const cpcBool = cpcParam === "true";
    filtered = filtered.filter((t) => t.cpc === cpcBool);
  }
  if (giurParam !== null) {
    const giurBool = giurParam === "true";
    filtered = filtered.filter((t) => t.giur === giurBool);
  }
  if (difficulty) {
    filtered = filtered.filter((t) => t.difficulty === difficulty);
  }

  const tests = filtered.slice(0, limit);
  const summary = buildSummary(tests);

  // Load persisted results from company/qa-results/
  const savedResults = loadSavedResults();
  const resultsSummary = buildResultsSummary(savedResults);

  return NextResponse.json({ tests, summary, savedResults, resultsSummary });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = requireConsoleAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  let body: {
    action?: string;
    block?: string;
    count?: number;
    testId?: string;
    question?: string;
    tier?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido." }, { status: 400 });
  }

  const { action } = body;

  // ── action: generate ────────────────────────────────────────────────────────
  if (action === "generate") {
    const count = Math.min(body.count ?? 10, 50);
    let pool = testCasesRaw as TestCase[];

    if (body.block) {
      pool = pool.filter((t) => t.block === body.block);
    }

    const selected = shuffleArray(pool).slice(0, count);

    return NextResponse.json({
      tests: selected,
      summary: buildSummary(selected),
    });
  }

  // ── action: run ─────────────────────────────────────────────────────────────
  if (action === "run") {
    const { testId, question } = body;
    const tier: TierName = (body as { tier?: string }).tier as TierName ?? "partner";
    const validTiers: TierName[] = ["intern", "associate", "partner"];
    const resolvedTier: TierName = validTiers.includes(tier) ? tier : "partner";

    if (!testId || typeof testId !== "string") {
      return NextResponse.json({ error: "Campo 'testId' obbligatorio." }, { status: 400 });
    }
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Campo 'question' obbligatorio." }, { status: 400 });
    }

    const testCase = (testCasesRaw as TestCase[]).find((t) => t.id === testId);
    if (!testCase) {
      return NextResponse.json({ error: `Test case '${testId}' non trovato.` }, { status: 404 });
    }

    // ── Step 1: chiama corpus agent direttamente con il tier selezionato ──────
    const runAt = new Date().toISOString();
    let agentAnswer: string;

    broadcastConsoleAgent("qa-test-run", "running", {
      task: `Test ${testId}: ${question.slice(0, 50)}`,
    });

    try {
      const corpusResult = await sessionTierStore.run(
        { tier: resolvedTier, disabledAgents: new Set(), sid: `stress-${testId}` },
        () => askCorpusAgent(question, {})
      );
      agentAnswer = corpusResult.answer ?? "(nessuna risposta)";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore sconosciuto";
      broadcastConsoleAgent("qa-test-run", "error", { task: `Errore corpus: ${message.slice(0, 60)}` });
      return NextResponse.json(
        { error: "corpus_agent_error", message },
        { status: 503 }
      );
    }

    // ── Step 2: valutazione — CLI Opus (preferito) → fallback runAgent ─────────
    let evaluation: OpusEvaluation | null = null;
    let evaluator: "opus-cli" | "tier-fallback" | "none" = "none";

    broadcastConsoleAgent("qa-evaluation", "running", { task: `Valutazione ${testId}` });

    const evalSystemPrompt = `Sei un giudice esperto di diritto italiano. Valuta la qualità della risposta di un agente AI a una domanda giuridica.

IMPORTANTE: Rispondi ESCLUSIVAMENTE con JSON puro. NON usare backtick, code fence, markdown.
La tua risposta deve iniziare con { e finire con }.

Formato richiesto:
{
  "prep": <intero 0-30>,
  "search": <intero 0-30>,
  "quality": <intero 0-40>,
  "total": <intero 0-100, somma dei precedenti>,
  "verdict": <"PASS" se total>=80, "BORDERLINE" se >=60, "FAIL" se <60>,
  "reasoning": <stringa: 2-3 frasi che spiegano il punteggio>
}

Criteri di valutazione:
- PREP (0-30): preparazione della query e identificazione corretta del tema giuridico
- SEARCH (0-30): recupero di articoli e norme pertinenti
- QUALITY (0-40): accuratezza, completezza, assenza di invenzioni
- Se l'agente inventa sentenze o articoli non esistenti: quality <= 10
- Se la risposta è vuota o off-topic: total <= 20
- Se è una domanda trappola e l'agente non cade nella trappola: +5 bonus su quality (max 40)`;

    const evalUserPrompt = `DOMANDA: ${question}

RISPOSTA ATTESA (riferimento corretto):
${testCase.expected}

RISPOSTA DELL'AGENTE:
${agentAnswer}

SCOPE / RIFERIMENTI NORMATIVI: ${testCase.scope}
ISTITUTI GIURIDICI: ${testCase.institutes.join(", ")}
TIPO TRAPPOLA: ${testCase.trapType ?? "nessuna"}

CRITERI SPECIFICI:
- PREP: ${testCase.scoringHints.prep}
- SEARCH: ${testCase.scoringHints.search}
- QUALITY: ${testCase.scoringHints.quality}

Valuta la risposta dell'agente rispetto alla risposta attesa.`;

    // Helper locale: parse eval JSON robusto
    function parseEval(raw: string): OpusEvaluation | null {
      try {
        let s = raw.trim();
        if (s.includes("\`\`\`")) s = s.replace(/\`\`\`(?:json)?\s*/g, "").replace(/\`\`\`/g, "").trim();
        const m = s.match(/\{[\s\S]*\}/);
        if (!m) return null;
        const p = JSON.parse(m[0]) as Partial<OpusEvaluation>;
        const prep = Number.isFinite(Number(p.prep)) ? Math.min(30, Math.max(0, Math.round(Number(p.prep)))) : null;
        const search = Number.isFinite(Number(p.search)) ? Math.min(30, Math.max(0, Math.round(Number(p.search)))) : null;
        const quality = Number.isFinite(Number(p.quality)) ? Math.min(40, Math.max(0, Math.round(Number(p.quality)))) : null;
        if (prep === null || search === null || quality === null) return null;
        const total = prep + search + quality;
        return {
          prep, search, quality, total,
          verdict: total >= 80 ? "PASS" : total >= 60 ? "BORDERLINE" : "FAIL",
          reasoning: typeof p.reasoning === "string" && p.reasoning.trim() ? p.reasoning.trim() : "Nessuna spiegazione.",
        };
      } catch { return null; }
    }

    // ── Tentativo 1: CLI Opus via Max subscription ──
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { spawnSync } = require("child_process") as typeof import("child_process");
      const cleanEnv = { ...process.env };
      delete (cleanEnv as Record<string, string | undefined>).CLAUDECODE;
      delete (cleanEnv as Record<string, string | undefined>).CLAUDE_CODE_ENTRY;

      const cliResult = spawnSync("claude", ["-p"], {
        input: `${evalSystemPrompt}\n\n${evalUserPrompt}`,
        encoding: "utf-8",
        timeout: 10_000, // Fast-fail: se CLI non risponde in 10s → fallback runAgent
        maxBuffer: 2 * 1024 * 1024,
        shell: true,
        env: cleanEnv,
      });

      if (cliResult.error || cliResult.status !== 0) {
        const errMsg = cliResult.stderr?.slice(0, 200) || cliResult.error?.message || "CLI exit " + cliResult.status;
        throw new Error(`CLI Opus: ${errMsg}`);
      }

      evaluation = parseEval(cliResult.stdout);
      if (evaluation) {
        evaluator = "opus-cli";
        console.log(`[QA-EVAL] Opus CLI OK: ${evaluation.verdict} ${evaluation.total}/100`);
      } else {
        throw new Error("CLI Opus: risposta non parsabile");
      }
    } catch (opusErr) {
      console.warn("[QA-EVAL] CLI Opus non disponibile:", opusErr instanceof Error ? opusErr.message : opusErr);

      // ── Tentativo 2: fallback runAgent (tier system — modelli gratuiti) ──
      try {
        broadcastConsoleAgent("qa-evaluation", "running", { task: `Fallback eval ${testId}` });
        console.log("[QA-EVAL] Fallback: invocando runAgent per eval...");

        const agentResult = await sessionTierStore.run(
          { tier: resolvedTier, disabledAgents: new Set(), sid: `eval-${testId}` },
          () => runAgent<Partial<OpusEvaluation>>("corpus-agent", evalUserPrompt, {
            systemPrompt: evalSystemPrompt,
          })
        );

        console.log("[QA-EVAL] Fallback text:", agentResult.text?.slice(0, 200) ?? "no text");
        console.log("[QA-EVAL] Fallback parsed keys:", agentResult.parsed ? Object.keys(agentResult.parsed) : "null");

        // Try parsing from raw text first, then from parsed object
        evaluation = parseEval(agentResult.text || JSON.stringify(agentResult.parsed));
        if (evaluation) {
          evaluator = "tier-fallback";
          console.log(`[QA-EVAL] Tier fallback OK: ${evaluation.verdict} ${evaluation.total}/100`);
        } else {
          console.warn("[QA-EVAL] Fallback: parse failed from both raw and parsed");
        }
      } catch (fallbackErr) {
        console.error("[QA-EVAL] Fallback error:", fallbackErr instanceof Error ? fallbackErr.message : fallbackErr);
      }
    }

    if (evaluation) {
      broadcastConsoleAgent("qa-evaluation", "done", {
        task: `${evaluation.verdict} ${evaluation.total}/100 (${evaluator})`,
      });
    } else {
      broadcastConsoleAgent("qa-evaluation", "error", { task: "Eval non disponibile" });
    }

    broadcastConsoleAgent("qa-test-run", "done", {
      task: evaluation ? `${evaluation.verdict} ${evaluation.total}/100` : "Completato (no eval)",
    });

    // ── Step 3: persistenza risultati ─────────────────────────────────────────
    const result = {
      testId,
      question,
      agentAnswer,
      expectedAnswer: testCase.expected,
      scoringHints: testCase.scoringHints,
      trapType: testCase.trapType,
      institutes: testCase.institutes,
      scope: testCase.scope,
      tier: resolvedTier,
      evaluation,
      evaluator,
      runAt,
    };

    try {
      const qaDir = path.join(process.cwd(), "company", "qa-results");
      if (!fs.existsSync(qaDir)) fs.mkdirSync(qaDir, { recursive: true });

      // Cleanup: elimina risultati vecchi per lo stesso testId (mantieni solo il nuovo)
      const oldFiles = fs.readdirSync(qaDir).filter(
        (f) => f.startsWith(`qa-${testId}-`) && f.endsWith(".json")
      );
      for (const old of oldFiles) {
        try { fs.unlinkSync(path.join(qaDir, old)); } catch { /* ignore */ }
      }

      const filename = `qa-${testId}-${resolvedTier}-${Date.now()}.json`;
      fs.writeFileSync(path.join(qaDir, filename), JSON.stringify(result, null, 2));
    } catch (err) {
      console.warn("[QA-PERSIST] Non-critical:", err instanceof Error ? err.message : err);
    }

    return NextResponse.json(result);
  }

  // Unknown action
  return NextResponse.json(
    { error: `Azione '${action}' non riconosciuta. Usa 'generate' o 'run'.` },
    { status: 400 }
  );
}
