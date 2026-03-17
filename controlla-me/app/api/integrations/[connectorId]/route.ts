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
// Single source of truth for connector wizard configuration.
// Entities use display-friendly Italian labels and field names.
// The client fetches this via GET to populate the setup wizard dynamically.

interface ConnectorEntity {
  id: string;
  /** Italian display name shown in wizard entity select */
  name: string;
  /** Estimated record count (shown in entity select for context) */
  estimatedRecords: number;
  /** Display-friendly field names (Italian) for the entity */
  fields: string[];
}

interface ConnectorMeta {
  name: string;
  category: string;
  description: string;
  /** Icon key matching lucide-react icon names in the client ICON_MAP */
  icon: string;
  /** Auth mode for the wizard: "oauth" triggers OAuth flow, "api_key" shows credential form */
  authMode: "oauth" | "api_key";
  /** If true, user can choose between OAuth and API key authentication */
  supportsApiKey?: boolean;
  /** OAuth permission labels shown in the authorize step */
  oauthPermissions: { label: string }[];
  /** Custom label for the API key input field */
  apiKeyLabel?: string;
  /** Custom label for the optional secret key input field */
  secretKeyLabel?: string;
  /** Placeholder text for the API key input */
  apiKeyPlaceholder?: string;
  /** Placeholder text for the secret key input */
  secretKeyPlaceholder?: string;
  /** Help text shown below the credential form */
  helpText?: string;
  /** Available entities for sync (wizard step 1) — static defaults */
  entities: ConnectorEntity[];
  /** Target field options for the mapping step (wizard step 3) */
  targetFields: string[];
  /** Env var names to check for OAuth availability (client_id + optional client_secret) */
  oauthEnvVars?: string[];
  /**
   * Whether this connector supports dynamic entity discovery via the
   * entity-discovery module. When true, the UI can offer expanded
   * entity selection beyond the static `entities` list.
   */
  supportsDiscovery?: boolean;
}

const CONNECTOR_META: Record<string, ConnectorMeta> = {
  salesforce: {
    name: "Salesforce",
    category: "CRM",
    description: "Sincronizza account, contatti, opportunita e pipeline di vendita.",
    icon: "Users",
    authMode: "oauth",
    supportsApiKey: true,
    supportsDiscovery: true,
    oauthPermissions: [
      { label: "Lettura contatti" },
      { label: "Lettura opportunita" },
      { label: "Lettura pipeline" },
    ],
    apiKeyLabel: "API Key (Connected App Client ID)",
    secretKeyLabel: "Client Secret (opzionale)",
    apiKeyPlaceholder: "consumer-key...",
    secretKeyPlaceholder: "consumer-secret...",
    helpText: "Per autenticazione manuale: crea una Connected App in Salesforce e usa Client ID + Secret. Per OAuth: autorizza direttamente l'accesso al tuo account Salesforce.",
    oauthEnvVars: ["SALESFORCE_CLIENT_ID"],
    entities: [
      {
        id: "contacts",
        name: "Contatti",
        estimatedRecords: 12450,
        fields: ["Nome", "Email", "Telefono", "Azienda", "Ruolo"],
      },
      {
        id: "opportunities",
        name: "Opportunita",
        estimatedRecords: 3210,
        fields: ["Titolo", "Valore", "Fase", "Probabilita"],
      },
      {
        id: "pipeline",
        name: "Pipeline",
        estimatedRecords: 8,
        fields: ["Nome", "Fasi", "Probabilita default"],
      },
      {
        id: "activities",
        name: "Attivita",
        estimatedRecords: 8920,
        fields: ["Tipo", "Data", "Oggetto", "Contatto"],
      },
      {
        id: "notes",
        name: "Note",
        estimatedRecords: 2100,
        fields: ["Testo", "Data", "Autore"],
      },
      {
        id: "reports",
        name: "Report",
        estimatedRecords: 45,
        fields: ["Nome", "Tipo", "Ultima esecuzione"],
      },
    ],
    targetFields: [
      "nome", "cognome", "email", "telefono", "azienda", "ruolo",
      "indirizzo", "titolo", "valore", "fase", "probabilita",
      "data_creazione", "data_modifica", "note", "tipo", "oggetto", "stato",
    ],
  },
  hubspot: {
    name: "HubSpot",
    category: "CRM / Marketing",
    description: "Contatti, aziende, deal, ticket e campagne marketing.",
    icon: "Users",
    authMode: "oauth",
    supportsApiKey: true,
    supportsDiscovery: true,
    oauthPermissions: [
      { label: "Lettura contatti" },
      { label: "Lettura deal" },
      { label: "Lettura campagne" },
    ],
    apiKeyLabel: "API Key (Private App Token)",
    secretKeyLabel: undefined,
    apiKeyPlaceholder: "pat-na1-...",
    secretKeyPlaceholder: undefined,
    helpText: "Per autenticazione manuale via API key: vai a Impostazioni > Integrazioni > Private apps e copia il token. Per OAuth: autorizza direttamente l'accesso al tuo account HubSpot.",
    oauthEnvVars: ["HUBSPOT_CLIENT_ID"],
    entities: [
      {
        id: "contacts",
        name: "Contatti",
        estimatedRecords: 8200,
        fields: ["Nome", "Email", "Azienda", "Lifecycle stage"],
      },
      {
        id: "deals",
        name: "Deal",
        estimatedRecords: 1450,
        fields: ["Nome", "Valore", "Pipeline", "Stage"],
      },
      {
        id: "campaigns",
        name: "Campagne",
        estimatedRecords: 120,
        fields: ["Nome", "Tipo", "Budget", "Risultati"],
      },
    ],
    targetFields: [
      "nome", "cognome", "email", "azienda", "ruolo", "valore",
      "pipeline", "stage", "budget", "tipo_campagna", "risultati",
      "lifecycle_stage",
    ],
  },
  stripe: {
    name: "Stripe",
    category: "Pagamenti",
    description: "Pagamenti, fatture, abbonamenti e portale clienti.",
    icon: "CreditCard",
    authMode: "api_key",
    supportsDiscovery: true,
    oauthPermissions: [],
    apiKeyLabel: "API Key",
    secretKeyLabel: "Webhook Secret (opzionale)",
    apiKeyPlaceholder: "sk_live_...",
    secretKeyPlaceholder: "whsec_...",
    helpText: "Trova le tue chiavi API in Stripe Dashboard > Developers > API Keys",
    entities: [
      {
        id: "invoices",
        name: "Fatture",
        estimatedRecords: 3200,
        fields: ["Numero", "Importo", "Stato", "Cliente", "Data"],
      },
      {
        id: "subscriptions",
        name: "Abbonamenti",
        estimatedRecords: 890,
        fields: ["Piano", "Stato", "Cliente", "Rinnovo"],
      },
      {
        id: "payments",
        name: "Pagamenti",
        estimatedRecords: 12400,
        fields: ["Importo", "Metodo", "Stato", "Data"],
      },
    ],
    targetFields: [
      "numero_fattura", "importo", "stato", "cliente", "data",
      "piano", "rinnovo", "metodo_pagamento", "valuta",
    ],
  },
  "google-drive": {
    name: "Google Drive",
    category: "Storage",
    description: "Importa file, documenti e fogli di calcolo dal tuo Drive.",
    icon: "HardDrive",
    authMode: "oauth",
    supportsApiKey: true,
    supportsDiscovery: true,
    oauthPermissions: [
      { label: "Lettura file e cartelle" },
      { label: "Lettura metadati" },
    ],
    apiKeyLabel: "Service Account JSON Key",
    apiKeyPlaceholder: "AIza... o JSON Service Account",
    secretKeyPlaceholder: undefined,
    helpText: "Per autenticazione manuale: scarica il JSON della Service Account da Google Cloud Console. Per OAuth: autorizza direttamente l'accesso al tuo Google Account.",
    oauthEnvVars: ["GOOGLE_CLIENT_ID"],
    entities: [
      {
        id: "files",
        name: "File",
        estimatedRecords: 2500,
        fields: ["Nome", "Tipo", "Dimensione", "Proprietario", "Data modifica"],
      },
      {
        id: "folders",
        name: "Cartelle",
        estimatedRecords: 180,
        fields: ["Nome", "Percorso", "Proprietario"],
      },
    ],
    targetFields: [
      "nome_file", "tipo_file", "dimensione", "proprietario",
      "percorso", "data_modifica", "data_creazione",
    ],
  },
  normattiva: {
    name: "Normattiva",
    category: "Legale",
    description: "Corpus legislativo italiano: codici, decreti e leggi ordinarie.",
    icon: "FileText",
    authMode: "api_key",
    oauthPermissions: [],
    apiKeyLabel: "Chiave API Open Data",
    helpText: "Il portale Normattiva Open Data offre accesso pubblico alle fonti legislative italiane. La chiave API e opzionale per la maggior parte degli endpoint.",
    entities: [
      {
        id: "codici",
        name: "Codici",
        estimatedRecords: 3200,
        fields: ["Titolo", "Numero Articolo", "Corpo", "Fonte", "Data vigenza"],
      },
      {
        id: "decreti",
        name: "Decreti Legislativi",
        estimatedRecords: 1850,
        fields: ["Titolo", "Numero", "Data", "Articoli", "Materia"],
      },
      {
        id: "leggi",
        name: "Leggi Ordinarie",
        estimatedRecords: 580,
        fields: ["Titolo", "Numero", "Data", "Articoli", "Materia"],
      },
    ],
    targetFields: [
      "titolo_atto", "numero_articolo", "corpo_articolo", "fonte",
      "data_vigenza", "materia", "tipo_atto", "numero_atto",
      "data_pubblicazione",
    ],
  },
  eurlex: {
    name: "EUR-Lex",
    category: "Legale",
    description: "Normativa europea: regolamenti, direttive e decisioni UE.",
    icon: "FileText",
    authMode: "api_key",
    oauthPermissions: [],
    apiKeyLabel: "Cellar API Key (opzionale)",
    helpText: "EUR-Lex Cellar REST API fornisce accesso alla normativa europea. L'accesso di base e pubblico e non richiede autenticazione.",
    entities: [
      {
        id: "regulations",
        name: "Regolamenti UE",
        estimatedRecords: 920,
        fields: ["Titolo", "Numero CELEX", "Data", "Articoli", "Materia"],
      },
      {
        id: "directives",
        name: "Direttive UE",
        estimatedRecords: 650,
        fields: ["Titolo", "Numero CELEX", "Data", "Articoli", "Scadenza recepimento"],
      },
      {
        id: "decisions",
        name: "Decisioni UE",
        estimatedRecords: 340,
        fields: ["Titolo", "Numero CELEX", "Data", "Destinatari"],
      },
    ],
    targetFields: [
      "titolo_atto", "numero_celex", "numero_articolo", "corpo_articolo",
      "fonte", "data_pubblicazione", "materia", "tipo_atto_eu",
      "scadenza_recepimento",
    ],
  },
  "fatture-in-cloud": {
    name: "Fatture in Cloud",
    category: "Fatturazione IT",
    description: "Fatture attive e passive, clienti, fornitori e corrispettivi.",
    icon: "FileText",
    authMode: "oauth",
    supportsApiKey: true,
    supportsDiscovery: true,
    oauthPermissions: [
      { label: "Lettura clienti" },
      { label: "Lettura fornitori" },
      { label: "Lettura fatture emesse" },
      { label: "Lettura fatture ricevute" },
    ],
    apiKeyLabel: "API Key (Bearer Token)",
    secretKeyLabel: undefined,
    apiKeyPlaceholder: "Bearer token da Fatture in Cloud...",
    secretKeyPlaceholder: undefined,
    helpText: "Per autenticazione manuale: copia il bearer token dalle impostazioni API del tuo account. Per OAuth: autorizza direttamente l'accesso al tuo account Fatture in Cloud.",
    oauthEnvVars: ["FATTURE_CLIENT_ID"],
    entities: [
      {
        id: "issued_invoices",
        name: "Fatture Emesse",
        estimatedRecords: 4500,
        fields: ["Numero", "Data", "Cliente", "Importo", "Stato", "Tipo documento"],
      },
      {
        id: "received_invoices",
        name: "Fatture Ricevute",
        estimatedRecords: 2800,
        fields: ["Numero", "Data", "Fornitore", "Importo", "Stato", "Tipo documento"],
      },
      {
        id: "clients",
        name: "Clienti",
        estimatedRecords: 1200,
        fields: ["Ragione sociale", "P.IVA", "Email", "Indirizzo", "Codice SDI"],
      },
      {
        id: "suppliers",
        name: "Fornitori",
        estimatedRecords: 650,
        fields: ["Ragione sociale", "P.IVA", "Email", "Indirizzo", "Codice SDI"],
      },
    ],
    targetFields: [
      "numero_fattura", "data_fattura", "ragione_sociale", "partita_iva",
      "importo", "stato", "tipo_documento", "email", "indirizzo",
      "codice_sdi", "codice_fiscale",
    ],
  },
};

// ─── GET: Return connector details ───

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  // SEC-M12: rate-limit
  const rateLimitError = await checkRateLimit(req);
  if (rateLimitError) return rateLimitError;

  // SEC-M12: require authenticated user
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

  // Check if OAuth env vars are actually configured for this connector
  const oauthAvailable = meta.oauthEnvVars
    ? meta.oauthEnvVars.every((envVar) => !!process.env[envVar])
    : meta.authMode === "oauth"; // api_key-only connectors: false by default

  // Base response with static metadata (wizard config) + dynamic defaults
  const response: Record<string, unknown> = {
    id: connectorId,
    name: meta.name,
    category: meta.category,
    description: meta.description,
    icon: meta.icon,
    // Wizard configuration (used by ConnectorDetailClient setup wizard)
    authMode: meta.authMode,
    supportsApiKey: meta.supportsApiKey ?? false,
    oauthAvailable,
    supportsDiscovery: meta.supportsDiscovery ?? false,
    oauthPermissions: meta.oauthPermissions,
    apiKeyLabel: meta.apiKeyLabel ?? null,
    secretKeyLabel: meta.secretKeyLabel ?? null,
    apiKeyPlaceholder: meta.apiKeyPlaceholder ?? null,
    secretKeyPlaceholder: meta.secretKeyPlaceholder ?? null,
    helpText: meta.helpText ?? null,
    targetFields: meta.targetFields,
    // Legacy field kept for backward compatibility with sync tab
    authType: meta.authMode === "oauth" ? "oauth2" : "api_key",
    // Dynamic defaults (overridden from DB below if connection exists)
    status: "disconnected",
    lastSync: null,
    nextSync: null,
    totalRecords: 0,
    // Entities with wizard metadata (recordCount/lastUpdated merged from DB)
    entities: meta.entities.map((e) => ({
      id: e.id,
      name: e.name,
      fields: e.fields,
      recordCount: e.estimatedRecords,
      lastUpdated: null,
    })),
    syncHistory: [],
    errors: [],
    mappings: [],
  };

  // Merge dynamic data from DB for authenticated user
  try {
    const supabase = await createClient();

    // Get connection for this user + connector_type
    const { data: connection } = await supabase
      .from("integration_connections")
      .select("id, status, last_sync_at, last_sync_items, sync_frequency, config")
      .eq("user_id", userId)
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

      // Fetch sync logs from last 7 days for this connection
      const sevenDaysAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data: syncLogs } = await supabase
        .from("integration_sync_log")
        .select(
          "id, status, started_at, completed_at, items_processed, items_failed, error_details"
        )
        .eq("connection_id", connectionId)
        .gte("started_at", sevenDaysAgo)
        .order("started_at", { ascending: false })
        .limit(200);

      // Build 7-day syncHistory with zero-filled gaps
      // Always returns exactly 7 entries (today + 6 previous days), oldest first
      const historyByDate = new Map<
        string,
        { success: number; failed: number }
      >();

      // Pre-fill 7 days with zeros
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const dateStr = d.toISOString().slice(0, 10);
        historyByDate.set(dateStr, { success: 0, failed: 0 });
      }

      const errors: {
        id: string;
        timestamp: string;
        message: string;
        affectedRecords: number;
        details?: string;
      }[] = [];

      if (syncLogs && syncLogs.length > 0) {
        for (const log of syncLogs) {
          const date = (log.started_at as string).split("T")[0];
          const entry = historyByDate.get(date);
          if (entry) {
            entry.success += (log.items_processed as number) ?? 0;
            entry.failed += (log.items_failed as number) ?? 0;
          }

          // Collect errors
          const errDetails = log.error_details as Record<
            string,
            unknown
          > | null;
          if (log.status === "error" && errDetails) {
            errors.push({
              id: log.id as string,
              timestamp: log.started_at as string,
              message:
                (errDetails.message as string) || "Errore sconosciuto",
              affectedRecords: (log.items_failed as number) ?? 0,
              details: errDetails.details as string | undefined,
            });
          }
        }
      }

      response.syncHistory = Array.from(historyByDate.entries()).map(
        ([date, stats]) => ({
          date,
          success: stats.success,
          failed: stats.failed,
        })
      );

      response.errors = errors;

      // Fetch field mappings from entity_mapping_configs (migration 037)
      const { data: mappingConfigs } = await supabase
        .from("entity_mapping_configs")
        .select("source_entity, target_entity, mappings, version")
        .eq("connection_id", connectionId)
        .eq("status", "active")
        .order("source_entity");

      if (mappingConfigs && mappingConfigs.length > 0) {
        response.mappings = mappingConfigs.map((config) => {
          const mappingsArr = (config.mappings as { sourceField: string; targetField: string; confidence: number; mappedBy: string }[]) || [];
          return {
            entityId: config.source_entity as string,
            fields: mappingsArr.map((m) => ({
              source: m.sourceField,
              sourceType: "string",
              target: m.targetField,
              confidence: m.confidence ?? 0,
              aiSuggested: m.mappedBy !== "user_confirmed",
            })),
          };
        });
      }
    }
  } catch {
    // If DB query fails, return static data with defaults (already set above)
  }

  // Entity breakdown from crm_records (for "Dati" tab pills)
  try {
    const admin = createAdminClient();
    const { data: breakdownData } = await admin
      .from("crm_records")
      .select("object_type")
      .eq("user_id", userId)
      .eq("connector_source", connectorId);

    if (breakdownData && breakdownData.length > 0) {
      const breakdown: Record<string, number> = {};
      for (const row of breakdownData) {
        const t = row.object_type as string;
        breakdown[t] = (breakdown[t] || 0) + 1;
      }
      response.entityBreakdown = breakdown;
    }
  } catch {
    // Non-critical — breakdown is optional
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

  // Archive existing active mapping configs for this connection
  await admin
    .from("entity_mapping_configs")
    .update({ status: "archived" })
    .eq("connection_id", connectionId)
    .eq("status", "active");

  // Upsert mapping configs per entity (JSONB mappings array)
  let totalFields = 0;

  for (const mapping of body.mappings) {
    const mappingsJsonb = mapping.fields.map((field) => ({
      sourceField: field.source,
      targetField: field.target,
      confidence: field.confidence ?? 0,
      mappedBy: field.aiSuggested ? "similarity" : "user_confirmed",
    }));

    if (mappingsJsonb.length === 0) continue;

    const { error: upsertError } = await admin
      .from("entity_mapping_configs")
      .upsert(
        {
          user_id: userId,
          connection_id: connectionId,
          source_entity: mapping.entityId,
          target_entity: mapping.entityId,
          mappings: mappingsJsonb,
          status: "active",
        },
        { onConflict: "connection_id,source_entity,target_entity" }
      );

    if (upsertError) {
      console.error(
        "[INTEGRATIONS] POST mappings — upsert error:",
        upsertError.message
      );
      return NextResponse.json(
        { error: "Errore nel salvataggio dei mapping" },
        { status: 500 }
      );
    }

    totalFields += mappingsJsonb.length;
  }

  const rows = { length: totalFields };

  return NextResponse.json({
    success: true,
    connectorId,
    message: `Configurazione per ${meta.name} salvata con successo`,
    savedAt: new Date().toISOString(),
    mappingsCount: rows.length,
  });
}
