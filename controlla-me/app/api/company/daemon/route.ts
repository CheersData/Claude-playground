/**
 * GET/PUT/POST /api/company/daemon — Stato, controllo e health check del CME autorun daemon.
 *
 * GET  → legge cme-daemon-state.json + lista ultimi log + health assessment
 * PUT  → aggiorna enabled, intervalMinutes
 * POST → azioni: reset (clear stuck state), ping (trigger manual run)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import * as fs from "fs";
import { resolve } from "path";

const STATE_FILE = resolve(process.cwd(), "company/cme-daemon-state.json");
const LOG_DIR = resolve(process.cwd(), "company/autorun-logs");
const LOCK_FILE = resolve(LOG_DIR, ".autorun.lock");
const REPORT_FILE = resolve(process.cwd(), "company/daemon-report.json");

// Health thresholds
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour — daemon should run at least hourly
const STUCK_LOCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 min — lock older than this is stale

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
  rateLimitUntil?: string | null;
  consecutiveNoOp?: number;
  lastPlenaryAt?: string | null;
}

type DaemonHealth = "healthy" | "warning" | "error" | "unknown";

interface HealthAssessment {
  status: DaemonHealth;
  checks: Array<{ name: string; status: DaemonHealth; message: string }>;
  lastRunAgo: string | null;
  nextExpectedRun: string | null;
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
    return Date.now() - lockTime < STUCK_LOCK_THRESHOLD_MS;
  } catch {
    return false;
  }
}

function isLockStale(): boolean {
  try {
    if (!fs.existsSync(LOCK_FILE)) return false;
    const lockData = fs.readFileSync(LOCK_FILE, "utf-8").trim();
    const lockTime = new Date(lockData).getTime();
    return Date.now() - lockTime >= STUCK_LOCK_THRESHOLD_MS;
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

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

function assessHealth(state: DaemonState): HealthAssessment {
  const checks: HealthAssessment["checks"] = [];
  let worstStatus: DaemonHealth = "healthy";
  const setWorst = (s: DaemonHealth) => {
    const order: Record<DaemonHealth, number> = { healthy: 0, unknown: 1, warning: 2, error: 3 };
    if (order[s] > order[worstStatus]) worstStatus = s;
  };

  // Check 1: Daemon enabled
  if (!state.enabled) {
    checks.push({ name: "enabled", status: "warning", message: "Daemon disabilitato" });
    setWorst("warning");
  } else {
    checks.push({ name: "enabled", status: "healthy", message: "Daemon attivo" });
  }

  // Check 2: Last run freshness
  if (!state.lastRun) {
    checks.push({ name: "lastRun", status: "unknown", message: "Nessun run registrato" });
    setWorst("unknown");
  } else {
    const lastRunMs = Date.now() - new Date(state.lastRun).getTime();
    const expectedIntervalMs = (state.intervalMinutes || 15) * 60 * 1000;
    // Grace period: 3x the interval before warning, 6x before error
    if (lastRunMs > expectedIntervalMs * 6) {
      checks.push({
        name: "lastRun",
        status: "error",
        message: `Ultimo run ${formatDuration(lastRunMs)} fa (previsto ogni ${state.intervalMinutes}min)`,
      });
      setWorst("error");
    } else if (lastRunMs > expectedIntervalMs * 3) {
      checks.push({
        name: "lastRun",
        status: "warning",
        message: `Ultimo run ${formatDuration(lastRunMs)} fa (previsto ogni ${state.intervalMinutes}min)`,
      });
      setWorst("warning");
    } else {
      checks.push({
        name: "lastRun",
        status: "healthy",
        message: `Ultimo run ${formatDuration(lastRunMs)} fa`,
      });
    }
  }

  // Check 3: Last exit code
  if (state.lastExitCode !== null && state.lastExitCode !== 0) {
    checks.push({
      name: "exitCode",
      status: "error",
      message: `Ultimo exit code: ${state.lastExitCode} (fallimento)`,
    });
    setWorst("error");
  } else if (state.lastExitCode === 0) {
    checks.push({ name: "exitCode", status: "healthy", message: "Ultimo run completato con successo" });
  }

  // Check 4: Stale lock
  if (isLockStale()) {
    checks.push({
      name: "lock",
      status: "warning",
      message: "Lock file stale rilevato (possibile processo zombie)",
    });
    setWorst("warning");
  } else if (isRunning()) {
    checks.push({ name: "lock", status: "healthy", message: "Run in corso" });
  } else {
    checks.push({ name: "lock", status: "healthy", message: "Nessun lock attivo" });
  }

  // Check 5: Rate limit backoff
  if (state.rateLimitUntil) {
    const until = new Date(state.rateLimitUntil).getTime();
    if (Date.now() < until) {
      const remainMs = until - Date.now();
      checks.push({
        name: "rateLimit",
        status: "warning",
        message: `Rate limit backoff attivo (${formatDuration(remainMs)} rimanenti)`,
      });
      setWorst("warning");
    }
  }

  // Check 6: Consecutive no-op count
  const noOps = state.consecutiveNoOp ?? 0;
  if (noOps >= 20) {
    checks.push({
      name: "noOp",
      status: "warning",
      message: `${noOps} sessioni consecutive senza azioni utili (cooldown progressivo attivo)`,
    });
    setWorst("warning");
  }

  // Compute next expected run
  let nextExpectedRun: string | null = null;
  if (state.lastRun && state.enabled) {
    const nextMs = new Date(state.lastRun).getTime() + (state.intervalMinutes || 15) * 60 * 1000;
    nextExpectedRun = new Date(nextMs).toISOString();
  }

  return {
    status: worstStatus,
    checks,
    lastRunAgo: state.lastRun ? formatDuration(Date.now() - new Date(state.lastRun).getTime()) : null,
    nextExpectedRun,
  };
}

export async function GET(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const state = readState();
  const running = isRunning();
  const logs = getRecentLogs();
  const health = assessHealth(state);

  // Read last report summary if available
  let lastReportSignals = 0;
  let lastReportTimestamp: string | null = null;
  try {
    if (fs.existsSync(REPORT_FILE)) {
      const report = JSON.parse(fs.readFileSync(REPORT_FILE, "utf-8"));
      lastReportSignals = report.signals?.length ?? 0;
      lastReportTimestamp = report.timestamp ?? null;
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    ...state,
    running,
    logs,
    health,
    lastReport: {
      signals: lastReportSignals,
      timestamp: lastReportTimestamp,
    },
    executorEngine: {
      type: "free-llm",
      description: "callLLM() via lib/llm.ts (Gemini Flash > Groq > Cerebras > Mistral)",
      cost: "$0.00",
      fallbackLevels: [
        "L1: task-runner-api.ts (esegue task open esistenti)",
        "L2: executeCMESessionFree (crea nuovi task da signal)",
        "L3: Ping fallback (clipboard/file per intervento manuale)",
      ],
      legacyClaudeP: "disabilitato dal 2026-03-09 (ENOENT / crediti insufficienti)",
    },
  });
}

export async function PUT(req: NextRequest) {
  // CSRF protection
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

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
      health: assessHealth(current),
    });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  // CSRF protection
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const payload = requireConsoleAuth(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "reset") {
      // Reset stuck state: clear exit code, remove stale lock, reset rate limit
      const current = readState();
      current.lastExitCode = 0;
      current.rateLimitUntil = null;
      current.consecutiveNoOp = 0;
      current.updatedAt = new Date().toISOString();
      current.updatedBy = "ops-panel-reset";
      writeState(current);

      // Remove stale lock if present
      try {
        if (fs.existsSync(LOCK_FILE)) {
          const lockData = fs.readFileSync(LOCK_FILE, "utf-8").trim();
          const lockTime = new Date(lockData).getTime();
          if (Date.now() - lockTime >= STUCK_LOCK_THRESHOLD_MS) {
            fs.unlinkSync(LOCK_FILE);
          }
        }
      } catch { /* ignore */ }

      return NextResponse.json({
        success: true,
        message: "Stato daemon resettato: exit code azzerato, lock stale rimosso, rate limit e no-op counter azzerati",
        state: { ...current, running: isRunning() },
        health: assessHealth(current),
      });
    }

    if (action === "health") {
      // Just return health assessment
      const state = readState();
      return NextResponse.json({
        health: assessHealth(state),
        running: isRunning(),
      });
    }

    return NextResponse.json({ error: `Azione sconosciuta: ${action}` }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
