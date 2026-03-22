#!/usr/bin/env npx tsx
/**
 * Process Cleanup CLI — Discover and kill zombie Node.js processes.
 *
 * Commands:
 *   list          — Show all node.exe processes grouped by category
 *   status        — Summary: total processes, memory, categories
 *   kill-zombies  — Kill all killable processes (daemon, task-runner, workers, unknown)
 *   kill-all      — Kill everything except SELF and VS Code (requires --confirm)
 *
 * Self-preservation:
 *   - NEVER kills the current process or its parent chain
 *   - NEVER kills VS Code processes
 *   - Protected processes (Claude Code, Next.js Dev) require --confirm via kill-all
 *
 * Task #1071 — Architecture department
 *
 * Usage:
 *   npx tsx scripts/process-cleanup.ts list
 *   npx tsx scripts/process-cleanup.ts status
 *   npx tsx scripts/process-cleanup.ts kill-zombies
 *   npx tsx scripts/process-cleanup.ts kill-all --confirm
 */

import {
  discoverOSNodeProcesses,
  getProcessCategory,
  getSacredPIDs,
  isSacred,
  killPid,
  formatBytes,
  formatUptime,
  CATEGORY_KILLABLE,
  CATEGORY_PROTECTED,
  CATEGORY_LABELS,
  type OSProcess,
  type ProcessCategory,
} from "../lib/company/self-preservation";

// ─── ANSI Colors ───

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
};

// ─── Helpers ───

function categoryColor(cat: ProcessCategory): string {
  switch (cat) {
    case "self": return C.green;
    case "vscode": return C.blue;
    case "claude-code": return C.cyan;
    case "nextjs-dev": return C.magenta;
    case "daemon": return C.yellow;
    case "task-runner": return C.yellow;
    case "worker": return C.dim;
    case "unknown": return C.red;
  }
}

function killableTag(proc: OSProcess): string {
  if (proc.category === "self" || proc.category === "vscode") {
    return `${C.green}[SACRED]${C.reset}`;
  }
  if (CATEGORY_PROTECTED[proc.category]) {
    return `${C.yellow}[PROTECTED]${C.reset}`;
  }
  if (proc.killable) {
    return `${C.red}[KILLABLE]${C.reset}`;
  }
  return `${C.dim}[SAFE]${C.reset}`;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + "...";
}

function groupByCategory(processes: OSProcess[]): Map<ProcessCategory, OSProcess[]> {
  const groups = new Map<ProcessCategory, OSProcess[]>();
  for (const proc of processes) {
    const existing = groups.get(proc.category) ?? [];
    existing.push(proc);
    groups.set(proc.category, existing);
  }
  return groups;
}

function getUptimeMs(proc: OSProcess): number {
  if (!proc.creationDate) return -1;
  // wmic CSV CreationDate format: yyyyMMddHHmmss.ffffff+offset
  const raw = proc.creationDate;
  if (raw.length < 14) return -1;

  const year = raw.substring(0, 4);
  const month = raw.substring(4, 6);
  const day = raw.substring(6, 8);
  const hour = raw.substring(8, 10);
  const min = raw.substring(10, 12);
  const sec = raw.substring(12, 14);

  const created = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
  if (isNaN(created.getTime())) return -1;
  return Date.now() - created.getTime();
}

// ─── Commands ───

function cmdList(): void {
  console.log(`\n${C.bold}${C.cyan}=== Node.js Process Discovery ===${C.reset}\n`);

  const processes = discoverOSNodeProcesses();
  if (processes.length === 0) {
    console.log(`${C.yellow}No node.exe processes found.${C.reset}`);
    return;
  }

  const sacredPids = getSacredPIDs();
  console.log(`${C.dim}Sacred PIDs (parent chain): ${sacredPids.join(", ")}${C.reset}`);
  console.log(`${C.dim}Current PID: ${process.pid} | Parent PID: ${process.ppid}${C.reset}\n`);

  const groups = groupByCategory(processes);

  // Display order: self first, then vscode, claude-code, nextjs-dev, then killable
  const order: ProcessCategory[] = [
    "self", "vscode", "claude-code", "nextjs-dev",
    "daemon", "task-runner", "worker", "unknown",
  ];

  let totalMemory = 0;

  for (const cat of order) {
    const procs = groups.get(cat);
    if (!procs || procs.length === 0) continue;

    const color = categoryColor(cat);
    const label = CATEGORY_LABELS[cat];
    const countMem = procs.reduce((sum, p) => sum + p.memoryBytes, 0);
    totalMemory += countMem;

    console.log(`${color}${C.bold}--- ${label} (${procs.length}) --- ${formatBytes(countMem)}${C.reset}`);

    for (const proc of procs) {
      const uptime = getUptimeMs(proc);
      const tag = killableTag(proc);
      const mem = formatBytes(proc.memoryBytes);
      const up = formatUptime(uptime);
      const cmd = truncate(proc.commandLine, 100);

      console.log(
        `  ${tag} PID ${C.bold}${proc.pid}${C.reset}` +
        ` | ${C.cyan}${mem}${C.reset}` +
        ` | ${C.dim}${up}${C.reset}` +
        ` | ${C.dim}${cmd}${C.reset}`
      );
    }
    console.log();
  }

  // Summary line
  const killableCount = processes.filter((p) => p.killable).length;
  const protectedCount = processes.filter((p) => CATEGORY_PROTECTED[p.category] && !p.killable).length;
  console.log(
    `${C.bold}Total: ${processes.length} processes | ` +
    `${C.cyan}${formatBytes(totalMemory)}${C.reset}${C.bold} | ` +
    `${C.green}${processes.length - killableCount - protectedCount} sacred${C.reset}${C.bold} | ` +
    `${C.yellow}${protectedCount} protected${C.reset}${C.bold} | ` +
    `${C.red}${killableCount} killable${C.reset}`
  );
}

function cmdStatus(): void {
  console.log(`\n${C.bold}${C.cyan}=== Process Status Summary ===${C.reset}\n`);

  const processes = discoverOSNodeProcesses();
  if (processes.length === 0) {
    console.log(`${C.green}No node.exe processes found. System clean.${C.reset}`);
    return;
  }

  const groups = groupByCategory(processes);
  const totalMemory = processes.reduce((sum, p) => sum + p.memoryBytes, 0);
  const killableCount = processes.filter((p) => p.killable).length;
  const killableMemory = processes.filter((p) => p.killable).reduce((sum, p) => sum + p.memoryBytes, 0);

  console.log(`${C.bold}Total processes:${C.reset}  ${processes.length}`);
  console.log(`${C.bold}Total memory:${C.reset}    ${formatBytes(totalMemory)}`);
  console.log(`${C.bold}Killable:${C.reset}        ${killableCount} (${formatBytes(killableMemory)})`);
  console.log();

  const order: ProcessCategory[] = [
    "self", "vscode", "claude-code", "nextjs-dev",
    "daemon", "task-runner", "worker", "unknown",
  ];

  for (const cat of order) {
    const procs = groups.get(cat);
    if (!procs || procs.length === 0) continue;

    const color = categoryColor(cat);
    const mem = procs.reduce((sum, p) => sum + p.memoryBytes, 0);
    const status = CATEGORY_KILLABLE[cat] ? `${C.red}KILLABLE${C.reset}` : `${C.green}PROTECTED${C.reset}`;
    console.log(
      `  ${color}${CATEGORY_LABELS[cat].padEnd(30)}${C.reset}` +
      ` ${String(procs.length).padStart(3)} procs | ` +
      `${formatBytes(mem).padStart(10)} | ` +
      `${status}`
    );
  }
}

function cmdKillZombies(): void {
  console.log(`\n${C.bold}${C.yellow}=== Kill Zombies (safe mode) ===${C.reset}\n`);

  const processes = discoverOSNodeProcesses();
  const killable = processes.filter((p) => p.killable);

  if (killable.length === 0) {
    console.log(`${C.green}No killable zombie processes found. System clean.${C.reset}`);
    return;
  }

  console.log(`${C.yellow}Found ${killable.length} killable processes:${C.reset}\n`);

  let killed = 0;
  let failed = 0;

  for (const proc of killable) {
    const color = categoryColor(proc.category);
    const label = CATEGORY_LABELS[proc.category];
    const mem = formatBytes(proc.memoryBytes);

    // Double-check sacred status (paranoia)
    if (isSacred(proc.pid)) {
      console.log(`  ${C.green}[SKIP]${C.reset} PID ${proc.pid} — sacred (${label})`);
      continue;
    }

    process.stdout.write(
      `  ${C.red}[KILL]${C.reset} PID ${C.bold}${proc.pid}${C.reset}` +
      ` ${color}${label}${C.reset} (${mem})... `
    );

    const success = killPid(proc.pid);
    if (success) {
      console.log(`${C.green}OK${C.reset}`);
      killed++;
    } else {
      console.log(`${C.red}FAILED${C.reset}`);
      failed++;
    }
  }

  console.log(
    `\n${C.bold}Result: ${C.green}${killed} killed${C.reset}` +
    (failed > 0 ? `${C.bold}, ${C.red}${failed} failed${C.reset}` : "") +
    `${C.bold}. Protected processes untouched.${C.reset}`
  );

  // Show what's left
  const sacredCount = processes.filter((p) => !p.killable).length;
  console.log(`${C.dim}Remaining: ${sacredCount} protected/sacred processes.${C.reset}`);
}

function cmdKillAll(confirm: boolean): void {
  if (!confirm) {
    console.log(`\n${C.bgRed}${C.white}${C.bold} DANGER ${C.reset} ` +
      `${C.red}kill-all requires --confirm flag${C.reset}`);
    console.log(`\n  This will kill ALL node.exe processes except SELF and VS Code.`);
    console.log(`  Protected processes (Claude Code, Next.js Dev) will also be killed.`);
    console.log(`\n  ${C.yellow}Usage: npx tsx scripts/process-cleanup.ts kill-all --confirm${C.reset}\n`);
    return;
  }

  console.log(`\n${C.bgRed}${C.white}${C.bold} KILL ALL MODE ${C.reset}\n`);
  console.log(`${C.red}Killing all node.exe processes except SELF and VS Code.${C.reset}\n`);

  const processes = discoverOSNodeProcesses();

  // In kill-all mode: kill everything except self and vscode
  const targets = processes.filter(
    (p) => p.category !== "self" && p.category !== "vscode" && !isSacred(p.pid)
  );

  if (targets.length === 0) {
    console.log(`${C.green}No processes to kill (only SELF and VS Code running).${C.reset}`);
    return;
  }

  console.log(`${C.red}Targeting ${targets.length} processes:${C.reset}\n`);

  let killed = 0;
  let failed = 0;

  for (const proc of targets) {
    const color = categoryColor(proc.category);
    const label = CATEGORY_LABELS[proc.category];
    const mem = formatBytes(proc.memoryBytes);

    // Absolutely never kill sacred PIDs
    if (isSacred(proc.pid)) {
      console.log(`  ${C.green}[SKIP]${C.reset} PID ${proc.pid} — sacred`);
      continue;
    }

    const isProtected = CATEGORY_PROTECTED[proc.category];
    const tag = isProtected ? `${C.yellow}[FORCE-KILL]${C.reset}` : `${C.red}[KILL]${C.reset}`;

    process.stdout.write(
      `  ${tag} PID ${C.bold}${proc.pid}${C.reset}` +
      ` ${color}${label}${C.reset} (${mem})... `
    );

    const success = killPid(proc.pid);
    if (success) {
      console.log(`${C.green}OK${C.reset}`);
      killed++;
    } else {
      console.log(`${C.red}FAILED${C.reset}`);
      failed++;
    }
  }

  console.log(
    `\n${C.bold}Result: ${C.green}${killed} killed${C.reset}` +
    (failed > 0 ? `${C.bold}, ${C.red}${failed} failed${C.reset}` : "") +
    `${C.bold}.${C.reset}`
  );

  const remaining = processes.length - killed;
  console.log(`${C.dim}Remaining: ${remaining} processes (SELF + VS Code).${C.reset}`);
}

// ─── Main ───

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  if (!command || command === "--help" || command === "-h") {
    console.log(`
${C.bold}${C.cyan}Process Cleanup CLI${C.reset}
${C.dim}Discover and kill zombie Node.js processes.${C.reset}

${C.bold}Commands:${C.reset}
  ${C.green}list${C.reset}          Show all node.exe processes grouped by category
  ${C.green}status${C.reset}        Summary: total processes, memory, categories
  ${C.yellow}kill-zombies${C.reset}  Kill killable processes (daemon, task-runner, workers, unknown)
  ${C.red}kill-all${C.reset}      Kill everything except SELF and VS Code (requires --confirm)

${C.bold}Categories:${C.reset}
  ${C.green}SACRED${C.reset}     — Current process + VS Code (NEVER killable)
  ${C.yellow}PROTECTED${C.reset}  — Claude Code + Next.js Dev (only killable with kill-all --confirm)
  ${C.red}KILLABLE${C.reset}   — Daemon, Task Runner, Workers, Unknown

${C.bold}Examples:${C.reset}
  npx tsx scripts/process-cleanup.ts list
  npx tsx scripts/process-cleanup.ts kill-zombies
  npx tsx scripts/process-cleanup.ts kill-all --confirm
`);
    return;
  }

  switch (command) {
    case "list":
      cmdList();
      break;
    case "status":
      cmdStatus();
      break;
    case "kill-zombies":
      cmdKillZombies();
      break;
    case "kill-all":
      cmdKillAll(args.includes("--confirm"));
      break;
    default:
      console.log(`${C.red}Unknown command: ${command}${C.reset}`);
      console.log(`${C.dim}Use --help for available commands.${C.reset}`);
      process.exit(1);
  }
}

main();
