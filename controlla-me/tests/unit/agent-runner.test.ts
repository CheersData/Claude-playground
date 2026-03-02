/**
 * Tests: lib/ai-sdk/agent-runner.ts (P1 — critical path)
 *
 * Copre:
 * - Esecuzione normale (primo modello in catena)
 * - Fallback automatico su errore
 * - Fallback su errore 429
 * - Skip di provider disabilitati
 * - Throw quando tutta la catena fallisce
 * - Throw quando nessun provider disponibile
 * - Flag usedFallback e usedModelKey
 * - Parsing JSON automatico
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ModelKey } from "@/lib/models";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGenerate = vi.hoisted(() => vi.fn());
const mockGetAgentChain = vi.hoisted(() => vi.fn());
const mockIsProviderEnabled = vi.hoisted(() => vi.fn());
const mockParseAgentJSON = vi.hoisted(() => vi.fn());
const mockLogAgentCost = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai-sdk/generate", () => ({ generate: mockGenerate }));
vi.mock("@/lib/tiers", () => ({
  getAgentChain: mockGetAgentChain,
  sessionTierStore: { getStore: vi.fn(() => undefined) },
}));
vi.mock("@/lib/models", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/models")>();
  return {
    ...original,
    isProviderEnabled: mockIsProviderEnabled,
  };
});
vi.mock("@/lib/anthropic", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/anthropic")>();
  return { ...original, parseAgentJSON: mockParseAgentJSON };
});
vi.mock("@/lib/company/cost-logger", () => ({
  logAgentCost: mockLogAgentCost,
}));

import { runAgent } from "@/lib/ai-sdk/agent-runner";

// ── Helpers ──────────────────────────────────────────────────────────────────

const chain: ModelKey[] = ["claude-haiku-4.5", "gemini-2.5-flash", "mistral-small-3"];

function makeGenerateResult(text: string = '{"ok":true}') {
  return {
    text,
    usage: { inputTokens: 100, outputTokens: 50 },
    durationMs: 200,
    model: "claude-haiku-4.5" as ModelKey,
    provider: "anthropic" as const,
  };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAgentChain.mockReturnValue(chain);
  mockIsProviderEnabled.mockReturnValue(true);
  mockParseAgentJSON.mockImplementation((text: string) => JSON.parse(text));
  mockLogAgentCost.mockResolvedValue(undefined);
});

describe("runAgent", () => {
  describe("esecuzione normale", () => {
    it("usa il primo modello in catena e ritorna parsed JSON", async () => {
      const expectedParsed = { risk: "alta" };
      mockGenerate.mockResolvedValue(makeGenerateResult(JSON.stringify(expectedParsed)));

      const result = await runAgent<typeof expectedParsed>("classifier", "analizza questo contratto");

      expect(result.parsed).toEqual(expectedParsed);
      expect(result.usedFallback).toBe(false);
      expect(result.usedModelKey).toBe(chain[0]);
      expect(mockGenerate).toHaveBeenCalledOnce();
      expect(mockGenerate).toHaveBeenCalledWith(chain[0], "analizza questo contratto", expect.any(Object));
    });

    it("passa maxTokens e temperature dall'AGENT_MODELS config", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("classifier", "test");

      const config = mockGenerate.mock.calls[0][2];
      expect(typeof config.maxTokens).toBe("number");
      expect(config.maxTokens).toBeGreaterThan(0);
      expect(typeof config.temperature).toBe("number");
      expect(config.jsonOutput).toBe(true);
    });

    it("logga il costo dopo successo (fire-and-forget)", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("analyzer", "analizza");

      expect(mockLogAgentCost).toHaveBeenCalledOnce();
      const costArgs = mockLogAgentCost.mock.calls[0][0];
      expect(costArgs.agentName).toBe("analyzer");
      expect(costArgs.usedFallback).toBe(false);
    });
  });

  describe("fallback su errore", () => {
    it("cade al modello successivo quando il primo fallisce", async () => {
      const successResult = makeGenerateResult('{"fallback":true}');
      mockGenerate
        .mockRejectedValueOnce(new Error("provider timeout"))
        .mockResolvedValueOnce(successResult);

      const result = await runAgent<{ fallback: boolean }>("classifier", "test");

      expect(result.usedFallback).toBe(true);
      expect(result.usedModelKey).toBe(chain[1]);
      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(result.parsed).toEqual({ fallback: true });
    });

    it("salta modelli con provider disabilitato e usa il prossimo disponibile", async () => {
      // chain[1] (gemini) sempre disabilitato, gli altri abilitati
      // isProviderEnabled viene chiamato sia nel loop principale che nel nextAvailable check
      // → usiamo mockImplementation per risposta stabile basata sul provider name
      const disabledProvider = "google";
      mockIsProviderEnabled.mockImplementation((provider: string) => provider !== disabledProvider);

      mockGenerate
        .mockRejectedValueOnce(new Error("rate limit"))  // chain[0] fallisce
        .mockResolvedValueOnce(makeGenerateResult('{"used":"chain2"}'));  // chain[2] ok

      const result = await runAgent<{ used: string }>("classifier", "test");

      expect(result.usedFallback).toBe(true);
      expect(result.parsed.used).toBe("chain2");
    });

    it("salta direttamente provider disabilitati senza chiamare generate", async () => {
      // chain[0] disabilitato, chain[1] abilitato
      mockIsProviderEnabled
        .mockReturnValueOnce(false)  // skip chain[0]
        .mockReturnValueOnce(true);  // usa chain[1]

      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));

      await runAgent("classifier", "test");

      // generate chiamato solo una volta (chain[1])
      expect(mockGenerate).toHaveBeenCalledOnce();
      expect(mockGenerate).toHaveBeenCalledWith(chain[1], "test", expect.any(Object));
    });

    it("fallback su errore 429 Rate Limit", async () => {
      const rateLimitError = new Error("429 rate_limit_error: Too many requests");
      mockGenerate
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(makeGenerateResult('{"ok":true}'));

      const result = await runAgent("classifier", "test");

      expect(result.usedFallback).toBe(true);
      expect(result.usedModelKey).toBe(chain[1]);
    });

    it("logga usedFallback=true quando usa un fallback", async () => {
      mockGenerate
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce(makeGenerateResult('{"ok":true}'));

      await runAgent("analyzer", "test");

      const costArgs = mockLogAgentCost.mock.calls[0][0];
      expect(costArgs.usedFallback).toBe(true);
    });
  });

  describe("errori e throw", () => {
    it("lancia errore se l'intera catena fallisce", async () => {
      mockGenerate.mockRejectedValue(new Error("tutti i provider falliti"));

      await expect(runAgent("classifier", "test")).rejects.toThrow();
    });

    it("lancia errore se nessun provider è disponibile", async () => {
      mockIsProviderEnabled.mockReturnValue(false);

      await expect(runAgent("classifier", "test")).rejects.toThrow(/nessun provider disponibile/i);
    });

    it("non logga costi se l'agente fallisce", async () => {
      mockGenerate.mockRejectedValue(new Error("fail"));

      await expect(runAgent("classifier", "test")).rejects.toThrow();

      expect(mockLogAgentCost).not.toHaveBeenCalled();
    });
  });

  describe("config override", () => {
    it("permette override di maxTokens e systemPrompt", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("classifier", "test", {
        maxTokens: 1000,
        systemPrompt: "Custom system prompt",
      });

      const config = mockGenerate.mock.calls[0][2];
      expect(config.maxTokens).toBe(1000);
      expect(config.systemPrompt).toBe("Custom system prompt");
    });
  });

  describe("agentName uppercasing", () => {
    it("converte agentName in uppercase nel config (CLASSIFIER, ANALYZER, etc.)", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("classifier", "test");
      expect(mockGenerate.mock.calls[0][2].agentName).toBe("CLASSIFIER");

      vi.clearAllMocks();
      mockGetAgentChain.mockReturnValue(chain);
      mockIsProviderEnabled.mockReturnValue(true);
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("task-executor", "test");
      expect(mockGenerate.mock.calls[0][2].agentName).toBe("TASK-EXECUTOR");
    });
  });

  describe("JSON parse error cascading", () => {
    it("tratta errore di parsing JSON come errore e fa fallback al modello successivo", async () => {
      // Primo modello genera testo ma parseAgentJSON fallisce; secondo modello succede
      mockGenerate
        .mockResolvedValueOnce(makeGenerateResult("not json"))
        .mockResolvedValueOnce(makeGenerateResult('{"valid":true}'));
      mockParseAgentJSON
        .mockImplementationOnce(() => { throw new Error("Risposta non JSON da Claude"); })
        .mockReturnValueOnce({ valid: true });

      const result = await runAgent<{ valid: boolean }>("classifier", "test");

      expect(mockGenerate).toHaveBeenCalledTimes(2);
      expect(result.parsed).toEqual({ valid: true });
      expect(result.usedFallback).toBe(true);
      expect(result.usedModelKey).toBe(chain[1]);
    });

    it("propaga errore JSON se ultimo modello nella catena produce output non-JSON", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult("broken json"));
      mockParseAgentJSON.mockImplementation(() => {
        throw new Error("Risposta non JSON da Claude");
      });

      await expect(runAgent("classifier", "test")).rejects.toThrow(
        "Risposta non JSON da Claude"
      );
    });
  });

  describe("errore senza provider disponibili residui nella catena", () => {
    it("rilancia immediatamente se il modello fallisce e i restanti provider sono disabilitati", async () => {
      // chain[0] (anthropic) enabled, chain[1] (gemini) disabled, chain[2] (mistral) disabled
      mockIsProviderEnabled.mockImplementation((provider: string) => {
        return provider === "anthropic";
      });
      mockGenerate.mockRejectedValueOnce(new Error("Anthropic overloaded"));

      await expect(runAgent("classifier", "test")).rejects.toThrow(
        "Anthropic overloaded"
      );
      // Non deve tentare generate su modelli con provider disabilitato
      expect(mockGenerate).toHaveBeenCalledOnce();
    });
  });

  describe("cost logger resilienza", () => {
    it("non propaga errori dal cost logger (fire-and-forget)", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });
      mockLogAgentCost.mockRejectedValue(new Error("Supabase insert failed"));

      // Non deve lanciare errore
      const result = await runAgent("classifier", "test");
      expect(result.parsed).toEqual({ ok: true });
    });
  });

  describe("catena errori tracking", () => {
    it("accumula errori per ogni modello fallito prima del successo", async () => {
      mockGenerate
        .mockRejectedValueOnce(new Error("errore1"))
        .mockRejectedValueOnce(new Error("errore2"))
        .mockResolvedValueOnce(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      const result = await runAgent("classifier", "test");

      // Il terzo modello riesce
      expect(result.usedFallback).toBe(true);
      expect(result.usedModelKey).toBe(chain[2]);
    });

    it("include info sulla catena nel messaggio di errore quando nessun provider disponibile", async () => {
      mockIsProviderEnabled.mockReturnValue(false);

      await expect(runAgent("classifier", "test")).rejects.toThrow(/Chain:/);
    });
  });

  describe("agenti diversi con config diverse", () => {
    it("analyzer usa maxTokens e temperature dalla sua config AGENT_MODELS", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("analyzer", "test");

      const config = mockGenerate.mock.calls[0][2];
      // AGENT_MODELS.analyzer: maxTokens=8192, temperature=0
      expect(config.maxTokens).toBe(8192);
      expect(config.temperature).toBe(0);
    });

    it("task-executor usa maxTokens e temperature dalla sua config", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("task-executor", "test");

      const config = mockGenerate.mock.calls[0][2];
      // AGENT_MODELS["task-executor"]: maxTokens=4096, temperature=0.2
      expect(config.maxTokens).toBe(4096);
      expect(config.temperature).toBe(0.2);
    });

    it("corpus-agent usa maxTokens e temperature dalla sua config", async () => {
      mockGenerate.mockResolvedValue(makeGenerateResult('{"ok":true}'));
      mockParseAgentJSON.mockReturnValue({ ok: true });

      await runAgent("corpus-agent", "test");

      const config = mockGenerate.mock.calls[0][2];
      // AGENT_MODELS["corpus-agent"]: maxTokens=4096, temperature=0.2
      expect(config.maxTokens).toBe(4096);
      expect(config.temperature).toBe(0.2);
    });
  });

  describe("GenerateResult passthrough", () => {
    it("include tutti i campi di GenerateResult oltre a parsed/usedFallback/usedModelKey", async () => {
      const genResult = {
        text: '{"data": 42}',
        usage: { inputTokens: 500, outputTokens: 1000 },
        durationMs: 3000,
        provider: "anthropic" as const,
        model: "claude-haiku-4-5-20251001",
      };
      mockGenerate.mockResolvedValue(genResult);
      mockParseAgentJSON.mockReturnValue({ data: 42 });

      const result = await runAgent("classifier", "test");

      expect(result.text).toBe('{"data": 42}');
      expect(result.usage).toEqual({ inputTokens: 500, outputTokens: 1000 });
      expect(result.durationMs).toBe(3000);
      expect(result.provider).toBe("anthropic");
      expect(result.model).toBe("claude-haiku-4-5-20251001");
    });
  });
});
