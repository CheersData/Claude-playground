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
          transform: "json_serialize (full record as JSONB)",
          mappedBy: "rule",
          confidence: 1.0,
        },
        {
          sourceField:
            "(key fields: invoiceNumber, netAmount, grossAmount, vatNumber, status, paymentStatus, ...)",
          targetColumn: "mapped_fields",
          transform:
            "json_serialize (normalized subset for quick access and queries)",
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

/**
 * Validate a FattureRecord before store insertion.
 */
export function validateFattureRecord(record: FattureRecord): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!record.externalId) {
    errors.push("Missing externalId");
  }
  if (!record.objectType) {
    errors.push("Missing objectType");
  }
  if (!record.createdAt) {
    errors.push("Missing createdAt");
  }

  // Validate amounts are reasonable numbers when present (invoices)
  if (record.grossAmount !== null && record.grossAmount !== undefined) {
    if (isNaN(record.grossAmount) || record.grossAmount < 0) {
      errors.push(`Invalid grossAmount: ${record.grossAmount}`);
    }
  }
  if (record.netAmount !== null && record.netAmount !== undefined) {
    if (isNaN(record.netAmount) || record.netAmount < 0) {
      errors.push(`Invalid netAmount: ${record.netAmount}`);
    }
  }
  if (record.vatAmount !== null && record.vatAmount !== undefined) {
    if (isNaN(record.vatAmount) || record.vatAmount < 0) {
      errors.push(`Invalid vatAmount: ${record.vatAmount}`);
    }
  }

  // Clients must have at least a name or a vatNumber
  if (record.objectType === "client") {
    if (!record.name && !record.vatNumber && !record.taxCode) {
      errors.push(
        "Client must have at least one of: name, vatNumber, taxCode"
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
