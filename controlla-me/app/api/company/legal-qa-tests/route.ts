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
import { spawnSync } from "child_process";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { sessionTierStore, type TierName } from "@/lib/tiers";
import { askCorpusAgent } from "@/lib/agents/corpus-agent";
import { parseAgentJSON } from "@/lib/anthropic";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireConsoleAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const { searchParams } = new URL(req.url);
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

  return NextResponse.json({ tests, summary });
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

    try {
      const corpusResult = await sessionTierStore.run(
        { tier: resolvedTier, disabledAgents: new Set(), sid: `stress-${testId}` },
        () => askCorpusAgent(question, {})
      );
      agentAnswer = corpusResult.answer ?? "(nessuna risposta)";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore sconosciuto";
      return NextResponse.json(
        { error: "corpus_agent_error", message },
        { status: 503 }
      );
    }

    // ── Step 2: valutazione automatica con Claude Opus 4.5 ───────────────────
    let evaluation: OpusEvaluation | null = null;

    const opusSystemPrompt = `Sei un giudice esperto di diritto italiano. Valuta la qualità della risposta di un agente AI a una domanda giuridica.

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

    const opusUserPrompt = `DOMANDA: ${question}

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

    try {
      // Usa Claude Opus via CLI — il CLI usa crediti Anthropic ma non richiede SDK diretto.
      // In ambiente demo fallisce con "Credit balance is too low" → evaluation rimane null.
      // In ambiente con crediti: restituisce valutazione completa da claude-opus-4-5.
      const fullPrompt = `${opusSystemPrompt}\n\n${opusUserPrompt}`;
      const cliResult = spawnSync(
        "claude",
        ["-p", fullPrompt, "--model", "claude-opus-4-5"],
        { encoding: "utf-8", timeout: 30_000 }
      );

      const rawText = (cliResult.stdout ?? "").trim();

      if (cliResult.status !== 0 || !rawText) {
        const errMsg = (cliResult.stderr ?? "").slice(0, 200);
        console.warn("[STRESS-SCORER] CLI Opus non disponibile:", errMsg);
        // evaluation rimane null — la UI mostrerà il fallback
      } else {
        const parsed = parseAgentJSON(rawText) as Partial<OpusEvaluation>;

        // Validazione esplicita di ogni campo — Gemini/Opus talvolta omette campi
        const prep    = Number.isFinite(Number(parsed.prep))    ? Math.min(30, Math.max(0, Math.round(Number(parsed.prep))))    : null;
        const search  = Number.isFinite(Number(parsed.search))  ? Math.min(30, Math.max(0, Math.round(Number(parsed.search))))  : null;
        const quality = Number.isFinite(Number(parsed.quality)) ? Math.min(40, Math.max(0, Math.round(Number(parsed.quality)))) : null;

        if (prep === null || search === null || quality === null) {
          // JSON parziale — logga i campi mancanti e lascia evaluation null
          console.warn("[STRESS-SCORER] JSON parziale ricevuto:", { prep, search, quality, rawText: rawText.slice(0, 200) });
        } else {
          const total = prep + search + quality;
          evaluation = {
            prep,
            search,
            quality,
            total,
            verdict: total >= 80 ? "PASS" : total >= 60 ? "BORDERLINE" : "FAIL",
            reasoning: typeof parsed.reasoning === "string" && parsed.reasoning.trim()
              ? parsed.reasoning.trim()
              : "Nessuna spiegazione fornita dal modello.",
          };
        }
      }
    } catch (err) {
      console.error("[STRESS-SCORER] Errore valutatore:", err instanceof Error ? err.message : err);
      // evaluation rimane null — la UI gestirà il fallback
    }

    return NextResponse.json({
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
      runAt,
    });
  }

  // Unknown action
  return NextResponse.json(
    { error: `Azione '${action}' non riconosciuta. Usa 'generate' o 'run'.` },
    { status: 400 }
  );
}
