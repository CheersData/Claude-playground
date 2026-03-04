/**
 * POST /api/legaloffice/leader
 *
 * Leader conversazionale dell'Ufficio Legale.
 * Risponde a domande libere sul documento analizzato usando i phaseResults.
 *
 * Body: { message, sessionId?, agentContext?, phaseResults? }
 * Response: { answer: string }
 */

import { NextResponse } from "next/server";
import { generate } from "@/lib/ai-sdk/generate";
import { LEGALOFFICE_LEADER_SYSTEM, buildLeaderPrompt } from "@/lib/prompts/legaloffice-leader";
import { getAgentChain } from "@/lib/tiers";
import { MODELS, isProviderEnabled } from "@/lib/models";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      message,
      agentContext,
      phaseResults = {},
    }: {
      message: string;
      agentContext?: string | null;
      phaseResults?: Record<string, unknown>;
    } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: "Messaggio vuoto" }, { status: 400 });
    }

    const prompt = buildLeaderPrompt(message, agentContext ?? null, phaseResults);

    // Usa la catena del leader, scendi finché trova un provider disponibile
    const chain = getAgentChain("leader");
    let answer = "";
    let lastError: Error | null = null;

    for (const modelKey of chain) {
      const model = MODELS[modelKey];
      if (!isProviderEnabled(model.provider)) continue;

      try {
        const result = await generate(modelKey, prompt, {
          systemPrompt: LEGALOFFICE_LEADER_SYSTEM,
          maxTokens: 800,
          temperature: 0.4,
          jsonOutput: false,
          agentName: "LEGALOFFICE-LEADER",
        });
        answer = result.text.trim();
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(`[LEGALOFFICE-LEADER] ${modelKey} fallito:`, lastError.message);
        continue;
      }
    }

    if (!answer) {
      console.error("[LEGALOFFICE-LEADER] Tutti i modelli falliti:", lastError?.message);
      return NextResponse.json(
        { answer: "Non riesco a rispondere al momento. Riprova tra qualche secondo." },
        { status: 200 }
      );
    }

    return NextResponse.json({ answer });
  } catch (err) {
    console.error("[LEGALOFFICE-LEADER] Errore:", err);
    return NextResponse.json(
      { answer: "Errore interno. Riprova." },
      { status: 200 } // 200 per non crashare il frontend
    );
  }
}
