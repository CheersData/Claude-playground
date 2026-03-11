/**
 * GET /api/debug/stream — SSE endpoint for live debug log stream.
 *
 * Streams from FOUR sources in real time:
 *   1. trading_signals  → slope/conventional trade events, scans, risk checks
 *   2. agent_cost_log   → AI agent executions with timing, cost, tokens
 *   3. company_tasks    → task state changes (created, in_progress, done, blocked)
 *   4. agent_cost_log   → derived: pipeline phases, rate limit events, errors
 *
 * Auth: requireConsoleAuth (HMAC token)
 * Protocol: Server-Sent Events — text/event-stream
 * Keep-alive: comment ping every 25s
 */

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─── Types ───────────────────────────────────────────────────────────────────

interface LogLine {
  id: string;
  timestamp: string;
  level: "INFO" | "DEBUG" | "WARN" | "ERROR";
  source: "trading" | "ai" | "system" | "task" | "pipeline" | "ratelimit" | "error";
  message: string;
  meta?: {
    // AI agent fields
    agent?: string;
    model?: string;
    provider?: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    durationMs?: number;
    fallback?: boolean;
    sessionType?: string;
    // Trading fields
    signalType?: string;
    symbols?: string[];
    approved?: number;
    total?: number;
    killSwitch?: boolean;
    // Task fields
    taskId?: string;
    taskStatus?: string;
    department?: string;
    priority?: string;
    assignedTo?: string;
    // Pipeline fields
    phase?: string;
    pipelineStatus?: string;
    // Rate limit fields
    endpoint?: string;
    remaining?: number;
    limit?: number;
    // Error fields
    errorType?: string;
    route?: string;
  };
}

interface SignalRow {
  id: string;
  signal_type: string;
  data: unknown;
  created_at: string;
}

interface CostRow {
  id: string;
  agent_name: string;
  model_key: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  total_cost_usd: number;
  duration_ms: number;
  used_fallback: boolean;
  session_type: string | null;
  created_at: string;
}

interface TaskRow {
  id: string;
  title: string;
  department: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatSignal(row: SignalRow): LogLine {
  const d = row.data as Record<string, unknown>;
  const ts = fmtTime(row.created_at);
  let message = "";
  let level: LogLine["level"] = "DEBUG";
  const meta: LogLine["meta"] = { signalType: row.signal_type };

  switch (row.signal_type) {
    case "trade": {
      const strategy = (d.strategy as string) ?? "conventional";
      const sigs = Array.isArray(d.signals) ? d.signals.length : 0;
      const scanned = (d.symbols_scanned as number) ?? (d.analyzed as number) ?? 0;
      const tf = (d.timeframe as string) ?? "";
      const syms = Array.isArray(d.signals)
        ? (d.signals as Array<{ symbol: string; action: string }>)
            .map((s) => `${s.symbol}:${s.action}`)
            .join(" ")
        : "";
      message = `[${strategy}]${tf ? ` ${tf}` : ""} segnali=${sigs} scansionati=${scanned}${syms ? ` → ${syms}` : ""}`;
      level = sigs > 0 ? "INFO" : "DEBUG";
      break;
    }
    case "scan": {
      const candidates = (d.candidates_found as number) ?? 0;
      const watchlist = Array.isArray(d.watchlist) ? d.watchlist.length : 0;
      const top = Array.isArray(d.watchlist)
        ? (d.watchlist as string[]).slice(0, 5).join(" ")
        : "";
      message = `[scan] candidati=${candidates} watchlist=${watchlist}${top ? ` [${top}]` : ""}`;
      level = "INFO";
      break;
    }
    case "risk_check": {
      const approved = (d.approved as number) ?? 0;
      const total = (d.total as number) ?? 0;
      const ks = !!(d.kill_switch as boolean);
      const rejected = total - approved;
      message = `[risk] ✓${approved}/${total}${rejected > 0 ? ` ✗${rejected}` : ""}${ks ? " ⚠ KILL_SWITCH ATTIVO" : ""}`;
      level = ks ? "ERROR" : approved > 0 ? "INFO" : "DEBUG";
      meta.approved = approved;
      meta.total = total;
      meta.killSwitch = ks;
      break;
    }
    case "kill_switch": {
      message = `⚠ KILL SWITCH — ${JSON.stringify(d).slice(0, 100)}`;
      level = "ERROR";
      break;
    }
    default: {
      const preview = JSON.stringify(d).slice(0, 120);
      message = `[${row.signal_type}] ${preview}`;
      level = "DEBUG";
    }
  }

  return { id: row.id, timestamp: ts, level, source: "trading", message, meta };
}

function formatCost(row: CostRow): LogLine {
  const ts = fmtTime(row.created_at);
  const durationSec = (row.duration_ms / 1000).toFixed(1);
  const cost = row.total_cost_usd.toFixed(4);
  const totalTokens = row.input_tokens + row.output_tokens;
  const fallbackTag = row.used_fallback ? " [fallback]" : "";
  const sessionTag = row.session_type ? ` {${row.session_type}}` : "";

  // Format: agent | model | 450↑ 1200↓ (1650) | $0.0234 | 12.3s
  const message = `${row.agent_name} | ${row.model_key} | ${row.input_tokens}↑ ${row.output_tokens}↓ (${totalTokens}) | $${cost} | ${durationSec}s${fallbackTag}${sessionTag}`;

  return {
    id: row.id,
    timestamp: ts,
    level: row.used_fallback ? "WARN" : "INFO",
    source: "ai",
    message,
    meta: {
      agent: row.agent_name,
      model: row.model_key,
      provider: row.provider,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      costUsd: row.total_cost_usd,
      durationMs: row.duration_ms,
      fallback: row.used_fallback,
      sessionType: row.session_type ?? undefined,
    },
  };
}

function formatTask(row: TaskRow): LogLine {
  const ts = fmtTime(row.created_at);
  const statusIcons: Record<string, string> = {
    open: "NEW",
    in_progress: "WIP",
    review: "REV",
    done: "DONE",
    blocked: "BLOCK",
  };
  const tag = statusIcons[row.status] ?? row.status.toUpperCase();
  const assignee = row.assigned_to ? ` → ${row.assigned_to}` : "";
  const message = `[${tag}] ${row.title} (${row.department})${assignee}`;

  let level: LogLine["level"] = "DEBUG";
  if (row.status === "done") level = "INFO";
  else if (row.status === "blocked") level = "WARN";
  else if (row.status === "in_progress") level = "INFO";

  return {
    id: `task-${row.id}`,
    timestamp: ts,
    level,
    source: "task",
    message,
    meta: {
      taskId: row.id,
      taskStatus: row.status,
      department: row.department,
      priority: row.priority,
      assignedTo: row.assigned_to ?? undefined,
    },
  };
}

/**
 * Derive pipeline events from agent_cost_log entries.
 * Groups consecutive agent calls into pipeline phases:
 * classifier → analyzer → investigator → advisor
 */
function formatPipelineEvent(row: CostRow): LogLine | null {
  const pipelineAgents = ["classifier", "analyzer", "investigator", "advisor"];
  const agentLower = row.agent_name.toLowerCase();
  if (!pipelineAgents.includes(agentLower)) return null;

  const ts = fmtTime(row.created_at);
  const durationSec = (row.duration_ms / 1000).toFixed(1);
  const cost = row.total_cost_usd.toFixed(4);
  const totalTokens = row.input_tokens + row.output_tokens;
  const fallbackTag = row.used_fallback ? " [fallback]" : "";
  const message = `[pipeline] ${agentLower} completed | ${row.model_key} | ${totalTokens} tok | $${cost} | ${durationSec}s${fallbackTag}`;

  return {
    id: `pipeline-${row.id}`,
    timestamp: ts,
    level: row.used_fallback ? "WARN" : "INFO",
    source: "pipeline",
    message,
    meta: {
      phase: agentLower,
      pipelineStatus: "done",
      agent: row.agent_name,
      model: row.model_key,
      provider: row.provider,
      durationMs: row.duration_ms,
      costUsd: row.total_cost_usd,
      fallback: row.used_fallback,
    },
  };
}

/**
 * Derive rate limit events from agent_cost_log entries.
 * If an agent used fallback, it likely hit a rate limit on the primary provider.
 */
function formatRateLimitEvent(row: CostRow): LogLine | null {
  if (!row.used_fallback) return null;

  const ts = fmtTime(row.created_at);
  const message = `[rate-limit] ${row.agent_name} fell back from primary → ${row.model_key} (${row.provider})`;

  return {
    id: `rl-${row.id}`,
    timestamp: ts,
    level: "WARN",
    source: "ratelimit",
    message,
    meta: {
      agent: row.agent_name,
      model: row.model_key,
      provider: row.provider,
      endpoint: `agent/${row.agent_name}`,
    },
  };
}

/**
 * Derive error events from agent_cost_log entries with very high duration
 * (> 120s indicates timeout/retry cycles) or $0 cost with fallback (failed primary).
 */
function formatErrorEvent(row: CostRow): LogLine | null {
  const isSlowCall = row.duration_ms > 120_000;
  const isZeroCostFallback = row.used_fallback && row.total_cost_usd === 0;

  if (!isSlowCall && !isZeroCostFallback) return null;

  const ts = fmtTime(row.created_at);
  const durationSec = (row.duration_ms / 1000).toFixed(1);
  let message: string;

  if (isSlowCall) {
    message = `[slow] ${row.agent_name} took ${durationSec}s on ${row.model_key} (${row.provider}) — possible timeout/retry`;
  } else {
    message = `[error] ${row.agent_name} zero-cost fallback to ${row.model_key} — primary provider likely failed`;
  }

  return {
    id: `err-${row.id}`,
    timestamp: ts,
    level: "ERROR",
    source: "error",
    message,
    meta: {
      errorType: isSlowCall ? "slow_call" : "provider_failure",
      agent: row.agent_name,
      model: row.model_key,
      provider: row.provider,
      durationMs: row.duration_ms,
      route: `agent/${row.agent_name}`,
    },
  };
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Defense-in-depth: rate limit dopo auth
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const encoder = new TextEncoder();
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // last 24h

  let lastSignalAt = windowStart;
  let lastCostAt = windowStart;
  let lastTaskAt = windowStart;
  let timer: ReturnType<typeof setInterval> | null = null;

  // Track seen cost IDs to avoid emitting duplicate derived events
  const seenCostIds = new Set<string>();

  const stream = new ReadableStream({
    async start(controller) {
      const supabase = createAdminClient();

      const enqueue = (line: LogLine) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(line)}\n\n`));
      };

      /**
       * Process cost rows: emit the primary AI event + derived events
       * (pipeline, rate_limit, error) from the same row.
       */
      const processCostRow = (row: CostRow, batch: Array<{ line: LogLine; ts: string }>) => {
        // Primary AI event
        batch.push({ line: formatCost(row), ts: row.created_at });

        // Derived events (only emit once per cost row)
        if (!seenCostIds.has(row.id)) {
          seenCostIds.add(row.id);

          const pipelineEvt = formatPipelineEvent(row);
          if (pipelineEvt) batch.push({ line: pipelineEvt, ts: row.created_at });

          const rlEvt = formatRateLimitEvent(row);
          if (rlEvt) batch.push({ line: rlEvt, ts: row.created_at });

          const errEvt = formatErrorEvent(row);
          if (errEvt) batch.push({ line: errEvt, ts: row.created_at });
        }
      };

      // ── Initial batch: merge and sort all sources by created_at ────────
      try {
        const [{ data: initSignals }, { data: initCosts }, { data: initTasks }] = await Promise.all([
          supabase
            .from("trading_signals")
            .select("id, signal_type, data, created_at")
            .gte("created_at", windowStart)
            .order("created_at", { ascending: true })
            .limit(100),
          supabase
            .from("agent_cost_log")
            .select("id, agent_name, model_key, provider, input_tokens, output_tokens, total_cost_usd, duration_ms, used_fallback, session_type, created_at")
            .gte("created_at", windowStart)
            .order("created_at", { ascending: true })
            .limit(100),
          supabase
            .from("company_tasks")
            .select("id, title, department, status, priority, assigned_to, created_by, created_at, started_at, completed_at")
            .gte("created_at", windowStart)
            .order("created_at", { ascending: true })
            .limit(80),
        ]);

        // Merge and sort chronologically
        const merged: Array<{ line: LogLine; ts: string }> = [];

        for (const row of initSignals ?? []) {
          merged.push({ line: formatSignal(row as SignalRow), ts: row.created_at });
        }
        for (const row of initCosts ?? []) {
          processCostRow(row as CostRow, merged);
        }
        for (const row of initTasks ?? []) {
          merged.push({ line: formatTask(row as TaskRow), ts: row.created_at });
        }

        merged.sort((a, b) => a.ts.localeCompare(b.ts));
        merged.forEach(({ line }) => enqueue(line));

        if (initSignals && initSignals.length > 0) {
          lastSignalAt = initSignals[initSignals.length - 1].created_at;
        }
        if (initCosts && initCosts.length > 0) {
          lastCostAt = initCosts[initCosts.length - 1].created_at;
        }
        if (initTasks && initTasks.length > 0) {
          lastTaskAt = initTasks[initTasks.length - 1].created_at;
        }
      } catch (err) {
        console.error("[debug/stream] initial fetch error:", err);
      }

      // ── Poll every 5s for new rows from all tables ──────────────────────
      let pingCounter = 0;
      timer = setInterval(async () => {
        try {
          pingCounter++;
          if (pingCounter % 5 === 0) {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          }

          const [{ data: newSignals }, { data: newCosts }, { data: newTasks }] = await Promise.all([
            supabase
              .from("trading_signals")
              .select("id, signal_type, data, created_at")
              .gt("created_at", lastSignalAt)
              .order("created_at", { ascending: true })
              .limit(20),
            supabase
              .from("agent_cost_log")
              .select("id, agent_name, model_key, provider, input_tokens, output_tokens, total_cost_usd, duration_ms, used_fallback, session_type, created_at")
              .gt("created_at", lastCostAt)
              .order("created_at", { ascending: true })
              .limit(20),
            supabase
              .from("company_tasks")
              .select("id, title, department, status, priority, assigned_to, created_by, created_at, started_at, completed_at")
              .gt("created_at", lastTaskAt)
              .order("created_at", { ascending: true })
              .limit(20),
          ]);

          // Merge and emit chronologically
          const batch: Array<{ line: LogLine; ts: string }> = [];

          for (const row of newSignals ?? []) {
            batch.push({ line: formatSignal(row as SignalRow), ts: row.created_at });
          }
          for (const row of newCosts ?? []) {
            processCostRow(row as CostRow, batch);
          }
          for (const row of newTasks ?? []) {
            batch.push({ line: formatTask(row as TaskRow), ts: row.created_at });
          }

          batch.sort((a, b) => a.ts.localeCompare(b.ts));
          batch.forEach(({ line }) => enqueue(line));

          if (newSignals && newSignals.length > 0) {
            lastSignalAt = newSignals[newSignals.length - 1].created_at;
          }
          if (newCosts && newCosts.length > 0) {
            lastCostAt = newCosts[newCosts.length - 1].created_at;
          }
          if (newTasks && newTasks.length > 0) {
            lastTaskAt = newTasks[newTasks.length - 1].created_at;
          }
        } catch (err) {
          console.error("[debug/stream] poll error:", err);
        }
      }, 5000);
    },

    cancel() {
      if (timer) clearInterval(timer);
      // Prevent unbounded growth of seenCostIds
      seenCostIds.clear();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
