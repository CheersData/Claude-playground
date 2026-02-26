/**
 * Audit e fix completo dei related_institutes in legal_articles.
 *
 * Problemi identificati:
 * 1. Cross-contaminazione tra istituti adiacenti (nullità/simulazione, nullità/annullabilità)
 * 2. Sub-articoli CdC (33bis, 33ter) ereditano tag del parent
 * 3. Tag troppo larghi su articoli dove non sono il topic primario
 *
 * Usage: npx tsx scripts/fix-institute-tags.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PAGE_SIZE = 1000;

async function fetchAll() {
  const all: Array<{
    id: string;
    article_reference: string;
    law_source: string;
    related_institutes: string[];
  }> = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data } = await supabase
      .from("legal_articles")
      .select("id, article_reference, law_source, related_institutes")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    all.push(...(data ?? []));
    hasMore = (data?.length ?? 0) === PAGE_SIZE;
    offset += PAGE_SIZE;
  }
  return all;
}

// Parse article number, handling bis/ter/etc.
function parseRef(ref: string): { num: number | null; suffix: string } {
  // "Art. 33bis" → { num: 33, suffix: "bis" }
  // "Art. 1341" → { num: 1341, suffix: "" }
  // "Art. 1341-bis" → { num: 1341, suffix: "bis" }
  const cleaned = ref.replace(/^Art\.\s*/, "");

  // Check for -bis, -ter pattern
  const dashMatch = cleaned.match(/^(\d+)-(bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)/i);
  if (dashMatch) return { num: parseInt(dashMatch[1]), suffix: dashMatch[2].toLowerCase() };

  // Check for attached suffix: "33bis", "33ter"
  const attachedMatch = cleaned.match(/^(\d+)(bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)/i);
  if (attachedMatch) return { num: parseInt(attachedMatch[1]), suffix: attachedMatch[2].toLowerCase() };

  // Plain number
  const plainMatch = cleaned.match(/^(\d+)/);
  if (plainMatch) return { num: parseInt(plainMatch[1]), suffix: "" };

  return { num: null, suffix: "" };
}

// ─── Codice Civile: mapping preciso per range ───
// Ogni articolo ottiene SOLO i tag del suo topic primario
// NO cross-contaminazione con istituti adiacenti
interface TagRule {
  min: number;
  max: number;
  institutes: string[];
}

const CC_RULES: TagRule[] = [
  // LIBRO I
  { min: 1, max: 10, institutes: ["contratto"] },

  // LIBRO III: Proprietà
  { min: 832, max: 951, institutes: ["vendita_immobiliare"] },

  // LIBRO IV, TIT. I: Obbligazioni
  { min: 1173, max: 1217, institutes: ["obbligazione", "adempimento"] },
  { min: 1218, max: 1228, institutes: ["inadempimento", "mora", "risarcimento"] },
  { min: 1229, max: 1229, institutes: ["inadempimento", "clausole_vessatorie", "nullità"] },
  { min: 1230, max: 1320, institutes: ["obbligazione"] },

  // LIBRO IV, TIT. II: Contratti in generale
  { min: 1321, max: 1324, institutes: ["contratto", "requisiti_contratto"] },
  { min: 1325, max: 1335, institutes: ["contratto", "consenso", "proposta", "accettazione"] },
  { min: 1336, max: 1340, institutes: ["contratto", "clausole_vessatorie"] },
  { min: 1341, max: 1342, institutes: ["clausole_vessatorie", "contratto", "nullità"] },
  { min: 1343, max: 1352, institutes: ["contratto", "causa", "oggetto_contratto"] },
  { min: 1353, max: 1361, institutes: ["contratto", "condizione", "termine"] },
  // ★ INTERPRETAZIONE
  { min: 1362, max: 1371, institutes: ["interpretazione_contratto", "contratto", "buona_fede"] },
  { min: 1372, max: 1381, institutes: ["effetti_contratto", "contratto"] },
  { min: 1382, max: 1384, institutes: ["clausola_penale", "contratto"] },
  { min: 1385, max: 1386, institutes: ["caparra_confirmatoria", "caparra_penitenziale"] },
  { min: 1387, max: 1405, institutes: ["rappresentanza", "mandato", "procura"] },
  { min: 1406, max: 1413, institutes: ["contratto", "effetti_contratto"] },
  // ★ SIMULAZIONE — NO nullità
  { min: 1414, max: 1417, institutes: ["simulazione", "contratto"] },
  // ★ NULLITÀ — NO annullabilità (sono istituti DIVERSI)
  { min: 1418, max: 1424, institutes: ["nullità", "contratto"] },
  // ★ ANNULLABILITÀ — NO nullità
  { min: 1425, max: 1446, institutes: ["annullabilità", "contratto"] },
  { min: 1447, max: 1452, institutes: ["rescissione", "contratto"] },
  // RISOLUZIONE
  { min: 1453, max: 1462, institutes: ["risoluzione", "contratto", "inadempimento"] },
  { min: 1463, max: 1466, institutes: ["risoluzione", "contratto"] },
  { min: 1467, max: 1469, institutes: ["risoluzione", "contratto"] },

  // LIBRO IV, TIT. III: Singoli contratti
  { min: 1470, max: 1489, institutes: ["vendita", "compravendita"] },
  { min: 1490, max: 1497, institutes: ["vendita", "vizi_cosa_venduta", "garanzia_evizione"] },
  { min: 1498, max: 1536, institutes: ["vendita", "compravendita"] },
  { min: 1537, max: 1541, institutes: ["vendita_a_corpo", "vendita_a_misura", "rettifica_prezzo"] },
  { min: 1542, max: 1547, institutes: ["vendita"] },
  { min: 1548, max: 1570, institutes: ["contratto"] },
  { min: 1571, max: 1606, institutes: ["locazione", "obblighi_locatore", "obblighi_conduttore"] },
  { min: 1607, max: 1614, institutes: ["locazione", "sublocazione"] },
  { min: 1615, max: 1654, institutes: ["locazione"] },
  { min: 1655, max: 1666, institutes: ["appalto"] },
  { min: 1667, max: 1668, institutes: ["appalto", "difformità_vizi", "collaudo"] },
  { min: 1669, max: 1669, institutes: ["appalto", "difformità_vizi", "responsabilità_extracontrattuale"] },
  { min: 1670, max: 1677, institutes: ["appalto"] },
  { min: 1678, max: 1702, institutes: ["contratto"] },
  { min: 1703, max: 1741, institutes: ["mandato", "procura", "rappresentanza"] },
  { min: 1803, max: 1812, institutes: ["comodato"] },
  { min: 1813, max: 1814, institutes: ["mutuo", "interessi"] },
  { min: 1815, max: 1815, institutes: ["mutuo", "interessi", "usura"] },
  { min: 1816, max: 1822, institutes: ["mutuo", "interessi"] },
  { min: 1882, max: 1932, institutes: ["assicurazione", "polizza"] },
  { min: 1936, max: 1957, institutes: ["fideiussione", "garanzia_personale"] },

  // LIBRO IV, TIT. IX: Fatti illeciti
  { min: 2043, max: 2059, institutes: ["responsabilità_extracontrattuale", "fatto_illecito", "danno", "risarcimento"] },

  // LIBRO V: Società e lavoro
  { min: 2222, max: 2238, institutes: ["lavoro_autonomo", "contratto_opera"] },
  { min: 2247, max: 2324, institutes: ["società_semplice"] },
  { min: 2325, max: 2461, institutes: ["spa"] },
  { min: 2462, max: 2510, institutes: ["srl"] },

  // LIBRO VI: Tutela dei diritti
  { min: 2643, max: 2696, institutes: ["trascrizione", "vendita_immobiliare"] },
  { min: 2784, max: 2807, institutes: ["pegno", "garanzia_reale"] },
  { min: 2808, max: 2899, institutes: ["ipoteca", "garanzia_reale"] },
  { min: 2934, max: 2969, institutes: ["prescrizione", "decadenza", "termini"] },
];

// ─── CdC: tag specifici per articolo (NON per range) ───
const CDC_ARTICLE_TAGS: Record<string, string[]> = {
  // Art. 33: clausole vessatorie — definizione
  "33": ["clausole_abusive", "clausole_vessatorie", "tutela_consumatore", "nullità"],
  // Art. 34: accertamento vessatorietà
  "34": ["clausole_abusive", "clausole_vessatorie", "tutela_consumatore"],
  // Art. 35: forma e interpretazione
  "35": ["clausole_abusive", "tutela_consumatore"],
  // Art. 36: nullità di protezione
  "36": ["clausole_abusive", "nullità", "tutela_consumatore"],
  // Art. 37: azione inibitoria
  "37": ["clausole_abusive", "tutela_consumatore"],
  // Art. 38: rinvio
  "38": ["clausole_abusive", "tutela_consumatore"],
  // Art. 45-67: contratti a distanza / diritto di recesso
  // solo i principali
  "45": ["tutela_consumatore", "recesso"],
  "46": ["tutela_consumatore"],
  "47": ["tutela_consumatore"],
  "48": ["tutela_consumatore", "informazioni_precontrattuali"],
  "49": ["tutela_consumatore", "informazioni_precontrattuali"],
  "50": ["tutela_consumatore"],
  "51": ["tutela_consumatore", "recesso"],
  "52": ["tutela_consumatore", "recesso"],
  "53": ["tutela_consumatore", "recesso"],
  "54": ["tutela_consumatore", "recesso"],
  "55": ["tutela_consumatore", "recesso"],
  "56": ["tutela_consumatore", "recesso"],
  "57": ["tutela_consumatore", "recesso"],
  "58": ["tutela_consumatore"],
  "59": ["tutela_consumatore"],
  "60": ["tutela_consumatore"],
  "61": ["tutela_consumatore"],
  "62": ["tutela_consumatore"],
  "63": ["tutela_consumatore"],
  "64": ["tutela_consumatore"],
  "65": ["tutela_consumatore"],
  "66": ["tutela_consumatore"],
  "67": ["tutela_consumatore"],
  // Art. 128-135: garanzia legale di conformità
  "128": ["tutela_consumatore", "garanzia_legale", "conformità_beni"],
  "129": ["tutela_consumatore", "garanzia_legale", "conformità_beni", "vizi_cosa_venduta"],
  "130": ["tutela_consumatore", "garanzia_legale", "conformità_beni"],
  "131": ["tutela_consumatore", "garanzia_legale"],
  "132": ["tutela_consumatore", "garanzia_legale", "prescrizione"],
  "133": ["tutela_consumatore", "garanzia_legale"],
  "134": ["tutela_consumatore", "garanzia_legale"],
  "135": ["tutela_consumatore", "garanzia_legale", "vendita"],
};

async function run() {
  console.log("=== Audit & Fix related_institutes ===\n");

  const articles = await fetchAll();
  console.log(`Totale articoli: ${articles.length}\n`);

  const updates = new Map<string, string[]>();
  let ccFixed = 0;
  let cdcFixed = 0;
  let skipped = 0;

  for (const art of articles) {
    const { num, suffix } = parseRef(art.article_reference);
    if (num === null) continue;

    // ─── CODICE CIVILE ───
    if (art.law_source === "Codice Civile") {
      // Solo articoli "base" (no bis/ter per il CC — sono rari)
      // Trova l'ultimo rule che matcha (più specifico)
      let bestRule: TagRule | null = null;
      for (const rule of CC_RULES) {
        if (num >= rule.min && num <= rule.max) {
          bestRule = rule;
        }
      }
      if (bestRule) {
        const current = JSON.stringify(art.related_institutes?.sort() ?? []);
        const target = JSON.stringify([...bestRule.institutes].sort());
        if (current !== target) {
          updates.set(art.id, [...bestRule.institutes]);
          ccFixed++;
        }
      }
    }

    // ─── CODICE DEL CONSUMO ───
    if (art.law_source?.includes("206/2005")) {
      const baseNum = String(num);

      // Sub-articoli (bis, ter, ecc.): tag più generici del parent
      if (suffix) {
        // Sub-articolo: prende tag generici
        const parentTags = CDC_ARTICLE_TAGS[baseNum];
        if (parentTags) {
          // Sub-articolo: solo i primi 2 tag del parent (quelli più generici)
          const subTags = parentTags.slice(0, 2);
          const current = JSON.stringify(art.related_institutes?.sort() ?? []);
          const target = JSON.stringify([...subTags].sort());
          if (current !== target) {
            updates.set(art.id, subTags);
            cdcFixed++;
          }
        }
        // else: sub-articolo fuori dal mapping, lascia come è
      } else {
        // Articolo base: tag specifici
        const tags = CDC_ARTICLE_TAGS[baseNum];
        if (tags) {
          const current = JSON.stringify(art.related_institutes?.sort() ?? []);
          const target = JSON.stringify([...tags].sort());
          if (current !== target) {
            updates.set(art.id, [...tags]);
            cdcFixed++;
          }
        }
      }
    }
  }

  console.log(`CC da fixare: ${ccFixed}`);
  console.log(`CdC da fixare: ${cdcFixed}`);
  console.log(`Totale updates: ${updates.size}\n`);

  // Execute updates
  let done = 0;
  let errors = 0;
  const entries = [...updates.entries()];

  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    const results = await Promise.all(
      batch.map(([id, institutes]) =>
        supabase.from("legal_articles").update({ related_institutes: institutes }).eq("id", id)
      )
    );
    for (const r of results) {
      if (r.error) { errors++; if (errors <= 3) console.error("  Error:", r.error.message); }
      else done++;
    }
    process.stdout.write(`  ${done}/${entries.length} updated\r`);
  }

  console.log(`\n✓ ${done} aggiornati (${errors} errori)\n`);

  // ─── Verification ───
  console.log("=== Verifica post-fix ===\n");

  const critical = [
    { ref: "Art. 1341", expect: "clausole_vessatorie" },
    { ref: "Art. 1362", expect: "interpretazione_contratto" },
    { ref: "Art. 1414", expect: "simulazione" },
    { ref: "Art. 1418", expect: "nullità" },
    { ref: "Art. 1425", expect: "annullabilità" },
    { ref: "Art. 1453", expect: "risoluzione" },
    { ref: "Art. 1537", expect: "vendita_a_corpo" },
  ];

  for (const { ref, expect } of critical) {
    const { data } = await supabase
      .from("legal_articles")
      .select("article_reference, related_institutes")
      .eq("law_source", "Codice Civile")
      .eq("article_reference", ref)
      .limit(1);

    const inst = data?.[0]?.related_institutes ?? [];
    const has = inst.includes(expect);
    console.log(`${has ? "✓" : "✗"} ${ref} → [${inst.join(", ")}]${has ? "" : ` — MANCA ${expect}!`}`);
  }

  // Check no cross-contamination
  console.log("\nCross-contaminazione:");

  const crossChecks = [
    { ref: "Art. 1414", bad: "nullità", label: "simulazione ≠ nullità" },
    { ref: "Art. 1418", bad: "annullabilità", label: "nullità ≠ annullabilità" },
    { ref: "Art. 1425", bad: "nullità", label: "annullabilità ≠ nullità" },
  ];

  for (const { ref, bad, label } of crossChecks) {
    const { data } = await supabase
      .from("legal_articles")
      .select("related_institutes")
      .eq("law_source", "Codice Civile")
      .eq("article_reference", ref)
      .limit(1);

    const has = data?.[0]?.related_institutes?.includes(bad) ?? false;
    console.log(`${has ? "✗ PROBLEMA" : "✓ OK"} ${ref}: ${label} — ${bad} ${has ? "PRESENTE" : "assente"}`);
  }

  // Institute counts
  console.log("\nTop istituti (lookup test):");
  for (const inst of ["nullità", "clausole_vessatorie", "interpretazione_contratto", "simulazione", "annullabilità", "vendita_a_corpo"]) {
    const { data } = await supabase.rpc("get_articles_by_institute", { p_institute: inst, p_limit: 20 });
    console.log(`  ${inst}: ${data?.length ?? 0} articles`);
    if (data && data.length <= 10) {
      data.forEach((a: { article_reference: string }) => process.stdout.write(`    ${a.article_reference} `));
      console.log();
    }
  }
}

run().catch(console.error);
