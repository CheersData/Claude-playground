/**
 * Test Cost Tracking — Esegue una query al Corpus Agent e verifica il cost log.
 */

import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { askCorpusAgent } from "../lib/agents/corpus-agent";
import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  console.log("=== TEST COST TRACKING ===\n");
  console.log("Invio domanda al Corpus Agent...\n");

  const result = await askCorpusAgent(
    "Quali sono i diritti del consumatore per il recesso da un acquisto online?"
  );

  console.log("\n=== RISULTATO ===");
  console.log("Provider:", result.provider);
  console.log("Confidence:", result.confidence);
  console.log("Articoli recuperati:", result.articlesRetrieved);
  console.log("Durata:", result.durationMs, "ms");
  console.log(
    "Risposta (primi 200 char):",
    result.answer.slice(0, 200) + "..."
  );
  console.log("Articoli citati:", result.citedArticles.length);

  // Wait a moment for fire-and-forget cost logging to complete
  await new Promise((r) => setTimeout(r, 2000));

  // Verify cost log
  console.log("\n=== VERIFICA COST LOG ===");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_cost_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Errore query cost log:", error.message);
  } else if (!data || data.length === 0) {
    console.log(
      "NESSUN LOG TROVATO — il cost tracking potrebbe non funzionare"
    );
  } else {
    console.log("Log trovati:", data.length, "\n");
    for (const row of data) {
      const cost = Number(row.total_cost_usd).toFixed(6);
      console.log(
        `  ${row.agent_name} | ${row.model_key} | ${row.provider} | tokens: ${row.input_tokens}/${row.output_tokens} | cost: $${cost} | ${row.duration_ms}ms | fallback: ${row.used_fallback}`
      );
    }
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("ERRORE:", e.message);
  process.exit(1);
});
