/**
 * GET/PUT /api/company/daemon — Stato e controllo del CME autorun daemon.
 *
 * GET  → legge cme-daemon-state.json + lista ultimi log
 * PUT  → aggiorna enabled, intervalMinutes
 */

import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import * as fs from "fs";
import { resolve } from "path";

const STATE_FILE = resolve(process.cwd(), "company/cme-daemon-state.json");
const LOG_DIR = resolve(process.cwd(), "company/autorun-logs");
const LOCK_FILE = resolve(LOG_DIR, ".autorun.lock");

interface DaemonState {
  enabled: boolean;
  intervalMinutes: number;
  lastRun: string | null;
  lastDurationMs: number | null;
  lastExitCode: number | null;
  lastTasksExecuted: number;
  totalRuns: number;
  updatedAt: string | null;
  updatedBy: string;
}

function readState(): DaemonState {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return {
      enabled: true,
      intervalMinutes: 15,
      lastRun: null,
      lastDurationMs: null,
      lastExitCode: null,
      lastTasksExecuted: 0,
      totalRuns: 0,
      updatedAt: null,
      updatedBy: "system",
    };
  }
}

function writeState(state: DaemonState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

function isRunning(): boolean {
  try {
    if (!fs.existsSync(LOCK_FILE)) return false;
    const lockData = fs.readFileSync(LOCK_FILE, "utf-8").trim();
    const lockTime = new Date(lockData).getTime();
    // Lock valido se meno di 30 minuti fa
    return Date.now() - lockTime < 30 * 60 * 1000;
  } catch {
    return false;
  }
}

function getRecentLogs(limit: number = 10): Array<{ name: string; date: string; size: number }> {
  try {
    if (!fs.existsSync(LOG_DIR)) return [];
    const files = fs.readdirSync(LOG_DIR)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse()
      .slice(0, limit);

    return files.map((f) => {
      const stat = fs.statSync(resolve(LOG_DIR, f));
      return {
        name: f,
        date: stat.mtime.toISOString(),
        size: stat.size,
      };
    });
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const state = readState();
  const running = isRunning();
  const logs = getRecentLogs();

  return NextResponse.json({
    ...state,
    running,
    logs,
  });
}

export async function PUT(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  try {
    const body = await req.json();
    const current = readState();

    // Valida e applica solo campi permessi
    if (typeof body.enabled === "boolean") {
      current.enabled = body.enabled;
    }
    if (typeof body.intervalMinutes === "number") {
      current.intervalMinutes = Math.max(5, Math.min(120, body.intervalMinutes));
    }

    current.updatedAt = new Date().toISOString();
    current.updatedBy = "ops-panel";

    writeState(current);

    return NextResponse.json({
      ...current,
      running: isRunning(),
    });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
