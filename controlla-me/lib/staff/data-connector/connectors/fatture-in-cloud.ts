/**
 * Fatture in Cloud Connector — Sync invoices and client data from Fatture in Cloud API v2.
 *
 * Fatture in Cloud (TeamSystem) is the #1 invoicing platform for Italian SMEs.
 * RICE score: 216.0 — highest priority connector for the Integration Office.
 *
 * API v2 docs: https://developers.fattureincloud.it/
 * Base URL: https://api-v2.fattureincloud.it
 * Auth: OAuth2 (authorization_code flow)
 * Rate limits: 300 requests/min
 *
 * Endpoints:
 *   GET /c/{company_id}/issued_documents/invoices — fatture emesse
 *   GET /c/{company_id}/received_documents        — fatture ricevute
 *   GET /c/{company_id}/info                      — company info
 *   GET /c/{company_id}/entities/clients           — rubrica clienti
 *
 * Uses AuthenticatedBaseConnector for OAuth2 token injection and auto-refresh.
 * Uses authenticatedFetch() (via fetchWithRetry) for all API calls.
 */

import { AuthenticatedBaseConnector } from "./authenticated-base";
import {
  parseFattureInvoice,
  parseFattureClient,
  type FattureInCloudInvoice,
  type FattureInCloudClient,
  type FattureInCloudCompany,
  type FattureRecord,
} from "../parsers/fatture-parser";
import type {
  ConnectResult,
  FetchResult,
  DataSource,
} from "../types";

// ─── Constants ───

const API_BASE = "https://api-v2.fattureincloud.it";

/** Page size for Fatture in Cloud API (max 100) */
const PAGE_SIZE = 50;

/** Fatture in Cloud entity types we sync */
const SYNC_TYPES = ["issued_invoice", "received_invoice", "client"] as const;
type SyncType = (typeof SYNC_TYPES)[number];

// ─── API response types ───

interface FattureApiListResponse<T> {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  data: T[];
}

interface FattureCompanyInfoResponse {
  data: {
    info: FattureInCloudCompany;
  };
}

export class FattureInCloudConnector extends AuthenticatedBaseConnector<FattureRecord> {
  private companyId: string;

  constructor(source: DataSource, log: (msg: string) => void = console.log) {
    super(source, log, {});

    // companyId is required in the DataSource config
    const cid = source.config.companyId as string | undefined;
    if (!cid) {
      throw new Error(
        `FattureInCloudConnector: "companyId" mancante nella config della source "${source.id}". ` +
          `Aggiungi companyId alla DataSource config.`
      );
    }
    this.companyId = cid;
  }

  // ─── CONNECT phase ───

  /**
   * Test API connection, fetch company info and census of available data.
   */
  async connect(): Promise<ConnectResult> {
    const sourceId = this.source.id;

    try {
      // 1. Test API: fetch company info
      this.log(`[FATTURE] Testing API connection for company ${this.companyId}...`);
      const companyInfo = await this.fetchCompanyInfo(this.companyId);
      this.log(
        `[FATTURE] Connected | company: ${companyInfo.name} | P.IVA: ${companyInfo.vat_number ?? "N/A"}`
      );

      // 2. Census: count items per type
      const census: Record<string, number> = {};
      let totalEstimated = 0;

      // Count issued invoices (page 1 with per_page=1 to get total)
      const issuedCount = await this.countEndpoint(
        `/c/${this.companyId}/issued_documents/invoices`
      );
      census.issued_invoices = issuedCount;
      totalEstimated += issuedCount;
      this.log(`[FATTURE] Fatture emesse: ~${issuedCount} records`);

      await this.rateLimitPause();

      // Count received documents
      const receivedCount = await this.countEndpoint(
        `/c/${this.companyId}/received_documents`
      );
      census.received_documents = receivedCount;
      totalEstimated += receivedCount;
      this.log(`[FATTURE] Fatture ricevute: ~${receivedCount} records`);

      await this.rateLimitPause();

      // Count clients
      const clientCount = await this.countEndpoint(
        `/c/${this.companyId}/entities/clients`
      );
      census.clients = clientCount;
      totalEstimated += clientCount;
      this.log(`[FATTURE] Clienti: ~${clientCount} records`);

      // 3. Fetch sample data (first 2 issued invoices)
      const sampleData: FattureRecord[] = [];
      try {
        const sampleInvoices = await this.fetchIssuedInvoices(this.companyId, {
          perPage: 2,
          page: 1,
        });
        for (const inv of sampleInvoices.slice(0, 2)) {
          sampleData.push(parseFattureInvoice(inv, "issued"));
        }
      } catch (err) {
        this.log(
          `[FATTURE] Sample fetch warning: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      return {
        sourceId,
        ok: true,
        message: `API OK | ${companyInfo.name} | ~${totalEstimated} total records`,
        census: {
          estimatedItems: totalEstimated,
          availableFormats: ["json"],
          sampleFields: [
            "externalId",
            "objectType",
            "invoiceNumber",
            "date",
            "netAmount",
            "grossAmount",
            "vatAmount",
            "companyName",
            "vatNumber",
            "status",
          ],
          sampleData: sampleData.length > 0 ? sampleData : undefined,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        sourceId,
        ok: false,
        message: `Fatture in Cloud connection failed: ${msg}`,
        census: {
          estimatedItems: 0,
          availableFormats: [],
          sampleFields: [],
        },
      };
    }
  }

  // ─── LOAD phase (full) ───

  /**
   * Fetch all data: issued invoices, received invoices, and clients.
   */
  async fetchAll(
    options?: { limit?: number }
  ): Promise<FetchResult<FattureRecord>> {
    this.log(`[FATTURE] Full fetch starting for company ${this.companyId}...`);
    const allRecords: FattureRecord[] = [];
    const globalLimit = options?.limit;

    for (const type of SYNC_TYPES) {
      if (globalLimit && allRecords.length >= globalLimit) break;

      const perTypeLimit = globalLimit
        ? globalLimit - allRecords.length
        : undefined;

      const records = await this.fetchByType(type, { limit: perTypeLimit });
      allRecords.push(...records);
      this.log(`[FATTURE] ${type}: ${records.length} records fetched`);
    }

    this.log(`[FATTURE] Total: ${allRecords.length} records`);

    return {
      sourceId: this.source.id,
      items: allRecords,
      fetchedAt: new Date().toISOString(),
      metadata: {
        companyId: this.companyId,
        syncTypes: [...SYNC_TYPES],
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

  /**
   * Fetch invoices and clients created/updated since a given date.
   * Uses the date_from parameter on Fatture in Cloud endpoints.
   */
  async fetchDelta(
    since: string,
    options?: { limit?: number }
  ): Promise<FetchResult<FattureRecord>> {
    this.log(`[FATTURE] Delta fetch since ${since}...`);
    const allRecords: FattureRecord[] = [];
    const globalLimit = options?.limit;

    // Extract YYYY-MM-DD from ISO date
    const dateFrom = since.slice(0, 10);

    for (const type of SYNC_TYPES) {
      if (globalLimit && allRecords.length >= globalLimit) break;

      const perTypeLimit = globalLimit
        ? globalLimit - allRecords.length
        : undefined;

      const records = await this.fetchByType(type, {
        limit: perTypeLimit,
        dateFrom,
      });
      allRecords.push(...records);
      this.log(`[FATTURE] ${type} (delta): ${records.length} records`);
    }

    this.log(`[FATTURE] Delta total: ${allRecords.length} records`);

    return {
      sourceId: this.source.id,
      items: allRecords,
      fetchedAt: new Date().toISOString(),
      metadata: {
        since,
        dateFrom,
        companyId: this.companyId,
        syncTypes: [...SYNC_TYPES],
      },
    };
  }

  // ─── Public API methods ───

  /**
   * Fetch issued invoices (fatture emesse).
   * Endpoint: GET /c/{company_id}/issued_documents/invoices
   */
  async fetchIssuedInvoices(
    companyId: string,
    params?: {
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      perPage?: number;
    }
  ): Promise<FattureInCloudInvoice[]> {
    const queryParams: Record<string, string> = {
      type: "invoice",
      per_page: String(params?.perPage ?? PAGE_SIZE),
    };
    if (params?.dateFrom) queryParams.date_from = params.dateFrom;
    if (params?.dateTo) queryParams.date_to = params.dateTo;
    if (params?.page) queryParams.page = String(params.page);

    if (params?.page) {
      // Single page fetch
      const response = await this.fetchApiJSON<
        FattureApiListResponse<FattureInCloudInvoice>
      >(`/c/${companyId}/issued_documents/invoices`, queryParams);
      return response.data;
    }

    // Paginated fetch (all pages)
    return this.fetchPaginated<FattureInCloudInvoice>(
      `/c/${companyId}/issued_documents/invoices`,
      queryParams
    );
  }

  /**
   * Fetch received invoices (fatture ricevute).
   * Endpoint: GET /c/{company_id}/received_documents
   */
  async fetchReceivedInvoices(
    companyId: string,
    params?: {
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      perPage?: number;
    }
  ): Promise<FattureInCloudInvoice[]> {
    const queryParams: Record<string, string> = {
      type: "invoice",
      per_page: String(params?.perPage ?? PAGE_SIZE),
    };
    if (params?.dateFrom) queryParams.date_from = params.dateFrom;
    if (params?.dateTo) queryParams.date_to = params.dateTo;
    if (params?.page) queryParams.page = String(params.page);

    if (params?.page) {
      const response = await this.fetchApiJSON<
        FattureApiListResponse<FattureInCloudInvoice>
      >(`/c/${companyId}/received_documents`, queryParams);
      return response.data;
    }

    return this.fetchPaginated<FattureInCloudInvoice>(
      `/c/${companyId}/received_documents`,
      queryParams
    );
  }

  /**
   * Fetch company info.
   * Endpoint: GET /c/{company_id}/info
   */
  async fetchCompanyInfo(companyId: string): Promise<FattureInCloudCompany> {
    const response = await this.fetchApiJSON<FattureCompanyInfoResponse>(
      `/c/${companyId}/info`
    );
    return response.data.info;
  }

  /**
   * Fetch clients list.
   * Endpoint: GET /c/{company_id}/entities/clients
   */
  async fetchClients(
    companyId: string,
    params?: {
      page?: number;
      perPage?: number;
    }
  ): Promise<FattureInCloudClient[]> {
    const queryParams: Record<string, string> = {
      per_page: String(params?.perPage ?? PAGE_SIZE),
    };
    if (params?.page) queryParams.page = String(params.page);

    if (params?.page) {
      const response = await this.fetchApiJSON<
        FattureApiListResponse<FattureInCloudClient>
      >(`/c/${companyId}/entities/clients`, queryParams);
      return response.data;
    }

    return this.fetchPaginated<FattureInCloudClient>(
      `/c/${companyId}/entities/clients`,
      queryParams
    );
  }

  // ─── Internal methods ───

  /**
   * Paginated fetch helper. Handles Fatture API's page-based pagination.
   * Fetches all pages and returns the combined results.
   */
  private async fetchPaginated<T>(
    endpoint: string,
    params: Record<string, string>,
    maxItems?: number
  ): Promise<T[]> {
    const allItems: T[] = [];
    let currentPage = 1;
    let lastPage = 1;

    while (currentPage <= lastPage) {
      if (maxItems && allItems.length >= maxItems) break;

      const pageParams = { ...params, page: String(currentPage) };
      const response = await this.fetchApiJSON<FattureApiListResponse<T>>(
        endpoint,
        pageParams
      );

      allItems.push(...response.data);
      lastPage = response.last_page;
      currentPage++;

      // Rate limit pause between pages
      if (currentPage <= lastPage) {
        await this.rateLimitPause();
      }
    }

    if (maxItems) {
      return allItems.slice(0, maxItems);
    }
    return allItems;
  }

  /**
   * Fetch a JSON endpoint from the Fatture in Cloud API.
   * Uses fetchWithRetry from AuthenticatedBaseConnector (injects auth headers).
   */
  private async fetchApiJSON<R>(
    path: string,
    params?: Record<string, string>
  ): Promise<R> {
    let url = `${API_BASE}${path}`;
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams(params).toString();
      url = `${url}?${qs}`;
    }

    const response = await this.fetchWithRetry(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Fatture in Cloud API HTTP ${response.status} da ${path}: ${text.slice(0, 200)}`
      );
    }

    return response.json() as Promise<R>;
  }

  /**
   * Count items available at an endpoint (by fetching page 1 with per_page=1
   * and reading the `total` field from the paginated response).
   */
  private async countEndpoint(path: string): Promise<number> {
    try {
      const response = await this.fetchApiJSON<FattureApiListResponse<unknown>>(
        path,
        { per_page: "1", page: "1" }
      );
      return response.total ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Fetch records by sync type, applying parser to produce FattureRecord[].
   */
  private async fetchByType(
    type: SyncType,
    options?: { limit?: number; dateFrom?: string }
  ): Promise<FattureRecord[]> {
    switch (type) {
      case "issued_invoice": {
        const invoices = await this.fetchIssuedInvoices(this.companyId, {
          dateFrom: options?.dateFrom,
        });
        const limited = options?.limit
          ? invoices.slice(0, options.limit)
          : invoices;
        return limited.map((inv) => parseFattureInvoice(inv, "issued"));
      }
      case "received_invoice": {
        const invoices = await this.fetchReceivedInvoices(this.companyId, {
          dateFrom: options?.dateFrom,
        });
        const limited = options?.limit
          ? invoices.slice(0, options.limit)
          : invoices;
        return limited.map((inv) => parseFattureInvoice(inv, "received"));
      }
      case "client": {
        const clients = await this.fetchClients(this.companyId);
        const limited = options?.limit
          ? clients.slice(0, options.limit)
          : clients;
        return limited.map(parseFattureClient);
      }
      default:
        return [];
    }
  }
}
