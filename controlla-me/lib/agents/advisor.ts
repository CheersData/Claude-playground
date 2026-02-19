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
    max_tokens: 8192,
    system: ADVISOR_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `## CLASSIFICAZIONE DEL DOCUMENTO
${JSON.stringify(classification, null, 2)}

## ANALISI DELLE CLAUSOLE
${JSON.stringify(analysis, null, 2)}

## RICERCA NORMATIVA E GIURISPRUDENZIALE
${JSON.stringify(investigation, null, 2)}

Produci il report finale in italiano semplice, comprensibile a chiunque. Includi il fairness score, i rischi, le scadenze, le azioni consigliate e se serve un avvocato.`,
      },
    ],
  });

  const text = extractTextContent(response);
  return parseAgentJSON<AdvisorResult>(text);
}
