import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  computeLifecycleStage,
  computeLifecycleStageFromProfile,
  computeChurnRisk,
  computeEngagementScore,
  inferSector,
} from "@/lib/cdp/profile-builder";

import {
  createDefaultBehavior,
  createDefaultLifecycle,
  createDefaultPreferences,
} from "@/lib/cdp/types";

import type { CDPBehavior, CDPLifecycle, CDPPreferences } from "@/lib/cdp/types";

// ─────────────────────────────────────────────────────
// Section 1: computeLifecycleStage (simple version)
// ─────────────────────────────────────────────────────

describe("computeLifecycleStage", () => {
  const now = new Date();

  it("returns 'new' for 0 analyses", () => {
    expect(computeLifecycleStage(0, "free", now)).toBe("new");
  });

  it("returns 'activated' for 1 analysis", () => {
    expect(computeLifecycleStage(1, "free", now)).toBe("activated");
  });

  it("returns 'activated' for 2 analyses", () => {
    expect(computeLifecycleStage(2, "free", now)).toBe("activated");
  });

  it("returns 'engaged' for 3+ analyses", () => {
    expect(computeLifecycleStage(3, "free", now)).toBe("engaged");
    expect(computeLifecycleStage(9, "free", now)).toBe("engaged");
  });

  it("returns 'engaged' for 10+ analyses without pro plan", () => {
    expect(computeLifecycleStage(10, "free", now)).toBe("engaged");
    expect(computeLifecycleStage(50, null, now)).toBe("engaged");
  });

  it("returns 'power_user' for 10+ analyses with pro plan", () => {
    expect(computeLifecycleStage(10, "pro", now)).toBe("power_user");
    expect(computeLifecycleStage(100, "pro", now)).toBe("power_user");
  });
});

// ─────────────────────────────────────────────────────
// Section 2: computeLifecycleStageFromProfile
// ─────────────────────────────────────────────────────

describe("computeLifecycleStageFromProfile", () => {
  let behavior: CDPBehavior;
  let lifecycle: CDPLifecycle;
  let preferences: CDPPreferences;

  beforeEach(() => {
    behavior = createDefaultBehavior();
    lifecycle = createDefaultLifecycle();
    preferences = createDefaultPreferences();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'new' for fresh user with no activity", () => {
    expect(computeLifecycleStageFromProfile(behavior, lifecycle, preferences)).toBe("new");
  });

  it("returns 'activated' for 1+ total analyses", () => {
    behavior.total_analyses = 1;
    behavior.last_active_at = new Date().toISOString();
    expect(computeLifecycleStageFromProfile(behavior, lifecycle, preferences)).toBe("activated");
  });

  it("returns 'engaged' for 3+ analyses in last 30 days", () => {
    behavior.total_analyses = 3;
    behavior.analyses_last_30d = 3;
    behavior.last_active_at = new Date().toISOString();
    expect(computeLifecycleStageFromProfile(behavior, lifecycle, preferences)).toBe("engaged");
  });

  it("returns 'power_user' for heavy user with pro plan", () => {
    behavior.total_analyses = 15;
    behavior.analyses_last_30d = 5;
    behavior.deep_search_rate = 0.5;
    behavior.last_active_at = new Date().toISOString();
    lifecycle.plan_history = [{ plan: "pro", from: "2026-01-01", to: null }];
    expect(computeLifecycleStageFromProfile(behavior, lifecycle, preferences)).toBe("power_user");
  });

  it("returns 'power_user' for high deep_search_rate even without pro", () => {
    behavior.total_analyses = 12;
    behavior.deep_search_rate = 0.4; // > 0.3
    behavior.last_active_at = new Date().toISOString();
    expect(computeLifecycleStageFromProfile(behavior, lifecycle, preferences)).toBe("power_user");
  });

  it("returns 'churning' for engaged user inactive 21-59 days", () => {
    behavior.total_analyses = 5;
    behavior.analyses_last_30d = 0;
    const thirtyDaysAgo = new Date("2026-02-10T12:00:00Z"); // ~26 days ago
    behavior.last_active_at = thirtyDaysAgo.toISOString();
    lifecycle.stage = "engaged";
    expect(computeLifecycleStageFromProfile(behavior, lifecycle, preferences)).toBe("churning");
  });

  it("returns 'churned' for user inactive 60+ days (was activated)", () => {
    behavior.total_analyses = 2;
    const ninetyDaysAgo = new Date("2025-12-08T12:00:00Z"); // ~90 days ago
    behavior.last_active_at = ninetyDaysAgo.toISOString();
    lifecycle.stage = "activated";
    expect(computeLifecycleStageFromProfile(behavior, lifecycle, preferences)).toBe("churned");
  });

  it("does NOT return 'churned' if current stage is 'new'", () => {
    behavior.last_active_at = null; // days since active = 999
    lifecycle.stage = "new";
    expect(computeLifecycleStageFromProfile(behavior, lifecycle, preferences)).toBe("new");
  });

  it("does NOT return 'churning' for activated user (only engaged/power_user)", () => {
    behavior.total_analyses = 1;
    const thirtyDaysAgo = new Date("2026-02-10T12:00:00Z");
    behavior.last_active_at = thirtyDaysAgo.toISOString();
    lifecycle.stage = "activated";
    expect(computeLifecycleStageFromProfile(behavior, lifecycle, preferences)).toBe("activated");
  });
});

// ─────────────────────────────────────────────────────
// Section 3: computeChurnRisk
// ─────────────────────────────────────────────────────

describe("computeChurnRisk", () => {
  let behavior: CDPBehavior;
  let lifecycle: CDPLifecycle;

  beforeEach(() => {
    behavior = createDefaultBehavior();
    lifecycle = createDefaultLifecycle();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-08T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 100 for user with no last_active_at (999 days)", () => {
    expect(computeChurnRisk(behavior, lifecycle)).toBe(100);
  });

  it("returns 0 for user active today", () => {
    behavior.last_active_at = new Date().toISOString();
    behavior.analyses_last_30d = 1;
    // daysSinceActive = 0, risk = 0, then -30 for recent analyses, clamped to 0
    expect(computeChurnRisk(behavior, lifecycle)).toBe(0);
  });

  it("scales risk proportionally to days inactive (2x)", () => {
    // 10 days inactive, no recent analyses
    behavior.last_active_at = new Date("2026-02-26T12:00:00Z").toISOString();
    const risk = computeChurnRisk(behavior, lifecycle);
    expect(risk).toBe(20); // 10 * 2 = 20
  });

  it("caps at 100 for very inactive users", () => {
    behavior.last_active_at = new Date("2025-01-01T12:00:00Z").toISOString();
    expect(computeChurnRisk(behavior, lifecycle)).toBe(100);
  });

  it("returns 100 for churned lifecycle stage", () => {
    behavior.last_active_at = new Date().toISOString();
    lifecycle.stage = "churned";
    expect(computeChurnRisk(behavior, lifecycle)).toBe(100);
  });

  it("returns at least 60 for churning stage", () => {
    behavior.last_active_at = new Date().toISOString();
    lifecycle.stage = "churning";
    // daysSinceActive = 0, risk = 0, then max(0, 60) = 60
    expect(computeChurnRisk(behavior, lifecycle)).toBeGreaterThanOrEqual(60);
  });

  it("reduces risk by 30 if user has recent analyses", () => {
    // 15 days inactive: base risk = 30
    behavior.last_active_at = new Date("2026-02-21T12:00:00Z").toISOString();
    behavior.analyses_last_30d = 2;
    const risk = computeChurnRisk(behavior, lifecycle);
    expect(risk).toBe(0); // 30 - 30 = 0
  });

  it("clamps result between 0-100", () => {
    behavior.last_active_at = new Date().toISOString();
    behavior.analyses_last_30d = 5;
    const risk = computeChurnRisk(behavior, lifecycle);
    expect(risk).toBeGreaterThanOrEqual(0);
    expect(risk).toBeLessThanOrEqual(100);
  });
});

// ─────────────────────────────────────────────────────
// Section 4: computeEngagementScore
// ─────────────────────────────────────────────────────

describe("computeEngagementScore", () => {
  let behavior: CDPBehavior;

  beforeEach(() => {
    behavior = createDefaultBehavior();
  });

  it("returns 0 for completely inactive user", () => {
    expect(computeEngagementScore(behavior)).toBe(0);
  });

  it("scores frequency at 40% weight (max 10 analyses)", () => {
    behavior.analyses_last_30d = 10;
    // frequency = 100, variety = 0, depth = 0, corpus = 0
    // total = 100 * 0.4 = 40
    expect(computeEngagementScore(behavior)).toBe(40);
  });

  it("scores variety at 20% weight (max 5 doc types)", () => {
    behavior.preferred_doc_types = ["a", "b", "c", "d", "e"];
    // frequency = 0, variety = 100, depth = 0, corpus = 0
    // total = 100 * 0.2 = 20
    expect(computeEngagementScore(behavior)).toBe(20);
  });

  it("scores depth at 20% weight (deep_search_rate 0-1)", () => {
    behavior.deep_search_rate = 1.0;
    // frequency = 0, variety = 0, depth = 100, corpus = 0
    // total = 100 * 0.2 = 20
    expect(computeEngagementScore(behavior)).toBe(20);
  });

  it("scores corpus at 20% weight (max 20 queries)", () => {
    behavior.corpus_queries = 20;
    // frequency = 0, variety = 0, depth = 0, corpus = 100
    // total = 100 * 0.2 = 20
    expect(computeEngagementScore(behavior)).toBe(20);
  });

  it("returns 100 for a max-engaged user", () => {
    behavior.analyses_last_30d = 10;
    behavior.preferred_doc_types = ["a", "b", "c", "d", "e"];
    behavior.deep_search_rate = 1.0;
    behavior.corpus_queries = 20;
    expect(computeEngagementScore(behavior)).toBe(100);
  });

  it("caps individual components at 100%", () => {
    behavior.analyses_last_30d = 50; // way over max
    behavior.corpus_queries = 100; // way over max
    const score = computeEngagementScore(behavior);
    // frequency = min(100, 500) = 100 * 0.4 = 40
    // corpus = min(100, 500) = 100 * 0.2 = 20
    // total = 60
    expect(score).toBe(60);
  });

  it("handles partial engagement", () => {
    behavior.analyses_last_30d = 5; // 50% frequency
    behavior.preferred_doc_types = ["a", "b"]; // 40% variety
    behavior.deep_search_rate = 0.5; // 50% depth
    behavior.corpus_queries = 10; // 50% corpus
    // total = 50*0.4 + 40*0.2 + 50*0.2 + 50*0.2 = 20 + 8 + 10 + 10 = 48
    expect(computeEngagementScore(behavior)).toBe(48);
  });
});

// ─────────────────────────────────────────────────────
// Section 5: inferSector
// ─────────────────────────────────────────────────────

describe("inferSector", () => {
  it("returns null for empty array", () => {
    expect(inferSector([])).toBeNull();
  });

  it("returns null for unknown doc types", () => {
    expect(inferSector(["unknown", "random", "stuff"])).toBeNull();
  });

  it("returns 'real_estate' for locazione-heavy list", () => {
    expect(inferSector(["locazione", "locazione", "compravendita"])).toBe("real_estate");
  });

  it("returns 'employment' for contratto_lavoro-heavy list", () => {
    expect(inferSector(["contratto_lavoro", "contratto_lavoro", "nda"])).toBe("employment");
  });

  it("returns 'corporate' for societario + nda majority", () => {
    expect(inferSector(["societario", "nda", "societario"])).toBe("corporate");
  });

  it("returns 'tech' for privacy + termini_servizio majority", () => {
    expect(inferSector(["privacy", "termini_servizio", "privacy"])).toBe("tech");
  });

  it("returns 'services' when prestazione_servizi dominates", () => {
    expect(inferSector(["prestazione_servizi", "prestazione_servizi", "nda"])).toBe("services");
  });

  it("returns null if top sector is below 40% threshold", () => {
    // 5 different sectors, none >= 40%
    expect(
      inferSector(["locazione", "contratto_lavoro", "societario", "privacy", "prestazione_servizi"])
    ).toBeNull();
  });

  it("returns sector at exactly 40% threshold", () => {
    // 2 out of 5 = 40% exactly
    expect(
      inferSector(["locazione", "locazione", "contratto_lavoro", "societario", "privacy"])
    ).toBe("real_estate");
  });

  it("ignores unmapped doc types in threshold calculation", () => {
    // 2 locazione out of 5 total (including unmapped) = 40%
    expect(inferSector(["locazione", "locazione", "unknown", "random", "stuff"])).toBe(
      "real_estate"
    );
  });
});
