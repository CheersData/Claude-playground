import { NextRequest, NextResponse } from "next/server";
import * as os from "os";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { requireConsoleAuth } from "@/lib/middleware/console-token";

/**
 * Snapshot CPU times per core — used to compute delta-based CPU usage.
 */
function cpuSnapshot() {
  return os.cpus().map((core) => {
    const { user, nice, sys, idle, irq } = core.times;
    const total = user + nice + sys + idle + irq;
    return { idle, total };
  });
}

/** GET — server CPU, RAM, uptime stats for the /ops dashboard */
export async function GET(req: NextRequest) {
  // Rate limiting (SEC-003) — 60/min by IP
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  // Auth (SEC-004) — richiede Bearer token valido
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  try {
    // Two snapshots 100ms apart to measure real-time CPU usage
    const snap1 = cpuSnapshot();
    await new Promise((r) => setTimeout(r, 100));
    const snap2 = cpuSnapshot();

    let totalIdleDelta = 0;
    let totalDelta = 0;
    for (let i = 0; i < snap1.length; i++) {
      const idleDelta = snap2[i].idle - snap1[i].idle;
      const totalCoreDelta = snap2[i].total - snap1[i].total;
      totalIdleDelta += idleDelta;
      totalDelta += totalCoreDelta;
    }

    const cpuPercent =
      totalDelta > 0
        ? Math.round(((totalDelta - totalIdleDelta) / totalDelta) * 1000) / 10
        : 0;

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return NextResponse.json({
      cpu_percent: cpuPercent,
      cpu_cores: os.cpus().length,
      ram_used_mb: Math.round(usedMem / 1024 / 1024),
      ram_total_mb: Math.round(totalMem / 1024 / 1024),
      ram_percent:
        Math.round((usedMem / totalMem) * 1000) / 10,
      uptime_seconds: Math.floor(os.uptime()),
    });
  } catch (err) {
    console.error("[system-stats] Errore:", err);
    return NextResponse.json(
      { error: "Errore nel recupero statistiche di sistema" },
      { status: 500 }
    );
  }
}
