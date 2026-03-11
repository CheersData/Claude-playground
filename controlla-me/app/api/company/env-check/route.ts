/**
 * GET /api/company/env-check
 * Ritorna la presenza delle variabili d'ambiente chiave (true/false, senza valori).
 * Richiede autenticazione console operator.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "MISTRAL_API_KEY",
  "GROQ_API_KEY",
  "CEREBRAS_API_KEY",
  "DEEPSEEK_API_KEY",
  "VOYAGE_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "STRIPE_SECRET_KEY",
  "TELEGRAM_BOT_TOKEN",
  "UPSTASH_REDIS_REST_URL",
  "CONSOLE_JWT_SECRET",
  "CRON_SECRET",
] as const;

export async function GET(req: NextRequest) {
  const payload = requireConsoleAuth(req);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const vars: Record<string, boolean> = {};
  for (const k of ENV_KEYS) {
    vars[k] = Boolean(process.env[k]?.trim());
  }

  return NextResponse.json({ vars });
}
