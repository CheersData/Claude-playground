/**
 * seed-knowledge-vendita-misura-corpo.ts
 *
 * Seeds legal knowledge entries that explain the critical distinction
 * between Art. 1537 c.c. (vendita a misura) and Art. 1538 c.c. (vendita a corpo).
 *
 * These entries provide the interpretive framework that agents need to
 * correctly explain how the "ventesimo" (5%) threshold works DIFFERENTLY
 * in the two regimes. Without this, agents conflate the two mechanisms.
 *
 * Run: npx tsx scripts/seed-knowledge-vendita-misura-corpo.ts
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
  // ─── Entry 1: Framework interpretativo 1537 vs 1538 ───
  {
    category: "law_reference",
    title: "Distinzione Art. 1537/1538 c.c. — Vendita a misura vs vendita a corpo: il ventesimo opera diversamente",
    content: [
      "DISTINZIONE CRITICA tra Art. 1537 c.c. (vendita a misura) e Art. 1538 c.c. (vendita a corpo).",
      "",
      "Art. 1537 — VENDITA A MISURA: il prezzo è determinato in ragione di un tanto per unità di misura.",
      "- QUALSIASI differenza di misura (anche dell'1%) dà diritto all'adeguamento proporzionale del prezzo.",
      "- Il ventesimo (5%) NON è la soglia sotto la quale non succede nulla — è la soglia oltre la quale scatta il DIRITTO DI RECESSO del compratore.",
      "- Sotto il 5%: il prezzo viene comunque rettificato proporzionalmente (aumento o diminuzione).",
      "- Oltre il 5%: oltre alla rettifica del prezzo, il compratore può RECEDERE dal contratto.",
      "",
      "Art. 1538 — VENDITA A CORPO: il prezzo è determinato per l'immobile nel suo complesso.",
      "- Sotto il ventesimo (5%): NESSUN rimedio. Il compratore non ha diritto a nulla.",
      "- Oltre il ventesimo (5%): si fa luogo a diminuzione o supplemento di prezzo.",
      "- Il recesso è possibile SOLO se l'eccedenza supera il ventesimo E il compratore non avrebbe acquistato.",
      "",
      "ERRORE COMUNE DA EVITARE: dire che 'la tolleranza del 5% è comune a entrambi i tipi di vendita' è sbagliato.",
      "I due meccanismi sono opposti: nella vendita a misura il 5% è la soglia per il recesso (sotto c'è comunque rettifica prezzo);",
      "nella vendita a corpo il 5% è la soglia sotto la quale non c'è alcun rimedio.",
      "",
      "DOMANDA CHIAVE DA PORRE SEMPRE: prima di pronunciarsi sulla regolarità di una clausola di tolleranza,",
      "è indispensabile verificare se il contratto configura una vendita a misura o a corpo.",
      "La risposta cambia radicalmente: nella vendita a misura, anche una tolleranza del 2% non impedisce la rettifica del prezzo;",
      "nella vendita a corpo, una tolleranza del 4% significa che il compratore non ha alcun rimedio.",
    ].join("\n"),
    metadata: {
      references: ["Art. 1537 c.c.", "Art. 1538 c.c."],
      keywords: [
        "vendita a misura",
        "vendita a corpo",
        "ventesimo",
        "tolleranza superfici",
        "rettifica prezzo",
        "recesso compratore",
        "compravendita immobiliare",
      ],
      seededAt: new Date().toISOString(),
      seededBy: "seed-knowledge-vendita-misura-corpo",
    },
  },

  // ─── Entry 2: Pattern clausola tolleranza immobiliare ───
  {
    category: "clause_pattern",
    title: "Clausola tolleranza superfici — Compravendita immobiliare",
    content: [
      "PATTERN: clausola contrattuale che prevede una tolleranza percentuale sulle superfici dell'immobile.",
      "",
      "ANALISI CORRETTA richiede due passaggi:",
      "",
      "1. QUALIFICAZIONE DEL CONTRATTO: determinare se si tratta di vendita a misura (Art. 1537 c.c.) o vendita a corpo (Art. 1538 c.c.).",
      "   - Vendita a misura: il prezzo è espresso come 'tot euro al mq' (es. €3.000/mq × 85 mq = €255.000).",
      "   - Vendita a corpo: il prezzo è espresso come cifra globale per l'immobile (es. €255.000 per l'appartamento).",
      "   - In caso di dubbio, la giurisprudenza tende a qualificare come vendita a corpo (Cass. 24506/2017).",
      "",
      "2. CONSEGUENZE DELLA TOLLERANZA:",
      "   - Se vendita a CORPO + tolleranza ≤5%: clausola lecita, il compratore non ha rimedi per differenze sotto la soglia.",
      "   - Se vendita a MISURA + tolleranza ≤5%: clausola POTENZIALMENTE PROBLEMATICA perché l'Art. 1537 prevede",
      "     rettifica del prezzo per QUALSIASI differenza. Una clausola che elimina questo diritto sotto il 5%",
      "     potrebbe essere considerata vessatoria (Art. 1341 c.c.) o limitativa dei diritti del consumatore (Art. 33 Codice del Consumo).",
      "",
      "IMPLICAZIONE PRATICA: la differenza tra i due regimi può valere migliaia di euro.",
      "Su un immobile da €300.000, una differenza del 3% (9 mq su 300 mq) equivale a €9.000.",
      "Nella vendita a misura: il compratore ha diritto alla rettifica (€9.000 in meno).",
      "Nella vendita a corpo: il compratore non ha alcun rimedio.",
      "",
      "RISPOSTA CORRETTA: non confermare mai la regolarità di una clausola di tolleranza",
      "senza prima chiarire se il contratto è a misura o a corpo.",
    ].join("\n"),
    metadata: {
      references: ["Art. 1537 c.c.", "Art. 1538 c.c.", "Art. 1341 c.c.", "Art. 33 Codice del Consumo"],
      keywords: [
        "tolleranza superfici",
        "clausola tolleranza",
        "vendita immobiliare",
        "differenza misure",
        "compravendita appartamento",
        "tolleranza 5%",
        "ventesimo superficie",
      ],
      documentType: "contratto_vendita",
      riskLevel: "medium",
      seededAt: new Date().toISOString(),
      seededBy: "seed-knowledge-vendita-misura-corpo",
    },
  },

  // ─── Entry 3: Art. 2645-bis c.5 — contesto corretto ───
  {
    category: "law_reference",
    title: "Art. 2645-bis comma 5 c.c. — Tolleranza ventesimo nei contratti preliminari: ambito limitato",
    content: [
      "Art. 2645-bis, comma 5, c.c.: 'l'eventuale differenza di superficie o di quota contenuta",
      "nei limiti di un ventesimo rispetto a quelle indicate nel contratto preliminare non produce effetti'.",
      "",
      "AMBITO DI APPLICAZIONE: questa norma riguarda ESCLUSIVAMENTE gli effetti della trascrizione",
      "del contratto preliminare. Non modifica il regime della vendita a misura o a corpo.",
      "",
      "ERRORE COMUNE: citare l'Art. 2645-bis c.5 come se stabilisse una tolleranza generale del 5%",
      "applicabile a tutti i contratti di compravendita immobiliare. In realtà, la norma dice solo che",
      "una differenza entro il 5% non invalida la TRASCRIZIONE del preliminare ai fini dell'opponibilità ai terzi.",
      "",
      "Non incide su: diritto a rettifica prezzo (Art. 1537), rimedi nella vendita a corpo (Art. 1538),",
      "garanzia per vizi (Art. 1490), aliud pro alio.",
    ].join("\n"),
    metadata: {
      references: ["Art. 2645-bis c.c.", "Art. 1537 c.c.", "Art. 1538 c.c."],
      keywords: [
        "contratto preliminare",
        "trascrizione",
        "tolleranza ventesimo",
        "opponibilità",
        "vendita su carta",
        "edificio da costruire",
      ],
      seededAt: new Date().toISOString(),
      seededBy: "seed-knowledge-vendita-misura-corpo",
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

  console.log("=== seed-knowledge-vendita-misura-corpo ===");
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
