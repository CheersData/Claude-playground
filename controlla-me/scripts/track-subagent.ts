/**
 * track-subagent.ts — Lightweight CLI for registering Claude Code sub-agents.
 *
 * Called by CME (Claude Code) via Bash before/after launching Agent tool sub-agents.
 * Reads/writes .claude/sub-agents.json for file-based tracking.
 *
 * Usage:
 *   npx tsx scripts/track-subagent.ts start --id "explore-1" --desc "Searching codebase" --dept architecture
 *   npx tsx scripts/track-subagent.ts done --id "explore-1"
 *   npx tsx scripts/track-subagent.ts error --id "explore-1"
 *   npx tsx scripts/track-subagent.ts list
 *   npx tsx scripts/track-subagent.ts kill-zombies
 *
 * Design constraints:
 *   - FAST: must complete in < 1 second (runs before/after every agent launch)
 *   - Only 2 writes per agent: start + done/error
 *   - No polling, no heartbeat
 *   - File-based: works without dev server running
 */

import * as fs from "fs";
import * as path from "path";

// ─── Constants ───

const SUB_AGENTS_FILE = path.resolve(
  process.cwd(),
  ".claude",
  "sub-agents.json"
);

/** Sub-agents running longer than this are flagged as long-running (advisory only, no automatic kill) */
const LONG_RUNNING_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

// ─── Types ───

interface SubAgent {
  id: string;
  description: string;
  department: string;
  status: "running" | "done" | "error";
  startedAt: number; // epoch ms
  completedAt?: number; // epoch ms
}

// ─── File I/O ───

function ensureDir(): void {
  const dir = path.dirname(SUB_AGENTS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readAgents(): SubAgent[] {
  try {
    if (!fs.existsSync(SUB_AGENTS_FILE)) return [];
    const raw = fs.readFileSync(SUB_AGENTS_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeAgents(agents: SubAgent[]): void {
  ensureDir();
  fs.writeFileSync(SUB_AGENTS_FILE, JSON.stringify(agents, null, 2), "utf-8");
}

// ─── Commands ───

function cmdStart(id: string, desc: string, dept: string): void {
  const agents = readAgents();

  // Remove any existing entry with the same id (re-registration)
  const filtered = agents.filter((a) => a.id !== id);

  filtered.push({
    id,
    description: desc,
    department: dept,
    status: "running",
    startedAt: Date.now(),
  });

  writeAgents(filtered);
  console.log(`[sub-agent] registered: ${id} (${dept}) — ${desc}`);
}

function cmdDone(id: string): void {
  const agents = readAgents();
  const agent = agents.find((a) => a.id === id);

  if (!agent) {
    console.log(`[sub-agent] not found: ${id} — ignoring`);
    return;
  }

  agent.status = "done";
  agent.completedAt = Date.now();
  writeAgents(agents);

  const elapsed = agent.completedAt - agent.startedAt;
  console.log(`[sub-agent] done: ${id} (${elapsed}ms)`);
}

function cmdError(id: string): void {
  const agents = readAgents();
  const agent = agents.find((a) => a.id === id);

  if (!agent) {
    console.log(`[sub-agent] not found: ${id} — ignoring`);
    return;
  }

  agent.status = "error";
  agent.completedAt = Date.now();
  writeAgents(agents);

  const elapsed = agent.completedAt - agent.startedAt;
  console.log(`[sub-agent] error: ${id} (${elapsed}ms)`);
}

function cmdList(): void {
  const agents = readAgents();
  const now = Date.now();

  if (agents.length === 0) {
    console.log("[sub-agent] No sub-agents tracked.");
    return;
  }

  const running = agents.filter((a) => a.status === "running");
  const longRunning = running.filter((a) => now - a.startedAt > LONG_RUNNING_THRESHOLD_MS);
  const done = agents.filter((a) => a.status === "done");
  const errored = agents.filter((a) => a.status === "error");

  console.log(`[sub-agent] Total: ${agents.length} | Running: ${running.length} | Long-running: ${longRunning.length} | Done: ${done.length} | Error: ${errored.length}`);
  console.log("");

  for (const a of agents) {
    const age = now - a.startedAt;
    const ageStr = age < 60_000 ? `${Math.floor(age / 1000)}s` : `${Math.floor(age / 60_000)}m`;
    const isLongRunning = a.status === "running" && age > LONG_RUNNING_THRESHOLD_MS;
    const longRunningTag = isLongRunning ? " [LONG-RUNNING]" : "";
    console.log(`  ${a.status.padEnd(7)} ${a.id.padEnd(30)} ${a.department.padEnd(20)} ${ageStr}${longRunningTag}`);
    if (a.description) {
      console.log(`          ${a.description}`);
    }
  }
}

function cmdKillZombies(): void {
  const agents = readAgents();
  const now = Date.now();

  const longRunning = agents.filter(
    (a) => a.status === "running" && now - a.startedAt > LONG_RUNNING_THRESHOLD_MS
  );

  if (longRunning.length === 0) {
    console.log("[sub-agent] No long-running agents found.");
    return;
  }

  // Mark long-running agents as error and set completedAt (operator-requested)
  for (const z of longRunning) {
    z.status = "error";
    z.completedAt = now;
    console.log(`[sub-agent] killed long-running agent: ${z.id} (running for ${Math.floor((now - z.startedAt) / 60_000)}m)`);
  }

  writeAgents(agents);
  console.log(`[sub-agent] Killed ${longRunning.length} long-running agent(s).`);
}

// ─── CLI Parser ───

function parseArgs(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log("Usage: track-subagent.ts <start|done|error|list|kill-zombies> [options]");
    console.log("  start        --id <id> --desc <description> --dept <department>");
    console.log("  done         --id <id>");
    console.log("  error        --id <id>");
    console.log("  list         Show all tracked sub-agents (flags long-running > 10min)");
    console.log("  kill-zombies Kill long-running sub-agents (> 10min, operator-requested)");
    process.exit(1);
  }

  // Parse named args
  const named: Record<string, string> = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      const key = args[i].slice(2);
      named[key] = args[i + 1];
      i++; // skip value
    }
  }

  switch (command) {
    case "start": {
      const id = named["id"];
      const desc = named["desc"] || named["description"] || "";
      const dept = named["dept"] || named["department"] || "unknown";
      if (!id) {
        console.error("Error: --id is required for 'start'");
        process.exit(1);
      }
      cmdStart(id, desc, dept);
      break;
    }
    case "done": {
      const id = named["id"];
      if (!id) {
        console.error("Error: --id is required for 'done'");
        process.exit(1);
      }
      cmdDone(id);
      break;
    }
    case "error": {
      const id = named["id"];
      if (!id) {
        console.error("Error: --id is required for 'error'");
        process.exit(1);
      }
      cmdError(id);
      break;
    }
    case "list":
      cmdList();
      break;
    case "kill-zombies":
      cmdKillZombies();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

parseArgs();
