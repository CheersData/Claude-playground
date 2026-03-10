#!/usr/bin/env npx tsx
/**
 * QA Batch Runner — esegue tutti i 50 test case Q&A del corpus agent in sequenza.
 *
 * Uso:
 *   npx tsx scripts/run-qa-batch.ts                      # default intern
 *   npx tsx scripts/run-qa-batch.ts --tier=associate
 *   npx tsx scripts/run-qa-batch.ts --tier=intern --from=TC35   # riprendi da TC35
 *   npx tsx scripts/run-qa-batch.ts --only=TC21,TC27,TC52       # solo specifici
 *
 * Output: company/qa-results/qa-{testId}-{tier}-{timestamp}.json
 * Cleanup automatico dei risultati vecchi per lo stesso testId.
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load env BEFORE any other import
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { askCorpusAgent } from "@/lib/agents/corpus-agent";
import { sessionTierStore, type TierName } from "@/lib/tiers";
import { runAgent } from "@/lib/ai-sdk/agent-runner";

// ─── Parse args ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const tierArg = args.find((a) => a.startsWith("--tier="))?.split("=")[1] as TierName | undefined;
const fromArg = args.find((a) => a.startsWith("--from="))?.split("=")[1];
const onlyArg = args.find((a) => a.startsWith("--only="))?.split("=")[1];
const tier: TierName = tierArg && ["intern", "associate", "partner"].includes(tierArg) ? tierArg : "intern";

// ─── Load test cases ────────────────────────────────────────────────────────

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
  question: string;
  legalQuery: string;
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

const testCasesPath = path.resolve(__dirname, "../tests/legal-qa/test-cases.json");
let testCases: TestCase[] = JSON.parse(fs.readFileSync(testCasesPath, "utf-8"));

// Filter by --from
if (fromArg) {
  const idx = testCases.findIndex((t) => t.id === fromArg);
  if (idx === -1) {
    console.error(`Test case ${fromArg} non trovato.`);
    process.exit(1);
  }
  testCases = testCases.slice(idx);
}

// Filter by --only
if (onlyArg) {
  const ids = new Set(onlyArg.split(","));
  testCases = testCases.filter((t) => ids.has(t.id));
}

// ─── Evaluation prompt ──────────────────────────────────────────────────────

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

// ─── Parse eval JSON ────────────────────────────────────────────────────────

function parseEval(raw: string): OpusEvaluation | null {
  try {
    let s = raw.trim();
    if (s.includes("```")) s = s.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
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

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const qaDir = path.resolve(__dirname, "../company/qa-results");
  if (!fs.existsSync(qaDir)) fs.mkdirSync(qaDir, { recursive: true });

  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  QA Batch Runner — ${testCases.length} test @ tier ${tier}  ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);

  let pass = 0, borderline = 0, fail = 0, errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const progress = `[${i + 1}/${testCases.length}]`;
    process.stdout.write(`${progress} ${tc.id} — ${tc.question.slice(0, 55)}...  `);

    const runAt = new Date().toISOString();
    let agentAnswer = "";
    let evaluation: OpusEvaluation | null = null;
    let evaluator: "tier-fallback" | "none" = "none";

    try {
      // Step 1: Run corpus agent at selected tier
      const corpusResult = await sessionTierStore.run(
        { tier, disabledAgents: new Set(), sid: `batch-${tc.id}` },
        () => askCorpusAgent(tc.question, {})
      );
      agentAnswer = corpusResult.answer ?? "(nessuna risposta)";

      // Step 2: Evaluate using tier-fallback (free models)
      const evalUserPrompt = `DOMANDA: ${tc.question}

RISPOSTA ATTESA (riferimento corretto):
${tc.expected}

RISPOSTA DELL'AGENTE:
${agentAnswer}

SCOPE / RIFERIMENTI NORMATIVI: ${tc.scope}
ISTITUTI GIURIDICI: ${tc.institutes.join(", ")}
TIPO TRAPPOLA: ${tc.trapType ?? "nessuna"}

CRITERI SPECIFICI:
- PREP: ${tc.scoringHints.prep}
- SEARCH: ${tc.scoringHints.search}
- QUALITY: ${tc.scoringHints.quality}

Valuta la risposta dell'agente rispetto alla risposta attesa.`;

      try {
        const agentResult = await sessionTierStore.run(
          { tier, disabledAgents: new Set(), sid: `eval-${tc.id}` },
          () => runAgent<Partial<OpusEvaluation>>("corpus-agent", evalUserPrompt, {
            systemPrompt: evalSystemPrompt,
          })
        );

        evaluation = parseEval(agentResult.text || JSON.stringify(agentResult.parsed));
        if (evaluation) evaluator = "tier-fallback";
      } catch (evalErr) {
        console.warn(`[EVAL-ERR]`, evalErr instanceof Error ? evalErr.message.slice(0, 60) : evalErr);
      }

      // Step 3: Save result (cleanup old files first)
      const result = {
        testId: tc.id,
        question: tc.question,
        agentAnswer,
        expectedAnswer: tc.expected,
        scoringHints: tc.scoringHints,
        trapType: tc.trapType,
        institutes: tc.institutes,
        scope: tc.scope,
        tier,
        evaluation,
        evaluator,
        runAt,
      };

      // Cleanup old results for this testId
      const oldFiles = fs.readdirSync(qaDir).filter(
        (f) => f.startsWith(`qa-${tc.id}-`) && f.endsWith(".json")
      );
      for (const old of oldFiles) {
        try { fs.unlinkSync(path.join(qaDir, old)); } catch { /* ignore */ }
      }

      const filename = `qa-${tc.id}-${tier}-${Date.now()}.json`;
      fs.writeFileSync(path.join(qaDir, filename), JSON.stringify(result, null, 2));

      // Report
      if (evaluation) {
        const v = evaluation.verdict;
        const color = v === "PASS" ? "\x1b[32m" : v === "BORDERLINE" ? "\x1b[33m" : "\x1b[31m";
        console.log(`${color}${v} ${evaluation.total}/100\x1b[0m`);
        if (v === "PASS") pass++;
        else if (v === "BORDERLINE") borderline++;
        else fail++;
      } else {
        console.log("\x1b[90mno eval\x1b[0m");
      }

    } catch (err) {
      errors++;
      console.log(`\x1b[31mERROR: ${err instanceof Error ? err.message.slice(0, 80) : err}\x1b[0m`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  RISULTATI: ${pass} PASS | ${borderline} BORDERLINE | ${fail} FAIL | ${errors} ERR`);
  console.log(`║  Tempo totale: ${elapsed}s (media ${(parseFloat(elapsed) / testCases.length).toFixed(1)}s/test)`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
