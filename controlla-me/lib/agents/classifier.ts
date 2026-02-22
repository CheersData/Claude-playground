import { anthropic, MODEL_FAST, parseAgentJSON, extractTextContent } from "../anthropic";
import { CLASSIFIER_SYSTEM_PROMPT } from "../prompts/classifier";
import type { ClassificationResult } from "../types";

export async function runClassifier(
  documentText: string,
  userContext?: string
): Promise<ClassificationResult> {
  const contextBlock = userContext
    ? `\n\nNOTA DELL'UTENTE: L'utente ha specificato il seguente contesto/richiesta: "${userContext}"\nTieni conto di questa indicazione nella classificazione e nell'identificazione delle leggi applicabili.\n`
    : "";

  const response = await anthropic.messages.create({
    model: MODEL_FAST,
    max_tokens: 4096,
    system: CLASSIFIER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Analizza e classifica il seguente documento:${contextBlock}\n\n${documentText}`,
      },
    ],
  });

  if (response.stop_reason === "max_tokens") {
    console.warn("[CLASSIFIER] Risposta troncata (max_tokens raggiunto)");
  }

  const text = extractTextContent(response);
  return parseAgentJSON<ClassificationResult>(text);
}
