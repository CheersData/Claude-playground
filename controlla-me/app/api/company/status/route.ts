/**
 * API Company Status — GET aggregato per dashboard /ops
 *
 * Combina: task board + costi + pipeline + agent config
 */

import { NextRequest, NextResponse } from "next/server";
import { getTaskBoard } from "@/lib/company/tasks";
import { getTotalSpend } from "@/lib/company/cost-logger";
import { getConnectorStatus } from "@/lib/staff/data-connector/sync-log";
import { AGENT_MODELS, MODELS } from "@/lib/models";
import { getTierInfoForSession } from "@/lib/tiers";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

export async function GET(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  try {
    const [board, costs, pipeline] = await Promise.all([
      getTaskBoard(),
      getTotalSpend(7),
      getConnectorStatus().catch(() => []),
    ]);

    // Agent config summary enriched with tier/enabled/chain position
    const disabled = new Set(payload.disabledAgents);
    const tierInfo = getTierInfoForSession(payload.tier, disabled);

    const agents: Record<string, { model: string; maxTokens: number; temperature: number; enabled: boolean; chainPosition: number }> = {};
    for (const [name, config] of Object.entries(AGENT_MODELS)) {
      const tierAgent = tierInfo.agents[name as keyof typeof tierInfo.agents];
      agents[name] = {
        model: tierAgent?.chain[tierAgent.activeIndex]?.displayName ?? MODELS[config.primary].displayName,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        enabled: tierAgent?.enabled ?? true,
        chainPosition: tierAgent?.activeIndex ?? 0,
      };
    }

    return NextResponse.json({
      board,
      costs,
      pipeline,
      agents,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
