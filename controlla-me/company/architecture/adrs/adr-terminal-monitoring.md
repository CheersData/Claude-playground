# ADR-005: Terminal/Agent Monitoring Architecture

## Status

Proposed

## Date

2026-03-16

## Context

The /ops dashboard currently shows a flat list of tracked sessions (terminals) via `SessionIndicator` and a separate row of `AgentDots` showing which departments have active agents. There is no parent-child relationship between a terminal process and the sub-agents it spawns. The operator cannot see what task a terminal is working on, how many agents are running inside it, or what each agent is doing. There is no kill capability and no way to read a terminal's output from the browser.

### Requirements from the boss

1. See what each terminal is doing
2. See how many agents work in each terminal
3. See what each agent is doing in each terminal
4. Kill a terminal or individual agent
5. Dialog approach: (B) new sessions from /ops use existing console SSE for full bidirectional communication; (C) existing/external sessions show read-only output only, no input injection

### Existing infrastructure (to be extended, not rebuilt)

| Component | File | Role |
|---|---|---|
| Session registry (Layer 2) | `lib/company/sessions.ts` | `TrackedSession` in-memory Map, file-based registry for cross-process sharing, heartbeat for interactive sessions, prune, orphan discovery via OS process scanning |
| Active sessions (Layer 1) | `lib/company/sessions.ts` | `sessions` Map<sessionId, {child, target}> for multi-turn interactive `claude -p` subprocesses used by `/api/console/company/*` |
| Agent broadcast bus | `lib/agent-broadcast.ts` | `EventEmitter` singleton bus (`globalThis` for HMR stability), `AgentEvent` type, `broadcastAgentEvent()`, `broadcastConsoleAgent()`, `broadcastDeptActivity()`, TTL-based cleanup (60s running, 30s done) |
| Sessions API | `app/api/company/sessions/route.ts` | `GET` unified sessions (in-memory + file + heartbeat + orphans) |
| Sessions heartbeat | `app/api/company/sessions/heartbeat/route.ts` | `POST`/`DELETE` heartbeat for interactive Claude Code sessions |
| Agents live SSE | `app/api/company/agents/live/route.ts` | SSE stream forwarding `AgentEvent` from broadcast bus to browser |
| Console SSE | `app/api/console/route.ts` | Main console pipeline: leader + corpus-qa / document-analysis. Calls `broadcastConsoleAgent()` for each agent phase |
| Session badge | `components/console/SessionIndicator.tsx` | Polls `GET /api/company/sessions?orphans=true` every 5s, opens `SessionDetailPanel` on click |
| Detail panel | `components/ops/SessionDetailPanel.tsx` | Slide-in panel showing static metadata (PID, type, target, startedAt, status). No agent list, no output, no kill |
| Agent dots | `components/ops/AgentDots.tsx` | One dot per department, pulses on active agent. No per-terminal context |
| Console token auth | `lib/middleware/console-token.ts` | HMAC-SHA256 stateless tokens. `requireConsoleAuth()` validates Bearer header or `?t=` query param for SSE |
| Ops page | `app/ops/OpsPageClient.tsx` | Tab-based layout. Merges SSE agent events + live sessions into `activeAgentsMap`. Already has CME tab embedding `CompanyPanel` |

### Constraints

- Windows compatibility required (boss runs on Windows/MINGW64)
- No new heavy dependencies -- use Node.js built-ins (`child_process`, `EventEmitter`, `fs`)
- Build on existing infrastructure, do not rebuild
- Ship fast -- minimal surface area
- All new API endpoints must be protected with `requireConsoleAuth` + `checkRateLimit`

---

## Decision

### 1. Parent-Child Session Model

#### 1.1 Extended TrackedSession

Add optional fields to `TrackedSession` in `lib/company/sessions.ts`. All new fields are optional to maintain backward compatibility with the file-based registry format used by external scripts (task-runner, daemon).

```typescript
// lib/company/sessions.ts -- extended interface

export interface TrackedSession {
  // --- EXISTING FIELDS (unchanged) ---
  pid: number;
  type: SessionType;            // "console" | "task-runner" | "daemon" | "interactive"
  target: string;               // e.g. "cme", "ufficio-legale", "task-runner"
  taskId?: string;
  startedAt: Date;
  status: "active" | "closing";

  // --- NEW FIELDS ---

  /** Human-readable description of what this terminal is currently doing.
   *  Updated by the spawner at launch time and via broadcastAgentEvent().
   *  Example: "Analyzing contratto_affitto.pdf" */
  currentTask?: string;

  /** Department this terminal belongs to.
   *  Explicit for daemon/task-runner where target may be a script name.
   *  Example: "cme", "ufficio-legale" */
  department?: string;

  /** PID of the parent terminal that spawned this process.
   *  Used to build the terminal -> sub-agent tree.
   *  Absent for top-level terminals (e.g. the interactive Claude Code session). */
  parentPid?: number;

  /** sessionId from Layer 1 (the `sessions` Map).
   *  Bridges Layer 1 (ChildProcess handle) and Layer 2 (TrackedSession).
   *  Present for sessions started via /api/console/company. */
  sessionId?: string;
}
```

#### 1.2 Extended AgentEvent

Add `parentPid` and `sessionId` to `AgentEvent` in `lib/agent-broadcast.ts`. Both optional. This is the key link that allows grouping agent events under their parent terminal.

```typescript
// lib/agent-broadcast.ts -- extended interface

export interface AgentEvent {
  // --- EXISTING FIELDS (unchanged) ---
  /** Unique key for dedup (e.g. "console-classifier", "company-cme") */
  id: string;
  /** Department or agent phase name */
  department: string;
  /** Optional human-readable description */
  task?: string;
  /** Current status */
  status: "running" | "done" | "error";
  /** Epoch ms */
  timestamp: number;

  // --- NEW FIELDS ---

  /** PID of the terminal/session that owns this agent.
   *  Allows the UI to group agent events under their parent terminal.
   *  Set by the spawner (e.g. company route after child.pid is known). */
  parentPid?: number;

  /** sessionId (Layer 1) of the owning terminal session.
   *  Used when the terminal is managed by the sessions Map. */
  sessionId?: string;
}
```

#### 1.3 Extended TrackedSessionDTO

The API response DTO adds the new fields plus a synthesized `agents` array assembled at response time:

```typescript
// lib/company/sessions.ts -- extended DTO

export interface AgentDTO {
  /** AgentEvent.id */
  id: string;
  /** Department this agent belongs to */
  department: string;
  /** Human-readable task description */
  task?: string;
  /** Current status */
  status: "running" | "done" | "error";
  /** Epoch ms of last update */
  timestamp: number;
}

export interface TrackedSessionDTO {
  // --- EXISTING FIELDS (unchanged) ---
  pid: number;
  type: SessionType;
  target: string;
  taskId?: string;
  startedAt: string;           // ISO 8601
  status: "active" | "closing";

  // --- NEW FIELDS ---
  currentTask?: string;
  department?: string;
  parentPid?: number;
  sessionId?: string;

  /** Active agents whose parentPid matches this session's pid.
   *  Synthesized at response time from getActiveAgentEvents(). */
  agents: AgentDTO[];

  /** Count of agents (convenience field = agents.length) */
  agentCount: number;
}
```

The `agents` array is assembled in `GET /api/company/sessions` by calling `getActiveAgentEvents()` and filtering by `parentPid === session.pid` or `sessionId === session.sessionId`.

#### 1.4 Tree structure example

```
Terminal (PID 12345, type="console", target="cme", sessionId="cc-abc")
  |
  +-- Agent: "console-leader"     (department="cme", status="done", parentPid=12345)
  +-- Agent: "console-classifier" (department="ufficio-legale", status="running", parentPid=12345)
  +-- Agent: "console-analyzer"   (department="ufficio-legale", status="pending", parentPid=12345)

Terminal (PID 67890, type="interactive", target="interactive")
  |
  (no agents -- output not captured for interactive sessions)
```

---

### 2. Event Protocol

#### 2.1 What each terminal broadcasts

When a session is created (via `/api/console/company` or registered by task-runner/daemon), it announces itself:

| Event | Source | Trigger | Fields |
|---|---|---|---|
| Session registered | `registerSession()` | Session spawn | pid, type, target, department, currentTask, sessionId |
| Session closing | `markSessionClosing()` | Graceful shutdown / kill | pid, status="closing" |
| Session removed | `unregisterSession()` | Process exited | pid |

These are not SSE events but state changes in the in-memory Map, reflected in the `GET /api/company/sessions` polling response.

#### 2.2 What each agent broadcasts

Every agent phase broadcasts via `broadcastAgentEvent()` through the existing `EventEmitter` bus. The new `parentPid` and `sessionId` fields link agent events to their parent terminal.

| Event field | Type | Description |
|---|---|---|
| id | string | Unique dedup key. Format: `console-{phase}` for console pipeline, `company-{target}` for company chat, `dept-{dept}-{timestamp}` for dept activity |
| department | string | Department key from `PHASE_TO_DEPT` mapping |
| task | string | Human-readable description, e.g. "Route: corpus-qa", "Confidence: 85%" |
| status | "running" / "done" / "error" | Current agent status |
| timestamp | number | Epoch ms |
| parentPid | number (new) | PID of the owning terminal |
| sessionId | string (new) | Layer 1 sessionId of the owning terminal |

The SSE endpoint `/api/company/agents/live` forwards all fields to subscribers. Existing consumers ignore unknown fields (additive change).

#### 2.3 Updated broadcastConsoleAgent signature

```typescript
// lib/agent-broadcast.ts -- updated helper

export function broadcastConsoleAgent(
  phase: string,
  status: "running" | "done" | "error",
  extra?: {
    task?: string;
    parentPid?: number;      // NEW
    sessionId?: string;      // NEW
  }
): void {
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
```

#### 2.4 Console route: attach parentPid at spawn time

In `app/api/console/route.ts`, the `sendAgent` helper must be updated to include the terminal's identity. Since the console route runs the pipeline in-process (not via `claude -p` child process), the "parentPid" is `process.pid` (the Next.js server PID) and the sessionId comes from the console token's `sid`:

```typescript
// In POST /api/console/route.ts, inside sessionTierStore.run():

const terminalPid = process.pid;
const terminalSessionId = sessionCtx.sid;

const sendAgent = (
  phase: ConsoleAgentPhase,
  status: ConsolePhaseStatus,
  extra?: Record<string, unknown>
) => {
  send("agent", { phase, status, ...extra });
  const mappedStatus = status === "skipped" ? "done" : status as "running" | "done" | "error";
  broadcastConsoleAgent(phase, mappedStatus, {
    task: extra?.summary as string ?? phase,
    parentPid: terminalPid,          // NEW
    sessionId: terminalSessionId,    // NEW
  });
};
```

For the company route (`/api/console/company/route.ts`) which spawns `claude -p` child processes, `parentPid` is `child.pid` and `sessionId` is the Layer 1 session key.

---

### 3. In-Memory Ring Buffer for Terminal Output

#### 3.1 Design

Each tracked console session (type `"console"`) gets a fixed-size circular ring buffer for stdout/stderr capture. Stored in a separate in-memory Map alongside the session registry.

```typescript
// lib/company/sessions.ts -- additions

const OUTPUT_RING_SIZE = 500;   // max lines per session

interface OutputLine {
  /** Raw text content */
  text: string;
  /** "stdout" or "stderr" */
  stream: "stdout" | "stderr";
  /** Epoch ms when captured */
  timestamp: number;
}

interface OutputRing {
  /** Circular buffer of lines */
  lines: OutputLine[];
  /** Index of next write position (wraps around) */
  head: number;
  /** Total lines ever written -- monotonic counter for cursor-based streaming */
  total: number;
}

/** Ring buffers keyed by PID. Created on registerSession(), cleared on unregisterSession(). */
const outputRings = new Map<number, OutputRing>();

/**
 * Append a line to the ring buffer for a session.
 * Also emits on outputBus for live SSE subscribers.
 * No-op if no ring exists for this PID.
 */
export function appendOutputLine(pid: number, text: string, stream: "stdout" | "stderr" = "stdout"): void {
  const ring = outputRings.get(pid);
  if (!ring) return;

  const line: OutputLine = { text, stream, timestamp: Date.now() };

  if (ring.lines.length < OUTPUT_RING_SIZE) {
    ring.lines.push(line);
  } else {
    ring.lines[ring.head] = line;
  }
  ring.head = (ring.head + 1) % OUTPUT_RING_SIZE;
  ring.total++;

  // Fan out to live SSE subscribers
  outputBus.emit(`output:${pid}`, {
    line: text,
    index: ring.total - 1,
    stream,
    timestamp: line.timestamp,
  });
}

/**
 * Read lines from the ring buffer.
 * If sinceIndex is provided, returns only lines written after that index.
 * Returns lines in chronological order plus the next cursor index.
 */
export function getOutputLines(pid: number, sinceIndex?: number): {
  lines: OutputLine[];
  nextIndex: number;
} {
  const ring = outputRings.get(pid);
  if (!ring) return { lines: [], nextIndex: 0 };

  // Reconstruct chronological order from circular buffer
  const ordered: OutputLine[] = [];
  const count = Math.min(ring.lines.length, OUTPUT_RING_SIZE);
  const startIdx = ring.lines.length < OUTPUT_RING_SIZE ? 0 : ring.head;

  for (let i = 0; i < count; i++) {
    const idx = (startIdx + i) % count;
    const globalIdx = ring.total - count + i;
    if (sinceIndex !== undefined && globalIdx <= sinceIndex) continue;
    ordered.push(ring.lines[idx]);
  }

  return { lines: ordered, nextIndex: ring.total };
}

/**
 * Clear ring buffer for a session. Called on unregisterSession().
 */
export function clearOutputRing(pid: number): void {
  outputRings.delete(pid);
}

/**
 * Initialize ring buffer for a session. Called on registerSession().
 */
export function createOutputRing(pid: number): void {
  outputRings.set(pid, { lines: [], head: 0, total: 0 });
}
```

#### 3.2 SSE fan-out via outputBus

A second `EventEmitter` instance (separate from the agent broadcast bus) for per-PID output streaming:

```typescript
// lib/company/sessions.ts -- addition

import { EventEmitter } from "events";

const globalForOutput = globalThis as unknown as {
  __outputBus?: EventEmitter;
};
if (!globalForOutput.__outputBus) {
  globalForOutput.__outputBus = new EventEmitter();
  globalForOutput.__outputBus.setMaxListeners(50);
}
const outputBus = globalForOutput.__outputBus;

export interface OutputEvent {
  line: string;
  index: number;
  stream: "stdout" | "stderr";
  timestamp: number;
}

/**
 * Subscribe to live output lines for a specific PID.
 * Returns unsubscribe function.
 */
export function onOutputLine(pid: number, cb: (ev: OutputEvent) => void): () => void {
  const event = `output:${pid}`;
  outputBus.on(event, cb);
  return () => outputBus.off(event, cb);
}
```

#### 3.3 Memory budget

500 lines x ~120 bytes avg = ~60KB per active session. With 5 concurrent sessions = ~300KB. Negligible.

#### 3.4 Capture point

Output is captured inside the existing `child.stdout.on("data")` and `child.stderr.on("data")` handlers in `app/api/console/company/route.ts`. For the main console route (`app/api/console/route.ts`), agent phase outputs are captured via the existing `sendAgent` helper.

#### 3.5 What is NOT captured

Sessions of type `"interactive"` (boss's Claude Code terminal), `"task-runner"`, `"daemon"`, and orphan-discovered processes were NOT spawned by the Next.js server. Their stdout/stderr pipes are not accessible. The output SSE endpoint returns a `no-capture` event for these session types.

---

### 4. Kill Propagation

#### 4.1 Kill a terminal (hard kill)

When the kill endpoint receives a request with no `agentId` body:

1. Look up the session by PID in the unified registry.
2. **If found in Layer 1** (the `sessions` Map with a `ChildProcess` handle): call `child.kill("SIGTERM")`. This is the cleanest path -- closes stdin/stdout/stderr properly and triggers the existing `child.on("close")` cleanup handler.
3. **If found in Layer 2 only** (file-based, orphan, or interactive):
   - **Windows**: `execSync("taskkill /F /T /PID " + pid, { windowsHide: true })` -- the `/T` flag kills the entire process tree (terminal + its child agents).
   - **Unix**: `process.kill(pid, "SIGTERM")`
4. Mark the session as `"closing"` via `markSessionClosing(pid)`.
5. The existing `child.on("close")` handler in the company route will: `deleteSession(sessionId)`, `unregisterSession(pid)`, `clearOutputRing(pid)`, and broadcast `status: "done"` for all related agents.
6. The output SSE endpoint sends `event: closed` and terminates.

#### 4.2 Kill a single agent (soft kill)

An "agent" in the current architecture is not a separate OS process. It is a logical phase running inside either the Next.js server process (console route) or a `claude -p` subprocess (company route). There is no PID to SIGTERM.

Soft kill approach via `AbortController`:

```typescript
// lib/agent-broadcast.ts -- additions

/** Per-agent AbortController registry.
 *  Keyed by agentId (e.g. "console-classifier").
 *  Created when an agent starts running, removed when it completes or is aborted. */
const agentAbortControllers = new Map<string, AbortController>();

/**
 * Register an AbortController for an agent.
 * Called at the start of an agent phase.
 */
export function registerAgentAbort(agentId: string): AbortController {
  // Abort any existing controller for this agent (stale from a previous run)
  const existing = agentAbortControllers.get(agentId);
  if (existing) existing.abort();

  const controller = new AbortController();
  agentAbortControllers.set(agentId, controller);
  return controller;
}

/**
 * Abort a specific agent by ID.
 * Returns true if the agent was found and aborted.
 */
export function abortAgent(agentId: string): boolean {
  const controller = agentAbortControllers.get(agentId);
  if (!controller) return false;
  controller.abort();
  agentAbortControllers.delete(agentId);
  return true;
}

/**
 * Clean up an agent's abort controller (called when agent completes normally).
 */
export function cleanupAgentAbort(agentId: string): void {
  agentAbortControllers.delete(agentId);
}
```

Kill flow for a single agent:

1. The kill endpoint receives `{ agentId: "console-classifier" }`.
2. Call `abortAgent(agentId)` -- triggers the `AbortController.signal`.
3. Call `broadcastAgentEvent({ id: agentId, status: "error", task: "Killed by operator" })` -- updates all SSE subscribers.
4. The running agent checks `signal.aborted` at its next checkpoint (between LLM calls, between pipeline phases). If aborted, it throws and the pipeline handler catches and continues.
5. If the agent does not respond within 5 seconds (e.g. blocked on an LLM call with no signal check), the operator can escalate to killing the entire terminal.

**Rationale for not implementing hard sub-agent kill**: The current pipeline runs agent phases sequentially inside the server process. Hard-killing individual agents would require restructuring into worker threads or separate processes. This is out of scope -- agent phases take 5-30 seconds, so terminal kill is a practical fallback.

#### 4.3 Kill cascade diagram

```
Operator clicks "Kill Terminal" (PID 12345)
  --> POST /api/company/sessions/12345/kill  (no agentId body)
  --> If Layer 1 (ChildProcess): child.kill("SIGTERM")
  --> If Layer 2 only:
      Windows: taskkill /F /T /PID 12345
      Unix:    process.kill(12345, "SIGTERM")
  --> markSessionClosing(12345)
  --> child.on("close") fires existing cleanup:
      deleteSession(sessionId)
      unregisterSession(12345)
      clearOutputRing(12345)
      broadcastAgentEvent({ status: "done" }) for all child agents
  --> Output SSE sends event:closed, terminates

Operator clicks "Kill Agent" (agentId: "console-classifier")
  --> POST /api/company/sessions/12345/kill  { agentId: "console-classifier" }
  --> abortAgent("console-classifier")  -- triggers AbortController.signal
  --> broadcastAgentEvent({ id: "console-classifier", status: "error", task: "Killed by operator" })
  --> Agent checks signal at next checkpoint --> throws --> pipeline catches, continues
  --> If no response in 5s --> operator escalates to terminal kill
```

---

### 5. API Endpoints

#### 5.1 GET /api/company/sessions (extended response)

No breaking changes. Adds `agents`, `agentCount` per session and `totalAgents` at top level.

```
GET /api/company/sessions?orphans=true
Authorization: Bearer <token>

Response 200:
{
  "count": 2,
  "activeCount": 2,
  "closingCount": 0,
  "total": 2,
  "orphanCount": 0,
  "totalAgents": 3,                          // NEW
  "sessions": [
    {
      "pid": 12345,
      "type": "console",
      "target": "cme",
      "startedAt": "2026-03-16T10:00:00Z",
      "status": "active",
      "currentTask": "Corpus Q&A: diritto di recesso",  // NEW
      "department": "cme",                               // NEW
      "sessionId": "cc-1710583200000-abc",               // NEW
      "agents": [                                        // NEW
        {
          "id": "console-leader",
          "department": "cme",
          "task": "Route: corpus-qa",
          "status": "done",
          "timestamp": 1710583200000
        },
        {
          "id": "console-question-prep",
          "department": "ufficio-legale",
          "task": "Domanda riformulata",
          "status": "running",
          "timestamp": 1710583203000
        }
      ],
      "agentCount": 2                                    // NEW
    },
    {
      "pid": 67890,
      "type": "interactive",
      "target": "interactive",
      "startedAt": "2026-03-16T09:30:00Z",
      "status": "active",
      "agents": [],
      "agentCount": 0
    }
  ]
}
```

Implementation: in `GET /api/company/sessions/route.ts`, after building the sessions array, call `getActiveAgentEvents()` and partition by `parentPid`:

```typescript
import { getActiveAgentEvents } from "@/lib/agent-broadcast";

// Inside GET handler, after getUnifiedSessions():
const agentEvents = getActiveAgentEvents();
const agentsByPid = new Map<number, AgentDTO[]>();
for (const evt of agentEvents) {
  if (evt.parentPid) {
    const list = agentsByPid.get(evt.parentPid) ?? [];
    list.push({
      id: evt.id,
      department: evt.department,
      task: evt.task,
      status: evt.status,
      timestamp: evt.timestamp,
    });
    agentsByPid.set(evt.parentPid, list);
  }
}

// Build DTO with agents:
const sessionDTOs = sessions.map((s) => {
  const agents = agentsByPid.get(s.pid) ?? [];
  return {
    ...toDTO(s),
    agents,
    agentCount: agents.length,
  };
});

const totalAgents = sessionDTOs.reduce((sum, s) => sum + s.agentCount, 0);
```

#### 5.2 POST /api/company/sessions/[pid]/kill

New endpoint. File: `app/api/company/sessions/[pid]/kill/route.ts`

```
POST /api/company/sessions/12345/kill
Authorization: Bearer <token>
X-CSRF-Token: <token>
Content-Type: application/json

Body (optional):
{
  "agentId": "console-classifier"   // if present: soft-kill agent only
                                     // if absent: hard-kill entire terminal
}

Response 200 (terminal kill):
{
  "ok": true,
  "pid": 12345,
  "method": "sigterm" | "taskkill",
  "message": "SIGTERM sent to PID 12345"
}

Response 200 (agent kill):
{
  "ok": true,
  "pid": 12345,
  "agentId": "console-classifier",
  "method": "soft-stop",
  "message": "Abort signal sent to console-classifier"
}

Response 404:
{ "error": "Session not found: PID 12345" }

Response 500:
{ "error": "Kill failed: <OS error>" }
```

Implementation skeleton:

```typescript
// app/api/company/sessions/[pid]/kill/route.ts

import { NextRequest } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { execSync } from "child_process";
import {
  getSession,
  getUnifiedSessions,
  markSessionClosing,
} from "@/lib/company/sessions";
import { abortAgent, broadcastAgentEvent } from "@/lib/agent-broadcast";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pid: string }> }
) {
  const csrf = checkCsrf(req);
  if (csrf) return csrf;

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const auth = requireConsoleAuth(req);
  if (!auth) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pid: pidStr } = await params;
  const pid = parseInt(pidStr, 10);
  if (isNaN(pid)) {
    return Response.json({ error: "Invalid PID" }, { status: 400 });
  }

  // Parse optional agentId from body
  let agentId: string | undefined;
  try {
    const body = await req.json();
    agentId = body?.agentId;
  } catch { /* no body or invalid JSON -- terminal kill */ }

  // Verify session exists
  const { sessions } = getUnifiedSessions({ includeOrphans: true });
  const session = sessions.find((s) => s.pid === pid);
  if (!session) {
    return Response.json(
      { error: `Session not found: PID ${pid}` },
      { status: 404 }
    );
  }

  // Agent soft-kill
  if (agentId) {
    const aborted = abortAgent(agentId);
    broadcastAgentEvent({
      id: agentId,
      department: "operations",
      task: "Killed by operator",
      status: "error",
      parentPid: pid,
    });
    return Response.json({
      ok: true,
      pid,
      agentId,
      method: "soft-stop",
      message: aborted
        ? `Abort signal sent to ${agentId}`
        : `Agent ${agentId} not found in abort registry (may have already completed)`,
    });
  }

  // Terminal hard-kill
  try {
    // Try Layer 1 first (ChildProcess handle -- cleanest)
    let killed = false;
    // Layer 1 sessions are keyed by sessionId, not PID.
    // Iterate to find matching child.
    if (session.sessionId) {
      const activeSession = getSession(session.sessionId);
      if (activeSession?.child?.pid === pid) {
        activeSession.child.kill("SIGTERM");
        killed = true;
      }
    }

    if (!killed) {
      // Layer 2 fallback: OS kill
      if (process.platform === "win32") {
        execSync(`taskkill /F /T /PID ${pid}`, {
          windowsHide: true,
          timeout: 5000,
        });
      } else {
        process.kill(pid, "SIGTERM");
      }
    }

    markSessionClosing(pid);

    return Response.json({
      ok: true,
      pid,
      method: killed ? "sigterm" : process.platform === "win32" ? "taskkill" : "sigterm",
      message: `Kill signal sent to PID ${pid}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `Kill failed: ${msg}` }, { status: 500 });
  }
}
```

#### 5.3 GET /api/company/sessions/[pid]/output (SSE, read-only)

New SSE endpoint. File: `app/api/company/sessions/[pid]/output/route.ts`

Sends buffered output lines from the ring buffer, then streams new lines as they arrive via the `outputBus`.

```
GET /api/company/sessions/12345/output?t=<token>
Accept: text/event-stream

-- Initial burst (ring buffer replay):
event: replay
data: { "lines": [{ "text": "...", "stream": "stdout", "timestamp": 1710583200000 }, ...], "nextIndex": 47 }

-- Live lines as they arrive:
event: line
data: { "line": "new output text", "index": 48, "stream": "stdout", "timestamp": 1710583205000 }

-- Heartbeat every 15s:
: heartbeat

-- Terminal died:
event: closed
data: { "pid": 12345, "exitCode": 0 }

-- No output capture for this session type:
event: no-capture
data: { "reason": "Output capture only available for console sessions launched from /ops" }
```

Implementation: subscribe to `onOutputLine(pid, callback)` and forward to SSE stream. On session close, send `event: closed`.

#### 5.4 SSE agents/live event extension

The `agent` event emitted by `GET /api/company/agents/live` gains two optional fields. No change to existing consumers -- both fields are optional and additive:

```
event: agent
data: {
  "id": "console-classifier",
  "department": "ufficio-legale",
  "task": "Analisi clausole",
  "status": "running",
  "timestamp": 1710583200000,
  "parentPid": 12345,            // NEW -- links to terminal
  "sessionId": "cc-abc123"       // NEW -- links to Layer 1 session
}
```

---

### 6. Dialog Approach: B + C

#### 6.1 Approach B: New sessions from /ops (full bidirectional)

`POST /api/console/company` already implements full bidirectional communication:
- Spawns `claude -p --input-format stream-json --output-format stream-json`
- Returns SSE stream to the caller
- Assigns a `sessionId` and emits it via `event: session`
- Keeps stdin open for follow-up messages via `POST /api/console/company/message`

`CompanyPanel` is already embedded in `OpsPageClient` under the CME tab. Sessions started there get registered in Layer 1 + Layer 2, captured by the ring buffer, and are killable.

For the new Terminal Monitor tab, the launcher UI:
1. Operator picks a target (department dropdown) and an optional initial message
2. Frontend calls `POST /api/console/company` with the chosen target -- same as CompanyPanel
3. The returned SSE stream feeds a compact inline terminal view
4. The spawned session is immediately visible in the sessions list with `agentCount`, `currentTask`, and output capture

**No new API endpoints needed** for approach B. The frontend calls the existing endpoint and renders inline.

#### 6.2 Approach C: Existing sessions (read-only output)

For sessions NOT spawned by /ops (interactive, daemon, task-runner, orphans):
- Output capture is not available (their stdout/stderr is not piped through the Next.js server)
- The output SSE endpoint returns `event: no-capture` with a human-readable reason
- The UI shows session metadata (PID, type, target, duration, status) and kill button
- Agent events ARE visible if the session broadcasts via `broadcastAgentEvent()` (e.g. console sessions started from `/console`)

The UI clearly distinguishes between:
- **Green indicator**: Full I/O session (approach B) -- output stream + input + kill
- **Amber indicator**: Read-only session (approach C) -- metadata + agents + kill, no output
- **Gray indicator**: Orphan process -- metadata + kill only

---

### 7. Data Model: In-Memory vs Supabase

| Data | Storage | Rationale |
|---|---|---|
| TrackedSession registry | In-memory Map + file for cross-process | Sessions are ephemeral. No value in persisting across server restarts. |
| AgentEvent active map | In-memory Map (globalThis) | Events have 30-60s TTL. Persistence would add latency for zero benefit. |
| Output ring buffer | In-memory Map | Output is for live debugging. 500 lines per session, cleared on session end. |
| outputBus EventEmitter | In-memory (globalThis) | Fan-out to SSE subscribers. No persistence needed. |
| AbortController map | In-memory Map | Per-agent cancellation signals. Ephemeral by nature. |
| Kill audit log | **Supabase** (optional, future) | For accountability. Out of scope for this iteration -- console logs suffice. |

**Decision: All in-memory.** The monitoring system is a live operational tool, not an audit system. Server restarts clear state, which is acceptable -- sessions would also be dead after a restart.

---

### 8. Security

All new endpoints are protected with the existing security middleware stack:

| Endpoint | Auth | CSRF | Rate Limit |
|---|---|---|---|
| `GET /api/company/sessions` (extended) | `requireConsoleAuth` | N/A (GET) | 30/min |
| `POST /api/company/sessions/[pid]/kill` | `requireConsoleAuth` | `checkCsrf` | 5/min (destructive) |
| `GET /api/company/sessions/[pid]/output` | `requireConsoleAuth` (via `?t=` query param for SSE) | N/A (GET) | 10/min |

Kill operations are logged to server console with operator identity from the token payload:

```
[KILL] Operator: Mario Rossi (sid: abc123) killed PID 12345 (type: console, target: cme)
[KILL] Operator: Mario Rossi (sid: abc123) soft-stopped agent console-classifier in PID 12345
```

Only console-authenticated operators can view sessions, read output, or kill processes. The existing token expiry (24h) and HMAC-SHA256 signature ensure no unauthorized access.

---

### 9. UI Component Structure for /ops

#### 9.1 New/modified components

```
components/ops/
  SessionDetailPanel.tsx    -- MODIFIED: add agents list, kill buttons, output viewer
  TerminalOutputPanel.tsx   -- NEW: renders ring buffer replay + live SSE lines
  AgentDots.tsx             -- MODIFIED (minor): accept optional parentPid filter

app/ops/
  OpsPageClient.tsx         -- MODIFIED: add "Terminali" tab
```

#### 9.2 SessionDetailPanel enhancements

The existing panel shows static metadata. Enhanced version adds:

```
+------------------------------------------+
| [X]  Sessione: console-12345             |
+------------------------------------------+
| Stato:        [*] Attiva                 |
| Tipo:         [Console]                  |
| Dipartimento: CME                        |
| Task:         Corpus Q&A: recesso        |
| PID:          12345                      |
| Avviata:      2m fa (10:34:12)           |
+------------------------------------------+
|                                          |
| AGENTI (2)                               |  <-- NEW section
| +--------------------------------------+ |
| | [*] leader       cme      done  1.2s | |
| | [*] question-prep legale  running    | |  <-- click to expand details
| | [ ] classifier   legale   pending    | |
| +--------------------------------------+ |
|                                          |
| OUTPUT                                   |  <-- NEW section (TerminalOutputPanel)
| +--------------------------------------+ |
| | [STDOUT] {"type":"content_block_..." | |
| | [STDOUT] {"type":"message_delta"..." | |
| | [STDERR] [warn] Rate limit close     | |
| +--------------------------------------+ |
|                                          |
+------------------------------------------+
| [Kill Terminal]  [Kill Selected Agent]   |  <-- NEW kill buttons
+------------------------------------------+
```

#### 9.3 TerminalOutputPanel (new component)

```typescript
// components/ops/TerminalOutputPanel.tsx

interface TerminalOutputPanelProps {
  /** PID of the session to stream output from */
  pid: number;
  /** Session type -- determines if output capture is available */
  sessionType: "console" | "task-runner" | "daemon" | "interactive";
  /** Max height before scrolling */
  maxHeight?: string;
}
```

Behavior:
1. On mount, connects to `GET /api/company/sessions/{pid}/output` SSE
2. Receives `event: replay` with buffered lines, renders them
3. Receives `event: line` for live output, appends to view
4. Auto-scrolls to bottom (with "scroll lock" toggle if user scrolls up)
5. If `event: no-capture`, shows informational message
6. On session close (`event: closed`), shows "Session terminated" banner
7. Strips ANSI escape codes for clean display
8. Color-codes stderr lines (red tint)

#### 9.4 "Terminali" tab in OpsPageClient

New tab in the `TABS` array:

```typescript
{ id: "terminals", label: "Terminali", icon: Monitor }
```

Layout:
```
+------------------------------------------------------------+
| TERMINALI                                                    |
+------------------------------------------------------------+
|                                                              |
| +------------------+  +------------------+  +-----------+   |
| | console-12345    |  | interactive-678  |  | [+ Nuovo] |   |
| | CME              |  | Boss Terminal    |  |           |   |
| | 2 agenti         |  | 0 agenti        |  |           |   |
| | [*] running      |  | [*] active      |  |           |   |
| +------------------+  +------------------+  +-----------+   |
|                                                              |
| Clicca su una sessione per dettagli, output e kill.          |
+------------------------------------------------------------+
```

The "[+ Nuovo]" card opens a launcher dropdown (target selector + optional message) that calls `POST /api/console/company`.

---

### 10. Implementation Plan

| Step | Files | Change | Size | Dependencies |
|---|---|---|---|---|
| 1 | `lib/company/sessions.ts` | Add `currentTask`, `department`, `parentPid`, `sessionId` to `TrackedSession` + DTO. Add `OutputRing`, `appendOutputLine`, `getOutputLines`, `clearOutputRing`, `createOutputRing`, `onOutputLine`, `outputBus`. | S | None |
| 2 | `lib/agent-broadcast.ts` | Add `parentPid`, `sessionId` to `AgentEvent`. Update `broadcastConsoleAgent` extra param. Add `AbortController` map: `registerAgentAbort`, `abortAgent`, `cleanupAgentAbort`. | S | None |
| 3 | `app/api/console/route.ts` | Pass `parentPid` (process.pid) and `sessionId` (token sid) to `broadcastConsoleAgent` calls via `sendAgent`. | XS | Step 2 |
| 4 | `app/api/console/company/route.ts` | After spawn: set `currentTask`, `department`, `sessionId` on registered TrackedSession. Tee stdout/stderr into ring buffer via `appendOutputLine`. Pass `parentPid` (child.pid) + `sessionId` to `broadcastAgentEvent` calls. | S | Steps 1, 2 |
| 5 | `app/api/company/sessions/route.ts` | Extend GET: join `getActiveAgentEvents()` with sessions by parentPid. Build `agents` array, `agentCount`, `totalAgents`. | S | Steps 1, 2 |
| 6 | `app/api/company/sessions/[pid]/kill/route.ts` | **New file**. Hard kill (terminal via ChildProcess or OS) + soft kill (agent via AbortController + broadcast). Auth + CSRF + rate limit. | S | Steps 1, 2 |
| 7 | `app/api/company/sessions/[pid]/output/route.ts` | **New file**. SSE endpoint: replay ring buffer, subscribe to `onOutputLine`, heartbeat, `closed` event. Auth via `?t=` query param. | S | Step 1 |
| 8 | `components/ops/SessionDetailPanel.tsx` | Add agents list section (from session DTO). Add kill buttons (terminal + per-agent). Add embedded `TerminalOutputPanel`. | M | Steps 5, 6, 7, 9 |
| 9 | `components/ops/TerminalOutputPanel.tsx` | **New component**. SSE client for `/output` endpoint. Ring buffer replay, live lines, auto-scroll, ANSI strip, no-capture fallback. | M | Step 7 |
| 10 | `components/ops/AgentDots.tsx` | Minor: accept optional `parentPid` prop to filter dots for a specific terminal (used in SessionDetailPanel). | XS | Step 2 |
| 11 | `app/ops/OpsPageClient.tsx` | Add "Terminali" tab with session cards, launcher button, click-to-detail. | M | Steps 5, 8 |

**Total**: 5 backend changes (3 modifications + 2 new files), 4 frontend changes (2 modifications + 1 new component + 1 page modification). No new npm dependencies. No database migrations.

---

## Consequences

### Positive

- **Full parent-child visibility**: each terminal row in /ops shows its active agents, task description, and agent count in a single API call -- no extra round-trips.
- **Kill capability is safe**: terminal kill uses the existing Layer 1 ChildProcess handle when available (cleanest), falls back to OS kill with process tree termination (`/T` flag on Windows). The existing `close` handler runs cleanup in all cases.
- **Output capture is zero-cost when idle**: `appendOutputLine` writes to the ring and emits on `outputBus`; if there are no listeners, the EventEmitter emit is a no-op.
- **Fully backward compatible**: all new fields on `TrackedSession`, `AgentEvent`, and `TrackedSessionDTO` are optional. Existing callers of `broadcastAgentEvent`, `registerSession`, and `GET /api/company/sessions` continue to work without modification.
- **No new npm dependencies**: Node.js `EventEmitter`, `child_process`, `execSync`, `AbortController` -- all built-in.
- **Windows compatible**: kill path uses `taskkill /F /T /PID` on Windows (already detected via `process.platform === "win32"` in `sessions.ts`).
- **Operator identity logged**: kill operations include operator name from console token for accountability.

### Negative / Tradeoffs

- **Output capture limited to console sessions**: interactive sessions (boss's terminal), daemon, and task-runner sessions cannot expose their output -- this is a fundamental OS limitation without an external sidecar. The UI clearly communicates this via the `no-capture` event.
- **Soft agent kill is advisory**: an agent that does not check `AbortController.signal` will not stop. Hard kill of an individual agent phase is not possible because the pipeline runs inside the server process, not in a separate OS process. Terminal kill is the escalation path.
- **Ring buffer is ephemeral**: server restart clears all buffered output. Acceptable -- output visibility is a live debugging tool, not an audit log.
- **EventEmitter per-line emissions**: at high output rate (verbose `claude -p` output), many small events are emitted. Ring size cap (500 lines) prevents unbounded growth. Batching can be added if this becomes a performance concern.

---

## Alternatives Considered

### A. Flat agent events with terminal filter in the UI

Keep the existing flat `AgentEvent` model. Add a `terminalFilter` state to AgentDots to show only agents matching the currently selected terminal. **Rejected**: does not solve requirements 1 (what is the terminal doing) and 2 (how many agents) without an additional data source. The join must happen server-side.

### B. Separate agent registry (new Map alongside activeEvents)

A dedicated `Map<string, AgentEvent[]>` keyed by `parentPid`. **Rejected**: adding `parentPid` to the existing `AgentEvent` is simpler -- the join is done at response time in the sessions route, keeping the broadcast model single-source.

### C. File-based output capture (tee to temp file)

Write stdout/stderr to `company/.terminal-output/<pid>.log`. **Rejected**: requires cleanup cron, adds Windows path complexity, and file I/O is unnecessary when in-memory suffices for live debugging.

### D. Per-agent OS processes (worker threads per pipeline phase)

Would enable hard kill of individual agents. **Rejected**: requires restructuring the entire pipeline, high effort, and agent phases are 5-30 seconds -- terminal kill is a practical fallback.

### E. WebSocket instead of SSE for output streaming

Would allow bidirectional communication (send kill signal over the same channel). **Rejected**: SSE is simpler, already used throughout the system, and kill is handled by a separate REST endpoint.

### F. Supabase-backed session registry

Store sessions in a Supabase table for cross-server visibility. **Rejected**: adds latency (network round-trip) for every session operation. Single-server deployment makes in-memory sufficient. Can be revisited if horizontal scaling becomes a requirement.

---

## References

- `lib/company/sessions.ts` -- session registry (Layer 1 + Layer 2)
- `lib/agent-broadcast.ts` -- agent event bus
- `app/api/console/route.ts` -- console SSE pipeline
- `app/api/console/company/route.ts` -- company chat with `claude -p` subprocess
- `app/api/company/sessions/route.ts` -- sessions REST API
- `app/api/company/agents/live/route.ts` -- agents live SSE endpoint
- `components/console/SessionIndicator.tsx` -- session badge UI
- `components/ops/SessionDetailPanel.tsx` -- session detail panel
- `components/ops/AgentDots.tsx` -- department activity dots
- `app/ops/OpsPageClient.tsx` -- ops dashboard
- `lib/middleware/console-token.ts` -- HMAC-SHA256 auth
