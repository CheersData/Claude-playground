/**
 * Google Drive Connector — Sync file metadata, folder structure, and document content
 * through the data-connector pipeline.
 *
 * Uses Google Drive API v3 with REST calls (no SDK dependency).
 *
 * Auth modes (in order of preference):
 *   1. GOOGLE_API_KEY env var — simplest, read-only, demo-friendly
 *   2. GOOGLE_SERVICE_ACCOUNT_KEY env var — JSON key file content, server-to-server
 *   3. OAuth2 PKCE — user-facing, via AuthenticatedBaseConnector
 *
 * Delta sync: uses `modifiedTime > '{timestamp}'` in the Drive `q` parameter.
 * Pagination: Google uses `pageToken` + `nextPageToken`.
 *
 * NOTE: The generic plugin-registry types support this connector via
 * registerGenericConnector<DriveRecord>().
 */

import { BaseConnector } from "./base";
import {
  parseDriveFile,
  isExportableAsText,
  getExportMimeType,
  type DriveRecord,
  type DriveListResponse,
  type DriveFileRaw,
} from "../parsers/google-drive-parser";
import type { ConnectResult, FetchResult, DataSource } from "../types";

// ─── Constants ───

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";

/** Fields to request from Drive API (minimize payload) */
const FILE_FIELDS = [
  "id",
  "name",
  "mimeType",
  "size",
  "createdTime",
  "modifiedTime",
  "parents",
  "owners(displayName,emailAddress)",
  "shared",
  "webViewLink",
  "iconLink",
  "trashed",
  "starred",
  "description",
  "fileExtension",
  "originalFilename",
  "md5Checksum",
  "lastModifyingUser(displayName,emailAddress)",
].join(",");

const LIST_FIELDS = `nextPageToken,incompleteSearch,files(${FILE_FIELDS})`;

/** Max items per list() call (Drive API max is 1000, use 100 for safety) */
const PAGE_SIZE = 100;

/** Max text content export size (1 MB — skip huge docs) */
const MAX_EXPORT_SIZE = 1_048_576;

// ─── Auth helpers ───

/**
 * Resolve the auth token or API key for Drive API requests.
 *
 * Priority:
 * 1. GOOGLE_API_KEY → appended as ?key= param (no auth header)
 * 2. GOOGLE_SERVICE_ACCOUNT_KEY → generate JWT → exchange for access_token
 * 3. Returns null → caller should use AuthenticatedBaseConnector OAuth2 flow
 */
interface AuthResult {
  mode: "api-key" | "service-account" | "oauth2" | "none";
  apiKey?: string;
  accessToken?: string;
}

async function resolveAuth(
  log: (msg: string) => void
): Promise<AuthResult> {
  // Mode 1: API Key (simplest — demo-friendly, read-only public files)
  const apiKey = process.env.GOOGLE_API_KEY;
  if (apiKey) {
    log("[GDRIVE] Auth mode: API Key");
    return { mode: "api-key", apiKey };
  }

  // Mode 2: Service Account JSON key
  const saKeyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (saKeyJson) {
    log("[GDRIVE] Auth mode: Service Account");
    try {
      const accessToken = await getServiceAccountToken(saKeyJson);
      return { mode: "service-account", accessToken };
    } catch (err) {
      log(
        `[GDRIVE] Service account auth failed: ${err instanceof Error ? err.message : String(err)}`
      );
      // Fall through to none
    }
  }

  // Mode 3: OAuth2 handled externally by AuthenticatedBaseConnector
  // If we get here, caller needs to provide auth headers via the base class
  return { mode: "none" };
}

/**
 * Generate a JWT and exchange it for a Google access token using a service account.
 * This avoids importing the full Google Auth SDK.
 */
async function getServiceAccountToken(saKeyJson: string): Promise<string> {
  const saKey = JSON.parse(saKeyJson) as {
    client_email: string;
    private_key: string;
    token_uri: string;
  };

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: saKey.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: saKey.token_uri,
    exp: now + 3600,
    iat: now,
  };

  // Build JWT: base64url(header).base64url(payload)
  const b64Header = base64UrlEncode(JSON.stringify(header));
  const b64Payload = base64UrlEncode(JSON.stringify(payload));
  const unsignedJwt = `${b64Header}.${b64Payload}`;

  // Sign with RSA-SHA256 using Node.js crypto
  const crypto = await import("crypto");
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  const signature = signer.sign(saKey.private_key, "base64url");

  const jwt = `${unsignedJwt}.${signature}`;

  // Exchange JWT for access token
  const tokenUrl = saKey.token_uri || "https://oauth2.googleapis.com/token";
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Token exchange failed: HTTP ${response.status} — ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ─── Connector ───

export class GoogleDriveConnector extends BaseConnector<DriveRecord> {
  private auth: AuthResult | null = null;

  constructor(source: DataSource, log: (msg: string) => void = console.log) {
    super(source, log);
  }

  /** Get or initialize auth */
  private async getAuth(): Promise<AuthResult> {
    if (!this.auth) {
      this.auth = await resolveAuth(this.log);
    }
    return this.auth;
  }

  /**
   * Build the URL for a Drive API call, appending API key if using that auth mode.
   */
  private async buildUrl(
    path: string,
    params: Record<string, string> = {}
  ): Promise<string> {
    const auth = await this.getAuth();
    const url = new URL(`${DRIVE_API_BASE}${path}`);

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    if (auth.mode === "api-key" && auth.apiKey) {
      url.searchParams.set("key", auth.apiKey);
    }

    return url.toString();
  }

  /**
   * Build request options with auth headers.
   */
  private async buildRequestOptions(): Promise<RequestInit> {
    const auth = await this.getAuth();
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (auth.mode === "service-account" && auth.accessToken) {
      headers["Authorization"] = `Bearer ${auth.accessToken}`;
    }
    // api-key mode: no auth header needed (key is in URL)
    // oauth2 mode: auth headers injected by AuthenticatedBaseConnector

    return { headers };
  }

  /**
   * CONNECT phase: test API access and census available files.
   */
  async connect(): Promise<ConnectResult> {
    const sourceId = this.source.id;

    try {
      const auth = await this.getAuth();

      if (auth.mode === "none") {
        return {
          sourceId,
          ok: false,
          message:
            "No Google auth configured. Set GOOGLE_API_KEY or GOOGLE_SERVICE_ACCOUNT_KEY env var.",
          census: {
            estimatedItems: 0,
            availableFormats: [],
            sampleFields: [],
          },
        };
      }

      this.log(`[GDRIVE] Testing API connection (${auth.mode})...`);

      // 1. Test by listing first page (1 file) from "about" endpoint
      const aboutUrl = await this.buildUrl("/about", {
        fields: "user(displayName,emailAddress),storageQuota(limit,usage)",
      });
      const aboutOpts = await this.buildRequestOptions();

      const aboutResponse = await this.fetchWithRetry(aboutUrl, aboutOpts);
      if (!aboutResponse.ok) {
        const text = await aboutResponse.text().catch(() => "");
        return {
          sourceId,
          ok: false,
          message: `Drive API error: HTTP ${aboutResponse.status} — ${text.slice(0, 200)}`,
          census: { estimatedItems: 0, availableFormats: [], sampleFields: [] },
        };
      }

      const aboutData = (await aboutResponse.json()) as {
        user?: { displayName?: string; emailAddress?: string };
        storageQuota?: { limit?: string; usage?: string };
      };

      const userEmail = aboutData.user?.emailAddress ?? "unknown";
      this.log(`[GDRIVE] Connected | user: ${userEmail}`);

      // 2. Census: count files by listing first page
      const listUrl = await this.buildUrl("/files", {
        pageSize: "1",
        fields: "nextPageToken,files(id)",
        q: "trashed = false",
      });
      const listOpts = await this.buildRequestOptions();
      const listResponse = await this.fetchWithRetry(listUrl, listOpts);

      let estimatedItems = 0;
      if (listResponse.ok) {
        const listData = (await listResponse.json()) as DriveListResponse;
        // Rough estimate: if has nextPageToken, assume many files
        estimatedItems = listData.nextPageToken
          ? 1000
          : listData.files?.length ?? 0;
      }

      this.log(`[GDRIVE] Estimated files: ~${estimatedItems}`);

      // 3. Fetch sample data (first 3 files with full metadata)
      const sampleRecords: DriveRecord[] = [];
      try {
        const sampleUrl = await this.buildUrl("/files", {
          pageSize: "3",
          fields: LIST_FIELDS,
          q: "trashed = false",
          orderBy: "modifiedTime desc",
        });
        const sampleOpts = await this.buildRequestOptions();
        const sampleResponse = await this.fetchWithRetry(sampleUrl, sampleOpts);

        if (sampleResponse.ok) {
          const sampleData = (await sampleResponse.json()) as DriveListResponse;
          for (const file of sampleData.files ?? []) {
            sampleRecords.push(parseDriveFile(file));
          }
        }
      } catch (err) {
        this.log(
          `[GDRIVE] Sample fetch warning: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      return {
        sourceId,
        ok: true,
        message: `API OK | ${auth.mode} mode | user: ${userEmail} | ~${estimatedItems} files`,
        census: {
          estimatedItems,
          availableFormats: ["json"],
          sampleFields: [
            "externalId",
            "objectType",
            "name",
            "mimeType",
            "sizeBytes",
            "createdAt",
            "modifiedAt",
            "parents",
            "ownerName",
            "ownerEmail",
            "shared",
            "webViewLink",
          ],
          sampleData: sampleRecords.length > 0 ? sampleRecords : undefined,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        sourceId,
        ok: false,
        message: `Google Drive connection failed: ${msg}`,
        census: {
          estimatedItems: 0,
          availableFormats: [],
          sampleFields: [],
        },
      };
    }
  }

  /**
   * LOAD phase (full): fetch all Drive files with pagination.
   */
  async fetchAll(
    options?: { limit?: number }
  ): Promise<FetchResult<DriveRecord>> {
    this.log("[GDRIVE] Full fetch starting...");
    const allRecords: DriveRecord[] = [];
    const globalLimit = options?.limit ?? Infinity;
    const exportText = this.source.config.exportTextContent !== false;

    let pageToken: string | undefined;

    while (true) {
      if (allRecords.length >= globalLimit) break;

      const pageSize = Math.min(PAGE_SIZE, globalLimit - allRecords.length);
      const params: Record<string, string> = {
        pageSize: String(pageSize),
        fields: LIST_FIELDS,
        q: "trashed = false",
        orderBy: "modifiedTime desc",
      };
      if (pageToken) {
        params.pageToken = pageToken;
      }

      const url = await this.buildUrl("/files", params);
      const opts = await this.buildRequestOptions();

      try {
        const response = await this.fetchWithRetry(url, opts);
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          this.log(`[GDRIVE] List error: HTTP ${response.status} — ${text.slice(0, 200)}`);
          break;
        }

        const data = (await response.json()) as DriveListResponse;
        const files = data.files ?? [];

        for (const file of files) {
          if (allRecords.length >= globalLimit) break;

          // Optionally export text content for Google Docs/Sheets/Slides
          let textContent: string | null = null;
          if (exportText && isExportableAsText(file.mimeType)) {
            textContent = await this.exportFileContent(file);
          }

          allRecords.push(parseDriveFile(file, textContent));
        }

        this.log(`[GDRIVE] Page fetched: ${files.length} files (total: ${allRecords.length})`);

        if (!data.nextPageToken || files.length === 0) break;
        pageToken = data.nextPageToken;

        // Rate limit pause between pages
        await this.rateLimitPause();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`[GDRIVE] Fetch error: ${msg}`);
        break;
      }
    }

    this.log(`[GDRIVE] Total: ${allRecords.length} records`);

    return {
      sourceId: this.source.id,
      items: allRecords,
      fetchedAt: new Date().toISOString(),
      metadata: {
        authMode: this.auth?.mode ?? "unknown",
        exportedTextContent: this.source.config.exportTextContent !== false,
        typeCounts: countByType(allRecords),
      },
    };
  }

  /**
   * LOAD phase (delta): fetch files modified after a given date.
   * Uses the `modifiedTime > '{timestamp}'` query filter.
   */
  async fetchDelta(
    since: string,
    options?: { limit?: number }
  ): Promise<FetchResult<DriveRecord>> {
    this.log(`[GDRIVE] Delta fetch since ${since}...`);
    const allRecords: DriveRecord[] = [];
    const globalLimit = options?.limit ?? Infinity;
    const exportText = this.source.config.exportTextContent !== false;

    // Format for Drive API: RFC 3339 timestamp
    const sinceRfc = new Date(since).toISOString();

    let pageToken: string | undefined;

    while (true) {
      if (allRecords.length >= globalLimit) break;

      const pageSize = Math.min(PAGE_SIZE, globalLimit - allRecords.length);
      const params: Record<string, string> = {
        pageSize: String(pageSize),
        fields: LIST_FIELDS,
        q: `trashed = false and modifiedTime > '${sinceRfc}'`,
        orderBy: "modifiedTime desc",
      };
      if (pageToken) {
        params.pageToken = pageToken;
      }

      const url = await this.buildUrl("/files", params);
      const opts = await this.buildRequestOptions();

      try {
        const response = await this.fetchWithRetry(url, opts);
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          this.log(`[GDRIVE] Delta list error: HTTP ${response.status} — ${text.slice(0, 200)}`);
          break;
        }

        const data = (await response.json()) as DriveListResponse;
        const files = data.files ?? [];

        for (const file of files) {
          if (allRecords.length >= globalLimit) break;

          let textContent: string | null = null;
          if (exportText && isExportableAsText(file.mimeType)) {
            textContent = await this.exportFileContent(file);
          }

          allRecords.push(parseDriveFile(file, textContent));
        }

        this.log(`[GDRIVE] Delta page: ${files.length} files (total: ${allRecords.length})`);

        if (!data.nextPageToken || files.length === 0) break;
        pageToken = data.nextPageToken;

        await this.rateLimitPause();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`[GDRIVE] Delta fetch error: ${msg}`);
        break;
      }
    }

    this.log(`[GDRIVE] Delta total: ${allRecords.length} records`);

    return {
      sourceId: this.source.id,
      items: allRecords,
      fetchedAt: new Date().toISOString(),
      metadata: {
        since,
        sinceRfc,
        authMode: this.auth?.mode ?? "unknown",
        typeCounts: countByType(allRecords),
      },
    };
  }

  // ─── Internal methods ───

  /**
   * Export text content from a Google Workspace file (Docs, Sheets, Slides).
   * Returns null if export fails or content is too large.
   */
  private async exportFileContent(file: DriveFileRaw): Promise<string | null> {
    const exportMime = getExportMimeType(file.mimeType);
    if (!exportMime) return null;

    try {
      const url = await this.buildUrl(`/files/${file.id}/export`, {
        mimeType: exportMime,
      });
      const opts = await this.buildRequestOptions();

      const response = await this.fetchWithRetry(url, opts, 1); // only 1 retry for exports
      if (!response.ok) {
        // Export failures are non-fatal — skip content
        return null;
      }

      // Check content length before reading
      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > MAX_EXPORT_SIZE) {
        this.log(`[GDRIVE] Skipping export for "${file.name}" — too large (${contentLength} bytes)`);
        return null;
      }

      const text = await response.text();

      // Truncate if exceeds max
      if (text.length > MAX_EXPORT_SIZE) {
        return text.slice(0, MAX_EXPORT_SIZE) + "\n[TRUNCATED]";
      }

      return text;
    } catch {
      // Export failures are non-fatal
      return null;
    }
  }

  /**
   * Override rate limit pause for Google Drive API.
   * Default quota: 12,000 queries per minute (~200 req/s).
   * Conservative: 10 req/s to stay well under limits.
   */
  protected override async rateLimitPause(): Promise<void> {
    await this.sleep(100); // 10 req/s
  }
}

// ─── Utilities ───

/** Count records by objectType for metadata */
function countByType(records: DriveRecord[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of records) {
    counts[r.objectType] = (counts[r.objectType] ?? 0) + 1;
  }
  return counts;
}
