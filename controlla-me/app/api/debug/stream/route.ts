/**
 * GET /api/debug/stream — SSE endpoint for live debug log stream.
 *
 * Streams from TWO sources in real time:
 *   1. trading_signals  → slope/conventional trade events, scans, risk checks
 *   2. agent_cost_log   → AI agent executions with timing, cost, tokens
 *
 * Auth: requireConsoleAuth (HMAC token)
 * Protocol: Server-Sent Events — text/event-stream
 * Keep-alive: comment ping every 25s
 */

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireConsoleAuth } from "@/lib/middleware/console-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─── Types ───────────────────────────────────────────────────────────────────

interface LogLine {
  id: string;
  timestamp: string;
  level: "INFO" | "DEBUG" | "WARN" | "ERROR";
  source: "trading" | "ai" | "system";
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

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // last 1h

  let lastSignalAt = windowStart;
  let lastCostAt = windowStart;
  let timer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const supabase = createAdminClient();

      const enqueue = (line: LogLine) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(line)}\n\n`));
      };

      // ── Initial batch: merge and sort both sources by created_at ────────
      try {
        const [{ data: initSignals }, { data: initCosts }] = await Promise.all([
          supabase
            .from("trading_signals")
            .select("id, signal_type, data, created_at")
            .gte("created_at", windowStart)
            .order("created_at", { ascending: true })
            .limit(40),
          supabase
            .from("agent_cost_log")
            .select("id, agent_name, model_key, provider, input_tokens, output_tokens, total_cost_usd, duration_ms, used_fallback, session_type, created_at")
            .gte("created_at", windowStart)
            .order("created_at", { ascending: true })
            .limit(40),
        ]);

        // Merge and sort chronologically
        const merged: Array<{ line: LogLine; ts: string }> = [];

        for (const row of initSignals ?? []) {
          merged.push({ line: formatSignal(row as SignalRow), ts: row.created_at });
        }
        for (const row of initCosts ?? []) {
          merged.push({ line: formatCost(row as CostRow), ts: row.created_at });
        }

        merged.sort((a, b) => a.ts.localeCompare(b.ts));
        merged.forEach(({ line }) => enqueue(line));

        if (initSignals && initSignals.length > 0) {
          lastSignalAt = initSignals[initSignals.length - 1].created_at;
        }
        if (initCosts && initCosts.length > 0) {
          lastCostAt = initCosts[initCosts.length - 1].created_at;
        }
      } catch (err) {
        console.error("[debug/stream] initial fetch error:", err);
      }

      // ── Poll every 5s for new rows from both tables ──────────────────────
      let pingCounter = 0;
      timer = setInterval(async () => {
        try {
          pingCounter++;
          if (pingCounter % 5 === 0) {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          }

          const [{ data: newSignals }, { data: newCosts }] = await Promise.all([
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
          ]);

          // Merge and emit chronologically
          const batch: Array<{ line: LogLine; ts: string }> = [];

          for (const row of newSignals ?? []) {
            batch.push({ line: formatSignal(row as SignalRow), ts: row.created_at });
          }
          for (const row of newCosts ?? []) {
            batch.push({ line: formatCost(row as CostRow), ts: row.created_at });
          }

          batch.sort((a, b) => a.ts.localeCompare(b.ts));
          batch.forEach(({ line }) => enqueue(line));

          if (newSignals && newSignals.length > 0) {
            lastSignalAt = newSignals[newSignals.length - 1].created_at;
          }
          if (newCosts && newCosts.length > 0) {
            lastCostAt = newCosts[newCosts.length - 1].created_at;
          }
        } catch (err) {
          console.error("[debug/stream] poll error:", err);
        }
      }, 5000);
    },

    cancel() {
      if (timer) clearInterval(timer);
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
