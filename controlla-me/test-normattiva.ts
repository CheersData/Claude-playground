/**
 * Test live — Scarica articoli da Normattiva
 *
 * L'API Open Data (api.normattiva.it) non è raggiungibile da sandbox,
 * quindi testiamo il connettore HTML via www.normattiva.it che funziona.
 *
 * Fasi:
 *   1. Scarica 3 articoli singoli dal Codice del Consumo
 *   2. Scarica 3 articoli dal TU Bancario
 *   3. Batch: scarica i primi 5 articoli da ogni codice configurato
 *   4. Normalizza e mostra il risultato CorpusArticle
 *
 * Run: npx tsx test-normattiva.ts
 */

import {
  fetchNormativaArticle,
  buildArticleNumbers,
  NORMATTIVA_SOURCES,
} from "./connectors/normattiva";
import connector from "./connectors/normattiva";

const DIVIDER = "─".repeat(60);

function ok(msg: string) { console.log(`  ✅ ${msg}`); }
function fail(msg: string) { console.log(`  ❌ ${msg}`); }
function info(msg: string) { console.log(`  ℹ️  ${msg}`); }

// ─── Step 1: Scarica 3 articoli dal Codice del Consumo ───

async function testSingleArticles() {
  console.log("\n" + DIVIDER);
  console.log("STEP 1 — Articoli singoli: Codice del Consumo (D.Lgs. 206/2005)");
  console.log(DIVIDER);

  const source = NORMATTIVA_SOURCES.find((s) => s.id === "codice_consumo")!;
  const testArticles = ["1", "2", "3"];

  for (const artNum of testArticles) {
    info(`Scarico Art. ${artNum} da ${source.name}...`);
    const result = await fetchNormativaArticle(source.urn, artNum);

    if (result) {
      ok(`Art. ${result.articleNumber} — ${result.title ?? "(senza titolo)"}`);
      info(`  Testo (${result.text.length} char): ${result.text.slice(0, 150)}...`);
    } else {
      fail(`Art. ${artNum} — non trovato o vuoto`);
    }

    // Rate limiting
    await sleep(500);
  }
}

// ─── Step 2: Scarica 3 articoli dal TU Bancario ───

async function testTUBancario() {
  console.log("\n" + DIVIDER);
  console.log("STEP 2 — Articoli singoli: TU Bancario (D.Lgs. 385/1993)");
  console.log(DIVIDER);

  const source = NORMATTIVA_SOURCES.find((s) => s.id === "tu_bancario")!;
  const testArticles = ["1", "5", "10"];

  for (const artNum of testArticles) {
    info(`Scarico Art. ${artNum} da ${source.name}...`);
    const result = await fetchNormativaArticle(source.urn, artNum);

    if (result) {
      ok(`Art. ${result.articleNumber} — ${result.title ?? "(senza titolo)"}`);
      info(`  Testo (${result.text.length} char): ${result.text.slice(0, 150)}...`);
    } else {
      fail(`Art. ${artNum} — non trovato o vuoto`);
    }

    await sleep(500);
  }
}

// ─── Step 3: Batch — primi 5 articoli da ogni codice ───

async function testBatch() {
  console.log("\n" + DIVIDER);
  console.log("STEP 3 — Batch: primi 5 articoli da ogni codice");
  console.log(DIVIDER);

  const allResults: Array<{ source: string; found: number; failed: number }> = [];

  for (const source of NORMATTIVA_SOURCES) {
    info(`\n📚 ${source.name} — ${source.id}`);
    info(`   URN: ${source.urn}`);

    let found = 0;
    let failed = 0;

    // Solo i primi 5 articoli (numerici, senza bis/ter)
    for (let artNum = 1; artNum <= 5; artNum++) {
      const result = await fetchNormativaArticle(source.urn, String(artNum));

      if (result) {
        found++;
        ok(`  Art. ${artNum}: ${result.text.length} char — "${(result.title ?? "").slice(0, 50)}"`);
      } else {
        failed++;
        fail(`  Art. ${artNum}: non trovato`);
      }

      await sleep(300);
    }

    allResults.push({ source: source.name, found, failed });
    info(`  → ${found}/5 trovati`);
  }

  console.log("\n  📊 Riepilogo batch:");
  for (const r of allResults) {
    const status = r.found > 0 ? "✅" : "❌";
    console.log(`    ${status} ${r.source}: ${r.found}/5 articoli`);
  }

  return allResults;
}

// ─── Step 4: Normalize via connector ───

async function testNormalize() {
  console.log("\n" + DIVIDER);
  console.log("STEP 4 — Normalize: fetch + normalize via connector (limit 10)");
  console.log(DIVIDER);

  info("Chiamo connector.fetch({ limit: 10 })...");
  const records = await connector.fetch({ limit: 10 });
  ok(`Raw records: ${records.length}`);

  const articles = connector.normalize(records);
  ok(`Normalized articles: ${articles.length}`);

  for (const art of articles.slice(0, 5)) {
    console.log();
    info(`${art.articleReference} — ${art.lawSource}`);
    info(`  Titolo: ${art.articleTitle ?? "(nessuno)"}`);
    info(`  In vigore: ${art.isInForce}`);
    info(`  URL: ${art.sourceUrl}`);
    info(`  Testo: ${art.articleText.slice(0, 120)}...`);
  }
}

// ─── Helpers ───

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Main ───

async function main() {
  console.log("═".repeat(60));
  console.log("  NORMATTIVA — Test Live (via HTML scraping)");
  console.log("═".repeat(60));

  const t0 = Date.now();

  // Step 1: Pochi articoli Codice del Consumo
  await testSingleArticles();

  // Step 2: Pochi articoli TU Bancario
  await testTUBancario();

  // Step 3: Batch su tutti i codici
  await testBatch();

  // Step 4: Full connector normalize
  await testNormalize();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log("\n" + "═".repeat(60));
  console.log(`  Test completato in ${elapsed}s`);
  console.log("═".repeat(60));
}

main().catch((err) => {
  console.error("\n❌ ERRORE FATALE:", err);
  process.exit(1);
});
