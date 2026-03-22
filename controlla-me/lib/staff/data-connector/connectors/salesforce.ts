/**
 * Salesforce CRM Connector — Sync Account, Contact, Opportunity, Lead, Case
 * through the data-connector pipeline.
 *
 * Uses Salesforce REST API v62.0: https://{instance}.salesforce.com/services/data/v62.0/
 *
 * Auth modes:
 *   1. Access Token (demo/testing): SALESFORCE_ACCESS_TOKEN env var
 *   2. OAuth2 PKCE (production): via AuthenticatedBaseConnector + credential vault
 *
 * Salesforce Developer Edition is free (developer.salesforce.com/signup)
 * and provides 15,000 API calls/day.
 *
 * Pagination: Salesforce uses `nextRecordsUrl` for query results exceeding 2000 records.
 * Delta sync: SOQL WHERE LastModifiedDate > {ISO timestamp}.
 */

import { AuthenticatedBaseConnector } from "./authenticated-base";
import {
  parseSalesforceRecord,
  FIELDS_BY_TYPE,
  type SalesforceRecord,
  type SalesforceObjectType,
  type SalesforceQueryResponse,
} from "../parsers/salesforce-parser";
import type {
  ConnectResult,
  FetchResult,
  DataSource,
} from "../types";

// ─── Config ───

/** Salesforce REST API version */
const API_VERSION = "v62.0";

/** Salesforce CRM object types to sync */
const SYNC_TYPES: SalesforceObjectType[] = [
  "Account", "Contact", "Opportunity", "Lead", "Case",
  "Task", "Event", "Campaign", "Product2", "Order", "Quote", "Contract",
];

/** Max items per SOQL query page (Salesforce default is 2000) */
const QUERY_PAGE_SIZE = 2000;

export class SalesforceConnector extends AuthenticatedBaseConnector<SalesforceRecord> {
  private accessToken: string | null = null;
  private instanceUrl: string | null = null;

  constructor(source: DataSource, log: (msg: string) => void = console.log) {
    super(source, log);

    // Check for access token fallback (demo mode)
    this.accessToken = process.env.SALESFORCE_ACCESS_TOKEN ?? null;
    // Instance URL: e.g. https://myorg.my.salesforce.com
    this.instanceUrl = process.env.SALESFORCE_INSTANCE_URL ?? null;
  }

  /** Base API URL for REST calls */
  private get apiBase(): string {
    if (!this.instanceUrl) {
      throw new Error(
        "[SALESFORCE] SALESFORCE_INSTANCE_URL env var is required. " +
        "Set it to your Salesforce org URL (e.g. https://myorg.my.salesforce.com)"
      );
    }
    // Remove trailing slash if present
    const base = this.instanceUrl.replace(/\/+$/, "");
    return `${base}/services/data/${API_VERSION}`;
  }

  // ─── Auth override: access token mode bypasses OAuth2 ───

  /**
   * Override fetchWithRetry to inject access token auth when OAuth2 is not configured.
   * If SALESFORCE_ACCESS_TOKEN is set, it's used as Bearer token.
   * Otherwise, falls through to AuthenticatedBaseConnector's OAuth2 flow.
   */
  protected override async fetchWithRetry(
    url: string,
    options?: RequestInit,
    maxRetries = 3
  ): Promise<Response> {
    if (this.accessToken) {
      // Access token mode: inject Bearer token directly
      const mergedOptions: RequestInit = {
        ...options,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
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
    const authMode = this.accessToken ? "Access Token" : "OAuth2";

    try {
      this.log(`[SALESFORCE] Testing API connection (auth: ${authMode})...`);

      if (!this.instanceUrl) {
        return {
          sourceId,
          ok: false,
          message: "SALESFORCE_INSTANCE_URL env var is not set",
          census: {
            estimatedItems: 0,
            availableFormats: [],
            sampleFields: [],
          },
        };
      }

      if (!this.accessToken) {
        return {
          sourceId,
          ok: false,
          message: "SALESFORCE_ACCESS_TOKEN env var is not set (required for demo mode)",
          census: {
            estimatedItems: 0,
            availableFormats: [],
            sampleFields: [],
          },
        };
      }

      // 1. Test API access with a simple SOQL query (limit 1)
      const testSoql = "SELECT Id FROM Account LIMIT 1";
      const testUrl = `${this.apiBase}/query?q=${encodeURIComponent(testSoql)}`;
      const testResponse = await this.fetchWithRetry(testUrl);

      if (!testResponse.ok) {
        const errorText = await testResponse.text().catch(() => "");
        return {
          sourceId,
          ok: false,
          message: `Salesforce API returned ${testResponse.status}: ${errorText.slice(0, 200)}`,
          census: {
            estimatedItems: 0,
            availableFormats: [],
            sampleFields: [],
          },
        };
      }

      this.log(`[SALESFORCE] API connected | auth mode: ${authMode}`);

      // 2. Census: estimate count per object type
      const census: Record<string, number> = {};
      let totalEstimated = 0;

      for (const type of SYNC_TYPES) {
        const count = await this.estimateCount(type);
        census[type] = count;
        totalEstimated += count;
        this.log(`[SALESFORCE] ${type}: ~${count} records`);
      }

      // 3. Fetch sample data (first 2 accounts)
      const sampleData: SalesforceRecord[] = [];
      try {
        const sampleFields = FIELDS_BY_TYPE.Account.join(", ");
        const sampleSoql = `SELECT ${sampleFields} FROM Account LIMIT 2`;
        const sampleUrl = `${this.apiBase}/query?q=${encodeURIComponent(sampleSoql)}`;
        const sampleResponse = await this.fetchWithRetry(sampleUrl);
        if (sampleResponse.ok) {
          const sampleBody = (await sampleResponse.json()) as SalesforceQueryResponse;
          for (const obj of sampleBody.records) {
            sampleData.push(parseSalesforceRecord(obj, "Account"));
          }
        }
      } catch (err) {
        this.log(`[SALESFORCE] Sample fetch warning: ${err instanceof Error ? err.message : String(err)}`);
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
            "industry",
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
        message: `Salesforce connection failed: ${msg}`,
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
  ): Promise<FetchResult<SalesforceRecord>> {
    this.log(`[SALESFORCE] Full fetch starting...`);
    const allRecords: SalesforceRecord[] = [];
    const globalLimit = options?.limit;

    for (const type of SYNC_TYPES) {
      if (globalLimit && allRecords.length >= globalLimit) break;

      const perTypeLimit = globalLimit
        ? globalLimit - allRecords.length
        : undefined;

      const records = await this.fetchObjectType(type, { limit: perTypeLimit });
      allRecords.push(...records);
      this.log(`[SALESFORCE] ${type}: ${records.length} records fetched`);
    }

    this.log(`[SALESFORCE] Total: ${allRecords.length} records`);

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
  ): Promise<FetchResult<SalesforceRecord>> {
    this.log(`[SALESFORCE] Delta fetch since ${since}...`);
    const allRecords: SalesforceRecord[] = [];
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
      this.log(`[SALESFORCE] ${type} (delta): ${records.length} records`);
    }

    this.log(`[SALESFORCE] Delta total: ${allRecords.length} records`);

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
    type: SalesforceObjectType,
    options?: { limit?: number }
  ): Promise<SalesforceRecord[]> {
    const records: SalesforceRecord[] = [];
    const maxItems = options?.limit ?? Infinity;
    const fields = FIELDS_BY_TYPE[type].join(", ");

    // Build initial SOQL query
    const limitClause = maxItems < QUERY_PAGE_SIZE
      ? ` LIMIT ${maxItems}`
      : "";
    const soql = `SELECT ${fields} FROM ${type}${limitClause}`;
    let url: string | null = `${this.apiBase}/query?q=${encodeURIComponent(soql)}`;

    while (url) {
      if (records.length >= maxItems) break;

      try {
        const response = await this.fetchWithRetry(url);

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          this.log(`[SALESFORCE] Error querying ${type}: HTTP ${response.status} — ${errorText.slice(0, 200)}`);
          break;
        }

        const body = (await response.json()) as SalesforceQueryResponse;

        for (const obj of body.records) {
          if (records.length >= maxItems) break;
          records.push(parseSalesforceRecord(obj, type));
        }

        // Check for next page via nextRecordsUrl
        if (!body.done && body.nextRecordsUrl) {
          // nextRecordsUrl is a relative path, prepend instance URL
          const instanceBase = this.instanceUrl!.replace(/\/+$/, "");
          url = `${instanceBase}${body.nextRecordsUrl}`;
        } else {
          url = null;
        }

        // Rate limit pause between pages
        if (url) {
          await this.rateLimitPause();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`[SALESFORCE] Error fetching ${type} page: ${msg}`);
        break;
      }
    }

    return records;
  }

  // ─── Internal: delta fetch using SOQL WHERE clause ───

  /**
   * Salesforce supports date filtering directly in SOQL:
   * SELECT ... FROM Object WHERE LastModifiedDate > 2026-01-01T00:00:00Z
   */
  private async fetchDeltaByType(
    type: SalesforceObjectType,
    since: string,
    options?: { limit?: number }
  ): Promise<SalesforceRecord[]> {
    const records: SalesforceRecord[] = [];
    const maxItems = options?.limit ?? Infinity;
    const fields = FIELDS_BY_TYPE[type].join(", ");

    // Salesforce expects ISO 8601 format in SOQL: 2026-01-01T00:00:00Z
    const sinceIso = new Date(since).toISOString();

    const limitClause = maxItems < QUERY_PAGE_SIZE
      ? ` LIMIT ${maxItems}`
      : "";
    const soql = `SELECT ${fields} FROM ${type} WHERE LastModifiedDate > ${sinceIso}${limitClause}`;
    let url: string | null = `${this.apiBase}/query?q=${encodeURIComponent(soql)}`;

    while (url) {
      if (records.length >= maxItems) break;

      try {
        const response = await this.fetchWithRetry(url);

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          this.log(`[SALESFORCE] Delta query ${type} error: HTTP ${response.status} — ${errorText.slice(0, 200)}`);
          break;
        }

        const body = (await response.json()) as SalesforceQueryResponse;

        for (const obj of body.records) {
          if (records.length >= maxItems) break;
          records.push(parseSalesforceRecord(obj, type));
        }

        // Next page
        if (!body.done && body.nextRecordsUrl) {
          const instanceBase = this.instanceUrl!.replace(/\/+$/, "");
          url = `${instanceBase}${body.nextRecordsUrl}`;
        } else {
          url = null;
        }

        if (url) {
          await this.rateLimitPause();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`[SALESFORCE] Delta query ${type} error: ${msg}`);
        break;
      }
    }

    return records;
  }

  // ─── Internal: count estimate ───

  /**
   * Estimate object count using SOQL COUNT().
   * Salesforce supports: SELECT COUNT() FROM Object
   */
  private async estimateCount(type: SalesforceObjectType): Promise<number> {
    try {
      const soql = `SELECT COUNT() FROM ${type}`;
      const url = `${this.apiBase}/query?q=${encodeURIComponent(soql)}`;
      const response = await this.fetchWithRetry(url);

      if (!response.ok) return 0;

      const body = (await response.json()) as { totalSize: number };
      return body.totalSize ?? 0;
    } catch {
      return 0;
    }
  }

  // ─── Rate limiting ───

  /**
   * Salesforce rate limits:
   *   - Developer Edition: 15,000 API calls per 24-hour period
   *   - Per-user concurrent request limit: 25
   *   - That's ~10 requests/second sustained average
   *
   * We use 150ms pause (~6.7 req/s) — conservative for demo edition.
   */
  protected override async rateLimitPause(): Promise<void> {
    await this.sleep(150);
  }
}
