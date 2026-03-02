/**
 * Audit Log — Logging strutturato persistente su Supabase.
 *
 * EU AI Act art. 13: tracciabilità delle decisioni AI.
 * GDPR art. 5(2): accountability del titolare del trattamento.
 *
 * Uso:
 *   await auditLog({ eventType: "analyze.complete", userId, payload: { ... } });
 *
 * Non-blocking: gli errori di scrittura sono loggati su console ma non propagati
 * per evitare che un problema del DB blocchi l'esperienza utente.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { NextRequest } from "next/server";

// ─── Types ───

export type AuditEventType =
  | "auth.login"          // Console auth success
  | "auth.failed"         // Console auth failure
  | "auth.logout"         // Session expired / logout
  | "analyze.start"       // Analisi avviata
  | "analyze.complete"    // Analisi completata con successo
  | "analyze.error"       // Analisi fallita
  | "tier.change"         // Cambio tier nella console
  | "agent.toggle"        // Agent abilitato/disabilitato
  | "corpus.query"        // Query al corpus legislativo
  | "stripe.checkout"     // Checkout Stripe avviato
  | "stripe.webhook"      // Webhook Stripe ricevuto
  | "rate_limit.hit"      // Rate limit raggiunto
  | "upload.success"      // Upload documento completato
  | "upload.error";       // Upload documento fallito

export interface AuditLogEntry {
  eventType: AuditEventType;
  userId?: string | null;
  consoleSid?: string | null;
  analysisSessionId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  payload?: Record<string, unknown>;
  result?: "success" | "failure" | "error" | "rate_limited";
  errorMessage?: string | null;
  durationMs?: number | null;
  tokensInput?: number | null;
  tokensOutput?: number | null;
  aiModel?: string | null;
}

// ─── Core ───

/**
 * Scrive un entry nell'audit log. Fire-and-forget: non blocca mai.
 */
export async function auditLog(entry: AuditLogEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("audit_logs").insert({
      event_type: entry.eventType,
      user_id: entry.userId ?? null,
      console_sid: entry.consoleSid ?? null,
      analysis_session_id: entry.analysisSessionId ?? null,
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
      payload: entry.payload ?? {},
      result: entry.result ?? null,
      error_message: entry.errorMessage ?? null,
      duration_ms: entry.durationMs ?? null,
      tokens_input: entry.tokensInput ?? null,
      tokens_output: entry.tokensOutput ?? null,
      ai_model: entry.aiModel ?? null,
    });

    if (error) {
      console.error("[AUDIT] Errore scrittura audit log:", error.message);
    }
  } catch (err) {
    // Non propagare mai — l'audit log non deve bloccare le funzioni core
    console.error("[AUDIT] Errore audit log (non bloccante):", err);
  }
}

// ─── Helpers ───

/**
 * Estrae IP e User-Agent dalla request per il log.
 */
export function extractRequestMeta(req: NextRequest): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;

  const userAgent = req.headers.get("user-agent") || null;

  return { ipAddress: ip, userAgent };
}

/**
 * Wrapper per misurare la durata di un'operazione e loggarla.
 *
 * Esempio:
 *   const result = await withAuditLog(
 *     { eventType: "analyze.complete", userId, payload: { documentHash } },
 *     async () => { return await runOrchestrator(text, ...) }
 *   );
 */
export async function withAuditLog<T>(
  baseEntry: Omit<AuditLogEntry, "durationMs" | "result" | "errorMessage">,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    await auditLog({
      ...baseEntry,
      durationMs: Date.now() - start,
      result: "success",
    });
    return result;
  } catch (err) {
    await auditLog({
      ...baseEntry,
      durationMs: Date.now() - start,
      result: "error",
      errorMessage: err instanceof Error ? err.message.slice(0, 500) : String(err),
    });
    throw err;
  }
}
