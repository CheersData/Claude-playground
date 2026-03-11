/**
 * hr-sources.ts — Fonti per il verticale HR (risorse umane, sicurezza lavoro).
 *
 * Verticale: "hr"
 * Fonti:
 *   1. D.Lgs. 81/2008 — Testo Unico Sicurezza sul Lavoro (Normattiva)
 *   2. D.Lgs. 276/2003 — Riforma Biagi: contratti di lavoro flessibili (Normattiva)
 *   3. Legge 300/1970  — Statuto dei Lavoratori (Normattiva, directAkn)
 *   4. D.Lgs. 23/2015  — Jobs Act: tutele crescenti licenziamento (Normattiva)
 *   5. D.Lgs. 81/2015  — Codice dei contratti di lavoro (Jobs Act contratti) (Normattiva)
 *   6. D.Lgs. 148/2015 — Cassa Integrazione Guadagni (CIG) (Normattiva)
 *
 * CCNL (Contratti Collettivi Nazionali) — NON su Normattiva.
 * Richiedono un connettore custom (endpoint CNEL o INPS).
 * TODO: implementare CcnlConnector come terzo tipo dopo normattiva/eurlex.
 *
 * Registrazione automatica: all'import di questo file le fonti HR
 * vengono aggiunte al registry via registerVertical().
 */

import { registerVertical, type CorpusSource } from "./corpus-sources";

export const HR_SOURCES: CorpusSource[] = [
  {
    id: "dlgs_81_2008",
    name: "D.Lgs. 81/2008 — Testo Unico Sicurezza sul Lavoro",
    shortName: "T.U. Sicurezza",
    type: "normattiva",
    description: "Decreto Legislativo 9 aprile 2008, n. 81 — Attuazione art. 1 L. 123/2007 in materia di tutela della salute e sicurezza nei luoghi di lavoro",
    urn: "urn:nir:stato:decreto.legislativo:2008-04-09;81",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2008-04-09;81",
    hierarchyLevels: [
      { key: "title", label: "Titolo" },
      { key: "chapter", label: "Capo" },
      { key: "section", label: "Sezione" },
    ],
    estimatedArticles: 306,
    connector: {
      normattivaActType: "decreto.legislativo",
      normattivaSearchTerms: ["decreto legislativo 81 2008", "sicurezza lavoro 81 2008", "testo unico sicurezza"],
      codiceRedazionale: "008G0104",   // codice verificato via API Normattiva 2026-03-01
      directAkn: true,                 // ZIP async vuoti → usa caricaAKN diretto
      normattivaDataGU: "20080430",    // G.U. n. 101 del 30 aprile 2008 (Suppl. Ord. n. 108)
      preferredFormat: "akn",
    },
    lifecycle: "loaded",   // caricato 2026-03-03
    vertical: "hr",
  },
  {
    id: "dlgs_276_2003",
    name: "D.Lgs. 276/2003 — Riforma Biagi",
    shortName: "Biagi",
    type: "normattiva",
    description: "Decreto Legislativo 10 settembre 2003, n. 276 — Attuazione deleghe in materia di occupazione e mercato del lavoro (Legge Biagi)",
    urn: "urn:nir:stato:decreto.legislativo:2003-09-10;276",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2003-09-10;276",
    hierarchyLevels: [
      { key: "title", label: "Titolo" },
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 86,
    connector: {
      normattivaActType: "decreto.legislativo",
      normattivaSearchTerms: ["decreto legislativo 276 2003", "legge biagi"],
      codiceRedazionale: "003G0297",   // codice verificato via API Normattiva 2026-03-01
      directAkn: true,                 // ZIP async vuoti → usa caricaAKN diretto
      normattivaDataGU: "20031009",    // G.U. n. 235 del 9 ottobre 2003
      preferredFormat: "akn",
    },
    lifecycle: "loaded",   // caricato 2026-03-03
    vertical: "hr",
  },
  {
    id: "statuto_lavoratori",
    name: "Statuto dei Lavoratori (L. 300/1970)",
    shortName: "Statuto Lav.",
    type: "normattiva",
    description: "Legge 20 maggio 1970, n. 300 — Norme sulla tutela della libertà e dignità dei lavoratori, della libertà sindacale e dell'attività sindacale nei luoghi di lavoro",
    urn: "urn:nir:stato:legge:1970-05-20;300",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:1970-05-20;300",
    hierarchyLevels: [
      { key: "title", label: "Titolo" },
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 42,
    connector: {
      directAkn: true,
      codiceRedazionale: "070U0300",
      preferredFormat: "akn",
      // caricaAKN web endpoint: ZIP asincroni Open Data vuoti per leggi storiche.
      // dataGU = data pubblicazione GU (27 maggio 1970).
      normattivaDataGU: "19700527",
    },
    lifecycle: "loaded",   // caricato 2026-03-03 | 41 art.
    vertical: "hr",
  },
  {
    id: "dlgs_23_2015",
    name: "D.Lgs. 23/2015 — Jobs Act (Tutele Crescenti)",
    shortName: "Jobs Act",
    type: "normattiva",
    description: "Decreto Legislativo 4 marzo 2015, n. 23 — Disposizioni in materia di contratto di lavoro a tempo indeterminato a tutele crescenti",
    urn: "urn:nir:stato:decreto.legislativo:2015-03-04;23",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2015-03-04;23",
    hierarchyLevels: [
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 11,
    connector: {
      normattivaActType: "decreto.legislativo",
      normattivaSearchTerms: ["tutele crescenti 2015", "jobs act licenziamento"],
      codiceRedazionale: "15G00037",   // codice verificato via API Normattiva 2026-03-01
      directAkn: true,                 // ZIP async vuoti → usa caricaAKN diretto
      normattivaDataGU: "20150306",    // G.U. n. 54 del 6 marzo 2015
      preferredFormat: "akn",
    },
    lifecycle: "loaded",   // caricato 2026-03-03
    vertical: "hr",
  },
  // ─── Fonti aggiuntive — Consulente del Lavoro (censimento 2026-03-03) ───

  {
    id: "dlgs_81_2015",
    name: "D.Lgs. 81/2015 — Codice dei contratti di lavoro",
    shortName: "Jobs Act Contratti",
    type: "normattiva",
    description: "Decreto Legislativo 15 giugno 2015, n. 81 — Disciplina organica dei contratti di lavoro e revisione della normativa in tema di mansioni (Jobs Act, deleghe L. 183/2014)",
    urn: "urn:nir:stato:decreto.legislativo:2015-06-15;81",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2015-06-15;81",
    hierarchyLevels: [
      { key: "title", label: "Titolo" },
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 55,
    connector: {
      normattivaActType: "decreto.legislativo",
      normattivaSearchTerms: ["decreto legislativo 81 2015", "codice contratti lavoro", "jobs act contratti"],
      codiceRedazionale: "15G00095",   // verificato via CONNECT 2026-03-03
      directAkn: true,                 // ZIP async vuoti → usa caricaAKN diretto (come dlgs_23_2015)
      normattivaDataGU: "20150624",    // G.U. n. 144 del 24 giugno 2015, S.O. n. 34
      preferredFormat: "akn",
    },
    lifecycle: "loaded",   // caricato 2026-03-03
    vertical: "hr",
  },
  {
    id: "dlgs_148_2015",
    name: "D.Lgs. 148/2015 — Cassa Integrazione Guadagni",
    shortName: "CIG",
    type: "normattiva",
    description: "Decreto Legislativo 14 settembre 2015, n. 148 — Disposizioni per il riordino della normativa in materia di ammortizzatori sociali in costanza di rapporto di lavoro (Jobs Act, deleghe L. 183/2014)",
    urn: "urn:nir:stato:decreto.legislativo:2015-09-14;148",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2015-09-14;148",
    hierarchyLevels: [
      { key: "title", label: "Titolo" },
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 46,
    connector: {
      normattivaActType: "decreto.legislativo",
      normattivaSearchTerms: ["decreto legislativo 148 2015", "cassa integrazione guadagni", "ammortizzatori sociali"],
      codiceRedazionale: "15G00160",   // verificato via CONNECT 2026-03-03
      directAkn: true,                 // ZIP async vuoti → usa caricaAKN diretto (come dlgs_23_2015)
      normattivaDataGU: "20150923",    // G.U. n. 221 del 23 settembre 2015, S.O. n. 53
      preferredFormat: "akn",
    },
    lifecycle: "loaded",   // caricato 2026-03-03
    vertical: "hr",
  },
];

// ─── Auto-registrazione ───
// All'import di questo modulo, le fonti HR vengono registrate nel registry globale.
registerVertical("hr", HR_SOURCES);

// ─── Esportazioni utility ───

export function getHrSourceById(id: string): CorpusSource | undefined {
  return HR_SOURCES.find((s) => s.id === id);
}

export const HR_SOURCE_IDS = HR_SOURCES.map((s) => s.id);

/**
 * Istruzioni per caricare il verticale HR:
 *
 * 1. Importa questo file nel tuo script di caricamento:
 *    import "@/scripts/hr-sources";  // registra automaticamente il verticale
 *
 * 2. Usa il data-connector per caricare le fonti (ordine suggerito):
 *    npx tsx scripts/data-connector.ts connect statuto_lavoratori
 *    npx tsx scripts/data-connector.ts connect dlgs_276_2003
 *    npx tsx scripts/data-connector.ts connect dlgs_23_2015
 *    npx tsx scripts/data-connector.ts connect dlgs_81_2015
 *    npx tsx scripts/data-connector.ts connect dlgs_148_2015
 *    npx tsx scripts/data-connector.ts connect dlgs_81_2008
 *
 * 3. Verifica nel corpus che gli articoli siano presenti con vertical='hr'
 *
 * NOTE: D.Lgs. 81/2015 e D.Lgs. 148/2015 hanno codiceRedazionale da verificare.
 * Se directAkn fallisce, usare normattivaSearchTerms come fallback (rimuovere directAkn: true).
 *
 * NOTE: CCNL (Contratti Collettivi) non sono su Normattiva.
 * Richiedono un custom CcnlConnector che legga dall'archivio CNEL (www.cnel.it/CCNL)
 * o dall'API INPS. TODO Phase 2.
 */
