/**
 * Normattiva Connector — Fetches Italian laws from Normattiva via URN-based access.
 *
 * Access method: Direct URN article pages (HTML with Akoma Ntoso classes).
 * API OpenData and Akoma Ntoso XML export are blocked by WAF in sandbox.
 *
 * Each source is defined by its URN and article range.
 */

import { defineConnector, type RawRecord, type ValidationResult } from "./template";
import type { CorpusArticle } from "../lib/db/corpus";

// ─── Source definitions ───

export interface NormativaSource {
  id: string;
  name: string;
  urn: string;
  maxArticle: number;
  suffixes: string[];
}

export const NORMATTIVA_SOURCES: NormativaSource[] = [
  {
    id: "codice_consumo",
    name: "D.Lgs. 206/2005",
    urn: "urn:nir:stato:decreto.legislativo:2005-09-06;206",
    maxArticle: 146,
    suffixes: ["bis", "ter", "quater", "quinquies", "sexies"],
  },
  {
    id: "codice_procedura_civile",
    name: "Codice di Procedura Civile",
    urn: "urn:nir:stato:regio.decreto:1940-10-28;1443",
    maxArticle: 840,
    suffixes: ["bis", "ter", "quater", "quinquies", "sexies", "septies", "octies"],
  },
  {
    id: "equo_canone",
    name: "L. 392/1978",
    urn: "urn:nir:stato:legge:1978-07-27;392",
    maxArticle: 84,
    suffixes: ["bis"],
  },
  {
    id: "codice_assicurazioni",
    name: "D.Lgs. 209/2005",
    urn: "urn:nir:stato:decreto.legislativo:2005-09-07;209",
    maxArticle: 355,
    suffixes: ["bis", "ter", "quater", "quinquies"],
  },
  {
    id: "tu_bancario",
    name: "D.Lgs. 385/1993",
    urn: "urn:nir:stato:decreto.legislativo:1993-09-01;385",
    maxArticle: 162,
    suffixes: ["bis", "ter", "quater", "quinquies", "sexies", "septies", "octies"],
  },
  {
    id: "codice_crisi",
    name: "D.Lgs. 14/2019",
    urn: "urn:nir:stato:decreto.legislativo:2019-01-12;14",
    maxArticle: 391,
    suffixes: ["bis", "ter", "quater", "quinquies"],
  },
];

// ─── HTML parsing ───

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&agrave;/g, "à")
    .replace(/&egrave;/g, "è")
    .replace(/&eacute;/g, "é")
    .replace(/&igrave;/g, "ì")
    .replace(/&ograve;/g, "ò")
    .replace(/&ugrave;/g, "ù")
    .replace(/&Agrave;/g, "À")
    .replace(/&Egrave;/g, "È")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)));
}

export async function fetchNormativaArticle(
  urn: string,
  artNum: string
): Promise<{ articleNumber: string; title: string | null; text: string } | null> {
  const url = `https://www.normattiva.it/uri-res/N2Ls?${urn}~art${artNum}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;

    const html = await resp.text();

    // Extract title from Akoma Ntoso heading
    const headingMatch = html.match(/class="article-heading-akn">(.*?)<\/div>/s);
    let title: string | null = null;
    if (headingMatch) {
      title = decodeHtmlEntities(headingMatch[1].replace(/<[^>]+>/g, "").trim());
    }

    // Extract body from Akoma Ntoso commi div
    const bodyMatch = html.match(
      /class="art-commi-div-akn">([\s\S]*?)(?=<div class="box_generico|<div class="collapse|<\/article|<div id="nota_atto)/
    );
    if (!bodyMatch) return null;

    let text = bodyMatch[1];
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<[^>]+>/g, " ");
    text = text.replace(/\s+/g, " ");
    text = decodeHtmlEntities(text).trim();

    if (text.length < 15) return null;

    return { articleNumber: artNum, title, text };
  } catch {
    return null;
  }
}

function formatArticleRef(artNum: string): string {
  // "1bis" → "Art. 1-bis", "23" → "Art. 23"
  const match = artNum.match(/^(\d+)(bis|ter|quater|quinquies|sexies|septies|octies)?$/);
  if (!match) return `Art. ${artNum}`;
  const num = match[1];
  const suffix = match[2] ? `-${match[2]}` : "";
  return `Art. ${num}${suffix}`;
}

// ─── Build article number list for a source ───

export function buildArticleNumbers(source: NormativaSource): string[] {
  const nums: string[] = [];
  for (let i = 1; i <= source.maxArticle; i++) {
    nums.push(String(i));
    for (const suffix of source.suffixes) {
      nums.push(`${i}${suffix}`);
    }
  }
  return nums;
}

// ─── Connector implementation ───

export default defineConnector({
  id: "normattiva",
  name: "Normattiva — Legislazione Italiana",
  domain: "legal",
  sourceUrl: "https://www.normattiva.it/",

  async fetch(opts?: { limit?: number }): Promise<RawRecord[]> {
    const records: RawRecord[] = [];
    const limit = opts?.limit ?? Infinity;

    for (const source of NORMATTIVA_SOURCES) {
      const artNums = buildArticleNumbers(source);

      for (let i = 0; i < artNums.length && records.length < limit; i += 5) {
        const chunk = artNums.slice(i, i + 5);
        const results = await Promise.all(
          chunk.map((num) => fetchNormativaArticle(source.urn, num))
        );

        for (const art of results) {
          if (art && records.length < limit) {
            records.push({
              sourceId: source.id,
              sourceName: source.name,
              sourceUrn: source.urn,
              articleNumber: art.articleNumber,
              title: art.title,
              text: art.text,
              url: `https://www.normattiva.it/uri-res/N2Ls?${source.urn}~art${art.articleNumber}`,
            });
          }
        }

        await new Promise((r) => setTimeout(r, 300));
      }
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
        hierarchy: {},
        keywords: [],
        relatedInstitutes: [],
        sourceUrl: r.url as string,
        isInForce: true,
        domain: "legal",
      }));
  },

  async validate(): Promise<ValidationResult> {
    const errors: string[] = [];

    // Test first 3 articles of first source
    const source = NORMATTIVA_SOURCES[0];
    const records = await this.fetch({ limit: 3 });

    if (records.length === 0) {
      return { ok: false, sampleCount: 0, errors: ["No articles fetched"] };
    }

    const articles = this.normalize(records);

    for (const art of articles) {
      if (!art.articleText || art.articleText.length < 50) {
        errors.push(`${art.articleReference}: articleText too short (${art.articleText?.length})`);
      }
      if (!art.articleReference) {
        errors.push("Missing articleReference");
      }
    }

    return {
      ok: errors.length === 0 && articles.length > 0,
      sampleCount: articles.length,
      errors,
      samples: articles,
    };
  },
});
