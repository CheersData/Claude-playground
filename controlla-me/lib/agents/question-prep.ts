/**
 * Question-Prep Agent — riformula domande colloquiali in linguaggio giuridico
 * per migliorare la ricerca semantica nel corpus legislativo.
 *
 * Flusso: domanda colloquiale → runAgent("question-prep") → query legale + istituti
 *
 * Leggero: max 1024 token output, ~1-2s.
 * Resiliente: se fallisce, restituisce la domanda originale.
 */

import { runAgent } from "../ai-sdk/agent-runner";
import { QUESTION_PREP_SYSTEM_PROMPT } from "../prompts/question-prep";

// ─── Tipi ───

export interface QuestionPrepResult {
  legalQuery: string;
  /** Secondary query for cross-cutting legal mechanisms (interpretation, nullity, etc.) */
  mechanismQuery: string | null;
  keywords: string[];
  legalAreas: string[];
  /** Istituti giuridici suggeriti per filtrare la ricerca nel corpus */
  suggestedInstitutes: string[];
  /** Sezione target del codice (es. "Art. 1537-1541 c.c.") */
  targetArticles: string | null;
  /** Tipo di domanda: "specific" (caso concreto) o "systematic" (tassonomia/rassegna) */
  questionType: "specific" | "systematic";
  provider: string;
  durationMs: number;
}

// ─── Main ───

/**
 * Riformula una domanda colloquiale in linguaggio giuridico per la ricerca vettoriale.
 * Identifica gli istituti giuridici per guidare la ricerca verso gli articoli corretti.
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
      mechanismQuery?: string | null;
      keywords?: string[];
      legalAreas?: string[];
      suggestedInstitutes?: string[];
      targetArticles?: string | null;
      questionType?: "specific" | "systematic";
    }>("question-prep", `Utente: "${question}"`, {
      systemPrompt: QUESTION_PREP_SYSTEM_PROMPT,
    });

    const result: QuestionPrepResult = {
      legalQuery: parsed.legalQuery || question,
      mechanismQuery: parsed.mechanismQuery ?? null,
      keywords: parsed.keywords ?? [],
      legalAreas: parsed.legalAreas ?? [],
      suggestedInstitutes: parsed.suggestedInstitutes ?? [],
      targetArticles: parsed.targetArticles ?? null,
      questionType: parsed.questionType === "systematic" ? "systematic" : "specific",
      provider,
      durationMs: Date.now() - startTime,
    };

    console.log(
      `[QUESTION-PREP] "${question.slice(0, 60)}..." → "${result.legalQuery.slice(0, 80)}..."${result.mechanismQuery ? ` | mechanism: "${result.mechanismQuery.slice(0, 60)}..."` : ""} | institutes: [${result.suggestedInstitutes.join(", ")}] | type: ${result.questionType} | target: ${result.targetArticles ?? "none"} | ${provider}${usedFallback ? " (fallback)" : ""} | ${result.durationMs}ms`
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
      mechanismQuery: null,
      keywords: [],
      legalAreas: [],
      suggestedInstitutes: [],
      targetArticles: null,
      questionType: "specific",
      provider: "none",
      durationMs: Date.now() - startTime,
    };
  }
}
