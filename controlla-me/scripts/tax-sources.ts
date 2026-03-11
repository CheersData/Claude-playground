/**
 * tax-sources.ts — Fonti per il verticale Tax/Commercialista.
 *
 * Verticale: "tax"
 * Fonti:
 *   1. TUIR — D.P.R. 917/1986 — Testo Unico Imposte sui Redditi (Normattiva)
 *   2. IVA  — D.P.R. 633/1972 — Decreto IVA (Normattiva)
 *   3. Statuto del Contribuente — L. 212/2000 (Normattiva)
 *   4. D.Lgs. 231/2001 — Responsabilità amministrativa enti (già in corpus "legal")
 *      → aggiunto qui con vertical="tax" per cross-tagging, NON ricaricato
 *
 * NOTE: D.Lgs. 231/2001 è già caricato nel verticale "legal" (lifecycle: "loaded").
 * Il cross-tagging avviene a livello applicativo: quando si esegue una query
 * per il verticale "tax", includere anche le fonti con id="dlgs_231_2001".
 * NON eseguire data-connector su dlgs_231_2001_tax (evitare duplicati in DB).
 *
 * NOTE TUIR: il D.P.R. 917/1986 è frequentemente aggiornato (anche 2-3 volte/anno).
 * Considerare delta-update automatico (lifecycle: "delta-active") una volta caricato.
 * Il testo consolidato corrente ha ~185 articoli principali con molti commi numerosi.
 *
 * Registrazione automatica: all'import di questo file le fonti Tax
 * vengono aggiunte al registry via registerVertical().
 *
 * Censimento: 2026-03-03 (Strategy + Data Engineering)
 */

import { registerVertical, type CorpusSource } from "./corpus-sources";

export const TAX_SOURCES: CorpusSource[] = [
  {
    id: "tuir",
    name: "TUIR — Testo Unico Imposte sui Redditi",
    shortName: "TUIR",
    type: "normattiva",
    description: "D.P.R. 22 dicembre 1986, n. 917 — Testo Unico delle Imposte sui Redditi (IRPEF, IRES, redditi d'impresa, redditi di lavoro, plusvalenze)",
    urn: "urn:nir:stato:decreto.del.presidente.della.repubblica:1986-12-22;917",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.del.presidente.della.repubblica:1986-12-22;917",
    hierarchyLevels: [
      { key: "part", label: "Parte" },
      { key: "title", label: "Titolo" },
      { key: "chapter", label: "Capo" },
      { key: "section", label: "Sezione" },
    ],
    estimatedArticles: 185,
    connector: {
      normattivaActType: "decreto.del.presidente.della.repubblica",
      normattivaSearchTerms: ["testo unico imposte redditi", "tuir 917 1986", "dpr 917 1986"],
      codiceRedazionale: "086U0917",   // verificato via CONNECT 2026-03-03
      directAkn: true,                 // ZIP async vuoti per leggi 1986 → directAkn
      normattivaDataGU: "19861230",    // G.U. n. 302 del 30 dicembre 1986, S.O. n. 92
      preferredFormat: "akn",
    },
    lifecycle: "loaded",   // caricato 2026-03-03
    vertical: "tax",
  },
  {
    id: "dpr_633_1972_iva",
    name: "Decreto IVA — D.P.R. 633/1972",
    shortName: "D.IVA",
    type: "normattiva",
    description: "D.P.R. 26 ottobre 1972, n. 633 — Istituzione e disciplina dell'imposta sul valore aggiunto (IVA): operazioni imponibili, esenzioni, fatturazione, rimborsi",
    urn: "urn:nir:stato:decreto.del.presidente.della.repubblica:1972-10-26;633",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.del.presidente.della.repubblica:1972-10-26;633",
    hierarchyLevels: [
      { key: "title", label: "Titolo" },
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 81,
    connector: {
      normattivaActType: "decreto.del.presidente.della.repubblica",
      normattivaSearchTerms: ["decreto iva", "dpr 633 1972", "imposta valore aggiunto"],
      codiceRedazionale: "072U0633",   // verificato via CONNECT 2026-03-03
      directAkn: true,                 // ZIP async vuoti per leggi 1972 → directAkn
      normattivaDataGU: "19721111",    // G.U. n. 292 dell'11 novembre 1972
      preferredFormat: "akn",
    },
    lifecycle: "loaded",   // caricato 2026-03-03
    vertical: "tax",
  },
  {
    id: "statuto_contribuente",
    name: "Statuto del Contribuente — L. 212/2000",
    shortName: "Statuto Contribuente",
    type: "normattiva",
    description: "Legge 27 luglio 2000, n. 212 — Disposizioni in materia di statuto dei diritti del contribuente: chiarezza, irretroattività, tutela del contribuente, interpello",
    urn: "urn:nir:stato:legge:2000-07-27;212",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2000-07-27;212",
    hierarchyLevels: [
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 21,
    connector: {
      normattivaActType: "legge",
      normattivaSearchTerms: ["statuto del contribuente", "legge 212 2000", "diritti contribuente"],
      codiceRedazionale: "000G0265",   // verificato via CONNECT 2026-03-03
      directAkn: true,                 // ZIP async vuoti per leggi pre-2010 → directAkn
      normattivaDataGU: "20000731",    // G.U. n. 177 del 31 luglio 2000
      preferredFormat: "akn",
    },
    lifecycle: "loaded",   // caricato 2026-03-03
    vertical: "tax",
  },
  {
    // Cross-reference: già caricato nel verticale "legal" (lifecycle: "loaded").
    // Aggiunto qui per il registry del verticale "tax" — NON eseguire data-connector su questo ID.
    // D.Lgs. 231/2001: responsabilità penale-amministrativa degli enti (modelli organizzativi,
    // reati presupposto, sanzioni), rilevante per compliance aziendale e contratti commerciali con PdR.
    id: "dlgs_231_2001_tax",
    name: "D.Lgs. 231/2001 — Responsabilità amministrativa enti (cross-ref Tax)",
    shortName: "D.Lgs. 231/2001",
    type: "normattiva",
    description: "D.Lgs. 8 giugno 2001, n. 231 — cross-reference dal verticale 'legal'. Già caricato. Rilevante per Tax: modelli organizzativi, reati fiscali presupposto (D.Lgs. 74/2000), compliance aziendale.",
    urn: "urn:nir:stato:decreto.legislativo:2001-06-08;231",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2001-06-08;231",
    hierarchyLevels: [
      { key: "chapter", label: "Capo" },
      { key: "section", label: "Sezione" },
    ],
    estimatedArticles: 109,
    connector: {
      // NON eseguire data-connector: dati già in DB con id="dlgs_231_2001" (vertical="legal")
      // Questo entry esiste solo per il registry del verticale "tax"
      normattivaSearchTerms: ["responsabilita amministrativa enti", "decreto legislativo 231 2001"],
      normattivaActType: "decreto.legislativo",
      preferredFormat: "akn",
    },
    lifecycle: "loaded", // già caricato nel verticale "legal"
    vertical: "tax",
  },
];

// ─── Auto-registrazione ───
// All'import di questo modulo, le fonti Tax vengono registrate nel registry globale.
registerVertical("tax", TAX_SOURCES);

// ─── Esportazioni utility ───

export function getTaxSourceById(id: string): CorpusSource | undefined {
  return TAX_SOURCES.find((s) => s.id === id);
}

export const TAX_SOURCE_IDS = TAX_SOURCES.map((s) => s.id);

/**
 * Istruzioni per caricare il verticale Tax:
 *
 * PREREQUISITO: verificare i codiceRedazionale via API Normattiva prima di eseguire directAkn.
 * Tutti e tre i nuovi atti hanno TODO nel connector — usare prima la ricerca asincrona:
 *   npx tsx scripts/data-connector.ts connect tuir
 *   npx tsx scripts/data-connector.ts connect dpr_633_1972_iva
 *   npx tsx scripts/data-connector.ts connect statuto_contribuente
 *
 * Se la ricerca asincrona produce ZIP vuoti (come per leggi storiche), aggiungere:
 *   directAkn: true + codiceRedazionale verificato + normattivaDataGU
 *
 * D.Lgs. 231/2001: NON eseguire data-connector su "dlgs_231_2001_tax".
 * I dati sono già in DB (id="dlgs_231_2001", vertical="legal").
 * Per query cross-verticale: usare getSourcesByVertical("tax") + filtro su id.
 *
 * Ordine di caricamento suggerito (priorità per MVP):
 * 1. statuto_contribuente (21 art., piccolo, test pipeline)
 * 2. dpr_633_1972_iva     (81 art., IVA — molto richiesto)
 * 3. tuir                 (185 art., core fiscale — più grande)
 */
