import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

// ─── Rubric definitions (static, mirror di tests/eval/rubrics.ts) ──────────

interface ClauseDef {
  keyword: string;
  minSeverity: "critical" | "high" | "medium";
  description: string;
}

interface RubricDef {
  id: string;
  name: string;
  expectedDocumentType: string;
  maxFairnessScore: number;
  expectNeedsLawyer: boolean;
  legalNotes: string;
  clauses: ClauseDef[];
}

const RUBRICS: RubricDef[] = [
  {
    id: "01-affitto-penale-illegittima",
    name: "Affitto con penale illegittima (12 mensilità)",
    expectedDocumentType: "locazione",
    maxFairnessScore: 3.5,
    expectNeedsLawyer: true,
    legalNotes:
      "Contratto 4+4 con multiple clausole nulle: penale sproporzionata (art. 79 L. 392/78), foro lontano dall'immobile (art. 33 D.Lgs. 206/05), revisione unilaterale canone (art. 32 L. 392/78), manutenzione straordinaria al conduttore (art. 1576 c.c.).",
    clauses: [
      { keyword: "penale", minSeverity: "critical", description: "Penale 12 mensilità per recesso — nulla ex art. 79 L. 392/1978" },
      { keyword: "foro", minSeverity: "high", description: "Foro esclusivo lontano dall'immobile — clausola vessatoria" },
      { keyword: "revisione unilaterale", minSeverity: "critical", description: "Modifica unilaterale del canone — nulla ex art. 32 L. 392/1978" },
      { keyword: "manutenzione", minSeverity: "high", description: "Manutenzione straordinaria al conduttore — contrasta art. 1576 c.c." },
      { keyword: "spese straordinarie", minSeverity: "high", description: "Spese condominiali straordinarie al conduttore — illegittime" },
    ],
  },
  {
    id: "02-lavoro-subordinato-camuffato",
    name: "Contratto di consulenza che maschera subordinazione",
    expectedDocumentType: "lavoro",
    maxFairnessScore: 3.0,
    expectNeedsLawyer: true,
    legalNotes:
      "Il contratto presenta tutti gli indici di subordinazione ex art. 2094 c.c.: esclusività, orario fisso, eterodirezione. La non concorrenza post-contrattuale è nulla per mancanza di corrispettivo.",
    clauses: [
      { keyword: "esclusività", minSeverity: "critical", description: "Esclusività totale — indice di subordinazione ex art. 2094 c.c." },
      { keyword: "orario", minSeverity: "critical", description: "Orario fisso 9-18 — elemento tipico della subordinazione" },
      { keyword: "direzione", minSeverity: "critical", description: "Eterodirezione del Direttore Tecnico — subordinazione ex art. 2094 c.c." },
      { keyword: "non concorrenza", minSeverity: "high", description: "Non concorrenza 24 mesi senza corrispettivo — sproporzionata" },
      { keyword: "compenso fisso", minSeverity: "high", description: "Compenso fisso indipendente dal volume — indice di subordinazione" },
    ],
  },
  {
    id: "03-acquisto-caparra-abusiva",
    name: "Compromesso immobiliare con caparra sproporzionata",
    expectedDocumentType: "acquisto_immobile",
    maxFairnessScore: 3.0,
    expectNeedsLawyer: true,
    legalNotes:
      "Compromesso gravemente sbilanciato: caparra al 30% vs prassi 10%, venditore può recedere senza pagare il doppio (violazione art. 1385 c.c.), arbitrato controllato dal venditore.",
    clauses: [
      { keyword: "caparra", minSeverity: "critical", description: "Caparra confirmatoria 30% (€96.000) — eccessiva rispetto alla prassi 10-15%" },
      { keyword: "rifiuto mutuo", minSeverity: "critical", description: "Perdita 50% caparra se mutuo rifiutato — clausola abusiva" },
      { keyword: "arbitrato", minSeverity: "high", description: "Arbitrato con 2/3 arbitri nominati dal venditore — squilibrio strutturale" },
      { keyword: "recesso venditore", minSeverity: "critical", description: "Venditore recede senza restituire il doppio — violazione art. 1385 c.c." },
      { keyword: "vizi occulti", minSeverity: "high", description: "Rinuncia azione redibitoria — nulla ex art. 1490 c.c." },
    ],
  },
  {
    id: "04-locazione-clausole-vietate",
    name: "Locazione transitoria con clausole vietate",
    expectedDocumentType: "locazione",
    maxFairnessScore: 2.5,
    expectNeedsLawyer: true,
    legalNotes:
      "Contratto con almeno 6 violazioni di legge: pagamento cash (antiriciclaggio), preavviso 12 mesi (nullo, max 1 mese), accesso senza preavviso (incostituzionale), divieto animali (illegittimo).",
    clauses: [
      { keyword: "contanti", minSeverity: "critical", description: "Pagamento in contanti — violazione art. 49 D.Lgs. 231/2007" },
      { keyword: "preavviso", minSeverity: "critical", description: "Preavviso 12 mesi — nulla, max legale 1 mese art. 5 L. 431/1998" },
      { keyword: "accesso", minSeverity: "high", description: "Accesso senza preavviso — violazione art. 14 Costituzione" },
      { keyword: "animali", minSeverity: "high", description: "Divieto assoluto animali — contrario alla legge" },
      { keyword: "cauzione", minSeverity: "high", description: "Cauzione 5 mensilità — art. 11 L. 392/1978 limita a 3" },
      { keyword: "residenza", minSeverity: "medium", description: "Divieto residenza anagrafica — illegittimo ex art. 43 c.c." },
    ],
  },
  {
    id: "05-vendita-esclusione-garanzie-b2c",
    name: "CGV e-commerce con esclusione garanzie legali B2C",
    expectedDocumentType: "contratto_fornitura",
    maxFairnessScore: 2.0,
    expectNeedsLawyer: false,
    legalNotes:
      "CGV con 5+ clausole nulle: esclusione recesso 14gg (art. 52 Cod.Consumo), esclusione garanzia legale (art. 128), arbitrato obbligatorio (art. 33), legge Singapore inapplicabile (Reg. Roma I art. 6).",
    clauses: [
      { keyword: "recesso", minSeverity: "critical", description: "Rinuncia recesso 14gg — NULLA ex art. 52 D.Lgs. 206/2005" },
      { keyword: "garanzia", minSeverity: "critical", description: "Esclusione garanzia legale conformità — NULLA ex artt. 128-135" },
      { keyword: "arbitrato obbligatorio", minSeverity: "critical", description: "Arbitrato obbligatorio B2C — clausola nulla ex art. 33 co. 2 lett. t)" },
      { keyword: "legge di Singapore", minSeverity: "critical", description: "Scelta legge Singapore — NULLA ex art. 6 Reg. Roma I (593/2008)" },
      { keyword: "rischio", minSeverity: "high", description: "Trasferimento rischio al corriere — viola art. 61 D.Lgs. 206/2005" },
    ],
  },
];

// ─── Types per i risultati eval ───────────────────────────────────────────────

interface ClauseCheckResult {
  check: { keyword: string; minSeverity: string; description: string };
  passed: boolean;
  foundIn?: string;
  detectedSeverity?: string;
}

interface EvalResultRaw {
  rubricId: string;
  rubricName: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  failedChecks: string[];
  passedChecks: number;
  totalChecks: number;
  advisor?: { fairnessScore?: number; needsLawyer?: boolean };
  documentTypeCheck?: { expected: string; actual: string; passed: boolean };
  clauseChecks?: ClauseCheckResult[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readResultsDir(): { file: string; results: EvalResultRaw[] }[] {
  const resultsDir = path.resolve(process.cwd(), "tests/eval/results");
  if (!fs.existsSync(resultsDir)) return [];

  const files = fs.readdirSync(resultsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse(); // newest first

  return files.map((file) => {
    try {
      const content = fs.readFileSync(path.join(resultsDir, file), "utf-8");
      return { file, results: JSON.parse(content) as EvalResultRaw[] };
    } catch {
      return { file, results: [] };
    }
  });
}

function parseTimestampFromFilename(filename: string): string | null {
  // eval-2026-03-01T12-00-00.json
  const match = filename.match(/eval-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
  if (!match) return null;
  return match[1].replace(/T(\d{2})-(\d{2})-(\d{2})$/, "T$1:$2:$3") + ".000Z";
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireConsoleAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  // Read all result files
  const allRuns = readResultsDir();
  const latestRun = allRuns[0] ?? null;

  // Build per-rubric result map from latest run
  const latestByRubricId: Record<string, EvalResultRaw> = {};
  if (latestRun) {
    for (const r of latestRun.results) {
      latestByRubricId[r.rubricId] = r;
    }
  }

  // Build history summary (one entry per run file)
  const history = allRuns.map((run) => ({
    file: run.file,
    runAt: parseTimestampFromFilename(run.file),
    total: run.results.length,
    passed: run.results.filter((r) => r.passed).length,
    failed: run.results.filter((r) => !r.passed).length,
  }));

  // Build test list
  const tests = RUBRICS.map((rubric) => {
    const result = latestByRubricId[rubric.id] ?? null;
    return {
      id: rubric.id,
      name: rubric.name,
      expectedDocumentType: rubric.expectedDocumentType,
      maxFairnessScore: rubric.maxFairnessScore,
      expectNeedsLawyer: rubric.expectNeedsLawyer,
      legalNotes: rubric.legalNotes,
      clauseCount: rubric.clauses.length,
      clauses: rubric.clauses,
      lastResult: result
        ? {
            passed: result.passed,
            passedChecks: result.passedChecks,
            totalChecks: result.totalChecks,
            durationMs: result.durationMs,
            actualScore: result.advisor?.fairnessScore ?? null,
            actualNeedsLawyer: result.advisor?.needsLawyer ?? null,
            failedChecks: result.failedChecks ?? [],
            error: result.error ?? null,
            documentTypeCheck: result.documentTypeCheck ?? null,
            clauseChecks: result.clauseChecks ?? [],
          }
        : null,
    };
  });

  // Summary
  const hasRun = tests.some((t) => t.lastResult !== null);
  const passed = tests.filter((t) => t.lastResult?.passed === true).length;
  const failed = tests.filter((t) => t.lastResult?.passed === false).length;
  const errors = tests.filter((t) => t.lastResult?.error != null).length;

  return NextResponse.json({
    tests,
    summary: {
      total: tests.length,
      passed,
      failed,
      errors,
      notRun: hasRun ? tests.filter((t) => t.lastResult === null).length : tests.length,
      lastRunAt: latestRun ? parseTimestampFromFilename(latestRun.file) : null,
      historyCount: allRuns.length,
    },
    history,
  });
}

// ─── POST — trigger eval run ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = requireConsoleAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  // In ambiente demo non è possibile eseguire l'eval runner direttamente.
  // L'eval runner richiede crediti API Anthropic e non può girare in una
  // sessione Claude Code attiva (nested session vietata).
  return NextResponse.json(
    {
      error: "demo_mode",
      message:
        "L'eval runner non può girare dentro una sessione Claude Code attiva. " +
        "Eseguilo da un terminale esterno: npx tsx tests/eval/eval-runner.ts",
      command: "npx tsx tests/eval/eval-runner.ts",
    },
    { status: 503 }
  );
}
