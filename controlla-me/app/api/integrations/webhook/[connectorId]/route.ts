/**
 * API Route: /api/integrations/webhook/[connectorId]
 *
 * Generic webhook handler for integration connectors.
 * Receives events from external providers (HubSpot, Fatture in Cloud, etc.)
 * and triggers a full sync for the affected user's connection.
 *
 * Security:
 * - Webhook signature validation per provider (HMAC SHA-256)
 * - Rate limiting: 30 webhooks/min per connector
 * - Idempotency: webhook_events table prevents duplicate processing
 * - No CSRF check (webhooks come from external servers, no Origin header)
 * - No user auth (webhooks are machine-to-machine, authenticated by signature)
 *
 * Flow:
 * 1. Read raw body (before JSON parsing, needed for signature verification)
 * 2. Validate webhook signature per provider
 * 3. Extract webhook ID for idempotency check
 * 4. Look up the user's integration_connection for this connector
 * 5. Trigger executeFullSync() in the background
 * 6. Return 200 immediately (webhook providers expect fast responses)
 *
 * Note: Stripe has a dedicated webhook handler at /api/webhook.
 * This endpoint handles all OTHER integration connector webhooks.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVaultOrNull } from "@/lib/credential-vault";
import {
  getWebhookValidator,
  listWebhookConnectors,
} from "@/lib/staff/data-connector/webhook-validators";
import {
  executeFullSync,
  hasSyncHandler,
} from "@/lib/staff/data-connector/sync-dispatcher";

// ─── Webhook ID extraction per provider ───

/**
 * Extracts a unique webhook event ID from the request.
 * Used for idempotency — if this ID has been processed before, skip.
 *
 * Each provider includes event IDs differently:
 * - HubSpot: body.objectId + body.subscriptionType + body.occurredAt
 * - Fatture in Cloud: body.hookId or body.id
 * - Google Drive: X-Goog-Message-Number header
 * - Stripe: body.id (event ID)
 * - Fallback: SHA-256 of the raw body
 */
function extractWebhookId(
  connectorId: string,
  headers: Headers,
  body: Record<string, unknown> | unknown[]
): string {
  switch (connectorId) {
    case "hubspot": {
      // HubSpot sends an array of events. Use first event's key fields.
      if (Array.isArray(body) && body.length > 0) {
        const event = body[0] as Record<string, unknown>;
        const parts = [
          event.objectId ?? "",
          event.subscriptionType ?? "",
          event.occurredAt ?? "",
        ];
        return `hubspot:${parts.join(":")}`;
      }
      return `hubspot:${Date.now()}`;
    }

    case "fatture-in-cloud": {
      const b = body as Record<string, unknown>;
      const id = b.hookId ?? b.id ?? b.event_id;
      return id ? `fic:${id}` : `fic:${Date.now()}`;
    }

    case "google-drive": {
      const messageNumber = headers.get("x-goog-message-number");
      const channelId = headers.get("x-goog-channel-id");
      return messageNumber
        ? `gdrive:${channelId ?? ""}:${messageNumber}`
        : `gdrive:${Date.now()}`;
    }

    case "stripe": {
      const b = body as Record<string, unknown>;
      return b.id ? `stripe:${b.id}` : `stripe:${Date.now()}`;
    }

    default:
      return `${connectorId}:${Date.now()}`;
  }
}

// ─── Webhook secret retrieval ───

/**
 * Gets the webhook secret for signature validation.
 *
 * Priority:
 * 1. Per-connector env var (e.g. HUBSPOT_WEBHOOK_SECRET)
 * 2. From integration_connections.config.webhook_secret (per-user, stored in vault)
 * 3. General INTEGRATION_WEBHOOK_SECRET env var (shared fallback)
 *
 * Returns null if no secret is available — signature validation will fail.
 */
function getWebhookSecret(connectorId: string): string | null {
  // Per-connector env vars
  const envVarMap: Record<string, string> = {
    hubspot: "HUBSPOT_WEBHOOK_SECRET",
    "fatture-in-cloud": "FATTURE_WEBHOOK_SECRET",
    "google-drive": "GOOGLE_WEBHOOK_SECRET",
    stripe: "STRIPE_WEBHOOK_SECRET",
  };

  const envVar = envVarMap[connectorId];
  if (envVar) {
    const value = process.env[envVar];
    if (value) return value;
  }

  // General fallback
  return process.env.INTEGRATION_WEBHOOK_SECRET ?? null;
}

// ─── User lookup from webhook payload ───

/**
 * Identifies which user's connection should be synced based on the webhook payload.
 *
 * Strategy varies by provider:
 * - HubSpot: Look up by portalId in body → match integration_connections.config.portalId
 * - Fatture in Cloud: Look up by companyId in body → match integration_connections.config.companyId
 * - Google Drive: Look up by X-Goog-Channel-ID header → match stored channel_id
 * - Default: Find any active connection for this connector type
 *
 * Returns the connection record or null if not found.
 */
async function findConnectionForWebhook(
  connectorId: string,
  headers: Headers,
  body: Record<string, unknown> | unknown[],
  admin: ReturnType<typeof createAdminClient>
): Promise<{
  connectionId: string;
  userId: string;
  config: Record<string, unknown>;
} | null> {
  // Start with base query for active connections of this connector type
  let query = admin
    .from("integration_connections")
    .select("id, user_id, config")
    .eq("connector_type", connectorId)
    .eq("status", "active");

  switch (connectorId) {
    case "hubspot": {
      // HubSpot sends portalId (account ID) in the webhook payload
      if (Array.isArray(body) && body.length > 0) {
        const event = body[0] as Record<string, unknown>;
        const portalId = event.portalId;
        if (portalId) {
          // Filter by config->portalId using JSON containment
          query = query.contains("config", { portalId: String(portalId) });
        }
      }
      break;
    }

    case "fatture-in-cloud": {
      const b = body as Record<string, unknown>;
      const companyId = b.companyId ?? b.company_id;
      if (companyId) {
        query = query.contains("config", { companyId: String(companyId) });
      }
      break;
    }

    case "google-drive": {
      const channelId = headers.get("x-goog-channel-id");
      if (channelId) {
        query = query.contains("config", { webhook_channel_id: channelId });
      }
      break;
    }
  }

  // Limit to 1 result — if multiple connections match, take the first
  const { data, error } = await query.limit(1).maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    connectionId: data.id as string,
    userId: data.user_id as string,
    config: (data.config as Record<string, unknown>) ?? {},
  };
}

// ─── POST handler ───

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  const { connectorId } = await params;

  // Rate limit: 30/min per connector (applied by IP)
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // ── 1. Validate connector exists ──

  const validator = getWebhookValidator(connectorId);
  if (!validator) {
    return NextResponse.json(
      {
        error: `Webhook non supportato per connettore '${connectorId}'. ` +
          `Connettori con webhook: ${listWebhookConnectors().join(", ") || "(nessuno)"}`,
      },
      { status: 400 }
    );
  }

  if (!hasSyncHandler(connectorId)) {
    return NextResponse.json(
      { error: `Sync handler non registrato per '${connectorId}'` },
      { status: 400 }
    );
  }

  // ── 2. Read raw body (BEFORE parsing — needed for signature verification) ──

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json(
      { error: "Impossibile leggere il body della richiesta" },
      { status: 400 }
    );
  }

  // ── 3. Validate webhook signature ──

  const secret = getWebhookSecret(connectorId);
  if (!secret) {
    console.error(
      `[WEBHOOK:${connectorId}] No webhook secret configured. ` +
        `Set ${connectorId.toUpperCase().replace(/-/g, "_")}_WEBHOOK_SECRET env var.`
    );
    return NextResponse.json(
      { error: "Webhook secret non configurato" },
      { status: 500 }
    );
  }

  const validationResult = validator({
    rawBody,
    headers: req.headers,
    requestUrl: req.url,
    method: req.method,
    secret,
  });

  if (!validationResult.valid) {
    console.warn(
      `[WEBHOOK:${connectorId}] Signature validation failed: ${validationResult.reason}`
    );
    return NextResponse.json(
      { error: "Firma webhook non valida" },
      { status: 401 }
    );
  }

  // Google Drive "sync" confirmations don't need processing
  if (
    connectorId === "google-drive" &&
    validationResult.reason === "Channel sync confirmation (no data change)"
  ) {
    return NextResponse.json({ status: "sync_confirmed" });
  }

  // ── 4. Parse body ──

  let parsedBody: Record<string, unknown> | unknown[];
  try {
    parsedBody = rawBody.trim() ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json(
      { error: "Body non e' JSON valido" },
      { status: 400 }
    );
  }

  // ── 5. Idempotency check ──

  const webhookId = extractWebhookId(connectorId, req.headers, parsedBody);
  const admin = createAdminClient();

  // Check if this webhook has already been processed
  const { data: existingEvent } = await admin
    .from("webhook_events")
    .select("id, status")
    .eq("webhook_id", webhookId)
    .maybeSingle();

  if (existingEvent) {
    console.log(
      `[WEBHOOK:${connectorId}] Duplicate webhook ${webhookId} (status: ${existingEvent.status}), skipping`
    );
    return NextResponse.json({
      status: "duplicate",
      webhookId,
      message: "Evento gia' processato",
    });
  }

  // ── 6. Find the user's connection ──

  const connection = await findConnectionForWebhook(
    connectorId,
    req.headers,
    parsedBody,
    admin
  );

  if (!connection) {
    console.warn(
      `[WEBHOOK:${connectorId}] No active connection found for webhook ${webhookId}`
    );
    // Still record the event for audit purposes
    try {
      await admin.from("webhook_events").insert({
        webhook_id: webhookId,
        connector_id: connectorId,
        status: "no_connection",
        payload: typeof parsedBody === "object" ? parsedBody : { raw: parsedBody },
        received_at: new Date().toISOString(),
      });
    } catch {
      // Non-fatal: audit insert failure
    }

    return NextResponse.json(
      { error: "Nessuna connessione attiva trovata per questo webhook" },
      { status: 404 }
    );
  }

  // ── 7. Record webhook event (processing) ──

  const { data: webhookEvent } = await admin
    .from("webhook_events")
    .insert({
      webhook_id: webhookId,
      connector_id: connectorId,
      connection_id: connection.connectionId,
      user_id: connection.userId,
      status: "processing",
      payload: typeof parsedBody === "object" ? parsedBody : { raw: parsedBody },
      received_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  // ── 8. Trigger sync in background ──
  // Return 200 immediately — webhook providers expect fast responses.
  // The sync runs asynchronously and updates the webhook_event status.

  const vault = getVaultOrNull();
  if (!vault) {
    // Update webhook event to error
    if (webhookEvent?.id) {
      await admin
        .from("webhook_events")
        .update({
          status: "error",
          error_message: "Credential vault non configurato",
          processed_at: new Date().toISOString(),
        })
        .eq("id", webhookEvent.id);
    }

    return NextResponse.json(
      { error: "Credential vault non configurato" },
      { status: 500 }
    );
  }

  // Retrieve credentials for the user
  const credentials = await vault.getCredential(connection.userId, connectorId);
  const accessToken = credentials?.access_token || credentials?.api_key;

  if (!credentials || !accessToken) {
    if (webhookEvent?.id) {
      await admin
        .from("webhook_events")
        .update({
          status: "error",
          error_message: "Credenziali non trovate o scadute",
          processed_at: new Date().toISOString(),
        })
        .eq("id", webhookEvent.id);
    }

    console.warn(
      `[WEBHOOK:${connectorId}] No credentials found for user ${connection.userId}`
    );
    return NextResponse.json(
      { error: "Credenziali non trovate" },
      { status: 401 }
    );
  }

  // Fire-and-forget: trigger the sync pipeline
  // We don't await this — the webhook response should be fast.
  triggerBackgroundSync(
    admin,
    connection.userId,
    connectorId,
    accessToken,
    connection.connectionId,
    connection.config,
    webhookEvent?.id ?? null,
    webhookId
  );

  // Log receipt in integration_sync_log
  const { error: syncLogError } = await admin
    .from("integration_sync_log")
    .insert({
      connection_id: connection.connectionId,
      user_id: connection.userId,
      status: "running",
      started_at: new Date().toISOString(),
      items_fetched: 0,
      items_processed: 0,
      items_failed: 0,
      error_details: { trigger: "webhook", webhook_id: webhookId },
    });

  if (syncLogError) {
    console.error(
      `[WEBHOOK:${connectorId}] Failed to create sync_log:`,
      syncLogError.message
    );
  }

  return NextResponse.json({
    status: "accepted",
    webhookId,
    message: "Webhook ricevuto, sync in corso",
  });
}

// ─── Background sync ───

/**
 * Runs the full sync pipeline in the background after webhook receipt.
 * Updates the webhook_events record with the result.
 *
 * This is intentionally fire-and-forget from the webhook handler's perspective.
 * The webhook response has already been sent.
 */
async function triggerBackgroundSync(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  connectorId: string,
  accessToken: string,
  connectionId: string,
  connectionConfig: Record<string, unknown>,
  webhookEventId: string | null,
  webhookId: string
): Promise<void> {
  const log = (msg: string) =>
    console.log(`[WEBHOOK-SYNC:${connectorId}] ${msg}`);

  try {
    log(`Starting sync triggered by webhook ${webhookId}`);

    const result = await executeFullSync(admin, userId, connectorId, accessToken, {
      // Webhook-triggered syncs: smaller batch, skip heavy analysis
      fetchLimit: 100,
      skipAnalysis: true,
      connectionConfig,
      log,
    });

    // Update webhook event status
    if (webhookEventId) {
      await admin
        .from("webhook_events")
        .update({
          status: result.fetchError ? "error" : "processed",
          error_message: result.fetchError ?? null,
          processed_at: new Date().toISOString(),
          sync_result: {
            itemsFetched: result.itemsFetched,
            itemsStored: result.persist.stored,
            itemsFailed: result.persist.failed,
            durationMs: result.durationMs,
          },
        })
        .eq("id", webhookEventId);
    }

    // Update connection last_sync_at
    await admin
      .from("integration_connections")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_items: result.persist.stored,
        status: result.fetchError ? "error" : "active",
      })
      .eq("id", connectionId);

    log(
      `Sync complete: ${result.itemsFetched} fetched, ${result.persist.stored} stored ` +
        `in ${(result.durationMs / 1000).toFixed(1)}s`
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Sync failed: ${errorMessage}`);

    if (webhookEventId) {
      try {
        await admin
          .from("webhook_events")
          .update({
            status: "error",
            error_message: errorMessage,
            processed_at: new Date().toISOString(),
          })
          .eq("id", webhookEventId);
      } catch {
        // Non-fatal: error tracking failure
      }
    }
  }
}
