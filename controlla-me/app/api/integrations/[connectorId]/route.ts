/**
 * API Route: /api/integrations/[connectorId]
 *
 * Connector details, configuration, sync history, and field mappings.
 * Static metadata is always returned; dynamic data (status, sync log, mappings)
 * is merged from Supabase when the user is authenticated and has a connection.
 *
 * GET  — Return connector details + entities + sync history + mappings
 * POST — Save field mappings for a connection
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkCsrf } from "@/lib/middleware/csrf";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ─── Static Connector Metadata ───

interface ConnectorMeta {
  name: string;
  category: string;
  description: string;
  authType: "api_key" | "oauth2";
  entities: {
    id: string;
    label: string;
    fields: string[];
  }[];
}

const CONNECTOR_META: Record<string, ConnectorMeta> = {
  stripe: {
    name: "Stripe",
    category: "Finance",
    description: "Sincronizza pagamenti, clienti e abbonamenti.",
    authType: "api_key",
    entities: [
      {
        id: "customer",
        label: "Clienti",
        fields: ["name", "email", "phone", "address", "created", "metadata"],
      },
      {
        id: "subscription",
        label: "Abbonamenti",
        fields: [
          "customer_id",
          "plan",
          "status",
          "current_period_start",
          "current_period_end",
          "cancel_at",
        ],
      },
      {
        id: "invoice",
        label: "Fatture",
        fields: [
          "customer_id",
          "amount_due",
          "amount_paid",
          "status",
          "due_date",
          "lines",
        ],
      },
      {
        id: "payment_intent",
        label: "Pagamenti",
        fields: [
          "amount",
          "currency",
          "status",
          "customer_id",
          "payment_method",
          "created",
        ],
      },
    ],
  },
  hubspot: {
    name: "HubSpot",
    category: "CRM",
    description: "Sincronizza contatti, aziende, deal e ticket.",
    authType: "oauth2",
    entities: [
      {
        id: "contact",
        label: "Contatti",
        fields: [
          "first_name",
          "last_name",
          "email",
          "phone",
          "company",
          "title",
          "address",
        ],
      },
      {
        id: "company",
        label: "Aziende",
        fields: [
          "name",
          "domain",
          "industry",
          "annual_revenue",
          "employee_count",
          "city",
        ],
      },
      {
        id: "deal",
        label: "Opportunita",
        fields: [
          "deal_name",
          "amount",
          "stage",
          "close_date",
          "probability",
          "owner",
        ],
      },
      {
        id: "ticket",
        label: "Ticket",
        fields: [
          "subject",
          "status",
          "priority",
          "category",
          "created_at",
          "assigned_to",
        ],
      },
    ],
  },
  "google-drive": {
    name: "Google Drive",
    category: "Storage",
    description: "Importa file e documenti dal tuo Drive.",
    authType: "oauth2",
    entities: [
      {
        id: "file",
        label: "File",
        fields: [
          "name",
          "mime_type",
          "size",
          "created_time",
          "modified_time",
          "parents",
          "shared",
        ],
      },
    ],
  },
  salesforce: {
    name: "Salesforce",
    category: "CRM",
    description: "Sincronizza contatti, opportunita e pipeline.",
    authType: "oauth2",
    entities: [
      {
        id: "Account",
        label: "Account",
        fields: [
          "Name",
          "Industry",
          "Website",
          "Phone",
          "BillingAddress",
          "AnnualRevenue",
        ],
      },
      {
        id: "Contact",
        label: "Contatti",
        fields: [
          "FirstName",
          "LastName",
          "Email",
          "Phone",
          "Title",
          "AccountId",
          "MailingAddress",
        ],
      },
      {
        id: "Opportunity",
        label: "Opportunita",
        fields: [
          "Name",
          "Amount",
          "StageName",
          "CloseDate",
          "Probability",
          "AccountId",
        ],
      },
    ],
  },
};

// ─── GET: Return connector details ───

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  // SEC-M12: rate-limit marketplace browsing (IP-based)
  const rateLimitError = await checkRateLimit(req);
  if (rateLimitError) return rateLimitError;

  const { connectorId } = await params;

  const meta = CONNECTOR_META[connectorId];
  if (!meta) {
    return NextResponse.json(
      { error: `Connettore '${connectorId}' non trovato` },
      { status: 404 }
    );
  }

  // Base response with static data and defaults
  const response: Record<string, unknown> = {
    id: connectorId,
    name: meta.name,
    category: meta.category,
    description: meta.description,
    authType: meta.authType,
    status: "disconnected",
    lastSync: null,
    nextSync: null,
    totalRecords: 0,
    entities: meta.entities.map((e) => ({
      ...e,
      recordCount: 0,
      lastUpdated: null,
    })),
    syncHistory: [],
    errors: [],
    mappings: [],
  };

  // Merge dynamic data from DB if user is authenticated
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // Get connection for this user + connector_type
      const { data: connection } = await supabase
        .from("integration_connections")
        .select("id, status, last_sync_at, last_sync_items, sync_frequency, config")
        .eq("user_id", user.id)
        .eq("connector_type", connectorId)
        .neq("status", "disconnected")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (connection) {
        // Map DB status to response status
        const statusMap: Record<string, string> = {
          active: "connected",
          connected: "connected",
          error: "error",
          syncing: "syncing",
        };
        response.status = statusMap[connection.status] ?? "disconnected";
        response.lastSync = connection.last_sync_at;
        response.totalRecords = connection.last_sync_items ?? 0;

        const connectionId = connection.id;

        // Fetch sync history (last 30 entries)
        const { data: syncLogs } = await supabase
          .from("integration_sync_log")
          .select(
            "id, status, started_at, completed_at, records_processed, records_failed, error_message, metadata"
          )
          .eq("connection_id", connectionId)
          .order("started_at", { ascending: false })
          .limit(30);

        if (syncLogs && syncLogs.length > 0) {
          // Build syncHistory (aggregate by date)
          const historyByDate = new Map<
            string,
            { success: number; failed: number }
          >();
          const errors: {
            id: string;
            timestamp: string;
            message: string;
            affectedRecords: number;
            details?: string;
          }[] = [];

          for (const log of syncLogs) {
            const date = (log.started_at as string).split("T")[0];
            const entry = historyByDate.get(date) ?? {
              success: 0,
              failed: 0,
            };
            entry.success += (log.records_processed as number) ?? 0;
            entry.failed += (log.records_failed as number) ?? 0;
            historyByDate.set(date, entry);

            // Collect errors
            if (log.status === "error" && log.error_message) {
              errors.push({
                id: log.id as string,
                timestamp: log.started_at as string,
                message: log.error_message as string,
                affectedRecords: (log.records_failed as number) ?? 0,
                details:
                  (log.metadata as Record<string, unknown>)?.details as
                    | string
                    | undefined,
              });
            }
          }

          response.syncHistory = Array.from(historyByDate.entries())
            .map(([date, stats]) => ({
              date,
              success: stats.success,
              failed: stats.failed,
            }))
            .sort(
              (a, b) =>
                new Date(b.date).getTime() - new Date(a.date).getTime()
            );

          response.errors = errors;
        }

        // Fetch field mappings
        const { data: mappingRows } = await supabase
          .from("integration_field_mappings")
          .select(
            "id, source_entity, source_field, target_field, confidence, ai_suggested"
          )
          .eq("connection_id", connectionId)
          .order("source_entity")
          .order("source_field");

        if (mappingRows && mappingRows.length > 0) {
          // Group by source_entity
          const mappingsByEntity = new Map<
            string,
            {
              source: string;
              sourceType: string;
              target: string;
              confidence: number;
              aiSuggested: boolean;
            }[]
          >();

          for (const row of mappingRows) {
            const entity = row.source_entity as string;
            if (!mappingsByEntity.has(entity)) {
              mappingsByEntity.set(entity, []);
            }
            mappingsByEntity.get(entity)!.push({
              source: row.source_field as string,
              sourceType: "string", // DB doesn't store source type — default
              target: row.target_field as string,
              confidence: (row.confidence as number) ?? 0,
              aiSuggested: (row.ai_suggested as boolean) ?? false,
            });
          }

          response.mappings = Array.from(mappingsByEntity.entries()).map(
            ([entityId, fields]) => ({ entityId, fields })
          );
        }
      }
    }
  } catch {
    // If auth/DB fails, return static data with defaults (already set above)
  }

  return NextResponse.json(response);
}

// ─── POST: Save field mappings ───

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  // SEC-M12: CSRF check on POST
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  // SEC-M12: rate-limit connector configuration (IP-based)
  const rateLimitError = await checkRateLimit(req);
  if (rateLimitError) return rateLimitError;

  // SEC-M12: require authenticated user to configure connectors
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const userId = authResult.user.id;
  const { connectorId } = await params;

  const meta = CONNECTOR_META[connectorId];
  if (!meta) {
    return NextResponse.json(
      { error: `Connettore '${connectorId}' non trovato` },
      { status: 404 }
    );
  }

  let body: {
    mappings?: {
      entityId: string;
      fields: {
        source: string;
        target: string;
        confidence?: number;
        aiSuggested?: boolean;
      }[];
    }[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON non valido" },
      { status: 400 }
    );
  }

  if (!body.mappings || !Array.isArray(body.mappings)) {
    return NextResponse.json(
      { error: "Campo obbligatorio mancante: mappings (array)" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Find the active connection for this user + connector
  const { data: connection, error: connError } = await admin
    .from("integration_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("connector_type", connectorId)
    .neq("status", "disconnected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (connError) {
    console.error(
      "[INTEGRATIONS] POST mappings — connection lookup error:",
      connError.message
    );
    return NextResponse.json(
      { error: "Errore nel recupero della connessione" },
      { status: 500 }
    );
  }

  if (!connection) {
    return NextResponse.json(
      {
        error: `Nessuna connessione attiva trovata per '${meta.name}'. Connetti prima il servizio.`,
      },
      { status: 404 }
    );
  }

  const connectionId = connection.id;

  // Delete existing mappings for this connection
  const { error: deleteError } = await admin
    .from("integration_field_mappings")
    .delete()
    .eq("connection_id", connectionId);

  if (deleteError) {
    console.error(
      "[INTEGRATIONS] POST mappings — delete error:",
      deleteError.message
    );
    return NextResponse.json(
      { error: "Errore nell'aggiornamento dei mapping" },
      { status: 500 }
    );
  }

  // Flatten mappings for bulk insert
  const rows = body.mappings.flatMap((mapping) =>
    mapping.fields.map((field) => ({
      connection_id: connectionId,
      source_entity: mapping.entityId,
      source_field: field.source,
      target_field: field.target,
      confidence: field.confidence ?? 0,
      ai_suggested: field.aiSuggested ?? false,
    }))
  );

  if (rows.length > 0) {
    const { error: insertError } = await admin
      .from("integration_field_mappings")
      .insert(rows);

    if (insertError) {
      console.error(
        "[INTEGRATIONS] POST mappings — insert error:",
        insertError.message
      );
      return NextResponse.json(
        { error: "Errore nel salvataggio dei mapping" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    success: true,
    connectorId,
    message: `Configurazione per ${meta.name} salvata con successo`,
    savedAt: new Date().toISOString(),
    mappingsCount: rows.length,
  });
}
