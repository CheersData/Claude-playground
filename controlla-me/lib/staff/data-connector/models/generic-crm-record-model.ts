/**
 * Generic CRM Record Model — Data Modeler fallback for connectors
 * that don't have a connector-specific model.
 *
 * Used by: universal-rest, csv, and any future connector using
 * dataType "crm-records" without a composite-key model registration
 * (e.g. "crm-records:universal-rest" not found).
 *
 * Describes the same crm_records schema from 030_integration_tables.sql
 * as StripeRecordModel/HubSpotRecordModel, but without connector-specific
 * field assumptions.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ModelInterface,
  DataModelSpec,
  ModelResult,
} from "../types";

export class GenericCRMRecordModel implements ModelInterface {
  async analyze(sampleData: unknown[]): Promise<DataModelSpec> {
    // Extract object types from sample data if available
    const samples = sampleData as Array<Record<string, unknown>>;
    const objectTypes = [
      ...new Set(
        samples
          .map(
            (s) =>
              s.objectType ?? s.object_type ?? s.entity_type ?? s.entityType
          )
          .filter(Boolean)
          .map(String)
      ),
    ];

    // Extract field names from sample data for documentation
    const fieldNames = new Set<string>();
    for (const s of samples.slice(0, 10)) {
      for (const key of Object.keys(s)) {
        fieldNames.add(key);
      }
    }

    const columns: DataModelSpec["columns"] = [
      {
        name: "user_id",
        type: "uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE",
        purpose: "Owner user. System UUID (00000000-...) for backend syncs",
        exists: false,
      },
      {
        name: "connector_source",
        type: "text NOT NULL",
        purpose: "Connector origin (e.g. 'universal-rest', 'csv')",
        exists: false,
      },
      {
        name: "object_type",
        type: "text NOT NULL",
        purpose: `Object type: ${objectTypes.length > 0 ? objectTypes.join(", ") : "(auto-detected from records)"}`,
        exists: false,
      },
      {
        name: "external_id",
        type: "text NOT NULL",
        purpose: "External unique identifier from the source system",
        exists: false,
      },
      {
        name: "data",
        type: "jsonb NOT NULL",
        purpose: `Raw data as JSONB. Fields: ${fieldNames.size > 0 ? [...fieldNames].slice(0, 20).join(", ") : "(varies by source)"}`,
        exists: false,
      },
      {
        name: "mapped_fields",
        type: "jsonb DEFAULT '{}'",
        purpose:
          "Normalized fields for quick access, populated by MappingEngine",
        exists: false,
      },
      {
        name: "synced_at",
        type: "timestamptz NOT NULL DEFAULT now()",
        purpose: "When this record was last synced",
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
          purpose: "Filtro per tipo oggetto",
          exists: false,
        },
        {
          name: "idx_crm_records_synced_at",
          type: "btree",
          purpose: "Ordinamento per ultimo sync",
          exists: false,
        },
      ],
      transformRules: [
        {
          sourceField: "externalId / id",
          targetColumn: "external_id",
          transform: "direct (auto-detected from record)",
        },
        {
          sourceField: "objectType / entity_type",
          targetColumn: "object_type",
          transform: "direct (auto-detected from record)",
        },
        {
          sourceField: "(entire record)",
          targetColumn: "data",
          transform: "json_serialize (full record as JSONB)",
        },
        {
          sourceField: "(MappingEngine output)",
          targetColumn: "mapped_fields",
          transform: "json_serialize (normalized fields from hybrid mapping)",
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
        spec,
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
}
