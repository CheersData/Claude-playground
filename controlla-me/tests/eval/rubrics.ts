/**
 * rubrics.ts — Criteri di valutazione per l'eval suite adversariale.
 *
 * Ogni rubric definisce:
 *   - contractFile: path al contratto golden
 *   - expectedType: tipo documento atteso dal Classifier
 *   - mustDetectClauses: clausole problematiche che l'Analyzer DEVE rilevare
 *   - mustNotHallucinate: termini giuridici che l'Investigator NON deve inventare
 *   - scoreRange: range accettabile per fairnessScore (min, max)
 *   - expectNeedsLawyer: se Advisor deve raccomandare avvocato
 *   - severity: severità minima attesa per i rischi principali
 */

export interface ClauseCheck {
  /** Parola chiave o pattern da cercare nel testo delle clausole detected */
  keyword: string;
  /** Severità minima attesa: "critical" | "high" | "medium" */
  minSeverity: "critical" | "high" | "medium";
  /** Descrizione leggibile per il report */
  description: string;
}

export interface EvalRubric {
  id: string;
  name: string;
  contractFile: string;

  /** Tipo documento atteso (dal Classifier) */
  expectedDocumentType: string;

  /** Clausole problematiche che l'Analyzer DEVE rilevare */
  mustDetectClauses: ClauseCheck[];

  /**
   * Termini che l'Investigator NON deve citare come sentenze o norme reali
   * senza trovare effettivamente (hallucination check).
   * Se il runner trova questi termini con claim di certezza, è un fail.
   */
  halluccinationTriggers?: string[];

  /** fairnessScore massimo accettabile (contratti problematici → score basso) */
  maxFairnessScore: number;

  /** Se true, Advisor deve raccomandare avvocato (needsLawyer: true) */
  expectNeedsLawyer: boolean;

  /** Spiegazione legale delle criticità principali (per output report) */
  legalNotes: string;
}

export const EVAL_RUBRICS: EvalRubric[] = [
  {
    id: "01-affitto-penale-illegittima",
    name: "Affitto con penale illegittima (12 mensilità)",
    contractFile: "golden-contracts/01-affitto-penale-illegittima.txt",

    expectedDocumentType: "locazione",

    mustDetectClauses: [
      {
        keyword: "penale",
        minSeverity: "critical",
        description:
          "Penale di 12 mensilità per recesso anticipato — nulla ex art. 79 L. 392/1978 e art. 1385 c.c.: non può essere superiore a 2-3 mensilità",
      },
      {
        keyword: "foro",
        minSeverity: "high",
        description:
          "Foro esclusivo di Torino invece del foro dell'immobile (Torino ≠ Milano) — clausola vessatoria ex art. 33 co. 2 lett. u) D.Lgs. 206/2005",
      },
      {
        keyword: "revisione unilaterale",
        minSeverity: "critical",
        description:
          "Modifica unilaterale del canone da parte del Locatore — nulla ex art. 32 L. 392/1978 e art. 1341 c.c.",
      },
      {
        keyword: "manutenzione",
        minSeverity: "high",
        description:
          "Addossare al conduttore la sostituzione di caldaia e impianti per vetustà — contrasta con art. 1576 c.c.",
      },
      {
        keyword: "spese straordinarie",
        minSeverity: "high",
        description:
          "Spese condominiali straordinarie a carico del conduttore — illegittime ex art. 9 L. 392/1978",
      },
    ],

    halluccinationTriggers: ["Cass. Sez. III", "Trib. Milano", "ordinanza"],

    maxFairnessScore: 3.5,
    expectNeedsLawyer: true,
    legalNotes:
      "Contratto 4+4 con múltiple clausole nulle: penale sproporzionata (art. 79 L. 392/78), foro lontano dall'immobile (art. 33 D.Lgs. 206/05), revisione unilaterale canone (art. 32 L. 392/78), manutenzione straordinaria al conduttore (art. 1576 c.c.).",
  },

  {
    id: "02-lavoro-subordinato-camuffato",
    name: "Contratto di consulenza che maschera subordinazione",
    contractFile: "golden-contracts/02-lavoro-subordinato-camuffato.txt",

    expectedDocumentType: "lavoro",

    mustDetectClauses: [
      {
        keyword: "esclusività",
        minSeverity: "critical",
        description:
          "Esclusività totale e divieto di altri clienti — indice di subordinazione ex art. 2094 c.c.: un lavoratore autonomo può lavorare per più clienti",
      },
      {
        keyword: "orario",
        minSeverity: "critical",
        description:
          "Orario fisso 9-18 con presenza obbligatoria in sede — elemento tipico della subordinazione; il lavoro autonomo non ha orario imposto",
      },
      {
        keyword: "direzione",
        minSeverity: "critical",
        description:
          "Il prestatore opera sotto direzione del Direttore Tecnico con istruzioni quotidiane — eterodirezione = subordinazione ex art. 2094 c.c.",
      },
      {
        keyword: "non concorrenza",
        minSeverity: "high",
        description:
          "Non concorrenza 24 mesi su tutta Italia senza corrispettivo — ex art. 2125 c.c. il patto di non concorrenza richiede un corrispettivo e limiti geografici/temporali ragionevoli; qui è sproporzionato",
      },
      {
        keyword: "compenso fisso",
        minSeverity: "high",
        description:
          "Compenso mensile fisso indipendente dal volume di lavoro — ulteriore indice di subordinazione",
      },
    ],

    halluccinationTriggers: ["Cassazione n.", "sent. n.", "Trib. del Lavoro"],

    maxFairnessScore: 3.0,
    expectNeedsLawyer: true,
    legalNotes:
      "Il contratto presenta tutti gli indici di subordinazione ex art. 2094 c.c.: esclusività, orario fisso, presenza obbligatoria, eterodirezione, strumenti del datore. La riqualificazione come lavoro dipendente è altamente probabile (art. 2 D.Lgs. 81/2015). La non concorrenza post-contrattuale è nulla per mancanza di corrispettivo.",
  },

  {
    id: "03-acquisto-caparra-abusiva",
    name: "Compromesso immobiliare con caparra sproporzionata",
    contractFile: "golden-contracts/03-acquisto-caparra-abusiva.txt",

    expectedDocumentType: "acquisto_immobile",

    mustDetectClauses: [
      {
        keyword: "caparra",
        minSeverity: "critical",
        description:
          "Caparra confirmatoria del 30% (€96.000 su €320.000) — eccessiva rispetto alla prassi (10-15%); in caso di inadempimento acquirente perde tutto",
      },
      {
        keyword: "rifiuto mutuo",
        minSeverity: "critical",
        description:
          "Perdita del 50% della caparra anche se il mutuo viene rifiutato dalla banca — clausola abusiva: il rifiuto bancario non è inadempimento dell'acquirente",
      },
      {
        keyword: "arbitrato",
        minSeverity: "high",
        description:
          "Collegio arbitrale con 2 arbitri nominati dal venditore su 3 — squilibrio strutturale, clausola potenzialmente vessatoria ex art. 33 D.Lgs. 206/2005",
      },
      {
        keyword: "recesso venditore",
        minSeverity: "critical",
        description:
          "Il venditore può recedere restituendo solo la caparra (non il doppio) — violazione della parità ex art. 1385 c.c.: il doppio della caparra è il rimedio legale dell'inadempimento del venditore",
      },
      {
        keyword: "vizi occulti",
        minSeverity: "high",
        description:
          "Rinuncia espressa all'azione redibitoria e estimatoria per vizi occulti — clausola limitativa di responsabilità potenzialmente nulla ex art. 1490 c.c. se relativa a vizi preesistenti",
      },
    ],

    halluccinationTriggers: ["Cass. civ.", "Corte d'Appello", "TAR"],

    maxFairnessScore: 3.0,
    expectNeedsLawyer: true,
    legalNotes:
      "Compromesso gravemente sbilanciato: caparra al 30% vs prassi 10%, venditore può recedere senza pagare il doppio (violazione art. 1385 c.c.), condizione sospensiva mutuo asimmetrica, arbitrato controllato dal venditore. Rischio perdita €96.000 senza inadempimento dell'acquirente.",
  },

  {
    id: "04-locazione-clausole-vietate",
    name: "Locazione transitoria con clausole vietate",
    contractFile: "golden-contracts/04-locazione-clausole-vietate.txt",

    expectedDocumentType: "locazione",

    mustDetectClauses: [
      {
        keyword: "contanti",
        minSeverity: "critical",
        description:
          "Obbligo di pagare in contanti — violazione art. 49 D.Lgs. 231/2007 (antiriciclaggio): sopra €999,99 il pagamento in contanti è vietato",
      },
      {
        keyword: "preavviso",
        minSeverity: "critical",
        description:
          "Preavviso di 12 mesi per recesso del conduttore — illegittimo: per contratti transitori il preavviso legale è 1 mese (art. 5 L. 431/1998); la clausola è nulla",
      },
      {
        keyword: "accesso",
        minSeverity: "high",
        description:
          "Accesso del locatore in qualsiasi momento senza preavviso — violazione art. 14 Costituzione (inviolabilità domicilio); l'accesso richiede accordo con il conduttore",
      },
      {
        keyword: "animali",
        minSeverity: "high",
        description:
          "Divieto assoluto di animali domestici — il D.L. 130/2022 (poi conv. in L. 189/2004 + successive) riconosce il diritto al possesso di animali; il divieto assoluto è contrario alla legge",
      },
      {
        keyword: "cauzione",
        minSeverity: "high",
        description:
          "Cauzione di 5 mensilità — art. 11 L. 392/1978 limita la cauzione a 3 mensilità per i contratti liberi; qui è illegalmente superiore",
      },
      {
        keyword: "residenza",
        minSeverity: "medium",
        description:
          "Divieto di residenza anagrafica — illegittimo: il conduttore ha diritto alla residenza nel luogo di abitazione ex art. 43 c.c. e D.P.R. 223/1989",
      },
    ],

    halluccinationTriggers: ["Cass. Sez. III n.", "decreto", "ministero"],

    maxFairnessScore: 2.5,
    expectNeedsLawyer: true,
    legalNotes:
      "Contratto con almeno 6 violazioni di legge: pagamento cash (antiriciclaggio), preavviso 12 mesi (nullo, max 1 mese), accesso senza preavviso (incostituzionale), divieto animali (illegittimo), cauzione 5 mensilità (max legale 3), divieto residenza (illegittimo). Contratto quasi interamente nullo nelle clausole sfavorevoli.",
  },

  {
    id: "05-vendita-esclusione-garanzie-b2c",
    name: "CGV e-commerce con esclusione garanzie legali B2C",
    contractFile: "golden-contracts/05-vendita-esclusione-garanzie-b2c.txt",

    expectedDocumentType: "contratto_fornitura",

    mustDetectClauses: [
      {
        keyword: "recesso",
        minSeverity: "critical",
        description:
          "Rinuncia al diritto di recesso 14 giorni — NULLA ex art. 52 D.Lgs. 206/2005 (Codice del Consumo): nei contratti B2C a distanza il diritto di recesso è inderogabile",
      },
      {
        keyword: "garanzia",
        minSeverity: "critical",
        description:
          "Esclusione della garanzia legale di conformità — NULLA ex artt. 128-135 D.Lgs. 206/2005: la garanzia legale 2 anni è inderogabile in sfavore del consumatore",
      },
      {
        keyword: "arbitrato obbligatorio",
        minSeverity: "critical",
        description:
          "Arbitrato obbligatorio che esclude il giudice ordinario — clausola vessatoria nulla ex art. 33 co. 2 lett. t) D.Lgs. 206/2005 nei contratti B2C",
      },
      {
        keyword: "legge di Singapore",
        minSeverity: "critical",
        description:
          "Scelta della legge di Singapore con esclusione del Codice del Consumo — NULLA ex art. 6 Reg. Roma I (593/2008): i consumatori UE mantengono le protezioni del paese di residenza",
      },
      {
        keyword: "rischio",
        minSeverity: "high",
        description:
          "Trasferimento del rischio al corriere invece che alla consegna — viola art. 61 D.Lgs. 206/2005: nei contratti B2C a distanza il rischio passa all'acquirente alla consegna fisica",
      },
    ],

    halluccinationTriggers: ["Cass. civ. Sez. I", "AGCM provv.", "Garante n."],

    maxFairnessScore: 2.0,
    expectNeedsLawyer: false, // B2C: più che avvocato, segnalare AGCM o ADR
    legalNotes:
      "CGV con 5+ clausole nulle di diritto: esclusione recesso 14gg (art. 52 Cod.Consumo), esclusione garanzia legale (art. 128), arbitrato obbligatorio (art. 33), legge Singapore inapplicabile (Reg. Roma I art. 6), rischio al corriere (art. 61). L'intera sezione garanzie è nulla. AGCM potrebbe sanzionare.",
  },
];
