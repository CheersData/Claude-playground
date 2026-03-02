/**
 * API QA Status — GET metadati suite di test per dashboard /ops
 *
 * Restituisce la lista delle spec E2E e unit test con:
 * - metadati statici (nome, tipo, aree di copertura)
 * - score qualità 1-10
 * - commento descrittivo
 * - suggerimenti per nuovi test (endpoint POST)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

export interface TestSpec {
  id: string;
  name: string;
  type: "e2e" | "unit";
  file: string;
  category: string;
  testCount: number;
  coverage: string[];
  status: "pass" | "fail" | "unknown";
  score: number; // 1-10
  comment: string;
  lastRun?: string;
}

const TEST_SPECS: TestSpec[] = [
  // ──── E2E Playwright ────────────────────────────────────────────────────
  {
    id: "e2e-auth",
    name: "Auth Flow",
    type: "e2e",
    file: "e2e/auth.spec.ts",
    category: "Autenticazione",
    testCount: 7,
    coverage: ["Landing page", "Navbar", "OAuth redirect", "Console auth prompt", "Corpus access"],
    status: "unknown",
    score: 8,
    comment: "Copre i flussi utente principali. Mancano test per il refresh token e la scadenza della sessione.",
    lastRun: undefined,
  },
  {
    id: "e2e-upload",
    name: "Upload Zone",
    type: "e2e",
    file: "e2e/upload.spec.ts",
    category: "Upload Documenti",
    testCount: 9,
    coverage: ["Drag-drop UI", "Textarea input", "File input", "Validazione tipo file", "Endpoint /api/upload"],
    status: "unknown",
    score: 7,
    comment:
      "Buona copertura dell'UI upload. Mancano test per PDF corrotti e file > 20MB (limite di validazione).",
    lastRun: undefined,
  },
  {
    id: "e2e-analysis",
    name: "Pipeline Analisi",
    type: "e2e",
    file: "e2e/analysis.spec.ts",
    category: "Pipeline Analisi",
    testCount: 8,
    coverage: ["SSE stream format", "Progress UI", "Cached results via sessionId", "Fasi pipeline (4 step)"],
    status: "unknown",
    score: 9,
    comment:
      "Eccellente copertura del flusso SSE. I mock permettono test deterministici senza crediti API. Fixture contratto realistico.",
    lastRun: undefined,
  },
  {
    id: "e2e-console",
    name: "Console Ops",
    type: "e2e",
    file: "e2e/console.spec.ts",
    category: "Console Operativa",
    testCount: 12,
    coverage: [
      "Tier switching (Intern/Associate/Partner)",
      "Agent toggle (enable/disable)",
      "Auth checks (401 senza token)",
      "PowerPanel API",
    ],
    status: "unknown",
    score: 8,
    comment:
      "Copre bene l'API console. Mancano test E2E per il rendering del PowerPanel lato browser.",
    lastRun: undefined,
  },

  // ──── Unit Vitest — Infrastruttura AI ───────────────────────────────────
  {
    id: "unit-agent-runner",
    name: "Agent Runner",
    type: "unit",
    file: "tests/unit/agent-runner.test.ts",
    category: "Infrastruttura AI",
    testCount: 13,
    coverage: [
      "Fallback chain (N modelli)",
      "Retry su 429",
      "Provider disabilitato",
      "Cost logging",
      "AgentDisabledError",
    ],
    status: "pass",
    score: 9,
    comment: "P1 — gap critico colmato. Copre il cuore del sistema multi-fallback con 13 scenari.",
    lastRun: undefined,
  },
  {
    id: "unit-tiers",
    name: "Tier System",
    type: "unit",
    file: "tests/unit/tiers.test.ts",
    category: "Infrastruttura AI",
    testCount: 28,
    coverage: [
      "Catene tier Intern/Associate/Partner",
      "Agent enable/disable isolation",
      "getCurrentTier / setCurrentTier",
      "Cost tracking per tier",
    ],
    status: "pass",
    score: 9,
    comment: "P2 — copertura completa del tier system. 28 test coprono tutti gli scenari di fallback.",
    lastRun: undefined,
  },
  {
    id: "unit-generate",
    name: "Generate Router",
    type: "unit",
    file: "tests/unit/generate.test.ts",
    category: "Infrastruttura AI",
    testCount: 55,
    coverage: [
      "7 provider (Anthropic, Gemini, OpenAI, Mistral, Groq, Cerebras, DeepSeek)",
      "Config routing",
      "Edge cases (modello inesistente, API key mancante)",
    ],
    status: "pass",
    score: 10,
    comment: "P5 — il test più completo del progetto. 55+ scenari coprono ogni provider e configurazione.",
    lastRun: undefined,
  },
  {
    id: "unit-analysis-cache",
    name: "Analysis Cache",
    type: "unit",
    file: "tests/unit/analysis-cache.test.ts",
    category: "Cache & Storage",
    testCount: 22,
    coverage: [
      "CRUD sessioni",
      "Phase timing con RPC atomica",
      "Average timings su 30 sessioni",
      "Cleanup TTL",
    ],
    status: "pass",
    score: 8,
    comment: "P4 — copre la cache e il fix TD-1 (RPC atomica). Manca test per race condition con sessioni parallele.",
    lastRun: undefined,
  },
  {
    id: "unit-console-token",
    name: "Console Token",
    type: "unit",
    file: "tests/unit/console-token.test.ts",
    category: "Security",
    testCount: 22,
    coverage: [
      "Generate HMAC-SHA256",
      "Verify token",
      "Refresh token",
      "Expiry check",
      "Tamper detection",
    ],
    status: "pass",
    score: 9,
    comment: "P3 — copre la sicurezza del token console. 22 test includono scenari di manomissione.",
    lastRun: undefined,
  },

  // ──── Unit Vitest — Agenti ───────────────────────────────────────────────
  {
    id: "unit-classifier",
    name: "Classifier Agent",
    type: "unit",
    file: "tests/unit/classifier.test.ts",
    category: "Agenti AI",
    testCount: 10,
    coverage: [
      "Classificazione tipo documento",
      "Istituti giuridici",
      "Focus areas",
      "JSON output",
    ],
    status: "pass",
    score: 8,
    comment: "Copre i casi principali di classificazione. Il mock LLM permette test deterministici.",
    lastRun: undefined,
  },
  {
    id: "unit-analyzer",
    name: "Analyzer Agent",
    type: "unit",
    file: "tests/unit/analyzer.test.ts",
    category: "Agenti AI",
    testCount: 10,
    coverage: [
      "Clausole rischiose",
      "Risk level (critical/high/medium/low)",
      "Framework normativo",
      "Missing elements",
    ],
    status: "pass",
    score: 8,
    comment: "Buona copertura dell'analisi rischi. Mancano test per documenti con 0 clausole rischiose.",
    lastRun: undefined,
  },
  {
    id: "unit-investigator",
    name: "Investigator Agent",
    type: "unit",
    file: "tests/unit/investigator.test.ts",
    category: "Agenti AI",
    testCount: 9,
    coverage: ["Ricerca normativa", "Tool use loop (max 5)", "Findings structure", "Web search fallback"],
    status: "pass",
    score: 7,
    comment: "Copre il loop tool_use. Mancano test per investigator completamente disabilitato.",
    lastRun: undefined,
  },
  {
    id: "unit-advisor",
    name: "Advisor Agent",
    type: "unit",
    file: "tests/unit/advisor.test.ts",
    category: "Agenti AI",
    testCount: 10,
    coverage: [
      "Scoring multidimensionale (3 dimensioni)",
      "Fairness score media",
      "Max 3 risks / 3 actions",
      "needsLawyer logic",
    ],
    status: "pass",
    score: 8,
    comment: "Copre lo scoring e il truncate a max 3 elementi. Manca test per needsLawyer borderline.",
    lastRun: undefined,
  },
  {
    id: "unit-orchestrator",
    name: "Orchestrator",
    type: "unit",
    file: "tests/unit/orchestrator.test.ts",
    category: "Agenti AI",
    testCount: 8,
    coverage: [
      "Pipeline 4 agenti in sequenza",
      "Cache resumption",
      "Agent skip su disabled",
      "onProgress callbacks",
    ],
    status: "pass",
    score: 7,
    comment: "Copre il flusso pipeline. Mancano test per resume con sessione parzialmente completata.",
    lastRun: undefined,
  },
  {
    id: "unit-anthropic",
    name: "Anthropic Client",
    type: "unit",
    file: "tests/unit/anthropic.test.ts",
    category: "Infrastruttura AI",
    testCount: 8,
    coverage: [
      "Retry su 429 (60s)",
      "JSON parse con fallback chain",
      "Strip code fences",
      "Regex extraction",
    ],
    status: "pass",
    score: 8,
    comment: "Copre il parser JSON robusto e il retry rate-limit. Pattern fondamentale per la stabilità.",
    lastRun: undefined,
  },
  {
    id: "unit-extract-text",
    name: "Extract Text",
    type: "unit",
    file: "tests/unit/extract-text.test.ts",
    category: "Processing",
    testCount: 6,
    coverage: ["PDF parse", "DOCX parse", "TXT decode", "Validazione dimensione (20MB)", "Errori formato"],
    status: "pass",
    score: 7,
    comment: "Copre i formati principali. OCR (tesseract) non testato — rimosso da dependencies.",
    lastRun: undefined,
  },

  // ──── Unit Vitest — Middleware ───────────────────────────────────────────
  {
    id: "unit-mw-auth",
    name: "Auth Middleware",
    type: "unit",
    file: "tests/unit/middleware/auth.test.ts",
    category: "Middleware",
    testCount: 8,
    coverage: ["JWT validation", "Session cookie", "Unauthorized redirect", "Role check"],
    status: "pass",
    score: 8,
    comment: "Copre l'autenticazione Supabase. Mancano test per token scaduto e refresh automatico.",
    lastRun: undefined,
  },
  {
    id: "unit-mw-csrf",
    name: "CSRF Middleware",
    type: "unit",
    file: "tests/unit/middleware/csrf.test.ts",
    category: "Middleware",
    testCount: 7,
    coverage: ["Token generation", "Token validation", "Double-submit cookie", "Origin check"],
    status: "pass",
    score: 8,
    comment: "Buona copertura CSRF. Il double-submit pattern è testato correttamente.",
    lastRun: undefined,
  },
  {
    id: "unit-mw-rate-limit",
    name: "Rate Limit Middleware",
    type: "unit",
    file: "tests/unit/middleware/rate-limit.test.ts",
    category: "Middleware",
    testCount: 9,
    coverage: [
      "Sliding window per IP",
      "Per user-id",
      "Upstash Redis fallback in-memory",
      "429 response",
      "Headers X-RateLimit-*",
    ],
    status: "pass",
    score: 9,
    comment: "Ottima copertura rate limiting. Fallback in-memory testato — fondamentale per demo senza Redis.",
    lastRun: undefined,
  },
  {
    id: "unit-mw-sanitize",
    name: "Sanitize Middleware",
    type: "unit",
    file: "tests/unit/middleware/sanitize.test.ts",
    category: "Middleware",
    testCount: 7,
    coverage: ["XSS stripping", "SQL injection detection", "Input length limit", "Encoding normalization"],
    status: "pass",
    score: 8,
    comment: "Copertura sanitizzazione input. Mancano test per Unicode edge cases.",
    lastRun: undefined,
  },
];

// Suggerimenti pre-costruiti per "genera nuove domande"
const TEST_SUGGESTIONS = [
  {
    id: "sug-1",
    priority: "high",
    target: "e2e-analysis",
    description:
      "Test E2E per resume analisi da sessionId: carica documento, interrompi a metà, ricarica pagina con ?session=XXX, verifica ripresa dal punto corretto.",
  },
  {
    id: "sug-2",
    priority: "high",
    target: "unit-orchestrator",
    description:
      "Unit test orchestrator con sessione parziale (classification done, analysis missing): verifica che solo le fasi mancanti vengano eseguite.",
  },
  {
    id: "sug-3",
    priority: "medium",
    target: "unit-analyzer",
    description:
      "Test per documento con 0 clausole rischiose: verifica che overallRisk='low', clauses=[], fairnessScore >= 8.",
  },
  {
    id: "sug-4",
    priority: "medium",
    target: "e2e-upload",
    description:
      "Test upload file > 20MB: verifica messaggio errore in italiano 'File troppo grande (max 20MB)'.",
  },
  {
    id: "sug-5",
    priority: "medium",
    target: "unit-advisor",
    description:
      "Test needsLawyer borderline: fairnessScore=5.0 con 1 critical risk — verifica che needsLawyer=true.",
  },
  {
    id: "sug-6",
    priority: "medium",
    target: "unit-tiers",
    description:
      "Test race condition: due richieste parallele con setCurrentTier() diversi — verifica che AsyncLocalStorage isoli correttamente i valori.",
  },
  {
    id: "sug-7",
    priority: "low",
    target: "e2e-auth",
    description:
      "Test scadenza sessione: login, aspetta TTL, ricarica pagina — verifica redirect a login senza flash di contenuto.",
  },
  {
    id: "sug-8",
    priority: "low",
    target: "unit-extract-text",
    description:
      "Test PDF corrotto (binary invalido): verifica errore 'Impossibile leggere il file PDF' senza crash del server.",
  },
  {
    id: "sug-9",
    priority: "low",
    target: "unit-anthropic",
    description:
      "Test JSON parser con risposta parzialmente troncata dal modello (stop_reason=max_tokens): verifica fallback o errore dettagliato.",
  },
];

export async function GET(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const e2eSpecs = TEST_SPECS.filter((s) => s.type === "e2e");
  const unitSpecs = TEST_SPECS.filter((s) => s.type === "unit");
  const totalTests = TEST_SPECS.reduce((sum, s) => sum + s.testCount, 0);
  const avgScore =
    Math.round((TEST_SPECS.reduce((sum, s) => sum + s.score, 0) / TEST_SPECS.length) * 10) / 10;

  return NextResponse.json({
    specs: TEST_SPECS,
    summary: {
      total: TEST_SPECS.length,
      e2e: e2eSpecs.length,
      unit: unitSpecs.length,
      totalTests,
      avgScore,
      passCount: TEST_SPECS.filter((s) => s.status === "pass").length,
      unknownCount: TEST_SPECS.filter((s) => s.status === "unknown").length,
      failCount: TEST_SPECS.filter((s) => s.status === "fail").length,
    },
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  // Restituisce i suggerimenti per nuovi test
  // In futuro: chiamata a LLM per generare suggerimenti dinamici basati sul codebase
  return NextResponse.json({
    suggestions: TEST_SUGGESTIONS,
    generatedAt: new Date().toISOString(),
    note: "Suggerimenti statici basati su analisi gap copertura. In produzione: generati da LLM.",
  });
}
