/**
 * Tagging sistematico del Codice Civile — v2
 *
 * Due livelli di tag:
 * 1. TAG PRIMARI: istituto di cui l'articolo fa parte (dal titolo/capo)
 * 2. TAG CROSS-REFERENCE: istituti a cui l'articolo è rilevante come
 *    eccezione, applicazione, o conseguenza
 *
 * Esempio: Art. 2126 (prestazione di fatto con violazione di legge)
 *   Primari: lavoro_subordinato, contratto_lavoro
 *   Cross-ref: nullità (effetti del contratto di lavoro nullo)
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

// ─── Fetch all with pagination ───

async function fetchAll(source?: string) {
  const PAGE = 1000;
  const all: Array<{
    id: string;
    article_reference: string;
    law_source: string;
    related_institutes: string[];
  }> = [];
  let offset = 0;
  while (true) {
    let q = supabase
      .from("legal_articles")
      .select("id, article_reference, law_source, related_institutes")
      .order("id")
      .range(offset, offset + PAGE - 1);
    if (source) q = q.eq("law_source", source);
    const { data } = await q;
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// ─── Parse article reference ───

function parseRef(ref: string): { num: number | null; suffix: string } {
  const cleaned = ref.replace(/^Art\.\s*/, "");
  const dashMatch = cleaned.match(
    /^(\d+)-(bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)/i
  );
  if (dashMatch)
    return { num: parseInt(dashMatch[1]), suffix: dashMatch[2].toLowerCase() };
  const attachedMatch = cleaned.match(
    /^(\d+)(bis|ter|quater|quinquies|sexies|septies|octies|novies|decies)/i
  );
  if (attachedMatch)
    return {
      num: parseInt(attachedMatch[1]),
      suffix: attachedMatch[2].toLowerCase(),
    };
  const plain = cleaned.match(/^(\d+)/);
  if (plain) return { num: parseInt(plain[1]), suffix: "" };
  return { num: null, suffix: "" };
}

// ═══════════════════════════════════════════════════════════
// CODICE CIVILE — Mapping completo per range
// ═══════════════════════════════════════════════════════════
//
// Struttura: { min, max, tags }
// L'ultimo match vince (più specifico sovrascrive più generico)
//

interface TagRule {
  min: number;
  max: number;
  tags: string[];
}

const CC: TagRule[] = [
  // ═══ LIBRO I: Delle persone e della famiglia ═══

  // Tit. I: Persone fisiche
  { min: 1, max: 10, tags: ["persona_fisica"] },
  { min: 11, max: 16, tags: ["persona_fisica"] },
  // Tit. II: Persone giuridiche
  { min: 11, max: 35, tags: ["persona_giuridica", "associazione", "fondazione"] },
  { min: 36, max: 42, tags: ["persona_giuridica", "comitato"] },
  // Tit. V: Parentela e affinità
  { min: 74, max: 78, tags: ["parentela"] },
  // Tit. VI: Matrimonio
  { min: 79, max: 142, tags: ["matrimonio"] },
  // ★ Art. 128-129: Matrimonio putativo — CROSS-REF: nullità
  { min: 128, max: 129, tags: ["matrimonio", "nullità"] },
  { min: 143, max: 158, tags: ["matrimonio", "regime_patrimoniale"] },
  { min: 159, max: 166, tags: ["matrimonio", "comunione_legale"] },
  { min: 167, max: 190, tags: ["matrimonio", "comunione_legale"] },
  { min: 191, max: 230, tags: ["matrimonio", "separazione_beni"] },
  // Tit. VII: Filiazione
  { min: 231, max: 290, tags: ["filiazione", "responsabilità_genitoriale"] },
  // Tit. VIII-IX: Adozione, potestà genitoriale
  { min: 291, max: 342, tags: ["filiazione", "responsabilità_genitoriale"] },
  // Tit. X: Tutela e curatela
  { min: 343, max: 413, tags: ["tutela"] },
  // Tit. XIII: Alimenti
  { min: 433, max: 448, tags: ["alimenti", "obbligo_alimentare"] },

  // ═══ LIBRO II: Delle successioni ═══

  // Tit. I: Disposizioni generali
  { min: 456, max: 535, tags: ["successione", "eredità", "vocazione_ereditaria"] },
  // Tit. II: Successioni legittime
  { min: 536, max: 586, tags: ["successione", "eredità"] },
  // Tit. III: Successioni testamentarie
  { min: 587, max: 712, tags: ["testamento", "successione_testamentaria", "legato"] },
  // Tit. IV: Divisione
  { min: 713, max: 768, tags: ["successione", "eredità"] },
  // Tit. V: Donazioni
  { min: 769, max: 809, tags: ["donazione", "liberalità"] },

  // ═══ LIBRO III: Della proprietà ═══

  // Tit. I: Beni
  { min: 810, max: 831, tags: ["beni", "classificazione_beni"] },
  // Tit. II: Proprietà (diritti reali, NON compravendita)
  { min: 832, max: 951, tags: ["proprietà"] },
  // Tit. III: Superficie
  { min: 952, max: 956, tags: ["superficie", "diritto_superficie"] },
  // Tit. IV: Enfiteusi
  { min: 957, max: 977, tags: ["enfiteusi"] },
  // Tit. V: Usufrutto, uso, abitazione
  { min: 978, max: 1026, tags: ["usufrutto"] },
  // Tit. VI: Servitù prediali
  { min: 1027, max: 1099, tags: ["servitù_prediale", "servitù"] },
  // Tit. VII: Comunione
  { min: 1100, max: 1139, tags: ["comunione", "condominio"] },
  // Tit. VIII: Possesso
  { min: 1140, max: 1172, tags: ["possesso", "detenzione", "usucapione"] },

  // ═══ LIBRO IV, TIT. I: Obbligazioni in generale ═══

  { min: 1173, max: 1217, tags: ["obbligazione", "adempimento"] },
  { min: 1218, max: 1228, tags: ["inadempimento", "mora", "risarcimento"] },
  // ★ Art. 1229: esonero responsabilità — CROSS-REF: clausole_vessatorie, nullità
  { min: 1229, max: 1229, tags: ["inadempimento", "clausole_vessatorie", "nullità"] },
  { min: 1230, max: 1259, tags: ["obbligazione"] },
  { min: 1260, max: 1320, tags: ["obbligazione"] },

  // ═══ LIBRO IV, TIT. II: Contratti in generale ═══

  { min: 1321, max: 1324, tags: ["contratto", "requisiti_contratto"] },
  { min: 1325, max: 1335, tags: ["contratto", "consenso", "proposta", "accettazione"] },
  { min: 1336, max: 1336, tags: ["contratto"] },
  // ★ Art. 1337-1338: buona fede precontrattuale (culpa in contrahendo)
  { min: 1337, max: 1338, tags: ["contratto", "buona_fede"] },
  { min: 1339, max: 1340, tags: ["contratto"] },
  // ★ Clausole vessatorie — CROSS-REF: nullità
  { min: 1341, max: 1342, tags: ["clausole_vessatorie", "contratto", "nullità"] },
  { min: 1343, max: 1349, tags: ["contratto", "causa", "oggetto_contratto"] },
  { min: 1350, max: 1352, tags: ["contratto", "contratto_preliminare"] },
  { min: 1353, max: 1361, tags: ["contratto", "condizione", "termine"] },
  // ★ Interpretazione
  { min: 1362, max: 1371, tags: ["interpretazione_contratto", "contratto", "buona_fede"] },
  { min: 1372, max: 1381, tags: ["effetti_contratto", "contratto"] },
  // ★ Art. 1375: esecuzione buona fede
  { min: 1375, max: 1375, tags: ["effetti_contratto", "buona_fede", "esecuzione_buona_fede"] },
  { min: 1382, max: 1384, tags: ["clausola_penale", "contratto"] },
  { min: 1385, max: 1386, tags: ["caparra_confirmatoria", "caparra_penitenziale"] },
  { min: 1387, max: 1405, tags: ["rappresentanza", "mandato", "procura"] },
  { min: 1406, max: 1413, tags: ["contratto", "effetti_contratto"] },
  // ★ Simulazione — NO nullità
  { min: 1414, max: 1417, tags: ["simulazione", "contratto"] },
  // ★ Nullità — NO annullabilità
  { min: 1418, max: 1424, tags: ["nullità", "contratto"] },
  // ★ Annullabilità — NO nullità
  { min: 1425, max: 1446, tags: ["annullabilità", "contratto"] },
  { min: 1447, max: 1452, tags: ["rescissione", "contratto"] },
  // Risoluzione — Art. 1453-1459 core, Art. 1460-1462 eccezioni
  { min: 1453, max: 1459, tags: ["risoluzione", "contratto", "inadempimento"] },
  // ★ Art. 1460: eccezione di inadempimento (exceptio inadimpleti contractus)
  { min: 1460, max: 1462, tags: ["risoluzione", "contratto", "inadempimento"] },
  { min: 1463, max: 1466, tags: ["risoluzione", "contratto"] },
  { min: 1467, max: 1469, tags: ["risoluzione", "contratto"] },

  // ═══ LIBRO IV, TIT. III: Singoli contratti ═══

  { min: 1470, max: 1482, tags: ["vendita", "compravendita"] },
  // ★ Art. 1483-1489: garanzia per evizione
  { min: 1483, max: 1489, tags: ["vendita", "garanzia_evizione"] },
  { min: 1490, max: 1497, tags: ["vendita", "vizi_cosa_venduta"] },
  { min: 1498, max: 1536, tags: ["vendita", "compravendita"] },
  { min: 1537, max: 1541, tags: ["vendita_a_corpo", "vendita_a_misura", "rettifica_prezzo"] },
  { min: 1542, max: 1547, tags: ["vendita"] },
  { min: 1548, max: 1555, tags: ["vendita", "vendita_immobiliare"] },
  { min: 1556, max: 1570, tags: ["vendita"] },
  // Locazione — base tag for entire range, then specific sub-ranges override
  { min: 1571, max: 1654, tags: ["locazione"] },
  // ★ Obblighi del locatore (Art. 1575-1581)
  { min: 1575, max: 1581, tags: ["locazione", "obblighi_locatore"] },
  // ★ Obblighi del conduttore (Art. 1587-1590: custodia, restituzione)
  { min: 1587, max: 1590, tags: ["locazione", "obblighi_conduttore"] },
  // ★ Art. 1594-1595: sublocazione / cessione locazione
  { min: 1594, max: 1595, tags: ["locazione", "sublocazione"] },
  // ★ Art. 1596-1606: scioglimento locazione
  { min: 1596, max: 1606, tags: ["locazione", "disdetta"] },
  { min: 1615, max: 1654, tags: ["locazione"] },
  // Appalto
  { min: 1655, max: 1666, tags: ["appalto"] },
  { min: 1667, max: 1668, tags: ["appalto", "difformità_vizi", "collaudo"] },
  { min: 1669, max: 1669, tags: ["appalto", "difformità_vizi", "responsabilità_extracontrattuale"] },
  { min: 1670, max: 1677, tags: ["appalto"] },
  // Trasporto
  { min: 1678, max: 1702, tags: ["trasporto"] },
  // Mandato
  { min: 1703, max: 1741, tags: ["mandato", "procura", "rappresentanza"] },
  // Agenzia
  { min: 1742, max: 1753, tags: ["agenzia", "contratto"] },
  // Mediazione
  { min: 1754, max: 1765, tags: ["mediazione", "contratto"] },
  // Deposito
  { min: 1766, max: 1797, tags: ["deposito"] },
  // Sequestro convenzionale
  { min: 1798, max: 1802, tags: ["sequestro"] },
  // Comodato
  { min: 1803, max: 1812, tags: ["comodato"] },
  // Mutuo
  { min: 1813, max: 1814, tags: ["mutuo", "interessi"] },
  { min: 1815, max: 1815, tags: ["mutuo", "interessi", "usura"] },
  { min: 1816, max: 1822, tags: ["mutuo", "interessi"] },
  // Conto corrente
  { min: 1823, max: 1860, tags: ["conto_corrente"] },
  // Rendita
  { min: 1861, max: 1881, tags: ["rendita"] },
  // Assicurazione
  { min: 1882, max: 1932, tags: ["assicurazione", "polizza"] },
  // Gioco e scommessa
  { min: 1933, max: 1935, tags: ["gioco"] },
  // Fideiussione
  { min: 1936, max: 1959, tags: ["fideiussione", "garanzia_personale"] },
  // Mandato di credito, anticresi
  { min: 1960, max: 1964, tags: ["fideiussione"] },
  { min: 1965, max: 1970, tags: ["anticresi"] },
  // Transazione
  { min: 1965, max: 1976, tags: ["transazione"] },
  // Cessione dei beni ai creditori
  { min: 1977, max: 1986, tags: ["obbligazione"] },
  // Promessa al pubblico, titoli di credito
  { min: 1987, max: 1991, tags: ["promessa"] },
  { min: 1992, max: 2027, tags: ["titoli_credito"] },

  // ═══ LIBRO IV, TIT. VII-IX: Pagamento indebito, arricchimento, fatti illeciti ═══

  // ★ Art. 2028-2032: Gestione di affari
  { min: 2028, max: 2032, tags: ["gestione_affari", "obbligazione"] },
  // ★ Art. 2033-2040: Ripetizione dell'indebito — CROSS-REF: nullità
  { min: 2033, max: 2040, tags: ["indebito", "obbligazione", "nullità"] },
  // ★ Art. 2041-2042: Arricchimento senza causa
  { min: 2041, max: 2042, tags: ["arricchimento_senza_causa", "obbligazione"] },
  // Fatti illeciti — general
  { min: 2043, max: 2046, tags: ["responsabilità_extracontrattuale", "fatto_illecito", "danno", "risarcimento"] },
  // ★ Art. 2047-2048: responsabilità per incapaci/sorveglianti
  { min: 2047, max: 2048, tags: ["responsabilità_extracontrattuale", "danno", "risarcimento"] },
  // ★ Art. 2049-2050: responsabilità padrone/committente, attività pericolose
  { min: 2049, max: 2050, tags: ["responsabilità_extracontrattuale", "danno", "risarcimento"] },
  // ★ Art. 2051: danno da cose in custodia
  { min: 2051, max: 2051, tags: ["responsabilità_extracontrattuale", "custodia", "danno", "risarcimento"] },
  // ★ Art. 2052-2054: animali, rovina edificio, circolazione veicoli
  { min: 2052, max: 2054, tags: ["responsabilità_extracontrattuale", "danno", "risarcimento"] },
  // ★ Art. 2055-2059: concorso, risarcimento, quantificazione
  { min: 2055, max: 2059, tags: ["responsabilità_extracontrattuale", "danno", "risarcimento"] },

  // ═══ LIBRO V: Del lavoro ═══

  // Tit. I: Disciplina delle attività professionali
  { min: 2060, max: 2081, tags: ["imprenditore", "impresa"] },
  { min: 2082, max: 2134, tags: ["imprenditore", "impresa", "azienda"] },
  // ★ Art. 2126: Prestazione di fatto — CROSS-REF: nullità, lavoro_subordinato
  { min: 2126, max: 2126, tags: ["lavoro_subordinato", "contratto_lavoro", "nullità"] },
  // Tit. II: Lavoro subordinato
  { min: 2094, max: 2129, tags: ["lavoro_subordinato", "contratto_lavoro"] },
  { min: 2130, max: 2134, tags: ["lavoro_subordinato", "licenziamento"] },
  // Tit. II, Capo III: Tirocinio, apprendistato
  { min: 2130, max: 2134, tags: ["lavoro_subordinato"] },
  // Tit. III: Lavoro autonomo
  { min: 2222, max: 2238, tags: ["lavoro_autonomo", "contratto_opera"] },
  // Tit. IV: Lavoro nelle PA (abrogato in gran parte)
  { min: 2239, max: 2246, tags: ["lavoro_subordinato"] },
  // Tit. V: Società
  { min: 2247, max: 2324, tags: ["società_semplice"] },
  { min: 2325, max: 2461, tags: ["spa"] },
  { min: 2462, max: 2510, tags: ["srl"] },
  { min: 2511, max: 2554, tags: ["società_semplice"] },
  // Tit. VIII-X: Impresa, azienda, concorrenza
  { min: 2555, max: 2574, tags: ["azienda", "registro_imprese"] },
  { min: 2575, max: 2601, tags: ["impresa"] },
  { min: 2602, max: 2642, tags: ["impresa"] },

  // ═══ LIBRO VI: Della tutela dei diritti ═══

  { min: 2643, max: 2696, tags: ["trascrizione", "vendita_immobiliare"] },
  // ★ Art. 2652 n. 6: trascrizione domanda di nullità — CROSS-REF: nullità
  { min: 2652, max: 2652, tags: ["trascrizione", "vendita_immobiliare", "nullità"] },
  { min: 2697, max: 2783, tags: ["responsabilità_patrimoniale", "garanzia_generica"] },
  { min: 2784, max: 2807, tags: ["pegno", "garanzia_reale"] },
  { min: 2808, max: 2899, tags: ["ipoteca", "garanzia_reale"] },
  { min: 2900, max: 2933, tags: ["responsabilità_patrimoniale"] },
  // Prescrizione — sub-ranges
  { min: 2934, max: 2940, tags: ["prescrizione", "termini"] },
  // ★ Art. 2941-2942: sospensione prescrizione
  { min: 2941, max: 2942, tags: ["prescrizione", "termini"] },
  // ★ Art. 2943-2945: interruzione prescrizione
  { min: 2943, max: 2945, tags: ["prescrizione", "termini"] },
  // ★ Art. 2946-2953: termini di prescrizione (ordinaria 10 anni, brevi)
  { min: 2946, max: 2953, tags: ["prescrizione", "termini"] },
  // ★ Art. 2954-2963: prescrizioni speciali
  { min: 2954, max: 2963, tags: ["prescrizione", "termini"] },
  // ★ Art. 2964-2969: decadenza
  { min: 2964, max: 2969, tags: ["decadenza", "termini"] },
];

// ═══ CODICE DEL CONSUMO ═══

const CDC_TAGS: Record<string, string[]> = {
  "33": ["clausole_abusive", "clausole_vessatorie", "tutela_consumatore", "nullità"],
  "34": ["clausole_abusive", "clausole_vessatorie", "tutela_consumatore"],
  "35": ["clausole_abusive", "tutela_consumatore"],
  "36": ["clausole_abusive", "nullità", "tutela_consumatore"],
  "37": ["clausole_abusive", "tutela_consumatore"],
  "38": ["clausole_abusive", "tutela_consumatore"],
};

// Sub-articoli CdC: tag ridotti (solo i primi 2 del parent)
function getCdcTags(num: number, suffix: string): string[] | null {
  const base = String(num);

  // Exact match for base articles
  if (!suffix && CDC_TAGS[base]) return CDC_TAGS[base];

  // Sub-articles: reduced tags from parent
  if (suffix && CDC_TAGS[base]) return CDC_TAGS[base].slice(0, 2);

  // Range-based for articles outside 33-38
  if (num >= 45 && num <= 67) return ["tutela_consumatore", "recesso"];
  if (num >= 128 && num <= 135) return ["tutela_consumatore", "garanzia_legale", "vizi_cosa_venduta"];

  return null; // Don't override existing tags
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function run() {
  console.log("=== Tagging sistematico v2 ===\n");

  const articles = await fetchAll();
  console.log(`Totale: ${articles.length} articoli\n`);

  const updates = new Map<string, string[]>();

  for (const art of articles) {
    const { num, suffix } = parseRef(art.article_reference);
    if (num === null) continue;

    // ─── CODICE CIVILE ───
    if (art.law_source === "Codice Civile") {
      // Find most specific matching rule (last match wins)
      let best: TagRule | null = null;
      for (const rule of CC) {
        if (num >= rule.min && num <= rule.max) best = rule;
      }
      if (best) {
        const current = JSON.stringify((art.related_institutes ?? []).sort());
        const target = JSON.stringify([...best.tags].sort());
        if (current !== target) {
          updates.set(art.id, [...best.tags]);
        }
      }
    }

    // ─── CODICE DEL CONSUMO ───
    if (art.law_source?.includes("206/2005")) {
      const tags = getCdcTags(num, suffix);
      if (tags) {
        const current = JSON.stringify((art.related_institutes ?? []).sort());
        const target = JSON.stringify([...tags].sort());
        if (current !== target) {
          updates.set(art.id, tags);
        }
      }
    }
  }

  console.log(`Articoli da aggiornare: ${updates.size}\n`);

  // Execute
  let done = 0;
  let errors = 0;
  const entries = [...updates.entries()];

  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    const results = await Promise.all(
      batch.map(([id, tags]) =>
        supabase.from("legal_articles").update({ related_institutes: tags }).eq("id", id)
      )
    );
    for (const r of results) {
      if (r.error) { errors++; if (errors <= 5) console.error("  Error:", r.error.message); }
      else done++;
    }
    process.stdout.write(`  ${done}/${entries.length}\r`);
  }
  console.log(`\n✓ ${done} aggiornati (${errors} errori)\n`);

  // ═══ VERIFICA ═══

  console.log("=== Verifica ===\n");

  // Coverage per libro
  const allAfter = await fetchAll("Codice Civile");
  const books: Record<string, { tagged: number; total: number }> = {
    "I": { tagged: 0, total: 0 },
    "II": { tagged: 0, total: 0 },
    "III": { tagged: 0, total: 0 },
    "IV": { tagged: 0, total: 0 },
    "V": { tagged: 0, total: 0 },
    "VI": { tagged: 0, total: 0 },
  };
  const bookRanges = [[1, 455], [456, 809], [810, 1172], [1173, 2059], [2060, 2642], [2643, 2969]];
  const bookNames = ["I", "II", "III", "IV", "V", "VI"];

  for (const art of allAfter) {
    const { num: n } = parseRef(art.article_reference);
    if (!n) continue;
    for (let b = 0; b < 6; b++) {
      if (n >= bookRanges[b][0] && n <= bookRanges[b][1]) {
        books[bookNames[b]].total++;
        if (art.related_institutes?.length > 0) books[bookNames[b]].tagged++;
      }
    }
  }

  console.log("Coverage per Libro:");
  for (const [name, info] of Object.entries(books)) {
    const pct = info.total > 0 ? Math.round((info.tagged / info.total) * 100) : 0;
    console.log(`  Libro ${name}: ${info.tagged}/${info.total} (${pct}%)`);
  }

  // Cross-reference nullità
  console.log("\nCross-ref nullità (articoli fuori 1418-1424):");
  const crossNullita = [
    { ref: "Art. 128", desc: "matrimonio putativo" },
    { ref: "Art. 1229", desc: "esonero responsabilità" },
    { ref: "Art. 1341", desc: "clausole vessatorie" },
    { ref: "Art. 2033", desc: "ripetizione indebito" },
    { ref: "Art. 2126", desc: "lavoro nullo" },
    { ref: "Art. 2652", desc: "trascrizione domanda nullità" },
  ];

  for (const { ref, desc } of crossNullita) {
    const { data } = await supabase
      .from("legal_articles")
      .select("related_institutes")
      .eq("law_source", "Codice Civile")
      .eq("article_reference", ref)
      .limit(1);
    const inst = data?.[0]?.related_institutes ?? [];
    const has = inst.includes("nullità");
    console.log(`  ${has ? "✓" : "✗"} ${ref} (${desc}): [${inst.join(", ")}]`);
  }

  // Cross-contamination check
  console.log("\nCross-contaminazione:");
  const checks = [
    { ref: "Art. 1414", bad: "nullità", label: "simulazione ≠ nullità" },
    { ref: "Art. 1418", bad: "annullabilità", label: "nullità ≠ annullabilità" },
    { ref: "Art. 1425", bad: "nullità", label: "annullabilità ≠ nullità" },
    { ref: "Art. 1447", bad: "nullità", label: "rescissione ≠ nullità" },
  ];
  for (const { ref, bad, label } of checks) {
    const { data } = await supabase
      .from("legal_articles")
      .select("related_institutes")
      .eq("law_source", "Codice Civile")
      .eq("article_reference", ref)
      .limit(1);
    const has = data?.[0]?.related_institutes?.includes(bad) ?? false;
    console.log(`  ${has ? "✗ PROBLEMA" : "✓ OK"} ${ref}: ${label}`);
  }

  // Testbook target articles verification
  console.log("\nVerifica articoli target testbook:");
  const targets = [
    { ref: "Art. 1337", desc: "buona fede precontrattuale (TC10)" },
    { ref: "Art. 1338", desc: "conoscenza cause invalidità (TC10)" },
    { ref: "Art. 1460", desc: "eccezione inadempimento (TC15)" },
    { ref: "Art. 1483", desc: "garanzia evizione (TC12)" },
    { ref: "Art. 1590", desc: "restituzione immobile (TC13)" },
    { ref: "Art. 1594", desc: "sublocazione (TC14)" },
    { ref: "Art. 2051", desc: "cose in custodia (TC17)" },
    { ref: "Art. 2946", desc: "prescrizione ordinaria (TC19)" },
  ];
  for (const { ref, desc } of targets) {
    const { data } = await supabase
      .from("legal_articles")
      .select("related_institutes")
      .eq("law_source", "Codice Civile")
      .eq("article_reference", ref)
      .limit(1);
    const inst = data?.[0]?.related_institutes ?? [];
    console.log(`  ${inst.length > 0 ? "✓" : "✗"} ${ref} (${desc}): [${inst.join(", ")}]`);
  }

  // Top lookups
  console.log("\nLookup test:");
  for (const inst of [
    "nullità", "interpretazione_contratto", "clausole_vessatorie",
    "simulazione", "annullabilità", "vendita_a_corpo", "indebito",
    "lavoro_subordinato", "garanzia_evizione", "sublocazione",
    "obblighi_conduttore", "buona_fede", "prescrizione", "custodia",
  ]) {
    const { data } = await supabase.rpc("get_articles_by_institute", {
      p_institute: inst,
      p_limit: 20,
    });
    const refs = (data ?? []).map((a: { article_reference: string }) => a.article_reference);
    console.log(`  ${inst}: ${refs.length} → ${refs.slice(0, 8).join(", ")}${refs.length > 8 ? "..." : ""}`);
  }
}

run().catch(console.error);
