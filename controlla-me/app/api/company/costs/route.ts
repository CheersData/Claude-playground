/**
 * API Company Costs — GET con filtri per agent/days/provider
 * Richiede autenticazione console operator (dati interni aziendali).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDailyCosts, getTotalSpend } from "@/lib/company/cost-logger";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

export async function GET(req: NextRequest) {
  // SEC-M1: Console auth (non Supabase auth) — dati aziendali riservati
  const authPayload = requireConsoleAuth(req);
  if (!authPayload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  try {
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get("days") ?? "7");
    const view = url.searchParams.get("view") ?? "daily"; // "daily" | "total"

    if (view === "total") {
      const spend = await getTotalSpend(days);
      return NextResponse.json(spend);
    }

    const daily = await getDailyCosts(days);
    return NextResponse.json({ days, daily });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
