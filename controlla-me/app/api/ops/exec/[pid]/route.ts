/**
 * DELETE /api/ops/exec/:pid
 *
 * Kill a running CLI process spawned by /api/ops/exec.
 *
 * Security:
 *   - requireConsoleAuth (HMAC-SHA256 token)
 *   - CSRF check
 *   - Rate limit: 5/min
 *
 * Params:
 *   pid: number — PID of the process to kill
 *
 * Returns:
 *   200 { ok: true, pid, signal }
 *   400 — invalid PID
 *   401 — unauthorized
 *   404 — process not found in active map
 *   500 — kill failed
 */

import { NextRequest } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { getActiveProcess, removeActiveProcess } from "../route";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ pid: string }> }
) {
  // CSRF check
  const csrfError = checkCsrf(req as unknown as NextRequest);
  if (csrfError) return csrfError;

  // Rate limit: 5/min
  const rl = await checkRateLimit(req as unknown as NextRequest);
  if (rl) return rl;

  // Auth
  const tokenPayload = requireConsoleAuth(req as unknown as NextRequest);
  if (!tokenPayload) {
    return new Response(
      JSON.stringify({ error: "Non autorizzato" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const { pid: pidStr } = await params;
  const pid = parseInt(pidStr, 10);

  if (isNaN(pid) || pid <= 0) {
    return new Response(
      JSON.stringify({ error: "PID non valido" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const child = getActiveProcess(pid);
  if (!child) {
    return new Response(
      JSON.stringify({
        error: `Processo non trovato: PID ${pid}`,
        hint: "Il processo potrebbe essere gia terminato",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const operatorName = `${tokenPayload.nome} ${tokenPayload.cognome}`;

  try {
    // Send SIGTERM (graceful shutdown)
    const killed = child.kill("SIGTERM");

    // Clean up tracking
    removeActiveProcess(pid);

    console.log(
      `[OPS-EXEC] ${operatorName} killed PID ${pid} via DELETE (SIGTERM sent, success=${killed})`
    );

    return new Response(
      JSON.stringify({
        ok: true,
        pid,
        signal: "SIGTERM",
        message: `SIGTERM inviato a PID ${pid}`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[OPS-EXEC] Kill failed for PID ${pid}: ${errMsg}`);

    return new Response(
      JSON.stringify({ error: `Kill fallito: ${errMsg}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
