import { anthropic, MODEL, parseAgentJSON, extractTextContent } from "../anthropic";
import { ANALYZER_SYSTEM_PROMPT } from "../prompts/analyzer";
import type { ClassificationResult, AnalysisResult } from "../types";

export async function runAnalyzer(
  documentText: string,
  classification: ClassificationResult
): Promise<AnalysisResult> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: ANALYZER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `CLASSIFICAZIONE: ${JSON.stringify(classification)}

DOCUMENTO:
${documentText}

Analizza clausole, rischi e elementi mancanti.`,
      },
    ],
  });

  const text = extractTextContent(response);
  return parseAgentJSON<AnalysisResult>(text);
}
