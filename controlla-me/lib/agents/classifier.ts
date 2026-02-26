import { runAgent } from "../ai-sdk/agent-runner";
import { CLASSIFIER_SYSTEM_PROMPT } from "../prompts/classifier";
import type { ClassificationResult } from "../types";

export async function runClassifier(
  documentText: string
): Promise<ClassificationResult> {
  const { parsed, usedFallback } = await runAgent<ClassificationResult>(
    "classifier",
    `Analizza e classifica il seguente documento. Identifica con precisione il sotto-tipo, gli istituti giuridici e le aree di focus legale.\n\n${documentText}`,
    { systemPrompt: CLASSIFIER_SYSTEM_PROMPT }
  );

  if (usedFallback) {
    console.warn("[CLASSIFIER] Usato modello fallback");
  }

  // Ensure new fields have defaults for backward compatibility
  return {
    ...parsed,
    documentSubType: parsed.documentSubType ?? null,
    relevantInstitutes: parsed.relevantInstitutes ?? [],
    legalFocusAreas: parsed.legalFocusAreas ?? [],
  };
}
