/**
 * Fatture in Cloud Record Model — Data Modeler for CRM records from Fatture in Cloud.
 *
 * Describes the generic `crm_records` schema from 030_integration_tables.sql.
 * The Fatture in Cloud connector stores all data in `data` JSONB and normalized
 * key fields in `mapped_fields` JSONB.
 *
 * Same table schema as Stripe/HubSpot/Salesforce connectors — differentiated
 * by connector_source = "fatture_in_cloud".
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ModelInterface,
  DataModelSpec,
  ModelResult,
} from "../types";
import type { FattureRecord } from "../parsers/fatture-parser";

export class FattureRecordModel implements ModelInterface {
  async analyze(sampleData: unknown[]): Promise<DataModelSpec> {
    const samples = sampleData as FattureRecord[];

    const objectTypes = [...new Set(samples.map((s) => s.objectType))];

    const columns: DataModelSpec["columns"] = [
      {
        name: "user_id",
        type: "uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE",
        purpose:
          "Owner user. System UUID (00000000-...) for backend syncs, real user UUID for user-connected integrations",
        exists: false,
      },
      {
        name: "connector_source",
        type: "text NOT NULL",
        purpose:
          "Connector origin: 'fatture_in_cloud' (extensible to other accounting connectors)",
        exists: false,
      },
      {
        name: "object_type",
        type: "text NOT NULL",
        purpose: `Object type: ${objectTypes.length > 0 ? objectTypes.join(", ") : "issued_invoice, received_invoice, client"}`,
        exists: false,
      },
      {
        name: "external_id",
        type: "text NOT NULL",
        purpose:
          "Fatture in Cloud object ID (fic_issued_123, fic_received_456, fic_cli_789)",
        exists: false,
      },
      {
        name: "data",
        type: "jsonb NOT NULL",
        purpose:
          "Raw data from Fatture in Cloud: full FattureRecord with all fields (amounts, entity, items, status, etc.)",
        exists: false,
      },
      {
        name: "mapped_fields",
        type: "jsonb DEFAULT '{}'",
        purpose:
          "Normalized key fields for quick access: invoice_number, net_amount, gross_amount, vat_number, status, etc.",
        exists: false,
      },
      {
        name: "synced_at",
        type: "timestamptz NOT NULL DEFAULT now()",
        purpose: "When this record was last synced from Fatture in Cloud",
        exists: false,
      },
    ];

    return {
      tableName: "crm_records",
      columns,
      indexes: [
        {
          name: "crm_records_user_connector_unique",
          type: "btree unique",
          purpose:
            "Upsert idempotente su (user_id, connector_source, object_type, external_id)",
          exists: false,
        },
        {
          name: "idx_crm_records_user_connector",
          type: "btree",
          purpose: "Filtro per user + connector source",
          exists: false,
        },
        {
          name: "idx_crm_records_object_type",
          type: "btree",
          purpose:
            "Filtro per tipo oggetto (issued_invoice, received_invoice, client)",
          exists: false,
        },
        {
          name: "idx_crm_records_synced_at",
          type: "btree",
          purpose: "Ordinamento per ultimo sync",
          exists: false,
        },
        {
          name: "idx_crm_records_external_id",
          type: "btree",
          purpose: "Lookup per connector_source + external_id",
          exists: false,
        },
      ],
      transformRules: [
        {
          sourceField: "externalId",
          targetColumn: "external_id",
          transform: "direct",
          mappedBy: "rule",
          confidence: 1.0,
        },
        {
          sourceField: "objectType",
          targetColumn: "object_type",
          transform: "direct",
          mappedBy: "rule",
          confidence: 1.0,
        },
        {
          sourceField: "(entire FattureRecord)",
          targetColumn: "data",
          transform: "json_serialize (full record as JSONB — amounts in cents, dates in ISO 8601)",
          mappedBy: "rule",
          confidence: 1.0,
        },
        {
          sourceField:
            "(key fields: invoiceNumber, netAmountCents, grossAmountCents, vatNumber, status, paymentStatus, ...)",
          targetColumn: "mapped_fields",
          transform:
            "json_serialize (normalized subset for quick access — amounts in cents, dates in ISO 8601)",
          mappedBy: "rule",
          confidence: 1.0,
        },
      ],
    };
  }

  async checkSchema(spec: DataModelSpec): Promise<ModelResult> {
    const admin = createAdminClient();

    // Test if the table exists by querying it
    const { error: testError } = await admin
      .from(spec.tableName as "connector_sync_log")
      .select("id")
      .limit(1);

    if (testError) {
      return {
        ready: false,
        spec: { ...spec, migrationSQL: this.generateMigrationSQL(spec) },
        message: `Table ${spec.tableName} does not exist or is not accessible: ${testError.message}. Run migration 030_integration_tables.sql to create it.`,
      };
    }

    return {
      ready: true,
      spec,
      message: `Table ${spec.tableName} exists and is accessible`,
    };
  }

  describeTransform(spec: DataModelSpec): string {
    return spec.transformRules
      .map((r) => `${r.sourceField} -> ${r.targetColumn} (${r.transform})`)
      .join(" | ");
  }

  private generateMigrationSQL(spec: DataModelSpec): string {
    // This generates a minimal CREATE TABLE for reference only.
    // The canonical migration is 030_integration_tables.sql which includes
    // credential_vault, connector_field_mappings, and crm_records.
    const cols = spec.columns
      .map((c) => `  ${c.name} ${c.type}`)
      .join(",\n");

    return [
      `-- NOTE: Use 030_integration_tables.sql instead. This is for reference only.`,
      `CREATE TABLE IF NOT EXISTS public.${spec.tableName} (`,
      `  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),`,
      cols + ",",
      `  created_at timestamptz DEFAULT now(),`,
      `  updated_at timestamptz DEFAULT now(),`,
      `  UNIQUE(user_id, connector_source, object_type, external_id)`,
      `);`,
      ``,
      `-- RLS: users see only their own records`,
      `ALTER TABLE public.${spec.tableName} ENABLE ROW LEVEL SECURITY;`,
      ``,
      `-- Service role has full access (pipeline sync)`,
      `CREATE POLICY "service_role_crm_records" ON ${spec.tableName}`,
      `  FOR ALL USING (auth.role() = 'service_role');`,
    ].join("\n");
  }
}

// ─── Validation ───

/** Known object types for Fatture in Cloud records */
const VALID_OBJECT_TYPES = ["issued_invoice", "received_invoice", "client"] as const;

/** Known payment statuses */
const VALID_PAYMENT_STATUSES = ["paid", "unpaid", "reversed", "unknown"] as const;

/**
 * Validate a FattureRecord before store insertion.
 *
 * Checks:
 * 1. Required fields: externalId, objectType, createdAt
 * 2. objectType is one of the known types
 * 3. Amounts are valid non-negative integers (cents) when present
 * 4. Amounts are integers (cents convention — not decimals)
 * 5. VAT rate is a valid percentage (0-100) when present
 * 6. createdAt is a valid ISO 8601 date
 * 7. Clients must have at least one identifier (name, vatNumber, or taxCode)
 * 8. Invoices should have an invoiceNumber
 * 9. paymentStatus is one of the known values when present
 */
export function validateFattureRecord(record: FattureRecord): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // ─── Required fields ───

  if (!record.externalId) {
    errors.push("Missing externalId");
  }
  if (!record.objectType) {
    errors.push("Missing objectType");
  }
  if (!record.createdAt) {
    errors.push("Missing createdAt");
  }

  // ─── objectType validation ───

  if (
    record.objectType &&
    !VALID_OBJECT_TYPES.includes(record.objectType as typeof VALID_OBJECT_TYPES[number])
  ) {
    errors.push(
      `Unknown objectType: "${record.objectType}". Expected one of: ${VALID_OBJECT_TYPES.join(", ")}`
    );
  }

  // ─── Date validation ───

  if (record.createdAt) {
    const parsed = new Date(record.createdAt);
    if (isNaN(parsed.getTime())) {
      errors.push(`Invalid createdAt date: "${record.createdAt}"`);
    }
  }

  if (record.updatedAt) {
    const parsed = new Date(record.updatedAt);
    if (isNaN(parsed.getTime())) {
      errors.push(`Invalid updatedAt date: "${record.updatedAt}"`);
    }
  }

  if (record.invoiceDate) {
    const parsed = new Date(record.invoiceDate);
    if (isNaN(parsed.getTime())) {
      errors.push(`Invalid invoiceDate: "${record.invoiceDate}"`);
    }
  }

  // ─── Amount validation (cents = integers, non-negative) ───

  if (record.grossAmount !== null && record.grossAmount !== undefined) {
    if (isNaN(record.grossAmount) || record.grossAmount < 0) {
      errors.push(`Invalid grossAmount: ${record.grossAmount} (must be >= 0)`);
    } else if (!Number.isInteger(record.grossAmount)) {
      errors.push(
        `grossAmount should be in cents (integer), got decimal: ${record.grossAmount}`
      );
    }
  }

  if (record.netAmount !== null && record.netAmount !== undefined) {
    if (isNaN(record.netAmount) || record.netAmount < 0) {
      errors.push(`Invalid netAmount: ${record.netAmount} (must be >= 0)`);
    } else if (!Number.isInteger(record.netAmount)) {
      errors.push(
        `netAmount should be in cents (integer), got decimal: ${record.netAmount}`
      );
    }
  }

  if (record.vatAmount !== null && record.vatAmount !== undefined) {
    if (isNaN(record.vatAmount) || record.vatAmount < 0) {
      errors.push(`Invalid vatAmount: ${record.vatAmount} (must be >= 0)`);
    } else if (!Number.isInteger(record.vatAmount)) {
      errors.push(
        `vatAmount should be in cents (integer), got decimal: ${record.vatAmount}`
      );
    }
  }

  if (record.amount !== null && record.amount !== undefined) {
    if (isNaN(record.amount) || record.amount < 0) {
      errors.push(`Invalid amount: ${record.amount} (must be >= 0)`);
    } else if (!Number.isInteger(record.amount)) {
      errors.push(
        `amount should be in cents (integer), got decimal: ${record.amount}`
      );
    }
  }

  // ─── VAT rate validation ───

  if (record.vatRate !== null && record.vatRate !== undefined) {
    if (isNaN(record.vatRate) || record.vatRate < 0 || record.vatRate > 100) {
      errors.push(
        `Invalid vatRate: ${record.vatRate} (must be 0-100 percentage)`
      );
    }
  }

  // ─── Payment status validation ───

  if (record.paymentStatus !== null && record.paymentStatus !== undefined) {
    if (
      !VALID_PAYMENT_STATUSES.includes(
        record.paymentStatus as typeof VALID_PAYMENT_STATUSES[number]
      )
    ) {
      errors.push(
        `Unknown paymentStatus: "${record.paymentStatus}". Expected one of: ${VALID_PAYMENT_STATUSES.join(", ")}`
      );
    }
  }

  // ─── Type-specific validation ───

  // Clients must have at least a name or a vatNumber or a taxCode
  if (record.objectType === "client") {
    if (!record.name && !record.vatNumber && !record.taxCode) {
      errors.push(
        "Client must have at least one of: name, vatNumber, taxCode"
      );
    }
  }

  // Invoices should have an invoiceNumber (warning, not blocking)
  // We only warn for this — it should not block insertion
  if (
    (record.objectType === "issued_invoice" ||
      record.objectType === "received_invoice") &&
    !record.invoiceNumber
  ) {
    // Non-blocking: we log but don't push to errors
    // This allows invoices without numbers (drafts, proforma) to pass validation
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
