/**
 * Fetcher HuggingFace — Scarica il Codice Civile italiano.
 *
 * Dataset: AndreaSimeri/Italian_Civil_Code
 * ~2.439 articoli, paginati 100 per pagina.
 *
 * Include la gerarchia completa del Codice Civile (Libri/Titoli/Capi)
 * e la mappatura degli istituti giuridici per ogni range di articoli.
 */

import { fetchWithRetry, sleep, extractLegalTerms, cleanText } from "../lib/utils";
import type { LegalArticle } from "../lib/types";
import type { HuggingFaceSource } from "../corpus-sources";

const API_URL = "https://datasets-server.huggingface.co/rows";
const PAGE_SIZE = 100;

// ─── Tipi HuggingFace ───

interface HFRow {
  article_id: string;
  article_title: string;
  article_text: string;
  article_references: string;
}

interface HFResponse {
  rows: Array<{ row: HFRow }>;
  num_rows_total: number;
}

// ─── Fetch principale ───

export async function fetchHuggingFace(source: HuggingFaceSource): Promise<LegalArticle[]> {
  console.log(`\n  [HF] Scaricamento ${source.name}...`);

  const allRows: HFRow[] = [];
  let offset = 0;

  // Prima richiesta → totale
  const firstUrl = `${API_URL}?dataset=${encodeURIComponent(source.dataset)}&config=${source.config}&split=${source.split}&offset=0&length=${PAGE_SIZE}`;
  const firstResp = await fetchWithRetry(firstUrl);
  const firstData: HFResponse = await firstResp.json();
  const total = firstData.num_rows_total;

  for (const item of firstData.rows) allRows.push(item.row);
  console.log(`  [HF] ${allRows.length}/${total} articoli (pagina 1)`);

  offset = PAGE_SIZE;
  while (offset < total) {
    const url = `${API_URL}?dataset=${encodeURIComponent(source.dataset)}&config=${source.config}&split=${source.split}&offset=${offset}&length=${PAGE_SIZE}`;
    const resp = await fetchWithRetry(url);

    // HuggingFace a volte ritorna HTML (es. pagina errore) invece di JSON
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const page = Math.floor(offset / PAGE_SIZE) + 1;
      console.warn(`  [HF] Pagina ${page}: risposta non-JSON (${contentType.split(";")[0]}) — ritento dopo pausa...`);
      await sleep(5000);

      // Retry una volta
      const retry = await fetchWithRetry(url);
      const retryType = retry.headers.get("content-type") || "";
      if (!retryType.includes("application/json")) {
        console.warn(`  [HF] Pagina ${page}: retry fallito — restituisco ${allRows.length} articoli parziali`);
        break;
      }
      const retryData: HFResponse = await retry.json();
      for (const item of retryData.rows) allRows.push(item.row);
      offset += PAGE_SIZE;
      await sleep(500);
      continue;
    }

    const data: HFResponse = await resp.json();
    for (const item of data.rows) allRows.push(item.row);

    const page = Math.floor(offset / PAGE_SIZE) + 1;
    if (page % 5 === 0) console.log(`  [HF] ${allRows.length}/${total} (pagina ${page})`);

    offset += PAGE_SIZE;
    await sleep(300);
  }

  console.log(`  [HF] Download completato: ${allRows.length} articoli`);

  return allRows
    .map((row) => transformRow(row, source))
    .filter((a): a is LegalArticle => a !== null);
}

// ─── Trasformazione ───

function transformRow(row: HFRow, source: HuggingFaceSource): LegalArticle | null {
  const artRef = formatRef(row.article_id);
  const text = cleanText(row.article_text);
  if (text.length < 10) return null;

  const artNum = extractNum(row.article_id);
  const hierarchy: Record<string, string> = artNum ? { ...getHierarchy(artNum) } : { book: "Codice Civile" };
  // Remove undefined values from hierarchy
  for (const k of Object.keys(hierarchy)) {
    if (hierarchy[k] === undefined) delete hierarchy[k];
  }
  const { institutes, keywords } = artNum
    ? getInstitutes(artNum)
    : { institutes: [], keywords: [] };

  // Keywords dal titolo
  if (row.article_title) {
    row.article_title
      .toLowerCase()
      .replace(/[^\w\sàèéìòùç]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .forEach((w) => { if (!keywords.includes(w)) keywords.push(w); });
  }

  // Keywords legali dal testo
  extractLegalTerms(text).forEach((t) => { if (!keywords.includes(t)) keywords.push(t); });

  // Keywords/istituti di default della fonte
  source.defaultKeywords.forEach((k) => { if (!keywords.includes(k)) keywords.push(k); });
  source.defaultInstitutes.forEach((i) => { if (!institutes.includes(i)) institutes.push(i); });

  return {
    lawSource: source.lawSource,
    articleReference: artRef,
    articleTitle: row.article_title || null,
    articleText: text,
    hierarchy,
    keywords,
    relatedInstitutes: institutes,
    sourceUrl: source.sourceUrlPattern?.replace("{N}", artRef.replace("Art. ", "")) ?? undefined,
    isInForce: true,
  };
}

// ─── Utility articolo ───

function extractNum(id: string): number | null {
  const m = id.match(/art(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function formatRef(id: string): string {
  const m = id.match(/art(\d+)(bis|ter|quater|quinquies|sexies|septies|octies)?/i);
  if (!m) return id;
  const suffix = m[2] ? `-${m[2].toLowerCase()}` : "";
  return `Art. ${m[1]}${suffix}`;
}

// ─── Gerarchia Codice Civile ───

interface HierarchyEntry { book: string; title?: string; chapter?: string }

const CC_HIERARCHY: Array<{ from: number; to: number; h: HierarchyEntry }> = [
  { from: 1, to: 10, h: { book: "Libro I — Delle persone e della famiglia", title: "Titolo I — Delle persone fisiche" } },
  { from: 11, to: 35, h: { book: "Libro I", title: "Titolo II — Delle persone giuridiche" } },
  { from: 36, to: 42, h: { book: "Libro I", title: "Titolo III — Del domicilio e della residenza" } },
  { from: 43, to: 78, h: { book: "Libro I", title: "Titolo IV — Dell'assenza e morte presunta" } },
  { from: 79, to: 230, h: { book: "Libro I", title: "Titolo VI — Del matrimonio" } },
  { from: 231, to: 314, h: { book: "Libro I", title: "Titolo VII — Della filiazione" } },
  { from: 315, to: 342, h: { book: "Libro I", title: "Titolo VIII — Dell'adozione" } },
  { from: 343, to: 399, h: { book: "Libro I", title: "Titolo IX — Responsabilità genitoriale" } },
  { from: 400, to: 455, h: { book: "Libro I", title: "Titolo X-XIII — Tutela e alimenti" } },
  { from: 456, to: 586, h: { book: "Libro II — Delle successioni", title: "Titolo I-II — Disposizioni generali e legittime" } },
  { from: 587, to: 712, h: { book: "Libro II", title: "Titolo III — Successioni testamentarie" } },
  { from: 713, to: 768, h: { book: "Libro II", title: "Titolo IV — Della divisione" } },
  { from: 769, to: 809, h: { book: "Libro II", title: "Titolo V — Delle donazioni" } },
  { from: 810, to: 831, h: { book: "Libro III — Della proprietà", title: "Titolo I — Dei beni" } },
  { from: 832, to: 951, h: { book: "Libro III", title: "Titolo II — Della proprietà" } },
  { from: 952, to: 1026, h: { book: "Libro III", title: "Titolo III-IV — Superficie ed enfiteusi" } },
  { from: 1027, to: 1099, h: { book: "Libro III", title: "Titolo V — Delle servitù prediali" } },
  { from: 1100, to: 1139, h: { book: "Libro III", title: "Titolo VII — Comunione e condominio" } },
  { from: 1173, to: 1276, h: { book: "Libro IV — Delle obbligazioni", title: "Titolo I — Obbligazioni in generale" } },
  { from: 1277, to: 1320, h: { book: "Libro IV", title: "Titolo I", chapter: "Dell'inadempimento" } },
  { from: 1321, to: 1405, h: { book: "Libro IV", title: "Titolo II — Dei contratti in generale" } },
  { from: 1406, to: 1469, h: { book: "Libro IV", title: "Titolo II", chapter: "Degli effetti del contratto" } },
  { from: 1470, to: 1547, h: { book: "Libro IV", title: "Titolo III — Dei singoli contratti", chapter: "Della vendita" } },
  { from: 1548, to: 1570, h: { book: "Libro IV", title: "Titolo III", chapter: "Riporto e permuta" } },
  { from: 1571, to: 1654, h: { book: "Libro IV", title: "Titolo III", chapter: "Della locazione" } },
  { from: 1655, to: 1677, h: { book: "Libro IV", title: "Titolo III", chapter: "Dell'appalto" } },
  { from: 1678, to: 1702, h: { book: "Libro IV", title: "Titolo III", chapter: "Del trasporto" } },
  { from: 1703, to: 1741, h: { book: "Libro IV", title: "Titolo III", chapter: "Del mandato" } },
  { from: 1742, to: 1765, h: { book: "Libro IV", title: "Titolo III", chapter: "Commissione e agenzia" } },
  { from: 1766, to: 1797, h: { book: "Libro IV", title: "Titolo III", chapter: "Del deposito" } },
  { from: 1813, to: 1822, h: { book: "Libro IV", title: "Titolo III", chapter: "Del comodato" } },
  { from: 1823, to: 1860, h: { book: "Libro IV", title: "Titolo III", chapter: "Del mutuo" } },
  { from: 1861, to: 1932, h: { book: "Libro IV", title: "Titolo III", chapter: "Assicurazioni" } },
  { from: 1936, to: 1959, h: { book: "Libro IV", title: "Titolo III", chapter: "Della fideiussione" } },
  { from: 2043, to: 2059, h: { book: "Libro IV", title: "Titolo IX — Dei fatti illeciti" } },
  { from: 2060, to: 2246, h: { book: "Libro V — Del lavoro", title: "Titolo I-II — Lavoro" } },
  { from: 2247, to: 2290, h: { book: "Libro V", title: "Titolo III — Lavoro autonomo" } },
  { from: 2291, to: 2510, h: { book: "Libro V", title: "Titolo V — Delle società" } },
  { from: 2555, to: 2642, h: { book: "Libro V", title: "Titolo VI — Cooperative" } },
  { from: 2643, to: 2739, h: { book: "Libro VI — Della tutela dei diritti", title: "Titolo I — Della trascrizione" } },
  { from: 2740, to: 2783, h: { book: "Libro VI", title: "Titolo II — Delle prove" } },
  { from: 2784, to: 2807, h: { book: "Libro VI", title: "Titolo III — Responsabilità patrimoniale" } },
  { from: 2808, to: 2899, h: { book: "Libro VI", title: "Titolo IV — Cause di prelazione" } },
  { from: 2900, to: 2933, h: { book: "Libro VI", title: "Titolo IV", chapter: "Delle ipoteche" } },
  { from: 2934, to: 2969, h: { book: "Libro VI", title: "Titolo V — Prescrizione e decadenza" } },
];

function getHierarchy(n: number): HierarchyEntry {
  let best: HierarchyEntry = { book: "Codice Civile" };
  for (const e of CC_HIERARCHY) {
    if (n >= e.from && n <= e.to) best = e.h;
  }
  return best;
}

// ─── Istituti giuridici per range articoli ───

const INSTITUTES: Array<{ from: number; to: number; i: string[]; k: string[] }> = [
  { from: 1321, to: 1352, i: ["contratto", "requisiti_contratto"], k: ["contratto", "consenso", "forma"] },
  { from: 1353, to: 1381, i: ["proposta", "accettazione", "contratto_preliminare"], k: ["proposta", "accettazione", "preliminare"] },
  { from: 1382, to: 1405, i: ["caparra_confirmatoria", "caparra_penitenziale", "clausola_penale"], k: ["caparra", "penale", "recesso"] },
  { from: 1406, to: 1469, i: ["effetti_contratto", "risoluzione", "rescissione"], k: ["risoluzione", "inadempimento", "rescissione"] },
  { from: 1470, to: 1509, i: ["vendita", "compravendita", "garanzia_evizione"], k: ["vendita", "prezzo", "garanzia", "vizi"] },
  { from: 1537, to: 1541, i: ["vendita_a_corpo", "vendita_a_misura", "rettifica_prezzo"], k: ["corpo", "misura", "tolleranza", "ventesimo"] },
  { from: 1571, to: 1654, i: ["locazione"], k: ["locazione", "locatore", "conduttore", "canone"] },
  { from: 1655, to: 1677, i: ["appalto", "difformità_vizi"], k: ["appalto", "committente", "vizi"] },
  { from: 1703, to: 1741, i: ["mandato", "procura"], k: ["mandato", "procura", "rappresentanza"] },
  { from: 1813, to: 1822, i: ["comodato"], k: ["comodato"] },
  { from: 1823, to: 1860, i: ["mutuo", "interessi"], k: ["mutuo", "interessi", "usura"] },
  { from: 1882, to: 1932, i: ["assicurazione"], k: ["assicurazione", "polizza", "sinistro"] },
  { from: 1936, to: 1959, i: ["fideiussione"], k: ["fideiussione", "garanzia"] },
  { from: 2043, to: 2059, i: ["responsabilità_extracontrattuale"], k: ["danno", "risarcimento", "illecito"] },
  { from: 2325, to: 2461, i: ["società_per_azioni"], k: ["spa", "azioni", "assemblea"] },
  { from: 2462, to: 2510, i: ["srl"], k: ["srl", "quote", "socio"] },
  { from: 2643, to: 2696, i: ["trascrizione"], k: ["trascrizione", "registri"] },
  { from: 2900, to: 2969, i: ["ipoteca", "prescrizione"], k: ["ipoteca", "prescrizione", "decadenza"] },
];

function getInstitutes(n: number): { institutes: string[]; keywords: string[] } {
  const inst = new Set<string>();
  const kw = new Set<string>();
  for (const m of INSTITUTES) {
    if (n >= m.from && n <= m.to) {
      m.i.forEach((i) => inst.add(i));
      m.k.forEach((k) => kw.add(k));
    }
  }
  return { institutes: Array.from(inst), keywords: Array.from(kw) };
}
