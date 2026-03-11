/**
 * API Trading P&L Summary — GET riepilogo profitti/perdite
 *
 * Calcola:
 *   - realized_pnl: P&L effettivo da trade chiusi (buy matched con sell)
 *   - unrealized_pnl: P&L in corso da posizioni aperte (prezzi correnti)
 *
 * Query params:
 *   days — finestra storica in giorni (default: 30, max: 90)
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
  const days = Math.min(parseInt(searchParams.get("days") ?? "30", 10), 90);

  const supabase = createAdminClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    // ── Query parallele ────────────────────────────────────────────────────
    const [ordersResult, positionsResult] = await Promise.all([
      // Tutti gli ordini eseguiti (filled + partially_filled) nel periodo
      supabase
        .from("trading_orders")
        .select(
          "id, symbol, side, qty, filled_avg_price, filled_qty, filled_at, stop_loss, take_profit, status, created_at"
        )
        .in("status", ["filled", "partially_filled"])
        .gte("created_at", since)
        .order("created_at", { ascending: true }),

      // Posizioni attualmente aperte
      supabase
        .from("portfolio_positions")
        .select(
          "symbol, qty, avg_entry_price, current_price, market_value, unrealized_pnl, unrealized_pnl_pct, days_held"
        )
        .gt("qty", 0)
        .order("market_value", { ascending: false }),
    ]);

    const orders = ordersResult.data ?? [];

    // ── Separa buy e sell ─────────────────────────────────────────────────
    const buys = orders.filter(
      (o) => o.side === "buy" && o.filled_avg_price && (o.filled_qty ?? 0) > 0
    );
    const sells = orders.filter(
      (o) => o.side === "sell" && o.filled_avg_price && (o.filled_qty ?? 0) > 0
    );

    // ── Match sell → buy per calcolo P&L realizzato ───────────────────────
    // Per ogni ordine SELL, cerca il BUY più recente per stesso symbol
    // avvenuto PRIMA della vendita.
    const closedTrades: ClosedTrade[] = [];

    for (const sell of sells) {
      if (!sell.filled_avg_price || !sell.filled_qty) continue;

      const sellTime = new Date(sell.filled_at ?? sell.created_at).getTime();

      // BUY più recente per questo symbol prima del sell
      const matchingBuy = buys
        .filter(
          (b) =>
            b.symbol === sell.symbol &&
            b.filled_avg_price &&
            new Date(b.filled_at ?? b.created_at).getTime() < sellTime
        )
        .sort(
          (a, b) =>
            new Date(b.filled_at ?? b.created_at).getTime() -
            new Date(a.filled_at ?? a.created_at).getTime()
        )[0];

      if (matchingBuy && matchingBuy.filled_avg_price) {
        const qty = sell.filled_qty;
        const entry = matchingBuy.filled_avg_price;
        const exit = sell.filled_avg_price;
        const pnl = (exit - entry) * qty;
        const pnl_pct = (exit - entry) / entry;

        closedTrades.push({
          symbol: sell.symbol,
          entry_price: entry,
          exit_price: exit,
          qty,
          pnl,
          pnl_pct,
          closed_at: sell.filled_at ?? sell.created_at,
          partial: sell.status === "partially_filled",
        });
      }
    }

    const realized_pnl = closedTrades.reduce((sum, t) => sum + t.pnl, 0);

    // ── Unrealized P&L dalle posizioni aperte ─────────────────────────────
    const positions = positionsResult.data ?? [];
    const unrealized_pnl = positions.reduce(
      (sum, p) => sum + (p.unrealized_pnl ?? 0),
      0
    );

    // ── Response ──────────────────────────────────────────────────────────
    return NextResponse.json({
      realized_pnl,
      unrealized_pnl,
      total_pnl: realized_pnl + unrealized_pnl,
      trades_count: closedTrades.length,
      positions_count: positions.length,
      closed_trades: closedTrades,
      open_positions: positions.map((p) => ({
        symbol: p.symbol,
        qty: p.qty,
        avg_entry_price: p.avg_entry_price,
        current_price: p.current_price,
        unrealized_pnl: p.unrealized_pnl ?? 0,
        unrealized_pnl_pct: p.unrealized_pnl_pct ?? 0,
        days_held: p.days_held ?? 0,
      })),
      as_of: new Date().toISOString(),
      days_window: days,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[trading/pnl-summary] Unexpected error:", msg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClosedTrade {
  symbol: string;
  entry_price: number;
  exit_price: number;
  qty: number;
  pnl: number;
  pnl_pct: number;
  closed_at: string;
  partial: boolean;
}
