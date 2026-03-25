/**
 * Process Monitor — Unified aggregator for all running processes.
 *
 * Merges data from:
 *   - Session tracker (in-memory + file-based + heartbeat)
 *   - Sub-agent tracker (.claude/sub-agents.json) with file mtime heartbeat (G1)
 *   - Company tasks in_progress (Supabase)
 *   - Trading scheduler heartbeat (trading/.scheduler-heartbeat.json)
 *   - Daemon heartbeat (company/cme-daemon-state.json lastHeartbeat) (G5)
 *   - Data connector syncs (connector_sync_log WHERE status='running') (G2)
 *   - OS-level node.exe processes via wmic (G6 — task #1071)
 *
 * Gap closures (task #1006):
 *   G1: Sub-agent heartbeat via file mtime + host PID alive check
 *   G2: Data connector sync visibility from Supabase
 *   G3: Polling optimization (single 5s poll, removed redundant 15s)
 *   G4: Expected duration hints per process type
 *   G5: Daemon heartbeat read from cme-daemon-state.json
 *
 * Gap closures (task #1071):
 *   G6: OS-level node.exe discovery via wmic — sees ALL processes, not just registered ones
 *
 * Produces a unified MonitoredProcess[] for the Process Monitor UI.
 *
 * Architecture Plan: company/architecture/plans/process-monitor.md
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

import {
  getUnifiedSessions,
  toDTOWithAgents,
  readHeartbeat,
} from "@/lib/company/sessions";
import {
  discoverOSNodeProcesses,
  CATEGORY_LABELS,
  formatBytes as selfPreservationFormatBytes,
} from "@/lib/company/self-preservation";
import type { AgentDTO } from "@/lib/company/sessions";
import { getActiveAgentEvents } from "@/lib/agent-broadcast";
import {
  getActiveSubAgents,
  toAgentEvents,
} from "@/lib/company/sub-agent-tracker";
import { getOpenTasks, resetTask } from "@/lib/company/tasks";
import {
  markSessionClosing,
  unregisterSession,
  clearOutputRing,
  getSession,
  deleteSession,
} from "@/lib/company/sessions";
import { killSubAgent } from "@/lib/company/sub-agent-tracker";
import { createAdminClient } from "@/lib/supabase/admin";

// ─── Types ───

export interface MonitoredProcess {
  /** Unique identifier across all process types */
  id: string;

  /** Process category */
  type: "session" | "sub-agent" | "task" | "trading-scheduler" | "trading-pipeline" | "data-connector-sync" | "os-node-process";

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
   *  For trading: last heartbeat timestamp. */
  lastActivity: string;

  /** Elapsed time in ms since startedAt */
  elapsedMs: number;

  /** Whether a kill action is available for this process */
  killable: boolean;

  /** Kill method hint for the API */
  killMethod?: "pid" | "agent" | "task-reset" | "trading-stop" | "os-kill";

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

export interface ProcessSummary {
  total: number;
  running: number;
  stale: number;
  killable: number;
}

// ─── Constants ───

/** Sub-agents running longer than 10 min are flagged as stale (visual hint only) */
const LONG_RUNNING_THRESHOLD_MS = 10 * 60 * 1000;

/** Tasks in_progress longer than 1 hour are flagged as stale */
const TASK_STALE_THRESHOLD_MS = 60 * 60 * 1000;

/** Trading heartbeat older than 5 min is considered stale */
const TRADING_HEARTBEAT_MAX_AGE_MS = 5 * 60 * 1000;

const TRADING_HEARTBEAT_FILE = path.resolve(
  process.cwd(),
  "trading",
  ".scheduler-heartbeat.json"
);

/** Sub-agents file path — used for mtime-based heartbeat (G1) */
const SUB_AGENTS_FILE = path.resolve(
  process.cwd(),
  ".claude",
  "sub-agents.json"
);

/** Daemon state file — used for daemon heartbeat (G5) */
const DAEMON_STATE_FILE = path.resolve(
  process.cwd(),
  "company",
  "cme-daemon-state.json"
);

/** Expected durations for known process types (G4) */
const EXPECTED_DURATION_MS: Record<string, number> = {
  "sub-agent-explore": 120_000,      // 2 min
  "sub-agent-plan": 300_000,         // 5 min
  "daemon": 900_000,                 // 15 min
  "trading-daily": 300_000,          // 5 min
  "trading-intraday": 60_000,        // 1 min
  "data-connector-sync": 600_000,    // 10 min
};

// ─── Trading Heartbeat ───

interface TradingHeartbeat {
  pid: number;
  startedAt: string;
  lastHeartbeat: string;
  currentJob?: string;
  lastPipelineRun?: string;
  lastPipelineStatus?: string;
  nextScheduledRun?: string;
}

function readTradingSchedulerHeartbeat(): MonitoredProcess | null {
  try {
    if (!fs.existsSync(TRADING_HEARTBEAT_FILE)) return null;
    const raw = fs.readFileSync(TRADING_HEARTBEAT_FILE, "utf-8");
    const hb: TradingHeartbeat = JSON.parse(raw);

    const now = Date.now();
    const lastHbTime = new Date(hb.lastHeartbeat).getTime();
    const age = now - lastHbTime;
    const startedAtTime = new Date(hb.startedAt).getTime();
    const elapsedMs = now - startedAtTime;

    const isStale = age > TRADING_HEARTBEAT_MAX_AGE_MS;

    return {
      id: `trading-scheduler-${hb.pid}`,
      type: "trading-scheduler",
      label: "Trading Scheduler",
      department: "trading",
      description: hb.currentJob
        ? `Job: ${hb.currentJob}`
        : "Scheduler running",
      status: isStale ? "stale" : "running",
      startedAt: hb.startedAt,
      lastActivity: hb.lastHeartbeat,
      elapsedMs,
      killable: true,
      killMethod: "trading-stop",
      pid: hb.pid,
      meta: {
        ...(hb.currentJob ? { currentJob: hb.currentJob } : {}),
        ...(hb.lastPipelineRun ? { lastPipelineRun: hb.lastPipelineRun } : {}),
        ...(hb.lastPipelineStatus ? { lastPipelineStatus: hb.lastPipelineStatus } : {}),
        ...(hb.nextScheduledRun ? { nextScheduledRun: hb.nextScheduledRun } : {}),
        expectedDurationMs: hb.currentJob?.includes("intraday")
          ? EXPECTED_DURATION_MS["trading-intraday"]
          : EXPECTED_DURATION_MS["trading-daily"],
      },
    };
  } catch {
    return null;
  }
}

// ─── Daemon Heartbeat Read (G5) ───

/**
 * Read the daemon's lastHeartbeat from cme-daemon-state.json.
 * Returns ISO string or null if unavailable.
 */
function readDaemonLastHeartbeat(): string | null {
  try {
    if (!fs.existsSync(DAEMON_STATE_FILE)) return null;
    const raw = fs.readFileSync(DAEMON_STATE_FILE, "utf-8");
    const state = JSON.parse(raw);
    return state.lastHeartbeat ?? null;
  } catch {
    return null;
  }
}

// ─── Session → MonitoredProcess ───

function sessionsToProcesses(): MonitoredProcess[] {
  const { sessions } = getUnifiedSessions({ includeOrphans: false });

  // Build agent DTOs from broadcast bus
  const agentEvents = getActiveAgentEvents();
  const agentDTOs: AgentDTO[] = agentEvents.map((ev) => ({
    id: ev.id,
    department: ev.department,
    task: ev.task,
    status: ev.status,
    timestamp: ev.timestamp,
    ...(ev.parentPid !== undefined ? { parentPid: ev.parentPid } : {}),
    ...(ev.sessionId !== undefined ? { sessionId: ev.sessionId } : {}),
  }));

  // Integrate file-tracked sub-agents into agent list
  const subAgents = getActiveSubAgents();
  if (subAgents.length > 0) {
    const heartbeat = readHeartbeat();
    const heartbeatPid = heartbeat?.pid;
    const subAgentEvents = toAgentEvents(subAgents, heartbeatPid);
    for (const ev of subAgentEvents) {
      agentDTOs.push({
        id: ev.id,
        department: ev.department,
        task: ev.task,
        status: ev.status,
        timestamp: ev.timestamp,
        ...(ev.parentPid !== undefined ? { parentPid: ev.parentPid } : {}),
      });
    }
  }

  const now = Date.now();
  const processes: MonitoredProcess[] = [];

  // G5: Read daemon heartbeat once for all daemon sessions
  const daemonHeartbeat = readDaemonLastHeartbeat();

  for (const session of sessions) {
    const dto = toDTOWithAgents(session, agentDTOs);
    const startedAtMs = new Date(dto.startedAt).getTime();
    const elapsedMs = now - startedAtMs;

    // G5: For daemon sessions, use lastHeartbeat as lastActivity if available
    const isDaemon = dto.type === "daemon";
    const sessionLastActivity = isDaemon && daemonHeartbeat
      ? daemonHeartbeat
      : dto.startedAt;

    // Session itself
    const isInteractive = dto.type === "interactive";
    const proc: MonitoredProcess = {
      id: `session-${dto.pid}`,
      type: "session",
      label: `PID ${dto.pid}`,
      department: dto.department ?? dto.target,
      description: dto.currentTask ?? `${dto.type}: ${dto.target}`,
      status: dto.status === "active" ? "running" : "error",
      startedAt: dto.startedAt,
      lastActivity: sessionLastActivity,
      elapsedMs,
      killable: !isInteractive, // cannot kill the boss's own session
      killMethod: "pid",
      pid: dto.pid,
      meta: {
        sessionType: dto.type,
        target: dto.target,
        ...(dto.taskId ? { taskId: dto.taskId } : {}),
        agentCount: dto.agentCount,
        ...(isDaemon ? { expectedDurationMs: EXPECTED_DURATION_MS["daemon"] } : {}),
      },
      children: [],
    };

    // Nested agents as children
    for (const agent of dto.agents) {
      const agentStartMs = agent.timestamp;
      const agentElapsed = now - agentStartMs;
      const isLongRunning =
        agent.status === "running" && agentElapsed > LONG_RUNNING_THRESHOLD_MS;

      // G4: Expected duration hint based on agent ID pattern
      const childExpectedKey = agent.id.includes("plan") ? "sub-agent-plan" : "sub-agent-explore";

      proc.children!.push({
        id: agent.id,
        type: "sub-agent",
        label: agent.id,
        department: agent.department,
        description: agent.task ?? "Agent running",
        status: isLongRunning ? "stale" : agent.status === "running" ? "running" : agent.status === "done" ? "done" : "error",
        startedAt: new Date(agentStartMs).toISOString(),
        lastActivity: new Date(agentStartMs).toISOString(),
        elapsedMs: agentElapsed,
        killable: agent.status === "running",
        killMethod: "agent",
        agentId: agent.id,
        pid: dto.pid,
        meta: {
          isLongRunning,
          expectedDurationMs: EXPECTED_DURATION_MS[childExpectedKey] ?? 120_000,
        },
      });
    }

    processes.push(proc);
  }

  return processes;
}

// ─── Sub-Agent File Mtime (G1 heartbeat) ───

/**
 * Read the mtime of .claude/sub-agents.json as a proxy heartbeat.
 * Any write (start, done, error) from track-subagent.ts updates the file mtime,
 * giving us a "last activity" signal for the sub-agent pool.
 */
function getSubAgentFileMtime(): number | null {
  try {
    if (!fs.existsSync(SUB_AGENTS_FILE)) return null;
    return fs.statSync(SUB_AGENTS_FILE).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Check if the heartbeat host PID (interactive Claude Code session) is alive.
 * Returns true if the PID exists and is reachable.
 */
function isHeartbeatHostAlive(): boolean {
  const heartbeat = readHeartbeat();
  if (!heartbeat) return false;
  try {
    process.kill(heartbeat.pid, 0);
    return true;
  } catch {
    if (process.platform === "win32") {
      try {
        const output = execSync(
          `tasklist /FI "PID eq ${heartbeat.pid}" /NH`,
          { encoding: "utf-8", timeout: 3000, windowsHide: true }
        );
        return output.includes(String(heartbeat.pid));
      } catch {
        return false;
      }
    }
    return false;
  }
}

// ─── Standalone Sub-Agents (not attached to a session) ───

function standaloneSubAgentsToProcesses(
  sessionProcesses: MonitoredProcess[]
): MonitoredProcess[] {
  const subAgents = getActiveSubAgents();
  const now = Date.now();

  // Collect all agent IDs already nested under sessions
  const nestedAgentIds = new Set<string>();
  for (const sp of sessionProcesses) {
    for (const child of sp.children ?? []) {
      nestedAgentIds.add(child.id);
    }
  }

  // G1: Use file mtime as a proxy heartbeat for sub-agents
  const fileMtime = getSubAgentFileMtime();
  const hostPidAlive = isHeartbeatHostAlive();

  const standalone: MonitoredProcess[] = [];
  for (const sa of subAgents) {
    const fullId = `subagent-${sa.id}`;
    if (nestedAgentIds.has(fullId)) continue; // already nested under a session

    const elapsedMs = now - sa.startedAt;
    const isLongRunning = sa.status === "running" && elapsedMs > LONG_RUNNING_THRESHOLD_MS;

    // G1: Use the later of startedAt and file mtime as lastActivity
    const lastActivityMs = sa.completedAt
      ? sa.completedAt
      : fileMtime && fileMtime > sa.startedAt
        ? fileMtime
        : sa.startedAt;

    // G4: Expected duration hint based on sub-agent type
    const expectedKey = sa.id.includes("plan") ? "sub-agent-plan" : "sub-agent-explore";

    standalone.push({
      id: fullId,
      type: "sub-agent",
      label: sa.id,
      department: sa.department,
      description: sa.description,
      status: isLongRunning ? "stale" : sa.status === "running" ? "running" : sa.status === "done" ? "done" : "error",
      startedAt: new Date(sa.startedAt).toISOString(),
      lastActivity: new Date(lastActivityMs).toISOString(),
      elapsedMs,
      killable: sa.status === "running",
      killMethod: "agent",
      agentId: fullId,
      meta: {
        isLongRunning,
        hostPidAlive,
        expectedDurationMs: EXPECTED_DURATION_MS[expectedKey] ?? 120_000,
      },
    });
  }

  return standalone;
}

// ─── Company Tasks → MonitoredProcess ───

async function tasksToProcesses(): Promise<MonitoredProcess[]> {
  try {
    const tasks = await getOpenTasks({ status: "in_progress", limit: 50 });
    const now = Date.now();

    return tasks.map((task) => {
      const startedAtMs = task.startedAt
        ? new Date(task.startedAt).getTime()
        : new Date(task.createdAt).getTime();
      const elapsedMs = now - startedAtMs;
      const isStale = elapsedMs > TASK_STALE_THRESHOLD_MS;

      return {
        id: `task-${task.id}`,
        type: "task" as const,
        label: `#${task.seqNum ?? task.id.slice(0, 8)}`,
        department: task.department,
        description: task.title,
        status: isStale ? ("stale" as const) : ("running" as const),
        startedAt: task.startedAt ?? task.createdAt,
        lastActivity: task.startedAt ?? task.createdAt,
        elapsedMs,
        killable: true,
        killMethod: "task-reset" as const,
        taskId: task.id,
        meta: {
          priority: task.priority,
          assignedTo: task.assignedTo ?? "unassigned",
          ...(task.resultSummary ? { resultSummary: task.resultSummary } : {}),
        },
      };
    });
  } catch {
    // Supabase unavailable — skip tasks gracefully
    return [];
  }
}

// ─── Data Connector Syncs (G2) ───

/**
 * Query connector_sync_log for running syncs and convert to MonitoredProcess[].
 * These are read-only — no kill action available.
 */
async function dataConnectorSyncsToProcesses(): Promise<MonitoredProcess[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("connector_sync_log")
      .select("id, source_id, sync_type, phase, status, started_at, items_fetched, items_inserted, items_updated, items_skipped, errors")
      .eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(20);

    if (error || !data) return [];

    const now = Date.now();
    return data.map((row) => {
      const r = row as Record<string, unknown>;
      const startedAt = r.started_at as string;
      const startedAtMs = new Date(startedAt).getTime();
      const elapsedMs = now - startedAtMs;
      const sourceId = r.source_id as string;
      const syncType = r.sync_type as string;
      const phase = r.phase as string | null;
      const itemsFetched = (r.items_fetched as number) ?? 0;
      const itemsInserted = (r.items_inserted as number) ?? 0;
      const itemsUpdated = (r.items_updated as number) ?? 0;
      const itemsSkipped = (r.items_skipped as number) ?? 0;
      const errors = (r.errors as number) ?? 0;
      const totalProcessed = itemsInserted + itemsUpdated + itemsSkipped;

      return {
        id: `sync-${r.id as string}`,
        type: "data-connector-sync" as const,
        label: sourceId,
        department: "data-engineering",
        description: phase ? `${syncType} — ${phase}` : syncType,
        status: "running" as const,
        startedAt,
        lastActivity: startedAt, // syncs don't have a heartbeat; startedAt is best estimate
        elapsedMs,
        killable: false, // read-only — no kill for syncs
        meta: {
          syncType,
          ...(phase ? { phase } : {}),
          itemsFetched,
          recordsProcessed: totalProcessed,
          errors,
          expectedDurationMs: EXPECTED_DURATION_MS["data-connector-sync"],
        },
      };
    });
  } catch {
    // Supabase unavailable — skip gracefully
    return [];
  }
}

// ─── OS-Level Node.exe Discovery (G6 — task #1071) ───

/**
 * Discover ALL node.exe processes at the OS level via wmic/tasklist.
 * Merges with already-tracked processes by PID to avoid duplicates.
 * Untracked processes become MonitoredProcess with type "os-node-process".
 *
 * This closes the visibility gap: previously, only registered processes
 * (via heartbeat/session tracker) were visible. Zombie processes spawned
 * by crashed daemons or abandoned task-runners were invisible.
 */
function osNodeProcessesToProcesses(
  trackedPids: Set<number>
): MonitoredProcess[] {
  try {
    const osProcesses = discoverOSNodeProcesses();
    const now = Date.now();
    const results: MonitoredProcess[] = [];

    for (const osp of osProcesses) {
      // Skip processes already tracked by other sources (deduplicate by PID)
      if (trackedPids.has(osp.pid)) continue;

      // Skip the current process — it's always tracked implicitly
      if (osp.pid === process.pid) continue;

      const category = osp.category;
      const label = CATEGORY_LABELS[category];
      const memMB = (osp.memoryBytes / (1024 * 1024)).toFixed(1);

      // Parse creation date for uptime
      let startedAt = new Date().toISOString();
      let elapsedMs = 0;
      if (osp.creationDate && osp.creationDate.length >= 14) {
        const year = osp.creationDate.substring(0, 4);
        const month = osp.creationDate.substring(4, 6);
        const day = osp.creationDate.substring(6, 8);
        const hour = osp.creationDate.substring(8, 10);
        const min = osp.creationDate.substring(10, 12);
        const sec = osp.creationDate.substring(12, 14);
        const d = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
        if (!isNaN(d.getTime())) {
          startedAt = d.toISOString();
          elapsedMs = now - d.getTime();
        }
      }

      // Flag as stale if running longer than 30 minutes for killable categories
      const isStale = osp.killable && elapsedMs > 30 * 60 * 1000;

      // Truncate command line for display
      const cmdShort = osp.commandLine.length > 120
        ? osp.commandLine.substring(0, 117) + "..."
        : osp.commandLine;

      results.push({
        id: `os-node-${osp.pid}`,
        type: "os-node-process",
        label: `${label} (PID ${osp.pid})`,
        department: category === "daemon" ? "operations"
          : category === "task-runner" ? "operations"
          : category === "nextjs-dev" ? "architecture"
          : category === "worker" ? "architecture"
          : "unknown",
        description: cmdShort,
        status: isStale ? "stale" : "running",
        startedAt,
        lastActivity: startedAt,
        elapsedMs,
        killable: osp.killable,
        killMethod: osp.killable ? "os-kill" : undefined,
        pid: osp.pid,
        meta: {
          osCategory: category,
          memoryMB: parseFloat(memMB),
          memoryBytes: osp.memoryBytes,
          memoryFormatted: selfPreservationFormatBytes(osp.memoryBytes),
          parentPid: osp.parentPid,
          commandLine: osp.commandLine,
          sacred: !osp.killable && (category === "self" || category === "vscode"),
        },
      });
    }

    return results;
  } catch {
    // OS discovery failed — non-fatal, skip gracefully
    return [];
  }
}

// ─── Public API ───

/**
 * Get all running processes across all data sources, merged into a unified schema.
 * Sorted: running first, then by startedAt descending.
 *
 * Sources:
 *   1. Session tracker (in-memory + file-based)
 *   2. Sub-agent tracker (.claude/sub-agents.json)
 *   3. Company tasks in_progress (Supabase)
 *   4. Data connector syncs (Supabase)
 *   5. Trading scheduler heartbeat (file)
 *   6. OS-level node.exe discovery via wmic (G6 — task #1071)
 */
export async function getUnifiedProcesses(): Promise<MonitoredProcess[]> {
  // Gather from all sources — sessions and sub-agents are sync, tasks and syncs are async
  const sessionProcesses = sessionsToProcesses();
  const standaloneAgents = standaloneSubAgentsToProcesses(sessionProcesses);
  const [taskProcesses, syncProcesses] = await Promise.all([
    tasksToProcesses(),
    dataConnectorSyncsToProcesses(),
  ]);

  // Trading heartbeat (sync file read)
  const tradingScheduler = readTradingSchedulerHeartbeat();

  // G6: Collect all already-tracked PIDs to deduplicate against OS discovery
  const trackedPids = new Set<number>();
  for (const p of sessionProcesses) {
    if (p.pid) trackedPids.add(p.pid);
    for (const child of p.children ?? []) {
      if (child.pid) trackedPids.add(child.pid);
    }
  }
  for (const p of standaloneAgents) {
    if (p.pid) trackedPids.add(p.pid);
  }
  if (tradingScheduler?.pid) trackedPids.add(tradingScheduler.pid);

  // G6: OS-level discovery — finds zombie processes not tracked by any other source
  const osProcesses = osNodeProcessesToProcesses(trackedPids);

  const all: MonitoredProcess[] = [
    ...sessionProcesses,
    ...standaloneAgents,
    ...taskProcesses,
    ...syncProcesses,
    ...(tradingScheduler ? [tradingScheduler] : []),
    ...osProcesses,
  ];

  // Sort: running first, then by startedAt descending
  const statusOrder: Record<string, number> = {
    running: 0,
    stale: 1,
    error: 2,
    done: 3,
  };

  all.sort((a, b) => {
    const statusDiff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (statusDiff !== 0) return statusDiff;
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });

  return all;
}

/**
 * Compute summary statistics from a list of monitored processes.
 */
export function computeSummary(processes: MonitoredProcess[]): ProcessSummary {
  let running = 0;
  let stale = 0;
  let killable = 0;

  for (const p of processes) {
    if (p.status === "running") running++;
    if (p.status === "stale") stale++;
    if (p.killable) killable++;

    // Count children too
    for (const child of p.children ?? []) {
      if (child.status === "running") running++;
      if (child.status === "stale") stale++;
      if (child.killable) killable++;
    }
  }

  return {
    total: processes.length,
    running,
    stale,
    killable,
  };
}

/**
 * Kill a process by id and type. Dispatches to the correct kill mechanism.
 * Returns { ok, message } indicating success or failure.
 */
export async function killProcess(
  id: string,
  type: MonitoredProcess["type"]
): Promise<{ ok: boolean; message: string }> {
  // ─── Task reset ───
  if (type === "task") {
    const taskId = id.replace(/^task-/, "");
    try {
      await resetTask(taskId);
      return { ok: true, message: `Task ${taskId} reset to open` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Failed to reset task: ${msg}` };
    }
  }

  // ─── Sub-agent kill ───
  if (type === "sub-agent") {
    const agentId = id.replace(/^subagent-/, "");
    const killed = killSubAgent(agentId);
    return {
      ok: killed,
      message: killed
        ? `Sub-agent ${agentId} marked as error`
        : `Sub-agent ${agentId} not found or already completed`,
    };
  }

  // ─── Session kill (OS-level) ───
  if (type === "session") {
    const pidStr = id.replace(/^session-/, "");
    const pid = parseInt(pidStr, 10);
    if (isNaN(pid) || pid <= 0) {
      return { ok: false, message: `Invalid PID: ${pidStr}` };
    }

    try {
      // Try Layer 1 (ChildProcess) first
      const { sessions } = getUnifiedSessions({ includeOrphans: false });
      const tracked = sessions.find((s) => s.pid === pid);

      if (tracked?.sessionId) {
        const activeSession = getSession(tracked.sessionId);
        if (activeSession?.child) {
          markSessionClosing(pid);
          activeSession.child.kill("SIGTERM");
          deleteSession(tracked.sessionId);
          return { ok: true, message: `SIGTERM sent to PID ${pid}` };
        }
      }

      // Fallback to OS kill
      markSessionClosing(pid);
      if (process.platform === "win32") {
        execSync(`taskkill /F /T /PID ${pid}`, {
          windowsHide: true,
          timeout: 5000,
        });
      } else {
        process.kill(pid, "SIGTERM");
      }
      unregisterSession(pid);
      clearOutputRing(pid);
      return { ok: true, message: `Process ${pid} killed` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Kill failed: ${msg}` };
    }
  }

  // ─── Trading scheduler kill ───
  if (type === "trading-scheduler") {
    const pidStr = id.replace(/^trading-scheduler-/, "");
    const pid = parseInt(pidStr, 10);
    if (isNaN(pid) || pid <= 0) {
      return { ok: false, message: `Invalid trading scheduler PID: ${pidStr}` };
    }

    try {
      if (process.platform === "win32") {
        execSync(`taskkill /F /T /PID ${pid}`, {
          windowsHide: true,
          timeout: 5000,
        });
      } else {
        process.kill(pid, "SIGTERM");
      }
      // Clean up heartbeat file
      try {
        if (fs.existsSync(TRADING_HEARTBEAT_FILE)) {
          fs.unlinkSync(TRADING_HEARTBEAT_FILE);
        }
      } catch { /* best effort */ }
      return { ok: true, message: `Trading scheduler PID ${pid} killed` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Kill failed: ${msg}` };
    }
  }

  // ─── Trading pipeline ───
  if (type === "trading-pipeline") {
    return { ok: false, message: "Trading pipeline runs are read-only (short-lived)" };
  }

  // ─── Data connector sync ───
  if (type === "data-connector-sync") {
    return { ok: false, message: "Data connector syncs are read-only" };
  }

  // ─── OS-level node.exe process kill (G6 — task #1071) ───
  if (type === "os-node-process") {
    const pidStr = id.replace(/^os-node-/, "");
    const pid = parseInt(pidStr, 10);
    if (isNaN(pid) || pid <= 0) {
      return { ok: false, message: `Invalid PID: ${pidStr}` };
    }

    // Import sacred check to prevent killing critical processes
    const { isSacred: checkSacred, killPid: osKillPid } = await import("@/lib/company/self-preservation");
    if (checkSacred(pid)) {
      return { ok: false, message: `PID ${pid} is sacred (self or parent chain) — cannot kill` };
    }

    try {
      const success = osKillPid(pid);
      return success
        ? { ok: true, message: `OS process PID ${pid} killed` }
        : { ok: false, message: `Failed to kill PID ${pid} — process may have already exited` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Kill failed: ${msg}` };
    }
  }

  return { ok: false, message: `Unknown process type: ${type}` };
}
