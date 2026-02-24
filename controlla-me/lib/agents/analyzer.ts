import { runAgent } from "../ai-sdk/agent-runner";
import { ANALYZER_SYSTEM_PROMPT } from "../prompts/analyzer";
import type { ClassificationResult, AnalysisResult } from "../types";

/**
 * @param legalContext - Contesto normativo formattato dal vector DB (opzionale).
 *   Se presente, viene iniettato nel prompt per guidare l'analisi con norme verificate.
 */
export async function runAnalyzer(
  documentText: string,
  classification: ClassificationResult,
  legalContext?: string
): Promise<AnalysisResult> {
  // Build enriched classification info with institutes and focus areas
  const classificationInfo = [
    `Tipo: ${classification.documentTypeLabel}`,
    classification.documentSubType ? `Sotto-tipo: ${classification.documentSubType}` : null,
    classification.relevantInstitutes?.length
      ? `Istituti giuridici: ${classification.relevantInstitutes.join(", ")}`
      : null,
    classification.legalFocusAreas?.length
      ? `Aree di focus: ${classification.legalFocusAreas.join(", ")}`
      : null,
    `Giurisdizione: ${classification.jurisdiction}`,
    `Leggi applicabili: ${classification.applicableLaws.map((l) => l.reference).join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const userMessage = [
    `CLASSIFICAZIONE:\n${classificationInfo}`,
    legalContext ? `\n${legalContext}` : null,
    `\nDOCUMENTO:\n${documentText}`,
    `\nAnalizza clausole, rischi e elementi mancanti.`,
    classification.relevantInstitutes?.length
      ? `\nATTENZIONE: Il documento contiene i seguenti istituti giuridici: ${classification.relevantInstitutes.join(", ")}. Applica il framework normativo CORRETTO per ciascun istituto.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { parsed } = await runAgent<AnalysisResult>(
    "analyzer",
    userMessage,
    { systemPrompt: ANALYZER_SYSTEM_PROMPT }
  );

  return parsed;
}
