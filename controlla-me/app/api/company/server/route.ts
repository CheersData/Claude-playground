/**
 * GET /api/company/server — Server monitoring endpoint.
 *
 * Restituisce metriche real-time: CPU, RAM, disco, processi, Node.js runtime.
 * Protetto da console auth + rate limit.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import * as os from "os";
import { execSync } from "child_process";

// ─── CPU usage calculation ──────────────────────────────────────────────────

interface CpuSnapshot {
  idle: number;
  total: number;
}

function getCpuSnapshot(): CpuSnapshot {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }
  return { idle, total };
}

/**
 * Calcola CPU usage % confrontando due snapshot a 200ms di distanza.
 * Piu accurato di un singolo snapshot cumulativo.
 */
async function getCpuUsagePercent(): Promise<number> {
  const snap1 = getCpuSnapshot();
  await new Promise((r) => setTimeout(r, 200));
  const snap2 = getCpuSnapshot();

  const idleDelta = snap2.idle - snap1.idle;
  const totalDelta = snap2.total - snap1.total;

  if (totalDelta === 0) return 0;
  return Math.round((1 - idleDelta / totalDelta) * 100);
}

// ─── Disk usage ─────────────────────────────────────────────────────────────

interface DiskInfo {
  totalGB: number;
  usedGB: number;
  freeGB: number;
  usagePercent: number;
}

function getDiskInfo(): DiskInfo {
  try {
    const output = execSync("df -B1 / | tail -1", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    // df -B1 output: Filesystem 1B-blocks Used Available Use% Mounted
    const parts = output.split(/\s+/);
    if (parts.length < 5) throw new Error("Unexpected df output");

    const totalBytes = parseInt(parts[1], 10);
    const usedBytes = parseInt(parts[2], 10);
    const freeBytes = parseInt(parts[3], 10);
    const usagePercent = parseInt(parts[4], 10); // "45%" -> 45

    const toGB = (b: number) => Math.round((b / 1073741824) * 10) / 10;

    return {
      totalGB: toGB(totalBytes),
      usedGB: toGB(usedBytes),
      freeGB: toGB(freeBytes),
      usagePercent: isNaN(usagePercent) ? 0 : usagePercent,
    };
  } catch {
    return { totalGB: 0, usedGB: 0, freeGB: 0, usagePercent: 0 };
  }
}

// ─── Swap info ──────────────────────────────────────────────────────────────

interface SwapInfo {
  totalGB: number;
  usedGB: number;
}

function getSwapInfo(): SwapInfo {
  try {
    const output = execSync("free -b | grep -i swap", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    const parts = output.split(/\s+/);
    // free -b output: Swap: total used free
    const totalBytes = parseInt(parts[1], 10);
    const usedBytes = parseInt(parts[2], 10);
    const toGB = (b: number) => Math.round((b / 1073741824) * 100) / 100;

    return {
      totalGB: toGB(totalBytes),
      usedGB: toGB(usedBytes),
    };
  } catch {
    return { totalGB: 0, usedGB: 0 };
  }
}

// ─── Top processes ──────────────────────────────────────────────────────────

interface ProcessInfo {
  name: string;
  pid: number;
  memMB: number;
  cpuPercent: number;
}

function getTopProcesses(limit: number = 5): ProcessInfo[] {
  try {
    const output = execSync(
      `ps aux --sort=-%mem | head -${limit + 1}`,
      { encoding: "utf-8", timeout: 5000 }
    ).trim();

    const lines = output.split("\n").slice(1); // skip header
    return lines.map((line) => {
      const parts = line.split(/\s+/);
      // ps aux: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
      return {
        name: parts.slice(10).join(" ").split("/").pop()?.split(" ")[0] || parts[10] || "unknown",
        pid: parseInt(parts[1], 10),
        memMB: Math.round(parseInt(parts[5], 10) / 1024), // RSS in KB -> MB
        cpuPercent: parseFloat(parts[2]) || 0,
      };
    });
  } catch {
    return [];
  }
}

// ─── Process count ──────────────────────────────────────────────────────────

function getProcessCount(): number {
  try {
    const output = execSync("ps aux --no-headers | wc -l", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    return parseInt(output, 10) || 0;
  } catch {
    return 0;
  }
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const toGB = (b: number) => Math.round((b / 1073741824) * 10) / 10;

    const [cpuUsage, disk, swap, topProcs, procCount] = await Promise.all([
      getCpuUsagePercent(),
      Promise.resolve(getDiskInfo()),
      Promise.resolve(getSwapInfo()),
      Promise.resolve(getTopProcesses()),
      Promise.resolve(getProcessCount()),
    ]);

    const cpus = os.cpus();
    const nodeMemUsage = process.memoryUsage();

    return NextResponse.json({
      hostname: os.hostname(),
      uptime: Math.round(os.uptime()),
      cpu: {
        model: cpus[0]?.model || "unknown",
        cores: cpus.length,
        loadAvg: os.loadavg().map((v) => Math.round(v * 100) / 100),
        usagePercent: cpuUsage,
      },
      memory: {
        totalGB: toGB(totalMem),
        usedGB: toGB(usedMem),
        freeGB: toGB(freeMem),
        usagePercent: Math.round((usedMem / totalMem) * 100),
        swapTotalGB: swap.totalGB,
        swapUsedGB: swap.usedGB,
      },
      disk,
      processes: {
        total: procCount,
        topByMemory: topProcs,
      },
      node: {
        version: process.version,
        memoryUsageMB: Math.round(nodeMemUsage.rss / 1048576),
        heapUsedMB: Math.round(nodeMemUsage.heapUsed / 1048576),
        heapTotalMB: Math.round(nodeMemUsage.heapTotal / 1048576),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
