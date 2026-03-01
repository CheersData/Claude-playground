/**
 * Data Connector Cron API — Delta updates schedulati.
 *
 * POST /api/platform/cron/data-connector
 *   Authorization: Bearer CRON_SECRET
 *   Body opzionale: { sourceId?: string }
 *   → Delta update singola fonte o tutte le fonti loaded/delta-active
 *
 * GET /api/platform/cron/data-connector
 *   → Status tutte le fonti
 *
 * Schedule: giornaliero 06:00 (vercel.json)
 * Max duration: 300s (Vercel Pro)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  runPipeline,
  getAllSources,
  getLastSuccessfulSync,
} from "@/lib/staff/data-connector";

export const maxDuration = 300;

export async function GET() {
  const sources = getAllSources();
  const status = await Promise.all(
    sources.map(async (s) => {
      const lastSync = await getLastSuccessfulSync(s.id);
      return {
        id: s.id,
        name: s.shortName,
        lifecycle: s.lifecycle,
        estimatedItems: s.estimatedItems,
        lastSync: lastSync?.completedAt ?? null,
      };
    })
  );

  return NextResponse.json({
    totalSources: sources.length,
    sources: status,
  });
}

export async function POST(request: NextRequest) {
  // Verifica CRON_SECRET
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[SECURITY] CRON_SECRET non configurato — endpoint bloccato per sicurezza");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Body opzionale: { sourceId?: string }
  let sourceId: string | undefined;
  try {
    const body = await request.json();
    sourceId = body.sourceId;
  } catch {
    // Body vuoto o non-JSON: procede con tutte le fonti
  }

  const logs: string[] = [];
  const log = (msg: string) => logs.push(msg);

  try {
    if (sourceId) {
      // Delta singola fonte
      log(`[CRON] Delta update: ${sourceId}`);
      const result = await runPipeline(
        sourceId,
        { stopAfter: "load", mode: "delta" },
        log
      );

      return NextResponse.json({
        sourceId,
        result: {
          stoppedAt: result.stoppedAt,
          stoppedReason: result.stoppedReason,
          inserted: result.loadResult?.inserted ?? 0,
          errors: result.loadResult?.errors ?? 0,
          durationMs: result.durationMs,
        },
        logs,
      });
    }

    // Delta tutte le fonti loaded/delta-active
    const sources = getAllSources().filter(
      (s) => s.lifecycle === "loaded" || s.lifecycle === "delta-active"
    );

    if (sources.length === 0) {
      return NextResponse.json({
        message: "Nessuna fonte in stato loaded o delta-active",
        logs,
      });
    }

    log(`[CRON] Delta update per ${sources.length} fonti`);

    const results = [];
    for (const source of sources) {
      try {
        const result = await runPipeline(
          source.id,
          { stopAfter: "load", mode: "delta" },
          log
        );
        results.push({
          sourceId: source.id,
          stoppedAt: result.stoppedAt,
          inserted: result.loadResult?.inserted ?? 0,
          errors: result.loadResult?.errors ?? 0,
          durationMs: result.durationMs,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`[CRON] Errore ${source.id}: ${msg}`);
        results.push({
          sourceId: source.id,
          stoppedAt: "error",
          error: msg,
        });
      }
    }

    return NextResponse.json({ results, logs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`[CRON] Errore fatale: ${msg}`);
    return NextResponse.json({ error: msg, logs }, { status: 500 });
  }
}
