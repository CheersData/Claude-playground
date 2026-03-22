#!/usr/bin/env npx tsx
/**
 * seed-forma-mentis-goals.ts — Popola company_goals dal OKR Q2 2026 + rischi + trading.
 *
 * Legge company/strategy/status.json e crea goal gerarchici:
 *   - 3 Objective parent goals (O1, O2, O3)
 *   - 9 Key Result child goals con metriche specifiche
 *   - 2 Risk goals (R-1 EU AI Act, R-3 zero utenti)
 *   - 1 Trading goal (Sharpe > 1.0)
 *
 * Idempotente: se un goal con lo stesso title esiste gia, lo salta.
 *
 * Uso:
 *   npx tsx scripts/seed-forma-mentis-goals.ts
 *
 * Requisiti:
 *   - NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nel .env.local
 *   - Migration company_goals gia eseguita su Supabase
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Carica env dal .env.local della app
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { createAdminClient } from "@/lib/supabase/admin";
import type { GoalAction } from "@/lib/company/coscienza/types";

// ─── Types for status.json ───

interface KR {
  id: string;
  description: string;
  baseline: string;
  target: string;
  metric: string;
  owner: string;
  priority: string;
}

interface Objective {
  title: string;
  rationale: string;
  kr: KR[];
  status: string;
}

interface Risk {
  id: string;
  description: string;
  severity: string;
  probability: string;
  mitigation: string;
  deadline: string;
}

interface StatusJson {
  okr_q2: Record<string, Objective>;
  risks: Risk[];
}

// ─── Constants ───

const Q2_DEADLINE = "2026-06-30";

// ─── KR Metric Mapping ───
// Maps KR IDs to structured metric info, since the raw OKR data
// uses human-readable strings that need normalization.

interface KRMetricInfo {
  metric: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  department: string;
  actionsIfBehind: GoalAction[];
}

function getKRMetricInfo(objectiveKey: string, kr: KR): KRMetricInfo {
  const key = `${objectiveKey}-${kr.id}`;

  const mapping: Record<string, KRMetricInfo> = {
    // O1: Production-ready
    "o1-KR1": {
      metric: "test_coverage",
      targetValue: 80,
      currentValue: 55,
      unit: "%",
      department: "quality-assurance",
      actionsIfBehind: [
        {
          action: "QA: identify uncovered critical paths and create test plan",
          triggerThreshold: 0.5,
          escalationLevel: "L1",
        },
        {
          action: "Escalate to CME: test coverage significantly below target, need resource allocation",
          triggerThreshold: 0.3,
          escalationLevel: "L2",
        },
      ],
    },
    "o1-KR2": {
      metric: "cache_supabase_migration",
      targetValue: 1,
      currentValue: 0,
      unit: "count",
      department: "architecture",
      actionsIfBehind: [
        {
          action: "Architecture: prioritize TD-1 cache migration sprint",
          triggerThreshold: 0.5,
          escalationLevel: "L1",
        },
        {
          action: "Escalate to CME: cache migration blocking production deploy",
          triggerThreshold: 0.1,
          escalationLevel: "L2",
        },
      ],
    },
    "o1-KR3": {
      metric: "ci_cd_green",
      targetValue: 1,
      currentValue: 0,
      unit: "count",
      department: "quality-assurance",
      actionsIfBehind: [
        {
          action: "QA: triage failing tests and ESLint errors, create fix tasks",
          triggerThreshold: 0.5,
          escalationLevel: "L1",
        },
        {
          action: "Escalate to CME: CI/CD not green, blocking all PR merges",
          triggerThreshold: 0.1,
          escalationLevel: "L2",
        },
      ],
    },

    // O2: Corpus + HR vertical
    "o2-KR1": {
      metric: "corpus_articles_hr",
      targetValue: 400,
      currentValue: 572,
      unit: "count",
      department: "data-engineering",
      actionsIfBehind: [
        {
          action: "DE: run data-connector pipeline for remaining HR sources",
          triggerThreshold: 0.5,
          escalationLevel: "L1",
        },
        {
          action: "Escalate to CME: HR corpus loading blocked, check source configs",
          triggerThreshold: 0.2,
          escalationLevel: "L2",
        },
      ],
    },
    "o2-KR2": {
      metric: "institute_coverage_ratio",
      targetValue: 80,
      currentValue: 54.5,
      unit: "%",
      department: "data-engineering",
      actionsIfBehind: [
        {
          action: "DE: run AI pass on articles missing institutes (batch LLM classification)",
          triggerThreshold: 0.5,
          escalationLevel: "L1",
        },
        {
          action: "Escalate to CME: institute coverage stalled, may need manual review of edge cases",
          triggerThreshold: 0.3,
          escalationLevel: "L2",
        },
      ],
    },
    "o2-KR3": {
      metric: "hr_agent_validated_analyses",
      targetValue: 3,
      currentValue: 0,
      unit: "count",
      department: "ufficio-legale",
      actionsIfBehind: [
        {
          action: "UL: create test contracts (TD, TI, licenziamento) and run analysis pipeline",
          triggerThreshold: 0.5,
          escalationLevel: "L1",
        },
        {
          action: "Escalate to CME: HR Agent not producing valid analyses, need prompt review",
          triggerThreshold: 0.1,
          escalationLevel: "L2",
        },
      ],
    },

    // O3: Market validation
    "o3-KR1": {
      metric: "paying_users",
      targetValue: 1,
      currentValue: 0,
      unit: "count",
      department: "marketing",
      actionsIfBehind: [
        {
          action: "Marketing: activate outreach campaign, push landing /affitti live",
          triggerThreshold: 0.5,
          escalationLevel: "L1",
        },
        {
          action: "Escalate to CME: zero paying users, need boss approval for deploy (D-06)",
          triggerThreshold: 0.1,
          escalationLevel: "L2",
        },
        {
          action: "BOSS ALERT: zero revenue after Q2 midpoint, strategic review needed",
          triggerThreshold: 0.05,
          escalationLevel: "L3",
        },
      ],
    },
    "o3-KR2": {
      metric: "real_analyses_completed",
      targetValue: 20,
      currentValue: 0,
      unit: "count",
      department: "operations",
      actionsIfBehind: [
        {
          action: "Operations: check if deploy is live, verify user funnel, check error rates",
          triggerThreshold: 0.5,
          escalationLevel: "L1",
        },
        {
          action: "Escalate to CME: very few real analyses, investigate conversion funnel",
          triggerThreshold: 0.2,
          escalationLevel: "L2",
        },
      ],
    },
    "o3-KR3": {
      metric: "seo_articles_published",
      targetValue: 4,
      currentValue: 0,
      unit: "count",
      department: "marketing",
      actionsIfBehind: [
        {
          action: "Marketing: prioritize content publishing, boss already approved content calendar",
          triggerThreshold: 0.5,
          escalationLevel: "L1",
        },
        {
          action: "Escalate to CME: SEO content not published, quick win being missed",
          triggerThreshold: 0.2,
          escalationLevel: "L2",
        },
      ],
    },
  };

  const info = mapping[key];
  if (info) return info;

  // Fallback: parse from raw KR data
  const targetMatch = kr.target.match(/(\d+(?:\.\d+)?)/);
  const targetValue = targetMatch ? parseFloat(targetMatch[1]) : 100;

  return {
    metric: kr.id.toLowerCase().replace(/\s+/g, "_"),
    targetValue,
    currentValue: 0,
    unit: kr.target.includes("%") ? "%" : "count",
    department: kr.owner.split(" + ")[0].trim(),
    actionsIfBehind: [
      {
        action: `Review progress on ${kr.id}: ${kr.description}`,
        triggerThreshold: 0.3,
        escalationLevel: "L1",
      },
      {
        action: `Escalate to CME: ${kr.id} significantly behind target`,
        triggerThreshold: 0.15,
        escalationLevel: "L2",
      },
    ],
  };
}

// ─── Main ───

async function main() {
  const statusPath = path.resolve(
    __dirname,
    "../company/strategy/status.json"
  );

  if (!fs.existsSync(statusPath)) {
    console.error(`[SEED] File not found: ${statusPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(statusPath, "utf-8");
  const status: StatusJson = JSON.parse(raw);

  const admin = createAdminClient();
  let created = 0;
  let skipped = 0;

  // Helper: check if a goal with this title exists
  async function goalExists(title: string): Promise<string | null> {
    const { data } = await admin
      .from("company_goals")
      .select("id")
      .eq("title", title)
      .maybeSingle();
    return data?.id as string | null;
  }

  // Helper: create a goal, return its ID
  async function insertGoal(payload: Record<string, unknown>): Promise<string> {
    const { data, error } = await admin
      .from("company_goals")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      throw new Error(`Insert failed: ${error.message}`);
    }
    return data!.id as string;
  }

  console.log("\n=== SEED FORMA MENTIS GOALS ===\n");

  // ─── 1. OKR Objectives + Key Results ───

  for (const [objKey, objective] of Object.entries(status.okr_q2)) {
    const objTitle = `[${objKey.toUpperCase()}] ${objective.title}`;
    console.log(`\nObjective: ${objTitle}`);

    const existingId = await goalExists(objTitle);
    let parentGoalId: string;

    if (existingId) {
      parentGoalId = existingId;
      skipped++;
      console.log(`  SKIP (exists)`);
    } else {
      parentGoalId = await insertGoal({
        title: objTitle,
        description: objective.rationale,
        metric: `${objKey}_completion`,
        target_value: 100,
        current_value: 0,
        unit: "%",
        department: "strategy",
        status: objective.status === "at_risk" ? "at_risk" : "active",
        deadline: Q2_DEADLINE,
        check_interval_minutes: 60,
        value_history: [
          { value: 0, timestamp: new Date().toISOString(), source: "seed" },
        ],
        actions_if_behind: [
          {
            action: `Review ${objKey.toUpperCase()} progress across all KRs`,
            triggerThreshold: 0.4,
            escalationLevel: "L1",
          },
          {
            action: `Escalate ${objKey.toUpperCase()} to CME: objective at risk`,
            triggerThreshold: 0.2,
            escalationLevel: "L2",
          },
        ],
        tags: ["okr", "q2-2026", objKey, "objective"],
        metadata: { source: "seed-forma-mentis-goals", objectiveKey: objKey },
      });
      created++;
      console.log(`  CREATED (id: ${parentGoalId})`);
    }

    // Create KR child goals
    for (const kr of objective.kr) {
      const krTitle = `[${objKey.toUpperCase()}-${kr.id}] ${kr.description}`;
      console.log(`  KR: ${krTitle}`);

      const existingKrId = await goalExists(krTitle);
      if (existingKrId) {
        skipped++;
        console.log(`    SKIP (exists)`);
        continue;
      }

      const info = getKRMetricInfo(objKey, kr);

      const krGoalId = await insertGoal({
        title: krTitle,
        description: [
          kr.description,
          "",
          `Baseline: ${kr.baseline}`,
          `Target: ${kr.target}`,
          `Metric query: ${kr.metric}`,
          `Priority: ${kr.priority}`,
          `Owner: ${kr.owner}`,
        ].join("\n"),
        metric: info.metric,
        target_value: info.targetValue,
        current_value: info.currentValue,
        unit: info.unit,
        department: info.department,
        owner_agent: kr.owner,
        deadline: Q2_DEADLINE,
        status: "active",
        check_interval_minutes: 120,
        value_history: [
          {
            value: info.currentValue,
            timestamp: new Date().toISOString(),
            source: "seed",
          },
        ],
        parent_goal_id: parentGoalId,
        actions_if_behind: info.actionsIfBehind,
        tags: ["okr", "q2-2026", objKey, kr.id.toLowerCase(), kr.priority],
        metadata: {
          source: "seed-forma-mentis-goals",
          objectiveKey: objKey,
          krId: kr.id,
          priority: kr.priority,
          baseline: kr.baseline,
          metricQuery: kr.metric,
        },
      });
      created++;
      console.log(`    CREATED (id: ${krGoalId})`);
    }
  }

  // ─── 2. Risk Goals ───

  console.log("\n--- Risk Goals ---\n");

  // R-1: EU AI Act
  const r1 = status.risks.find((r) => r.id === "R-1");
  if (r1) {
    const r1Title = "[RISK R-1] EU AI Act compliance — scadenza agosto 2026";
    console.log(`Risk: ${r1Title}`);

    const existingR1 = await goalExists(r1Title);
    if (existingR1) {
      skipped++;
      console.log("  SKIP (exists)");
    } else {
      await insertGoal({
        title: r1Title,
        description: [
          r1.description,
          "",
          `Severity: ${r1.severity}`,
          `Probability: ${r1.probability}`,
          `Mitigation: ${r1.mitigation}`,
        ].join("\n"),
        metric: "eu_ai_act_compliance_steps",
        target_value: 3,
        current_value: 0,
        unit: "count",
        department: "security",
        deadline: "2026-08-01",
        status: "active",
        check_interval_minutes: 1440, // daily
        value_history: [
          { value: 0, timestamp: new Date().toISOString(), source: "seed" },
        ],
        actions_if_behind: [
          {
            action: "Security: identify EU AI Act consultant candidates, prepare RFP",
            triggerThreshold: 0.5,
            escalationLevel: "L1",
          },
          {
            action: "Escalate to CME: EU AI Act consultant not engaged, deadline approaching",
            triggerThreshold: 0.3,
            escalationLevel: "L2",
          },
          {
            action: "BOSS ALERT: EU AI Act deadline in < 3 months, no consultant engaged. Fine risk 15M EUR.",
            triggerThreshold: 0.1,
            escalationLevel: "L3",
          },
        ],
        tags: ["risk", "compliance", "eu-ai-act", "q2-2026"],
        metadata: {
          source: "seed-forma-mentis-goals",
          riskId: "R-1",
          maxFine: "15M EUR or 3% global turnover",
          complianceSteps: [
            "1. Engage EU AI Act consultant",
            "2. Complete gap analysis (7 Title III obligations)",
            "3. Implement compliance measures",
          ],
        },
      });
      created++;
      console.log("  CREATED");
    }
  }

  // R-3: Zero users
  const r3 = status.risks.find((r) => r.id === "R-3");
  if (r3) {
    const r3Title = "[RISK R-3] Zero utenti reali — deploy e traction";
    console.log(`Risk: ${r3Title}`);

    const existingR3 = await goalExists(r3Title);
    if (existingR3) {
      skipped++;
      console.log("  SKIP (exists)");
    } else {
      await insertGoal({
        title: r3Title,
        description: [
          r3.description,
          "",
          `Severity: ${r3.severity}`,
          `Probability: ${r3.probability}`,
          `Mitigation: ${r3.mitigation}`,
        ].join("\n"),
        metric: "real_users_active",
        target_value: 10,
        current_value: 0,
        unit: "count",
        department: "operations",
        deadline: Q2_DEADLINE,
        status: "at_risk",
        check_interval_minutes: 1440, // daily
        value_history: [
          { value: 0, timestamp: new Date().toISOString(), source: "seed" },
        ],
        actions_if_behind: [
          {
            action: "Operations: verify production deploy status, check Vercel dashboard",
            triggerThreshold: 0.5,
            escalationLevel: "L1",
          },
          {
            action: "Escalate to CME: zero users after midpoint, need deploy approval from boss (D-06)",
            triggerThreshold: 0.2,
            escalationLevel: "L2",
          },
          {
            action: "BOSS ALERT: zero real users, product not deployed. Revenue model unvalidated.",
            triggerThreshold: 0.05,
            escalationLevel: "L3",
          },
        ],
        tags: ["risk", "traction", "users", "q2-2026"],
        metadata: {
          source: "seed-forma-mentis-goals",
          riskId: "R-3",
          dependsOn: "D-06 boss approval for deploy",
        },
      });
      created++;
      console.log("  CREATED");
    }
  }

  // ─── 3. Trading Goal ───

  console.log("\n--- Trading Goals ---\n");

  const tradingTitle = "[TRADING] Sharpe ratio > 1.0 — go-live threshold";
  console.log(`Trading: ${tradingTitle}`);

  const existingTrading = await goalExists(tradingTitle);
  if (existingTrading) {
    skipped++;
    console.log("  SKIP (exists)");
  } else {
    await insertGoal({
      title: tradingTitle,
      description: [
        "Trading engine must achieve Sharpe ratio > 1.0 on 30-day paper trading before go-live approval.",
        "",
        "Current status (2026-03-03): Sharpe 0.975 (gap 0.025).",
        "Backtest cycle #3: 136 trades, CAGR 11.12%, Win Rate 52.2%, Profit Factor 2.20, Max DD 3.85%.",
        "Blocker: 126/136 exits on stop loss — TP 6xATR too distant.",
        "",
        "Go-live review date: 2026-04-02 (30 days paper trading).",
        "If Sharpe remains < 1.0: continue optimization, do NOT go live.",
      ].join("\n"),
      metric: "sharpe_ratio",
      target_value: 1.0,
      current_value: 0.975,
      unit: "ratio",
      department: "trading",
      owner_agent: "trading-lead",
      deadline: "2026-04-02",
      status: "active",
      check_interval_minutes: 1440, // daily
      value_history: [
        {
          value: 0.975,
          timestamp: new Date().toISOString(),
          source: "seed",
        },
      ],
      actions_if_behind: [
        {
          action: "Trading: run grid search on TP/SL parameters, review slope strategy thresholds",
          triggerThreshold: 0.8,
          escalationLevel: "L1",
        },
        {
          action: "Escalate to CME: Sharpe well below 1.0, consider extending paper trading period",
          triggerThreshold: 0.5,
          escalationLevel: "L2",
        },
        {
          action: "BOSS ALERT: Trading Sharpe critically low, recommend halt and strategy review",
          triggerThreshold: 0.3,
          escalationLevel: "L3",
        },
      ],
      tags: ["trading", "sharpe", "go-live", "q2-2026"],
      metadata: {
        source: "seed-forma-mentis-goals",
        reviewDate: "2026-04-02",
        backtestCycle: 3,
        currentCAGR: "11.12%",
        currentWinRate: "52.2%",
        currentProfitFactor: 2.2,
        currentMaxDD: "3.85%",
      },
    });
    created++;
    console.log("  CREATED");
  }

  // ─── Summary ───

  console.log("\n=== SUMMARY ===");
  console.log(`Created ${created} goals, skipped ${skipped} existing`);
  console.log(`Total: ${created + skipped} goals processed\n`);
}

main().catch((err) => {
  console.error("[SEED] Fatal error:", err);
  process.exit(1);
});
