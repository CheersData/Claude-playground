/**
 * API Company Status — GET aggregato per dashboard /ops
 *
 * Combina: task board + costi + pipeline + agent config
 */

import { NextResponse } from "next/server";
import { getTaskBoard } from "@/lib/company/tasks";
import { getTotalSpend } from "@/lib/company/cost-logger";
import { getConnectorStatus } from "@/lib/staff/data-connector/sync-log";
import { AGENT_MODELS, MODELS, type AgentName } from "@/lib/models";

export async function GET() {
  try {
    const [board, costs, pipeline] = await Promise.all([
      getTaskBoard(),
      getTotalSpend(7),
      getConnectorStatus().catch(() => []),
    ]);

    // Agent config summary
    const agents: Record<string, { model: string; maxTokens: number; temperature: number }> = {};
    for (const [name, config] of Object.entries(AGENT_MODELS)) {
      agents[name] = {
        model: MODELS[config.primary].displayName,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
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
