/**
 * seed-knowledge-tc70-testamento-data.ts
 *
 * Seeds a legal knowledge entry that explains the critical distinction
 * between NULLITY and ANNULLABILITY of a holographic will (testamento
 * olografo) when the date is incomplete or missing.
 *
 * This entry fixes TC70 (holographic will date test case) by providing
 * agents with the correct legal framework: an incomplete date causes
 * annullability (Art. 606 co.2 c.c.), NOT nullity (Art. 606 co.1 c.c.).
 * The will remains valid unless challenged within 5 years.
 *
 * Run: npx tsx scripts/seed-knowledge-tc70-testamento-data.ts
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY!;

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-law-2";

// ─── Knowledge entries ──────────────────────────────────────────────────────

interface KnowledgeEntry {
  category: "law_reference" | "clause_pattern";
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

const entries: KnowledgeEntry[] = [
  {
    category: "law_reference",
    title: "Art. 606 co.2 c.c. — Testamento olografo con data incompleta: annullabilità (non nullità)",
    content: [
      "DISTINZIONE FONDAMENTALE: un testamento olografo con data incompleta è ANNULLABILE, non NULLO.",
      "Annullabile ≠ Nullo: il testamento resta valido e produce effetti fino a eventuale impugnazione.",
      "",
      "=== ART. 602 c.c. — REQUISITI DI FORMA DEL TESTAMENTO OLOGRAFO ===",
      "",
      "Il testamento olografo deve essere scritto interamente, datato e sottoscritto di mano del testatore.",
      "La data deve indicare giorno, mese e anno. Questi sono i tre requisiti formali essenziali:",
      "1. Autografia: tutto il testo scritto di pugno dal testatore.",
      "2. Data: giorno, mese e anno di redazione.",
      "3. Sottoscrizione: firma del testatore.",
      "",
      "=== ART. 606 CO.1 c.c. — NULLITÀ (solo autografia e sottoscrizione) ===",
      "",
      "Il testamento è NULLO SOLO se manca l'autografia o la sottoscrizione.",
      "La nullità è il vizio più grave: è imprescrittibile, chiunque può eccepirla in qualsiasi momento,",
      "e il testamento non produce mai effetti giuridici validi.",
      "ATTENZIONE: la MANCANZA DI DATA non è causa di nullità. L'Art. 606 co.1 menziona",
      "espressamente solo l'autografia e la sottoscrizione come cause di nullità.",
      "",
      "=== ART. 606 CO.2 c.c. — ANNULLABILITÀ (ogni altro difetto di forma) ===",
      "",
      "Il testamento è ANNULLABILE per ogni altro difetto di forma, inclusa la data incompleta",
      "o mancante. L'annullabilità è un regime giuridico radicalmente diverso dalla nullità:",
      "- Il testamento PRODUCE EFFETTI fino a quando non viene annullato con sentenza.",
      "- Solo i soggetti interessati (eredi, legatari) possono agire per l'annullamento.",
      "- L'azione è soggetta a un termine di prescrizione (vedi sotto).",
      "- Se nessuno agisce, il testamento diventa definitivamente valido.",
      "",
      "=== TERMINE DI IMPUGNAZIONE: 5 ANNI (Art. 606 co.3 c.c.) ===",
      "",
      "L'azione di annullamento si prescrive in 5 ANNI dall'apertura della successione",
      "(cioè dalla morte del testatore). Se nessun interessato impugna il testamento entro",
      "questo termine, il testamento con data incompleta diventa DEFINITIVAMENTE VALIDO",
      "e inattaccabile per vizi di forma.",
      "",
      "=== CASSAZIONE SEZIONI UNITE 2015/15295 ===",
      "",
      "La Corte di Cassazione a Sezioni Unite (sentenza n. 15295/2015) ha confermato che",
      "la data incompleta nel testamento olografo produce ANNULLABILITÀ, non nullità.",
      "Le Sezioni Unite hanno chiarito definitivamente che l'art. 606 c.c. distingue due regimi:",
      "- Co.1: nullità per mancanza di autografia o sottoscrizione (tassativo).",
      "- Co.2: annullabilità per ogni altro difetto di forma (residuale, include la data).",
      "Questa pronuncia a Sezioni Unite ha risolto un precedente contrasto giurisprudenziale,",
      "stabilendo il principio di diritto vincolante.",
      "",
      "=== ERRORE COMUNE DA EVITARE ===",
      "",
      "Confondere 'annullabile' con 'nullo' è un errore giuridico grave.",
      "Un testamento olografo con data incompleta (es. solo anno, senza giorno e mese)",
      "NON è automaticamente invalido. NON è nullo. Produce pienamente i suoi effetti",
      "fino a eventuale impugnazione vittoriosa entro 5 anni dall'apertura della successione.",
      "Dire che un testamento con data incompleta 'non è valido' o 'è nullo' è SBAGLIATO.",
      "La qualificazione corretta è: ANNULLABILE, con termine di 5 anni.",
      "",
      "=== RILEVANZA PRATICA DELLA DATA ===",
      "",
      "La data nel testamento olografo serve a due scopi principali:",
      "1. Verificare la CAPACITÀ del testatore al momento della redazione",
      "   (es. se era già incapace di intendere e volere).",
      "2. Risolvere CONFLITTI tra testamenti successivi: l'ultimo testamento revoca",
      "   le disposizioni incompatibili del precedente (art. 682 c.c.).",
      "Se non c'è controversia su nessuno di questi due punti, la data incompleta è un",
      "difetto formale con poche o nessuna conseguenza pratica. Il testamento produce",
      "tutti i suoi effetti normalmente.",
    ].join("\n"),
    metadata: {
      references: [
        "Art. 602 c.c.",
        "Art. 606 c.c.",
        "Cass. SU 15295/2015",
      ],
      keywords: [
        "testamento olografo",
        "data incompleta",
        "data mancante",
        "annullabile",
        "annullabilità",
        "nullo",
        "nullità",
        "Art. 602 c.c.",
        "Art. 606 c.c.",
        "5 anni",
        "impugnazione",
        "Sezioni Unite",
        "sottoscrizione",
        "autografia",
        "apertura successione",
        "testamento",
        "forma testamento",
        "difetto di forma",
        "capacità testatore",
      ],
      testCase: "TC70",
      seededAt: new Date().toISOString(),
      seededBy: "seed-knowledge-tc70-testamento-data",
    },
  },
];

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

  const data = (await response.json()) as {
    data: Array<{ embedding: number[]; index: number }>;
    usage: { total_tokens: number };
  };

  console.log(`    [EMBEDDING] ${data.usage.total_tokens} tokens`);
  return data.data[0].embedding;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!VOYAGE_API_KEY) {
    throw new Error("Missing VOYAGE_API_KEY");
  }

  console.log("=== seed-knowledge-tc70-testamento-data ===");
  console.log(`Entries to seed: ${entries.length}`);
  console.log();

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    console.log(`[${i + 1}/${entries.length}] ${entry.category}: ${entry.title}`);

    // 1. Generate embedding
    const embeddingText = `${entry.title}\n${entry.content}`;
    const embedding = await generateEmbedding(embeddingText);
    console.log(`    Dimensions: ${embedding.length}`);

    // 2. Upsert via RPC
    const { data, error } = await admin.rpc("upsert_legal_knowledge", {
      p_category: entry.category,
      p_title: entry.title,
      p_content: entry.content,
      p_metadata: entry.metadata,
      p_embedding: JSON.stringify(embedding),
      p_source_analysis_id: null,
    });

    if (error) {
      console.error(`    [ERROR] ${error.message}`);
      continue;
    }

    console.log(`    [OK] UUID: ${data}`);

    // 3. Verify
    const { data: row } = await admin
      .from("legal_knowledge")
      .select("id, category, title, times_seen")
      .eq("id", data as string)
      .single();

    if (row) {
      const r = row as Record<string, unknown>;
      console.log(`    Verified: times_seen=${r.times_seen}`);
    }
    console.log();
  }

  console.log("=== Done ===");
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
