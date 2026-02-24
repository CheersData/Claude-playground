import { anthropic, MODEL, parseAgentJSON, extractTextContent } from "../anthropic";
import { ADVISOR_SYSTEM_PROMPT } from "../prompts/advisor";
import type {
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
  AdvisorResult,
} from "../types";

/**
 * @param ragContext - Contesto da analisi precedenti nella knowledge base (opzionale).
 */
export async function runAdvisor(
  classification: ClassificationResult,
  analysis: AnalysisResult,
  investigation: InvestigationResult,
  ragContext?: string
): Promise<AdvisorResult> {
  const userMessageParts = [
    `Classificazione: ${JSON.stringify(classification)}`,
    `\nAnalisi clausole: ${JSON.stringify(analysis)}`,
    `\nRicerca normativa: ${JSON.stringify(investigation)}`,
    ragContext ? `\n${ragContext}` : null,
    `\nProduci il report finale con scoring multidimensionale.`,
    `\nRICORDA: MASSIMO 3 risks e MASSIMO 3 actions. Scegli solo i più importanti.`,
  ];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: ADVISOR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: userMessageParts.filter(Boolean).join("\n"),
      },
    ],
  });

  const text = extractTextContent(response);
  const result = parseAgentJSON<AdvisorResult>(text);

  // Enforce output limits — truncate if model ignores them
  if (result.risks && result.risks.length > 3) {
    console.warn(`[ADVISOR] ${result.risks.length} risks trovati, troncato a 3`);
    result.risks = result.risks.slice(0, 3);
  }
  if (result.actions && result.actions.length > 3) {
    console.warn(`[ADVISOR] ${result.actions.length} actions trovate, troncato a 3`);
    result.actions = result.actions.slice(0, 3);
  }

  // Ensure scores field exists with defaults
  if (!result.scores) {
    result.scores = {
      legalCompliance: result.fairnessScore,
      contractBalance: result.fairnessScore,
      industryPractice: result.fairnessScore,
    };
  }

  return result;
}
