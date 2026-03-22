/**
 * HR-specific factory functions for pipeline agent mock results.
 *
 * Each factory produces a realistic output for HR document types:
 * - Contratto TI (tempo indeterminato)
 * - Contratto TD (tempo determinato)
 * - Lettera di licenziamento
 */
import type {
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
  AdvisorResult,
  Clause,
  Finding,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Classification factories
// ---------------------------------------------------------------------------

export function makeHRClassificationTI(
  overrides?: Partial<ClassificationResult>
): ClassificationResult {
  return {
    documentType: "contratto_lavoro_subordinato",
    documentTypeLabel: "Contratto di Lavoro Subordinato a Tempo Indeterminato",
    documentSubType: "tempo_indeterminato",
    relevantInstitutes: [
      "demansionamento",
      "patto_non_concorrenza",
      "straordinario_non_retribuito",
      "periodo_prova",
    ],
    legalFocusAreas: [
      "diritto_del_lavoro",
      "contrattualistica_lavoro",
      "tutela_lavoratore",
    ],
    parties: [
      { role: "datore_lavoro", name: "ALFA DISTRIBUZIONE S.R.L.", type: "persona_giuridica" },
      { role: "lavoratore", name: "Anna Colombo", type: "persona_fisica" },
    ],
    jurisdiction: "Italia - Diritto del Lavoro",
    applicableLaws: [
      { reference: "Art. 2103 c.c.", name: "Prestazione del lavoro" },
      { reference: "Art. 2125 c.c.", name: "Patto di non concorrenza" },
      { reference: "D.Lgs. 81/2015", name: "Disciplina organica dei contratti di lavoro" },
      { reference: "CCNL Commercio", name: "CCNL Terziario Distribuzione e Servizi" },
    ],
    keyDates: [{ date: "2026-02-10", description: "Data stipula contratto" }],
    summary:
      "Contratto di lavoro subordinato a tempo indeterminato, CCNL Commercio Livello 3, con clausole su mansioni, trasferimento, straordinario e patto di non concorrenza.",
    confidence: 0.95,
    ...overrides,
  };
}

export function makeHRClassificationTD(
  overrides?: Partial<ClassificationResult>
): ClassificationResult {
  return {
    documentType: "contratto_lavoro_subordinato",
    documentTypeLabel: "Contratto di Lavoro Subordinato a Tempo Determinato",
    documentSubType: "tempo_determinato",
    relevantInstitutes: [
      "contratto_termine",
      "rinnovo_automatico",
      "clausola_stabilita",
    ],
    legalFocusAreas: [
      "diritto_del_lavoro",
      "contratti_a_termine",
    ],
    parties: [
      { role: "datore_lavoro", name: "BETA CONSULTING GROUP S.R.L.", type: "persona_giuridica" },
      { role: "lavoratore", name: "Davide Ferrara", type: "persona_fisica" },
    ],
    jurisdiction: "Italia - Diritto del Lavoro",
    applicableLaws: [
      { reference: "D.Lgs. 81/2015", name: "Disciplina organica dei contratti di lavoro" },
      { reference: "Art. 19 D.Lgs. 81/2015", name: "Apposizione del termine e durata massima" },
      { reference: "CCNL Commercio", name: "CCNL Terziario Distribuzione e Servizi" },
    ],
    keyDates: [
      { date: "2026-03-01", description: "Decorrenza contratto" },
      { date: "2027-02-28", description: "Scadenza contratto" },
    ],
    summary:
      "Contratto a tempo determinato 12 mesi, CCNL Commercio Livello 4, con clausola di rinnovo automatico e clausola di stabilità.",
    confidence: 0.93,
    ...overrides,
  };
}

export function makeHRClassificationLicenziamento(
  overrides?: Partial<ClassificationResult>
): ClassificationResult {
  return {
    documentType: "lettera_licenziamento",
    documentTypeLabel: "Lettera di Licenziamento per Giusta Causa",
    documentSubType: "licenziamento_giusta_causa",
    relevantInstitutes: [
      "giusta_causa",
      "procedimento_disciplinare",
      "diritto_difesa",
    ],
    legalFocusAreas: [
      "diritto_del_lavoro",
      "licenziamento",
      "procedura_disciplinare",
    ],
    parties: [
      { role: "datore_lavoro", name: "GAMMA LOGISTICA S.P.A.", type: "persona_giuridica" },
      { role: "lavoratore", name: "Roberto Esposito", type: "persona_fisica" },
    ],
    jurisdiction: "Italia - Diritto del Lavoro",
    applicableLaws: [
      { reference: "Art. 2119 c.c.", name: "Recesso per giusta causa" },
      { reference: "Art. 7 L. 300/1970", name: "Sanzioni disciplinari" },
      { reference: "L. 604/1966", name: "Norme sui licenziamenti individuali" },
    ],
    keyDates: [{ date: "2026-03-05", description: "Data comunicazione licenziamento" }],
    summary:
      "Lettera di licenziamento per giusta causa con motivazione generica e termine difensivo ridotto a 3 giorni.",
    confidence: 0.97,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Analysis factories
// ---------------------------------------------------------------------------

export function makeHRAnalysisTI(
  overrides?: Partial<AnalysisResult>
): AnalysisResult {
  return {
    clauses: [
      {
        id: "hr_ti_1",
        title: "Mansioni vaghe e demansionamento unilaterale",
        originalText:
          "L'Azienda si riserva la facoltà di modificare in qualsiasi momento le mansioni del Lavoratore...",
        riskLevel: "critical",
        issue:
          "La clausola consente il demansionamento unilaterale senza i requisiti dell'art. 2103 c.c.",
        potentialViolation: "Art. 2103 c.c. (come modificato dal D.Lgs. 81/2015)",
        marketStandard: "Mansioni definite con precisione, demansionamento solo per accordo scritto o nei limiti di legge",
        recommendation: "Eliminare la facoltà di modifica unilaterale o limitarla ai casi previsti dalla legge",
      },
      {
        id: "hr_ti_2",
        title: "Trasferimento unilaterale senza ragioni comprovate",
        originalText:
          "L'Azienda si riserva il diritto insindacabile di trasferire il/la Lavoratore/Lavoratrice...",
        riskLevel: "high",
        issue:
          "Trasferimento con soli 5 giorni di preavviso e senza ragioni comprovate viola l'art. 2103 c.c.",
        potentialViolation: "Art. 2103 c.c. — Trasferimento richiede comprovate ragioni",
        marketStandard: "Trasferimento con ragioni documentate e preavviso adeguato (30+ giorni)",
        recommendation: "Inserire l'obbligo di comprovate ragioni tecniche, organizzative o produttive",
      },
      {
        id: "hr_ti_3",
        title: "Straordinario eccessivo senza maggiorazione",
        originalText:
          "Le prestazioni straordinarie eccedenti le prime 8 ore settimanali saranno compensate esclusivamente mediante riposo compensativo...",
        riskLevel: "high",
        issue:
          "20 ore settimanali di straordinario compensate solo con riposo, senza maggiorazione retributiva",
        potentialViolation: "Art. 2108 c.c., D.Lgs. 66/2003, CCNL Commercio art. 137",
        marketStandard: "Straordinario con maggiorazione 15-30% come da CCNL",
        recommendation: "Applicare le maggiorazioni previste dal CCNL Commercio",
      },
      {
        id: "hr_ti_4",
        title: "Patto di non concorrenza con compenso inadeguato",
        originalText:
          "corrispettivo lordo una tantum pari al 5% della RAL per ciascun anno di vincolo",
        riskLevel: "high",
        issue:
          "Il compenso del 10% della RAL per 24 mesi di vincolo su tutto il territorio italiano è inadeguato",
        potentialViolation: "Art. 2125 c.c. — Nullità per difetto di corrispettivo adeguato",
        marketStandard: "Corrispettivo 20-40% della RAL per patti biennali",
        recommendation: "Negoziare un corrispettivo almeno pari al 25-30% della RAL",
      },
    ],
    missingElements: [],
    overallRisk: "high",
    positiveAspects: [
      "CCNL Commercio correttamente applicato",
      "Clausola di rinvio alla normativa vigente",
    ],
    ...overrides,
  };
}

export function makeHRAnalysisTD(
  overrides?: Partial<AnalysisResult>
): AnalysisResult {
  return {
    clauses: [
      {
        id: "hr_td_1",
        title: "Rinnovo automatico senza causale oltre 12 mesi",
        originalText:
          "Il presente contratto si intenderà automaticamente rinnovato per un ulteriore periodo di 12 mesi...",
        riskLevel: "critical",
        issue:
          "Il rinnovo automatico senza causale oltre 12 mesi viola l'art. 19 co. 1 D.Lgs. 81/2015",
        potentialViolation: "Art. 19 co. 1 D.Lgs. 81/2015",
        marketStandard: "Rinnovo con causale obbligatoria oltre 12 mesi cumulativi",
        recommendation: "Eliminare il rinnovo automatico o prevedere causale conforme alla legge",
      },
      {
        id: "hr_td_2",
        title: "Clausola di stabilità con penale eccessiva",
        originalText:
          "il Lavoratore sarà tenuto al pagamento di un'indennità pari alle retribuzioni residue...",
        riskLevel: "high",
        issue:
          "Penale pari alle retribuzioni residue è sproporzionata e potenzialmente vessatoria",
        potentialViolation: "Art. 1341-1342 c.c., principio di proporzionalità",
        marketStandard: "Penale proporzionata (1-2 mensilità)",
        recommendation: "Ridurre la penale a un importo ragionevole (massimo 1-2 mensilità)",
      },
      {
        id: "hr_td_3",
        title: "Foro competente esclusivo nullo",
        originalText:
          "Per qualsiasi controversia... sarà competente in via esclusiva il Foro di Roma.",
        riskLevel: "medium",
        issue:
          "La clausola di foro esclusivo in contratto di lavoro è nulla ex art. 413 c.p.c.",
        potentialViolation: "Art. 413 c.p.c. — Competenza territoriale inderogabile",
        marketStandard: "Nessuna clausola di foro esclusivo nei contratti di lavoro",
        recommendation: "Rimuovere la clausola — il foro competente è determinato dalla legge",
      },
    ],
    missingElements: [
      {
        element: "Causale del rinnovo",
        importance: "high",
        explanation: "Per rinnovo oltre 12 mesi serve causale ai sensi del D.Lgs. 81/2015",
      },
    ],
    overallRisk: "high",
    positiveAspects: [
      "Durata iniziale entro i 12 mesi (non necessita causale)",
      "CCNL Commercio correttamente applicato",
    ],
    ...overrides,
  };
}

export function makeHRAnalysisLicenziamento(
  overrides?: Partial<AnalysisResult>
): AnalysisResult {
  return {
    clauses: [
      {
        id: "hr_lic_1",
        title: "Motivazione generica senza fatti specifici",
        originalText:
          "è stato accertato che il Lavoratore ha tenuto una condotta gravemente lesiva degli interessi aziendali...",
        riskLevel: "critical",
        issue:
          "La motivazione è del tutto generica: non indica fatti, date, circostanze specifiche. Viola l'art. 7 L. 300/1970.",
        potentialViolation: "Art. 7 L. 300/1970 (Statuto dei Lavoratori)",
        marketStandard:
          "Contestazione disciplinare con fatti specifici, date, circostanze e testimoni",
        recommendation:
          "La lettera è impugnabile: richiedere integrazione dei fatti o impugnare il licenziamento",
      },
      {
        id: "hr_lic_2",
        title: "Termine difensivo di 3 giorni (insufficiente)",
        originalText:
          "il Lavoratore ha facoltà di presentare le proprie giustificazioni scritte entro il termine di 3 (tre) giorni...",
        riskLevel: "high",
        issue:
          "Il termine di 3 giorni è inferiore al minimo di 5 giorni previsto dall'art. 7 L. 300/1970",
        potentialViolation: "Art. 7 co. 2 L. 300/1970",
        marketStandard: "Minimo 5 giorni di calendario per le giustificazioni",
        recommendation: "Richiedere la proroga del termine a 5 giorni come previsto dalla legge",
      },
      {
        id: "hr_lic_3",
        title: "Contestazione disciplinare preventiva mancante",
        originalText:
          "La presente comunicazione è stata predisposta nel rispetto delle procedure previste dalla legge...",
        riskLevel: "critical",
        issue:
          "Non risulta una preventiva contestazione disciplinare scritta: licenziamento e contestazione nello stesso atto",
        potentialViolation: "Art. 7 L. 300/1970 — Procedimento disciplinare obbligatorio",
        marketStandard:
          "Procedura: 1) contestazione scritta, 2) difesa lavoratore, 3) eventuale sanzione/licenziamento",
        recommendation:
          "Il licenziamento è nullo per vizio procedurale: impugnare entro 60 giorni",
      },
    ],
    missingElements: [
      {
        element: "Contestazione disciplinare preventiva",
        importance: "high",
        explanation: "Il procedimento disciplinare ex art. 7 L. 300/1970 richiede contestazione preventiva",
      },
    ],
    overallRisk: "critical",
    positiveAspects: [
      "Corretta indicazione dei termini di impugnazione ex art. 6 L. 604/1966",
      "TFR e competenze di fine rapporto previste",
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Investigation factories
// ---------------------------------------------------------------------------

export function makeHRInvestigationTI(
  overrides?: Partial<InvestigationResult>
): InvestigationResult {
  return {
    findings: [
      {
        clauseId: "hr_ti_1",
        laws: [
          {
            reference: "Art. 2103 c.c.",
            fullText:
              "Il lavoratore deve essere adibito alle mansioni per le quali è stato assunto o a quelle corrispondenti all'inquadramento superiore.",
            sourceUrl: "https://www.normattiva.it/",
            isInForce: true,
            lastModified: "2015-06-25",
          },
        ],
        courtCases: [
          {
            reference: "Cass. Civ. Sez. Lav. n. 12345/2024",
            court: "Corte di Cassazione",
            date: "2024-05-10",
            summary: "Il demansionamento unilaterale senza i requisiti di legge è nullo.",
            relevance:
              "Conferma l'obbligo di rispettare i limiti dell'art. 2103 c.c. anche dopo la riforma del 2015",
            sourceUrl: "https://www.italgiure.giustizia.it/",
          },
        ],
        legalOpinion:
          "Orientamento consolidato: il demansionamento unilaterale fuori dai limiti di legge è nullo. La clausola è vessatoria.",
      },
      {
        clauseId: "hr_ti_3",
        laws: [
          {
            reference: "Art. 2108 c.c.",
            fullText:
              "In caso di prolungamento dell'orario normale, il prestatore di lavoro deve essere compensato per il lavoro straordinario.",
            sourceUrl: "https://www.normattiva.it/",
            isInForce: true,
            lastModified: null,
          },
        ],
        courtCases: [],
        legalOpinion:
          "Il compenso dello straordinario mediante solo riposo compensativo, senza maggiorazione, viola la normativa e il CCNL.",
      },
    ],
    ...overrides,
  };
}

export function makeHRInvestigationLicenziamento(
  overrides?: Partial<InvestigationResult>
): InvestigationResult {
  return {
    findings: [
      {
        clauseId: "hr_lic_1",
        laws: [
          {
            reference: "Art. 7 L. 300/1970",
            fullText:
              "Il datore di lavoro non può adottare alcun provvedimento disciplinare nei confronti del lavoratore senza avergli preventivamente contestato l'addebito.",
            sourceUrl: "https://www.normattiva.it/",
            isInForce: true,
            lastModified: null,
          },
        ],
        courtCases: [
          {
            reference: "Cass. Civ. Sez. Lav. n. 8910/2023",
            court: "Corte di Cassazione",
            date: "2023-03-28",
            summary:
              "La genericità della contestazione disciplinare comporta la nullità del licenziamento.",
            relevance:
              "Il lavoratore deve poter comprendere i fatti per difendersi adeguatamente",
            sourceUrl: "https://www.italgiure.giustizia.it/",
          },
        ],
        legalOpinion:
          "Il licenziamento è nullo per vizio procedurale: motivazione generica e contestazione assente.",
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Classification factories — Extended HR document types
// ---------------------------------------------------------------------------

export function makeHRClassificationPattoNonConcorrenza(
  overrides?: Partial<ClassificationResult>
): ClassificationResult {
  return {
    documentType: "patto_non_concorrenza",
    documentTypeLabel: "Patto di Non Concorrenza",
    documentSubType: "patto_non_concorrenza",
    relevantInstitutes: [
      "patto_non_concorrenza",
      "clausola_penale",
      "corrispettivo_non_concorrenza",
    ],
    legalFocusAreas: [
      "diritto_del_lavoro",
      "patto_non_concorrenza",
      "tutela_lavoratore",
    ],
    parties: [
      { role: "datore_lavoro", name: "EPSILON CONSULTING S.P.A.", type: "persona_giuridica" },
      { role: "lavoratore", name: "Luca Marchetti", type: "persona_fisica" },
    ],
    jurisdiction: "Italia - Diritto del Lavoro",
    applicableLaws: [
      { reference: "Art. 2125 c.c.", name: "Patto di non concorrenza" },
      { reference: "Art. 2596 c.c.", name: "Limiti contrattuali della concorrenza" },
    ],
    keyDates: [{ date: "2026-02-20", description: "Data stipula patto" }],
    summary:
      "Patto di non concorrenza 36 mesi, ambito UE, senza corrispettivo autonomo. " +
      "Penale EUR 150.000. Potenzialmente nullo ex art. 2125 c.c.",
    confidence: 0.96,
    ...overrides,
  };
}

export function makeHRClassificationContestazioneDisciplinare(
  overrides?: Partial<ClassificationResult>
): ClassificationResult {
  return {
    documentType: "contestazione_disciplinare",
    documentTypeLabel: "Contestazione Disciplinare",
    documentSubType: "contestazione_disciplinare",
    relevantInstitutes: [
      "sanzioni_disciplinari",
      "diritto_difesa",
      "procedimento_disciplinare",
    ],
    legalFocusAreas: [
      "diritto_del_lavoro",
      "procedura_disciplinare",
    ],
    parties: [
      { role: "datore_lavoro", name: "KAPPA SERVIZI S.R.L.", type: "persona_giuridica" },
      { role: "lavoratore", name: "Monica Bassi", type: "persona_fisica" },
    ],
    jurisdiction: "Italia - Diritto del Lavoro",
    applicableLaws: [
      { reference: "Art. 7 L. 300/1970", name: "Sanzioni disciplinari" },
      { reference: "Art. 2104 c.c.", name: "Diligenza del prestatore di lavoro" },
    ],
    keyDates: [{ date: "2026-03-04", description: "Data contestazione" }],
    summary:
      "Contestazione disciplinare con addebiti generici. Termine 5 giorni corretto. " +
      "Codice disciplinare affisso. Addebiti vaghi compromettono il diritto di difesa.",
    confidence: 0.94,
    ...overrides,
  };
}

export function makeHRClassificationSmartWorking(
  overrides?: Partial<ClassificationResult>
): ClassificationResult {
  return {
    documentType: "accordo_lavoro_agile",
    documentTypeLabel: "Accordo Individuale di Lavoro Agile (Smart Working)",
    documentSubType: "accordo_smart_working",
    relevantInstitutes: [
      "lavoro_agile",
      "diritto_disconnessione",
      "sicurezza_lavoro_dvr",
    ],
    legalFocusAreas: [
      "diritto_del_lavoro",
      "lavoro_agile",
    ],
    parties: [
      { role: "datore_lavoro", name: "DELTA DIGITAL S.R.L.", type: "persona_giuridica" },
      { role: "lavoratore", name: "Giulia Esposito", type: "persona_fisica" },
    ],
    jurisdiction: "Italia - Diritto del Lavoro",
    applicableLaws: [
      { reference: "L. 81/2017, artt. 18-23", name: "Lavoro agile" },
      { reference: "D.Lgs. 66/2003", name: "Orario di lavoro" },
    ],
    keyDates: [{ date: "2026-04-01", description: "Data stipula accordo" }],
    summary:
      "Accordo di lavoro agile conforme alla L. 81/2017 con diritto alla disconnessione, " +
      "fasce di contattabilita', informativa sicurezza e parita' di trattamento.",
    confidence: 0.97,
    ...overrides,
  };
}

export function makeHRClassificationApprendistato(
  overrides?: Partial<ClassificationResult>
): ClassificationResult {
  return {
    documentType: "contratto_lavoro_subordinato",
    documentTypeLabel: "Contratto di Apprendistato Professionalizzante",
    documentSubType: "apprendistato",
    relevantInstitutes: [
      "apprendistato",
      "piano_formativo",
      "tutor_aziendale",
    ],
    legalFocusAreas: [
      "diritto_del_lavoro",
      "formazione_professionale",
      "apprendistato",
    ],
    parties: [
      { role: "datore_lavoro", name: "ZETA MECCANICA S.R.L.", type: "persona_giuridica" },
      { role: "lavoratore", name: "Davide Conti", type: "persona_fisica" },
    ],
    jurisdiction: "Italia - Diritto del Lavoro",
    applicableLaws: [
      { reference: "Art. 44 D.Lgs. 81/2015", name: "Apprendistato professionalizzante" },
      { reference: "CCNL Metalmeccanico Industria", name: "Contratto collettivo" },
    ],
    keyDates: [
      { date: "2026-06-01", description: "Decorrenza contratto" },
      { date: "2029-05-31", description: "Scadenza apprendistato" },
    ],
    summary:
      "Contratto di apprendistato professionalizzante 36 mesi, CCNL Metalmeccanico, " +
      "con piano formativo, tutor nominato e progressione retributiva.",
    confidence: 0.96,
    ...overrides,
  };
}

export function makeHRClassificationSomministrazione(
  overrides?: Partial<ClassificationResult>
): ClassificationResult {
  return {
    documentType: "contratto_somministrazione",
    documentTypeLabel: "Contratto di Somministrazione di Lavoro a Tempo Determinato",
    documentSubType: "somministrazione",
    relevantInstitutes: [
      "somministrazione_lavoro",
      "parita_trattamento",
      "sicurezza_lavoro_dvr",
    ],
    legalFocusAreas: [
      "diritto_del_lavoro",
      "somministrazione",
      "sicurezza_sul_lavoro",
    ],
    parties: [
      { role: "somministratore", name: "LAMBDA WORK S.P.A.", type: "persona_giuridica" },
      { role: "utilizzatore", name: "MU PRODUZIONE S.R.L.", type: "persona_giuridica" },
      { role: "lavoratore", name: "Roberto Santini", type: "persona_fisica" },
    ],
    jurisdiction: "Italia - Diritto del Lavoro",
    applicableLaws: [
      { reference: "D.Lgs. 81/2015, artt. 30-40", name: "Somministrazione di lavoro" },
      { reference: "D.Lgs. 81/2008", name: "Sicurezza sul lavoro" },
    ],
    keyDates: [
      { date: "2026-05-01", description: "Inizio missione" },
      { date: "2026-10-31", description: "Fine missione" },
    ],
    summary:
      "Contratto di somministrazione TD 6 mesi con causale, parita' trattamento, " +
      "limiti percentuali rispettati. Contratto conforme.",
    confidence: 0.95,
    ...overrides,
  };
}

export function makeHRClassificationDimissioni(
  overrides?: Partial<ClassificationResult>
): ClassificationResult {
  return {
    documentType: "dimissioni",
    documentTypeLabel: "Lettera di Dimissioni per Giusta Causa",
    documentSubType: "dimissioni_giusta_causa",
    relevantInstitutes: [
      "dimissioni",
      "giusta_causa",
      "inadempimento_datoriale",
    ],
    legalFocusAreas: [
      "diritto_del_lavoro",
      "cessazione_rapporto",
    ],
    parties: [
      { role: "lavoratore", name: "Sara Valentini", type: "persona_fisica" },
      { role: "datore_lavoro", name: "THETA LOGISTICA S.R.L.", type: "persona_giuridica" },
    ],
    jurisdiction: "Italia - Diritto del Lavoro",
    applicableLaws: [
      { reference: "Art. 2119 c.c.", name: "Recesso per giusta causa" },
      { reference: "Art. 26 D.Lgs. 151/2015", name: "Dimissioni telematiche" },
      { reference: "Art. 2099 c.c.", name: "Retribuzione" },
    ],
    keyDates: [{ date: "2026-03-08", description: "Data dimissioni" }],
    summary:
      "Dimissioni per giusta causa motivate da: mancato pagamento 3 mensilita', " +
      "mancato versamento contributi INPS, demansionamento unilaterale.",
    confidence: 0.97,
    ...overrides,
  };
}

export function makeHRClassificationAccordoStraordinario(
  overrides?: Partial<ClassificationResult>
): ClassificationResult {
  return {
    documentType: "accordo_straordinario",
    documentTypeLabel: "Accordo per Prestazioni di Lavoro Straordinario",
    documentSubType: "accordo_straordinario",
    relevantInstitutes: [
      "orario_e_riposi",
      "straordinario_retribuito",
    ],
    legalFocusAreas: [
      "diritto_del_lavoro",
      "orario_di_lavoro",
    ],
    parties: [
      { role: "datore_lavoro", name: "IOTA ENGINEERING S.P.A.", type: "persona_giuridica" },
      { role: "lavoratore", name: "Andrea Ferraro", type: "persona_fisica" },
    ],
    jurisdiction: "Italia - Diritto del Lavoro",
    applicableLaws: [
      { reference: "D.Lgs. 66/2003, artt. 5-6", name: "Lavoro straordinario" },
      { reference: "CCNL Metalmeccanico Industria", name: "Maggiorazioni straordinario" },
    ],
    keyDates: [
      { date: "2026-04-01", description: "Inizio accordo" },
      { date: "2026-06-30", description: "Scadenza accordo" },
    ],
    summary:
      "Accordo straordinario 3 mesi, max 8 ore/settimana, maggiorazioni CCNL. " +
      "Conforme al D.Lgs. 66/2003.",
    confidence: 0.95,
    ...overrides,
  };
}

export function makeHRClassificationTD6Mesi(
  overrides?: Partial<ClassificationResult>
): ClassificationResult {
  return {
    documentType: "contratto_lavoro_subordinato",
    documentTypeLabel: "Contratto di Lavoro a Tempo Determinato",
    documentSubType: "tempo_determinato",
    relevantInstitutes: [
      "contratto_tempo_determinato",
      "rinnovo_automatico",
      "clausola_esclusiva",
    ],
    legalFocusAreas: [
      "diritto_del_lavoro",
      "contratti_a_termine",
    ],
    parties: [
      { role: "datore_lavoro", name: "ALFA TECNOLOGIE S.R.L.", type: "persona_giuridica" },
      { role: "lavoratore", name: "Anna Colombo", type: "persona_fisica" },
    ],
    jurisdiction: "Italia - Diritto del Lavoro",
    applicableLaws: [
      { reference: "D.Lgs. 81/2015, artt. 19-29", name: "Contratto a tempo determinato" },
    ],
    keyDates: [
      { date: "2026-04-01", description: "Decorrenza" },
      { date: "2026-09-30", description: "Scadenza" },
    ],
    summary:
      "Contratto TD 6 mesi con rinnovo automatico illimitato senza causale e " +
      "clausola di esclusiva totale.",
    confidence: 0.94,
    ...overrides,
  };
}

export function makeHRClassificationLicenziamentoGMO(
  overrides?: Partial<ClassificationResult>
): ClassificationResult {
  return {
    documentType: "lettera_licenziamento",
    documentTypeLabel: "Lettera di Licenziamento per Giustificato Motivo Oggettivo",
    documentSubType: "licenziamento_giustificato_motivo_oggettivo",
    relevantInstitutes: [
      "licenziamento_giustificato_motivo",
      "repechage",
      "preavviso_licenziamento_dimissioni",
    ],
    legalFocusAreas: [
      "diritto_del_lavoro",
      "licenziamento",
    ],
    parties: [
      { role: "datore_lavoro", name: "GAMMA INDUSTRIE S.R.L.", type: "persona_giuridica" },
      { role: "lavoratore", name: "Francesco Moretti", type: "persona_fisica" },
    ],
    jurisdiction: "Italia - Diritto del Lavoro",
    applicableLaws: [
      { reference: "Art. 3 L. 604/1966", name: "Giustificato motivo" },
      { reference: "Art. 7 L. 300/1970", name: "Sanzioni disciplinari" },
      { reference: "Art. 2103 c.c.", name: "Repechage" },
    ],
    keyDates: [
      { date: "2026-03-05", description: "Data licenziamento" },
      { date: "2026-05-05", description: "Cessazione con preavviso" },
    ],
    summary:
      "Licenziamento GMO per riorganizzazione: soppressione posizione, repechage dichiarato. " +
      "Motivazione dettagliata, preavviso conforme CCNL.",
    confidence: 0.96,
    ...overrides,
  };
}

export function makeHRClassificationTIEquilibrato(
  overrides?: Partial<ClassificationResult>
): ClassificationResult {
  return {
    documentType: "contratto_lavoro_subordinato",
    documentTypeLabel: "Contratto di Lavoro Subordinato a Tempo Indeterminato",
    documentSubType: "tempo_indeterminato",
    relevantInstitutes: [
      "mansioni_inquadramento",
      "periodo_di_prova",
      "preavviso_licenziamento_dimissioni",
    ],
    legalFocusAreas: [
      "diritto_del_lavoro",
      "contrattualistica_lavoro",
    ],
    parties: [
      { role: "datore_lavoro", name: "BETA RETAIL S.P.A.", type: "persona_giuridica" },
      { role: "lavoratore", name: "Paolo Ricci", type: "persona_fisica" },
    ],
    jurisdiction: "Italia - Diritto del Lavoro",
    applicableLaws: [
      { reference: "Art. 2094 c.c.", name: "Lavoro subordinato" },
      { reference: "CCNL Terziario", name: "Contratto collettivo" },
    ],
    keyDates: [{ date: "2026-05-01", description: "Decorrenza" }],
    summary:
      "Contratto TI equilibrato, CCNL Terziario II livello, mansioni definite, " +
      "trasferimento con rinvio art. 2103 c.c.",
    confidence: 0.95,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Analysis factories — Extended HR document types
// ---------------------------------------------------------------------------

export function makeHRAnalysisPattoNonConcorrenza(
  overrides?: Partial<AnalysisResult>
): AnalysisResult {
  return {
    clauses: [
      {
        id: "hr_pnc_1",
        title: "Corrispettivo assente (incluso nella retribuzione)",
        originalText:
          "il corrispettivo per il patto di non concorrenza e' da intendersi gia ricompreso nella retribuzione ordinaria",
        riskLevel: "critical",
        issue:
          "L'assenza di corrispettivo autonomo e determinato rende il patto NULLO ex art. 2125 c.c.",
        potentialViolation: "Art. 2125 c.c. — Nullita' per difetto di corrispettivo",
        marketStandard: "Corrispettivo autonomo 20-40% RAL per la durata del vincolo",
        recommendation: "Il patto e' nullo. Se si vuole un patto valido, negoziare corrispettivo autonomo.",
      },
      {
        id: "hr_pnc_2",
        title: "Ambito territoriale UE sproporzionato",
        originalText:
          "il vincolo di non concorrenza si estende all'intero territorio dell'Unione Europea",
        riskLevel: "high",
        issue:
          "L'ambito UE per un consulente gestionale e' sproporzionato rispetto all'effettiva attivita'",
        potentialViolation: "Art. 2125 c.c. — Limiti di oggetto, tempo e luogo",
        marketStandard: "Ambito limitato alle aree di effettiva operativita' del datore",
        recommendation: "Limitare all'Italia o ai mercati dove il datore opera effettivamente",
      },
      {
        id: "hr_pnc_3",
        title: "Penale EUR 150.000 sproporzionata",
        originalText:
          "il Dipendente sara tenuto a corrispondere alla Societa, a titolo di penale, una somma pari a EUR 150.000,00",
        riskLevel: "high",
        issue:
          "La penale di EUR 150.000 e' sproporzionata e potenzialmente riducibile dal giudice (art. 1384 c.c.)",
        potentialViolation: "Art. 1384 c.c. — Riduzione della penale",
        marketStandard: "Penale proporzionata alla retribuzione annua e alla durata del vincolo",
        recommendation: "Il giudice potra' ridurla. Negoziare un importo proporzionato.",
      },
    ],
    missingElements: [
      {
        element: "Corrispettivo autonomo e determinato",
        importance: "high",
        explanation: "Senza corrispettivo autonomo il patto e' nullo (Art. 2125 c.c.)",
      },
    ],
    overallRisk: "critical",
    positiveAspects: [
      "Forma scritta rispettata",
      "Durata 36 mesi entro i limiti per non dirigenti (max 3 anni)",
    ],
    ...overrides,
  };
}

export function makeHRAnalysisContestazioneDisciplinare(
  overrides?: Partial<AnalysisResult>
): AnalysisResult {
  return {
    clauses: [
      {
        id: "hr_cd_1",
        title: "Addebiti generici senza fatti specifici",
        originalText:
          "sono state riscontrate plurime violazioni dei Suoi doveri di diligenza e obbedienza",
        riskLevel: "high",
        issue:
          "La contestazione non indica fatti specifici, date, circostanze: compromette il diritto di difesa",
        potentialViolation: "Art. 7 L. 300/1970 — Principio di specificita' della contestazione",
        marketStandard: "Contestazione con fatti, date, circostanze e eventualmente testimoni",
        recommendation: "Richiedere integrazione con fatti specifici prima di rispondere",
      },
    ],
    missingElements: [
      {
        element: "Fatti specifici contestati",
        importance: "high",
        explanation: "La contestazione deve contenere fatti specifici per consentire la difesa",
      },
    ],
    overallRisk: "medium",
    positiveAspects: [
      "Termine 5 giorni corretto (conforme all'art. 7 L. 300/1970)",
      "Codice disciplinare affisso e richiamato",
      "Facolta' di assistenza sindacale indicata",
    ],
    ...overrides,
  };
}

export function makeHRAnalysisSmartWorking(
  overrides?: Partial<AnalysisResult>
): AnalysisResult {
  return {
    clauses: [],
    missingElements: [],
    overallRisk: "low",
    positiveAspects: [
      "Diritto alla disconnessione espressamente previsto (art. 19 L. 81/2017)",
      "Fasce di contattabilita' ragionevoli",
      "Informativa sicurezza prevista (art. 22 L. 81/2017)",
      "Parita' di trattamento garantita (art. 20 L. 81/2017)",
      "Recesso con preavviso 30 giorni per entrambe le parti",
    ],
    ...overrides,
  };
}

export function makeHRAnalysisApprendistato(
  overrides?: Partial<AnalysisResult>
): AnalysisResult {
  return {
    clauses: [
      {
        id: "hr_app_1",
        title: "Periodo di prova 6 mesi potenzialmente eccessivo",
        originalText:
          "E' stabilito un periodo di prova di 6 (sei) mesi di calendario",
        riskLevel: "medium",
        issue:
          "6 mesi di prova per apprendistato potrebbe essere eccessivo rispetto ai limiti CCNL",
        potentialViolation: "CCNL Metalmeccanico — Limiti periodo di prova per apprendisti",
        marketStandard: "Periodo di prova proporzionato al livello e tipo contratto",
        recommendation: "Verificare i limiti specifici del CCNL Metalmeccanico per apprendisti",
      },
    ],
    missingElements: [],
    overallRisk: "low",
    positiveAspects: [
      "Piano Formativo Individuale allegato (obbligo art. 42 D.Lgs. 81/2015)",
      "Tutor aziendale nominato con esperienza qualificata",
      "Progressione retributiva conforme al CCNL",
      "Formazione di base (120 ore) e tecnica (80 ore/anno) previste",
      "Divieto di recesso anticipato correttamente inserito",
    ],
    ...overrides,
  };
}

export function makeHRAnalysisSomministrazione(
  overrides?: Partial<AnalysisResult>
): AnalysisResult {
  return {
    clauses: [],
    missingElements: [],
    overallRisk: "low",
    positiveAspects: [
      "Parita' di trattamento esplicitamente prevista (art. 35 D.Lgs. 81/2015)",
      "Causale della somministrazione indicata",
      "Limiti percentuali dichiarati (30%)",
      "Obblighi sicurezza correttamente ripartiti tra somministratore e utilizzatore",
      "Diritti sindacali del lavoratore espressamente garantiti",
    ],
    ...overrides,
  };
}

export function makeHRAnalysisDimissioni(
  overrides?: Partial<AnalysisResult>
): AnalysisResult {
  return {
    clauses: [],
    missingElements: [],
    overallRisk: "low",
    positiveAspects: [
      "Motivazione dettagliata con fatti specifici e riferimenti normativi",
      "Richieste chiare e fondate (retribuzioni, contributi, TFR, NASpI)",
      "Riferimento alla procedura telematica ex D.Lgs. 151/2015",
      "Riserva di diritti e azioni formulata correttamente",
    ],
    ...overrides,
  };
}

export function makeHRAnalysisAccordoStraordinario(
  overrides?: Partial<AnalysisResult>
): AnalysisResult {
  return {
    clauses: [],
    missingElements: [],
    overallRisk: "low",
    positiveAspects: [
      "Maggiorazioni CCNL correttamente indicate (25%, 30%, 50%, 55%)",
      "Limiti orari rispettati (8 ore/settimana, 250 ore/anno, 48 ore medie)",
      "Riposo giornaliero 11 ore garantito (art. 7 D.Lgs. 66/2003)",
      "Comunicazione RSU effettuata (art. 5 co. 5 D.Lgs. 66/2003)",
      "Durata temporale definita (3 mesi) con cessazione automatica",
    ],
    ...overrides,
  };
}

export function makeHRAnalysisTD6Mesi(
  overrides?: Partial<AnalysisResult>
): AnalysisResult {
  return {
    clauses: [
      {
        id: "hr_td6_1",
        title: "Rinnovo automatico illimitato senza causale",
        originalText:
          "si rinnova automaticamente per ulteriori periodi di pari durata, senza necessita di comunicazione alcuna tra le parti, e senza limiti al numero di rinnovi consecutivi",
        riskLevel: "critical",
        issue:
          "Rinnovo automatico illimitato senza causale viola il D.Lgs. 81/2015: limite 24 mesi e causale obbligatoria",
        potentialViolation: "Art. 19 e 21 D.Lgs. 81/2015",
        marketStandard: "Rinnovo con causale obbligatoria, limite 24 mesi cumulativi",
        recommendation: "La clausola e' nulla. Il contratto si converte a tempo indeterminato.",
      },
      {
        id: "hr_td6_2",
        title: "Preavviso 90 giorni per opporsi al rinnovo",
        originalText:
          "Il Lavoratore non potra opporsi al rinnovo automatico se non con preavviso di 90 giorni dalla scadenza",
        riskLevel: "high",
        issue:
          "Preavviso 90 giorni su un contratto di 6 mesi e' sproporzionato e limita la liberta' del lavoratore",
        potentialViolation: "Principio di buona fede contrattuale (art. 1375 c.c.)",
        marketStandard: "Preavviso proporzionato alla durata (15-30 giorni)",
        recommendation: "Ridurre il preavviso a un termine ragionevole (15-30 giorni)",
      },
      {
        id: "hr_td6_3",
        title: "Clausola di esclusiva totale",
        originalText:
          "la Lavoratrice si impegna a non prestare attivita lavorativa di qualsiasi natura, anche gratuita, a favore di terzi",
        riskLevel: "high",
        issue:
          "Esclusiva totale (anche attivita' gratuita) e' sproporzionata per un contratto TD 6 mesi",
        potentialViolation: "Principio di proporzionalita', Art. 2105 c.c.",
        marketStandard: "Obbligo di non concorrenza limitato ad attivita' in concorrenza effettiva",
        recommendation: "Limitare l'esclusiva alle sole attivita' in concorrenza diretta",
      },
    ],
    missingElements: [],
    overallRisk: "high",
    positiveAspects: [
      "Causale iniziale indicata per i primi 6 mesi",
      "Periodo di prova ragionevole (30 giorni)",
    ],
    ...overrides,
  };
}

export function makeHRAnalysisLicenziamentoGMO(
  overrides?: Partial<AnalysisResult>
): AnalysisResult {
  return {
    clauses: [
      {
        id: "hr_gmo_1",
        title: "Repechage dichiarato ma non dimostrato",
        originalText:
          "La Societa dichiara di aver verificato l'impossibilita di Sua ricollocazione",
        riskLevel: "medium",
        issue:
          "Il repechage e' solo dichiarato, senza evidenza delle posizioni verificate",
        potentialViolation: "Art. 2103 c.c. — Obbligo di repechage",
        marketStandard: "Documentazione dettagliata delle posizioni verificate e delle ragioni dell'impossibilita'",
        recommendation: "Richiedere evidenza documentale delle posizioni verificate per il repechage",
      },
    ],
    missingElements: [
      {
        element: "Documentazione repechage",
        importance: "medium",
        explanation: "L'onere della prova del repechage spetta al datore di lavoro",
      },
    ],
    overallRisk: "medium",
    positiveAspects: [
      "Motivazione dettagliata con fatti e dati specifici (calo 35%)",
      "Preavviso conforme al CCNL (2 mesi)",
      "Indicazione corretta termini di impugnazione",
      "Competenze di fine rapporto previste",
    ],
    ...overrides,
  };
}

export function makeHRAnalysisTIEquilibrato(
  overrides?: Partial<AnalysisResult>
): AnalysisResult {
  return {
    clauses: [],
    missingElements: [],
    overallRisk: "low",
    positiveAspects: [
      "Mansioni definite con precisione (Responsabile Punto Vendita)",
      "Periodo di prova 60 giorni conforme al CCNL",
      "Trasferimento con rinvio all'art. 2103 c.c.",
      "Retribuzione conforme al CCNL Terziario II livello",
      "Preavviso da CCNL",
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Investigation factories — Extended HR document types
// ---------------------------------------------------------------------------

export function makeHRInvestigationPattoNonConcorrenza(
  overrides?: Partial<InvestigationResult>
): InvestigationResult {
  return {
    findings: [
      {
        clauseId: "hr_pnc_1",
        laws: [
          {
            reference: "Art. 2125 c.c.",
            fullText:
              "Il patto con il quale si limita lo svolgimento dell'attivita' del prestatore di lavoro, " +
              "per il tempo successivo alla cessazione del contratto, e' nullo se non risulta da atto scritto, " +
              "se non e' pattuito un corrispettivo a favore del prestatore di lavoro e se il vincolo non e' " +
              "contenuto entro determinati limiti di oggetto, di tempo e di luogo.",
            sourceUrl: "https://www.normattiva.it/",
            isInForce: true,
            lastModified: null,
          },
        ],
        courtCases: [
          {
            reference: "Cass. Civ. Sez. Lav. n. 3399/2022",
            court: "Corte di Cassazione",
            date: "2022-02-03",
            summary:
              "Il corrispettivo del patto di non concorrenza deve essere autonomo e determinato; " +
              "la sua inclusione nella retribuzione ordinaria comporta la nullita' del patto.",
            relevance:
              "Conferma che il corrispettivo non puo' essere assorbito nella retribuzione corrente",
            sourceUrl: "https://www.italgiure.giustizia.it/",
          },
        ],
        legalOpinion:
          "Il patto e' nullo per difetto di corrispettivo autonomo. " +
          "Giurisprudenza costante della Cassazione.",
      },
    ],
    ...overrides,
  };
}

export function makeHRInvestigationTD6Mesi(
  overrides?: Partial<InvestigationResult>
): InvestigationResult {
  return {
    findings: [
      {
        clauseId: "hr_td6_1",
        laws: [
          {
            reference: "Art. 19 D.Lgs. 81/2015",
            fullText:
              "Al contratto di lavoro subordinato puo' essere apposto un termine di durata non superiore " +
              "a dodici mesi. Il contratto puo' avere una durata superiore, ma comunque non eccedente " +
              "ventiquattro mesi, solo in presenza delle condizioni di cui al comma 1.",
            sourceUrl: "https://www.normattiva.it/",
            isInForce: true,
            lastModified: "2018-07-12",
          },
        ],
        courtCases: [],
        legalOpinion:
          "Il rinnovo automatico illimitato viola il limite dei 24 mesi e l'obbligo di causale. " +
          "La clausola e' nulla e il contratto si converte a tempo indeterminato.",
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Advisor factories — Extended HR document types
// ---------------------------------------------------------------------------

export function makeHRAdvisorPattoNonConcorrenza(
  overrides?: Partial<AdvisorResult>
): AdvisorResult {
  return {
    fairnessScore: 2.0,
    scores: {
      contractEquity: 1.5,
      legalCoherence: 2.5,
      practicalCompliance: 2.0,
      completeness: 2.0,
    },
    summary:
      "Patto nullo per mancanza di corrispettivo. Non sei vincolato, ma e' meglio farlo dichiarare.",
    risks: [
      {
        severity: "alta",
        title: "Patto nullo",
        detail:
          "Non ti danno niente in piu' per non farti lavorare con altri per 3 anni. La legge dice che non vale.",
        legalBasis: "Art. 2125 c.c.",
        courtCase: "Cass. n. 3399/2022",
      },
      {
        severity: "alta",
        title: "Penale sproporzionata",
        detail:
          "150.000 euro di penale per un patto che e' nullo. Un giudice la ridurrebbe comunque.",
        legalBasis: "Art. 1384 c.c.",
        courtCase: "",
      },
    ],
    deadlines: [],
    actions: [
      {
        priority: 1,
        action: "Non firmare",
        rationale: "Il patto e' nullo. Se lo firmi, poi devi comunque impugnarlo.",
      },
      {
        priority: 2,
        action: "Chiedi corrispettivo adeguato",
        rationale: "Se vuoi un patto valido, devi ottenere almeno il 25-30% della RAL.",
      },
    ],
    needsLawyer: true,
    lawyerSpecialization: "Diritto del lavoro — patti di non concorrenza",
    lawyerReason:
      "Patto nullo con penale sproporzionata. Un avvocato puo' negoziare o dichiararlo nullo.",
    ...overrides,
  };
}

export function makeHRAdvisorSmartWorking(
  overrides?: Partial<AdvisorResult>
): AdvisorResult {
  return {
    fairnessScore: 8.5,
    scores: {
      contractEquity: 8.5,
      legalCoherence: 9.0,
      practicalCompliance: 8.5,
      completeness: 8.0,
    },
    summary:
      "Accordo equilibrato e conforme alla legge. Diritti del lavoratore ben tutelati.",
    risks: [],
    deadlines: [],
    actions: [
      {
        priority: 1,
        action: "Firma tranquillamente",
        rationale: "L'accordo e' conforme alla L. 81/2017 e tutela i tuoi diritti.",
      },
    ],
    needsLawyer: false,
    lawyerSpecialization: "",
    lawyerReason: "",
    ...overrides,
  };
}

export function makeHRAdvisorTD6Mesi(
  overrides?: Partial<AdvisorResult>
): AdvisorResult {
  return {
    fairnessScore: 3.5,
    scores: {
      contractEquity: 3.0,
      legalCoherence: 3.5,
      practicalCompliance: 4.0,
      completeness: 3.5,
    },
    summary:
      "Contratto con clausole illegali: rinnovo automatico illimitato e esclusiva totale.",
    risks: [
      {
        severity: "alta",
        title: "Rinnovo automatico illegale",
        detail:
          "Ti rinnovano il contratto all'infinito senza causale. La legge dice max 24 mesi.",
        legalBasis: "Art. 19-21 D.Lgs. 81/2015",
        courtCase: "",
      },
      {
        severity: "alta",
        title: "Esclusiva totale",
        detail:
          "Non puoi fare niente per nessuno, neanche gratis. Per un contratto di 6 mesi e' esagerato.",
        legalBasis: "Art. 2105 c.c.",
        courtCase: "",
      },
    ],
    deadlines: [],
    actions: [
      {
        priority: 1,
        action: "Elimina il rinnovo automatico",
        rationale: "La clausola e' nulla. Chiedi che venga tolta o il contratto si converte a TI.",
      },
    ],
    needsLawyer: true,
    lawyerSpecialization: "Diritto del lavoro — contratti a termine",
    lawyerReason:
      "Clausole nulle che possono portare alla conversione a tempo indeterminato.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Advisor factories
// ---------------------------------------------------------------------------

export function makeHRAdvisorTI(
  overrides?: Partial<AdvisorResult>
): AdvisorResult {
  return {
    fairnessScore: 4.0,
    scores: {
      contractEquity: 3.5,
      legalCoherence: 4.5,
      practicalCompliance: 4.0,
      completeness: 4.0,
    },
    summary:
      "Contratto molto sbilanciato a favore dell'azienda. Clausole su mansioni, straordinario e non concorrenza sono problematiche.",
    risks: [
      {
        severity: "alta",
        title: "Demansionamento a piacere",
        detail:
          "L'azienda può cambiarti mansione quando vuole, anche a livello inferiore. Non è legale senza accordo.",
        legalBasis: "Art. 2103 c.c.",
        courtCase: "Cass. n. 12345/2024",
      },
      {
        severity: "alta",
        title: "Straordinario gratis",
        detail:
          "Fino a 20 ore a settimana di straordinario senza pagarti la maggiorazione prevista dal contratto nazionale.",
        legalBasis: "Art. 2108 c.c., CCNL Commercio",
        courtCase: "",
      },
      {
        severity: "alta",
        title: "Non concorrenza sottopagata",
        detail:
          "Ti bloccano per 2 anni in tutto il territorio italiano ma ti danno solo il 10% dello stipendio.",
        legalBasis: "Art. 2125 c.c.",
        courtCase: "",
      },
    ],
    deadlines: [],
    actions: [
      {
        priority: 1,
        action: "Negozia le mansioni",
        rationale: "Chiedi una definizione precisa delle mansioni e elimina il demansionamento unilaterale.",
      },
      {
        priority: 2,
        action: "Rivedi lo straordinario",
        rationale: "Hai diritto alla maggiorazione prevista dal CCNL. Non accettare solo il riposo compensativo.",
      },
    ],
    needsLawyer: true,
    lawyerSpecialization: "Diritto del lavoro",
    lawyerReason:
      "Clausole potenzialmente nulle su demansionamento e non concorrenza. Un giuslavorista può negoziare modifiche.",
    ...overrides,
  };
}

export function makeHRAdvisorLicenziamento(
  overrides?: Partial<AdvisorResult>
): AdvisorResult {
  return {
    fairnessScore: 2.5,
    scores: {
      contractEquity: 2.0,
      legalCoherence: 2.5,
      practicalCompliance: 3.0,
      completeness: 2.5,
    },
    summary:
      "Licenziamento con gravi vizi procedurali. La motivazione è generica e il termine difensivo troppo breve.",
    risks: [
      {
        severity: "alta",
        title: "Licenziamento impugnabile",
        detail:
          "Non ti hanno detto cosa hai fatto di preciso. Senza fatti concreti, il licenziamento si può contestare.",
        legalBasis: "Art. 7 L. 300/1970",
        courtCase: "Cass. n. 8910/2023",
      },
      {
        severity: "alta",
        title: "Procedura violata",
        detail:
          "Non c'è stata contestazione disciplinare preventiva. Ti hanno licenziato e contestato nello stesso atto.",
        legalBasis: "Art. 7 L. 300/1970",
        courtCase: "",
      },
    ],
    deadlines: [
      {
        date: "Entro 60 giorni dalla ricezione",
        action: "Impugnare il licenziamento (art. 6 L. 604/1966)",
      },
    ],
    actions: [
      {
        priority: 1,
        action: "Impugna subito",
        rationale: "Hai 60 giorni. Il licenziamento ha vizi gravi che un giudice molto probabilmente annullerà.",
      },
    ],
    needsLawyer: true,
    lawyerSpecialization: "Diritto del lavoro — licenziamenti",
    lawyerReason:
      "Licenziamento con vizi procedurali gravi. Serve un avvocato giuslavorista per impugnare entro 60 giorni.",
    ...overrides,
  };
}
