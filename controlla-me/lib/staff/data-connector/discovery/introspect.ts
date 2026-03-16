/**
 * Schema Discovery — Introspect
 *
 * Deep-dives into each entity to produce a complete field catalog.
 * Uses connector-specific APIs:
 *   - HubSpot: Properties API (/crm/v3/properties/{objectType})
 *   - Fatture in Cloud: fixed schema from API v2 documentation
 *   - Google Drive: file metadata fields from Drive API v3
 *
 * Output: SchemaField[] per entity — type, required, description, options.
 *
 * NOTE: Types are defined in ./types.ts (single source of truth).
 * This file re-exports IntrospectResult for backward compatibility.
 */

import type {
  SchemaField,
  IntrospectResult,
  AuthenticatedFetchFn,
  LogFn,
} from "./types";

// Re-export for backward compatibility
export type { IntrospectResult };

// ═══════════════════════════════════════════════════════════════
//  HubSpot Introspection
// ═══════════════════════════════════════════════════════════════

interface HubSpotProperty {
  name: string;
  label: string;
  type: string;
  fieldType: string;
  description: string;
  groupName: string;
  displayOrder: number;
  hasUniqueValue: boolean;
  hidden: boolean;
  formField: boolean;
  calculated: boolean;
  externalOptions: boolean;
  options?: Array<{
    label: string;
    value: string;
    description?: string;
    displayOrder: number;
    hidden: boolean;
  }>;
}

interface HubSpotPropertiesResponse {
  results: HubSpotProperty[];
}

const HUBSPOT_API_BASE = "https://api.hubapi.com";

/**
 * Map HubSpot field types to normalized type strings.
 */
function normalizeHubSpotType(hsType: string, fieldType: string): string {
  const typeMap: Record<string, string> = {
    string: "string",
    number: "number",
    bool: "boolean",
    datetime: "datetime",
    date: "date",
    enumeration: "enum",
    phone_number: "phone",
  };

  // fieldType gives more precision for some cases
  if (fieldType === "textarea") return "text";
  if (fieldType === "checkbox") return "boolean";
  if (fieldType === "select" || fieldType === "radio") return "enum";

  return typeMap[hsType] || "string";
}

/**
 * Introspect a HubSpot entity using the Properties API.
 * GET /crm/v3/properties/{objectType} returns all properties with metadata.
 */
export async function introspectHubSpotEntity(
  entityName: string,
  fetchFn: AuthenticatedFetchFn,
  log: LogFn
): Promise<IntrospectResult> {
  const url = `${HUBSPOT_API_BASE}/crm/v3/properties/${entityName}`;

  log(`[DISCOVERY] Introspecting HubSpot entity: ${entityName}`);

  const response = await fetchFn(url);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `HubSpot Properties API returned ${response.status} for ${entityName}: ${errorText.slice(0, 200)}`
    );
  }

  const body = (await response.json()) as HubSpotPropertiesResponse;
  const fields: SchemaField[] = [];

  // Group properties by groupName for structure
  const groups = new Map<string, HubSpotProperty[]>();
  for (const prop of body.results) {
    // Skip hidden/calculated properties unless they're important
    if (prop.hidden && !prop.hasUniqueValue) continue;

    const group = prop.groupName || "ungrouped";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(prop);
  }

  // Convert to SchemaField[]
  for (const [groupName, props] of groups) {
    for (const prop of props) {
      const field: SchemaField = {
        id: prop.name,
        name: prop.name,
        label: prop.label,
        type: normalizeHubSpotType(prop.type, prop.fieldType),
        required: prop.hasUniqueValue,
        description: prop.description || undefined,
        groupName,
      };

      // Include options for enum fields
      if (prop.options && prop.options.length > 0) {
        field.options = prop.options
          .filter((o) => !o.hidden)
          .map((o) => ({
            label: o.label,
            value: o.value,
          }));
      }

      fields.push(field);
    }
  }

  log(`[DISCOVERY] ${entityName}: ${fields.length} fields across ${groups.size} groups`);

  return {
    entityName,
    fields,
    totalProperties: body.results.length,
    apiVersion: "v3",
    introspectedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
//  Fatture in Cloud Introspection
// ═══════════════════════════════════════════════════════════════

/**
 * Static schema definitions for Fatture in Cloud entities.
 * Derived from API v2 documentation:
 *   https://developers.fattureincloud.it/
 *
 * These schemas are static because Fatture in Cloud has a fixed API —
 * no custom fields, no schema evolution at runtime.
 */
const FATTURE_SCHEMAS: Record<string, SchemaField[]> = {
  issued_invoices: [
    { id: "id", name: "id", label: "ID", type: "number", required: true, description: "ID univoco della fattura" },
    { id: "type", name: "type", label: "Tipo documento", type: "enum", description: "Tipo di documento (invoice, credit_note, etc.)", options: [
      { label: "Fattura", value: "invoice" },
      { label: "Nota di credito", value: "credit_note" },
      { label: "Ricevuta", value: "receipt" },
      { label: "Proforma", value: "proforma" },
    ]},
    { id: "number", name: "number", label: "Numero fattura", type: "number", description: "Numero progressivo della fattura" },
    { id: "numeration", name: "numeration", label: "Sezionale", type: "string", description: "Sezionale di numerazione" },
    { id: "date", name: "date", label: "Data fattura", type: "date", required: true, description: "Data di emissione" },
    { id: "year", name: "year", label: "Anno", type: "number" },
    { id: "subject", name: "subject", label: "Oggetto", type: "text", description: "Descrizione della fattura" },
    { id: "visible_subject", name: "visible_subject", label: "Oggetto visibile", type: "text" },
    { id: "amount_net", name: "amount_net", label: "Importo netto", type: "number", description: "Importo netto (senza IVA)" },
    { id: "amount_vat", name: "amount_vat", label: "IVA", type: "number", description: "Importo IVA" },
    { id: "amount_gross", name: "amount_gross", label: "Importo lordo", type: "number", description: "Importo totale (netto + IVA)" },
    { id: "amount_due_discount", name: "amount_due_discount", label: "Sconto", type: "number" },
    { id: "amount_rivalsa", name: "amount_rivalsa", label: "Rivalsa", type: "number" },
    { id: "amount_cassa", name: "amount_cassa", label: "Cassa previdenziale", type: "number" },
    { id: "amount_withholding_tax", name: "amount_withholding_tax", label: "Ritenuta d'acconto", type: "number" },
    { id: "currency", name: "currency", label: "Valuta", type: "string", description: "Codice ISO valuta (EUR, USD, etc.)", groupName: "payment" },
    { id: "is_marked", name: "is_marked", label: "Incassata", type: "boolean", description: "La fattura è stata incassata?" },
    { id: "e_invoice", name: "e_invoice", label: "Fattura elettronica", type: "boolean", description: "Inviata come fattura elettronica SDI" },
    { id: "ei_status", name: "ei_status", label: "Stato SDI", type: "enum", description: "Stato fatturazione elettronica", options: [
      { label: "Non inviata", value: "not_sent" },
      { label: "Inviata", value: "sent" },
      { label: "Consegnata", value: "delivered" },
      { label: "Accettata", value: "accepted" },
      { label: "Rifiutata", value: "rejected" },
    ]},
    { id: "entity", name: "entity", label: "Cliente", type: "json", description: "Dati del cliente (nome, P.IVA, CF, indirizzo)", children: [
      { id: "entity.id", name: "id", label: "ID cliente", type: "number" },
      { id: "entity.name", name: "name", label: "Ragione sociale", type: "string" },
      { id: "entity.vat_number", name: "vat_number", label: "Partita IVA", type: "string" },
      { id: "entity.tax_code", name: "tax_code", label: "Codice Fiscale", type: "string" },
    ]},
    { id: "created_at", name: "created_at", label: "Data creazione", type: "datetime" },
    { id: "updated_at", name: "updated_at", label: "Data modifica", type: "datetime" },
  ],

  received_documents: [
    { id: "id", name: "id", label: "ID", type: "number", required: true },
    { id: "type", name: "type", label: "Tipo documento", type: "enum", options: [
      { label: "Spesa", value: "expense" },
      { label: "Fattura passiva", value: "passive_invoice" },
      { label: "Nota di credito passiva", value: "passive_credit_note" },
    ]},
    { id: "date", name: "date", label: "Data documento", type: "date", required: true },
    { id: "description", name: "description", label: "Descrizione", type: "text" },
    { id: "amount_net", name: "amount_net", label: "Importo netto", type: "number" },
    { id: "amount_vat", name: "amount_vat", label: "IVA", type: "number" },
    { id: "amount_gross", name: "amount_gross", label: "Importo lordo", type: "number" },
    { id: "amount_withholding_tax", name: "amount_withholding_tax", label: "Ritenuta d'acconto", type: "number" },
    { id: "currency", name: "currency", label: "Valuta", type: "string", groupName: "payment" },
    { id: "is_marked", name: "is_marked", label: "Pagata", type: "boolean" },
    { id: "entity", name: "entity", label: "Fornitore", type: "json", children: [
      { id: "entity.id", name: "id", label: "ID fornitore", type: "number" },
      { id: "entity.name", name: "name", label: "Ragione sociale", type: "string" },
      { id: "entity.vat_number", name: "vat_number", label: "Partita IVA", type: "string" },
      { id: "entity.tax_code", name: "tax_code", label: "Codice Fiscale", type: "string" },
    ]},
    { id: "created_at", name: "created_at", label: "Data creazione", type: "datetime" },
    { id: "updated_at", name: "updated_at", label: "Data modifica", type: "datetime" },
  ],

  clients: [
    { id: "id", name: "id", label: "ID", type: "number", required: true },
    { id: "code", name: "code", label: "Codice", type: "string" },
    { id: "name", name: "name", label: "Ragione sociale", type: "string", required: true },
    { id: "type", name: "type", label: "Tipo", type: "enum", options: [
      { label: "Persona fisica", value: "person" },
      { label: "Azienda", value: "company" },
      { label: "PA", value: "pa" },
      { label: "Condominio", value: "condo" },
    ]},
    { id: "first_name", name: "first_name", label: "Nome", type: "string" },
    { id: "last_name", name: "last_name", label: "Cognome", type: "string" },
    { id: "contact_person", name: "contact_person", label: "Referente", type: "string" },
    { id: "vat_number", name: "vat_number", label: "Partita IVA", type: "string" },
    { id: "tax_code", name: "tax_code", label: "Codice Fiscale", type: "string" },
    { id: "address_street", name: "address_street", label: "Indirizzo", type: "string", groupName: "address" },
    { id: "address_postal_code", name: "address_postal_code", label: "CAP", type: "string", groupName: "address" },
    { id: "address_city", name: "address_city", label: "Città", type: "string", groupName: "address" },
    { id: "address_province", name: "address_province", label: "Provincia", type: "string", groupName: "address" },
    { id: "address_country", name: "address_country", label: "Paese", type: "string", groupName: "address" },
    { id: "email", name: "email", label: "Email", type: "email" },
    { id: "certified_email", name: "certified_email", label: "PEC", type: "email", description: "Posta Elettronica Certificata" },
    { id: "phone", name: "phone", label: "Telefono", type: "phone" },
    { id: "fax", name: "fax", label: "Fax", type: "phone" },
    { id: "notes", name: "notes", label: "Note", type: "text" },
    { id: "ei_code", name: "ei_code", label: "Codice SDI", type: "string", description: "Codice destinatario fatturazione elettronica" },
    { id: "default_payment_terms", name: "default_payment_terms", label: "Termini pagamento", type: "number" },
    { id: "default_vat", name: "default_vat", label: "IVA predefinita", type: "json" },
    { id: "created_at", name: "created_at", label: "Data creazione", type: "datetime" },
    { id: "updated_at", name: "updated_at", label: "Data modifica", type: "datetime" },
  ],

  suppliers: [
    { id: "id", name: "id", label: "ID", type: "number", required: true },
    { id: "code", name: "code", label: "Codice", type: "string" },
    { id: "name", name: "name", label: "Ragione sociale", type: "string", required: true },
    { id: "type", name: "type", label: "Tipo", type: "enum", options: [
      { label: "Persona fisica", value: "person" },
      { label: "Azienda", value: "company" },
    ]},
    { id: "first_name", name: "first_name", label: "Nome", type: "string" },
    { id: "last_name", name: "last_name", label: "Cognome", type: "string" },
    { id: "vat_number", name: "vat_number", label: "Partita IVA", type: "string" },
    { id: "tax_code", name: "tax_code", label: "Codice Fiscale", type: "string" },
    { id: "address_street", name: "address_street", label: "Indirizzo", type: "string", groupName: "address" },
    { id: "address_postal_code", name: "address_postal_code", label: "CAP", type: "string", groupName: "address" },
    { id: "address_city", name: "address_city", label: "Città", type: "string", groupName: "address" },
    { id: "address_province", name: "address_province", label: "Provincia", type: "string", groupName: "address" },
    { id: "email", name: "email", label: "Email", type: "email" },
    { id: "certified_email", name: "certified_email", label: "PEC", type: "email" },
    { id: "phone", name: "phone", label: "Telefono", type: "phone" },
    { id: "notes", name: "notes", label: "Note", type: "text" },
    { id: "created_at", name: "created_at", label: "Data creazione", type: "datetime" },
    { id: "updated_at", name: "updated_at", label: "Data modifica", type: "datetime" },
  ],

  products: [
    { id: "id", name: "id", label: "ID", type: "number", required: true },
    { id: "name", name: "name", label: "Nome", type: "string", required: true },
    { id: "code", name: "code", label: "Codice", type: "string" },
    { id: "net_price", name: "net_price", label: "Prezzo netto", type: "number" },
    { id: "gross_price", name: "gross_price", label: "Prezzo lordo", type: "number" },
    { id: "net_cost", name: "net_cost", label: "Costo netto", type: "number" },
    { id: "measure", name: "measure", label: "Unità di misura", type: "string" },
    { id: "description", name: "description", label: "Descrizione", type: "text" },
    { id: "category", name: "category", label: "Categoria", type: "string" },
    { id: "notes", name: "notes", label: "Note", type: "text" },
    { id: "in_stock", name: "in_stock", label: "Disponibile", type: "boolean" },
    { id: "stock_initial", name: "stock_initial", label: "Giacenza iniziale", type: "number" },
    { id: "default_vat", name: "default_vat", label: "IVA predefinita", type: "json" },
    { id: "created_at", name: "created_at", label: "Data creazione", type: "datetime" },
    { id: "updated_at", name: "updated_at", label: "Data modifica", type: "datetime" },
  ],

  receipts: [
    { id: "id", name: "id", label: "ID", type: "number", required: true },
    { id: "date", name: "date", label: "Data", type: "date", required: true },
    { id: "number", name: "number", label: "Numero", type: "number" },
    { id: "numeration", name: "numeration", label: "Sezionale", type: "string" },
    { id: "amount_net", name: "amount_net", label: "Importo netto", type: "number" },
    { id: "amount_vat", name: "amount_vat", label: "IVA", type: "number" },
    { id: "amount_gross", name: "amount_gross", label: "Importo lordo", type: "number" },
    { id: "type", name: "type", label: "Tipo", type: "enum", options: [
      { label: "Vendita", value: "sales_receipt" },
      { label: "Reso", value: "sales_receipt_reverse" },
    ]},
    { id: "description", name: "description", label: "Descrizione", type: "text" },
    { id: "payment_account", name: "payment_account", label: "Conto pagamento", type: "json" },
    { id: "created_at", name: "created_at", label: "Data creazione", type: "datetime" },
    { id: "updated_at", name: "updated_at", label: "Data modifica", type: "datetime" },
  ],
};

/**
 * Introspect a Fatture in Cloud entity using static schema definitions.
 * No API calls needed — the schema is known at build time.
 */
export async function introspectFattureEntity(
  entityName: string,
  _fetchFn: AuthenticatedFetchFn,
  log: LogFn
): Promise<IntrospectResult> {
  log(`[DISCOVERY] Introspecting Fatture in Cloud entity: ${entityName}`);

  const fields = FATTURE_SCHEMAS[entityName];
  if (!fields) {
    throw new Error(
      `No schema definition for Fatture in Cloud entity: ${entityName}. ` +
      `Known entities: ${Object.keys(FATTURE_SCHEMAS).join(", ")}`
    );
  }

  log(`[DISCOVERY] ${entityName}: ${fields.length} fields`);

  return {
    entityName,
    fields: [...fields], // Defensive copy
    totalProperties: fields.length,
    apiVersion: "v2",
    introspectedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
//  Google Drive Introspection
// ═══════════════════════════════════════════════════════════════

/**
 * Static schema for Google Drive file metadata.
 * Same fields for all file types — Google Drive has a flat schema.
 */
const DRIVE_FILE_SCHEMA: SchemaField[] = [
  { id: "id", name: "id", label: "File ID", type: "string", required: true, description: "Google Drive file ID" },
  { id: "name", name: "name", label: "Nome file", type: "string", required: true },
  { id: "mimeType", name: "mimeType", label: "Tipo MIME", type: "string", description: "MIME type del file" },
  { id: "size", name: "size", label: "Dimensione", type: "number", description: "Dimensione in byte" },
  { id: "createdTime", name: "createdTime", label: "Data creazione", type: "datetime" },
  { id: "modifiedTime", name: "modifiedTime", label: "Data modifica", type: "datetime" },
  { id: "parents", name: "parents", label: "Cartelle parent", type: "json", description: "IDs delle cartelle contenitori" },
  { id: "owners", name: "owners", label: "Proprietari", type: "json", description: "Lista proprietari con nome e email", children: [
    { id: "owners.displayName", name: "displayName", label: "Nome", type: "string" },
    { id: "owners.emailAddress", name: "emailAddress", label: "Email", type: "email" },
  ]},
  { id: "shared", name: "shared", label: "Condiviso", type: "boolean" },
  { id: "webViewLink", name: "webViewLink", label: "Link visualizzazione", type: "url" },
  { id: "trashed", name: "trashed", label: "Cestinato", type: "boolean" },
  { id: "starred", name: "starred", label: "Preferito", type: "boolean" },
  { id: "description", name: "description", label: "Descrizione", type: "text" },
  { id: "fileExtension", name: "fileExtension", label: "Estensione", type: "string" },
  { id: "originalFilename", name: "originalFilename", label: "Nome originale", type: "string" },
  { id: "md5Checksum", name: "md5Checksum", label: "MD5", type: "string", description: "Hash MD5 del contenuto" },
  { id: "lastModifyingUser", name: "lastModifyingUser", label: "Ultimo modificatore", type: "json", children: [
    { id: "lastModifyingUser.displayName", name: "displayName", label: "Nome", type: "string" },
    { id: "lastModifyingUser.emailAddress", name: "emailAddress", label: "Email", type: "email" },
  ]},
];

const DRIVE_FOLDER_SCHEMA: SchemaField[] = [
  { id: "id", name: "id", label: "Folder ID", type: "string", required: true },
  { id: "name", name: "name", label: "Nome cartella", type: "string", required: true },
  { id: "mimeType", name: "mimeType", label: "Tipo MIME", type: "string", description: "Sempre 'application/vnd.google-apps.folder'" },
  { id: "createdTime", name: "createdTime", label: "Data creazione", type: "datetime" },
  { id: "modifiedTime", name: "modifiedTime", label: "Data modifica", type: "datetime" },
  { id: "parents", name: "parents", label: "Cartella parent", type: "json" },
  { id: "owners", name: "owners", label: "Proprietari", type: "json", children: [
    { id: "owners.displayName", name: "displayName", label: "Nome", type: "string" },
    { id: "owners.emailAddress", name: "emailAddress", label: "Email", type: "email" },
  ]},
  { id: "shared", name: "shared", label: "Condivisa", type: "boolean" },
  { id: "webViewLink", name: "webViewLink", label: "Link", type: "url" },
  { id: "description", name: "description", label: "Descrizione", type: "text" },
];

/**
 * Introspect a Google Drive entity using static schema definitions.
 * Google Drive has a fixed metadata schema for files and folders.
 */
export async function introspectGoogleDriveEntity(
  entityName: string,
  _fetchFn: AuthenticatedFetchFn,
  log: LogFn
): Promise<IntrospectResult> {
  log(`[DISCOVERY] Introspecting Google Drive entity: ${entityName}`);

  const schemaMap: Record<string, SchemaField[]> = {
    files: DRIVE_FILE_SCHEMA,
    folders: DRIVE_FOLDER_SCHEMA,
  };

  const fields = schemaMap[entityName];
  if (!fields) {
    throw new Error(
      `No schema for Google Drive entity: ${entityName}. Known: ${Object.keys(schemaMap).join(", ")}`
    );
  }

  log(`[DISCOVERY] ${entityName}: ${fields.length} fields`);

  return {
    entityName,
    fields: [...fields],
    totalProperties: fields.length,
    apiVersion: "v3",
    introspectedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
//  Generic Introspection Dispatcher
// ═══════════════════════════════════════════════════════════════

/**
 * Generic introspection dispatcher.
 */
export async function introspectEntity(
  connectorType: string,
  entityName: string,
  fetchFn: AuthenticatedFetchFn,
  log: LogFn
): Promise<IntrospectResult> {
  switch (connectorType) {
    case "hubspot":
      return introspectHubSpotEntity(entityName, fetchFn, log);

    case "fatture_in_cloud":
    case "fatture-in-cloud":
      return introspectFattureEntity(entityName, fetchFn, log);

    case "google_drive":
    case "google-drive":
      return introspectGoogleDriveEntity(entityName, fetchFn, log);

    default:
      throw new Error(`No introspector for connector type: ${connectorType}`);
  }
}

// Export static schemas for testing
export { FATTURE_SCHEMAS, DRIVE_FILE_SCHEMA, DRIVE_FOLDER_SCHEMA };
