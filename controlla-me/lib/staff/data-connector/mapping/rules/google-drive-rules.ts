/**
 * Google Drive Field Mapping Rules — Connector-specific deterministic rules.
 *
 * Maps DriveRecord fields to normalized target fields.
 * Google Drive has a single entity type structure, but we differentiate
 * by objectType (document, spreadsheet, presentation, pdf, folder, image, etc.)
 * using a shared base rule set since the DriveRecord interface is uniform.
 *
 * Format: Record<entityType, Record<sourceFieldName, FieldMappingRule>>
 * The source field names match the DriveRecord interface (camelCase).
 *
 * ADR: adr-ai-mapping-hybrid.md
 */

import type { FieldMappingRule } from "./stripe-rules";

/**
 * Base mapping rules shared across all Google Drive object types.
 * The DriveRecord parser produces the same fields regardless of file type.
 */
const DRIVE_BASE_RULES: Record<string, FieldMappingRule> = {
  externalId: { targetField: "external_id", transform: "direct", confidence: 1.0 },
  objectType: { targetField: "object_type", transform: "direct", confidence: 1.0 },
  name: { targetField: "file_name", transform: "direct", confidence: 1.0 },
  mimeType: { targetField: "mime_type", transform: "direct", confidence: 1.0 },
  sizeBytes: { targetField: "size_bytes", transform: "number", confidence: 1.0 },
  createdAt: { targetField: "created_at", transform: "iso_date", confidence: 1.0 },
  modifiedAt: { targetField: "updated_at", transform: "iso_date", confidence: 1.0 },
  ownerName: { targetField: "owner_name", transform: "direct", confidence: 1.0 },
  ownerEmail: { targetField: "owner_email", transform: "normalize_email", confidence: 1.0 },
  shared: { targetField: "is_shared", transform: "boolean", confidence: 1.0 },
  webViewLink: { targetField: "web_url", transform: "direct", confidence: 1.0 },
  isGoogleFormat: { targetField: "is_native_format", transform: "boolean", confidence: 1.0 },
  isFolder: { targetField: "is_folder", transform: "boolean", confidence: 1.0 },
  extension: { targetField: "file_extension", transform: "direct", confidence: 1.0 },
  trashed: { targetField: "is_trashed", transform: "boolean", confidence: 1.0 },
};

/**
 * Google Drive mapping rules per entity type.
 *
 * All file types share the same base rules since DriveRecord is uniform.
 * Entity types: document, spreadsheet, presentation, pdf, folder, image, video, audio, other
 */
export const GOOGLE_DRIVE_RULES: Record<string, Record<string, FieldMappingRule>> = {
  document: { ...DRIVE_BASE_RULES },
  spreadsheet: { ...DRIVE_BASE_RULES },
  presentation: { ...DRIVE_BASE_RULES },
  pdf: { ...DRIVE_BASE_RULES },
  folder: { ...DRIVE_BASE_RULES },
  image: { ...DRIVE_BASE_RULES },
  video: { ...DRIVE_BASE_RULES },
  audio: { ...DRIVE_BASE_RULES },
  other: { ...DRIVE_BASE_RULES },
};
