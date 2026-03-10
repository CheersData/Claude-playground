/**
 * seed-knowledge-tc48-registrazione.ts
 *
 * Seeds a legal knowledge entry that explains the critical distinction
 * between recording a conversation as a PARTICIPANT (lawful) vs as a
 * THIRD PARTY (crime under Art. 617 c.p.).
 *
 * This entry fixes TC48 (secret recording test case) by providing agents
 * with the correct legal framework: a participant who records their own
 * conversation is NOT committing interception (intercettazione).
 *
 * Run: npx tsx scripts/seed-knowledge-tc48-registrazione.ts
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
    title: "Art. 617 c.p. — Registrazione conversazione: partecipante vs terzo",
    content: [
      "DISTINZIONE FONDAMENTALE: registrare una conversazione a cui si PARTECIPA è LECITO.",
      "Registrare una conversazione altrui a cui NON si partecipa è REATO (Art. 617 c.p.).",
      "",
      "=== PARTECIPANTE CHE REGISTRA (LECITO) ===",
      "",
      "Se una persona è PARTECIPANTE alla conversazione (interlocutore diretto, destinatario",
      "della comunicazione), registrarla — anche di nascosto — NON costituisce intercettazione",
      "(intercettazione) e NON è reato. Il motivo giuridico è preciso: l'Art. 617 c.p. punisce",
      "chi prende cognizione di comunicazioni 'a lui non dirette'. Ma se sei tu il destinatario",
      "o uno degli interlocutori, la comunicazione È diretta a te — quindi il divieto non si applica.",
      "",
      "Questo principio è consolidato nella giurisprudenza della Corte di Cassazione:",
      "- La registrazione fonografica di un colloquio da parte di chi vi partecipa non è",
      "  intercettazione, perché manca il requisito della terzietà (Cass. pen. Sez. Un. 36747/2003).",
      "- La registrazione di una conversazione tra presenti, effettuata da uno dei partecipanti,",
      "  è lecita e non richiede autorizzazione del magistrato.",
      "- Il partecipante che registra esercita una facoltà legittima: fissare su supporto",
      "  quanto gli viene comunicato direttamente.",
      "",
      "=== TERZO CHE REGISTRA (REATO — ART. 617 c.p.) ===",
      "",
      "Se una persona NON partecipa alla conversazione e la registra di nascosto,",
      "commette il reato di cognizione illecita di comunicazioni o conversazioni",
      "(Art. 617 c.p.), punito con la reclusione da 6 mesi a 4 anni.",
      "L'Art. 617-bis c.p. punisce anche l'installazione di apparecchiature atte a",
      "intercettare comunicazioni altrui.",
      "",
      "Il requisito essenziale è la TERZIETÀ: il soggetto che registra deve essere",
      "estraneo alla comunicazione, cioè la comunicazione non deve essere 'a lui diretta'.",
      "",
      "=== UTILIZZABILITÀ COME PROVA ===",
      "",
      "La registrazione effettuata dal PARTECIPANTE è utilizzabile come prova:",
      "- In sede PENALE: è una prova documentale ai sensi dell'Art. 234 c.p.p.",
      "  (documenti), non un'intercettazione (che richiederebbe autorizzazione ex Art. 267 c.p.p.).",
      "- In sede CIVILE: costituisce una riproduzione meccanica ex Art. 2712 c.c.,",
      "  che fa piena prova se non espressamente disconosciuta dalla controparte.",
      "- La Cassazione civile ha ripetutamente confermato l'utilizzabilità delle",
      "  registrazioni effettuate da un partecipante alla conversazione.",
      "",
      "=== LIMITI: PRIVACY E GDPR ===",
      "",
      "La normativa sulla privacy (GDPR, D.Lgs. 196/2003) può limitare l'USO e la",
      "DIFFUSIONE della registrazione (ad esempio pubblicarla sui social o condividerla",
      "con terzi senza motivo legittimo), ma NON rende illegale l'ATTO di registrare",
      "una conversazione a cui si partecipa.",
      "L'uso per fini di tutela di un diritto in giudizio è generalmente considerato",
      "legittimo ai sensi dell'Art. 6(1)(f) GDPR (legittimo interesse) o dell'Art. 9(2)(f)",
      "GDPR (difesa di un diritto in sede giudiziaria).",
      "",
      "=== ERRORE COMUNE DA EVITARE ===",
      "",
      "Dire che 'registrare di nascosto una conversazione è sempre reato' o che",
      "'serve il consenso dell'altra parte per registrare' è SBAGLIATO.",
      "La distinzione corretta è: PARTECIPANTE = lecito, TERZO = reato.",
      "Non serve alcun consenso per registrare una conversazione a cui si partecipa.",
    ].join("\n"),
    metadata: {
      references: [
        "Art. 617 c.p.",
        "Art. 617-bis c.p.",
        "Art. 234 c.p.p.",
        "Art. 267 c.p.p.",
        "Art. 2712 c.c.",
        "Art. 6 GDPR",
        "Art. 9 GDPR",
        "D.Lgs. 196/2003",
        "Cass. pen. Sez. Un. 36747/2003",
      ],
      keywords: [
        "registrazione",
        "registrazione nascosta",
        "registrazione segreta",
        "registrazione conversazione",
        "partecipante",
        "terzo",
        "intercettazione",
        "Art. 617 c.p.",
        "cognizione illecita",
        "prova",
        "prova documentale",
        "riproduzione meccanica",
        "privacy",
        "GDPR",
        "consenso",
        "lecita",
        "reato",
      ],
      testCase: "TC48",
      seededAt: new Date().toISOString(),
      seededBy: "seed-knowledge-tc48-registrazione",
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

  console.log("=== seed-knowledge-tc48-registrazione ===");
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
