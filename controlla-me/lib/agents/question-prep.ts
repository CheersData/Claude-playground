/**
 * Question-Prep Agent — riformula domande colloquiali in linguaggio giuridico
 * per migliorare la ricerca semantica nel corpus legislativo.
 *
 * Flusso: domanda colloquiale → runAgent("question-prep") → query legale
 *
 * Leggero: max 1024 token output, ~1-2s.
 * Resiliente: se fallisce, restituisce la domanda originale.
 */

import { runAgent } from "../ai-sdk/agent-runner";
import { QUESTION_PREP_SYSTEM_PROMPT } from "../prompts/question-prep";

// ─── Tipi ───

export interface QuestionPrepResult {
  legalQuery: string;
  keywords: string[];
  legalAreas: string[];
  provider: string;
  durationMs: number;
}

// ─── Main ───

/**
 * Riformula una domanda colloquiale in linguaggio giuridico per la ricerca vettoriale.
 *
 * Non lancia mai eccezioni: se il prep fallisce, restituisce la domanda originale.
 */
export async function prepareQuestion(
  question: string
): Promise<QuestionPrepResult> {
  const startTime = Date.now();

  try {
    const { parsed, provider, usedFallback } = await runAgent<{
      legalQuery?: string;
      keywords?: string[];
      legalAreas?: string[];
    }>("question-prep", `Utente: "${question}"`, {
      systemPrompt: QUESTION_PREP_SYSTEM_PROMPT,
    });

    const result: QuestionPrepResult = {
      legalQuery: parsed.legalQuery || question,
      keywords: parsed.keywords ?? [],
      legalAreas: parsed.legalAreas ?? [],
      provider,
      durationMs: Date.now() - startTime,
    };

    console.log(
      `[QUESTION-PREP] "${question.slice(0, 60)}..." → "${result.legalQuery.slice(0, 80)}..." | ${provider}${usedFallback ? " (fallback)" : ""} | ${result.durationMs}ms`
    );

    return result;
  } catch (err) {
    // Fallback totale: restituisce la domanda originale
    console.error(
      `[QUESTION-PREP] Errore completo, uso domanda originale:`,
      err instanceof Error ? err.message : err
    );
    return {
      legalQuery: question,
      keywords: [],
      legalAreas: [],
      provider: "none",
      durationMs: Date.now() - startTime,
    };
  }
}
