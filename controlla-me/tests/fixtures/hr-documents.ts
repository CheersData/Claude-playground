/**
 * HR document loader — reads all 10 HR fixture documents.
 *
 * Combines:
 * - 3 inline documents from hr-contracts.ts (TI, TD, licenziamento giusta causa)
 * - 7 text files from tests/fixtures/hr/ (patto non concorrenza, contestazione,
 *   smart working, apprendistato, somministrazione, dimissioni, straordinario,
 *   TI CCNL commercio clean, TD 6-mesi, licenziamento GMO)
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import type { HRContractMetadata } from "./hr-contracts";

// Re-export the original 3 documents
export {
  CONTRATTO_TEMPO_INDETERMINATO,
  CONTRATTO_TEMPO_DETERMINATO,
  LETTERA_LICENZIAMENTO_GIUSTA_CAUSA,
  METADATA_TEMPO_INDETERMINATO,
  METADATA_TEMPO_DETERMINATO,
  METADATA_LICENZIAMENTO,
} from "./hr-contracts";

// ---------------------------------------------------------------------------
// Helper: read a fixture .txt file
// ---------------------------------------------------------------------------
function readHRFixture(filename: string): string {
  return readFileSync(
    resolve(__dirname, "hr", filename),
    "utf-8"
  );
}

// ---------------------------------------------------------------------------
// 4. Patto di Non Concorrenza — NULLO per assenza corrispettivo
// ---------------------------------------------------------------------------
export const PATTO_NON_CONCORRENZA = readHRFixture("patto-non-concorrenza.txt");

export const METADATA_PATTO_NON_CONCORRENZA: HRContractMetadata = {
  id: "hr-patto-non-concorrenza",
  expectedDocType: "patto_non_concorrenza",
  expectedSubType: "patto_non_concorrenza",
  expectedRisks: [
    // Art. 1 — Durata 36 mesi: per non-dirigenti max 3 anni lecito, ma al limite
    "durata_al_limite_massimo",
    // Art. 2 — Ambito UE: troppo ampio, sproporzionato per consulente
    "ambito_territoriale_sproporzionato",
    // Art. 4 — Corrispettivo ASSENTE (incluso nella retribuzione) = NULLITA ex art. 2125 c.c.
    "corrispettivo_assente_nullita",
    // Art. 5 — Penale EUR 150.000 sproporzionata
    "penale_sproporzionata",
    // Art. 6 — Recesso unilaterale del datore: squilibrato
    "recesso_unilaterale_datore",
    // Art. 7 — Foro esclusivo nullo in controversia lavoro
    "foro_competente_nullo",
  ],
  description:
    "Patto di non concorrenza NULLO per assenza di corrispettivo autonomo (Art. 2125 c.c.), " +
    "ambito territoriale UE sproporzionato, penale EUR 150.000 eccessiva, recesso unilaterale " +
    "a favore del solo datore.",
};

// ---------------------------------------------------------------------------
// 5. Contestazione Disciplinare
// ---------------------------------------------------------------------------
export const CONTESTAZIONE_DISCIPLINARE = readHRFixture("contestazione-disciplinare.txt");

export const METADATA_CONTESTAZIONE_DISCIPLINARE: HRContractMetadata = {
  id: "hr-contestazione-disciplinare",
  expectedDocType: "contestazione_disciplinare",
  expectedSubType: "contestazione_disciplinare",
  expectedRisks: [
    // Addebiti generici senza fatti specifici (date, circostanze, testimoni)
    "addebiti_generici_non_specifici",
    // Manca specificazione della condotta contestata
    "condotta_contestata_vaga",
    // Riferimento a "plurime violazioni" senza dettaglio
    "plurime_violazioni_senza_dettaglio",
  ],
  description:
    "Contestazione disciplinare con addebiti generici: non indica fatti specifici, " +
    "date, circostanze, ma solo formulazioni vaghe. Il diritto di difesa del lavoratore " +
    "e' compromesso dalla genericita' degli addebiti.",
};

// ---------------------------------------------------------------------------
// 6. Accordo Smart Working
// ---------------------------------------------------------------------------
export const ACCORDO_SMART_WORKING = readHRFixture("accordo-smart-working.txt");

export const METADATA_ACCORDO_SMART_WORKING: HRContractMetadata = {
  id: "hr-accordo-smart-working",
  expectedDocType: "accordo_lavoro_agile",
  expectedSubType: "accordo_smart_working",
  expectedRisks: [
    // Documento equilibrato — rischi minimi
    "nessun_rischio_critico",
  ],
  description:
    "Accordo di lavoro agile conforme alla L. 81/2017. Documento equilibrato con " +
    "diritto alla disconnessione, fasce di contattabilita', informativa sicurezza. " +
    "Rischi minimi o assenti.",
};

// ---------------------------------------------------------------------------
// 7. Contratto di Apprendistato Professionalizzante
// ---------------------------------------------------------------------------
export const CONTRATTO_APPRENDISTATO = readHRFixture("contratto-apprendistato.txt");

export const METADATA_CONTRATTO_APPRENDISTATO: HRContractMetadata = {
  id: "hr-apprendistato-professionalizzante",
  expectedDocType: "contratto_lavoro_subordinato",
  expectedSubType: "apprendistato",
  expectedRisks: [
    // Art. 3 — Periodo di prova 6 mesi di calendario: potenzialmente eccessivo per apprendistato
    "periodo_prova_eccessivo_apprendistato",
  ],
  description:
    "Contratto di apprendistato professionalizzante ex art. 44 D.Lgs. 81/2015. " +
    "Generalmente conforme, con piano formativo allegato e tutor nominato. " +
    "Unico rischio: periodo di prova di 6 mesi potenzialmente eccessivo.",
};

// ---------------------------------------------------------------------------
// 8. Contratto di Somministrazione di Lavoro
// ---------------------------------------------------------------------------
export const CONTRATTO_SOMMINISTRAZIONE = readHRFixture("contratto-somministrazione.txt");

export const METADATA_CONTRATTO_SOMMINISTRAZIONE: HRContractMetadata = {
  id: "hr-somministrazione-td",
  expectedDocType: "contratto_somministrazione",
  expectedSubType: "somministrazione",
  expectedRisks: [
    // Documento conforme — rischi minimi, parita' di trattamento rispettata
    "nessun_rischio_critico",
  ],
  description:
    "Contratto di somministrazione a tempo determinato conforme al D.Lgs. 81/2015. " +
    "Causale indicata, parita' di trattamento rispettata, limiti percentuali dichiarati, " +
    "obblighi sicurezza correttamente ripartiti.",
};

// ---------------------------------------------------------------------------
// 9. Lettera di Dimissioni per Giusta Causa
// ---------------------------------------------------------------------------
export const LETTERA_DIMISSIONI_GIUSTA_CAUSA = readHRFixture("lettera-dimissioni-giusta-causa.txt");

export const METADATA_DIMISSIONI_GIUSTA_CAUSA: HRContractMetadata = {
  id: "hr-dimissioni-giusta-causa",
  expectedDocType: "dimissioni",
  expectedSubType: "dimissioni_giusta_causa",
  expectedRisks: [
    // La lettera e' del lavoratore, quindi i "rischi" sono a carico del datore
    // Dal punto di vista del lavoratore: nessuna clausola rischiosa, documento difensivo
    "nessun_rischio_lavoratore",
  ],
  description:
    "Lettera di dimissioni per giusta causa con motivazione dettagliata: " +
    "mancato pagamento 3 mensilita', mancato versamento contributi INPS, demansionamento " +
    "unilaterale. Documento difensivo del lavoratore, conforme all'art. 2119 c.c.",
};

// ---------------------------------------------------------------------------
// 10. Accordo Straordinario
// ---------------------------------------------------------------------------
export const ACCORDO_STRAORDINARIO = readHRFixture("accordo-straordinario.txt");

export const METADATA_ACCORDO_STRAORDINARIO: HRContractMetadata = {
  id: "hr-accordo-straordinario",
  expectedDocType: "accordo_straordinario",
  expectedSubType: "accordo_straordinario",
  expectedRisks: [
    // Documento conforme al D.Lgs. 66/2003 e CCNL
    "nessun_rischio_critico",
  ],
  description:
    "Accordo per prestazioni di lavoro straordinario conforme al D.Lgs. 66/2003. " +
    "Maggiorazioni CCNL correttamente indicate, limiti orari rispettati, " +
    "riposo giornaliero 11 ore garantito, comunicazione RSU effettuata.",
};

// ---------------------------------------------------------------------------
// 11. Contratto TD 6 mesi (dal file .txt — versione alternativa con clausole abusive)
// ---------------------------------------------------------------------------
export const CONTRATTO_TD_6MESI = readHRFixture("contratto-td-6mesi.txt");

export const METADATA_TD_6MESI: HRContractMetadata = {
  id: "hr-td-6mesi-rinnovo-illimitato",
  expectedDocType: "contratto_lavoro_subordinato",
  expectedSubType: "tempo_determinato",
  expectedRisks: [
    // Art. 6 — Rinnovo automatico illimitato senza causale: viola D.Lgs. 81/2015
    "rinnovo_automatico_illimitato",
    // Art. 6 — Preavviso 90 giorni per opporsi al rinnovo: sproporzionato
    "preavviso_opposizione_rinnovo_sproporzionato",
    // Art. 7 — Clausola di esclusiva totale: sproporzionata per TD 6 mesi
    "esclusiva_totale_sproporzionata",
  ],
  description:
    "Contratto TD 6 mesi con rinnovo automatico illimitato senza causale " +
    "(viola D.Lgs. 81/2015), preavviso 90 giorni per opporsi, " +
    "clausola di esclusiva totale sproporzionata.",
};

// ---------------------------------------------------------------------------
// 12. Licenziamento per Giustificato Motivo Oggettivo (dal file .txt)
// ---------------------------------------------------------------------------
export const LETTERA_LICENZIAMENTO_GMO = readHRFixture("lettera-licenziamento-gmc.txt");

export const METADATA_LICENZIAMENTO_GMO: HRContractMetadata = {
  id: "hr-licenziamento-gmo",
  expectedDocType: "lettera_licenziamento",
  expectedSubType: "licenziamento_giustificato_motivo_oggettivo",
  expectedRisks: [
    // Documento conforme — motivazione dettagliata con fatti specifici
    // Obbligo di repechage dichiarato
    "repechage_dichiarato_non_dimostrato",
  ],
  description:
    "Lettera di licenziamento per giustificato motivo oggettivo con motivazione " +
    "dettagliata (calo ordini 35%, riorganizzazione), preavviso CCNL, " +
    "repechage dichiarato. Rischio medio: obbligo repechage dichiarato ma non dimostrato.",
};

// ---------------------------------------------------------------------------
// 13. Contratto TI CCNL Commercio (dal file .txt — versione equilibrata)
// ---------------------------------------------------------------------------
export const CONTRATTO_TI_EQUILIBRATO = readHRFixture("contratto-ti-ccnl-commercio.txt");

export const METADATA_TI_EQUILIBRATO: HRContractMetadata = {
  id: "hr-ti-equilibrato",
  expectedDocType: "contratto_lavoro_subordinato",
  expectedSubType: "tempo_indeterminato",
  expectedRisks: [
    // Documento sostanzialmente conforme
    "nessun_rischio_critico",
  ],
  description:
    "Contratto TI equilibrato e conforme: CCNL Terziario correttamente applicato, " +
    "mansioni definite, trasferimento con rinvio all'art. 2103 c.c., " +
    "periodo di prova 60 giorni, preavviso da CCNL. Rischi minimi.",
};

// ---------------------------------------------------------------------------
// All extended HR fixtures array
// ---------------------------------------------------------------------------

export interface ExtendedHRFixture {
  text: string;
  metadata: HRContractMetadata;
  /** Categoria di rischio complessivo atteso */
  expectedOverallRisk: "critical" | "high" | "medium" | "low";
  /** Se true, il documento e' sostanzialmente conforme e i rischi sono minimi */
  isConforming: boolean;
}

export const ALL_EXTENDED_HR_FIXTURES: ExtendedHRFixture[] = [
  // ─── Documenti problematici ───
  {
    text: PATTO_NON_CONCORRENZA,
    metadata: METADATA_PATTO_NON_CONCORRENZA,
    expectedOverallRisk: "critical",
    isConforming: false,
  },
  {
    text: CONTESTAZIONE_DISCIPLINARE,
    metadata: METADATA_CONTESTAZIONE_DISCIPLINARE,
    expectedOverallRisk: "medium",
    isConforming: false,
  },
  {
    text: CONTRATTO_TD_6MESI,
    metadata: METADATA_TD_6MESI,
    expectedOverallRisk: "high",
    isConforming: false,
  },
  {
    text: LETTERA_LICENZIAMENTO_GMO,
    metadata: METADATA_LICENZIAMENTO_GMO,
    expectedOverallRisk: "medium",
    isConforming: false,
  },
  // ─── Documenti conformi ───
  {
    text: ACCORDO_SMART_WORKING,
    metadata: METADATA_ACCORDO_SMART_WORKING,
    expectedOverallRisk: "low",
    isConforming: true,
  },
  {
    text: CONTRATTO_APPRENDISTATO,
    metadata: METADATA_CONTRATTO_APPRENDISTATO,
    expectedOverallRisk: "low",
    isConforming: true,
  },
  {
    text: CONTRATTO_SOMMINISTRAZIONE,
    metadata: METADATA_CONTRATTO_SOMMINISTRAZIONE,
    expectedOverallRisk: "low",
    isConforming: true,
  },
  {
    text: LETTERA_DIMISSIONI_GIUSTA_CAUSA,
    metadata: METADATA_DIMISSIONI_GIUSTA_CAUSA,
    expectedOverallRisk: "low",
    isConforming: true,
  },
  {
    text: ACCORDO_STRAORDINARIO,
    metadata: METADATA_ACCORDO_STRAORDINARIO,
    expectedOverallRisk: "low",
    isConforming: true,
  },
  {
    text: CONTRATTO_TI_EQUILIBRATO,
    metadata: METADATA_TI_EQUILIBRATO,
    expectedOverallRisk: "low",
    isConforming: true,
  },
];

/**
 * All problematic fixtures (where the pipeline should detect risks).
 */
export const PROBLEMATIC_HR_FIXTURES = ALL_EXTENDED_HR_FIXTURES.filter(
  (f) => !f.isConforming
);

/**
 * All conforming fixtures (where the pipeline should detect minimal risks).
 */
export const CONFORMING_HR_FIXTURES = ALL_EXTENDED_HR_FIXTURES.filter(
  (f) => f.isConforming
);
