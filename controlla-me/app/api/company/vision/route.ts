/**
 * GET /api/company/vision  — legge vision/mission corrente
 * PUT /api/company/vision  — aggiorna vision/mission
 */

import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { getVision, upsertVision, getLatestPlan } from "@/lib/company/vision";

export async function GET(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  try {
    const [vision, latestPlan] = await Promise.all([getVision(), getLatestPlan()]);
    return NextResponse.json({ vision, latestPlan });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
    const { vision, mission, priorities } = body;

    if (typeof vision !== "string" || typeof mission !== "string") {
      return NextResponse.json({ error: "vision e mission sono obbligatori" }, { status: 400 });
    }

    const updatedBy = (payload as { sub?: string }).sub ?? "boss";
    const updated = await upsertVision(
      { vision, mission, priorities: Array.isArray(priorities) ? priorities : [] },
      updatedBy
    );

    if (!updated) {
      return NextResponse.json({ error: "Aggiornamento fallito" }, { status: 500 });
    }

    return NextResponse.json({ vision: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
