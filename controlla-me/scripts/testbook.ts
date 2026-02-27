/**
 * Testbook automatizzato per la pipeline Corpus QA.
 *
 * Esegue 20 domande complesse/ambigue attraverso:
 *   1. Question-Prep (riformulazione + istituti)
 *   2. Corpus Search (lookup istituti + ricerca semantica)
 *
 * Valuta automaticamente ogni fase con criteri oggettivi.
 * NON chiama il corpus-agent LLM → zero costi aggiuntivi oltre embeddings.
 *
 * Usage: npx tsx scripts/testbook.ts
 */

import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

import { prepareQuestion } from "../lib/agents/question-prep";
import { searchArticles, searchArticlesByInstitute } from "../lib/legal-corpus";
import { searchLegalKnowledge } from "../lib/vector-store";
import { isVectorDBEnabled, generateEmbedding } from "../lib/embeddings";
import type { QuestionPrepResult } from "../lib/agents/question-prep";
import { mergeArticleResults } from "../lib/article-merge";

// ─── ANSI colors ───

const R = "\x1b[31m";
const G = "\x1b[32m";
const Y = "\x1b[33m";
const B = "\x1b[34m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ─── Types ───

interface TestCase {
  id: number;
  name: string;
  question: string;

  expectedPrep: {
    questionType: "specific" | "systematic";
    needsProceduralLaw: boolean;
    needsCaseLaw: boolean;
    requiredInstitutes: string[];
    forbiddenInstitutes?: string[];
    mechanismQueryRequired: boolean;
  };

  expectedSearch: {
    minArticles: number;
    /** Substring match against articleReference (e.g. "1362" matches "Art. 1362") */
    requiredArticleRefs?: string[];
    forbiddenArticleRefs?: string[];
  };
}

interface PrepScore {
  total: number;
  max: number;
  details: string[];
}

interface SearchScore {
  total: number;
  max: number;
  details: string[];
}

interface TestResult {
  id: number;
  name: string;
  question: string;
  prep: {
    result: QuestionPrepResult;
    score: PrepScore;
  };
  search: {
    articleCount: number;
    instituteCount: number;
    semanticCount: number;
    articles: Array<{ ref: string; source: string; similarity: string }>;
    score: SearchScore;
  };
  total: number;
  max: number;
  percentage: number;
}

// ─── 20 Test Cases ───

const TEST_CASES: TestCase[] = [
  // ═══ CONTRATTO — interpretazione e clausole ═══
  {
    id: 1,
    name: "Clausole contraddittorie rinnovo/risoluzione",
    question: "Il contratto ha una clausola di rinnovo automatico e una di risoluzione alla scadenza, quale prevale?",
    expectedPrep: {
      questionType: "specific",
      needsProceduralLaw: false,
      needsCaseLaw: false,
      requiredInstitutes: ["interpretazione_contratto"],
      mechanismQueryRequired: true,
    },
    expectedSearch: {
      minArticles: 3,
      requiredArticleRefs: ["1362"],
    },
  },
  {
    id: 2,
    name: "Rinuncia azione legale nel contratto",
    question: "Nel contratto c'è scritto che rinuncio a fare causa, è valido?",
    expectedPrep: {
      questionType: "specific",
      needsProceduralLaw: false,
      needsCaseLaw: false,
      requiredInstitutes: ["clausole_vessatorie", "nullità"],
      mechanismQueryRequired: true,
    },
    expectedSearch: {
      minArticles: 3,
      requiredArticleRefs: ["1341"],
    },
  },
  {
    id: 3,
    name: "Tolleranza 1/20 vendita a corpo",
    question: "Il costruttore ha sforato la tolleranza dell'1/20, che fare?",
    expectedPrep: {
      questionType: "specific",
      needsProceduralLaw: false,
      needsCaseLaw: false,
      requiredInstitutes: ["vendita_a_corpo"],
      forbiddenInstitutes: ["appalto"],
      mechanismQueryRequired: false,
    },
    expectedSearch: {
      minArticles: 2,
      requiredArticleRefs: ["1537", "1538"],
    },
  },
  {
    id: 4,
    name: "Differenza nullità e simulazione",
    question: "Che differenza c'è tra un contratto nullo e uno simulato?",
    expectedPrep: {
      questionType: "systematic",
      needsProceduralLaw: false,
      needsCaseLaw: false,
      requiredInstitutes: ["nullità", "simulazione"],
      mechanismQueryRequired: true,
    },
    expectedSearch: {
      minArticles: 4,
      requiredArticleRefs: ["1414", "1418"],
    },
  },
  {
    id: 5,
    name: "Effetti contratto nullo",
    question: "In quali casi un contratto nullo produce comunque effetti giuridici?",
    expectedPrep: {
      questionType: "systematic",
      needsProceduralLaw: false,
      needsCaseLaw: false,
      requiredInstitutes: ["nullità", "contratto"],
      mechanismQueryRequired: true,
    },
    expectedSearch: {
      minArticles: 3,
      requiredArticleRefs: ["1418"],
    },
  },
  // ═══ SCOPE: domande che escono dal corpus ═══
  {
    id: 6,
    name: "Riqualificazione d'ufficio del contratto",
    question: "Il giudice civile può riqualificare d'ufficio un contratto senza violare il principio dispositivo e il divieto di ultrapetizione?",
    expectedPrep: {
      questionType: "specific",
      needsProceduralLaw: true,
      needsCaseLaw: true,
      requiredInstitutes: ["interpretazione_contratto"],
      mechanismQueryRequired: true,
    },
    expectedSearch: {
      // Domanda procedurale (c.p.c.) — Art. 1362 è tangenziale.
      // Il corpus copre diritto sostanziale, non processuale.
      minArticles: 2,
    },
  },
  {
    id: 7,
    name: "Riduzione giudiziale clausola penale",
    question: "La clausola penale è troppo alta. Il giudice può ridurla anche se non lo chiedo esplicitamente?",
    expectedPrep: {
      questionType: "specific",
      needsProceduralLaw: true,
      needsCaseLaw: false,
      requiredInstitutes: ["clausola_penale"],
      mechanismQueryRequired: true,
    },
    expectedSearch: {
      minArticles: 2,
      requiredArticleRefs: ["1382", "1384"],
    },
  },
  {
    id: 8,
    name: "Differenza caparra confirmatoria e penitenziale",
    question: "Che differenza c'è tra caparra confirmatoria e caparra penitenziale?",
    expectedPrep: {
      questionType: "systematic",
      needsProceduralLaw: false,
      needsCaseLaw: false,
      requiredInstitutes: ["caparra_confirmatoria", "caparra_penitenziale"],
      mechanismQueryRequired: false,
    },
    expectedSearch: {
      minArticles: 2,
      requiredArticleRefs: ["1385", "1386"],
    },
  },
  // ═══ B2B vs B2C ═══
  {
    id: 9,
    name: "Recesso consumatore vs recesso civile",
    question: "Qual è la differenza tra il recesso del consumatore e il recesso previsto dal codice civile?",
    expectedPrep: {
      questionType: "systematic",
      needsProceduralLaw: false,
      needsCaseLaw: false,
      requiredInstitutes: ["tutela_consumatore"],
      mechanismQueryRequired: true,
    },
    expectedSearch: {
      minArticles: 3,
    },
  },
  {
    id: 10,
    name: "Responsabilità precontrattuale",
    question: "Quando sorge la responsabilità precontrattuale e quali sono i rimedi?",
    expectedPrep: {
      questionType: "specific",
      needsProceduralLaw: false,
      needsCaseLaw: true,
      requiredInstitutes: ["contratto"],
      mechanismQueryRequired: true,
    },
    expectedSearch: {
      minArticles: 2,
      requiredArticleRefs: ["1337", "1338"],
    },
  },
  // ═══ GARANZIE E VENDITA ═══
  {
    id: 11,
    name: "Vizi occulti nella compravendita",
    question: "Ho comprato una casa e dopo un mese ho scoperto infiltrazioni d'acqua nascoste. Posso fare qualcosa?",
    expectedPrep: {
      questionType: "specific",
      needsProceduralLaw: false,
      needsCaseLaw: false,
      requiredInstitutes: ["vizi_cosa_venduta"],
      mechanismQueryRequired: false,
    },
    expectedSearch: {
      minArticles: 3,
      requiredArticleRefs: ["1490", "1492", "1495"],
    },
  },
  {
    id: 12,
    name: "Garanzia per evizione",
    question: "Ho comprato un terreno ma un terzo dice che è suo. Il venditore deve risarcirmi?",
    expectedPrep: {
      questionType: "specific",
      needsProceduralLaw: false,
      needsCaseLaw: false,
      requiredInstitutes: ["garanzia_evizione", "vendita"],
      mechanismQueryRequired: false,
    },
    expectedSearch: {
      minArticles: 2,
      requiredArticleRefs: ["1483"],
    },
  },
  // ═══ LOCAZIONE ═══
  {
    id: 13,
    name: "Danni all'immobile locato",
    question: "L'inquilino ha rovinato i muri e il pavimento. Posso trattenere la cauzione?",
    expectedPrep: {
      questionType: "specific",
      needsProceduralLaw: false,
      needsCaseLaw: false,
      requiredInstitutes: ["locazione"],
      mechanismQueryRequired: false,
    },
    expectedSearch: {
      minArticles: 2,
      requiredArticleRefs: ["1590"],
    },
  },
  {
    id: 14,
    name: "Sublocazione senza consenso",
    question: "L'inquilino ha subaffittato l'appartamento senza il mio permesso. Posso risolvere il contratto?",
    expectedPrep: {
      questionType: "specific",
      needsProceduralLaw: false,
      needsCaseLaw: false,
      requiredInstitutes: ["sublocazione", "locazione", "risoluzione"],
      mechanismQueryRequired: true,
    },
    expectedSearch: {
      minArticles: 3,
      requiredArticleRefs: ["1594"],
    },
  },
  // ═══ OBBLIGAZIONI E INADEMPIMENTO ═══
  {
    id: 15,
    name: "Eccezione di inadempimento",
    question: "Il fornitore non ha consegnato la merce. Posso rifiutarmi di pagare?",
    expectedPrep: {
      questionType: "specific",
      needsProceduralLaw: false,
      needsCaseLaw: false,
      requiredInstitutes: ["inadempimento"],
      mechanismQueryRequired: true,
    },
    expectedSearch: {
      minArticles: 3,
      requiredArticleRefs: ["1453", "1460"],
    },
  },
  {
    id: 16,
    name: "Mora del debitore",
    question: "Quando scatta la mora del debitore e quali sono le conseguenze?",
    expectedPrep: {
      questionType: "specific",
      needsProceduralLaw: false,
      needsCaseLaw: false,
      requiredInstitutes: ["mora", "inadempimento"],
      mechanismQueryRequired: false,
    },
    expectedSearch: {
      minArticles: 2,
      requiredArticleRefs: ["1219"],
    },
  },
  // ═══ RESPONSABILITÀ EXTRACONTRATTUALE ═══
  {
    id: 17,
    name: "Danno da cose in custodia",
    question: "Un vaso è caduto dal mio balcone e ha ferito un passante. Sono responsabile?",
    expectedPrep: {
      questionType: "specific",
      needsProceduralLaw: false,
      needsCaseLaw: false,
      requiredInstitutes: ["responsabilità_extracontrattuale|fatto_illecito"],
      mechanismQueryRequired: false,
    },
    expectedSearch: {
      minArticles: 2,
      requiredArticleRefs: ["2043", "2051"],
    },
  },
  // ═══ GARANZIE REALI ═══
  {
    id: 18,
    name: "Differenza ipoteca e pegno",
    question: "Che differenza c'è tra ipoteca e pegno come garanzia per un prestito?",
    expectedPrep: {
      questionType: "systematic",
      needsProceduralLaw: false,
      needsCaseLaw: false,
      requiredInstitutes: ["ipoteca", "pegno"],
      mechanismQueryRequired: false,
    },
    expectedSearch: {
      minArticles: 3,
      requiredArticleRefs: ["2784", "2808"],
    },
  },
  // ═══ PRESCRIZIONE ═══
  {
    id: 19,
    name: "Prescrizione del diritto al risarcimento",
    question: "Quanto tempo ho per chiedere il risarcimento danni da inadempimento contrattuale?",
    expectedPrep: {
      questionType: "specific",
      needsProceduralLaw: false,
      needsCaseLaw: false,
      requiredInstitutes: ["prescrizione"],
      mechanismQueryRequired: false,
    },
    expectedSearch: {
      minArticles: 2,
      requiredArticleRefs: ["2946"],
    },
  },
  // ═══ CLAUSOLE VESSATORIE B2C ═══
  {
    id: 20,
    name: "Clausola abusiva in contratto consumatore",
    question: "Il contratto con l'operatore telefonico prevede che possono cambiare le condizioni quando vogliono. È legale?",
    expectedPrep: {
      questionType: "specific",
      needsProceduralLaw: false,
      needsCaseLaw: false,
      requiredInstitutes: ["clausole_abusive", "tutela_consumatore"],
      mechanismQueryRequired: false,
    },
    expectedSearch: {
      minArticles: 2,
      requiredArticleRefs: ["33"],
    },
  },
];

// ─── Evaluators ───

function scorePrep(tc: TestCase, prep: QuestionPrepResult): PrepScore {
  const details: string[] = [];
  let total = 0;
  const max = 30;

  // questionType (5 pt)
  if (prep.questionType === tc.expectedPrep.questionType) {
    total += 5;
    details.push(`${G}✓${RESET} type:${prep.questionType}`);
  } else {
    details.push(`${R}✗${RESET} type:${prep.questionType} (expected ${tc.expectedPrep.questionType})`);
  }

  // needsProceduralLaw (5 pt)
  if (prep.needsProceduralLaw === tc.expectedPrep.needsProceduralLaw) {
    total += 5;
    details.push(`${G}✓${RESET} c.p.c.:${prep.needsProceduralLaw}`);
  } else {
    details.push(`${R}✗${RESET} c.p.c.:${prep.needsProceduralLaw} (expected ${tc.expectedPrep.needsProceduralLaw})`);
  }

  // needsCaseLaw (5 pt)
  if (prep.needsCaseLaw === tc.expectedPrep.needsCaseLaw) {
    total += 5;
    details.push(`${G}✓${RESET} giurispr.:${prep.needsCaseLaw}`);
  } else {
    details.push(`${R}✗${RESET} giurispr.:${prep.needsCaseLaw} (expected ${tc.expectedPrep.needsCaseLaw})`);
  }

  // requiredInstitutes (10 pt proportional)
  const normInst = prep.suggestedInstitutes.map((i) =>
    i.trim().replace(/\s+/g, "_").toLowerCase()
  );
  const required = tc.expectedPrep.requiredInstitutes;
  let instFound = 0;
  for (const req of required) {
    // Support alternatives: "A|B" means either A or B is acceptable
    const alternatives = req.split("|");
    const matched = alternatives.find((alt) => normInst.includes(alt));
    if (matched) {
      instFound++;
      details.push(`${G}✓${RESET} ${matched}${alternatives.length > 1 ? ` (alt: ${req})` : ""}`);
    } else {
      details.push(`${R}✗${RESET} ${req} missing`);
    }
  }
  total += Math.round((instFound / required.length) * 10);

  // forbiddenInstitutes (-2 pt each)
  if (tc.expectedPrep.forbiddenInstitutes) {
    for (const forbidden of tc.expectedPrep.forbiddenInstitutes) {
      if (normInst.includes(forbidden)) {
        total = Math.max(0, total - 2);
        details.push(`${R}✗${RESET} forbidden:${forbidden} present`);
      }
    }
  }

  // mechanismQuery (5 pt)
  if (tc.expectedPrep.mechanismQueryRequired) {
    if (prep.mechanismQuery) {
      total += 5;
      details.push(`${G}✓${RESET} mechanism`);
    } else {
      details.push(`${R}✗${RESET} mechanism missing`);
    }
  } else {
    total += 5;
    details.push(`${DIM}~ mechanism n/a${RESET}`);
  }

  return { total, max, details };
}

function scoreSearch(
  tc: TestCase,
  articles: Array<{ ref: string; source: string; similarity: string }>,
  instituteCount: number
): SearchScore {
  const details: string[] = [];
  let total = 0;
  const max = 30;

  // minArticles (10 pt)
  if (articles.length >= tc.expectedSearch.minArticles) {
    total += 10;
    details.push(`${G}✓${RESET} ${articles.length} articoli (min ${tc.expectedSearch.minArticles})`);
  } else if (articles.length > 0) {
    const ratio = articles.length / tc.expectedSearch.minArticles;
    total += Math.round(ratio * 10);
    details.push(`${Y}~${RESET} ${articles.length}/${tc.expectedSearch.minArticles} articoli`);
  } else {
    details.push(`${R}✗${RESET} 0 articoli`);
  }

  // requiredArticleRefs (15 pt proportional)
  if (tc.expectedSearch.requiredArticleRefs) {
    const required = tc.expectedSearch.requiredArticleRefs;
    let found = 0;
    for (const req of required) {
      const match = articles.some((a) => a.ref.includes(req));
      if (match) {
        found++;
        details.push(`${G}✓${RESET} Art.${req}`);
      } else {
        details.push(`${R}✗${RESET} Art.${req} missing`);
      }
    }
    total += Math.round((found / required.length) * 15);
  } else {
    total += 15;
    details.push(`${DIM}~ no required refs${RESET}`);
  }

  // forbiddenArticleRefs (5 pt)
  if (tc.expectedSearch.forbiddenArticleRefs) {
    let clean = true;
    for (const forbidden of tc.expectedSearch.forbiddenArticleRefs) {
      if (articles.some((a) => a.ref.includes(forbidden))) {
        clean = false;
        details.push(`${R}✗${RESET} forbidden Art.${forbidden} present`);
      }
    }
    if (clean) {
      total += 5;
      details.push(`${G}✓${RESET} no forbidden`);
    }
  } else {
    total += 5;
  }

  return { total, max, details };
}

// ─── Pipeline runner ───

async function runTestCase(tc: TestCase): Promise<TestResult> {
  // Phase 1: Question-Prep
  const prep = await prepareQuestion(tc.question);

  const prepScore = scorePrep(tc, prep);

  // Normalize institutes
  const normalizedInstitutes = prep.suggestedInstitutes.map((inst) =>
    inst.trim().replace(/\s+/g, "_").toLowerCase()
  );

  // Phase 2: Corpus Search — embedding una volta, ranking vettoriale per istituto
  const queryEmbedding = await generateEmbedding(prep.legalQuery, "query");

  const perInstLimit = prep.questionType === "systematic" ? 35 : 30;
  const institutePromises = queryEmbedding
    ? normalizedInstitutes.map((inst) =>
        searchArticlesByInstitute(inst, queryEmbedding, perInstLimit)
      )
    : [];

  const [primaryResults, mechanismResults, knowledge, ...instituteResults] = await Promise.all([
    searchArticles(prep.legalQuery, {
      threshold: 0.4,
      limit: 8,
      institutes: normalizedInstitutes.length > 0 ? normalizedInstitutes : undefined,
    }),
    prep.mechanismQuery
      ? searchArticles(prep.mechanismQuery, { threshold: 0.4, limit: 6 })
      : Promise.resolve([]),
    searchLegalKnowledge(prep.legalQuery, { threshold: 0.6, limit: 4 }),
    ...institutePromises,
  ]);

  // Merge: cap per batch + query-relevance boost + global sort
  const { articles, instituteCount } = mergeArticleResults({
    instituteBatches: instituteResults,
    instituteNames: normalizedInstitutes,
    legalQuery: prep.legalQuery,
    semanticPrimary: primaryResults,
    semanticMechanism: mechanismResults,
    questionType: prep.questionType,
  });

  const articlesSummary = articles.map((a) => ({
    ref: a.articleReference,
    source: a.lawSource,
    similarity: `${(a.similarity * 100).toFixed(0)}%`,
  }));

  const searchScore = scoreSearch(tc, articlesSummary, instituteCount);

  const total = prepScore.total + searchScore.total;
  const max = prepScore.max + searchScore.max;

  return {
    id: tc.id,
    name: tc.name,
    question: tc.question,
    prep: { result: prep, score: prepScore },
    search: {
      articleCount: articles.length,
      instituteCount,
      semanticCount: primaryResults.length + (mechanismResults?.length ?? 0),
      articles: articlesSummary,
      score: searchScore,
    },
    total,
    max,
    percentage: Math.round((total / max) * 100),
  };
}

// ─── Report ───

function printReport(results: TestResult[]) {
  console.log(`\n${BOLD}═══ TESTBOOK LEXMEA — ${results.length} Test Cases ═══${RESET}\n`);

  for (const r of results) {
    const pct = r.percentage;
    const color = pct >= 80 ? G : pct >= 60 ? Y : R;

    console.log(`${BOLD}TC${r.id}: ${r.name}${RESET}`);
    console.log(`  ${DIM}Q: "${r.question.slice(0, 80)}..."${RESET}`);

    // Prep
    console.log(`  ${B}PREP${RESET}   [${r.prep.score.total}/${r.prep.score.max}] ${r.prep.score.details.join(" ")}`);
    if (r.prep.result.scopeNotes) {
      console.log(`         ${DIM}scope: ${r.prep.result.scopeNotes}${RESET}`);
    }

    // Search
    console.log(`  ${B}SEARCH${RESET} [${r.search.score.total}/${r.search.score.max}] ${r.search.score.details.join(" ")}`);

    // Total
    console.log(`  ${color}${BOLD}TOTALE: ${r.total}/${r.max} (${pct}%)${RESET}`);
    console.log();
  }

  // Summary
  const avg = Math.round(results.reduce((s, r) => s + r.percentage, 0) / results.length);
  const best = results.reduce((b, r) => (r.percentage > b.percentage ? r : b));
  const worst = results.reduce((w, r) => (r.percentage < w.percentage ? r : w));
  const avgPrep = Math.round(
    results.reduce((s, r) => s + (r.prep.score.total / r.prep.score.max) * 100, 0) / results.length
  );
  const avgSearch = Math.round(
    results.reduce((s, r) => s + (r.search.score.total / r.search.score.max) * 100, 0) / results.length
  );

  const passCount = results.filter((r) => r.percentage >= 70).length;
  const failCount = results.filter((r) => r.percentage < 50).length;

  console.log(`${BOLD}═══ RIEPILOGO ═══${RESET}`);
  console.log(`  Media: ${avg >= 70 ? G : avg >= 50 ? Y : R}${avg}%${RESET} | Pass (≥70%): ${G}${passCount}${RESET} | Fail (<50%): ${R}${failCount}${RESET}`);
  console.log(`  Best: TC${best.id} (${G}${best.percentage}%${RESET}) ${best.name}`);
  console.log(`  Worst: TC${worst.id} (${R}${worst.percentage}%${RESET}) ${worst.name}`);
  console.log(`  Prep: ${avgPrep}% | Search: ${avgSearch}%`);
  console.log();
}

// ─── Main ───

async function main() {
  console.log(`${BOLD}Testbook LexMea${RESET} — ${TEST_CASES.length} test cases\n`);

  if (!isVectorDBEnabled()) {
    console.error(`${R}Vector DB non disponibile (VOYAGE_API_KEY mancante)${RESET}`);
    process.exit(1);
  }

  console.log(`${G}✓${RESET} Vector DB attivo\n`);

  const results: TestResult[] = [];

  for (const tc of TEST_CASES) {
    process.stdout.write(`  TC${tc.id}: ${tc.name}...`);
    const startTime = Date.now();

    try {
      const result = await runTestCase(tc);
      results.push(result);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const pct = result.percentage;
      const color = pct >= 80 ? G : pct >= 60 ? Y : R;
      process.stdout.write(` ${color}${pct}%${RESET} (${elapsed}s)\n`);
    } catch (err) {
      process.stdout.write(` ${R}ERROR${RESET}\n`);
      console.error(`    ${err instanceof Error ? err.message : err}`);
      results.push({
        id: tc.id,
        name: tc.name,
        question: tc.question,
        prep: {
          result: {} as QuestionPrepResult,
          score: { total: 0, max: 30, details: ["ERROR"] },
        },
        search: {
          articleCount: 0,
          instituteCount: 0,
          semanticCount: 0,
          articles: [],
          score: { total: 0, max: 30, details: ["ERROR"] },
        },
        total: 0,
        max: 60,
        percentage: 0,
      });
    }
  }

  printReport(results);

  // Save JSON
  const outPath = resolve(__dirname, `testbook-results-${Date.now()}.json`);
  const fs = await import("fs");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`${DIM}Results saved: ${outPath}${RESET}\n`);
}

main().catch((err) => {
  console.error(`${R}Fatal error:${RESET}`, err);
  process.exit(1);
});
