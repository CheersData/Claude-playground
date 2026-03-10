/**
 * seed-knowledge-tc59-valutarie.ts
 *
 * Seeds a legal knowledge entry that explains the rules governing
 * monetary obligations in foreign currency under the Italian Civil Code
 * (Artt. 1277-1279 c.c.).
 *
 * This entry fixes TC59 (payment in foreign currency test case) by providing
 * agents with the correct legal framework: the debtor's right to pay in legal
 * tender (Art. 1278) unless a "clausola effettivo" is present (Art. 1279).
 *
 * Run: npx tsx scripts/seed-knowledge-tc59-valutarie.ts
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
    title: "Artt. 1277-1279 c.c. — Obbligazioni pecuniarie in valuta estera: regola, facoltà e clausola effettivo",
    content: [
      "QUADRO NORMATIVO COMPLETO: le obbligazioni pecuniarie in valuta estera sono disciplinate",
      "dagli Artt. 1277, 1278 e 1279 del Codice Civile. Questi tre articoli vanno letti insieme",
      "perché ciascuno regola un aspetto diverso della questione.",
      "",
      "=== ART. 1277 c.c. — REGOLA GENERALE (DEBITI IN MONETA LEGALE) ===",
      "",
      "I debiti pecuniari si estinguono con moneta avente corso legale nello Stato al tempo",
      "del pagamento e per il suo valore nominale. In Italia la moneta legale è l'euro.",
      "Se il debito era espresso in una moneta che NON HA PIÙ corso legale (ad esempio la lira",
      "italiana dopo l'introduzione dell'euro), il pagamento si effettua in moneta legale (euro)",
      "ragguagliata per valore alla prima.",
      "",
      "ATTENZIONE: l'Art. 1277 NON si applica alle valute estere attualmente in circolazione",
      "(come dollari o sterline). Esso regola solo il caso della moneta che ha CESSATO di avere",
      "corso legale. Per le valute estere correnti, si applicano gli Artt. 1278 e 1279.",
      "",
      "=== ART. 1278 c.c. — FACOLTÀ DEL DEBITORE (VALUTA ESTERA CORRENTE) ===",
      "",
      "Questo è il punto chiave per i contratti con clausola in valuta estera.",
      "",
      "Se il debito è espresso in una moneta NON avente corso legale nello Stato (es. dollari",
      "USA, sterline inglesi, franchi svizzeri), il debitore ha la FACOLTÀ di pagare in moneta",
      "legale (euro), al corso del cambio nel giorno della scadenza e nel luogo stabilito per",
      "il pagamento.",
      "",
      "Conseguenze pratiche dell'Art. 1278:",
      "- Il debitore PUÒ SCEGLIERE di pagare in euro anche se il contratto indica dollari.",
      "- Il creditore DEVE ACCETTARE il pagamento in euro al tasso di cambio del giorno.",
      "- È una FACOLTÀ del debitore, non un obbligo: il debitore può anche scegliere di pagare",
      "  nella valuta estera indicata nel contratto.",
      "- Il tasso di cambio di riferimento è quello del giorno della SCADENZA, non della",
      "  stipula né del pagamento effettivo (se diverso dalla scadenza).",
      "- Il luogo rilevante per il cambio è quello stabilito per il pagamento.",
      "",
      "=== ART. 1279 c.c. — CLAUSOLA \"EFFETTIVO\" (ECCEZIONE) ===",
      "",
      "L'Art. 1279 introduce l'unica eccezione alla facoltà del debitore prevista dall'Art. 1278.",
      "",
      "Se nel contratto è inserita la clausola \"effettivo\" o una clausola equivalente (es.",
      "\"pagamento esclusivamente in dollari USA\", \"in valuta effettiva\", \"payment in USD only\"),",
      "la facoltà di pagare in moneta legale (euro) prevista dall'Art. 1278 NON si applica.",
      "",
      "Conseguenze pratiche dell'Art. 1279:",
      "- Il debitore DEVE pagare nella valuta estera specificata nel contratto.",
      "- Il creditore PUÒ RIFIUTARE il pagamento in euro.",
      "- La clausola deve essere espressa chiaramente, ma non richiede una formula sacramentale:",
      "  basta che risulti inequivocabilmente la volontà delle parti di escludere la facoltà",
      "  di pagamento in moneta legale.",
      "",
      "=== SINTESI PRATICA — CASISTICA ===",
      "",
      "CASO 1 — Contratto dice \"euro\":",
      "Il debitore deve pagare in euro. Non può imporre il pagamento in dollari o altra valuta.",
      "Si applica l'Art. 1277 (moneta legale).",
      "",
      "CASO 2 — Contratto dice \"dollari\" SENZA clausola effettivo:",
      "Il debitore può SCEGLIERE se pagare in dollari oppure in euro al tasso di cambio del",
      "giorno della scadenza (Art. 1278). Il creditore deve accettare entrambe le opzioni.",
      "",
      "CASO 3 — Contratto dice \"dollari\" CON clausola effettivo:",
      "Il debitore DEVE pagare in dollari. Non può liberarsi pagando in euro.",
      "Il creditore può legittimamente rifiutare euro (Art. 1279).",
      "",
      "=== ERRORE COMUNE DA EVITARE ===",
      "",
      "Confondere l'Art. 1277 con l'Art. 1278 è un errore frequente:",
      "- Art. 1277 c.c. parla di moneta che \"non ha più corso legale\" = è una norma TRANSITORIA",
      "  e STORICA, pensata per il passaggio da una moneta a un'altra (es. lira → euro).",
      "  Non riguarda le valute estere attualmente in circolazione.",
      "- Art. 1278 c.c. è la norma che regola le obbligazioni espresse in VALUTA ESTERA CORRENTE",
      "  (dollari, sterline, ecc.) e prevede la facoltà del debitore di pagare in euro.",
      "",
      "Altro errore: affermare che il creditore può pretendere il pagamento in euro quando il",
      "contratto prevede dollari. La facoltà dell'Art. 1278 spetta solo al DEBITORE, non al",
      "creditore. Il creditore che vuole euro deve negoziarlo contrattualmente.",
    ].join("\n"),
    metadata: {
      references: [
        "Art. 1277 c.c.",
        "Art. 1278 c.c.",
        "Art. 1279 c.c.",
      ],
      keywords: [
        "valuta estera",
        "obbligazione valutaria",
        "obbligazione pecuniaria",
        "corso del cambio",
        "clausola effettivo",
        "pagamento euro",
        "pagamento dollari",
        "moneta legale",
        "moneta avente corso legale",
        "facoltà del debitore",
        "tasso di cambio",
        "valuta straniera",
        "dollari",
        "sterline",
        "franchi svizzeri",
        "Art. 1277 c.c.",
        "Art. 1278 c.c.",
        "Art. 1279 c.c.",
      ],
      testCase: "TC59",
      seededAt: new Date().toISOString(),
      seededBy: "seed-knowledge-tc59-valutarie",
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

  console.log("=== seed-knowledge-tc59-valutarie ===");
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
