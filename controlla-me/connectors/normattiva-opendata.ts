/**
 * Normattiva Open Data Connector
 *
 * Uses the official Normattiva Open Data REST API (launched Feb 2026).
 * https://dati.normattiva.it/ — Licenza CC BY 4.0
 *
 * Two strategies:
 *   1. Bulk download pre-built "Codici" collection (40 Italian codes, JSON vigente)
 *   2. Advanced search → async export for specific laws by type/year/number
 *
 * API docs: https://dati.normattiva.it/assets/come_fare_per/API_Normattiva_OpenData.pdf
 */

import { defineConnector, type RawRecord, type ValidationResult } from "./template";
import type { CorpusArticle } from "../lib/db/corpus";

// ─── API Config ───

const API_BASE =
  "https://api.normattiva.it/t/normattiva.api/bff-opendata/v1/api/v1";

/** Act type codes (from GET /tipologiche/denominazione-atto). */
export const ACT_TYPES = {
  LEGGE: "PLE",
  DECRETO_LEGISLATIVO: "PLL",
  DECRETO_LEGGE: "PDL",
  REGIO_DECRETO: "PRD",
  DPR: "PPR",
  DPCM: "PCM_DPC",
  COSTITUZIONE: "COS",
} as const;

/** Export formats (from GET /tipologiche/estensioni). */
export type ExportFormat = "AKN" | "XML" | "JSON" | "HTML" | "PDF" | "EPUB" | "RTF" | "URI";

/** Vigenza modes for collection downloads. */
export type VigenzaMode = "O" | "V" | "M"; // Originale, Vigente, Multivigente

// ─── Source definitions ───

export interface OpenDataSource {
  id: string;
  name: string;
  /** Act denomination code (from ACT_TYPES). */
  denominazioneAtto: string;
  /** Year of the provision. */
  anno: string;
  /** Number of the provision. */
  numero: string;
  /** Human-friendly description. */
  description?: string;
}

export const OPENDATA_SOURCES: OpenDataSource[] = [
  {
    id: "codice_consumo",
    name: "D.Lgs. 206/2005",
    denominazioneAtto: "DECRETO LEGISLATIVO",
    anno: "2005",
    numero: "206",
    description: "Codice del Consumo",
  },
  {
    id: "codice_procedura_civile",
    name: "Codice di Procedura Civile",
    denominazioneAtto: "REGIO DECRETO",
    anno: "1940",
    numero: "1443",
    description: "Codice di Procedura Civile",
  },
  {
    id: "equo_canone",
    name: "L. 392/1978",
    denominazioneAtto: "LEGGE",
    anno: "1978",
    numero: "392",
    description: "Disciplina delle locazioni di immobili urbani",
  },
  {
    id: "codice_assicurazioni",
    name: "D.Lgs. 209/2005",
    denominazioneAtto: "DECRETO LEGISLATIVO",
    anno: "2005",
    numero: "209",
    description: "Codice delle Assicurazioni Private",
  },
  {
    id: "tu_bancario",
    name: "D.Lgs. 385/1993",
    denominazioneAtto: "DECRETO LEGISLATIVO",
    anno: "1993",
    numero: "385",
    description: "Testo Unico Bancario",
  },
  {
    id: "codice_crisi",
    name: "D.Lgs. 14/2019",
    denominazioneAtto: "DECRETO LEGISLATIVO",
    anno: "2019",
    numero: "14",
    description: "Codice della Crisi d'Impresa e dell'Insolvenza",
  },
];

// ─── JSON structure from Normattiva Open Data ZIPs ───

interface NormativaJsonAct {
  metadati: {
    urn: string;
    eli?: string;
    emettitore?: string;
    numDoc: string;
    tipoDoc: string;
    titoloDoc: string;
    noteDoc?: string;
    dataDoc: string;
    dataPubblicazione: string;
    numeroPubblicazione?: string;
    redazione: string;
    abrogato?: string;
  };
  articolato: {
    elementi: NormativaSection[];
  };
}

interface NormativaSection {
  idInterno?: number;
  numNir?: string; // e.g. "PARTE I*...*TITOLO I*...*"
  elementi: NormativaArticle[];
}

interface NormativaArticle {
  nomeNir?: string; // "articolo"
  idNir?: string;
  numNir?: string; // article number
  rubricaNir?: string; // article title
  testo?: string; // full article text
  dataVigoreVersione?: Array<{ inizioVigore: string; fineVigore: string }>;
}

// ─── Search response from /ricerca/avanzata ───

interface SearchResult {
  listaAtti: Array<{
    codiceRedazionale: string;
    dataGU: string;
    titoloAtto: string;
    annoProvvedimento: string;
    numeroProvvedimento: string;
    denominazioneAtto: string;
    descrizioneAtto: string;
  }>;
  numeroAttiTrovati: number;
}

// ─── Async workflow state ───

interface AsyncState {
  stato: number;
  descrizioneStato: string;
  descrizioneErrore: string | null;
  totAtti?: number;
  attiElaborati?: number;
  percentuale?: number;
}

// ─── API Client ───

async function apiGet(path: string): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const resp = await fetch(url);
  return resp;
}

async function apiPost(path: string, body: unknown): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return resp;
}

async function apiPut(path: string, body: unknown): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return resp;
}

// ─── Core functions ───

/**
 * Search for an act using the sync advanced search API.
 * Returns metadata (codiceRedazionale, dataGU, etc.) needed for detail/export.
 */
export async function searchAct(
  denominazioneAtto: string,
  anno: string,
  numero: string
): Promise<SearchResult["listaAtti"][0] | null> {
  const resp = await apiPost("/ricerca/avanzata", {
    denominazioneAtto,
    annoProvvedimento: anno,
    numeroProvvedimento: numero,
    paginazione: { paginaCorrente: 1, numeroElementiPerPagina: 10 },
  });

  if (!resp.ok) {
    console.error(`[OPENDATA] Search failed (${resp.status}): ${await resp.text()}`);
    return null;
  }

  const data: SearchResult = await resp.json();
  if (data.numeroAttiTrovati === 0 || !data.listaAtti?.length) {
    return null;
  }

  return data.listaAtti[0];
}

/**
 * Submit an async export request, confirm it, poll for completion, and download the ZIP.
 * Returns the ZIP buffer, or null on failure.
 */
export async function asyncExport(
  source: OpenDataSource,
  formato: ExportFormat = "JSON"
): Promise<Buffer | null> {
  console.log(`[OPENDATA] Starting async export: ${source.name} (${formato})`);

  // Step 1: Submit search
  const submitResp = await apiPost("/ricerca-asincrona/nuova-ricerca", {
    formato,
    tipoRicerca: "A",
    parametriRicerca: {
      filtriMap: {
        denominazione_atto: actTypeToCode(source.denominazioneAtto),
      },
    },
    annoProvvedimento: source.anno,
    numeroProvvedimento: source.numero,
    denominazioneAtto: source.denominazioneAtto,
  });

  if (submitResp.status !== 202) {
    const text = await submitResp.text();
    console.error(`[OPENDATA] Submit failed (${submitResp.status}): ${text}`);
    return null;
  }

  const token = (await submitResp.text()).trim();
  console.log(`[OPENDATA] Token: ${token}`);

  // Step 2: Confirm
  const confirmResp = await apiPut("/ricerca-asincrona/conferma-ricerca", {
    token,
    formato,
  });

  if (!confirmResp.ok) {
    console.error(`[OPENDATA] Confirm failed (${confirmResp.status})`);
    return null;
  }

  const confirmState: AsyncState = await confirmResp.json();
  console.log(`[OPENDATA] Confirm state: ${confirmState.stato} — ${confirmState.descrizioneStato}`);

  // Step 3: Poll check-status until 303
  let downloadUrl: string | null = null;
  const maxPolls = 60;
  for (let i = 0; i < maxPolls; i++) {
    await sleep(3000);

    const statusResp = await apiGet(`/ricerca-asincrona/check-status/${token}`);

    if (statusResp.status === 303) {
      downloadUrl = statusResp.headers.get("x-ipzs-location");
      console.log(`[OPENDATA] Export ready! Download URL available.`);
      break;
    }

    if (statusResp.status === 200) {
      const state: AsyncState = await statusResp.json();
      const pct = state.percentuale ?? 0;
      if (i % 5 === 0) {
        console.log(`[OPENDATA] Polling (${i + 1}/${maxPolls})... ${pct}%`);
      }
      continue;
    }

    console.error(`[OPENDATA] Unexpected status response: ${statusResp.status}`);
    return null;
  }

  if (!downloadUrl) {
    // Fallback: try direct download URL pattern
    downloadUrl = `${API_BASE}/collections/download/collection-asincrona/${token}`;
  }

  // Step 4: Download ZIP
  console.log(`[OPENDATA] Downloading ZIP...`);
  const dlResp = await fetch(downloadUrl, { redirect: "follow" });

  if (!dlResp.ok) {
    console.error(`[OPENDATA] Download failed (${dlResp.status})`);
    return null;
  }

  const arrayBuffer = await dlResp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Download a predefined collection (e.g. "Codici") as a ZIP.
 */
export async function downloadCollection(
  nome: string,
  formato: ExportFormat = "JSON",
  formatoRichiesta: VigenzaMode = "V"
): Promise<Buffer | null> {
  console.log(`[OPENDATA] Downloading collection: ${nome} (${formato}, ${formatoRichiesta})`);

  const url =
    `${API_BASE}/collections/download/collection-preconfezionata` +
    `?nome=${encodeURIComponent(nome)}&formato=${formato}&formatoRichiesta=${formatoRichiesta}`;

  const resp = await fetch(url, { redirect: "follow" });

  if (!resp.ok) {
    console.error(`[OPENDATA] Collection download failed (${resp.status}): ${await resp.text()}`);
    return null;
  }

  const arrayBuffer = await resp.arrayBuffer();
  console.log(`[OPENDATA] Downloaded ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);
  return Buffer.from(arrayBuffer);
}

// ─── JSON parsing ───

/**
 * Extract articles from a Normattiva Open Data JSON file.
 * The JSON has a nested structure: articolato.elementi[] → sections → elementi[] → articles
 */
export function extractArticlesFromJson(
  jsonData: NormativaJsonAct,
  sourceName: string,
  sourceId: string
): Array<{
  articleNumber: string;
  title: string | null;
  text: string;
  isInForce: boolean;
  urn: string;
  hierarchy: Record<string, string>;
}> {
  const articles: Array<{
    articleNumber: string;
    title: string | null;
    text: string;
    isInForce: boolean;
    urn: string;
    hierarchy: Record<string, string>;
  }> = [];

  const meta = jsonData.metadati;
  const urn = meta.urn;

  for (const section of jsonData.articolato?.elementi ?? []) {
    // Parse section hierarchy from numNir
    const hierarchy = parseSectionHierarchy(section.numNir);

    for (const art of section.elementi ?? []) {
      if (art.nomeNir !== "articolo") continue;

      const artNum = art.numNir ?? art.idNir ?? "";
      if (!artNum) continue;

      // Clean article text
      let text = (art.testo ?? "").trim();
      // Remove the leading "Art. N" prefix if present (we store it separately)
      text = text.replace(/^\s*Art\.\s*\d+[-\w]*\s*/i, "").trim();
      // Normalize whitespace
      text = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();

      if (text.length < 15) continue;

      // Determine in-force status
      const vigenza = art.dataVigoreVersione?.[art.dataVigoreVersione.length - 1];
      const isInForce = vigenza ? vigenza.fineVigore === "99999999" : true;

      articles.push({
        articleNumber: artNum,
        title: art.rubricaNir || null,
        text,
        isInForce,
        urn,
        hierarchy,
      });
    }
  }

  return articles;
}

/**
 * Parse section hierarchy from numNir string.
 * Format: "PARTE I*desc*-*-*TITOLO II*desc*" etc.
 */
function parseSectionHierarchy(numNir?: string): Record<string, string> {
  if (!numNir) return {};

  const hierarchy: Record<string, string> = {};
  const parts = numNir.split("*");

  for (let i = 0; i < parts.length - 1; i += 2) {
    const label = parts[i].trim();
    const desc = parts[i + 1]?.trim();
    if (!label || label === "-") continue;

    if (label.startsWith("PARTE")) {
      hierarchy.book = desc ? `${label} — ${desc}` : label;
    } else if (label.startsWith("TITOLO")) {
      hierarchy.title = desc ? `${label} — ${desc}` : label;
    } else if (label.startsWith("CAPO")) {
      hierarchy.chapter = desc ? `${label} — ${desc}` : label;
    } else if (label.startsWith("SEZIONE")) {
      hierarchy.section = desc ? `${label} — ${desc}` : label;
    }
  }

  return hierarchy;
}

/**
 * Format article reference: "1" → "Art. 1", handle bis/ter/etc.
 */
function formatArticleRef(artNum: string): string {
  const match = artNum.match(/^(\d+)(bis|ter|quater|quinquies|sexies|septies|octies)?$/i);
  if (!match) return `Art. ${artNum}`;
  const num = match[1];
  const suffix = match[2] ? `-${match[2].toLowerCase()}` : "";
  return `Art. ${num}${suffix}`;
}

/**
 * Map act denomination string to API code.
 */
function actTypeToCode(denom: string): string {
  const map: Record<string, string> = {
    "LEGGE": "PLE",
    "DECRETO LEGISLATIVO": "PLL",
    "DECRETO-LEGGE": "PDL",
    "REGIO DECRETO": "PRD",
    "DECRETO DEL PRESIDENTE DELLA REPUBBLICA": "PPR",
    "DECRETO DEL PRESIDENTE DEL CONSIGLIO DEI MINISTRI": "PCM_DPC",
    "COSTITUZIONE": "COS",
  };
  return map[denom.toUpperCase()] ?? denom;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Connector implementation ───

export default defineConnector({
  id: "normattiva-opendata",
  name: "Normattiva Open Data — Legislazione Italiana",
  domain: "legal",
  sourceUrl: "https://dati.normattiva.it/",

  async fetch(opts?: { limit?: number }): Promise<RawRecord[]> {
    const records: RawRecord[] = [];
    const limit = opts?.limit ?? Infinity;

    for (const source of OPENDATA_SOURCES) {
      if (records.length >= limit) break;

      // Step 1: Find the act via advanced search
      const act = await searchAct(source.denominazioneAtto, source.anno, source.numero);
      if (!act) {
        console.warn(`[OPENDATA] Act not found: ${source.name}`);
        continue;
      }

      console.log(`[OPENDATA] Found: ${act.descrizioneAtto} (${act.codiceRedazionale})`);

      // Step 2: Export via async workflow
      const zip = await asyncExport(source);
      if (!zip) {
        console.warn(`[OPENDATA] Export failed for ${source.name}`);
        continue;
      }

      // Step 3: Extract articles from ZIP
      const { unzipSync } = await import("fflate");
      const files = unzipSync(new Uint8Array(zip));

      for (const [filename, data] of Object.entries(files)) {
        if (!filename.endsWith(".json")) continue;

        try {
          const jsonStr = new TextDecoder().decode(data);
          const jsonData: NormativaJsonAct = JSON.parse(jsonStr);
          const articles = extractArticlesFromJson(jsonData, source.name, source.id);

          for (const art of articles) {
            if (records.length >= limit) break;
            records.push({
              sourceId: source.id,
              sourceName: source.name,
              sourceUrn: art.urn,
              articleNumber: art.articleNumber,
              title: art.title,
              text: art.text,
              isInForce: art.isInForce,
              hierarchy: art.hierarchy,
              url: `https://www.normattiva.it/uri-res/N2Ls?${art.urn}~art${art.articleNumber}`,
            });
          }
        } catch (e) {
          console.error(`[OPENDATA] Parse error ${filename}: ${e}`);
        }
      }

      console.log(`[OPENDATA] ${source.name}: ${records.length} articles so far`);
    }

    return records;
  },

  normalize(records: RawRecord[]): CorpusArticle[] {
    return records
      .filter((r) => typeof r.text === "string" && (r.text as string).length >= 15)
      .map((r) => ({
        lawSource: r.sourceName as string,
        articleReference: formatArticleRef(r.articleNumber as string),
        articleTitle: (r.title as string) || null,
        articleText: r.text as string,
        hierarchy: (r.hierarchy as Record<string, string>) ?? {},
        keywords: [],
        relatedInstitutes: [],
        sourceUrl: r.url as string,
        isInForce: r.isInForce as boolean,
        domain: "legal",
      }));
  },

  async validate(): Promise<ValidationResult> {
    const errors: string[] = [];

    // Test: search for a known act
    const act = await searchAct("DECRETO LEGISLATIVO", "2005", "206");
    if (!act) {
      return { ok: false, sampleCount: 0, errors: ["Cannot search Normattiva Open Data API"] };
    }

    if (act.denominazioneAtto !== "DECRETO LEGISLATIVO" || act.numeroProvvedimento !== "206") {
      errors.push(`Unexpected search result: ${act.descrizioneAtto}`);
    }

    // Test: list available collections
    const collResp = await apiGet("/collections/collection-predefinite");
    if (!collResp.ok) {
      errors.push(`Collections endpoint failed: ${collResp.status}`);
    }

    return {
      ok: errors.length === 0,
      sampleCount: 1,
      errors,
    };
  },
});
