#!/usr/bin/env npx tsx
/**
 * Quick check: verifica qualita dati nel DB Supabase
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

async function check() {
  // 1. Conteggio esatto per fonte
  console.log("=== CONTEGGIO PER FONTE ===");
  const sourceIds = [
    "codice_civile", "codice_penale", "codice_consumo", "codice_proc_civile",
    "dlgs_231_2001", "dlgs_122_2005", "statuto_lavoratori", "tu_edilizia",
    "gdpr", "dir_93_13_clausole_abusive", "dir_2011_83_consumatori",
    "dir_2019_771_vendita_beni", "reg_roma_i", "dsa"
  ];
  for (const sid of sourceIds) {
    const { count } = await supabase
      .from("legal_articles")
      .select("*", { count: "exact", head: true })
      .eq("source_id", sid);
    if (count && count > 0) {
      console.log(`  ${sid.padEnd(40)} ${count} articoli`);
    }
  }

  // 2. Campione Art. 1 Codice Civile
  console.log("\n=== ART. 1 CODICE CIVILE ===");
  const { data: art1 } = await supabase
    .from("legal_articles")
    .select("article_number, article_title, article_text, hierarchy, url")
    .eq("source_id", "codice_civile")
    .eq("article_number", "1")
    .single();

  if (art1) {
    console.log("Titolo:", art1.article_title);
    console.log("Hierarchy:", JSON.stringify(art1.hierarchy));
    console.log("URL:", art1.url);
    console.log("--- Testo (primi 600 chars) ---");
    console.log(art1.article_text?.slice(0, 600));
    console.log("---");
  } else {
    console.log("Non trovato!");
  }

  // 3. Art. 1321 (nozione di contratto)
  console.log("\n=== ART. 1321 CODICE CIVILE ===");
  const { data: art1321 } = await supabase
    .from("legal_articles")
    .select("article_number, article_title, article_text, hierarchy")
    .eq("source_id", "codice_civile")
    .eq("article_number", "1321")
    .single();

  if (art1321) {
    console.log("Titolo:", art1321.article_title);
    console.log("Hierarchy:", JSON.stringify(art1321.hierarchy));
    console.log("--- Testo ---");
    console.log(art1321.article_text?.slice(0, 400));
    console.log("---");
  } else {
    console.log("Non trovato!");
  }

  // 4. Check entita HTML non decodificate
  console.log("\n=== CHECK ENTITA HTML NEL TESTO ===");
  const entities = ["&Egrave;", "&egrave;", "&agrave;", "&amp;", "&nbsp;"];
  for (const ent of entities) {
    const { count } = await supabase
      .from("legal_articles")
      .select("*", { count: "exact", head: true })
      .eq("source_id", "codice_civile")
      .ilike("article_text", `%${ent}%`);
    if (count && count > 0) {
      console.log(`  "${ent}" trovato in ${count} articoli (SPORCO)`);
    } else {
      console.log(`  "${ent}" non trovato (OK)`);
    }
  }

  // 5. Check spazzatura UI
  console.log("\n=== CHECK SPAZZATURA UI NEL TESTO ===");
  const garbageTerms = ["articolo successivo", "nascondi", "esporta", "aggiornamenti all", "Approfondimenti", "-->"];
  for (const term of garbageTerms) {
    const { count } = await supabase
      .from("legal_articles")
      .select("*", { count: "exact", head: true })
      .eq("source_id", "codice_civile")
      .ilike("article_text", `%${term}%`);
    if (count && count > 0) {
      console.log(`  "${term}" trovato in ${count} articoli (SPORCO)`);
    } else {
      console.log(`  "${term}" non trovato (OK)`);
    }
  }

  // 6. Check hierarchy quality
  console.log("\n=== CHECK GERARCHIA ===");
  const { data: badHierarchy } = await supabase
    .from("legal_articles")
    .select("article_number, hierarchy")
    .eq("source_id", "codice_civile")
    .limit(5)
    .order("article_number");

  if (badHierarchy) {
    for (const art of badHierarchy) {
      console.log(`  Art. ${art.article_number}: ${JSON.stringify(art.hierarchy)}`);
    }
  }

  // 7. Campione GDPR Art. 1
  console.log("\n=== ART. 1 GDPR ===");
  const { data: gdpr1 } = await supabase
    .from("legal_articles")
    .select("article_number, article_title, article_text, hierarchy")
    .eq("source_id", "gdpr")
    .eq("article_number", "1")
    .single();

  if (gdpr1) {
    console.log("Titolo:", gdpr1.article_title);
    console.log("Hierarchy:", JSON.stringify(gdpr1.hierarchy));
    console.log("--- Testo (primi 300 chars) ---");
    console.log(gdpr1.article_text?.slice(0, 300));
  } else {
    console.log("GDPR non caricato");
  }
}

check().catch(console.error);
