/**
 * Google Drive Parser — Normalizes Drive API v3 responses into DriveRecord format.
 *
 * Handles: files, folders, Google Docs, Sheets, Slides, PDFs, images.
 * Extracts: metadata, owner info, sharing status, parent folders.
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
  /** Exported text content for Google Docs/Sheets (null for binary files) */
  textContent: string | null;
  /** Whether this is a Google Workspace native format (Docs, Sheets, Slides) */
  isGoogleFormat: boolean;
  /** Whether this is a folder */
  isFolder: boolean;
  /** File extension (extracted from name, or null) */
  extension: string | null;
  /** Trashed status */
  trashed: boolean;
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

  return {
    externalId: raw.id,
    objectType: mimeToObjectType(raw.mimeType),
    name: raw.name,
    mimeType: raw.mimeType,
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
    isGoogleFormat: isGoogleWorkspaceFormat(raw.mimeType),
    isFolder: raw.mimeType === GOOGLE_FOLDER_MIME,
    extension: ext,
    trashed: raw.trashed ?? false,
    rawExtra: {
      starred: raw.starred,
      description: raw.description,
      originalFilename: raw.originalFilename,
      md5Checksum: raw.md5Checksum,
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
