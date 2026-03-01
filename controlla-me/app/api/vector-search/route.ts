import { NextRequest, NextResponse } from "next/server";
import { searchAll } from "@/lib/vector-store";
import { searchArticles, getCorpusStats } from "@/lib/legal-corpus";
import { isVectorDBEnabled } from "@/lib/embeddings";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";

/**
 * POST /api/vector-search — Ricerca semantica nel vector DB.
 *
 * Body:
 *   { "query": "vendita a corpo tolleranza superficie",
 *     "type": "all" | "documents" | "knowledge" | "articles",
 *     "category": "law_reference" | "court_case" | "clause_pattern" | "risk_pattern",
 *     "limit": 5 }
 *
 * Response:
 *   { "documents": [...], "knowledge": [...], "articles": [...] }
 */
export async function POST(req: NextRequest) {
  // CSRF
  const csrf = checkCsrf(req);
  if (csrf) return csrf;

  // Auth
  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  // Rate limit
  const limited = checkRateLimit(req, auth.user.id);
  if (limited) return limited;

  if (!isVectorDBEnabled()) {
    return NextResponse.json(
      { error: "Vector DB non configurato. Aggiungi VOYAGE_API_KEY al .env.local." },
      { status: 503 }
    );
  }

  const body = await req.json();
  const { query, type = "all", limit = 5 } = body;

  if (!query || typeof query !== "string" || query.trim().length < 3) {
    return NextResponse.json(
      { error: "Query troppo corta. Minimo 3 caratteri." },
      { status: 400 }
    );
  }

  try {
    const results: {
      documents?: unknown[];
      knowledge?: unknown[];
      articles?: unknown[];
    } = {};

    if (type === "all" || type === "documents" || type === "knowledge") {
      const allResults = await searchAll(query, { limit });
      if (type === "all" || type === "documents") {
        results.documents = allResults.documents;
      }
      if (type === "all" || type === "knowledge") {
        results.knowledge = allResults.knowledge;
      }
    }

    if (type === "all" || type === "articles") {
      results.articles = await searchArticles(query, {
        threshold: 0.55,
        limit,
      });
    }

    return NextResponse.json(results);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/vector-search — Statistiche del vector DB.
 */
export async function GET() {
  if (!isVectorDBEnabled()) {
    return NextResponse.json({
      enabled: false,
      message: "Vector DB non configurato. Aggiungi VOYAGE_API_KEY al .env.local.",
    });
  }

  try {
    const stats = await getCorpusStats();
    return NextResponse.json({
      enabled: true,
      corpus: stats,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
