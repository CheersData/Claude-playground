/**
 * Agent Broadcast — In-memory event bus for real-time agent activity.
 *
 * Any server-side code (console route, pipeline, etc.) can call
 * `broadcastAgentEvent()` to signal that an agent is running/done/error.
 *
 * The `/api/company/agents/live` SSE endpoint subscribes to these events
 * and forwards them to the Ops dashboard in real-time.
 *
 * Events auto-expire after TTL_MS to keep memory bounded.
 */

import { EventEmitter } from "events";

/* ── Types ──────────────────────────────────────────────────────────── */

export interface AgentEvent {
  /** Unique key for dedup (e.g. "classifier", "leader", "task-abc") */
  id: string;
  /** Department or agent phase name */
  department: string;
  /** Optional human-readable description */
  task?: string;
  /** Current status */
  status: "running" | "done" | "error";
  /** Epoch ms */
  timestamp: number;

  // ─── ADR-005 new fields ───

  /** PID of the terminal/session that owns this agent.
   *  Allows the UI to group agent events under their parent terminal. */
  parentPid?: number;

  /** sessionId (Layer 1) of the owning terminal session.
   *  Same as parentPid but used when the terminal is managed by the sessions Map. */
  sessionId?: string;
}

/* ── Constants ──────────────────────────────────────────────────────── */

/** How long a "done"/"error" event stays visible before being pruned (ms) */
const TTL_DONE_MS = 30_000;
/** How long a "running" event stays without update before being pruned (ms).
 * Reduced from 120s to 60s — individual pipeline phases take max ~30s.
 * Any "running" event older than 60s is likely stale (missed "done" broadcast). */
const TTL_RUNNING_MS = 60_000;
/** Cleanup interval */
const CLEANUP_INTERVAL_MS = 5_000;

/* ── Singleton state (globalThis for dev HMR stability) ─────────────── */

// In Next.js dev mode, hot reloading re-evaluates modules which creates
// separate EventEmitter instances per route. Using globalThis ensures
// all routes share the same bus and activeEvents map — so broadcasts
// from /api/analyze actually reach the SSE subscriber in /api/company/agents/live.

const globalForBroadcast = globalThis as unknown as {
  __agentBroadcastBus?: EventEmitter;
  __agentActiveEvents?: Map<string, AgentEvent>;
};

if (!globalForBroadcast.__agentBroadcastBus) {
  globalForBroadcast.__agentBroadcastBus = new EventEmitter();
  globalForBroadcast.__agentBroadcastBus.setMaxListeners(50);
}
if (!globalForBroadcast.__agentActiveEvents) {
  globalForBroadcast.__agentActiveEvents = new Map<string, AgentEvent>();
}

const bus = globalForBroadcast.__agentBroadcastBus;

/** Active agent events, keyed by id */
const activeEvents = globalForBroadcast.__agentActiveEvents;

/** Periodic cleanup of expired events */
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, evt] of activeEvents) {
      const ttl = evt.status === "running" ? TTL_RUNNING_MS : TTL_DONE_MS;
      if (now - evt.timestamp > ttl) {
        activeEvents.delete(key);
      }
    }
    // Stop cleanup if nothing to clean
    if (activeEvents.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL_MS);
}

/* ── Public API ─────────────────────────────────────────────────────── */

/**
 * Broadcast an agent event. Call this from any server-side code
 * to signal agent activity to the Ops dashboard.
 */
export function broadcastAgentEvent(event: Omit<AgentEvent, "timestamp">) {
  const full: AgentEvent = { ...event, timestamp: Date.now() };

  // Update or insert
  activeEvents.set(full.id, full);
  ensureCleanup();

  // Log for debugging — visible in Next.js server terminal
  console.log(`[BROADCAST] ${full.department} | ${full.status} | ${full.task ?? full.id}`);

  // Emit to all SSE subscribers
  bus.emit("agent-event", full);
}

/**
 * Subscribe to agent events. Returns unsubscribe function.
 */
export function onAgentEvent(callback: (event: AgentEvent) => void): () => void {
  bus.on("agent-event", callback);
  return () => {
    bus.off("agent-event", callback);
  };
}

/**
 * Get a snapshot of all currently active events (for initial SSE payload).
 */
export function getActiveAgentEvents(): AgentEvent[] {
  const now = Date.now();
  const result: AgentEvent[] = [];
  for (const [key, evt] of activeEvents) {
    const ttl = evt.status === "running" ? TTL_RUNNING_MS : TTL_DONE_MS;
    if (now - evt.timestamp <= ttl) {
      result.push(evt);
    } else {
      activeEvents.delete(key);
    }
  }
  return result;
}

/**
 * Get all active agent events for a specific parentPid.
 * Used by the sessions route to build the agents array per terminal.
 */
export function getAgentsByParentPid(pid: number): AgentEvent[] {
  return getActiveAgentEvents().filter((ev) => ev.parentPid === pid);
}

/* ── AbortController map (ADR-005: soft agent kill) ─────────────────── */

const globalForAbort = globalThis as unknown as {
  __agentAbortControllers?: Map<string, AbortController>;
};

if (!globalForAbort.__agentAbortControllers) {
  globalForAbort.__agentAbortControllers = new Map<string, AbortController>();
}

const abortControllers = globalForAbort.__agentAbortControllers;

/**
 * Register an AbortController for an agent.
 * The agent should check `signal.aborted` periodically.
 * Returns the AbortSignal.
 */
export function registerAgentAbort(agentId: string): AbortSignal {
  const controller = new AbortController();
  abortControllers.set(agentId, controller);
  return controller.signal;
}

/**
 * Soft-kill an agent by aborting its registered AbortController.
 * Also broadcasts an "error" event to update the UI.
 * Returns true if the agent had a controller, false if not registered.
 */
export function abortAgent(agentId: string): boolean {
  const controller = abortControllers.get(agentId);
  if (controller) {
    controller.abort();
    abortControllers.delete(agentId);
    return true;
  }
  return false;
}

/**
 * Unregister an AbortController for an agent (called on normal completion).
 */
export function unregisterAgentAbort(agentId: string): void {
  abortControllers.delete(agentId);
}

/* ── Mapping helpers ────────────────────────────────────────────────── */

/** Map console agent phases to department names for AgentDots */
const PHASE_TO_DEPT: Record<string, string> = {
  // Analysis pipeline (user-facing)
  "analyze-pipeline": "ufficio-legale",
  // Console pipeline (existing)
  leader: "cme",
  classifier: "ufficio-legale",
  analyzer: "ufficio-legale",
  investigator: "ufficio-legale",
  advisor: "ufficio-legale",
  retrieval: "data-engineering",
  "question-prep": "ufficio-legale",
  "corpus-search": "data-engineering",
  "corpus-agent": "ufficio-legale",
  // Legal office Q&A
  "legal-leader": "ufficio-legale",
  "legal-orchestrator": "ufficio-legale",
  // Medical / Studia.me
  "medical-question-prep": "ufficio-legale",
  "medical-corpus-agent": "ufficio-legale",
  // QA & stress testing
  "qa-test-run": "quality-assurance",
  "qa-evaluation": "quality-assurance",
  // CME & company operations
  "cme-autorun": "cme",
  "task-runner": "cme",
  "daily-plan": "cme",
  "cron-monitor": "operations",
  // Data engineering
  "data-connector": "data-engineering",
  "corpus-sync": "data-engineering",
  // Trading
  "trading-pipeline": "trading",
  // Security & Finance
  "security-audit": "security",
  "cost-report": "finance",
};

/**
 * Helper to broadcast a console agent phase event.
 * Maps phase names to departments for AgentDots compatibility.
 * Accepts optional parentPid and sessionId for terminal-agent grouping (ADR-005).
 */
export function broadcastConsoleAgent(
  phase: string,
  status: "running" | "done" | "error",
  extra?: { task?: string; parentPid?: number; sessionId?: string }
) {
  const department = PHASE_TO_DEPT[phase] ?? "operations";
  broadcastAgentEvent({
    id: `console-${phase}`,
    department,
    task: extra?.task ?? phase,
    status,
    parentPid: extra?.parentPid,
    sessionId: extra?.sessionId,
  });
}

/**
 * Broadcast activity for a specific department directly (bypasses PHASE_TO_DEPT).
 * Use this when the caller knows exactly which department is working.
 *
 * @example broadcastDeptActivity("quality-assurance", "running", "Test 3/50: clausole abusive")
 */
export function broadcastDeptActivity(
  department: string,
  status: "running" | "done" | "error",
  task?: string
) {
  broadcastAgentEvent({
    id: `dept-${department}-${Date.now()}`,
    department,
    task: task ?? department,
    status,
  });
}
