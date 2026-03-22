/**
 * POST /api/company/agents/test — Test broadcast per verificare AgentDots.
 *
 * Invia eventi "running" per 5 dipartimenti in sequenza (300ms ciascuno),
 * poi "done" dopo 3s. Il boss può premere "Test Pallini" su /ops per verificare
 * che il flusso broadcast → SSE → EventSource → AgentDots funzioni end-to-end.
 */

import { NextRequest } from "next/server";
import { requireConsoleAuth } from "@/lib/middleware/console-token";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { broadcastAgentEvent } from "@/lib/agent-broadcast";

export async function POST(req: NextRequest) {
  // CSRF protection
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const auth = requireConsoleAuth(req);
  if (!auth) {
    return Response.json({ error: "Non autorizzato" }, { status: 401 });
  }

  // Rate limit
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const departments = [
    "cme",
    "ufficio-legale",
    "quality-assurance",
    "data-engineering",
    "trading",
  ];

  // Fire "running" events in sequence with small delays
  for (const dept of departments) {
    broadcastAgentEvent({
      id: `test-${dept}`,
      department: dept,
      task: `Test pallino ${dept}`,
      status: "running",
    });
  }

  // Schedule "done" after 4s
  setTimeout(() => {
    for (const dept of departments) {
      broadcastAgentEvent({
        id: `test-${dept}`,
        department: dept,
        task: `Test pallino ${dept}`,
        status: "done",
      });
    }
  }, 4_000);

  return Response.json({
    ok: true,
    message: `Test broadcast: ${departments.length} dipartimenti attivati per 4s`,
    departments,
  });
}
