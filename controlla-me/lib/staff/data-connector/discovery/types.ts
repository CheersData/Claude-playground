/**
 * Schema Discovery Engine — Shared Types
 *
 * Centralized type definitions used across all discovery modules.
 * This file avoids circular dependencies by being the leaf dependency:
 *   types.ts ← enumerate.ts, introspect.ts, relate.ts, tag.ts, taxonomy.ts, graph.ts, cache.ts, index.ts
 *
 * NOTE: EntityRelationship is re-exported from protocol.ts (source of truth).
 * SchemaField is the discovery engine's internal type — a subset of
 * protocol.ts DiscoveredField. Use schemaFieldToDiscoveredField() from
 * protocol.ts to convert when needed.
 */

import type { EntityRelationship as ProtocolEntityRelationship } from "../protocol";

// Re-export EntityRelationship from protocol (source of truth)
export type EntityRelationship = ProtocolEntityRelationship;

// ─── Schema Field ───

/**
 * Field within a discovered entity schema.
 * This is the discovery engine's internal representation — more compact than
 * protocol.ts DiscoveredField (omits piiLevel, tags, which are added post-discovery).
 */
export interface SchemaField {
  /** Unique field identifier (often same as name) */
  id: string;
  /** Technical field name (e.g., "email", "hs_object_id") */
  name: string;
  /** Human-readable label (e.g., "Email", "Object ID") */
  label?: string;
  /** Normalized type string (mapped to FieldType by protocol bridge) */
  type: string;
  /** Is this field required to create a record? */
  required?: boolean;
  /** Description from the provider API */
  description?: string;
  /** Logical group (e.g., "contactinformation" for HubSpot) */
  groupName?: string;
  /** Sub-fields for structured types (e.g., address -> street, city, zip) */
  children?: SchemaField[];
  /** Options for enum/select fields */
  options?: Array<{ label: string; value: string }>;
}

// ─── Entity Info ───

/**
 * Lightweight entity descriptor produced by the ENUMERATE phase.
 * Provides just enough metadata to decide what to introspect.
 */
export interface EntityInfo {
  /** Technical name (e.g., "contacts", "deals", "issued_invoices") */
  name: string;
  /** Human-readable label (e.g., "Contatti", "Trattative") */
  label: string;
  /** Description of the entity */
  description?: string;
  /** Estimated number of records */
  estimatedCount?: number;
  /** Functional category */
  category: EntityCategory;
  /** API endpoint for this entity */
  apiEndpoint?: string;
  /** Does the entity support write operations? */
  writable: boolean;
}

/**
 * Functional category for discovered entities.
 * Used by the taxonomy engine to classify entities and by the
 * protocol bridge to map to protocol.ts EntityCategory.
 */
export type EntityCategory =
  | "crm"
  | "sales"
  | "support"
  | "accounting"
  | "documents"
  | "legal"
  | "medical"
  | "hr"
  | "custom";

// ─── Enumerate ───

export interface EnumerateResult {
  connectorType: string;
  entities: EntityInfo[];
  apiVersion?: string;
  enumeratedAt: string;
}

// ─── Introspect ───

export interface IntrospectResult {
  entityName: string;
  fields: SchemaField[];
  totalProperties: number;
  apiVersion?: string;
  introspectedAt: string;
}

// ─── Relate ───

export type RelateStrategy = "api" | "fk-pattern" | "llm";

export interface RelateResult {
  relationships: EntityRelationship[];
  strategies: Array<{
    strategy: RelateStrategy;
    found: number;
  }>;
  relatedAt: string;
}

// ─── Tag ───

export type FieldTag =
  | "pii"
  | "pii:email"
  | "pii:phone"
  | "pii:name"
  | "pii:address"
  | "pii:fiscal-code"
  | "financial"
  | "financial:amount"
  | "financial:currency"
  | "temporal"
  | "temporal:created"
  | "temporal:updated"
  | "identifier"
  | "identifier:primary"
  | "identifier:foreign"
  | "status"
  | "contact"
  | "metric"
  | "text"
  | "url";

export interface TaggedField extends SchemaField {
  tags: FieldTag[];
  piiLevel: "none" | "low" | "medium" | "high";
}

export interface TagResult {
  entityName: string;
  taggedFields: TaggedField[];
  piiFieldCount: number;
  financialFieldCount: number;
  taggedAt: string;
}

// ─── Taxonomy ───

/**
 * Result of the taxonomy classification for an entity.
 */
export interface TaxonomyResult {
  entityName: string;
  /** Primary category determined by taxonomy rules */
  category: EntityCategory;
  /** Confidence level of the classification (0.0 - 1.0) */
  confidence: number;
  /** Secondary categories with lower confidence */
  secondaryCategories?: Array<{ category: EntityCategory; confidence: number }>;
  /** Semantic domain tags (e.g., "invoicing", "contacts", "pipeline") */
  domainTags: string[];
  /** Classification strategy that produced the result */
  classifiedBy: "name-rule" | "field-analysis" | "connector-hint" | "llm";
}

export interface TaxonomyBatchResult {
  connectorType: string;
  results: TaxonomyResult[];
  classifiedAt: string;
}

// ─── Graph ───

export interface SchemaNode {
  name: string;
  label: string;
  category: EntityCategory;
  fieldCount: number;
  piiFieldCount: number;
  estimatedRecords?: number;
  fields?: TaggedField[];
}

export interface SchemaEdge {
  from: string;
  to: string;
  type: EntityRelationship["type"];
  label?: string;
  apiId?: string;
}

export interface SchemaGraph {
  nodes: SchemaNode[];
  edges: SchemaEdge[];
  connectorType: string;
  builtAt: string;
}

// ─── Cache ───

export interface DiscoveredSchema {
  entityName: string;
  connectorType: string;
  fields: SchemaField[];
  relationships: EntityRelationship[];
  recordCount?: number;
  apiVersion?: string;
  discoveredAt: string;
  expiresAt: string;
}

export interface CachedSchemaRow {
  id: string;
  user_id: string;
  connection_id: string;
  connector_type: string;
  entity_name: string;
  schema_data: {
    fields: SchemaField[];
    relationships?: EntityRelationship[];
  };
  record_count: number | null;
  api_version: string | null;
  discovered_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

// ─── Discovery Pipeline ───

export interface DiscoveryOptions {
  /** Skip cache and force re-discovery */
  forceRefresh?: boolean;
  /** Only discover these entities (skip enumeration) */
  entities?: string[];
  /** Skip relationship discovery (faster, for single-entity introspection) */
  skipRelations?: boolean;
  /** Skip taxonomy classification */
  skipTaxonomy?: boolean;
}

export interface DiscoveryResult {
  graph: SchemaGraph;
  syncOrder: string[];
  cached: boolean;
  enumerate: EnumerateResult;
  introspections: IntrospectResult[];
  relations: RelateResult | null;
  tags: TagResult[];
  taxonomy: TaxonomyBatchResult | null;
  durationMs: number;
}

// ─── Fetch function type (shared across modules) ───

/**
 * Authenticated fetch function signature used by discovery modules.
 * Injected by the pipeline to use connector-specific auth (OAuth2, API key, etc.).
 */
export type AuthenticatedFetchFn = (
  url: string,
  init?: RequestInit
) => Promise<Response>;

/** Logger function signature */
export type LogFn = (msg: string) => void;
