#!/usr/bin/env npx tsx
/**
 * AUDIT CORPUS — Livello 1: Diagnostica rapida
 *
 * Task: b23286d4 (Data Engineering)
 * Verifica stato del corpus legislativo con query SQL dirette.
 *
 * Dimensioni analizzate:
 * 1. Conteggio per fonte vs attesi
 * 2. Copertura campi: hierarchy, related_institutes, keywords, embedding
 * 3. Contaminazione: HTML entities, garbage UI, testo sospetto
 * 4. Qualita testo: articoli troppo corti, troppo lunghi, vuoti
 * 5. Fonti mancanti
 *
 * Output: report con semafori 🟢🟡🔴
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

// ─── Fonti attese (da corpus-sources.ts) ───

interface ExpectedSource {
  id: string;
  name: string;
  lawSource: string; // come appare in law_source nel DB
  estimatedArticles: number;
  type: "normattiva" | "eurlex";
  hierarchyLevels: string[];
}

const EXPECTED_SOURCES: ExpectedSource[] = [
  { id: "codice_civile", name: "Codice Civile", lawSource: "Codice Civile", estimatedArticles: 3150, type: "normattiva", hierarchyLevels: ["book", "title", "chapter", "section"] },
  { id: "codice_penale", name: "Codice Penale", lawSource: "Codice Penale", estimatedArticles: 767, type: "normattiva", hierarchyLevels: ["book", "title", "chapter", "section"] },
  { id: "codice_consumo", name: "Codice del Consumo", lawSource: "D.Lgs. 206/2005", estimatedArticles: 240, type: "normattiva", hierarchyLevels: ["part", "title", "chapter", "section"] },
  { id: "codice_proc_civile", name: "Codice di Procedura Civile", lawSource: "Codice di Procedura Civile", estimatedArticles: 887, type: "normattiva", hierarchyLevels: ["book", "title", "chapter", "section"] },
  { id: "dlgs_231_2001", name: "D.Lgs. 231/2001", lawSource: "D.Lgs. 231/2001", estimatedArticles: 109, type: "normattiva", hierarchyLevels: ["chapter", "section"] },
  { id: "dlgs_122_2005", name: "D.Lgs. 122/2005", lawSource: "D.Lgs. 122/2005", estimatedArticles: 19, type: "normattiva", hierarchyLevels: ["chapter"] },
  { id: "statuto_lavoratori", name: "Statuto dei Lavoratori", lawSource: "L. 300/1970", estimatedArticles: 41, type: "normattiva", hierarchyLevels: ["title"] },
  { id: "tu_edilizia", name: "TU Edilizia", lawSource: "DPR 380/2001", estimatedArticles: 151, type: "normattiva", hierarchyLevels: ["part", "title", "chapter", "section"] },
  { id: "gdpr", name: "GDPR", lawSource: "GDPR (Reg. 2016/679)", estimatedArticles: 99, type: "eurlex", hierarchyLevels: ["chapter", "section"] },
  { id: "dir_93_13", name: "Dir. Clausole Abusive", lawSource: "Direttiva clausole abusive (93/13/CEE)", estimatedArticles: 11, type: "eurlex", hierarchyLevels: [] },
  { id: "dir_2011_83", name: "Dir. Consumatori", lawSource: "Direttiva diritti dei consumatori (2011/83/UE)", estimatedArticles: 35, type: "eurlex", hierarchyLevels: ["chapter"] },
  { id: "dir_2019_771", name: "Dir. Vendita Beni", lawSource: "Direttiva vendita beni (2019/771/UE)", estimatedArticles: 28, type: "eurlex", hierarchyLevels: ["chapter"] },
  { id: "reg_roma_i", name: "Reg. Roma I", lawSource: "Regolamento Roma I (593/2008)", estimatedArticles: 29, type: "eurlex", hierarchyLevels: ["chapter"] },
  { id: "dsa", name: "DSA", lawSource: "Digital Services Act (Reg. 2022/2065)", estimatedArticles: 93, type: "eurlex", hierarchyLevels: ["chapter", "section"] },
];

// ─── Helper: fetch paginato ───

async function countByLawSource(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data: page } = await supabase
      .from("legal_articles")
      .select("law_source")
      .range(offset, offset + pageSize - 1);
    if (!page || page.length === 0) break;
    for (const row of page) {
      const src = (row as { law_source: string }).law_source;
      counts[src] = (counts[src] ?? 0) + 1;
    }
    offset += page.length;
    if (page.length < pageSize) break;
  }
  return counts;
}

async function countWithCondition(
  field: string,
  condition: "empty_obj" | "empty_arr" | "null" | "not_null"
): Promise<number> {
  let query = supabase
    .from("legal_articles")
    .select("*", { count: "exact", head: true });

  switch (condition) {
    case "empty_obj":
      query = query.eq(field, "{}");
      break;
    case "empty_arr":
      query = query.eq(field, "{}");
      break;
    case "null":
      query = query.is(field, null);
      break;
    case "not_null":
      query = query.not(field, "is", null);
      break;
  }

  const { count } = await query;
  return count ?? 0;
}

async function countIlike(
  field: string,
  pattern: string,
  lawSource?: string
): Promise<number> {
  let query = supabase
    .from("legal_articles")
    .select("*", { count: "exact", head: true })
    .ilike(field, `%${pattern}%`);

  if (lawSource) {
    query = query.eq("law_source", lawSource);
  }

  const { count } = await query;
  return count ?? 0;
}

// ─── Semaforo ───

function semaphore(value: number, greenMax: number, yellowMax: number): string {
  if (value <= greenMax) return "🟢";
  if (value <= yellowMax) return "🟡";
  return "🔴";
}

function coverageSemaphore(pct: number): string {
  if (pct >= 95) return "🟢";
  if (pct >= 70) return "🟡";
  return "🔴";
}

function countSemaphore(actual: number, expected: number): string {
  const ratio = actual / expected;
  if (ratio >= 0.9) return "🟢";
  if (ratio >= 0.5) return "🟡";
  if (actual === 0) return "🔴";
  return "🟡";
}

// ─── MAIN ───

async function runDiagnostics() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║   AUDIT CORPUS — LIVELLO 1: DIAGNOSTICA RAPIDA         ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const startTime = Date.now();

  // ── 1. CONTEGGIO PER FONTE ──

  console.log("═══ 1. CONTEGGIO ARTICOLI PER FONTE ═══\n");

  const { count: totalArticles } = await supabase
    .from("legal_articles")
    .select("*", { count: "exact", head: true });

  console.log(`  Totale articoli nel corpus: ${totalArticles}\n`);

  const dbCounts = await countByLawSource();
  const dbSources = Object.keys(dbCounts);

  // Mappa fonti attese → conteggi DB
  let totalExpected = 0;
  let totalFound = 0;
  let missingSourcesCount = 0;

  console.log("  Fonte                                  | Attesi | Trovati | Delta   | Stato");
  console.log("  " + "─".repeat(85));

  for (const expected of EXPECTED_SOURCES) {
    // Cerca nel DB: match esatto su law_source, o match su source_id
    let actual = dbCounts[expected.lawSource] ?? 0;

    // Se non trovato, cerca tramite source_id
    if (actual === 0) {
      const { count } = await supabase
        .from("legal_articles")
        .select("*", { count: "exact", head: true })
        .eq("source_id", expected.id);
      actual = count ?? 0;
    }

    // Se ancora non trovato, cerca con ilike
    if (actual === 0) {
      for (const [src, cnt] of Object.entries(dbCounts)) {
        if (src.toLowerCase().includes(expected.id.replace(/_/g, " ").toLowerCase()) ||
            src.toLowerCase().includes(expected.name.toLowerCase())) {
          actual = cnt;
          break;
        }
      }
    }

    totalExpected += expected.estimatedArticles;
    totalFound += actual;

    const delta = actual - expected.estimatedArticles;
    const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
    const status = actual === 0 ? "🔴 MANCANTE" : countSemaphore(actual, expected.estimatedArticles);

    if (actual === 0) missingSourcesCount++;

    console.log(
      `  ${expected.name.padEnd(40)} | ${String(expected.estimatedArticles).padStart(6)} | ${String(actual).padStart(7)} | ${deltaStr.padStart(7)} | ${status}`
    );
  }

  console.log("  " + "─".repeat(85));
  console.log(
    `  ${"TOTALE".padEnd(40)} | ${String(totalExpected).padStart(6)} | ${String(totalFound).padStart(7)} | ${(totalFound - totalExpected >= 0 ? "+" : "") + (totalFound - totalExpected)}`.padEnd(7) + "\n"
  );

  // Fonti NON attese nel DB
  const expectedLawSources = new Set(EXPECTED_SOURCES.map(e => e.lawSource));
  const unexpectedSources = dbSources.filter(s => !expectedLawSources.has(s));
  if (unexpectedSources.length > 0) {
    console.log("  ⚠️  Fonti nel DB NON in corpus-sources.ts:");
    for (const src of unexpectedSources) {
      console.log(`     - "${src}" (${dbCounts[src]} articoli)`);
    }
    console.log();
  }

  // ── 2. COPERTURA CAMPI ──

  console.log("═══ 2. COPERTURA CAMPI ═══\n");

  const total = totalArticles ?? 0;

  // Embedding
  const withEmbedding = await countWithCondition("embedding", "not_null");
  const noEmbedding = total - withEmbedding;

  // Hierarchy: {} vuoto
  const emptyHierarchy = await countWithCondition("hierarchy", "empty_obj");

  // Related institutes: {} vuoto
  const emptyInstitutes = await countWithCondition("related_institutes", "empty_arr");

  // Keywords: {} vuoto
  const emptyKeywords = await countWithCondition("keywords", "empty_arr");

  // Article title null
  const noTitle = await countWithCondition("article_title", "null");

  // Source URL null
  const noUrl = await countWithCondition("source_url", "null");

  const fields = [
    { name: "embedding", missing: noEmbedding, desc: "Articoli senza embedding (invisibili al vector search)" },
    { name: "hierarchy", missing: emptyHierarchy, desc: "Articoli senza gerarchia (navigazione rotta)" },
    { name: "related_institutes", missing: emptyInstitutes, desc: "Articoli senza istituti (non trovabili per istituto)" },
    { name: "keywords", missing: emptyKeywords, desc: "Articoli senza keywords" },
    { name: "article_title", missing: noTitle, desc: "Articoli senza titolo" },
    { name: "source_url", missing: noUrl, desc: "Articoli senza URL fonte" },
  ];

  console.log("  Campo               | Presenti | Mancanti | Copertura | Stato");
  console.log("  " + "─".repeat(70));

  for (const f of fields) {
    const present = total - f.missing;
    const pct = total > 0 ? (present / total) * 100 : 0;
    const status = coverageSemaphore(pct);
    console.log(
      `  ${f.name.padEnd(21)} | ${String(present).padStart(8)} | ${String(f.missing).padStart(8)} | ${pct.toFixed(1).padStart(8)}% | ${status}`
    );
  }

  console.log("\n  Dettaglio:");
  for (const f of fields) {
    if (f.missing > 0) {
      console.log(`  ${f.missing > total * 0.1 ? "🔴" : "🟡"} ${f.desc}: ${f.missing}`);
    }
  }
  console.log();

  // ── 3. CONTAMINAZIONE TESTO ──

  console.log("═══ 3. CONTAMINAZIONE TESTO ═══\n");

  // HTML entities
  const htmlEntities = ["&Egrave;", "&egrave;", "&agrave;", "&ograve;", "&ugrave;", "&amp;", "&nbsp;", "&lt;", "&gt;", "&quot;"];
  let totalContaminated = 0;

  console.log("  3a. HTML Entities nel testo:");
  for (const ent of htmlEntities) {
    const cnt = await countIlike("article_text", ent);
    if (cnt > 0) {
      totalContaminated += cnt;
      console.log(`     🔴 "${ent}" → ${cnt} articoli`);
    }
  }
  if (totalContaminated === 0) {
    console.log("     🟢 Nessuna HTML entity trovata");
  }

  // Anche nei titoli
  let titleContaminated = 0;
  console.log("\n  3b. HTML Entities nei titoli:");
  for (const ent of htmlEntities) {
    const cnt = await countIlike("article_title", ent);
    if (cnt > 0) {
      titleContaminated += cnt;
      console.log(`     🔴 "${ent}" → ${cnt} articoli`);
    }
  }
  if (titleContaminated === 0) {
    console.log("     🟢 Nessuna HTML entity nei titoli");
  }

  // Garbage UI patterns
  console.log("\n  3c. Spazzatura UI nel testo:");
  const garbagePatterns = [
    "nascondi", "esporta", "Approfondimenti", "articolo successivo",
    "articolo precedente", "<!-- ", "-->", "<div", "</div>", "<span", "</span>",
    "cookie", "javascript", "onclick"
  ];
  let totalGarbage = 0;
  for (const pat of garbagePatterns) {
    const cnt = await countIlike("article_text", pat);
    if (cnt > 0) {
      totalGarbage += cnt;
      console.log(`     🔴 "${pat}" → ${cnt} articoli`);
    }
  }
  if (totalGarbage === 0) {
    console.log("     🟢 Nessuna spazzatura UI trovata");
  }

  console.log();

  // ── 4. QUALITA TESTO ──

  console.log("═══ 4. QUALITA TESTO ═══\n");

  // Articoli con testo molto corto (< 20 chars)
  // Dobbiamo farlo con una query custom perche Supabase non ha length filter diretto
  // Usiamo un approccio paginato
  let veryShort = 0;
  let short = 0;
  let veryLong = 0;
  let empty = 0;
  let totalTextLength = 0;
  let sampleShort: Array<{ lawSource: string; ref: string; text: string }> = [];
  let sampleLong: Array<{ lawSource: string; ref: string; length: number }> = [];

  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data: page } = await supabase
      .from("legal_articles")
      .select("law_source, article_reference, article_text")
      .range(offset, offset + pageSize - 1);
    if (!page || page.length === 0) break;

    for (const row of page) {
      const r = row as { law_source: string; article_reference: string; article_text: string };
      const len = (r.article_text ?? "").length;
      totalTextLength += len;

      if (len === 0) {
        empty++;
        if (sampleShort.length < 5) sampleShort.push({ lawSource: r.law_source, ref: r.article_reference, text: "(vuoto)" });
      } else if (len < 20) {
        veryShort++;
        if (sampleShort.length < 5) sampleShort.push({ lawSource: r.law_source, ref: r.article_reference, text: r.article_text });
      } else if (len < 50) {
        short++;
      }

      if (len > 10000) {
        veryLong++;
        if (sampleLong.length < 5) sampleLong.push({ lawSource: r.law_source, ref: r.article_reference, length: len });
      }
    }

    offset += page.length;
    if (page.length < pageSize) break;
  }

  const avgLength = total > 0 ? Math.round(totalTextLength / total) : 0;

  console.log(`  Lunghezza media testo: ${avgLength} caratteri`);
  console.log(`  ${semaphore(empty, 0, 5)} Articoli vuoti (0 chars): ${empty}`);
  console.log(`  ${semaphore(veryShort, 0, 10)} Articoli molto corti (<20 chars): ${veryShort}`);
  console.log(`  ${semaphore(short, 10, 50)} Articoli corti (<50 chars): ${short}`);
  console.log(`  ${veryLong > 0 ? "🟡" : "🟢"} Articoli molto lunghi (>10k chars): ${veryLong}`);

  if (sampleShort.length > 0) {
    console.log("\n  Campione articoli corti/vuoti:");
    for (const s of sampleShort) {
      console.log(`     ${s.lawSource} ${s.ref}: "${s.text.slice(0, 80)}"`);
    }
  }

  if (sampleLong.length > 0) {
    console.log("\n  Campione articoli molto lunghi:");
    for (const s of sampleLong) {
      console.log(`     ${s.lawSource} ${s.ref}: ${s.length} chars`);
    }
  }

  console.log();

  // ── 5. FONTI MANCANTI ──

  console.log("═══ 5. FONTI MANCANTI E STATO ═══\n");

  for (const expected of EXPECTED_SOURCES) {
    let actual = dbCounts[expected.lawSource] ?? 0;
    if (actual === 0) {
      // Prova source_id
      const { count } = await supabase
        .from("legal_articles")
        .select("*", { count: "exact", head: true })
        .eq("source_id", expected.id);
      actual = count ?? 0;
    }

    if (actual === 0) {
      console.log(`  🔴 ${expected.name} (${expected.lawSource}) — MANCANTE nel DB`);
    }
  }

  if (missingSourcesCount === 0) {
    console.log("  🟢 Tutte le fonti attese sono presenti nel DB");
  }

  console.log();

  // ── 6. COPERTURA EMBEDDING PER FONTE ──

  console.log("═══ 6. COPERTURA EMBEDDING PER FONTE ═══\n");

  // Paginato: leggi law_source + embedding IS NOT NULL
  const embeddingBySource: Record<string, { total: number; withEmb: number }> = {};
  offset = 0;
  while (true) {
    const { data: page } = await supabase
      .from("legal_articles")
      .select("law_source, embedding")
      .range(offset, offset + pageSize - 1);
    if (!page || page.length === 0) break;

    for (const row of page) {
      const r = row as { law_source: string; embedding: unknown };
      if (!embeddingBySource[r.law_source]) {
        embeddingBySource[r.law_source] = { total: 0, withEmb: 0 };
      }
      embeddingBySource[r.law_source].total++;
      if (r.embedding != null) {
        embeddingBySource[r.law_source].withEmb++;
      }
    }

    offset += page.length;
    if (page.length < pageSize) break;
  }

  console.log("  Fonte                                  | Totali | Con Emb | Copertura | Stato");
  console.log("  " + "─".repeat(80));

  for (const [src, info] of Object.entries(embeddingBySource).sort((a, b) => b[1].total - a[1].total)) {
    const pct = info.total > 0 ? (info.withEmb / info.total) * 100 : 0;
    console.log(
      `  ${src.padEnd(40)} | ${String(info.total).padStart(6)} | ${String(info.withEmb).padStart(7)} | ${pct.toFixed(1).padStart(8)}% | ${coverageSemaphore(pct)}`
    );
  }

  console.log();

  // ── RIEPILOGO ──

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║                    RIEPILOGO L1                         ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const issues: Array<{ severity: "🔴" | "🟡" | "🟢"; message: string }> = [];

  // Conteggio
  if (missingSourcesCount > 0) issues.push({ severity: "🔴", message: `${missingSourcesCount} fonte/i mancante/i nel DB` });
  if (totalFound < totalExpected * 0.8) issues.push({ severity: "🔴", message: `Solo ${totalFound}/${totalExpected} articoli attesi (${((totalFound / totalExpected) * 100).toFixed(0)}%)` });
  if (unexpectedSources.length > 0) issues.push({ severity: "🟡", message: `${unexpectedSources.length} fonte/i nel DB non censite in corpus-sources.ts` });

  // Copertura campi
  if (noEmbedding > total * 0.05) issues.push({ severity: "🔴", message: `${noEmbedding} articoli senza embedding (${((noEmbedding / total) * 100).toFixed(1)}%)` });
  if (emptyHierarchy > total * 0.3) issues.push({ severity: "🔴", message: `${emptyHierarchy} articoli senza gerarchia (${((emptyHierarchy / total) * 100).toFixed(1)}%)` });
  else if (emptyHierarchy > total * 0.1) issues.push({ severity: "🟡", message: `${emptyHierarchy} articoli senza gerarchia (${((emptyHierarchy / total) * 100).toFixed(1)}%)` });
  if (emptyInstitutes > total * 0.5) issues.push({ severity: "🟡", message: `${emptyInstitutes} articoli senza istituti (${((emptyInstitutes / total) * 100).toFixed(1)}%)` });

  // Contaminazione
  if (totalContaminated > 0) issues.push({ severity: "🔴", message: `${totalContaminated} articoli con HTML entities nel testo` });
  if (totalGarbage > 0) issues.push({ severity: "🔴", message: `${totalGarbage} articoli con spazzatura UI` });

  // Qualita
  if (empty > 0) issues.push({ severity: "🔴", message: `${empty} articoli con testo vuoto` });
  if (veryShort > 10) issues.push({ severity: "🟡", message: `${veryShort} articoli con testo < 20 chars` });

  if (issues.length === 0) {
    console.log("  🟢 Nessun problema critico trovato!\n");
  } else {
    // Ordina: prima rossi, poi gialli
    issues.sort((a, b) => (a.severity === "🔴" ? -1 : 1) - (b.severity === "🔴" ? -1 : 1));
    for (const issue of issues) {
      console.log(`  ${issue.severity} ${issue.message}`);
    }
    console.log();
  }

  const criticalCount = issues.filter(i => i.severity === "🔴").length;
  const warningCount = issues.filter(i => i.severity === "🟡").length;

  console.log(`  Problemi critici: ${criticalCount} | Warning: ${warningCount} | Tempo: ${elapsed}s`);
  console.log();
}

runDiagnostics().catch(console.error);
