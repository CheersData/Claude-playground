/**
 * HubSpot Field Mapping Rules — Connector-specific deterministic rules.
 *
 * Maps HubSpotRecord fields to normalized target fields.
 * Covers 4 entity types: contact, company, deal, ticket.
 *
 * Format: Record<entityType, Record<sourceFieldName, FieldMappingRule>>
 * The source field names match the HubSpotRecord interface (camelCase).
 *
 * ADR: adr-ai-mapping-hybrid.md
 */

import type { FieldMappingRule } from "./stripe-rules";

/**
 * HubSpot mapping rules per entity type.
 *
 * Outer key = HubSpotRecord.objectType (contact, company, deal, ticket)
 * Inner key = HubSpotRecord field name (camelCase as produced by hubspot-parser.ts)
 * Value = target field + transform + confidence
 */
export const HUBSPOT_RULES: Record<string, Record<string, FieldMappingRule>> = {
  contact: {
    externalId: { targetField: "external_id", transform: "direct", confidence: 1.0 },
    objectType: { targetField: "object_type", transform: "direct", confidence: 1.0 },
    createdAt: { targetField: "created_at", transform: "iso_date", confidence: 1.0 },
    updatedAt: { targetField: "updated_at", transform: "iso_date", confidence: 1.0 },
    displayName: { targetField: "full_name", transform: "direct", confidence: 1.0 },
    email: { targetField: "email", transform: "normalize_email", confidence: 1.0 },
    phone: { targetField: "phone", transform: "normalize_phone", confidence: 1.0 },
    companyName: { targetField: "company_name", transform: "direct", confidence: 0.95 },
    stage: { targetField: "stage", transform: "direct", confidence: 0.90 },
    description: { targetField: "description", transform: "direct", confidence: 0.90 },
  },

  company: {
    externalId: { targetField: "external_id", transform: "direct", confidence: 1.0 },
    objectType: { targetField: "object_type", transform: "direct", confidence: 1.0 },
    createdAt: { targetField: "created_at", transform: "iso_date", confidence: 1.0 },
    updatedAt: { targetField: "updated_at", transform: "iso_date", confidence: 1.0 },
    displayName: { targetField: "full_name", transform: "direct", confidence: 0.95 },
    companyName: { targetField: "company_name", transform: "direct", confidence: 1.0 },
    domain: { targetField: "website", transform: "direct", confidence: 0.90 },
    industry: { targetField: "industry", transform: "direct", confidence: 1.0 },
    description: { targetField: "description", transform: "direct", confidence: 0.90 },
  },

  deal: {
    externalId: { targetField: "external_id", transform: "direct", confidence: 1.0 },
    objectType: { targetField: "object_type", transform: "direct", confidence: 1.0 },
    createdAt: { targetField: "created_at", transform: "iso_date", confidence: 1.0 },
    updatedAt: { targetField: "updated_at", transform: "iso_date", confidence: 1.0 },
    displayName: { targetField: "deal_name", transform: "direct", confidence: 1.0 },
    stage: { targetField: "stage", transform: "direct", confidence: 1.0 },
    pipeline: { targetField: "pipeline", transform: "direct", confidence: 1.0 },
    amount: { targetField: "amount", transform: "number", confidence: 1.0 },
    currency: { targetField: "currency", transform: "direct", confidence: 1.0 },
    closeDate: { targetField: "close_date", transform: "iso_date", confidence: 1.0 },
    description: { targetField: "description", transform: "direct", confidence: 0.90 },
  },

  ticket: {
    externalId: { targetField: "external_id", transform: "direct", confidence: 1.0 },
    objectType: { targetField: "object_type", transform: "direct", confidence: 1.0 },
    createdAt: { targetField: "created_at", transform: "iso_date", confidence: 1.0 },
    updatedAt: { targetField: "updated_at", transform: "iso_date", confidence: 1.0 },
    displayName: { targetField: "subject", transform: "direct", confidence: 1.0 },
    stage: { targetField: "stage", transform: "direct", confidence: 1.0 },
    pipeline: { targetField: "pipeline", transform: "direct", confidence: 1.0 },
    priority: { targetField: "priority", transform: "direct", confidence: 1.0 },
    description: { targetField: "description", transform: "direct", confidence: 1.0 },
  },
};
