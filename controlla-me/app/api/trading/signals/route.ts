/**
 * API Trading Signals — GET segnali slope+volume in tempo reale
 *
 * Restituisce i segnali slope+volume generati dal bot di trading,
 * con statistiche aggregate (count, confidence media, ultimi N segnali),
 * decisioni del risk manager (APPROVED/REJECTED + motivo), e stato kill switch.
 *
 * Query params:
 *   strategy  — filtro strategia (default: "slope_volume", "all" per tutti)
 *   limit     — max segnali da restituire (default: 50, max: 200)
 *   hours     — finestra temporale in ore (default: 24, max: 168 = 7 giorni)
 *
 * Richiede: console auth (HMAC token)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

export async function GET(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const { searchParams } = new URL(req.url);
  const strategy = searchParams.get("strategy") ?? "slope_volume";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const hours = Math.min(parseInt(searchParams.get("hours") ?? "24", 10), 168);

  const supabase = createAdminClient();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  try {
    // ── Query parallele ────────────────────────────────────────────────────
    const [signalsResult, riskResult, ordersResult, positionsResult, configResult] =
      await Promise.all([
        // 1. Segnali trade generati dalla strategia
        (() => {
          let q = supabase
            .from("trading_signals")
            .select("id, signal_type, data, created_at")
            .eq("signal_type", "trade")
            .gte("created_at", since)
            .order("created_at", { ascending: false })
            .limit(limit);
          if (strategy !== "all") {
            q = q.eq("data->>strategy", strategy);
          }
          return q;
        })(),

        // 2. Decisioni risk manager (APPROVED/REJECTED + motivo)
        supabase
          .from("trading_signals")
          .select("id, data, created_at")
          .eq("signal_type", "risk_check")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(limit),

        // 3. Ordini realmente eseguiti su Alpaca
        supabase
          .from("trading_orders")
          .select(
            "id, alpaca_order_id, symbol, side, qty, order_type, status, filled_avg_price, filled_qty, filled_at, stop_loss, take_profit, error_message, created_at"
          )
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(100),

        // 4. Posizioni attualmente aperte
        supabase
          .from("portfolio_positions")
          .select(
            "symbol, qty, avg_entry_price, current_price, market_value, unrealized_pnl, unrealized_pnl_pct, sector, days_held, updated_at"
          )
          .gt("qty", 0)
          .order("market_value", { ascending: false }),

        // 5. Config: kill switch, mode, enabled
        supabase
          .from("trading_config")
          .select("mode, enabled, kill_switch_active, kill_switch_reason, kill_switch_at")
          .limit(1)
          .maybeSingle(),
      ]);

    if (signalsResult.error) {
      console.error("[trading/signals] Supabase error:", signalsResult.error.message);
      return NextResponse.json(
        { error: "Database error", detail: signalsResult.error.message },
        { status: 500 }
      );
    }

    // ── Estrai e aggrega i segnali trade ──────────────────────────────────
    const signals: SignalRow[] = [];
    let totalGenerated = 0;
    let totalWithSignal = 0;

    for (const row of signalsResult.data ?? []) {
      const d = row.data as Record<string, unknown>;
      const rowSignals = (d.signals as unknown[]) ?? [];
      totalGenerated++;
      if (rowSignals.length > 0) {
        totalWithSignal++;
        for (const sig of rowSignals) {
          const s = sig as Record<string, unknown>;
          signals.push({
            id: row.id as string,
            strategy: (d.strategy as string) ?? "unknown",
            symbol: (s.symbol as string) ?? (d.symbol as string) ?? "?",
            timeframe: (d.timeframe as string) ?? "5Min",
            action: (s.action as string) ?? "BUY",
            confidence: (s.confidence as number) ?? 0,
            score: (s.score as number) ?? 0,
            entry_price: (s.entry_price as number) ?? 0,
            stop_loss: (s.stop_loss as number) ?? 0,
            take_profit: (s.take_profit as number) ?? 0,
            rationale: (s.rationale as string) ?? "",
            created_at: row.created_at as string,
          });
        }
      }
    }

    // ── Estrai decisioni risk manager ─────────────────────────────────────
    const riskDecisions: RiskDecisionRow[] = [];

    for (const row of riskResult.data ?? []) {
      const d = row.data as Record<string, unknown>;
      const decisions = (d.decisions as unknown[]) ?? [];
      for (const dec of decisions) {
        const decision = dec as Record<string, unknown>;
        riskDecisions.push({
          id: `${row.id}-${decision.symbol}`,
          symbol: (decision.symbol as string) ?? "?",
          action: (decision.action as string) ?? "BUY",
          status: (decision.status as string) ?? "UNKNOWN",
          reason: (decision.reason as string | null) ?? null,
          position_size: (decision.position_size as number | null) ?? null,
          position_value: (decision.position_value as number | null) ?? null,
          stop_loss: (decision.stop_loss as number | null) ?? null,
          take_profit: (decision.take_profit as number | null) ?? null,
          created_at: row.created_at as string,
        });
      }
    }

    // ── Stats aggregate ───────────────────────────────────────────────────
    const avgConfidence =
      signals.length > 0
        ? Math.round(
            (signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length) * 1000
          ) / 1000
        : null;

    const hitRate =
      totalGenerated > 0
        ? Math.round((totalWithSignal / totalGenerated) * 1000) / 1000
        : null;

    const approved = riskDecisions.filter((d) => d.status === "APPROVED").length;
    const rejected = riskDecisions.filter((d) => d.status === "REJECTED").length;
    const rejectionReasons = riskDecisions
      .filter((d) => d.status === "REJECTED" && d.reason)
      .reduce<Record<string, number>>((acc, d) => {
        const key = d.reason!;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});

    // ── Kill switch ───────────────────────────────────────────────────────
    const cfg = configResult.data;
    const killSwitch = cfg
      ? {
          active: cfg.kill_switch_active ?? false,
          reason: cfg.kill_switch_reason ?? null,
          at: cfg.kill_switch_at ?? null,
          mode: cfg.mode ?? "paper",
          enabled: cfg.enabled ?? false,
        }
      : null;

    return NextResponse.json({
      strategy,
      window_hours: hours,
      stats: {
        total_runs: totalGenerated,
        runs_with_signal: totalWithSignal,
        total_signals: signals.length,
        hit_rate: hitRate,
        avg_confidence: avgConfidence,
        risk_approved: approved,
        risk_rejected: rejected,
        rejection_reasons: rejectionReasons,
      },
      signals,
      risk_decisions: riskDecisions,
      orders: ordersResult.data ?? [],
      positions: positionsResult.data ?? [],
      kill_switch: killSwitch,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[trading/signals] Unexpected error:", msg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SignalRow {
  id: string;
  strategy: string;
  symbol: string;
  timeframe: string;
  action: string;
  confidence: number;
  score: number;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  rationale: string;
  created_at: string;
}

interface RiskDecisionRow {
  id: string;
  symbol: string;
  action: string;
  status: string; // "APPROVED" | "REJECTED"
  reason: string | null;
  position_size: number | null;
  position_value: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  created_at: string;
}
