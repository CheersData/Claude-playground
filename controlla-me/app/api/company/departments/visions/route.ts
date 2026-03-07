/**
 * GET /api/company/departments/visions — tutte le vision/mission/priorità dei dipartimenti.
 * Dati statici dal registry, nessun DB call. Leggero e veloce.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { DEPARTMENTS, DEPT_ORDER } from "@/lib/company/departments";

export async function GET(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const departments = DEPT_ORDER.map((id) => {
    const d = DEPARTMENTS[id];
    return {
      id: d.id,
      label: d.label,
      emoji: d.emoji,
      type: d.type,
      mission: d.mission,
      vision: d.vision,
      priorities: d.priorities,
      agentCount: d.agents.length,
      kpis: d.kpis,
    };
  });

  return NextResponse.json({ departments });
}
