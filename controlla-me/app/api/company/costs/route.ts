/**
 * API Company Costs — GET con filtri per agent/days/provider
 * Richiede autenticazione.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDailyCosts, getTotalSpend } from "@/lib/company/cost-logger";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

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
