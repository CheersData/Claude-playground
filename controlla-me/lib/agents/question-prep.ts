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

// ─── Trigger-word dictionary: colloquiale → terminologia giuridica ───

/**
 * Mappa parole/frasi colloquiali agli istituti giuridici corrispondenti.
 * Ogni entry ha:
 * - pattern: regex che matcha nel testo colloquiale della domanda
 * - legalTerms: termini giuridici da aggiungere alla legalQuery
 * - institutes: istituti da aggiungere a suggestedInstitutes
 *
 * Questo dizionario ARRICCHISCE la query, non la sostituisce.
 * Risolve il 18.8% di RETRIEVAL_FAIL causati da domande colloquiali
 * che non matchano i termini legali nel corpus.
 */
interface TriggerWordEntry {
  pattern: RegExp;
  legalTerms: string;
  institutes: string[];
}

const TRIGGER_WORD_DICTIONARY: TriggerWordEntry[] = [
  // ─── Consumatore / Acquisti ───
  {
    pattern: /spazzolino|restituir.*(?:comprat|acquist|prodott)|ripensamento|reso|rimandar.*indietro/i,
    legalTerms: "diritto di recesso consumatore restituzione bene acquistato termine 14 giorni",
    institutes: ["tutela_consumatore", "vendita"],
  },
  {
    pattern: /garanzia.*(?:scadut|finit|due anni)|prodott.*(?:rott|difettos|non funzion)|si è rotto/i,
    legalTerms: "garanzia legale conformità difetto vizio bene consumo riparazione sostituzione",
    institutes: ["vizi_conformita", "garanzia_legale", "tutela_consumatore"],
  },
  {
    pattern: /fregat[uo]|truffat[oa]|bidone|raggir/i,
    legalTerms: "truffa artifici raggiri induzione in errore",
    institutes: ["truffa", "clausole_abusive"],
  },
  {
    pattern: /comprat[oa].*online|acquist.*internet|e-?commerce|sito.*(?:comprat|ordinat)/i,
    legalTerms: "contratto a distanza vendita online consumatore recesso 14 giorni",
    institutes: ["tutela_consumatore", "vendita"],
  },

  // ─── Lavoro ───
  {
    pattern: /licenziat[oa]|cacciat[oa]|mandat[oa].*via|perso.*(?:il )?posto/i,
    legalTerms: "giusta causa licenziamento art. 2119 c.c. giustificato motivo preavviso",
    institutes: ["contratto", "lavoro_autonomo"],
  },
  {
    pattern: /lavoro.*nero|paga.*in nero|senza.*contratto.*lavor|non.*(?:mi )?assunt|irregolar/i,
    legalTerms: "lavoro subordinato irregolare rapporto di fatto prestazione lavorativa",
    institutes: ["contratto", "lavoro_autonomo"],
  },
  {
    pattern: /straordinar[io]|ore extra|non.*(?:mi )?paga.*(?:straordinari|ore)/i,
    legalTerms: "lavoro straordinario retribuzione orario compenso maggiorazione",
    institutes: ["contratto", "obbligazione"],
  },
  {
    pattern: /dimission[ei]|voglio.*licenziar.*mi|lasciar.*lavoro|dare.*le dimissioni/i,
    legalTerms: "dimissioni volontarie preavviso recesso lavoratore",
    institutes: ["contratto"],
  },
  {
    pattern: /mobbing|boss[ei]ng|demansionat|umiliat.*lavoro|perseguitat.*lavoro/i,
    legalTerms: "mobbing demansionamento danno biologico risarcimento responsabilità datore",
    institutes: ["responsabilità_extracontrattuale", "risarcimento"],
  },
  {
    pattern: /tfr|liquidazione|buonuscita|trattamento.*fine.*rapporto/i,
    legalTerms: "trattamento fine rapporto TFR liquidazione indennità",
    institutes: ["obbligazione", "contratto"],
  },

  // ─── Locazione / Affitto ───
  {
    pattern: /affitt[oa]|padrone.*casa|propriet[àa]rio.*(?:casa|immobil)|inquilin/i,
    legalTerms: "locazione conduttore locatore obblighi canone",
    institutes: ["locazione", "obblighi_locatore", "obblighi_conduttore"],
  },
  {
    pattern: /bollette|condominio|spese.*(?:condominial|accessori)|chi.*paga.*spese/i,
    legalTerms: "oneri accessori locazione spese condominiali ripartizione",
    institutes: ["locazione", "obblighi_conduttore"],
  },
  {
    pattern: /muffa|perdita.*acqua|infiltrazion[ei]|tubatura|umidità|tetto.*(?:piov|rott)/i,
    legalTerms: "vizi cosa locata art. 1578 c.c. riparazione riduzione canone risoluzione",
    institutes: ["locazione", "obblighi_locatore"],
  },
  {
    pattern: /sfratt[oa]|caccia.*(?:di )?casa|buttare.*fuori|mandar.*via.*(?:casa|appartament)/i,
    legalTerms: "sfratto convalida licenza finita locazione morosità intimazione",
    institutes: ["sfratto", "locazione"],
  },
  {
    pattern: /cauzione|deposito.*cauzional|caparra.*affitt|restituzione.*cauzione/i,
    legalTerms: "deposito cauzionale locazione restituzione cauzione trattenuta danni",
    institutes: ["locazione", "obblighi_conduttore"],
  },
  {
    pattern: /rinnov.*(?:affitt|contratt.*locazion)|scadenza.*(?:affitt|contratt.*locazion)/i,
    legalTerms: "rinnovo locazione tacito rinnovo disdetta scadenza L. 431/1998",
    institutes: ["locazione", "rinnovo_locazione"],
  },
  {
    pattern: /subaffitt|sublocare|affittare.*(?:stanza|camera)|coinquilin/i,
    legalTerms: "sublocazione cessione contratto locazione consenso locatore",
    institutes: ["sublocazione", "locazione"],
  },

  // ─── Caparra / Anticipo ───
  {
    pattern: /caparra|anticipo.*(?:casa|contratt|acquist)|acconto/i,
    legalTerms: "caparra confirmatoria caparra penitenziale acconto prezzo inadempimento",
    institutes: ["caparra_confirmatoria", "caparra_penitenziale"],
  },

  // ─── Tributi / Multe / Cartelle ───
  {
    pattern: /multa|cartella.*(?:esattorial|pagament)|equitalia|agenzia.*entrate.*riscossione/i,
    legalTerms: "riscossione tributi cartella esattoriale opposizione annullamento prescrizione",
    institutes: ["prescrizione", "obbligazione"],
  },
  {
    pattern: /bollo.*auto|tassa.*automobilist|pagament.*arretrat/i,
    legalTerms: "tributo regionale bollo auto prescrizione triennale riscossione",
    institutes: ["prescrizione"],
  },

  // ─── Famiglia / Separazione ───
  {
    pattern: /divorzi[oa]|separa(?:zione|rmi|rci)|lasciar.*(?:marit|mogli)/i,
    legalTerms: "separazione personale coniugi divorzio scioglimento matrimonio assegno mantenimento",
    institutes: ["obbligazione"],
  },
  {
    pattern: /aliment[io]|manteniment.*(?:figli|ex)|assegno.*(?:figli|coniuge|mantenimento)/i,
    legalTerms: "obbligo mantenimento figli assegno alimentare violazione obblighi assistenza familiare",
    institutes: ["obblighi_familiari", "mantenimento"],
  },

  // ─── Eredità / Successione ───
  {
    pattern: /eredità|ereditare|morto.*lasci|testamento|decedut/i,
    legalTerms: "successione eredità testamento quota legittima divisione ereditaria",
    institutes: ["successione", "testamento", "legittima", "divisione_ereditaria"],
  },
  {
    pattern: /disereda(?:re|to|zione)|esclus.*(?:eredit|testamento)|tagliato.*fuori/i,
    legalTerms: "diseredazione quota legittima riduzione lesione azione",
    institutes: ["successione", "legittima", "testamento"],
  },

  // ─── Proprietà / Vicinato ───
  {
    pattern: /vicin[oi].*(?:rumor|confine|albero|muro)|rumor.*(?:notturni|condomini)/i,
    legalTerms: "immissioni rumorose rapporti vicinato distanze legali confini",
    institutes: ["responsabilità_extracontrattuale"],
  },
  {
    pattern: /abuso.*edilizi|costrui.*senza.*permess|condono/i,
    legalTerms: "abuso edilizio permesso costruire DPR 380/2001 sanatoria condono",
    institutes: ["contratto"],
  },

  // ─── Privacy / Dati personali ───
  {
    pattern: /privacy|dati.*personal|telecamer[ae]|videosorvegli/i,
    legalTerms: "protezione dati personali GDPR trattamento consenso informativa",
    institutes: ["tutela_consumatore"],
  },

  // ─── Risarcimento / Incidenti ───
  {
    pattern: /incident.*(?:strad|auto|moto)|tamponat|sinistro/i,
    legalTerms: "risarcimento danno responsabilità civile circolazione veicoli",
    institutes: ["responsabilità_extracontrattuale", "risarcimento", "assicurazione"],
  },
  {
    pattern: /cadut[oa]|scivolat|infortunio|fatt[oa].*male|ferit/i,
    legalTerms: "risarcimento danno biologico infortunio responsabilità extracontrattuale",
    institutes: ["responsabilità_extracontrattuale", "risarcimento"],
  },

  // ─── Debiti / Prestiti ───
  {
    pattern: /presta.*soldi|(?:mi )?deve.*soldi|non.*(?:mi )?restituisc|debito.*amico/i,
    legalTerms: "mutuo restituzione somma prova testimoniale limiti valore obbligazione pecuniaria",
    institutes: ["mutuo", "prova_testimoniale", "obbligazione"],
  },
  {
    pattern: /usura|tasso.*(?:eccessiv|usuraio|troppo.*alto)|interessi.*(?:altissim|esorbitant)/i,
    legalTerms: "usura tasso soglia interesse moratorio contratto usurario nullità",
    institutes: ["mutuo", "usura", "nullità"],
  },

  // ─── Contratti generici ───
  {
    pattern: /firma.*(?:contratt|accord)|firmato.*senza.*legger|non.*(?:ho )?letto/i,
    legalTerms: "consenso contrattuale sottoscrizione clausole vessatorie approvazione specifica",
    institutes: ["clausole_vessatorie", "contratto", "consenso"],
  },
  {
    pattern: /disdetta|recedere|annullare.*contratt|cancellare.*abbonament/i,
    legalTerms: "recesso contratto disdetta termine preavviso clausola risolutiva",
    institutes: ["contratto", "risoluzione", "tutela_consumatore"],
  },
  {
    pattern: /penale.*contratt|penalità|pagare.*se.*recedo|costo.*per.*recedere/i,
    legalTerms: "clausola penale riduzione equa recesso contratto penalità eccessiva",
    institutes: ["clausola_penale", "contratto"],
  },
];

/**
 * Arricchisce la legalQuery e suggestedInstitutes con termini giuridici
 * mappati dalle trigger-word colloquiali trovate nella domanda.
 * Questo step avviene PRIMA del postProcessPrep (che gestisce le ensureInstitute).
 * Non sostituisce la legalQuery del modello — la ARRICCHISCE.
 */
function enrichWithTriggerWords(question: string, result: QuestionPrepResult): void {
  const q = question.toLowerCase();

  for (const entry of TRIGGER_WORD_DICTIONARY) {
    if (entry.pattern.test(q)) {
      // Arricchisci legalQuery con termini giuridici (se non già presenti)
      const existingLower = result.legalQuery.toLowerCase();
      // Splitta i termini legali e aggiungi solo quelli non già presenti
      const newTerms = entry.legalTerms
        .split(" ")
        .filter((term) => term.length > 3 && !existingLower.includes(term.toLowerCase()));
      if (newTerms.length > 0) {
        result.legalQuery += " " + newTerms.join(" ");
      }

      // Aggiungi istituti mancanti
      for (const inst of entry.institutes) {
        if (!result.suggestedInstitutes.includes(inst)) {
          result.suggestedInstitutes.push(inst);
        }
      }
    }
  }
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
  const isCivile = /(?:primo grado|impugn|appello|sentenza|giudice.*decis|cassazione|ricorso|ultrapetizion|extrapetizion|decreto ingiuntiv|pignoramento|esecuzion.*forzat|mediazion|sfratto|arbitrat|competenz.*territorial|foro competent|contumacia|litispendenza|preclusioni|deposito.*document|udienza|notifica|citazione|comparsa|memoria|c\.p\.c|rito.*ordinari|riforma.*cartabia|171.*ter|opposizion.*tardiv|rimession.*termin)/i.test(q);
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
  ensureInstitute(/appello|impugnazion|ricorso.*cassazione/i, ["impugnazioni", "ricorso_cassazione"]);
  // Condanna a pagare più del dovuto = ultra petita (anche senza usare il termine)
  ensureInstitute(/condannat.*(?:pagare|importo).*(?:più|maggior|superior)|giudice.*(?:concesso|dato).*(?:più|troppo)/i, ["ultrapetizione", "extrapetizione"]);
  ensureInstitute(/mediazion.*(?:obbligatori|civile)|tentativo.*conciliazione/i, ["mediazione"]);
  ensureInstitute(/ultrapetizion|extrapetizion|corrispondenza.*chiesto.*pronunciat/i, ["ultrapetizione", "extrapetizione"]);
  ensureInstitute(/deposito.*document|riform.*cartabia|art.*171/i, ["preclusioni_istruttorie", "deposito_documenti"]);

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
  ensureInstitute(/ultrapetizion|extrapetizion/i, ["ultrapetizione", "extrapetizione", "ricorso_cassazione"]);

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
  // Broader pattern: catches "non si è presentata", "assenza alla mediazione", "controparte mediazione"
  if (
    (/mediazion.*(?:non.*present|assent|assenz|mancata|non.*compar)/i.test(combined) ||
     /(?:non.*present|assent|assenz|mancata.*partecipazion).*mediazion/i.test(combined) ||
     /controparte.*mediazion|mediazion.*controparte/i.test(combined))
    && !/sanzione.*mediazion|conseguenz.*mancata/i.test(result.legalQuery)
  ) {
    result.legalQuery += " conseguenze mancata partecipazione mediazione obbligatoria sanzione pecuniaria contributo unificato argomento prova sfavorevole giudice D.Lgs. 28/2010";
    if (!result.scopeNotes) {
      result.scopeNotes = "Art. 8 co. 4-bis D.Lgs. 28/2010: due conseguenze dell'assenza ingiustificata alla mediazione: (1) sanzione pecuniaria pari al contributo unificato, (2) argomento di prova sfavorevole.";
    }
  }

  // 12. Enrich legalQuery for asta/abusi edilizi
  // NO article numbers — reference boost pollution
  if (/asta.*(?:giudiziari|immobil)|(?:vendita|esecuzion).*forzat/i.test(combined) && !/abuso.*ediliz|DPR.*380|nullit[àa].*atto/i.test(result.legalQuery)) {
    result.legalQuery += " vendita forzata immobile abuso edilizio nullità atto trasferimento regolarità urbanistica edilizia";
  }

  // 13. Enrich legalQuery for pignoramento prima casa
  // Broader pattern: catches "possono pignorare la casa", "debito privato casa", "prima casa pignorata"
  if (
    (/pignoramento.*(?:prima casa|abitazion|immobil|casa)/i.test(combined) ||
     /(?:prima casa|abitazion|casa.*dove.*vivo).*(?:pignoramento|pignorare|prendere)/i.test(combined) ||
     /(?:debito|creditore|debitore).*(?:prima casa|casa|immobil).*(?:pignora|prend|esecuzion)/i.test(combined) ||
     /(?:possono|possano).*pignorare.*(?:casa|immobil|abitazion)/i.test(combined))
    && !/esecuzion.*immobiliar|creditore.*privat/i.test(result.legalQuery)
  ) {
    result.legalQuery += " esecuzione immobiliare pignoramento prima casa creditore privato Agenzia Entrate Riscossione impignorabilità DPR 602/1973";
    if (!result.scopeNotes) {
      result.scopeNotes = "ATTENZIONE: la tutela della prima casa da pignoramento vale SOLO per crediti fiscali (Agenzia Entrate Riscossione, art. 76 DPR 602/1973). I creditori PRIVATI possono pignorare la prima casa senza limiti (art. 555 ss. c.p.c.). Se DPR 602/1973 non è nel corpus, segnalare la distinzione comunque.";
    }
  }

  // 14. Enrich legalQuery for mantenimento figli (civile + penale)
  if (/(?:manteniment.*figli|padre.*non.*pag|mancato.*manteniment)/i.test(combined) && !/obbligh.*assistenz.*familiar|570/i.test(result.legalQuery)) {
    result.legalQuery += " violazione obblighi assistenza familiare mantenimento figli esecuzione forzata pignoramento stipendio";
  }

  // 15. Enrich legalQuery for prova testimoniale / prestito verbale
  if (/prova.*testimonial|testimonianz|prestit.*verbal/i.test(combined) && !/limit.*prova|2721/i.test(result.legalQuery)) {
    result.legalQuery += " limiti prova testimoniale contratti valore superiore ammissibilità";
  }

  // 16. Enrich legalQuery for ultra/extra petita (helps find Art. 112 + 360 c.p.c.)
  // Broader pattern: catches "giudice ha deciso su questione non sollevata" (extrapetita),
  // "condannato a pagare di più" (ultrapetita), "ha dato più di quanto chiesto"
  if (
    (/ultrapetizion|extrapetizion/i.test(combined) ||
     /giudice.*(?:decis|conced|condannat|pronunciat|dato).*(?:più|quest|non.*solle|super|maggio|oltr)/i.test(combined) ||
     /(?:decis|pronunciat|condannat).*(?:questione.*non.*solle|più.*(?:chiesto|domand))/i.test(combined) ||
     /(?:sentenza|giudic).*(?:ultra|extra)/i.test(combined))
    && !/principio.*corrispondenz|art.*112.*c\.p\.c/i.test(result.legalQuery)
  ) {
    result.legalQuery += " principio corrispondenza chiesto pronunciato vizio sentenza impugnazione ultrapetizione extrapetizione art 112 c.p.c.";
    if (!result.mechanismQuery) {
      result.mechanismQuery = "impugnazione sentenza viziata motivi cassazione nullità processuale art 360 n.4 c.p.c. appello art 342 c.p.c.";
    }
    // Force scopeNotes to remind corpus-agent about the distinction
    if (!result.scopeNotes) {
      result.scopeNotes = "Ultra petita = giudice concede PIU di quanto chiesto (vizio quantitativo). Extra petita = giudice decide su questione MAI sollevata (vizio qualitativo). Art. 112 c.p.c. Rimedio: appello o Cassazione art. 360 n.4.";
    }
  }

  // 17. Enrich legalQuery for Cartabia reform (helps find art. 171-ter c.p.c.)
  // Broader pattern: catches "depositare un documento", "termine per deposito", "deposito in udienza",
  // "quando posso depositare", "documento nuovo in udienza", and also matches without "termine/quando"
  // if the topic is clearly about deposito documenti/memorie in a processual context
  if (
    ((/(?:deposit(?:are|o).*document|document.*(?:nuov|in udienza)|preclusioni.*istruttori|memorie.*udienza)/i.test(combined) && /(?:termine|quando|entro|posso|scadenz)/i.test(combined)) ||
     /(?:deposit(?:are|o).*document|document.*nuov).*(?:udienza|processo|causa|giudice)/i.test(combined) ||
     /(?:udienza|processo).*(?:deposit(?:are|o)|produrre).*(?:document|memori|atto)/i.test(combined))
    && !/cartabia|171.*ter|149.*2022/i.test(result.legalQuery)
  ) {
    result.legalQuery += " riforma Cartabia D.Lgs. 149/2022 preclusioni istruttorie nuovi termini deposito art 171-ter c.p.c.";
    if (!result.scopeNotes) {
      result.scopeNotes = "ATTENZIONE RIFORMA CARTABIA: Art. 171-ter c.p.c. (D.Lgs. 149/2022, in vigore dal 28/02/2023) sostituisce il vecchio Art. 183. Se il corpus contiene solo Art. 183, il testo è PRE-RIFORMA e va segnalato esplicitamente nella risposta.";
    }
  }

  // 18. Enrich for opposizione tardiva decreto ingiuntivo
  if (/(?:decreto ingiuntiv|ingiunzion).*(?:tardiv|ritardo|non.*accort|non.*sapu)/i.test(combined) && !/opposizion.*tardiv|650/i.test(result.legalQuery)) {
    result.legalQuery += " opposizione tardiva rimessione in termini caso fortuito forza maggiore irregolarità notifica";
  }

  // 19. Enrich for prelazione agraria (helps distinguish coltivatore diretto from proprietario)
  if (/prelazion.*agrar|confinant.*(?:terreno|fondo)/i.test(combined) && !/coltivator.*dirett/i.test(result.legalQuery)) {
    result.legalQuery += " coltivatore diretto requisito personale coltivazione non semplice proprietà";
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

    // Trigger-word enrichment: mappa termini colloquiali → giuridici (prima del post-processing)
    enrichWithTriggerWords(question, result);

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
