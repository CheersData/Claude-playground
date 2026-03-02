/**
 * API Trading Dashboard — GET dati per sezione trading in /ops
 *
 * Restituisce: posizioni correnti, ordini recenti, snapshot P&L (serie storica)
 * Richiede: console auth (service_role su Supabase)
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

  const supabase = createAdminClient();

  try {
    const [positionsResult, ordersResult, snapshotsResult, configResult] =
      await Promise.all([
        // Posizioni correnti
        supabase
          .from("portfolio_positions")
          .select(
            "symbol, qty, avg_entry_price, current_price, market_value, unrealized_pnl, unrealized_pnl_pct, sector, days_held, updated_at"
          )
          .order("market_value", { ascending: false }),

        // Ordini recenti (ultimi 30)
        supabase
          .from("trading_orders")
          .select(
            "id, symbol, side, qty, order_type, status, filled_avg_price, filled_qty, filled_at, stop_loss, take_profit, created_at"
          )
          .order("created_at", { ascending: false })
          .limit(30),

        // Snapshot P&L ultimi 30 giorni
        supabase
          .from("portfolio_snapshots")
          .select(
            "date, portfolio_value, cash, positions_value, daily_pnl, daily_pnl_pct, weekly_pnl_pct, max_drawdown_pct, sharpe_30d, win_rate, positions_count"
          )
          .order("date", { ascending: true })
          .limit(30),

        // Config (kill switch, mode)
        supabase
          .from("trading_config")
          .select("mode, enabled, kill_switch_active, kill_switch_reason, kill_switch_at")
          .limit(1)
          .maybeSingle(),
      ]);

    return NextResponse.json({
      positions: positionsResult.data ?? [],
      orders: ordersResult.data ?? [],
      snapshots: snapshotsResult.data ?? [],
      config: configResult.data ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
