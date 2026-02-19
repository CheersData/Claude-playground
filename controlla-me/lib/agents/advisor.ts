import { anthropic, MODEL, parseAgentJSON, extractTextContent } from "../anthropic";
import { ADVISOR_SYSTEM_PROMPT } from "../prompts/advisor";
import type {
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
  AdvisorResult,
} from "../types";

export async function runAdvisor(
  classification: ClassificationResult,
  analysis: AnalysisResult,
  investigation: InvestigationResult
): Promise<AdvisorResult> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: ADVISOR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Classificazione: ${JSON.stringify(classification)}

Analisi clausole: ${JSON.stringify(analysis)}

Ricerca normativa: ${JSON.stringify(investigation)}

Produci il report finale.`,
      },
    ],
  });

  const text = extractTextContent(response);
  return parseAgentJSON<AdvisorResult>(text);
}
