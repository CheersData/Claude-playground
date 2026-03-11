/**
 * run-migration-028-fix.ts — Fix per fonti con shortName diverso dal name.
 *
 * La migration 028 principale ha aggiornato 1,921 articoli ma ha mancato
 * le fonti il cui law_source nel DB è lo shortName (non il name).
 *
 * Usage: npx tsx scripts/run-migration-028-fix.ts [--dry-run]
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

interface Rule {
  source: string | string[];
  range?: [number, number];
  exact?: number;
  institutes: string[];
  onlyIfEmpty?: boolean;
}

function extractArticleNumber(ref: string): number | null {
  const part = ref.split("-")[0];
  const digits = part.replace(/[^0-9]/g, "");
  return digits ? parseInt(digits, 10) : null;
}

// ─── Rules for MISSED sources (using actual DB law_source values) ───

const rules: Rule[] = [
  // ═══ D.Lgs. 28/2010 — Mediazione (DB: "D.Lgs. 28/2010") ═══
  { source: "D.Lgs. 28/2010", range: [1, 4], institutes: ["mediazione", "mediazione_obbligatoria"] },
  { source: "D.Lgs. 28/2010", exact: 5, institutes: ["mediazione", "mediazione_obbligatoria", "condizione_procedibilita"] },
  { source: "D.Lgs. 28/2010", range: [6, 7], institutes: ["mediazione", "mediazione_obbligatoria"] },
  { source: "D.Lgs. 28/2010", exact: 8, institutes: ["mediazione", "mediazione_obbligatoria", "mancata_partecipazione_mediazione", "sanzione_mediazione"] },
  { source: "D.Lgs. 28/2010", range: [9, 13], institutes: ["mediazione", "accordo_mediazione"] },
  { source: "D.Lgs. 28/2010", range: [14, 50], institutes: ["mediazione"], onlyIfEmpty: true },

  // ═══ L. 431/1998 — Locazioni abitative (DB: "L. 431/1998") ═══
  { source: "L. 431/1998", range: [1, 2], institutes: ["locazione", "locazione_abitativa"] },
  { source: "L. 431/1998", range: [3, 4], institutes: ["locazione", "locazione_abitativa", "durata_locazione", "rinnovo_contratto"] },
  { source: "L. 431/1998", exact: 5, institutes: ["locazione", "locazione_abitativa", "canone_concordato"] },
  { source: "L. 431/1998", range: [6, 18], institutes: ["locazione", "locazione_abitativa"], onlyIfEmpty: true },

  // ═══ TUB (DB: "TUB D.Lgs. 385/1993") ═══
  { source: "TUB D.Lgs. 385/1993", range: [1, 10], institutes: ["bancario", "credito"] },
  { source: "TUB D.Lgs. 385/1993", range: [115, 120], institutes: ["bancario", "trasparenza_bancaria"] },
  { source: "TUB D.Lgs. 385/1993", range: [121, 128], institutes: ["bancario", "credito_consumo", "tutela_consumatore"] },
  { source: "TUB D.Lgs. 385/1993", range: [129, 143], institutes: ["bancario", "mutuo_fondiario"], onlyIfEmpty: true },
  // Catch-all for remaining
  { source: "TUB D.Lgs. 385/1993", range: [1, 500], institutes: ["bancario"], onlyIfEmpty: true },

  // ═══ L. 590/1965 — Prelazione agraria (DB: "L. 590/1965") ═══
  { source: "L. 590/1965", exact: 8, institutes: ["prelazione_agraria", "riscatto_agrario", "affittuario_coltivatore"] },
  { source: "L. 590/1965", range: [1, 50], institutes: ["prelazione_agraria", "riscatto_agrario"], onlyIfEmpty: true },

  // ═══ Reg. CE 261/2004 — Passeggeri aerei (DB: "Reg. CE 261/2004") ═══
  { source: "Reg. CE 261/2004", range: [1, 4], institutes: ["passeggeri_aerei", "trasporto_aereo"] },
  { source: "Reg. CE 261/2004", exact: 5, institutes: ["passeggeri_aerei", "cancellazione_volo", "compensazione_pecuniaria"] },
  { source: "Reg. CE 261/2004", exact: 6, institutes: ["passeggeri_aerei", "ritardo_volo", "assistenza_passeggero"] },
  { source: "Reg. CE 261/2004", exact: 7, institutes: ["passeggeri_aerei", "compensazione_pecuniaria"] },
  { source: "Reg. CE 261/2004", range: [8, 9], institutes: ["passeggeri_aerei", "rimborso", "assistenza_passeggero"] },
  { source: "Reg. CE 261/2004", range: [1, 20], institutes: ["passeggeri_aerei"], onlyIfEmpty: true },

  // ═══ NIS2 (DB: "NIS2") ═══
  { source: "NIS2", range: [1, 50], institutes: ["cybersicurezza", "NIS2"], onlyIfEmpty: true },

  // ═══ AI Act (DB: "AI Act") ═══
  { source: "AI Act", range: [1, 4], institutes: ["intelligenza_artificiale", "AI_Act"] },
  { source: "AI Act", exact: 5, institutes: ["intelligenza_artificiale", "AI_Act", "AI_vietata"] },
  { source: "AI Act", range: [6, 49], institutes: ["intelligenza_artificiale", "AI_Act", "AI_alto_rischio"] },
  { source: "AI Act", range: [50, 56], institutes: ["intelligenza_artificiale", "AI_Act", "trasparenza_AI"] },
  { source: "AI Act", range: [1, 120], institutes: ["intelligenza_artificiale", "AI_Act"], onlyIfEmpty: true },

  // ═══ T.U. Sicurezza — D.Lgs. 81/2008 (DB: "T.U. Sicurezza") ═══
  { source: "T.U. Sicurezza", range: [1, 4], institutes: ["sicurezza_lavoro", "datore_lavoro"] },
  { source: "T.U. Sicurezza", range: [15, 20], institutes: ["sicurezza_lavoro", "datore_lavoro", "valutazione_rischi", "DVR"] },
  { source: "T.U. Sicurezza", range: [28, 30], institutes: ["sicurezza_lavoro", "DVR", "valutazione_rischi"] },
  { source: "T.U. Sicurezza", range: [31, 35], institutes: ["sicurezza_lavoro", "RSPP"] },
  { source: "T.U. Sicurezza", range: [36, 37], institutes: ["sicurezza_lavoro", "formazione_sicurezza"] },
  { source: "T.U. Sicurezza", range: [41, 44], institutes: ["sicurezza_lavoro", "sorveglianza_sanitaria", "medico_competente"] },
  { source: "T.U. Sicurezza", range: [47, 50], institutes: ["sicurezza_lavoro", "RLS"] },
  { source: "T.U. Sicurezza", range: [1, 400], institutes: ["sicurezza_lavoro"], onlyIfEmpty: true },

  // ═══ Jobs Act Contratti — D.Lgs. 81/2015 (DB: "Jobs Act Contratti") ═══
  { source: "Jobs Act Contratti", range: [1, 12], institutes: ["lavoro_subordinato", "contratto_lavoro", "tempo_indeterminato"] },
  { source: "Jobs Act Contratti", range: [13, 29], institutes: ["lavoro_subordinato", "contratto_lavoro", "tempo_determinato"] },
  { source: "Jobs Act Contratti", range: [30, 40], institutes: ["lavoro_subordinato", "somministrazione_lavoro"] },
  { source: "Jobs Act Contratti", range: [41, 47], institutes: ["lavoro_subordinato", "apprendistato"] },
  { source: "Jobs Act Contratti", range: [48, 53], institutes: ["lavoro_subordinato", "part_time"] },
  { source: "Jobs Act Contratti", range: [1, 70], institutes: ["lavoro_subordinato", "contratto_lavoro"], onlyIfEmpty: true },

  // ═══ Biagi — D.Lgs. 276/2003 (DB: "Biagi" AND "D.Lgs. 276/2003") ═══
  { source: ["Biagi", "D.Lgs. 276/2003"], range: [1, 90], institutes: ["lavoro_subordinato", "mercato_lavoro", "lavoro_flessibile"], onlyIfEmpty: true },

  // ═══ Jobs Act — D.Lgs. 23/2015 (DB: "Jobs Act" AND "D.Lgs. 23/2015") ═══
  { source: ["Jobs Act", "D.Lgs. 23/2015"], range: [1, 5], institutes: ["lavoro_subordinato", "licenziamento", "licenziamento_illegittimo", "tutele_crescenti"] },
  { source: ["Jobs Act", "D.Lgs. 23/2015"], range: [6, 8], institutes: ["lavoro_subordinato", "licenziamento", "conciliazione", "tutele_crescenti"] },
  { source: ["Jobs Act", "D.Lgs. 23/2015"], range: [1, 15], institutes: ["lavoro_subordinato", "licenziamento", "tutele_crescenti"], onlyIfEmpty: true },

  // ═══ CIG — D.Lgs. 148/2015 (DB: "CIG") ═══
  { source: "CIG", range: [1, 50], institutes: ["lavoro_subordinato", "cassa_integrazione", "ammortizzatori_sociali"], onlyIfEmpty: true },

  // ═══ L. 300/1970 — Statuto Lavoratori duplicate (DB: "L. 300/1970") ═══
  { source: "L. 300/1970", range: [1, 13], institutes: ["lavoro_subordinato", "diritti_lavoratore", "statuto_lavoratori"] },
  { source: "L. 300/1970", exact: 4, institutes: ["lavoro_subordinato", "controllo_distanza", "videosorveglianza", "statuto_lavoratori", "privacy_lavoro"] },
  { source: "L. 300/1970", exact: 7, institutes: ["lavoro_subordinato", "sanzione_disciplinare", "statuto_lavoratori"] },
  { source: "L. 300/1970", range: [14, 17], institutes: ["lavoro_subordinato", "liberta_sindacale", "statuto_lavoratori"] },
  { source: "L. 300/1970", exact: 18, institutes: ["lavoro_subordinato", "licenziamento", "reintegrazione", "statuto_lavoratori", "licenziamento_illegittimo"] },
  { source: "L. 300/1970", range: [19, 27], institutes: ["lavoro_subordinato", "attivita_sindacale", "statuto_lavoratori"] },
  { source: "L. 300/1970", range: [28, 45], institutes: ["lavoro_subordinato", "statuto_lavoratori"], onlyIfEmpty: true },

  // ═══ Bonus: Other sources found in DB ═══

  // D.Lgs. 231/2002 (antiriciclaggio) — mapped to same institutes
  { source: "D.Lgs. 231/2002", range: [1, 70], institutes: ["responsabilita_ente", "modello_231"], onlyIfEmpty: true },

  // D.Lgs. 70/2003 (e-commerce)
  { source: "D.Lgs. 70/2003", range: [1, 50], institutes: ["commercio_elettronico", "servizi_digitali"], onlyIfEmpty: true },
];

// ─── Execution engine (same as main migration) ───

interface Article {
  id: string;
  law_source: string;
  article_reference: string;
  related_institutes: string[];
}

async function fetchArticlesForSource(source: string): Promise<Article[]> {
  const all: Article[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("legal_articles")
      .select("id, law_source, article_reference, related_institutes")
      .eq("law_source", source)
      .range(offset, offset + limit - 1);
    if (error) { console.error(`  ❌ Error fetching ${source}: ${error.message}`); break; }
    if (!data || data.length === 0) break;
    all.push(...(data as Article[]));
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

async function run(dryRun: boolean) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Migration 028 FIX: Sources with shortName`);
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`${"═".repeat(60)}\n`);

  const allSources = new Set<string>();
  for (const rule of rules) {
    if (Array.isArray(rule.source)) rule.source.forEach(s => allSources.add(s));
    else allSources.add(rule.source);
  }

  const articlesBySource = new Map<string, Article[]>();
  let totalArticles = 0;
  for (const source of allSources) {
    const articles = await fetchArticlesForSource(source);
    articlesBySource.set(source, articles);
    totalArticles += articles.length;
    if (articles.length > 0) console.log(`  📥 ${source}: ${articles.length} articles`);
    else console.log(`  ⚠️  ${source}: 0 articles (not found)`);
  }
  console.log(`\n  Total: ${totalArticles}\n`);

  const updateBatch: { id: string; institutes: string[] }[] = [];
  let totalSkipped = 0;

  for (const rule of rules) {
    const sources = Array.isArray(rule.source) ? rule.source : [rule.source];
    for (const source of sources) {
      const articles = articlesBySource.get(source) || [];
      for (const article of articles) {
        let matches = false;
        if (rule.exact !== undefined) {
          matches = extractArticleNumber(article.article_reference) === rule.exact;
        } else if (rule.range) {
          const num = extractArticleNumber(article.article_reference);
          matches = num !== null && num >= rule.range[0] && num <= rule.range[1];
        }
        if (!matches) continue;
        if (rule.onlyIfEmpty && article.related_institutes?.length > 0) { totalSkipped++; continue; }
        const existing = updateBatch.find(u => u.id === article.id);
        if (existing) existing.institutes = rule.institutes;
        else updateBatch.push({ id: article.id, institutes: rule.institutes });
      }
    }
  }

  console.log(`  📊 Updates: ${updateBatch.length} | Skipped: ${totalSkipped}`);

  if (dryRun) {
    console.log(`\n  🔍 DRY RUN — no writes.\n`);
    return;
  }

  const BATCH_SIZE = 50;
  let totalUpdated = 0;
  for (let i = 0; i < updateBatch.length; i += BATCH_SIZE) {
    const batch = updateBatch.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(u => supabase.from("legal_articles").update({ related_institutes: u.institutes }).eq("id", u.id))
    );
    totalUpdated += batch.length - results.filter(r => r.error).length;
    process.stdout.write(`\r  ✏️  Updated ${Math.min(i + BATCH_SIZE, updateBatch.length)}/${updateBatch.length}`);
  }

  console.log(`\n\n  ✅ Fix complete: ${totalUpdated} articles updated.\n`);
}

const dryRun = process.argv.includes("--dry-run");
run(dryRun).catch(err => { console.error("Fatal:", err); process.exit(1); });
