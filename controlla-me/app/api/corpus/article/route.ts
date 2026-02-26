import { NextRequest, NextResponse } from "next/server";
import { getArticleById, searchArticles } from "@/lib/legal-corpus";

/**
 * GET /api/corpus/article?id=uuid
 *   -> Dettaglio singolo articolo
 *
 * GET /api/corpus/article?q=recesso&source=codice_civile
 *   -> Ricerca articoli
 */
export async function GET(request: NextRequest) {
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
      const results = await searchArticles(query, { lawSource: sourceId || undefined });
      return NextResponse.json({ results, count: results.length });
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
