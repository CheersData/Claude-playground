import { NextRequest, NextResponse } from "next/server";
import { getArticle, searchArticlesFullText, searchArticles } from "@/lib/legal-corpus";
import { isVectorDBEnabled } from "@/lib/embeddings";

/**
 * GET /api/corpus/article
 *
 * ?source=Codice%20Civile&ref=Art.%201538  → dettaglio singolo articolo
 * ?q=vendita+a+corpo                       → ricerca full-text
 * ?q=vendita+a+corpo&semantic=true         → ricerca semantica (Voyage AI)
 * ?q=...&source=Codice%20Civile            → ricerca filtrata per fonte
 */
export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get("source");
  const ref = req.nextUrl.searchParams.get("ref");
  const query = req.nextUrl.searchParams.get("q");
  const semantic = req.nextUrl.searchParams.get("semantic") === "true";

  try {
    // Dettaglio singolo articolo
    if (source && ref) {
      const article = await getArticle(source, ref);
      if (!article) {
        return NextResponse.json({ error: "Articolo non trovato" }, { status: 404 });
      }
      return NextResponse.json({ article });
    }

    // Ricerca
    if (query) {
      if (semantic && isVectorDBEnabled()) {
        const results = await searchArticles(query, {
          lawSource: source ?? undefined,
          threshold: 0.5,
          limit: 20,
        });
        return NextResponse.json({ results, mode: "semantic" });
      }

      const results = await searchArticlesFullText(query, source ?? undefined);
      return NextResponse.json({ results, mode: "fulltext" });
    }

    return NextResponse.json(
      { error: "Parametri richiesti: source+ref (dettaglio) oppure q (ricerca)" },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
