import { runClassifier } from "./classifier";
import { runAnalyzer } from "./analyzer";
import { runInvestigator } from "./investigator";
import { runAdvisor } from "./advisor";
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
}

export async function runOrchestrator(
  documentText: string,
  callbacks: OrchestratorCallbacks
): Promise<OrchestratorResult> {
  const result: OrchestratorResult = {
    classification: null,
    analysis: null,
    investigation: null,
    advice: null,
  };

  // Step 1: Classifier
  try {
    callbacks.onProgress("classifier", "running");
    result.classification = await runClassifier(documentText);
    callbacks.onProgress("classifier", "done", result.classification);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    callbacks.onError("classifier", message);
    throw new Error(`Classifier failed: ${message}`);
  }

  // Step 2: Analyzer
  try {
    callbacks.onProgress("analyzer", "running");
    result.analysis = await runAnalyzer(documentText, result.classification);
    callbacks.onProgress("analyzer", "done", result.analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    callbacks.onError("analyzer", message);
    throw new Error(`Analyzer failed: ${message}`);
  }

  // Step 3: Investigator
  try {
    callbacks.onProgress("investigator", "running");
    result.investigation = await runInvestigator(
      result.classification,
      result.analysis
    );
    callbacks.onProgress("investigator", "done", result.investigation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    callbacks.onError("investigator", message);
    // Investigator failure is non-fatal — continue with empty findings
    result.investigation = { findings: [] };
    callbacks.onProgress("investigator", "done", result.investigation);
  }

  // Step 4: Advisor
  try {
    callbacks.onProgress("advisor", "running");
    result.advice = await runAdvisor(
      result.classification,
      result.analysis,
      result.investigation
    );
    callbacks.onProgress("advisor", "done", result.advice);
    callbacks.onComplete(result.advice);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    callbacks.onError("advisor", message);
    throw new Error(`Advisor failed: ${message}`);
  }

  return result;
}
