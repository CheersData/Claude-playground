/**
 * POST /api/company/daily-plan
 *
 * Genera il piano giornaliero eseguendo: npx tsx scripts/daily-standup.ts
 * In ambiente demo può fallire parzialmente (claude -p non disponibile)
 * ma genera comunque la struttura base del piano dal task board.
 *
 * Auth: requireConsoleAuth
 */

import { NextRequest, NextResponse } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { spawnSync } from "child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = requireConsoleAuth(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await checkRateLimit(req);
  if (rl) return rl;

  try {
    const result = spawnSync("npx", ["tsx", "scripts/daily-standup.ts"], {
      cwd: process.cwd(),
      encoding: "utf-8",
      timeout: 60_000,
      env: { ...process.env },
    });

    if (result.error) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error.message,
          hint: "Esegui manualmente dal terminale: npx tsx scripts/daily-standup.ts",
        },
        { status: 500 }
      );
    }

    const stdout = result.stdout?.slice(0, 1000) ?? "";
    const stderr = result.stderr?.slice(0, 500) ?? "";
    const exitCode = result.status ?? 0;

    // Piano generato anche se ci sono errori parziali (demo: claude -p fallisce ma il piano viene creato)
    return NextResponse.json({
      ok: exitCode === 0,
      exitCode,
      stdout,
      stderr: stderr || null,
      partial: exitCode !== 0,
      message:
        exitCode === 0
          ? "Piano generato con successo."
          : "Piano generato parzialmente (analisi AI non disponibili in demo — crediti API assenti).",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        hint: "Esegui manualmente dal terminale: npx tsx scripts/daily-standup.ts",
      },
      { status: 500 }
    );
  }
}
