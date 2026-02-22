import { NextRequest, NextResponse } from "next/server";
import { ingestArticles, getCorpusStats } from "@/lib/legal-corpus";
import { isVectorDBEnabled } from "@/lib/embeddings";
import type { LegalArticle } from "@/lib/legal-corpus";

/**
 * POST /api/corpus — Carica articoli nel corpus legislativo.
 *
 * Body:
 *   { "articles": [{ "lawSource": "Codice Civile", "articleReference": "Art. 1538", ... }] }
 *
 * Richiede SUPABASE_SERVICE_ROLE_KEY (server-side only).
 */
export async function POST(req: NextRequest) {
  if (!isVectorDBEnabled()) {
    return NextResponse.json(
      { error: "Vector DB non configurato. Aggiungi VOYAGE_API_KEY al .env.local." },
      { status: 503 }
    );
  }

  const body = await req.json();
  const articles: LegalArticle[] = body.articles;

  if (!articles || !Array.isArray(articles) || articles.length === 0) {
    return NextResponse.json(
      { error: "Fornisci un array 'articles' con almeno un articolo." },
      { status: 400 }
    );
  }

  // Validate required fields
  for (const a of articles) {
    if (!a.lawSource || !a.articleReference || !a.articleText) {
      return NextResponse.json(
        {
          error: `Articolo invalido: lawSource, articleReference e articleText sono obbligatori. Problema con: ${a.articleReference ?? "unknown"}`,
        },
        { status: 400 }
      );
    }
  }

  try {
    const result = await ingestArticles(articles);
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/corpus — Statistiche del corpus legislativo.
 */
export async function GET() {
  try {
    const stats = await getCorpusStats();
    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
