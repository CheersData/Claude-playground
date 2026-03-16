/**
 * HubSpot CRM Connector — Sync contacts, companies, deals, tickets
 * through the data-connector pipeline.
 *
 * Uses HubSpot CRM API v3: https://api.hubapi.com/crm/v3/objects/{objectType}
 *
 * Auth modes:
 *   1. API Key (demo/testing): HUBSPOT_API_KEY env var (private app access token)
 *   2. OAuth2 (production): via AuthenticatedBaseConnector + credential vault
 *      The OAuth2 flow is handled by:
 *        - /api/integrations/hubspot/authorize (redirects user to HubSpot)
 *        - /api/integrations/hubspot/callback (exchanges code for tokens, stores in vault)
 *      The connector reads tokens from the vault via AuthenticatedBaseConnector.
 *
 * HubSpot free developer sandbox provides full CRM API access — ideal for demos.
 *
 * Pagination: cursor-based with `after` parameter + `paging.next.after` in response.
 * Delta sync: uses HubSpot Search API with `lastmodifieddate` filter.
 *
 * BUGFIX HISTORY (FASE 0A):
 * - BUG 2: Constructor now passes authOptions (vault, userId) to parent
 * - BUG 3: OAuth2 mode now properly uses credential vault via parent class
 * - BUG 4: API key mode uses parent's auth handler (ApiKeyAuthHandler) instead of manual override
 * - BUG 5: Plugin registry factory updated to pass vault/userId options
 * - BUG 6: accessToken option integrated into parent's auth lifecycle
 * - BUG 8: Removed hardcoded rateLimitPause override — uses parent's configurable one
 */

import { AuthenticatedBaseConnector } from "./authenticated-base";
import type { AuthHandlerOptions } from "../auth";
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

/**
 * Options for creating a HubSpotConnector.
 *
 * - accessToken: explicit Bearer token (e.g. from vault via sync route).
 *   When provided, the connector operates in "explicit token" mode.
 * - vault / userId: passed to AuthenticatedBaseConnector for OAuth2 PKCE flow.
 */
export interface HubSpotConnectorOptions {
  accessToken?: string;
  vault?: AuthHandlerOptions["vault"];
  userId?: AuthHandlerOptions["userId"];
}

export class HubSpotConnector extends AuthenticatedBaseConnector<HubSpotRecord> {
  /**
   * Explicit access token for "direct token" mode.
   * When set, fetchWithRetry injects this as Bearer token, bypassing the
   * auth handler. This is used by the sync route which already retrieved
   * the token from the vault.
   *
   * When null, the parent's AuthenticatedBaseConnector handles auth
   * (OAuth2 PKCE via vault, or API key via env var depending on source.auth).
   */
  private explicitToken: string | null = null;

  constructor(
    source: DataSource,
    log: (msg: string) => void = console.log,
    options?: HubSpotConnectorOptions
  ) {
    // BUG 2+3 FIX: Pass vault and userId to parent so OAuth2PKCEHandler can work
    super(source, log, {
      vault: options?.vault ?? null,
      userId: options?.userId ?? null,
    });

    // BUG 4+6 FIX: Only use explicitToken when explicitly provided by caller
    // (e.g. sync route that already retrieved token from vault).
    // For API key mode (HUBSPOT_API_KEY env var), the source.auth config
    // should be set to { type: "api-key", header: "Authorization", envVar: "HUBSPOT_API_KEY", prefix: "Bearer " }
    // and the parent's ApiKeyAuthHandler handles it automatically.
    // We do NOT read HUBSPOT_API_KEY here to avoid dual auth paths.
    this.explicitToken = options?.accessToken ?? null;
  }

  // ─── Auth override: explicit token mode ───

  /**
   * Override fetchWithRetry to inject explicit token when provided.
   * This is ONLY used when the sync route passes an accessToken directly
   * (already retrieved from the vault). In all other cases, the parent's
   * AuthenticatedBaseConnector handles auth (OAuth2 PKCE or API key).
   *
   * BUG 4 FIX: No longer manually reads HUBSPOT_API_KEY — that's handled
   * by the parent's auth handler via source.auth config.
   */
  protected override async fetchWithRetry(
    url: string,
    options?: RequestInit,
    maxRetries = 3
  ): Promise<Response> {
    if (this.explicitToken) {
      // Explicit token mode: inject Bearer token directly
      const mergedOptions: RequestInit = {
        ...options,
        headers: {
          Authorization: `Bearer ${this.explicitToken}`,
          "Content-Type": "application/json",
          ...Object.fromEntries(
            new Headers(options?.headers ?? {}).entries()
          ),
        },
      };
      // Call BaseConnector.fetchWithRetry (skip parent auth handler since we have explicit token)
      return super.fetchWithRetry(url, mergedOptions, maxRetries);
    }

    // Auth handler mode: let AuthenticatedBaseConnector handle auth headers
    // (OAuth2 PKCE via vault, or API key via env var, or none)
    return super.fetchWithRetry(url, options, maxRetries);
  }

  // ─── CONNECT phase ───

  async connect(): Promise<ConnectResult> {
    const sourceId = this.source.id;
    const authMode = this.explicitToken
      ? "Explicit Token"
      : this.authHandler.strategyType === "none"
        ? "None"
        : this.authHandler.strategyType;

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
        // BUG 8 FIX: Uses parent's configurable rateLimitPause (reads source.rateLimit)
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

  // BUG 8 FIX: Removed hardcoded rateLimitPause override.
  // The parent AuthenticatedBaseConnector.rateLimitPause() reads source.rateLimit
  // which is set to { requestsPerSecond: 5 } in integration-sources.ts.
  // This gives 200ms pause (1000/5) — same effective behavior but now configurable.
}
