/**
 * FieldMapper — Class-based API for mapping source records to normalized fields.
 *
 * Combines connector-specific rules (from mapping/rules/) with the generic
 * mapping pipeline (rule-engine + LLM fallback + cache).
 *
 * Usage:
 *   const mapper = new FieldMapper();
 *   const result = await mapper.mapFields(stripeRecord, "stripe", "customer");
 *
 * Pipeline per field:
 *   1. Connector-specific rule (mapping/rules/<connector>-rules.ts)
 *   2. Cache lookup (connector_field_mappings table)
 *   3. Generic rule engine (rule-engine.ts: L1 exact + L2 partial + L3 similarity)
 *   4. LLM fallback (llm-mapper.ts via runAgent("mapper"))
 *   5. Cache write for new mappings (TTL 30 days for LLM)
 *
 * ADR: adr-ai-mapping-hybrid.md
 */

import { mapFields as mapFieldsPipeline } from "./mapper";
import type {
  FieldMapping,
  MappingResult,
  MapFieldsOptions,
  MappingConfidence,
  TransformType,
  SourceFieldInput,
  TargetSchemaField,
} from "./types";

// Connector-specific rules
import { STRIPE_RULES } from "./rules/stripe-rules";
import { HUBSPOT_RULES } from "./rules/hubspot-rules";
import { SALESFORCE_RULES } from "./rules/salesforce-rules";
import { GOOGLE_DRIVE_RULES } from "./rules/google-drive-rules";
import type { FieldMappingRule } from "./rules/stripe-rules";

// Re-export key types for consumers
export type { FieldMapping, MappingResult, MappingConfidence };

// ─── Connector Rule Registry ───

/**
 * Registry of all connector-specific rules.
 * Key = connector ID (matches DataSource.connector field).
 * Value = entity-type-keyed rules from the per-connector rule files.
 */
const CONNECTOR_RULES: Record<string, Record<string, Record<string, FieldMappingRule>>> = {
  stripe: STRIPE_RULES,
  hubspot: HUBSPOT_RULES,
  salesforce: SALESFORCE_RULES,
  "google-drive": GOOGLE_DRIVE_RULES,
};

// ─── Default target schema ───

/**
 * Default target schema for CRM/business records.
 * Used when no explicit target schema is provided.
 * Covers the common normalized fields across all connectors.
 */
const DEFAULT_TARGET_SCHEMA: TargetSchemaField[] = [
  { name: "external_id", type: "text", description: "ID from the source system" },
  { name: "object_type", type: "text", description: "Entity type (contact, deal, invoice, etc.)" },
  { name: "full_name", type: "text", description: "Display name or full name" },
  { name: "first_name", type: "text", description: "First/given name" },
  { name: "last_name", type: "text", description: "Last/family name" },
  { name: "email", type: "text", description: "Email address" },
  { name: "phone", type: "text", description: "Phone number" },
  { name: "company_name", type: "text", description: "Company or organization name" },
  { name: "deal_name", type: "text", description: "Deal or opportunity name" },
  { name: "amount", type: "numeric", description: "Monetary amount (deal value, invoice total)" },
  { name: "annual_revenue", type: "numeric", description: "Annual revenue of the company" },
  { name: "currency", type: "text", description: "ISO 4217 currency code" },
  { name: "status", type: "text", description: "General status field" },
  { name: "stage", type: "text", description: "Pipeline stage or lifecycle stage" },
  { name: "pipeline", type: "text", description: "Pipeline name" },
  { name: "priority", type: "text", description: "Priority level" },
  { name: "description", type: "text", description: "Description or notes" },
  { name: "subject", type: "text", description: "Subject line (tickets, cases)" },
  { name: "industry", type: "text", description: "Industry or sector" },
  { name: "website", type: "text", description: "Website URL" },
  { name: "source", type: "text", description: "Lead source or origin" },
  { name: "owner", type: "text", description: "Record owner or assigned to" },
  { name: "job_title", type: "text", description: "Job title or role" },
  { name: "department", type: "text", description: "Department" },
  { name: "address", type: "text", description: "Street address" },
  { name: "city", type: "text", description: "City" },
  { name: "country", type: "text", description: "Country" },
  { name: "postal_code", type: "text", description: "Postal/ZIP code" },
  { name: "province", type: "text", description: "State/Province/Region" },
  { name: "tax_id", type: "text", description: "Tax ID or fiscal code" },
  { name: "vat_number", type: "text", description: "VAT number" },
  { name: "employee_count", type: "integer", description: "Number of employees" },
  { name: "probability", type: "numeric", description: "Win probability percentage (0-100)" },
  { name: "close_date", type: "timestamptz", description: "Expected close date" },
  { name: "account_id", type: "text", description: "Parent account ID" },
  { name: "customer_id", type: "text", description: "Customer ID reference" },
  { name: "subscription_id", type: "text", description: "Subscription ID reference" },
  { name: "billing_interval", type: "text", description: "Billing interval (month, year)" },
  { name: "created_at", type: "timestamptz", description: "Record creation date" },
  { name: "updated_at", type: "timestamptz", description: "Record last update date" },
  { name: "metadata", type: "jsonb", description: "Additional metadata" },
  // Google Drive specific
  { name: "file_name", type: "text", description: "File name" },
  { name: "mime_type", type: "text", description: "MIME type" },
  { name: "size_bytes", type: "bigint", description: "File size in bytes" },
  { name: "owner_name", type: "text", description: "File owner display name" },
  { name: "owner_email", type: "text", description: "File owner email" },
  { name: "web_url", type: "text", description: "Web view URL" },
  { name: "is_shared", type: "boolean", description: "Whether the item is shared" },
  { name: "is_folder", type: "boolean", description: "Whether the item is a folder" },
  { name: "is_native_format", type: "boolean", description: "Whether the file is in native format" },
  { name: "is_trashed", type: "boolean", description: "Whether the item is in trash" },
  { name: "file_extension", type: "text", description: "File extension" },
];

// ─── MappedRecord type ───

/**
 * Result of mapping a single source record.
 * Contains the mapped fields as a flat key-value object plus metadata.
 */
export interface MappedRecord {
  /** Mapped fields: targetField name -> transformed value */
  fields: Record<string, unknown>;
  /** Mapping metadata for each field */
  mappingDetails: FieldMapping[];
  /** Fields that could not be mapped */
  unmapped: string[];
  /** Overall confidence of the mapping (0.0-1.0) */
  confidence: MappingConfidence;
}

// ─── FieldMapper class ───

export class FieldMapper {
  /**
   * Map a source record's fields to normalized target fields.
   *
   * Pipeline:
   *   1. Try connector-specific rules first (zero-cost, deterministic)
   *   2. For remaining fields, delegate to the generic mapping pipeline
   *      (cache lookup -> rule engine -> LLM fallback -> cache write)
   *
   * @param source - The source record as a flat key-value object
   * @param connectorId - Connector identifier (e.g., "stripe", "hubspot", "salesforce", "google-drive")
   * @param entityType - Entity type within the connector (e.g., "customer", "Account", "contact")
   * @param options - Optional: skipLLM, llmConfidenceThreshold, custom targetSchema
   */
  async mapFields(
    source: Record<string, unknown>,
    connectorId: string,
    entityType: string,
    options?: MapFieldsOptions & { targetSchema?: TargetSchemaField[] }
  ): Promise<MappedRecord> {
    const startTime = Date.now();
    const connectorSource = `${connectorId}_${entityType}`;

    console.log(
      `[FIELD-MAPPER] Mapping record: connector=${connectorId}, entity=${entityType}, ` +
      `fields=${Object.keys(source).length}`
    );

    // Step 1: Apply connector-specific rules
    const connectorRules = CONNECTOR_RULES[connectorId];
    const entityRules = connectorRules?.[entityType];

    const mappedByConnectorRules: FieldMapping[] = [];
    const remainingFields: SourceFieldInput[] = [];
    const usedTargets = new Set<string>();

    for (const [fieldName, fieldValue] of Object.entries(source)) {
      // Skip null/undefined values
      if (fieldValue === null || fieldValue === undefined) continue;

      // Skip object/array fields that are raw data containers (not mappable to flat fields)
      if (typeof fieldValue === "object" && !Array.isArray(fieldValue) && fieldName !== "stripeMetadata") {
        // rawProperties, rawExtra, etc. are containers, not individual mappable fields
        if (fieldName === "rawProperties" || fieldName === "rawExtra") continue;
      }

      const rule = entityRules?.[fieldName];
      if (rule && rule.confidence >= 0.8) {
        mappedByConnectorRules.push({
          sourceField: fieldName,
          targetField: rule.targetField,
          transform: rule.transform,
          confidence: rule.confidence,
          mappingType: "rule",
        });
        usedTargets.add(rule.targetField);
      } else {
        remainingFields.push({
          name: fieldName,
          sampleValue: fieldValue,
        });
      }
    }

    // Step 2: For remaining fields, use the generic mapping pipeline
    let genericResult: MappingResult | null = null;
    if (remainingFields.length > 0) {
      const targetSchema = (options?.targetSchema ?? DEFAULT_TARGET_SCHEMA)
        .filter((t) => !usedTargets.has(t.name));

      genericResult = await mapFieldsPipeline(
        connectorSource,
        remainingFields,
        targetSchema,
        {
          skipLLM: options?.skipLLM,
          llmConfidenceThreshold: options?.llmConfidenceThreshold,
        }
      );
    }

    // Merge results
    const allMappings = [
      ...mappedByConnectorRules,
      ...(genericResult?.mapped ?? []),
    ];

    const allUnmapped = [
      ...(genericResult?.unmapped ?? []),
    ].map((u) => u.name);

    // Build the mapped fields object by applying transforms
    const fields: Record<string, unknown> = {};
    for (const mapping of allMappings) {
      const rawValue = source[mapping.sourceField];
      fields[mapping.targetField] = applyTransform(rawValue, mapping.transform);
    }

    // Calculate overall confidence
    const confidences = allMappings.map((m) => m.confidence);
    const confidence = confidences.length > 0
      ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
      : 0;

    const durationMs = Date.now() - startTime;
    const connectorRuleCount = mappedByConnectorRules.length;
    const genericRuleCount = genericResult?.stats?.fromRules ?? 0;
    const cacheCount = genericResult?.stats?.fromCache ?? 0;
    const llmCount = genericResult?.stats?.fromLLM ?? 0;

    console.log(
      `[FIELD-MAPPER] Completed in ${durationMs}ms | ` +
      `${allMappings.length}/${Object.keys(source).length} mapped | ` +
      `connector-rules: ${connectorRuleCount}, cache: ${cacheCount}, ` +
      `generic-rules: ${genericRuleCount}, LLM: ${llmCount}, ` +
      `unmapped: ${allUnmapped.length} | confidence: ${confidence}`
    );

    return {
      fields,
      mappingDetails: allMappings,
      unmapped: allUnmapped,
      confidence,
    };
  }

  /**
   * Check if connector-specific rules exist for a given connector/entity.
   */
  hasConnectorRules(connectorId: string, entityType: string): boolean {
    return !!CONNECTOR_RULES[connectorId]?.[entityType];
  }

  /**
   * Get the list of supported connectors that have specific rules.
   */
  getSupportedConnectors(): string[] {
    return Object.keys(CONNECTOR_RULES);
  }

  /**
   * Get entity types supported by a specific connector's rules.
   */
  getEntityTypes(connectorId: string): string[] {
    const rules = CONNECTOR_RULES[connectorId];
    return rules ? Object.keys(rules) : [];
  }

  /**
   * Get the default target schema used when none is provided.
   */
  getDefaultTargetSchema(): readonly TargetSchemaField[] {
    return DEFAULT_TARGET_SCHEMA;
  }
}

// ─── Transform Applier ───

/**
 * Apply a transform to a raw value.
 * Returns the transformed value or the original if transform fails.
 */
function applyTransform(value: unknown, transform: TransformType): unknown {
  if (value === null || value === undefined) return null;

  switch (transform) {
    case "direct":
      return value;

    case "normalize_email":
      return typeof value === "string" ? value.toLowerCase().trim() : value;

    case "normalize_cf":
      return typeof value === "string" ? value.toUpperCase().trim() : value;

    case "normalize_piva": {
      if (typeof value !== "string") return value;
      // Strip country prefix (IT, DE, FR, etc.)
      const stripped = value.trim().replace(/^[A-Z]{2}/, "");
      return stripped;
    }

    case "normalize_phone": {
      if (typeof value !== "string") return value;
      // Remove spaces, dashes, parentheses
      return value.replace(/[\s\-()]/g, "").trim();
    }

    case "iso_date": {
      if (typeof value === "string") {
        // Already ISO? Return as-is
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
        // Try parsing
        const d = new Date(value);
        return isNaN(d.getTime()) ? value : d.toISOString();
      }
      if (typeof value === "number") {
        // Unix timestamp (seconds or milliseconds)
        const ts = value > 1e12 ? value : value * 1000;
        return new Date(ts).toISOString();
      }
      return value;
    }

    case "number": {
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? null : parsed;
      }
      return null;
    }

    case "boolean": {
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        return ["true", "1", "yes", "si"].includes(value.toLowerCase());
      }
      if (typeof value === "number") return value !== 0;
      return Boolean(value);
    }

    case "json": {
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    }

    case "skip":
      return undefined;

    default:
      return value;
  }
}
