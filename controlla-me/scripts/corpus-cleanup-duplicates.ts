#!/usr/bin/env npx tsx
/**
 * Corpus Cleanup — elimina duplicati per nomenclatura diversa.
 *
 * Strategia:
 * - Per ogni coppia duplicata nella stessa fonte, tiene la versione con trattino
 *   (es. "Art. 27-ter" > "Art. 27ter") e titolo pulito (senza "(( ))").
 * - Elimina l'altra versione.
 *
 * Uso: npx tsx scripts/corpus-cleanup-duplicates.ts
 *      npx tsx scripts/corpus-cleanup-duplicates.ts --dry-run   (solo preview)
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const DRY_RUN = process.argv.includes("--dry-run");

// ── Normalization (same as quality-check) ────────────────────────────────────

function normalize(ref: string): string {
  return ref
    .toLowerCase()
    .replace(/^(art(?:icolo)?\.?\s*)/i, "")
    .replace(/\s*-\s*/g, "")
    .replace(/\s+/g, "")
    .replace(/\.$/g, "")
    .trim();
}

// ── Scoring — higher is better ───────────────────────────────────────────────

function scoreArticle(art: {
  article_reference: string;
  article_title: string | null;
  article_text: string | null;
}): number {
  let score = 0;

  // Prefer hyphenated suffix: "27-ter" > "27ter"
  if (/\d+-[a-z]/i.test(art.article_reference)) score += 10;

  // Prefer clean title (no "((" markup from Normattiva))
  const title = art.article_title || "";
  if (title && !title.includes("((")) score += 5;

  // Prefer longer content (more complete)
  const contentLen = (art.article_text || "").length;
  score += Math.min(contentLen / 1000, 5); // up to 5 points

  // Prefer title present
  if (title.trim().length > 0) score += 2;

  return score;
}

// ── Main ─────────────────────────────────────────────────────────────────────

interface ArticleRow {
  id: string;
  source_id: string;
  law_source: string;
  article_number: string;
  article_reference: string;
  article_title: string | null;
  article_text: string | null;
}

async function fetchAllArticles(): Promise<ArticleRow[]> {
  const all: ArticleRow[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("legal_articles")
      .select("id, source_id, law_source, article_number, article_reference, article_title, article_text")
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Errore query:", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...(data as ArticleRow[]));
    offset += data.length;
    if (data.length < pageSize) break;
  }

  return all;
}

async function main() {
  console.log(`Corpus Cleanup — Rimozione duplicati${DRY_RUN ? " (DRY RUN)" : ""}\n`);

  const articles = await fetchAllArticles();
  console.log(`Totale articoli nel corpus: ${articles.length}\n`);

  // Group by source_id + normalized reference
  const groups = new Map<string, ArticleRow[]>();
  for (const art of articles) {
    const normRef = normalize(art.article_reference || art.article_number || "");
    const key = `${art.source_id}::${normRef}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(art);
  }

  const toDelete: string[] = [];

  for (const [key, group] of groups) {
    if (group.length <= 1) continue;

    // Score each article — keep the best, delete the rest
    const scored = group
      .map(art => ({ art, score: scoreArticle(art) }))
      .sort((a, b) => b.score - a.score);

    const keeper = scored[0];
    const losers = scored.slice(1);

    console.log(`  ${key.split("::")[0]} — "${scored[0].art.article_reference}" (score ${keeper.score}) KEEP`);
    for (const loser of losers) {
      console.log(`    ❌ "${loser.art.article_reference}" (score ${loser.score}) → DELETE ${loser.art.id.slice(0, 8)}…`);
      toDelete.push(loser.art.id);
    }
    console.log();
  }

  if (toDelete.length === 0) {
    console.log("Nessun duplicato da eliminare.");
    return;
  }

  console.log(`\nTotale da eliminare: ${toDelete.length} articoli\n`);

  if (DRY_RUN) {
    console.log("DRY RUN — nessuna modifica applicata. Rimuovi --dry-run per eseguire.");
    return;
  }

  // Delete in batches of 50
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 50) {
    const batch = toDelete.slice(i, i + 50);
    const { error, count } = await supabase
      .from("legal_articles")
      .delete()
      .in("id", batch);

    if (error) {
      console.error(`Errore batch ${i}-${i + batch.length}:`, error.message);
    } else {
      deleted += count || batch.length;
      console.log(`  Eliminati batch ${i + 1}-${i + batch.length}: OK`);
    }
  }

  console.log(`\n✅ Cleanup completato: ${deleted} articoli eliminati.`);
  console.log(`Articoli rimanenti: ${articles.length - deleted}`);
}

main().catch(console.error);
