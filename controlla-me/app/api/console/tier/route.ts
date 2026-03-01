import { NextRequest, NextResponse } from "next/server";
import {
  getTierInfoForSession,
  estimateTierCostForSession,
  type TierName,
} from "@/lib/tiers";
import { AGENT_MODELS, type AgentName } from "@/lib/models";
import { checkCsrf } from "@/lib/middleware/csrf";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import {
  requireConsoleAuth,
  refreshToken,
} from "@/lib/middleware/console-token";

const VALID_TIERS: TierName[] = ["intern", "associate", "partner"];

/** GET — stato tier della sessione corrente + mappa agenti/modelli */
export async function GET(req: NextRequest) {
  // Rate limiting (SEC-003)
  const rl = checkRateLimit(req);
  if (rl) return rl;

  // Auth (SEC-004) — richiede Bearer token valido
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const disabled = new Set(payload.disabledAgents);
  const info = getTierInfoForSession(payload.tier, disabled);
  const cost = estimateTierCostForSession(payload.tier, disabled);

  return NextResponse.json({ ...info, estimatedCost: cost });
}

/** POST — switch tier oppure toggle agente (stateless via token refresh) */
export async function POST(req: NextRequest) {
  // CSRF
  const csrf = checkCsrf(req);
  if (csrf) return csrf;

  // Rate limiting (SEC-003)
  const rl = checkRateLimit(req);
  if (rl) return rl;

  // Auth (SEC-004)
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const body = await req.json();

  let newTier: TierName = payload.tier;
  let newDisabled: AgentName[] = [...payload.disabledAgents];

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

    if (enabled) {
      newDisabled = newDisabled.filter((a) => a !== agent);
    } else {
      if (!newDisabled.includes(agent as AgentName)) {
        newDisabled = [...newDisabled, agent as AgentName];
      }
    }
  } else {
    // Switch tier: { tier: "intern" }
    const tier = body.tier as string;
    if (!VALID_TIERS.includes(tier as TierName)) {
      return NextResponse.json(
        { error: `Tier non valido. Usa: ${VALID_TIERS.join(", ")}` },
        { status: 400 }
      );
    }
    newTier = tier as TierName;
  }

  // Emette un nuovo token HMAC con tier/disabledAgents aggiornati
  // Il client salva il nuovo token in sessionStorage per le chiamate successive
  const newToken = refreshToken(payload, { tier: newTier, disabledAgents: newDisabled });

  const disabled = new Set(newDisabled);
  const info = getTierInfoForSession(newTier, disabled);
  const cost = estimateTierCostForSession(newTier, disabled);

  return NextResponse.json({ ...info, estimatedCost: cost, token: newToken });
}
