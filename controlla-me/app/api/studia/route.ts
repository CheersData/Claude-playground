/**
 * GET /api/studia — Statistiche corpus medico studia.me
 * POST /api/studia — Caricamento articoli medici (protetto)
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { getMedicalCorpusStats } from "@/lib/medical-corpus";

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req);
  if (limited) return limited;

  try {
    const stats = await getMedicalCorpusStats();
    return NextResponse.json({
      vertical: "medical",
      ...stats,
    });
  } catch (err) {
    console.error("[STUDIA-STATS] Errore:", err);
    return NextResponse.json(
      { error: "Errore nel recupero statistiche corpus medico" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const auth = await requireAuth();
  if (isAuthError(auth)) return auth;

  const limited = await checkRateLimit(req, auth.user.id);
  if (limited) return limited;

  // For now, medical corpus ingestion is handled by data-connector scripts
  return NextResponse.json(
    { error: "Ingest medico non ancora implementato. Usa data-connector CLI." },
    { status: 501 }
  );
}
