/**
 * Schema Discovery Engine — Orchestrator
 *
 * Full pipeline: ENUMERATE -> INTROSPECT -> RELATE -> TAG -> TAXONOMY -> GRAPH -> CACHE
 *
 * Discovers the schema of a remote connector (e.g., HubSpot CRM, Fatture in Cloud,
 * Google Drive) and produces a SchemaGraph with tagged, categorized fields and
 * relationships.
 *
 * Usage:
 *   const result = await runDiscovery("hubspot", connectionId, userId, fetchFn, log);
 *   // result.graph contains nodes (entities) and edges (relationships)
 *   // result.taxonomy contains entity-level categorization
 *   // result.cached = true if schema was loaded from cache
 */

import { enumerateEntities } from "./enumerate";
import { introspectEntity } from "./introspect";
import { discoverRelationships } from "./relate";
import { tagEntityFields } from "./tag";
import { classifyEntities, applyTaxonomy } from "./taxonomy";
import {
  buildSchemaGraph,
  topologicalSort,
} from "./graph";
import {
  getCachedSchemas,
  cacheSchema,
} from "./cache";

import type {
  DiscoveryOptions,
  DiscoveryResult,
  EnumerateResult,
  IntrospectResult,
  RelateResult,
  TagResult,
  TaggedField,
  TaxonomyBatchResult,
  SchemaField,
  DiscoveredSchema,
  EntityRelationship,
  AuthenticatedFetchFn,
  LogFn,
} from "./types";

// ─── Orchestrator ───

/**
 * Run the full schema discovery pipeline.
 *
 * @param connectorType - e.g., "hubspot", "fatture_in_cloud"
 * @param connectionId  - UUID of the integration_connections row
 * @param userId        - UUID of the user (for cache ownership)
 * @param fetchFn       - authenticated fetch function (from the connector)
 * @param log           - logging function
 * @param options       - discovery options
 */
export async function runDiscovery(
  connectorType: string,
  connectionId: string,
  userId: string,
  fetchFn: AuthenticatedFetchFn,
  log: LogFn,
  options: DiscoveryOptions = {}
): Promise<DiscoveryResult> {
  const start = Date.now();
  log(`[DISCOVERY] Starting schema discovery for ${connectorType}`);

  // ─── Phase 0: Check cache ───

  if (!options.forceRefresh) {
    const cached = await getCachedSchemas(connectionId);
    if (cached.length > 0) {
      log(`[DISCOVERY] Found ${cached.length} cached schemas — rebuilding graph from cache`);
      return buildFromCache(connectorType, cached, start, options);
    }
  }

  // ─── Phase 1: ENUMERATE ───

  log("[DISCOVERY] Phase 1: Enumerating entities...");
  const enumResult = await enumerateEntities(connectorType, fetchFn, log);

  // Filter entities if specified
  let targetEntities = enumResult.entities;
  if (options.entities) {
    const allowed = new Set(options.entities);
    targetEntities = targetEntities.filter((e) => allowed.has(e.name));
  }

  if (targetEntities.length === 0) {
    log("[DISCOVERY] No entities found — aborting");
    return emptyResult(connectorType, enumResult, start);
  }

  log(`[DISCOVERY] Found ${targetEntities.length} entities to introspect`);

  // ─── Phase 2: INTROSPECT ───

  log("[DISCOVERY] Phase 2: Introspecting entity schemas...");
  const introspections: IntrospectResult[] = [];
  const entityFields = new Map<string, SchemaField[]>();

  for (const entity of targetEntities) {
    try {
      const result = await introspectEntity(connectorType, entity.name, fetchFn, log);
      introspections.push(result);
      entityFields.set(entity.name, result.fields);
    } catch (err) {
      log(`[DISCOVERY] Failed to introspect ${entity.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ─── Phase 3: RELATE ───

  let relateResult: RelateResult | null = null;
  if (!options.skipRelations && targetEntities.length >= 2) {
    log("[DISCOVERY] Phase 3: Discovering relationships...");
    relateResult = await discoverRelationships(
      connectorType,
      targetEntities.map((e) => e.name),
      entityFields,
      fetchFn,
      log
    );
  }

  // ─── Phase 4: TAG ───

  log("[DISCOVERY] Phase 4: Tagging fields...");
  const tagResults: TagResult[] = [];
  const taggedFieldsMap = new Map<string, TaggedField[]>();

  for (const [entityName, fields] of entityFields) {
    const result = tagEntityFields(entityName, fields);
    tagResults.push(result);
    taggedFieldsMap.set(entityName, result.taggedFields);
  }

  const totalPii = tagResults.reduce((s, t) => s + t.piiFieldCount, 0);
  log(`[DISCOVERY] Tagged ${tagResults.length} entities — ${totalPii} PII fields detected`);

  // ─── Phase 4.5: TAXONOMY ───

  let taxonomyResult: TaxonomyBatchResult | null = null;
  if (!options.skipTaxonomy) {
    log("[DISCOVERY] Phase 4.5: Classifying entities (taxonomy)...");
    taxonomyResult = classifyEntities(connectorType, taggedFieldsMap, log);

    // Apply taxonomy results back to entity info (refine categories)
    applyTaxonomy(targetEntities, taxonomyResult);
  }

  // ─── Phase 5: GRAPH ───

  log("[DISCOVERY] Phase 5: Building schema graph...");
  const graph = buildSchemaGraph(
    connectorType,
    targetEntities,
    taggedFieldsMap,
    relateResult?.relationships ?? []
  );

  const syncOrder = topologicalSort(graph);
  log(`[DISCOVERY] Sync order: ${syncOrder.join(" → ")}`);

  // ─── Phase 6: CACHE ───

  log("[DISCOVERY] Phase 6: Caching results...");
  const allRelationships = relateResult?.relationships ?? [];

  for (const [entityName, fields] of entityFields) {
    const entityRels = allRelationships.filter(
      (r) => r.fromEntity === entityName || r.toEntity === entityName
    );

    const schema: DiscoveredSchema = {
      entityName,
      connectorType,
      fields,
      relationships: entityRels,
      recordCount: targetEntities.find((e) => e.name === entityName)?.estimatedCount,
      apiVersion: introspections.find((i) => i.entityName === entityName)?.apiVersion,
      discoveredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    try {
      await cacheSchema(userId, connectionId, schema);
    } catch (err) {
      log(`[DISCOVERY] Cache write failed for ${entityName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const durationMs = Date.now() - start;
  log(`[DISCOVERY] Complete in ${durationMs}ms — ${graph.nodes.length} entities, ${graph.edges.length} relationships`);

  return {
    graph,
    syncOrder,
    cached: false,
    enumerate: enumResult,
    introspections,
    relations: relateResult,
    tags: tagResults,
    taxonomy: taxonomyResult,
    durationMs,
  };
}

// ─── Helpers ───

function buildFromCache(
  connectorType: string,
  cached: DiscoveredSchema[],
  startTime: number,
  options: DiscoveryOptions = {}
): DiscoveryResult {
  const entityFields = new Map<string, TaggedField[]>();
  const entities = cached.map((s) => ({
    name: s.entityName,
    label: s.entityName,
    category: "crm" as const,
    writable: true,
    estimatedCount: s.recordCount,
  }));

  // Re-tag cached fields
  const tagResults: TagResult[] = [];
  for (const schema of cached) {
    const result = tagEntityFields(schema.entityName, schema.fields);
    tagResults.push(result);
    entityFields.set(schema.entityName, result.taggedFields);
  }

  // Classify entities (taxonomy)
  let taxonomyResult: TaxonomyBatchResult | null = null;
  if (!options.skipTaxonomy) {
    taxonomyResult = classifyEntities(connectorType, entityFields);
    applyTaxonomy(entities, taxonomyResult);
  }

  // Collect relationships from cached schemas
  const allRelationships: EntityRelationship[] = [];
  for (const schema of cached) {
    for (const rel of schema.relationships) {
      if (!allRelationships.some((r) => r.fromEntity === rel.fromEntity && r.toEntity === rel.toEntity)) {
        allRelationships.push(rel);
      }
    }
  }

  const graph = buildSchemaGraph(connectorType, entities, entityFields, allRelationships);
  const syncOrder = topologicalSort(graph);

  return {
    graph,
    syncOrder,
    cached: true,
    enumerate: {
      connectorType,
      entities,
      enumeratedAt: new Date().toISOString(),
    },
    introspections: [],
    relations: null,
    tags: tagResults,
    taxonomy: taxonomyResult,
    durationMs: Date.now() - startTime,
  };
}

function emptyResult(
  connectorType: string,
  enumResult: EnumerateResult,
  startTime: number
): DiscoveryResult {
  return {
    graph: { nodes: [], edges: [], connectorType, builtAt: new Date().toISOString() },
    syncOrder: [],
    cached: false,
    enumerate: enumResult,
    introspections: [],
    relations: null,
    tags: [],
    taxonomy: null,
    durationMs: Date.now() - startTime,
  };
}

// ─── Bridge: Discovery -> Protocol ───

import type { DiscoveryCatalog } from "../protocol";
import { schemaGraphToCatalog } from "../protocol";

/**
 * Run discovery and convert the result directly to a DiscoveryCatalog.
 *
 * Convenience function that combines runDiscovery() + schemaGraphToCatalog()
 * for callers that only need the protocol-level output (e.g., UniversalConnector.discover()).
 *
 * @returns DiscoveryCatalog ready for UniversalConnector.discover() return value
 */
export async function discoverAsCatalog(
  connectorType: string,
  connectionId: string,
  userId: string,
  fetchFn: AuthenticatedFetchFn,
  log: LogFn,
  options: DiscoveryOptions = {}
): Promise<DiscoveryCatalog> {
  const result = await runDiscovery(connectorType, connectionId, userId, fetchFn, log, options);
  return schemaGraphToCatalog(result.graph, result.syncOrder, result.cached);
}

// ─── Re-exports ───

export type {
  DiscoveredSchema,
  SchemaField,
  EntityRelationship,
  DiscoveryOptions,
  DiscoveryResult,
} from "./types";
export type { EntityInfo, EntityCategory, EnumerateResult } from "./types";
export type { IntrospectResult } from "./types";
export type { RelateResult } from "./types";
export type { TaggedField, TagResult, FieldTag } from "./types";
export type { TaxonomyResult, TaxonomyBatchResult } from "./types";
export type { SchemaGraph, SchemaNode, SchemaEdge } from "./types";
export { invalidateCache, cleanupExpired } from "./cache";
export { topologicalSort, getConnectedEntities, serializeForUI } from "./graph";
export { schemaGraphToCatalog } from "../protocol";
export { classifyEntity, classifyEntities, applyTaxonomy } from "./taxonomy";
