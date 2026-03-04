/**
 * API Trading Orders — GET ordini eseguiti su Alpaca
 *
 * Query params:
 *   limit  — max ordini (default: 50, max: 200)
 *   hours  — finestra temporale in ore (default: 48, max: 720 = 30gg)
 *   status — filtro status: "filled" | "canceled" | "all" (default: "all")
 *   symbol — filtro simbolo (opzionale)
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
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const hours = Math.min(parseInt(searchParams.get("hours") ?? "48", 10), 720);
  const statusFilter = searchParams.get("status") ?? "all";
  const symbol = searchParams.get("symbol") ?? null;

  const supabase = createAdminClient();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  try {
    let query = supabase
      .from("trading_orders")
      .select(
        "id, symbol, side, qty, order_type, status, filled_avg_price, filled_qty, filled_at, stop_loss, take_profit, created_at"
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    if (symbol) {
      query = query.eq("symbol", symbol.toUpperCase());
    }

    const { data: rows, error } = await query;

    if (error) {
      console.error("[trading/orders] Supabase error:", error.message);
      return NextResponse.json(
        { error: "Database error", detail: error.message },
        { status: 500 }
      );
    }

    const orders = (rows ?? []).map((row) => ({
      id: row.id as string,
      symbol: (row.symbol as string) ?? "?",
      side: (row.side as string) ?? "buy",
      qty: (row.qty as number) ?? 0,
      order_type: (row.order_type as string) ?? "market",
      status: (row.status as string) ?? "unknown",
      filled_avg_price: (row.filled_avg_price as number) ?? null,
      filled_qty: (row.filled_qty as number) ?? null,
      filled_at: (row.filled_at as string) ?? null,
      stop_loss: (row.stop_loss as number) ?? null,
      take_profit: (row.take_profit as number) ?? null,
      created_at: row.created_at as string,
    }));

    // Aggregate stats
    const filled = orders.filter((o) => o.status === "filled");
    const buys = filled.filter((o) => o.side === "buy");
    const sells = filled.filter((o) => o.side === "sell" || o.side === "short");
    const totalVolume = filled.reduce(
      (sum, o) => sum + (o.filled_avg_price ?? 0) * (o.filled_qty ?? 0),
      0
    );

    return NextResponse.json({
      window_hours: hours,
      stats: {
        total: orders.length,
        filled: filled.length,
        canceled: orders.filter((o) => o.status === "canceled").length,
        pending: orders.filter((o) =>
          ["pending_new", "new", "accepted", "partially_filled"].includes(o.status)
        ).length,
        buys: buys.length,
        sells: sells.length,
        total_volume_usd: Math.round(totalVolume * 100) / 100,
      },
      orders,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[trading/orders] Unexpected error:", msg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
