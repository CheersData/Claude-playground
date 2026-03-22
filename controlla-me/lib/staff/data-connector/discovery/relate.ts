/**
 * Schema Discovery — Relate
 *
 * Discovers relationships between entities using 3 strategies:
 *   1. API-declared associations (HubSpot Associations v4 API)
 *   2. FK pattern matching (field names ending in _id, _ref, etc.)
 *   3. Static relationship definitions (Fatture in Cloud, Google Drive)
 *
 * LLM inference (strategy 4, future) is reserved for ambiguous relationships
 * where strategies 1-3 produce < 2 relationships and there are 3+ entities.
 *
 * Output: EntityRelationship[] — edges in the schema graph.
 *
 * NOTE: Types are defined in ./types.ts (single source of truth).
 */

import type {
  EntityRelationship,
  SchemaField,
  RelateResult,
  RelateStrategy,
  AuthenticatedFetchFn,
  LogFn,
} from "./types";

// Re-export types for backward compatibility
export type { RelateResult };

// ═══════════════════════════════════════════════════════════════
//  Strategy 1: API-declared associations (HubSpot Associations v4)
// ═══════════════════════════════════════════════════════════════

const HUBSPOT_API_BASE = "https://api.hubapi.com";

interface HubSpotAssociationSchema {
  results: Array<{
    id: string;
    name?: string;
    fromObjectTypeId: string;
    toObjectTypeId: string;
    label?: string;
  }>;
}

// ─── HubSpot object type ID map ───

const HUBSPOT_OBJECT_TYPE_IDS: Record<string, string> = {
  contacts: "0-1",
  companies: "0-2",
  deals: "0-3",
  tickets: "0-5",
  products: "0-7",
  line_items: "0-8",
  quotes: "0-14",
};

const HUBSPOT_ID_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(HUBSPOT_OBJECT_TYPE_IDS).map(([name, id]) => [id, name])
);

/**
 * Discover associations using HubSpot Associations v4 schema endpoint.
 * GET /crm/v4/associations/{fromObjectType}/{toObjectType}/labels
 */
async function discoverHubSpotAssociations(
  entityNames: string[],
  fetchFn: AuthenticatedFetchFn,
  log: LogFn
): Promise<EntityRelationship[]> {
  const relationships: EntityRelationship[] = [];
  const seen = new Set<string>();

  // Check associations between all pairs of entities
  for (let i = 0; i < entityNames.length; i++) {
    for (let j = i + 1; j < entityNames.length; j++) {
      const from = entityNames[i];
      const to = entityNames[j];
      const pairKey = `${from}→${to}`;

      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      try {
        const url = `${HUBSPOT_API_BASE}/crm/v4/associations/${from}/${to}/labels`;
        const response = await fetchFn(url);

        if (!response.ok) continue;

        const body = (await response.json()) as HubSpotAssociationSchema;

        for (const assoc of body.results) {
          relationships.push({
            fromEntity: from,
            toEntity: to,
            type: "association",
            label: assoc.label || assoc.name || `${from}↔${to}`,
            apiId: assoc.id,
          });
        }
      } catch {
        // Non-blocking — association check is optional
      }
    }
  }

  log(`[DISCOVERY] HubSpot Associations v4: ${relationships.length} associations found`);
  return relationships;
}

// ═══════════════════════════════════════════════════════════════
//  Strategy 2: FK pattern matching
// ═══════════════════════════════════════════════════════════════

/**
 * Infer relationships from field naming patterns.
 * Looks for fields like `company_id`, `contact_ref`, `associated_deal`, etc.
 */
function discoverFKPatterns(
  entityName: string,
  fields: SchemaField[],
  knownEntities: string[]
): EntityRelationship[] {
  const relationships: EntityRelationship[] = [];

  // Patterns that indicate a foreign key
  const fkPatterns = [
    /^(.+)_id$/,           // company_id → companies
    /^(.+)_ref$/,          // deal_ref → deals
    /^associated_(.+)$/,   // associated_company → companies
    /^hs_(.+)_id$/,        // hs_company_id → companies (HubSpot internal)
  ];

  for (const field of fields) {
    for (const pattern of fkPatterns) {
      const match = field.name.match(pattern);
      if (!match) continue;

      const possibleEntity = match[1];

      // Try to find a matching entity (singular or plural)
      const target = knownEntities.find(
        (e) =>
          e === possibleEntity ||
          e === `${possibleEntity}s` ||
          e === possibleEntity.replace(/y$/, "ies") ||
          e.replace(/s$/, "") === possibleEntity ||
          e.replace(/ies$/, "y") === possibleEntity
      );

      if (target && target !== entityName) {
        relationships.push({
          fromEntity: entityName,
          toEntity: target,
          type: "many-to-one",
          label: `${entityName}.${field.name} → ${target}`,
          fieldName: field.name,
        });
      }
    }
  }

  return relationships;
}

// ═══════════════════════════════════════════════════════════════
//  Strategy 3: Static relationship definitions
// ═══════════════════════════════════════════════════════════════

/**
 * Static relationship definitions for connectors with known schemas.
 * Used by Fatture in Cloud and Google Drive where relationships
 * are known at build time and don't need API introspection.
 */
interface StaticRelationshipDef {
  connectorType: string;
  relationships: EntityRelationship[];
}

const STATIC_RELATIONSHIPS: StaticRelationshipDef[] = [
  // ─── Fatture in Cloud ───
  {
    connectorType: "fatture_in_cloud",
    relationships: [
      {
        fromEntity: "issued_invoices",
        toEntity: "clients",
        type: "many-to-one",
        label: "Fattura emessa → Cliente",
        fieldName: "entity.id",
      },
      {
        fromEntity: "received_documents",
        toEntity: "suppliers",
        type: "many-to-one",
        label: "Fattura ricevuta → Fornitore",
        fieldName: "entity.id",
      },
      {
        fromEntity: "issued_invoices",
        toEntity: "products",
        type: "many-to-many",
        label: "Fattura emessa → Prodotti (voci fattura)",
      },
      {
        fromEntity: "receipts",
        toEntity: "products",
        type: "many-to-many",
        label: "Corrispettivo → Prodotti (voci corrispettivo)",
      },
    ],
  },
  // ─── Google Drive ───
  {
    connectorType: "google_drive",
    relationships: [
      {
        fromEntity: "files",
        toEntity: "folders",
        type: "many-to-one",
        label: "File → Cartella parent",
        fieldName: "parents",
      },
    ],
  },
];

/**
 * Get static relationships for a connector type.
 * Filters to only include relationships between known entities.
 */
function getStaticRelationships(
  connectorType: string,
  entityNames: string[]
): EntityRelationship[] {
  const normalizedType = connectorType.replace(/-/g, "_");
  const def = STATIC_RELATIONSHIPS.find(
    (d) => d.connectorType === normalizedType || d.connectorType === connectorType
  );

  if (!def) return [];

  const entitySet = new Set(entityNames);
  return def.relationships.filter(
    (r) => entitySet.has(r.fromEntity) && entitySet.has(r.toEntity)
  );
}

// ═══════════════════════════════════════════════════════════════
//  Combined Discovery
// ═══════════════════════════════════════════════════════════════

/**
 * Discover relationships for a set of entities using all available strategies.
 */
export async function discoverRelationships(
  connectorType: string,
  entityNames: string[],
  entityFields: Map<string, SchemaField[]>,
  fetchFn: AuthenticatedFetchFn,
  log: LogFn
): Promise<RelateResult> {
  const allRelationships: EntityRelationship[] = [];
  const strategies: Array<{ strategy: RelateStrategy; found: number }> = [];

  // Strategy 1: API-declared associations (only for connectors that support it)
  if (connectorType === "hubspot") {
    const apiRels = await discoverHubSpotAssociations(entityNames, fetchFn, log);
    allRelationships.push(...apiRels);
    strategies.push({ strategy: "api", found: apiRels.length });
  }

  // Strategy 2: FK pattern matching
  let fkCount = 0;
  for (const [entityName, fields] of entityFields) {
    const fkRels = discoverFKPatterns(entityName, fields, entityNames);

    // Deduplicate against already-found relationships
    for (const rel of fkRels) {
      const duplicate = allRelationships.some(
        (r) =>
          (r.fromEntity === rel.fromEntity && r.toEntity === rel.toEntity) ||
          (r.fromEntity === rel.toEntity && r.toEntity === rel.fromEntity)
      );
      if (!duplicate) {
        allRelationships.push(rel);
        fkCount++;
      }
    }
  }
  strategies.push({ strategy: "fk-pattern", found: fkCount });

  // Strategy 3: Static relationship definitions (for known schemas)
  const staticRels = getStaticRelationships(connectorType, entityNames);
  let staticCount = 0;
  for (const rel of staticRels) {
    const duplicate = allRelationships.some(
      (r) =>
        (r.fromEntity === rel.fromEntity && r.toEntity === rel.toEntity) ||
        (r.fromEntity === rel.toEntity && r.toEntity === rel.fromEntity)
    );
    if (!duplicate) {
      allRelationships.push(rel);
      staticCount++;
    }
  }
  if (staticCount > 0) {
    strategies.push({ strategy: "api", found: staticCount }); // Report as "api" since they come from known schema
  }

  // Strategy 4: LLM inference — placeholder for future implementation.
  // Only activated when strategies 1-3 yield < 2 relationships and
  // there are 3+ entities. Requires generate() from lib/ai-sdk.
  strategies.push({ strategy: "llm", found: 0 });

  log(`[DISCOVERY] Total relationships: ${allRelationships.length}`);

  return {
    relationships: allRelationships,
    strategies,
    relatedAt: new Date().toISOString(),
  };
}

export { HUBSPOT_OBJECT_TYPE_IDS, HUBSPOT_ID_TO_NAME };
