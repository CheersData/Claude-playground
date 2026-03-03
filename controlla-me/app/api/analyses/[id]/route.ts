import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { requireAuth, isAuthError, type AuthResult } from "@/lib/middleware/auth";

/**
 * GET /api/analyses/[id]
 *
 * Returns a single analysis by ID for the authenticated user.
 * RLS enforced by Supabase: users can only access their own analyses.
 *
 * TD-3 fix: analysis/[id]/page.tsx used mock data.
 * This endpoint provides real data from Supabase with RLS.
 *
 * Response: { analysis: AnalysisRow } | { error: string }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limit
  const limited = await checkRateLimit(req);
  if (limited) return limited;

  // Auth
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult as NextResponse;
  const { user } = authResult as AuthResult;

  const { id } = await params;

  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "ID analisi non valido." }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("analyses")
    .select(
      "id, user_id, file_name, document_type, status, classification, analysis, investigation, advice, fairness_score, summary, created_at, completed_at"
    )
    .eq("id", id)
    .eq("user_id", user.id) // RLS double-check: explicit user filter
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Not found or not owned by this user
      return NextResponse.json(
        { error: "Analisi non trovata o accesso non autorizzato." },
        { status: 404 }
      );
    }
    console.error("[API] /api/analyses/[id] error:", error.message);
    return NextResponse.json(
      { error: "Errore durante il recupero dell'analisi." },
      { status: 500 }
    );
  }

  return NextResponse.json({ analysis: data });
}
