/**
 * seed-knowledge-tolleranze-edilizie.ts
 *
 * Seeds a legal knowledge entry explaining Art. 34-bis DPR 380/2001
 * (tolleranze costruttive) and how it interacts with the civil law
 * tolerance regime (Art. 1537/1538 c.c.) in real estate transactions.
 *
 * Run: npx tsx scripts/seed-knowledge-tolleranze-edilizie.ts
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

// ─── Knowledge entry ──────────────────────────────────────────────────────────

interface KnowledgeEntry {
  category: "law_reference" | "clause_pattern";
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

const entries: KnowledgeEntry[] = [
  {
    category: "law_reference",
    title: "Art. 34-bis DPR 380/2001 — Tolleranze costruttive ed edilizie: piano urbanistico vs piano civilistico",
    content: [
      "Art. 34-bis del Testo Unico Edilizia (DPR 380/2001) — Tolleranze costruttive.",
      "",
      "AMBITO: piano URBANISTICO/EDILIZIO. Questa norma stabilisce quali scostamenti",
      "rispetto al titolo abilitativo edilizio NON costituiscono violazione edilizia.",
      "È rilevante per la conformità urbanistica dell'immobile, non per il rapporto contrattuale tra le parti.",
      "",
      "SOGLIE (comma 1-bis, introdotto dal D.L. 69/2024 'Salva Casa'):",
      "Per interventi realizzati entro il 24 maggio 2024:",
      "- Superficie utile < 60 mq → tolleranza 6%",
      "- Superficie utile 60-100 mq → tolleranza 5%",
      "- Superficie utile 100-300 mq → tolleranza 4%",
      "- Superficie utile 300-500 mq → tolleranza 3%",
      "- Superficie utile > 500 mq → tolleranza 2%",
      "",
      "Comma 1 (regime ordinario, post-24/05/2024): tolleranza unica del 2% per tutti.",
      "",
      "DISTINZIONE CRITICA rispetto alle tolleranze CIVILISTICHE (Art. 1537/1538 c.c.):",
      "",
      "1. PIANO EDILIZIO (Art. 34-bis): riguarda il rapporto cittadino-pubblica amministrazione.",
      "   Determina se l'immobile è conforme al titolo edilizio. Una tolleranza del 5% su un appartamento",
      "   di 85 mq costruito nel 2023 significa che NON c'è abuso edilizio.",
      "",
      "2. PIANO CIVILISTICO (Art. 1537/1538 c.c.): riguarda il rapporto venditore-compratore.",
      "   Determina se il compratore ha diritto a rettifica prezzo o recesso.",
      "   La tolleranza edilizia NON elimina i diritti civili del compratore.",
      "",
      "ESEMPIO PRATICO: appartamento 85 mq, costruito 2023, differenza reale 3%.",
      "- Piano edilizio: OK, nessun abuso (sotto il 5% per immobili 60-100 mq ante 24/05/2024).",
      "- Piano civilistico (vendita a misura): il compratore ha COMUNQUE diritto alla rettifica del prezzo",
      "  per quel 3% (Art. 1537 c.c.), anche se non c'è abuso edilizio.",
      "- Piano civilistico (vendita a corpo): il compratore NON ha rimedi sotto il 5% (Art. 1538 c.c.).",
      "",
      "ERRORE COMUNE: confondere conformità edilizia con regolarità contrattuale.",
      "Il fatto che non ci sia abuso edilizio NON significa che la clausola contrattuale di tolleranza sia lecita.",
      "Sono due piani giuridici distinti con conseguenze diverse.",
      "",
      "RISPOSTA COMPLETA: quando la domanda menziona anno di costruzione e metratura,",
      "un'analisi completa deve coprire ENTRAMBI i piani (edilizio + civilistico),",
      "chiarendo che operano indipendentemente l'uno dall'altro.",
    ].join("\n"),
    metadata: {
      references: [
        "Art. 34-bis DPR 380/2001",
        "D.L. 69/2024 (Salva Casa)",
        "Art. 1537 c.c.",
        "Art. 1538 c.c.",
      ],
      keywords: [
        "tolleranze costruttive",
        "tolleranze edilizie",
        "abuso edilizio",
        "conformità urbanistica",
        "DPR 380/2001",
        "Salva Casa",
        "superficie immobile",
        "compravendita immobiliare",
        "tolleranza 5%",
        "costruito nel 2023",
      ],
      documentType: "contratto_vendita",
      seededAt: new Date().toISOString(),
      seededBy: "seed-knowledge-tolleranze-edilizie",
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

  console.log("=== seed-knowledge-tolleranze-edilizie ===");
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
