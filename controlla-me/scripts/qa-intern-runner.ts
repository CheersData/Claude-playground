/**
 * QA Intern Runner — Testa tutte le 50 domande legal-qa in tier intern
 *
 * Uso: npx tsx scripts/qa-intern-runner.ts
 * Opzioni:
 *   --block A      → filtra solo blocco A
 *   --id TC21      → testa solo TC21
 *   --concurrency 3 → domande in parallelo (default 1)
 *   --tier intern  → tier da usare (default intern)
 */

import { createHmac, randomBytes } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const DEV_SECRET = "dev-console-secret-CHANGE-IN-PRODUCTION-min32chars!!";

// ─── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const TIER = getArg("tier") ?? "intern";
const BLOCK_FILTER = getArg("block") ?? null;
const ID_FILTER = getArg("id") ?? null;
const CONCURRENCY = parseInt(getArg("concurrency") ?? "1", 10);

// ─── Token generation ────────────────────────────────────────────────────────

function generateToken(tier: string): string {
  const payload = {
    nome: "QA",
    cognome: "Runner",
    ruolo: "tester",
    sid: randomBytes(16).toString("hex"),
    tier,
    disabledAgents: [],
    iat: Date.now(),
    exp: Date.now() + 24 * 3600 * 1000,
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", DEV_SECRET).update(b64).digest("hex");
  return `${b64}.${sig}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface TestCase {
  id: string;
  block: string;
  blockName: string;
  difficulty: string;
  question: string;
  expected: string;
  trapType: string | null;
  institutes: string[];
  scope: string;
  scoringHints: { prep: string; search: string; quality: string };
}

interface TestResult {
  testId: string;
  block: string;
  blockName: string;
  difficulty: string;
  question: string;
  expected: string;
  trapType: string | null;
  tier: string;
  agentAnswer: string | null;
  evaluation: {
    prep: number;
    search: number;
    quality: number;
    total: number;
    verdict: string;
    reasoning: string;
  } | null;
  error: string | null;
  durationMs: number;
}

// ─── Load test cases ─────────────────────────────────────────────────────────

const testCasesPath = resolve(__dirname, "../tests/legal-qa/test-cases.json");
const allTestCases: TestCase[] = JSON.parse(readFileSync(testCasesPath, "utf-8"));

let testCases = allTestCases;
if (BLOCK_FILTER) {
  testCases = testCases.filter((t) => t.block === BLOCK_FILTER.toUpperCase());
}
if (ID_FILTER) {
  testCases = testCases.filter((t) => t.id === ID_FILTER.toUpperCase());
}

// ─── Run single test ─────────────────────────────────────────────────────────

async function runTest(tc: TestCase, token: string): Promise<TestResult> {
  const start = Date.now();
  const result: TestResult = {
    testId: tc.id,
    block: tc.block,
    blockName: tc.blockName,
    difficulty: tc.difficulty,
    question: tc.question,
    expected: tc.expected,
    trapType: tc.trapType,
    tier: TIER,
    agentAnswer: null,
    evaluation: null,
    error: null,
    durationMs: 0,
  };

  try {
    const res = await fetch(`${BASE_URL}/api/company/legal-qa-tests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "run",
        testId: tc.id,
        question: tc.question,
        tier: TIER,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      result.error = data.error ?? `HTTP ${res.status}`;
    } else {
      result.agentAnswer = data.agentAnswer ?? null;
      result.evaluation = data.evaluation ?? null;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  result.durationMs = Date.now() - start;
  return result;
}

// ─── Batch runner with concurrency ───────────────────────────────────────────

async function runBatch(
  tests: TestCase[],
  token: string,
  concurrency: number
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let idx = 0;

  async function worker() {
    while (idx < tests.length) {
      const current = idx++;
      const tc = tests[current];
      const prefix = `[${current + 1}/${tests.length}]`;
      console.log(`${prefix} ${tc.id} (${tc.block}) "${tc.question.slice(0, 60)}..."`);

      const result = await runTest(tc, token);

      if (result.error) {
        console.log(`  ❌ ERRORE: ${result.error} (${result.durationMs}ms)`);
      } else if (result.evaluation) {
        const v = result.evaluation;
        const emoji = v.verdict === "PASS" ? "✅" : v.verdict === "BORDERLINE" ? "🟡" : "❌";
        console.log(
          `  ${emoji} ${v.verdict} ${v.total}/100 (P:${v.prep} S:${v.search} Q:${v.quality}) — ${result.durationMs}ms`
        );
      } else {
        console.log(`  📝 Risposta ricevuta (no eval) — ${result.durationMs}ms`);
        // Mostra un preview della risposta
        const preview = (result.agentAnswer ?? "").slice(0, 120);
        console.log(`     "${preview}..."`);
      }

      results.push(result);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tests.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

// ─── Summary ─────────────────────────────────────────────────────────────────

function printSummary(results: TestResult[]) {
  console.log("\n" + "═".repeat(80));
  console.log("RIEPILOGO QA INTERN TIER");
  console.log("═".repeat(80));

  const errors = results.filter((r) => r.error);
  const withAnswer = results.filter((r) => r.agentAnswer && !r.error);
  const withEval = results.filter((r) => r.evaluation);

  console.log(`\nTotale test: ${results.length}`);
  console.log(`Risposte ricevute: ${withAnswer.length}`);
  console.log(`Errori: ${errors.length}`);
  console.log(`Con valutazione Opus: ${withEval.length}`);

  if (withEval.length > 0) {
    const pass = withEval.filter((r) => r.evaluation!.verdict === "PASS").length;
    const borderline = withEval.filter((r) => r.evaluation!.verdict === "BORDERLINE").length;
    const fail = withEval.filter((r) => r.evaluation!.verdict === "FAIL").length;
    const avgTotal = withEval.reduce((s, r) => s + r.evaluation!.total, 0) / withEval.length;
    const avgPrep = withEval.reduce((s, r) => s + r.evaluation!.prep, 0) / withEval.length;
    const avgSearch = withEval.reduce((s, r) => s + r.evaluation!.search, 0) / withEval.length;
    const avgQuality = withEval.reduce((s, r) => s + r.evaluation!.quality, 0) / withEval.length;

    console.log(`\n✅ PASS: ${pass} | 🟡 BORDERLINE: ${borderline} | ❌ FAIL: ${fail}`);
    console.log(`Punteggio medio: ${avgTotal.toFixed(1)}/100`);
    console.log(`  PREP:    ${avgPrep.toFixed(1)}/30`);
    console.log(`  SEARCH:  ${avgSearch.toFixed(1)}/30`);
    console.log(`  QUALITY: ${avgQuality.toFixed(1)}/40`);

    // Per blocco
    console.log("\nPer blocco:");
    const blocks = new Map<string, TestResult[]>();
    for (const r of withEval) {
      const key = `${r.block} - ${r.blockName}`;
      if (!blocks.has(key)) blocks.set(key, []);
      blocks.get(key)!.push(r);
    }
    for (const [block, bResults] of blocks) {
      const avg = bResults.reduce((s, r) => s + r.evaluation!.total, 0) / bResults.length;
      const passCount = bResults.filter((r) => r.evaluation!.verdict === "PASS").length;
      console.log(`  ${block}: ${avg.toFixed(1)}/100 (${passCount}/${bResults.length} pass)`);
    }
  }

  // Tempo totale
  const totalTime = results.reduce((s, r) => s + r.durationMs, 0);
  const avgTime = totalTime / results.length;
  console.log(`\nTempo totale: ${(totalTime / 1000).toFixed(1)}s (media: ${(avgTime / 1000).toFixed(1)}s/domanda)`);

  // Errori
  if (errors.length > 0) {
    console.log("\nErrori:");
    for (const r of errors) {
      console.log(`  ${r.testId}: ${r.error}`);
    }
  }

  // Risposte senza valutazione - mostra preview
  if (withAnswer.length > 0 && withEval.length === 0) {
    console.log("\n📝 Preview risposte (no valutazione Opus disponibile):");
    console.log("-".repeat(80));
    for (const r of withAnswer) {
      const answer = r.agentAnswer ?? "";
      const shortAnswer = answer.length > 200 ? answer.slice(0, 200) + "..." : answer;
      console.log(`\n${r.testId} [${r.block}] (${r.difficulty}) — ${r.durationMs}ms`);
      console.log(`  Q: ${r.question}`);
      console.log(`  A: ${shortAnswer}`);
      console.log(`  Expected: ${r.expected}`);
      if (r.trapType) console.log(`  ⚠️ Trappola: ${r.trapType}`);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═".repeat(80));
  console.log(`QA INTERN RUNNER — ${testCases.length} domande, tier: ${TIER}, concurrency: ${CONCURRENCY}`);
  console.log("═".repeat(80));

  if (testCases.length === 0) {
    console.log("Nessun test case trovato con i filtri specificati.");
    process.exit(1);
  }

  // Genera token
  const token = generateToken(TIER);
  console.log(`Token generato per tier ${TIER}\n`);

  // Check server
  try {
    const health = await fetch(`${BASE_URL}`, { method: "HEAD" });
    if (!health.ok) {
      console.error(`Server non raggiungibile: HTTP ${health.status}`);
      process.exit(1);
    }
  } catch {
    console.error(`Server non raggiungibile su ${BASE_URL}. Avvia con 'npm run dev'.`);
    process.exit(1);
  }

  // Run tests
  const results = await runBatch(testCases, token, CONCURRENCY);

  // Summary
  printSummary(results);

  // Save results
  const outputDir = resolve(__dirname, "../company/autorun-logs");
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputPath = resolve(outputDir, `qa-intern-${timestamp}.json`);
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 Risultati salvati in: ${outputPath}`);
}

main().catch((err) => {
  console.error("Errore fatale:", err);
  process.exit(1);
});
