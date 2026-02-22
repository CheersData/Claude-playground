import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeClassification } from "../fixtures/classification";
import { makeAnalysis } from "../fixtures/analysis";
import { makeInvestigation } from "../fixtures/investigation";
import { makeAdvisorResult } from "../fixtures/advisor";
import { SAMPLE_RENTAL_CONTRACT } from "../fixtures/documents";

// Mock all agents
const mockRunClassifier = vi.hoisted(() => vi.fn());
const mockRunAnalyzer = vi.hoisted(() => vi.fn());
const mockRunInvestigator = vi.hoisted(() => vi.fn());
const mockRunAdvisor = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agents/classifier", () => ({
  runClassifier: (...args: unknown[]) => mockRunClassifier(...args),
}));
vi.mock("@/lib/agents/analyzer", () => ({
  runAnalyzer: (...args: unknown[]) => mockRunAnalyzer(...args),
}));
vi.mock("@/lib/agents/investigator", () => ({
  runInvestigator: (...args: unknown[]) => mockRunInvestigator(...args),
}));
vi.mock("@/lib/agents/advisor", () => ({
  runAdvisor: (...args: unknown[]) => mockRunAdvisor(...args),
}));

// Mock cache
const mockCreateSession = vi.hoisted(() => vi.fn());
const mockLoadSession = vi.hoisted(() => vi.fn());
const mockSavePhaseResult = vi.hoisted(() => vi.fn());
const mockSavePhaseTiming = vi.hoisted(() => vi.fn());
const mockFindSessionByDocument = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analysis-cache", () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  loadSession: (...args: unknown[]) => mockLoadSession(...args),
  savePhaseResult: (...args: unknown[]) => mockSavePhaseResult(...args),
  savePhaseTiming: (...args: unknown[]) => mockSavePhaseTiming(...args),
  findSessionByDocument: (...args: unknown[]) =>
    mockFindSessionByDocument(...args),
}));

import {
  runOrchestrator,
  type OrchestratorCallbacks,
} from "@/lib/agents/orchestrator";

function makeCallbacks(): OrchestratorCallbacks & {
  progressCalls: Array<[string, string, unknown?]>;
  errorCalls: Array<[string, string]>;
  completeCalls: unknown[];
} {
  const progressCalls: Array<[string, string, unknown?]> = [];
  const errorCalls: Array<[string, string]> = [];
  const completeCalls: unknown[] = [];

  return {
    onProgress: vi.fn((phase, status, data) => {
      progressCalls.push([phase, status, data]);
    }),
    onError: vi.fn((phase, error) => {
      errorCalls.push([phase, error]);
    }),
    onComplete: vi.fn((result) => {
      completeCalls.push(result);
    }),
    progressCalls,
    errorCalls,
    completeCalls,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  // Reset all mock implementations to defaults for each test
  mockCreateSession.mockResolvedValue("session-new-123");
  mockLoadSession.mockResolvedValue(null);
  mockSavePhaseResult.mockResolvedValue(undefined);
  mockSavePhaseTiming.mockResolvedValue(undefined);
  mockFindSessionByDocument.mockResolvedValue(null);

  // Default: all agents succeed
  mockRunClassifier.mockResolvedValue(makeClassification());
  mockRunAnalyzer.mockResolvedValue(makeAnalysis());
  mockRunInvestigator.mockResolvedValue(makeInvestigation());
  mockRunAdvisor.mockResolvedValue(makeAdvisorResult());
});

describe("runOrchestrator", () => {
  describe("fresh session (no cache)", () => {
    it("creates a new session and runs all 4 agents", async () => {
      const callbacks = makeCallbacks();
      const result = await runOrchestrator(
        SAMPLE_RENTAL_CONTRACT,
        callbacks
      );

      expect(mockCreateSession).toHaveBeenCalledWith(SAMPLE_RENTAL_CONTRACT);
      expect(mockRunClassifier).toHaveBeenCalledOnce();
      expect(mockRunAnalyzer).toHaveBeenCalledOnce();
      expect(mockRunInvestigator).toHaveBeenCalledOnce();
      expect(mockRunAdvisor).toHaveBeenCalledOnce();
      expect(result.sessionId).toBe("session-new-123");
    });

    it("fires onProgress running then done for each agent", async () => {
      const callbacks = makeCallbacks();
      await runOrchestrator(SAMPLE_RENTAL_CONTRACT, callbacks);

      // Expect 8 progress calls: running + done for each of 4 agents
      expect(callbacks.onProgress).toHaveBeenCalledTimes(8);

      // Check order: classifier running, classifier done, analyzer running, ...
      expect(callbacks.progressCalls[0]).toEqual([
        "classifier",
        "running",
        undefined,
      ]);
      expect(callbacks.progressCalls[1][0]).toBe("classifier");
      expect(callbacks.progressCalls[1][1]).toBe("done");

      expect(callbacks.progressCalls[2]).toEqual([
        "analyzer",
        "running",
        undefined,
      ]);
      expect(callbacks.progressCalls[3][0]).toBe("analyzer");
      expect(callbacks.progressCalls[3][1]).toBe("done");
    });

    it("fires onComplete with AdvisorResult at the end", async () => {
      const callbacks = makeCallbacks();
      await runOrchestrator(SAMPLE_RENTAL_CONTRACT, callbacks);

      expect(callbacks.onComplete).toHaveBeenCalledOnce();
      expect(callbacks.completeCalls[0]).toHaveProperty("fairnessScore");
    });

    it("saves each phase result to cache", async () => {
      const callbacks = makeCallbacks();
      await runOrchestrator(SAMPLE_RENTAL_CONTRACT, callbacks);

      expect(mockSavePhaseResult).toHaveBeenCalledTimes(4);
      expect(mockSavePhaseResult).toHaveBeenCalledWith(
        "session-new-123",
        "classification",
        expect.any(Object)
      );
      expect(mockSavePhaseResult).toHaveBeenCalledWith(
        "session-new-123",
        "analysis",
        expect.any(Object)
      );
      expect(mockSavePhaseResult).toHaveBeenCalledWith(
        "session-new-123",
        "investigation",
        expect.any(Object)
      );
      expect(mockSavePhaseResult).toHaveBeenCalledWith(
        "session-new-123",
        "advice",
        expect.any(Object)
      );
    });

    it("returns OrchestratorResult with all 4 results and sessionId", async () => {
      const callbacks = makeCallbacks();
      const result = await runOrchestrator(
        SAMPLE_RENTAL_CONTRACT,
        callbacks
      );

      expect(result.classification).toBeDefined();
      expect(result.analysis).toBeDefined();
      expect(result.investigation).toBeDefined();
      expect(result.advice).toBeDefined();
      expect(result.sessionId).toBe("session-new-123");
    });
  });

  describe("cache resume", () => {
    it("resumes from resumeSessionId when provided", async () => {
      mockLoadSession.mockResolvedValue({
        sessionId: "session-cached-456",
        classification: makeClassification(),
        analysis: null,
        investigation: null,
        advice: null,
      });

      const callbacks = makeCallbacks();
      const result = await runOrchestrator(
        SAMPLE_RENTAL_CONTRACT,
        callbacks,
        "session-cached-456"
      );

      expect(mockLoadSession).toHaveBeenCalledWith("session-cached-456");
      expect(result.sessionId).toBe("session-cached-456");
      // Classifier should be skipped (cached)
      expect(mockRunClassifier).not.toHaveBeenCalled();
      // Analyzer should run (not cached)
      expect(mockRunAnalyzer).toHaveBeenCalledOnce();
    });

    it("falls back to findSessionByDocument when no resumeSessionId", async () => {
      mockFindSessionByDocument.mockResolvedValue({
        sessionId: "session-found-789",
        classification: makeClassification(),
        analysis: makeAnalysis(),
        investigation: null,
        advice: null,
      });

      const callbacks = makeCallbacks();
      const result = await runOrchestrator(
        SAMPLE_RENTAL_CONTRACT,
        callbacks
      );

      expect(mockFindSessionByDocument).toHaveBeenCalledWith(
        SAMPLE_RENTAL_CONTRACT
      );
      expect(result.sessionId).toBe("session-found-789");
      expect(mockRunClassifier).not.toHaveBeenCalled();
      expect(mockRunAnalyzer).not.toHaveBeenCalled();
      expect(mockRunInvestigator).toHaveBeenCalledOnce();
    });

    it("skips all cached phases and fires done for them", async () => {
      const cachedClassification = makeClassification();
      const cachedAnalysis = makeAnalysis();
      mockLoadSession.mockResolvedValue({
        sessionId: "session-partial",
        classification: cachedClassification,
        analysis: cachedAnalysis,
        investigation: null,
        advice: null,
      });

      const callbacks = makeCallbacks();
      await runOrchestrator(
        SAMPLE_RENTAL_CONTRACT,
        callbacks,
        "session-partial"
      );

      // Cached phases should fire "done" directly (no "running")
      expect(callbacks.progressCalls[0]).toEqual([
        "classifier",
        "done",
        cachedClassification,
      ]);
      expect(callbacks.progressCalls[1]).toEqual([
        "analyzer",
        "done",
        cachedAnalysis,
      ]);
      // Non-cached phases should fire "running" then "done"
      expect(callbacks.progressCalls[2]).toEqual([
        "investigator",
        "running",
        undefined,
      ]);
    });
  });

  describe("error handling", () => {
    it("throws and fires onError when classifier fails", async () => {
      mockRunClassifier.mockRejectedValue(new Error("Classifier boom"));

      const callbacks = makeCallbacks();
      await expect(
        runOrchestrator(SAMPLE_RENTAL_CONTRACT, callbacks)
      ).rejects.toThrow("Classifier failed: Classifier boom");

      expect(callbacks.onError).toHaveBeenCalledWith(
        "classifier",
        "Classifier boom"
      );
    });

    it("throws and fires onError when analyzer fails", async () => {
      mockRunAnalyzer.mockRejectedValue(new Error("Analyzer boom"));

      const callbacks = makeCallbacks();
      await expect(
        runOrchestrator(SAMPLE_RENTAL_CONTRACT, callbacks)
      ).rejects.toThrow("Analyzer failed: Analyzer boom");

      expect(callbacks.onError).toHaveBeenCalledWith(
        "analyzer",
        "Analyzer boom"
      );
    });

    it("continues with empty findings when investigator fails (non-fatal)", async () => {
      mockRunInvestigator.mockRejectedValue(
        new Error("web_search unavailable")
      );

      const callbacks = makeCallbacks();
      const result = await runOrchestrator(
        SAMPLE_RENTAL_CONTRACT,
        callbacks
      );

      // Should NOT throw
      expect(result.investigation).toEqual({ findings: [] });
      expect(callbacks.onError).toHaveBeenCalledWith(
        "investigator",
        "web_search unavailable"
      );
      // Advisor should still run
      expect(mockRunAdvisor).toHaveBeenCalledOnce();
    });

    it("saves empty investigation to cache after investigator failure", async () => {
      mockRunInvestigator.mockRejectedValue(new Error("fail"));

      const callbacks = makeCallbacks();
      await runOrchestrator(SAMPLE_RENTAL_CONTRACT, callbacks);

      expect(mockSavePhaseResult).toHaveBeenCalledWith(
        "session-new-123",
        "investigation",
        { findings: [] }
      );
    });

    it("throws and fires onError when advisor fails (fatal)", async () => {
      mockRunAdvisor.mockRejectedValue(new Error("Advisor boom"));

      const callbacks = makeCallbacks();
      await expect(
        runOrchestrator(SAMPLE_RENTAL_CONTRACT, callbacks)
      ).rejects.toThrow("Advisor failed: Advisor boom");

      expect(callbacks.onError).toHaveBeenCalledWith(
        "advisor",
        "Advisor boom"
      );
    });
  });
});
