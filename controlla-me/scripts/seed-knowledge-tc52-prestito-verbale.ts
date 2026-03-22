/**
 * seed-knowledge-tc52-prestito-verbale.ts
 *
 * Seeds legal knowledge entries that explain the legal framework for
 * verbal loans (mutuo verbale / prestito tra privati senza contratto scritto).
 *
 * This entry fixes TC52 (prestito verbale test case) by providing agents
 * with the correct legal framework:
 * - Art. 1813-1822 c.c.: mutuo (contratto reale, forma libera)
 * - Art. 2721 c.c.: limite alla prova testimoniale per valore > EUR 2.58
 * - SMS/WhatsApp come prova documentale scritta
 *
 * The main retrieval issue: agents were finding Art. 2033-2041 (unjust enrichment)
 * instead of Art. 2721 (testimonial proof limits). This knowledge entry provides
 * the correct legal framework as a high-quality RAG anchor.
 *
 * Run: npx tsx scripts/seed-knowledge-tc52-prestito-verbale.ts
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { createClient } from "@supabase/supabase-js";

// --- Config ---

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY!;

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-law-2";

// --- Knowledge entries ---

interface KnowledgeEntry {
  category: "law_reference" | "clause_pattern";
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

const entries: KnowledgeEntry[] = [
  // --- Entry 1: Framework completo mutuo verbale + prova testimoniale ---
  {
    category: "law_reference",
    title: "Art. 1813 c.c. + Art. 2721 c.c. — Prestito verbale (mutuo): validita e limiti alla prova",
    content: [
      "QUESTIONE CHIAVE: un prestito di denaro fatto verbalmente (senza contratto scritto) e valido?",
      "SI, e valido. Ma il vero problema e DIMOSTRARLO in giudizio.",
      "",
      "=== IL MUTUO: ART. 1813-1822 c.c. ===",
      "",
      "Il mutuo (Art. 1813 c.c.) e il contratto con cui una parte consegna all'altra una",
      "quantita di denaro o di altre cose fungibili, e l'altra si obbliga a restituire",
      "altrettante cose della stessa specie e qualita.",
      "",
      "CARATTERISTICHE FONDAMENTALI:",
      "1. E un CONTRATTO REALE: si perfeziona con la CONSEGNA del denaro (Art. 1813 c.c.).",
      "   Non basta l'accordo verbale: il contratto nasce quando il denaro viene effettivamente",
      "   consegnato al mutuatario.",
      "2. E a FORMA LIBERA: nessuna forma scritta e richiesta per la validita del mutuo.",
      "   Un prestito verbale e perfettamente valido tra le parti.",
      "3. PRESUNZIONE DI ONEROSITA: salvo patto contrario, il mutuatario deve corrispondere",
      "   interessi al mutuante (Art. 1815 c.c.). Se non specificato, si applicano gli interessi",
      "   legali (Art. 1284 c.c.).",
      "4. TERMINE DI RESTITUZIONE: se non fissato, lo stabilisce il giudice (Art. 1817 c.c.).",
      "",
      "CONSEGUENZA: il prestito di EUR 5.000 fatto verbalmente a un amico e un contratto di mutuo",
      "valido a tutti gli effetti. Il problema NON e la validita, ma la PROVA.",
      "",
      "=== LIMITI ALLA PROVA TESTIMONIALE: ART. 2721-2726 c.c. ===",
      "",
      "Art. 2721 c.c.: la prova per testimoni dei contratti NON e ammessa quando il valore",
      "dell'oggetto eccede EUR 2,58 (lire cinquemila — importo storico MAI aggiornato dal 1942).",
      "",
      "ATTENZIONE: questo limite e PURAMENTE TEORICO perche:",
      "",
      "1. Art. 2721 co.2: il giudice PUO AMMETTERE la prova testimoniale anche oltre il limite,",
      "   tenuto conto della qualita delle parti, della natura del contratto e di ogni altra",
      "   circostanza. Nella pratica, i giudici la ammettono quasi sempre.",
      "",
      "2. Art. 2724 c.c.: la prova testimoniale e SEMPRE ammessa quando:",
      "   - n.1: vi e un PRINCIPIO DI PROVA PER ISCRITTO (qualsiasi documento che renda",
      "     verosimile il fatto — inclusi SMS, WhatsApp, email, bonifici, estratti conto);",
      "   - n.2: il contraente e stato nell'impossibilita morale o materiale di procurarsi",
      "     la prova scritta (tipico dei rapporti tra parenti e amici intimi);",
      "   - n.3: il contraente ha senza sua colpa perduto il documento che gli forniva la prova.",
      "",
      "=== SMS, WHATSAPP E PROVE DIGITALI ===",
      "",
      "Le comunicazioni elettroniche (SMS, WhatsApp, email) hanno piena rilevanza probatoria:",
      "",
      "1. PRINCIPIO DI PROVA PER ISCRITTO (Art. 2724 n.1 c.c.): un SMS o messaggio WhatsApp",
      "   in cui il debitore riconosce il debito o fa riferimento al prestito costituisce un",
      "   principio di prova per iscritto che rende ammissibile la prova testimoniale.",
      "",
      "2. DOCUMENTO INFORMATICO (D.Lgs. 82/2005 — Codice Amministrazione Digitale, Art. 20-21):",
      "   i messaggi elettronici sono documenti informatici la cui efficacia probatoria e",
      "   liberamente valutabile dal giudice (Art. 20 co.1-bis CAD).",
      "",
      "3. RIPRODUZIONE MECCANICA (Art. 2712 c.c.): screenshot di chat e messaggi formano",
      "   piena prova se la controparte non li disconosce specificamente.",
      "",
      "4. CONFESSIONE STRAGIUDIZIALE (Art. 2735 c.c.): un messaggio in cui il debitore scrive",
      "   'ti restituisco i soldi la prossima settimana' puo valere come confessione",
      "   stragiudiziale, liberamente apprezzabile dal giudice.",
      "",
      "CONSIGLIO PRATICO: conservare TUTTI i messaggi (screenshot + backup) in cui si fa",
      "riferimento al prestito. Anche un semplice 'grazie per il prestito' o 'ti rendo i soldi",
      "a fine mese' puo essere decisivo. Conservare anche la prova del bonifico o del prelievo.",
      "",
      "=== STRUMENTI DI RECUPERO ===",
      "",
      "1. DECRETO INGIUNTIVO (Art. 633 c.p.c.): se il creditore ha prova scritta del credito",
      "   (ricevuta, messaggio di riconoscimento, bonifico), puo chiedere un decreto ingiuntivo.",
      "   Procedimento rapido, senza contraddittorio iniziale.",
      "",
      "2. AZIONE ORDINARIA DI RESTITUZIONE: causa civile ordinaria per inadempimento",
      "   del contratto di mutuo (Art. 1813 c.c.).",
      "",
      "3. MEDIAZIONE OBBLIGATORIA: dal 2023, per le controversie civili di valore inferiore",
      "   a EUR 50.000, la mediazione e condizione di procedibilita.",
      "",
      "=== ERRORE COMUNE DEGLI AGENTI AI ===",
      "",
      "Confondere il prestito verbale con l'INDEBITO OGGETTIVO (Art. 2033 c.c.) o con",
      "l'ARRICCHIMENTO SENZA CAUSA (Art. 2041 c.c.). Questi istituti NON c'entrano:",
      "- Art. 2033 (indebito): riguarda chi PAGA per errore un debito non dovuto.",
      "- Art. 2041 (arricchimento): e un'azione residuale quando non c'e altro rimedio.",
      "",
      "Il prestito tra amici e un MUTUO (Art. 1813 c.c.) — un contratto tipico nominato.",
      "NON e un pagamento indebito, NON e un arricchimento senza causa.",
      "Il problema centrale e SEMPRE la prova: Art. 2721 c.c. (limiti testimoniali) +",
      "Art. 2724 c.c. (eccezioni, principio di prova per iscritto) + Art. 2712 c.c.",
      "(valore probatorio delle riproduzioni meccaniche/digitali).",
    ].join("\n"),
    metadata: {
      references: [
        "Art. 1813 c.c.",
        "Art. 1814 c.c.",
        "Art. 1815 c.c.",
        "Art. 1817 c.c.",
        "Art. 1822 c.c.",
        "Art. 2721 c.c.",
        "Art. 2722 c.c.",
        "Art. 2724 c.c.",
        "Art. 2712 c.c.",
        "Art. 2735 c.c.",
        "Art. 633 c.p.c.",
        "D.Lgs. 82/2005 (CAD)",
      ],
      keywords: [
        "prestito verbale",
        "prestito tra amici",
        "mutuo",
        "mutuo verbale",
        "prestito senza contratto",
        "prestito orale",
        "forma libera",
        "prova testimoniale",
        "limite prova testimoniale",
        "Art. 2721 c.c.",
        "Art. 1813 c.c.",
        "SMS prova",
        "WhatsApp prova",
        "principio di prova per iscritto",
        "Art. 2724 c.c.",
        "decreto ingiuntivo",
        "recupero credito",
        "restituzione somme",
        "prestito denaro",
        "amico deve soldi",
      ],
      testCase: "TC52",
      seededAt: new Date().toISOString(),
      seededBy: "seed-knowledge-tc52-prestito-verbale",
    },
  },

  // --- Entry 2: Pattern di rischio per prestito senza documentazione ---
  {
    category: "risk_pattern",
    title: "Prestito verbale senza documentazione — Rischio probatorio elevato",
    content: [
      "PATTERN DI RISCHIO: prestito di denaro tra privati senza documentazione scritta.",
      "",
      "LIVELLO DI RISCHIO: alto (per il creditore che deve recuperare il denaro).",
      "",
      "PROBLEMA PRINCIPALE: il mutuo verbale e valido (Art. 1813 c.c., forma libera),",
      "ma in caso di controversia il creditore deve PROVARE sia l'avvenuta consegna del denaro",
      "sia l'obbligo di restituzione. Senza documentazione, la prova e estremamente difficile.",
      "",
      "FATTORI DI RISCHIO SPECIFICI:",
      "",
      "1. IMPORTO > EUR 2,58: la prova testimoniale e in teoria limitata (Art. 2721 c.c.),",
      "   anche se nella pratica il giudice la ammette quasi sempre ex Art. 2721 co.2.",
      "",
      "2. NESSUN MESSAGGIO/EMAIL: se non esiste alcun riferimento scritto al prestito",
      "   (nemmeno un SMS, WhatsApp, email), il creditore non ha nemmeno un principio di",
      "   prova per iscritto (Art. 2724 n.1 c.c.).",
      "",
      "3. CONTANTE: se il prestito e stato fatto in contanti senza ricevuta, non c'e",
      "   traccia bancaria (bonifico, assegno) che dimostri il passaggio di denaro.",
      "",
      "4. RAPPORTO PERSONALE: paradossalmente, il rapporto di amicizia/parentela puo",
      "   sia aiutare (impossibilita morale di chiedere ricevuta — Art. 2724 n.2 c.c.)",
      "   sia complicare (il debitore puo sostenere che era un regalo/donazione).",
      "",
      "MITIGAZIONI POSSIBILI POST-FACTUM:",
      "- Cercare QUALSIASI messaggio (anche successivo) in cui il debitore riconosca il debito.",
      "- Verificare se ci sono testimoni presenti al momento della consegna.",
      "- Controllare estratti conto per traccia del prelievo/bonifico.",
      "- Tentare di ottenere un riconoscimento scritto del debito (anche informale).",
      "- Inviare una diffida formale (raccomandata A/R o PEC) che puo provocare una risposta",
      "  del debitore utilizzabile come prova.",
      "",
      "AZIONE CONSIGLIATA: recupero crediti tramite decreto ingiuntivo se esiste prova scritta",
      "(Art. 633 c.p.c.), altrimenti causa ordinaria con ogni mezzo di prova disponibile.",
    ].join("\n"),
    metadata: {
      references: [
        "Art. 1813 c.c.",
        "Art. 2721 c.c.",
        "Art. 2724 c.c.",
        "Art. 633 c.p.c.",
      ],
      keywords: [
        "prestito senza ricevuta",
        "prestito contanti",
        "prestito amico",
        "recupero credito",
        "prova prestito",
        "mutuo informale",
        "rischio probatorio",
      ],
      riskLevel: "high",
      testCase: "TC52",
      seededAt: new Date().toISOString(),
      seededBy: "seed-knowledge-tc52-prestito-verbale",
    },
  },
];

// --- Helpers ---

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

// --- Main ---

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!VOYAGE_API_KEY) {
    throw new Error("Missing VOYAGE_API_KEY");
  }

  console.log("=== seed-knowledge-tc52-prestito-verbale ===");
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
