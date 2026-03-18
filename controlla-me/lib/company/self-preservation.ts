/**
 * Self-Preservation — Protects critical processes from being killed.
 *
 * Identifies "sacred" PIDs (current process, parent chain, VS Code, Claude Code)
 * and categorizes any node.exe process by its command line.
 *
 * Used by:
 *   - scripts/process-cleanup.ts (CLI)
 *   - lib/company/process-monitor.ts (OS-level discovery)
 *
 * Task #1071 — Architecture department
 */

import { execSync } from "child_process";

// ─── Types ───

export type ProcessCategory =
  | "self"
  | "vscode"
  | "claude-code"
  | "nextjs-dev"
  | "daemon"
  | "task-runner"
  | "worker"
  | "unknown";

export interface OSProcess {
  pid: number;
  parentPid: number;
  commandLine: string;
  creationDate: string;
  memoryBytes: number;
  category: ProcessCategory;
  killable: boolean;
}

/** Which categories can be auto-killed without --confirm */
export const CATEGORY_KILLABLE: Record<ProcessCategory, boolean> = {
  self: false,
  vscode: false,
  "claude-code": false,
  "nextjs-dev": false,
  daemon: true,
  "task-runner": true,
  worker: true,
  unknown: true,
};

/** Which categories are protected (warn before kill, require --confirm for kill-all) */
export const CATEGORY_PROTECTED: Record<ProcessCategory, boolean> = {
  self: true,
  vscode: true,
  "claude-code": true,
  "nextjs-dev": true,
  daemon: false,
  "task-runner": false,
  worker: false,
  unknown: false,
};

/** Human-readable labels for categories */
export const CATEGORY_LABELS: Record<ProcessCategory, string> = {
  self: "SELF (current process)",
  vscode: "VS Code",
  "claude-code": "Claude Code",
  "nextjs-dev": "Next.js Dev Server",
  daemon: "CME Daemon",
  "task-runner": "Task Runner (claude -p)",
  worker: "Worker (PostCSS/Turbopack)",
  unknown: "Unknown Node Process",
};

// ─── Category Detection ───

/**
 * Determine the category of a process from its command line.
 */
export function getProcessCategory(commandLine: string): ProcessCategory {
  const cl = commandLine.toLowerCase();

  // VS Code detection
  if (
    cl.includes("vscode") ||
    cl.includes("code.exe") ||
    cl.includes("code helper") ||
    cl.includes("code - insiders") ||
    cl.includes("microsoft vs code") ||
    cl.includes("extensionhost") ||
    cl.includes("electron") && cl.includes("code")
  ) {
    return "vscode";
  }

  // Claude Code detection
  if (
    cl.includes("claude-code") ||
    cl.includes("claude code") ||
    cl.includes("cli.js") && cl.includes("claude")
  ) {
    return "claude-code";
  }

  // Next.js Dev Server detection
  if (
    cl.includes("next dev") ||
    cl.includes("next-server") ||
    cl.includes("start-server") ||
    cl.includes("next start")
  ) {
    return "nextjs-dev";
  }

  // CME Daemon detection
  if (cl.includes("cme-autorun") || cl.includes("cme-daemon")) {
    return "daemon";
  }

  // Task Runner (claude -p spawned by task-runner)
  if (
    cl.includes("claude -p") ||
    cl.includes("task-runner") ||
    cl.includes("company-tasks")
  ) {
    return "task-runner";
  }

  // Workers: PostCSS, Turbopack, esbuild, SWC
  if (
    cl.includes("postcss") ||
    cl.includes("turbopack") ||
    cl.includes("esbuild") ||
    cl.includes("swc") ||
    cl.includes("tailwindcss") ||
    cl.includes("lightningcss")
  ) {
    return "worker";
  }

  return "unknown";
}

// ─── Sacred PIDs ───

/**
 * Walk up the parent PID chain using wmic to find all ancestor PIDs.
 * Stops when hitting PID 0, PID 4 (System), or a cycle.
 */
function walkParentChain(startPid: number): number[] {
  const chain: number[] = [];
  const seen = new Set<number>();
  let currentPid = startPid;

  for (let i = 0; i < 20; i++) {
    if (currentPid <= 4 || seen.has(currentPid)) break;
    seen.add(currentPid);
    chain.push(currentPid);

    try {
      const output = execSync(
        `wmic process where "ProcessId=${currentPid}" get ParentProcessId /VALUE`,
        { encoding: "utf-8", timeout: 5000, windowsHide: true }
      ).trim();

      const match = output.match(/ParentProcessId=(\d+)/);
      if (!match) break;
      currentPid = parseInt(match[1], 10);
    } catch {
      break;
    }
  }

  return chain;
}

/**
 * Get PIDs that must NEVER be killed.
 * Includes: current process, parent PID, and the entire parent chain
 * (which typically includes VS Code, the shell, etc.)
 */
export function getSacredPIDs(): number[] {
  const sacred = new Set<number>();

  // Current process
  sacred.add(process.pid);

  // Parent PID
  if (process.ppid) {
    sacred.add(process.ppid);
  }

  // Walk up the parent chain
  try {
    const chain = walkParentChain(process.pid);
    for (const pid of chain) {
      sacred.add(pid);
    }
  } catch {
    // Fallback: at minimum protect current and parent
  }

  return Array.from(sacred);
}

/**
 * Check if a PID is sacred (must never be killed).
 */
export function isSacred(pid: number): boolean {
  const sacred = getSacredPIDs();
  return sacred.includes(pid);
}

// ─── OS Process Discovery ───

/**
 * Parse wmic CSV-like output.
 * wmic output is whitespace-padded columns with \r\n line endings.
 */
function parseWmicOutput(raw: string): Array<Record<string, string>> {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  // First line is headers
  const headers = lines[0].split(/\s{2,}/).map((h) => h.trim());

  // Find column positions from the header line
  const positions: Array<{ name: string; start: number }> = [];
  for (const header of headers) {
    const idx = lines[0].indexOf(header, positions.length > 0 ? positions[positions.length - 1].start + 1 : 0);
    positions.push({ name: header, start: idx });
  }

  const results: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const record: Record<string, string> = {};
    for (let j = 0; j < positions.length; j++) {
      const start = positions[j].start;
      const end = j + 1 < positions.length ? positions[j + 1].start : line.length;
      record[positions[j].name] = line.substring(start, end).trim();
    }
    results.push(record);
  }

  return results;
}

/**
 * Parse a wmic CreationDate string (yyyyMMddHHmmss.ffffff+offset) to a Date.
 */
function parseWmicDate(wmicDate: string): Date {
  if (!wmicDate || wmicDate.length < 14) return new Date(0);

  const year = wmicDate.substring(0, 4);
  const month = wmicDate.substring(4, 6);
  const day = wmicDate.substring(6, 8);
  const hour = wmicDate.substring(8, 10);
  const min = wmicDate.substring(10, 12);
  const sec = wmicDate.substring(12, 14);

  return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
}

/**
 * Discover all node.exe processes via wmic.
 * Returns an array of OSProcess with category and killable flags.
 */
export function discoverOSNodeProcesses(): OSProcess[] {
  if (process.platform !== "win32") {
    // On non-Windows, use ps (best-effort, not primary target)
    return discoverUnixNodeProcesses();
  }

  try {
    const raw = execSync(
      `wmic process where "name='node.exe'" get ProcessId,ParentProcessId,CommandLine,CreationDate,WorkingSetSize /FORMAT:CSV`,
      { encoding: "utf-8", timeout: 15000, windowsHide: true }
    );

    return parseWmicCSV(raw);
  } catch {
    // Fallback: try tasklist for basic info
    return discoverViaTasklist();
  }
}

/**
 * Parse wmic CSV format output (more reliable than default table format).
 */
function parseWmicCSV(raw: string): OSProcess[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  // CSV header line
  const headers = lines[0].split(",").map((h) => h.trim());

  const sacredPids = getSacredPIDs();
  const results: OSProcess[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // CSV fields — CommandLine may contain commas and quotes, handle carefully
    const fields = parseCSVLine(line);
    if (fields.length < headers.length) continue;

    const record: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = fields[j] ?? "";
    }

    const pid = parseInt(record["ProcessId"] || "0", 10);
    const parentPid = parseInt(record["ParentProcessId"] || "0", 10);
    const commandLine = record["CommandLine"] || "";
    const creationDate = record["CreationDate"] || "";
    const memoryBytes = parseInt(record["WorkingSetSize"] || "0", 10);

    if (pid <= 0) continue;

    // Determine category
    let category: ProcessCategory;
    if (pid === process.pid || sacredPids.includes(pid)) {
      category = pid === process.pid ? "self" : getProcessCategory(commandLine);
      // Override to self if it's in our parent chain
      if (pid === process.pid) category = "self";
    } else {
      category = getProcessCategory(commandLine);
    }

    // Sacred override: if pid is in sacred list, force not-killable
    const isSacredPid = sacredPids.includes(pid);
    const killable = isSacredPid ? false : CATEGORY_KILLABLE[category];

    results.push({
      pid,
      parentPid,
      commandLine,
      creationDate,
      memoryBytes,
      category,
      killable,
    });
  }

  return results;
}

/**
 * Parse a single CSV line, handling quoted fields with commas.
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Fallback discovery using tasklist (less info but more reliable).
 */
function discoverViaTasklist(): OSProcess[] {
  try {
    const raw = execSync(
      `tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH`,
      { encoding: "utf-8", timeout: 10000, windowsHide: true }
    );

    const sacredPids = getSacredPIDs();
    const results: OSProcess[] = [];

    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const fields = parseCSVLine(line);
      if (fields.length < 5) continue;

      const pid = parseInt(fields[1]?.replace(/"/g, "") || "0", 10);
      const memStr = (fields[4] || "").replace(/"/g, "").replace(/[^0-9]/g, "");
      const memoryBytes = parseInt(memStr, 10) * 1024; // tasklist reports in K

      if (pid <= 0) continue;

      const isSacredPid = sacredPids.includes(pid);
      const category: ProcessCategory = pid === process.pid ? "self" : "unknown";
      const killable = isSacredPid ? false : CATEGORY_KILLABLE[category];

      results.push({
        pid,
        parentPid: 0,
        commandLine: "(tasklist fallback — no command line available)",
        creationDate: "",
        memoryBytes,
        category,
        killable,
      });
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Unix fallback for process discovery (best-effort, not primary target).
 */
function discoverUnixNodeProcesses(): OSProcess[] {
  try {
    const raw = execSync(
      `ps -eo pid,ppid,rss,etime,args | grep '[n]ode'`,
      { encoding: "utf-8", timeout: 10000 }
    );

    const sacredPids = getSacredPIDs();
    const results: OSProcess[] = [];

    for (const line of raw.split("\n").filter((l) => l.trim())) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 5) continue;

      const pid = parseInt(parts[0], 10);
      const parentPid = parseInt(parts[1], 10);
      const rssKb = parseInt(parts[2], 10);
      const commandLine = parts.slice(4).join(" ");

      if (pid <= 0) continue;

      const isSacredPid = sacredPids.includes(pid);
      let category: ProcessCategory = pid === process.pid ? "self" : getProcessCategory(commandLine);
      if (pid === process.pid) category = "self";
      const killable = isSacredPid ? false : CATEGORY_KILLABLE[category];

      results.push({
        pid,
        parentPid,
        commandLine,
        creationDate: "",
        memoryBytes: rssKb * 1024,
        category,
        killable,
      });
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Kill a process by PID. Uses taskkill on Windows, SIGTERM on Unix.
 * Returns true if the kill succeeded, false otherwise.
 */
export function killPid(pid: number): boolean {
  if (isSacred(pid)) {
    return false; // Extra safety: never kill sacred PIDs
  }

  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /PID ${pid}`, {
        timeout: 5000,
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      process.kill(pid, "SIGTERM");
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Self-Timeout (Zombie Prevention) ───

/** Default max age for spawned scripts: 10 minutes */
const DEFAULT_SELF_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Enable self-termination after maxMs of inactivity.
 * Call at the top of any script that might become a zombie.
 * The timer is .unref()'d so it won't keep the event loop alive on its own.
 *
 * Usage:
 *   import { enableSelfTimeout } from "@/lib/company/self-preservation";
 *   enableSelfTimeout(); // 10 min default
 *   enableSelfTimeout(5 * 60 * 1000); // 5 min custom
 */
export function enableSelfTimeout(maxMs: number = DEFAULT_SELF_TIMEOUT_MS): void {
  const timer = setTimeout(() => {
    const label = formatUptime(maxMs);
    console.error(`[SELF-TIMEOUT] Process ${process.pid} exceeded ${label} limit. Auto-exiting.`);
    process.exit(1);
  }, maxMs);
  timer.unref(); // Don't keep process alive just for the timeout
}

// ─── Zombie Reaper (for daemon) ───

/** Threshold for zombie detection: processes older than this are candidates for kill */
const ZOMBIE_AGE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

export interface ZombieReaperResult {
  scanned: number;
  killed: number;
  failed: number;
  details: Array<{ pid: number; category: string; ageMs: number; killed: boolean }>;
}

/**
 * Scan for and kill zombie node processes.
 * Only kills processes that are:
 *   1. Killable (not sacred, not protected)
 *   2. Older than the age threshold
 *
 * Returns a summary of what was scanned and killed.
 * Safe to call from the daemon — sacred PID protection is built-in.
 */
export function reapZombies(ageThresholdMs: number = ZOMBIE_AGE_THRESHOLD_MS): ZombieReaperResult {
  const result: ZombieReaperResult = { scanned: 0, killed: 0, failed: 0, details: [] };

  let processes: OSProcess[];
  try {
    processes = discoverOSNodeProcesses();
  } catch {
    return result;
  }

  result.scanned = processes.length;
  const now = Date.now();

  for (const proc of processes) {
    if (!proc.killable) continue;

    // Calculate age from creation date (Windows: wmic CreationDate, Unix: no creationDate → skip)
    let ageMs = 0;
    if (proc.creationDate && proc.creationDate.length >= 14) {
      const created = parseWmicDate(proc.creationDate);
      if (created.getTime() > 0) {
        ageMs = now - created.getTime();
      }
    } else if (!proc.creationDate) {
      // Unix fallback: no creation date available from ps, skip age-based kill
      continue;
    }

    // Skip young processes
    if (ageMs < ageThresholdMs) continue;

    // Kill it
    const killed = killPid(proc.pid);
    if (killed) {
      result.killed++;
    } else {
      result.failed++;
    }
    result.details.push({ pid: proc.pid, category: proc.category, ageMs, killed });
  }

  return result;
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Format milliseconds to human-readable uptime string.
 */
export function formatUptime(ms: number): string {
  if (ms < 0) return "N/A";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  const days = Math.floor(hr / 24);
  return `${days}d ${hr % 24}h`;
}
