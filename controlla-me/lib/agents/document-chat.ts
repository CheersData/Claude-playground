/**
 * Document Chat Agent — conversazione multi-turn su documento analizzato.
 *
 * Ruolo: Consulente legale che ha letto il documento e l'analisi, risponde
 * a domande specifiche ricordando il contesto della conversazione.
 *
 * Input: documento text, analysis results, conversation history, new question
 * Output: plain text response (non JSON)
 *
 * Utilizza RAG per contesto aggiuntivo da:
 * - Analisi precedenti su documenti simili
 * - Knowledge base legale (norme, sentenze, pattern)
 */

import { runAgent } from "@/lib/ai-sdk/agent-runner";
import { buildRAGContext } from "@/lib/vector-store";
import { DOCUMENT_CHAT_SYSTEM_PROMPT, buildDocumentChatPrompt } from "@/lib/prompts/document-chat";
import type { Analysis } from "@/lib/types";

export interface DocumentChatInput {
  analysisId: string;
  documentText: string;
  fileName: string;
  analysis: Analysis;
  userQuestion: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface DocumentChatOutput {
  response: string;
  durationMs: number;
  usedModel: string;
}

/**
 * Esegue il document chat agent con memoria conversazionale e RAG.
 */
export async function runDocumentChat(
  input: DocumentChatInput
): Promise<DocumentChatOutput> {
  const startTime = Date.now();

  // Limita il testo documento per il prompt (max 4000 chars)
  const _docTextTruncated = input.documentText.slice(0, 4000);

  // Cronologia: max 10 messaggi precedenti (5 turni) per brevità
  const history = (input.conversationHistory || []).slice(-10);

  // Costruisci il contesto RAG
  const ragContext = await buildRAGContext(input.userQuestion, {
    maxChars: 2000,
    categories: ["clause_pattern", "law_reference", "risk_pattern"],
  });

  // Formatta il prompt
  const userPrompt = buildDocumentChatPrompt({
    classification: input.analysis.classification as unknown as Record<string, unknown> | null,
    analysis: input.analysis.analysis as unknown as Record<string, unknown> | null,
    investigation: input.analysis.investigation as unknown as Record<string, unknown> | null,
    advice: input.analysis.advice as unknown as Record<string, unknown> | null,
    fileName: input.fileName,
    conversationHistory: history,
    currentQuestion: input.userQuestion,
  });

  // Inietta il contesto RAG nel prompt
  const fullPrompt = `${userPrompt}\n\nCONTESSTO RAG (da analisi precedenti):\n${ragContext || "(Nessun contesto RAG disponibile)"}`;

  // Esegui l'agente
  // Nota: response è plain text, non JSON
  const result = await runAgent<{ response: string }>(
    "document-chat",
    fullPrompt,
    {
      systemPrompt: DOCUMENT_CHAT_SYSTEM_PROMPT,
      maxTokens: 1024,
      temperature: 0.7,
      jsonOutput: false, // Plain text response
    }
  );

  const durationMs = Date.now() - startTime;

  // Il modello dovrebbe rispondere con testo puro, non JSON
  // Se per errore risponde con JSON, cerca di estrarre il campo 'response'
  let response = result.text.trim();

  try {
    // Prova a parsare come JSON nel caso il modello abbia risposto con JSON
    const parsed = JSON.parse(response);
    if (typeof parsed.response === "string") {
      response = parsed.response;
    }
  } catch {
    // Non è JSON, usa la risposta diretta
  }

  return {
    response,
    durationMs,
    usedModel: result.usedModelKey,
  };
}
