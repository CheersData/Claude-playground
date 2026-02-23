import { NextRequest, NextResponse } from "next/server";
import { getCorpusSources, getSourceHierarchy } from "@/lib/legal-corpus";

/**
 * GET /api/corpus/hierarchy
 *
 * Senza parametri: lista tutte le fonti con conteggio articoli.
 * Con ?source=Codice%20Civile: albero gerarchico della fonte.
 */
export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get("source");

  try {
    if (!source) {
      const sources = await getCorpusSources();
      return NextResponse.json({ sources });
    }

    const hierarchy = await getSourceHierarchy(source);
    return NextResponse.json({ source, hierarchy });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
