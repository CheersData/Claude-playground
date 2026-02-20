import { anthropic, MODEL_FAST, parseAgentJSON, extractTextContent } from "../anthropic";
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
        content: `Analizza e classifica il seguente documento:\n\n${documentText}`,
      },
    ],
  });

  if (response.stop_reason === "max_tokens") {
    console.warn("[CLASSIFIER] Risposta troncata (max_tokens raggiunto)");
  }

  const text = extractTextContent(response);
  return parseAgentJSON<ClassificationResult>(text);
}
