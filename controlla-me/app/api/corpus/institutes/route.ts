import { NextRequest, NextResponse } from "next/server";
import {
  getDistinctInstitutes,
  getArticlesByInstituteForUI,
} from "@/lib/legal-corpus";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

/**
 * GET /api/corpus/institutes
 *   -> Lista istituti con conteggio articoli
 *
 * GET /api/corpus/institutes?institute=vendita_a_corpo
 *   -> Articoli per un istituto specifico
 */
export async function GET(request: NextRequest) {
  const rateLimitError = await checkRateLimit(request);
  if (rateLimitError) return rateLimitError;

  try {
    const institute = request.nextUrl.searchParams.get("institute");

    if (institute) {
      const articles = await getArticlesByInstituteForUI(institute);
      return NextResponse.json({ institute, articles, count: articles.length });
    }

    const institutes = await getDistinctInstitutes();
    return NextResponse.json({ institutes, count: institutes.length });
  } catch (err) {
    console.error("[API] Errore corpus/institutes:", err);
    return NextResponse.json(
      { error: "Errore nel recupero degli istituti" },
      { status: 500 }
    );
  }
}
