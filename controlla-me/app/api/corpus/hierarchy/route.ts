import { NextRequest, NextResponse } from "next/server";
import { getCorpusSources, getSourceHierarchy } from "@/lib/legal-corpus";

/**
 * GET /api/corpus/hierarchy
 *   -> Lista fonti con conteggio articoli
 *
 * GET /api/corpus/hierarchy?source=codice_civile
 *   -> Albero navigabile della fonte specifica
 */
export async function GET(request: NextRequest) {
  try {
    const sourceId = request.nextUrl.searchParams.get("source");

    if (sourceId) {
      const hierarchy = await getSourceHierarchy(sourceId);
      if (!hierarchy) {
        return NextResponse.json(
          { error: `Fonte "${sourceId}" non trovata o vuota` },
          { status: 404 }
        );
      }
      return NextResponse.json(hierarchy);
    }

    // Lista tutte le fonti
    const sources = await getCorpusSources();
    return NextResponse.json({ sources });
  } catch (err) {
    console.error("[API] Errore corpus/hierarchy:", err);
    return NextResponse.json(
      { error: "Errore nel recupero della gerarchia" },
      { status: 500 }
    );
  }
}
