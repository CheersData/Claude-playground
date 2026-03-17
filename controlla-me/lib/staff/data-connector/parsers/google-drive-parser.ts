/**
 * Google Drive Parser — Normalizes Drive API v3 responses into DriveRecord format.
 *
 * Handles: files, folders, Google Docs, Sheets, Slides, PDFs, images.
 * Extracts: metadata, owner info, sharing status, parent folders.
 *
 * Features:
 *   - MIME type categorization (document, spreadsheet, pdf, folder, image, etc.)
 *   - Google Workspace export detection (Docs/Sheets/Slides -> text/plain or text/csv)
 *   - Binary file detection for PDF/DOCX -> flag for text extraction via extract-text.ts
 *   - Size threshold filtering (skip files > configurable limit)
 *   - Checksum-based dedup (md5Checksum from Drive API)
 *   - Delta sync support (filter by modifiedTime for incremental updates)
 *   - Recursive folder traversal helpers (build folder tree, resolve paths)
 *
 * Compatible with Google Drive API v3 JSON responses.
 */

// ─── Output type ───

export interface DriveRecord {
  /** Google Drive file ID */
  externalId: string;
  /** Categorized type: document | spreadsheet | presentation | pdf | folder | image | video | other */
  objectType: string;
  /** File name */
  name: string;
  /** Original MIME type from Google Drive */
  mimeType: string;
  /** File size in bytes (null for Google Docs native formats and folders) */
  sizeBytes: number | null;
  /** ISO 8601 creation date */
  createdAt: string;
  /** ISO 8601 last modified date */
  modifiedAt: string;
  /** Parent folder IDs */
  parents: string[];
  /** Primary owner display name */
  ownerName: string | null;
  /** Primary owner email */
  ownerEmail: string | null;
  /** Whether the file is shared with others */
  shared: boolean;
  /** Web view link (opens in browser) */
  webViewLink: string | null;
  /** Icon link for the file type */
  iconLink: string | null;
  /** Exported text content for Google Docs/Sheets or extracted text from PDF/DOCX (null for binary files without extraction) */
  textContent: string | null;
  /** Whether this is a Google Workspace native format (Docs, Sheets, Slides) */
  isGoogleFormat: boolean;
  /** Whether this is a folder */
  isFolder: boolean;
  /** File extension (extracted from name, or null) */
  extension: string | null;
  /** Trashed status */
  trashed: boolean;
  /** MD5 checksum from Drive API (null for Google Workspace native formats) */
  md5Checksum: string | null;
  /** Whether text was extracted from a binary file (PDF/DOCX) via extract-text */
  textExtractedFromBinary: boolean;
  /** Whether file requires binary download for text extraction (PDF/DOCX that hasn't been extracted yet) */
  needsBinaryExtraction: boolean;
  /** Resolved folder path (set during recursive traversal, null otherwise) */
  folderPath: string | null;
  /** Last modifying user email (for change tracking) */
  lastModifiedByEmail: string | null;
  /** Raw fields not covered by the normalized schema */
  rawExtra: Record<string, unknown>;
}

// ─── Raw API response types ───

export interface DriveFileRaw {
  id: string;
  name: string;
  mimeType: string;
  size?: string; // Drive API returns size as string
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
  owners?: Array<{
    displayName?: string;
    emailAddress?: string;
    photoLink?: string;
  }>;
  shared?: boolean;
  webViewLink?: string;
  iconLink?: string;
  trashed?: boolean;
  starred?: boolean;
  description?: string;
  fileExtension?: string;
  fullFileExtension?: string;
  originalFilename?: string;
  md5Checksum?: string;
  sharingUser?: {
    displayName?: string;
    emailAddress?: string;
  };
  lastModifyingUser?: {
    displayName?: string;
    emailAddress?: string;
  };
  capabilities?: Record<string, boolean>;
}

export interface DriveListResponse {
  kind: string;
  nextPageToken?: string;
  incompleteSearch?: boolean;
  files: DriveFileRaw[];
}

// ─── MIME type to object type mapping ───

const GOOGLE_DOCS_MIME = "application/vnd.google-apps.document";
const GOOGLE_SHEETS_MIME = "application/vnd.google-apps.spreadsheet";
const GOOGLE_SLIDES_MIME = "application/vnd.google-apps.presentation";
const GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder";

/** MIME types that can have text extracted from binary download via extract-text.ts */
const BINARY_EXTRACTABLE_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword", // .doc
  "text/plain",
]);

/** Default max file size for binary extraction (1 MB) */
export const DEFAULT_MAX_FILE_SIZE = 1_048_576;

/** Map a MIME type to a simplified object type category */
export function mimeToObjectType(mimeType: string): string {
  if (mimeType === GOOGLE_FOLDER_MIME) return "folder";
  if (mimeType === GOOGLE_DOCS_MIME) return "document";
  if (mimeType === GOOGLE_SHEETS_MIME) return "spreadsheet";
  if (mimeType === GOOGLE_SLIDES_MIME) return "presentation";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("document") ||
    mimeType.includes("word")
  )
    return "document";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return "spreadsheet";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint"))
    return "presentation";
  return "other";
}

/** Check if a MIME type is a Google Workspace native format */
export function isGoogleWorkspaceFormat(mimeType: string): boolean {
  return mimeType.startsWith("application/vnd.google-apps.");
}

/** Check if a Google Docs file can be exported as text */
export function isExportableAsText(mimeType: string): boolean {
  return (
    mimeType === GOOGLE_DOCS_MIME ||
    mimeType === GOOGLE_SHEETS_MIME ||
    mimeType === GOOGLE_SLIDES_MIME
  );
}

/**
 * Check if a file is a binary format that can have text extracted via extract-text.ts.
 * These files need to be downloaded (not exported) and then run through extractText().
 */
export function isBinaryExtractable(mimeType: string): boolean {
  return BINARY_EXTRACTABLE_MIMES.has(mimeType);
}

/**
 * Get the export MIME type for a Google Workspace document.
 * Used to download text content from Docs/Sheets/Slides.
 */
export function getExportMimeType(mimeType: string): string | null {
  switch (mimeType) {
    case GOOGLE_DOCS_MIME:
      return "text/plain";
    case GOOGLE_SHEETS_MIME:
      return "text/csv";
    case GOOGLE_SLIDES_MIME:
      return "text/plain";
    default:
      return null;
  }
}

// ─── Size threshold ───

/**
 * Check whether a file exceeds the maximum size threshold.
 * Returns true if the file should be skipped.
 *
 * Google Workspace native formats (Docs, Sheets, Slides) and folders have no size
 * reported by the API, so they are never skipped by size.
 *
 * @param raw - Raw Drive API file object
 * @param maxSizeBytes - Maximum file size in bytes (default: 1 MB)
 */
export function exceedsMaxSize(
  raw: DriveFileRaw,
  maxSizeBytes: number = DEFAULT_MAX_FILE_SIZE
): boolean {
  if (!raw.size) return false; // Google native formats + folders have no size
  const sizeNum = parseInt(raw.size, 10);
  return !isNaN(sizeNum) && sizeNum > maxSizeBytes;
}

// ─── Checksum dedup ───

/**
 * Build a dedup index from a list of DriveRecords using md5Checksum.
 * Returns a Map of checksum -> externalId for the first occurrence of each checksum.
 *
 * Files without a checksum (Google Workspace native formats, folders) are excluded.
 */
export function buildChecksumIndex(
  records: DriveRecord[]
): Map<string, string> {
  const index = new Map<string, string>();
  for (const record of records) {
    const checksum = record.md5Checksum;
    if (checksum && !index.has(checksum)) {
      index.set(checksum, record.externalId);
    }
  }
  return index;
}

/**
 * Deduplicate records by md5Checksum.
 * Keeps the first occurrence (by array order) and marks duplicates.
 *
 * Returns { unique, duplicates } where duplicates maps externalId -> originalId
 * of the first occurrence with the same checksum.
 */
export function deduplicateByChecksum(records: DriveRecord[]): {
  unique: DriveRecord[];
  duplicates: Map<string, string>;
} {
  const seen = new Map<string, string>(); // checksum -> first externalId
  const unique: DriveRecord[] = [];
  const duplicates = new Map<string, string>(); // dupeId -> originalId

  for (const record of records) {
    const checksum = record.md5Checksum;

    // No checksum (Google native format, folder) — always keep
    if (!checksum) {
      unique.push(record);
      continue;
    }

    const existingId = seen.get(checksum);
    if (existingId) {
      // Duplicate: same content as an earlier file
      duplicates.set(record.externalId, existingId);
    } else {
      seen.set(checksum, record.externalId);
      unique.push(record);
    }
  }

  return { unique, duplicates };
}

/**
 * Check if a record has changed since a previous sync by comparing checksums.
 * Returns true if the file has changed (different checksum) or if checksum is unavailable.
 *
 * @param record - New record from the API
 * @param previousChecksum - Checksum from the previous sync (from DB)
 */
export function hasChecksumChanged(
  record: DriveRecord,
  previousChecksum: string | null
): boolean {
  // No checksum available — assume changed (Google native formats, folders)
  if (!record.md5Checksum || !previousChecksum) return true;
  return record.md5Checksum !== previousChecksum;
}

// ─── Delta sync ───

/**
 * Filter records that were modified after a given timestamp.
 * Used for client-side delta filtering when the API query already handles this,
 * but we want an extra safety check.
 */
export function filterByModifiedAfter(
  records: DriveRecord[],
  since: string
): DriveRecord[] {
  const sinceMs = new Date(since).getTime();
  if (isNaN(sinceMs)) return records; // Invalid date — return all

  return records.filter((r) => {
    const modMs = new Date(r.modifiedAt).getTime();
    return !isNaN(modMs) && modMs > sinceMs;
  });
}

// ─── Folder traversal ───

/**
 * Node in a folder tree structure.
 * Used for recursive folder traversal to resolve file paths.
 */
export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  children: FolderNode[];
  /** Full path from root (e.g., "My Drive/Projects/Client A") */
  path: string;
}

/**
 * Build a folder tree from a flat list of DriveRecords.
 * Only includes records where isFolder === true.
 *
 * Returns a map of folderId -> FolderNode with resolved paths.
 *
 * Root folders (no parent, or parent is "root") get path = their name.
 * Child folders get path = parentPath + "/" + name.
 */
export function buildFolderTree(records: DriveRecord[]): Map<string, FolderNode> {
  const folders = records.filter((r) => r.isFolder);
  const nodeMap = new Map<string, FolderNode>();

  // 1. Create all nodes
  for (const folder of folders) {
    nodeMap.set(folder.externalId, {
      id: folder.externalId,
      name: folder.name,
      parentId: folder.parents.length > 0 ? folder.parents[0] : null,
      children: [],
      path: folder.name, // Will be resolved below
    });
  }

  // 2. Link children to parents
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      const parent = nodeMap.get(node.parentId)!;
      parent.children.push(node);
    }
  }

  // 3. Resolve paths top-down (BFS from roots)
  const roots: FolderNode[] = [];
  for (const node of nodeMap.values()) {
    if (!node.parentId || !nodeMap.has(node.parentId)) {
      // Root folder (no parent in our dataset)
      node.path = node.name;
      roots.push(node);
    }
  }

  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of current.children) {
      child.path = `${current.path}/${child.name}`;
      queue.push(child);
    }
  }

  return nodeMap;
}

/**
 * Resolve the folder path for a file given its parent IDs and the folder tree.
 * Returns the path of the first parent found in the tree, or null if none found.
 */
export function resolveFilePath(
  record: DriveRecord,
  folderTree: Map<string, FolderNode>
): string | null {
  for (const parentId of record.parents) {
    const folder = folderTree.get(parentId);
    if (folder) {
      return `${folder.path}/${record.name}`;
    }
  }
  return null;
}

/**
 * Enrich records with resolved folder paths.
 * Mutates the records in place (sets folderPath field).
 *
 * @returns Number of records that had their path resolved.
 */
export function enrichWithFolderPaths(
  records: DriveRecord[],
  folderTree: Map<string, FolderNode>
): number {
  let resolved = 0;
  for (const record of records) {
    if (record.isFolder) {
      const node = folderTree.get(record.externalId);
      if (node) {
        record.folderPath = node.path;
        resolved++;
      }
    } else {
      const path = resolveFilePath(record, folderTree);
      if (path) {
        record.folderPath = path;
        resolved++;
      }
    }
  }
  return resolved;
}

/**
 * Get all subfolder IDs under a given folder (recursive).
 * Useful for building the Drive API `q` parameter: `'folderId' in parents`.
 */
export function getSubfolderIds(
  folderId: string,
  folderTree: Map<string, FolderNode>
): string[] {
  const result: string[] = [];
  const node = folderTree.get(folderId);
  if (!node) return result;

  const queue = [...node.children];
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current.id);
    queue.push(...current.children);
  }
  return result;
}

// ─── Parser ───

/**
 * Parse a raw Drive API file object into a normalized DriveRecord.
 */
export function parseDriveFile(
  raw: DriveFileRaw,
  textContent?: string | null
): DriveRecord {
  const primaryOwner = raw.owners?.[0] ?? null;
  const ext = extractExtension(raw);
  const mimeType = raw.mimeType;
  const isGoogleFmt = isGoogleWorkspaceFormat(mimeType);
  const binaryExtractable = isBinaryExtractable(mimeType);

  return {
    externalId: raw.id,
    objectType: mimeToObjectType(mimeType),
    name: raw.name,
    mimeType,
    sizeBytes: raw.size ? parseInt(raw.size, 10) : null,
    createdAt: raw.createdTime ?? new Date().toISOString(),
    modifiedAt: raw.modifiedTime ?? new Date().toISOString(),
    parents: raw.parents ?? [],
    ownerName: primaryOwner?.displayName ?? null,
    ownerEmail: primaryOwner?.emailAddress ?? null,
    shared: raw.shared ?? false,
    webViewLink: raw.webViewLink ?? null,
    iconLink: raw.iconLink ?? null,
    textContent: textContent ?? null,
    isGoogleFormat: isGoogleFmt,
    isFolder: mimeType === GOOGLE_FOLDER_MIME,
    extension: ext,
    trashed: raw.trashed ?? false,
    md5Checksum: raw.md5Checksum ?? null,
    textExtractedFromBinary: binaryExtractable && textContent != null,
    needsBinaryExtraction: binaryExtractable && textContent == null,
    folderPath: null, // Resolved later via enrichWithFolderPaths()
    lastModifiedByEmail: raw.lastModifyingUser?.emailAddress ?? null,
    rawExtra: {
      starred: raw.starred,
      description: raw.description,
      originalFilename: raw.originalFilename,
      lastModifyingUser: raw.lastModifyingUser,
      sharingUser: raw.sharingUser,
    },
  };
}

/**
 * Parse a Drive API list response into DriveRecord[].
 */
export function parseDriveListResponse(
  response: DriveListResponse
): { records: DriveRecord[]; nextPageToken?: string } {
  const records = response.files.map((f) => parseDriveFile(f));
  return {
    records,
    nextPageToken: response.nextPageToken,
  };
}

/**
 * Parse a Drive API list response with filtering.
 * Applies size threshold and optionally delta sync filter.
 *
 * Returns parsed records plus skipped count for logging.
 */
export function parseDriveListResponseFiltered(
  response: DriveListResponse,
  options: {
    maxSizeBytes?: number;
    since?: string;
  } = {}
): {
  records: DriveRecord[];
  skippedOversize: number;
  skippedOld: number;
  nextPageToken?: string;
} {
  const maxSize = options.maxSizeBytes ?? DEFAULT_MAX_FILE_SIZE;
  let skippedOversize = 0;
  let skippedOld = 0;

  // 1. Filter by size
  const sizeFiltered: DriveFileRaw[] = [];
  for (const file of response.files) {
    if (exceedsMaxSize(file, maxSize)) {
      skippedOversize++;
    } else {
      sizeFiltered.push(file);
    }
  }

  // 2. Parse
  let records = sizeFiltered.map((f) => parseDriveFile(f));

  // 3. Optionally filter by modifiedTime (client-side safety check)
  if (options.since) {
    const before = records.length;
    records = filterByModifiedAfter(records, options.since);
    skippedOld = before - records.length;
  }

  return {
    records,
    skippedOversize,
    skippedOld,
    nextPageToken: response.nextPageToken,
  };
}

// ─── Utilities ───

/** Extract file extension from name or raw metadata */
function extractExtension(raw: DriveFileRaw): string | null {
  if (raw.fileExtension) return raw.fileExtension;
  if (raw.fullFileExtension) return raw.fullFileExtension;
  // Try to extract from name
  const dotIdx = raw.name.lastIndexOf(".");
  if (dotIdx > 0 && dotIdx < raw.name.length - 1) {
    return raw.name.substring(dotIdx + 1).toLowerCase();
  }
  return null;
}
