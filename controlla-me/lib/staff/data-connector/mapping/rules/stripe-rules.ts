/**
 * Stripe Field Mapping Rules — Connector-specific deterministic rules.
 *
 * Maps StripeRecord fields to normalized target fields.
 * Covers 4 entity types: customer, subscription, invoice, payment_intent.
 *
 * Format: Record<entityType, Record<sourceFieldName, FieldMappingRule>>
 * The source field names match the StripeRecord interface (camelCase).
 *
 * ADR: adr-ai-mapping-hybrid.md
 */

import type { TransformType, MappingConfidence } from "../types";

export interface FieldMappingRule {
  targetField: string;
  transform: TransformType;
  confidence: MappingConfidence;
}

/**
 * Stripe mapping rules per entity type.
 *
 * Outer key = StripeRecord.objectType (customer, subscription, invoice, payment_intent)
 * Inner key = StripeRecord field name (camelCase as produced by stripe-parser.ts)
 * Value = target field + transform + confidence
 */
export const STRIPE_RULES: Record<string, Record<string, FieldMappingRule>> = {
  customer: {
    externalId: { targetField: "external_id", transform: "direct", confidence: 1.0 },
    objectType: { targetField: "object_type", transform: "direct", confidence: 1.0 },
    status: { targetField: "status", transform: "direct", confidence: 1.0 },
    email: { targetField: "email", transform: "normalize_email", confidence: 1.0 },
    name: { targetField: "full_name", transform: "direct", confidence: 1.0 },
    createdAt: { targetField: "created_at", transform: "iso_date", confidence: 1.0 },
    updatedAt: { targetField: "updated_at", transform: "iso_date", confidence: 1.0 },
    customerId: { targetField: "customer_id", transform: "direct", confidence: 1.0 },
    description: { targetField: "description", transform: "direct", confidence: 0.95 },
    currency: { targetField: "currency", transform: "direct", confidence: 1.0 },
    stripeMetadata: { targetField: "metadata", transform: "json", confidence: 0.90 },
  },

  subscription: {
    externalId: { targetField: "external_id", transform: "direct", confidence: 1.0 },
    objectType: { targetField: "object_type", transform: "direct", confidence: 1.0 },
    status: { targetField: "status", transform: "direct", confidence: 1.0 },
    amount: { targetField: "amount", transform: "number", confidence: 1.0 },
    currency: { targetField: "currency", transform: "direct", confidence: 1.0 },
    createdAt: { targetField: "created_at", transform: "iso_date", confidence: 1.0 },
    updatedAt: { targetField: "updated_at", transform: "iso_date", confidence: 1.0 },
    customerId: { targetField: "customer_id", transform: "direct", confidence: 1.0 },
    subscriptionId: { targetField: "subscription_id", transform: "direct", confidence: 1.0 },
    description: { targetField: "description", transform: "direct", confidence: 0.95 },
    interval: { targetField: "billing_interval", transform: "direct", confidence: 1.0 },
    stripeMetadata: { targetField: "metadata", transform: "json", confidence: 0.90 },
  },

  invoice: {
    externalId: { targetField: "external_id", transform: "direct", confidence: 1.0 },
    objectType: { targetField: "object_type", transform: "direct", confidence: 1.0 },
    status: { targetField: "status", transform: "direct", confidence: 1.0 },
    email: { targetField: "email", transform: "normalize_email", confidence: 1.0 },
    name: { targetField: "full_name", transform: "direct", confidence: 0.95 },
    amount: { targetField: "amount", transform: "number", confidence: 1.0 },
    currency: { targetField: "currency", transform: "direct", confidence: 1.0 },
    createdAt: { targetField: "created_at", transform: "iso_date", confidence: 1.0 },
    updatedAt: { targetField: "updated_at", transform: "iso_date", confidence: 1.0 },
    customerId: { targetField: "customer_id", transform: "direct", confidence: 1.0 },
    subscriptionId: { targetField: "subscription_id", transform: "direct", confidence: 0.95 },
    description: { targetField: "description", transform: "direct", confidence: 0.95 },
    stripeMetadata: { targetField: "metadata", transform: "json", confidence: 0.90 },
  },

  payment_intent: {
    externalId: { targetField: "external_id", transform: "direct", confidence: 1.0 },
    objectType: { targetField: "object_type", transform: "direct", confidence: 1.0 },
    status: { targetField: "status", transform: "direct", confidence: 1.0 },
    email: { targetField: "email", transform: "normalize_email", confidence: 1.0 },
    amount: { targetField: "amount", transform: "number", confidence: 1.0 },
    currency: { targetField: "currency", transform: "direct", confidence: 1.0 },
    createdAt: { targetField: "created_at", transform: "iso_date", confidence: 1.0 },
    customerId: { targetField: "customer_id", transform: "direct", confidence: 1.0 },
    description: { targetField: "description", transform: "direct", confidence: 0.90 },
    stripeMetadata: { targetField: "metadata", transform: "json", confidence: 0.90 },
  },
};
