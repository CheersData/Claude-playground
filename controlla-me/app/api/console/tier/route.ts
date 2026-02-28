import { NextRequest, NextResponse } from "next/server";
import {
  setCurrentTier,
  setAgentEnabled,
  getTierInfo,
  estimateTierCost,
  type TierName,
} from "@/lib/tiers";
import { AGENT_MODELS, type AgentName } from "@/lib/models";

const VALID_TIERS: TierName[] = ["intern", "associate", "partner"];

/** GET — stato tier corrente + mappa agenti/modelli */
export async function GET() {
  const info = getTierInfo();
  const cost = estimateTierCost();

  return NextResponse.json({
    ...info,
    estimatedCost: cost,
  });
}

/** POST — switch tier oppure toggle agente */
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Toggle singolo agente: { agent: "investigator", enabled: false }
  if (body.agent !== undefined) {
    const agent = body.agent as string;
    const enabled = body.enabled as boolean;

    if (!(agent in AGENT_MODELS)) {
      return NextResponse.json(
        { error: `Agente non valido: ${agent}` },
        { status: 400 }
      );
    }

    setAgentEnabled(agent as AgentName, enabled);

    const info = getTierInfo();
    const cost = estimateTierCost();
    return NextResponse.json({ ...info, estimatedCost: cost });
  }

  // Switch tier: { tier: "intern" }
  const tier = body.tier as string;

  if (!VALID_TIERS.includes(tier as TierName)) {
    return NextResponse.json(
      { error: `Tier non valido. Usa: ${VALID_TIERS.join(", ")}` },
      { status: 400 }
    );
  }

  setCurrentTier(tier as TierName);

  const info = getTierInfo();
  const cost = estimateTierCost();

  return NextResponse.json({
    ...info,
    estimatedCost: cost,
  });
}
