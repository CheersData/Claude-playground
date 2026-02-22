import { anthropic, MODEL, parseAgentJSON, extractTextContent } from "../anthropic";
import { ANALYZER_SYSTEM_PROMPT } from "../prompts/analyzer";
import type { ClassificationResult, AnalysisResult } from "../types";

export async function runAnalyzer(
  documentText: string,
  classification: ClassificationResult,
  userContext?: string
): Promise<AnalysisResult> {
  const contextBlock = userContext
    ? `\nRICHIESTA DELL'UTENTE: "${userContext}"\nDai priorità a questa richiesta nell'analisi delle clausole e dei rischi.\n`
    : "";

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: ANALYZER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `CLASSIFICAZIONE: ${JSON.stringify(classification)}
${contextBlock}
DOCUMENTO:
${documentText}

Analizza clausole, rischi e elementi mancanti.`,
      },
    ],
  });

  const text = extractTextContent(response);
  return parseAgentJSON<AnalysisResult>(text);
}
