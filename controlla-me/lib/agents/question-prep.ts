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
  /** La domanda richiede norme processuali (c.p.c.) non presenti nel corpus */
  needsProceduralLaw: boolean;
  /** La domanda richiede giurisprudenza (Cassazione, orientamenti) */
  needsCaseLaw: boolean;
  /** Nota su cosa serve oltre al corpus (es. "Serve c.p.c. artt. 112-113") */
  scopeNotes: string | null;
  provider: string;
  durationMs: number;
}

// ─── Post-processing deterministico ───

/**
 * Corregge l'output del PREP con regole hardcoded.
 * Il modello (Llama 8B) è bravo nel 90% dei casi, ma ha gap sistematici
 * su questionType, needsProceduralLaw, e istituti mancanti.
 * Queste regole sono O(1), zero API calls, e scalano a qualsiasi modello.
 */
function postProcessPrep(question: string, result: QuestionPrepResult): QuestionPrepResult {
  const q = question.toLowerCase();
  // Match on both question AND model output for broader coverage
  const combined = `${q} ${result.legalQuery.toLowerCase()} ${(result.mechanismQuery ?? "").toLowerCase()}`;

  // 1. "differenza tra X e Y" / "qual è la differenza" → systematic
  if (/(?:che )?differenza (?:c'è |c'e |c è )?tra\b/i.test(q) || /qual è la differenza/i.test(q)) {
    result.questionType = "systematic";
  }

  // 2. "il giudice può" + azione d'ufficio → needsProceduralLaw
  if (/giudice.*(?:può|puo|potere|d'ufficio|ridurre|riduzione|riqualificare)/i.test(q)) {
    result.needsProceduralLaw = true;
  }

  // 3. Ensure key institutes based on question + model output keywords
  const ensureInstitute = (pattern: RegExp, institutes: string[]) => {
    if (pattern.test(combined)) {
      for (const inst of institutes) {
        if (!result.suggestedInstitutes.includes(inst)) {
          result.suggestedInstitutes.push(inst);
        }
      }
    }
  };

  ensureInstitute(/sub(?:affitt|locazion)/i, ["sublocazione", "locazione"]);
  ensureInstitute(/claus(?:ol[ae])?.*(?:abusiv|vessatori)/i, ["clausole_abusive", "clausole_vessatorie"]);
  ensureInstitute(/(?:operatore|telefonico|condizioni.*unilateral|cambiare.*condizioni)/i, ["clausole_abusive", "tutela_consumatore"]);
  ensureInstitute(/viz[io].*(?:occult|nascost)|infiltrazion|difett.*nascost/i, ["vizi_cosa_venduta"]);
  ensureInstitute(/prescrizion|quanto tempo.*(?:chiedere|agire|risarcimento)/i, ["prescrizione"]);
  ensureInstitute(/evizion|terzo.*(?:rivendica|dice.*suo)/i, ["garanzia_evizione", "vendita"]);
  ensureInstitute(/responsabilit[àa].*precontrattual|culpa in contrahendo|trattativ/i, ["contratto", "buona_fede"]);
  ensureInstitute(/(?:compra|acquist|vendut).*(?:terreno|immobile|casa)|(?:terreno|immobile|casa).*(?:compra|acquist)/i, ["vendita"]);
  ensureInstitute(/inquilin|locator|cauzion|affitt|immobile.*(?:locat|rovin)|(?:muri|paviment).*(?:rovin|dann)/i, ["locazione"]);
  ensureInstitute(/interpretazion.*contratt|clausol.*contradditt/i, ["interpretazione_contratto"]);
  ensureInstitute(/riqualific.*contratt|qualificazione.*contratt/i, ["contratto", "interpretazione_contratto"]);

  // Successione / Eredità
  ensureInstitute(/ereditari|eredit[àa]|succession|de cuius|mort[oae].*lasciando|decedut/i, ["successione", "legittima", "divisione_ereditaria"]);
  ensureInstitute(/legittima|quota.*riservat|lesione.*legittima/i, ["legittima", "successione"]);
  ensureInstitute(/testamento|disposizion.*testamentar/i, ["testamento", "successione", "legittima"]);
  ensureInstitute(/collazion|conferimento.*ereditari/i, ["collazione", "successione", "donazione"]);
  ensureInstitute(/donazion|regal[oa]t|donato/i, ["donazione", "revoca_donazione", "collazione"]);

  // Penale / Patrimonio
  ensureInstitute(/pres[oi].*soldi|sottratt.*denaro|appropriat.*indebit|portato via.*soldi/i, ["appropriazione_indebita"]);
  ensureInstitute(/circonvenz|raggir.*(?:anzian|incapac)|approfitt.*(?:anzian|incapac|non.*lucid)/i, ["circonvenzione_incapace", "incapacità"]);
  ensureInstitute(/truff|ingann|artifici.*raggir/i, ["truffa"]);
  ensureInstitute(/reato|fattispecie.*penale|penalment/i, ["appropriazione_indebita", "truffa", "circonvenzione_incapace"]);
  ensureInstitute(/incapac|non.*lucid|interdett|inabilitat|anzian.*(?:confus|dement)/i, ["incapacità", "circonvenzione_incapace"]);

  // 4. needsCaseLaw for topics dominated by case law
  if (/responsabilit[àa].*precontrattual|culpa in contrahendo/i.test(combined)) {
    result.needsCaseLaw = true;
  }
  if (/riqualific.*(?:ufficio|giudice)|giudice.*riqualific/i.test(combined)) {
    result.needsCaseLaw = true;
  }
  if (/circonvenz.*incapac|appropriazione.*indebita|reato|fattispecie.*penale/i.test(combined)) {
    result.needsCaseLaw = true;
  }
  if (/lesione.*legittima|riduzione.*donazione|collazion/i.test(combined)) {
    result.needsCaseLaw = true;
  }

  // 5. Enrich legalQuery with remedy terms for vizi (helps vector ranking find Art. 1492, 1495)
  if (/viz[io].*(?:occult|nascost)|infiltrazion/i.test(combined) && !/riduzione.*prezzo|risoluzione|termini.*azione/i.test(result.legalQuery)) {
    result.legalQuery += " riduzione prezzo risoluzione termini azione denuncia vizi";
  }

  // 6. Enrich legalQuery for prescrizione (helps vector ranking find Art. 2946)
  if (/prescrizion/i.test(combined) && !/ordinari|decennal/i.test(result.legalQuery)) {
    result.legalQuery += " prescrizione ordinaria termine decennale";
  }

  return result;
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
      needsProceduralLaw?: boolean;
      needsCaseLaw?: boolean;
      scopeNotes?: string | null;
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
      needsProceduralLaw: parsed.needsProceduralLaw ?? false,
      needsCaseLaw: parsed.needsCaseLaw ?? false,
      scopeNotes: parsed.scopeNotes ?? null,
      provider,
      durationMs: Date.now() - startTime,
    };

    // Post-processing deterministico: corregge gap sistematici del modello
    postProcessPrep(question, result);

    console.log(
      `[QUESTION-PREP] "${question.slice(0, 60)}..." → "${result.legalQuery.slice(0, 80)}..."${result.mechanismQuery ? ` | mechanism: "${result.mechanismQuery.slice(0, 60)}..."` : ""} | institutes: [${result.suggestedInstitutes.join(", ")}] | type: ${result.questionType}${result.needsProceduralLaw ? " | NEEDS:c.p.c." : ""}${result.needsCaseLaw ? " | NEEDS:giurisprudenza" : ""} | target: ${result.targetArticles ?? "none"} | ${provider}${usedFallback ? " (fallback)" : ""} | ${result.durationMs}ms`
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
      needsProceduralLaw: false,
      needsCaseLaw: false,
      scopeNotes: null,
      provider: "none",
      durationMs: Date.now() - startTime,
    };
  }
}
