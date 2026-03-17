/**
 * Shared session store for Company chat + Active Session Tracker.
 *
 * Two layers:
 *   1. ActiveSession (existing) — Map<sessionId, {child, target}> for multi-turn
 *      interactive `claude -p` subprocesses. Used by /api/console/company/*.
 *
 *   2. TrackedSession (new) — Registry of ALL known Claude-related processes
 *      across the system: console sessions, task-runner, daemon.
 *      Each entry tracks PID (if applicable), type, target, start time.
 *
 * Cross-process sharing:
 *   - Console sessions: tracked in-memory (same Node process as Next.js server)
 *   - Task-runner & daemon: write to a shared JSON file (company/.active-sessions.json)
 *     that the API endpoint reads. File-based because they run as separate processes.
 *
 * The tracker also provides `discoverOrphanSessions()` which scans OS processes
 * for `claude` instances not in the registry (e.g. manually spawned).
 *
 * ADR-005: Extended with parentPid, currentTask, department, sessionId fields.
 *          In-memory ring buffer for terminal output (500 lines per session).
 *          outputBus EventEmitter for SSE fan-out.
 *
 * ADR: Process-level tracking (not per-request). Designed for Windows (wmic/tasklist).
 */

import { execSync } from "child_process";
import { EventEmitter } from "events";
import * as fs from "fs";
import * as path from "path";
import type { ChildProcess } from "child_process";

// ─── Layer 1: Interactive Console Sessions (backward compat) ───

interface ActiveSession {
  child: ChildProcess;
  target: string;
}

const sessions = new Map<string, ActiveSession>();

export function setSession(id: string, session: ActiveSession) {
  sessions.set(id, session);
}

export function getSession(id: string) {
  return sessions.get(id);
}

export function deleteSession(id: string) {
  sessions.delete(id);
}

// ─── Layer 2: Tracked Session Registry ───

export type SessionType = "console" | "task-runner" | "daemon" | "interactive";

export interface TrackedSession {
  /** OS process ID (if a child process was spawned), or the script's own PID */
  pid: number;
  /** Type of session */
  type: SessionType;
  /** Target identifier — e.g. "cme", "ufficio-legale", "task-runner", "daemon-sensor" */
  target: string;
  /** Associated task ID (for task-runner sessions) */
  taskId?: string;
  /** When the session started */
  startedAt: Date;
  /** Current status */
  status: "active" | "closing";

  // ─── ADR-005 new fields ───

  /** Human-readable description of what this terminal is currently doing.
   *  Set by the spawner at launch time and updated via broadcastAgentEvent(). */
  currentTask?: string;

  /** Department this terminal belongs to (e.g. "cme", "ufficio-legale").
   *  Redundant with target for some session types, explicit for daemon/task-runner. */
  department?: string;

  /** PID of the parent terminal that spawned this process.
   *  Used to build the terminal -> sub-agent tree.
   *  Absent for top-level terminals (e.g. the interactive Claude Code session). */
  parentPid?: number;

  /** sessionId from Layer 1 (the interactive sessions Map).
   *  Bridges Layer 1 and Layer 2 for sessions started via /api/console/company. */
  sessionId?: string;
}

/** Serializable agent DTO for inclusion in TrackedSessionDTO */
export interface AgentDTO {
  id: string;
  department: string;
  task?: string;
  status: "running" | "done" | "error";
  timestamp: number;
}

/**
 * Serializable version of TrackedSession for API responses.
 * Dates are ISO strings.
 */
export interface TrackedSessionDTO {
  pid: number;
  type: SessionType;
  target: string;
  taskId?: string;
  startedAt: string;
  status: "active" | "closing";
  currentTask?: string;
  department?: string;
  parentPid?: number;
  sessionId?: string;
  /** Agents whose parentPid matches this session's pid — synthesized at response time */
  agents: AgentDTO[];
  agentCount: number;
}

// ─── Output Ring Buffer (ADR-005) ───

const OUTPUT_RING_SIZE = 500; // lines

interface OutputRing {
  lines: string[];
  head: number;   // index of next write slot (circular, 0-based)
  total: number;  // total lines ever written (monotonic cursor for subscribers)
}

// Singleton ring buffer map, keyed by PID
const globalForOutput = globalThis as unknown as {
  __outputRings?: Map<number, OutputRing>;
  __outputBus?: EventEmitter;
};

if (!globalForOutput.__outputRings) {
  globalForOutput.__outputRings = new Map<number, OutputRing>();
}
if (!globalForOutput.__outputBus) {
  globalForOutput.__outputBus = new EventEmitter();
  globalForOutput.__outputBus.setMaxListeners(50);
}

const outputRings = globalForOutput.__outputRings;
const outputBus = globalForOutput.__outputBus;

/**
 * Append a line to the ring buffer for a PID.
 * Automatically fans out to SSE subscribers via outputBus.
 */
export function appendOutputLine(pid: number, line: string): void {
  let ring = outputRings.get(pid);
  if (!ring) {
    ring = { lines: new Array(OUTPUT_RING_SIZE), head: 0, total: 0 };
    outputRings.set(pid, ring);
  }

  // Write into circular slot
  ring.lines[ring.head] = line;
  ring.head = (ring.head + 1) % OUTPUT_RING_SIZE;
  ring.total++;

  // Fan out to SSE subscribers (no-op if no listeners)
  const index = ring.total - 1;
  const stream = line.startsWith("[STDERR]") ? "stderr" : "stdout";
  outputBus.emit(`output:${pid}`, { line, index, stream });
}

/**
 * Get buffered output lines for a PID.
 * Returns ordered lines (oldest first) and the next cursor index.
 * @param sinceIndex  If provided, only lines with index >= sinceIndex are returned.
 */
export function getOutputLines(
  pid: number,
  sinceIndex?: number
): { lines: string[]; nextIndex: number } {
  const ring = outputRings.get(pid);
  if (!ring || ring.total === 0) {
    return { lines: [], nextIndex: 0 };
  }

  // Reconstruct ordered lines from circular buffer
  const stored = Math.min(ring.total, OUTPUT_RING_SIZE);
  const orderedLines: string[] = [];
  const oldestSlot = ring.total > OUTPUT_RING_SIZE
    ? ring.head  // head is the oldest when buffer is full
    : 0;         // buffer not yet wrapped — oldest is slot 0

  for (let i = 0; i < stored; i++) {
    const slot = (oldestSlot + i) % OUTPUT_RING_SIZE;
    const line = ring.lines[slot];
    if (line !== undefined) {
      orderedLines.push(line);
    }
  }

  // Filter by sinceIndex if requested
  const firstIndex = ring.total - stored;
  if (sinceIndex !== undefined && sinceIndex > firstIndex) {
    const offset = sinceIndex - firstIndex;
    return {
      lines: orderedLines.slice(offset),
      nextIndex: ring.total,
    };
  }

  return { lines: orderedLines, nextIndex: ring.total };
}

/**
 * Clear the ring buffer for a PID (called on session cleanup).
 */
export function clearOutputRing(pid: number): void {
  outputRings.delete(pid);
  // Remove all listeners for this pid's output channel
  outputBus.removeAllListeners(`output:${pid}`);
}

/**
 * Subscribe to new output lines for a PID.
 * Returns an unsubscribe function.
 */
export function onOutputLine(
  pid: number,
  cb: (ev: { line: string; index: number; stream: string }) => void
): () => void {
  const event = `output:${pid}`;
  outputBus.on(event, cb);
  return () => outputBus.off(event, cb);
}

// ─── In-Memory Registry (for console sessions in the Next.js process) ───

const trackedSessions = new Map<number, TrackedSession>();

/**
 * Register a session in the in-memory tracker.
 * Uses PID as unique key — if a PID is re-registered, the old entry is overwritten.
 */
export function registerSession(session: TrackedSession): void {
  trackedSessions.set(session.pid, session);
}

/**
 * Unregister a session by PID from the in-memory tracker.
 */
export function unregisterSession(pid: number): void {
  trackedSessions.delete(pid);
}

/**
 * Mark a session as closing (graceful shutdown in progress).
 */
export function markSessionClosing(pid: number): void {
  const session = trackedSessions.get(pid);
  if (session) {
    session.status = "closing";
  }
}

/**
 * Get all in-memory registered sessions.
 */
export function getAllSessions(): TrackedSession[] {
  return Array.from(trackedSessions.values());
}

/**
 * Get count of active (non-closing) in-memory sessions.
 */
export function getActiveCount(): number {
  let count = 0;
  trackedSessions.forEach((session) => {
    if (session.status === "active") count++;
  });
  return count;
}

/**
 * Prune dead sessions: check if PIDs are still alive, remove those that aren't.
 * This handles cases where a process crashed without cleanup.
 */
export function pruneDeadSessions(): number {
  let pruned = 0;
  const pidsToRemove: number[] = [];
  trackedSessions.forEach((_, pid) => {
    if (!isProcessAlive(pid)) {
      pidsToRemove.push(pid);
    }
  });
  for (const pid of pidsToRemove) {
    trackedSessions.delete(pid);
    pruned++;
  }
  return pruned;
}

// ─── File-Based Registry (for cross-process sharing) ───

/**
 * Shared file path where task-runner and daemon write their session state.
 * The Next.js API reads this file to include external sessions.
 */
const SESSIONS_FILE = path.resolve(
  process.cwd(),
  "company",
  ".active-sessions.json"
);

/**
 * Heartbeat file for interactive Claude Code sessions.
 * Written by the /api/company/sessions/heartbeat endpoint,
 * read by getUnifiedSessions() to detect active interactive sessions.
 * Located in .claude/ which is gitignored.
 */
const HEARTBEAT_FILE = path.resolve(
  process.cwd(),
  ".claude",
  "heartbeat.json"
);

/** Max age (ms) for a heartbeat to be considered active — 30 seconds */
const HEARTBEAT_MAX_AGE_MS = 30_000;

interface HeartbeatData {
  active: boolean;
  pid: number;
  startedAt: string; // ISO
  lastHeartbeat: string; // ISO
  type: "interactive";
  target: string;
}

/**
 * Write a heartbeat for the current interactive Claude Code session.
 * Called periodically by the client-side /ops page via API.
 */
export function writeHeartbeat(pid: number, target?: string): void {
  try {
    const dir = path.dirname(HEARTBEAT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let existing: HeartbeatData | null = null;
    try {
      if (fs.existsSync(HEARTBEAT_FILE)) {
        existing = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, "utf-8"));
      }
    } catch { /* ignore parse errors */ }

    const data: HeartbeatData = {
      active: true,
      pid,
      startedAt: existing?.startedAt ?? new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      type: "interactive",
      target: target ?? "interactive",
    };

    fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // Best effort — don't crash if write fails
  }
}

/**
 * Clear the heartbeat (mark session as inactive).
 */
export function clearHeartbeat(): void {
  try {
    if (fs.existsSync(HEARTBEAT_FILE)) {
      fs.unlinkSync(HEARTBEAT_FILE);
    }
  } catch {
    // Best effort
  }
}

/**
 * Read the heartbeat file and return a TrackedSession if it's still fresh.
 * Returns null if no heartbeat, stale, or inactive.
 */
export function readHeartbeat(): TrackedSession | null {
  try {
    if (!fs.existsSync(HEARTBEAT_FILE)) return null;
    const raw = fs.readFileSync(HEARTBEAT_FILE, "utf-8");
    const data: HeartbeatData = JSON.parse(raw);

    if (!data.active) return null;

    // Check freshness — heartbeat must be younger than HEARTBEAT_MAX_AGE_MS
    const age = Date.now() - new Date(data.lastHeartbeat).getTime();
    if (age > HEARTBEAT_MAX_AGE_MS) {
      // Stale heartbeat — clean up
      try { fs.unlinkSync(HEARTBEAT_FILE); } catch { /* ignore */ }
      return null;
    }

    return {
      pid: data.pid,
      type: "interactive",
      target: data.target,
      startedAt: new Date(data.startedAt),
      status: "active",
    };
  } catch {
    return null;
  }
}

interface FileSessionEntry {
  pid: number;
  type: SessionType;
  target: string;
  taskId?: string;
  startedAt: string; // ISO
  status: "active" | "closing";
}

/**
 * Read sessions from the shared file.
 * Returns only entries whose PIDs are still alive (auto-prune dead entries).
 */
export function readFileRegistry(): TrackedSession[] {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return [];
    const raw = fs.readFileSync(SESSIONS_FILE, "utf-8");
    const entries: FileSessionEntry[] = JSON.parse(raw);
    if (!Array.isArray(entries)) return [];

    const alive: TrackedSession[] = [];
    for (const entry of entries) {
      if (isProcessAlive(entry.pid)) {
        alive.push({
          pid: entry.pid,
          type: entry.type,
          target: entry.target,
          taskId: entry.taskId,
          startedAt: new Date(entry.startedAt),
          status: entry.status,
        });
      }
    }

    // If we pruned dead entries, rewrite the file
    if (alive.length !== entries.length) {
      writeFileRegistryRaw(alive.map(toFileEntry));
    }

    return alive;
  } catch {
    return [];
  }
}

/**
 * Register a session in the shared file (used by task-runner and daemon scripts).
 * Thread-safe: reads current file, adds/updates entry, writes back.
 */
export function fileRegisterSession(session: {
  pid: number;
  type: SessionType;
  target: string;
  taskId?: string;
  startedAt?: Date;
  status?: "active" | "closing";
}): void {
  try {
    const entries = readFileEntries();
    const existing = entries.findIndex((e) => e.pid === session.pid);
    const entry: FileSessionEntry = {
      pid: session.pid,
      type: session.type,
      target: session.target,
      taskId: session.taskId,
      startedAt: (session.startedAt ?? new Date()).toISOString(),
      status: session.status ?? "active",
    };

    if (existing >= 0) {
      entries[existing] = entry;
    } else {
      entries.push(entry);
    }

    writeFileRegistryRaw(entries);
  } catch {
    // Best effort — don't crash the script if file write fails
  }
}

/**
 * Unregister a session from the shared file by PID.
 */
export function fileUnregisterSession(pid: number): void {
  try {
    const entries = readFileEntries().filter((e) => e.pid !== pid);
    writeFileRegistryRaw(entries);
  } catch {
    // Best effort
  }
}

function readFileEntries(): FileSessionEntry[] {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return [];
    const raw = fs.readFileSync(SESSIONS_FILE, "utf-8");
    const entries = JSON.parse(raw);
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function writeFileRegistryRaw(entries: FileSessionEntry[]): void {
  const dir = path.dirname(SESSIONS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

function toFileEntry(session: TrackedSession): FileSessionEntry {
  return {
    pid: session.pid,
    type: session.type,
    target: session.target,
    taskId: session.taskId,
    startedAt: session.startedAt.toISOString(),
    status: session.status,
  };
}

// ─── Sync Console Sessions → Tracker ───

/**
 * Sync the interactive console sessions (Layer 1) into the tracker (Layer 2).
 * Call this before returning session data to ensure consistency.
 */
export function syncConsoleSessions(): void {
  // Add console sessions that have a live child process
  sessions.forEach((active) => {
    const pid = active.child.pid;
    if (pid && !trackedSessions.has(pid)) {
      trackedSessions.set(pid, {
        pid,
        type: "console",
        target: active.target,
        startedAt: new Date(), // approximate — we don't have the exact start
        status: "active",
      });
    }
  });

  // Remove console entries from tracker whose PIDs are no longer in the sessions Map
  const consolePidsToRemove: number[] = [];
  trackedSessions.forEach((tracked, pid) => {
    if (tracked.type === "console") {
      let stillInMap = false;
      sessions.forEach((active) => {
        if (active.child.pid === pid) {
          stillInMap = true;
        }
      });
      if (!stillInMap) {
        consolePidsToRemove.push(pid);
      }
    }
  });
  for (const pid of consolePidsToRemove) {
    trackedSessions.delete(pid);
  }
}

/**
 * Get a unified view of ALL sessions: in-memory (console) + file-based (scripts) + orphans.
 * This is the main function the API endpoint should call.
 *
 * Steps:
 *   1. Sync console sessions (Layer 1 → Layer 2)
 *   2. Prune dead in-memory sessions
 *   3. Read file-based sessions (task-runner, daemon)
 *   4. Optionally discover orphan processes
 *   5. Deduplicate by PID
 */
export function getUnifiedSessions(options?: {
  includeOrphans?: boolean;
}): { sessions: TrackedSession[]; orphanCount: number } {
  // 1. Sync console sessions
  syncConsoleSessions();

  // 2. Prune dead in-memory sessions
  pruneDeadSessions();

  // 3. Collect in-memory sessions (console)
  const allByPid = new Map<number, TrackedSession>();
  trackedSessions.forEach((session) => {
    allByPid.set(session.pid, session);
  });

  // 4. Read file-based sessions (task-runner, daemon) — dedup by PID
  for (const session of readFileRegistry()) {
    if (!allByPid.has(session.pid)) {
      allByPid.set(session.pid, session);
    }
  }

  // 5. Discover orphans if requested
  let orphanCount = 0;
  if (options?.includeOrphans) {
    const orphans = discoverOrphanSessions();
    orphanCount = orphans.length;
    for (const orphan of orphans) {
      if (!allByPid.has(orphan.pid)) {
        allByPid.set(orphan.pid, orphan);
      }
    }
  }

  // 6. Read heartbeat for interactive Claude Code session
  const heartbeatSession = readHeartbeat();
  if (heartbeatSession && !allByPid.has(heartbeatSession.pid)) {
    allByPid.set(heartbeatSession.pid, heartbeatSession);
  }

  return {
    sessions: Array.from(allByPid.values()),
    orphanCount,
  };
}

// ─── Orphan Discovery ───

interface DiscoveredProcess {
  pid: number;
  commandLine: string;
}

/**
 * Discover `claude` processes running on the system that are NOT in the registry.
 * Uses platform-appropriate commands:
 *   - Windows: `wmic process` for command line + PID
 *   - Unix: `ps aux | grep claude`
 *
 * Returns TrackedSession entries with type inferred from command line args.
 */
export function discoverOrphanSessions(): TrackedSession[] {
  // Collect all known PIDs from both in-memory and file registries
  const knownPids = new Set<number>(Array.from(trackedSessions.keys()));
  for (const session of readFileEntries()) {
    knownPids.add(session.pid);
  }

  const discovered: DiscoveredProcess[] = [];

  try {
    if (process.platform === "win32") {
      // Use wmic /format:list to avoid CSV quoting issues (commas inside CommandLine)
      // List format outputs key=value pairs separated by blank lines:
      //   CommandLine=C:\path\to\claude.exe --args
      //   ProcessId=12345
      const output = execSync(
        'wmic process where "name like \'%claude%\' or commandline like \'%claude%\'" get ProcessId,CommandLine /format:list',
        { encoding: "utf-8", timeout: 5000, windowsHide: true }
      ).trim();

      // Split by double newlines to get one block per process
      const blocks = output.split(/\r?\n\r?\n/);
      for (const block of blocks) {
        const lines = block.trim().split(/\r?\n/);
        let commandLine = "";
        let pid = 0;
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.toLowerCase().startsWith("commandline=")) {
            commandLine = trimmed.slice("commandline=".length).trim();
          } else if (trimmed.toLowerCase().startsWith("processid=")) {
            pid = parseInt(trimmed.slice("processid=".length).trim(), 10);
          }
        }
        if (pid > 0 && commandLine) {
          discovered.push({ pid, commandLine });
        }
      }
    } else {
      // Unix/macOS: ps aux filtered for claude
      const output = execSync(
        "ps aux | grep -i claude | grep -v grep",
        { encoding: "utf-8", timeout: 5000 }
      ).trim();

      for (const line of output.split("\n")) {
        if (!line.trim()) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[1], 10);
        if (isNaN(pid)) continue;
        const commandLine = parts.slice(10).join(" ");
        discovered.push({ pid, commandLine });
      }
    }
  } catch {
    // Command failed (no claude processes, or command not available) — not an error
    return [];
  }

  // Filter out already-known PIDs, our own process, and the parent process
  // (which is typically the boss's terminal/shell that spawned this Node server)
  const myPid = process.pid;
  const parentPid = process.ppid;
  const orphans: TrackedSession[] = [];

  for (const proc of discovered) {
    if (knownPids.has(proc.pid) || proc.pid === myPid || proc.pid === parentPid) continue;

    // Infer type from command line
    const type = inferSessionType(proc.commandLine);

    const target = inferTarget(proc.commandLine);

    orphans.push({
      pid: proc.pid,
      type,
      target,
      startedAt: new Date(), // We don't know when it started — use now as fallback
      status: "active",
    });
  }

  return orphans;
}

// ─── Helpers ───

function inferSessionType(commandLine: string): SessionType {
  const cl = commandLine.toLowerCase();
  if (cl.includes("task-runner")) return "task-runner";
  if (cl.includes("cme-autorun") || cl.includes("daemon")) return "daemon";

  // If the command has no -p or --print flag, it's an interactive Claude Code session
  // (the boss's own terminal), not a background automation process.
  const hasPrintFlag = /\s-p\b/.test(cl) || cl.includes("--print");
  if (!hasPrintFlag) return "interactive";

  return "console";
}

/** All known department keywords for target inference */
const DEPT_KEYWORDS = [
  "cme",
  "ufficio-legale",
  "trading",
  "integration",
  "architecture",
  "security",
  "operations",
  "marketing",
  "strategy",
  "finance",
  "data-engineering",
  "quality-assurance",
  "protocols",
  "ux-ui",
  "acceleration",
] as const;

/** Map script names → target identifiers */
const SCRIPT_TARGET_MAP: Record<string, string> = {
  "company-tasks": "task-runner",
  "daily-standup": "cme",
  "dept-context": "cme",
  "data-connector": "data-engineering",
  "cme-autorun": "daemon",
  "cme-inbox": "cme",
  "auto-plenary": "cme",
  "update-dept-status": "operations",
  "ops-alerting": "operations",
  "model-census": "architecture",
  "run-qa-batch": "quality-assurance",
  "seed-corpus": "data-engineering",
  "seed-normattiva": "data-engineering",
  "seed-opendata": "data-engineering",
  "stress-test": "quality-assurance",
};

function inferTarget(commandLine: string): string {
  const cl = commandLine.toLowerCase();
  if (cl.includes("task-runner")) return "task-runner";
  if (cl.includes("cme-autorun") || cl.includes("daemon")) return "daemon";

  // 1. Interactive sessions (no -p flag) — the boss's own Claude Code terminal
  const hasPrintFlag = /\s-p\b/.test(cl) || cl.includes("--print");
  if (!hasPrintFlag) return "interactive";

  // 2. Try --system-prompt (existing logic, most specific)
  const systemPromptMatch = commandLine.match(
    /--system-prompt\s+"[^"]*?(cme|ufficio-legale|trading|integration|architecture|security|operations|marketing|strategy|finance|data-engineering|quality-assurance|protocols|ux-ui|acceleration)/i
  );
  if (systemPromptMatch) return systemPromptMatch[1].toLowerCase();

  // 3. Check for known script names in the command line
  for (const [scriptName, target] of Object.entries(SCRIPT_TARGET_MAP)) {
    if (cl.includes(scriptName)) return target;
  }

  // 4. Check for department keywords anywhere in the command line
  for (const dept of DEPT_KEYWORDS) {
    if (cl.includes(dept)) return dept;
  }

  // 5. Has -p flag but no identifiable target — manual CLI invocation
  return "cli-manual";
}

/**
 * Check if a process is still alive by PID.
 * Cross-platform: works on Windows and Unix.
 *
 * On Windows, process.kill(pid, 0) can throw EPERM for processes owned by
 * other users (alive but inaccessible) or ESRCH for dead processes.
 * We use tasklist as a reliable fallback when the signal check fails.
 */
function isProcessAlive(pid: number): boolean {
  try {
    // process.kill(pid, 0) sends signal 0 — doesn't kill, just checks existence
    process.kill(pid, 0);
    return true;
  } catch {
    // On Windows, process.kill(pid, 0) is unreliable — fall back to tasklist
    if (process.platform === "win32") {
      try {
        const output = execSync(
          `tasklist /FI "PID eq ${pid}" /NH`,
          { encoding: "utf-8", timeout: 3000, windowsHide: true }
        );
        // tasklist outputs "INFO: No tasks are running..." if PID not found
        // Otherwise it outputs the process row with the PID
        return output.includes(String(pid));
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * Convert TrackedSession to a serializable DTO for API responses.
 * Agents array defaults to empty — use toDTOWithAgents() to include agents.
 */
export function toDTO(session: TrackedSession): TrackedSessionDTO {
  return {
    pid: session.pid,
    type: session.type,
    target: session.target,
    taskId: session.taskId,
    startedAt: session.startedAt.toISOString(),
    status: session.status,
    currentTask: session.currentTask,
    department: session.department,
    parentPid: session.parentPid,
    sessionId: session.sessionId,
    agents: [],
    agentCount: 0,
  };
}

/**
 * Convert TrackedSession to DTO with synthesized agents list.
 * Agents are filtered from the provided events by parentPid or sessionId.
 */
export function toDTOWithAgents(
  session: TrackedSession,
  allAgentEvents: AgentDTO[]
): TrackedSessionDTO {
  const agents = allAgentEvents.filter(
    (ev) =>
      (ev as AgentDTO & { parentPid?: number; sessionId?: string }).parentPid === session.pid ||
      (session.sessionId &&
        (ev as AgentDTO & { parentPid?: number; sessionId?: string }).sessionId === session.sessionId)
  );

  return {
    pid: session.pid,
    type: session.type,
    target: session.target,
    taskId: session.taskId,
    startedAt: session.startedAt.toISOString(),
    status: session.status,
    currentTask: session.currentTask,
    department: session.department,
    parentPid: session.parentPid,
    sessionId: session.sessionId,
    agents,
    agentCount: agents.length,
  };
}
