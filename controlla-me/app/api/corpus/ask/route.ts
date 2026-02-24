import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { sanitizeUserQuestion } from "@/lib/middleware/sanitize";
import { isVectorDBEnabled } from "@/lib/embeddings";
import { askCorpusAgent, type CorpusAgentConfig } from "@/lib/agents/corpus-agent";

export const maxDuration = 60;

/**
 * POST /api/corpus/ask — Domande al corpus legislativo via Corpus Agent.
 *
 * Body:
 *   { "question": "Cosa prevede il codice civile sulla vendita a corpo?", "config?": {} }
 *
 * Response:
 *   { answer, citedArticles, confidence, followUpQuestions, provider, articlesRetrieved, durationMs }
 */
export async function POST(req: NextRequest) {
  // Auth
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  // Rate limit
  const limited = checkRateLimit(req, auth.user.id);
  if (limited) return limited;

  // Vector DB check
  if (!isVectorDBEnabled()) {
    return NextResponse.json(
      { error: "Vector DB non disponibile. VOYAGE_API_KEY non configurata." },
      { status: 503 }
    );
  }

  // Parse body
  let body: { question?: string; config?: Partial<CorpusAgentConfig> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON non valido." },
      { status: 400 }
    );
  }

  // Validate question
  const rawQuestion = body.question;
  if (!rawQuestion || typeof rawQuestion !== "string") {
    return NextResponse.json(
      { error: "Campo 'question' obbligatorio." },
      { status: 400 }
    );
  }

  const question = sanitizeUserQuestion(rawQuestion);

  if (question.length < 5) {
    return NextResponse.json(
      { error: "La domanda deve essere di almeno 5 caratteri." },
      { status: 400 }
    );
  }

  if (question.length > 2000) {
    return NextResponse.json(
      { error: "La domanda non può superare i 2000 caratteri." },
      { status: 400 }
    );
  }

  // Validate config.provider if provided
  const config = body.config ?? {};
  if (
    config.provider &&
    !["auto", "gemini", "haiku"].includes(config.provider)
  ) {
    return NextResponse.json(
      { error: "Provider non valido. Usa 'auto', 'gemini' o 'haiku'." },
      { status: 400 }
    );
  }

  // Call corpus agent
  try {
    const result = await askCorpusAgent(question, config);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Errore sconosciuto";
    console.error(`[API /corpus/ask] Errore: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
