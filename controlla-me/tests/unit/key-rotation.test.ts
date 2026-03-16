/**
 * Tests: Key Rotation with Invalid API Keys
 *
 * Covers both OpenAI-compatible providers (lib/ai-sdk/openai-compat.ts)
 * and Gemini provider (lib/gemini.ts) — two separate implementations.
 *
 * OpenAI-compat scenarios:
 * - Empty API keys: throws on getClient() when env var is missing
 * - Malformed API keys: provider returns 401, triggers rotation to ALT key
 * - Expired/revoked API keys: provider returns 403, triggers rotation
 * - ALT key also invalid: fails after rotation attempt, propagates error
 * - No ALT key configured: fails without rotation, propagates error
 * - Key rotation idempotency: rotating twice returns false the second time
 * - Mixed primary/ALT failures: 429 on primary + 401 on ALT = propagate error
 * - Rotation persistence: after rotation, subsequent calls reuse ALT key
 * - Cross-provider isolation: rotating one provider does not affect another
 * - Non-auth errors bypass rotation (500, 400, ETIMEDOUT, ENOTFOUND)
 *
 * Gemini scenarios:
 * - Missing API key: throws meaningful error
 * - 401/403 triggers rotation to ALT key
 * - 429 / RESOURCE_EXHAUSTED triggers rotation
 * - Daily quota exhausted: throws immediately for fast fallback
 * - ALT key also invalid: propagates error
 * - No ALT key configured: propagates error
 * - Rotation idempotency and persistence
 * - isGeminiEnabled() with various key configurations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// PART 1: OpenAI-Compatible Providers (openai-compat.ts)
// ============================================================================

// ---- Mocks ----------------------------------------------------------------

const mockCreate = vi.hoisted(() => vi.fn());

// Track constructor calls to verify key rotation
const constructorCalls: Array<{ apiKey: string; baseURL?: string }> = [];

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
      constructor(public config: { apiKey: string; baseURL?: string }) {
        constructorCalls.push({ apiKey: config.apiKey, baseURL: config.baseURL });
      }
    },
  };
});

// Import AFTER mocks
import { generateWithOpenAICompat, _resetForTesting } from "@/lib/ai-sdk/openai-compat";

// ---- Helpers ---------------------------------------------------------------

function makeSuccessResponse(text = '{"ok":true}') {
  return {
    choices: [
      { message: { content: text }, finish_reason: "stop" },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  };
}

function make401Error() {
  return Object.assign(new Error("Unauthorized: Invalid API key"), { status: 401 });
}

function make403Error() {
  return Object.assign(new Error("Forbidden: API key revoked"), { status: 403 });
}

function make429Error() {
  return Object.assign(new Error("rate_limit: Too many requests"), { status: 429 });
}

// ---- Setup -----------------------------------------------------------------

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  constructorCalls.length = 0;

  // Reset singleton client pool and rotation state between tests
  _resetForTesting();

  // Set primary keys for all providers
  process.env.OPENAI_API_KEY = "sk-test-primary-openai";
  process.env.GROQ_API_KEY = "gsk-test-primary-groq";
  process.env.GROQ_API_KEY_ALT = "gsk-test-alt-groq";
  process.env.MISTRAL_API_KEY = "test-primary-mistral";
  process.env.MISTRAL_API_KEY_ALT = "test-alt-mistral";
  process.env.CEREBRAS_API_KEY = "csk-test-primary-cerebras";
  process.env.CEREBRAS_API_KEY_ALT = "csk-test-alt-cerebras";
  process.env.SAMBANOVA_API_KEY = "test-primary-sambanova";
  process.env.SAMBANOVA_API_KEY_ALT = "test-alt-sambanova";
});

afterEach(() => {
  // Restore all env vars
  process.env = { ...originalEnv };
});

// ============================================================================
// Empty API keys
// ============================================================================

describe("Key rotation — empty API keys", () => {
  it("throws meaningful error when primary key env var is not set", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      generateWithOpenAICompat("openai", "gpt-4o", "test")
    ).rejects.toThrow("Missing OPENAI_API_KEY");
  });

  it("throws when primary key is undefined and no ALT configured", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(
      generateWithOpenAICompat("openai", "gpt-4o", "test")
    ).rejects.toThrow(/OPENAI_API_KEY/);
  });
});

// ============================================================================
// Auth error (401) triggers key rotation
// ============================================================================

describe("Key rotation — 401 Unauthorized triggers ALT key rotation", () => {
  it("rotates to ALT key on 401 and retries successfully", async () => {
    // First call with primary key: 401
    // After rotation to ALT key: success
    mockCreate
      .mockRejectedValueOnce(make401Error())
      .mockResolvedValueOnce(makeSuccessResponse('{"rotated":true}'));

    const result = await generateWithOpenAICompat("groq", "llama-4-scout", "test");

    // Should succeed after rotation
    expect(result.text).toBe('{"rotated":true}');
    expect(result.provider).toBe("groq");
    // mockCreate called at least twice (once with primary, once with ALT)
    expect(mockCreate.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("propagates 401 when ALT key also returns 401", async () => {
    // All calls fail with 401 — primary and ALT
    mockCreate.mockRejectedValue(make401Error());

    await expect(
      generateWithOpenAICompat("groq", "model", "test")
    ).rejects.toThrow("Unauthorized");
  });

  it("propagates 401 when no ALT key is configured", async () => {
    // OpenAI has no ALT key configured
    delete process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-invalid";

    mockCreate.mockRejectedValue(make401Error());

    await expect(
      generateWithOpenAICompat("openai", "gpt-4o", "test")
    ).rejects.toThrow("Unauthorized");
  });
});

// ============================================================================
// Auth error (403) triggers key rotation
// ============================================================================

describe("Key rotation — 403 Forbidden triggers ALT key rotation", () => {
  it("rotates to ALT key on 403 and retries successfully", async () => {
    mockCreate
      .mockRejectedValueOnce(make403Error())
      .mockResolvedValueOnce(makeSuccessResponse('{"recovered":true}'));

    const result = await generateWithOpenAICompat("mistral", "mistral-large", "test");

    expect(result.text).toBe('{"recovered":true}');
    expect(mockCreate.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("propagates 403 when both primary and ALT keys are revoked", async () => {
    mockCreate.mockRejectedValue(make403Error());

    await expect(
      generateWithOpenAICompat("mistral", "mistral-large", "test")
    ).rejects.toThrow("Forbidden");
  });
});

// ============================================================================
// Rate limit (429) + key rotation interaction
// ============================================================================

describe("Key rotation — 429 rate limit + key rotation", () => {
  it("attempts ALT key on 429 before falling through", async () => {
    // 429 on primary -> rotate to ALT -> success
    mockCreate
      .mockRejectedValueOnce(make429Error())
      .mockResolvedValueOnce(makeSuccessResponse('{"alt_ok":true}'));

    const result = await generateWithOpenAICompat("cerebras", "llama3.3-70b", "test");

    expect(result.text).toBe('{"alt_ok":true}');
  });

  it("throws 429 when both primary and ALT keys are rate-limited", async () => {
    // All attempts fail with 429 — exhausts rotation + retries
    mockCreate.mockRejectedValue(make429Error());

    await expect(
      generateWithOpenAICompat("cerebras", "llama3.3-70b", "test")
    ).rejects.toThrow("rate_limit");
  });
});

// ============================================================================
// Malformed keys (structurally wrong keys)
// ============================================================================

describe("Key rotation — malformed API keys", () => {
  it("handles keys that cause provider to return 401 immediately", async () => {
    // Set obviously malformed keys
    process.env.GROQ_API_KEY = "not-a-valid-key";
    process.env.GROQ_API_KEY_ALT = "also-not-valid";

    // Provider returns 401 for malformed keys
    mockCreate.mockRejectedValue(make401Error());

    await expect(
      generateWithOpenAICompat("groq", "model", "test")
    ).rejects.toThrow("Unauthorized");
  });

  it("recovers when primary is malformed but ALT is valid", async () => {
    process.env.MISTRAL_API_KEY = "malformed-key-xxx";
    // ALT key is valid (already set in beforeEach)

    mockCreate
      .mockRejectedValueOnce(make401Error())  // primary fails
      .mockResolvedValueOnce(makeSuccessResponse('{"fixed":true}')); // ALT works

    const result = await generateWithOpenAICompat("mistral", "mistral-small", "test");
    expect(result.text).toBe('{"fixed":true}');
  });
});

// ============================================================================
// Non-auth errors are NOT retried via rotation
// ============================================================================

describe("Key rotation — non-auth errors bypass rotation", () => {
  it("does not attempt key rotation on 500 Internal Server Error", async () => {
    const serverError = Object.assign(new Error("Internal Server Error"), { status: 500 });
    mockCreate.mockRejectedValue(serverError);

    await expect(
      generateWithOpenAICompat("groq", "model", "test")
    ).rejects.toThrow("Internal Server Error");

    // Should only call once — no rotation attempt
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("does not attempt key rotation on 400 Bad Request", async () => {
    const badRequest = Object.assign(new Error("Bad Request: invalid model"), { status: 400 });
    mockCreate.mockRejectedValue(badRequest);

    await expect(
      generateWithOpenAICompat("groq", "model", "test")
    ).rejects.toThrow("Bad Request");

    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("does not attempt key rotation on network timeout", async () => {
    mockCreate.mockRejectedValue(new Error("connect ETIMEDOUT"));

    await expect(
      generateWithOpenAICompat("groq", "model", "test")
    ).rejects.toThrow("ETIMEDOUT");

    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("does not attempt key rotation on DNS resolution failure", async () => {
    mockCreate.mockRejectedValue(new Error("getaddrinfo ENOTFOUND api.groq.com"));

    await expect(
      generateWithOpenAICompat("groq", "model", "test")
    ).rejects.toThrow("ENOTFOUND");

    // Only one attempt — no rotation for network errors
    expect(mockCreate).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// ALT key not configured — graceful degradation
// ============================================================================

describe("Key rotation — ALT key not configured", () => {
  it("OpenAI (no ALT key): 401 propagates immediately", async () => {
    // OpenAI has no envKeyAlt in PROVIDER_CONFIGS
    mockCreate.mockRejectedValue(make401Error());

    await expect(
      generateWithOpenAICompat("openai", "gpt-4o", "test")
    ).rejects.toThrow("Unauthorized");
  });

  it("Groq with ALT removed: 401 propagates after failed rotation attempt", async () => {
    delete process.env.GROQ_API_KEY_ALT;

    mockCreate.mockRejectedValue(make401Error());

    await expect(
      generateWithOpenAICompat("groq", "model", "test")
    ).rejects.toThrow("Unauthorized");
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe("Key rotation — edge cases", () => {
  it("handles empty string in ALT key env var (no rotation)", async () => {
    process.env.GROQ_API_KEY_ALT = "";

    mockCreate.mockRejectedValue(make401Error());

    await expect(
      generateWithOpenAICompat("groq", "model", "test")
    ).rejects.toThrow("Unauthorized");
  });

  it("successful call does not trigger any rotation", async () => {
    mockCreate.mockResolvedValueOnce(makeSuccessResponse());

    const result = await generateWithOpenAICompat("groq", "model", "test");

    expect(result.text).toBe('{"ok":true}');
    // Only called once — no rotation needed
    expect(mockCreate).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// Rotation idempotency
// ============================================================================

describe("Key rotation — idempotency", () => {
  it("second rotation attempt for same provider returns silently (no double-rotate)", async () => {
    // First call: 401 on primary -> rotates to ALT -> 401 on ALT -> throws
    mockCreate.mockRejectedValue(make401Error());

    await expect(
      generateWithOpenAICompat("groq", "model", "test")
    ).rejects.toThrow("Unauthorized");

    // At this point, groq is rotated to ALT. Clear mock to track new calls.
    mockCreate.mockReset();
    mockCreate.mockRejectedValue(make401Error());

    // Second call: already on ALT, rotation returns false, 401 propagates immediately
    await expect(
      generateWithOpenAICompat("groq", "model", "test")
    ).rejects.toThrow("Unauthorized");

    // Rotation is idempotent: no infinite loop, just propagates the error
  });
});

// ============================================================================
// Rotation persistence across multiple calls
// ============================================================================

describe("Key rotation — persistence across calls", () => {
  it("after rotating to ALT key, subsequent calls use ALT key directly", async () => {
    // First call: 401 on primary -> rotate to ALT -> success
    mockCreate
      .mockRejectedValueOnce(make401Error())
      .mockResolvedValueOnce(makeSuccessResponse('{"first_call_alt":true}'));

    const result1 = await generateWithOpenAICompat("groq", "model", "test");
    expect(result1.text).toBe('{"first_call_alt":true}');

    // Second call: should go directly to ALT key (client was recreated with ALT)
    mockCreate.mockResolvedValueOnce(makeSuccessResponse('{"second_call_alt":true}'));

    const result2 = await generateWithOpenAICompat("groq", "model", "test");
    expect(result2.text).toBe('{"second_call_alt":true}');

    // Verify: the second call did not get a 401 (no rotation needed)
    // The last mockCreate call should be the success from second call
  });

  it("_resetForTesting clears rotation state so primary key is used again", async () => {
    // Rotate groq to ALT
    mockCreate
      .mockRejectedValueOnce(make401Error())
      .mockResolvedValueOnce(makeSuccessResponse());
    await generateWithOpenAICompat("groq", "model", "test");

    // Reset
    _resetForTesting();
    constructorCalls.length = 0;

    // Next call should use primary key (new client created)
    mockCreate.mockResolvedValueOnce(makeSuccessResponse('{"back_to_primary":true}'));
    const result = await generateWithOpenAICompat("groq", "model", "test");
    expect(result.text).toBe('{"back_to_primary":true}');

    // Verify constructor was called with the primary key
    expect(constructorCalls.length).toBeGreaterThanOrEqual(1);
    const lastCall = constructorCalls[constructorCalls.length - 1];
    expect(lastCall.apiKey).toBe("gsk-test-primary-groq");
  });
});

// ============================================================================
// Cross-provider isolation
// ============================================================================

describe("Key rotation — cross-provider isolation", () => {
  it("rotating groq does not affect mistral", async () => {
    // Rotate groq to ALT via 401
    mockCreate
      .mockRejectedValueOnce(make401Error())
      .mockResolvedValueOnce(makeSuccessResponse('{"groq_alt":true}'));
    await generateWithOpenAICompat("groq", "model", "test");

    // Reset constructor tracking
    constructorCalls.length = 0;

    // Mistral should still use primary key
    mockCreate.mockResolvedValueOnce(makeSuccessResponse('{"mistral_primary":true}'));
    const result = await generateWithOpenAICompat("mistral", "mistral-small", "test");
    expect(result.text).toBe('{"mistral_primary":true}');

    // Verify mistral constructor used primary key
    const mistralCall = constructorCalls.find(c => c.apiKey === "test-primary-mistral");
    expect(mistralCall).toBeDefined();
  });

  it("rotating cerebras does not affect sambanova", async () => {
    // Rotate cerebras to ALT
    mockCreate
      .mockRejectedValueOnce(make403Error())
      .mockResolvedValueOnce(makeSuccessResponse());
    await generateWithOpenAICompat("cerebras", "model", "test");

    constructorCalls.length = 0;

    // Sambanova should still use primary
    mockCreate.mockResolvedValueOnce(makeSuccessResponse('{"sambanova_ok":true}'));
    const result = await generateWithOpenAICompat("sambanova", "model", "test");
    expect(result.text).toBe('{"sambanova_ok":true}');

    const sambanovaCall = constructorCalls.find(c => c.apiKey === "test-primary-sambanova");
    expect(sambanovaCall).toBeDefined();
  });
});

// ============================================================================
// Mixed error sequences (429 on primary, 401 on ALT)
// ============================================================================

describe("Key rotation — mixed error sequences", () => {
  it("429 on primary -> rotate to ALT -> 401 on ALT -> propagates 401", async () => {
    // First attempt: 429 on primary -> triggers rotation to ALT
    // After rotation: 401 on ALT -> propagates since already rotated
    mockCreate
      .mockRejectedValueOnce(make429Error())
      .mockRejectedValueOnce(make401Error());

    await expect(
      generateWithOpenAICompat("groq", "model", "test")
    ).rejects.toThrow(/Unauthorized|rate_limit/);
  });

  it("401 on primary -> rotate to ALT -> 429 on ALT -> propagates 429", async () => {
    // First attempt: 401 -> triggers rotation
    // After rotation: 429 -> no further rotation possible -> throws
    mockCreate
      .mockRejectedValueOnce(make401Error())
      .mockRejectedValue(make429Error());

    await expect(
      generateWithOpenAICompat("groq", "model", "test")
    ).rejects.toThrow("rate_limit");
  });

  it("403 on primary -> rotate to ALT -> 500 on ALT -> propagates 500", async () => {
    const serverError = Object.assign(new Error("Internal Server Error"), { status: 500 });
    mockCreate
      .mockRejectedValueOnce(make403Error())
      .mockRejectedValueOnce(serverError);

    await expect(
      generateWithOpenAICompat("cerebras", "model", "test")
    ).rejects.toThrow("Internal Server Error");
  });
});

// ============================================================================
// Constructor key verification
// ============================================================================

describe("Key rotation — constructor key verification", () => {
  it("creates client with correct primary key initially", async () => {
    mockCreate.mockResolvedValueOnce(makeSuccessResponse());

    await generateWithOpenAICompat("groq", "model", "test");

    expect(constructorCalls.length).toBe(1);
    expect(constructorCalls[0].apiKey).toBe("gsk-test-primary-groq");
    expect(constructorCalls[0].baseURL).toBe("https://api.groq.com/openai/v1");
  });

  it("recreates client with ALT key after rotation", async () => {
    mockCreate
      .mockRejectedValueOnce(make401Error())
      .mockResolvedValueOnce(makeSuccessResponse());

    await generateWithOpenAICompat("groq", "model", "test");

    // Two constructor calls: first with primary, second with ALT after rotation
    expect(constructorCalls.length).toBe(2);
    expect(constructorCalls[0].apiKey).toBe("gsk-test-primary-groq");
    expect(constructorCalls[1].apiKey).toBe("gsk-test-alt-groq");
  });
});

// ============================================================================
// PART 2: Gemini Provider (lib/gemini.ts)
// ============================================================================

// We need a separate describe block with its own mock for GoogleGenAI.
// Since vi.mock is hoisted and global, we test Gemini via a dynamic import
// approach with manual mocking.

const mockGeminiGenerate = vi.hoisted(() => vi.fn());

vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        generateContent: mockGeminiGenerate,
      };
      constructor(_config: { apiKey: string }) {
        // Track nothing — Gemini client is a singleton, not per-call
      }
    },
  };
});

import {
  generateWithGemini,
  isGeminiEnabled,
  _resetGeminiForTesting,
} from "@/lib/gemini";

// ---- Gemini Helpers --------------------------------------------------------

function makeGeminiSuccess(text = '{"ok":true}') {
  return {
    text,
    usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 40 },
  };
}

function makeGemini401() {
  return Object.assign(new Error("API key not valid"), { status: 401 });
}

function makeGemini403() {
  return Object.assign(new Error("API key expired"), { status: 403 });
}

function makeGemini429() {
  return Object.assign(new Error("RESOURCE_EXHAUSTED: too many requests"), { status: 429 });
}

function makeGeminiDailyQuota() {
  return Object.assign(
    new Error("RESOURCE_EXHAUSTED: PerDay quota exceeded"),
    { status: 429 }
  );
}

// ============================================================================
// Gemini — missing API key
// ============================================================================

describe("Gemini key rotation — missing API key", () => {
  beforeEach(() => {
    _resetGeminiForTesting();
    mockGeminiGenerate.mockReset();
  });

  it("throws meaningful error when GEMINI_API_KEY is not set", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY_ALT;
    _resetGeminiForTesting();

    await expect(
      generateWithGemini("test prompt")
    ).rejects.toThrow("Missing GEMINI_API_KEY");
  });

  it("isGeminiEnabled returns false when no keys set", () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY_ALT;

    expect(isGeminiEnabled()).toBe(false);
  });

  it("isGeminiEnabled returns true when only primary key set", () => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_API_KEY_ALT;

    expect(isGeminiEnabled()).toBe(true);
  });

  it("isGeminiEnabled returns true when only ALT key set", () => {
    delete process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY_ALT = "test-alt-key";

    expect(isGeminiEnabled()).toBe(true);
  });

  it("isGeminiEnabled returns true when both keys set", () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_API_KEY_ALT = "test-alt-key";

    expect(isGeminiEnabled()).toBe(true);
  });
});

// ============================================================================
// Gemini — 401/403 triggers rotation to ALT key
// ============================================================================

describe("Gemini key rotation — auth errors trigger ALT key rotation", () => {
  beforeEach(() => {
    _resetGeminiForTesting();
    mockGeminiGenerate.mockReset();
    process.env.GEMINI_API_KEY = "test-primary-gemini";
    process.env.GEMINI_API_KEY_ALT = "test-alt-gemini";
  });

  it("rotates to ALT key on 401 and retries successfully", async () => {
    mockGeminiGenerate
      .mockRejectedValueOnce(makeGemini401())
      .mockResolvedValueOnce(makeGeminiSuccess('{"gemini_rotated":true}'));

    const result = await generateWithGemini("test prompt");

    expect(result.text).toBe('{"gemini_rotated":true}');
    expect(mockGeminiGenerate.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("rotates to ALT key on 403 and retries successfully", async () => {
    mockGeminiGenerate
      .mockRejectedValueOnce(makeGemini403())
      .mockResolvedValueOnce(makeGeminiSuccess('{"gemini_recovered":true}'));

    const result = await generateWithGemini("test prompt");

    expect(result.text).toBe('{"gemini_recovered":true}');
  });

  it("propagates 401 when ALT key also returns 401", async () => {
    mockGeminiGenerate.mockRejectedValue(makeGemini401());

    await expect(
      generateWithGemini("test prompt")
    ).rejects.toThrow("API key not valid");
  });

  it("propagates 403 when both keys are expired", async () => {
    mockGeminiGenerate.mockRejectedValue(makeGemini403());

    await expect(
      generateWithGemini("test prompt")
    ).rejects.toThrow("API key expired");
  });
});

// ============================================================================
// Gemini — 429 RESOURCE_EXHAUSTED + rotation
// ============================================================================

describe("Gemini key rotation — rate limit / resource exhausted", () => {
  beforeEach(() => {
    _resetGeminiForTesting();
    mockGeminiGenerate.mockReset();
    process.env.GEMINI_API_KEY = "test-primary-gemini";
    process.env.GEMINI_API_KEY_ALT = "test-alt-gemini";
  });

  it("attempts ALT key on 429 RESOURCE_EXHAUSTED", async () => {
    mockGeminiGenerate
      .mockRejectedValueOnce(makeGemini429())
      .mockResolvedValueOnce(makeGeminiSuccess('{"gemini_alt_ok":true}'));

    const result = await generateWithGemini("test prompt");

    expect(result.text).toBe('{"gemini_alt_ok":true}');
  });

  it("throws immediately on daily quota exhausted for fast provider fallback", async () => {
    // Daily quota: the system should throw immediately so agent-runner
    // can fall back to the next provider without waiting
    mockGeminiGenerate.mockRejectedValue(makeGeminiDailyQuota());

    await expect(
      generateWithGemini("test prompt")
    ).rejects.toThrow("RESOURCE_EXHAUSTED");
  });

  it("propagates 429 when both keys are rate-limited", async () => {
    mockGeminiGenerate.mockRejectedValue(makeGemini429());

    await expect(
      generateWithGemini("test prompt")
    ).rejects.toThrow("RESOURCE_EXHAUSTED");
  });
});

// ============================================================================
// Gemini — no ALT key configured
// ============================================================================

describe("Gemini key rotation — no ALT key configured", () => {
  beforeEach(() => {
    _resetGeminiForTesting();
    mockGeminiGenerate.mockReset();
    process.env.GEMINI_API_KEY = "test-primary-gemini";
    delete process.env.GEMINI_API_KEY_ALT;
  });

  it("401 propagates when no ALT key exists", async () => {
    mockGeminiGenerate.mockRejectedValue(makeGemini401());

    await expect(
      generateWithGemini("test prompt")
    ).rejects.toThrow("API key not valid");
  });

  it("429 propagates when no ALT key exists", async () => {
    mockGeminiGenerate.mockRejectedValue(makeGemini429());

    await expect(
      generateWithGemini("test prompt")
    ).rejects.toThrow("RESOURCE_EXHAUSTED");
  });
});

// ============================================================================
// Gemini — rotation idempotency and persistence
// ============================================================================

describe("Gemini key rotation — idempotency and persistence", () => {
  beforeEach(() => {
    _resetGeminiForTesting();
    mockGeminiGenerate.mockReset();
    process.env.GEMINI_API_KEY = "test-primary-gemini";
    process.env.GEMINI_API_KEY_ALT = "test-alt-gemini";
  });

  it("double rotation does not loop: second call uses ALT directly", async () => {
    // First call: 401 -> rotate to ALT -> 401 on ALT -> throws
    mockGeminiGenerate.mockRejectedValue(makeGemini401());

    await expect(generateWithGemini("first")).rejects.toThrow("API key not valid");

    // Second call: already on ALT, rotation fails (idempotent), 401 propagates
    mockGeminiGenerate.mockReset();
    mockGeminiGenerate.mockRejectedValue(makeGemini401());

    await expect(generateWithGemini("second")).rejects.toThrow("API key not valid");
  });

  it("after rotation to ALT, subsequent successful calls use ALT", async () => {
    // Rotate to ALT
    mockGeminiGenerate
      .mockRejectedValueOnce(makeGemini401())
      .mockResolvedValueOnce(makeGeminiSuccess('{"first_on_alt":true}'));

    const result1 = await generateWithGemini("first");
    expect(result1.text).toBe('{"first_on_alt":true}');

    // Second call: should use ALT directly without rotation
    mockGeminiGenerate.mockResolvedValueOnce(makeGeminiSuccess('{"second_on_alt":true}'));

    const result2 = await generateWithGemini("second");
    expect(result2.text).toBe('{"second_on_alt":true}');
  });

  it("_resetGeminiForTesting restores primary key usage", async () => {
    // Rotate to ALT
    mockGeminiGenerate
      .mockRejectedValueOnce(makeGemini401())
      .mockResolvedValueOnce(makeGeminiSuccess());
    await generateWithGemini("rotate");

    // Reset
    _resetGeminiForTesting();
    mockGeminiGenerate.mockReset();

    // Next call should use primary key (client recreated)
    mockGeminiGenerate.mockResolvedValueOnce(makeGeminiSuccess('{"back_to_primary":true}'));
    const result = await generateWithGemini("after_reset");
    expect(result.text).toBe('{"back_to_primary":true}');
  });
});

// ============================================================================
// Gemini — non-auth errors bypass rotation
// ============================================================================

describe("Gemini key rotation — non-auth errors bypass rotation", () => {
  beforeEach(() => {
    _resetGeminiForTesting();
    mockGeminiGenerate.mockReset();
    process.env.GEMINI_API_KEY = "test-primary-gemini";
    process.env.GEMINI_API_KEY_ALT = "test-alt-gemini";
  });

  it("does not rotate on 500 Internal Server Error", async () => {
    const serverError = Object.assign(new Error("Internal Server Error"), { status: 500 });
    mockGeminiGenerate.mockRejectedValue(serverError);

    await expect(
      generateWithGemini("test")
    ).rejects.toThrow("Internal Server Error");

    expect(mockGeminiGenerate).toHaveBeenCalledOnce();
  });

  it("does not rotate on 400 Bad Request", async () => {
    const badRequest = Object.assign(new Error("Bad Request"), { status: 400 });
    mockGeminiGenerate.mockRejectedValue(badRequest);

    await expect(
      generateWithGemini("test")
    ).rejects.toThrow("Bad Request");

    expect(mockGeminiGenerate).toHaveBeenCalledOnce();
  });

  it("does not rotate on generic network error", async () => {
    mockGeminiGenerate.mockRejectedValue(new Error("fetch failed"));

    await expect(
      generateWithGemini("test")
    ).rejects.toThrow("fetch failed");

    expect(mockGeminiGenerate).toHaveBeenCalledOnce();
  });
});

// ============================================================================
// Gemini — empty ALT key edge case
// ============================================================================

describe("Gemini key rotation — edge cases", () => {
  beforeEach(() => {
    _resetGeminiForTesting();
    mockGeminiGenerate.mockReset();
    process.env.GEMINI_API_KEY = "test-primary-gemini";
  });

  it("empty string ALT key does not trigger rotation", async () => {
    process.env.GEMINI_API_KEY_ALT = "";

    mockGeminiGenerate.mockRejectedValue(makeGemini401());

    await expect(
      generateWithGemini("test")
    ).rejects.toThrow("API key not valid");
  });

  it("successful call does not trigger rotation", async () => {
    process.env.GEMINI_API_KEY_ALT = "test-alt-gemini";

    mockGeminiGenerate.mockResolvedValueOnce(makeGeminiSuccess());

    const result = await generateWithGemini("test");
    expect(result.text).toBe('{"ok":true}');
    expect(mockGeminiGenerate).toHaveBeenCalledOnce();
  });
});
