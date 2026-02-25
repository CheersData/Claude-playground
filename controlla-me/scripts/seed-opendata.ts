#!/usr/bin/env npx tsx
/**
 * seed-opendata.ts — Load Italian laws via Normattiva Open Data API.
 *
 * Uses the official REST API (https://dati.normattiva.it/) instead of HTML scraping.
 * Downloads complete laws as JSON, extracts articles, generates embeddings, and upserts into Supabase.
 *
 * Usage:
 *   npx tsx scripts/seed-opendata.ts                      # all sources
 *   npx tsx scripts/seed-opendata.ts --source=consumo     # single source
 *   npx tsx scripts/seed-opendata.ts --collection=Codici  # download pre-built collection
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
import {
  OPENDATA_SOURCES,
  searchAct,
  asyncExport,
  downloadCollection,
  extractArticlesFromJson,
  type OpenDataSource,
} from "../connectors/normattiva-opendata";

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
      return generateEmbeddings(texts);
    }
    console.error(`  [EMBED] Error ${response.status}: ${errText.slice(0, 200)}`);
    return null;
  }

  const data = await response.json();
  return data.data.sort((a: any, b: any) => a.index - b.index).map((d: any) => d.embedding);
}

// ─── Article processing ───

interface ParsedArticle {
  articleNumber: string;
  title: string | null;
  text: string;
  isInForce: boolean;
  hierarchy: Record<string, string>;
  urn: string;
}

function formatArticleRef(artNum: string): string {
  const match = artNum.match(/^(\d+)(bis|ter|quater|quinquies|sexies|septies|octies)?$/i);
  if (!match) return `Art. ${artNum}`;
  const num = match[1];
  const suffix = match[2] ? `-${match[2].toLowerCase()}` : "";
  return `Art. ${num}${suffix}`;
}

// ─── Load a single source via async export ───

const BATCH_SIZE = 25;

async function loadSource(source: OpenDataSource) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${source.name} (${source.id})`);
  console.log(`  ${source.description ?? ""}`);
  console.log(`  Method: Open Data API — Async Export (JSON)`);
  console.log(`${"═".repeat(60)}\n`);

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Step 1: Search to verify the act exists
  console.log("  [1/4] Searching for act...");
  const act = await searchAct(source.denominazioneAtto, source.anno, source.numero);
  if (!act) {
    console.error(`  ❌ Act not found: ${source.name}`);
    return { source: source.name, inserted: 0, errors: 0, fetched: 0 };
  }
  console.log(`  Found: ${act.descrizioneAtto}`);

  // Step 2: Async export
  console.log("  [2/4] Exporting via async workflow...");
  const zip = await asyncExport(source);
  if (!zip) {
    console.error(`  ❌ Export failed for ${source.name}`);
    return { source: source.name, inserted: 0, errors: 0, fetched: 0 };
  }
  console.log(`  ZIP downloaded: ${(zip.length / 1024).toFixed(0)} KB`);

  // Step 3: Extract articles from ZIP
  console.log("  [3/4] Extracting articles from JSON...");
  const { unzipSync } = await import("fflate");
  const files = unzipSync(new Uint8Array(zip));

  const allArticles: ParsedArticle[] = [];
  for (const [filename, data] of Object.entries(files)) {
    if (!filename.endsWith(".json")) continue;
    try {
      const jsonStr = new TextDecoder().decode(data);
      const jsonData = JSON.parse(jsonStr);
      const extracted = extractArticlesFromJson(jsonData, source.name, source.id);
      allArticles.push(...extracted);
    } catch (e) {
      console.error(`  [PARSE] Error in ${filename}: ${e}`);
    }
  }

  console.log(`  Extracted: ${allArticles.length} articles`);

  if (allArticles.length === 0) {
    return { source: source.name, inserted: 0, errors: 0, fetched: 0 };
  }

  // Step 4: Generate embeddings and upsert
  console.log("  [4/4] Generating embeddings and upserting...");
  let totalInserted = 0;
  let totalErrors = 0;

  for (let i = 0; i < allArticles.length; i += BATCH_SIZE) {
    const batch = allArticles.slice(i, i + BATCH_SIZE);
    const batchIdx = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allArticles.length / BATCH_SIZE);

    const texts = batch.map(
      (a) =>
        `${source.name} Art. ${a.articleNumber}${a.title ? ` — ${a.title}` : ""}\n${a.text}`
    );
    const embeddings = await generateEmbeddings(texts);

    if (!embeddings) {
      console.error(`  [BATCH ${batchIdx}] Embedding failed — skip`);
      totalErrors += batch.length;
      continue;
    }

    for (let k = 0; k < batch.length; k++) {
      const art = batch[k];
      const artRef = formatArticleRef(art.articleNumber);

      const { error } = await admin.from("legal_articles").upsert(
        {
          law_source: source.name,
          article_reference: artRef,
          article_title: art.title,
          article_text: art.text,
          hierarchy: art.hierarchy,
          keywords: [],
          related_institutes: [],
          embedding: JSON.stringify(embeddings[k]),
          source_url: `https://www.normattiva.it/uri-res/N2Ls?${art.urn}~art${art.articleNumber}`,
          is_in_force: art.isInForce,
          domain: "legal",
          updated_at: new Date().toISOString(),
          source_id: source.id,
          source_name: source.name,
          source_type: "normattiva-opendata",
          article_number: art.articleNumber,
          in_force: art.isInForce,
          url: `https://www.normattiva.it/uri-res/N2Ls?${art.urn}~art${art.articleNumber}`,
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

    if (batchIdx % 3 === 0 || batchIdx === totalBatches) {
      console.log(
        `  [${source.id}] Batch ${batchIdx}/${totalBatches} — ` +
          `${totalInserted} inserted, ${totalErrors} errors`
      );
    }

    await sleep(1500);
  }

  console.log(
    `\n  ✅ ${source.name}: ${totalInserted} inseriti, ${totalErrors} errori\n`
  );

  return {
    source: source.name,
    inserted: totalInserted,
    errors: totalErrors,
    fetched: allArticles.length,
  };
}

// ─── Load a pre-built collection ───

async function loadCollection(collectionName: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Collection: ${collectionName}`);
  console.log(`  Method: Open Data API — Pre-built Collection (JSON, Vigente)`);
  console.log(`${"═".repeat(60)}\n`);

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Download collection
  console.log("  [1/3] Downloading collection...");
  const zip = await downloadCollection(collectionName, "JSON", "V");
  if (!zip) {
    console.error(`  ❌ Collection download failed: ${collectionName}`);
    return [];
  }
  console.log(`  ZIP: ${(zip.length / 1024 / 1024).toFixed(1)} MB`);

  // Extract all acts
  console.log("  [2/3] Extracting articles from all acts...");
  const { unzipSync } = await import("fflate");
  const files = unzipSync(new Uint8Array(zip));

  const results = [];
  let totalArticles = 0;
  let totalInserted = 0;
  let totalErrors = 0;

  for (const [filename, data] of Object.entries(files)) {
    if (!filename.endsWith(".json")) continue;

    try {
      const jsonStr = new TextDecoder().decode(data);
      const jsonData = JSON.parse(jsonStr);
      const meta = jsonData.metadati;
      const lawName = `${meta.tipoDoc} ${meta.numDoc}/${meta.dataDoc?.split("-")[0] ?? ""}`.trim();
      const sourceId = lawName.toLowerCase().replace(/[^\w]/g, "_");

      const articles = extractArticlesFromJson(jsonData, lawName, sourceId);
      totalArticles += articles.length;

      // Upsert in batches
      for (let i = 0; i < articles.length; i += BATCH_SIZE) {
        const batch = articles.slice(i, i + BATCH_SIZE);

        const texts = batch.map(
          (a) =>
            `${lawName} Art. ${a.articleNumber}${a.title ? ` — ${a.title}` : ""}\n${a.text}`
        );
        const embeddings = await generateEmbeddings(texts);

        if (!embeddings) {
          totalErrors += batch.length;
          continue;
        }

        for (let k = 0; k < batch.length; k++) {
          const art = batch[k];
          const artRef = formatArticleRef(art.articleNumber);

          const { error } = await admin.from("legal_articles").upsert(
            {
              law_source: lawName,
              article_reference: artRef,
              article_title: art.title,
              article_text: art.text,
              hierarchy: art.hierarchy,
              keywords: [],
              related_institutes: [],
              embedding: JSON.stringify(embeddings[k]),
              source_url: `https://www.normattiva.it/uri-res/N2Ls?${art.urn}~art${art.articleNumber}`,
              is_in_force: art.isInForce,
              domain: "legal",
              updated_at: new Date().toISOString(),
              source_id: sourceId,
              source_name: lawName,
              source_type: "normattiva-opendata",
              article_number: art.articleNumber,
              in_force: art.isInForce,
              url: `https://www.normattiva.it/uri-res/N2Ls?${art.urn}~art${art.articleNumber}`,
            },
            { onConflict: "law_source,article_reference" }
          );

          if (error) {
            totalErrors++;
          } else {
            totalInserted++;
          }
        }

        await sleep(1500);
      }

      console.log(`  ${meta.titoloDoc?.slice(0, 60) ?? filename}: ${articles.length} articoli`);
      results.push({ source: lawName, inserted: articles.length, errors: 0, fetched: articles.length });
    } catch (e) {
      console.error(`  [PARSE] Error in ${filename}: ${e}`);
    }
  }

  console.log(
    `\n  ✅ Collection ${collectionName}: ${totalInserted} inseriti, ${totalErrors} errori, ${totalArticles} totali\n`
  );

  return results;
}

// ─── Utility ───

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs(): { source?: string; collection?: string } {
  const args = process.argv.slice(2);
  const result: { source?: string; collection?: string } = {};
  for (const arg of args) {
    const sourceMatch = arg.match(/^--source=(.+)$/);
    if (sourceMatch) result.source = sourceMatch[1];
    const collMatch = arg.match(/^--collection=(.+)$/);
    if (collMatch) result.collection = collMatch[1];
  }
  return result;
}

// ─── Main ───

async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  controlla.me — Seed via Normattiva Open Data API          ║");
  console.log("║  https://dati.normattiva.it/ — CC BY 4.0                   ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  for (const key of [
    "VOYAGE_API_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ]) {
    if (!process.env[key]) {
      console.error(`❌ Variabile ${key} mancante in .env.local`);
      process.exit(1);
    }
  }

  const { source: filterSource, collection } = parseArgs();

  // Mode 1: Download a pre-built collection
  if (collection) {
    console.log(`  Modalità: Download collection "${collection}"\n`);
    const results = await loadCollection(collection);

    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║  RISULTATO FINALE (Collection)                             ║");
    console.log("╠══════════════════════════════════════════════════════════════╣");
    for (const r of results) {
      console.log(
        `║  ${r.source.padEnd(30)} ${String(r.inserted).padStart(5)} ok`
      );
    }
    console.log("╚══════════════════════════════════════════════════════════════╝\n");
    return;
  }

  // Mode 2: Load specific sources via async export
  const sources = filterSource
    ? OPENDATA_SOURCES.filter(
        (s) => s.id.includes(filterSource) || s.name.includes(filterSource)
      )
    : OPENDATA_SOURCES;

  if (sources.length === 0) {
    console.error(`❌ Nessuna fonte trovata per "${filterSource}"`);
    console.log(
      "Fonti disponibili:",
      OPENDATA_SOURCES.map((s) => `${s.id} (${s.name})`).join(", ")
    );
    process.exit(1);
  }

  console.log(
    `  Fonti da caricare: ${sources.map((s) => s.name).join(", ")}\n`
  );

  const results = [];
  for (const source of sources) {
    const result = await loadSource(source);
    results.push(result);
  }

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  RISULTATO FINALE                                          ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  for (const r of results) {
    console.log(
      `║  ${r.source.padEnd(25)} ${String(r.inserted).padStart(5)} ok  ${String(r.errors).padStart(3)} err`
    );
  }
  const totalIns = results.reduce((a, r) => a + r.inserted, 0);
  const totalErr = results.reduce((a, r) => a + r.errors, 0);
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(
    `║  TOTALE:                    ${String(totalIns).padStart(5)} ok  ${String(totalErr).padStart(3)} err`
  );
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
}

main().catch((err) => {
  console.error("\n❌ Errore fatale:", err);
  process.exit(1);
});
