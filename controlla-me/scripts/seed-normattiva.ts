#!/usr/bin/env npx tsx
/**
 * seed-normattiva.ts — Scrape Italian laws from Normattiva and load into Supabase.
 *
 * Usage:
 *   npx tsx scripts/seed-normattiva.ts                    # all sources
 *   npx tsx scripts/seed-normattiva.ts --source=consumo   # single source
 *
 * Requirements:
 *   - VOYAGE_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// ─── Proxy setup (for containerized environments) ───
import { ProxyAgent, setGlobalDispatcher } from "undici";

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxyUrl) {
  console.log(`  [PROXY] Using proxy: ${proxyUrl.replace(/jwt_[^@]+/, "jwt_***")}`);
  const proxyAgent = new ProxyAgent(proxyUrl);
  setGlobalDispatcher(proxyAgent);
}

import { createClient } from "@supabase/supabase-js";

// ─── Voyage AI embedding ───
const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-law-2";

async function generateEmbeddings(texts: string[]): Promise<number[][] | null> {
  if (!process.env.VOYAGE_API_KEY || texts.length === 0) return null;

  const response = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: texts,
      input_type: "document",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 429) {
      console.log("  [EMBED] Rate limit — waiting 10s...");
      await sleep(10000);
      return generateEmbeddings(texts); // retry once
    }
    console.error(`  [EMBED] Error ${response.status}: ${errText.slice(0, 200)}`);
    return null;
  }

  const data = await response.json();
  return data.data.sort((a: any, b: any) => a.index - b.index).map((d: any) => d.embedding);
}

// ─── Normattiva scraper ───

interface NormativaArticle {
  articleNumber: string;
  title: string | null;
  text: string;
}

async function fetchArticle(baseUrn: string, artNum: string): Promise<NormativaArticle | null> {
  const url = `https://www.normattiva.it/uri-res/N2Ls?${baseUrn}~art${artNum}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;

    const html = await resp.text();

    // Extract title
    const headingMatch = html.match(/class="article-heading-akn">(.*?)<\/div>/s);
    let title: string | null = null;
    if (headingMatch) {
      title = headingMatch[1].replace(/<[^>]+>/g, "").trim();
      title = decodeHtmlEntities(title);
    }

    // Extract body
    const bodyMatch = html.match(/class="art-commi-div-akn">([\s\S]*?)(?=<div class="box_generico|<div class="collapse|<\/article|<div id="nota_atto)/);
    if (!bodyMatch) return null;

    let text = bodyMatch[1];
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<[^>]+>/g, " ");
    text = text.replace(/\s+/g, " ");
    text = decodeHtmlEntities(text).trim();

    // Skip empty articles or "abrogato" only articles
    if (text.length < 15) return null;

    return { articleNumber: artNum, title, text };
  } catch {
    return null;
  }
}

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
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)));
}

// ─── Source definitions ───

interface LawSource {
  id: string;
  name: string;
  urn: string;
  maxArticle: number;
  suffixes?: string[]; // bis, ter, etc.
}

const SOURCES: LawSource[] = [
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

// ─── Main ───

const BATCH_SIZE = 25;

async function loadSource(source: LawSource) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${source.name} (${source.id})`);
  console.log(`  URN: ${source.urn}`);
  console.log(`  Range: art. 1 → ${source.maxArticle}`);
  console.log(`${"═".repeat(60)}\n`);

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Build article numbers to try
  const artNumbers: string[] = [];
  for (let i = 1; i <= source.maxArticle; i++) {
    artNumbers.push(String(i));
    for (const suffix of source.suffixes ?? []) {
      artNumbers.push(`${i}${suffix}`);
    }
  }

  let totalFetched = 0;
  let totalInserted = 0;
  let totalErrors = 0;
  let totalSkipped = 0;

  // Process in batches
  for (let i = 0; i < artNumbers.length; i += BATCH_SIZE) {
    const batchNums = artNumbers.slice(i, i + BATCH_SIZE);
    const batchIdx = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(artNumbers.length / BATCH_SIZE);

    // Fetch articles in parallel (5 at a time to be polite)
    const articles: NormativaArticle[] = [];
    for (let j = 0; j < batchNums.length; j += 5) {
      const chunk = batchNums.slice(j, j + 5);
      const results = await Promise.all(
        chunk.map((num) => fetchArticle(source.urn, num))
      );
      for (const art of results) {
        if (art) articles.push(art);
      }
      await sleep(300); // Be polite to Normattiva
    }

    totalFetched += articles.length;
    totalSkipped += batchNums.length - articles.length;

    if (articles.length === 0) continue;

    // Generate embeddings
    const texts = articles.map(
      (a) => `${source.name} Art. ${a.articleNumber}${a.title ? ` — ${a.title}` : ""}\n${a.text}`
    );
    const embeddings = await generateEmbeddings(texts);

    if (!embeddings) {
      console.error(`  [BATCH ${batchIdx}] Embedding failed — skip`);
      totalErrors += articles.length;
      continue;
    }

    // Upsert into Supabase
    for (let k = 0; k < articles.length; k++) {
      const art = articles[k];
      const artRef = `Art. ${art.articleNumber}`;

      const { error } = await admin.from("legal_articles").upsert(
        {
          law_source: source.name,
          article_reference: artRef,
          article_title: art.title,
          article_text: art.text,
          hierarchy: {},
          keywords: [],
          related_institutes: [],
          embedding: JSON.stringify(embeddings[k]),
          source_url: `https://www.normattiva.it/uri-res/N2Ls?${source.urn}~art${art.articleNumber}`,
          is_in_force: true,
          domain: "legal",
          updated_at: new Date().toISOString(),
          source_id: source.id,
          source_name: source.name,
          source_type: "normattiva",
          article_number: art.articleNumber,
          in_force: true,
          url: `https://www.normattiva.it/uri-res/N2Ls?${source.urn}~art${art.articleNumber}`,
        },
        { onConflict: "law_source,article_reference" }
      );

      if (error) {
        console.error(`  [ERR] ${source.name} ${artRef}: ${error.message}`);
        totalErrors++;
      } else {
        totalInserted++;
      }
    }

    if (batchIdx % 5 === 0 || batchIdx === totalBatches) {
      console.log(
        `  [${source.id}] Batch ${batchIdx}/${totalBatches} — ` +
          `${totalFetched} fetched, ${totalInserted} inserted, ${totalErrors} errors`
      );
    }

    // Rate limit between embedding batches
    await sleep(1500);
  }

  console.log(`\n  ✅ ${source.name}: ${totalInserted} inseriti, ${totalErrors} errori, ${totalSkipped} pagine vuote\n`);

  return { source: source.name, inserted: totalInserted, errors: totalErrors, fetched: totalFetched };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(): { source?: string } {
  const args = process.argv.slice(2);
  for (const arg of args) {
    const match = arg.match(/^--source=(.+)$/);
    if (match) return { source: match[1] };
  }
  return {};
}

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  controlla.me — Seed Normattiva Sources                    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Check env
  for (const key of ["VOYAGE_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[key]) {
      console.error(`❌ Variabile ${key} mancante in .env.local`);
      process.exit(1);
    }
  }

  const { source: filterSource } = parseArgs();
  const sources = filterSource
    ? SOURCES.filter((s) => s.id.includes(filterSource) || s.name.includes(filterSource))
    : SOURCES;

  if (sources.length === 0) {
    console.error(`❌ Nessuna fonte trovata per "${filterSource}"`);
    console.log("Fonti disponibili:", SOURCES.map((s) => `${s.id} (${s.name})`).join(", "));
    process.exit(1);
  }

  console.log(`  Fonti da caricare: ${sources.map((s) => s.name).join(", ")}\n`);

  const results = [];
  for (const source of sources) {
    const result = await loadSource(source);
    results.push(result);
  }

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  RISULTATO FINALE                                          ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  for (const r of results) {
    console.log(`║  ${r.source.padEnd(25)} ${String(r.inserted).padStart(5)} ok  ${String(r.errors).padStart(3)} err`);
  }
  const totalIns = results.reduce((a, r) => a + r.inserted, 0);
  const totalErr = results.reduce((a, r) => a + r.errors, 0);
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  TOTALE:                    ${String(totalIns).padStart(5)} ok  ${String(totalErr).padStart(3)} err`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
}

main().catch((err) => {
  console.error("\n❌ Errore fatale:", err);
  process.exit(1);
});
