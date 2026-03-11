/**
 * commercial-sources.ts — Fonti per il verticale Commerciale B2B.
 *
 * Verticale: "commercial"
 * Fonti:
 *   1. Codice Civile Libro IV (artt. 1321-2059) — contratti e obbligazioni (Normattiva)
 *      → Codice Civile già caricato per intero (lifecycle: "loaded", vertical: "legal")
 *      → Aggiunto qui per il registry del verticale "commercial" — NON ricaricato
 *   2. D.Lgs. 231/2002 — Ritardi di pagamento nelle transazioni commerciali (Normattiva)
 *   3. D.Lgs. 70/2003  — Commercio elettronico (attuazione Dir. 2000/31/CE) (Normattiva)
 *   4. D.Lgs. 9/2024   — Equità delle piattaforme digitali (attuazione Dir. P2B 2019/1150) (Normattiva)
 *
 * NOTE Codice Civile Libro IV:
 * Il Codice Civile è già interamente caricato (4271 art.) con vertical="legal".
 * Il Libro IV (artt. 1321-2059 circa) copre:
 *   - Titolo II: Contratti in generale (artt. 1321-1469)
 *   - Titolo III: Singoli contratti (vendita, appalto, mandato, agenzia, locazione, ecc.)
 *   - Titolo IX: Fatti illeciti (artt. 2043-2059)
 * Non è necessario ricaricare — gli articoli sono già presenti nel DB.
 * Per query verticale "commercial", filtrare per book="Libro IV" nei metadati hierarchy.
 *
 * Registrazione automatica: all'import di questo file le fonti Commercial
 * vengono aggiunte al registry via registerVertical().
 *
 * Censimento: 2026-03-03 (Strategy + Data Engineering)
 */

import { registerVertical, type CorpusSource } from "./corpus-sources";

export const COMMERCIAL_SOURCES: CorpusSource[] = [
  {
    // Cross-reference: Codice Civile Libro IV già caricato nel verticale "legal".
    // Aggiunto qui per il registry del verticale "commercial" — NON eseguire data-connector.
    // Il Libro IV copre il cuore del diritto contrattuale B2B:
    // Art. 1321 (nozione di contratto) → Art. 2059 (danni non patrimoniali).
    // Comprende: contratto in generale, vendita, appalto, mandato, agenzia commerciale,
    // somministrazione, leasing (atipico), locazione finanziaria, factoring (atipico).
    id: "codice_civile_libro_iv",
    name: "Codice Civile — Libro IV (Obbligazioni e contratti)",
    shortName: "c.c. Libro IV",
    type: "normattiva",
    description: "Regio Decreto 16 marzo 1942, n. 262 — Libro IV 'Delle obbligazioni' (artt. 1321-2059): contratti in generale, singoli contratti tipici, fatti illeciti. Cross-reference dal verticale 'legal', già caricato.",
    urn: "urn:nir:stato:regio.decreto:1942-03-16;262",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1942-03-16;262",
    hierarchyLevels: [
      { key: "book", label: "Libro" },
      { key: "title", label: "Titolo" },
      { key: "chapter", label: "Capo" },
      { key: "section", label: "Sezione" },
    ],
    estimatedArticles: 739, // artt. 1321-2059
    connector: {
      normattivaSearchTerms: ["codice civile"],
      normattivaActType: "regio.decreto",
      preferredFormat: "akn",
      // NON eseguire: dati già in DB (id="codice_civile", vertical="legal")
    },
    lifecycle: "loaded", // già caricato nel verticale "legal"
    vertical: "commercial",
  },
  {
    id: "dlgs_231_2002",
    name: "D.Lgs. 231/2002 — Ritardi di pagamento",
    shortName: "D.Lgs. 231/2002",
    type: "normattiva",
    description: "Decreto Legislativo 9 ottobre 2002, n. 231 — Attuazione della direttiva 2000/35/CE relativa alla lotta contro i ritardi di pagamento nelle transazioni commerciali (interessi moratori, B2B e B2G)",
    urn: "urn:nir:stato:decreto.legislativo:2002-10-09;231",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2002-10-09;231",
    hierarchyLevels: [
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 14,
    connector: {
      normattivaActType: "decreto.legislativo",
      normattivaSearchTerms: ["ritardi pagamento transazioni commerciali", "decreto legislativo 231 2002"],
      // NOTE: ID diverso da D.Lgs. 231/2001 (responsabilità enti) — stessa numerazione, anno diverso!
      codiceRedazionale: "002G0265",   // verificato via CONNECT 2026-03-03
      directAkn: true,                 // ZIP async vuoti per atti 2002 → directAkn
      normattivaDataGU: "20021023",    // G.U. n. 249 del 23 ottobre 2002
      preferredFormat: "akn",
    },
    lifecycle: "loaded",   // caricato 2026-03-03
    vertical: "commercial",
  },
  {
    id: "dlgs_70_2003",
    name: "D.Lgs. 70/2003 — Commercio elettronico",
    shortName: "D.Lgs. 70/2003",
    type: "normattiva",
    description: "Decreto Legislativo 9 aprile 2003, n. 70 — Attuazione della direttiva 2000/31/CE sul commercio elettronico: responsabilità provider, contratti online, informazioni precontrattuali, obblighi di trasparenza",
    urn: "urn:nir:stato:decreto.legislativo:2003-04-09;70",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2003-04-09;70",
    hierarchyLevels: [
      { key: "section", label: "Sezione" },
    ],
    estimatedArticles: 21,
    connector: {
      normattivaActType: "decreto.legislativo",
      normattivaSearchTerms: ["commercio elettronico", "decreto legislativo 70 2003"],
      codiceRedazionale: "003G0090",   // verificato via CONNECT 2026-03-03
      directAkn: true,                 // ZIP async vuoti per atti 2003 → directAkn
      normattivaDataGU: "20030414",    // G.U. n. 87 del 14 aprile 2003
      preferredFormat: "akn",
    },
    lifecycle: "loaded",   // caricato 2026-03-03
    vertical: "commercial",
  },
  {
    id: "dlgs_9_2024",
    name: "D.Lgs. 9/2024 — Equità piattaforme digitali (P2B)",
    shortName: "D.Lgs. 9/2024",
    type: "normattiva",
    description: "Decreto Legislativo 1 marzo 2024, n. 9 — Attuazione del regolamento (UE) 2019/1150 sulla promozione dell'equità e della trasparenza per gli utenti commerciali dei servizi di intermediazione online (Platform-to-Business, P2B)",
    urn: "urn:nir:stato:decreto.legislativo:2024-03-01;9",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2024-03-01;9",
    hierarchyLevels: [
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 12,
    connector: {
      normattivaActType: "decreto.legislativo",
      normattivaSearchTerms: ["equita piattaforme digitali", "decreto legislativo 9 2024", "P2B 2024"],
      // ⛔ BLOCCATO (2026-03-03): D.Lgs. 9/2024 NON è indicizzato nella Normattiva Open Data API.
      // - URN urn:nir:stato:decreto.legislativo:2024-03-01;9 → redirige al D.L. 9/2024 (atto diverso)
      // - ricerca/semplice API: nessun match per DLgs 2024/9
      // - ricerca asincrona (PLL anno=2024 numero=9): "Risorsa non trovata"
      // - caricaAKN con codici candidati (24G00028-24G00040, dataGU 20240301 e 20240305): HTML errore
      // L'atto esiste in G.U. n. 54 del 5 marzo 2024, S.O. n. 7. Probabile causa: indicizzazione
      // Normattiva non ancora completata per le leggi dei Supplementi Ordinari 2024.
      // Soluzioni alternative: download manuale PDF da GU, oppure attendere indicizzazione.
      // DON'T eseguire data-connector su questo ID fino a risoluzione.
      preferredFormat: "akn",
    },
    lifecycle: "blocked",
    vertical: "commercial",
  },
];

// ─── Auto-registrazione ───
// All'import di questo modulo, le fonti Commercial vengono registrate nel registry globale.
registerVertical("commercial", COMMERCIAL_SOURCES);

// ─── Esportazioni utility ───

export function getCommercialSourceById(id: string): CorpusSource | undefined {
  return COMMERCIAL_SOURCES.find((s) => s.id === id);
}

export const COMMERCIAL_SOURCE_IDS = COMMERCIAL_SOURCES.map((s) => s.id);

/**
 * Istruzioni per caricare il verticale Commercial B2B:
 *
 * STEP 1 — Fonti già caricate (nessuna azione richiesta):
 *   - codice_civile_libro_iv: già in DB come "codice_civile" (vertical="legal")
 *     Per query sul Libro IV, filtrare: hierarchy->>'book' = 'Libro IV'
 *
 * STEP 2 — Nuove fonti da caricare (ordine suggerito, piccole prima):
 *   npx tsx scripts/data-connector.ts connect dlgs_9_2024
 *   npx tsx scripts/data-connector.ts connect dlgs_70_2003
 *   npx tsx scripts/data-connector.ts connect dlgs_231_2002
 *
 * STEP 3 — Verifica codiceRedazionale prima di directAkn:
 *   Tutti e tre i nuovi atti hanno TODO nel connector.
 *   Verificare prima con ricerca asincrona standard (rimuovere directAkn: true).
 *   Se ZIP vuoti → aggiungere directAkn + codiceRedazionale + normattivaDataGU.
 *
 * NOTE IMPORTANTE: D.Lgs. 231/2002 (ritardi pagamento) ha lo stesso numero
 * di D.Lgs. 231/2001 (responsabilità enti). ID nel DB separati:
 *   - "dlgs_231_2001" → responsabilità enti (corpus-sources.ts, vertical="legal")
 *   - "dlgs_231_2002" → ritardi pagamento (questo file, vertical="commercial")
 */
