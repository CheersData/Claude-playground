/**
 * HubSpot CRM Connector — Sync contacts, companies, deals, tickets
 * through the data-connector pipeline.
 *
 * Uses HubSpot CRM API v3: https://api.hubapi.com/crm/v3/objects/{objectType}
 *
 * Auth modes:
 *   1. API Key (demo/testing): HUBSPOT_API_KEY env var (private app access token)
 *   2. OAuth2 PKCE (production): via AuthenticatedBaseConnector + credential vault
 *
 * HubSpot free developer sandbox provides full CRM API access — ideal for demos.
 *
 * Pagination: cursor-based with `after` parameter + `paging.next.after` in response.
 * Delta sync: uses HubSpot Search API with `lastmodifieddate` filter.
 */

import { AuthenticatedBaseConnector } from "./authenticated-base";
import {
  parseHubSpotObject,
  PROPERTIES_BY_TYPE,
  type HubSpotRecord,
  type HubSpotObjectType,
  type HubSpotListResponse,
  type HubSpotSearchResponse,
} from "../parsers/hubspot-parser";
import type {
  ConnectResult,
  FetchResult,
  DataSource,
} from "../types";

// ─── Config ───

const HUBSPOT_API_BASE = "https://api.hubapi.com";

/** HubSpot CRM object types to sync */
const SYNC_TYPES: HubSpotObjectType[] = ["contact", "company", "deal", "ticket"];

/** Max items per page (HubSpot max is 100 for list, 200 for search) */
const LIST_PAGE_SIZE = 100;
const SEARCH_PAGE_SIZE = 100;

export class HubSpotConnector extends AuthenticatedBaseConnector<HubSpotRecord> {
  private apiKey: string | null = null;

  constructor(source: DataSource, log: (msg: string) => void = console.log) {
    super(source, log);

    // Check for API key fallback (demo mode — private app access token)
    this.apiKey = process.env.HUBSPOT_API_KEY ?? null;
  }

  // ─── Auth override: API key mode bypasses OAuth2 ───

  /**
   * Override fetchWithRetry to inject API key auth when OAuth2 is not configured.
   * If HUBSPOT_API_KEY is set, it's used as Bearer token (private app pattern).
   * Otherwise, falls through to AuthenticatedBaseConnector's OAuth2 flow.
   */
  protected override async fetchWithRetry(
    url: string,
    options?: RequestInit,
    maxRetries = 3
  ): Promise<Response> {
    if (this.apiKey) {
      // API key mode: inject Bearer token directly
      const mergedOptions: RequestInit = {
        ...options,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...Object.fromEntries(
            new Headers(options?.headers ?? {}).entries()
          ),
        },
      };
      return super.fetchWithRetry(url, mergedOptions, maxRetries);
    }

    // OAuth2 mode: let AuthenticatedBaseConnector handle auth headers
    return super.fetchWithRetry(url, options, maxRetries);
  }

  // ─── CONNECT phase ───

  async connect(): Promise<ConnectResult> {
    const sourceId = this.source.id;
    const authMode = this.apiKey ? "API Key" : "OAuth2";

    try {
      this.log(`[HUBSPOT] Testing API connection (auth: ${authMode})...`);

      // 1. Test API access by listing contacts with limit=1
      const testUrl = `${HUBSPOT_API_BASE}/crm/v3/objects/contacts?limit=1`;
      const testResponse = await this.fetchWithRetry(testUrl);

      if (!testResponse.ok) {
        const errorText = await testResponse.text().catch(() => "");
        return {
          sourceId,
          ok: false,
          message: `HubSpot API returned ${testResponse.status}: ${errorText.slice(0, 200)}`,
          census: {
            estimatedItems: 0,
            availableFormats: [],
            sampleFields: [],
          },
        };
      }

      this.log(`[HUBSPOT] API connected | auth mode: ${authMode}`);

      // 2. Census: estimate count per object type
      const census: Record<string, number> = {};
      let totalEstimated = 0;

      for (const type of SYNC_TYPES) {
        const count = await this.estimateCount(type);
        census[type] = count;
        totalEstimated += count;
        this.log(`[HUBSPOT] ${type}: ~${count} records`);
      }

      // 3. Fetch sample data (first 2 contacts)
      const sampleData: HubSpotRecord[] = [];
      try {
        const sampleUrl = this.buildListUrl("contact", { limit: 2 });
        const sampleResponse = await this.fetchWithRetry(sampleUrl);
        if (sampleResponse.ok) {
          const sampleBody = (await sampleResponse.json()) as HubSpotListResponse;
          for (const obj of sampleBody.results) {
            sampleData.push(parseHubSpotObject("contact", obj));
          }
        }
      } catch (err) {
        this.log(`[HUBSPOT] Sample fetch warning: ${err instanceof Error ? err.message : String(err)}`);
      }

      return {
        sourceId,
        ok: true,
        message: `API OK | auth: ${authMode} | ~${totalEstimated} total records`,
        census: {
          estimatedItems: totalEstimated,
          availableFormats: ["json"],
          sampleFields: [
            "externalId",
            "objectType",
            "displayName",
            "email",
            "companyName",
            "stage",
            "amount",
            "createdAt",
            "updatedAt",
          ],
          sampleData: sampleData.length > 0 ? sampleData : undefined,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        sourceId,
        ok: false,
        message: `HubSpot connection failed: ${msg}`,
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
  ): Promise<FetchResult<HubSpotRecord>> {
    this.log(`[HUBSPOT] Full fetch starting...`);
    const allRecords: HubSpotRecord[] = [];
    const globalLimit = options?.limit;

    for (const type of SYNC_TYPES) {
      if (globalLimit && allRecords.length >= globalLimit) break;

      const perTypeLimit = globalLimit
        ? globalLimit - allRecords.length
        : undefined;

      const records = await this.fetchObjectType(type, { limit: perTypeLimit });
      allRecords.push(...records);
      this.log(`[HUBSPOT] ${type}: ${records.length} records fetched`);
    }

    this.log(`[HUBSPOT] Total: ${allRecords.length} records`);

    return {
      sourceId: this.source.id,
      items: allRecords,
      fetchedAt: new Date().toISOString(),
      metadata: {
        syncTypes: SYNC_TYPES,
        counts: Object.fromEntries(
          SYNC_TYPES.map((t) => [
            t,
            allRecords.filter((r) => r.objectType === t).length,
          ])
        ),
      },
    };
  }

  // ─── LOAD phase (delta) ───

  async fetchDelta(
    since: string,
    options?: { limit?: number }
  ): Promise<FetchResult<HubSpotRecord>> {
    this.log(`[HUBSPOT] Delta fetch since ${since}...`);
    const allRecords: HubSpotRecord[] = [];
    const globalLimit = options?.limit;

    for (const type of SYNC_TYPES) {
      if (globalLimit && allRecords.length >= globalLimit) break;

      const perTypeLimit = globalLimit
        ? globalLimit - allRecords.length
        : undefined;

      const records = await this.fetchDeltaByType(type, since, {
        limit: perTypeLimit,
      });
      allRecords.push(...records);
      this.log(`[HUBSPOT] ${type} (delta): ${records.length} records`);
    }

    this.log(`[HUBSPOT] Delta total: ${allRecords.length} records`);

    return {
      sourceId: this.source.id,
      items: allRecords,
      fetchedAt: new Date().toISOString(),
      metadata: {
        since,
        syncTypes: SYNC_TYPES,
      },
    };
  }

  // ─── Internal: full fetch per object type ───

  private async fetchObjectType(
    type: HubSpotObjectType,
    options?: { limit?: number }
  ): Promise<HubSpotRecord[]> {
    const records: HubSpotRecord[] = [];
    let after: string | undefined;
    const maxItems = options?.limit ?? Infinity;

    while (true) {
      if (records.length >= maxItems) break;

      const pageSize = Math.min(LIST_PAGE_SIZE, maxItems - records.length);
      const url = this.buildListUrl(type, { limit: pageSize, after });

      try {
        const response = await this.fetchWithRetry(url);

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          this.log(`[HUBSPOT] Error listing ${type}: HTTP ${response.status} — ${errorText.slice(0, 200)}`);
          break;
        }

        const body = (await response.json()) as HubSpotListResponse;

        for (const obj of body.results) {
          records.push(parseHubSpotObject(type, obj));
        }

        // Check for next page
        if (!body.paging?.next?.after || body.results.length === 0) break;

        after = body.paging.next.after;

        // Rate limit pause between pages
        await this.rateLimitPause();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`[HUBSPOT] Error fetching ${type} page: ${msg}`);
        break;
      }
    }

    return records;
  }

  // ─── Internal: delta fetch using HubSpot Search API ───

  /**
   * HubSpot Search API allows filtering by lastmodifieddate.
   * POST /crm/v3/objects/{type}/search with filter on lastmodifieddate > since.
   */
  private async fetchDeltaByType(
    type: HubSpotObjectType,
    since: string,
    options?: { limit?: number }
  ): Promise<HubSpotRecord[]> {
    const records: HubSpotRecord[] = [];
    let after: string | undefined;
    const maxItems = options?.limit ?? Infinity;
    const properties = PROPERTIES_BY_TYPE[type];

    // Convert ISO date to HubSpot timestamp (milliseconds)
    const sinceMs = new Date(since).getTime();

    while (true) {
      if (records.length >= maxItems) break;

      const pageSize = Math.min(SEARCH_PAGE_SIZE, maxItems - records.length);
      const searchUrl = `${HUBSPOT_API_BASE}/crm/v3/objects/${type}s/search`;

      const searchBody = {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "lastmodifieddate",
                operator: "GTE",
                value: String(sinceMs),
              },
            ],
          },
        ],
        properties,
        limit: pageSize,
        ...(after ? { after } : {}),
      };

      try {
        const response = await this.fetchWithRetry(searchUrl, {
          method: "POST",
          body: JSON.stringify(searchBody),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          this.log(`[HUBSPOT] Search ${type} error: HTTP ${response.status} — ${errorText.slice(0, 200)}`);
          break;
        }

        const body = (await response.json()) as HubSpotSearchResponse;

        for (const obj of body.results) {
          records.push(parseHubSpotObject(type, obj));
        }

        if (!body.paging?.next?.after || body.results.length === 0) break;

        after = body.paging.next.after;
        await this.rateLimitPause();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`[HUBSPOT] Search ${type} error: ${msg}`);
        break;
      }
    }

    return records;
  }

  // ─── Internal: count estimate ───

  /**
   * Estimate object count by listing with limit=1.
   * HubSpot doesn't provide a dedicated count endpoint.
   * If has_more pages, we assume a rough estimate.
   */
  private async estimateCount(type: HubSpotObjectType): Promise<number> {
    try {
      const url = this.buildListUrl(type, { limit: 1 });
      const response = await this.fetchWithRetry(url);

      if (!response.ok) return 0;

      const body = (await response.json()) as HubSpotListResponse;
      const hasMore = !!body.paging?.next?.after;

      if (!hasMore) return body.results.length;

      // Rough estimates for demo purposes
      const estimates: Record<HubSpotObjectType, number> = {
        contact: 100,
        company: 50,
        deal: 30,
        ticket: 20,
      };

      return estimates[type] ?? 50;
    } catch {
      return 0;
    }
  }

  // ─── URL builders ───

  private buildListUrl(
    type: HubSpotObjectType,
    params: { limit?: number; after?: string }
  ): string {
    const properties = PROPERTIES_BY_TYPE[type];
    const searchParams = new URLSearchParams();

    if (params.limit) {
      searchParams.set("limit", String(params.limit));
    }
    if (params.after) {
      searchParams.set("after", params.after);
    }

    // HubSpot API v3 uses plural object names in the URL
    // contacts, companies, deals, tickets
    const pluralType = type === "company" ? "companies" : `${type}s`;

    // Add properties as comma-separated list
    if (properties.length > 0) {
      searchParams.set("properties", properties.join(","));
    }

    return `${HUBSPOT_API_BASE}/crm/v3/objects/${pluralType}?${searchParams.toString()}`;
  }

  // ─── Rate limiting ───

  /**
   * HubSpot rate limits:
   *   - Private apps (API key): 100 requests per 10 seconds
   *   - OAuth apps: 100 requests per 10 seconds
   *   - Search API: 4 requests per second
   *
   * We use 200ms pause (5 req/s) — conservative for both modes.
   */
  protected override async rateLimitPause(): Promise<void> {
    await this.sleep(200);
  }
}
