/**
 * Question-Prep Agent — riformula domande colloquiali in linguaggio giuridico
 * per migliorare la ricerca semantica nel corpus legislativo.
 *
 * Flusso: domanda colloquiale → Gemini Flash (o Haiku fallback) → query legale
 *
 * Leggero: max 1024 token output, ~1-2s.
 * Resiliente: se fallisce, restituisce la domanda originale.
 */

import { generateWithGemini, isGeminiEnabled, parseAgentJSON } from "../gemini";
import { anthropic, MODEL_FAST, extractTextContent } from "../anthropic";
import { QUESTION_PREP_SYSTEM_PROMPT } from "../prompts/question-prep";

// ─── Tipi ───

export interface QuestionPrepResult {
  legalQuery: string;
  keywords: string[];
  legalAreas: string[];
  provider: "gemini" | "haiku";
  durationMs: number;
}

// ─── LLM Calls ───

async function callGemini(question: string): Promise<string> {
  const result = await generateWithGemini(`Utente: "${question}"`, {
    systemPrompt: QUESTION_PREP_SYSTEM_PROMPT,
    maxOutputTokens: 1024,
    temperature: 0.2,
    jsonOutput: true,
    agentName: "QUESTION-PREP",
  });
  return result.text;
}

async function callHaiku(question: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: MODEL_FAST,
    max_tokens: 1024,
    system: QUESTION_PREP_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Utente: "${question}"` }],
  });
  return extractTextContent(response);
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
    let text: string;
    let usedProvider: "gemini" | "haiku";

    if (isGeminiEnabled()) {
      try {
        text = await callGemini(question);
        usedProvider = "gemini";
      } catch (err) {
        console.warn(
          `[QUESTION-PREP] Gemini fallito, fallback a Haiku:`,
          err instanceof Error ? err.message : err
        );
        text = await callHaiku(question);
        usedProvider = "haiku";
      }
    } else {
      text = await callHaiku(question);
      usedProvider = "haiku";
    }

    const parsed = parseAgentJSON<{
      legalQuery?: string;
      keywords?: string[];
      legalAreas?: string[];
    }>(text);

    const result: QuestionPrepResult = {
      legalQuery: parsed.legalQuery || question,
      keywords: parsed.keywords ?? [],
      legalAreas: parsed.legalAreas ?? [],
      provider: usedProvider,
      durationMs: Date.now() - startTime,
    };

    console.log(
      `[QUESTION-PREP] "${question.slice(0, 60)}..." → "${result.legalQuery.slice(0, 80)}..." | ${usedProvider} | ${result.durationMs}ms`
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
      provider: "haiku",
      durationMs: Date.now() - startTime,
    };
  }
}
