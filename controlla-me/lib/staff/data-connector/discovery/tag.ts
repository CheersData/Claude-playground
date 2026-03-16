/**
 * Schema Discovery — Tag
 *
 * Tags entities and fields with semantic metadata for:
 *   - GDPR/privacy compliance (PII detection)
 *   - Field classification (financial, contact, temporal, etc.)
 *   - Mapping hints (helps the mapping engine match source->target)
 *
 * Uses deterministic rules (pattern matching on field names/types).
 * LLM fallback for ambiguous fields is deferred to mapping phase.
 *
 * NOTE: Types are defined in ./types.ts (single source of truth).
 */

import type {
  SchemaField,
  FieldTag,
  TaggedField,
  TagResult,
} from "./types";

// Re-export types for backward compatibility
export type { FieldTag, TaggedField, TagResult };

// ─── Tagging rules ───

interface TagRule {
  tag: FieldTag;
  namePatterns?: RegExp[];
  typePatterns?: string[];
  piiLevel?: TaggedField["piiLevel"];
}

const TAG_RULES: TagRule[] = [
  // PII — email
  {
    tag: "pii:email",
    namePatterns: [/email/i, /e_mail/i, /mail_address/i],
    piiLevel: "high",
  },
  // PII — phone
  {
    tag: "pii:phone",
    namePatterns: [/phone/i, /telefon/i, /mobile/i, /fax/i, /cellulare/i],
    piiLevel: "medium",
  },
  // PII — name
  {
    tag: "pii:name",
    namePatterns: [
      /^first_?name$/i, /^last_?name$/i, /^full_?name$/i,
      /^nome$/i, /^cognome$/i, /^ragione_sociale/i,
      /^contact_?name/i, /^display_?name/i,
    ],
    piiLevel: "medium",
  },
  // PII — address
  {
    tag: "pii:address",
    namePatterns: [
      /address/i, /indirizzo/i, /street/i, /city/i, /citta/i,
      /zip/i, /cap$/i, /postal/i, /province/i, /provincia/i,
      /country/i, /stato/i, /region/i,
    ],
    piiLevel: "medium",
  },
  // PII — fiscal code
  {
    tag: "pii:fiscal-code",
    namePatterns: [
      /codice_fiscale/i, /fiscal_code/i, /tax_id/i,
      /partita_iva/i, /vat_number/i, /p_iva/i, /cf$/i,
    ],
    piiLevel: "high",
  },
  // Financial
  {
    tag: "financial:amount",
    namePatterns: [
      /amount/i, /price/i, /prezzo/i, /importo/i, /total/i,
      /revenue/i, /cost/i, /costo/i, /fee/i, /discount/i, /sconto/i,
      /^hs_amount/i, /deal_amount/i, /annualrevenue/i,
    ],
    piiLevel: "none",
  },
  {
    tag: "financial:currency",
    namePatterns: [/currency/i, /valuta/i, /deal_currency/i],
    piiLevel: "none",
  },
  // Temporal
  {
    tag: "temporal:created",
    namePatterns: [/created_?at/i, /create_?date/i, /data_creazione/i, /hs_createdate/i],
    piiLevel: "none",
  },
  {
    tag: "temporal:updated",
    namePatterns: [
      /updated_?at/i, /modified_?at/i, /last_?modified/i,
      /data_modifica/i, /hs_lastmodifieddate/i,
    ],
    piiLevel: "none",
  },
  // Identifiers
  {
    tag: "identifier:primary",
    namePatterns: [/^id$/i, /^hs_object_id$/i, /^external_id$/i],
    piiLevel: "none",
  },
  {
    tag: "identifier:foreign",
    namePatterns: [/_id$/i, /_ref$/i, /^associated_/i, /^hs_.*_id$/i],
    piiLevel: "none",
  },
  // Status
  {
    tag: "status",
    namePatterns: [
      /status/i, /stage/i, /stato/i, /fase/i, /lifecycle/i,
      /pipeline/i, /hs_pipeline/i, /dealstage/i,
    ],
    piiLevel: "none",
  },
  // Metrics
  {
    tag: "metric",
    namePatterns: [
      /count/i, /score/i, /num_/i, /number_of/i, /percentage/i,
      /rate/i, /ratio/i, /punteggio/i,
    ],
    piiLevel: "none",
  },
  // URLs
  {
    tag: "url",
    namePatterns: [/url$/i, /website/i, /link/i, /sito/i, /domain/i],
    piiLevel: "none",
  },
];

// ─── Tagging engine ───

/**
 * Apply tagging rules to a single field.
 */
function tagField(field: SchemaField): TaggedField {
  const tags: FieldTag[] = [];
  let piiLevel: TaggedField["piiLevel"] = "none";

  for (const rule of TAG_RULES) {
    let matched = false;

    // Match by field name
    if (rule.namePatterns) {
      matched = rule.namePatterns.some((p) => p.test(field.name));
    }

    // Match by field type
    if (!matched && rule.typePatterns) {
      matched = rule.typePatterns.includes(field.type);
    }

    if (matched) {
      tags.push(rule.tag);

      // Add parent tag (e.g., "pii" for "pii:email")
      const parentTag = rule.tag.split(":")[0] as FieldTag;
      if (parentTag !== rule.tag && !tags.includes(parentTag)) {
        tags.push(parentTag);
      }

      // Escalate PII level
      if (rule.piiLevel) {
        const levels = ["none", "low", "medium", "high"] as const;
        if (levels.indexOf(rule.piiLevel) > levels.indexOf(piiLevel)) {
          piiLevel = rule.piiLevel;
        }
      }
    }
  }

  // Type-based fallback tags
  if (tags.length === 0) {
    if (field.type === "datetime" || field.type === "date") {
      tags.push("temporal");
    } else if (field.type === "number" && !field.name.match(/_id$/i)) {
      tags.push("metric");
    } else if (field.type === "text" || field.type === "textarea") {
      tags.push("text");
    }
  }

  return { ...field, tags, piiLevel };
}

/**
 * Tag all fields of an entity.
 */
export function tagEntityFields(
  entityName: string,
  fields: SchemaField[]
): TagResult {
  const taggedFields = fields.map(tagField);

  return {
    entityName,
    taggedFields,
    piiFieldCount: taggedFields.filter((f) => f.piiLevel !== "none").length,
    financialFieldCount: taggedFields.filter((f) =>
      f.tags.some((t) => t.startsWith("financial"))
    ).length,
    taggedAt: new Date().toISOString(),
  };
}
