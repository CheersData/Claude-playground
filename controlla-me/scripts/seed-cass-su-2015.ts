/**
 * seed-cass-su-2015.ts
 *
 * Seeds a single legal knowledge entry for Cass. SU 18213/2015
 * (Causa in concreto del contratto) into the legal_knowledge table.
 *
 * Run: npx tsx scripts/seed-cass-su-2015.ts
 */

import dotenv from "dotenv";
import path from "path";

// Load .env.local before anything else
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY!;

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-law-2";

// ─── Entry to seed ────────────────────────────────────────────────────────────

const entry = {
  // "jurisprudence" maps to the closest legal_knowledge category: "court_case"
  category: "court_case" as const,
  title: "Cass. SU 18213/2015 — Causa in concreto del contratto",
  content:
    "Le Sezioni Unite (Cass. 18213/2015) hanno stabilito che la causa del contratto va intesa in senso concreto, come sintesi degli interessi che il singolo contratto è diretto a realizzare (causa in concreto), e non in senso astratto come tipo legale. La nullità per mancanza di causa colpisce il contratto quando la causa concreta è illecita o assente. Rilevante per: valutazione clausole, nullità per mancanza di causa, distinzione tra causa tipica e causa concreta.",
  keywords: [
    "causa in concreto",
    "nullità contratto",
    "Cassazione Sezioni Unite",
    "causa del contratto",
    "contratto nullo",
  ],
  sourceUrl: "https://www.italgiure.giustizia.it/sncass/",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(VOYAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: [text],
      input_type: "document",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Voyage API error (${response.status}): ${errorText}`);
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[]; index: number }>;
    usage: { total_tokens: number };
  };

  console.log(`[EMBEDDINGS] OK — ${data.usage.total_tokens} tokens`);
  return data.data[0].embedding;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Validate env vars
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  }
  if (!VOYAGE_API_KEY) {
    throw new Error("Missing VOYAGE_API_KEY in .env.local");
  }

  console.log("=== seed-cass-su-2015 ===");
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Category: ${entry.category}`);
  console.log(`Title: ${entry.title}`);

  // 1. Generate embedding
  console.log("\n[1] Generating embedding via Voyage AI (voyage-law-2)...");
  const embeddingText = `${entry.title}\n${entry.content}`;
  const embedding = await generateEmbedding(embeddingText);
  console.log(`    Embedding dimensions: ${embedding.length}`);

  // 2. Build metadata
  const metadata = {
    keywords: entry.keywords,
    sourceUrl: entry.sourceUrl,
    court: "Cassazione Civile Sezioni Unite",
    reference: "Cass. SU 18213/2015",
    date: "2015",
    seededAt: new Date().toISOString(),
  };

  // 3. Upsert via RPC
  console.log("\n[2] Calling upsert_legal_knowledge RPC...");
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await admin.rpc("upsert_legal_knowledge", {
    p_category: entry.category,
    p_title: entry.title,
    p_content: entry.content,
    p_metadata: metadata,
    p_embedding: JSON.stringify(embedding),
    p_source_analysis_id: null,
  });

  if (error) {
    console.error("\n[ERROR] upsert_legal_knowledge failed:");
    console.error(error);
    process.exit(1);
  }

  console.log(`\n[OK] Entry upserted successfully.`);
  console.log(`     UUID: ${data}`);
  console.log(`     Category: ${entry.category}`);
  console.log(`     Title: ${entry.title}`);

  // 4. Verify by reading back the record
  console.log("\n[3] Verifying record in DB...");
  const { data: row, error: readErr } = await admin
    .from("legal_knowledge")
    .select("id, category, title, times_seen, created_at, updated_at")
    .eq("id", data as string)
    .single();

  if (readErr || !row) {
    console.warn(`    Could not read back record: ${readErr?.message}`);
  } else {
    console.log("    Record verified:");
    console.log(`      id:         ${(row as Record<string, unknown>).id}`);
    console.log(`      category:   ${(row as Record<string, unknown>).category}`);
    console.log(`      title:      ${(row as Record<string, unknown>).title}`);
    console.log(`      times_seen: ${(row as Record<string, unknown>).times_seen}`);
    console.log(`      created_at: ${(row as Record<string, unknown>).created_at}`);
  }

  console.log("\n=== Done ===");
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
