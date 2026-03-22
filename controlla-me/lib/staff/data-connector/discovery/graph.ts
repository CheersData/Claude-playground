/**
 * Schema Discovery — Graph
 *
 * Builds a graph representation of the discovered schema.
 * Nodes = entities, edges = relationships.
 *
 * Used by:
 *   - SetupWizard UI: visual entity relationship diagram
 *   - Mapping engine: understand traversal paths for JOINs
 *   - Sync orchestrator: determine sync order (topological sort)
 *
 * NOTE: Types are defined in ./types.ts (single source of truth).
 */

import type {
  EntityRelationship,
  EntityInfo,
  TaggedField,
  SchemaNode,
  SchemaEdge,
  SchemaGraph,
} from "./types";

// Re-export types for backward compatibility
export type { SchemaNode, SchemaEdge, SchemaGraph };

// ─── Graph Builder ───

/**
 * Build the schema graph from discovery results.
 */
export function buildSchemaGraph(
  connectorType: string,
  entities: EntityInfo[],
  entityFields: Map<string, TaggedField[]>,
  relationships: EntityRelationship[]
): SchemaGraph {
  // Build nodes
  const nodes: SchemaNode[] = entities.map((entity) => {
    const fields = entityFields.get(entity.name);
    return {
      name: entity.name,
      label: entity.label,
      category: entity.category,
      fieldCount: fields?.length ?? 0,
      piiFieldCount: fields?.filter((f) => f.piiLevel !== "none").length ?? 0,
      estimatedRecords: entity.estimatedCount,
      fields: fields ?? undefined,
    };
  });

  // Build edges (only for entities that exist as nodes)
  const nodeNames = new Set(nodes.map((n) => n.name));
  const edges: SchemaEdge[] = relationships
    .filter((r) => nodeNames.has(r.fromEntity) && nodeNames.has(r.toEntity))
    .map((r) => ({
      from: r.fromEntity,
      to: r.toEntity,
      type: r.type,
      label: r.label,
      apiId: r.apiId,
    }));

  return {
    nodes,
    edges,
    connectorType,
    builtAt: new Date().toISOString(),
  };
}

/**
 * Topological sort of entities based on relationships.
 * Returns entities in order such that dependencies come first.
 * Useful for determining sync order (sync companies before deals).
 *
 * Falls back to input order if cycles are detected.
 */
export function topologicalSort(graph: SchemaGraph): string[] {
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  // Initialize
  for (const node of graph.nodes) {
    adjacency.set(node.name, []);
    inDegree.set(node.name, 0);
  }

  // Build adjacency from many-to-one edges (child -> parent)
  for (const edge of graph.edges) {
    if (edge.type === "many-to-one") {
      // from depends on to -> to must be synced first
      adjacency.get(edge.to)?.push(edge.from);
      inDegree.set(edge.from, (inDegree.get(edge.from) ?? 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  // If cycle detected, return all nodes (fallback)
  if (sorted.length < graph.nodes.length) {
    const remaining = graph.nodes
      .map((n) => n.name)
      .filter((n) => !sorted.includes(n));
    return [...sorted, ...remaining];
  }

  return sorted;
}

/**
 * Find entities connected to a given entity (1 hop).
 */
export function getConnectedEntities(
  graph: SchemaGraph,
  entityName: string
): string[] {
  const connected = new Set<string>();

  for (const edge of graph.edges) {
    if (edge.from === entityName) connected.add(edge.to);
    if (edge.to === entityName) connected.add(edge.from);
  }

  return [...connected];
}

/**
 * Serialize graph to a compact JSON representation for the UI.
 * Strips full field lists to reduce payload size.
 */
export function serializeForUI(graph: SchemaGraph): SchemaGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((n) => ({
      ...n,
      fields: undefined,
    })),
  };
}
