/**
 * notarial-sources.ts — Fonti per il verticale Notarile.
 *
 * Verticale: "notarial"
 * Fonti:
 *   1. Reg. UE 650/2012  — Successioni internazionali (EUR-Lex)
 *   2. L. 218/1995       — Diritto internazionale privato (Normattiva)
 *   3. L. 40/2007        — Bersani, liberalizzazioni notarili (Normattiva)
 *
 * Registrazione automatica: all'import di questo file le fonti Notarial
 * vengono aggiunte al registry via registerVertical().
 *
 * Censimento: 2026-03-19 (Data Engineering — task #1107)
 */

import { registerVertical, type CorpusSource } from "./corpus-sources";

export const NOTARIAL_SOURCES: CorpusSource[] = [
  {
    id: "reg_ue_650_2012",
    name: "Reg. UE 650/2012 — Successioni internazionali",
    shortName: "Reg. UE 650/2012",
    type: "eurlex",
    description: "Regolamento (UE) n. 650/2012 del Parlamento europeo e del Consiglio, del 4 luglio 2012, relativo alla competenza, alla legge applicabile, al riconoscimento e all'esecuzione delle decisioni e all'accettazione e all'esecuzione degli atti pubblici in materia di successioni e alla creazione di un certificato successorio europeo",
    celexId: "32012R0650",
    baseUrl: "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32012R0650",
    hierarchyLevels: [
      { key: "chapter", label: "Capo" },
      { key: "section", label: "Sezione" },
    ],
    estimatedArticles: 84,
    connector: { preferredFormat: "html" },
    lifecycle: "planned",
    vertical: "notarial",
  },
  {
    id: "legge_218_1995",
    name: "L. 218/1995 — Diritto internazionale privato",
    shortName: "L. 218/1995",
    type: "normattiva",
    description: "Legge 31 maggio 1995, n. 218 — Riforma del sistema italiano di diritto internazionale privato: competenza giurisdizionale, legge applicabile, riconoscimento sentenze straniere, capacità, matrimonio, filiazione, successioni, obbligazioni, diritti reali",
    urn: "urn:nir:stato:legge:1995-05-31;218",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:1995-05-31;218",
    hierarchyLevels: [
      { key: "title", label: "Titolo" },
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 74,
    connector: {
      normattivaSearchTerms: ["diritto internazionale privato", "legge 218 1995"],
      normattivaActType: "legge",
      // codiceRedazionale: verificare via `npx tsx scripts/data-connector.ts connect legge_218_1995`
      directAkn: true,
      normattivaDataGU: "19950603",    // G.U. n. 128 del 3 giugno 1995, S.O. n. 68
      preferredFormat: "akn",
    },
    lifecycle: "planned",
    vertical: "notarial",
  },
  {
    id: "legge_40_2007",
    name: "L. 40/2007 — Bersani, liberalizzazioni notarili",
    shortName: "L. 40/2007",
    type: "normattiva",
    description: "Legge 2 febbraio 2007, n. 40 — Conversione in legge, con modificazioni, del decreto-legge 31 gennaio 2007, n. 7, recante misure urgenti per la tutela dei consumatori, la promozione della concorrenza, lo sviluppo di attività economiche, la nascita di nuove imprese, la valorizzazione dell'istruzione tecnico-professionale e la rottamazione di autoveicoli (Bersani — liberalizzazioni notarili)",
    urn: "urn:nir:stato:legge:2007-02-02;40",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2007-02-02;40",
    hierarchyLevels: [
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 16,
    connector: {
      normattivaSearchTerms: ["bersani liberalizzazioni", "legge 40 2007", "liberalizzazioni notarili"],
      normattivaActType: "legge",
      // codiceRedazionale: verificare via `npx tsx scripts/data-connector.ts connect legge_40_2007`
      directAkn: true,
      normattivaDataGU: "20070206",    // G.U. n. 31 del 6 febbraio 2007
      preferredFormat: "akn",
    },
    lifecycle: "planned",
    vertical: "notarial",
  },
];

// ─── Auto-registrazione ───
// All'import di questo modulo, le fonti Notarial vengono registrate nel registry globale.
registerVertical("notarial", NOTARIAL_SOURCES);

// ─── Esportazioni utility ───

export function getNotarialSourceById(id: string): CorpusSource | undefined {
  return NOTARIAL_SOURCES.find((s) => s.id === id);
}

export const NOTARIAL_SOURCE_IDS = NOTARIAL_SOURCES.map((s) => s.id);

/**
 * Istruzioni per caricare il verticale Notarile:
 *
 * STEP 1 — Verifica connettività (CONNECT):
 *   npx tsx scripts/data-connector.ts connect reg_ue_650_2012
 *   npx tsx scripts/data-connector.ts connect legge_218_1995
 *   npx tsx scripts/data-connector.ts connect legge_40_2007
 *
 * STEP 2 — Per le fonti Normattiva, verificare codiceRedazionale dal risultato CONNECT.
 *   Se il CONNECT lo trova, aggiornare il campo codiceRedazionale nel connector.
 *   Se ZIP vuoti → confermare directAkn + normattivaDataGU.
 *
 * STEP 3 — Caricamento (ordine suggerito, piccole prima):
 *   npx tsx scripts/data-connector.ts pipeline legge_40_2007 --dry
 *   npx tsx scripts/data-connector.ts pipeline legge_218_1995 --dry
 *   npx tsx scripts/data-connector.ts pipeline reg_ue_650_2012 --dry
 *
 * STEP 4 — Se dry run OK, rimuovere --dry per caricamento effettivo.
 */
