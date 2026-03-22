import { runAgent } from "../ai-sdk/agent-runner";
import { CRITIC_SYSTEM_PROMPT } from "../prompts/critic";
import type {
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
  AdvisorResult,
  CriticResult,
} from "../types";

/**
 * Critic agent — revisione interna della pipeline.
 *
 * Riceve l'output di tutte le fasi precedenti e verifica coerenza,
 * calibrazione e completezza dell'advice finale.
 * Usa modelli economici (è un passaggio di validazione, non creativo).
 */
export async function runCritic(
  classification: ClassificationResult,
  analysis: AnalysisResult,
  investigation: InvestigationResult,
  advice: AdvisorResult
): Promise<CriticResult> {
  const userMessageParts = [
    `Classificazione: ${JSON.stringify(classification)}`,
    `\nAnalisi clausole: ${JSON.stringify(analysis)}`,
    `\nRicerca normativa: ${JSON.stringify(investigation)}`,
    `\nAdvice finale da verificare: ${JSON.stringify(advice)}`,
    `\nVerifica coerenza, calibrazione e completezza dell'advice rispetto ai dati delle fasi precedenti.`,
  ];

  const { parsed: result } = await runAgent<CriticResult>(
    "critic",
    userMessageParts.join("\n"),
    { systemPrompt: CRITIC_SYSTEM_PROMPT }
  );

  // Enforce max 3 issues
  if (result.issues && result.issues.length > 3) {
    console.warn(`[CRITIC] ${result.issues.length} issues trovati, troncato a 3`);
    result.issues = result.issues.slice(0, 3);
  }

  // Ensure issues array exists
  if (!result.issues) {
    result.issues = [];
  }

  return result;
}
