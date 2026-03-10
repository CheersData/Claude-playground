/**
 * HubSpot Record Model — Data Modeler for CRM records from HubSpot.
 *
 * Describes the generic `crm_records` schema from 030_integration_tables.sql.
 * The HubSpot connector stores raw properties in `data` JSONB and normalized
 * key fields in `mapped_fields` JSONB.
 *
 * Same table as Stripe — differentiated by `connector_source = 'hubspot'`.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ModelInterface,
  DataModelSpec,
  ModelResult,
} from "../types";
import type { HubSpotRecord } from "../parsers/hubspot-parser";

export class HubSpotRecordModel implements ModelInterface {
  async analyze(sampleData: unknown[]): Promise<DataModelSpec> {
    const samples = sampleData as HubSpotRecord[];

    const objectTypes = [...new Set(samples.map((s) => s.objectType))];

    const columns: DataModelSpec["columns"] = [
      {
        name: "user_id",
        type: "uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE",
        purpose:
          "Owner user. System UUID (00000000-...) for backend syncs like HubSpot",
        exists: false,
      },
      {
        name: "connector_source",
        type: "text NOT NULL",
        purpose: "Connector origin: 'hubspot'",
        exists: false,
      },
      {
        name: "object_type",
        type: "text NOT NULL",
        purpose: `Object type: ${objectTypes.length > 0 ? objectTypes.join(", ") : "contact, company, deal, ticket"}`,
        exists: false,
      },
      {
        name: "external_id",
        type: "text NOT NULL",
        purpose: "HubSpot object ID (numeric string, e.g. '12345')",
        exists: false,
      },
      {
        name: "data",
        type: "jsonb NOT NULL",
        purpose:
          "Raw data from HubSpot: full HubSpotRecord with all properties (displayName, email, stage, amount, rawProperties, etc.)",
        exists: false,
      },
      {
        name: "mapped_fields",
        type: "jsonb DEFAULT '{}'",
        purpose:
          "Normalized key fields for quick access: displayName, email, companyName, stage, pipeline, amount, etc.",
        exists: false,
      },
      {
        name: "synced_at",
        type: "timestamptz NOT NULL DEFAULT now()",
        purpose: "When this record was last synced from HubSpot",
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
          purpose: "Filtro per tipo oggetto (contact, company, deal, ticket)",
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
        },
        {
          sourceField: "objectType",
          targetColumn: "object_type",
          transform: "direct",
        },
        {
          sourceField: "(entire HubSpotRecord)",
          targetColumn: "data",
          transform: "json_serialize (full record as JSONB)",
        },
        {
          sourceField: "(key fields: displayName, email, companyName, stage, pipeline, amount, ...)",
          targetColumn: "mapped_fields",
          transform: "json_serialize (normalized subset for quick access)",
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
 * Validate a HubSpotRecord before store insertion.
 */
export function validateHubSpotRecord(record: HubSpotRecord): {
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

  // Validate objectType is one of the known types
  const validTypes = ["contact", "company", "deal", "ticket"];
  if (record.objectType && !validTypes.includes(record.objectType)) {
    errors.push(`Unknown objectType: ${record.objectType}`);
  }

  // Validate amount is a reasonable number when present (deals)
  if (record.amount !== null && record.amount !== undefined) {
    if (isNaN(record.amount) || record.amount < 0) {
      errors.push(`Invalid amount: ${record.amount}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
