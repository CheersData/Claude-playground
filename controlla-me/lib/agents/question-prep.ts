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
  /** La domanda richiede norme di procedura PENALE (c.p.p.) non presenti nel corpus. Il c.p.c. È invece disponibile. */
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

  // 2. needsProceduralLaw: il c.p.c. È NEL CORPUS. Solo c.p.p. (penale) manca.
  // Se il modello ha settato needsProceduralLaw=true per domande civili, CORREGGI a false.
  // Forza true SOLO per contesto esplicitamente penale.
  const isPenale = /(?:processo penale|imputat[oa]|pubblico ministero|p\.m\.|udienza preliminare|dibattimento penale|reato|condanna penale)/i.test(q);
  const isCivile = /(?:primo grado|impugn|appello|sentenza|giudice.*decis|cassazione|ricorso|ultrapetizion|extrapetizion|decreto ingiuntiv|pignoramento|esecuzion.*forzat|mediazion|sfratto|arbitrat|competenz.*territorial)/i.test(q);
  if (isPenale && !isCivile) {
    result.needsProceduralLaw = true;
  } else if (isCivile || !isPenale) {
    // Il c.p.c. è nel corpus — non segnalare come mancante
    result.needsProceduralLaw = false;
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

  // Vendita immobiliare / tolleranza / vendita a corpo
  ensureInstitute(/tolleranz.*(?:\d+%|ventesim|misura|corpo|superfici|eccedenz|deficienz)/i, ["vendita_a_corpo", "vendita_a_misura", "rettifica_prezzo"]);
  ensureInstitute(/tolleranz.*(?:contratt|preliminar|compravendita|immobil)/i, ["vendita_a_corpo", "vendita_a_misura", "rettifica_prezzo"]);
  ensureInstitute(/vendita.*(?:a corpo|a misura)|(?:a corpo|a misura).*vendita/i, ["vendita_a_corpo", "vendita_a_misura", "rettifica_prezzo"]);
  ensureInstitute(/eccedenz.*(?:misura|superfici)|deficienz.*(?:misura|superfici)/i, ["vendita_a_corpo", "vendita_a_misura", "rettifica_prezzo"]);
  ensureInstitute(/ventesimo|un.*ventesimo/i, ["vendita_a_corpo", "vendita_a_misura", "rettifica_prezzo"]);

  // Successione / Eredità
  ensureInstitute(/ereditari|eredit[àa]|succession|de cuius|mort[oae].*lasciando|decedut/i, ["successione", "legittima", "divisione_ereditaria"]);
  ensureInstitute(/legittima|quota.*riservat|lesione.*legittima/i, ["legittima", "successione"]);
  ensureInstitute(/testamento|disposizion.*testamentar/i, ["testamento", "successione", "legittima"]);
  ensureInstitute(/collazion|conferimento.*ereditari/i, ["collazione", "successione", "donazione"]);
  ensureInstitute(/donazion|regal[oa]t|donato/i, ["donazione", "revoca_donazione", "collazione"]);

  // Procedura civile (CPC) — istituti per migliorare retrieval articoli c.p.c.
  ensureInstitute(/decreto ingiuntiv|ingiunzion.*pagament/i, ["decreto_ingiuntivo"]);
  ensureInstitute(/esecuzion.*forzat|pignoramento|precetto/i, ["esecuzione_forzata"]);
  ensureInstitute(/arbitrat|lodo arbitral|clausola.*compromissori/i, ["arbitrato"]);
  ensureInstitute(/sfratt|convalida.*sfratt|licenz.*finita locazione/i, ["sfratto"]);
  ensureInstitute(/provvediment.*cautelar|sequestro.*giudiziari|sequestro.*conservativ/i, ["provvedimenti_cautelari"]);
  ensureInstitute(/competenz.*(?:territorial|per materia|per valore)|foro competent/i, ["competenza"]);
  ensureInstitute(/appello|impugnazion|ricorso.*cassazione/i, ["impugnazioni"]);
  ensureInstitute(/mediazion.*(?:obbligatori|civile)|tentativo.*conciliazione/i, ["mediazione"]);
  ensureInstitute(/ultrapetizion|extrapetizion|corrispondenza.*chiesto.*pronunciat/i, ["corrispondenza_chiesto_pronunciato"]);
  ensureInstitute(/deposito.*document|riform.*cartabia|art.*171/i, ["deposito_atti"]);

  // Prelazione agraria
  ensureInstitute(/prelazion.*agrar|coltivator.*dirett|riscatto.*agrar|confinant.*agrar/i, ["prelazione_agraria"]);

  // Acquisto immobile da costruttore / fideiussione obbligatoria (D.Lgs. 122/2005)
  ensureInstitute(/costrutt(?:ore|rice)|immobil.*(?:da costruir|in costruzion)|accont.*(?:costrutt|impresa)|fideiussion.*(?:costrutt|immobil)/i, ["acquisto_immobile_da_costruire", "fideiussione_obbligatoria"]);
  ensureInstitute(/fall(?:it|iment).*(?:costrutt|impresa.*edil)/i, ["acquisto_immobile_da_costruire", "fideiussione_obbligatoria"]);

  // Registrazione conversazione / intercettazione (art. 617 c.p.)
  ensureInstitute(/registr(?:at|azion).*(?:conversazion|telefonat|colloqui|di nascosto)|intercettazion/i, ["intercettazione", "registrazione_conversazione"]);

  // Vizi di conformità vs recesso (distinzione critica per diritto consumatore)
  ensureInstitute(/difettos[oa]|non.*(?:funziona|conform)|viziat[oa]|rott[oa]/i, ["vizi_conformita", "garanzia_legale"]);

  // Mutuo / prova testimoniale
  ensureInstitute(/mutuo.*(?:privat|amici|parenti)|prest(?:it|at).*(?:privat|amici|senza.*scritto)/i, ["mutuo", "prova_testimoniale"]);

  // Asta giudiziaria / abusi edilizi
  ensureInstitute(/asta.*(?:giudiziari|immobiliar)|esecuzion.*immobiliar|vendita.*forzat/i, ["esecuzione_immobiliare", "vendita_forzata"]);

  // Comproprietà / divisione
  ensureInstitute(/compropriet[àa]|comunion.*(?:ereditari|beni)|divisi(?:one|bil)/i, ["comunione", "divisione"]);

  // Penale / Patrimonio
  ensureInstitute(/pres[oi].*soldi|sottratt.*denaro|appropriat.*indebit|portato via.*soldi/i, ["appropriazione_indebita"]);
  ensureInstitute(/circonvenz|raggir.*(?:anzian|incapac)|approfitt.*(?:anzian|incapac|non.*lucid)/i, ["circonvenzione_incapace", "incapacità"]);
  ensureInstitute(/truff|ingann|artifici.*raggir/i, ["truffa"]);
  ensureInstitute(/reato|fattispecie.*penale|penalment/i, ["appropriazione_indebita", "truffa", "circonvenzione_incapace"]);
  ensureInstitute(/incapac|non.*lucid|interdett|inabilitat|anzian.*(?:confus|dement)/i, ["incapacità", "circonvenzione_incapace"]);

  // Pignoramento prima casa (distinzione creditore privato vs Agenzia Entrate)
  ensureInstitute(/pignoramento.*(?:prima casa|abitazion|immobil)|(?:prima casa|abitazion).*pignoramento/i, ["esecuzione_immobiliare", "pignoramento"]);

  // Ultra petita / extra petita (violazione art. 112 c.p.c.)
  ensureInstitute(/ultrapetizion|extrapetizion/i, ["corrispondenza_chiesto_pronunciato", "nullità_sentenza"]);

  // Violazione obblighi familiari / mantenimento figli (civile + penale)
  ensureInstitute(/(?:violazion|inadempiment).*(?:obbligh.*familiar|manteniment|assisten.*familiar)/i, ["obblighi_familiari", "mantenimento"]);
  ensureInstitute(/(?:padre|madre|genitore).*(?:non.*pag|mancato).*manteniment|manteniment.*(?:figli|minor)/i, ["obblighi_familiari", "mantenimento"]);

  // Prova testimoniale / testimonianza (limiti art. 2721 c.c.)
  ensureInstitute(/prova.*testimonial|testimonianz|test[ie].*(?:giudizi|tribunal|processo)/i, ["prova_testimoniale", "limiti_prova"]);

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

  // 7. Enrich legalQuery for tolleranza/vendita a corpo (helps vector ranking find Art. 1537-1538)
  if (/tolleranz/i.test(combined) && !/vendita.*corpo|eccedenz|deficienz|ventesimo/i.test(result.legalQuery)) {
    result.legalQuery += " vendita a corpo eccedenza deficienza misura ventesimo Art. 1538";
  }

  // 8. Enrich legalQuery for costruttore/acconto (helps find D.Lgs. 122/2005)
  if (/costrutt(?:ore|rice).*(?:fall|accont|versat)|accont.*costrutt/i.test(combined) && !/fideiussion|122.*2005|tutela.*acquir/i.test(result.legalQuery)) {
    result.legalQuery += " fideiussione obbligatoria tutela acquirente immobile da costruire D.Lgs. 122/2005";
  }

  // 9. Enrich legalQuery for registrazione conversazione (helps find art. 617 c.p.)
  // NO article numbers — reference boost matches wrong articles across sources
  if (/registr.*(?:conversazion|nascosto|telefonat)|intercettazion/i.test(combined) && !/intercettazion.*abusiv|cognizione.*illecit/i.test(result.legalQuery)) {
    result.legalQuery += " intercettazione abusiva cognizione illecita comunicazioni conversazioni telefoniche registrazione partecipante terzo";
  }

  // 10. Enrich legalQuery for difettoso/restituzione (helps distinguish vizi conformità from recesso)
  // NO article numbers — reference boost on generic numbers pollutes results
  if (/difettos[oa]|(?:prodott|acquist).*(?:rott|non funzion)|viziat[oa]/i.test(combined) && !/conformit[àa]|garanzia.*legal/i.test(result.legalQuery)) {
    result.legalQuery += " difetto conformità garanzia legale codice consumo riparazione sostituzione spese restituzione venditore";
  }

  // 11. Enrich legalQuery for mediazione assenza (helps find D.Lgs. 28/2010)
  // NO article numbers — "art. 8" is too generic and matches wrong sources in reference boost
  if (/mediazion.*(?:non.*present|assent|assenz|mancata)/i.test(combined) && !/sanzione.*mediazion|conseguenz.*mancata/i.test(result.legalQuery)) {
    result.legalQuery += " conseguenze mancata partecipazione mediazione obbligatoria sanzione pecuniaria argomento prova giudice";
  }

  // 12. Enrich legalQuery for asta/abusi edilizi
  // NO article numbers — reference boost pollution
  if (/asta.*(?:giudiziari|immobil)|(?:vendita|esecuzion).*forzat/i.test(combined) && !/abuso.*ediliz|DPR.*380|nullit[àa].*atto/i.test(result.legalQuery)) {
    result.legalQuery += " vendita forzata immobile abuso edilizio nullità atto trasferimento regolarità urbanistica edilizia";
  }

  // 13. Enrich legalQuery for pignoramento prima casa
  if (/pignoramento.*(?:prima casa|abitazion|immobil)/i.test(combined) && !/esecuzion.*immobiliar|creditore.*privat/i.test(result.legalQuery)) {
    result.legalQuery += " esecuzione immobiliare pignoramento prima casa creditore privato Agenzia Entrate Riscossione impignorabilità";
  }

  // 14. Enrich legalQuery for mantenimento figli (civile + penale)
  if (/(?:manteniment.*figli|padre.*non.*pag|mancato.*manteniment)/i.test(combined) && !/obbligh.*assistenz.*familiar|570/i.test(result.legalQuery)) {
    result.legalQuery += " violazione obblighi assistenza familiare mantenimento figli esecuzione forzata pignoramento stipendio";
  }

  // 15. Enrich legalQuery for prova testimoniale / prestito verbale
  if (/prova.*testimonial|testimonianz|prestit.*verbal/i.test(combined) && !/limit.*prova|2721/i.test(result.legalQuery)) {
    result.legalQuery += " limiti prova testimoniale contratti valore superiore ammissibilità";
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
