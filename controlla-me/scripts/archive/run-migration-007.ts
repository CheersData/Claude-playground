/**
 * Esegue la migration 007: popola related_institutes per legal_articles.
 * Usa il client Supabase con service role key (no raw SQL necessario).
 *
 * PAGINAZIONE: Supabase restituisce max 1000 righe, questo script
 * pagina per ottenere TUTTI gli articoli prima di applicare i mapping.
 *
 * Usage: npx tsx scripts/run-migration-007.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ─── Extract article number from reference ───
function extractArticleNumber(ref: string): number | null {
  // "Art. 1341" → 1341, "Art. 1341-bis" → 1341, "Art. 15-bis" → 15
  const first = ref.split("-")[0];
  const digits = first.replace(/[^0-9]/g, "");
  return digits ? parseInt(digits, 10) : null;
}

// ─── Fetch ALL articles with pagination ───
async function fetchAllArticles() {
  const PAGE_SIZE = 1000;
  const allArticles: Array<{
    id: string;
    article_reference: string;
    law_source: string;
    related_institutes: string[];
  }> = [];

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("legal_articles")
      .select("id, article_reference, law_source, related_institutes")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("Error fetching articles:", error.message);
      process.exit(1);
    }

    allArticles.push(...data);
    console.log(`  Fetched ${allArticles.length} articles...`);

    if (data.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      offset += PAGE_SIZE;
    }
  }

  return allArticles;
}

// ─── Mapping: article number range → institutes ───
// Ordine: dal più generico al più specifico. L'ultimo match vince.
interface RangeMapping {
  min: number;
  max: number;
  institutes: string[];
}

// Codice Civile mappings — ordinati generico → specifico
const CC_MAPPINGS: RangeMapping[] = [
  // ═══ LIBRO I: Persone ═══
  { min: 1, max: 10, institutes: ["contratto"] },

  // ═══ LIBRO III: Proprietà ═══
  { min: 832, max: 951, institutes: ["vendita_immobiliare"] },

  // ═══ LIBRO IV, TITOLO I: Obbligazioni ═══
  { min: 1173, max: 1217, institutes: ["obbligazione", "adempimento"] },
  { min: 1218, max: 1229, institutes: ["inadempimento", "mora", "risarcimento"] },
  { min: 1229, max: 1229, institutes: ["inadempimento", "clausole_vessatorie", "nullità"] },
  { min: 1230, max: 1320, institutes: ["obbligazione"] },

  // ═══ LIBRO IV, TITOLO II: Contratti in generale ═══
  { min: 1321, max: 1324, institutes: ["contratto", "requisiti_contratto"] },
  { min: 1325, max: 1335, institutes: ["contratto", "consenso", "proposta", "accettazione", "conclusione_contratto"] },
  { min: 1336, max: 1340, institutes: ["contratto", "clausole_vessatorie"] },
  // ★ CLAUSOLE VESSATORIE
  { min: 1341, max: 1342, institutes: ["clausole_vessatorie", "contratto", "nullità"] },
  { min: 1343, max: 1352, institutes: ["contratto", "causa", "oggetto_contratto"] },
  { min: 1353, max: 1361, institutes: ["contratto", "condizione", "termine"] },
  // ★ INTERPRETAZIONE DEL CONTRATTO
  { min: 1362, max: 1371, institutes: ["interpretazione_contratto", "contratto", "buona_fede"] },
  { min: 1372, max: 1381, institutes: ["effetti_contratto", "contratto"] },
  { min: 1382, max: 1384, institutes: ["clausola_penale", "contratto"] },
  { min: 1385, max: 1386, institutes: ["caparra_confirmatoria", "caparra_penitenziale", "contratto"] },
  { min: 1387, max: 1405, institutes: ["rappresentanza", "mandato", "procura"] },
  { min: 1406, max: 1413, institutes: ["contratto", "effetti_contratto"] },
  { min: 1414, max: 1417, institutes: ["simulazione", "contratto", "nullità"] },
  // ★ NULLITÀ
  { min: 1418, max: 1424, institutes: ["nullità", "contratto", "annullabilità"] },
  { min: 1425, max: 1446, institutes: ["annullabilità", "contratto", "consenso"] },
  { min: 1447, max: 1452, institutes: ["rescissione", "contratto"] },
  { min: 1453, max: 1462, institutes: ["risoluzione", "contratto", "inadempimento"] },
  { min: 1463, max: 1466, institutes: ["risoluzione", "contratto"] },
  { min: 1467, max: 1469, institutes: ["risoluzione", "contratto"] },

  // ═══ LIBRO IV, TITOLO III: Singoli contratti ═══
  { min: 1470, max: 1536, institutes: ["vendita", "compravendita"] },
  // Garanzia per vizi (più specifico, sovrascrive vendita generica)
  { min: 1490, max: 1497, institutes: ["vendita", "vizi_cosa_venduta", "garanzia_evizione"] },
  // ★ Vendita a corpo / a misura
  { min: 1537, max: 1541, institutes: ["vendita_a_corpo", "vendita_a_misura", "rettifica_prezzo", "vendita"] },
  { min: 1542, max: 1547, institutes: ["vendita"] },
  { min: 1548, max: 1570, institutes: ["contratto"] },
  // Locazione
  { min: 1571, max: 1606, institutes: ["locazione", "obblighi_locatore", "obblighi_conduttore"] },
  { min: 1607, max: 1614, institutes: ["locazione", "sublocazione"] },
  { min: 1615, max: 1654, institutes: ["locazione"] },
  // Appalto
  { min: 1655, max: 1677, institutes: ["appalto"] },
  { min: 1667, max: 1668, institutes: ["appalto", "difformità_vizi", "collaudo"] },
  { min: 1669, max: 1669, institutes: ["appalto", "difformità_vizi", "responsabilità_extracontrattuale"] },
  // Mandato
  { min: 1703, max: 1741, institutes: ["mandato", "procura", "rappresentanza"] },
  // Trasporto
  { min: 1678, max: 1702, institutes: ["contratto"] },
  // Comodato
  { min: 1803, max: 1812, institutes: ["comodato"] },
  // Mutuo
  { min: 1813, max: 1822, institutes: ["mutuo", "interessi"] },
  { min: 1815, max: 1815, institutes: ["mutuo", "interessi", "usura"] },
  // Assicurazione
  { min: 1882, max: 1932, institutes: ["assicurazione", "polizza"] },
  // Fideiussione
  { min: 1936, max: 1957, institutes: ["fideiussione", "garanzia_personale"] },

  // ═══ LIBRO IV, TITOLO IX: Fatti illeciti ═══
  { min: 2043, max: 2059, institutes: ["responsabilità_extracontrattuale", "fatto_illecito", "danno", "risarcimento"] },

  // ═══ LIBRO V: Società e lavoro ═══
  { min: 2222, max: 2238, institutes: ["lavoro_autonomo", "contratto_opera"] },
  { min: 2247, max: 2324, institutes: ["società_semplice"] },
  { min: 2325, max: 2461, institutes: ["spa"] },
  { min: 2462, max: 2510, institutes: ["srl"] },

  // ═══ LIBRO VI: Tutela dei diritti ═══
  { min: 2643, max: 2696, institutes: ["trascrizione", "vendita_immobiliare"] },
  { min: 2784, max: 2807, institutes: ["pegno", "garanzia_reale"] },
  { min: 2808, max: 2899, institutes: ["ipoteca", "garanzia_reale"] },
  { min: 2934, max: 2969, institutes: ["prescrizione", "decadenza", "termini"] },
];

// Codice del Consumo mappings
const CONSUMO_MAPPINGS: RangeMapping[] = [
  { min: 33, max: 38, institutes: ["clausole_abusive", "tutela_consumatore", "clausole_vessatorie", "nullità"] },
  { min: 45, max: 67, institutes: ["tutela_consumatore"] },
  { min: 128, max: 135, institutes: ["tutela_consumatore", "vizi_cosa_venduta", "vendita"] },
];

async function run() {
  console.log("=== Migration 007: Popola related_institutes ===\n");

  // Step 1: Fetch ALL articles with pagination
  console.log("Fetching all articles (con paginazione)...");
  const articles = await fetchAllArticles();
  console.log(`\nTotale: ${articles.length} articoli.\n`);

  // Step 2: Build update map — id → institutes
  // L'ultimo mapping che matcha (il più specifico) VINCE e SOVRASCRIVE
  const updateMap = new Map<string, string[]>();

  for (const art of articles) {
    const num = extractArticleNumber(art.article_reference);
    if (num === null) continue;

    // Codice Civile
    if (art.law_source === "Codice Civile") {
      // Trova l'ultimo mapping che matcha (il più specifico)
      let lastMatch: RangeMapping | null = null;
      for (const m of CC_MAPPINGS) {
        if (num >= m.min && num <= m.max) {
          lastMatch = m;
        }
      }
      if (lastMatch) {
        updateMap.set(art.id, [...lastMatch.institutes]);
      }
    }

    // Codice del Consumo
    if (art.law_source && art.law_source.includes("206/2005")) {
      let lastMatch: RangeMapping | null = null;
      for (const m of CONSUMO_MAPPINGS) {
        if (num >= m.min && num <= m.max) {
          lastMatch = m;
        }
      }
      if (lastMatch) {
        updateMap.set(art.id, [...lastMatch.institutes]);
      }
    }
  }

  console.log(`Articoli da aggiornare: ${updateMap.size}\n`);

  // Step 3: Execute updates in batches of 50
  let updated = 0;
  let errors = 0;
  const entries = [...updateMap.entries()];

  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);

    const promises = batch.map(([id, institutes]) =>
      supabase
        .from("legal_articles")
        .update({ related_institutes: institutes })
        .eq("id", id)
    );

    const results = await Promise.all(promises);

    for (const result of results) {
      if (result.error) {
        errors++;
        if (errors <= 5) console.error("  Update error:", result.error.message);
      } else {
        updated++;
      }
    }

    const batchNum = Math.floor(i / 50) + 1;
    const totalBatches = Math.ceil(entries.length / 50);
    process.stdout.write(`  Batch ${batchNum}/${totalBatches} — ${updated} updated\r`);
  }

  console.log(`\n\n✓ Aggiornati ${updated} articoli (${errors} errori)\n`);

  // Step 4: Verification
  console.log("=== Verifica ===\n");

  // Count using pagination
  const allAfter = await fetchAllArticles();
  const withInstitutes = allAfter.filter(
    (a) => a.related_institutes && a.related_institutes.length > 0
  ).length;
  console.log(`Articoli con istituti: ${withInstitutes} / ${allAfter.length}`);

  // Check critical articles
  const criticalRefs = [
    "Art. 1229", "Art. 1341", "Art. 1342",
    "Art. 1362", "Art. 1367", "Art. 1371",
    "Art. 1418", "Art. 1419",
  ];

  console.log("\nArticoli critici (Codice Civile):");
  for (const ref of criticalRefs) {
    const { data: found } = await supabase
      .from("legal_articles")
      .select("article_reference, related_institutes")
      .eq("law_source", "Codice Civile")
      .eq("article_reference", ref)
      .limit(1);

    if (found && found.length > 0) {
      const inst = found[0].related_institutes || [];
      console.log(`  ${found[0].article_reference} → [${inst.join(", ")}]`);
    } else {
      console.log(`  ${ref} → NON TROVATO nel DB`);
    }
  }

  // Check Codice del Consumo
  console.log("\nCodice del Consumo (Art. 33-38):");
  for (let n = 33; n <= 38; n++) {
    const { data: found } = await supabase
      .from("legal_articles")
      .select("article_reference, law_source, related_institutes")
      .ilike("law_source", "%206/2005%")
      .eq("article_reference", `Art. ${n}`)
      .limit(1);

    if (found && found.length > 0) {
      const inst = found[0].related_institutes || [];
      console.log(`  ${found[0].article_reference} → [${inst.join(", ")}]`);
    } else {
      console.log(`  Art. ${n} → NON TROVATO`);
    }
  }

  console.log("\n=== Migration 007 completata ===");
}

run().catch(console.error);
