#!/usr/bin/env tsx
/**
 * eval-runner.ts — Harness di valutazione adversariale per agenti legali.
 *
 * Esegue i contratti del golden dataset attraverso la pipeline reale
 * (Classifier → Analyzer → Advisor) e valuta l'output contro le rubrics.
 *
 * ⚠️  RICHIEDE CREDITI API REALI — non funziona in ambiente demo.
 * ⚠️  Non è un test Vitest: è uno script eseguito manualmente.
 *
 * UTILIZZO:
 *   npx tsx tests/eval/eval-runner.ts               # tutti i contratti
 *   npx tsx tests/eval/eval-runner.ts --id 01       # solo il contratto 01
 *   npx tsx tests/eval/eval-runner.ts --verbose      # output completo agenti
 *   npx tsx tests/eval/eval-runner.ts --fail-fast    # ferma al primo fail
 *
 * OUTPUT:
 *   Report leggibile su stdout + file JSON in tests/eval/results/
 */

import * as fs from "fs";
import * as path from "path";
import { EVAL_RUBRICS, type EvalRubric, type ClauseCheck } from "./rubrics";

// ─── Importa agenti reali ─────────────────────────────────────────────────────
// Nota: in ambiente demo questi import funzionano ma le chiamate API falliscono
import { runClassifier } from "@/lib/agents/classifier";
import { runAnalyzer } from "@/lib/agents/analyzer";
import { runAdvisor } from "@/lib/agents/advisor";
import type {
  ClassificationResult,
  AnalysisResult,
  AdvisorResult,
  InvestigationResult,
} from "@/lib/types";

// ─── Tipi risultato eval ──────────────────────────────────────────────────────

interface ClauseCheckResult {
  check: ClauseCheck;
  passed: boolean;
  foundIn?: string; // testo della clausola rilevata
  detectedSeverity?: string;
}

interface EvalResult {
  rubricId: string;
  rubricName: string;
  passed: boolean;
  durationMs: number;

  // Output agenti
  classification?: ClassificationResult;
  analysis?: AnalysisResult;
  advisor?: AdvisorResult;
  error?: string;

  // Checks
  documentTypeCheck: { expected: string; actual: string; passed: boolean };
  clauseChecks: ClauseCheckResult[];
  scoreCheck: { maxAllowed: number; actual: number; passed: boolean };
  needsLawyerCheck: { expected: boolean; actual: boolean; passed: boolean };
  halluccinationChecks: { trigger: string; found: boolean }[];

  // Sommario
  failedChecks: string[];
  passedChecks: number;
  totalChecks: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadContract(rubric: EvalRubric): string {
  const contractPath = path.resolve(__dirname, rubric.contractFile);
  if (!fs.existsSync(contractPath)) {
    throw new Error(`Contratto non trovato: ${contractPath}`);
  }
  return fs.readFileSync(contractPath, "utf-8");
}

function checkClause(
  check: ClauseCheck,
  analysis: AnalysisResult
): ClauseCheckResult {
  const keyword = check.keyword.toLowerCase();
  const severityOrder = { critical: 3, high: 2, medium: 1, low: 0, info: -1 };
  const minSeverityScore = severityOrder[check.minSeverity];

  // Cerca il keyword in tutte le clausole rilevate
  for (const clause of analysis.clauses) {
    const searchableText = [
      clause.title,
      clause.originalText,
      clause.issue,
      clause.potentialViolation,
    ]
      .join(" ")
      .toLowerCase();

    if (searchableText.includes(keyword)) {
      const clauseSeverityScore =
        severityOrder[clause.riskLevel as keyof typeof severityOrder] ?? -1;
      const severityOk = clauseSeverityScore >= minSeverityScore;

      return {
        check,
        passed: severityOk,
        foundIn: clause.title,
        detectedSeverity: clause.riskLevel,
      };
    }
  }

  // Keyword non trovato in nessuna clausola
  return { check, passed: false };
}

function checkHallucinantion(
  trigger: string,
  investigation: InvestigationResult | null
): { trigger: string; found: boolean } {
  if (!investigation) return { trigger, found: false };

  // Cerca in tutte le findings se il trigger appare con linguaggio di certezza
  const allText = JSON.stringify(investigation).toLowerCase();
  const found = allText.includes(trigger.toLowerCase());
  return { trigger, found };
}

function emptyInvestigation(): InvestigationResult {
  return { findings: [] };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Eval singolo contratto ───────────────────────────────────────────────────

async function evalContract(
  rubric: EvalRubric,
  verbose: boolean
): Promise<EvalResult> {
  const startTime = Date.now();
  console.log(`\n${"─".repeat(60)}`);
  console.log(`▶  ${rubric.id} — ${rubric.name}`);
  console.log(`${"─".repeat(60)}`);

  let contractText: string;
  try {
    contractText = loadContract(rubric);
    console.log(
      `   Contratto caricato: ${contractText.length} caratteri`
    );
  } catch (e) {
    return {
      rubricId: rubric.id,
      rubricName: rubric.name,
      passed: false,
      durationMs: Date.now() - startTime,
      documentTypeCheck: { expected: rubric.expectedDocumentType, actual: "", passed: false },
      clauseChecks: [],
      scoreCheck: { maxAllowed: rubric.maxFairnessScore, actual: 0, passed: false },
      needsLawyerCheck: { expected: rubric.expectNeedsLawyer, actual: false, passed: false },
      halluccinationChecks: [],
      error: String(e),
      failedChecks: [`Contratto non caricato: ${e}`],
      passedChecks: 0,
      totalChecks: 1,
    };
  }

  // ── [1] Classifier ─────────────────────────────────────────────────────────
  let classification: ClassificationResult;
  try {
    console.log("   [1/3] Classifier...");
    classification = await runClassifier(contractText);
    if (verbose) {
      console.log(`         → tipo: ${classification.documentType}`);
      console.log(`         → sotto-tipo: ${classification.documentSubType}`);
    }
  } catch (e) {
    const errMsg = `Classifier fallito: ${e}`;
    console.error(`   ❌ ${errMsg}`);
    return buildErrorResult(rubric, startTime, errMsg);
  }

  // ── [2] Analyzer ───────────────────────────────────────────────────────────
  let analysis: AnalysisResult;
  try {
    console.log("   [2/3] Analyzer...");
    analysis = await runAnalyzer(contractText, classification);
    if (verbose) {
      console.log(
        `         → clausole rilevate: ${analysis.clauses.length}, rischio: ${analysis.overallRisk}`
      );
    }
  } catch (e) {
    const errMsg = `Analyzer fallito: ${e}`;
    console.error(`   ❌ ${errMsg}`);
    return buildErrorResult(rubric, startTime, errMsg, classification);
  }

  // ── [3] Advisor ────────────────────────────────────────────────────────────
  // Skipping Investigator (usa web_search = costoso). Passiamo findings vuoti.
  const emptyInv = emptyInvestigation();
  let advisor: AdvisorResult;
  try {
    console.log("   [3/3] Advisor...");
    advisor = await runAdvisor(classification, analysis, emptyInv);
    if (verbose) {
      console.log(
        `         → fairnessScore: ${advisor.fairnessScore}, needsLawyer: ${advisor.needsLawyer}`
      );
    }
  } catch (e) {
    const errMsg = `Advisor fallito: ${e}`;
    console.error(`   ❌ ${errMsg}`);
    return buildErrorResult(rubric, startTime, errMsg, classification, analysis);
  }

  // ── Valutazione ────────────────────────────────────────────────────────────
  const failedChecks: string[] = [];

  // Check tipo documento
  const typeActual = classification.documentType;
  const typeExpected = rubric.expectedDocumentType;
  const typeMatch =
    typeActual.toLowerCase().includes(typeExpected.toLowerCase()) ||
    typeExpected.toLowerCase().includes(typeActual.toLowerCase());
  const documentTypeCheck = {
    expected: typeExpected,
    actual: typeActual,
    passed: typeMatch,
  };
  if (!typeMatch) {
    failedChecks.push(
      `Tipo documento: atteso "${typeExpected}", ricevuto "${typeActual}"`
    );
  }

  // Check clausole
  const clauseChecks = rubric.mustDetectClauses.map((check) =>
    checkClause(check, analysis)
  );
  for (const r of clauseChecks) {
    if (!r.passed) {
      const foundMsg = r.foundIn
        ? `trovata in "${r.foundIn}" ma severità "${r.detectedSeverity}" < "${r.check.minSeverity}"`
        : `NON rilevata`;
      failedChecks.push(`Clausola mancante [${r.check.keyword}]: ${foundMsg}`);
    }
  }

  // Check score
  const scoreActual = advisor.fairnessScore ?? 5;
  const scoreCheck = {
    maxAllowed: rubric.maxFairnessScore,
    actual: scoreActual,
    passed: scoreActual <= rubric.maxFairnessScore,
  };
  if (!scoreCheck.passed) {
    failedChecks.push(
      `Score troppo alto: ${scoreActual} > max ${rubric.maxFairnessScore} (contratto problematico non adeguatamente penalizzato)`
    );
  }

  // Check needsLawyer
  const lawyerActual = advisor.needsLawyer ?? false;
  const needsLawyerCheck = {
    expected: rubric.expectNeedsLawyer,
    actual: lawyerActual,
    passed: lawyerActual === rubric.expectNeedsLawyer,
  };
  if (!needsLawyerCheck.passed) {
    failedChecks.push(
      `needsLawyer: atteso ${rubric.expectNeedsLawyer}, ricevuto ${lawyerActual}`
    );
  }

  // Check hallucination (solo da investigation — qui Investigator skippato)
  const halluccinationChecks = (rubric.halluccinationTriggers ?? []).map(
    (trigger) => checkHallucinantion(trigger, null) // passiamo null = no investigation
  );

  const totalChecks =
    1 + clauseChecks.length + 1 + 1 + halluccinationChecks.length;
  const passedChecks = totalChecks - failedChecks.length;
  const passed = failedChecks.length === 0;

  const durationMs = Date.now() - startTime;
  console.log(
    `   ${passed ? "✅" : "❌"} ${passedChecks}/${totalChecks} checks — ${formatDuration(durationMs)}`
  );
  if (!passed) {
    for (const f of failedChecks) {
      console.log(`      ↳ FAIL: ${f}`);
    }
  }

  return {
    rubricId: rubric.id,
    rubricName: rubric.name,
    passed,
    durationMs,
    classification,
    analysis,
    advisor,
    documentTypeCheck,
    clauseChecks,
    scoreCheck,
    needsLawyerCheck,
    halluccinationChecks,
    failedChecks,
    passedChecks,
    totalChecks,
  };
}

function buildErrorResult(
  rubric: EvalRubric,
  startTime: number,
  error: string,
  classification?: ClassificationResult,
  analysis?: AnalysisResult
): EvalResult {
  return {
    rubricId: rubric.id,
    rubricName: rubric.name,
    passed: false,
    durationMs: Date.now() - startTime,
    classification,
    analysis,
    documentTypeCheck: {
      expected: rubric.expectedDocumentType,
      actual: classification?.documentType ?? "n/a",
      passed: false,
    },
    clauseChecks: [],
    scoreCheck: { maxAllowed: rubric.maxFairnessScore, actual: 0, passed: false },
    needsLawyerCheck: { expected: rubric.expectNeedsLawyer, actual: false, passed: false },
    halluccinationChecks: [],
    error,
    failedChecks: [`Errore pipeline: ${error}`],
    passedChecks: 0,
    totalChecks: 1,
  };
}

// ─── Report finale ────────────────────────────────────────────────────────────

function printFinalReport(results: EvalResult[]): void {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  EVAL REPORT — Agenti Legali Controlla.me`);
  console.log(`  Data: ${new Date().toISOString()}`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  Contratti testati: ${total}`);
  console.log(`  Passati: ${passed} ✅`);
  console.log(`  Falliti: ${failed} ${failed > 0 ? "❌" : ""}`);
  console.log(`${"─".repeat(60)}`);

  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    const score = r.advisor?.fairnessScore ?? "n/a";
    const clauses = r.analysis?.clauses.length ?? 0;
    console.log(
      `  ${icon} ${r.rubricId.padEnd(40)} score=${score}  clausole=${clauses}  ${formatDuration(r.durationMs)}`
    );
    if (!r.passed) {
      for (const f of r.failedChecks) {
        console.log(`       ↳ ${f}`);
      }
    }
  }

  console.log(`${"═".repeat(60)}`);

  if (failed > 0) {
    console.log(
      `\n⚠️  ${failed} contratt${failed === 1 ? "o" : "i"} non superato.`
    );
    console.log(
      `   Analizzare gli output degli agenti e migliorare i prompt.\n`
    );
  } else {
    console.log(`\n🎉 Tutti i contratti superati!\n`);
  }
}

function saveResults(results: EvalResult[]): void {
  const resultsDir = path.resolve(__dirname, "results");
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = path.join(resultsDir, `eval-${timestamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`   Risultati salvati in: ${outPath}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const failFast = args.includes("--fail-fast");
  const idFilter = args.find((a) => a.startsWith("--id="))?.split("=")[1];

  console.log(`\n🔍 Controlla.me — Eval Suite Adversariale`);
  console.log(
    `   ⚠️  Richiede crediti API reali. Non funziona in ambiente demo.\n`
  );

  let rubrics = EVAL_RUBRICS;
  if (idFilter) {
    rubrics = rubrics.filter((r) => r.id.startsWith(idFilter));
    if (rubrics.length === 0) {
      console.error(`Nessuna rubric trovata per --id=${idFilter}`);
      process.exit(1);
    }
    console.log(`   Filtro attivo: --id=${idFilter} (${rubrics.length} contratt${rubrics.length === 1 ? "o" : "i"})`);
  }

  const results: EvalResult[] = [];

  for (const rubric of rubrics) {
    const result = await evalContract(rubric, verbose);
    results.push(result);

    if (failFast && !result.passed) {
      console.log(`\n⛔ --fail-fast: interruzione al primo fallimento.`);
      break;
    }
  }

  printFinalReport(results);
  saveResults(results);

  const anyFailed = results.some((r) => !r.passed);
  process.exit(anyFailed ? 1 : 0);
}

main().catch((e) => {
  console.error("Errore fatale:", e);
  process.exit(1);
});
