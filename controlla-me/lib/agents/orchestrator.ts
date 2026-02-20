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

  // Step 2: Analyzer
  if (result.analysis) {
    console.log(`[ORCHESTRATOR] Analyzer: SKIP (cached)`);
    callbacks.onProgress("analyzer", "done", result.analysis);
  } else {
    const t0 = Date.now();
    try {
      callbacks.onProgress("analyzer", "running");
      result.analysis = await runAnalyzer(documentText, result.classification);
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

  // Step 3: Investigator
  if (result.investigation) {
    console.log(`[ORCHESTRATOR] Investigator: SKIP (cached)`);
    callbacks.onProgress("investigator", "done", result.investigation);
  } else {
    const t0 = Date.now();
    try {
      callbacks.onProgress("investigator", "running");
      result.investigation = await runInvestigator(
        result.classification,
        result.analysis
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

  // Step 4: Advisor
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
        result.investigation
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

  return result;
}
