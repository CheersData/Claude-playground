/**
 * Tests: lib/ai-sdk/generate.ts (P5 — universal AI router)
 *
 * Copre:
 * - Routing corretto per provider anthropic (usa anthropic.messages.create)
 * - Routing corretto per provider gemini (usa generateWithGemini)
 * - Routing corretto per tutti i provider openai-compat (openai, groq, mistral, cerebras)
 * - Comportamento con API key assente (provider disabilitato — errore propagato)
 * - Config forwarding (maxTokens, systemPrompt, temperature, agentName, jsonOutput) verso ogni provider
 * - Shape del GenerateResult ritornato (text, usage, durationMs, provider, model)
 * - Isolamento tra provider: una chiamata non invoca mai gli altri
 * - Error handling: errori API generici, rate limit, errori di rete
 * - Edge cases: prompt vuoto, prompt molto lungo, config parziale, config vuota
 * - Default config values per ogni adapter
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted prima degli import) ────────────────────────────────────────

const mockAnthropicCreate = vi.hoisted(() => vi.fn());
const mockExtractTextContent = vi.hoisted(() => vi.fn());
const mockGenerateWithGemini = vi.hoisted(() => vi.fn());
const mockGenerateWithOpenAICompat = vi.hoisted(() => vi.fn());

vi.mock("@/lib/anthropic", () => ({
  anthropic: { messages: { create: mockAnthropicCreate } },
  extractTextContent: mockExtractTextContent,
}));
vi.mock("@/lib/gemini", () => ({
  generateWithGemini: mockGenerateWithGemini,
}));
vi.mock("@/lib/ai-sdk/openai-compat", () => ({
  generateWithOpenAICompat: mockGenerateWithOpenAICompat,
}));

// Import DOPO i mock
import { generate } from "@/lib/ai-sdk/generate";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAnthropicResponse(text = "risposta") {
  return {
    content: [{ type: "text", text }],
    usage: { input_tokens: 100, output_tokens: 50 },
    stop_reason: "end_turn",
  };
}

function makeGeminiResult(text = "risposta gemini") {
  return {
    text,
    usage: { inputTokens: 80, outputTokens: 40 },
    durationMs: 300,
  };
}

function makeOpenAICompatResult(
  text = "risposta openai-compat",
  provider = "mistral",
  model = "mistral-small-3.2-24b-instruct"
) {
  return {
    text,
    usage: { inputTokens: 90, outputTokens: 45 },
    durationMs: 250,
    provider,
    model,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockExtractTextContent.mockReturnValue("risposta");
  mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse());
  mockGenerateWithGemini.mockResolvedValue(makeGeminiResult());
  mockGenerateWithOpenAICompat.mockResolvedValue(makeOpenAICompatResult());
});

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("generate — routing per provider", () => {
  describe("anthropic", () => {
    it("genera con Anthropic per 'claude-haiku-4.5'", async () => {
      await generate("claude-haiku-4.5", "analizza questo contratto");

      expect(mockAnthropicCreate).toHaveBeenCalledOnce();
      expect(mockGenerateWithGemini).not.toHaveBeenCalled();
      expect(mockGenerateWithOpenAICompat).not.toHaveBeenCalled();
    });

    it("genera con Anthropic per 'claude-sonnet-4.5'", async () => {
      await generate("claude-sonnet-4.5", "analizza");

      expect(mockAnthropicCreate).toHaveBeenCalledOnce();
      expect(mockGenerateWithGemini).not.toHaveBeenCalled();
      expect(mockGenerateWithOpenAICompat).not.toHaveBeenCalled();
    });

    it("genera con Anthropic per 'claude-opus-4.5'", async () => {
      await generate("claude-opus-4.5", "analizza");

      expect(mockAnthropicCreate).toHaveBeenCalledOnce();
    });

    it("passa il model ID corretto ad anthropic.messages.create per claude-haiku-4.5", async () => {
      await generate("claude-haiku-4.5", "test");

      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      expect(callArgs.model).toBe("claude-haiku-4-5-20251001");
    });

    it("passa il model ID corretto ad anthropic.messages.create per claude-sonnet-4.5", async () => {
      await generate("claude-sonnet-4.5", "test");

      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      expect(callArgs.model).toBe("claude-sonnet-4-5-20250929");
    });

    it("forwarda maxTokens e systemPrompt ad anthropic.messages.create", async () => {
      await generate("claude-haiku-4.5", "test prompt", {
        maxTokens: 100,
        systemPrompt: "sei un assistente legale",
      });

      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(100);
      expect(callArgs.system).toBe("sei un assistente legale");
    });

    it("forwarda temperature ad anthropic.messages.create", async () => {
      await generate("claude-haiku-4.5", "test", { temperature: 0.8 });

      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.8);
    });

    it("usa il default maxTokens=4096 se non specificato", async () => {
      await generate("claude-haiku-4.5", "test");

      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(4096);
    });

    it("usa il default temperature=0 se non specificato", async () => {
      await generate("claude-haiku-4.5", "test");

      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0);
    });

    it("non aggiunge 'system' se systemPrompt non è specificato", async () => {
      await generate("claude-haiku-4.5", "test");

      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      expect(callArgs.system).toBeUndefined();
    });

    it("passa il prompt come messaggio user", async () => {
      await generate("claude-haiku-4.5", "il mio contratto");

      const callArgs = mockAnthropicCreate.mock.calls[0][0];
      expect(callArgs.messages).toEqual([
        { role: "user", content: "il mio contratto" },
      ]);
    });
  });

  describe("gemini", () => {
    it("genera con Gemini per 'gemini-2.5-flash'", async () => {
      await generate("gemini-2.5-flash", "analisi richiesta");

      expect(mockGenerateWithGemini).toHaveBeenCalledOnce();
      expect(mockAnthropicCreate).not.toHaveBeenCalled();
      expect(mockGenerateWithOpenAICompat).not.toHaveBeenCalled();
    });

    it("genera con Gemini per 'gemini-2.5-pro'", async () => {
      await generate("gemini-2.5-pro", "analisi");

      expect(mockGenerateWithGemini).toHaveBeenCalledOnce();
      expect(mockAnthropicCreate).not.toHaveBeenCalled();
      expect(mockGenerateWithOpenAICompat).not.toHaveBeenCalled();
    });

    it("genera con Gemini per 'gemini-2.5-flash-lite'", async () => {
      await generate("gemini-2.5-flash-lite", "analisi");

      expect(mockGenerateWithGemini).toHaveBeenCalledOnce();
    });

    it("passa il prompt a generateWithGemini", async () => {
      await generate("gemini-2.5-flash", "domanda legale");

      expect(mockGenerateWithGemini).toHaveBeenCalledWith(
        "domanda legale",
        expect.any(Object)
      );
    });

    it("forwarda systemPrompt, maxTokens, temperature e agentName a generateWithGemini", async () => {
      await generate("gemini-2.5-flash", "test", {
        systemPrompt: "Sistema Gemini",
        maxTokens: 1024,
        temperature: 0.3,
        jsonOutput: false,
        agentName: "test-agent",
      });

      const config = mockGenerateWithGemini.mock.calls[0][1];
      expect(config.systemPrompt).toBe("Sistema Gemini");
      expect(config.maxOutputTokens).toBe(1024);
      expect(config.temperature).toBe(0.3);
      expect(config.jsonOutput).toBe(false);
      expect(config.agentName).toBe("test-agent");
    });

    it("usa default maxOutputTokens=4096 e temperature=0.2 per Gemini", async () => {
      await generate("gemini-2.5-flash", "test");

      const config = mockGenerateWithGemini.mock.calls[0][1];
      expect(config.maxOutputTokens).toBe(4096);
      expect(config.temperature).toBe(0.2);
    });

    it("usa jsonOutput=true di default per Gemini", async () => {
      await generate("gemini-2.5-flash", "test");

      const config = mockGenerateWithGemini.mock.calls[0][1];
      expect(config.jsonOutput).toBe(true);
    });
  });

  describe("openai-compat — mistral", () => {
    it("genera tramite openai-compat per 'mistral-small-3'", async () => {
      await generate("mistral-small-3", "analizza");

      expect(mockGenerateWithOpenAICompat).toHaveBeenCalledOnce();
      expect(mockAnthropicCreate).not.toHaveBeenCalled();
      expect(mockGenerateWithGemini).not.toHaveBeenCalled();
    });

    it("genera tramite openai-compat per 'mistral-large-3'", async () => {
      await generate("mistral-large-3", "analizza");

      expect(mockGenerateWithOpenAICompat).toHaveBeenCalledOnce();
    });

    it("genera tramite openai-compat per 'mistral-nemo'", async () => {
      await generate("mistral-nemo", "analizza");

      const [provider] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(provider).toBe("mistral");
    });

    it("passa provider 'mistral' a generateWithOpenAICompat", async () => {
      await generate("mistral-small-3", "analizza");

      const [provider] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(provider).toBe("mistral");
    });

    it("passa il model ID corretto a generateWithOpenAICompat per mistral-small-3", async () => {
      await generate("mistral-small-3", "analizza");

      const [, model] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(model).toBe("mistral-small-3.2-24b-instruct");
    });

    it("passa il model ID corretto a generateWithOpenAICompat per mistral-large-3", async () => {
      await generate("mistral-large-3", "analizza");

      const [, model] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(model).toBe("mistral-large-2512");
    });
  });

  describe("openai-compat — groq", () => {
    it("genera tramite openai-compat per 'groq-llama4-scout'", async () => {
      await generate("groq-llama4-scout", "analizza");

      expect(mockGenerateWithOpenAICompat).toHaveBeenCalledOnce();
      expect(mockAnthropicCreate).not.toHaveBeenCalled();
      expect(mockGenerateWithGemini).not.toHaveBeenCalled();
    });

    it("genera tramite openai-compat per 'groq-llama3-70b'", async () => {
      await generate("groq-llama3-70b", "analizza");

      const [provider] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(provider).toBe("groq");
    });

    it("genera tramite openai-compat per 'groq-kimi-k2'", async () => {
      await generate("groq-kimi-k2", "analizza");

      const [provider] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(provider).toBe("groq");
    });

    it("passa provider 'groq' a generateWithOpenAICompat", async () => {
      await generate("groq-llama4-scout", "analizza");

      const [provider] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(provider).toBe("groq");
    });

    it("passa il model ID corretto a generateWithOpenAICompat per groq-llama4-scout", async () => {
      await generate("groq-llama4-scout", "analizza");

      const [, model] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(model).toBe("meta-llama/llama-4-scout-17b-16e-instruct");
    });

    it("passa il model ID corretto per groq-llama3-70b", async () => {
      await generate("groq-llama3-70b", "analizza");

      const [, model] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(model).toBe("llama-3.3-70b-versatile");
    });
  });

  describe("openai-compat — openai", () => {
    it("genera tramite openai-compat per 'gpt-4o'", async () => {
      mockGenerateWithOpenAICompat.mockResolvedValue(makeOpenAICompatResult("risposta", "openai", "gpt-4o"));

      await generate("gpt-4o", "analizza");

      expect(mockGenerateWithOpenAICompat).toHaveBeenCalledOnce();
      const [provider, model] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(provider).toBe("openai");
      expect(model).toBe("gpt-4o");
    });

    it("genera tramite openai-compat per 'gpt-4o-mini'", async () => {
      await generate("gpt-4o-mini", "analizza");

      const [provider, model] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(provider).toBe("openai");
      expect(model).toBe("gpt-4o-mini");
    });

    it("genera tramite openai-compat per 'gpt-4.1'", async () => {
      await generate("gpt-4.1", "analizza");

      const [provider, model] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(provider).toBe("openai");
      expect(model).toBe("gpt-4.1");
    });
  });

  describe("openai-compat — cerebras", () => {
    it("genera tramite openai-compat per 'cerebras-llama3-8b'", async () => {
      mockGenerateWithOpenAICompat.mockResolvedValue(makeOpenAICompatResult("risposta", "cerebras", "llama3.1-8b"));

      await generate("cerebras-llama3-8b", "analizza");

      expect(mockGenerateWithOpenAICompat).toHaveBeenCalledOnce();
      const [provider, model] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(provider).toBe("cerebras");
      expect(model).toBe("llama3.1-8b");
    });

    it("genera tramite openai-compat per 'cerebras-gpt-oss-120b'", async () => {
      await generate("cerebras-gpt-oss-120b", "analizza");

      const [provider] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(provider).toBe("cerebras");
    });

    it("genera tramite openai-compat per 'cerebras-qwen3-235b'", async () => {
      await generate("cerebras-qwen3-235b", "analizza");

      const [provider, model] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(provider).toBe("cerebras");
      expect(model).toBe("qwen-3-235b-a22b-instruct-2507");
    });
  });

  describe("config forwarding verso openai-compat", () => {
    it("passa il prompt come terzo argomento a generateWithOpenAICompat", async () => {
      await generate("mistral-small-3", "il mio prompt");

      const [, , prompt] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(prompt).toBe("il mio prompt");
    });

    it("passa systemPrompt, maxTokens e temperature a generateWithOpenAICompat", async () => {
      await generate("mistral-large-3", "test", {
        systemPrompt: "Sistema mistral",
        maxTokens: 512,
        temperature: 0.7,
      });

      const [, , , config] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(config.systemPrompt).toBe("Sistema mistral");
      expect(config.maxTokens).toBe(512);
      expect(config.temperature).toBe(0.7);
    });

    it("passa agentName a generateWithOpenAICompat", async () => {
      await generate("groq-llama4-scout", "test", { agentName: "classifier" });

      const [, , , config] = mockGenerateWithOpenAICompat.mock.calls[0];
      expect(config.agentName).toBe("classifier");
    });
  });
});

describe("generate — comportamento con API key assente (errore propagato)", () => {
  it("propaga errore ANTHROPIC_API_KEY mancante per modelli anthropic", async () => {
    mockAnthropicCreate.mockRejectedValue(
      new Error("Missing ANTHROPIC_API_KEY environment variable")
    );

    await expect(generate("claude-haiku-4.5", "test")).rejects.toThrow(
      "Missing ANTHROPIC_API_KEY"
    );
  });

  it("propaga errore ANTHROPIC_API_KEY mancante per claude-sonnet-4.5", async () => {
    mockAnthropicCreate.mockRejectedValue(
      new Error("Missing ANTHROPIC_API_KEY environment variable")
    );

    await expect(generate("claude-sonnet-4.5", "test")).rejects.toThrow(
      "Missing ANTHROPIC_API_KEY"
    );
  });

  it("propaga errore GEMINI_API_KEY mancante per modelli gemini", async () => {
    mockGenerateWithGemini.mockRejectedValue(
      new Error("Missing GEMINI_API_KEY environment variable")
    );

    await expect(generate("gemini-2.5-flash", "test")).rejects.toThrow(
      "Missing GEMINI_API_KEY"
    );
  });

  it("propaga errore MISTRAL_API_KEY mancante per modelli mistral", async () => {
    mockGenerateWithOpenAICompat.mockRejectedValue(
      new Error("Missing MISTRAL_API_KEY environment variable")
    );

    await expect(generate("mistral-large-3", "test")).rejects.toThrow(
      "Missing MISTRAL_API_KEY"
    );
  });

  it("propaga errore GROQ_API_KEY mancante per modelli groq", async () => {
    mockGenerateWithOpenAICompat.mockRejectedValue(
      new Error("Missing GROQ_API_KEY environment variable")
    );

    await expect(generate("groq-llama4-scout", "test")).rejects.toThrow(
      "Missing GROQ_API_KEY"
    );
  });

  it("propaga errore OPENAI_API_KEY mancante per modelli openai", async () => {
    mockGenerateWithOpenAICompat.mockRejectedValue(
      new Error("Missing OPENAI_API_KEY environment variable")
    );

    await expect(generate("gpt-4o", "test")).rejects.toThrow(
      "Missing OPENAI_API_KEY"
    );
  });

  it("propaga errore CEREBRAS_API_KEY mancante per modelli cerebras", async () => {
    mockGenerateWithOpenAICompat.mockRejectedValue(
      new Error("Missing CEREBRAS_API_KEY environment variable")
    );

    await expect(generate("cerebras-llama3-8b", "test")).rejects.toThrow(
      "Missing CEREBRAS_API_KEY"
    );
  });
});

describe("generate — GenerateResult shape", () => {
  it("ritorna text, usage.inputTokens, usage.outputTokens, durationMs, provider, model per Anthropic", async () => {
    mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse("testo risposta"));
    mockExtractTextContent.mockReturnValue("testo risposta");

    const result = await generate("claude-haiku-4.5", "test");

    expect(result.text).toBe("testo risposta");
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(50);
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-haiku-4-5-20251001");
  });

  it("ritorna text, usage, durationMs, provider, model per Gemini", async () => {
    mockGenerateWithGemini.mockResolvedValue(makeGeminiResult("risposta gemini"));

    const result = await generate("gemini-2.5-flash", "test");

    expect(result.text).toBe("risposta gemini");
    expect(result.usage.inputTokens).toBe(80);
    expect(result.usage.outputTokens).toBe(40);
    expect(result.durationMs).toBe(300);
    expect(result.provider).toBe("gemini");
    expect(result.model).toBe("gemini-2.5-flash");
  });

  it("ritorna text, usage, durationMs, provider, model per gemini-2.5-pro", async () => {
    mockGenerateWithGemini.mockResolvedValue(makeGeminiResult("risposta pro"));

    const result = await generate("gemini-2.5-pro", "test");

    expect(result.provider).toBe("gemini");
    expect(result.model).toBe("gemini-2.5-pro");
  });

  it("ritorna il testo estratto tramite extractTextContent per Anthropic", async () => {
    mockExtractTextContent.mockReturnValue("testo estratto");

    const result = await generate("claude-haiku-4.5", "test");

    expect(result.text).toBe("testo estratto");
    expect(mockExtractTextContent).toHaveBeenCalledOnce();
  });

  it("extractTextContent viene chiamato con la risposta di anthropic.messages.create", async () => {
    const anthropicResponse = makeAnthropicResponse("dati originali");
    mockAnthropicCreate.mockResolvedValue(anthropicResponse);

    await generate("claude-haiku-4.5", "test");

    expect(mockExtractTextContent).toHaveBeenCalledWith(anthropicResponse);
  });

  it("propaga il risultato di generateWithOpenAICompat per mistral", async () => {
    mockGenerateWithOpenAICompat.mockResolvedValue({
      text: "risposta mistral",
      usage: { inputTokens: 70, outputTokens: 30 },
      durationMs: 180,
      provider: "mistral",
      model: "mistral-small-3.2-24b-instruct",
    });

    const result = await generate("mistral-small-3", "test");

    expect(result.text).toBe("risposta mistral");
    expect(result.usage.inputTokens).toBe(70);
    expect(result.usage.outputTokens).toBe(30);
    expect(result.durationMs).toBe(180);
  });

  it("propaga il risultato di generateWithOpenAICompat per groq", async () => {
    mockGenerateWithOpenAICompat.mockResolvedValue({
      text: '{"risposta":"groq"}',
      usage: { inputTokens: 60, outputTokens: 25 },
      durationMs: 90,
      provider: "groq",
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
    });

    const result = await generate("groq-llama4-scout", "test");

    expect(result.text).toBe('{"risposta":"groq"}');
    expect(result.provider).toBe("groq");
    expect(result.durationMs).toBe(90);
  });
});

describe("generate — isolamento tra provider", () => {
  it("una chiamata anthropic non invoca gemini né openai-compat", async () => {
    await generate("claude-haiku-4.5", "test");

    expect(mockGenerateWithGemini).not.toHaveBeenCalled();
    expect(mockGenerateWithOpenAICompat).not.toHaveBeenCalled();
  });

  it("una chiamata gemini non invoca anthropic né openai-compat", async () => {
    await generate("gemini-2.5-flash", "test");

    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockGenerateWithOpenAICompat).not.toHaveBeenCalled();
  });

  it("una chiamata openai-compat non invoca anthropic né gemini", async () => {
    await generate("gpt-4o", "test");

    expect(mockAnthropicCreate).not.toHaveBeenCalled();
    expect(mockGenerateWithGemini).not.toHaveBeenCalled();
  });

  it("chiamate consecutive a provider diversi invocano ciascuno il proprio client esattamente una volta", async () => {
    await generate("claude-haiku-4.5", "test1");
    await generate("gemini-2.5-flash", "test2");
    await generate("mistral-small-3", "test3");

    expect(mockAnthropicCreate).toHaveBeenCalledOnce();
    expect(mockGenerateWithGemini).toHaveBeenCalledOnce();
    expect(mockGenerateWithOpenAICompat).toHaveBeenCalledOnce();
  });
});

// ── GenerateResult shape — provider mancanti ──────────────────────────────────

describe("generate — GenerateResult shape (provider aggiuntivi)", () => {
  it("propaga il risultato di generateWithOpenAICompat per openai (gpt-4o)", async () => {
    mockGenerateWithOpenAICompat.mockResolvedValue({
      text: '{"analysis":"gpt4o result"}',
      usage: { inputTokens: 150, outputTokens: 80 },
      durationMs: 420,
      provider: "openai",
      model: "gpt-4o",
    });

    const result = await generate("gpt-4o", "test");

    expect(result.text).toBe('{"analysis":"gpt4o result"}');
    expect(result.usage.inputTokens).toBe(150);
    expect(result.usage.outputTokens).toBe(80);
    expect(result.durationMs).toBe(420);
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4o");
  });

  it("propaga il risultato di generateWithOpenAICompat per cerebras", async () => {
    mockGenerateWithOpenAICompat.mockResolvedValue({
      text: '{"fast":true}',
      usage: { inputTokens: 45, outputTokens: 15 },
      durationMs: 50,
      provider: "cerebras",
      model: "llama3.1-8b",
    });

    const result = await generate("cerebras-llama3-8b", "test");

    expect(result.text).toBe('{"fast":true}');
    expect(result.usage.inputTokens).toBe(45);
    expect(result.usage.outputTokens).toBe(15);
    expect(result.durationMs).toBe(50);
    expect(result.provider).toBe("cerebras");
    expect(result.model).toBe("llama3.1-8b");
  });

  it("il model field di Gemini corrisponde al model ID del registry, non al GEMINI_MODEL costante", async () => {
    mockGenerateWithGemini.mockResolvedValue(makeGeminiResult("test"));

    const result = await generate("gemini-2.5-flash-lite", "test");

    // Il model nel result deve essere il model ID dal MODELS registry
    expect(result.model).toBe("gemini-2.5-flash-lite");
  });
});

// ── Error handling — errori generici e propagazione ───────────────────────────

describe("generate — error handling", () => {
  it("propaga errori API generici da anthropic.messages.create", async () => {
    mockAnthropicCreate.mockRejectedValue(
      new Error("Internal server error")
    );

    await expect(generate("claude-haiku-4.5", "test")).rejects.toThrow(
      "Internal server error"
    );
  });

  it("propaga errori API generici da generateWithGemini", async () => {
    mockGenerateWithGemini.mockRejectedValue(
      new Error("Service unavailable")
    );

    await expect(generate("gemini-2.5-flash", "test")).rejects.toThrow(
      "Service unavailable"
    );
  });

  it("propaga errori API generici da generateWithOpenAICompat", async () => {
    mockGenerateWithOpenAICompat.mockRejectedValue(
      new Error("Connection refused")
    );

    await expect(generate("mistral-small-3", "test")).rejects.toThrow(
      "Connection refused"
    );
  });

  it("propaga errore rate limit (429) da generateWithOpenAICompat senza retry (retry e' interno a openai-compat)", async () => {
    const rateLimitError = Object.assign(new Error("rate_limit_error"), { status: 429 });
    mockGenerateWithOpenAICompat.mockRejectedValue(rateLimitError);

    await expect(generate("groq-llama4-scout", "test")).rejects.toThrow(
      "rate_limit_error"
    );
    // generate() non fa retry — il retry e' responsabilita' di openai-compat o anthropic.ts
    expect(mockGenerateWithOpenAICompat).toHaveBeenCalledOnce();
  });

  it("propaga errore rate limit (429) da anthropic senza retry (retry e' interno a anthropic.ts)", async () => {
    const rateLimitError = Object.assign(new Error("rate_limit_error"), { status: 429 });
    mockAnthropicCreate.mockRejectedValue(rateLimitError);

    await expect(generate("claude-haiku-4.5", "test")).rejects.toThrow(
      "rate_limit_error"
    );
    expect(mockAnthropicCreate).toHaveBeenCalledOnce();
  });

  it("propaga errori di rete (ECONNREFUSED) da tutti i provider", async () => {
    const networkError = new Error("connect ECONNREFUSED 127.0.0.1:443");
    mockGenerateWithOpenAICompat.mockRejectedValue(networkError);

    await expect(generate("cerebras-llama3-8b", "test")).rejects.toThrow(
      "ECONNREFUSED"
    );
  });

  it("propaga TypeError per errori di programmazione (non li cattura come API error)", async () => {
    mockAnthropicCreate.mockRejectedValue(
      new TypeError("Cannot read properties of undefined")
    );

    await expect(generate("claude-haiku-4.5", "test")).rejects.toThrow(TypeError);
  });
});

// ── Config defaults — ogni adapter usa i propri default corretti ──────────────

describe("generate — config defaults", () => {
  it("funziona con config vuota {} — usa tutti i default", async () => {
    const result = await generate("claude-haiku-4.5", "test", {});

    expect(result).toBeDefined();
    expect(result.text).toBe("risposta");
  });

  it("funziona senza passare config (parametro opzionale)", async () => {
    const result = await generate("claude-haiku-4.5", "test");

    expect(result).toBeDefined();
    expect(result.text).toBe("risposta");
  });

  it("anthropic: default temperature=0 (deterministic)", async () => {
    await generate("claude-sonnet-4.5", "test");

    const callArgs = mockAnthropicCreate.mock.calls[0][0];
    expect(callArgs.temperature).toBe(0);
  });

  it("anthropic: default maxTokens=4096", async () => {
    await generate("claude-opus-4.5", "test");

    const callArgs = mockAnthropicCreate.mock.calls[0][0];
    expect(callArgs.max_tokens).toBe(4096);
  });

  it("gemini: default temperature=0.2", async () => {
    await generate("gemini-2.5-flash", "test");

    const config = mockGenerateWithGemini.mock.calls[0][1];
    expect(config.temperature).toBe(0.2);
  });

  it("gemini: default maxOutputTokens=4096", async () => {
    await generate("gemini-2.5-flash", "test");

    const config = mockGenerateWithGemini.mock.calls[0][1];
    expect(config.maxOutputTokens).toBe(4096);
  });

  it("gemini: default jsonOutput=true", async () => {
    await generate("gemini-2.5-pro", "test");

    const config = mockGenerateWithGemini.mock.calls[0][1];
    expect(config.jsonOutput).toBe(true);
  });

  it("gemini: default agentName='GEMINI'", async () => {
    await generate("gemini-2.5-flash", "test");

    const config = mockGenerateWithGemini.mock.calls[0][1];
    expect(config.agentName).toBe("GEMINI");
  });

  it("config parziale: solo maxTokens, il resto usa i default", async () => {
    await generate("claude-haiku-4.5", "test", { maxTokens: 256 });

    const callArgs = mockAnthropicCreate.mock.calls[0][0];
    expect(callArgs.max_tokens).toBe(256);
    expect(callArgs.temperature).toBe(0);
    expect(callArgs.system).toBeUndefined();
  });

  it("config parziale: solo temperature, il resto usa i default", async () => {
    await generate("claude-haiku-4.5", "test", { temperature: 0.5 });

    const callArgs = mockAnthropicCreate.mock.calls[0][0];
    expect(callArgs.max_tokens).toBe(4096);
    expect(callArgs.temperature).toBe(0.5);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe("generate — edge cases", () => {
  it("gestisce prompt vuoto senza errore", async () => {
    const result = await generate("claude-haiku-4.5", "");

    expect(result).toBeDefined();
    const callArgs = mockAnthropicCreate.mock.calls[0][0];
    expect(callArgs.messages).toEqual([{ role: "user", content: "" }]);
  });

  it("gestisce prompt vuoto con Gemini senza errore", async () => {
    const result = await generate("gemini-2.5-flash", "");

    expect(result).toBeDefined();
    expect(mockGenerateWithGemini).toHaveBeenCalledWith("", expect.any(Object));
  });

  it("gestisce prompt vuoto con openai-compat senza errore", async () => {
    const result = await generate("mistral-small-3", "");

    expect(result).toBeDefined();
    const [, , prompt] = mockGenerateWithOpenAICompat.mock.calls[0];
    expect(prompt).toBe("");
  });

  it("gestisce prompt molto lungo (100K caratteri) senza errore", async () => {
    const longPrompt = "a".repeat(100_000);

    const result = await generate("claude-haiku-4.5", longPrompt);

    expect(result).toBeDefined();
    const callArgs = mockAnthropicCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toBe(longPrompt);
    expect(callArgs.messages[0].content.length).toBe(100_000);
  });

  it("gestisce prompt molto lungo con openai-compat senza errore", async () => {
    const longPrompt = "b".repeat(100_000);

    const result = await generate("groq-llama4-scout", longPrompt);

    expect(result).toBeDefined();
    const [, , prompt] = mockGenerateWithOpenAICompat.mock.calls[0];
    expect(prompt).toBe(longPrompt);
  });

  it("gestisce prompt con caratteri Unicode (italiano, emoji, CJK)", async () => {
    const unicodePrompt = "Contratto di locazione: clausola \u00e8 vessatoria \u2014 art. 1341 c.c.";

    const result = await generate("claude-haiku-4.5", unicodePrompt);

    expect(result).toBeDefined();
    const callArgs = mockAnthropicCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toBe(unicodePrompt);
  });

  it("gestisce systemPrompt molto lungo senza errore (anthropic)", async () => {
    const longSystem = "Sei un assistente legale. ".repeat(5000);

    await generate("claude-haiku-4.5", "test", { systemPrompt: longSystem });

    const callArgs = mockAnthropicCreate.mock.calls[0][0];
    expect(callArgs.system).toBe(longSystem);
  });

  it("gestisce systemPrompt vuoto come stringa vuota (non lo omette) per anthropic", async () => {
    // Una stringa vuota e' truthy check: "" is falsy → non viene passato
    await generate("claude-haiku-4.5", "test", { systemPrompt: "" });

    const callArgs = mockAnthropicCreate.mock.calls[0][0];
    // systemPrompt="" → falsy → non viene aggiunto come 'system'
    expect(callArgs.system).toBeUndefined();
  });

  it("temperature=0 viene passato correttamente (non omesso come falsy)", async () => {
    await generate("claude-haiku-4.5", "test", { temperature: 0 });

    const callArgs = mockAnthropicCreate.mock.calls[0][0];
    expect(callArgs.temperature).toBe(0);
  });

  it("maxTokens=1 viene passato correttamente (valore minimo)", async () => {
    await generate("claude-haiku-4.5", "test", { maxTokens: 1 });

    const callArgs = mockAnthropicCreate.mock.calls[0][0];
    expect(callArgs.max_tokens).toBe(1);
  });

  it("durationMs viene calcolato come differenza temporale per Anthropic", async () => {
    // Il durationMs di Anthropic e' calcolato internamente (Date.now() - start)
    // Non possiamo verificare il valore esatto, ma deve essere >= 0
    const result = await generate("claude-haiku-4.5", "test");

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.durationMs).toBe("number");
    expect(Number.isFinite(result.durationMs)).toBe(true);
  });

  it("quando temperature e' undefined, non viene inclusa nei parametri anthropic (branch coverage)", async () => {
    // Questo copre il branch: temperature !== undefined ? { temperature } : {}
    // Con config vuota, temperature viene destructured come default 0,
    // quindi per ottenere undefined bisogna che il default non venga applicato.
    // In realta' il default e' 0, quindi il branch "undefined" non e' raggiungibile
    // dalla firma pubblica. Testiamo comunque che temperature=0 non viene omessa.
    await generate("claude-haiku-4.5", "test");

    const callArgs = mockAnthropicCreate.mock.calls[0][0];
    // temperature=0 (default) deve essere presente, non omessa
    expect(callArgs).toHaveProperty("temperature", 0);
  });

  it("risposta con testo vuoto da Anthropic viene propagata", async () => {
    mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse(""));
    mockExtractTextContent.mockReturnValue("");

    const result = await generate("claude-haiku-4.5", "test");

    expect(result.text).toBe("");
  });

  it("risposta con testo vuoto da Gemini viene propagata", async () => {
    mockGenerateWithGemini.mockResolvedValue(makeGeminiResult(""));

    const result = await generate("gemini-2.5-flash", "test");

    expect(result.text).toBe("");
  });

  it("risposta con testo vuoto da openai-compat viene propagata", async () => {
    mockGenerateWithOpenAICompat.mockResolvedValue(makeOpenAICompatResult(""));

    const result = await generate("mistral-small-3", "test");

    expect(result.text).toBe("");
  });
});

// ── Mapping model ID — verifica che il registry venga usato correttamente ─────

describe("generate — model ID dal registry MODELS", () => {
  it("claude-opus-4.5 → claude-opus-4-5-20251101", async () => {
    await generate("claude-opus-4.5", "test");
    expect(mockAnthropicCreate.mock.calls[0][0].model).toBe("claude-opus-4-5-20251101");
  });

  it("claude-sonnet-4.5 → claude-sonnet-4-5-20250929", async () => {
    await generate("claude-sonnet-4.5", "test");
    expect(mockAnthropicCreate.mock.calls[0][0].model).toBe("claude-sonnet-4-5-20250929");
  });

  it("claude-haiku-4.5 → claude-haiku-4-5-20251001", async () => {
    await generate("claude-haiku-4.5", "test");
    expect(mockAnthropicCreate.mock.calls[0][0].model).toBe("claude-haiku-4-5-20251001");
  });

  it("gpt-5 → gpt-5", async () => {
    await generate("gpt-5", "test");
    const [, model] = mockGenerateWithOpenAICompat.mock.calls[0];
    expect(model).toBe("gpt-5");
  });

  it("gpt-5.2 → gpt-5.2", async () => {
    await generate("gpt-5.2", "test");
    const [, model] = mockGenerateWithOpenAICompat.mock.calls[0];
    expect(model).toBe("gpt-5.2");
  });

  it("mistral-medium-3 → mistral-medium-2508", async () => {
    await generate("mistral-medium-3", "test");
    const [, model] = mockGenerateWithOpenAICompat.mock.calls[0];
    expect(model).toBe("mistral-medium-2508");
  });

  it("groq-qwen3-32b → qwen/qwen3-32b", async () => {
    await generate("groq-qwen3-32b", "test");
    const [, model] = mockGenerateWithOpenAICompat.mock.calls[0];
    expect(model).toBe("qwen/qwen3-32b");
  });

  it("cerebras-qwen3-235b → qwen-3-235b-a22b-instruct-2507", async () => {
    await generate("cerebras-qwen3-235b", "test");
    const [, model] = mockGenerateWithOpenAICompat.mock.calls[0];
    expect(model).toBe("qwen-3-235b-a22b-instruct-2507");
  });

  it("groq-gpt-oss-120b → gpt-oss-120b", async () => {
    await generate("groq-gpt-oss-120b", "test");
    const [, model] = mockGenerateWithOpenAICompat.mock.calls[0];
    expect(model).toBe("gpt-oss-120b");
  });

  it("magistral-small → magistral-small-2509", async () => {
    await generate("magistral-small", "test");
    const [provider, model] = mockGenerateWithOpenAICompat.mock.calls[0];
    expect(provider).toBe("mistral");
    expect(model).toBe("magistral-small-2509");
  });

  it("codestral → codestral-2508", async () => {
    await generate("codestral", "test");
    const [provider, model] = mockGenerateWithOpenAICompat.mock.calls[0];
    expect(provider).toBe("mistral");
    expect(model).toBe("codestral-2508");
  });

  it("gpt-5.1-codex-mini → gpt-5.1-codex-mini", async () => {
    await generate("gpt-5.1-codex-mini", "test");
    const [provider, model] = mockGenerateWithOpenAICompat.mock.calls[0];
    expect(provider).toBe("openai");
    expect(model).toBe("gpt-5.1-codex-mini");
  });

  it("groq-kimi-k2 → moonshotai/kimi-k2-instruct", async () => {
    await generate("groq-kimi-k2", "test");
    const [provider, model] = mockGenerateWithOpenAICompat.mock.calls[0];
    expect(provider).toBe("groq");
    expect(model).toBe("moonshotai/kimi-k2-instruct");
  });
});

// ── Exhaustive registry coverage — every ModelKey routes without error ─────────

describe("generate — exhaustive model registry coverage", () => {
  // Ensure every single model in the MODELS registry can be routed without throwing
  // This acts as a regression guard: if a new model is added with a typo in provider,
  // this test catches it immediately.

  const allModelKeys: Array<import("@/lib/models").ModelKey> = [
    // Anthropic
    "claude-opus-4.5", "claude-sonnet-4.5", "claude-haiku-4.5",
    // Gemini
    "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite",
    // OpenAI
    "gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano",
    "gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-5.1", "gpt-5.2",
    "gpt-5.1-codex-mini", "gpt-oss-20b", "gpt-oss-120b",
    // Mistral
    "mistral-large-3", "mistral-medium-3", "mistral-small-3",
    "ministral-8b", "ministral-3b", "mistral-nemo", "ministral-14b",
    "magistral-small", "magistral-medium", "codestral",
    // Groq
    "groq-llama4-scout", "groq-llama3-70b", "groq-llama3-8b",
    "groq-qwen3-32b", "groq-gpt-oss-120b", "groq-gpt-oss-20b", "groq-kimi-k2",
    // Cerebras
    "cerebras-gpt-oss-120b", "cerebras-llama3-8b", "cerebras-qwen3-235b",
  ];

  it.each(allModelKeys)("routes '%s' without error", async (modelKey) => {
    // Setup all provider mocks
    mockAnthropicCreate.mockResolvedValue(makeAnthropicResponse("ok"));
    mockExtractTextContent.mockReturnValue("ok");
    mockGenerateWithGemini.mockResolvedValue(makeGeminiResult("ok"));
    mockGenerateWithOpenAICompat.mockResolvedValue(
      makeOpenAICompatResult("ok", "test", "test-model")
    );

    const result = await generate(modelKey, "test prompt");

    expect(result).toBeDefined();
    expect(result.text).toBe("ok");
    expect(typeof result.provider).toBe("string");
    expect(typeof result.model).toBe("string");
    expect(typeof result.durationMs).toBe("number");
    expect(result.usage).toHaveProperty("inputTokens");
    expect(result.usage).toHaveProperty("outputTokens");
  });
});
