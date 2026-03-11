#!/usr/bin/env npx tsx
/**
 * Corpus Quality Check — trova duplicati per nomenclatura diversa.
 *
 * Cerca articoli che appaiono separati perché il numero è scritto in formati diversi:
 *   - "Art. 1537" vs "art. 1537" vs "art 1537"
 *   - "1-bis" vs "1 bis" vs "1bis"
 *   - "Art. 34-bis" vs "Art. 34bis"
 *
 * Uso: npx tsx scripts/corpus-quality-check.ts
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

// ── Normalization ──────────────────────────────────────────────────────────

/** Normalize article reference to a canonical form for dedup comparison */
function normalize(ref: string): string {
  return ref
    .toLowerCase()
    .replace(/^(art(?:icolo)?\.?\s*)/i, "")   // Remove "Art.", "art.", "Articolo ", etc.
    .replace(/\s*-\s*/g, "")                    // "1 - bis" → "1bis"
    .replace(/\s+/g, "")                        // "1 bis" → "1bis"
    .replace(/\.$/g, "")                        // Trailing dot
    .trim();
}

// ── Main ───────────────────────────────────────────────────────────────────

interface ArticleRow {
  id: string;
  source_id: string;
  law_source: string;
  article_number: string;
  article_reference: string;
  article_title: string | null;
}

async function fetchAllArticles(): Promise<ArticleRow[]> {
  const all: ArticleRow[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("legal_articles")
      .select("id, source_id, law_source, article_number, article_reference, article_title")
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
  console.log("Corpus Quality Check — Ricerca duplicati per nomenclatura\n");

  const articles = await fetchAllArticles();
  console.log(`Totale articoli nel corpus: ${articles.length}\n`);

  // ── Check 1: Duplicati per article_reference normalizzato ──────────────

  console.log("═══ CHECK 1: Duplicati per reference normalizzato ═══");
  console.log("(Articoli della stessa fonte con reference che si normalizzano allo stesso valore)\n");

  // Group by source_id + normalized reference
  const groups = new Map<string, ArticleRow[]>();
  for (const art of articles) {
    const normRef = normalize(art.article_reference || art.article_number || "");
    const key = `${art.source_id}::${normRef}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(art);
  }

  let dupCount = 0;
  for (const [key, group] of groups) {
    if (group.length > 1) {
      dupCount++;
      const [sourceId] = key.split("::");
      console.log(`  ⚠️  ${sourceId} — ${group.length} varianti:`);
      for (const art of group) {
        console.log(`      ID: ${art.id.slice(0, 8)}… | ref: "${art.article_reference}" | num: "${art.article_number}" | title: "${art.article_title || "(none)"}"`);
      }
      console.log();
    }
  }
  if (dupCount === 0) {
    console.log("  ✅ Nessun duplicato trovato per reference normalizzato.\n");
  } else {
    console.log(`  Totale gruppi duplicati: ${dupCount}\n`);
  }

  // ── Check 2: article_reference vs article_number consistency ───────────

  console.log("═══ CHECK 2: Inconsistenze article_reference vs article_number ═══");
  console.log("(Articoli dove article_reference non contiene article_number)\n");

  let inconsistentCount = 0;
  for (const art of articles) {
    if (!art.article_reference || !art.article_number) continue;
    // article_reference should be "Art. {article_number}" or similar
    const refNorm = normalize(art.article_reference);
    const numNorm = normalize(art.article_number);
    if (refNorm !== numNorm && !refNorm.includes(numNorm) && !numNorm.includes(refNorm)) {
      if (inconsistentCount < 20) {
        console.log(`  ⚠️  ${art.source_id} | ref: "${art.article_reference}" → norm: "${refNorm}" | num: "${art.article_number}" → norm: "${numNorm}"`);
      }
      inconsistentCount++;
    }
  }
  if (inconsistentCount === 0) {
    console.log("  ✅ Tutte le reference sono consistenti con article_number.\n");
  } else {
    console.log(`  ${inconsistentCount > 20 ? `  ... e ${inconsistentCount - 20} altri\n` : ""}  Totale inconsistenze: ${inconsistentCount}\n`);
  }

  // ── Check 3: Display format issues (double "Art. Art.") ────────────────

  console.log("═══ CHECK 3: Format \"Art. Art.\" (doppio prefisso) ═══");
  console.log("(article_reference che inizia con \"Art.\" E article_number che inizia con \"Art.\")\n");

  let doubleArtCount = 0;
  for (const art of articles) {
    const hasRefPrefix = /^art/i.test(art.article_reference || "");
    const hasNumPrefix = /^art/i.test(art.article_number || "");
    if (hasRefPrefix && hasNumPrefix) {
      if (doubleArtCount < 10) {
        console.log(`  ⚠️  ${art.source_id} | ref: "${art.article_reference}" | num: "${art.article_number}"`);
      }
      doubleArtCount++;
    }
  }
  if (doubleArtCount === 0) {
    console.log("  ✅ Nessun doppio prefisso \"Art.\" trovato.\n");
  } else {
    console.log(`  ${doubleArtCount > 10 ? `  ... e ${doubleArtCount - 10} altri\n` : ""}  Totale: ${doubleArtCount} articoli con doppio prefisso\n`);
  }

  // ── Check 4: Empty/null fields ─────────────────────────────────────────

  console.log("═══ CHECK 4: Campi vuoti o null ═══\n");

  const emptyRef = articles.filter(a => !a.article_reference || a.article_reference.trim() === "");
  const emptyNum = articles.filter(a => !a.article_number || a.article_number.trim() === "");
  const emptySource = articles.filter(a => !a.source_id || a.source_id.trim() === "");

  console.log(`  article_reference vuoto: ${emptyRef.length}`);
  console.log(`  article_number vuoto:    ${emptyNum.length}`);
  console.log(`  source_id vuoto:         ${emptySource.length}`);

  if (emptyRef.length > 0) {
    console.log(`\n  Campione article_reference vuoto:`);
    for (const a of emptyRef.slice(0, 5)) {
      console.log(`    ID: ${a.id.slice(0, 8)}… | source: ${a.source_id} | num: "${a.article_number}"`);
    }
  }

  // ── Check 5: Suffix normalization issues ───────────────────────────────

  console.log("\n═══ CHECK 5: Suffissi (bis/ter/quater) con formati diversi ═══\n");

  const suffixPattern = /\b(bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)\b/i;
  const suffixGroups = new Map<string, ArticleRow[]>();

  for (const art of articles) {
    const ref = art.article_reference || art.article_number || "";
    if (suffixPattern.test(ref)) {
      const normKey = `${art.source_id}::${normalize(ref)}`;
      if (!suffixGroups.has(normKey)) suffixGroups.set(normKey, []);
      suffixGroups.get(normKey)!.push(art);
    }
  }

  let suffixDupCount = 0;
  for (const [, group] of suffixGroups) {
    if (group.length > 1) {
      // Check if the raw references actually differ
      const uniqueRefs = new Set(group.map(a => a.article_reference));
      if (uniqueRefs.size > 1) {
        suffixDupCount++;
        const first = group[0];
        console.log(`  ⚠️  ${first.source_id}:`);
        for (const art of group) {
          console.log(`      ref: "${art.article_reference}" | num: "${art.article_number}"`);
        }
      }
    }
  }
  if (suffixDupCount === 0) {
    console.log("  ✅ Nessun duplicato da suffissi con formati diversi.\n");
  } else {
    console.log(`\n  Totale: ${suffixDupCount} gruppi\n`);
  }

  // ── Summary ────────────────────────────────────────────────────────────

  console.log("═══ RIEPILOGO ═══");
  console.log(`  Articoli totali:          ${articles.length}`);
  console.log(`  Duplicati (reference):    ${dupCount} gruppi`);
  console.log(`  Inconsistenze ref/num:    ${inconsistentCount}`);
  console.log(`  Doppio prefisso Art.:     ${doubleArtCount}`);
  console.log(`  Reference vuoto:          ${emptyRef.length}`);
  console.log(`  Suffissi duplicati:       ${suffixDupCount} gruppi`);
}

main().catch(console.error);
