/**
 * GET /api/studia/hierarchy — Navigazione corpus medico studia.me
 *
 * Due modalità:
 *   GET /api/studia/hierarchy              → Lista fonti con conteggio
 *   GET /api/studia/hierarchy?source=xxx   → Gerarchia navigabile per fonte
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import {
  getMedicalCorpusSources,
  getMedicalSourceHierarchy,
} from "@/lib/medical-corpus";

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req);
  if (limited) return limited;

  const source = req.nextUrl.searchParams.get("source");

  try {
    if (!source) {
      // Lista fonti con conteggio articoli
      const sources = await getMedicalCorpusSources();
      return NextResponse.json({ sources });
    }

    // Gerarchia navigabile per una fonte specifica
    const hierarchy = await getMedicalSourceHierarchy(source);

    // Build tree from hierarchy data
    const tree = buildHierarchyTree(hierarchy.articles);

    return NextResponse.json({
      source_id: source,
      source_name: hierarchy.source_name,
      article_count: hierarchy.articles.length,
      tree,
    });
  } catch (err) {
    console.error("[STUDIA-HIERARCHY] Errore:", err);
    return NextResponse.json(
      { error: "Errore nel caricamento della gerarchia" },
      { status: 500 }
    );
  }
}

/**
 * Costruisce un albero navigabile dagli articoli.
 * Usa il campo hierarchy per raggruppare in livelli.
 */
function buildHierarchyTree(articles: Array<{
  id: string;
  article_reference: string;
  article_title: string | null;
  hierarchy: Record<string, string>;
}>) {
  // Group by first hierarchy level
  const groups: Record<string, typeof articles> = {};

  for (const art of articles) {
    const h = art.hierarchy || {};
    const keys = Object.keys(h);
    const topKey = keys[0] || "Generale";
    const topValue = h[topKey] || "Altro";
    const groupLabel = `${topValue}`;

    if (!groups[groupLabel]) groups[groupLabel] = [];
    groups[groupLabel].push(art);
  }

  return Object.entries(groups).map(([label, arts]) => ({
    key: label.toLowerCase().replace(/\s+/g, "_"),
    label,
    article_count: arts.length,
    articles: arts.map((a) => ({
      id: a.id,
      article_number: a.article_reference,
      article_title: a.article_title,
      hierarchy: a.hierarchy,
    })),
  }));
}
