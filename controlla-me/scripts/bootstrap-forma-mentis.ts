#!/usr/bin/env npx tsx
/**
 * bootstrap-forma-mentis.ts — Popola Forma Mentis memory con TUTTA la conoscenza aziendale esistente.
 *
 * Popola 3 tabelle:
 *   1. company_knowledge  — Strategic decisions, patterns, metrics, best practices, incidents
 *   2. department_memory   — Status corrente + learning + warning per ogni dipartimento
 *   3. decision_journal    — Decisioni strategiche e architetturali chiave
 *
 * Inserisce SENZA embeddings (embedding = null). Backfill embeddings via script separato.
 * Idempotente: controlla esistenza prima di inserire (title per knowledge/decisions, key per dept memory).
 *
 * Uso:
 *   npx tsx scripts/bootstrap-forma-mentis.ts
 *
 * Requisiti:
 *   - NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nel .env.local
 *   - Migration 040_forma_mentis.sql eseguita su Supabase
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Carica env dal .env.local della app
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createAdminClient } from "@/lib/supabase/admin";

// ─── Counters ───

const counters = {
  knowledge: { created: 0, skipped: 0 },
  deptMemory: { created: 0, skipped: 0 },
  decisions: { created: 0, skipped: 0 },
};

// ─── Admin client ───

const admin = createAdminClient();

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

async function knowledgeExists(title: string): Promise<boolean> {
  const { data } = await admin
    .from("company_knowledge")
    .select("id")
    .eq("title", title)
    .maybeSingle();
  return !!data;
}

async function insertKnowledge(payload: {
  category: string;
  title: string;
  content: string;
  departments?: string[];
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const exists = await knowledgeExists(payload.title);
  if (exists) {
    counters.knowledge.skipped++;
    console.log(`  SKIP (exists): ${payload.title.slice(0, 80)}`);
    return;
  }

  const { error } = await admin.from("company_knowledge").insert({
    category: payload.category,
    title: payload.title,
    content: payload.content,
    departments: payload.departments ?? [],
    metadata: {
      ...payload.metadata,
      source: "bootstrap-forma-mentis",
      bootstrap_date: new Date().toISOString(),
    },
    is_active: true,
    times_referenced: 1,
  });

  if (error) {
    console.error(`  ERROR inserting knowledge "${payload.title}": ${error.message}`);
    return;
  }
  counters.knowledge.created++;
  console.log(`  CREATED: ${payload.title.slice(0, 80)}`);
}

async function deptMemoryExists(department: string, key: string): Promise<boolean> {
  const { data } = await admin
    .from("department_memory")
    .select("id")
    .eq("department", department)
    .eq("key", key)
    .maybeSingle();
  return !!data;
}

async function insertDeptMemory(payload: {
  department: string;
  category: string;
  key: string;
  content: string;
  confidence?: number;
}): Promise<void> {
  const exists = await deptMemoryExists(payload.department, payload.key);
  if (exists) {
    counters.deptMemory.skipped++;
    console.log(`  SKIP (exists): [${payload.department}] ${payload.key}`);
    return;
  }

  const { error } = await admin.from("department_memory").insert({
    department: payload.department,
    category: payload.category,
    key: payload.key,
    content: payload.content,
    confidence: payload.confidence ?? 1.0,
    is_active: true,
    times_accessed: 0,
  });

  if (error) {
    console.error(`  ERROR inserting dept memory [${payload.department}] "${payload.key}": ${error.message}`);
    return;
  }
  counters.deptMemory.created++;
  console.log(`  CREATED: [${payload.department}] ${payload.key}`);
}

async function decisionExists(title: string): Promise<boolean> {
  const { data } = await admin
    .from("decision_journal")
    .select("id")
    .eq("title", title)
    .maybeSingle();
  return !!data;
}

async function insertDecision(payload: {
  title: string;
  description: string;
  department: string;
  decision_type: string;
  decided_by: string;
  expected_outcome: string;
  actual_outcome?: string;
  outcome_score?: number;
  status?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const exists = await decisionExists(payload.title);
  if (exists) {
    counters.decisions.skipped++;
    console.log(`  SKIP (exists): ${payload.title.slice(0, 80)}`);
    return;
  }

  const { error } = await admin.from("decision_journal").insert({
    title: payload.title,
    description: payload.description,
    department: payload.department,
    decision_type: payload.decision_type,
    decided_by: payload.decided_by,
    expected_outcome: payload.expected_outcome,
    actual_outcome: payload.actual_outcome ?? null,
    outcome_score: payload.outcome_score ?? null,
    status: payload.status ?? "active",
    tags: payload.tags ?? [],
    metadata: {
      ...payload.metadata,
      source: "bootstrap-forma-mentis",
      bootstrap_date: new Date().toISOString(),
    },
  });

  if (error) {
    console.error(`  ERROR inserting decision "${payload.title}": ${error.message}`);
    return;
  }
  counters.decisions.created++;
  console.log(`  CREATED: ${payload.title.slice(0, 80)}`);
}

// ═══════════════════════════════════════════════════════════════
// 1. COMPANY KNOWLEDGE
// ═══════════════════════════════════════════════════════════════

async function seedCompanyKnowledge() {
  console.log("\n=== 1. COMPANY KNOWLEDGE ===\n");

  // ─── STRATEGIC DECISIONS ───
  console.log("--- Strategic Decisions ---");

  await insertKnowledge({
    category: "decision",
    title: "Strategic Reframe: Console is the product, not legal analysis",
    content:
      "TAM expansion from $5B LegalTech to $93B Agent Orchestration (CAGR 44.6%). " +
      "The multi-agent console (lib/ai-sdk/, lib/tiers.ts, components/console/) is the real differentiator, " +
      "not the legal analysis vertical. Validated by Relevance AI $24M Bessemer raise. " +
      "Poimandres codename for standalone product. Tech readiness 95%.",
    departments: ["strategy", "architecture"],
    metadata: { source_doc: "state-of-company-2026-03-01.md", tam_legaltech: "$5B", tam_agent_orchestration: "$93B" },
  });

  await insertKnowledge({
    category: "decision",
    title: "Vertical Prioritization: HR/Consulente del Lavoro FIRST, Tax SECOND",
    content:
      "HR vertical first (3-4 weeks TTM, 200K TAM professionals, no IT competitors). " +
      "Tax vertical second (8-10 weeks, 120K commercialisti + 30K tributaristi, Harvey localizing for enterprise tax IT). " +
      "RICE score: HR 510 vs Tax 180. HR corpus 572 articles loaded (D.Lgs. 81/2008 321 art., " +
      "D.Lgs. 81/2015 66 art., D.Lgs. 276/2003 87 art., D.Lgs. 23/2015 11 art., " +
      "D.Lgs. 148/2015 46 art., L. 300/1970 41 art.).",
    departments: ["strategy", "data-engineering", "ufficio-legale"],
    metadata: { source_doc: "strategy-opportunity-brief.md", rice_hr: 510, rice_tax: 180 },
  });

  await insertKnowledge({
    category: "decision",
    title: "Competitive Position: 9-15 months ahead in consumer B2C Italian legal AI",
    content:
      "No direct competitor in consumer legal AI in Italy. Lexroom.ai (EUR 16.2M Series A, 7000 studi legali) " +
      "is B2B only — for lawyers, not consumers. Lawhive ($60M Series B, $35M ARR) operates UK/US only. " +
      "Harvey ($8B+ valuation) is enterprise-only. The 'Consumer Italy' quadrant is completely empty. " +
      "Estimated window: 9-15 months before Lexroom could pivot or Lawhive could expand to IT.",
    departments: ["strategy", "marketing"],
    metadata: { source_doc: "market-signal-report-2026-03.md", lexroom_funding: "EUR 16.2M", lawhive_arr: "$35M" },
  });

  await insertKnowledge({
    category: "decision",
    title: "Cost Model Validated: EUR 4.99/mo breakeven at ~1 analysis/user/month",
    content:
      "API cost $0.41/quarter (58 calls). Cost per call dropped 86% (from $0.0517 to $0.0071) thanks to " +
      "tier system multi-provider. Cerebras+Groq absorb 87% of calls at near-zero cost. " +
      "Even worst case (all Anthropic Sonnet), cost per full analysis < $0.10. " +
      "Pro plan at EUR 4.99/mo yields >95% gross margin at 100 Pro users generating 2000 analyses/month.",
    departments: ["finance", "strategy"],
    metadata: { source_doc: "cost-report-2026-03.md", q1_cost: "$0.41", cost_per_call: "$0.0071" },
  });

  // ─── PATTERNS ───
  console.log("\n--- Patterns ---");

  await insertKnowledge({
    category: "pattern",
    title: "Normattiva ZIP downloads can be empty — use fetchViaDirectAkn()",
    content:
      "Normattiva Open Data API produces empty ZIP files for single ordinary laws (e.g., L. 300/1970 Statuto dei Lavoratori). " +
      "Fix: use fetchViaDirectAkn() which fetches AKN XML directly from the web frontend. " +
      "Confirmed working: 99KB AKN XML for Statuto Lavoratori (41 articles). " +
      "Root cause: Normattiva API does not support leggi ordinarie singole via collection download.",
    departments: ["data-engineering"],
    metadata: { source_doc: "Q1 lessons", affected_source: "statuto_lavoratori" },
  });

  await insertKnowledge({
    category: "pattern",
    title: "Tier system N-fallback handles 429 spikes without downtime",
    content:
      "Multi-provider tier system (lib/tiers.ts) with N-fallback chains validated in production Q1. " +
      "On 429 rate limit from primary provider, system automatically descends to next model in chain. " +
      "Chains: Partner (Sonnet -> Gemini Pro -> Mistral Large -> Groq -> Cerebras), " +
      "Associate (Gemini Pro -> ...), Intern (Mistral Large -> ...). " +
      "Result: volume grew 867% in March while cost grew only 32%. Zero downtime.",
    departments: ["architecture", "operations"],
    metadata: { source_doc: "Q1 lessons + cost-report", volume_growth: "867%", cost_growth: "32%" },
  });

  await insertKnowledge({
    category: "pattern",
    title: "ADR pattern reduces rework — all major decisions should have ADR",
    content:
      "Architecture Decision Records (ADRs) documented in company/architecture/decisions.md and company/architecture/adr/. " +
      "Pattern adopted Q1: every architectural or cross-department decision gets an ADR before implementation. " +
      "Result: reduced rework on TD-1 (cache migration), TD-3 (migration numbering). " +
      "ADR-004 Security, ADR-005 Integration, ADR-forma-mentis all followed this pattern successfully.",
    departments: ["architecture"],
    metadata: { source_doc: "quarterly-review-q1-2026.md" },
  });

  await insertKnowledge({
    category: "pattern",
    title: "task-runner in demo environment fails — CME must execute tasks manually",
    content:
      "scripts/task-runner.ts uses spawnSync('claude', ['-p']) (CLI, not SDK). " +
      "In demo environment it always fails for one of two reasons: " +
      "(1) spawnSync claude ENOENT — claude not in PATH of the terminal running the script, " +
      "(2) claude -p exit 1 | Credit balance is too low — insufficient API credits. " +
      "Consequence: tasks left in in_progress/blocked state with error in result field. " +
      "Solution: CME executes tasks MANUALLY reading description and department.md.",
    departments: ["operations", "architecture"],
    metadata: { source_doc: "CLAUDE.md rule" },
  });

  // ─── METRICS ───
  console.log("\n--- Metrics ---");

  await insertKnowledge({
    category: "metric",
    title: "Q1 Final Metrics: 5600 articles, 397 tests green, $0.41 API cost",
    content:
      "Q1 2026 end state: ~5600 corpus articles (18 sources, cleaned from 6637 to 6110 then grown with HR 572 articles), " +
      "397 unit tests passing (19 files, Vitest 4), 34 Python tests passing (pytest), " +
      "72% test coverage (target 80%), $0.41 API cost total Q1, " +
      "0 TypeScript errors (strict mode), 0 security findings medium+, " +
      "903 company tasks total (846 done). " +
      "7 runtime agents active: classifier, analyzer, investigator, advisor, corpus-agent, question-prep, leader.",
    departments: ["strategy", "quality-assurance", "finance"],
    metadata: {
      source_doc: "quarterly-review-q1-2026.md + state-of-company-2026-03-15.md",
      articles: 5600,
      tests_ts: 397,
      tests_py: 34,
      coverage_pct: 72,
      api_cost_q1: "$0.41",
      total_tasks: 903,
      tasks_done: 846,
    },
  });

  await insertKnowledge({
    category: "metric",
    title: "Trading Backtest Cycle 3: Sharpe 0.975, Win Rate 52.2%, Profit Factor 2.20",
    content:
      "Backtest cycle #3 (2023-01-01 to 2024-12-31), slope_volume strategy, 43 ticker (S&P500 sector leaders + ETF), " +
      "100K capital. Results: Sharpe 0.975 (gap 0.025 from 1.0 threshold), Sortino 1.668, " +
      "Win Rate 52.2%, Profit Factor 2.20, Max Drawdown 3.85%, Total Return 23.39%, CAGR 11.12%, " +
      "136 total trades, avg win 8%, avg loss -2.75%, avg hold 20 days. " +
      "Blocker: 126/136 exits (92.6%) on stop loss — TP at 6x ATR almost never reached. " +
      "Cycle 4 prepared with 48 combos grid search (SL 1.5-2.5, TP 3-6, trailing breakeven 0.5-1.5, signal exit on/off).",
    departments: ["trading"],
    metadata: {
      source_doc: "trading/status.json",
      sharpe: 0.975,
      win_rate: 52.2,
      profit_factor: 2.20,
      max_dd: 3.85,
      total_trades: 136,
      cagr: 11.12,
    },
  });

  await insertKnowledge({
    category: "metric",
    title: "Keyword Data: contratto affitto 2100-3500/mo, clausole vessatorie 1800/mo",
    content:
      "Italian keyword research (March 2026): " +
      "'contratto affitto' cluster: 2100-3500/mo (stable-growing, informational+transactional). " +
      "'clausole vessatorie': 1800/mo (growing, informational). " +
      "'caparra confirmatoria': 1400/mo (stable, informational). " +
      "'diritto di recesso': 950/mo (stable). " +
      "'contratto lavoro' cluster: >10,000/mo aggregate (growing). " +
      "'analisi contratto AI': <200/mo but emergent, transactional, zero competition. " +
      "'EU AI Act obblighi': 1200/mo (accelerating pre-August 2026 deadline).",
    departments: ["marketing", "strategy"],
    metadata: {
      source_doc: "market-signal-report-2026-03.md",
      affitto_vol: "2100-3500",
      vessatorie_vol: 1800,
      lavoro_vol: ">10000",
      ai_analysis_vol: "<200",
    },
  });

  // ─── BEST PRACTICES ───
  console.log("\n--- Best Practices ---");

  await insertKnowledge({
    category: "best_practice",
    title: "Corpus audit L1-L3 found 527 duplicates — always run audit after bulk load",
    content:
      "Q1 corpus audit using L1-L3 structured approach revealed 527 duplicates and 2741 articles " +
      "without hierarchy structure. Corpus quality directly impacts RAG accuracy. " +
      "L1: structural validation (schema, required fields). L2: content quality (empty articles, duplicates). " +
      "L3: semantic clustering for outlier embeddings. " +
      "Rule: run audit-corpus-l1.ts after every bulk load operation.",
    departments: ["data-engineering", "quality-assurance"],
    metadata: { source_doc: "quarterly-review-q1-2026.md", duplicates_found: 527, articles_no_hierarchy: 2741 },
  });

  await insertKnowledge({
    category: "best_practice",
    title: "Never use SDK directly for internal scripts — use CLI claude -p or free LLM chain",
    content:
      "CLAUDE.md permanent rule: internal scripts (scripts/, company/) must use CLI 'claude -p' to invoke LLM, " +
      "NEVER the @anthropic-ai/sdk directly. Rationale: CLI uses the user's Claude subscription (included), " +
      "while SDK uses API credits (which cost money and are limited in demo environment). " +
      "Exception: app runtime code (app/, lib/agents/, lib/ai-sdk/) correctly uses multi-provider via agent-runner.ts.",
    departments: ["architecture", "operations"],
    metadata: { source_doc: "CLAUDE.md" },
  });

  await insertKnowledge({
    category: "best_practice",
    title: "Progressive commits strategy: commit after each logical unit, not at the end",
    content:
      "ADR-014 pattern: make small, frequent commits after each logical unit of work completes. " +
      "Avoid accumulating changes and committing everything at the end. " +
      "Benefits: easier rollback, clearer git history, reduced risk of losing work, " +
      "easier code review. Applied consistently across all departments since Q1.",
    departments: ["architecture", "quality-assurance"],
    metadata: { source_doc: "ADR-014" },
  });

  // ─── INCIDENTS ───
  console.log("\n--- Incidents ---");

  await insertKnowledge({
    category: "incident",
    title: "useContext regression in /console (2026-03-03): build fails with React 19 strictMode",
    content:
      "Build failure on /console page due to useContext regression. Root cause: React 19 strictMode " +
      "double-renders components, exposing a race condition in the console context provider. " +
      "Manifested as 'Cannot read properties of null' during SSR. " +
      "Resolution: wrapped console providers with client-only boundary and fixed context initialization order.",
    departments: ["architecture", "ux-ui"],
    metadata: { source_doc: "state-of-company-2026-03-03.md", react_version: "19.2.3" },
  });

  await insertKnowledge({
    category: "incident",
    title: "E2E tests fragile: integration tests with external deps break intermittently",
    content:
      "E2E Playwright tests (e2e/*.spec.ts) configured but never reliably passing on CI. " +
      "Root cause: tests depend on external services (Supabase, LLM providers) that are " +
      "unavailable or rate-limited in CI environment. " +
      "Current status: 7 E2E tests configured, passing only in local environment with browser headless. " +
      "Mitigation: unit tests (397 passing) cover critical paths. E2E remains gap E1 in QA.",
    departments: ["quality-assurance"],
    metadata: { source_doc: "Q1 lessons", e2e_tests: 7, unit_tests: 397 },
  });
}

// ═══════════════════════════════════════════════════════════════
// 2. DEPARTMENT MEMORY
// ═══════════════════════════════════════════════════════════════

async function seedDepartmentMemory() {
  console.log("\n=== 2. DEPARTMENT MEMORY ===\n");

  // ─── Architecture ───
  console.log("--- architecture ---");
  await insertDeptMemory({
    department: "architecture",
    category: "context",
    key: "architecture_current_status",
    content:
      "Health: OK. 205 tasks completed total, 4 in progress. " +
      "Tech debt: 0 critical, 0 high, 2 medium (multi-vertical pipeline, SSE+Edge), 3 low. " +
      "Resolved recently: TD-1 savePhaseTiming race condition (RPC atomica), TD-2 tesseract.js removed, TD-3 migration renumbering. " +
      "Current focus: FASE 1A UniversalConnector protocol, FASE 1C migration 037 schema discovery, FASE 0A HubSpot bug fixes. " +
      "Scalability: multi-vertical pipeline not ready — needs config-driven system.",
  });
  await insertDeptMemory({
    department: "architecture",
    category: "learning",
    key: "architecture_sse_edge_incompatibility",
    content:
      "SSE with maxDuration=300 does not work on Vercel Edge Runtime (30s limit). " +
      "Currently runs on Node.js — OK. Monitor if migrating to Edge.",
  });

  // ─── Data Engineering ───
  console.log("--- data-engineering ---");
  await insertDeptMemory({
    department: "data-engineering",
    category: "context",
    key: "data-engineering_current_status",
    content:
      "Health: OK. 116 tasks completed total, 3 in progress. " +
      "Corpus: ~5600 articles, 18 sources loaded, 0 blocked, 0 planned. Embeddings: voyage-law-2 active. " +
      "Pipeline CONNECT-MODEL-LOAD operational for Normattiva (AKN) and EUR-Lex (HTML). " +
      "Delta updates: scheduled via Vercel cron (Sunday 06:00 UTC). " +
      "HR vertical complete: 572 articles loaded. " +
      "Current focus: Schema Discovery Engine, MappingEngine integration, HubSpot connector tests.",
  });
  await insertDeptMemory({
    department: "data-engineering",
    category: "learning",
    key: "normattiva_zip_empty_workaround",
    content:
      "Normattiva Open Data API produces empty ZIP files for single ordinary laws. " +
      "Use fetchViaDirectAkn() instead. Confirmed working for L. 300/1970 (99KB AKN XML, 41 articles).",
  });
  await insertDeptMemory({
    department: "data-engineering",
    category: "warning",
    key: "codice_civile_dual_source",
    content:
      "Codice Civile loaded from two sources: HuggingFace (4271 articles) and Normattiva with full hierarchies. " +
      "Be careful about duplicates when running bulk operations. Always run audit after bulk load.",
  });

  // ─── Quality Assurance ───
  console.log("--- quality-assurance ---");
  await insertDeptMemory({
    department: "quality-assurance",
    category: "context",
    key: "quality-assurance_current_status",
    content:
      "Health: OK. 118 tasks completed, 6 in progress. " +
      "Coverage: 72% overall (target 80%). 397 TS unit tests passing (19 files, Vitest 4). " +
      "34 Python unit tests passing (pytest). 7 E2E tests configured (Playwright 1.58) but not running on CI. " +
      "All P1-P5 gaps closed (agent-runner, tiers, console-token, analysis-cache, generate). " +
      "Gap E1 remains: E2E Playwright not on CI (medium severity). " +
      "Current focus: daily QA, fixture-based HR pipeline testing, connector unit tests, 10 failing test fixes.",
  });
  await insertDeptMemory({
    department: "quality-assurance",
    category: "learning",
    key: "qa_e2e_external_deps_fragile",
    content:
      "E2E tests with external dependencies (Supabase, LLM providers) break intermittently on CI. " +
      "Unit tests with mocks are more reliable for CI. Keep E2E for local validation only.",
  });

  // ─── Trading ───
  console.log("--- trading ---");
  await insertDeptMemory({
    department: "trading",
    category: "context",
    key: "trading_current_status",
    content:
      "Health: OK. 53 tasks completed. Phase: backtest (cycle 3 done, cycle 4 prepared). " +
      "Runtime: paper mode, enabled, kill switch off. Portfolio: $99,676.27 (9 positions, $10,762.42 cash). " +
      "All 5+1 agents implemented. 72 unit tests passing. " +
      "Backtest cycle 3: Sharpe 0.975 (gap 0.025), 136 trades, CAGR 11.12%, Win Rate 52.2%, Max DD 3.85%. " +
      "Cycle 4 ready: 48 combos grid search (SL 1.5-2.5, TP 3-6, breakeven 0.5-1.5, signal exit on/off). " +
      "Paper trading approved pending Sharpe > 1.0.",
  });
  await insertDeptMemory({
    department: "trading",
    category: "learning",
    key: "slope_threshold_optimal",
    content:
      "Slope threshold 0.01%/bar is optimal for slope+volume strategy on 1-minute bars via Tiingo IEX. " +
      "Lower values (0.005) increase reactivity but also false positives. " +
      "Inverse ETFs (SH, PSQ, DOG, SPXS, SQQQ): require_reversal=False, bypass_volume_check=True, never SHORT.",
  });
  await insertDeptMemory({
    department: "trading",
    category: "learning",
    key: "trading_sl_exit_rate_problem",
    content:
      "Cycle 3 blocker: 126/136 exits (92.6%) triggered by stop loss. " +
      "TP at 6x ATR is too distant and almost never reached. " +
      "Fix direction: bring TP closer (3-4x ATR), test tighter SL (1.5x), test signal-based exit.",
  });
  await insertDeptMemory({
    department: "trading",
    category: "warning",
    key: "trading_short_selling_disabled",
    content:
      "Short selling is currently disabled (allow_short_selling: false in trading_config). " +
      "Risk parameters: max daily loss -2%, max weekly loss -5%, max position 10%, max positions 10.",
  });

  // ─── Finance ───
  console.log("--- finance ---");
  await insertDeptMemory({
    department: "finance",
    category: "context",
    key: "finance_current_status",
    content:
      "Health: OK. 20 tasks completed. " +
      "Costs last 7 days: $1.03 total, 494 calls (Cerebras 84%, Gemini 13%, Groq 3%, Mistral 0%). " +
      "Cost per call: $0.002 average. Alert thresholds: $1/day, $0.10/query. No alerts triggered. " +
      "Revenue: pre-launch, $0 MRR, Stripe not active. " +
      "Trading P&L: paper mode, portfolio $99,676.27 (-0.32% unrealized). " +
      "Tier system working as designed: free models absorb 87% of calls.",
  });
  await insertDeptMemory({
    department: "finance",
    category: "learning",
    key: "finance_cost_per_call_trend",
    content:
      "Cost per call dropped 86% from February to March 2026 ($0.0517 to $0.0071) " +
      "after activating multi-provider tier system. Volume grew 867% while spend grew only 32%.",
  });

  // ─── Operations ───
  console.log("--- operations ---");
  await insertDeptMemory({
    department: "operations",
    category: "context",
    key: "operations_current_status",
    content:
      "Health: OK. 104 tasks completed, 1 in progress. " +
      "Dashboard /ops operational (agent_health, task_board_kpi, cost_trends, pipeline_state). " +
      "7 agents active: classifier, analyzer, investigator, advisor, corpus-agent, question-prep, leader. " +
      "Current tier: partner. Cost tracking: $1.03/7d, 494 calls. " +
      "Corpus sync: scheduled (cron). Active providers: Groq, Gemini, Cerebras, Mistral. " +
      "Anthropic/OpenAI not used (credits exhausted).",
  });
  await insertDeptMemory({
    department: "operations",
    category: "warning",
    key: "operations_anthropic_credits_exhausted",
    content:
      "Anthropic and OpenAI API credits are exhausted/insufficient. " +
      "Active providers are Groq, Gemini, Cerebras, Mistral (all free tier). " +
      "Investigator (web_search) requires Anthropic — currently non-functional without credits.",
  });

  // ─── Security ───
  console.log("--- security ---");
  await insertDeptMemory({
    department: "security",
    category: "context",
    key: "security_current_status",
    content:
      "Health: OK (GREEN). 71 tasks completed. Last full audit: 2026-03-02. " +
      "Findings: 0 critical, 0 high, 9 medium (all resolved), 4 low open. " +
      "Infrastructure: HTTP headers complete, auth/rate-limit/CSRF/sanitize/audit-log/console-token middleware active, " +
      "RLS on all Supabase tables, CSP configured. " +
      "Compliance: GDPR TTL active, EU AI Act deadline August 2026 (consultant not engaged).",
  });
  await insertDeptMemory({
    department: "security",
    category: "warning",
    key: "security_eu_ai_act_deadline",
    content:
      "EU AI Act deadline August 2026. Controlla.me is classifiable as high-risk system " +
      "(Annex III point 5b: legal decision assessment). Fine up to 15M EUR or 3% global turnover. " +
      "Consultant NOT engaged yet. Budget estimate: 5-15K EUR.",
  });
  await insertDeptMemory({
    department: "security",
    category: "warning",
    key: "security_dpa_not_signed",
    content:
      "DPA (Data Processing Agreements) with AI providers not signed: Anthropic, Google, Mistral. " +
      "Blocks any B2B contract, HR vertical with business clients, and PMI Compliance offering. " +
      "Anthropic DPA: self-served at anthropic.com/legal/dpa (30 min). Mistral: self-served.",
  });

  // ─── Strategy ───
  console.log("--- strategy ---");
  await insertDeptMemory({
    department: "strategy",
    category: "context",
    key: "strategy_current_status",
    content:
      "Health: OK. 30 tasks completed. OKR Q2 defined with 3 objectives, 9 KRs. " +
      "O1 (production-ready): on_track. O2 (corpus + HR vertical): on_track. O3 (market validation): at_risk. " +
      "5 opportunities tracked: HR (RICE 510, active), Tax (RICE 180, explore), " +
      "Poimandres console (RICE 270, pending_boss), PMI Compliance (explore), Commerciale B2B (explore). " +
      "8 competitors monitored. 7 pending boss decisions (D-01 to D-07). " +
      "7 risks tracked (R-1 to R-7): EU AI Act, DPA, zero users, cache scaling, Big Tech, Poimandres window, trading Sharpe.",
  });
  await insertDeptMemory({
    department: "strategy",
    category: "warning",
    key: "strategy_zero_real_users",
    content:
      "Zero real users after Q1. Product not in public production. " +
      "Cannot validate economic model, identify friction points, or build social proof. " +
      "Deploy to Vercel is technically ready (build stable, CI/CD active, security green). " +
      "Landing /affitti ready. Content calendar drafted. Blocked on boss approval D-06.",
  });

  // ─── Marketing ───
  console.log("--- marketing ---");
  await insertDeptMemory({
    department: "marketing",
    category: "context",
    key: "marketing_current_status",
    content:
      "Health: OK. 40 tasks completed, 1 in progress. " +
      "Current metrics: 0 organic sessions, 0 signups, 0 pro users, 0 analyses. " +
      "Q2 targets: 1500 organic sessions, 50 signups, 1 pro user, 20 analyses. " +
      "Content calendar: 6 articles March + 5 articles April planned (0 published). " +
      "Keyword research complete: 5 primary clusters identified. " +
      "5 digital competitors analyzed (Lexroom, Simpliciter, Legge per Tutti, AvvoGPT, Lawhive). " +
      "Current focus: first pillar article on clausole illegali lavoro + GSC/GA4 setup.",
  });
  await insertDeptMemory({
    department: "marketing",
    category: "warning",
    key: "marketing_zero_beta_users_critical",
    content:
      "Zero beta users is a critical blocker for market validation. " +
      "No organic traffic, no signups, no revenue. Content calendar exists but 0 articles published. " +
      "Every week without deploy = organic traffic not captured. " +
      "Quick wins available: landing /affitti, SEO articles on high-volume keywords.",
  });
  await insertDeptMemory({
    department: "marketing",
    category: "learning",
    key: "marketing_consumer_italy_quadrant_empty",
    content:
      "The 'Consumer Italy' quadrant in legal AI is completely empty (March 2026). " +
      "No player combines AI + Italian corpus with RAG for consumers. " +
      "Lexroom B2B-only (lawyers). Lawhive UK/US-only. Harvey enterprise-only. " +
      "This is the most important market signal: first-mover advantage confirmed.",
  });

  // ─── Ufficio Legale ───
  console.log("--- ufficio-legale ---");
  await insertDeptMemory({
    department: "ufficio-legale",
    category: "context",
    key: "ufficio-legale_current_status",
    content:
      "Health: OK. 32 tasks completed. Pipeline: 7 agents (4 core + 3 support). " +
      "Tier system active (intern/associate/partner). Corpus: ~5600 articles, 18 sources. " +
      "Scoring multidimensionale completato (4 dimensioni). Corpus Agent + question-prep operational. " +
      "HR vertical: 572 articles loaded, prompt update pending. " +
      "Gaps: OCR not available (tesseract.js removed), lawyer referral system no UI.",
  });
  await insertDeptMemory({
    department: "ufficio-legale",
    category: "learning",
    key: "ufficio-legale_investigator_anthropic_only",
    content:
      "Investigator agent uses web_search tool which requires Anthropic Claude. " +
      "Cannot fallback to other providers. When Anthropic credits exhausted, investigation returns empty findings.",
  });

  // ─── Integration ───
  console.log("--- integration ---");
  await insertDeptMemory({
    department: "integration",
    category: "context",
    key: "integration_current_status",
    content:
      "Health: GREEN. Phase: building (Phase 0 infrastructure). " +
      "Focus: credential vault, AuthenticatedBaseConnector, schema DB, OAuth2 flow generico. " +
      "Planned connectors: Fatture in Cloud, Google Drive, HubSpot. 0 active, 10 total planned. " +
      "Metrics: 0 PMI connected, 0 docs auto-analyzed. " +
      "Pipeline: CONNECT-AUTH-MAP-SYNC. Mapping: hybrid (rules + Levenshtein + LLM + learning).",
  });

  // ─── UX/UI ───
  console.log("--- ux-ui ---");
  await insertDeptMemory({
    department: "ux-ui",
    category: "context",
    key: "ux-ui_current_status",
    content:
      "Health: OK. 78 tasks completed, 3 in progress. " +
      "Design system: dark theme (#0a0a0a bg, #FF6B35 accent), 4 agent colors, DM Sans + Instrument Serif. " +
      "20+ components, 6 console components, responsive mobile-first, Tailwind CSS 4, Framer Motion. " +
      "WCAG AA: partial (console not audited). Scoring multidimensionale completed. " +
      "Current focus: Visual Entity Mapper UI, wizard backend API integration, E2E wizard tests.",
  });
  await insertDeptMemory({
    department: "ux-ui",
    category: "warning",
    key: "ux-ui_wcag_audit_pending",
    content:
      "Console components not audited for WCAG 2.1 AA accessibility. " +
      "No accessibility audit has been conducted yet. Gap UX-2 (medium severity).",
  });

  // ─── Protocols ───
  console.log("--- protocols ---");
  await insertDeptMemory({
    department: "protocols",
    category: "context",
    key: "protocols_current_status",
    content:
      "Health: OK. 8 tasks completed. 6 decision trees operational: " +
      "feature-request, trading-operations, data-operations, infrastructure, company-operations, ui-ux-request. " +
      "4 approval levels: L1 Auto, L2 CME, L3 Boss (Telegram), L4 Boss+Security. " +
      "CLI routing automated (lib/company/routing.ts). First audit completed 2026-03-09 (7 violations found). " +
      "20 authorized flows, forbidden flows defined. Self-feeding loop operational.",
  });

  // ─── Acceleration ───
  console.log("--- acceleration ---");
  await insertDeptMemory({
    department: "acceleration",
    category: "context",
    key: "acceleration_current_status",
    content:
      "Health: OK. 8 tasks completed. Young department (established Q1). " +
      "Code quality: 0 dead dependencies, 0 build warnings, ESLint clean, TypeScript strict. " +
      "Resolved tech debt: TD-1 (savePhaseTiming), TD-2 (tesseract.js), TD-3 (migration numbering). " +
      "Gap: department performance audit never executed — no cycle time benchmark. " +
      "Focus: department velocity + codebase cleanup.",
  });
}

// ═══════════════════════════════════════════════════════════════
// 3. DECISION JOURNAL
// ═══════════════════════════════════════════════════════════════

async function seedDecisionJournal() {
  console.log("\n=== 3. DECISION JOURNAL ===\n");

  await insertDecision({
    title: "Adopted multi-provider tier system with N-fallback chains",
    description:
      "Implemented centralized tier system in lib/tiers.ts with 3 tiers (Intern/Associate/Partner) " +
      "and N-fallback chains per agent. Each agent has an ordered list of models across 7 providers. " +
      "On 429 rate limit or provider failure, system automatically descends to next model in chain. " +
      "Registry in lib/models.ts (~40 models), router in lib/ai-sdk/generate.ts, " +
      "runner in lib/ai-sdk/agent-runner.ts. Toggle per-agent via PowerPanel UI.",
    department: "architecture",
    decision_type: "architectural",
    decided_by: "boss",
    expected_outcome: "Handle 429 rate limits without downtime, reduce API costs via free tier providers",
    actual_outcome:
      "Validated Q1 2026: zero downtime during rate limit spikes. Volume grew 867% while cost grew only 32%. " +
      "Cost per call dropped 86% ($0.0517 to $0.0071). Free providers (Cerebras, Groq) absorb 87% of calls.",
    outcome_score: 0.95,
    status: "reviewed",
    tags: ["architecture", "cost-optimization", "reliability", "q1-2026"],
    metadata: { adr: "lib/tiers.ts", providers: 7, models: 40 },
  });

  await insertDecision({
    title: "HR vertical before Tax vertical",
    description:
      "Prioritized HR/Consulente del Lavoro vertical over Tax/Commercialista. " +
      "RICE score: HR 510 vs Tax 180. HR: 3-4 weeks TTM, 200K professionals TAM, " +
      "no Italian competitor, 70% tech readiness. Tax: 8-10 weeks TTM, higher TAM (8 Mld EUR) " +
      "but Harvey actively localizing for enterprise tax IT. " +
      "HR corpus already 572 articles loaded (6 sources: D.Lgs. 81/2008, 81/2015, 276/2003, 23/2015, 148/2015, L. 300/1970).",
    department: "strategy",
    decision_type: "strategic",
    decided_by: "cme",
    expected_outcome: "3-4 week time to market, 200K TAM capture, first-mover in Italian HR legal AI",
    tags: ["strategy", "vertical-expansion", "hr", "q2-2026"],
    metadata: { rice_hr: 510, rice_tax: 180, hr_articles: 572 },
  });

  await insertDecision({
    title: "Paper trading approved — 30 days paper then go-live review",
    description:
      "Approved paper trading phase for the trading engine after backtest cycle #3 showed promising results " +
      "(Sharpe 0.975, just 0.025 below threshold). 5+1 agents operational, slope+volume strategy on 43 tickers. " +
      "Paper portfolio started at $100,000. 30-day paper trading period mandatory before go-live decision. " +
      "Go-live review scheduled for 2026-04-02. Kill switch parameters: -2% daily, -5% weekly.",
    department: "trading",
    decision_type: "operational",
    decided_by: "boss",
    expected_outcome: "30 days paper trading to validate strategy in real-time. Go-live if Sharpe > 1.0 confirmed.",
    tags: ["trading", "go-live", "paper-trading", "q1-2026"],
    metadata: { review_date: "2026-04-02", initial_capital: 100000, sharpe_threshold: 1.0 },
  });

  await insertDecision({
    title: "Forma Mentis architecture adopted — cross-session memory for self-learning company",
    description:
      "Adopted 4-layer Forma Mentis architecture for persistent company intelligence: " +
      "Layer 1 MEMORIA (company_sessions, department_memory, company_knowledge), " +
      "Layer 3 COSCIENZA (company_goals, daemon_reports), " +
      "Layer 4 RIFLESSIONE (decision_journal). " +
      "Migration 040. Voyage AI embeddings for semantic search (HNSW pgvector). " +
      "RPC functions: match_company_knowledge, match_department_memory, match_company_sessions, match_decisions. " +
      "ADR: company/architecture/adr/ADR-forma-mentis.md.",
    department: "architecture",
    decision_type: "architectural",
    decided_by: "boss",
    expected_outcome: "Cross-session memory enabling self-learning company. Every session learns from past sessions.",
    tags: ["architecture", "forma-mentis", "memory", "q1-2026"],
    metadata: { migration: "040_forma_mentis.sql", layers: 4, tables: 6, rpc_functions: 4 },
  });

  await insertDecision({
    title: "Console as product pivot — from LegalTech tool to Agent Orchestration platform",
    description:
      "Strategic reframe: the multi-agent console (lib/ai-sdk/, lib/tiers.ts, lib/models.ts, components/console/) " +
      "is the real product differentiator, not just the legal analysis vertical. " +
      "TAM expansion from $5B (LegalTech) to $93B (Agent Orchestration, CAGR 44.6%). " +
      "Poimandres codename for standalone product. Tech readiness 95%. " +
      "Competitive advantage: no existing tool has tier switch UI + N-fallback real-time. " +
      "LangGraph (no fallback), CrewAI (single provider), AutoGen (no cost control). " +
      "Window: 4-5 months before LangGraph covers the gap.",
    department: "strategy",
    decision_type: "strategic",
    decided_by: "boss",
    expected_outcome: "TAM expansion from $5B to $93B. Parallel product without distracting from consumer legal.",
    tags: ["strategy", "poimandres", "pivot", "tam-expansion", "q1-2026"],
    metadata: { tam_before: "$5B", tam_after: "$93B", cagr: "44.6%", tech_readiness: "95%" },
  });

  await insertDecision({
    title: "Security audit all 50 routes — comprehensive hardening",
    description:
      "Conducted full security audit across all 50 API routes. " +
      "Results: 0 critical, 0 high (3 high found and resolved), 11 medium (all resolved), 4 low remaining. " +
      "Infrastructure implemented: HTTP headers (CSP, HSTS, X-Frame-Options), " +
      "centralized middleware (auth, rate-limit, CSRF, sanitization, audit-log, console-token), " +
      "HMAC-SHA256 console tokens, RLS on all tables, GDPR TTL. " +
      "Security status: GREEN since 2026-03-08.",
    department: "security",
    decision_type: "operational",
    decided_by: "cme",
    expected_outcome: "Zero medium+ findings, comprehensive protection for production deploy",
    actual_outcome:
      "All medium+ findings resolved. 4 low findings remain (non-blocking). " +
      "Security GREEN status achieved. Ready for production deploy.",
    outcome_score: 0.9,
    status: "reviewed",
    tags: ["security", "audit", "hardening", "q1-2026"],
    metadata: { routes_audited: 50, findings_resolved: 14, remaining_low: 4 },
  });

  await insertDecision({
    title: "Voyage AI voyage-law-2 for legal embeddings",
    description:
      "Selected Voyage AI voyage-law-2 (1024 dimensions) as the embedding model for all legal text. " +
      "Specialized for legal domain — outperforms general-purpose embeddings on Italian legal text similarity. " +
      "Used across all vector DB tables: legal_articles, document_chunks, legal_knowledge. " +
      "HNSW index on pgvector for fast similarity search.",
    department: "architecture",
    decision_type: "architectural",
    decided_by: "cme",
    expected_outcome: "High-quality semantic similarity for Italian legal text, enabling accurate RAG retrieval",
    actual_outcome:
      "Operational since Q1. 5600+ articles embedded. Corpus Q&A agent uses embeddings successfully. " +
      "RAG pipeline in legal analysis validates correct article retrieval for Italian contract law.",
    outcome_score: 0.85,
    status: "reviewed",
    tags: ["architecture", "embeddings", "rag", "vector-db"],
    metadata: { model: "voyage-law-2", dimensions: 1024, articles_embedded: 5600 },
  });
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║     BOOTSTRAP FORMA MENTIS — Company Knowledge Seed    ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  // Validate env
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("\n[BOOTSTRAP] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  await seedCompanyKnowledge();
  await seedDepartmentMemory();
  await seedDecisionJournal();

  // ─── Summary ───
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                      SUMMARY                           ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║  company_knowledge:  ${String(counters.knowledge.created).padStart(2)} created, ${String(counters.knowledge.skipped).padStart(2)} skipped${" ".repeat(14)}║`);
  console.log(`║  department_memory:  ${String(counters.deptMemory.created).padStart(2)} created, ${String(counters.deptMemory.skipped).padStart(2)} skipped${" ".repeat(14)}║`);
  console.log(`║  decision_journal:   ${String(counters.decisions.created).padStart(2)} created, ${String(counters.decisions.skipped).padStart(2)} skipped${" ".repeat(14)}║`);
  console.log("╠══════════════════════════════════════════════════════════╣");

  const totalCreated = counters.knowledge.created + counters.deptMemory.created + counters.decisions.created;
  const totalSkipped = counters.knowledge.skipped + counters.deptMemory.skipped + counters.decisions.skipped;
  console.log(`║  TOTAL: ${totalCreated} created, ${totalSkipped} skipped (${totalCreated + totalSkipped} processed)${" ".repeat(Math.max(0, 12 - String(totalCreated + totalSkipped).length))}║`);
  console.log("╚══════════════════════════════════════════════════════════╝\n");
}

main().catch((err) => {
  console.error("[BOOTSTRAP] Fatal error:", err);
  process.exit(1);
});
