import { NextRequest, NextResponse } from "next/server";
import { getArticleById, searchArticles, searchArticlesText } from "@/lib/legal-corpus";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

/**
 * GET /api/corpus/article?id=uuid
 *   -> Dettaglio singolo articolo
 *
 * GET /api/corpus/article?q=recesso&source=codice_civile
 *   -> Ricerca ibrida: semantica + fallback testuale
 */
export async function GET(request: NextRequest) {
  const rateLimitError = await checkRateLimit(request);
  if (rateLimitError) return rateLimitError;

  try {
    const id = request.nextUrl.searchParams.get("id");
    const query = request.nextUrl.searchParams.get("q");
    const sourceId = request.nextUrl.searchParams.get("source");

    if (id) {
      const article = await getArticleById(id);
      if (!article) {
        return NextResponse.json({ error: "Articolo non trovato" }, { status: 404 });
      }
      return NextResponse.json(article);
    }

    if (query) {
      // 1. Semantic search (works best for longer, descriptive queries)
      const semantic = await searchArticles(query, {
        lawSource: sourceId || undefined,
        threshold: 0.35,
        limit: 20,
      });

      // 2. Text search fallback (works for short keywords like "vizi")
      const text = await searchArticlesText(query, {
        lawSource: sourceId || undefined,
        limit: 20,
      });

      // 3. Merge: text results first (exact match), then semantic, deduplicated
      const seen = new Set<string>();
      const merged: Array<{
        id: string;
        article_reference: string;
        article_title: string | null;
        law_source: string;
        similarity: number;
      }> = [];

      for (const r of text) {
        if (r.id && !seen.has(r.id)) {
          seen.add(r.id);
          merged.push({
            id: r.id!,
            article_reference: r.articleReference,
            article_title: r.articleTitle,
            law_source: r.lawSource,
            similarity: r.similarity,
          });
        }
      }

      for (const r of semantic) {
        if (r.id && !seen.has(r.id)) {
          seen.add(r.id);
          merged.push({
            id: r.id!,
            article_reference: r.articleReference,
            article_title: r.articleTitle,
            law_source: r.lawSource,
            similarity: r.similarity,
          });
        }
      }

      return NextResponse.json({ results: merged.slice(0, 30), count: merged.length });
    }

    return NextResponse.json(
      { error: "Specifica ?id=... o ?q=..." },
      { status: 400 }
    );
  } catch (err) {
    console.error("[API] Errore corpus/article:", err);
    return NextResponse.json(
      { error: "Errore nel recupero dell'articolo" },
      { status: 500 }
    );
  }
}
