# Process Monitor — Architecture Plan

> Task #1006 — Real-time observability + systematic per-item kill for all running processes.
>
> Design principle: **Human decides, system shows.** No automatic timeouts, no automatic kills.

---

## 1. Current State Analysis

### 1A. What Exists Today

The codebase already has five separate tracking mechanisms, each covering a slice of the process landscape:

**A. Session Tracker (`lib/company/sessions.ts`)**
- Two-layer architecture: Layer 1 (in-memory `Map<sessionId, ActiveSession>`) for interactive `claude -p` subprocesses, Layer 2 (in-memory `Map<pid, TrackedSession>`) for registered sessions.
- File-based registry at `company/.active-sessions.json` for cross-process sharing (task-runner, daemon write here; Next.js server reads).
- Heartbeat file at `.claude/heartbeat.json` for the interactive Claude Code session (30s max age, auto-stale).
- Orphan discovery via OS process scan (`wmic` on Windows, `pgrep` on Unix) — scans for `claude` processes not in the registry.
- Output ring buffer (500 lines per PID) with SSE fan-out via `outputBus` EventEmitter.
- `TrackedSessionDTO` includes nested `agents[]` array, synthesized from `AgentEvent` broadcast bus.

**B. Sub-Agent Tracker (`lib/company/sub-agent-tracker.ts` + `scripts/track-subagent.ts`)**
- File-based registry at `.claude/sub-agents.json`.
- CLI writes (start/done/error), server reads (read-only from Next.js perspective).
- Zombie detection at 10 minutes (hardcoded `ZOMBIE_TIMEOUT_MS`).
- `cleanupZombies()` marks zombies as error + prunes old completed entries (60s TTL).
- `killSubAgent(agentId)` marks a specific sub-agent as error in the JSON file.
- `toAgentEvents()` converts to `AgentEvent` format for session API integration.

**C. Agent Broadcast (`lib/agent-broadcast.ts`)**
- In-memory EventEmitter bus on `globalThis` (HMR-stable).
- `broadcastAgentEvent()` fires events; `getActiveAgentEvents()` returns current snapshot.
- Auto-expire: `TTL_DONE_MS = 30s` for completed, `TTL_RUNNING_MS = 60s` for running (stale guard).
- Used by `/api/analyze` pipeline, console routes, and the kill endpoint.

**D. Daemon (`scripts/cme-autorun.ts`)**
- File-based lock at `company/autorun-logs/.autorun.lock`.
- State file at `company/cme-daemon-state.json`.
- Registers itself via `fileRegisterSession()` in `company/.active-sessions.json`.
- No heartbeat mechanism — only the lock file indicates it is running.

**E. UI Components**
- `TerminalPanel.tsx` (1009 lines): Full terminal card view with per-session and per-agent kill, zombie badges, expandable agent list. Polls `/api/company/sessions?orphans=true` every 15s.
- `SessionIndicator.tsx` (379 lines): Compact badge in header, dropdown list, polls every 15s. Opens `SessionDetailPanel` on click.
- Kill dialog with confirmation for both sessions (red) and agents (orange).
- "Kill zombies" bulk button in TerminalPanel header.

**F. API Endpoints**
- `GET /api/company/sessions` — Unified sessions + agents + sub-agents + zombie count. Auth + rate limit.
- `POST /api/company/sessions/:pid/kill` — Kill session (hard, OS-level) or agent (soft, AbortController + broadcast). Auth + CSRF + rate limit.
- `GET /api/company/sub-agents` — List active sub-agents + stats.
- `POST /api/company/sub-agents` — Register/kill individual sub-agent.
- `DELETE /api/company/sub-agents` — Kill all zombie sub-agents.

### 1B. Process Types in the System

| Process Type | Current Tracking | Has Heartbeat | Per-Item Kill | Progress Reporting |
|---|---|---|---|---|
| Interactive Claude Code session | Heartbeat file (30s) | Yes | No (it is the boss) | None |
| Console `claude -p` sessions | In-memory Layer 1+2 | Indirect (output activity) | Yes (SIGTERM/taskkill) | Output ring buffer |
| Sub-agents (Agent tool) | File-based JSON | No (start/done only) | Yes (mark error in file) | None |
| Daemon (`cme-autorun.ts`) | File-based session + lock | Lock file only | Yes (PID kill) | `daemon-report.json` |
| Task-runner sessions | File-based session | No | Yes (PID kill) | Task status in Supabase |
| Company tasks (in_progress) | Supabase `company_tasks` | No | No kill mechanism | `result` field |
| Trading scheduler | External Python process | No tracking at all | No | `trading_signals` table |
| Trading pipeline agents | External Python process | No tracking at all | No | `trading_signals` table |

---

## 2. Gap Analysis

### 2A. What is Missing

1. **No unified view.** The TerminalPanel shows sessions/agents but misses: company tasks in `in_progress` state, trading scheduler, trading pipeline runs. The boss cannot see "everything running" in one place.

2. **No progress/heartbeat for sub-agents.** Sub-agents only write `start` and `done/error`. Between those two events, there is no signal. A sub-agent running for 8 minutes could be doing real work or could be dead. The 10-minute zombie heuristic is the only discriminator, and the boss explicitly does NOT want automatic timeouts.

3. **No trading process visibility.** The Python trading scheduler and its pipeline agents (market_scanner, signal_generator, risk_manager, executor, portfolio_monitor) are completely invisible to the Process Monitor. They run as separate OS processes writing to Supabase, with no registration in the session tracker.

4. **Company tasks lack kill mechanism.** Tasks in `in_progress` state (claimed by an agent) have no way to be killed. The task-runner may have crashed, leaving the task stuck. Today, manual `update <id> --status open` is the only workaround.

5. **No process classification for kill decisions.** The boss sees a list but lacks contextual info to decide: "Is this slow or dead?" There is no elapsed time vs expected time comparison, no last-activity timestamp for sub-agents, no progress percentage.

6. **Polling interval too slow for real-time feel.** TerminalPanel polls every 15s (reduced from 3s due to `wmic` overhead on Windows). SessionIndicator also polls every 15s. For a "real-time" monitor, this is too sluggish.

7. **No per-item kill for company tasks.** The "Kill zombies" button kills all zombie sub-agents, but there is no button to reset a single stuck `in_progress` task.

### 2B. What Already Works Well (Keep As-Is)

- Session tracking architecture (Layer 1 + Layer 2 + file-based) is solid.
- Kill infrastructure for sessions and agents is complete and audited (operator identity logging).
- Sub-agent file-based tracking is lightweight and fast (< 1s per write).
- Agent broadcast bus for in-process events is efficient.
- UI components (TerminalPanel, SessionIndicator) are polished and accessible.

---

## 3. Architecture Design

### 3A. Design Principles

1. **Human decides.** The monitor shows status. Kill buttons require confirmation. No automatic timeouts or kills. The 10-minute zombie threshold becomes a UI hint ("long-running") not an automatic action.
2. **Reuse existing infrastructure.** Do not replace sessions.ts or sub-agent-tracker.ts. Extend them.
3. **Unified data model.** One API endpoint returns ALL process types in a single response with a unified schema.
4. **Heartbeat optional, last-activity mandatory.** Every process type must report at least a `lastActivity` timestamp. Processes that support heartbeat get a more accurate `lastActivity`; others use their most recent write (task result, trading signal, etc.).
5. **Polling with fast path.** Keep polling (SSE would require persistent connections from multiple data sources including Supabase and file system). Optimize the poll endpoint to avoid `wmic` on every call (cache orphan discovery for 30s).

### 3B. Unified Process Schema

```typescript
interface MonitoredProcess {
  /** Unique identifier across all process types */
  id: string;

  /** Process category */
  type: "session" | "sub-agent" | "task" | "trading-scheduler" | "trading-pipeline";

  /** Human-readable label */
  label: string;

  /** Department or area */
  department: string;

  /** What this process is doing */
  description: string;

  /** Current status */
  status: "running" | "done" | "error" | "stale";

  /** When the process started (ISO) */
  startedAt: string;

  /** Last known activity (ISO). For sessions: last output line.
   *  For sub-agents: startedAt (no heartbeat). For tasks: last update.
   *  For trading: last signal timestamp. */
  lastActivity: string;

  /** Elapsed time in ms since startedAt */
  elapsedMs: number;

  /** Whether a kill action is available for this process */
  killable: boolean;

  /** Kill method hint for the API */
  killMethod?: "pid" | "agent" | "task-reset" | "trading-stop";

  /** OS PID if applicable */
  pid?: number;

  /** Sub-agent ID if applicable */
  agentId?: string;

  /** Task ID if applicable */
  taskId?: string;

  /** Nested child processes (sub-agents under a session) */
  children?: MonitoredProcess[];

  /** Additional metadata for display */
  meta?: Record<string, string | number | boolean>;
}
```

### 3C. Data Source Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                    GET /api/company/processes                     │
│                                                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────────────────┐ │
│  │  Sessions     │ │  Sub-Agents  │ │  Company Tasks            │ │
│  │  (in-memory   │ │  (.claude/   │ │  (Supabase query:         │ │
│  │  + file +     │ │  sub-agents  │ │  status = in_progress)    │ │
│  │  heartbeat)   │ │  .json)      │ │                           │ │
│  └──────┬───────┘ └──────┬───────┘ └──────────┬────────────────┘ │
│         │                │                     │                  │
│  ┌──────┴───────┐ ┌──────┴──────────────┐     │                  │
│  │  Orphan      │ │  Trading Probe      │     │                  │
│  │  Discovery   │ │  (file-based:       │     │                  │
│  │  (cached     │ │  trading/.active    │     │                  │
│  │  30s)        │ │  OR Supabase query  │     │                  │
│  └──────────────┘ │  trading_signals    │     │                  │
│                   │  last 5min)         │     │                  │
│                   └─────────────────────┘     │                  │
│                                               │                  │
│  ┌────────────────────────────────────────────┘                  │
│  │                                                               │
│  ▼                                                               │
│  UNIFIED: MonitoredProcess[]                                     │
│  sorted by: status (running first), then startedAt (newest first)│
└─────────────────────────────────────────────────────────────────┘
```

### 3D. Kill Actions by Process Type

| Process Type | Kill Method | Implementation |
|---|---|---|
| Console session | `POST /api/company/sessions/:pid/kill` | Existing: SIGTERM/taskkill |
| Sub-agent (in-memory) | `POST /api/company/sessions/:pid/kill` with `agentId` | Existing: AbortController + broadcast |
| Sub-agent (file-tracked) | `POST /api/company/sub-agents` with `{action:"kill", id}` | Existing: mark error in JSON |
| Company task (stuck) | `POST /api/company/processes/:id/kill` | **NEW**: reset task to `open` + clear `claimed_by` |
| Daemon | `POST /api/company/sessions/:pid/kill` | Existing: PID kill + remove lock file |
| Trading scheduler | `POST /api/company/processes/:id/kill` | **NEW**: write stop signal file or kill PID |
| Trading pipeline run | Read-only (no kill) | Pipeline is short-lived, just show status |

### 3E. Trading Visibility Strategy

The trading scheduler is a Python process with no current registration. Two options:

**Option A (Recommended): File-based probe.** The Python scheduler writes a heartbeat file at `trading/.scheduler-heartbeat.json` every 30s. The Process Monitor reads it. Format:

```json
{
  "pid": 12345,
  "startedAt": "2026-03-18T10:00:00Z",
  "lastHeartbeat": "2026-03-18T14:23:15Z",
  "currentJob": "intraday_pipeline",
  "lastPipelineRun": "2026-03-18T14:20:00Z",
  "lastPipelineStatus": "ok",
  "nextScheduledRun": "2026-03-18T14:50:00Z"
}
```

**Option B: Supabase probe.** Query `trading_signals` for the most recent entry and `trading_config` for the enabled/mode state. No code changes to Python needed, but higher latency and a DB query per poll.

**Decision: Option A for scheduler, Option B as supplementary for pipeline runs.** The scheduler heartbeat file is cheap and fast to read. For individual pipeline runs (which are ephemeral), query `trading_signals` with `created_at > now() - interval '5 minutes'` to detect recent activity.

---

## 4. Implementation Plan

### Phase 1: Unified API Endpoint (Backend)

**Step 1.1: Create `lib/company/process-monitor.ts`**

New module that aggregates all data sources into `MonitoredProcess[]`.

```
File: lib/company/process-monitor.ts

Functions:
- getUnifiedProcesses(): Promise<MonitoredProcess[]>
  - Reads sessions (getUnifiedSessions)
  - Reads sub-agents (getActiveSubAgents)
  - Reads company tasks in_progress (Supabase query)
  - Reads trading heartbeat file (if exists)
  - Reads trading recent signals (Supabase query, cached 30s)
  - Merges into unified schema
  - Sorts: running first, then by startedAt desc

- killProcess(id: string, type: string): Promise<{ok: boolean, message: string}>
  - Dispatches to the correct kill mechanism based on type
  - For "task": resets task to open status
  - For "trading-scheduler": sends SIGTERM to PID from heartbeat file
  - For session/agent: delegates to existing kill infrastructure

Dependencies:
  - lib/company/sessions.ts (existing)
  - lib/company/sub-agent-tracker.ts (existing)
  - lib/company/tasks.ts (existing, for Supabase task query)
  - lib/supabase/admin.ts (for trading_signals query)
```

**Step 1.2: Create `app/api/company/processes/route.ts`**

```
File: app/api/company/processes/route.ts

GET /api/company/processes
  - Auth: requireConsoleAuth
  - Rate limit: 30/min
  - Returns: { processes: MonitoredProcess[], summary: { total, running, stale, killable } }

POST /api/company/processes (kill action)
  - Auth: requireConsoleAuth + CSRF
  - Rate limit: 5/min
  - Body: { id: string, action: "kill" }
  - Dispatches to killProcess()
```

**Step 1.3: Extend task reset capability in `lib/company/tasks.ts`**

Add a `resetTask(taskId: string)` function that:
- Sets `status = 'open'`
- Clears `claimed_by`
- Appends to `result`: `"Reset by operator via Process Monitor"`

This is a surgical addition, not a rewrite.

### Phase 2: Trading Heartbeat (Python side)

**Step 2.1: Add heartbeat to `trading/src/scheduler.py`**

```python
# In the scheduler main loop, write heartbeat every iteration:
def _write_heartbeat(current_job: str = "idle"):
    heartbeat = {
        "pid": os.getpid(),
        "startedAt": _start_time.isoformat(),
        "lastHeartbeat": datetime.now(timezone.utc).isoformat(),
        "currentJob": current_job,
    }
    Path("trading/.scheduler-heartbeat.json").write_text(json.dumps(heartbeat, indent=2))
```

This is ~10 lines of Python added to the existing scheduler loop. Zero impact on trading logic.

**Step 2.2: Read heartbeat in `lib/company/process-monitor.ts`**

```typescript
function readTradingSchedulerHeartbeat(): MonitoredProcess | null {
  const file = path.resolve(process.cwd(), "trading", ".scheduler-heartbeat.json");
  // Read, parse, check freshness (5 min max age), return MonitoredProcess or null
}
```

### Phase 3: Process Monitor UI Component

**Step 3.1: Create `components/console/ProcessMonitor.tsx`**

A new component that replaces or extends TerminalPanel with the unified view. Design:

```
┌─────────────────────────────────────────────────────────────────┐
│  Process Monitor                          [Refresh] 4 running   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SESSIONS (2)                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ● PID 1234  Console  CME          3m 12s    [Kill]      │   │
│  │   └ subagent-explore-1  architecture  running  1m 30s   │   │
│  │   └ subagent-plan-1     qa           running   45s      │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ ● PID 5678  Daemon   cme-autorun  12m 45s   [Kill]      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  TASKS IN PROGRESS (1)                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ◆ #47  "Backtest cycle 4"  trading   2h 15m   [Reset]   │   │
│  │   claimed by: trading-lead                               │   │
│  │   ⚠ long-running (no activity for 45m)                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  TRADING (1)                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ▲ Scheduler  PID 9012  running  6h 30m                   │   │
│  │   last job: intraday_pipeline (14:20)                    │   │
│  │   next run: 14:50 ET                                     │   │
│  │   [Kill]                                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Key UI decisions:
- Group by type (sessions, tasks, trading) with collapsible sections.
- Color coding: green = active with recent activity, amber = long-running/stale, red = error.
- "Long-running" badge when elapsed > 10 min (for sub-agents) or > 1 hour (for tasks). This is a **visual hint**, not an automatic action.
- Kill/Reset button per item with confirmation dialog (reuse existing `KillDialog` pattern from TerminalPanel).
- Poll interval: 5s (the new endpoint avoids `wmic` for orphan discovery by default, making it fast).

**Step 3.2: Integrate into StudioShell.tsx**

Add ProcessMonitor as a new tab/panel option in the console layout, alongside the existing TerminalPanel. The TerminalPanel remains available as a more detailed view for session output; ProcessMonitor is the high-level overview.

### Phase 4: Remove Automatic Zombie Kill

**Step 4.1: Make zombie detection advisory-only**

In `lib/company/sub-agent-tracker.ts`:
- Keep `getZombieSubAgents()` (returns long-running agents for UI display).
- Remove automatic invocation of `cleanupZombies()` from any polling path.
- `cleanupZombies()` is ONLY called when the operator explicitly clicks "Kill zombies" or kills individually.

In `scripts/track-subagent.ts`:
- The `kill-zombies` CLI command remains (operator-invoked).
- Remove the 10-minute constant from being treated as an automatic kill threshold. Rename it to `LONG_RUNNING_THRESHOLD_MS` and use it only for the UI badge.

**Step 4.2: Update TerminalPanel.tsx zombie display**

Change the zombie label from "zombie" to "long-running" (the process is not dead, it just has been running a while). The kill button remains available for the human to decide.

---

## 5. File Manifest

### New Files

| File | Purpose |
|---|---|
| `lib/company/process-monitor.ts` | Unified aggregator: all process types into `MonitoredProcess[]` |
| `app/api/company/processes/route.ts` | API endpoint: GET (list all), POST (kill/reset) |
| `components/console/ProcessMonitor.tsx` | UI component: unified process view with per-item kill |

### Modified Files

| File | Change |
|---|---|
| `lib/company/tasks.ts` | Add `resetTask(taskId)` function |
| `lib/company/sub-agent-tracker.ts` | Rename `ZOMBIE_TIMEOUT_MS` to `LONG_RUNNING_THRESHOLD_MS`, add `isLongRunning()` export |
| `scripts/track-subagent.ts` | Rename constant, update CLI help text |
| `trading/src/scheduler.py` | Add `_write_heartbeat()` call in main loop (~10 lines) |
| `components/console/StudioShell.tsx` | Add ProcessMonitor tab |
| `components/console/TerminalPanel.tsx` | Change "zombie" label to "long-running", keep kill button |

### Unchanged Files (Reused As-Is)

| File | Reason |
|---|---|
| `lib/company/sessions.ts` | Core session tracking, no changes needed |
| `lib/agent-broadcast.ts` | Event bus, no changes needed |
| `app/api/company/sessions/route.ts` | Existing session API, keep for backward compat |
| `app/api/company/sessions/[pid]/kill/route.ts` | Existing kill infra, called by process-monitor.ts |
| `app/api/company/sub-agents/route.ts` | Existing sub-agent API, called by process-monitor.ts |
| `components/console/SessionIndicator.tsx` | Header badge, keep as-is |

---

## 6. Sequencing and Dependencies

```
Phase 1 (Backend)                   Phase 2 (Trading)
  Step 1.1 process-monitor.ts         Step 2.1 scheduler.py heartbeat
  Step 1.2 processes/route.ts          Step 2.2 read heartbeat in 1.1
  Step 1.3 resetTask() in tasks.ts        │
       │                                   │
       └───────────┬───────────────────────┘
                   │
            Phase 3 (UI)
              Step 3.1 ProcessMonitor.tsx
              Step 3.2 StudioShell integration
                   │
            Phase 4 (Cleanup)
              Step 4.1 Advisory-only zombie detection
              Step 4.2 TerminalPanel label update
```

Phase 1 and Phase 2 can run in parallel. Phase 3 depends on both. Phase 4 can run in parallel with Phase 3.

---

## 7. Polling vs SSE Decision

**Decision: Polling at 5s, with orphan discovery cached at 30s.**

Rationale:
- The data sources are heterogeneous: in-memory maps, JSON files, Supabase queries, OS process lists. SSE would require a unifying event bus across all of these, which is high complexity for marginal gain.
- The existing TerminalPanel already uses polling (15s, reduced from 3s due to `wmic` overhead). The new endpoint avoids `wmic` by default (orphan discovery is opt-in via `?orphans=true`), making 5s polling feasible.
- The 5s interval provides a good balance: responsive enough for the boss to see process changes quickly, without overloading the server.
- If a faster path is needed later, SSE can be added as a progressive enhancement on top of the polling endpoint (the server can EventEmitter-notify when a process state changes).

---

## 8. Security Considerations

- All new endpoints use `requireConsoleAuth` (existing HMAC-SHA256 token validation).
- Kill/reset actions require `checkCsrf`.
- Rate limiting: 30/min for GET, 5/min for POST (kill).
- Operator identity is logged on every kill action (existing pattern from `sessions/[pid]/kill`).
- The trading heartbeat file is in `trading/` which is gitignored for sensitive data but readable by the Next.js server on the same localhost.

---

## 9. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Supabase query latency for tasks/trading | Medium | Adds 100-300ms to poll | Cache results for 10s in-memory |
| Trading scheduler does not write heartbeat (Python crash) | Low | Scheduler appears offline | Stale heartbeat (>5 min) shown as "offline" badge, not hidden |
| False "long-running" alerts on legitimate long tasks | Medium | Boss gets unnecessary concern | Show elapsed time AND last-activity time, let human judge |
| Race condition on task reset (operator resets while agent finishes) | Low | Task reopened then immediately re-completed | resetTask() checks current status before resetting, returns error if already done |
| `wmic` overhead on Windows when orphan discovery enabled | Known issue | Polling slows to 3-5s per call | Orphan discovery cached 30s, disabled by default in ProcessMonitor (only TerminalPanel uses it) |
