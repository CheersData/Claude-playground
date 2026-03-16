/**
 * API Route: /api/integrations/[connectorId]/sync
 *
 * Triggers a sync for a connected integration.
 * Fetches data from the provider API and stores results.
 *
 * Security: CSRF + requireAuth + rate-limit
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { getVaultOrNull } from "@/lib/credential-vault";
import { createAdminClient } from "@/lib/supabase/admin";
import { HubSpotConnector } from "@/lib/staff/data-connector/connectors/hubspot";
import { getIntegrationSourceById } from "@/scripts/integration-sources";
import { FieldMapper } from "@/lib/staff/data-connector/mapping";

// ─── Provider-specific sync logic ───

interface SyncItem {
  external_id: string;
  source: string;
  entity_type: string;
  data: Record<string, unknown>;
  mapped_fields?: Record<string, unknown>;
  mapping_confidence?: number;
}

interface SyncResult {
  itemCount: number;
  items: SyncItem[];
  error?: string;
}

async function syncGoogleDrive(accessToken: string): Promise<SyncResult> {
  try {
    const response = await fetch(
      "https://www.googleapis.com/drive/v3/files?pageSize=50&fields=files(id,name,mimeType,size,createdTime,modifiedTime,parents,shared)",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Sync:google-drive] API error ${response.status}:`,
        errorText
      );
      return {
        itemCount: 0,
        items: [],
        error: `Google Drive API error: ${response.status}`,
      };
    }

    const data = await response.json();
    const files = data.files || [];

    // Apply field mapping via MappingEngine
    const mapper = new FieldMapper();
    const items: SyncItem[] = await Promise.all(
      files.map(async (f: Record<string, unknown>) => {
        const item: SyncItem = {
          external_id: String(f.id ?? ""),
          source: "google-drive",
          entity_type: "file",
          data: f,
        };
        try {
          const mapped = await mapper.mapFields(f, "google-drive", "file", { skipLLM: true });
          item.mapped_fields = mapped.fields;
          item.mapping_confidence = mapped.confidence;
        } catch (err) {
          console.warn(`[Sync:google-drive] Mapping failed for file ${f.id}:`, err);
        }
        return item;
      })
    );

    return { itemCount: items.length, items };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { itemCount: 0, items: [], error: message };
  }
}

async function syncHubSpot(accessToken: string): Promise<SyncResult> {
  try {
    const source = getIntegrationSourceById("hubspot_crm");
    if (!source) {
      return { itemCount: 0, items: [], error: "HubSpot source config not found" };
    }

    // BUG 5+6 FIX: Pass accessToken as explicit token.
    // The sync route already retrieved the token from the vault, so we pass it
    // directly — no need for vault/userId here (connector uses explicit token mode).
    const connector = new HubSpotConnector(source, console.log, { accessToken });
    const fetchResult = await connector.fetchAll({ limit: 200 });

    // Apply field mapping via MappingEngine
    const mapper = new FieldMapper();
    const items: SyncItem[] = await Promise.all(
      fetchResult.items.map(async (record) => {
        const flat = record as unknown as Record<string, unknown>;
        const item: SyncItem = {
          external_id: record.externalId,
          source: "hubspot",
          entity_type: record.objectType,
          data: flat,
        };
        try {
          const mapped = await mapper.mapFields(flat, "hubspot", record.objectType, { skipLLM: true });
          item.mapped_fields = mapped.fields;
          item.mapping_confidence = mapped.confidence;
        } catch (err) {
          console.warn(`[Sync:hubspot] Mapping failed for ${record.objectType} ${record.externalId}:`, err);
        }
        return item;
      })
    );

    return { itemCount: items.length, items };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { itemCount: 0, items: [], error: message };
  }
}

const SYNC_HANDLERS: Record<string, (token: string) => Promise<SyncResult>> = {
  "google-drive": syncGoogleDrive,
  hubspot: syncHubSpot,
};

// ─── POST: Trigger sync ───

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  // CSRF
  const csrfBlocked = checkCsrf(req);
  if (csrfBlocked) return csrfBlocked;

  // Rate limit
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // Auth
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const userId = authResult.user.id;
  const { connectorId } = await params;

  // Validate sync handler exists
  const syncHandler = SYNC_HANDLERS[connectorId];
  if (!syncHandler) {
    return NextResponse.json(
      { error: `Sync non supportato per connettore '${connectorId}'` },
      { status: 400 }
    );
  }

  // Get vault
  const vault = getVaultOrNull();
  if (!vault) {
    return NextResponse.json(
      {
        error:
          "Credential vault non configurato (VAULT_ENCRYPTION_KEY mancante)",
      },
      { status: 500 }
    );
  }

  // Retrieve credentials
  const credentials = await vault.getCredential(userId, connectorId);
  if (!credentials || !credentials.access_token) {
    return NextResponse.json(
      { error: "Credenziali non trovate. Riautorizza il connettore." },
      { status: 401 }
    );
  }

  const admin = createAdminClient();

  // Verify connection exists and is active
  const { data: connection, error: connError } = await admin
    .from("integration_connections")
    .select("id, status")
    .eq("user_id", userId)
    .eq("connector_type", connectorId)
    .neq("status", "disconnected")
    .maybeSingle();

  if (connError || !connection) {
    return NextResponse.json(
      { error: "Connessione non trovata o non attiva" },
      { status: 404 }
    );
  }

  // Create sync_log entry
  const { data: syncLog, error: logError } = await admin
    .from("integration_sync_log")
    .insert({
      connection_id: connection.id,
      user_id: userId,
      status: "running",
      started_at: new Date().toISOString(),
      items_fetched: 0,
      items_processed: 0,
      items_failed: 0,
    })
    .select("id")
    .single();

  if (logError) {
    console.error("[Sync] Failed to create sync_log:", logError.message);
    // Continue anyway — sync_log is for tracking, not blocking
  }

  // Execute sync
  const startTime = Date.now();
  const result = await syncHandler(credentials.access_token);
  const durationMs = Date.now() - startTime;

  // Store items in integration_sync_log details (not crm_records which may not exist)
  const syncStatus = result.error ? "error" : "success";
  const mappedCount = result.items.filter((i) => i.mapped_fields).length;

  // Update sync_log
  if (syncLog?.id) {
    await admin
      .from("integration_sync_log")
      .update({
        status: syncStatus,
        completed_at: new Date().toISOString(),
        items_fetched: result.itemCount,
        items_processed: result.error ? 0 : result.itemCount,
        items_failed: result.error ? result.itemCount : 0,
        duration_ms: durationMs,
        error_details: result.error
          ? { message: result.error, items_fetched: result.itemCount }
          : mappedCount > 0
            ? { mapped_items: mappedCount, total_items: result.itemCount }
            : null,
      })
      .eq("id", syncLog.id);
  }

  // Update connection
  await admin
    .from("integration_connections")
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_items: result.error ? 0 : result.itemCount,
      status: result.error ? "error" : "active",
    })
    .eq("id", connection.id);

  if (result.error) {
    return NextResponse.json(
      {
        success: false,
        error: result.error,
        syncLogId: syncLog?.id,
        durationMs,
      },
      { status: 502 }
    );
  }

  console.log(
    `[Sync:${connectorId}] Completed: ${result.itemCount} items in ${durationMs}ms`
  );

  return NextResponse.json({
    success: true,
    itemCount: result.itemCount,
    syncLogId: syncLog?.id,
    durationMs,
  });
}
