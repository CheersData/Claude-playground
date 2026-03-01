/**
 * FIX CORPUS L2 — Script di correzione dati corpus legislativo
 *
 * Basato sui risultati dell'audit L1 (scripts/audit-corpus-l1.ts).
 * Esegue 4 operazioni in sequenza:
 *
 * 1. NORMALIZZAZIONE NOMI — Allinea law_source ai nomi canonici di corpus-sources.ts
 * 2. DEDUPLICAZIONE — Rimuove articoli duplicati (stesso source + reference con nomi diversi)
 * 3. PULIZIA UI GARBAGE — Rimuove testo navigazione Normattiva da article_text
 * 4. DECODIFICA HTML ENTITIES — Converte &egrave; → è, ecc. in testo e titoli
 *
 * Uso:
 *   npx tsx scripts/fix-corpus-l2.ts              # Dry run (mostra cosa farebbe)
 *   npx tsx scripts/fix-corpus-l2.ts --apply       # Applica le modifiche
 *   npx tsx scripts/fix-corpus-l2.ts --apply --step 2  # Esegue solo step 2
 *
 * Task: Architecture b5548025 (design) + Data Engineering ee878481 (implementazione)
 */

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import { ALL_SOURCES } from "./corpus-sources";

// ─── Supabase client ───

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── CLI args ───

const args = process.argv.slice(2);
const dryRun = !args.includes("--apply");
const stepOnly = args.includes("--step") ? parseInt(args[args.indexOf("--step") + 1]) : null;

// ─── Step 1: Normalizzazione nomi ───

/**
 * Mappa TUTTI i nomi trovati nel DB verso il nome canonico (corpus-sources.ts `name`).
 * Includi ogni variante scoperta dall'audit L1.
 */
const NAME_NORMALIZATION: Record<string, string> = {};

// Genera automaticamente: shortName → name, per ogni source
for (const src of ALL_SOURCES) {
  // Il nome canonico è src.name
  NAME_NORMALIZATION[src.name] = src.name; // identità
  if (src.shortName !== src.name) {
    NAME_NORMALIZATION[src.shortName] = src.name;
  }
}

// Override manuali per varianti extra trovate nell'audit L1
Object.assign(NAME_NORMALIZATION, {
  // Codice Penale
  "c.p.": "Codice Penale",
  "Codice Penale": "Codice Penale",

  // Codice di Procedura Civile
  "c.p.c.": "Codice di Procedura Civile",

  // Codice del Consumo — D.Lgs. 206/2005 è la stessa fonte
  "D.Lgs. 206/2005": "Codice del Consumo",
  "Cod. Consumo": "Codice del Consumo",

  // D.Lgs. 231/2001
  "D.Lgs. 231/2001": "Responsabilita amministrativa enti",
  "Responsabilita amministrativa enti": "Responsabilita amministrativa enti",

  // D.Lgs. 122/2005
  "D.Lgs. 122/2005": "Tutela acquirenti immobili da costruire",
  "Tutela acquirenti immobili da costruire": "Tutela acquirenti immobili da costruire",

  // Statuto dei Lavoratori
  "L. 300/1970": "Statuto dei Lavoratori",
  "Statuto dei Lavoratori": "Statuto dei Lavoratori",

  // Testo Unico Edilizia
  "DPR 380/2001": "Testo Unico Edilizia",
  "Testo Unico Edilizia": "Testo Unico Edilizia",

  // GDPR
  "GDPR": "GDPR (Reg. 2016/679)",
  "Reg. UE 2016/679 (GDPR)": "GDPR (Reg. 2016/679)",
  "GDPR (Reg. 2016/679)": "GDPR (Reg. 2016/679)",

  // DSA
  "DSA": "Digital Services Act (Reg. 2022/2065)",
  "Reg. UE 2022/2065 (DSA)": "Digital Services Act (Reg. 2022/2065)",
  "Digital Services Act (Reg. 2022/2065)": "Digital Services Act (Reg. 2022/2065)",

  // Dir. clausole abusive
  "Dir. 93/13": "Direttiva clausole abusive (93/13/CEE)",
  "Direttiva clausole abusive (93/13/CEE)": "Direttiva clausole abusive (93/13/CEE)",

  // Dir. consumatori
  "Dir. 2011/83": "Direttiva diritti dei consumatori (2011/83/UE)",
  "Dir. 2011/83/UE": "Direttiva diritti dei consumatori (2011/83/UE)",
  "Direttiva diritti dei consumatori (2011/83/UE)": "Direttiva diritti dei consumatori (2011/83/UE)",

  // Dir. vendita beni
  "Dir. 2019/771": "Direttiva vendita beni (2019/771/UE)",
  "Dir. 2019/771/UE": "Direttiva vendita beni (2019/771/UE)",
  "Direttiva vendita beni (2019/771/UE)": "Direttiva vendita beni (2019/771/UE)",

  // Regolamento Roma I
  "Roma I": "Regolamento Roma I (593/2008)",
  "Reg. CE 593/2008 (Roma I)": "Regolamento Roma I (593/2008)",
  "Regolamento Roma I (593/2008)": "Regolamento Roma I (593/2008)",
});

// Genera source_id lookup dal canonical name
const CANONICAL_TO_SOURCE_ID: Record<string, string> = {};
for (const src of ALL_SOURCES) {
  CANONICAL_TO_SOURCE_ID[src.name] = src.id;
}

// ─── Step 3: UI Garbage patterns ───

/**
 * Pattern Normattiva da rimuovere (navigazione UI inclusa nel testo articoli).
 * Ordine: prima i pattern più lunghi.
 */
const UI_GARBAGE_PATTERNS = [
  // Navigazione articoli
  /\s*articolo\s+successivo\s*/gi,
  /\s*articolo\s+precedente\s*/gi,
  /\s*Approfondimenti\s*/g,
  // Bottoni UI
  /\s*nascondi\s*/gi,
  /\s*esporta\s*/gi,
  // HTML comments
  /\s*-->\s*/g,
  // Cookie banner (raro, 4 articoli)
  /\s*Questo sito utilizza cookie[^.]*\.\s*/gi,
  /\s*cookie\s+policy\s*/gi,
  // Javascript (raro)
  /\s*javascript:[^\s]*/gi,
  // Pulizia residua: righe con solo punteggiatura/spazi
  /^\s*[.\-–—]+\s*$/gm,
];

// ─── Step 4: HTML Entities ───

const HTML_ENTITY_MAP: Record<string, string> = {
  "&Egrave;": "È",
  "&egrave;": "è",
  "&Eacute;": "É",
  "&eacute;": "é",
  "&Agrave;": "À",
  "&agrave;": "à",
  "&Ograve;": "Ò",
  "&ograve;": "ò",
  "&Ugrave;": "Ù",
  "&ugrave;": "ù",
  "&Igrave;": "Ì",
  "&igrave;": "ì",
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&#x27;": "'",
};

// ─── Utility ───

function cleanUIGarbage(text: string): string {
  let cleaned = text;
  for (const pattern of UI_GARBAGE_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }
  // Normalizza spazi multipli
  cleaned = cleaned.replace(/[ \t]+/g, " ");
  // Normalizza newline multipli
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

function decodeHtmlEntities(text: string): string {
  let decoded = text;
  for (const [entity, char] of Object.entries(HTML_ENTITY_MAP)) {
    decoded = decoded.replaceAll(entity, char);
  }
  return decoded;
}

// ─── Paginazione Supabase ───

async function fetchAllArticles(
  select: string,
  filter?: { column: string; value: string }
): Promise<Array<Record<string, unknown>>> {
  const PAGE_SIZE = 1000;
  let all: Array<Record<string, unknown>> = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("legal_articles")
      .select(select)
      .range(offset, offset + PAGE_SIZE - 1);

    if (filter) {
      query = query.eq(filter.column, filter.value);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      all = all.concat(data as unknown as Array<Record<string, unknown>>);
      offset += PAGE_SIZE;
      if (data.length < PAGE_SIZE) hasMore = false;
    }
  }

  return all;
}

// ─── Step Runners ───

async function step1_normalizeNames() {
  console.log("\n═══ STEP 1: NORMALIZZAZIONE NOMI law_source ═══\n");

  // Fetch distinct law_source values
  const articles = await fetchAllArticles("law_source");
  const distinctSources = [...new Set(articles.map((a) => a.law_source as string))];

  console.log(`  Fonti distinte nel DB: ${distinctSources.length}`);
  console.log("");

  const renames: Array<{ from: string; to: string; count: number }> = [];
  const unknown: string[] = [];

  for (const source of distinctSources) {
    const canonical = NAME_NORMALIZATION[source];
    if (!canonical) {
      unknown.push(source);
    } else if (canonical !== source) {
      const count = articles.filter((a) => a.law_source === source).length;
      renames.push({ from: source, to: canonical, count });
    }
  }

  if (renames.length === 0) {
    console.log("  ✅ Tutti i nomi sono già canonici. Nessuna modifica.");
    return;
  }

  console.log(`  Rinominazioni necessarie: ${renames.length}\n`);
  for (const r of renames) {
    console.log(`    "${r.from}" → "${r.to}" (${r.count} articoli)`);
  }

  if (unknown.length > 0) {
    console.log(`\n  ⚠️  Fonti non riconosciute (non toccate):`);
    for (const u of unknown) {
      const count = articles.filter((a) => a.law_source === u).length;
      console.log(`    "${u}" (${count} articoli)`);
    }
  }

  if (!dryRun) {
    console.log("\n  Applico rinominazioni...");
    for (const r of renames) {
      const sourceId = CANONICAL_TO_SOURCE_ID[r.to];
      const { error, count } = await supabase
        .from("legal_articles")
        .update({
          law_source: r.to,
          source_name: r.to,
          ...(sourceId ? { source_id: sourceId } : {}),
        })
        .eq("law_source", r.from);

      if (error) {
        console.error(`    ❌ Errore rinominando "${r.from}": ${error.message}`);
      } else {
        console.log(`    ✅ "${r.from}" → "${r.to}" (${count ?? r.count} righe)`);
      }
    }
  } else {
    console.log("\n  [DRY RUN] Nessuna modifica applicata.");
  }
}

async function step2_deduplicate() {
  console.log("\n═══ STEP 2: DEDUPLICAZIONE ARTICOLI ═══\n");

  // Cerchiamo duplicati usando il NOME CANONICO (post-normalizzazione).
  // Così rileviamo collisioni PRIMA che step 1 le crei.
  const articles = await fetchAllArticles("id, law_source, article_reference, embedding, hierarchy, related_institutes, article_text");

  // Raggruppa per (canonical_law_source, article_reference)
  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const a of articles) {
    const canonicalName = NAME_NORMALIZATION[a.law_source as string] || (a.law_source as string);
    const key = `${canonicalName}||${a.article_reference}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  const duplicateGroups = [...groups.entries()].filter(([, v]) => v.length > 1);

  if (duplicateGroups.length === 0) {
    console.log("  ✅ Nessun duplicato trovato.");
    return;
  }

  console.log(`  Gruppi duplicati: ${duplicateGroups.length}`);

  let totalToDelete = 0;
  const toDelete: string[] = [];

  for (const [key, rows] of duplicateGroups) {
    // Strategia: tieni la riga con più metadata (embedding + hierarchy + institutes + text più lungo)
    const scored = rows.map((r) => ({
      id: r.id as string,
      score:
        (r.embedding ? 10 : 0) +
        (r.hierarchy && Object.keys(r.hierarchy as object).length > 0 ? 5 : 0) +
        (r.related_institutes && (r.related_institutes as string[]).length > 0 ? 3 : 0) +
        ((r.article_text as string)?.length ?? 0) / 1000,
    }));

    scored.sort((a, b) => b.score - a.score);

    // Tieni il primo (score più alto), elimina gli altri
    const keepId = scored[0].id;
    const deleteIds = scored.slice(1).map((s) => s.id);

    if (deleteIds.length > 0) {
      const [source, ref] = key.split("||");
      if (duplicateGroups.length <= 20) {
        console.log(`    ${source} ${ref}: tieni ${keepId.slice(0, 8)}, elimina ${deleteIds.length} duplicati`);
      }
      toDelete.push(...deleteIds);
      totalToDelete += deleteIds.length;
    }
  }

  console.log(`\n  Articoli da eliminare: ${totalToDelete}`);

  if (!dryRun && toDelete.length > 0) {
    console.log("  Elimino duplicati...");
    // Batch delete in chunks di 100
    for (let i = 0; i < toDelete.length; i += 100) {
      const chunk = toDelete.slice(i, i + 100);
      const { error, count } = await supabase
        .from("legal_articles")
        .delete()
        .in("id", chunk);

      if (error) {
        console.error(`    ❌ Errore eliminando batch ${i}: ${error.message}`);
      } else {
        console.log(`    ✅ Batch ${Math.floor(i / 100) + 1}: eliminati ${count ?? chunk.length}`);
      }
    }
  } else {
    console.log("  [DRY RUN] Nessuna eliminazione applicata.");
  }
}

async function step3_cleanUIGarbage() {
  console.log("\n═══ STEP 3: PULIZIA UI GARBAGE ═══\n");

  // Cerca articoli contaminati (usiamo text search con pattern principali)
  const contaminated = await fetchAllArticles("id, law_source, article_reference, article_text");

  const toClean: Array<{ id: string; ref: string; original: string; cleaned: string }> = [];

  for (const a of contaminated) {
    const text = a.article_text as string;
    if (!text) continue;

    const cleaned = cleanUIGarbage(text);
    if (cleaned !== text) {
      toClean.push({
        id: a.id as string,
        ref: `${a.law_source} ${a.article_reference}`,
        original: text,
        cleaned,
      });
    }
  }

  if (toClean.length === 0) {
    console.log("  ✅ Nessuna contaminazione UI trovata.");
    return;
  }

  console.log(`  Articoli da pulire: ${toClean.length}`);

  // Mostra campione
  const sample = toClean.slice(0, 3);
  for (const s of sample) {
    const removedChars = s.original.length - s.cleaned.length;
    console.log(`    ${s.ref}: -${removedChars} chars`);
  }
  if (toClean.length > 3) {
    console.log(`    ... e altri ${toClean.length - 3} articoli`);
  }

  if (!dryRun) {
    console.log("\n  Applico pulizia...");
    let success = 0;
    let errors = 0;

    // Batch update in chunks di 50 (ogni update è individuale per via di testo diverso)
    for (let i = 0; i < toClean.length; i++) {
      const item = toClean[i];
      const { error } = await supabase
        .from("legal_articles")
        .update({ article_text: item.cleaned })
        .eq("id", item.id);

      if (error) {
        errors++;
        if (errors <= 5) console.error(`    ❌ ${item.ref}: ${error.message}`);
      } else {
        success++;
      }

      // Progress ogni 200
      if ((i + 1) % 200 === 0) {
        console.log(`    ... ${i + 1}/${toClean.length} processati (${success} ok, ${errors} errori)`);
      }
    }

    console.log(`  ✅ Pulizia completata: ${success} ok, ${errors} errori`);
  } else {
    console.log("  [DRY RUN] Nessuna pulizia applicata.");
  }
}

async function step4_decodeEntities() {
  console.log("\n═══ STEP 4: DECODIFICA HTML ENTITIES ═══\n");

  const articles = await fetchAllArticles("id, law_source, article_reference, article_text, article_title");

  const toFix: Array<{
    id: string;
    ref: string;
    newText?: string;
    newTitle?: string;
  }> = [];

  const entityPattern = new RegExp(
    Object.keys(HTML_ENTITY_MAP)
      .map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|"),
    "g"
  );

  for (const a of articles) {
    const text = a.article_text as string;
    const title = a.article_title as string;
    let needsFix = false;
    const fix: { id: string; ref: string; newText?: string; newTitle?: string } = {
      id: a.id as string,
      ref: `${a.law_source} ${a.article_reference}`,
    };

    if (text && entityPattern.test(text)) {
      fix.newText = decodeHtmlEntities(text);
      needsFix = true;
      entityPattern.lastIndex = 0;
    }
    if (title && entityPattern.test(title)) {
      fix.newTitle = decodeHtmlEntities(title);
      needsFix = true;
      entityPattern.lastIndex = 0;
    }

    if (needsFix) toFix.push(fix);
  }

  if (toFix.length === 0) {
    console.log("  ✅ Nessuna HTML entity trovata.");
    return;
  }

  const textFixes = toFix.filter((f) => f.newText).length;
  const titleFixes = toFix.filter((f) => f.newTitle).length;
  console.log(`  Articoli con entities: ${toFix.length} (${textFixes} nel testo, ${titleFixes} nei titoli)`);

  if (!dryRun) {
    console.log("  Applico decodifica...");
    let success = 0;
    let errors = 0;

    for (const item of toFix) {
      const update: Record<string, string> = {};
      if (item.newText) update.article_text = item.newText;
      if (item.newTitle) update.article_title = item.newTitle;

      const { error } = await supabase
        .from("legal_articles")
        .update(update)
        .eq("id", item.id);

      if (error) {
        errors++;
        if (errors <= 3) console.error(`    ❌ ${item.ref}: ${error.message}`);
      } else {
        success++;
      }
    }

    console.log(`  ✅ Decodifica completata: ${success} ok, ${errors} errori`);
  } else {
    console.log("  [DRY RUN] Nessuna decodifica applicata.");
  }
}

// ─── Main ───

async function main() {
  const startTime = Date.now();

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   FIX CORPUS L2 — Correzione dati corpus legislativo   ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  Modalita: ${dryRun ? "🔍 DRY RUN (preview)" : "🔧 APPLY (modifiche reali)"}`);
  if (stepOnly) console.log(`  Step singolo: ${stepOnly}`);

  // ORDINE CRITICO: dedup PRIMA di rename, altrimenti il rename viola il UNIQUE constraint
  const steps = [
    { num: 1, fn: step2_deduplicate },    // Elimina duplicati (usando nomi canonici)
    { num: 2, fn: step1_normalizeNames },  // Rinomina senza conflitti
    { num: 3, fn: step3_cleanUIGarbage },
    { num: 4, fn: step4_decodeEntities },
  ];

  for (const step of steps) {
    if (stepOnly && step.num !== stepOnly) continue;
    try {
      await step.fn();
    } catch (err) {
      console.error(`\n  ❌ ERRORE nello step ${step.num}:`, (err as Error).message);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n  Tempo totale: ${elapsed}s`);

  if (dryRun) {
    console.log("\n  ⚠️  Per applicare le modifiche: npx tsx scripts/fix-corpus-l2.ts --apply");
  }
}

main().catch(console.error);
