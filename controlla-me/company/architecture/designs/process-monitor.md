# Process Monitor — Design Document

> **Task:** #1006 — Real-time observability + systematic per-item kill for all running processes
>
> **Author:** Architecture Department
> **Date:** 2026-03-18
> **Status:** DESIGN (L4 approval needed for implementation)
> **Approval Level:** L4 (Boss + Security) for kill infrastructure; L2 (CME) for read-only monitoring
>
> **Design Principle:** Human decides, system shows. No automatic timeouts, no automatic kills.

---

## 1. Problem Statement

The boss needs a single, real-time view of everything running in the system, with the ability to manually kill any individual item. Three requirements:

1. **Unified view** of all processes: tasks, sub-agents, daemon, trading, data connector syncs.
2. **Manual kill per-item** with confirmation — no automatic timeouts or kills.
3. **Heartbeat** to distinguish "slow but working" from "dead/stuck".

---

## 2. Current State Analysis

### 2A. Inventory of What Exists

The codebase already has a substantial implementation of this feature. The architecture plan at `company/architecture/plans/process-monitor.md` was written and Phases 1-3 were implemented. Here is the audit of what exists:

| Component | File | Status |
|---|---|---|
| Unified aggregator | `lib/company/process-monitor.ts` (536 lines) | **IMPLEMENTED** |
| API endpoint GET + POST kill | `app/api/company/processes/route.ts` (159 lines) | **IMPLEMENTED** |
| Session tracker (2-layer + file + heartbeat) | `lib/company/sessions.ts` (900 lines) | **IMPLEMENTED** |
| Sub-agent tracker (file-based) | `lib/company/sub-agent-tracker.ts` (210 lines) | **IMPLEMENTED** |
| Agent broadcast bus (in-memory EventEmitter) | `lib/agent-broadcast.ts` (276 lines) | **IMPLEMENTED** |
| Task reset function | `lib/company/tasks.ts` `resetTask()` | **IMPLEMENTED** |
| Trading scheduler heartbeat | `trading/src/scheduler.py` `_write_heartbeat()` | **IMPLEMENTED** |
| UI: TerminalPanel (unified process monitor) | `components/console/TerminalPanel.tsx` | **IMPLEMENTED** |
| Session kill route (hard + soft) | `app/api/company/sessions/[pid]/kill/route.ts` | **IMPLEMENTED** |
| Session list route | `app/api/company/sessions/route.ts` | **IMPLEMENTED** |
| Session heartbeat route | `app/api/company/sessions/heartbeat/route.ts` | **IMPLEMENTED** |
| Sub-agent register/kill route | `app/api/company/sub-agents/route.ts` | **IMPLEMENTED** |
| Console SSE with agent broadcast | `app/api/console/route.ts` | **IMPLEMENTED** |

### 2B. Process Types Tracked Today

| Process Type | Tracking Mechanism | Heartbeat | Per-Item Kill | Last Activity |
|---|---|---|---|---|
| Interactive Claude Code session | `.claude/heartbeat.json` (30s freshness) | YES | NO (it is the boss) | Heartbeat timestamp |
| Console `claude -p` sessions | In-memory Layer 1+2, `TrackedSessionDTO` | Output ring buffer activity | YES (SIGTERM/taskkill via PID) | Last output line |
| Sub-agents (Agent tool) | `.claude/sub-agents.json` (file-based) | NO (start/done only) | YES (mark error in file + AbortController) | startedAt only |
| Daemon (`cme-autorun.ts`) | File-based session + lock file | Lock file presence | YES (PID kill + remove lock) | daemon-report.json |
| Task-runner sessions | File-based `company/.active-sessions.json` | NO | YES (PID kill) | Task status in Supabase |
| Company tasks (in_progress) | Supabase `company_tasks` | NO | YES (resetTask to open) | `started_at` field |
| Trading scheduler | `trading/.scheduler-heartbeat.json` | YES (writes every 10s idle loop) | YES (PID kill + clean heartbeat) | `lastHeartbeat` field |
| Trading pipeline runs | None (ephemeral, <5 min) | NO | NO (read-only short-lived) | `lastPipelineRun` in heartbeat |
| Data connector syncs | `connector_sync_log` Supabase table | NO | NO | `completed_at` field |

### 2C. How the Unified Process Monitor Works

The `lib/company/process-monitor.ts` aggregator merges all sources into a single `MonitoredProcess[]`:

```
getUnifiedProcesses()
  |
  +-- sessionsToProcesses()
  |     +-- getUnifiedSessions() from sessions.ts
  |     |     +-- In-memory trackedSessions Map
  |     |     +-- readFileRegistry() from company/.active-sessions.json
  |     |     +-- readHeartbeat() from .claude/heartbeat.json
  |     +-- getActiveAgentEvents() from agent-broadcast.ts
  |     +-- getActiveSubAgents() from sub-agent-tracker.ts
  |     +-- toDTOWithAgents() -- nests agents under their parent session
  |
  +-- standaloneSubAgentsToProcesses()
  |     +-- Sub-agents not attached to any session
  |
  +-- tasksToProcesses()
  |     +-- getOpenTasks({ status: "in_progress" }) from Supabase
  |
  +-- readTradingSchedulerHeartbeat()
        +-- Reads trading/.scheduler-heartbeat.json
```

Each `MonitoredProcess` has:
- `id` (unique across types: `session-{pid}`, `subagent-{id}`, `task-{id}`, `trading-scheduler-{pid}`)
- `type`: session | sub-agent | task | trading-scheduler | trading-pipeline
- `status`: running | done | error | stale
- `killable`: boolean
- `killMethod`: pid | agent | task-reset | trading-stop
- `children`: nested sub-agents under sessions
- `meta`: type-specific additional data

Kill dispatching in `killProcess()` routes to:
- **task**: `resetTask()` -- sets status to open, clears assigned_to
- **sub-agent**: `killSubAgent()` -- marks error in JSON file
- **session**: SIGTERM/taskkill via PID, cleans up Layer 1/2 + ring buffer
- **trading-scheduler**: OS kill via PID + clean up heartbeat file
- **trading-pipeline**: read-only (returns error)

### 2D. UI Implementation

`TerminalPanel.tsx` polls two endpoints:
1. `GET /api/company/sessions?orphans=true` every 15s (sessions + agents + sub-agents)
2. `GET /api/company/processes` every 5s (unified process list including tasks + trading)

It renders:
- **Sessions** section: per-session cards with PID, type badge, department, uptime, expandable agent list, per-session kill button, per-agent kill button
- **Tasks in Progress** section: task cards with seq number, title, department, elapsed time, stale badge (>1h), Reset button
- **Trading Scheduler** section: scheduler card with PID, current job, last pipeline run, next scheduled run, Kill button
- **Kill confirmation dialog**: modal with consequence text, differentiated by variant (red=kill, amber=reset)
- **"Long-running" badge**: on sub-agents >10 min, advisory only (no automatic action)

---

## 3. Gap Analysis

### 3A. What is Missing (Gaps from Requirements)

| # | Gap | Severity | Requirement Violated |
|---|---|---|---|
| G1 | **No heartbeat for sub-agents.** Between start and done, zero signal. A sub-agent running 8 min could be working or dead. The 10-min "long-running" heuristic is the only discriminator. | HIGH | Req #3: heartbeat to distinguish slow from dead |
| G2 | **No data connector sync visibility.** Active `connector_sync_log` entries (status=running) are not shown in the Process Monitor. A sync running for 20 minutes is invisible. | MEDIUM | Req #1: everything running in one place |
| G3 | **Polling latency (5s/15s).** The dual-poll architecture creates a 5-15s delay. Not truly "real-time". Session + orphan discovery polls at 15s, process monitor at 5s. | LOW | Req #1: real-time (soft requirement) |
| G4 | **No elapsed-vs-expected comparison.** The UI shows elapsed time but has no reference for "how long should this take?" making it hard to judge if something is stuck. | LOW | Req #3: distinguish slow from dead |
| G5 | ~~**Daemon heartbeat is lock-file only.**~~ **RESOLVED (2026-03-18):** Daemon now writes `lastHeartbeat` to `cme-daemon-state.json` at key points in each cycle. Additionally, FASE 4.5 zombie reaper (`lib/company/self-preservation.ts`) auto-kills stale processes >30min. | ~~MEDIUM~~ RESOLVED | Req #3: heartbeat |
| G6 | **No crypto pipeline visibility.** The `run_crypto_pipeline()` in `pipeline.py` is tracked by the scheduler heartbeat (`currentJob: "crypto_pipeline"`) but not as a distinct process. | LOW | Req #1: completeness |

### 3B. What Works Well (Keep As-Is)

- Unified `MonitoredProcess` schema covers 90% of use cases.
- Kill infrastructure is complete and audited (operator identity logging, CSRF, rate limit).
- Trading scheduler heartbeat pattern is solid (write every 10s, read on poll).
- Session tracker architecture (2-layer + file + orphan discovery) is proven.
- TerminalPanel UI is polished with kill dialogs, type badges, department colors.

---

## 4. Proposed Design (Gap Closures)

### 4A. G1: Sub-Agent Heartbeat

**Problem:** Sub-agents (Claude Code Agent tool invocations) only report `start` and `done/error`. No intermediate signal.

**Constraint:** Sub-agents are invoked by Claude Code's Agent tool. We do not control the execution loop. The sub-agent tracker (`scripts/track-subagent.ts`) is a CLI that the main Claude Code process calls at the bookends of each sub-agent invocation.

**Proposed solution: Proxy heartbeat via output activity.**

Sub-agents produce tool calls and responses that flow through the Claude Code SDK. While we cannot inject heartbeat writes into the Agent tool itself, we can:

1. **Option A (recommended): Timestamp last file-system write.** When the Process Monitor reads `.claude/sub-agents.json`, it also checks the file's `mtime`. If `mtime` was updated in the last 60s, the sub-agent's host process is alive. This is a coarse heartbeat (file-level, not per-agent) but sufficient to distinguish "Claude Code is still running" from "process crashed."

2. **Option B: Extend track-subagent.ts with a `heartbeat` command.** Add `npx tsx scripts/track-subagent.ts heartbeat <id>` that updates the `lastActivity` field in the JSON. This would need to be called from within the sub-agent's execution context -- which we do not control (it runs inside Claude Code's Agent tool sandbox).

3. **Option C: Monitor parent PID liveness.** Sub-agents run inside the Claude Code process. If that process is alive (checked via `isProcessAlive()`), all its sub-agents are alive. If it is dead, all are dead. Combine with the 10-minute long-running threshold as a UI hint.

**Recommendation: Option A + C combined.** Use the `.claude/sub-agents.json` file mtime as a proxy for "the host process is writing". Use `isProcessAlive()` on the heartbeat PID to confirm the process is actually running. This covers:
- File mtime recent + PID alive = running normally
- File mtime recent + PID dead = just crashed (show error)
- File mtime stale + PID alive = host alive but sub-agents may be done (check status field)
- File mtime stale + PID dead = crashed long ago (show stale/error)

**Schema change in `MonitoredProcess`:**

```typescript
// Add to MonitoredProcess
lastActivity: string;  // ALREADY EXISTS -- populate from file mtime for sub-agents
meta: {
  ...existing,
  hostPidAlive?: boolean;  // NEW: whether the parent Claude Code process is still alive
  fileLastModified?: string;  // NEW: mtime of .claude/sub-agents.json
}
```

**Code changes:**
- `lib/company/process-monitor.ts`: In `standaloneSubAgentsToProcesses()`, read `fs.statSync('.claude/sub-agents.json').mtime` and set `lastActivity` to the later of `startedAt` and `mtime`. Check `isProcessAlive()` on the heartbeat PID and pass result as `meta.hostPidAlive`.
- No changes to `sub-agent-tracker.ts` or `track-subagent.ts`.
- Effort: ~20 lines of code.

### 4B. G2: Data Connector Sync Visibility

**Problem:** Data connector syncs (legislative corpus ingest, integration syncs) are invisible to the Process Monitor.

**Data source:** `connector_sync_log` table in Supabase, with columns `connector_id`, `status` (running/completed/failed), `started_at`, `completed_at`, `records_processed`, `records_total`.

**Proposed solution: Add a `dataConnectorSyncsToProcesses()` function in `process-monitor.ts`.**

```typescript
async function dataConnectorSyncsToProcesses(): Promise<MonitoredProcess[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("connector_sync_log")
    .select("id, connector_id, status, started_at, completed_at, records_processed, records_total")
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(20);

  if (!data || data.length === 0) return [];

  const now = Date.now();
  return data.map((sync) => {
    const startedAtMs = new Date(sync.started_at).getTime();
    const elapsedMs = now - startedAtMs;
    const SYNC_STALE_MS = 30 * 60 * 1000; // 30 min

    return {
      id: `sync-${sync.id}`,
      type: "data-connector-sync" as const,
      label: sync.connector_id,
      department: "data-engineering",
      description: sync.records_total
        ? `${sync.records_processed}/${sync.records_total} records`
        : `Sync in corso`,
      status: elapsedMs > SYNC_STALE_MS ? "stale" : "running",
      startedAt: sync.started_at,
      lastActivity: sync.started_at, // no heartbeat, use start time
      elapsedMs,
      killable: false, // syncs are managed by cron/manual, no kill mechanism yet
      meta: {
        connectorId: sync.connector_id,
        recordsProcessed: sync.records_processed ?? 0,
        recordsTotal: sync.records_total ?? 0,
      },
    };
  });
}
```

**Schema extension:**

Add `"data-connector-sync"` to the `MonitoredProcess.type` union.

**Code changes:**
- `lib/company/process-monitor.ts`: Add `dataConnectorSyncsToProcesses()`, call it in `getUnifiedProcesses()`.
- Extend the `MonitoredProcess.type` union to include `"data-connector-sync"`.
- `components/console/TerminalPanel.tsx`: Add a "Data Connector Syncs" section with sync cards.
- Effort: ~60 lines backend, ~40 lines UI.

**Kill consideration:** Data connector syncs are currently not killable. They run as synchronous functions inside the Next.js API route or cron job. To make them killable, we would need an AbortController pattern similar to agent-broadcast. This is deferred to a future phase.

### 4C. G3: Polling Optimization

**Current state:** Two poll intervals (5s for processes, 15s for sessions).

**Proposed optimization: Merge into a single 5s poll.**

The TerminalPanel already polls `/api/company/processes` at 5s. The separate `/api/company/sessions?orphans=true` poll at 15s is redundant because `getUnifiedProcesses()` already calls `getUnifiedSessions()` internally.

**Change:** Remove the 15s sessions poll from TerminalPanel. Use only the 5s processes poll. The processes endpoint already includes all sessions with their nested agents.

**Why not SSE?** The data sources are heterogeneous (in-memory maps, JSON files, Supabase queries, OS process checks). An SSE stream would require a unifying event bus across all of these. The existing agent-broadcast EventEmitter covers in-process events but not file-based or Supabase sources. The complexity is not justified for a 5s improvement over polling.

**Future option:** If a faster path is needed, add an SSE endpoint that piggybacks on the existing `agent-broadcast` EventEmitter for in-process events, while falling back to polling for file/Supabase sources. This would give sub-second updates for agent state changes while keeping the 5s poll for tasks/trading.

### 4D. G4: Expected Duration Hints

**Problem:** The UI shows elapsed time but no reference for "how long should this take?"

**Proposed solution: Static duration hints per process type.**

Add a `expectedDurationMs` field to `MonitoredProcess.meta`:

| Process Type | Expected Duration | Source |
|---|---|---|
| Sub-agent (explore) | 30-120s | Historical average |
| Sub-agent (plan) | 60-300s | Historical average |
| Console session | Unbounded | User-driven |
| Daemon run | 2-15 min | daemon-state.json `lastDurationMs` |
| Task execution | Varies by type | No baseline yet |
| Trading daily pipeline | 2-5 min | pipeline.py logging |
| Trading intraday pipeline | 10-60s | pipeline.py logging |
| Data connector sync | 1-30 min | sync_log historical |

The UI can show a progress indicator when `elapsedMs / expectedDurationMs > 1.0` ("taking longer than expected").

**Implementation:**
- Add `expectedDurationMs?: number` to `MonitoredProcess.meta`.
- Populate from static tables initially. Later, compute from historical averages.
- In TerminalPanel, show a subtle progress ring or "expected: ~2min" hint next to elapsed time.
- Effort: ~30 lines backend, ~20 lines UI.

### 4E. G5: Daemon Heartbeat

**Problem:** The daemon uses a lock file that is only checked for staleness at 30 minutes.

**Proposed solution: Write daemon heartbeat to `company/cme-daemon-state.json`.**

The daemon already writes to this file (see `writeDaemonState()` in `cme-autorun.ts`). It has a `lastRun` field but only updates it after each complete cycle.

**Change:** Add a `lastHeartbeat` field to `DaemonState` that is written at the start and end of each cycle, and on each significant step (sensor scan, executor run, LLM call).

```typescript
interface DaemonState {
  ...existing,
  lastHeartbeat?: string;  // ISO timestamp, updated frequently during operation
}
```

**Code changes:**
- `scripts/cme-autorun.ts`: Add `writeDaemonState({ lastHeartbeat: new Date().toISOString() })` calls at key points.
- `lib/company/process-monitor.ts`: In `sessionsToProcesses()`, when a session has `type === "daemon"`, read `cme-daemon-state.json` and use `lastHeartbeat` as the `lastActivity` field. Consider stale if `lastHeartbeat` is > 5 min old.
- Effort: ~15 lines in autorun.ts, ~10 lines in process-monitor.ts.

---

## 5. Architecture Overview

### 5A. Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        PROCESS MONITOR ARCHITECTURE                         │
│                                                                            │
│  ┌─ Data Sources ───────────────────────────────────────────────────────┐  │
│  │                                                                       │  │
│  │  [A] In-Memory          [B] File-Based           [C] Supabase        │  │
│  │  ┌──────────────┐       ┌──────────────────┐     ┌───────────────┐  │  │
│  │  │ trackedSess  │       │ .active-sessions │     │ company_tasks │  │  │
│  │  │ Map          │       │ .json            │     │ (in_progress) │  │  │
│  │  ├──────────────┤       ├──────────────────┤     ├───────────────┤  │  │
│  │  │ agentBroad-  │       │ .claude/         │     │ connector_    │  │  │
│  │  │ cast bus     │       │ sub-agents.json  │     │ sync_log      │  │  │
│  │  ├──────────────┤       ├──────────────────┤     │ (running)     │  │  │
│  │  │ Layer 1 Map  │       │ .claude/         │     └───────────────┘  │  │
│  │  │ (ChildProc)  │       │ heartbeat.json   │                        │  │
│  │  └──────────────┘       ├──────────────────┤                        │  │
│  │                          │ trading/.sched-  │                        │  │
│  │                          │ uler-heartbeat   │                        │  │
│  │                          ├──────────────────┤                        │  │
│  │                          │ cme-daemon-      │                        │  │
│  │                          │ state.json       │                        │  │
│  │                          └──────────────────┘                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌─ Aggregator ──────────────────────────────────────────────────────────┐  │
│  │  lib/company/process-monitor.ts                                        │  │
│  │                                                                         │  │
│  │  getUnifiedProcesses()                                                  │  │
│  │    +-- sessionsToProcesses()     # [A]+[B] sessions + agents           │  │
│  │    +-- standaloneSubAgents()     # [B] orphan sub-agents               │  │
│  │    +-- tasksToProcesses()        # [C] Supabase query                  │  │
│  │    +-- readTradingHeartbeat()    # [B] file read                       │  │
│  │    +-- dataConnectorSyncs()     # [C] Supabase query  <-- NEW          │  │
│  │                                                                         │  │
│  │  killProcess(id, type)                                                  │  │
│  │    +-- task:     resetTask()     # Supabase update                     │  │
│  │    +-- agent:    killSubAgent()  # File write + AbortController         │  │
│  │    +-- session:  SIGTERM/taskkill # OS kill                            │  │
│  │    +-- trading:  SIGTERM + clean # OS kill + file cleanup               │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌─ API Layer ───────────────────────────────────────────────────────────┐  │
│  │  GET  /api/company/processes      # MonitoredProcess[] + summary      │  │
│  │  POST /api/company/processes      # { id, action: "kill" }            │  │
│  │                                                                        │  │
│  │  Auth: requireConsoleAuth (HMAC-SHA256 token)                         │  │
│  │  Security: CSRF on POST, rate limit (30/min GET, 5/min POST)          │  │
│  │  Audit: operator identity logged on every kill                         │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│                              ▼                                              │
│  ┌─ UI Layer ────────────────────────────────────────────────────────────┐  │
│  │  components/console/TerminalPanel.tsx                                   │  │
│  │                                                                         │  │
│  │  Polls GET /api/company/processes every 5s                             │  │
│  │  Renders grouped by type: Sessions | Tasks | Trading | Syncs           │  │
│  │  Per-item Kill/Reset button with confirmation dialog                   │  │
│  │  Color coding: green=active, amber=long-running, red=error             │  │
│  │  Long-running badge (sub-agents >10min, tasks >1h) -- advisory only    │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### 5B. Kill Action Matrix

| Process Type | Kill Method | Mechanism | Reversible? | Audit |
|---|---|---|---|---|
| Console session | PID kill | `taskkill /F /T` (Win) or `SIGTERM` (Unix) | NO | Yes (operator name + sid) |
| Sub-agent (in-memory) | AbortController | `abortAgent()` + broadcast error event | NO | Yes |
| Sub-agent (file-tracked) | File marker | `killSubAgent()` sets status=error in JSON | YES (re-run) | Yes |
| Daemon | PID kill + lock cleanup | `taskkill` + `fs.unlinkSync(LOCK_FILE)` | YES (restart daemon) | Yes |
| Company task (stuck) | Task reset | `resetTask()` sets status=open, clears assigned_to | YES | Yes |
| Trading scheduler | PID kill + heartbeat cleanup | `taskkill` + delete heartbeat file | YES (restart scheduler) | Yes |
| Trading pipeline run | Not killable | Short-lived (<5 min), read-only | N/A | N/A |
| Data connector sync | Not killable (future) | No mechanism yet | N/A | N/A |

---

## 6. Database Schema

### 6A. Existing Tables Used (No New Tables Needed)

The Process Monitor does NOT require new database tables. It aggregates from existing sources:

| Table | Used For | Query Pattern |
|---|---|---|
| `company_tasks` | Tasks in `in_progress` status | `SELECT * WHERE status = 'in_progress' LIMIT 50` |
| `connector_sync_log` | Active data connector syncs | `SELECT * WHERE status = 'running' ORDER BY started_at DESC LIMIT 20` |

### 6B. Why No Dedicated Table

A `process_registry` table was considered and rejected because:
1. Most processes are ephemeral (seconds to minutes). Writing to Supabase adds 50-100ms latency per heartbeat.
2. The existing file-based and in-memory tracking is already fast (<1ms reads).
3. Cross-process sharing is handled by `company/.active-sessions.json` and `.claude/sub-agents.json`.
4. The trading scheduler already writes its own heartbeat file.
5. The only Supabase-sourced data (tasks, syncs) already exists in tables.

If the system scales to multiple machines (not on the roadmap), a centralized table would become necessary. For single-localhost architecture, file + in-memory is optimal.

---

## 7. API Endpoints

### 7A. Existing (No Changes)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/company/processes` | GET | Unified process list + summary |
| `/api/company/processes` | POST | Kill a process by id |
| `/api/company/sessions` | GET | Session list (backward compat) |
| `/api/company/sessions/[pid]/kill` | POST | Kill session or agent by PID |
| `/api/company/sessions/heartbeat` | POST | Write interactive session heartbeat |
| `/api/company/sub-agents` | GET/POST/DELETE | Sub-agent CRUD |

### 7B. No New Endpoints Needed

The existing `/api/company/processes` endpoint is sufficient. The gap closures (G1-G5) only require backend aggregator changes, not new API surface.

---

## 8. UI Wireframe

### 8A. Current TerminalPanel Layout (Already Implemented)

```
+----------------------------------------------------------------------+
| Process Monitor                            [Refresh]  4 running  1 stale |
+----------------------------------------------------------------------+
|                                                                        |
|  SESSIONS (2)                                                          |
|  +------------------------------------------------------------------+ |
|  | [green dot] PID 1234  Console  CME        3m 12s    [Kill]        | |
|  |   +- subagent-explore-1  architecture  running  1m 30s   [Kill]   | |
|  |   +- subagent-plan-1     qa           running   45s      [Kill]   | |
|  +------------------------------------------------------------------+ |
|  | [amber dot] PID 5678  Daemon  cme-autorun  12m 45s   [Kill]       | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  TASKS IN PROGRESS (1)                                                 |
|  +------------------------------------------------------------------+ |
|  | [task icon] #47  "Backtest cycle 4"  trading  2h 15m   [Reset]    | |
|  |   claimed by: trading-lead                                         | |
|  |   [amber] long-running (no activity for 45m)                      | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  TRADING (1)                                                           |
|  +------------------------------------------------------------------+ |
|  | [chart icon] Scheduler  PID 9012  running  6h 30m                  | |
|  |   last job: intraday_pipeline (14:20)                              | |
|  |   next run: 14:50 ET                                               | |
|  |   [Kill]                                                           | |
|  +------------------------------------------------------------------+ |
|                                                                        |
+----------------------------------------------------------------------+
```

### 8B. Proposed Addition: Data Connector Syncs Section

```
|  DATA CONNECTOR SYNCS (1)                                              |
|  +------------------------------------------------------------------+ |
|  | [gear icon] normattiva-codice-civile  data-eng  running  8m       | |
|  |   325/1200 records processed                                       | |
|  |   [no kill button -- read-only]                                    | |
|  +------------------------------------------------------------------+ |
```

### 8C. Proposed Enhancement: Expected Duration Hint

```
|  | [green dot] subagent-explore-1  architecture  running  1m 30s     | |
|  |   (expected: ~2min)                                                | |
```

When elapsed > 2x expected:
```
|  | [amber dot] subagent-explore-1  architecture  running  6m 30s     | |
|  |   [amber] taking longer than expected (~2min)                      | |
```

---

## 9. Implementation Phases

### Phase 0: Current State (DONE)

Everything in Section 2A is implemented and working. The Process Monitor is functional for sessions, sub-agents, tasks, and trading scheduler.

### Phase 1: Sub-Agent Heartbeat Improvement (G1 + G5) — PARTIALLY DONE

**Scope:** Improve `lastActivity` accuracy for sub-agents and daemon.

| Step | File | Change | Effort | Status |
|---|---|---|---|---|
| 1.1 | `lib/company/process-monitor.ts` | Read `.claude/sub-agents.json` mtime, use as `lastActivity` for sub-agents. Check `isProcessAlive()` on heartbeat PID, add to `meta.hostPidAlive`. | ~20 lines | TODO |
| 1.2 | `scripts/cme-autorun.ts` | Add `writeDaemonState({ lastHeartbeat: ... })` at key points in the cycle. | ~15 lines | **DONE** (2026-03-18) |
| 1.3 | `lib/company/process-monitor.ts` | Read `cme-daemon-state.json` `lastHeartbeat` for daemon sessions' `lastActivity`. | ~10 lines | TODO |

**Dependencies:** None.
**Risk:** Low. All changes are read-only additions to existing data.

> **Note (2026-03-18):** G5 is fully resolved. The daemon writes `lastHeartbeat` at 3 key points per cycle. Additionally, FASE 4.5 zombie reaper in `lib/company/self-preservation.ts` provides automatic cleanup of stale processes >30min, which was not part of the original design but was implemented as a complementary safety mechanism.

### Phase 2: Data Connector Sync Visibility (G2)

**Scope:** Add running data connector syncs to the Process Monitor.

| Step | File | Change | Effort |
|---|---|---|---|
| 2.1 | `lib/company/process-monitor.ts` | Add `dataConnectorSyncsToProcesses()`, extend `MonitoredProcess.type` union, call in `getUnifiedProcesses()`. | ~60 lines |
| 2.2 | `components/console/TerminalPanel.tsx` | Add "Data Connector Syncs" section rendering `type === "data-connector-sync"` processes. | ~40 lines |

**Dependencies:** Phase 0 (existing infrastructure).
**Risk:** Low. Supabase query adds ~100ms to poll. Cacheable in-memory for 10s.

### Phase 3: Polling Optimization + Duration Hints (G3 + G4)

**Scope:** Merge dual polls into one, add expected duration hints.

| Step | File | Change | Effort |
|---|---|---|---|
| 3.1 | `components/console/TerminalPanel.tsx` | Remove the 15s `/api/company/sessions` poll. Use only the 5s `/api/company/processes` poll. | ~-30 lines (removal) |
| 3.2 | `lib/company/process-monitor.ts` | Add `expectedDurationMs` to `meta` for known process types (static table). | ~30 lines |
| 3.3 | `components/console/TerminalPanel.tsx` | Show "expected: ~Xmin" hint when `meta.expectedDurationMs` is available. Amber when elapsed > 2x expected. | ~20 lines |

**Dependencies:** Phase 0.
**Risk:** Low.

### Phase 4: Future Enhancements (Deferred)

Not part of current scope, documented for completeness:

| Enhancement | Description | Trigger |
|---|---|---|
| SSE for in-process events | Add SSE endpoint on top of agent-broadcast for sub-second updates | If 5s polling proves insufficient |
| Data connector sync kill | AbortController pattern for sync functions | If syncs get stuck regularly |
| Historical duration baselines | Compute expectedDurationMs from past runs | After 30+ days of data |
| Multi-machine support | Centralized Supabase process_registry table | If architecture moves off single localhost |

---

## 10. Cost Estimate

### 10A. Supabase Queries per Poll (5s interval)

| Query | Rows | Estimated Cost |
|---|---|---|
| `company_tasks WHERE status = 'in_progress'` | ~1-5 | Negligible (indexed) |
| `connector_sync_log WHERE status = 'running'` | ~0-3 | Negligible (indexed) |
| **Total per poll** | | **~2 queries, <50ms combined** |

### 10B. Supabase Queries per Day (assuming 1 active user polling)

- Polls per day: `86400s / 5s = 17,280 polls`
- Queries per poll: 2 (tasks + syncs)
- Total: ~34,560 queries/day
- Supabase free tier: 500K queries/month = ~16K/day --> **This fits within free tier if only 1 user polls.**
- With 3+ concurrent /ops users: consider caching the process list in-memory with 5s TTL to serve multiple clients from one upstream query.

### 10C. File I/O per Poll

| File | Operation | Frequency |
|---|---|---|
| `.claude/sub-agents.json` | Read + stat (mtime) | Every 5s |
| `.claude/heartbeat.json` | Read | Every 5s |
| `company/.active-sessions.json` | Read | Every 5s |
| `trading/.scheduler-heartbeat.json` | Read | Every 5s |
| `company/cme-daemon-state.json` | Read | Every 5s |

All are small JSON files (<10KB). File I/O is <1ms each. Total overhead: <5ms per poll.

---

## 11. Security Considerations

1. **Authentication:** All endpoints use `requireConsoleAuth` (HMAC-SHA256 token with expiry). No change needed.
2. **Authorization:** Kill actions are restricted to authenticated console operators. The interactive Claude Code session (boss terminal) is explicitly NOT killable.
3. **CSRF:** POST endpoints check `X-CSRF-Token` header. No change needed.
4. **Rate Limiting:** GET 30/min, POST 5/min. Sufficient for 5s polling + occasional kills.
5. **Audit Trail:** Every kill action logs operator name, session ID, process type, and outcome. No change needed.
6. **Data Exposure:** The `/api/company/processes` endpoint exposes PIDs, process types, and department names. This is acceptable for authenticated console operators. No sensitive data (API keys, credentials) is included.
7. **Trading heartbeat file:** Located in `trading/` which is `.gitignored` for sensitive data. Readable by the Next.js server on localhost. Contains only PID, timestamps, and job names -- no trading credentials.

---

## 12. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Supabase query latency on poll | Medium | +100-300ms per poll | Cache results 10s in-memory; only re-query if cache expired |
| Trading scheduler not writing heartbeat (Python crash) | Low | Scheduler appears "stale" | Stale heartbeat (>5min) shown as amber badge, not hidden. PID liveness check as backup. |
| False "long-running" alerts on legitimate long tasks | Medium | Operator concern | Show elapsed AND lastActivity AND expectedDuration. Let human judge. |
| Race condition on task reset (operator resets while agent completes) | Low | Task briefly reopened then re-completed | `resetTask()` already checks current status. Returns error if task is no longer `in_progress`. |
| `wmic` overhead on Windows (orphan discovery) | Known | 3-5s per call | Orphan discovery removed from default poll path. Only used in `/api/company/sessions?orphans=true`. |
| Multiple /ops users hammering the endpoint | Low | Supabase quota | Implement server-side response cache (5s TTL) serving all clients from one upstream query |

---

## 13. Summary of Changes Required

### New Code (Gap Closures)

| File | Change | Lines | Phase |
|---|---|---|---|
| `lib/company/process-monitor.ts` | Add sub-agent mtime + hostPidAlive, daemon lastHeartbeat, data connector syncs, expectedDurationMs | ~120 lines | 1+2+3 |
| `scripts/cme-autorun.ts` | Add `lastHeartbeat` writes to DaemonState | ~15 lines | 1 |
| `components/console/TerminalPanel.tsx` | Remove 15s poll, add sync section, add duration hints | ~30 net lines | 2+3 |

### Total Effort Estimate

| Phase | Effort | Priority |
|---|---|---|
| Phase 1: Sub-agent + daemon heartbeat | 2-3 hours | HIGH |
| Phase 2: Data connector sync visibility | 2-3 hours | MEDIUM |
| Phase 3: Poll optimization + duration hints | 1-2 hours | LOW |
| **Total** | **5-8 hours** | |

### Files NOT Changed (Reused As-Is)

- `lib/company/sessions.ts` -- core tracker, no changes
- `lib/agent-broadcast.ts` -- event bus, no changes
- `lib/company/sub-agent-tracker.ts` -- file tracker, no changes
- `app/api/company/processes/route.ts` -- API endpoint, no changes
- `app/api/company/sessions/[pid]/kill/route.ts` -- kill infra, no changes

---

## 14. Decision Record

| # | Decision | Rationale | Alternatives Considered |
|---|---|---|---|
| D1 | Polling at 5s, not SSE | Heterogeneous data sources (memory + files + Supabase). SSE would need a unifying bus across all. Complexity not justified. | SSE with per-source adapters |
| D2 | No automatic kill/timeout | Boss explicitly requested "human decides". Long-running badges are advisory only. | Auto-kill after 10min, auto-kill after 30min |
| D3 | No new Supabase table | File-based + in-memory is fast enough for single localhost. Only tasks and syncs need Supabase queries. | Dedicated `process_registry` table |
| D4 | Sub-agent heartbeat via file mtime | We cannot inject code into Claude Code's Agent tool sandbox. File mtime is a zero-effort proxy. | Custom heartbeat command, SDK hook |
| D5 | Data connector syncs read-only | No kill mechanism exists for sync functions. Adding AbortController is a separate design task. | Deferred |
