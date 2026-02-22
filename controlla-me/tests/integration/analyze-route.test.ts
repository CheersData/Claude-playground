import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeClassification } from "../fixtures/classification";
import { makeAnalysis } from "../fixtures/analysis";
import { makeInvestigation } from "../fixtures/investigation";
import { makeAdvisorResult } from "../fixtures/advisor";
import { SAMPLE_RENTAL_CONTRACT, SHORT_TEXT } from "../fixtures/documents";
import { makeMockSupabaseClient } from "../mocks/supabase";

// Mock supabase
const mockSupabaseClient = makeMockSupabaseClient();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mockSupabaseClient),
}));

const mockAdminClient = {
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => mockAdminClient),
}));

// Mock orchestrator
const mockRunOrchestrator = vi.fn();
vi.mock("@/lib/agents/orchestrator", () => ({
  runOrchestrator: (...args: unknown[]) => mockRunOrchestrator(...args),
}));

// Mock extract-text
const mockExtractText = vi.fn();
vi.mock("@/lib/extract-text", () => ({
  extractText: (...args: unknown[]) => mockExtractText(...args),
}));

// Mock analysis-cache
vi.mock("@/lib/analysis-cache", () => ({
  getAverageTimings: vi.fn().mockResolvedValue({
    classifier: 12,
    analyzer: 25,
    investigator: 22,
    advisor: 18,
  }),
}));

// Mock stripe (loaded at module level)
vi.mock("@/lib/stripe", () => ({
  PLANS: {
    free: { name: "Free", price: 0, analysesPerMonth: 3, deepSearchLimit: 1 },
    pro: {
      name: "Pro",
      price: 4.99,
      analysesPerMonth: Infinity,
      deepSearchLimit: Infinity,
    },
  },
}));

import { POST } from "@/app/api/analyze/route";
import { NextRequest } from "next/server";

// Helper: parse SSE text into structured events
async function consumeSSE(
  response: Response
): Promise<Array<{ event: string; data: unknown }>> {
  const text = await response.text();
  const events: Array<{ event: string; data: unknown }> = [];
  const blocks = text.split("\n\n").filter(Boolean);
  for (const block of blocks) {
    const eventMatch = block.match(/^event: (.+)$/m);
    const dataMatch = block.match(/^data: (.+)$/m);
    if (eventMatch && dataMatch) {
      try {
        events.push({
          event: eventMatch[1],
          data: JSON.parse(dataMatch[1]),
        });
      } catch {
        events.push({ event: eventMatch[1], data: dataMatch[1] });
      }
    }
  }
  return events;
}

function makeRequest(body: Record<string, string | Blob>): NextRequest {
  const formData = new FormData();
  for (const [key, value] of Object.entries(body)) {
    formData.append(key, value);
  }
  return new NextRequest("http://localhost:3000/api/analyze", {
    method: "POST",
    body: formData,
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default: orchestrator succeeds and calls callbacks
  mockRunOrchestrator.mockImplementation(
    async (
      _text: string,
      callbacks: {
        onProgress: (phase: string, status: string, data?: unknown) => void;
        onComplete: (result: unknown) => void;
      }
    ) => {
      const classification = makeClassification();
      const analysis = makeAnalysis();
      const investigation = makeInvestigation();
      const advice = makeAdvisorResult();

      callbacks.onProgress("classifier", "running");
      callbacks.onProgress("classifier", "done", classification);
      callbacks.onProgress("analyzer", "running");
      callbacks.onProgress("analyzer", "done", analysis);
      callbacks.onProgress("investigator", "running");
      callbacks.onProgress("investigator", "done", investigation);
      callbacks.onProgress("advisor", "running");
      callbacks.onProgress("advisor", "done", advice);
      callbacks.onComplete(advice);

      return {
        classification,
        analysis,
        investigation,
        advice,
        sessionId: "session-test-abc",
      };
    }
  );

  // Default: auth returns a user
  mockSupabaseClient.auth.getUser.mockResolvedValue({
    data: { user: { id: "user-123" } },
    error: null,
  });

  // Default: profile is free with 0 analyses
  const singleFn = vi
    .fn()
    .mockResolvedValue({
      data: { plan: "free", analyses_count: 0 },
      error: null,
    });
  const eqFn = vi.fn().mockReturnValue({ single: singleFn });
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn });
  mockSupabaseClient.from.mockReturnValue({ select: selectFn });
});

describe("POST /api/analyze", () => {
  describe("input validation", () => {
    it("returns SSE error when neither file nor text is provided", async () => {
      const req = makeRequest({});
      const response = await POST(req);
      const events = await consumeSSE(response);

      const errorEvent = events.find((e) => e.event === "error");
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.data).toHaveProperty(
        "message",
        "Nessun file o testo fornito"
      );
    });

    it("returns SSE error when text is shorter than 50 chars", async () => {
      const req = makeRequest({ text: SHORT_TEXT });
      const response = await POST(req);
      const events = await consumeSSE(response);

      const errorEvent = events.find((e) => e.event === "error");
      expect(errorEvent).toBeDefined();
      expect((errorEvent!.data as { message: string }).message).toContain(
        "troppo corto"
      );
    });
  });

  describe("usage limits", () => {
    it("returns LIMIT_REACHED error when free user has exhausted quota", async () => {
      const singleFn = vi.fn().mockResolvedValue({
        data: { plan: "free", analyses_count: 3 },
        error: null,
      });
      const eqFn = vi.fn().mockReturnValue({ single: singleFn });
      const selectFn = vi.fn().mockReturnValue({ eq: eqFn });
      mockSupabaseClient.from.mockReturnValue({ select: selectFn });

      const req = makeRequest({ text: SAMPLE_RENTAL_CONTRACT });
      const response = await POST(req);
      const events = await consumeSSE(response);

      const errorEvent = events.find((e) => e.event === "error");
      expect(errorEvent).toBeDefined();
      expect((errorEvent!.data as { code: string }).code).toBe(
        "LIMIT_REACHED"
      );
    });

    it("allows analysis when user is on pro plan", async () => {
      const singleFn = vi.fn().mockResolvedValue({
        data: { plan: "pro", analyses_count: 100 },
        error: null,
      });
      const eqFn = vi.fn().mockReturnValue({ single: singleFn });
      const selectFn = vi.fn().mockReturnValue({ eq: eqFn });
      mockSupabaseClient.from.mockReturnValue({ select: selectFn });

      const req = makeRequest({ text: SAMPLE_RENTAL_CONTRACT });
      const response = await POST(req);
      const events = await consumeSSE(response);

      const completeEvent = events.find((e) => e.event === "complete");
      expect(completeEvent).toBeDefined();
    });

    it("allows analysis when auth check fails (graceful degradation)", async () => {
      mockSupabaseClient.auth.getUser.mockRejectedValue(
        new Error("auth down")
      );

      const req = makeRequest({ text: SAMPLE_RENTAL_CONTRACT });
      const response = await POST(req);
      const events = await consumeSSE(response);

      const completeEvent = events.find((e) => e.event === "complete");
      expect(completeEvent).toBeDefined();
    });
  });

  describe("text input flow", () => {
    it("accepts rawText and runs orchestrator to completion", async () => {
      const req = makeRequest({ text: SAMPLE_RENTAL_CONTRACT });
      const response = await POST(req);
      const events = await consumeSSE(response);

      expect(mockRunOrchestrator).toHaveBeenCalledOnce();

      const eventTypes = events.map((e) => e.event);
      expect(eventTypes).toContain("timing");
      expect(eventTypes).toContain("progress");
      expect(eventTypes).toContain("complete");
      expect(eventTypes).toContain("session");
    });

    it("sends timing event before orchestrator starts", async () => {
      const req = makeRequest({ text: SAMPLE_RENTAL_CONTRACT });
      const response = await POST(req);
      const events = await consumeSSE(response);

      const timingIdx = events.findIndex((e) => e.event === "timing");
      const firstProgressIdx = events.findIndex(
        (e) => e.event === "progress"
      );
      expect(timingIdx).toBeLessThan(firstProgressIdx);
    });

    it("sends session event with sessionId", async () => {
      const req = makeRequest({ text: SAMPLE_RENTAL_CONTRACT });
      const response = await POST(req);
      const events = await consumeSSE(response);

      const sessionEvent = events.find((e) => e.event === "session");
      expect(sessionEvent).toBeDefined();
      expect((sessionEvent!.data as { sessionId: string }).sessionId).toBe(
        "session-test-abc"
      );
    });
  });

  describe("file upload", () => {
    it("calls extractText with buffer, MIME type, and filename", async () => {
      mockExtractText.mockResolvedValue(SAMPLE_RENTAL_CONTRACT);

      const file = new File(["fake content"], "contract.pdf", {
        type: "application/pdf",
      });
      const req = makeRequest({ file });
      const response = await POST(req);
      await consumeSSE(response);

      expect(mockExtractText).toHaveBeenCalledOnce();
      const [buffer, mimeType, fileName] = mockExtractText.mock.calls[0];
      expect(buffer).toBeInstanceOf(Buffer);
      expect(mimeType).toBe("application/pdf");
      expect(fileName).toBe("contract.pdf");
    });
  });

  describe("post-completion", () => {
    it("increments analyses_count for authenticated users", async () => {
      const req = makeRequest({ text: SAMPLE_RENTAL_CONTRACT });
      await POST(req);
      // Consume stream to let it finish
      const response = await POST(makeRequest({ text: SAMPLE_RENTAL_CONTRACT }));
      await consumeSSE(response);

      expect(mockAdminClient.rpc).toHaveBeenCalledWith(
        "increment_analyses_count",
        { uid: "user-123" }
      );
    });
  });

  describe("response headers", () => {
    it("returns correct SSE headers", async () => {
      const req = makeRequest({ text: SAMPLE_RENTAL_CONTRACT });
      const response = await POST(req);

      expect(response.headers.get("Content-Type")).toBe(
        "text/event-stream"
      );
      expect(response.headers.get("Cache-Control")).toBe("no-cache");
    });
  });

  describe("error handling", () => {
    it("sends SSE error event when orchestrator throws", async () => {
      mockRunOrchestrator.mockRejectedValue(
        new Error("Classifier failed: timeout")
      );

      const req = makeRequest({ text: SAMPLE_RENTAL_CONTRACT });
      const response = await POST(req);
      const events = await consumeSSE(response);

      const errorEvent = events.find((e) => e.event === "error");
      expect(errorEvent).toBeDefined();
      expect(
        (errorEvent!.data as { message: string }).message
      ).toContain("Classifier failed");
    });
  });
});
