#!/usr/bin/env npx tsx
/**
 * seed-statuto-lavoratori.ts — Carica il testo dello Statuto dei Lavoratori nel corpus.
 *
 * Fonte: statuto-lavoratori-articles.json (testo di pubblico dominio, L. 300/1970)
 *
 * Motivo: L'API async Normattiva produce ZIP vuoti per questa legge storica.
 * Il workaround fetchViaWebCaricaAKN richiede session cookie WAF che
 * non è riproducibile in modo affidabile in ambienti automatizzati.
 * Soluzione adottata: testo statico basato sul testo vigente di pubblico dominio.
 *
 * Uso:
 *   npx tsx scripts/seed-statuto-lavoratori.ts
 *
 * Requisiti:
 *   - VOYAGE_API_KEY nel .env.local (per generare embeddings)
 *   - NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nel .env.local
 *   - Migration 003_vector_db.sql già eseguita su Supabase
 *
 * Il processo è idempotente: usa upsert su (law_source, article_reference).
 * Può essere rieseguito senza creare duplicati.
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Carica env dal .env.local della app
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// ─── Costanti ───

const LAW_SOURCE = "Statuto dei Lavoratori (L. 300/1970)";
const SOURCE_URL = "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:1970-05-20;300";
const BATCH_SIZE = 20; // Articoli per batch di upsert (41 totali → 3 batch)
const EMBEDDING_BATCH_SIZE = 20; // Testi per batch embeddings

// ─── Tipi ───

interface ArticleJson {
  articleNumber: string;
  title: string;
  content: string;
  hierarchy: {
    titolo?: string;
    capo?: string;
    sezione?: string;
  };
  institutes: string[];
  keywords: string[];
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

// ─── Funzioni ausiliarie ───

async function generateEmbeddings(texts: string[]): Promise<number[][] | null> {
  const voyageKey = process.env.VOYAGE_API_KEY;
  if (!voyageKey) {
    console.error("[SEED] VOYAGE_API_KEY non configurata");
    return null;
  }

  const allEmbeddings: number[][] = [];

  // Processa in batch
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    console.log(`[SEED] Embeddings batch ${Math.floor(i / EMBEDDING_BATCH_SIZE) + 1}/${Math.ceil(texts.length / EMBEDDING_BATCH_SIZE)} (${batch.length} testi)...`);

    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voyageKey}`,
      },
      body: JSON.stringify({
        model: "voyage-law-2",
        input: batch,
        input_type: "document",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[SEED] Errore Voyage AI HTTP ${response.status}: ${errText.slice(0, 200)}`);
      return null;
    }

    const result = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    allEmbeddings.push(...result.data.map((d) => d.embedding));

    // Rate limit pause tra batch (evita 429 Voyage)
    if (i + EMBEDDING_BATCH_SIZE < texts.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return allEmbeddings;
}

function sourceToId(lawSource: string): string {
  return lawSource
    .toLowerCase()
    .replace(/[.\s/()]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// ─── Main ───

async function main() {
  console.log("=== Seed Statuto dei Lavoratori (L. 300/1970) ===\n");

  // Verifica env vars
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const voyageKey = process.env.VOYAGE_API_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("[SEED] ERRORE: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY richieste.");
    process.exit(1);
  }

  if (!voyageKey) {
    console.warn("[SEED] ATTENZIONE: VOYAGE_API_KEY non configurata. Gli articoli saranno inseriti senza embeddings (ricerca semantica non disponibile).");
  }

  // Carica JSON articoli
  const jsonPath = path.resolve(__dirname, "statuto-lavoratori-articles.json");
  if (!fs.existsSync(jsonPath)) {
    console.error(`[SEED] File non trovato: ${jsonPath}`);
    process.exit(1);
  }

  const rawArticles = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as ArticleJson[];
  console.log(`[SEED] Caricati ${rawArticles.length} articoli dal JSON\n`);

  // Trasforma nel formato LegalArticle
  const articles: LegalArticle[] = rawArticles.map((a) => ({
    lawSource: LAW_SOURCE,
    articleReference: `Art. ${a.articleNumber}`,
    articleTitle: a.title,
    articleText: a.content,
    hierarchy: a.hierarchy as Record<string, string>,
    keywords: a.keywords,
    relatedInstitutes: a.institutes,
    sourceUrl: SOURCE_URL,
    isInForce: true,
  }));

  // Genera testi per embedding (stesso formato di ingestArticles in legal-corpus.ts)
  const texts = articles.map(
    (a) =>
      `${a.lawSource} ${a.articleReference}${a.articleTitle ? ` — ${a.articleTitle}` : ""}\n${a.articleText}`
  );

  // Genera embeddings (se Voyage disponibile)
  let embeddings: number[][] | null = null;
  if (voyageKey) {
    console.log(`[SEED] Generazione embeddings per ${texts.length} articoli...`);
    embeddings = await generateEmbeddings(texts);
    if (!embeddings) {
      console.error("[SEED] Generazione embeddings fallita. Interruzione.");
      process.exit(1);
    }
    console.log(`[SEED] Embeddings generati: ${embeddings.length}\n`);
  } else {
    console.log("[SEED] Skip embeddings (VOYAGE_API_KEY assente)\n");
  }

  // Upsert su Supabase via fetch diretto (evita import dell'SDK in script standalone)
  let inserted = 0;
  let errors = 0;

  const sourceId = sourceToId(LAW_SOURCE);

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(articles.length / BATCH_SIZE);
    console.log(`[SEED] Upsert batch ${batchNum}/${totalBatches} (art. ${i + 1}-${Math.min(i + BATCH_SIZE, articles.length)})...`);

    for (let j = 0; j < batch.length; j++) {
      const article = batch[j];
      const idx = i + j;
      const embedding = embeddings ? embeddings[idx] : null;

      const row: Record<string, unknown> = {
        source_id: sourceId,
        source_name: LAW_SOURCE,
        source_type: "normattiva",
        article_number: article.articleReference.replace(/^Art\.\s*/i, ""),
        law_source: article.lawSource,
        article_reference: article.articleReference,
        article_title: article.articleTitle,
        article_text: article.articleText,
        hierarchy: article.hierarchy ?? {},
        keywords: article.keywords ?? [],
        related_institutes: article.relatedInstitutes ?? [],
        source_url: article.sourceUrl,
        is_in_force: true,
        updated_at: new Date().toISOString(),
      };

      if (embedding) {
        row.embedding = JSON.stringify(embedding);
      }

      // Upsert via REST API Supabase (compatible con script standalone senza SDK)
      const upsertResp = await fetch(
        `${supabaseUrl}/rest/v1/legal_articles`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify(row),
        }
      );

      if (!upsertResp.ok) {
        const errText = await upsertResp.text();
        console.error(`[SEED] Errore upsert ${article.articleReference} HTTP ${upsertResp.status}: ${errText.slice(0, 200)}`);
        errors++;
      } else {
        inserted++;
        // Log ogni 10 articoli
        if ((inserted % 10 === 0) || inserted === articles.length) {
          console.log(`[SEED]   ${inserted}/${articles.length} inseriti...`);
        }
      }
    }

    // Pausa tra batch per non saturare Supabase
    if (i + BATCH_SIZE < articles.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log(`\n=== Completato ===`);
  console.log(`Articoli inseriti/aggiornati: ${inserted}`);
  console.log(`Errori:                       ${errors}`);
  console.log(`Fonte:                        ${LAW_SOURCE}`);
  console.log(`source_id:                    ${sourceId}`);
  if (!voyageKey) {
    console.log(`\nNota: embeddings non generati. Per la ricerca semantica,`);
    console.log(`configurare VOYAGE_API_KEY in .env.local e rieseguire lo script.`);
  }

  // Aggiorna il lifecycle in corpus-sources.ts: va portato da "api-tested" a "loaded"
  console.log(`\nProssimo passo: aggiornare lifecycle di "statuto_lavoratori" in`);
  console.log(`  scripts/corpus-sources.ts da "api-tested" a "loaded"`);
}

main().catch((err) => {
  console.error("[SEED] Errore fatale:", err);
  process.exit(1);
});
