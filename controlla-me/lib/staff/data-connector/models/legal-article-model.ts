/**
 * Legal Article Model — Data Modeler attivo per articoli legali.
 *
 * Non e un semplice checker. Decide COME strutturare i dati per:
 * - Ricerca semantica (embeddings voyage-law-2)
 * - Navigazione ad albero (hierarchy JSONB)
 * - Filtro rapido per istituto (GIN index su related_institutes)
 * - Upsert idempotente (unique su law_source + article_reference)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ModelInterface,
  DataModelSpec,
  ModelResult,
  ParsedArticle,
} from "../types";

export class LegalArticleModel implements ModelInterface {
  async analyze(sampleData: unknown[]): Promise<DataModelSpec> {
    const samples = sampleData as ParsedArticle[];

    // Analisi dati grezzi
    const hasHierarchy = samples.some(
      (s) => s.hierarchy && Object.keys(s.hierarchy).length > 0
    );
    const avgTextLength =
      samples.reduce((sum, s) => sum + (s.articleText?.length ?? 0), 0) /
      Math.max(samples.length, 1);
    const hasUrls = samples.some((s) => !!s.sourceUrl);

    const columns: DataModelSpec["columns"] = [
      {
        name: "law_source",
        type: "text NOT NULL",
        purpose: "Identificazione fonte per filtro e lookup diretto",
        exists: false,
      },
      {
        name: "article_reference",
        type: "text NOT NULL",
        purpose: "Numero articolo per lookup diretto (Art. 1537)",
        exists: false,
      },
      {
        name: "article_title",
        type: "text",
        purpose: "Titolo articolo per display",
        exists: false,
      },
      {
        name: "article_text",
        type: "text NOT NULL",
        purpose: `Testo completo per RAG e display (media ${Math.round(avgTextLength)} chars)`,
        exists: false,
      },
      {
        name: "hierarchy",
        type: "jsonb DEFAULT '{}'",
        purpose: hasHierarchy
          ? "Navigazione ad albero (Libro > Titolo > Capo > Sezione)"
          : "Struttura gerarchica (non presente nei sample)",
        exists: false,
      },
      {
        name: "keywords",
        type: "text[] DEFAULT '{}'",
        purpose: "Filtro rapido per termine giuridico (estrazione automatica)",
        exists: false,
      },
      {
        name: "related_institutes",
        type: "text[] DEFAULT '{}'",
        purpose:
          "Collegamento istituti giuridici (vendita_a_corpo, fideiussione)",
        exists: false,
      },
      {
        name: "embedding",
        type: "vector(1024)",
        purpose: "Ricerca semantica via Voyage AI voyage-law-2",
        exists: false,
      },
      {
        name: "source_url",
        type: "text",
        purpose: hasUrls
          ? "URL alla fonte originale"
          : "URL fonte (non presente nei sample)",
        exists: false,
      },
      {
        name: "is_in_force",
        type: "boolean DEFAULT true",
        purpose: "Flag vigenza articolo",
        exists: false,
      },
      {
        name: "last_synced_at",
        type: "timestamptz",
        purpose: "Delta update tracking",
        exists: false,
      },
    ];

    return {
      tableName: "legal_articles",
      columns,
      indexes: [
        {
          name: "legal_articles_embedding_idx",
          type: "hnsw",
          purpose: "Ricerca semantica veloce (cosine distance)",
          exists: false,
        },
        {
          name: "legal_articles_source_ref_key",
          type: "btree unique",
          purpose: "Upsert idempotente su (law_source, article_reference)",
          exists: false,
        },
        {
          name: "legal_articles_institutes_idx",
          type: "gin",
          purpose: "Filtro per istituto giuridico",
          exists: false,
        },
      ],
      embeddingStrategy: {
        model: "voyage-law-2",
        dimensions: 1024,
        fields: [
          "law_source",
          "article_reference",
          "article_title",
          "article_text",
        ],
        inputType: "document",
      },
      transformRules: [
        {
          sourceField: "articleNumber",
          targetColumn: "article_reference",
          transform: "format_as_Art_N",
        },
        {
          sourceField: "articleTitle",
          targetColumn: "article_title",
          transform: "direct",
        },
        {
          sourceField: "articleText",
          targetColumn: "article_text",
          transform: "clean_html_entities",
        },
        {
          sourceField: "hierarchy",
          targetColumn: "hierarchy",
          transform: "direct",
        },
        {
          sourceField: "(computed)",
          targetColumn: "keywords",
          transform: "extract_legal_terms_from_text",
        },
        {
          sourceField: "(computed)",
          targetColumn: "related_institutes",
          transform: "map_article_to_institutes",
        },
        {
          sourceField: "(concatenated)",
          targetColumn: "embedding",
          transform: "voyage_law_2_embedding",
        },
      ],
    };
  }

  async checkSchema(spec: DataModelSpec): Promise<ModelResult> {
    const admin = createAdminClient();

    // Verifica che la tabella esista (rpc opzionale, ignoriamo se non esiste)
    let _tables: unknown = null;
    try {
      const { data } = await admin.rpc("pg_tables_check", {});
      _tables = data;
    } catch {
      // RPC non disponibile, proseguiamo con fallback
    }

    // Fallback: query information_schema direttamente
    const { data: columns, error: colError } = await admin
      .from("information_schema.columns" as "connector_sync_log")
      .select("column_name")
      .eq("table_schema" as "source_id", "public")
      .eq("table_name" as "source_id", spec.tableName);

    if (colError) {
      // Se non possiamo verificare via information_schema, proviamo una query diretta
      const { error: testError } = await admin
        .from(spec.tableName as "legal_articles")
        .select("id")
        .limit(1);

      if (testError) {
        return {
          ready: false,
          spec: { ...spec, migrationSQL: this.generateMigrationSQL(spec) },
          message: `Tabella ${spec.tableName} non esiste o non accessibile: ${testError.message}`,
        };
      }

      // Tabella esiste ma non possiamo verificare colonne in dettaglio
      return {
        ready: true,
        spec,
        message: `Tabella ${spec.tableName} esiste (verifica colonne non disponibile via Supabase client)`,
      };
    }

    // Verifica colonne
    const existingCols = new Set(
      (columns ?? []).map(
        (c: Record<string, unknown>) => c.column_name as string
      )
    );
    const updatedColumns = spec.columns.map((col) => ({
      ...col,
      exists: existingCols.has(col.name),
    }));

    const missingColumns = updatedColumns.filter((c) => !c.exists);
    const updatedSpec = { ...spec, columns: updatedColumns };

    if (missingColumns.length > 0) {
      const alterSQL = missingColumns
        .map(
          (c) =>
            `ALTER TABLE ${spec.tableName} ADD COLUMN IF NOT EXISTS ${c.name} ${c.type};`
        )
        .join("\n");

      return {
        ready: false,
        spec: { ...updatedSpec, migrationSQL: alterSQL },
        message: `${missingColumns.length} colonne mancanti: ${missingColumns.map((c) => c.name).join(", ")}`,
      };
    }

    return {
      ready: true,
      spec: updatedSpec,
      message: `Tabella ${spec.tableName} pronta | ${updatedColumns.length} colonne verificate`,
    };
  }

  describeTransform(spec: DataModelSpec): string {
    return spec.transformRules
      .map((r) => `${r.sourceField} → ${r.targetColumn} (${r.transform})`)
      .join(" | ");
  }

  private generateMigrationSQL(spec: DataModelSpec): string {
    const cols = spec.columns
      .map((c) => `  ${c.name} ${c.type}`)
      .join(",\n");

    return `CREATE TABLE IF NOT EXISTS public.${spec.tableName} (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n${cols},\n  created_at timestamptz DEFAULT now(),\n  updated_at timestamptz DEFAULT now()\n);`;
  }
}
