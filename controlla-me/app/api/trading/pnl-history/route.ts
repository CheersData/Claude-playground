/**
 * API Trading P&L History — GET serie storica P&L per grafici
 *
 * Restituisce: snapshot ultimi 90 giorni con cumulative_pnl calcolato
 * + punto "NOW" con unrealized_pnl totale dalle posizioni correnti.
 * Richiede: console auth (service_role su Supabase)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const supabase = createAdminClient();

  try {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const sinceStr = since.toISOString().split("T")[0]; // YYYY-MM-DD

    const [snapshotsResult, positionsResult] = await Promise.all([
      // Snapshot ultimi 90 giorni ordinati ASC per calcolo progressivo
      supabase
        .from("portfolio_snapshots")
        .select(
          "date, portfolio_value, daily_pnl, positions_count"
        )
        .gte("date", sinceStr)
        .order("date", { ascending: true }),

      // Posizioni correnti per P&L unrealized attuale
      supabase
        .from("portfolio_positions")
        .select("symbol, unrealized_pnl, unrealized_pnl_pct"),
    ]);

    // Calcola cumulative_pnl come somma progressiva di daily_pnl
    let cumulative = 0;
    const snapshots = (snapshotsResult.data ?? []).map((row) => {
      cumulative += row.daily_pnl ?? 0;
      return {
        date: row.date,
        portfolio_value: row.portfolio_value ?? 0,
        daily_pnl: row.daily_pnl ?? 0,
        cumulative_pnl: Math.round(cumulative * 100) / 100,
        positions_count: row.positions_count ?? 0,
      };
    });

    // Punto "NOW": somma unrealized_pnl da posizioni aperte
    const positions = positionsResult.data ?? [];
    const totalUnrealizedPnl = positions.reduce(
      (sum, p) => sum + (p.unrealized_pnl ?? 0),
      0
    );

    const current = {
      unrealized_pnl: Math.round(totalUnrealizedPnl * 100) / 100,
      positions: positions.map((p) => ({
        symbol: p.symbol,
        unrealized_pnl: Math.round((p.unrealized_pnl ?? 0) * 100) / 100,
        unrealized_pnl_pct: Math.round((p.unrealized_pnl_pct ?? 0) * 10000) / 10000,
      })),
    };

    return NextResponse.json({ snapshots, current });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: message, snapshots: [], current: { unrealized_pnl: 0, positions: [] } },
      { status: 500 }
    );
  }
}
