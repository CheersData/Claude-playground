/**
 * UniversalConnector Protocol — Interfaccia unificata per tutti i connettori.
 *
 * Unisce il mondo legacy (Normattiva, EUR-Lex = schema noto) con il mondo
 * business (HubSpot, Salesforce = schema scoperto a runtime).
 *
 * Ogni connettore, nuovo o legacy (via LegacyConnectorAdapter), espone
 * la stessa interfaccia al pipeline orchestrator.
 *
 * FASE 1A: Definizione protocol + adapter + bridge con discovery engine.
 * FASE 1B: Migrazione graduale dei connettori esistenti.
 *
 * Questo file e' la SOURCE OF TRUTH per i tipi condivisi:
 *   - EntityRelationship (usato anche da discovery/cache.ts)
 *   - DiscoveredField (superset di discovery/cache.ts SchemaField)
 *   - DiscoveredEntity, DiscoveryCatalog, ConnectorCapabilities
 *
 * Il discovery engine (discovery/) usa SchemaField (subset di DiscoveredField)
 * per la fase interna. Le funzioni bridge in fondo a questo file convertono
 * il risultato del discovery engine nel formato DiscoveryCatalog del protocollo.
 */

import type { ConnectResult, FetchResult } from "./types";

// ─── Discovery Types ───

/**
 * Campo di un'entita remota, normalizzato dal connettore.
 * Astrae le differenze tra HubSpot Properties, Salesforce Describe,
 * Google Drive metadata, Fatture in Cloud OpenAPI, ecc.
 *
 * NOTA: Superset di discovery/cache.ts SchemaField. SchemaField omette
 * i campi aggiunti post-discovery (piiLevel, tags, children complessi).
 * La funzione schemaFieldToDiscoveredField() converte l'uno nell'altro.
 */
export interface DiscoveredField {
  /** ID univoco del campo (opzionale, coincide con name se assente) */
  id?: string;
  /** Nome tecnico del campo (es. "email", "hs_object_id") */
  name: string;
  /** Etichetta human-readable (es. "Email", "Object ID") */
  label?: string;
  /** Tipo normalizzato */
  type: FieldType;
  /** Campo obbligatorio per creare un record? */
  required?: boolean;
  /** Descrizione dal provider */
  description?: string;
  /** Gruppo logico (es. "contactinformation" per HubSpot) */
  group?: string;
  /** Opzioni per campi enum/select */
  options?: Array<{ label: string; value: string }>;
  /** Sotto-campi per tipi strutturati (es. address → street, city, zip) */
  children?: DiscoveredField[];
  /** Livello PII rilevato dal tagger (post-discovery) */
  piiLevel?: "none" | "low" | "medium" | "high";
  /** Tag semantici (es. ["pii", "pii:email", "temporal:created"]) */
  tags?: string[];
}

export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "datetime"
  | "date"
  | "enum"
  | "text"
  | "json"
  | "phone"
  | "email"
  | "url"
  | "currency"
  | "binary"
  | "unknown";

/**
 * Entita remota (tabella, oggetto CRM, folder, ecc.) con il suo catalogo campi.
 * Corrisponde a un "object type" in HubSpot, un "SObject" in Salesforce, ecc.
 */
export interface DiscoveredEntity {
  /** Identificativo tecnico (es. "contacts", "deals", "invoices_received") */
  name: string;
  /** Etichetta human-readable (es. "Contatti", "Trattative") */
  label: string;
  /** Descrizione dell'entita */
  description?: string;
  /** Numero stimato di record */
  estimatedCount?: number;
  /** Categoria funzionale */
  category: EntityCategory;
  /** Endpoint API per questa entita (es. "/crm/v3/objects/contacts") */
  apiEndpoint?: string;
  /** Catalogo campi completo */
  fields: DiscoveredField[];
  /** L'entita supporta scrittura? */
  writable: boolean;
}

export type EntityCategory =
  | "crm"
  | "sales"
  | "support"
  | "accounting"
  | "documents"
  | "legal"
  | "medical"
  | "custom";

/**
 * Relazione tra due entita nel grafo dello schema remoto.
 * Es: contacts → companies (many-to-one), deals → line_items (one-to-many).
 *
 * SOURCE OF TRUTH — discovery/cache.ts re-esporta questo tipo.
 */
export interface EntityRelationship {
  fromEntity: string;
  toEntity: string;
  type: "one-to-many" | "many-to-one" | "many-to-many" | "association";
  /** Etichetta human-readable (es. "primary company") */
  label?: string;
  /** ID associazione dal provider (es. HubSpot association ID) */
  apiId?: string;
  /** Nome del campo FK che crea la relazione (es. "company_id") */
  fieldName?: string;
}

/**
 * Catalogo completo dello schema remoto: entita, campi, relazioni, ordine di sync.
 * Prodotto dalla fase DISCOVER del UniversalConnector.
 */
export interface DiscoveryCatalog {
  /** Tipo connettore (es. "hubspot", "fatture-in-cloud") */
  connectorType: string;
  /** Entita scoperte con i loro campi */
  entities: DiscoveredEntity[];
  /** Relazioni tra entita */
  relationships: EntityRelationship[];
  /** Ordine di sync (topological sort): sync companies prima di contacts */
  syncOrder: string[];
  /** Timestamp ISO della discovery */
  discoveredAt: string;
  /** True se il catalogo e' stato caricato da cache */
  cached: boolean;
}

// ─── Capabilities ───

/**
 * Dichiara cosa sa fare un connettore. Il pipeline orchestrator usa queste
 * flag per decidere quali fasi eseguire.
 */
export interface ConnectorCapabilities {
  /** Puo scoprire lo schema a runtime? (business = true, legal = false) */
  discovery: boolean;
  /** Supporta aggiornamenti incrementali (fetchDelta)? */
  delta: boolean;
  /** Supporta notifiche push via webhook? */
  webhook: boolean;
  /** Ha piu tipi di entita (contacts + companies + deals)? */
  multiEntity: boolean;
  /** Richiede autenticazione? */
  auth: boolean;
}

// ─── UniversalConnector Protocol ───

/**
 * Interfaccia unificata per TUTTI i connettori (legacy + business).
 *
 * Lifecycle:
 *   1. connect()  → test API, censimento (come prima)
 *   2. discover() → catalogo schema remoto (opzionale, solo business)
 *   3. fetchAll() / fetchDelta() → estrazione dati
 *
 * I connettori legacy (Normattiva, EUR-Lex) vengono wrappati con
 * LegacyConnectorAdapter che implementa questa interfaccia con
 * discover() = undefined e capabilities.discovery = false.
 */
export interface UniversalConnector<T = unknown> {
  /** ID del connettore nel registry (es. "normattiva", "hubspot") */
  readonly connectorId: string;

  /** Cosa sa fare questo connettore */
  readonly capabilities: ConnectorCapabilities;

  // ── Phase 1: CONNECT ──

  /** Test connessione + censimento (invariato rispetto a ConnectorInterface) */
  connect(): Promise<ConnectResult>;

  // ── Phase 1.5: DISCOVER (opzionale) ──

  /**
   * Scopri lo schema remoto: entita, campi, relazioni.
   * Solo per connettori business con capabilities.discovery = true.
   * Connettori legacy restituiscono undefined.
   */
  discover?(): Promise<DiscoveryCatalog>;

  // ── Phase 2: FETCH ──

  /** Fetch tutti i dati. Se multiEntity, specificare `entity` nelle options. */
  fetchAll(options?: FetchOptions): Promise<FetchResult<T>>;

  /** Fetch solo dati modificati da `since`. */
  fetchDelta(since: string, options?: FetchOptions): Promise<FetchResult<T>>;
}

export interface FetchOptions {
  /** Limita il numero di record */
  limit?: number;
  /** Specifica quale entita fetchare (per connettori multiEntity) */
  entity?: string;
}

// ─── Bridge: Discovery Engine → DiscoveryCatalog ───
//
// Il discovery engine (discovery/) produce SchemaGraph + SchemaField.
// Queste funzioni convertono nel formato DiscoveryCatalog del protocollo.
// Import lazy per evitare dipendenza circolare (protocol → discovery → cache → protocol).

/**
 * Tipo minimo di SchemaField dal discovery engine, per il bridge.
 * Corrisponde a discovery/cache.ts SchemaField senza importarlo direttamente.
 */
export interface SchemaFieldCompat {
  id: string;
  name: string;
  label?: string;
  type: string;
  required?: boolean;
  description?: string;
  groupName?: string;
  children?: SchemaFieldCompat[];
  options?: Array<{ label: string; value: string }>;
}

/**
 * Tipo minimo di TaggedField dal discovery engine (estende SchemaFieldCompat).
 */
export interface TaggedFieldCompat extends SchemaFieldCompat {
  tags: string[];
  piiLevel: "none" | "low" | "medium" | "high";
}

/**
 * Tipo minimo di SchemaNode dal discovery engine graph.
 */
export interface SchemaNodeCompat {
  name: string;
  label: string;
  category: string;
  fieldCount: number;
  piiFieldCount: number;
  estimatedRecords?: number;
  fields?: TaggedFieldCompat[];
}

/**
 * Tipo minimo di SchemaEdge dal discovery engine graph.
 */
export interface SchemaEdgeCompat {
  from: string;
  to: string;
  type: EntityRelationship["type"];
  label?: string;
  apiId?: string;
}

/**
 * Tipo minimo di SchemaGraph dal discovery engine.
 */
export interface SchemaGraphCompat {
  nodes: SchemaNodeCompat[];
  edges: SchemaEdgeCompat[];
  connectorType: string;
  builtAt: string;
}

/**
 * Converte uno SchemaField del discovery engine in DiscoveredField del protocollo.
 * Mappa groupName → group e normalizza il tipo in FieldType.
 */
export function schemaFieldToDiscoveredField(
  field: SchemaFieldCompat | TaggedFieldCompat
): DiscoveredField {
  const result: DiscoveredField = {
    id: field.id,
    name: field.name,
    label: field.label,
    type: normalizeFieldType(field.type),
    required: field.required,
    description: field.description,
    group: field.groupName,
    options: field.options,
  };

  // Converti sotto-campi ricorsivamente
  if (field.children && field.children.length > 0) {
    result.children = field.children.map(schemaFieldToDiscoveredField);
  }

  // Aggiungi tag e PII level se presenti (TaggedFieldCompat)
  if ("tags" in field && field.tags) {
    result.tags = field.tags;
  }
  if ("piiLevel" in field && field.piiLevel) {
    result.piiLevel = field.piiLevel;
  }

  return result;
}

/**
 * Normalizza una stringa tipo del discovery engine nel FieldType del protocollo.
 * Il discovery engine usa stringhe libere (es. "textarea" → "text").
 */
function normalizeFieldType(type: string): FieldType {
  const VALID_TYPES: Set<string> = new Set([
    "string", "number", "boolean", "datetime", "date", "enum",
    "text", "json", "phone", "email", "url", "currency", "binary",
  ]);

  if (VALID_TYPES.has(type)) return type as FieldType;

  // Mapping per tipi non-standard
  const map: Record<string, FieldType> = {
    textarea: "text",
    bool: "boolean",
    int: "number",
    integer: "number",
    float: "number",
    decimal: "number",
    double: "number",
    phone_number: "phone",
    timestamp: "datetime",
    select: "enum",
    radio: "enum",
    checkbox: "boolean",
    enumeration: "enum",
    object: "json",
    array: "json",
    file: "binary",
    blob: "binary",
  };

  return map[type] || "unknown";
}

/**
 * Converte un SchemaGraph del discovery engine in DiscoveryCatalog del protocollo.
 *
 * @param graph       - Il grafo prodotto da buildSchemaGraph() nel discovery engine
 * @param syncOrder   - L'ordine di sync prodotto da topologicalSort()
 * @param cached      - Se il risultato viene da cache
 * @returns DiscoveryCatalog compatibile con UniversalConnector.discover()
 */
export function schemaGraphToCatalog(
  graph: SchemaGraphCompat,
  syncOrder: string[],
  cached: boolean
): DiscoveryCatalog {
  // Converti nodi in DiscoveredEntity
  const entities: DiscoveredEntity[] = graph.nodes.map((node) => ({
    name: node.name,
    label: node.label,
    estimatedCount: node.estimatedRecords,
    category: normalizeCategory(node.category),
    fields: (node.fields ?? []).map(schemaFieldToDiscoveredField),
    writable: true, // Default: i nodi business sono writable
  }));

  // Converti edge in EntityRelationship
  const relationships: EntityRelationship[] = graph.edges.map((edge) => ({
    fromEntity: edge.from,
    toEntity: edge.to,
    type: edge.type,
    label: edge.label,
    apiId: edge.apiId,
  }));

  return {
    connectorType: graph.connectorType,
    entities,
    relationships,
    syncOrder,
    discoveredAt: graph.builtAt,
    cached,
  };
}

/**
 * Normalizza una stringa category dal discovery engine in EntityCategory.
 */
function normalizeCategory(category: string): EntityCategory {
  const VALID: Set<string> = new Set([
    "crm", "sales", "support", "accounting", "documents", "legal", "medical", "custom",
  ]);
  if (VALID.has(category)) return category as EntityCategory;
  return "custom";
}
