/**
 * tax-sources.ts — Fonti per il verticale Tax/Commercialista.
 *
 * Verticale: "tax"
 *
 * === FONTI CARICATE (lifecycle: "loaded") ===
 *   1. TUIR — D.P.R. 917/1986 — Testo Unico Imposte sui Redditi (Normattiva)
 *   2. IVA  — D.P.R. 633/1972 — Decreto IVA (Normattiva)
 *   3. Statuto del Contribuente — L. 212/2000 (Normattiva)
 *   4. D.Lgs. 231/2001 — Responsabilità amministrativa enti (cross-ref da "legal")
 *
 * === FONTI PRONTE PER CARICAMENTO (lifecycle: "api-tested") ===
 *   5. D.P.R. 600/1973 — Accertamento imposte sui redditi (codiceRedazionale: 073U0600)
 *   6. D.P.R. 602/1973 — Riscossione imposte (codiceRedazionale: 073U0602)
 *
 * === FONTI PIANIFICATE (lifecycle: "planned") ===
 *   7. D.Lgs. 74/2000  — Reati tributari (penale fiscale)
 *   8. D.Lgs. 446/1997 — IRAP
 *   9. D.Lgs. 472/1997 — Sanzioni tributarie non penali
 *  10. D.Lgs. 546/1992 — Processo tributario
 *  11. L. 190/2014 (art. 1, co. 54-89) — Regime forfettario (cross-ref da TUIR)
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
 * NOTE D.P.R. 600/1973 e 602/1973: sono le due "gambe procedurali" del sistema fiscale.
 * Il 600 regola l'accertamento (dichiarazioni, controlli, rettifiche, accertamenti sintetici),
 * il 602 regola la riscossione (ruoli, cartelle, fermi, ipoteche, pignoramenti).
 * Essenziali per qualsiasi consulente tributarista.
 *
 * NOTE D.Lgs. 74/2000: reati tributari (dichiarazione fraudolenta, infedele, omessa,
 * occultamento documenti, emissione fatture false). Cross-link con D.Lgs. 231/2001
 * (reati presupposto ex art. 25-quinquiesdecies).
 *
 * Registrazione automatica: all'import di questo file le fonti Tax
 * vengono aggiunte al registry via registerVertical().
 *
 * Censimento completo: 2026-03-09 (Data Engineering)
 * Censimento iniziale: 2026-03-03 (Strategy + Data Engineering)
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

  // ─── Fonti pianificate — censimento completo 2026-03-09 ───

  {
    id: "dpr_600_1973",
    name: "Accertamento imposte sui redditi — D.P.R. 600/1973",
    shortName: "D.P.R. 600/1973",
    type: "normattiva",
    description: "D.P.R. 29 settembre 1973, n. 600 — Disposizioni comuni in materia di accertamento delle imposte sui redditi: dichiarazioni, scritture contabili, ritenute alla fonte, accertamento sintetico/analitico, rettifiche",
    urn: "urn:nir:stato:decreto.del.presidente.della.repubblica:1973-09-29;600",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.del.presidente.della.repubblica:1973-09-29;600",
    hierarchyLevels: [
      { key: "title", label: "Titolo" },
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 83,
    connector: {
      normattivaActType: "decreto.del.presidente.della.repubblica",
      normattivaSearchTerms: ["accertamento imposte redditi", "dpr 600 1973"],
      codiceRedazionale: "073U0600",   // pattern YY+U+NNNN (cfr. 072U0633 DPR IVA, 086U0917 TUIR)
      directAkn: true,
      normattivaDataGU: "19731016",    // G.U. n. 268 del 16 ottobre 1973
      preferredFormat: "akn",
    },
    lifecycle: "api-tested",   // codiceRedazionale verificato 2026-03-14 — pronto per LOAD
    vertical: "tax",
  },
  {
    id: "dpr_602_1973",
    name: "Riscossione imposte — D.P.R. 602/1973",
    shortName: "D.P.R. 602/1973",
    type: "normattiva",
    description: "D.P.R. 29 settembre 1973, n. 602 — Disposizioni sulla riscossione delle imposte sul reddito: iscrizione a ruolo, cartelle di pagamento, rateizzazione, fermo amministrativo, ipoteca, pignoramento",
    urn: "urn:nir:stato:decreto.del.presidente.della.repubblica:1973-09-29;602",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.del.presidente.della.repubblica:1973-09-29;602",
    hierarchyLevels: [
      { key: "title", label: "Titolo" },
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 92,
    connector: {
      normattivaActType: "decreto.del.presidente.della.repubblica",
      normattivaSearchTerms: ["riscossione imposte reddito", "dpr 602 1973"],
      codiceRedazionale: "073U0602",   // pattern YY+U+NNNN (cfr. 072U0633 DPR IVA, 086U0917 TUIR)
      directAkn: true,
      normattivaDataGU: "19731016",    // G.U. n. 268 del 16 ottobre 1973, S.O.
      preferredFormat: "akn",
    },
    lifecycle: "api-tested",   // codiceRedazionale verificato 2026-03-14 — pronto per LOAD
    vertical: "tax",
  },
  {
    id: "dlgs_74_2000",
    name: "Reati tributari — D.Lgs. 74/2000",
    shortName: "D.Lgs. 74/2000",
    type: "normattiva",
    description: "D.Lgs. 10 marzo 2000, n. 74 — Nuova disciplina dei reati in materia di imposte sui redditi e IVA: dichiarazione fraudolenta, infedele, omessa, occultamento documenti contabili, emissione fatture false, indebita compensazione",
    urn: "urn:nir:stato:decreto.legislativo:2000-03-10;74",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2000-03-10;74",
    hierarchyLevels: [
      { key: "title", label: "Titolo" },
    ],
    estimatedArticles: 24,
    connector: {
      normattivaActType: "decreto.legislativo",
      normattivaSearchTerms: ["reati tributari", "decreto legislativo 74 2000", "dichiarazione fraudolenta"],
      codiceRedazionale: "000G0096",   // stima — verificare via CONNECT prima del caricamento
      directAkn: true,
      normattivaDataGU: "20000331",    // G.U. n. 76 del 31 marzo 2000
      preferredFormat: "akn",
    },
    lifecycle: "planned",
    vertical: "tax",
  },
  {
    id: "dlgs_446_1997",
    name: "IRAP — D.Lgs. 446/1997",
    shortName: "IRAP",
    type: "normattiva",
    description: "D.Lgs. 15 dicembre 1997, n. 446 — Istituzione dell'imposta regionale sulle attività produttive (IRAP): base imponibile, aliquote, soggetti passivi, deduzioni",
    urn: "urn:nir:stato:decreto.legislativo:1997-12-15;446",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1997-12-15;446",
    hierarchyLevels: [
      { key: "chapter", label: "Capo" },
      { key: "section", label: "Sezione" },
    ],
    estimatedArticles: 45,
    connector: {
      normattivaActType: "decreto.legislativo",
      normattivaSearchTerms: ["irap", "decreto legislativo 446 1997", "imposta regionale attivita produttive"],
      codiceRedazionale: "097G0440",   // stima — verificare via CONNECT prima del caricamento
      directAkn: true,
      normattivaDataGU: "19971223",    // G.U. n. 298 del 23 dicembre 1997, S.O. n. 252
      preferredFormat: "akn",
    },
    lifecycle: "planned",
    vertical: "tax",
  },
  {
    id: "dlgs_472_1997",
    name: "Sanzioni tributarie — D.Lgs. 472/1997",
    shortName: "D.Lgs. 472/1997",
    type: "normattiva",
    description: "D.Lgs. 18 dicembre 1997, n. 472 — Disposizioni generali in materia di sanzioni amministrative per le violazioni di norme tributarie: principi generali, determinazione sanzione, ravvedimento operoso, definizione agevolata",
    urn: "urn:nir:stato:decreto.legislativo:1997-12-18;472",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1997-12-18;472",
    hierarchyLevels: [
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 31,
    connector: {
      normattivaActType: "decreto.legislativo",
      normattivaSearchTerms: ["sanzioni tributarie", "decreto legislativo 472 1997", "ravvedimento operoso"],
      codiceRedazionale: "097G0466",   // stima — verificare via CONNECT prima del caricamento
      directAkn: true,
      normattivaDataGU: "19980108",    // G.U. n. 5 dell'8 gennaio 1998, S.O. n. 4
      preferredFormat: "akn",
    },
    lifecycle: "planned",
    vertical: "tax",
  },
  {
    id: "dlgs_546_1992",
    name: "Processo tributario — D.Lgs. 546/1992",
    shortName: "D.Lgs. 546/1992",
    type: "normattiva",
    description: "D.Lgs. 31 dicembre 1992, n. 546 — Disposizioni sul processo tributario: giurisdizione, competenza, atti impugnabili, ricorso, istruttoria, sentenza, appello, Corte di Giustizia Tributaria",
    urn: "urn:nir:stato:decreto.legislativo:1992-12-31;546",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:1992-12-31;546",
    hierarchyLevels: [
      { key: "title", label: "Titolo" },
      { key: "chapter", label: "Capo" },
      { key: "section", label: "Sezione" },
    ],
    estimatedArticles: 70,
    connector: {
      normattivaActType: "decreto.legislativo",
      normattivaSearchTerms: ["processo tributario", "decreto legislativo 546 1992", "commissione tributaria"],
      codiceRedazionale: "093G0005",   // stima — verificare via CONNECT prima del caricamento
      directAkn: true,
      normattivaDataGU: "19930113",    // G.U. n. 9 del 13 gennaio 1993, S.O. n. 8
      preferredFormat: "akn",
    },
    lifecycle: "planned",
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
 * === FONTI GIA' CARICATE (lifecycle: "loaded") ===
 * Le prime 3 fonti (TUIR, IVA, Statuto Contribuente) sono già in DB.
 * D.Lgs. 231/2001 è cross-ref dal verticale "legal" — NON eseguire data-connector.
 *
 * === FONTI PIANIFICATE — ORDINE DI CARICAMENTO SUGGERITO ===
 *
 * PREREQUISITO: verificare i codiceRedazionale via API Normattiva prima di eseguire directAkn.
 * Per ogni fonte pianificata, eseguire prima:
 *   npx tsx scripts/data-connector.ts connect <source_id>
 * per ottenere il codiceRedazionale, poi aggiornare il connector config.
 *
 * Ordine suggerito (priorità per completezza verticale):
 *
 * Fase 1 — Core procedurale (essenziali per consulente tributarista):
 *   4. npx tsx scripts/data-connector.ts pipeline dpr_600_1973  (83 art. — accertamento) [api-tested, codiceRedazionale: 073U0600]
 *   5. npx tsx scripts/data-connector.ts pipeline dpr_602_1973  (92 art. — riscossione) [api-tested, codiceRedazionale: 073U0602]
 *
 * Fase 2 — Penale e sanzioni (compliance e contenzioso):
 *   6. npx tsx scripts/data-connector.ts connect dlgs_74_2000   (24 art. — reati tributari)
 *   7. npx tsx scripts/data-connector.ts connect dlgs_472_1997  (31 art. — sanzioni amministrative)
 *
 * Fase 3 — Imposte e processo:
 *   8. npx tsx scripts/data-connector.ts connect dlgs_446_1997  (45 art. — IRAP)
 *   9. npx tsx scripts/data-connector.ts connect dlgs_546_1992  (70 art. — processo tributario)
 *
 * D.Lgs. 231/2001: NON eseguire data-connector su "dlgs_231_2001_tax".
 * I dati sono già in DB (id="dlgs_231_2001", vertical="legal").
 * Per query cross-verticale: usare getSourcesByVertical("tax") + filtro su id.
 *
 * === NOTE PER FUTURI AMPLIAMENTI ===
 *
 * Fonti NON incluse perché non su Normattiva in formato strutturato:
 * - Circolari e risoluzioni AdE: richiederebbero un connettore custom per il sito
 *   dell'Agenzia delle Entrate (https://def.finanze.it). Valutare in Phase 2.
 * - Principi contabili OIC/IFRS: non sono normativa, ma prassi contabile.
 *   Rilevanti per contabilità, non per diritto tributario puro.
 * - L. 190/2014 (Regime forfettario): sono pochi commi (art. 1, co. 54-89) dentro
 *   una legge di bilancio enorme. Meglio estrarre manualmente o come knowledge entry.
 */
