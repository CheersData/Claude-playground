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
import { discoverEntities } from "@/lib/staff/data-connector/entity-discovery";
import { TARGET_SCHEMAS } from "@/lib/staff/data-connector/mapping/target-schemas";

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
        fields: ["Nome", "Cognome", "Email", "Telefono", "Cellulare", "Azienda", "Ruolo", "Indirizzo", "Citta", "Provincia", "CAP", "Paese", "Sito web", "Proprietario", "Data creazione", "Ultima modifica"],
      },
      {
        id: "opportunities",
        name: "Opportunita",
        estimatedRecords: 3210,
        fields: ["Titolo", "Valore", "Fase", "Probabilita", "Data chiusura", "Tipo", "Pipeline", "Proprietario", "Descrizione", "Contatti associati", "Data creazione", "Ultima modifica"],
      },
      {
        id: "pipeline",
        name: "Pipeline",
        estimatedRecords: 8,
        fields: ["Nome", "Fasi", "Probabilita default", "Attiva", "Tipo", "Data creazione"],
      },
      {
        id: "activities",
        name: "Attivita",
        estimatedRecords: 8920,
        fields: ["Tipo", "Data", "Oggetto", "Contatto", "Descrizione", "Stato", "Priorita", "Proprietario", "Durata", "Data creazione"],
      },
      {
        id: "notes",
        name: "Note",
        estimatedRecords: 2100,
        fields: ["Testo", "Data", "Autore", "Contatto associato", "Opportunita associata", "Data creazione"],
      },
      {
        id: "reports",
        name: "Report",
        estimatedRecords: 45,
        fields: ["Nome", "Tipo", "Ultima esecuzione", "Formato", "Filtri", "Data creazione"],
      },
    ],
    targetFields: [
      "nome", "cognome", "email", "telefono", "cellulare", "azienda", "ruolo",
      "indirizzo", "citta", "provincia", "cap", "paese", "sito_web",
      "titolo", "valore", "fase", "probabilita", "pipeline", "proprietario",
      "data_creazione", "data_modifica", "data_chiusura", "note", "tipo", "oggetto", "stato",
      "descrizione", "priorita", "durata", "formato", "filtri",
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
        fields: ["Nome", "Cognome", "Email", "Telefono", "Cellulare", "Azienda", "Qualifica", "Lifecycle stage", "Stato lead", "Proprietario", "Indirizzo", "Citta", "Provincia", "CAP", "Paese", "Sito web", "Data creazione", "Ultima modifica"],
      },
      {
        id: "companies",
        name: "Aziende",
        estimatedRecords: 3400,
        fields: ["Ragione sociale", "Dominio web", "Settore", "Telefono", "Numero dipendenti", "Fatturato annuo", "Citta", "Provincia", "Paese", "Descrizione", "Tipo", "Proprietario", "Data creazione", "Ultima modifica"],
      },
      {
        id: "deals",
        name: "Deal",
        estimatedRecords: 1450,
        fields: ["Nome trattativa", "Importo", "Fase", "Pipeline", "Data chiusura prevista", "Tipo trattativa", "Proprietario", "Descrizione", "Priorita", "Probabilita chiusura", "Contatti associati", "Data creazione", "Ultima modifica"],
      },
      {
        id: "tickets",
        name: "Ticket",
        estimatedRecords: 2100,
        fields: ["Oggetto", "Contenuto", "Pipeline", "Stato", "Priorita", "Categoria", "Assegnatario", "Canale di origine", "Data chiusura", "Data creazione", "Ultima modifica"],
      },
      {
        id: "campaigns",
        name: "Campagne",
        estimatedRecords: 120,
        fields: ["Nome", "Tipo", "Budget", "Risultati", "Data inizio", "Data fine", "Stato"],
      },
    ],
    targetFields: [
      "nome", "cognome", "email", "telefono", "cellulare", "azienda", "qualifica", "ruolo",
      "indirizzo", "citta", "provincia", "cap", "paese", "sito_web", "dominio",
      "ragione_sociale", "settore", "numero_dipendenti", "fatturato_annuo",
      "valore", "pipeline", "stage", "fase", "budget", "tipo_campagna", "risultati",
      "lifecycle_stage", "stato_lead", "proprietario", "priorita",
      "oggetto", "contenuto", "categoria", "assegnatario", "canale",
      "data_creazione", "data_modifica", "data_chiusura", "descrizione", "tipo",
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
        fields: ["Numero", "Importo", "Stato", "Cliente", "Data", "Valuta", "Data scadenza", "Descrizione", "Sottotitolo", "Tasse", "Sconto", "Totale", "Email cliente"],
      },
      {
        id: "subscriptions",
        name: "Abbonamenti",
        estimatedRecords: 890,
        fields: ["Piano", "Stato", "Cliente", "Rinnovo", "Data inizio", "Data fine", "Importo", "Intervallo", "Valuta", "Email cliente", "Annullamento programmato"],
      },
      {
        id: "payments",
        name: "Pagamenti",
        estimatedRecords: 12400,
        fields: ["Importo", "Metodo", "Stato", "Data", "Valuta", "Cliente", "Email", "Descrizione", "ID fattura", "Commissione", "Importo netto", "Paese carta"],
      },
      {
        id: "customers",
        name: "Clienti",
        estimatedRecords: 5600,
        fields: ["Nome", "Email", "Telefono", "Indirizzo", "Citta", "CAP", "Paese", "Valuta", "Saldo", "Data creazione"],
      },
    ],
    targetFields: [
      "numero_fattura", "importo", "importo_netto", "stato", "cliente", "data",
      "piano", "rinnovo", "metodo_pagamento", "valuta", "email",
      "data_scadenza", "data_inizio", "data_fine", "intervallo",
      "descrizione", "tasse", "sconto", "totale", "commissione",
      "nome", "telefono", "indirizzo", "citta", "cap", "paese", "saldo",
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
        fields: ["Nome", "Tipo MIME", "Dimensione", "Proprietario", "Data creazione", "Data modifica", "Cartella padre", "Condiviso", "Link web", "Descrizione", "Con stella", "Nel cestino", "Estensione", "Ultima modifica da"],
      },
      {
        id: "folders",
        name: "Cartelle",
        estimatedRecords: 180,
        fields: ["Nome", "Percorso", "Proprietario", "Data creazione", "Data modifica", "Condivisa", "Link web", "Cartella padre"],
      },
    ],
    targetFields: [
      "nome_file", "tipo_file", "tipo_mime", "dimensione", "proprietario",
      "percorso", "data_modifica", "data_creazione", "cartella_padre",
      "condiviso", "link_web", "descrizione", "estensione",
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
        fields: ["Titolo", "Numero Articolo", "Corpo", "Fonte", "Data vigenza", "Tipo atto", "Data pubblicazione", "Stato vigenza", "Note"],
      },
      {
        id: "decreti",
        name: "Decreti Legislativi",
        estimatedRecords: 1850,
        fields: ["Titolo", "Numero", "Data", "Articoli", "Materia", "Fonte", "Stato vigenza", "Data pubblicazione GU"],
      },
      {
        id: "leggi",
        name: "Leggi Ordinarie",
        estimatedRecords: 580,
        fields: ["Titolo", "Numero", "Data", "Articoli", "Materia", "Fonte", "Stato vigenza", "Data pubblicazione GU"],
      },
    ],
    targetFields: [
      "titolo_atto", "numero_articolo", "corpo_articolo", "fonte",
      "data_vigenza", "materia", "tipo_atto", "numero_atto",
      "data_pubblicazione", "stato_vigenza", "data_pubblicazione_gu", "note",
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
        fields: ["Titolo", "Numero CELEX", "Data", "Articoli", "Materia", "Stato", "Lingua", "Data pubblicazione GU UE"],
      },
      {
        id: "directives",
        name: "Direttive UE",
        estimatedRecords: 650,
        fields: ["Titolo", "Numero CELEX", "Data", "Articoli", "Scadenza recepimento", "Materia", "Stato recepimento", "Lingua", "Data pubblicazione GU UE"],
      },
      {
        id: "decisions",
        name: "Decisioni UE",
        estimatedRecords: 340,
        fields: ["Titolo", "Numero CELEX", "Data", "Destinatari", "Materia", "Stato", "Lingua", "Data pubblicazione GU UE"],
      },
    ],
    targetFields: [
      "titolo_atto", "numero_celex", "numero_articolo", "corpo_articolo",
      "fonte", "data_pubblicazione", "materia", "tipo_atto_eu",
      "scadenza_recepimento", "stato", "stato_recepimento", "lingua",
      "data_pubblicazione_gu_ue", "destinatari",
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
        fields: ["Numero", "Data", "Cliente", "Importo netto", "Importo lordo", "IVA", "Stato", "Tipo documento", "Descrizione", "Note", "Data scadenza", "Metodo pagamento", "Valuta", "Codice SDI"],
      },
      {
        id: "received_invoices",
        name: "Fatture Ricevute",
        estimatedRecords: 2800,
        fields: ["Numero", "Data", "Fornitore", "Importo netto", "Importo lordo", "IVA", "Stato", "Tipo documento", "Descrizione", "Note", "Data scadenza", "Metodo pagamento", "Valuta", "Codice SDI"],
      },
      {
        id: "clients",
        name: "Clienti",
        estimatedRecords: 1200,
        fields: ["Ragione sociale", "P.IVA", "Codice fiscale", "Email", "PEC", "Telefono", "Indirizzo", "Citta", "CAP", "Provincia", "Paese", "Codice SDI", "Banca", "IBAN", "Note"],
      },
      {
        id: "suppliers",
        name: "Fornitori",
        estimatedRecords: 650,
        fields: ["Ragione sociale", "P.IVA", "Codice fiscale", "Email", "PEC", "Telefono", "Indirizzo", "Citta", "CAP", "Provincia", "Paese", "Codice SDI", "Banca", "IBAN", "Note"],
      },
    ],
    targetFields: [
      "numero_fattura", "data_fattura", "ragione_sociale", "partita_iva",
      "codice_fiscale", "importo_netto", "importo_lordo", "iva",
      "importo", "stato", "tipo_documento", "email", "pec", "telefono",
      "indirizzo", "citta", "cap", "provincia", "paese",
      "codice_sdi", "descrizione", "note", "data_scadenza",
      "metodo_pagamento", "valuta", "banca", "iban",
    ],
  },
  "universal-rest": {
    name: "API REST Personalizzata",
    category: "API Personalizzata",
    description: "Connetti qualsiasi API REST: configura endpoint, autenticazione e mapping campi automatico.",
    icon: "Globe",
    authMode: "api_key",
    oauthPermissions: [],
    apiKeyLabel: "API Key o Bearer Token",
    secretKeyLabel: undefined,
    apiKeyPlaceholder: "Bearer token o API key...",
    secretKeyPlaceholder: undefined,
    helpText: "Inserisci il token di autenticazione dell'API. Poi configura gli endpoint nella sezione entita.",
    entities: [],
    targetFields: [
      "id", "nome", "email", "telefono", "azienda", "indirizzo",
      "stato", "tipo", "importo", "data_creazione", "data_modifica",
      "descrizione", "note", "categoria",
    ],
  },
  csv: {
    name: "CSV / Excel",
    category: "File Import",
    description: "Importa dati da file CSV, TSV o Excel con rilevamento automatico dei campi.",
    icon: "FileSpreadsheet",
    authMode: "api_key",
    oauthPermissions: [],
    apiKeyLabel: "Non richiesta",
    helpText: "Carica un file CSV o Excel. I campi verranno rilevati automaticamente dalla prima riga (intestazione).",
    entities: [
      {
        id: "csv_records",
        name: "Record CSV",
        estimatedRecords: 0,
        fields: ["(rilevati automaticamente dal file)"],
      },
    ],
    targetFields: [
      "id", "nome", "cognome", "email", "telefono", "azienda",
      "indirizzo", "citta", "cap", "stato", "importo", "data",
      "tipo", "categoria", "note",
    ],
  },
};

// ─── Target field enrichment ───
// Expands the static CONNECTOR_META.targetFields by merging in fields from
// the comprehensive TARGET_SCHEMAS (target-schemas.ts) that are relevant
// to this connector's entity types. This ensures the mapping dropdown
// shows ALL available target fields, not just the 9-17 hardcoded ones.

const ENTITY_TO_SCHEMA: Record<string, string> = {
  contacts: "contacts",
  companies: "companies",
  deals: "deals",
  opportunities: "opportunities",
  tickets: "tickets",
  products: "products",
  invoices: "invoices",
  issued_invoices: "invoices",
  received_invoices: "invoices",
  subscriptions: "subscriptions",
  payments: "payments",
  files: "documents",
  folders: "documents",
  documents: "documents",
  leads: "leads",
  events: "events",
  campaigns: "campaigns",
  contracts: "contracts",
  quotes: "quotes",
  orders: "orders",
  refunds: "refunds",
  disputes: "disputes",
  suppliers: "suppliers",
  clients: "contacts",
};

function enrichTargetFields(
  metaTargetFields: string[],
  metaEntities: ConnectorEntity[]
): string[] {
  const allFields = new Set(metaTargetFields);

  // For each entity in this connector, look up its TARGET_SCHEMAS and merge fields
  for (const entity of metaEntities) {
    const schemaKey = ENTITY_TO_SCHEMA[entity.id];
    if (schemaKey && TARGET_SCHEMAS[schemaKey]) {
      for (const field of TARGET_SCHEMAS[schemaKey]) {
        allFields.add(field);
      }
    }
  }

  return Array.from(allFields).sort();
}

// ─── Entity field enrichment ───
// Merges rich field catalogs from entity-discovery into the static CONNECTOR_META entities.
// The CONNECTOR_META entities only have 3-6 Italian display labels per entity, while
// entity-discovery has full technical field catalogs with 15-25+ fields.
// This resolves the "can't map more than 4 fields" issue.

function mergeEntityFields(
  metaEntities: ConnectorEntity[],
  connectorId: string
): Array<{ id: string; name: string; fields: string[]; recordCount: number; lastUpdated: null }> {
  // Get the rich field catalog from entity-discovery
  const discoveredEntities = discoverEntities(connectorId);

  return metaEntities.map((e) => {
    // Look for a matching discovered entity by ID
    const discovered = discoveredEntities.find((de) => de.id === e.id);

    // If the entity-discovery catalog has this entity with fields, use those
    // (extract the `label` from EntityFieldDef for display, or `name` for technical use)
    if (discovered?.fields && discovered.fields.length > 0) {
      // Return both technical field names and Italian labels for richer mapping
      const richFields = discovered.fields.map((f) => f.name);
      return {
        id: e.id,
        name: e.name,
        fields: richFields,
        recordCount: e.estimatedRecords,
        lastUpdated: null,
      };
    }

    // Fallback to the original static labels
    return {
      id: e.id,
      name: e.name,
      fields: e.fields,
      recordCount: e.estimatedRecords,
      lastUpdated: null,
    };
  });
}

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
    targetFields: enrichTargetFields(meta.targetFields, meta.entities),
    // Legacy field kept for backward compatibility with sync tab
    authType: meta.authMode === "oauth" ? "oauth2" : "api_key",
    // Dynamic defaults (overridden from DB below if connection exists)
    status: "disconnected",
    lastSync: null,
    nextSync: null,
    totalRecords: 0,
    // Entities with wizard metadata (recordCount/lastUpdated merged from DB).
    // Merge rich field catalogs from entity-discovery when available.
    // The CONNECTOR_META.entities[].fields only contains 3-6 Italian display labels
    // (e.g., ["Nome", "Email", "Azienda"]), while entity-discovery has the full
    // field catalog with 15-25+ technical field names per entity.
    entities: mergeEntityFields(meta.entities, connectorId),
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
