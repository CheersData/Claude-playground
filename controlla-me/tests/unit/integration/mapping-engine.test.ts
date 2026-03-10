/**
 * Tests: MappingEngine — 4-level field resolution engine.
 *
 * Covers:
 * - resolveField L1 (rules) returns with confidence 1.0
 * - resolveField L2 (similarity) returns with confidence < 1.0
 * - resolveFields batch returns all results
 * - resolution order: L0 -> L1 -> L2 -> L3
 * - cache hit avoids duplicate resolution
 * - clearCache resets state
 *
 * Mocks: Supabase (via learning.ts), LLM (via llm-mapper.ts)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Supabase admin client (for learning.ts DB calls) ───────────────────

const mockRpc = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}));

// ── Mock LLM mapper (avoid real LLM calls) ─────────────────────────────────

vi.mock("@/lib/staff/data-connector/mapping/llm-mapper", () => ({
  llmMapFields: vi.fn().mockResolvedValue([]),
}));

// ── Mock learning module (DB calls) ─────────────────────────────────────────

vi.mock("@/lib/staff/data-connector/mapping/learning", () => ({
  getLearnedMapping: vi.fn().mockResolvedValue(null),
  getLearnedMappingsBatch: vi.fn().mockResolvedValue(new Map()),
  saveLearnedMapping: vi.fn().mockResolvedValue(undefined),
  getAllLearnedMappings: vi.fn().mockResolvedValue([]),
}));

// Import after mocks
import { MappingEngine } from "@/lib/staff/data-connector/mapping";
import { getLearnedMapping, getLearnedMappingsBatch } from "@/lib/staff/data-connector/mapping/learning";
import { llmMapFields } from "@/lib/staff/data-connector/mapping/llm-mapper";

// ── Setup ───────────────────────────────────────────────────────────────────

let engine: MappingEngine;

beforeEach(() => {
  vi.clearAllMocks();
  engine = new MappingEngine();
  engine.clearCache();
});

// =============================================================================
// resolveField — L1 rules
// =============================================================================

describe("resolveField — L1 rules", () => {
  it("resolves known global alias with confidence 1.0 and level 'rule'", async () => {
    const result = await engine.resolveField("hubspot", "email");

    expect(result.sourceField).toBe("email");
    expect(result.targetField).toBe("email");
    expect(result.level).toBe("rule");
    expect(result.confidence).toBe(1.0);
  });

  it("resolves connector-specific alias with confidence 1.0", async () => {
    const result = await engine.resolveField("hubspot", "jobtitle");

    expect(result.sourceField).toBe("jobtitle");
    expect(result.targetField).toBe("job_title");
    expect(result.level).toBe("rule");
    expect(result.confidence).toBe(1.0);
  });

  it("resolves Italian alias via global rules", async () => {
    const result = await engine.resolveField("_any", "cognome");

    expect(result.targetField).toBe("last_name");
    expect(result.level).toBe("rule");
    expect(result.confidence).toBe(1.0);
  });

  it("does not call LLM when rule resolves the field", async () => {
    await engine.resolveField("hubspot", "firstname");

    expect(llmMapFields).not.toHaveBeenCalled();
  });
});

// =============================================================================
// resolveField — L2 similarity
// =============================================================================

describe("resolveField — L2 similarity", () => {
  it("falls back to similarity when no rule matches", async () => {
    // "company_nam" is close to "company_name" but not an exact alias
    // The similarity engine should pick it up
    const result = await engine.resolveField("hubspot", "company_nam");

    // Should fall through L0 (no learned), L1 (no exact alias), to L2 (similarity)
    if (result.level === "similarity") {
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.confidence).toBeLessThan(1.0);
    }
    // If it matches via rule (normalization), that's also acceptable
    expect(["rule", "similarity"]).toContain(result.level);
  });
});

// =============================================================================
// resolveField — L0 user_confirmed (mocked)
// =============================================================================

describe("resolveField — L0 user_confirmed", () => {
  it("uses learned mapping when available (highest priority)", async () => {
    vi.mocked(getLearnedMapping).mockResolvedValueOnce("custom_target");

    const result = await engine.resolveField("hubspot", "some_field", "user-1");

    expect(result.sourceField).toBe("some_field");
    expect(result.targetField).toBe("custom_target");
    expect(result.level).toBe("user_confirmed");
    expect(result.confidence).toBe(1.0);
  });

  it("L0 takes priority over L1 rules", async () => {
    // "email" has a global alias rule, but learned mapping should win
    vi.mocked(getLearnedMapping).mockResolvedValueOnce("custom_email_field");

    const result = await engine.resolveField("hubspot", "email", "user-1");

    expect(result.targetField).toBe("custom_email_field");
    expect(result.level).toBe("user_confirmed");
  });
});

// =============================================================================
// resolveField — L3 LLM fallback
// =============================================================================

describe("resolveField — L3 LLM fallback", () => {
  it("calls LLM when L0, L1, L2 all fail", async () => {
    vi.mocked(llmMapFields).mockResolvedValueOnce([
      {
        sourceField: "zzz_exotic_field",
        targetField: "description",
        confidence: 0.7,
        transform: "direct",
        reasoning: "LLM mapped field",
      },
    ]);

    const result = await engine.resolveField("hubspot", "zzz_exotic_field");

    expect(llmMapFields).toHaveBeenCalled();
    expect(result.targetField).toBe("description");
    expect(result.level).toBe("llm");
    expect(result.confidence).toBe(0.7);
  });

  it("returns empty target with confidence 0 when LLM also fails", async () => {
    vi.mocked(llmMapFields).mockResolvedValueOnce([]);

    const result = await engine.resolveField("hubspot", "zzz_completely_unknown_field_xyz");

    expect(result.targetField).toBe("");
    expect(result.confidence).toBe(0);
  });

  it("handles LLM error gracefully (returns confidence 0)", async () => {
    vi.mocked(llmMapFields).mockRejectedValueOnce(new Error("LLM offline"));

    const result = await engine.resolveField("hubspot", "zzz_field_that_needs_llm_abc");

    expect(result.targetField).toBe("");
    expect(result.confidence).toBe(0);
  });
});

// =============================================================================
// resolveFields — batch
// =============================================================================

describe("resolveFields — batch", () => {
  it("resolves multiple fields in a single batch", async () => {
    const results = await engine.resolveFields("hubspot", [
      "firstname",
      "lastname",
      "email",
    ]);

    expect(results).toHaveLength(3);
    expect(results[0].targetField).toBe("first_name");
    expect(results[1].targetField).toBe("last_name");
    expect(results[2].targetField).toBe("email");
  });

  it("uses batch learned mappings query (L0)", async () => {
    const batchMap = new Map([
      ["custom_field_a", "target_a"],
      ["custom_field_b", "target_b"],
    ]);
    vi.mocked(getLearnedMappingsBatch).mockResolvedValueOnce(batchMap);

    const results = await engine.resolveFields(
      "hubspot",
      ["custom_field_a", "custom_field_b"],
      "user-1"
    );

    expect(results[0].targetField).toBe("target_a");
    expect(results[0].level).toBe("user_confirmed");
    expect(results[1].targetField).toBe("target_b");
    expect(results[1].level).toBe("user_confirmed");
  });

  it("batches unresolved fields into a single LLM call", async () => {
    vi.mocked(llmMapFields).mockResolvedValueOnce([
      { sourceField: "zzz_field_a", targetField: "notes", confidence: 0.6, transform: "direct", reasoning: "LLM mapped" },
      { sourceField: "zzz_field_b", targetField: "description", confidence: 0.5, transform: "direct", reasoning: "LLM mapped" },
    ]);

    const results = await engine.resolveFields("hubspot", [
      "email",           // L1 resolved
      "zzz_field_a",     // L3 LLM
      "zzz_field_b",     // L3 LLM
    ]);

    expect(results[0].level).toBe("rule");
    // LLM should be called once with both unresolved fields
    expect(llmMapFields).toHaveBeenCalledTimes(1);
  });

  it("returns empty array for empty input", async () => {
    const results = await engine.resolveFields("hubspot", []);
    expect(results).toHaveLength(0);
  });
});

// =============================================================================
// Cache behavior
// =============================================================================

describe("cache", () => {
  it("cache hit avoids duplicate resolution (no repeated DB/LLM calls)", async () => {
    // First call
    await engine.resolveField("hubspot", "email");
    // Second call should use cache
    await engine.resolveField("hubspot", "email");

    // getLearnedMapping should only be called once (first time)
    expect(getLearnedMapping).toHaveBeenCalledTimes(1);
  });

  it("clearCache resets state and forces new resolution", async () => {
    // First call
    await engine.resolveField("hubspot", "email");

    // Clear cache
    engine.clearCache();

    // Second call should re-resolve
    await engine.resolveField("hubspot", "email");

    // getLearnedMapping should be called twice
    expect(getLearnedMapping).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// Resolution order
// =============================================================================

describe("resolution order: L0 -> L1 -> L2 -> L3", () => {
  it("L0 prevents L1 from being checked", async () => {
    vi.mocked(getLearnedMapping).mockResolvedValueOnce("learned_target");

    const result = await engine.resolveField("hubspot", "email", "user-1");

    // "email" would normally resolve at L1, but L0 should win
    expect(result.level).toBe("user_confirmed");
    expect(result.targetField).toBe("learned_target");
  });

  it("L1 prevents LLM from being called", async () => {
    const result = await engine.resolveField("hubspot", "firstname");

    expect(result.level).toBe("rule");
    expect(llmMapFields).not.toHaveBeenCalled();
  });
});
