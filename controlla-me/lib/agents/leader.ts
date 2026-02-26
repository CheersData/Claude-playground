/**
 * Leader Agent — decide quale pipeline attivare in base all'input utente.
 *
 * Fast-path per casi ovvi (zero costo LLM):
 * - Solo testo breve senza file → corpus-qa
 * - Solo file senza messaggio → document-analysis
 * - Messaggio troppo corto/vago → clarification
 *
 * LLM call solo per casi ambigui (file + messaggio, testo medio).
 */

import { runAgent } from "../ai-sdk/agent-runner";
import { LEADER_SYSTEM_PROMPT } from "../prompts/leader";
import type { LeaderDecision } from "../types";

export interface LeaderInput {
  message?: string;
  hasFile: boolean;
  fileName?: string;
  /** Length of document text if already extracted */
  textLength?: number;
}

/** Parole troppo vaghe per procedere senza chiarimento */
const VAGUE_INPUTS = [
  /^(ciao|salve|buongiorno|hey|help|aiuto|aiutami)$/i,
  /^contratto$/i,
  /^(ho un problema|ho bisogno)$/i,
];

/**
 * Decide la pipeline da attivare.
 * Per casi ovvi non chiama nessun LLM (zero latenza, zero costi).
 */
export async function runLeaderAgent(
  input: LeaderInput
): Promise<LeaderDecision> {
  const { message, hasFile, fileName } = input;
  const trimmedMessage = message?.trim() ?? "";

  // Fast-path: solo file, nessun messaggio → document-analysis
  if (!trimmedMessage && hasFile) {
    return {
      route: "document-analysis",
      reasoning: "Solo file allegato, nessuna domanda",
      question: null,
      userContext: null,
    };
  }

  // Fast-path: niente file, niente messaggio
  if (!trimmedMessage && !hasFile) {
    return {
      route: "clarification",
      reasoning: "Nessun input ricevuto",
      question: null,
      userContext: null,
      clarificationQuestion:
        "Come posso aiutarti? Puoi farmi una domanda sulla legge o caricare un contratto da analizzare.",
    };
  }

  // Fast-path: messaggio troppo vago
  if (
    trimmedMessage.length < 10 ||
    VAGUE_INPUTS.some((re) => re.test(trimmedMessage))
  ) {
    return {
      route: "clarification",
      reasoning: "Input troppo vago per procedere",
      question: null,
      userContext: null,
      clarificationQuestion:
        "Puoi dirmi di più? Vuoi analizzare un contratto o hai una domanda su una legge specifica?",
    };
  }

  // Fast-path: solo testo breve, nessun file → corpus-qa (no deep search)
  if (trimmedMessage && !hasFile && trimmedMessage.length < 500) {
    return {
      route: "corpus-qa",
      reasoning: "Domanda testuale",
      question: trimmedMessage,
      userContext: null,
      needsDeepSearch: false,
    };
  }

  // Fast-path: testo medio senza file → corpus-qa con deep search
  if (trimmedMessage && !hasFile && trimmedMessage.length >= 500 && trimmedMessage.length < 2000) {
    return {
      route: "corpus-qa",
      reasoning: "Testo medio — caso concreto probabile",
      question: trimmedMessage,
      userContext: null,
      needsDeepSearch: true,
    };
  }

  // Fast-path: testo molto lungo senza file → probabilmente un documento incollato
  if (trimmedMessage && !hasFile && trimmedMessage.length >= 2000) {
    return {
      route: "document-analysis",
      reasoning: "Testo lungo incollato (probabilmente un documento)",
      question: null,
      userContext: null,
    };
  }

  // Ambiguo: chiedi al LLM
  const prompt = [
    `FILE ALLEGATO: ${hasFile ? `Sì (${fileName ?? "file"})` : "No"}`,
    `MESSAGGIO UTENTE:\n${trimmedMessage || "(nessun messaggio)"}`,
  ].join("\n\n");

  console.log(
    `[LEADER] Caso ambiguo — hasFile: ${hasFile}, message: ${trimmedMessage.length} chars → LLM call`
  );

  const { parsed } = await runAgent<LeaderDecision>("leader", prompt, {
    systemPrompt: LEADER_SYSTEM_PROMPT,
  });

  return {
    route: parsed.route ?? "corpus-qa",
    reasoning: parsed.reasoning ?? "Decisione LLM",
    question: parsed.question ?? null,
    userContext: parsed.userContext ?? null,
    clarificationQuestion: parsed.clarificationQuestion ?? null,
    needsDeepSearch: parsed.needsDeepSearch ?? false,
  };
}
