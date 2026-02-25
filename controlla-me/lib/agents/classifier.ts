import { runAgent } from "../ai-sdk/agent-runner";
import { CLASSIFIER_SYSTEM_PROMPT } from "../prompts/classifier";
import type { ClassificationResult } from "../types";

export async function runClassifier(
  documentText: string
): Promise<ClassificationResult> {
  const response = await anthropic.messages.create({
    model: MODEL_FAST,
    max_tokens: 4096,
    system: CLASSIFIER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Analizza e classifica il seguente documento. Identifica con precisione il sotto-tipo, gli istituti giuridici e le aree di focus legale.\n\n${documentText}`,
      },
    ],
  });

  if (usedFallback) {
    console.warn("[CLASSIFIER] Usato modello fallback");
  }

  const text = extractTextContent(response);
  const result = parseAgentJSON<ClassificationResult>(text);

  // Ensure new fields have defaults for backward compatibility
  return {
    ...result,
    documentSubType: result.documentSubType ?? null,
    relevantInstitutes: result.relevantInstitutes ?? [],
    legalFocusAreas: result.legalFocusAreas ?? [],
  };
}
