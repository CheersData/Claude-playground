import { runClassifier } from "./classifier";
import { runAnalyzer } from "./analyzer";
import { runInvestigator } from "./investigator";
import { runAdvisor } from "./advisor";
import {
  createSession,
  loadSession,
  savePhaseResult,
  savePhaseTiming,
  findSessionByDocument,
} from "../analysis-cache";
import {
  retrieveLegalContext,
  formatLegalContextForPrompt,
} from "../legal-corpus";
import {
  buildRAGContext,
  indexDocument,
  indexAnalysisKnowledge,
} from "../vector-store";
import { isVectorDBEnabled } from "../embeddings";
import type {
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
  AdvisorResult,
  AgentPhase,
  PhaseStatus,
} from "../types";

export interface OrchestratorCallbacks {
  onProgress: (phase: AgentPhase, status: PhaseStatus, data?: unknown) => void;
  onError: (phase: AgentPhase, error: string) => void;
  onComplete: (result: AdvisorResult) => void;
}

export interface OrchestratorResult {
  classification: ClassificationResult | null;
  analysis: AnalysisResult | null;
  investigation: InvestigationResult | null;
  advice: AdvisorResult | null;
  sessionId: string;
}

export async function runOrchestrator(
  documentText: string,
  callbacks: OrchestratorCallbacks,
  resumeSessionId?: string
): Promise<OrchestratorResult> {
  // Try to resume an existing session or find one for this document
  let sessionId: string;
  let cached = resumeSessionId ? await loadSession(resumeSessionId) : null;

  if (!cached) {
    cached = await findSessionByDocument(documentText);
  }

  if (cached) {
    sessionId = cached.sessionId;
    console.log(
      `[ORCHESTRATOR] Ripresa sessione ${sessionId} — ` +
        `classifier: ${cached.classification ? "CACHED" : "da fare"} | ` +
        `analyzer: ${cached.analysis ? "CACHED" : "da fare"} | ` +
        `investigator: ${cached.investigation ? "CACHED" : "da fare"} | ` +
        `advisor: ${cached.advice ? "CACHED" : "da fare"}`
    );
  } else {
    sessionId = await createSession(documentText);
    console.log(`[ORCHESTRATOR] Nuova sessione ${sessionId}`);
  }

  const result: OrchestratorResult = {
    classification: cached?.classification ?? null,
    analysis: cached?.analysis ?? null,
    investigation: cached?.investigation ?? null,
    advice: cached?.advice ?? null,
    sessionId,
  };

  // Helper to track timing for a phase
  const trackPhase = async (startTime: number, phase: Parameters<typeof savePhaseTiming>[1]) => {
    const endTime = Date.now();
    await savePhaseTiming(sessionId, phase, {
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date(endTime).toISOString(),
      durationMs: endTime - startTime,
    });
  };

  // Step 1: Classifier
  if (result.classification) {
    console.log(`[ORCHESTRATOR] Classifier: SKIP (cached)`);
    callbacks.onProgress("classifier", "done", result.classification);
  } else {
    const t0 = Date.now();
    try {
      callbacks.onProgress("classifier", "running");
      result.classification = await runClassifier(documentText);
      await savePhaseResult(sessionId, "classification", result.classification);
      await trackPhase(t0, "classifier");
      callbacks.onProgress("classifier", "done", result.classification);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      callbacks.onError("classifier", message);
      throw new Error(`Classifier failed: ${message}`);
    }
  }

  // Step 1.5: Knowledge Retrieval (RAG) — between Classifier and Analyzer
  // This is the key innovation: we fetch legal context from the vector DB
  // to guide the Analyzer with VERIFIED norms instead of relying on model memory.
  let legalContext = "";
  let ragContext = "";

  try {
    // Retrieve from the legal corpus (actual law articles)
    const legalResult = await retrieveLegalContext({
      applicableLaws: result.classification.applicableLaws,
      relevantInstitutes: result.classification.relevantInstitutes,
      clauseTexts: [], // Will be populated after analysis for investigator
    });

    legalContext = formatLegalContextForPrompt(legalResult);

    if (legalContext) {
      console.log(
        `[ORCHESTRATOR] Contesto normativo recuperato: ${legalContext.length} chars`
      );
    }

    // Retrieve from the knowledge base (past analyses)
    if (isVectorDBEnabled()) {
      const queryForRAG = [
        result.classification.documentTypeLabel,
        result.classification.documentSubType,
        ...(result.classification.relevantInstitutes ?? []),
      ]
        .filter(Boolean)
        .join(" ");

      ragContext = await buildRAGContext(queryForRAG, {
        maxChars: 2000,
        categories: ["clause_pattern", "risk_pattern"],
      });

      if (ragContext) {
        console.log(
          `[ORCHESTRATOR] Contesto RAG recuperato: ${ragContext.length} chars`
        );
      }
    }
  } catch (error) {
    // Knowledge retrieval failure is non-fatal
    console.error(
      `[ORCHESTRATOR] Errore retrieval contesto: ${error instanceof Error ? error.message : "Unknown"}`
    );
  }

  // Step 2: Analyzer (now receives legal context from vector DB)
  if (result.analysis) {
    console.log(`[ORCHESTRATOR] Analyzer: SKIP (cached)`);
    callbacks.onProgress("analyzer", "done", result.analysis);
  } else {
    const t0 = Date.now();
    try {
      callbacks.onProgress("analyzer", "running");
      result.analysis = await runAnalyzer(
        documentText,
        result.classification,
        legalContext || undefined
      );
      await savePhaseResult(sessionId, "analysis", result.analysis);
      await trackPhase(t0, "analyzer");
      callbacks.onProgress("analyzer", "done", result.analysis);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      callbacks.onError("analyzer", message);
      throw new Error(`Analyzer failed: ${message}`);
    }
  }

  // Step 2.5: Retrieve additional legal context for problematic clauses
  // Now that we have the analysis, we can do semantic search with clause texts
  let investigatorLegalContext = legalContext;
  try {
    if (isVectorDBEnabled() && result.analysis.clauses.length > 0) {
      const problematicTexts = result.analysis.clauses
        .filter((c) => ["critical", "high", "medium"].includes(c.riskLevel))
        .map((c) => `${c.title}: ${c.originalText?.slice(0, 200) ?? c.issue}`)
        .slice(0, 5);

      if (problematicTexts.length > 0) {
        const clauseContext = await retrieveLegalContext({
          applicableLaws: result.classification.applicableLaws,
          relevantInstitutes: result.classification.relevantInstitutes,
          clauseTexts: problematicTexts,
        });

        investigatorLegalContext = formatLegalContextForPrompt(clauseContext);
      }
    }
  } catch {
    // Non-fatal
  }

  // Step 3: Investigator (now receives legal context + RAG context)
  if (result.investigation) {
    console.log(`[ORCHESTRATOR] Investigator: SKIP (cached)`);
    callbacks.onProgress("investigator", "done", result.investigation);
  } else {
    const t0 = Date.now();
    try {
      callbacks.onProgress("investigator", "running");
      result.investigation = await runInvestigator(
        result.classification,
        result.analysis,
        investigatorLegalContext || undefined,
        ragContext || undefined
      );
      await savePhaseResult(sessionId, "investigation", result.investigation);
      await trackPhase(t0, "investigator");
      callbacks.onProgress("investigator", "done", result.investigation);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      callbacks.onError("investigator", message);
      // Investigator failure is non-fatal — continue with empty findings
      result.investigation = { findings: [] };
      await savePhaseResult(sessionId, "investigation", result.investigation);
      await trackPhase(t0, "investigator");
      callbacks.onProgress("investigator", "done", result.investigation);
    }
  }

  // Step 4: Advisor (now receives RAG context for market calibration)
  if (result.advice) {
    console.log(`[ORCHESTRATOR] Advisor: SKIP (cached)`);
    callbacks.onProgress("advisor", "done", result.advice);
    callbacks.onComplete(result.advice);
  } else {
    const t0 = Date.now();
    try {
      callbacks.onProgress("advisor", "running");
      result.advice = await runAdvisor(
        result.classification,
        result.analysis,
        result.investigation,
        ragContext || undefined
      );
      await savePhaseResult(sessionId, "advice", result.advice);
      await trackPhase(t0, "advisor");
      callbacks.onProgress("advisor", "done", result.advice);
      callbacks.onComplete(result.advice);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      callbacks.onError("advisor", message);
      throw new Error(`Advisor failed: ${message}`);
    }
  }

  // Step 5: Auto-index in vector DB (background, non-blocking)
  // Every completed analysis enriches the collective intelligence.
  if (
    result.classification &&
    result.analysis &&
    result.investigation &&
    result.advice
  ) {
    autoIndexAnalysis(
      sessionId,
      documentText,
      result.classification,
      result.analysis,
      result.investigation,
      result.advice
    ).catch((err) =>
      console.error(
        `[ORCHESTRATOR] Errore auto-indexing: ${err instanceof Error ? err.message : "Unknown"}`
      )
    );
  }

  return result;
}

/**
 * Auto-index a completed analysis in the vector DB.
 * Runs in background (fire-and-forget) to not slow down the response.
 */
async function autoIndexAnalysis(
  sessionId: string,
  documentText: string,
  classification: ClassificationResult,
  analysis: AnalysisResult,
  investigation: InvestigationResult,
  advice: AdvisorResult
): Promise<void> {
  if (!isVectorDBEnabled()) return;

  const t0 = Date.now();

  // Index document chunks (for finding similar documents in the future)
  const docResult = await indexDocument(sessionId, documentText, classification);

  // Index knowledge (laws, court cases, clause patterns, risk patterns)
  const knowledgeResult = await indexAnalysisKnowledge(
    sessionId,
    classification,
    analysis,
    investigation,
    advice
  );

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[ORCHESTRATOR] Auto-indexing completato in ${elapsed}s | ` +
      `chunk: ${docResult?.chunksIndexed ?? 0} | ` +
      `knowledge: ${knowledgeResult?.entriesIndexed ?? 0}`
  );
}
