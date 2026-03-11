/**
 * Salesforce Field Mapping Rules — Connector-specific deterministic rules.
 *
 * Maps SalesforceRecord fields to normalized target fields.
 * Covers 5 entity types: Account, Contact, Opportunity, Lead, Case.
 *
 * Format: Record<entityType, Record<sourceFieldName, FieldMappingRule>>
 * The source field names match the SalesforceRecord interface (camelCase).
 *
 * ADR: adr-ai-mapping-hybrid.md
 */

import type { FieldMappingRule } from "./stripe-rules";

/**
 * Salesforce mapping rules per entity type.
 *
 * Outer key = SalesforceRecord.objectType (Account, Contact, Opportunity, Lead, Case)
 * Inner key = SalesforceRecord field name (camelCase as produced by salesforce-parser.ts)
 * Value = target field + transform + confidence
 */
export const SALESFORCE_RULES: Record<string, Record<string, FieldMappingRule>> = {
  Account: {
    externalId: { targetField: "external_id", transform: "direct", confidence: 1.0 },
    objectType: { targetField: "object_type", transform: "direct", confidence: 1.0 },
    createdAt: { targetField: "created_at", transform: "iso_date", confidence: 1.0 },
    updatedAt: { targetField: "updated_at", transform: "iso_date", confidence: 1.0 },
    displayName: { targetField: "full_name", transform: "direct", confidence: 0.95 },
    companyName: { targetField: "company_name", transform: "direct", confidence: 1.0 },
    industry: { targetField: "industry", transform: "direct", confidence: 1.0 },
    website: { targetField: "website", transform: "direct", confidence: 1.0 },
    amount: { targetField: "annual_revenue", transform: "number", confidence: 0.90 },
    billingCity: { targetField: "city", transform: "direct", confidence: 1.0 },
    billingCountry: { targetField: "country", transform: "direct", confidence: 1.0 },
    numberOfEmployees: { targetField: "employee_count", transform: "number", confidence: 1.0 },
    description: { targetField: "description", transform: "direct", confidence: 0.90 },
  },

  Contact: {
    externalId: { targetField: "external_id", transform: "direct", confidence: 1.0 },
    objectType: { targetField: "object_type", transform: "direct", confidence: 1.0 },
    createdAt: { targetField: "created_at", transform: "iso_date", confidence: 1.0 },
    updatedAt: { targetField: "updated_at", transform: "iso_date", confidence: 1.0 },
    displayName: { targetField: "full_name", transform: "direct", confidence: 1.0 },
    email: { targetField: "email", transform: "normalize_email", confidence: 1.0 },
    phone: { targetField: "phone", transform: "normalize_phone", confidence: 1.0 },
    title: { targetField: "job_title", transform: "direct", confidence: 1.0 },
    description: { targetField: "department", transform: "direct", confidence: 0.85 },
    accountId: { targetField: "account_id", transform: "direct", confidence: 1.0 },
  },

  Opportunity: {
    externalId: { targetField: "external_id", transform: "direct", confidence: 1.0 },
    objectType: { targetField: "object_type", transform: "direct", confidence: 1.0 },
    createdAt: { targetField: "created_at", transform: "iso_date", confidence: 1.0 },
    updatedAt: { targetField: "updated_at", transform: "iso_date", confidence: 1.0 },
    displayName: { targetField: "deal_name", transform: "direct", confidence: 1.0 },
    stage: { targetField: "stage", transform: "direct", confidence: 1.0 },
    amount: { targetField: "amount", transform: "number", confidence: 1.0 },
    closeDate: { targetField: "close_date", transform: "iso_date", confidence: 1.0 },
    probability: { targetField: "probability", transform: "number", confidence: 1.0 },
    accountId: { targetField: "account_id", transform: "direct", confidence: 1.0 },
    description: { targetField: "description", transform: "direct", confidence: 0.90 },
  },

  Lead: {
    externalId: { targetField: "external_id", transform: "direct", confidence: 1.0 },
    objectType: { targetField: "object_type", transform: "direct", confidence: 1.0 },
    createdAt: { targetField: "created_at", transform: "iso_date", confidence: 1.0 },
    updatedAt: { targetField: "updated_at", transform: "iso_date", confidence: 1.0 },
    displayName: { targetField: "full_name", transform: "direct", confidence: 1.0 },
    email: { targetField: "email", transform: "normalize_email", confidence: 1.0 },
    companyName: { targetField: "company_name", transform: "direct", confidence: 1.0 },
    stage: { targetField: "status", transform: "direct", confidence: 0.90 },
    leadSource: { targetField: "source", transform: "direct", confidence: 1.0 },
  },

  Case: {
    externalId: { targetField: "external_id", transform: "direct", confidence: 1.0 },
    objectType: { targetField: "object_type", transform: "direct", confidence: 1.0 },
    createdAt: { targetField: "created_at", transform: "iso_date", confidence: 1.0 },
    updatedAt: { targetField: "updated_at", transform: "iso_date", confidence: 1.0 },
    displayName: { targetField: "subject", transform: "direct", confidence: 1.0 },
    stage: { targetField: "status", transform: "direct", confidence: 0.90 },
    priority: { targetField: "priority", transform: "direct", confidence: 1.0 },
    description: { targetField: "description", transform: "direct", confidence: 1.0 },
    origin: { targetField: "source", transform: "direct", confidence: 0.90 },
    accountId: { targetField: "account_id", transform: "direct", confidence: 1.0 },
  },
};
