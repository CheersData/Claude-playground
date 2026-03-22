/**
 * Schema Discovery — Taxonomy
 *
 * Classifies discovered entities into functional categories using 3 strategies:
 *   1. Name-based rules: entity name pattern matching (highest confidence)
 *   2. Field analysis: analyze field names and types to infer category
 *   3. Connector hint: use connector type to bias classification
 *
 * LLM fallback (strategy 4) is reserved for ambiguous entities where
 * strategies 1-3 produce confidence < 0.5. Requires generate() from lib/ai-sdk.
 *
 * Categories: crm, sales, support, accounting, documents, legal, medical, hr, custom
 *
 * Usage:
 *   const taxonomy = classifyEntity("invoices", fields, "fatture_in_cloud");
 *   // { entityName: "invoices", category: "accounting", confidence: 0.95, ... }
 *
 *   const batch = classifyEntities(connectorType, entityMap);
 *   // TaxonomyBatchResult with all entities classified
 */

import type {
  EntityCategory,
  SchemaField,
  TaggedField,
  TaxonomyResult,
  TaxonomyBatchResult,
  LogFn,
} from "./types";

// ─── Name-based classification rules ───

interface NameRule {
  patterns: RegExp[];
  category: EntityCategory;
  confidence: number;
  domainTags: string[];
}

/**
 * Rules sorted by specificity. First match wins.
 * Patterns match against entity names (case-insensitive).
 */
const NAME_RULES: NameRule[] = [
  // ─── Accounting ───
  {
    patterns: [
      /invoice/i, /fattur[ae]/i, /ricevut[ae]/i, /nota_credito/i,
      /credit_note/i, /payment/i, /pagament/i, /bolletta/i,
      /receipt/i, /billing/i, /expense/i, /spesa/i,
    ],
    category: "accounting",
    confidence: 0.95,
    domainTags: ["invoicing", "billing", "financial"],
  },
  // ─── CRM ───
  {
    patterns: [
      /contact/i, /contatt/i, /lead/i, /prospect/i,
      /person/i, /persona/i, /rubric/i,
    ],
    category: "crm",
    confidence: 0.92,
    domainTags: ["contacts", "relationship-management"],
  },
  {
    patterns: [
      /compan/i, /aziend/i, /organiz/i, /account(?!ing)/i,
      /client[ei]?$/i, /fornitor/i, /supplier/i, /vendor/i,
    ],
    category: "crm",
    confidence: 0.90,
    domainTags: ["companies", "relationship-management"],
  },
  // ─── Sales ───
  {
    patterns: [
      /deal/i, /trattativ/i, /opportunit/i, /pipeline/i,
      /quot[aei]/i, /preventiv/i, /proposal/i, /offert/i,
      /order/i, /ordine/i,
    ],
    category: "sales",
    confidence: 0.92,
    domainTags: ["pipeline", "deals"],
  },
  {
    patterns: [
      /product/i, /prodott/i, /catalog/i, /line_item/i,
      /sku/i, /articol/i, /servizi/i, /pricing/i,
    ],
    category: "sales",
    confidence: 0.85,
    domainTags: ["catalog", "products"],
  },
  // ─── Support ───
  {
    patterns: [
      /ticket/i, /case/i, /support/i, /assistenz/i,
      /segnalazion/i, /reclam/i, /complaint/i, /issue/i,
      /help_?desk/i, /incident/i,
    ],
    category: "support",
    confidence: 0.92,
    domainTags: ["helpdesk", "customer-support"],
  },
  // ─── Documents ───
  {
    patterns: [
      /document/i, /file/i, /attachment/i, /allegat/i,
      /folder/i, /cartell/i, /drive/i, /storage/i,
      /template/i, /modello/i,
    ],
    category: "documents",
    confidence: 0.88,
    domainTags: ["document-management", "files"],
  },
  // ─── Legal ───
  {
    patterns: [
      /contract/i, /contratt/i, /agreement/i, /accord/i,
      /clause/i, /clausol/i, /article/i, /articol/i,
      /legge/i, /norma/i, /decreto/i, /regolament/i,
      /statute/i, /statut/i, /sentenz/i, /judgment/i,
    ],
    category: "legal",
    confidence: 0.93,
    domainTags: ["legal", "compliance"],
  },
  // ─── Medical ───
  {
    patterns: [
      /patient/i, /pazient/i, /diagnosis/i, /diagnos/i,
      /prescription/i, /prescrizion/i, /treatment/i, /trattament/i,
      /clinical/i, /clinic/i, /medical/i, /medic/i,
      /symptom/i, /sintom/i, /patholog/i,
    ],
    category: "medical",
    confidence: 0.93,
    domainTags: ["medical", "healthcare"],
  },
  // ─── HR ───
  {
    patterns: [
      /employee/i, /dipendent/i, /worker/i, /lavorator/i,
      /payroll/i, /busta_paga/i, /salary/i, /stipendi/i,
      /attendance/i, /presenz/i, /leave/i, /feri[ae]/i,
      /hr_/i, /human_resource/i, /recruitment/i, /assunzion/i,
    ],
    category: "hr",
    confidence: 0.92,
    domainTags: ["human-resources", "workforce"],
  },
];

// ─── Connector-to-category hints ───

/**
 * Default category bias based on connector type.
 * Used as a fallback when name-based rules don't match strongly.
 */
const CONNECTOR_CATEGORY_HINTS: Record<string, { category: EntityCategory; domainTags: string[] }> = {
  hubspot: { category: "crm", domainTags: ["crm", "marketing"] },
  salesforce: { category: "crm", domainTags: ["crm", "enterprise"] },
  fatture_in_cloud: { category: "accounting", domainTags: ["invoicing", "accounting-it"] },
  "fatture-in-cloud": { category: "accounting", domainTags: ["invoicing", "accounting-it"] },
  stripe: { category: "accounting", domainTags: ["payments", "billing"] },
  "google-drive": { category: "documents", domainTags: ["document-management", "cloud-storage"] },
  "google_drive": { category: "documents", domainTags: ["document-management", "cloud-storage"] },
  normattiva: { category: "legal", domainTags: ["legislation", "italian-law"] },
  eurlex: { category: "legal", domainTags: ["legislation", "eu-law"] },
  statpearls: { category: "medical", domainTags: ["medical-literature", "evidence-based"] },
  europepmc: { category: "medical", domainTags: ["medical-research", "pubmed"] },
  openstax: { category: "medical", domainTags: ["textbooks", "education"] },
};

// ─── Field-based category signals ───

interface FieldSignal {
  fieldPatterns: RegExp[];
  category: EntityCategory;
  weight: number; // 0.0 - 1.0 — how much this signal contributes
}

const FIELD_SIGNALS: FieldSignal[] = [
  // Accounting signals
  {
    fieldPatterns: [/amount/i, /total/i, /subtotal/i, /tax/i, /vat/i, /iva/i, /net_amount/i, /gross/i],
    category: "accounting",
    weight: 0.3,
  },
  {
    fieldPatterns: [/invoice_number/i, /numero_fattura/i, /payment_date/i, /due_date/i, /scadenza/i],
    category: "accounting",
    weight: 0.4,
  },
  // CRM signals
  {
    fieldPatterns: [/email/i, /phone/i, /first_?name/i, /last_?name/i, /company_?name/i],
    category: "crm",
    weight: 0.2,
  },
  {
    fieldPatterns: [/lifecycle_?stage/i, /lead_?source/i, /contact_?owner/i],
    category: "crm",
    weight: 0.4,
  },
  // Sales signals
  {
    fieldPatterns: [/deal_?stage/i, /pipeline/i, /close_?date/i, /probability/i, /revenue/i],
    category: "sales",
    weight: 0.4,
  },
  // Support signals
  {
    fieldPatterns: [/priority/i, /severity/i, /resolution/i, /sla/i, /assignee/i],
    category: "support",
    weight: 0.3,
  },
  // Documents signals
  {
    fieldPatterns: [/mime_?type/i, /file_?size/i, /file_?extension/i, /parent_?folder/i],
    category: "documents",
    weight: 0.4,
  },
  // Legal signals
  {
    fieldPatterns: [/article_?number/i, /law_?reference/i, /jurisdiction/i, /legal_?basis/i],
    category: "legal",
    weight: 0.4,
  },
  // Medical signals
  {
    fieldPatterns: [/icd_?code/i, /dosage/i, /frequency/i, /contraindication/i],
    category: "medical",
    weight: 0.4,
  },
  // HR signals
  {
    fieldPatterns: [/hire_?date/i, /department/i, /job_?title/i, /manager/i, /salary/i],
    category: "hr",
    weight: 0.4,
  },
];

// ─── Classification Engine ───

/**
 * Classify a single entity using the 3-strategy approach.
 *
 * @param entityName    - Technical name of the entity (e.g., "contacts", "issued_invoices")
 * @param fields        - Fields of the entity (SchemaField or TaggedField)
 * @param connectorType - Connector type for hint-based classification
 * @returns TaxonomyResult with category, confidence, and domain tags
 */
export function classifyEntity(
  entityName: string,
  fields: (SchemaField | TaggedField)[],
  connectorType: string
): TaxonomyResult {
  const candidates: Array<{
    category: EntityCategory;
    confidence: number;
    domainTags: string[];
    classifiedBy: TaxonomyResult["classifiedBy"];
  }> = [];

  // ─── Strategy 1: Name-based rules ───

  for (const rule of NAME_RULES) {
    if (rule.patterns.some((p) => p.test(entityName))) {
      candidates.push({
        category: rule.category,
        confidence: rule.confidence,
        domainTags: rule.domainTags,
        classifiedBy: "name-rule",
      });
      break; // First match wins for name rules
    }
  }

  // ─── Strategy 2: Field analysis ───

  const fieldScores = new Map<EntityCategory, number>();
  const fieldDomainTags = new Set<string>();

  for (const field of fields) {
    for (const signal of FIELD_SIGNALS) {
      const matched = signal.fieldPatterns.some(
        (p) => p.test(field.name) || (field.label && p.test(field.label))
      );
      if (matched) {
        const current = fieldScores.get(signal.category) ?? 0;
        fieldScores.set(signal.category, current + signal.weight);
      }
    }

    // Collect domain tags from tagged fields
    if ("tags" in field) {
      const tf = field as TaggedField;
      for (const tag of tf.tags) {
        if (tag.startsWith("financial")) fieldDomainTags.add("financial");
        if (tag.startsWith("pii")) fieldDomainTags.add("pii-data");
        if (tag === "status") fieldDomainTags.add("workflow");
      }
    }
  }

  // Normalize field scores to 0.0 - 0.85 range (field analysis is less confident than name match)
  if (fieldScores.size > 0) {
    const maxScore = Math.max(...fieldScores.values());
    const normalizedMax = Math.min(0.85, maxScore);

    // Pick the top field-based category
    let bestCategory: EntityCategory = "custom";
    let bestScore = 0;
    for (const [cat, score] of fieldScores) {
      if (score > bestScore) {
        bestScore = score;
        bestCategory = cat;
      }
    }

    if (bestScore > 0) {
      candidates.push({
        category: bestCategory,
        confidence: normalizedMax,
        domainTags: [...fieldDomainTags],
        classifiedBy: "field-analysis",
      });
    }
  }

  // ─── Strategy 3: Connector hint ───

  const hint = CONNECTOR_CATEGORY_HINTS[connectorType];
  if (hint) {
    candidates.push({
      category: hint.category,
      confidence: 0.5,
      domainTags: hint.domainTags,
      classifiedBy: "connector-hint",
    });
  }

  // ─── Pick the best candidate ───

  if (candidates.length === 0) {
    return {
      entityName,
      category: "custom",
      confidence: 0.1,
      domainTags: [],
      classifiedBy: "connector-hint",
    };
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  const best = candidates[0];

  // Collect secondary categories (different from primary, confidence > 0.3)
  const secondary = candidates
    .slice(1)
    .filter((c) => c.category !== best.category && c.confidence > 0.3)
    .map((c) => ({ category: c.category, confidence: c.confidence }));

  // Merge domain tags from all candidates
  const mergedTags = new Set<string>();
  for (const c of candidates) {
    for (const tag of c.domainTags) {
      mergedTags.add(tag);
    }
  }

  return {
    entityName,
    category: best.category,
    confidence: best.confidence,
    secondaryCategories: secondary.length > 0 ? secondary : undefined,
    domainTags: [...mergedTags],
    classifiedBy: best.classifiedBy,
  };
}

/**
 * Classify all entities for a connector in batch.
 *
 * @param connectorType - e.g., "hubspot", "fatture_in_cloud"
 * @param entityFields  - Map of entity name → fields (SchemaField or TaggedField)
 * @param log           - Optional logger
 * @returns TaxonomyBatchResult with all entities classified
 */
export function classifyEntities(
  connectorType: string,
  entityFields: Map<string, (SchemaField | TaggedField)[]>,
  log?: LogFn
): TaxonomyBatchResult {
  const results: TaxonomyResult[] = [];

  for (const [entityName, fields] of entityFields) {
    const result = classifyEntity(entityName, fields, connectorType);
    results.push(result);

    if (log) {
      log(
        `[TAXONOMY] ${entityName} → ${result.category} (${(result.confidence * 100).toFixed(0)}% by ${result.classifiedBy})` +
          (result.domainTags.length > 0 ? ` [${result.domainTags.join(", ")}]` : "")
      );
    }
  }

  return {
    connectorType,
    results,
    classifiedAt: new Date().toISOString(),
  };
}

/**
 * Apply taxonomy results back to entity info objects.
 * Updates the category field of EntityInfo based on taxonomy classification.
 *
 * @param entities - EntityInfo array from the ENUMERATE phase
 * @param taxonomy - TaxonomyBatchResult from classifyEntities()
 * @returns Updated EntityInfo array with refined categories
 */
export function applyTaxonomy(
  entities: Array<{ name: string; category: EntityCategory }>,
  taxonomy: TaxonomyBatchResult
): void {
  const resultMap = new Map(taxonomy.results.map((r) => [r.entityName, r]));

  for (const entity of entities) {
    const result = resultMap.get(entity.name);
    if (result && result.confidence > 0.5) {
      entity.category = result.category;
    }
  }
}

// ─── Exports for testing ───

export { NAME_RULES, CONNECTOR_CATEGORY_HINTS, FIELD_SIGNALS };
export type { NameRule, FieldSignal };
