#!/usr/bin/env npx tsx
/**
 * seed-corpus.ts — Scarica e carica TUTTO il corpus legislativo italiano.
 *
 * Fonti:
 * 1. Codice Civile (3.040 articoli) da HuggingFace: AndreaSimeri/Italian_Civil_Code
 * 2. Decreto Legislativo + Leggi chiave da Normattiva OpenData (o fallback hardcoded)
 *
 * Uso:
 *   npx tsx controlla-me/scripts/seed-corpus.ts
 *
 * Requisiti:
 *   - VOYAGE_API_KEY nel .env.local (per generare embeddings)
 *   - NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nel .env.local
 *   - Migration 003_vector_db.sql già eseguita su Supabase
 *
 * Il processo:
 *   1. Scarica tutti gli articoli dal HuggingFace Datasets API (paginato, 100/pagina)
 *   2. Classifica ogni articolo con gerarchia (Libro/Titolo/Capo), istituti e keywords
 *   3. Genera embeddings con Voyage AI (voyage-law-2, batch da 50)
 *   4. Carica su Supabase via upsert (idempotente, può essere rieseguito)
 *
 * Nota: il processo è idempotente grazie all'upsert su (law_source, article_reference).
 * Se lo riesegui, aggiorna gli articoli esistenti senza duplicarli.
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Carica env dal .env.local della app
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// ─── Configurazione ───

const HUGGINGFACE_API = "https://datasets-server.huggingface.co/rows";
const DATASET = "AndreaSimeri/Italian_Civil_Code";
const PAGE_SIZE = 100;

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-law-2";
const EMBEDDING_BATCH_SIZE = 50; // Più conservativo per non saturare la API
const EMBEDDING_DIMENSIONS = 1024;

const SUPABASE_BATCH_SIZE = 50; // Articoli per batch di upsert

// ─── Tipi ───

interface HuggingFaceRow {
  article_id: string;
  article_title: string;
  article_text: string;
  article_references: string;
}

interface HuggingFaceResponse {
  rows: Array<{ row: HuggingFaceRow }>;
  num_rows_total: number;
  num_rows_per_page: number;
}

interface LegalArticle {
  lawSource: string;
  articleReference: string;
  articleTitle: string | null;
  articleText: string;
  hierarchy: Record<string, string>;
  keywords: string[];
  relatedInstitutes: string[];
  sourceUrl?: string;
  isInForce: boolean;
}

// ─── Gerarchia del Codice Civile ───
// Mappa gli intervalli di articoli ai Libri, Titoli e Capi del Codice Civile

interface HierarchyEntry {
  book: string;
  title?: string;
  chapter?: string;
}

const CODICE_CIVILE_HIERARCHY: Array<{
  from: number;
  to: number;
  hierarchy: HierarchyEntry;
}> = [
  // Libro I — Delle persone e della famiglia
  { from: 1, to: 10, hierarchy: { book: "Libro I — Delle persone e della famiglia", title: "Titolo I — Delle persone fisiche" } },
  { from: 11, to: 35, hierarchy: { book: "Libro I", title: "Titolo II — Delle persone giuridiche" } },
  { from: 36, to: 42, hierarchy: { book: "Libro I", title: "Titolo III — Del domicilio e della residenza" } },
  { from: 43, to: 78, hierarchy: { book: "Libro I", title: "Titolo IV — Dell'assenza e della dichiarazione di morte presunta" } },
  { from: 79, to: 142, hierarchy: { book: "Libro I", title: "Titolo VI — Del matrimonio" } },
  { from: 143, to: 230, hierarchy: { book: "Libro I", title: "Titolo VI — Del matrimonio", chapter: "Dei diritti e doveri" } },
  { from: 231, to: 314, hierarchy: { book: "Libro I", title: "Titolo VII — Della filiazione" } },
  { from: 315, to: 342, hierarchy: { book: "Libro I", title: "Titolo VIII — Dell'adozione" } },
  { from: 343, to: 399, hierarchy: { book: "Libro I", title: "Titolo IX — Della responsabilità genitoriale" } },
  { from: 400, to: 413, hierarchy: { book: "Libro I", title: "Titolo X — Della tutela e dell'emancipazione" } },
  { from: 414, to: 432, hierarchy: { book: "Libro I", title: "Titolo XII — Delle misure di protezione" } },
  { from: 433, to: 455, hierarchy: { book: "Libro I", title: "Titolo XIII — Degli alimenti" } },

  // Libro II — Delle successioni
  { from: 456, to: 564, hierarchy: { book: "Libro II — Delle successioni", title: "Titolo I — Disposizioni generali sulle successioni" } },
  { from: 565, to: 712, hierarchy: { book: "Libro II", title: "Titolo II — Delle successioni legittime" } },
  { from: 587, to: 712, hierarchy: { book: "Libro II", title: "Titolo III — Delle successioni testamentarie" } },
  { from: 713, to: 768, hierarchy: { book: "Libro II", title: "Titolo IV — Della divisione" } },
  { from: 769, to: 809, hierarchy: { book: "Libro II", title: "Titolo V — Delle donazioni" } },

  // Libro III — Della proprietà
  { from: 810, to: 831, hierarchy: { book: "Libro III — Della proprietà", title: "Titolo I — Dei beni" } },
  { from: 832, to: 951, hierarchy: { book: "Libro III", title: "Titolo II — Della proprietà" } },
  { from: 952, to: 1026, hierarchy: { book: "Libro III", title: "Titolo III — Della superficie" } },
  { from: 1027, to: 1099, hierarchy: { book: "Libro III", title: "Titolo V — Delle servitù prediali" } },
  { from: 1100, to: 1139, hierarchy: { book: "Libro III", title: "Titolo VII — Della comunione" } },
  { from: 1117, to: 1139, hierarchy: { book: "Libro III", title: "Titolo VII — Del condominio negli edifici" } },

  // Libro IV — Delle obbligazioni
  { from: 1173, to: 1217, hierarchy: { book: "Libro IV — Delle obbligazioni", title: "Titolo I — Delle obbligazioni in generale" } },
  { from: 1218, to: 1276, hierarchy: { book: "Libro IV", title: "Titolo I", chapter: "Dell'adempimento" } },
  { from: 1277, to: 1320, hierarchy: { book: "Libro IV", title: "Titolo I", chapter: "Dell'inadempimento" } },
  { from: 1321, to: 1352, hierarchy: { book: "Libro IV", title: "Titolo II — Dei contratti in generale", chapter: "Dei requisiti del contratto" } },
  { from: 1353, to: 1381, hierarchy: { book: "Libro IV", title: "Titolo II", chapter: "Della conclusione del contratto" } },
  { from: 1382, to: 1405, hierarchy: { book: "Libro IV", title: "Titolo II", chapter: "Della causa e dei motivi" } },
  { from: 1406, to: 1469, hierarchy: { book: "Libro IV", title: "Titolo II", chapter: "Degli effetti del contratto" } },
  { from: 1470, to: 1547, hierarchy: { book: "Libro IV", title: "Titolo III — Dei singoli contratti", chapter: "Della vendita" } },
  { from: 1548, to: 1570, hierarchy: { book: "Libro IV", title: "Titolo III", chapter: "Del riporto e della permuta" } },
  { from: 1571, to: 1654, hierarchy: { book: "Libro IV", title: "Titolo III", chapter: "Della locazione" } },
  { from: 1655, to: 1677, hierarchy: { book: "Libro IV", title: "Titolo III", chapter: "Dell'appalto" } },
  { from: 1678, to: 1702, hierarchy: { book: "Libro IV", title: "Titolo III", chapter: "Del trasporto" } },
  { from: 1703, to: 1741, hierarchy: { book: "Libro IV", title: "Titolo III", chapter: "Del mandato" } },
  { from: 1742, to: 1753, hierarchy: { book: "Libro IV", title: "Titolo III", chapter: "Della commissione, spedizione e agenzia" } },
  { from: 1754, to: 1765, hierarchy: { book: "Libro IV", title: "Titolo III", chapter: "Della mediazione" } },
  { from: 1766, to: 1797, hierarchy: { book: "Libro IV", title: "Titolo III", chapter: "Del deposito" } },
  { from: 1798, to: 1812, hierarchy: { book: "Libro IV", title: "Titolo III", chapter: "Del sequestro convenzionale" } },
  { from: 1813, to: 1822, hierarchy: { book: "Libro IV", title: "Titolo III", chapter: "Del comodato" } },
  { from: 1823, to: 1860, hierarchy: { book: "Libro IV", title: "Titolo III", chapter: "Del mutuo" } },
  { from: 1861, to: 1932, hierarchy: { book: "Libro IV", title: "Titolo III", chapter: "Delle rendite e delle assicurazioni" } },
  { from: 1933, to: 1935, hierarchy: { book: "Libro IV", title: "Titolo III", chapter: "Del giuoco e della scommessa" } },
  { from: 1936, to: 1959, hierarchy: { book: "Libro IV", title: "Titolo III", chapter: "Della fideiussione" } },
  { from: 1960, to: 1991, hierarchy: { book: "Libro IV", title: "Titolo III", chapter: "Del mandato di credito e dell'anticresi" } },
  { from: 1992, to: 2042, hierarchy: { book: "Libro IV", title: "Titolo III", chapter: "Della transazione e del compromesso" } },
  { from: 2043, to: 2059, hierarchy: { book: "Libro IV", title: "Titolo IX — Dei fatti illeciti" } },

  // Libro V — Del lavoro
  { from: 2060, to: 2081, hierarchy: { book: "Libro V — Del lavoro", title: "Titolo I — Della disciplina delle attività professionali" } },
  { from: 2082, to: 2134, hierarchy: { book: "Libro V", title: "Titolo II — Del lavoro nell'impresa" } },
  { from: 2135, to: 2246, hierarchy: { book: "Libro V", title: "Titolo II", chapter: "Del rapporto di lavoro subordinato" } },
  { from: 2247, to: 2290, hierarchy: { book: "Libro V", title: "Titolo III — Del lavoro autonomo" } },
  { from: 2291, to: 2324, hierarchy: { book: "Libro V", title: "Titolo V — Delle società", chapter: "Società semplice" } },
  { from: 2325, to: 2461, hierarchy: { book: "Libro V", title: "Titolo V", chapter: "Società per azioni" } },
  { from: 2462, to: 2510, hierarchy: { book: "Libro V", title: "Titolo V", chapter: "Società a responsabilità limitata" } },
  { from: 2511, to: 2554, hierarchy: { book: "Libro V", title: "Titolo V", chapter: "Società cooperative" } },
  { from: 2555, to: 2574, hierarchy: { book: "Libro V", title: "Titolo VI — Delle cooperative e delle mutue assicuratrici" } },
  { from: 2575, to: 2642, hierarchy: { book: "Libro V", title: "Titolo VIII — Dell'azienda" } },
  { from: 2643, to: 2696, hierarchy: { book: "Libro V", title: "Titolo IX — Dei diritti sulle opere dell'ingegno" } },

  // Libro VI — Della tutela dei diritti
  { from: 2697, to: 2739, hierarchy: { book: "Libro VI — Della tutela dei diritti", title: "Titolo I — Della trascrizione" } },
  { from: 2740, to: 2783, hierarchy: { book: "Libro VI", title: "Titolo II — Delle prove" } },
  { from: 2784, to: 2807, hierarchy: { book: "Libro VI", title: "Titolo III — Della responsabilità patrimoniale" } },
  { from: 2808, to: 2899, hierarchy: { book: "Libro VI", title: "Titolo IV — Delle cause di prelazione", chapter: "Dei privilegi e del pegno" } },
  { from: 2900, to: 2969, hierarchy: { book: "Libro VI", title: "Titolo IV", chapter: "Delle ipoteche" } },
  { from: 2934, to: 2969, hierarchy: { book: "Libro VI", title: "Titolo V — Della prescrizione e della decadenza" } },
];

// ─── Mappa istituti giuridici ───
// Associa range di articoli agli istituti giuridici pertinenti

const INSTITUTE_MAPPING: Array<{
  from: number;
  to: number;
  institutes: string[];
  keywords: string[];
}> = [
  // Contratti in generale
  { from: 1321, to: 1352, institutes: ["contratto", "requisiti_contratto", "consenso", "oggetto_contratto", "causa"], keywords: ["contratto", "consenso", "oggetto", "forma", "causa"] },
  { from: 1353, to: 1381, institutes: ["proposta", "accettazione", "conclusione_contratto", "contratto_preliminare"], keywords: ["proposta", "accettazione", "preliminare", "opzione", "prelazione"] },
  { from: 1382, to: 1405, institutes: ["caparra_confirmatoria", "caparra_penitenziale", "clausola_penale"], keywords: ["caparra", "confirmatoria", "penitenziale", "penale", "recesso"] },
  { from: 1406, to: 1469, institutes: ["effetti_contratto", "risoluzione", "rescissione", "condizione", "termine"], keywords: ["effetti", "risoluzione", "inadempimento", "condizione", "rescissione", "eccessiva_onerosità"] },

  // Vendita
  { from: 1470, to: 1509, institutes: ["vendita", "compravendita", "garanzia_evizione", "vizi_cosa_venduta"], keywords: ["vendita", "venditore", "compratore", "prezzo", "consegna", "garanzia", "evizione", "vizi"] },
  { from: 1510, to: 1519, institutes: ["vendita", "riscatto", "patto_riscatto"], keywords: ["riscatto", "riacquisto", "patto"] },
  { from: 1520, to: 1536, institutes: ["vendita_immobiliare", "trascrizione"], keywords: ["immobile", "vendita", "ipoteca", "trascrizione"] },
  { from: 1537, to: 1541, institutes: ["vendita_a_corpo", "vendita_a_misura", "rettifica_prezzo"], keywords: ["vendita", "corpo", "misura", "eccedenza", "deficienza", "tolleranza", "superficie", "ventesimo"] },
  { from: 1542, to: 1547, institutes: ["vendita_eredità", "vendita_litigiosa"], keywords: ["eredità", "litigiosa", "cessione"] },

  // Locazione
  { from: 1571, to: 1606, institutes: ["locazione", "obblighi_locatore", "obblighi_conduttore", "riparazioni"], keywords: ["locazione", "locatore", "conduttore", "canone", "manutenzione", "riparazioni"] },
  { from: 1607, to: 1614, institutes: ["locazione", "sublocazione", "cessione_locazione"], keywords: ["sublocazione", "cessione", "locazione"] },
  { from: 1615, to: 1627, institutes: ["locazione", "scioglimento_locazione", "disdetta"], keywords: ["scioglimento", "disdetta", "cessazione", "inadempimento"] },
  { from: 1628, to: 1654, institutes: ["affitto", "affitto_fondi_rustici"], keywords: ["affitto", "fondo", "rustico", "bestiame"] },

  // Appalto
  { from: 1655, to: 1677, institutes: ["appalto", "variazioni_opera", "difformità_vizi", "subappalto", "collaudo"], keywords: ["appalto", "appaltatore", "committente", "opera", "variazioni", "difformità", "vizi", "collaudo", "subappalto"] },

  // Mandato
  { from: 1703, to: 1741, institutes: ["mandato", "procura", "rappresentanza"], keywords: ["mandato", "mandatario", "mandante", "procura", "rappresentanza"] },

  // Fideiussione
  { from: 1936, to: 1959, institutes: ["fideiussione", "garanzia_personale", "fideiussore"], keywords: ["fideiussione", "fideiussore", "garanzia", "obbligazione_principale", "beneficio_escussione"] },

  // Mutuo
  { from: 1813, to: 1822, institutes: ["comodato"], keywords: ["comodato", "uso_gratuito", "restituzione"] },
  { from: 1823, to: 1860, institutes: ["mutuo", "interessi", "usura"], keywords: ["mutuo", "prestito", "interessi", "usura", "restituzione", "mutuante", "mutuatario"] },

  // Assicurazioni
  { from: 1882, to: 1932, institutes: ["assicurazione", "polizza", "risarcimento", "premio"], keywords: ["assicurazione", "polizza", "premio", "sinistro", "risarcimento", "assicuratore"] },

  // Società
  { from: 2247, to: 2290, institutes: ["lavoro_autonomo", "contratto_opera"], keywords: ["lavoro_autonomo", "opera", "professione", "compenso"] },
  { from: 2291, to: 2324, institutes: ["società_semplice", "società_persone"], keywords: ["società", "socio", "conferimento", "utili", "perdite"] },
  { from: 2325, to: 2461, institutes: ["società_per_azioni", "spa", "assemblea", "amministratori", "sindaci"], keywords: ["spa", "azioni", "assemblea", "amministratore", "sindaco", "bilancio", "capitale"] },
  { from: 2462, to: 2510, institutes: ["srl", "società_responsabilità_limitata", "quote"], keywords: ["srl", "quote", "socio", "amministratore", "decisioni_soci"] },

  // Fatti illeciti
  { from: 2043, to: 2059, institutes: ["responsabilità_extracontrattuale", "fatto_illecito", "danno", "risarcimento"], keywords: ["danno", "risarcimento", "colpa", "dolo", "illecito", "responsabilità"] },

  // Trascrizione e prove
  { from: 2643, to: 2696, institutes: ["trascrizione", "pubblicità_immobiliare", "opponibilità"], keywords: ["trascrizione", "registri", "immobiliari", "opponibilità", "terzi"] },
  { from: 2697, to: 2739, institutes: ["trascrizione", "pubblicità_immobiliare"], keywords: ["trascrizione", "immobili", "registri"] },

  // Ipoteche
  { from: 2808, to: 2899, institutes: ["privilegio", "pegno", "garanzia_reale"], keywords: ["privilegio", "pegno", "garanzia", "credito"] },
  { from: 2900, to: 2969, institutes: ["ipoteca", "ipoteca_legale", "ipoteca_volontaria", "iscrizione_ipotecaria"], keywords: ["ipoteca", "iscrizione", "cancellazione", "grado", "creditore", "ipotecario"] },

  // Prescrizione
  { from: 2934, to: 2969, institutes: ["prescrizione", "decadenza", "termini"], keywords: ["prescrizione", "decadenza", "termine", "interruzione", "sospensione"] },

  // Obbligazioni
  { from: 1173, to: 1217, institutes: ["obbligazione", "fonte_obbligazione"], keywords: ["obbligazione", "debitore", "creditore", "prestazione"] },
  { from: 1218, to: 1276, institutes: ["adempimento", "pagamento", "surrogazione", "compensazione"], keywords: ["adempimento", "pagamento", "compensazione", "confusione", "novazione"] },
  { from: 1277, to: 1320, institutes: ["inadempimento", "mora", "risarcimento_danno", "clausola_risolutiva"], keywords: ["inadempimento", "mora", "risarcimento", "danno", "risoluzione"] },
];

// ─── Helper: estrai numero articolo ───

function extractArticleNumber(articleId: string): number | null {
  const match = articleId.match(/art(\d+)/i);
  if (match) return parseInt(match[1], 10);
  // Gestisci articoli bis, ter, etc.
  const matchBis = articleId.match(/art(\d+)(bis|ter|quater|quinquies|sexies|septies|octies)/i);
  if (matchBis) return parseInt(matchBis[1], 10);
  return null;
}

function formatArticleReference(articleId: string): string {
  // "art1537" → "Art. 1537"
  // "art2643bis" → "Art. 2643-bis"
  const match = articleId.match(/art(\d+)(bis|ter|quater|quinquies|sexies|septies|octies)?/i);
  if (!match) return articleId;
  const num = match[1];
  const suffix = match[2] ? `-${match[2].toLowerCase()}` : "";
  return `Art. ${num}${suffix}`;
}

function getHierarchy(articleNum: number): HierarchyEntry {
  // Cerca l'ultimo match (il più specifico)
  let best: HierarchyEntry = { book: "Codice Civile" };
  for (const entry of CODICE_CIVILE_HIERARCHY) {
    if (articleNum >= entry.from && articleNum <= entry.to) {
      best = entry.hierarchy;
    }
  }
  return best;
}

function getInstitutesAndKeywords(articleNum: number): { institutes: string[]; keywords: string[] } {
  const institutes = new Set<string>();
  const keywords = new Set<string>();

  for (const mapping of INSTITUTE_MAPPING) {
    if (articleNum >= mapping.from && articleNum <= mapping.to) {
      mapping.institutes.forEach((i) => institutes.add(i));
      mapping.keywords.forEach((k) => keywords.add(k));
    }
  }

  return {
    institutes: Array.from(institutes),
    keywords: Array.from(keywords),
  };
}

// ─── Download da HuggingFace ───

async function downloadCodiceCivile(): Promise<HuggingFaceRow[]> {
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║  Download Codice Civile da HuggingFace          ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const allRows: HuggingFaceRow[] = [];
  let offset = 0;
  let totalRows = 0;

  // Prima richiesta per scoprire il totale
  const firstUrl = `${HUGGINGFACE_API}?dataset=${encodeURIComponent(DATASET)}&config=default&split=train&offset=0&length=${PAGE_SIZE}`;
  console.log(`[HF] Prima richiesta: ${firstUrl}`);

  const firstResponse = await fetchWithRetry(firstUrl);
  const firstData: HuggingFaceResponse = await firstResponse.json();

  totalRows = firstData.num_rows_total;
  console.log(`[HF] Totale articoli nel dataset: ${totalRows}`);

  // Processa prima pagina
  for (const item of firstData.rows) {
    allRows.push(item.row);
  }
  console.log(`[HF] Pagina 1/${Math.ceil(totalRows / PAGE_SIZE)} — ${allRows.length}/${totalRows} articoli`);

  offset = PAGE_SIZE;

  // Scarica le pagine restanti
  while (offset < totalRows) {
    const url = `${HUGGINGFACE_API}?dataset=${encodeURIComponent(DATASET)}&config=default&split=train&offset=${offset}&length=${PAGE_SIZE}`;

    const response = await fetchWithRetry(url);
    const data: HuggingFaceResponse = await response.json();

    for (const item of data.rows) {
      allRows.push(item.row);
    }

    const page = Math.floor(offset / PAGE_SIZE) + 1;
    const totalPages = Math.ceil(totalRows / PAGE_SIZE);
    console.log(`[HF] Pagina ${page}/${totalPages} — ${allRows.length}/${totalRows} articoli`);

    offset += PAGE_SIZE;

    // Rate limit gentile
    await sleep(300);
  }

  console.log(`\n[HF] Download completato: ${allRows.length} articoli scaricati\n`);
  return allRows;
}

// ─── Trasforma HF rows in LegalArticle ───

function transformArticles(rows: HuggingFaceRow[]): LegalArticle[] {
  console.log("[TRANSFORM] Classificazione articoli con gerarchia, istituti e keywords...");

  const articles: LegalArticle[] = [];
  let classified = 0;
  let unclassified = 0;

  for (const row of rows) {
    const articleNum = extractArticleNumber(row.article_id);
    const articleRef = formatArticleReference(row.article_id);

    // Pulisci testo: rimuovi whitespace multiplo
    const cleanText = row.article_text
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim();

    // Salta articoli vuoti o troppo corti
    if (cleanText.length < 10) {
      console.log(`  [SKIP] ${articleRef} — testo troppo corto (${cleanText.length} chars)`);
      continue;
    }

    // Gerarchia
    const hierarchy = articleNum ? getHierarchy(articleNum) : { book: "Codice Civile" };

    // Istituti e keywords
    const { institutes, keywords } = articleNum
      ? getInstitutesAndKeywords(articleNum)
      : { institutes: [], keywords: [] };

    // Aggiungi keywords dal titolo dell'articolo
    if (row.article_title) {
      const titleWords = row.article_title
        .toLowerCase()
        .replace(/[^\w\sàèéìòùç]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3);
      titleWords.forEach((w) => {
        if (!keywords.includes(w)) keywords.push(w);
      });
    }

    // Aggiungi keywords estratte dal testo (parole legali significative)
    const legalTerms = extractLegalTermsFromText(cleanText);
    legalTerms.forEach((t) => {
      if (!keywords.includes(t)) keywords.push(t);
    });

    if (institutes.length > 0) classified++;
    else unclassified++;

    articles.push({
      lawSource: "Codice Civile",
      articleReference: articleRef,
      articleTitle: row.article_title || null,
      articleText: cleanText,
      hierarchy,
      keywords,
      relatedInstitutes: institutes,
      sourceUrl: `https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:codice.civile:1942-03-16;262~${articleRef.replace("Art. ", "art")}`,
      isInForce: true,
    });
  }

  console.log(`[TRANSFORM] ${articles.length} articoli trasformati | ${classified} classificati con istituti | ${unclassified} senza istituti specifici\n`);
  return articles;
}

// ─── Estrai termini legali dal testo ───

function extractLegalTermsFromText(text: string): string[] {
  const terms: string[] = [];
  const lowerText = text.toLowerCase();

  const legalPatterns: Array<[RegExp, string]> = [
    [/vendita\s+a\s+corpo/i, "vendita_a_corpo"],
    [/vendita\s+a\s+misura/i, "vendita_a_misura"],
    [/caparra\s+confirmatoria/i, "caparra_confirmatoria"],
    [/caparra\s+penitenziale/i, "caparra_penitenziale"],
    [/clausola\s+penale/i, "clausola_penale"],
    [/clausola\s+risolutiva/i, "clausola_risolutiva"],
    [/risoluzione\s+(?:del\s+)?contratto/i, "risoluzione_contratto"],
    [/eccessiva\s+onerosit[àa]/i, "eccessiva_onerosità"],
    [/fideiussione/i, "fideiussione"],
    [/ipoteca/i, "ipoteca"],
    [/trascrizione/i, "trascrizione"],
    [/usucapione/i, "usucapione"],
    [/prescrizione/i, "prescrizione"],
    [/simulazione/i, "simulazione"],
    [/annullabilit[àa]/i, "annullabilità"],
    [/nullit[àa]/i, "nullità"],
    [/rescissione/i, "rescissione"],
    [/responsabilit[àa]\s+(?:civile|extracontrattuale)/i, "responsabilità_civile"],
    [/danno\s+(?:patrimoniale|non\s+patrimoniale|morale|biologico)/i, "danno"],
    [/sublocazione/i, "sublocazione"],
    [/locazione/i, "locazione"],
    [/appalto/i, "appalto"],
    [/mandato/i, "mandato"],
    [/procura/i, "procura"],
    [/comodato/i, "comodato"],
    [/mutuo/i, "mutuo"],
    [/pegno/i, "pegno"],
    [/privilegio/i, "privilegio"],
    [/surrogazione/i, "surrogazione"],
    [/compensazione/i, "compensazione"],
    [/novazione/i, "novazione"],
    [/cessione\s+(?:del\s+)?credito/i, "cessione_credito"],
    [/garanzia\s+(?:per\s+)?evizione/i, "garanzia_evizione"],
    [/vizi\s+(?:della\s+)?cosa/i, "vizi_cosa_venduta"],
    [/buona\s+fede/i, "buona_fede"],
    [/servit[uù]/i, "servitù"],
    [/usufrutto/i, "usufrutto"],
    [/enfiteusi/i, "enfiteusi"],
    [/superficie/i, "superficie"],
    [/comunione/i, "comunione"],
    [/condominio/i, "condominio"],
    [/successione/i, "successione"],
    [/testamento/i, "testamento"],
    [/legato/i, "legato"],
    [/donazione/i, "donazione"],
  ];

  for (const [pattern, term] of legalPatterns) {
    if (pattern.test(lowerText)) {
      terms.push(term);
    }
  }

  return terms;
}

// ─── Genera embeddings e carica su Supabase ───

async function generateAndUpload(articles: LegalArticle[]): Promise<void> {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Generazione embeddings e upload su Supabase    ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  if (!process.env.VOYAGE_API_KEY) {
    console.error("❌ VOYAGE_API_KEY non configurata! Impossibile generare embeddings.");
    console.error("   Aggiungi VOYAGE_API_KEY al file .env.local");
    process.exit(1);
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Supabase non configurato! Servono NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let totalInserted = 0;
  let totalErrors = 0;
  const totalBatches = Math.ceil(articles.length / EMBEDDING_BATCH_SIZE);

  for (let batchIdx = 0; batchIdx < articles.length; batchIdx += EMBEDDING_BATCH_SIZE) {
    const batch = articles.slice(batchIdx, batchIdx + EMBEDDING_BATCH_SIZE);
    const batchNum = Math.floor(batchIdx / EMBEDDING_BATCH_SIZE) + 1;

    console.log(`\n── Batch ${batchNum}/${totalBatches} (${batch.length} articoli) ──`);

    // 1. Prepara testi per embedding
    const texts = batch.map((a) =>
      `${a.lawSource} ${a.articleReference}${a.articleTitle ? ` — ${a.articleTitle}` : ""}\n${a.articleText}`
    );

    // 2. Genera embeddings via Voyage AI
    console.log(`  [VOYAGE] Generazione embeddings per ${texts.length} testi...`);
    const embeddings = await generateEmbeddingsBatch(texts);

    if (!embeddings) {
      console.error(`  ❌ Errore generazione embeddings per batch ${batchNum} — skip`);
      totalErrors += batch.length;
      continue;
    }

    console.log(`  [VOYAGE] ✓ ${embeddings.length} embeddings generati`);

    // 3. Upsert su Supabase
    console.log(`  [SUPABASE] Upload ${batch.length} articoli...`);

    for (let i = 0; i < batch.length; i++) {
      const article = batch[i];
      const { error } = await supabase
        .from("legal_articles")
        .upsert(
          {
            law_source: article.lawSource,
            article_reference: article.articleReference,
            article_title: article.articleTitle,
            article_text: article.articleText,
            hierarchy: article.hierarchy ?? {},
            keywords: article.keywords ?? [],
            related_institutes: article.relatedInstitutes ?? [],
            embedding: JSON.stringify(embeddings[i]),
            source_url: article.sourceUrl,
            is_in_force: article.isInForce ?? true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "law_source,article_reference" }
        );

      if (error) {
        console.error(`  ❌ ${article.articleReference}: ${error.message}`);
        totalErrors++;
      } else {
        totalInserted++;
      }
    }

    console.log(`  [SUPABASE] ✓ Batch ${batchNum} — ${totalInserted} inseriti totali, ${totalErrors} errori`);

    // Rate limit tra batch
    if (batchIdx + EMBEDDING_BATCH_SIZE < articles.length) {
      console.log("  [WAIT] Pausa 2s tra batch...");
      await sleep(2000);
    }
  }

  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  RISULTATO FINALE                                ║`);
  console.log(`╠══════════════════════════════════════════════════╣`);
  console.log(`║  Articoli processati: ${articles.length.toString().padStart(5)}`);
  console.log(`║  Inseriti/aggiornati: ${totalInserted.toString().padStart(5)}`);
  console.log(`║  Errori:             ${totalErrors.toString().padStart(5)}`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);
}

// ─── Voyage AI batch embedding ───

interface VoyageResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { total_tokens: number };
}

async function generateEmbeddingsBatch(texts: string[]): Promise<number[][] | null> {
  const response = await fetchWithRetry(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: texts.map((t) => t.slice(0, 8000)), // Tronca testi troppo lunghi
      input_type: "document",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[VOYAGE] Errore ${response.status}: ${errorText}`);

    // Retry su rate limit
    if (response.status === 429) {
      console.log("[VOYAGE] Rate limit — attendo 10s e riprovo...");
      await sleep(10000);

      const retry = await fetchWithRetry(VOYAGE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({
          model: VOYAGE_MODEL,
          input: texts.map((t) => t.slice(0, 8000)),
          input_type: "document",
        }),
      });

      if (!retry.ok) {
        console.error("[VOYAGE] Retry fallito");
        return null;
      }

      const retryData: VoyageResponse = await retry.json();
      console.log(`[VOYAGE] Retry OK — ${retryData.usage.total_tokens} tokens`);
      return retryData.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    }

    return null;
  }

  const data: VoyageResponse = await response.json();
  console.log(`  [VOYAGE] ${data.usage.total_tokens} tokens usati`);
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// ─── Utility ───

async function fetchWithRetry(url: string, options?: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt + 1) * 1000;
        console.log(`[RETRY] Tentativo ${attempt + 1}/${maxRetries} fallito — attendo ${waitMs / 1000}s...`);
        await sleep(waitMs);
      }
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Import fonti aggiuntive ───

import { ITALIAN_SOURCES, EU_SOURCES, ALL_SOURCES } from "./corpus-sources";
import { downloadFromNormattiva } from "./normattiva-client";
import { downloadFromEurLex } from "./eurlex-client";

// ─── Main: solo Codice Civile (comando originale) ───

async function seedCodiceCivile() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   controlla.me — Seed Codice Civile (HuggingFace)          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  checkEnv();

  const rows = await downloadCodiceCivile();
  const articles = transformArticles(rows);
  printStats(articles);
  await generateAndUpload(articles);

  console.log("✅ Codice Civile caricato!\n");
}

// ─── Main: tutte le fonti italiane (Normattiva) ───

async function seedNormattiva() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   controlla.me — Seed Codici Italiani (Normattiva)         ║");
  console.log("║                                                            ║");
  console.log("║   Codice Penale, Codice del Consumo, C.P.C.,              ║");
  console.log("║   D.Lgs. 231/2001, D.Lgs. 122/2005,                      ║");
  console.log("║   Statuto Lavoratori, TU Edilizia                         ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  checkEnv();

  let totalArticles = 0;
  let totalErrors = 0;

  for (const source of ITALIAN_SOURCES) {
    console.log(`\n── ${source.id} ──`);

    const parsed = await downloadFromNormattiva(source);
    if (parsed.length === 0) {
      console.log(`  ⚠ Nessun articolo scaricato per ${source.id}`);
      continue;
    }

    // Converti in formato LegalArticle per l'upload
    const articles: LegalArticle[] = parsed.map((p) => ({
      lawSource: p.lawSource,
      articleReference: p.articleReference,
      articleTitle: p.articleTitle,
      articleText: p.articleText,
      hierarchy: p.hierarchy,
      keywords: p.keywords,
      relatedInstitutes: p.relatedInstitutes,
      sourceUrl: p.sourceUrl,
      isInForce: p.isInForce,
    }));

    printStats(articles);
    await generateAndUpload(articles);
    totalArticles += articles.length;
  }

  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  NORMATTIVA — RISULTATO FINALE                  ║`);
  console.log(`╠══════════════════════════════════════════════════╣`);
  console.log(`║  Fonti processate: ${ITALIAN_SOURCES.length.toString().padStart(5)}`);
  console.log(`║  Articoli totali:  ${totalArticles.toString().padStart(5)}`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);
}

// ─── Main: normative EU (EUR-Lex) ───

async function seedEurLex() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   controlla.me — Seed Normative EU (EUR-Lex CELLAR)        ║");
  console.log("║                                                            ║");
  console.log("║   GDPR, Dir. Clausole Abusive, Dir. Consumatori,          ║");
  console.log("║   Dir. Vendita Beni, Roma I, DSA                          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  checkEnv();

  let totalArticles = 0;

  for (const source of EU_SOURCES) {
    console.log(`\n── ${source.id} ──`);

    const parsed = await downloadFromEurLex(source);
    if (parsed.length === 0) {
      console.log(`  ⚠ Nessun articolo scaricato per ${source.id}`);
      continue;
    }

    const articles: LegalArticle[] = parsed.map((p) => ({
      lawSource: p.lawSource,
      articleReference: p.articleReference,
      articleTitle: p.articleTitle,
      articleText: p.articleText,
      hierarchy: p.hierarchy,
      keywords: p.keywords,
      relatedInstitutes: p.relatedInstitutes,
      sourceUrl: p.sourceUrl,
      isInForce: p.isInForce,
    }));

    printStats(articles);
    await generateAndUpload(articles);
    totalArticles += articles.length;
  }

  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  EUR-LEX — RISULTATO FINALE                     ║`);
  console.log(`╠══════════════════════════════════════════════════╣`);
  console.log(`║  Fonti processate: ${EU_SOURCES.length.toString().padStart(5)}`);
  console.log(`║  Articoli totali:  ${totalArticles.toString().padStart(5)}`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);
}

// ─── Main: TUTTO il corpus ───

async function seedAll() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                                                            ║");
  console.log("║   controlla.me — Seed INTERO Corpus Legislativo            ║");
  console.log("║                                                            ║");
  console.log("║   1. Codice Civile         (HuggingFace)     ~3.040 art.  ║");
  console.log("║   2. Codice Penale         (Normattiva)        ~734 art.  ║");
  console.log("║   3. Codice del Consumo    (Normattiva)        ~146 art.  ║");
  console.log("║   4. Codice Proc. Civile   (Normattiva)        ~831 art.  ║");
  console.log("║   5. D.Lgs. 231/2001       (Normattiva)         ~85 art.  ║");
  console.log("║   6. D.Lgs. 122/2005       (Normattiva)         ~21 art.  ║");
  console.log("║   7. Statuto Lavoratori    (Normattiva)         ~41 art.  ║");
  console.log("║   8. TU Edilizia           (Normattiva)        ~138 art.  ║");
  console.log("║   9. GDPR                  (EUR-Lex)            ~99 art.  ║");
  console.log("║  10. Dir. Clausole Abusive (EUR-Lex)            ~11 art.  ║");
  console.log("║  11. Dir. Consumatori      (EUR-Lex)            ~35 art.  ║");
  console.log("║  12. Dir. Vendita Beni     (EUR-Lex)            ~28 art.  ║");
  console.log("║  13. Roma I                (EUR-Lex)            ~29 art.  ║");
  console.log("║  14. DSA                   (EUR-Lex)            ~93 art.  ║");
  console.log("║                                          Tot. ~5.331 art. ║");
  console.log("║                                                            ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  checkEnv();

  // 1. Codice Civile (HuggingFace)
  console.log("\n════ FASE 1/3: Codice Civile (HuggingFace) ════\n");
  await seedCodiceCivile();

  // 2. Codici italiani (Normattiva)
  console.log("\n════ FASE 2/3: Codici italiani (Normattiva) ════\n");
  await seedNormattiva();

  // 3. Normative EU (EUR-Lex)
  console.log("\n════ FASE 3/3: Normative EU (EUR-Lex) ════\n");
  await seedEurLex();

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  ✅ SEED CORPUS COMPLETO — TUTTE LE FONTI CARICATE!        ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log("Prossimi passi:");
  console.log("  1. Verifica: SELECT law_source, COUNT(*) FROM legal_articles GROUP BY law_source;");
  console.log("  2. Test: SELECT * FROM legal_articles WHERE 'clausole_vessatorie' = ANY(related_institutes);");
  console.log("  3. Avvia l'app e testa un'analisi di documento\n");
}

// ─── Helpers condivisi ───

function checkEnv() {
  const envChecks = [
    { key: "VOYAGE_API_KEY", label: "Voyage AI" },
    { key: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase URL" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase Service Key" },
  ];

  let envOk = true;
  for (const check of envChecks) {
    const exists = !!process.env[check.key];
    console.log(`  ${exists ? "✓" : "✗"} ${check.label}: ${exists ? "configurato" : "MANCANTE!"}`);
    if (!exists) envOk = false;
  }

  if (!envOk) {
    console.error("\n❌ Configura le variabili mancanti in controlla-me/.env.local e riprova.\n");
    process.exit(1);
  }
}

function printStats(articles: LegalArticle[]) {
  if (articles.length === 0) return;

  const withInstitutes = articles.filter((a) => a.relatedInstitutes && a.relatedInstitutes.length > 0);
  const withKeywords = articles.filter((a) => a.keywords && a.keywords.length > 0);

  console.log(`\n── Statistiche: ${articles[0].lawSource} ──`);
  console.log(`  Articoli totali:          ${articles.length}`);
  console.log(`  Con istituti giuridici:   ${withInstitutes.length} (${((withInstitutes.length / articles.length) * 100).toFixed(1)}%)`);
  console.log(`  Con keywords:             ${withKeywords.length} (${((withKeywords.length / articles.length) * 100).toFixed(1)}%)`);
}

// ─── CLI ───

const command = process.argv[2] || "all";

const COMMANDS: Record<string, () => Promise<void>> = {
  "civile": seedCodiceCivile,
  "normattiva": seedNormattiva,
  "eurlex": seedEurLex,
  "all": seedAll,
};

if (!COMMANDS[command]) {
  console.log(`
Uso: npx tsx controlla-me/scripts/seed-corpus.ts [comando]

Comandi:
  civile       Solo Codice Civile (HuggingFace)
  normattiva   Codici italiani via Normattiva API
  eurlex       Normative EU via EUR-Lex CELLAR
  all          Tutto il corpus (default)
`);
  process.exit(0);
}

COMMANDS[command]().catch((err) => {
  console.error("\n❌ Errore fatale:", err);
  process.exit(1);
});
