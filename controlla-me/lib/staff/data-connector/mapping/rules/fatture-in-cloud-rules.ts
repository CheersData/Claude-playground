/**
 * Fatture in Cloud Field Mapping Rules — Connector-specific deterministic rules.
 *
 * Maps FattureRecord fields to normalized target fields.
 * Covers 3 entity types: issued_invoice, received_invoice, client.
 *
 * Format: Record<entityType, Record<sourceFieldName, FieldMappingRule>>
 * The source field names match the FattureRecord interface (camelCase).
 *
 * ADR: adr-ai-mapping-hybrid.md
 */

import type { FieldMappingRule } from "./stripe-rules";

/**
 * Base mapping rules shared across issued and received invoices.
 * The FattureRecord parser produces the same invoice fields for both directions.
 */
const FATTURE_INVOICE_BASE_RULES: Record<string, FieldMappingRule> = {
  externalId: { targetField: "external_id", transform: "direct", confidence: 1.0 },
  objectType: { targetField: "object_type", transform: "direct", confidence: 1.0 },
  status: { targetField: "status", transform: "direct", confidence: 1.0 },
  name: { targetField: "full_name", transform: "direct", confidence: 0.90 },
  email: { targetField: "email", transform: "normalize_email", confidence: 1.0 },
  amount: { targetField: "amount", transform: "number", confidence: 1.0 },
  currency: { targetField: "currency", transform: "direct", confidence: 1.0 },
  createdAt: { targetField: "created_at", transform: "iso_date", confidence: 1.0 },
  updatedAt: { targetField: "updated_at", transform: "iso_date", confidence: 1.0 },

  // Invoice-specific fields
  invoiceNumber: { targetField: "invoice_number", transform: "direct", confidence: 1.0 },
  invoiceDate: { targetField: "invoice_date", transform: "iso_date", confidence: 1.0 },
  netAmount: { targetField: "net_amount", transform: "number", confidence: 1.0 },
  vatAmount: { targetField: "vat_amount", transform: "number", confidence: 1.0 },
  grossAmount: { targetField: "gross_amount", transform: "number", confidence: 1.0 },
  vatRate: { targetField: "vat_rate", transform: "number", confidence: 1.0 },
  documentType: { targetField: "document_type", transform: "direct", confidence: 1.0 },
  paymentStatus: { targetField: "payment_status", transform: "direct", confidence: 1.0 },
  paymentMethod: { targetField: "payment_method", transform: "direct", confidence: 0.95 },
  eInvoice: { targetField: "e_invoice", transform: "boolean", confidence: 1.0 },
  eInvoiceStatus: { targetField: "e_invoice_status", transform: "direct", confidence: 1.0 },
  description: { targetField: "description", transform: "direct", confidence: 0.90 },
  fiscalYear: { targetField: "fiscal_year", transform: "number", confidence: 1.0 },

  // Entity fields (from invoice counterparty)
  companyName: { targetField: "company_name", transform: "direct", confidence: 1.0 },
  vatNumber: { targetField: "vat_number", transform: "normalize_piva", confidence: 1.0 },
  taxCode: { targetField: "tax_code", transform: "normalize_cf", confidence: 1.0 },
  address: { targetField: "address", transform: "direct", confidence: 0.95 },
  city: { targetField: "city", transform: "direct", confidence: 1.0 },
  province: { targetField: "province", transform: "direct", confidence: 1.0 },
  postalCode: { targetField: "postal_code", transform: "direct", confidence: 1.0 },
  country: { targetField: "country", transform: "direct", confidence: 1.0 },
};

/**
 * Fatture in Cloud mapping rules per entity type.
 *
 * Outer key = FattureRecord.objectType (issued_invoice, received_invoice, client)
 * Inner key = FattureRecord field name (camelCase as produced by fatture-parser.ts)
 * Value = target field + transform + confidence
 */
export const FATTURE_IN_CLOUD_RULES: Record<string, Record<string, FieldMappingRule>> = {
  issued_invoice: { ...FATTURE_INVOICE_BASE_RULES },
  received_invoice: { ...FATTURE_INVOICE_BASE_RULES },

  client: {
    externalId: { targetField: "external_id", transform: "direct", confidence: 1.0 },
    objectType: { targetField: "object_type", transform: "direct", confidence: 1.0 },
    name: { targetField: "full_name", transform: "direct", confidence: 1.0 },
    email: { targetField: "email", transform: "normalize_email", confidence: 1.0 },
    phone: { targetField: "phone", transform: "normalize_phone", confidence: 1.0 },
    createdAt: { targetField: "created_at", transform: "iso_date", confidence: 1.0 },
    updatedAt: { targetField: "updated_at", transform: "iso_date", confidence: 1.0 },
    description: { targetField: "description", transform: "direct", confidence: 0.90 },

    // Entity fields
    companyName: { targetField: "company_name", transform: "direct", confidence: 1.0 },
    vatNumber: { targetField: "vat_number", transform: "normalize_piva", confidence: 1.0 },
    taxCode: { targetField: "tax_code", transform: "normalize_cf", confidence: 1.0 },
    address: { targetField: "address", transform: "direct", confidence: 0.95 },
    city: { targetField: "city", transform: "direct", confidence: 1.0 },
    province: { targetField: "province", transform: "direct", confidence: 1.0 },
    postalCode: { targetField: "postal_code", transform: "direct", confidence: 1.0 },
    country: { targetField: "country", transform: "direct", confidence: 1.0 },

    // Client-specific fields
    clientType: { targetField: "client_type", transform: "direct", confidence: 1.0 },
    certifiedEmail: { targetField: "certified_email", transform: "normalize_email", confidence: 1.0 },
    sdiCode: { targetField: "sdi_code", transform: "direct", confidence: 1.0 },
  },
};
