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
      expect(model).toBe("qwen3-235b");
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
