/**
 * Vercel Cron: delta update corpus legislativo.
 *
 * GET /api/cron/delta-update
 *   Vercel Cron invia richieste GET — questo endpoint esegue il delta
 *   su tutte le fonti in stato "loaded" o "delta-active".
 *
 *   Header aggiunto da Vercel: Authorization: Bearer <CRON_SECRET>
 *
 * Schedule: vercel.json → "0 6 * * *" (ore 6 UTC)
 * Max duration: 300s (Vercel Pro)
 */

import { NextRequest, NextResponse } from "next/server";
import { runPipeline, getAllSources } from "@/lib/staff/data-connector";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // Autenticazione: Vercel Cron invia Authorization: Bearer <CRON_SECRET>
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[SECURITY] CRON_SECRET non configurato — endpoint bloccato per sicurezza");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  // Filtra solo fonti attive
  const sources = getAllSources().filter(
    (s) => s.lifecycle === "loaded" || s.lifecycle === "delta-active"
  );

  if (sources.length === 0) {
    return NextResponse.json({
      message: "Nessuna fonte in stato loaded o delta-active",
      startedAt,
      results: [],
    });
  }

  log(`[CRON delta-update] Avvio: ${sources.length} fonti — ${startedAt}`);

  const results = [];
  let totalInserted = 0;
  let totalErrors = 0;

  for (const source of sources) {
    try {
      log(`[CRON] Inizio delta: ${source.id}`);
      const result = await runPipeline(
        source.id,
        { stopAfter: "load", mode: "delta" },
        log
      );

      const inserted = result.loadResult?.inserted ?? 0;
      const errors = result.loadResult?.errors ?? 0;
      totalInserted += inserted;
      totalErrors += errors;

      results.push({
        sourceId: source.id,
        stoppedAt: result.stoppedAt,
        inserted,
        errors,
        durationMs: result.durationMs,
      });

      log(`[CRON] Fine delta ${source.id}: +${inserted} art, ${errors} err, ${result.durationMs}ms`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`[CRON] Errore ${source.id}: ${msg}`);
      results.push({ sourceId: source.id, error: msg });
      totalErrors++;
    }
  }

  const completedAt = new Date().toISOString();
  log(`[CRON delta-update] Completato: +${totalInserted} art totali, ${totalErrors} errori — ${completedAt}`);

  return NextResponse.json({
    startedAt,
    completedAt,
    totalSources: sources.length,
    totalInserted,
    totalErrors,
    results,
    logs,
  });
}
