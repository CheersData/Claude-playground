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
 * Recursive folder traversal: fetches folder tree first, then files per folder.
 * Binary extraction: downloads PDF/DOCX files and extracts text via extract-text.ts.
 * Size threshold: skips files > configurable max (default 1 MB).
 * Checksum dedup: uses md5Checksum from Drive API to detect duplicate content.
 *
 * NOTE: The generic plugin-registry types support this connector via
 * registerGenericConnector<DriveRecord>().
 */

import { BaseConnector } from "./base";
import {
  parseDriveFile,
  parseDriveListResponseFiltered,
  isExportableAsText,
  isBinaryExtractable,
  getExportMimeType,
  deduplicateByChecksum,
  buildFolderTree,
  enrichWithFolderPaths,
  exceedsMaxSize,
  DEFAULT_MAX_FILE_SIZE,
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

/** Max binary file download size for text extraction (1 MB) */
const MAX_BINARY_DOWNLOAD_SIZE = 1_048_576;

/** Max depth for recursive folder traversal (prevent infinite loops) */
const MAX_FOLDER_DEPTH = 10;

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

  /** Get the max file size from source config or default */
  private getMaxFileSize(): number {
    const configMax = this.source.config.maxFileSizeBytes as number | undefined;
    return configMax ?? DEFAULT_MAX_FILE_SIZE;
  }

  /** Whether to enable recursive folder traversal */
  private isRecursiveEnabled(): boolean {
    return this.source.config.recursiveFolders !== false;
  }

  /** Whether to enable binary file text extraction */
  private isBinaryExtractionEnabled(): boolean {
    return this.source.config.extractBinaryText !== false;
  }

  /** Get the root folder ID for traversal (null = entire Drive) */
  private getRootFolderId(): string | null {
    return (this.source.config.rootFolderId as string) ?? null;
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
            "md5Checksum",
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
   *
   * Pipeline:
   * 1. If recursive enabled and rootFolderId set: traverse folder tree
   * 2. For each folder (or entire Drive): list files with size filtering
   * 3. Export text from Google Workspace files (Docs/Sheets/Slides)
   * 4. Download and extract text from binary files (PDF/DOCX) via extract-text.ts
   * 5. Dedup by md5Checksum
   * 6. Enrich with folder paths
   */
  async fetchAll(
    options?: { limit?: number }
  ): Promise<FetchResult<DriveRecord>> {
    this.log("[GDRIVE] Full fetch starting...");
    const globalLimit = options?.limit ?? Infinity;
    const maxFileSize = this.getMaxFileSize();
    const recursive = this.isRecursiveEnabled();
    const rootFolderId = this.getRootFolderId();

    let allRecords: DriveRecord[];

    if (recursive && rootFolderId) {
      // Recursive folder traversal from a specific root
      allRecords = await this.fetchRecursiveFromFolder(
        rootFolderId,
        globalLimit,
        maxFileSize
      );
    } else {
      // Flat fetch from entire Drive (original behavior)
      allRecords = await this.fetchFlat(
        "trashed = false",
        globalLimit,
        maxFileSize
      );
    }

    // Dedup by checksum
    const { unique, duplicates } = deduplicateByChecksum(allRecords);
    if (duplicates.size > 0) {
      this.log(`[GDRIVE] Dedup: removed ${duplicates.size} duplicate files (same md5)`);
    }

    // Build folder tree and enrich paths
    const folderTree = buildFolderTree(unique);
    if (folderTree.size > 0) {
      const resolved = enrichWithFolderPaths(unique, folderTree);
      this.log(`[GDRIVE] Folder paths resolved for ${resolved}/${unique.length} records`);
    }

    this.log(`[GDRIVE] Total: ${unique.length} records (${duplicates.size} dupes removed)`);

    return {
      sourceId: this.source.id,
      items: unique,
      fetchedAt: new Date().toISOString(),
      metadata: {
        authMode: this.auth?.mode ?? "unknown",
        exportedTextContent: this.source.config.exportTextContent !== false,
        binaryExtractionEnabled: this.isBinaryExtractionEnabled(),
        maxFileSizeBytes: maxFileSize,
        recursiveTraversal: recursive,
        rootFolderId: rootFolderId ?? "entire-drive",
        duplicatesRemoved: duplicates.size,
        foldersDiscovered: folderTree.size,
        typeCounts: countByType(unique),
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
    const globalLimit = options?.limit ?? Infinity;
    const maxFileSize = this.getMaxFileSize();

    // Format for Drive API: RFC 3339 timestamp
    const sinceRfc = new Date(since).toISOString();

    const query = `trashed = false and modifiedTime > '${sinceRfc}'`;
    const allRecords = await this.fetchFlat(query, globalLimit, maxFileSize, since);

    // Dedup by checksum
    const { unique, duplicates } = deduplicateByChecksum(allRecords);
    if (duplicates.size > 0) {
      this.log(`[GDRIVE] Delta dedup: removed ${duplicates.size} duplicates`);
    }

    // Build folder tree and enrich paths
    const folderTree = buildFolderTree(unique);
    if (folderTree.size > 0) {
      enrichWithFolderPaths(unique, folderTree);
    }

    this.log(`[GDRIVE] Delta total: ${unique.length} records`);

    return {
      sourceId: this.source.id,
      items: unique,
      fetchedAt: new Date().toISOString(),
      metadata: {
        since,
        sinceRfc,
        authMode: this.auth?.mode ?? "unknown",
        binaryExtractionEnabled: this.isBinaryExtractionEnabled(),
        duplicatesRemoved: duplicates.size,
        typeCounts: countByType(unique),
      },
    };
  }

  // ─── Internal: flat file listing ───

  /**
   * Fetch files from Drive with a given query, applying size filtering
   * and text extraction.
   */
  private async fetchFlat(
    query: string,
    limit: number,
    maxFileSize: number,
    deltaSince?: string
  ): Promise<DriveRecord[]> {
    const allRecords: DriveRecord[] = [];
    const exportText = this.source.config.exportTextContent !== false;
    const extractBinary = this.isBinaryExtractionEnabled();
    let totalSkippedOversize = 0;

    let pageToken: string | undefined;

    while (true) {
      if (allRecords.length >= limit) break;

      const pageSize = Math.min(PAGE_SIZE, limit - allRecords.length);
      const params: Record<string, string> = {
        pageSize: String(pageSize),
        fields: LIST_FIELDS,
        q: query,
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

        // Parse with filtering
        const {
          records,
          skippedOversize,
          nextPageToken,
        } = parseDriveListResponseFiltered(data, {
          maxSizeBytes: maxFileSize,
          since: deltaSince,
        });

        totalSkippedOversize += skippedOversize;

        // Extract text content for each record
        for (const record of records) {
          if (allRecords.length >= limit) break;

          await this.enrichWithTextContent(record, data.files, exportText, extractBinary);
          allRecords.push(record);
        }

        this.log(
          `[GDRIVE] Page fetched: ${records.length} files (total: ${allRecords.length}, skipped oversize: ${totalSkippedOversize})`
        );

        if (!nextPageToken || records.length === 0) break;
        pageToken = nextPageToken;

        // Rate limit pause between pages
        await this.rateLimitPause();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`[GDRIVE] Fetch error: ${msg}`);
        break;
      }
    }

    if (totalSkippedOversize > 0) {
      this.log(`[GDRIVE] Total skipped (oversize > ${maxFileSize} bytes): ${totalSkippedOversize}`);
    }

    return allRecords;
  }

  // ─── Internal: recursive folder traversal ───

  /**
   * Recursively traverse folder tree from a root folder and fetch all files.
   *
   * Algorithm:
   * 1. Fetch immediate children of root folder (files + subfolders)
   * 2. For each subfolder, recurse (BFS with depth limit)
   * 3. Collect all file records
   *
   * The Drive API doesn't support recursive listing natively.
   * We use `'<folderId>' in parents` queries per folder.
   */
  private async fetchRecursiveFromFolder(
    rootFolderId: string,
    limit: number,
    maxFileSize: number,
    depth: number = 0
  ): Promise<DriveRecord[]> {
    if (depth > MAX_FOLDER_DEPTH) {
      this.log(`[GDRIVE] Max folder depth (${MAX_FOLDER_DEPTH}) reached, stopping recursion`);
      return [];
    }

    const allRecords: DriveRecord[] = [];
    const exportText = this.source.config.exportTextContent !== false;
    const extractBinary = this.isBinaryExtractionEnabled();

    // BFS: queue of (folderId, depth) pairs
    const folderQueue: Array<{ folderId: string; depth: number }> = [
      { folderId: rootFolderId, depth: 0 },
    ];

    while (folderQueue.length > 0 && allRecords.length < limit) {
      const { folderId, depth: currentDepth } = folderQueue.shift()!;

      if (currentDepth > MAX_FOLDER_DEPTH) continue;

      this.log(`[GDRIVE] Traversing folder ${folderId} (depth: ${currentDepth})...`);

      // Fetch all items in this folder
      const query = `'${folderId}' in parents and trashed = false`;
      let pageToken: string | undefined;

      while (allRecords.length < limit) {
        const params: Record<string, string> = {
          pageSize: String(PAGE_SIZE),
          fields: LIST_FIELDS,
          q: query,
          orderBy: "folder,modifiedTime desc",
        };
        if (pageToken) {
          params.pageToken = pageToken;
        }

        const url = await this.buildUrl("/files", params);
        const opts = await this.buildRequestOptions();

        try {
          const response = await this.fetchWithRetry(url, opts);
          if (!response.ok) {
            this.log(
              `[GDRIVE] Folder ${folderId} list error: HTTP ${response.status}`
            );
            break;
          }

          const data = (await response.json()) as DriveListResponse;
          const files = data.files ?? [];

          for (const raw of files) {
            if (allRecords.length >= limit) break;

            // If this is a subfolder, add to traversal queue
            if (raw.mimeType === "application/vnd.google-apps.folder") {
              const folderRecord = parseDriveFile(raw);
              allRecords.push(folderRecord);
              folderQueue.push({ folderId: raw.id, depth: currentDepth + 1 });
              continue;
            }

            // Skip oversize files
            if (exceedsMaxSize(raw, maxFileSize)) {
              continue;
            }

            // Parse and extract text
            const record = parseDriveFile(raw);
            await this.enrichWithTextContent(record, [raw], exportText, extractBinary);
            allRecords.push(record);
          }

          if (!data.nextPageToken || files.length === 0) break;
          pageToken = data.nextPageToken;

          await this.rateLimitPause();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.log(`[GDRIVE] Folder ${folderId} error: ${msg}`);
          break;
        }
      }
    }

    this.log(
      `[GDRIVE] Recursive traversal complete: ${allRecords.length} records from ${rootFolderId}`
    );

    return allRecords;
  }

  // ─── Internal: text content extraction ───

  /**
   * Enrich a DriveRecord with text content.
   *
   * For Google Workspace files (Docs, Sheets, Slides):
   *   -> Export as text/plain or text/csv via the export endpoint
   *
   * For binary files (PDF, DOCX, DOC, TXT):
   *   -> Download the file content and extract text via extract-text.ts
   *
   * Mutates the record in place (sets textContent, textExtractedFromBinary, needsBinaryExtraction).
   */
  private async enrichWithTextContent(
    record: DriveRecord,
    rawFiles: DriveFileRaw[],
    exportText: boolean,
    extractBinary: boolean
  ): Promise<void> {
    // Find the raw file data for this record
    const raw = rawFiles.find((f) => f.id === record.externalId);
    if (!raw) return;

    // Google Workspace export
    if (exportText && isExportableAsText(raw.mimeType)) {
      const text = await this.exportFileContent(raw);
      if (text) {
        record.textContent = text;
        record.needsBinaryExtraction = false;
      }
      return;
    }

    // Binary file extraction (PDF, DOCX, DOC, TXT)
    if (extractBinary && isBinaryExtractable(raw.mimeType)) {
      const text = await this.downloadAndExtractText(raw);
      if (text) {
        record.textContent = text;
        record.textExtractedFromBinary = true;
        record.needsBinaryExtraction = false;
      }
      // If extraction failed, needsBinaryExtraction remains true (set by parser)
    }
  }

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
   * Download a binary file (PDF/DOCX/DOC/TXT) from Drive and extract text
   * using extract-text.ts.
   *
   * Returns null if:
   * - Download fails
   * - File is too large
   * - Text extraction fails
   * - Extracted text is too short (< 50 chars — likely empty/scanned)
   */
  private async downloadAndExtractText(file: DriveFileRaw): Promise<string | null> {
    try {
      // Check file size before downloading
      if (file.size) {
        const sizeNum = parseInt(file.size, 10);
        if (!isNaN(sizeNum) && sizeNum > MAX_BINARY_DOWNLOAD_SIZE) {
          this.log(
            `[GDRIVE] Skipping binary extraction for "${file.name}" — too large (${sizeNum} bytes)`
          );
          return null;
        }
      }

      // Download file content via the alt=media parameter
      const url = await this.buildUrl(`/files/${file.id}`, {
        alt: "media",
      });
      const opts = await this.buildRequestOptions();

      const response = await this.fetchWithRetry(url, opts, 1);
      if (!response.ok) {
        return null;
      }

      // Read as ArrayBuffer and convert to Buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Check buffer size
      if (buffer.length > MAX_BINARY_DOWNLOAD_SIZE) {
        this.log(
          `[GDRIVE] Downloaded content for "${file.name}" too large (${buffer.length} bytes), skipping extraction`
        );
        return null;
      }

      // Extract text using the shared extract-text.ts utility
      const { extractText } = await import("@/lib/extract-text");
      const text = await extractText(buffer, file.mimeType, file.name);

      // Validate extracted text quality
      if (!text || text.trim().length < 50) {
        this.log(
          `[GDRIVE] Extracted text for "${file.name}" too short (${text?.length ?? 0} chars), skipping`
        );
        return null;
      }

      // Truncate if exceeds max
      if (text.length > MAX_EXPORT_SIZE) {
        return text.slice(0, MAX_EXPORT_SIZE) + "\n[TRUNCATED]";
      }

      this.log(
        `[GDRIVE] Extracted ${text.length} chars from binary file "${file.name}"`
      );
      return text;
    } catch (err) {
      // Binary extraction failures are non-fatal
      const msg = err instanceof Error ? err.message : String(err);
      this.log(
        `[GDRIVE] Binary extraction failed for "${file.name}": ${msg}`
      );
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
