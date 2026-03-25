/**
 * Tests: lib/company/cost-logger.ts — Agent cost logging and aggregation.
 *
 * Coverage targets: 218 lines, previously 0%.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const mockInsert = vi.hoisted(() => vi.fn());
const mockGte = vi.hoisted(() => vi.fn());
const mockOrder = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

import {
  logAgentCost,
  getDailyCosts,
  getTotalSpend,
  getProviderHealth,
} from "@/lib/company/cost-logger";

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockInsert.mockResolvedValue({ error: null });
  mockOrder.mockResolvedValue({ data: [], error: null });
  mockGte.mockReturnValue({ order: mockOrder });
  mockSelect.mockReturnValue({ gte: mockGte });
  mockFrom.mockReturnValue({ insert: mockInsert, select: mockSelect });
});

// =============================================================================
// logAgentCost
// =============================================================================

describe("logAgentCost", () => {
  it("inserts a cost log row with correct fields", async () => {
    await logAgentCost({
      agentName: "classifier",
      modelKey: "claude-haiku-4.5" as any,
      inputTokens: 1000,
      outputTokens: 500,
      durationMs: 3000,
      usedFallback: false,
    });

    expect(mockFrom).toHaveBeenCalledWith("agent_cost_log");
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        agent_name: "classifier",
        model_key: "claude-haiku-4.5",
        provider: "anthropic",
        input_tokens: 1000,
        output_tokens: 500,
        total_cost_usd: expect.any(Number),
        duration_ms: 3000,
        used_fallback: false,
        session_type: null,
      })
    );
  });

  it("calculates total_cost_usd from token counts and model pricing", async () => {
    await logAgentCost({
      agentName: "analyzer",
      modelKey: "claude-haiku-4.5" as any,
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      durationMs: 5000,
      usedFallback: false,
    });

    const insertArg = mockInsert.mock.calls[0][0];
    expect(typeof insertArg.total_cost_usd).toBe("number");
    expect(insertArg.total_cost_usd).toBeGreaterThanOrEqual(0);
  });

  it("passes sessionType when provided", async () => {
    await logAgentCost({
      agentName: "classifier",
      modelKey: "claude-haiku-4.5" as any,
      inputTokens: 100,
      outputTokens: 50,
      durationMs: 1000,
      usedFallback: false,
      sessionType: "console",
    });

    const insertArg = mockInsert.mock.calls[0][0];
    expect(insertArg.session_type).toBe("console");
  });

  it("logs error but does not throw on insert failure", async () => {
    mockInsert.mockResolvedValue({ error: { message: "DB down" } });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      logAgentCost({
        agentName: "classifier",
        modelKey: "claude-haiku-4.5" as any,
        inputTokens: 100,
        outputTokens: 50,
        durationMs: 1000,
        usedFallback: false,
      })
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("DB down"));
    consoleSpy.mockRestore();
  });
});

// =============================================================================
// getDailyCosts
// =============================================================================

describe("getDailyCosts", () => {
  it("returns empty array when no data", async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });
    const result = await getDailyCosts(7);
    expect(result).toEqual([]);
  });

  it("returns empty array on error", async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: "query failed" } });
    const result = await getDailyCosts(7);
    expect(result).toEqual([]);
  });

  it("groups costs by day", async () => {
    mockOrder.mockResolvedValue({
      data: [
        { created_at: "2026-03-20T10:00:00Z", agent_name: "classifier", provider: "anthropic", total_cost_usd: 0.01 },
        { created_at: "2026-03-20T15:00:00Z", agent_name: "analyzer", provider: "anthropic", total_cost_usd: 0.05 },
        { created_at: "2026-03-19T09:00:00Z", agent_name: "classifier", provider: "google", total_cost_usd: 0.001 },
      ],
      error: null,
    });

    const result = await getDailyCosts(7);
    expect(result).toHaveLength(2);

    const march20 = result.find((d) => d.date === "2026-03-20");
    expect(march20).toBeDefined();
    expect(march20!.totalCalls).toBe(2);
    expect(march20!.totalCost).toBeCloseTo(0.06);
    expect(march20!.byAgent.classifier).toBeCloseTo(0.01);
    expect(march20!.byAgent.analyzer).toBeCloseTo(0.05);
    expect(march20!.byProvider.anthropic).toBeCloseTo(0.06);
  });

  it("uses default of 7 days", async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });
    await getDailyCosts();
    expect(mockGte).toHaveBeenCalled();
  });
});

// =============================================================================
// getTotalSpend
// =============================================================================

describe("getTotalSpend", () => {
  it("returns zero values when no data", async () => {
    // For getTotalSpend, the chain is: select → gte (without order)
    mockGte.mockResolvedValue({ data: [], error: null });

    const result = await getTotalSpend(30);
    expect(result).toEqual({
      total: 0,
      calls: 0,
      avgPerCall: 0,
      byAgent: {},
      byProvider: {},
      fallbackRate: 0,
    });
  });

  it("returns zero values on error", async () => {
    mockGte.mockResolvedValue({ data: null, error: { message: "failed" } });

    const result = await getTotalSpend(30);
    expect(result.total).toBe(0);
    expect(result.calls).toBe(0);
  });

  it("aggregates costs by agent and provider", async () => {
    mockGte.mockResolvedValue({
      data: [
        { total_cost_usd: 0.10, used_fallback: false, agent_name: "classifier", provider: "anthropic" },
        { total_cost_usd: 0.05, used_fallback: true, agent_name: "analyzer", provider: "google" },
        { total_cost_usd: 0.02, used_fallback: false, agent_name: "classifier", provider: "anthropic" },
      ],
      error: null,
    });

    const result = await getTotalSpend(30);
    expect(result.calls).toBe(3);
    expect(result.total).toBeCloseTo(0.17);
    expect(result.avgPerCall).toBeCloseTo(0.17 / 3);
    expect(result.fallbackRate).toBeCloseTo(1 / 3);
    expect(result.byAgent.classifier.calls).toBe(2);
    expect(result.byAgent.analyzer.calls).toBe(1);
    expect(result.byProvider.anthropic.calls).toBe(2);
    expect(result.byProvider.google.calls).toBe(1);
  });
});

// =============================================================================
// getProviderHealth
// =============================================================================

describe("getProviderHealth", () => {
  it("returns empty object when no data", async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });
    const result = await getProviderHealth();
    expect(result).toEqual({});
  });

  it("returns empty object on error", async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: "failed" } });
    const result = await getProviderHealth();
    expect(result).toEqual({});
  });

  it("marks provider as 'ok' when no errors", async () => {
    mockOrder.mockResolvedValue({
      data: [
        { provider: "anthropic", used_fallback: false, created_at: "2026-03-20T10:00:00Z", duration_ms: 5000, total_cost_usd: 0.01 },
        { provider: "anthropic", used_fallback: false, created_at: "2026-03-20T09:50:00Z", duration_ms: 3000, total_cost_usd: 0.01 },
      ],
      error: null,
    });

    const result = await getProviderHealth();
    expect(result.anthropic.status).toBe("ok");
    expect(result.anthropic.recentCalls).toBe(2);
    expect(result.anthropic.recentErrors).toBe(0);
    expect(result.anthropic.lastCallAt).toBe("2026-03-20T10:00:00Z");
  });

  it("marks provider as 'degraded' when some errors", async () => {
    mockOrder.mockResolvedValue({
      data: [
        { provider: "google", used_fallback: true, created_at: "2026-03-20T10:00:00Z", duration_ms: 5000, total_cost_usd: 0 },
        { provider: "google", used_fallback: false, created_at: "2026-03-20T09:55:00Z", duration_ms: 5000, total_cost_usd: 0.01 },
        { provider: "google", used_fallback: false, created_at: "2026-03-20T09:50:00Z", duration_ms: 5000, total_cost_usd: 0.01 },
      ],
      error: null,
    });

    const result = await getProviderHealth();
    expect(result.google.status).toBe("degraded");
    expect(result.google.recentErrors).toBe(1);
  });

  it("marks provider as 'error' when >50% errors", async () => {
    mockOrder.mockResolvedValue({
      data: [
        { provider: "mistral", used_fallback: true, created_at: "2026-03-20T10:00:00Z", duration_ms: 5000, total_cost_usd: 0 },
        { provider: "mistral", used_fallback: true, created_at: "2026-03-20T09:55:00Z", duration_ms: 5000, total_cost_usd: 0 },
      ],
      error: null,
    });

    const result = await getProviderHealth();
    expect(result.mistral.status).toBe("error");
  });

  it("counts slow calls (>120s) as errors", async () => {
    mockOrder.mockResolvedValue({
      data: [
        { provider: "groq", used_fallback: false, created_at: "2026-03-20T10:00:00Z", duration_ms: 150_000, total_cost_usd: 0.01 },
        { provider: "groq", used_fallback: false, created_at: "2026-03-20T09:55:00Z", duration_ms: 150_000, total_cost_usd: 0.01 },
      ],
      error: null,
    });

    const result = await getProviderHealth();
    expect(result.groq.recentErrors).toBe(2);
    expect(result.groq.status).toBe("error");
  });

  it("handles multiple providers correctly", async () => {
    mockOrder.mockResolvedValue({
      data: [
        { provider: "anthropic", used_fallback: false, created_at: "2026-03-20T10:00:00Z", duration_ms: 5000, total_cost_usd: 0.05 },
        { provider: "google", used_fallback: true, created_at: "2026-03-20T10:00:00Z", duration_ms: 5000, total_cost_usd: 0 },
      ],
      error: null,
    });

    const result = await getProviderHealth();
    expect(Object.keys(result)).toHaveLength(2);
    expect(result.anthropic.status).toBe("ok");
    expect(result.google.status).toBe("error"); // 1/1 = 100% error rate
  });
});
