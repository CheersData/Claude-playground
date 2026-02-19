import { anthropic, MODEL, parseAgentJSON, extractTextContent } from "../anthropic";
import { ANALYZER_SYSTEM_PROMPT } from "../prompts/analyzer";
import type { ClassificationResult, AnalysisResult } from "../types";

export async function runAnalyzer(
  documentText: string,
  classification: ClassificationResult
): Promise<AnalysisResult> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16384,
    system: ANALYZER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `## CLASSIFICAZIONE DEL DOCUMENTO
${JSON.stringify(classification, null, 2)}

## TESTO COMPLETO DEL DOCUMENTO
${documentText}

Analizza tutte le clausole significative, identifica i rischi e gli elementi mancanti.`,
      },
    ],
  });

  const text = extractTextContent(response);
  return parseAgentJSON<AnalysisResult>(text);
}
