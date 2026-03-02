import { NextRequest, NextResponse } from "next/server";
import { loadSession } from "@/lib/analysis-cache";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { sanitizeSessionId } from "@/lib/middleware/sanitize";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  // Auth
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  // Rate limit
  const limited = await checkRateLimit(req, auth.user.id);
  if (limited) return limited;

  const { sessionId: rawSessionId } = await params;

  // Sanitizza sessionId per prevenire path traversal
  const sessionId = sanitizeSessionId(rawSessionId);
  if (!sessionId) {
    return NextResponse.json(
      { error: "ID sessione non valido" },
      { status: 400 }
    );
  }

  const session = await loadSession(sessionId);

  if (!session) {
    return NextResponse.json(
      { error: "Sessione non trovata" },
      { status: 404 }
    );
  }

  return NextResponse.json(session);
}
