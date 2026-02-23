/**
 * Fetcher Normattiva API — Scarica leggi italiane via OpenData API (Akoma Ntoso XML).
 *
 * Normattiva OpenData (dal 1 gennaio 2026):
 * - Endpoint: https://pre.api.normattiva.it/t/normattiva.api/bff-opendata/v1/api/v1/...
 * - Auth: token via registrazione email su dati.normattiva.it
 * - Restituisce ZIP con XML Akoma Ntoso (strutturato, con <article>)
 * - Licenza CC BY 4.0
 *
 * Strategia:
 * 1. Se NORMATTIVA_API_TOKEN presente → usa API OpenData (XML strutturato)
 * 2. Altrimenti → fallback su HTML scraping (normattiva-html.ts)
 *
 * Registrazione: https://dati.normattiva.it/Come-scaricare-i-dati
 */

import { fetchWithRetry, sleep, extractLegalTerms, cleanText } from "../lib/utils";
import { fetchNormattivaHtml } from "./normattiva-html";
import type { LegalArticle } from "../lib/types";
import type { NormattivaSource } from "../corpus-sources";

const API_BASE = "https://pre.api.normattiva.it/t/normattiva.api/bff-opendata/v1/api/v1";

// ─── Fetch principale (API-first, HTML fallback) ───

export async function fetchNormattiva(source: NormattivaSource): Promise<LegalArticle[]> {
  const token = process.env.NORMATTIVA_API_TOKEN;

  if (!token) {
    console.log(`  [NORM-API] Token non configurato — fallback HTML scraping`);
    console.log(`  [NORM-API] Per usare l'API, registrati su: https://dati.normattiva.it/Come-scaricare-i-dati`);
    console.log(`  [NORM-API] E aggiungi NORMATTIVA_API_TOKEN nel .env.local`);
    return fetchNormattivaHtml(source);
  }

  // Per il Codice Civile, usa HuggingFace (più affidabile)
  if (source.id === "codice-civile") {
    console.log(`  [SKIP] ${source.name} — usa fonte HuggingFace`);
    return [];
  }

  console.log(`\n  [NORM-API] Scaricamento ${source.name} via OpenData API...`);

  try {
    // Step 1: Richiedi la collezione
    const requestBody = {
      codiceRedazionale: source.codiceRedazionale,
      tipoAtto: source.tipoAtto,
      email: process.env.NORMATTIVA_API_EMAIL || "",
      formato: "AKN", // Akoma Ntoso XML
    };

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    };

    console.log(`  [NORM-API] Richiesta collezione per ${source.codiceRedazionale}...`);
    const reqResponse = await fetchWithRetry(`${API_BASE}/ricerca-semplice/esportazione`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!reqResponse.ok) {
      const errText = await reqResponse.text();
      console.warn(`  [NORM-API] HTTP ${reqResponse.status}: ${errText.slice(0, 200)}`);
      console.log(`  [NORM-API] Fallback su HTML scraping...`);
      return fetchNormattivaHtml(source);
    }

    const reqData = await reqResponse.json();
    const collectionId = reqData.idCollezione || reqData.id_collezione;

    if (!collectionId) {
      console.warn(`  [NORM-API] Nessun ID collezione nella risposta`);
      console.log(`  [NORM-API] Fallback su HTML scraping...`);
      return fetchNormattivaHtml(source);
    }

    console.log(`  [NORM-API] Collezione ${collectionId} — polling stato...`);

    // Step 2: Polling fino a completamento
    let downloadUrl: string | null = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      await sleep(5000); // 5s tra polling

      const statusResp = await fetchWithRetry(
        `${API_BASE}/ricerca-semplice/esportazione/${collectionId}/stato`,
        { headers }
      );

      if (!statusResp.ok) continue;

      const statusData = await statusResp.json();
      const stato = statusData.stato || statusData.status;

      if (stato === "COMPLETATO" || stato === "COMPLETED") {
        downloadUrl = statusData.urlDownload || statusData.url_download;
        break;
      } else if (stato === "ERRORE" || stato === "ERROR") {
        console.error(`  [NORM-API] Errore elaborazione collezione`);
        break;
      }

      if (attempt % 6 === 0) {
        console.log(`  [NORM-API] Polling... stato: ${stato} (${attempt * 5}s)`);
      }
    }

    if (!downloadUrl) {
      console.warn(`  [NORM-API] Download non disponibile — fallback HTML`);
      return fetchNormattivaHtml(source);
    }

    // Step 3: Download ZIP e parsing XML
    console.log(`  [NORM-API] Download ZIP...`);
    const zipResp = await fetchWithRetry(downloadUrl, { headers });

    if (!zipResp.ok) {
      console.warn(`  [NORM-API] Download ZIP fallito — fallback HTML`);
      return fetchNormattivaHtml(source);
    }

    const xmlText = await zipResp.text();
    const articles = parseAkomaNtoso(xmlText, source);

    if (articles.length === 0) {
      console.warn(`  [NORM-API] Nessun articolo dal parsing AKN — fallback HTML`);
      return fetchNormattivaHtml(source);
    }

    // Validazione soglia
    const pct = (articles.length / source.expectedArticles) * 100;
    if (pct < source.minThresholdPct) {
      console.warn(
        `  [NORM-API] ATTENZIONE: ${articles.length} articoli (${pct.toFixed(0)}% del previsto ${source.expectedArticles})`
      );
    } else {
      console.log(
        `  [NORM-API] ${articles.length} articoli (${pct.toFixed(0)}% del previsto ${source.expectedArticles})`
      );
    }

    return articles;
  } catch (err) {
    console.error(`  [NORM-API] Errore: ${err}`);
    console.log(`  [NORM-API] Fallback su HTML scraping...`);
    return fetchNormattivaHtml(source);
  }
}

// ─── Parser Akoma Ntoso XML ───

function parseAkomaNtoso(xml: string, source: NormattivaSource): LegalArticle[] {
  const articles: LegalArticle[] = [];

  // Akoma Ntoso usa <article> con @eId
  // Regex-based per evitare dipendenza XML parser pesante
  const articleRegex = /<article\s[^>]*eId="([^"]*)"[^>]*>([\s\S]*?)<\/article>/gi;

  let match;
  while ((match = articleRegex.exec(xml)) !== null) {
    const eId = match[1];
    const content = match[2];

    // Estrai numero articolo dall'eId (es. "art_1", "art_2bis")
    const numMatch = eId.match(/art[_-]?(\d+(?:bis|ter|quater|quinquies|sexies|septies|octies)?)/i);
    if (!numMatch) continue;

    const artNum = numMatch[1];
    const artRef = `Art. ${artNum}`;

    // Estrai rubrica (heading)
    const headingMatch = content.match(/<heading[^>]*>([\s\S]*?)<\/heading>/i);
    const rubrica = headingMatch ? cleanXmlText(headingMatch[1]) : null;

    // Estrai testo (content o body)
    const bodyMatch = content.match(/<content[^>]*>([\s\S]*?)<\/content>/i)
      || content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    let text = bodyMatch ? cleanXmlText(bodyMatch[1]) : cleanXmlText(content);
    text = cleanText(text);

    if (text.length < 10) continue;

    // Gerarchia dai parent elements (book, title, chapter)
    const hierarchy = extractHierarchyFromXml(xml, eId);

    // Keywords
    const keywords = [...source.defaultKeywords];
    const institutes = [...source.defaultInstitutes];
    extractLegalTerms(text).forEach((t) => { if (!keywords.includes(t)) keywords.push(t); });

    articles.push({
      lawSource: source.lawSource,
      articleReference: artRef,
      articleTitle: rubrica,
      articleText: text,
      hierarchy,
      keywords,
      relatedInstitutes: institutes,
      sourceUrl: source.sourceUrlPattern?.replace("{N}", artNum) ?? undefined,
      isInForce: true,
    });
  }

  // Deduplica
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.articleReference)) return false;
    seen.add(a.articleReference);
    return true;
  });
}

// ─── Utility XML ───

function cleanXmlText(xml: string): string {
  return xml
    .replace(/<[^>]+>/g, " ") // Rimuovi tutti i tag
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHierarchyFromXml(xml: string, articleEId: string): Record<string, string> {
  const hierarchy: Record<string, string> = {};

  // Cerca il book/title/chapter che contiene questo articolo
  // Akoma Ntoso: <book eId="book_1"><num>Libro I</num><heading>...</heading>
  const bookMatch = xml.match(new RegExp(
    `<book[^>]*>\\s*<num[^>]*>([^<]+)</num>\\s*<heading[^>]*>([^<]+)</heading>[\\s\\S]*?${articleEId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    "i"
  ));
  if (bookMatch) {
    hierarchy.book = `${bookMatch[1].trim()} — ${bookMatch[2].trim()}`;
  }

  const titleMatch = xml.match(new RegExp(
    `<title[^>]*>\\s*<num[^>]*>([^<]+)</num>\\s*<heading[^>]*>([^<]+)</heading>[\\s\\S]*?${articleEId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    "i"
  ));
  if (titleMatch) {
    hierarchy.title = `${titleMatch[1].trim()} — ${titleMatch[2].trim()}`;
  }

  const chapterMatch = xml.match(new RegExp(
    `<chapter[^>]*>\\s*<num[^>]*>([^<]+)</num>\\s*<heading[^>]*>([^<]+)</heading>[\\s\\S]*?${articleEId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    "i"
  ));
  if (chapterMatch) {
    hierarchy.chapter = `${chapterMatch[1].trim()} — ${chapterMatch[2].trim()}`;
  }

  return hierarchy;
}
