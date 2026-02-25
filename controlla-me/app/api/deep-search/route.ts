import { NextRequest, NextResponse } from "next/server";
import { runDeepSearch } from "@/lib/agents/investigator";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { sanitizeUserQuestion } from "@/lib/middleware/sanitize";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // Auth
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  // Rate limit
  const limited = checkRateLimit(req, auth.user.id);
  if (limited) return limited;

  try {
    const body = await req.json();
    const { clauseContext, existingAnalysis, userQuestion, analysisId } = body;

    if (!userQuestion || !userQuestion.trim()) {
      return NextResponse.json(
        { error: "Domanda non fornita" },
        { status: 400 }
      );
    }

    const sanitizedQuestion = sanitizeUserQuestion(userQuestion);

    const result = await runDeepSearch(
      clauseContext || "",
      existingAnalysis || "",
      sanitizedQuestion
    );

    return NextResponse.json({
      analysisId,
      question: sanitizedQuestion,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Errore durante la ricerca";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
