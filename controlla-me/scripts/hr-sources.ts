/**
 * hr-sources.ts — Fonti per il verticale HR (risorse umane, sicurezza lavoro).
 *
 * Verticale: "hr"
 * Fonti:
 *   1. D.Lgs. 81/2008 — Testo Unico Sicurezza sul Lavoro (Normattiva)
 *   2. D.Lgs. 276/2003 — Riforma Biagi: contratti di lavoro flessibili (Normattiva)
 *   3. Legge 300/1970  — Statuto dei Lavoratori (Normattiva, directAkn)
 *   4. D.Lgs. 23/2015  — Jobs Act: tutele crescenti licenziamento (Normattiva)
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
      normattivaSearchTerms: ["sicurezza lavoro 81 2008", "testo unico sicurezza"],
      preferredFormat: "akn",
    },
    lifecycle: "planned",
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
      preferredFormat: "akn",
    },
    lifecycle: "planned",
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
    },
    lifecycle: "planned",
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
      preferredFormat: "akn",
    },
    lifecycle: "planned",
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
 * 2. Usa il data-connector per caricare le fonti:
 *    npx tsx scripts/data-connector.ts connect dlgs_81_2008
 *    npx tsx scripts/data-connector.ts load dlgs_81_2008
 *
 * 3. Verifica nel corpus che gli articoli siano presenti con vertical='hr'
 *
 * NOTE: CCNL (Contratti Collettivi) non sono su Normattiva.
 * Richiedono un custom CcnlConnector che legga dall'archivio CNEL (www.cnel.it/CCNL)
 * o dall'API INPS. TODO Phase 2.
 */
