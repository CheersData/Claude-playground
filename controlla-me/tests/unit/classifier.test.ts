import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeClassification } from "../fixtures/classification";
import { makeAnthropicResponse } from "../fixtures/anthropic-response";
import { SAMPLE_RENTAL_CONTRACT } from "../fixtures/documents";

const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/anthropic", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/anthropic")>();
  return {
    ...original,
    anthropic: {
      get messages() {
        return { create: mockCreate };
      },
    },
  };
});

import { runClassifier } from "@/lib/agents/classifier";
import { MODEL_FAST } from "@/lib/anthropic";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runClassifier", () => {
  const classificationFixture = makeClassification();

  it("calls anthropic with MODEL_FAST, 4096 max_tokens, and system prompt", async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(classificationFixture))
    );

    await runClassifier(SAMPLE_RENTAL_CONTRACT);

    expect(mockCreate).toHaveBeenCalledOnce();
    const params = mockCreate.mock.calls[0][0];
    expect(params.model).toBe(MODEL_FAST);
    expect(params.max_tokens).toBe(4096);
    expect(params.system).toBeDefined();
    expect(typeof params.system).toBe("string");
  });

  it("passes document text in user message", async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(classificationFixture))
    );

    await runClassifier(SAMPLE_RENTAL_CONTRACT);

    const params = mockCreate.mock.calls[0][0];
    const userMessage = params.messages[0].content as string;
    expect(userMessage).toContain(SAMPLE_RENTAL_CONTRACT);
    expect(userMessage).toContain("Analizza e classifica");
  });

  it("returns parsed ClassificationResult from Claude response", async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(JSON.stringify(classificationFixture))
    );

    const result = await runClassifier(SAMPLE_RENTAL_CONTRACT);

    expect(result.documentType).toBe("contratto_locazione_abitativa");
    expect(result.parties).toHaveLength(2);
    expect(result.jurisdiction).toContain("Italia");
    expect(result.confidence).toBe(0.95);
  });

  it("warns when response is truncated (max_tokens)", async () => {
    const warnSpy = vi.spyOn(console, "warn");
    // Use actually truncated JSON (mid-key cut off) to trigger parseAgentJSON repair path
    const truncatedJson =
      '{"documentType":"contratto_locazione_abitativa","documentTypeLabel":"Contratto di';
    mockCreate.mockResolvedValue(
      makeAnthropicResponse(truncatedJson, { stop_reason: "max_tokens" })
    );

    // Truncated JSON after repair may fail or succeed; we only care that the warn fired
    try {
      await runClassifier(SAMPLE_RENTAL_CONTRACT);
    } catch {
      // JSON repair may still fail — that's OK for this test
    }

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("troncata")
    );
  });

  it("propagates API errors", async () => {
    mockCreate.mockRejectedValue(new Error("API connection failed"));

    await expect(
      runClassifier(SAMPLE_RENTAL_CONTRACT)
    ).rejects.toThrow("API connection failed");
  });

  it("propagates JSON parse errors from malformed responses", async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse("This is not valid JSON at all")
    );

    await expect(
      runClassifier(SAMPLE_RENTAL_CONTRACT)
    ).rejects.toThrow("Risposta non JSON da Claude");
  });
});
