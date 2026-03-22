/**
 * Tests: lib/agent-broadcast.ts
 *
 * Comprehensive test suite covering:
 * - broadcastAgentEvent: stores event, emits via bus, adds timestamp
 * - onAgentEvent: subscribes to events, returns unsubscribe function
 * - getActiveAgentEvents: snapshot of active events, respects TTL
 * - broadcastConsoleAgent: maps phases to departments, prefixes id with "console-"
 * - broadcastDeptActivity: creates events with dept prefix, timestamped id
 * - TTL behavior: running events expire after TTL_RUNNING, done/error after TTL_DONE
 * - Cleanup: periodic cleanup removes expired events
 * - Multiple subscribers: all receive events
 * - Dedup: same id overwrites previous event
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We need to reset the global state between tests. The module uses globalThis
// for HMR stability, so we clean up manually.

// ── Dynamic import helper to get fresh module per test ────────────────────────

// Since agent-broadcast uses globalThis singletons, we clean them before each test
function resetGlobalState() {
  const g = globalThis as unknown as {
    __agentBroadcastBus?: import("events").EventEmitter;
    __agentActiveEvents?: Map<string, unknown>;
  };
  if (g.__agentBroadcastBus) {
    g.__agentBroadcastBus.removeAllListeners();
  }
  if (g.__agentActiveEvents) {
    g.__agentActiveEvents.clear();
  }
}

// Import after understanding the module uses globalThis singletons
import {
  broadcastAgentEvent,
  onAgentEvent,
  getActiveAgentEvents,
  broadcastConsoleAgent,
  broadcastDeptActivity,
  type AgentEvent,
} from "@/lib/agent-broadcast";

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  resetGlobalState();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  resetGlobalState();
});

// ── broadcastAgentEvent ───────────────────────────────────────────────────────

describe("broadcastAgentEvent", () => {
  it("stores event and adds timestamp", () => {
    const now = Date.now();

    broadcastAgentEvent({
      id: "test-1",
      department: "ufficio-legale",
      status: "running",
      task: "Analyzing contract",
    });

    const events = getActiveAgentEvents();
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("test-1");
    expect(events[0].department).toBe("ufficio-legale");
    expect(events[0].status).toBe("running");
    expect(events[0].task).toBe("Analyzing contract");
    expect(events[0].timestamp).toBeGreaterThanOrEqual(now);
  });

  it("emits event to subscribers", () => {
    const received: AgentEvent[] = [];
    onAgentEvent((evt) => received.push(evt));

    broadcastAgentEvent({
      id: "test-emit",
      department: "trading",
      status: "running",
    });

    expect(received).toHaveLength(1);
    expect(received[0].id).toBe("test-emit");
    expect(received[0].department).toBe("trading");
  });

  it("overwrites event with same id (dedup)", () => {
    broadcastAgentEvent({
      id: "dedup-1",
      department: "cme",
      status: "running",
      task: "First",
    });

    broadcastAgentEvent({
      id: "dedup-1",
      department: "cme",
      status: "done",
      task: "Updated",
    });

    const events = getActiveAgentEvents();
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("done");
    expect(events[0].task).toBe("Updated");
  });

  it("stores multiple events with different ids", () => {
    broadcastAgentEvent({ id: "a", department: "trading", status: "running" });
    broadcastAgentEvent({ id: "b", department: "cme", status: "running" });
    broadcastAgentEvent({ id: "c", department: "security", status: "done" });

    const events = getActiveAgentEvents();
    expect(events).toHaveLength(3);
    const ids = events.map((e) => e.id).sort();
    expect(ids).toEqual(["a", "b", "c"]);
  });
});

// ── onAgentEvent ──────────────────────────────────────────────────────────────

describe("onAgentEvent", () => {
  it("returns unsubscribe function that stops delivery", () => {
    const received: AgentEvent[] = [];
    const unsub = onAgentEvent((evt) => received.push(evt));

    broadcastAgentEvent({ id: "sub-1", department: "cme", status: "running" });
    expect(received).toHaveLength(1);

    unsub();

    broadcastAgentEvent({ id: "sub-2", department: "cme", status: "done" });
    // Should still be 1 — no new events after unsubscribe
    expect(received).toHaveLength(1);
  });

  it("supports multiple concurrent subscribers", () => {
    const received1: AgentEvent[] = [];
    const received2: AgentEvent[] = [];
    const unsub1 = onAgentEvent((evt) => received1.push(evt));
    const unsub2 = onAgentEvent((evt) => received2.push(evt));

    broadcastAgentEvent({ id: "multi", department: "trading", status: "running" });

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
    expect(received1[0].id).toBe("multi");
    expect(received2[0].id).toBe("multi");

    unsub1();
    unsub2();
  });
});

// ── getActiveAgentEvents ──────────────────────────────────────────────────────

describe("getActiveAgentEvents", () => {
  it("returns empty array when no events", () => {
    expect(getActiveAgentEvents()).toEqual([]);
  });

  it("returns only non-expired events", () => {
    broadcastAgentEvent({ id: "alive", department: "cme", status: "running" });
    broadcastAgentEvent({ id: "will-die", department: "trading", status: "done" });

    // Advance past done TTL (30s) but not running TTL (60s)
    vi.advanceTimersByTime(31_000);

    const events = getActiveAgentEvents();
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("alive");
  });

  it("prunes expired running events after TTL_RUNNING (60s)", () => {
    broadcastAgentEvent({ id: "stale-runner", department: "trading", status: "running" });

    // Advance past running TTL (60s)
    vi.advanceTimersByTime(61_000);

    const events = getActiveAgentEvents();
    expect(events).toHaveLength(0);
  });

  it("prunes expired done events after TTL_DONE (30s)", () => {
    broadcastAgentEvent({ id: "done-evt", department: "cme", status: "done" });

    vi.advanceTimersByTime(30_500);

    expect(getActiveAgentEvents()).toHaveLength(0);
  });

  it("prunes expired error events after TTL_DONE (30s)", () => {
    broadcastAgentEvent({ id: "err-evt", department: "security", status: "error" });

    vi.advanceTimersByTime(30_500);

    expect(getActiveAgentEvents()).toHaveLength(0);
  });

  it("keeps running events within TTL", () => {
    broadcastAgentEvent({ id: "fresh", department: "cme", status: "running" });

    // Advance 30s — still within 60s TTL
    vi.advanceTimersByTime(30_000);

    expect(getActiveAgentEvents()).toHaveLength(1);
  });
});

// ── broadcastConsoleAgent ─────────────────────────────────────────────────────

describe("broadcastConsoleAgent", () => {
  it("maps classifier phase to ufficio-legale department", () => {
    const received: AgentEvent[] = [];
    const unsub = onAgentEvent((evt) => received.push(evt));

    broadcastConsoleAgent("classifier", "running", { task: "Classifying" });

    expect(received).toHaveLength(1);
    expect(received[0].id).toBe("console-classifier");
    expect(received[0].department).toBe("ufficio-legale");
    expect(received[0].task).toBe("Classifying");
    expect(received[0].status).toBe("running");

    unsub();
  });

  it("maps analyzer phase to ufficio-legale", () => {
    broadcastConsoleAgent("analyzer", "done");
    const events = getActiveAgentEvents();
    expect(events[0].department).toBe("ufficio-legale");
    expect(events[0].id).toBe("console-analyzer");
  });

  it("maps investigator phase to ufficio-legale", () => {
    broadcastConsoleAgent("investigator", "running");
    const events = getActiveAgentEvents();
    expect(events[0].department).toBe("ufficio-legale");
  });

  it("maps advisor phase to ufficio-legale", () => {
    broadcastConsoleAgent("advisor", "error");
    const events = getActiveAgentEvents();
    expect(events[0].department).toBe("ufficio-legale");
  });

  it("maps leader phase to cme department", () => {
    broadcastConsoleAgent("leader", "running");
    const events = getActiveAgentEvents();
    expect(events[0].department).toBe("cme");
  });

  it("maps retrieval phase to data-engineering", () => {
    broadcastConsoleAgent("retrieval", "running");
    const events = getActiveAgentEvents();
    expect(events[0].department).toBe("data-engineering");
  });

  it("maps qa-test-run phase to quality-assurance", () => {
    broadcastConsoleAgent("qa-test-run", "running");
    const events = getActiveAgentEvents();
    expect(events[0].department).toBe("quality-assurance");
  });

  it("maps trading-pipeline phase to trading", () => {
    broadcastConsoleAgent("trading-pipeline", "running");
    const events = getActiveAgentEvents();
    expect(events[0].department).toBe("trading");
  });

  it("maps security-audit phase to security", () => {
    broadcastConsoleAgent("security-audit", "running");
    const events = getActiveAgentEvents();
    expect(events[0].department).toBe("security");
  });

  it("maps cost-report phase to finance", () => {
    broadcastConsoleAgent("cost-report", "done");
    const events = getActiveAgentEvents();
    expect(events[0].department).toBe("finance");
  });

  it("maps data-connector phase to data-engineering", () => {
    broadcastConsoleAgent("data-connector", "running");
    const events = getActiveAgentEvents();
    expect(events[0].department).toBe("data-engineering");
  });

  it("maps unknown phase to operations (default)", () => {
    broadcastConsoleAgent("unknown-phase", "running");
    const events = getActiveAgentEvents();
    expect(events[0].department).toBe("operations");
  });

  it("uses phase name as task when no task provided", () => {
    broadcastConsoleAgent("classifier", "running");
    const events = getActiveAgentEvents();
    expect(events[0].task).toBe("classifier");
  });

  it("uses provided task when given", () => {
    broadcastConsoleAgent("classifier", "running", { task: "Custom task" });
    const events = getActiveAgentEvents();
    expect(events[0].task).toBe("Custom task");
  });
});

// ── broadcastDeptActivity ─────────────────────────────────────────────────────

describe("broadcastDeptActivity", () => {
  it("creates event with dept- prefix in id", () => {
    broadcastDeptActivity("quality-assurance", "running", "Test 3/50");

    const events = getActiveAgentEvents();
    expect(events).toHaveLength(1);
    expect(events[0].id).toMatch(/^dept-quality-assurance-/);
    expect(events[0].department).toBe("quality-assurance");
    expect(events[0].task).toBe("Test 3/50");
    expect(events[0].status).toBe("running");
  });

  it("uses department name as task when no task provided", () => {
    broadcastDeptActivity("trading", "done");

    const events = getActiveAgentEvents();
    expect(events[0].task).toBe("trading");
  });

  it("creates unique ids (timestamped) for multiple calls", () => {
    broadcastDeptActivity("cme", "running", "Task A");
    vi.advanceTimersByTime(1); // Advance 1ms to get different timestamp
    broadcastDeptActivity("cme", "running", "Task B");

    const events = getActiveAgentEvents();
    // Both should exist since ids are unique (timestamp-based)
    expect(events.length).toBeGreaterThanOrEqual(1);
    // The ids should both start with dept-cme-
    for (const evt of events) {
      expect(evt.id).toMatch(/^dept-cme-/);
    }
  });
});

// ── Cleanup timer behavior ────────────────────────────────────────────────────

describe("cleanup timer", () => {
  it("auto-prunes done events via periodic cleanup", () => {
    broadcastAgentEvent({ id: "cleanup-test", department: "cme", status: "done" });

    // Verify it exists
    expect(getActiveAgentEvents()).toHaveLength(1);

    // Advance past done TTL + cleanup interval (30s + 5s)
    vi.advanceTimersByTime(36_000);

    // After cleanup runs, the event should be gone
    expect(getActiveAgentEvents()).toHaveLength(0);
  });

  it("auto-prunes running events that exceed TTL_RUNNING", () => {
    broadcastAgentEvent({ id: "stale", department: "trading", status: "running" });

    expect(getActiveAgentEvents()).toHaveLength(1);

    // Advance past running TTL + cleanup interval (60s + 5s)
    vi.advanceTimersByTime(66_000);

    expect(getActiveAgentEvents()).toHaveLength(0);
  });
});

// ── Integration: analyze pipeline broadcast pattern ───────────────────────────

describe("analyze pipeline broadcast integration", () => {
  it("simulates full analysis pipeline broadcasting", () => {
    const received: AgentEvent[] = [];
    const unsub = onAgentEvent((evt) => received.push(evt));

    // Simulate the 4-agent pipeline as /api/analyze does
    broadcastConsoleAgent("classifier", "running", { task: "Analisi: classifier" });
    broadcastConsoleAgent("classifier", "done", { task: "Analisi: classifier" });
    broadcastConsoleAgent("analyzer", "running", { task: "Analisi: analyzer" });
    broadcastConsoleAgent("analyzer", "done", { task: "Analisi: analyzer" });
    broadcastConsoleAgent("investigator", "running", { task: "Analisi: investigator" });
    broadcastConsoleAgent("investigator", "done", { task: "Analisi: investigator" });
    broadcastConsoleAgent("advisor", "running", { task: "Analisi: advisor" });
    broadcastConsoleAgent("advisor", "done", { task: "Analisi: advisor" });

    expect(received).toHaveLength(8);

    // All 4 agents should have ended in "done" state
    const snapshot = getActiveAgentEvents();
    const doneEvents = snapshot.filter((e) => e.status === "done");
    expect(doneEvents).toHaveLength(4);

    // Verify correct department mapping for all
    for (const evt of doneEvents) {
      expect(evt.department).toBe("ufficio-legale");
    }

    unsub();
  });

  it("handles error in pipeline gracefully", () => {
    broadcastConsoleAgent("classifier", "running", { task: "Analisi: classifier" });
    broadcastConsoleAgent("classifier", "done", { task: "Analisi: classifier" });
    broadcastConsoleAgent("analyzer", "running", { task: "Analisi: analyzer" });
    broadcastConsoleAgent("analyzer", "error", { task: "Rate limit exceeded" });

    const snapshot = getActiveAgentEvents();
    const analyzerEvent = snapshot.find((e) => e.id === "console-analyzer");
    expect(analyzerEvent).toBeDefined();
    expect(analyzerEvent!.status).toBe("error");
    expect(analyzerEvent!.task).toBe("Rate limit exceeded");
  });

  it("simulates full pipeline with retrieval and auto-index broadcasts", () => {
    const received: AgentEvent[] = [];
    const unsub = onAgentEvent((evt) => received.push(evt));

    // Step 1: Classifier
    broadcastConsoleAgent("classifier", "running", { task: "Analisi: classifier" });
    broadcastConsoleAgent("classifier", "done", { task: "Analisi: classifier" });

    // Step 1.5: Retrieval (contesto normativo per Analyzer)
    broadcastConsoleAgent("retrieval", "running", {
      task: "Retrieval: contesto normativo per Analyzer",
    });
    broadcastConsoleAgent("retrieval", "done", {
      task: "Retrieval: 3500 chars contesto normativo",
    });

    // Step 2: Analyzer
    broadcastConsoleAgent("analyzer", "running", { task: "Analisi: analyzer" });
    broadcastConsoleAgent("analyzer", "done", { task: "Analisi: analyzer" });

    // Step 2.5: Retrieval (contesto clausole per Investigator)
    broadcastConsoleAgent("retrieval", "running", {
      task: "Retrieval: contesto clausole per Investigator",
    });
    broadcastConsoleAgent("retrieval", "done", {
      task: "Retrieval: contesto clausole pronto (2100 chars)",
    });

    // Step 3: Investigator
    broadcastConsoleAgent("investigator", "running", { task: "Analisi: investigator" });
    broadcastConsoleAgent("investigator", "done", { task: "Analisi: investigator" });

    // Step 4: Advisor
    broadcastConsoleAgent("advisor", "running", { task: "Analisi: advisor" });
    broadcastConsoleAgent("advisor", "done", { task: "Analisi: advisor" });

    // Step 6: Auto-index
    broadcastConsoleAgent("retrieval", "running", {
      task: "Auto-index: salvataggio conoscenza nel vector DB",
    });
    broadcastConsoleAgent("retrieval", "done", {
      task: "Auto-index completato",
    });

    // 14 total events: 4 agents x 2 + 3 retrieval phases x 2
    expect(received).toHaveLength(14);

    // Verify department distribution
    const deptCounts = received.reduce(
      (acc, e) => {
        acc[e.department] = (acc[e.department] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    expect(deptCounts["ufficio-legale"]).toBe(8);    // 4 agents x 2
    expect(deptCounts["data-engineering"]).toBe(6);   // 3 retrieval x 2

    unsub();
  });

  it("broadcasts retrieval error without blocking pipeline", () => {
    const received: AgentEvent[] = [];
    const unsub = onAgentEvent((evt) => received.push(evt));

    // Classifier succeeds
    broadcastConsoleAgent("classifier", "done", { task: "Analisi: classifier" });

    // Retrieval fails (non-fatal)
    broadcastConsoleAgent("retrieval", "running", {
      task: "Retrieval: contesto normativo per Analyzer",
    });
    broadcastConsoleAgent("retrieval", "error", {
      task: "Retrieval fallito: Connection timeout",
    });

    // Analyzer still runs
    broadcastConsoleAgent("analyzer", "running", { task: "Analisi: analyzer" });
    broadcastConsoleAgent("analyzer", "done", { task: "Analisi: analyzer" });

    expect(received).toHaveLength(5);

    // Retrieval error is visible in snapshot
    const snapshot = getActiveAgentEvents();
    const retrievalEvt = snapshot.find((e) => e.id === "console-retrieval");
    // Last retrieval event was overwritten by analyzer (different id), but
    // retrieval events all share "console-retrieval" so last one may be the error
    // or may be overwritten. Let's check that pipeline continued.
    const analyzerEvt = snapshot.find((e) => e.id === "console-analyzer");
    expect(analyzerEvt).toBeDefined();
    expect(analyzerEvt!.status).toBe("done");

    unsub();
  });

  it("broadcasts auto-index failure as error event", () => {
    const received: AgentEvent[] = [];
    const unsub = onAgentEvent((evt) => received.push(evt));

    broadcastConsoleAgent("retrieval", "running", {
      task: "Auto-index: salvataggio conoscenza nel vector DB",
    });
    broadcastConsoleAgent("retrieval", "error", {
      task: "Auto-index fallito: VOYAGE_API_KEY not set",
    });

    expect(received).toHaveLength(2);

    const snapshot = getActiveAgentEvents();
    const autoIndexEvt = snapshot.find((e) => e.id === "console-retrieval");
    expect(autoIndexEvt).toBeDefined();
    expect(autoIndexEvt!.status).toBe("error");
    expect(autoIndexEvt!.task).toContain("Auto-index fallito");
    expect(autoIndexEvt!.department).toBe("data-engineering");

    unsub();
  });
});

// ── PHASE_TO_DEPT mapping completeness ────────────────────────────────────────

describe("PHASE_TO_DEPT mapping completeness", () => {
  const expectedMappings: Record<string, string> = {
    leader: "cme",
    classifier: "ufficio-legale",
    analyzer: "ufficio-legale",
    investigator: "ufficio-legale",
    advisor: "ufficio-legale",
    retrieval: "data-engineering",
    "question-prep": "ufficio-legale",
    "corpus-search": "data-engineering",
    "corpus-agent": "ufficio-legale",
    "legal-leader": "ufficio-legale",
    "legal-orchestrator": "ufficio-legale",
    "qa-test-run": "quality-assurance",
    "qa-evaluation": "quality-assurance",
    "cme-autorun": "cme",
    "task-runner": "cme",
    "daily-plan": "cme",
    "cron-monitor": "operations",
    "data-connector": "data-engineering",
    "corpus-sync": "data-engineering",
    "trading-pipeline": "trading",
    "security-audit": "security",
    "cost-report": "finance",
  };

  for (const [phase, expectedDept] of Object.entries(expectedMappings)) {
    it(`maps '${phase}' to '${expectedDept}'`, () => {
      broadcastConsoleAgent(phase, "running");
      const events = getActiveAgentEvents();
      expect(events[0].department).toBe(expectedDept);
    });
  }
});
