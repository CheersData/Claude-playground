/**
 * seed-knowledge-tc27-pignoramento.ts
 *
 * Seeds a legal knowledge entry that explains the critical distinction
 * between first-home seizure protection by the Tax Agency (Art. 76 DPR 602/73)
 * vs ZERO protection against private creditors.
 *
 * This entry fixes TC27 (pignoramento prima casa test case) by providing agents
 * with the correct legal framework: the "prima casa" protection applies ONLY
 * to Agenzia Entrate-Riscossione, NOT to private creditors (banks, suppliers, etc.).
 *
 * Run: npx tsx scripts/seed-knowledge-tc27-pignoramento.ts
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
    title: "Art. 76 DPR 602/73 — Pignoramento prima casa: Agenzia Entrate vs creditori privati",
    content: [
      "TRAPPOLA COMUNE: Molti credono che la 'prima casa' sia impignorabile in assoluto. È FALSO.",
      "La protezione della prima casa dal pignoramento ha un ambito di applicazione MOLTO RISTRETTO",
      "e vale SOLO nei confronti dell'Agenzia delle Entrate-Riscossione (ex Equitalia).",
      "",
      "=== ART. 76 DPR 602/73 — PIGNORAMENTO DA PARTE DEL FISCO ===",
      "",
      "L'Art. 76, comma 1, lett. a) del DPR 602/1973 (come modificato dal D.L. 69/2013,",
      "convertito in L. 98/2013) stabilisce che l'agente della riscossione NON può procedere",
      "all'espropriazione dell'unico immobile di proprietà del debitore, a condizione che:",
      "",
      "1. Sia l'UNICO immobile di proprietà del debitore;",
      "2. Sia adibito ad uso abitativo e il debitore vi abbia la RESIDENZA ANAGRAFICA;",
      "3. NON sia un immobile di lusso, cioè non appartenga alle categorie catastali A/8",
      "   (ville) o A/9 (castelli, palazzi di pregio storico/artistico).",
      "",
      "Se TUTTE e tre le condizioni sono soddisfatte, l'Agenzia delle Entrate-Riscossione",
      "non può procedere al pignoramento immobiliare. Può comunque iscrivere IPOTECA",
      "(Art. 77 DPR 602/73) se il debito supera 20.000 euro.",
      "",
      "ATTENZIONE: se il debitore possiede anche solo un SECONDO immobile (garage, cantina,",
      "terreno, quota di altro immobile), la protezione decade e il Fisco può pignorare",
      "anche la prima casa.",
      "",
      "=== CREDITORI PRIVATI — NESSUN LIMITE AL PIGNORAMENTO ===",
      "",
      "I creditori PRIVATI (banche, finanziarie, fornitori, privati cittadini, condominio,",
      "qualsiasi soggetto diverso dall'agente della riscossione) NON sono soggetti ad alcun",
      "divieto di pignoramento della prima casa.",
      "",
      "Un creditore privato munito di titolo esecutivo (sentenza, decreto ingiuntivo,",
      "cambiale, assegno protestato, atto notarile) può pignorare QUALSIASI immobile del",
      "debitore, inclusa la prima casa, l'unica casa, la casa di residenza — senza alcuna",
      "delle limitazioni previste dall'Art. 76 DPR 602/73.",
      "",
      "L'Art. 76 DPR 602/73 è una norma SPECIALE che si applica ESCLUSIVAMENTE all'agente",
      "della riscossione. NON è una norma di diritto civile generale. I creditori ordinari",
      "seguono le norme del codice di procedura civile (artt. 555 e ss. c.p.c.) che NON",
      "prevedono alcuna immunità per la 'prima casa'.",
      "",
      "=== PROCEDURA DI PIGNORAMENTO IMMOBILIARE (CREDITORI PRIVATI) ===",
      "",
      "Il pignoramento immobiliare da parte di creditori privati segue gli artt. 555 e ss. c.p.c.:",
      "",
      "1. Il creditore notifica l'atto di pignoramento al debitore (Art. 555 c.p.c.);",
      "2. L'atto viene trascritto nei registri immobiliari (Art. 555 c.p.c.);",
      "3. Il creditore deposita istanza di vendita entro 45 giorni (Art. 497 c.p.c.);",
      "4. Il giudice nomina un esperto per la stima e dispone la vendita all'asta;",
      "5. Dal ricavato si soddisfano i creditori secondo l'ordine dei privilegi.",
      "",
      "L'unico requisito è il credito minimo: per pignorare immobili il credito complessivo",
      "deve superare 120.000 euro OPPURE il credito deve essere ipotecario (Art. 555 c.p.c.,",
      "come modificato dalla riforma Cartabia).",
      "",
      "=== STRUMENTI DI PROTEZIONE PATRIMONIALE (LIMITI E CONDIZIONI) ===",
      "",
      "Esistono strumenti che possono offrire protezione parziale PREVENTIVA (cioè costituiti",
      "PRIMA del sorgere del debito):",
      "",
      "1. FONDO PATRIMONIALE (Art. 167 c.c.): beni destinati ai bisogni della famiglia.",
      "   I creditori NON possono aggredire i beni del fondo per debiti che il creditore",
      "   conosceva come estranei ai bisogni familiari. Ma: (a) deve essere costituito PRIMA",
      "   del debito; (b) è revocabile con azione revocatoria se fatto in frode ai creditori;",
      "   (c) NON protegge da debiti contratti per i bisogni della famiglia.",
      "",
      "2. TRUST e VINCOLI DI DESTINAZIONE (Art. 2645-ter c.c.): strumenti complessi che",
      "   possono segregare patrimonio, ma con limiti simili (anteriorità, buona fede,",
      "   azione revocatoria).",
      "",
      "3. PROPORZIONALITÀ: il pignoramento deve essere proporzionato al credito. Il giudice",
      "   può ridurre il pignoramento se manifestamente eccessivo rispetto al debito",
      "   (Art. 496 c.p.c.).",
      "",
      "=== ERRORE COMUNE DEGLI AGENTI AI ===",
      "",
      "Rispondere genericamente che 'il pignoramento della prima casa è soggetto a condizioni'",
      "o che 'la prima casa è protetta dal pignoramento' senza specificare che questa protezione",
      "vale SOLO per l'Agenzia delle Entrate-Riscossione è GRAVEMENTE FUORVIANTE.",
      "",
      "La risposta CORRETTA deve SEMPRE chiarire:",
      "- CHI è il creditore? Se è il Fisco → Art. 76 DPR 602/73 (protezione condizionata).",
      "- CHI è il creditore? Se è un privato → NESSUNA protezione. Può pignorare la prima casa.",
      "",
      "Non esiste nell'ordinamento italiano una norma generale che protegga la 'prima casa'",
      "dal pignoramento. L'unica protezione è quella fiscale, limitata all'agente della riscossione.",
    ].join("\n"),
    metadata: {
      references: [
        "Art. 76 DPR 602/73",
        "Art. 77 DPR 602/73",
        "Art. 555 c.p.c.",
        "Art. 492 c.p.c.",
        "Art. 496 c.p.c.",
        "Art. 497 c.p.c.",
        "Art. 167 c.c.",
        "Art. 2645-ter c.c.",
        "D.L. 69/2013",
        "L. 98/2013",
      ],
      keywords: [
        "pignoramento",
        "pignoramento immobiliare",
        "prima casa",
        "impignorabilità",
        "impignorabilità prima casa",
        "Agenzia Entrate",
        "Agenzia Entrate-Riscossione",
        "Equitalia",
        "creditore privato",
        "creditore ordinario",
        "Art. 76 DPR 602/73",
        "espropriazione immobiliare",
        "unico immobile",
        "residenza anagrafica",
        "fondo patrimoniale",
        "azione revocatoria",
        "vendita all'asta",
        "titolo esecutivo",
        "ipoteca",
        "esecuzione immobiliare",
      ],
      testCase: "TC27",
      seededAt: new Date().toISOString(),
      seededBy: "seed-knowledge-tc27-pignoramento",
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

  console.log("=== seed-knowledge-tc27-pignoramento ===");
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
