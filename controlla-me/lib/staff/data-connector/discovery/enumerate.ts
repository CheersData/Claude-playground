/**
 * Schema Discovery — Enumerate
 *
 * Lists available entities/objects from a connector's API.
 * Each connector type has its own enumeration strategy:
 *   - HubSpot: Schema API (/crm/v3/schemas) + known CRM objects
 *   - Fatture in Cloud: fixed entity list (invoices, clients, suppliers, products)
 *   - Google Drive: file types enumerated from About API + folder hierarchy
 *   - Salesforce: SObject describe (planned)
 *
 * Output: EntityInfo[] — lightweight catalog of what's available.
 *
 * NOTE: Types are defined in ./types.ts (single source of truth).
 * This file re-exports them for backward compatibility.
 */

import type {
  EntityInfo,
  EntityCategory,
  EnumerateResult,
  AuthenticatedFetchFn,
  LogFn,
} from "./types";

// Re-export types for backward compatibility
export type { EntityInfo, EntityCategory, EnumerateResult };

// ═══════════════════════════════════════════════════════════════
//  HubSpot Enumeration
// ═══════════════════════════════════════════════════════════════

const HUBSPOT_API_BASE = "https://api.hubapi.com";

/**
 * Known HubSpot CRM object types with their metadata.
 * HubSpot Schema API (/crm/v3/schemas) lists custom objects too,
 * but we start with the well-known standard objects.
 */
const HUBSPOT_STANDARD_ENTITIES: EntityInfo[] = [
  {
    name: "contacts",
    label: "Contatti",
    description: "Persone nel CRM",
    category: "crm",
    apiEndpoint: "/crm/v3/objects/contacts",
    writable: true,
  },
  {
    name: "companies",
    label: "Aziende",
    description: "Organizzazioni nel CRM",
    category: "crm",
    apiEndpoint: "/crm/v3/objects/companies",
    writable: true,
  },
  {
    name: "deals",
    label: "Trattative",
    description: "Opportunità di vendita",
    category: "sales",
    apiEndpoint: "/crm/v3/objects/deals",
    writable: true,
  },
  {
    name: "tickets",
    label: "Ticket",
    description: "Ticket di assistenza",
    category: "support",
    apiEndpoint: "/crm/v3/objects/tickets",
    writable: true,
  },
  {
    name: "line_items",
    label: "Voci ordine",
    description: "Prodotti associati a trattative",
    category: "sales",
    apiEndpoint: "/crm/v3/objects/line_items",
    writable: true,
  },
  {
    name: "products",
    label: "Prodotti",
    description: "Catalogo prodotti/servizi",
    category: "sales",
    apiEndpoint: "/crm/v3/objects/products",
    writable: true,
  },
];

/**
 * Enumerate HubSpot entities using Schema API for custom objects
 * plus well-known standard objects.
 */
export async function enumerateHubSpot(
  fetchFn: AuthenticatedFetchFn,
  log: LogFn
): Promise<EnumerateResult> {
  const entities: EntityInfo[] = [...HUBSPOT_STANDARD_ENTITIES];

  // Try to discover custom objects via Schema API
  try {
    log("[DISCOVERY] Fetching HubSpot custom schemas...");
    const response = await fetchFn(`${HUBSPOT_API_BASE}/crm/v3/schemas`);

    if (response.ok) {
      const body = (await response.json()) as {
        results: Array<{
          name: string;
          labels: { singular: string; plural: string };
          description?: string;
          objectTypeId: string;
        }>;
      };

      for (const schema of body.results) {
        // Skip if already in standard entities
        if (entities.some((e) => e.name === schema.name)) continue;

        entities.push({
          name: schema.name,
          label: schema.labels.plural || schema.labels.singular,
          description: schema.description,
          category: "custom",
          apiEndpoint: `/crm/v3/objects/${schema.name}`,
          writable: true,
        });
      }

      log(`[DISCOVERY] Found ${body.results.length} custom schemas`);
    } else {
      log(`[DISCOVERY] Schema API returned ${response.status} — using standard entities only`);
    }
  } catch (err) {
    log(`[DISCOVERY] Schema API unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Estimate counts for standard entities
  for (const entity of entities) {
    if (entity.estimatedCount !== undefined) continue;
    try {
      const countUrl = `${HUBSPOT_API_BASE}${entity.apiEndpoint}?limit=0`;
      const response = await fetchFn(countUrl);
      if (response.ok) {
        const body = (await response.json()) as { total?: number };
        entity.estimatedCount = body.total ?? undefined;
      }
    } catch {
      // Non-blocking — count is optional
    }
  }

  return {
    connectorType: "hubspot",
    entities,
    apiVersion: "v3",
    enumeratedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
//  Fatture in Cloud Enumeration
// ═══════════════════════════════════════════════════════════════

const FATTURE_API_BASE = "https://api-v2.fattureincloud.it";

/**
 * Fixed entity list for Fatture in Cloud.
 * The API v2 has a well-known schema — no runtime discovery needed.
 * Entities correspond to the main API resource types.
 */
const FATTURE_ENTITIES: EntityInfo[] = [
  {
    name: "issued_invoices",
    label: "Fatture Emesse",
    description: "Fatture emesse ai clienti",
    category: "accounting",
    apiEndpoint: "/c/{company_id}/issued_documents/invoices",
    writable: true,
  },
  {
    name: "received_documents",
    label: "Fatture Ricevute",
    description: "Fatture ricevute dai fornitori",
    category: "accounting",
    apiEndpoint: "/c/{company_id}/received_documents",
    writable: true,
  },
  {
    name: "clients",
    label: "Clienti",
    description: "Rubrica clienti dell'azienda",
    category: "crm",
    apiEndpoint: "/c/{company_id}/entities/clients",
    writable: true,
  },
  {
    name: "suppliers",
    label: "Fornitori",
    description: "Rubrica fornitori dell'azienda",
    category: "crm",
    apiEndpoint: "/c/{company_id}/entities/suppliers",
    writable: true,
  },
  {
    name: "products",
    label: "Prodotti/Servizi",
    description: "Catalogo prodotti e servizi",
    category: "sales",
    apiEndpoint: "/c/{company_id}/products",
    writable: true,
  },
  {
    name: "receipts",
    label: "Corrispettivi",
    description: "Corrispettivi giornalieri",
    category: "accounting",
    apiEndpoint: "/c/{company_id}/receipts",
    writable: true,
  },
];

/**
 * Enumerate Fatture in Cloud entities.
 * Uses the /user/companies endpoint to validate access,
 * then returns the fixed entity list with estimated counts.
 */
export async function enumerateFattureInCloud(
  fetchFn: AuthenticatedFetchFn,
  log: LogFn
): Promise<EnumerateResult> {
  const entities: EntityInfo[] = [...FATTURE_ENTITIES];

  // Try to get company info for validation and count estimation
  try {
    log("[DISCOVERY] Validating Fatture in Cloud API access...");

    // The user/companies endpoint returns accessible companies
    const response = await fetchFn(`${FATTURE_API_BASE}/user/companies`);

    if (response.ok) {
      const body = (await response.json()) as {
        data: { companies: Array<{ id: number; name: string; type: string }> };
      };
      const companyCount = body.data?.companies?.length ?? 0;
      log(`[DISCOVERY] Fatture in Cloud: ${companyCount} companies accessible`);
    } else {
      log(`[DISCOVERY] Fatture in Cloud API returned ${response.status}`);
    }
  } catch (err) {
    log(`[DISCOVERY] Fatture in Cloud API check failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Estimate counts by querying first page with per_page=1
  for (const entity of entities) {
    try {
      // Replace {company_id} with a test query — we skip if no company_id is available
      // Count estimation is best-effort
      const endpoint = entity.apiEndpoint;
      if (endpoint && !endpoint.includes("{company_id}")) {
        const countUrl = `${FATTURE_API_BASE}${endpoint}?per_page=1&page=1`;
        const response = await fetchFn(countUrl);
        if (response.ok) {
          const body = (await response.json()) as { total?: number };
          entity.estimatedCount = body.total ?? undefined;
        }
      }
    } catch {
      // Non-blocking — count is optional
    }
  }

  return {
    connectorType: "fatture_in_cloud",
    entities,
    apiVersion: "v2",
    enumeratedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
//  Google Drive Enumeration
// ═══════════════════════════════════════════════════════════════

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

/**
 * Google Drive entity list.
 * Unlike CRM/ERP connectors, Drive has a flat hierarchy:
 *   - files (all file types)
 *   - folders (containers)
 *   - shared_drives (team drives, if available)
 *
 * The real "schema" is the file metadata — every file has the same fields.
 * Categorization by MIME type is handled at the introspect/model level.
 */
const DRIVE_ENTITIES: EntityInfo[] = [
  {
    name: "files",
    label: "File",
    description: "Tutti i file nel Drive (documenti, fogli, presentazioni, PDF, immagini, ecc.)",
    category: "documents",
    apiEndpoint: "/files",
    writable: false, // read-only for MVP
  },
  {
    name: "folders",
    label: "Cartelle",
    description: "Struttura delle cartelle nel Drive",
    category: "documents",
    apiEndpoint: "/files",
    writable: false,
  },
];

/**
 * Enumerate Google Drive entities.
 * Tests API access via the About endpoint, then returns the fixed entity list
 * with an estimated file count from a minimal list query.
 */
export async function enumerateGoogleDrive(
  fetchFn: AuthenticatedFetchFn,
  log: LogFn
): Promise<EnumerateResult> {
  const entities: EntityInfo[] = [...DRIVE_ENTITIES];

  try {
    log("[DISCOVERY] Validating Google Drive API access...");

    // Test with About endpoint
    const aboutUrl = `${DRIVE_API_BASE}/about?fields=user(displayName,emailAddress),storageQuota(usage)`;
    const aboutResponse = await fetchFn(aboutUrl);

    if (aboutResponse.ok) {
      const aboutData = (await aboutResponse.json()) as {
        user?: { displayName?: string; emailAddress?: string };
        storageQuota?: { usage?: string };
      };
      log(`[DISCOVERY] Google Drive: connected as ${aboutData.user?.emailAddress ?? "unknown"}`);
    } else {
      log(`[DISCOVERY] Google Drive About API returned ${aboutResponse.status}`);
    }

    // Estimate file count
    const listUrl = `${DRIVE_API_BASE}/files?pageSize=1&fields=nextPageToken,files(id)&q=trashed%20%3D%20false%20and%20mimeType%20!%3D%20'application/vnd.google-apps.folder'`;
    const listResponse = await fetchFn(listUrl);

    if (listResponse.ok) {
      const listData = (await listResponse.json()) as {
        nextPageToken?: string;
        files?: Array<{ id: string }>;
      };
      // If there's a next page, there are many files
      const fileCount = listData.nextPageToken ? 1000 : (listData.files?.length ?? 0);
      const fileEntity = entities.find((e) => e.name === "files");
      if (fileEntity) fileEntity.estimatedCount = fileCount;
      log(`[DISCOVERY] Google Drive: ~${fileCount} files`);
    }

    // Estimate folder count
    const folderUrl = `${DRIVE_API_BASE}/files?pageSize=1&fields=nextPageToken,files(id)&q=trashed%20%3D%20false%20and%20mimeType%20%3D%20'application/vnd.google-apps.folder'`;
    const folderResponse = await fetchFn(folderUrl);

    if (folderResponse.ok) {
      const folderData = (await folderResponse.json()) as {
        nextPageToken?: string;
        files?: Array<{ id: string }>;
      };
      const folderCount = folderData.nextPageToken ? 200 : (folderData.files?.length ?? 0);
      const folderEntity = entities.find((e) => e.name === "folders");
      if (folderEntity) folderEntity.estimatedCount = folderCount;
    }
  } catch (err) {
    log(`[DISCOVERY] Google Drive enumeration failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    connectorType: "google_drive",
    entities,
    apiVersion: "v3",
    enumeratedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
//  Generic Enumeration Dispatcher
// ═══════════════════════════════════════════════════════════════

/**
 * Generic enumeration dispatcher.
 * Routes to connector-specific enumerators.
 */
export async function enumerateEntities(
  connectorType: string,
  fetchFn: AuthenticatedFetchFn,
  log: LogFn
): Promise<EnumerateResult> {
  switch (connectorType) {
    case "hubspot":
      return enumerateHubSpot(fetchFn, log);

    case "fatture_in_cloud":
    case "fatture-in-cloud":
      return enumerateFattureInCloud(fetchFn, log);

    case "google_drive":
    case "google-drive":
      return enumerateGoogleDrive(fetchFn, log);

    default:
      log(`[DISCOVERY] No enumerator for connector type: ${connectorType}`);
      return {
        connectorType,
        entities: [],
        enumeratedAt: new Date().toISOString(),
      };
  }
}
