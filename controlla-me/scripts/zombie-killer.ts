#!/usr/bin/env npx tsx
/**
 * Zombie Killer — CLI per identificare e uccidere processi zombie.
 *
 * Trova processi `claude` orfani spawned da Next.js API routes
 * che sopravvivono alla richiesta HTTP e consumano RAM.
 *
 * Usage:
 *   npx tsx scripts/zombie-killer.ts              # scan + report (dry run)
 *   npx tsx scripts/zombie-killer.ts --kill        # scan + kill zombies
 *   npx tsx scripts/zombie-killer.ts --kill --age 10   # kill zombies > 10 min
 *   npx tsx scripts/zombie-killer.ts --watch       # loop: scan+kill ogni 5 min
 *   npx tsx scripts/zombie-killer.ts --watch --interval 2  # loop ogni 2 min
 *
 * Task #architecture — self-preservation upgrade
 */

import { enableSelfTimeout } from "@/lib/company/self-preservation";
import {
  discoverNextjsZombies,
  reapNextjsZombies,
  discoverOSNodeProcesses,
  getSacredPIDs,
  formatBytes,
  formatUptime,
  CATEGORY_LABELS,
} from "@/lib/company/self-preservation";
import { execSync } from "child_process";

// Auto-terminate after 60 min (safety for --watch mode)
enableSelfTimeout(60 * 60 * 1000);

// ─── CLI Args ───

const args = process.argv.slice(2);
const doKill = args.includes("--kill");
const watchMode = args.includes("--watch");

function getArgValue(flag: string, defaultVal: number): number {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return parseInt(args[idx + 1], 10) || defaultVal;
  }
  return defaultVal;
}

const ageMinutes = getArgValue("--age", 30);
const intervalMinutes = getArgValue("--interval", 5);
const ageThresholdMs = ageMinutes * 60 * 1000;

// ─── Helpers ───

function getMemoryInfo(): { totalMB: number; usedMB: number; freeMB: number; availMB: number } {
  try {
    const raw = execSync("free -m", { encoding: "utf-8", timeout: 5000 });
    const memLine = raw.split("\n").find((l) => l.startsWith("Mem:"));
    if (!memLine) return { totalMB: 0, usedMB: 0, freeMB: 0, availMB: 0 };
    const parts = memLine.split(/\s+/);
    return {
      totalMB: parseInt(parts[1], 10),
      usedMB: parseInt(parts[2], 10),
      freeMB: parseInt(parts[3], 10),
      availMB: parseInt(parts[6], 10),
    };
  } catch {
    return { totalMB: 0, usedMB: 0, freeMB: 0, availMB: 0 };
  }
}

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// ─── Main ───

function runScan(): void {
  const memBefore = getMemoryInfo();
  const zombies = discoverNextjsZombies(ageThresholdMs);
  const sacredPids = getSacredPIDs();

  // Header
  console.log(`\n[${ timestamp() }] ZOMBIE KILLER — scan`);
  console.log(`  Threshold: processi > ${ageMinutes} min`);
  console.log(`  Sacred PIDs: ${sacredPids.join(", ")}`);
  console.log(`  RAM: ${memBefore.usedMB}/${memBefore.totalMB} MB used (${memBefore.availMB} MB available)`);

  if (zombies.length === 0) {
    console.log(`  Zombies trovati: 0 — tutto pulito`);
    return;
  }

  // Zombie report
  const totalMemMB = zombies.reduce((sum, z) => sum + z.memoryBytes, 0) / (1024 * 1024);
  console.log(`  Zombies trovati: ${zombies.length} (${totalMemMB.toFixed(0)} MB totali)`);
  console.log("");
  console.log("  PID      PPID     AGE         RSS        CMD");
  console.log("  ─────    ─────    ──────────  ─────────  ─────────────────────");

  const now = Date.now();
  for (const z of zombies) {
    const created = new Date(z.creationDate);
    const ageMs = now - created.getTime();
    const pid = String(z.pid).padEnd(8);
    const ppid = String(z.parentPid).padEnd(8);
    const age = formatUptime(ageMs).padEnd(12);
    const rss = formatBytes(z.memoryBytes).padEnd(11);
    const cmd = z.commandLine.length > 40 ? z.commandLine.slice(0, 40) + "..." : z.commandLine;
    console.log(`  ${pid} ${ppid} ${age} ${rss} ${cmd}`);
  }

  if (!doKill) {
    console.log(`\n  Dry run. Usa --kill per ucciderli.`);
    return;
  }

  // Kill
  console.log(`\n  Killing ${zombies.length} zombies...`);
  const result = reapNextjsZombies(ageThresholdMs);
  console.log(`  Killed: ${result.killed}, Failed: ${result.failed}`);

  // RAM after (wait a beat for OS to reclaim)
  setTimeout(() => {
    const memAfter = getMemoryInfo();
    const freedMB = memAfter.availMB - memBefore.availMB;
    console.log(`  RAM recovered: ~${freedMB > 0 ? freedMB : 0} MB (now ${memAfter.availMB} MB available)`);
  }, 2000);
}

// ─── All Processes View (for diagnostics) ───

function showAllProcesses(): void {
  const all = discoverOSNodeProcesses();
  const sacredPids = getSacredPIDs();

  console.log(`\n[${timestamp()}] ALL DISCOVERED PROCESSES (${all.length} total)`);
  console.log("  PID      PPID     CATEGORY              KILLABLE  RSS         CMD");
  console.log("  ─────    ─────    ────────────────────  ────────  ──────────  ─────────────────────");

  for (const p of all) {
    const sacred = sacredPids.includes(p.pid) ? " [SACRED]" : "";
    const pid = String(p.pid).padEnd(8);
    const ppid = String(p.parentPid).padEnd(8);
    const cat = (CATEGORY_LABELS[p.category] || p.category).slice(0, 20).padEnd(22);
    const kill = (p.killable ? "YES" : "NO").padEnd(10);
    const rss = formatBytes(p.memoryBytes).padEnd(12);
    const cmd = p.commandLine.length > 40 ? p.commandLine.slice(0, 40) + "..." : p.commandLine;
    console.log(`  ${pid} ${ppid} ${cat} ${kill} ${rss} ${cmd}${sacred}`);
  }
}

// ─── Entrypoint ───

if (args.includes("--all")) {
  showAllProcesses();
} else if (watchMode) {
  console.log(`[${timestamp()}] ZOMBIE KILLER — watch mode (ogni ${intervalMinutes} min, age > ${ageMinutes} min, kill=${doKill})`);
  runScan();
  setInterval(() => {
    runScan();
  }, intervalMinutes * 60 * 1000);
} else {
  runScan();
}
