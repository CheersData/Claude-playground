/**
 * Sub-Agent Tracker — Server-side reader for .claude/sub-agents.json.
 *
 * Reads the file-based sub-agent registry written by scripts/track-subagent.ts
 * and converts entries to AgentEvent format for integration with the sessions API.
 *
 * Design:
 *   - Read-only from the Next.js server perspective (writes come from CLI)
 *   - Long-running detection: agents running > 10 minutes (advisory only — no automatic kill)
 *   - cleanupZombies() marks long-running entries as error — ONLY called on explicit operator request
 *   - Cleanup of completed entries: removes done/error entries older than TTL
 *   - toAgentEvents() converts to AgentEvent format for the sessions API
 */

import * as fs from "fs";
import * as path from "path";
import type { AgentEvent } from "@/lib/agent-broadcast";

// ─── Constants ───

const SUB_AGENTS_FILE = path.resolve(
  process.cwd(),
  ".claude",
  "sub-agents.json"
);

/** Sub-agents running longer than this are flagged as long-running (advisory only, no automatic kill) */
const LONG_RUNNING_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/** Completed sub-agents are pruned after this TTL */
const COMPLETED_TTL_MS = 60 * 1000; // 60 seconds (keep briefly for UI visibility)

// ─── Types ───

export interface SubAgent {
  id: string;
  description: string;
  department: string;
  status: "running" | "done" | "error";
  startedAt: number; // epoch ms
  completedAt?: number; // epoch ms
}

// ─── File I/O ───

function readRaw(): SubAgent[] {
  try {
    if (!fs.existsSync(SUB_AGENTS_FILE)) return [];
    const raw = fs.readFileSync(SUB_AGENTS_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeRaw(agents: SubAgent[]): void {
  try {
    const dir = path.dirname(SUB_AGENTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      SUB_AGENTS_FILE,
      JSON.stringify(agents, null, 2),
      "utf-8"
    );
  } catch {
    // Best effort — don't crash the server if write fails
  }
}

// ─── Public API ───

/**
 * Get all active sub-agents (running + recently completed).
 * Filters out completed entries older than COMPLETED_TTL_MS.
 */
export function getActiveSubAgents(): SubAgent[] {
  const all = readRaw();
  const now = Date.now();

  return all.filter((a) => {
    // Running agents always visible
    if (a.status === "running") return true;
    // Completed/errored: visible for COMPLETED_TTL_MS after completion
    if (a.completedAt && now - a.completedAt < COMPLETED_TTL_MS) return true;
    return false;
  });
}

/**
 * Check if a sub-agent has been running longer than the long-running threshold.
 * Advisory only — does NOT trigger any automatic cleanup.
 */
export function isLongRunning(agent: SubAgent): boolean {
  if (agent.status !== "running") return false;
  return Date.now() - agent.startedAt > LONG_RUNNING_THRESHOLD_MS;
}

/**
 * Get sub-agents that are running but have exceeded the long-running threshold.
 * Advisory only — used for UI display, not for automatic cleanup.
 */
export function getZombieSubAgents(): SubAgent[] {
  const all = readRaw();
  const now = Date.now();

  return all.filter(
    (a) => a.status === "running" && now - a.startedAt > LONG_RUNNING_THRESHOLD_MS
  );
}

/**
 * Mark long-running sub-agents as error and clean up old completed entries.
 * Returns the number of long-running agents cleaned up.
 *
 * IMPORTANT: This function should ONLY be called on explicit operator request
 * (e.g. "Kill zombies" button or CLI `kill-zombies` command). Never automatic.
 */
export function cleanupZombies(): number {
  const all = readRaw();
  const now = Date.now();
  let cleaned = 0;

  // Mark long-running agents as error (operator-requested cleanup)
  for (const a of all) {
    if (a.status === "running" && now - a.startedAt > LONG_RUNNING_THRESHOLD_MS) {
      a.status = "error";
      a.completedAt = now;
      cleaned++;
    }
  }

  // Remove old completed entries (done/error older than COMPLETED_TTL_MS)
  const pruned = all.filter((a) => {
    if (a.status === "running") return true;
    if (a.completedAt && now - a.completedAt < COMPLETED_TTL_MS) return true;
    // Keep entries without completedAt (shouldn't happen, but defensive)
    if (!a.completedAt) return true;
    return false;
  });

  if (cleaned > 0 || pruned.length !== all.length) {
    writeRaw(pruned);
  }

  return cleaned;
}

/**
 * Mark a specific sub-agent as error (killed by operator).
 * Returns true if the agent was found and updated.
 */
export function killSubAgent(agentId: string): boolean {
  const all = readRaw();
  const agent = all.find((a) => a.id === agentId && a.status === "running");
  if (!agent) return false;

  agent.status = "error";
  agent.completedAt = Date.now();
  writeRaw(all);
  return true;
}

/**
 * Convert sub-agents to AgentEvent format for integration with the sessions API.
 * Sub-agents are assigned to the heartbeat PID (interactive session) as their parent.
 */
export function toAgentEvents(
  subAgents: SubAgent[],
  parentPid?: number
): AgentEvent[] {
  return subAgents.map((a) => ({
    id: `subagent-${a.id}`,
    department: a.department,
    task: a.description,
    status: a.status === "running" ? "running" : a.status === "done" ? "done" : "error",
    timestamp: a.status === "running" ? a.startedAt : (a.completedAt ?? a.startedAt),
    ...(parentPid !== undefined ? { parentPid } : {}),
  }));
}

/**
 * Get summary statistics for sub-agents.
 */
export function getSubAgentStats(): {
  total: number;
  running: number;
  zombies: number;
  done: number;
  error: number;
} {
  const all = readRaw();
  const now = Date.now();

  const running = all.filter((a) => a.status === "running");
  const zombies = running.filter(
    (a) => now - a.startedAt > LONG_RUNNING_THRESHOLD_MS
  );

  return {
    total: all.length,
    running: running.length,
    zombies: zombies.length,
    done: all.filter((a) => a.status === "done").length,
    error: all.filter((a) => a.status === "error").length,
  };
}
