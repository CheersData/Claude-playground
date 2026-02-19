import { anthropic, MODEL, parseAgentJSON, extractTextContent } from "../anthropic";
import { CLASSIFIER_SYSTEM_PROMPT } from "../prompts/classifier";
import type { ClassificationResult } from "../types";

export async function runClassifier(
  documentText: string
): Promise<ClassificationResult> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: CLASSIFIER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Analizza e classifica il seguente documento:\n\n${documentText}`,
      },
    ],
  });

  const text = extractTextContent(response);
  return parseAgentJSON<ClassificationResult>(text);
}
