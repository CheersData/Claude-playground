/**
 * Agenti Q&A del Legal Office Orchestrator.
 *
 * Wrapper thin che chiamano runAgent() con i prompt Q&A dedicati.
 * L'Investigatore Q&A riusa runDeepSearch() esistente (web_search nativo).
 */

import { runAgent } from "../ai-sdk/agent-runner";
import {
  LEADER_ROUTER_SYSTEM,
  CLASSIFIER_QA_SYSTEM,
  ANALYZER_QA_SYSTEM,
  INVESTIGATOR_QA_SYSTEM,
  ADVISOR_QA_SYSTEM,
  buildLeaderRouterPrompt,
  buildClassifierQAPrompt,
  buildAnalyzerQAPrompt,
  buildInvestigatorQAPrompt,
  buildAdvisorQAPrompt,
} from "../prompts/legaloffice-qa";

// ── Types ─────────────────────────────────────────────────────────────────────

export type QARoute =
  | "qa-simple"
  | "qa-standard"
  | "qa-full"
  | "document-followup"
  | "clarification";

export type QAAgentId = "classifier" | "analyzer" | "investigator" | "advisor";

export interface LegalOfficeLeaderDecision {
  route: QARoute;
  agents: QAAgentId[];
  question: string;
  reasoning: string;
  clarificationQuestion?: string | null;
}

export interface QAClassificationResult {
  questionType: string;
  questionTypeLabel: string;
  applicableLaws: Array<{ reference: string; name: string }>;
  relevantInstitutes: string[];
  legalFocusAreas: string[];
  jurisdiction: string;
  summary: string;
  confidence: number;
}

export interface QAAnalysisResult {
  riskAssessment: "alto" | "medio" | "basso";
  keyIssues: Array<{
    issue: string;
    legalBasis: string;
    impactLevel: "high" | "medium" | "low";
    partyAtRisk: string;
  }>;
  partyWeakness: string;
  missingInfo: string[];
}

export interface QAAdvisorResult {
  answer: string;
  actionPoints: Array<{ priority: number; action: string }>;
  needsLawyer: boolean;
  lawyerReason: string | null;
  confidence: number;
}

export interface QAInvestigatorResult {
  response: string;
  sources: Array<{ url: string; title: string; excerpt: string }>;
}

// ── Leader Router ─────────────────────────────────────────────────────────────

/**
 * Il Leader decide quale route seguire e quali agenti attivare.
 * Risposta veloce (max 400 token), modello leggero.
 */
export async function runLegalOfficeRouter(
  message: string,
  hasDocumentContext: boolean,
  phaseResults: Record<string, unknown>,
  conversationHistory?: Array<{ role: string; content: string }>
): Promise<LegalOfficeLeaderDecision> {
  const phaseResultsSummary =
    Object.keys(phaseResults).length > 0
      ? Object.keys(phaseResults).join(", ")
      : "";

  const prompt = buildLeaderRouterPrompt(
    message,
    hasDocumentContext,
    phaseResultsSummary,
    conversationHistory
  );

  const result = await runAgent<LegalOfficeLeaderDecision>("leader", prompt, {
    systemPrompt: LEADER_ROUTER_SYSTEM,
    maxTokens: 400,
    temperature: 0.1,
    agentName: "LEGALOFFICE-ROUTER",
  });

  // Sanitize: assicura che agents sia sempre un array valido
  const decision = result.parsed;
  if (!Array.isArray(decision.agents)) {
    decision.agents = ["investigator"] as QAAgentId[];
  }
  if (!decision.question?.trim()) {
    decision.question = message;
  }

  return decision;
}

// ── Classificatore Q&A ────────────────────────────────────────────────────────

export async function runQAClassifier(
  question: string
): Promise<QAClassificationResult> {
  const prompt = buildClassifierQAPrompt(question);

  const result = await runAgent<QAClassificationResult>("classifier", prompt, {
    systemPrompt: CLASSIFIER_QA_SYSTEM,
    maxTokens: 1024,
    temperature: 0.2,
    agentName: "LEGALOFFICE-CLASSIFIER-QA",
  });

  return result.parsed;
}

// ── Analista Q&A ──────────────────────────────────────────────────────────────

export async function runQAAnalyzer(
  question: string,
  classifierOutput?: QAClassificationResult | null
): Promise<QAAnalysisResult> {
  const prompt = buildAnalyzerQAPrompt(
    question,
    classifierOutput as Record<string, unknown> | null
  );

  const result = await runAgent<QAAnalysisResult>("analyzer", prompt, {
    systemPrompt: ANALYZER_QA_SYSTEM,
    maxTokens: 1024,
    temperature: 0.2,
    agentName: "LEGALOFFICE-ANALYZER-QA",
  });

  return result.parsed;
}

// ── Giurista (Investigatore) Q&A — analisi normativa senza web_search ────────

export async function runQAInvestigator(
  question: string,
  classifierOutput?: QAClassificationResult | null,
  analyzerOutput?: QAAnalysisResult | null,
  conversationHistory?: Array<{ role: string; content: string }>,
  legalContext?: string,
  ragContext?: string
): Promise<QAInvestigatorResult> {
  const prompt = buildInvestigatorQAPrompt(
    question,
    classifierOutput as Record<string, unknown> | null,
    analyzerOutput as Record<string, unknown> | null,
    conversationHistory,
    legalContext,
    ragContext
  );

  const result = await runAgent<QAInvestigatorResult>("investigator", prompt, {
    systemPrompt: INVESTIGATOR_QA_SYSTEM,
    maxTokens: 1536,
    temperature: 0.2,
    agentName: "LEGALOFFICE-INVESTIGATOR-QA",
  });

  return result.parsed;
}

// ── Consulente Q&A ────────────────────────────────────────────────────────────

export async function runQAAdvisor(
  question: string,
  agentOutputs: Record<string, unknown>
): Promise<QAAdvisorResult> {
  const prompt = buildAdvisorQAPrompt(question, agentOutputs);

  const result = await runAgent<QAAdvisorResult>("advisor", prompt, {
    systemPrompt: ADVISOR_QA_SYSTEM,
    maxTokens: 1024,
    temperature: 0.3,
    agentName: "LEGALOFFICE-ADVISOR-QA",
  });

  return result.parsed;
}
