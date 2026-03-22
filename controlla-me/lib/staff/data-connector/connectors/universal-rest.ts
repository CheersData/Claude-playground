/**
 * UniversalRESTConnector — A generic REST API connector that can connect to ANY API.
 *
 * Accepts an OpenAPI spec URL or inline config in `source.config` to dynamically
 * discover entities and endpoints. Supports multiple pagination strategies
 * (cursor, offset, page-based), custom headers, query params, and response path
 * extraction.
 *
 * This connector enables the Integration Office to onboard new API sources
 * without writing a dedicated connector — just provide the API config.
 *
 * Usage (in integration-sources.ts):
 *   {
 *     id: "my_api",
 *     connector: "universal-rest",
 *     config: {
 *       baseUrl: "https://api.example.com/v2",
 *       // Option A: inline entity definitions
 *       entities: [
 *         {
 *           id: "contacts",
 *           endpoint: "/contacts",
 *           responsePath: "data",        // JSON path to array of records
 *           idField: "id",               // field to use as externalId
 *           pagination: { type: "offset", limitParam: "limit", offsetParam: "offset", pageSize: 100 },
 *         },
 *       ],
 *       // Option B: discover entities from OpenAPI spec
 *       openApiSpecUrl: "https://api.example.com/openapi.json",
 *       // Common config
 *       defaultHeaders: { "X-Custom-Header": "value" },
 *       defaultParams: { "format": "json" },
 *     },
 *     auth: { type: "api-key", header: "Authorization", envVar: "MY_API_KEY", prefix: "Bearer " },
 *   }
 *
 * Extends AuthenticatedBaseConnector for auth header injection and auto-refresh.
 */

import { AuthenticatedBaseConnector } from "./authenticated-base";
import type {
  ConnectResult,
  FetchResult,
  DataSource,
} from "../types";

// ─── Entity Configuration ───

export type PaginationType = "cursor" | "offset" | "page" | "none";

export interface PaginationConfig {
  /** Pagination strategy */
  type: PaginationType;
  /** Query param name for page size (e.g. "limit", "per_page", "pageSize") */
  limitParam?: string;
  /** Query param name for offset (offset-based pagination) */
  offsetParam?: string;
  /** Query param name for page number (page-based pagination) */
  pageParam?: string;
  /** Query param name for cursor (cursor-based pagination) */
  cursorParam?: string;
  /** Number of records per page. Default: 100 */
  pageSize?: number;
  /** JSON path to next cursor value in response (e.g. "meta.next_cursor", "paging.next.after") */
  nextCursorPath?: string;
  /** JSON path to "has more" boolean in response (e.g. "has_more", "paging.next") */
  hasMorePath?: string;
  /** JSON path to total count in response (e.g. "meta.total", "total_count") */
  totalPath?: string;
}

export interface EntityConfig {
  /** Entity identifier (e.g. "contacts", "invoices") */
  id: string;
  /** Display name (optional, defaults to id) */
  name?: string;
  /** API endpoint path relative to baseUrl (e.g. "/contacts", "/v2/invoices") */
  endpoint: string;
  /** HTTP method. Default: "GET" */
  method?: "GET" | "POST";
  /** JSON path to the array of records in the response (e.g. "data", "results", "items") */
  responsePath?: string;
  /** Field name to use as the external ID for each record. Default: "id" */
  idField?: string;
  /** Pagination configuration */
  pagination?: PaginationConfig;
  /** Extra query params specific to this entity */
  params?: Record<string, string>;
  /** Extra headers specific to this entity */
  headers?: Record<string, string>;
  /** Filter for delta fetch: query param name for "modified since" (e.g. "updated_after", "since") */
  deltaParam?: string;
  /** Date format for delta param. Default: "iso" (ISO 8601). Also supports "unix" (epoch seconds). */
  deltaFormat?: "iso" | "unix";
}

/** Universal REST connector record shape */
export interface UniversalRESTRecord {
  externalId: string;
  objectType: string;
  source: string;
  data: Record<string, unknown>;
  fetchedAt: string;
}

// ─── Connector ───

export class UniversalRESTConnector extends AuthenticatedBaseConnector<UniversalRESTRecord> {
  private baseUrl: string;
  private entities: EntityConfig[];
  private defaultHeaders: Record<string, string>;
  private defaultParams: Record<string, string>;
  private openApiSpecUrl?: string;
  private discoveredEntities: EntityConfig[] | null = null;

  constructor(source: DataSource, log: (msg: string) => void = console.log) {
    super(source, log, {});

    const config = source.config;

    // Validate required config
    const baseUrl = config.baseUrl as string | undefined;
    if (!baseUrl) {
      throw new Error(
        `UniversalRESTConnector: "baseUrl" mancante nella config della source "${source.id}". ` +
          `Specifica l'URL base dell'API (es. "https://api.example.com/v2").`
      );
    }
    this.baseUrl = baseUrl.replace(/\/+$/, ""); // Remove trailing slashes

    // Parse entities from config (may be empty if using OpenAPI spec discovery)
    this.entities = (config.entities as EntityConfig[]) ?? [];
    this.defaultHeaders = (config.defaultHeaders as Record<string, string>) ?? {};
    this.defaultParams = (config.defaultParams as Record<string, string>) ?? {};
    this.openApiSpecUrl = config.openApiSpecUrl as string | undefined;

    // Validate: need either inline entities or OpenAPI spec
    if (this.entities.length === 0 && !this.openApiSpecUrl) {
      throw new Error(
        `UniversalRESTConnector: Nessuna entita configurata per "${source.id}". ` +
          `Specifica "entities" inline oppure "openApiSpecUrl" per la discovery automatica.`
      );
    }
  }

  // ─── CONNECT phase ───

  async connect(): Promise<ConnectResult> {
    const sourceId = this.source.id;

    try {
      this.log(`[UNIVERSAL-REST] Testing connection to ${this.baseUrl}...`);

      // Discover entities from OpenAPI spec if configured
      if (this.openApiSpecUrl && this.entities.length === 0) {
        this.log(`[UNIVERSAL-REST] Discovering entities from OpenAPI spec: ${this.openApiSpecUrl}`);
        this.discoveredEntities = await this.discoverFromOpenApi(this.openApiSpecUrl);
        this.entities = this.discoveredEntities;
        this.log(`[UNIVERSAL-REST] Discovered ${this.entities.length} entities`);
      }

      // Test connectivity by fetching the first entity with limit=1
      let totalEstimated = 0;
      const sampleFields: string[] = [];
      const sampleData: unknown[] = [];

      if (this.entities.length > 0) {
        const firstEntity = this.entities[0];
        const testResult = await this.fetchEntityPage(firstEntity, { limit: 1 });

        if (testResult.items.length > 0) {
          const sample = testResult.items[0] as Record<string, unknown>;
          sampleFields.push(...Object.keys(sample).slice(0, 10));
          sampleData.push(sample);
        }

        totalEstimated = testResult.total ?? this.entities.length * 100;
        this.log(`[UNIVERSAL-REST] Connection OK | First entity "${firstEntity.id}": ${testResult.items.length} sample items`);
      }

      // Census: estimate items per entity
      for (const entity of this.entities) {
        try {
          const countResult = await this.fetchEntityPage(entity, { limit: 1 });
          const entityTotal = countResult.total ?? 0;
          totalEstimated = Math.max(totalEstimated, entityTotal);
          this.log(`[UNIVERSAL-REST] ${entity.id}: ~${entityTotal} records`);
        } catch (err) {
          this.log(
            `[UNIVERSAL-REST] ${entity.id}: census failed — ${err instanceof Error ? err.message : String(err)}`
          );
        }
        await this.rateLimitPause();
      }

      return {
        sourceId,
        ok: true,
        message: `API OK | ${this.baseUrl} | ${this.entities.length} entities | ~${totalEstimated} total records`,
        census: {
          estimatedItems: totalEstimated,
          availableFormats: ["json"],
          sampleFields,
          sampleData: sampleData.length > 0 ? sampleData : undefined,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        sourceId,
        ok: false,
        message: `Universal REST connection failed: ${msg}`,
        census: {
          estimatedItems: 0,
          availableFormats: [],
          sampleFields: [],
        },
      };
    }
  }

  // ─── LOAD phase (full) ───

  async fetchAll(
    options?: { limit?: number }
  ): Promise<FetchResult<UniversalRESTRecord>> {
    this.log(`[UNIVERSAL-REST] Full fetch from ${this.baseUrl}...`);

    const allRecords: UniversalRESTRecord[] = [];
    const globalLimit = options?.limit;

    for (const entity of this.getEffectiveEntities()) {
      if (globalLimit && allRecords.length >= globalLimit) break;

      const perEntityLimit = globalLimit
        ? globalLimit - allRecords.length
        : undefined;

      try {
        const records = await this.fetchEntityAll(entity, perEntityLimit);
        allRecords.push(...records);
        this.log(`[UNIVERSAL-REST] ${entity.id}: ${records.length} records fetched`);
      } catch (err) {
        this.log(
          `[UNIVERSAL-REST] ${entity.id}: fetch failed — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    this.log(`[UNIVERSAL-REST] Total: ${allRecords.length} records`);

    return {
      sourceId: this.source.id,
      items: allRecords,
      fetchedAt: new Date().toISOString(),
      metadata: {
        baseUrl: this.baseUrl,
        entities: this.getEffectiveEntities().map((e) => e.id),
        counts: Object.fromEntries(
          this.getEffectiveEntities().map((e) => [
            e.id,
            allRecords.filter((r) => r.objectType === e.id).length,
          ])
        ),
      },
    };
  }

  // ─── LOAD phase (delta) ───

  async fetchDelta(
    since: string,
    options?: { limit?: number }
  ): Promise<FetchResult<UniversalRESTRecord>> {
    this.log(`[UNIVERSAL-REST] Delta fetch since ${since}...`);

    const allRecords: UniversalRESTRecord[] = [];
    const globalLimit = options?.limit;

    for (const entity of this.getEffectiveEntities()) {
      if (globalLimit && allRecords.length >= globalLimit) break;

      // Skip entities without delta support
      if (!entity.deltaParam) {
        this.log(`[UNIVERSAL-REST] ${entity.id}: no deltaParam configured, skipping delta`);
        continue;
      }

      const perEntityLimit = globalLimit
        ? globalLimit - allRecords.length
        : undefined;

      try {
        const deltaValue = entity.deltaFormat === "unix"
          ? String(Math.floor(new Date(since).getTime() / 1000))
          : since;

        const records = await this.fetchEntityAll(entity, perEntityLimit, {
          [entity.deltaParam]: deltaValue,
        });
        allRecords.push(...records);
        this.log(`[UNIVERSAL-REST] ${entity.id} (delta): ${records.length} records`);
      } catch (err) {
        this.log(
          `[UNIVERSAL-REST] ${entity.id}: delta fetch failed — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    this.log(`[UNIVERSAL-REST] Delta total: ${allRecords.length} records`);

    return {
      sourceId: this.source.id,
      items: allRecords,
      fetchedAt: new Date().toISOString(),
      metadata: {
        since,
        baseUrl: this.baseUrl,
        entities: this.getEffectiveEntities().map((e) => e.id),
      },
    };
  }

  // ─── Entity Discovery from OpenAPI Spec ───

  /**
   * Discovers entities from an OpenAPI spec by parsing GET endpoints
   * that return list/collection responses (arrays or paginated results).
   */
  private async discoverFromOpenApi(specUrl: string): Promise<EntityConfig[]> {
    const response = await this.fetchWithRetry(specUrl, {
      headers: {
        Accept: "application/json",
        ...this.defaultHeaders,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec from ${specUrl}: HTTP ${response.status}`);
    }

    const spec = (await response.json()) as Record<string, unknown>;
    const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;

    if (!paths) {
      throw new Error(`OpenAPI spec at ${specUrl} has no "paths" property`);
    }

    const entities: EntityConfig[] = [];

    for (const [path, methods] of Object.entries(paths)) {
      // Only discover GET endpoints that look like list endpoints
      const getOp = methods.get as Record<string, unknown> | undefined;
      if (!getOp) continue;

      // Skip paths with path parameters that suggest detail endpoints (e.g. /contacts/{id})
      if (/\{[^}]+\}/.test(path)) continue;

      // Extract entity name from path (e.g. "/contacts" -> "contacts", "/api/v2/invoices" -> "invoices")
      const pathParts = path.split("/").filter(Boolean);
      const entityId = pathParts[pathParts.length - 1];

      if (!entityId) continue;

      // Detect response structure from OpenAPI schema
      const responses = getOp.responses as Record<string, Record<string, unknown>> | undefined;
      const okResponse = responses?.["200"] ?? responses?.["201"];
      let responsePath: string | undefined;

      if (okResponse) {
        const content = okResponse.content as Record<string, Record<string, unknown>> | undefined;
        const jsonSchema = content?.["application/json"]?.schema as Record<string, unknown> | undefined;

        if (jsonSchema) {
          // If schema has a property that's an array, use that as responsePath
          const properties = jsonSchema.properties as Record<string, Record<string, unknown>> | undefined;
          if (properties) {
            for (const [propName, propDef] of Object.entries(properties)) {
              if (propDef.type === "array") {
                responsePath = propName;
                break;
              }
            }
          }
        }
      }

      // Detect pagination from query parameters
      const parameters = (getOp.parameters as Array<Record<string, unknown>>) ?? [];
      let paginationConfig: PaginationConfig | undefined;

      const paramNames = parameters.map((p) => (p.name as string) ?? "");

      if (paramNames.includes("cursor") || paramNames.includes("after")) {
        paginationConfig = {
          type: "cursor",
          cursorParam: paramNames.includes("cursor") ? "cursor" : "after",
          limitParam: paramNames.includes("limit") ? "limit" : paramNames.includes("per_page") ? "per_page" : undefined,
          pageSize: 100,
        };
      } else if (paramNames.includes("offset")) {
        paginationConfig = {
          type: "offset",
          offsetParam: "offset",
          limitParam: paramNames.includes("limit") ? "limit" : "per_page",
          pageSize: 100,
        };
      } else if (paramNames.includes("page")) {
        paginationConfig = {
          type: "page",
          pageParam: "page",
          limitParam: paramNames.includes("per_page") ? "per_page" : paramNames.includes("limit") ? "limit" : undefined,
          pageSize: 100,
        };
      }

      // Detect delta param
      const deltaParamNames = ["updated_after", "modified_since", "since", "updated_since", "modifiedAt"];
      const deltaParam = paramNames.find((n) => deltaParamNames.includes(n));

      entities.push({
        id: entityId,
        name: (getOp.summary as string) ?? entityId,
        endpoint: path,
        method: "GET",
        responsePath,
        idField: "id",
        pagination: paginationConfig ?? { type: "none" },
        deltaParam,
      });
    }

    return entities;
  }

  // ─── Internal: Fetch Helpers ───

  private getEffectiveEntities(): EntityConfig[] {
    return this.discoveredEntities ?? this.entities;
  }

  /**
   * Fetch all records for a single entity, handling pagination.
   */
  private async fetchEntityAll(
    entity: EntityConfig,
    limit?: number,
    extraParams?: Record<string, string>
  ): Promise<UniversalRESTRecord[]> {
    const allRecords: UniversalRESTRecord[] = [];
    const maxItems = limit ?? Infinity;
    const pagination = entity.pagination ?? { type: "none" };
    const pageSize = pagination.pageSize ?? 100;

    switch (pagination.type) {
      case "none": {
        const result = await this.fetchEntityPage(entity, {
          limit: Math.min(pageSize, maxItems),
          extraParams,
        });
        return this.toRecords(result.items, entity);
      }

      case "offset": {
        let offset = 0;
        while (allRecords.length < maxItems) {
          const batchSize = Math.min(pageSize, maxItems - allRecords.length);
          const params: Record<string, string> = {
            ...extraParams,
          };
          if (pagination.limitParam) params[pagination.limitParam] = String(batchSize);
          if (pagination.offsetParam) params[pagination.offsetParam] = String(offset);

          const result = await this.fetchEntityPage(entity, { extraParams: params });
          const records = this.toRecords(result.items, entity);
          allRecords.push(...records);

          if (result.items.length < batchSize || result.items.length === 0) break;
          offset += result.items.length;
          await this.rateLimitPause();
        }
        return allRecords.slice(0, maxItems);
      }

      case "page": {
        let page = 1;
        while (allRecords.length < maxItems) {
          const batchSize = Math.min(pageSize, maxItems - allRecords.length);
          const params: Record<string, string> = {
            ...extraParams,
          };
          if (pagination.pageParam) params[pagination.pageParam] = String(page);
          if (pagination.limitParam) params[pagination.limitParam] = String(batchSize);

          const result = await this.fetchEntityPage(entity, { extraParams: params });
          const records = this.toRecords(result.items, entity);
          allRecords.push(...records);

          // Check has_more or if we got fewer items than requested
          const hasMore = result.hasMore ?? (result.items.length >= batchSize);
          if (!hasMore || result.items.length === 0) break;
          page++;
          await this.rateLimitPause();
        }
        return allRecords.slice(0, maxItems);
      }

      case "cursor": {
        let cursor: string | undefined;
        while (allRecords.length < maxItems) {
          const batchSize = Math.min(pageSize, maxItems - allRecords.length);
          const params: Record<string, string> = {
            ...extraParams,
          };
          if (pagination.limitParam) params[pagination.limitParam] = String(batchSize);
          if (cursor && pagination.cursorParam) params[pagination.cursorParam] = cursor;

          const result = await this.fetchEntityPage(entity, { extraParams: params });
          const records = this.toRecords(result.items, entity);
          allRecords.push(...records);

          // Get next cursor
          cursor = result.nextCursor;
          const hasMore = result.hasMore ?? !!cursor;
          if (!hasMore || result.items.length === 0) break;
          await this.rateLimitPause();
        }
        return allRecords.slice(0, maxItems);
      }

      default:
        throw new Error(`Unknown pagination type: ${pagination.type}`);
    }
  }

  /**
   * Fetch a single page of records from an entity endpoint.
   */
  private async fetchEntityPage(
    entity: EntityConfig,
    options?: {
      limit?: number;
      extraParams?: Record<string, string>;
    }
  ): Promise<{
    items: Record<string, unknown>[];
    total?: number;
    nextCursor?: string;
    hasMore?: boolean;
  }> {
    const pagination = entity.pagination ?? { type: "none" };

    // Build URL
    const endpoint = entity.endpoint.startsWith("/")
      ? entity.endpoint
      : `/${entity.endpoint}`;

    // Build query params
    const params: Record<string, string> = {
      ...this.defaultParams,
      ...(entity.params ?? {}),
      ...(options?.extraParams ?? {}),
    };

    // Add limit param if configured and not already set
    if (options?.limit && pagination.limitParam && !params[pagination.limitParam]) {
      params[pagination.limitParam] = String(options.limit);
    }

    const queryString = Object.keys(params).length > 0
      ? "?" + new URLSearchParams(params).toString()
      : "";

    const url = `${this.baseUrl}${endpoint}${queryString}`;

    // Build headers
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...this.defaultHeaders,
      ...(entity.headers ?? {}),
    };

    // Fetch
    const response = await this.fetchWithRetry(url, {
      method: entity.method ?? "GET",
      headers,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status} from ${url}: ${text.slice(0, 300)}`
      );
    }

    const body = await response.json() as unknown;

    // Extract items from response using responsePath
    let items: Record<string, unknown>[];
    let total: number | undefined;
    let nextCursor: string | undefined;
    let hasMore: boolean | undefined;

    if (entity.responsePath) {
      items = this.getNestedValue(body, entity.responsePath) as Record<string, unknown>[] ?? [];
    } else if (Array.isArray(body)) {
      items = body as Record<string, unknown>[];
    } else if (typeof body === "object" && body !== null) {
      // Try common response patterns
      const obj = body as Record<string, unknown>;
      if (Array.isArray(obj.data)) {
        items = obj.data as Record<string, unknown>[];
      } else if (Array.isArray(obj.results)) {
        items = obj.results as Record<string, unknown>[];
      } else if (Array.isArray(obj.items)) {
        items = obj.items as Record<string, unknown>[];
      } else if (Array.isArray(obj.records)) {
        items = obj.records as Record<string, unknown>[];
      } else {
        items = [obj];
      }
    } else {
      items = [];
    }

    // Extract total count
    if (pagination.totalPath && typeof body === "object" && body !== null) {
      const totalVal = this.getNestedValue(body, pagination.totalPath);
      if (typeof totalVal === "number") total = totalVal;
    } else if (typeof body === "object" && body !== null) {
      const obj = body as Record<string, unknown>;
      if (typeof obj.total === "number") total = obj.total;
      else if (typeof obj.total_count === "number") total = obj.total_count;
      else if (typeof obj.count === "number") total = obj.count;
    }

    // Extract next cursor
    if (pagination.nextCursorPath && typeof body === "object" && body !== null) {
      const cursorVal = this.getNestedValue(body, pagination.nextCursorPath);
      if (typeof cursorVal === "string") nextCursor = cursorVal;
    }

    // Extract has_more
    if (pagination.hasMorePath && typeof body === "object" && body !== null) {
      const hasMoreVal = this.getNestedValue(body, pagination.hasMorePath);
      if (typeof hasMoreVal === "boolean") hasMore = hasMoreVal;
      else if (hasMoreVal !== null && hasMoreVal !== undefined) hasMore = !!hasMoreVal;
    } else if (typeof body === "object" && body !== null) {
      const obj = body as Record<string, unknown>;
      if (typeof obj.has_more === "boolean") hasMore = obj.has_more;
      else if (typeof obj.hasMore === "boolean") hasMore = obj.hasMore;
    }

    return { items, total, nextCursor, hasMore };
  }

  /**
   * Convert raw API records to UniversalRESTRecord format.
   */
  private toRecords(
    items: Record<string, unknown>[],
    entity: EntityConfig
  ): UniversalRESTRecord[] {
    const idField = entity.idField ?? "id";
    const now = new Date().toISOString();

    return items.map((item) => ({
      externalId: String(item[idField] ?? item.id ?? `${entity.id}-${Math.random().toString(36).slice(2, 10)}`),
      objectType: entity.id,
      source: this.source.id,
      data: item,
      fetchedAt: now,
    }));
  }

  /**
   * Navigate a dot-separated path in an object (e.g. "meta.next_cursor" -> obj.meta.next_cursor).
   */
  private getNestedValue(obj: unknown, path: string): unknown {
    let current: unknown = obj;
    for (const key of path.split(".")) {
      if (current === null || current === undefined || typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }
}
