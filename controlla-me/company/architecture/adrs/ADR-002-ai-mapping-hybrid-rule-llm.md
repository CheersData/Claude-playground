# ADR-002: AI mapping hybrid (rule-based + LLM)

## Status

Accepted (Implemented)

## Date

2026-03-10 (proposed) / 2026-03-14 (accepted, implementation verified)

## Implementation

Full 4-level mapping system implemented in `lib/staff/data-connector/mapping/`:

- **L0 (user_confirmed)**: `learning.ts` -- DB-backed user confirmations via `integration_field_mappings` table.
- **L1 (rule)**: `rules.ts` + `rules/` per-connector rules (HubSpot, Salesforce, Stripe, Google Drive). `rule-engine.ts` for generic rules.
- **L2 (similarity)**: `similarity.ts` -- Levenshtein distance with 0.8 threshold.
- **L3 (llm)**: `llm-mapper.ts` -- via `runAgent("mapper")` with tier Intern fallback.
- **Orchestrator**: `index.ts` (`MappingEngine` class) with in-memory cache.

Tests: `tests/unit/integration/mapping-engine.test.ts`, `mapping-rules.test.ts`, `mapping-similarity.test.ts`, `rule-engine.test.ts`.
Migration: `030_integration_tables.sql` (connector_field_mappings table).

## Context

The Integration Office connects to external data sources (CRMs, ERPs, SaaS platforms, public APIs) where the source schema is unknown ahead of time. The data-connector framework (ADR-001) needs a strategy to map source fields to target database columns.

Today, the MODEL phase in `lib/staff/data-connector/types.ts` uses a `DataModelSpec` with explicit `transformRules`:

```typescript
transformRules: Array<{
  sourceField: string;    // e.g., "art_num"
  targetColumn: string;   // e.g., "article_number"
  transform: string;      // e.g., "direct" | "parseInt" | "cleanText"
}>;
```

This works for the legal corpus because the source schemas are known and stable (Normattiva AKN XML, EUR-Lex HTML). The `LegalArticleModel` in `models/legal-article-model.ts` hardcodes the mapping.

For the Integration Office, source schemas are:
- **Unknown at development time** -- each client's CRM has different field names.
- **Inconsistent** -- "first_name", "firstName", "nome", "contact_name" all mean the same thing.
- **Complex** -- nested objects, arrays, concatenated fields (e.g., "John Smith" in one field vs "John" + "Smith" in two).
- **Evolving** -- source APIs change their schema over time.

A purely rule-based approach requires manual mapping for every new source. A purely LLM approach is expensive, slow, and non-deterministic. A hybrid strategy captures the best of both.

## Decision

**Implement a 3-tier mapping strategy: rule-based first, LLM-assisted second, manual review third.** The mapping is resolved once during the MODEL phase and cached as `transformRules` in the `DataModelSpec`. Subsequent LOAD runs use the cached rules without LLM calls.

### Tier 1: Rule-based mapping (deterministic, zero cost)

A rule engine that matches source fields to target columns using:

1. **Exact name match**: `email` -> `email`, `id` -> `id`
2. **Normalized name match**: `firstName` / `first_name` / `first-name` -> `first_name` (camelCase, snake_case, kebab-case normalization)
3. **Alias dictionary**: configurable per data type, with common field aliases:
   ```typescript
   const CONTACT_ALIASES: Record<string, string[]> = {
     "first_name": ["nome", "firstName", "given_name", "prenom", "vorname"],
     "last_name": ["cognome", "lastName", "family_name", "surname", "nachname"],
     "email": ["email_address", "mail", "e_mail", "posta_elettronica"],
     "phone": ["telephone", "telefono", "phone_number", "tel", "mobile"],
     "company": ["azienda", "organization", "organisation", "societa", "ditta"],
   };
   ```
4. **Type inference**: if source field contains values matching a known pattern (ISO date, email regex, phone regex), map to the corresponding typed column.

**Expected coverage**: 60-80% of fields for standard entities (contacts, invoices, tickets).

### Tier 2: LLM-assisted mapping (non-deterministic, low cost)

For fields not resolved by Tier 1, invoke an LLM with:

```typescript
interface MappingPrompt {
  sourceFields: Array<{
    name: string;
    sampleValues: unknown[];  // 3-5 sample values from CONNECT census
    inferredType: string;     // "string" | "number" | "date" | "boolean" | "object"
  }>;
  targetSchema: Array<{
    column: string;
    type: string;
    description: string;
  }>;
  alreadyMapped: Record<string, string>;  // Fields resolved by Tier 1
}
```

The LLM returns a mapping proposal:

```typescript
interface MappingProposal {
  mappings: Array<{
    sourceField: string;
    targetColumn: string;
    confidence: number;     // 0.0-1.0
    reasoning: string;      // Why this mapping
    transform: string;      // "direct" | "parseInt" | "parseDate" | "concat" | "split" | "custom"
    transformDetail?: string; // For complex transforms
  }>;
  unmapped: string[];       // Fields the LLM could not map
}
```

**LLM selection**: Uses the existing tier system (`lib/tiers.ts`). The mapping task is a one-shot structured output -- ideal for Intern tier (Groq Llama / Cerebras / Mistral free) to minimize cost. Estimated cost per mapping: $0.001-0.005.

**Confidence threshold**: Mappings with `confidence >= 0.8` are auto-accepted. Mappings with `confidence < 0.8` are flagged for manual review (Tier 3).

### Tier 3: Manual review (human-in-the-loop)

Fields that neither rules nor LLM can map with high confidence are:
1. Logged in the `connector_sync_log` with `metadata.unmapped_fields`.
2. Surfaced in the Operations dashboard (`/ops`) under the Integration panel.
3. An operator can manually specify the mapping via the console or a config file.
4. Once manually mapped, the mapping is saved to the alias dictionary (Tier 1) for future reuse, creating a learning loop.

### Integration with existing MODEL phase

The hybrid mapper runs inside the `ModelInterface.analyze()` method:

```
ModelInterface.analyze(sampleData)
  |
  [1] Extract source field names + sample values from sampleData
  |
  [2] Run Tier 1 rule engine → resolve known fields
  |
  [3] If unmapped fields remain AND LLM is available:
  |     Run Tier 2 LLM mapping → resolve ambiguous fields
  |
  [4] Any remaining unmapped → Tier 3 manual queue
  |
  [5] Return DataModelSpec with transformRules populated
```

The `transformRules` array in `DataModelSpec` is unchanged structurally. Each rule is annotated with its origin:

```typescript
transformRules: Array<{
  sourceField: string;
  targetColumn: string;
  transform: string;
  // New optional fields
  mappedBy?: "rule" | "llm" | "manual";
  confidence?: number;
}>;
```

### Caching and re-mapping

- **First run**: Full mapping pipeline (Tier 1 + 2 + 3). Results cached in `DataModelSpec`.
- **Subsequent runs**: Cached `transformRules` reused. No LLM call.
- **Schema change detected**: If CONNECT census returns new fields not in cached rules, only the new fields go through the mapping pipeline. Existing mappings are preserved.
- **Force re-map**: CLI command `npx tsx scripts/data-connector.ts remap <sourceId>` triggers full re-mapping.

### Implementation files

| File | Action |
|------|--------|
| `lib/staff/data-connector/mappers/rule-engine.ts` | NEW -- Tier 1 rule-based mapper |
| `lib/staff/data-connector/mappers/llm-mapper.ts` | NEW -- Tier 2 LLM-assisted mapper |
| `lib/staff/data-connector/mappers/index.ts` | NEW -- Orchestrator: rule -> LLM -> manual |
| `lib/staff/data-connector/mappers/aliases/` | NEW -- Alias dictionaries per data type |
| `lib/staff/data-connector/types.ts` | MODIFY -- Add `mappedBy`, `confidence` to transform rules |
| `lib/staff/data-connector/models/generic-entity-model.ts` | NEW -- Uses hybrid mapper in `analyze()` |

## Consequences

### Positive

- **Low cost**: 60-80% of mappings resolved by rules (zero API cost). LLM used only for ambiguous cases, at Intern tier pricing (~$0.001/mapping).
- **Deterministic where possible**: Rule-based mappings produce identical results every time. No LLM non-determinism for standard fields.
- **Learning loop**: Manual corrections feed back into the alias dictionary, improving Tier 1 coverage over time. The system gets smarter with use.
- **Backward compatible**: Existing `LegalArticleModel` continues to use hardcoded mappings -- no change. The hybrid mapper is used only by new `GenericEntityModel`.
- **Offline capable**: Tier 1 works without any API calls. If LLM is unavailable (demo environment, API credits exhausted), the system degrades gracefully to rule + manual.
- **Auditable**: Every mapping records its origin (`mappedBy`) and confidence, enabling Operations to audit data quality.

### Negative

- **Alias dictionary maintenance**: The dictionaries need curation for each supported locale (IT, EN, DE, FR). Initial setup requires manual effort.
- **LLM non-determinism**: Two runs of Tier 2 on the same data may produce different mappings. Mitigated by caching after first run and confidence thresholds.
- **Complex transforms**: The LLM may suggest transforms like "concat first_name + last_name" that require a transform interpreter. The `transform` field vocabulary needs clear definition and boundaries.

### Neutral

- **No impact on existing legal/medical connectors**: They use `LegalArticleModel` which has hardcoded mappings and does not invoke the hybrid mapper.
- **No new database tables**: Mapping results are stored in the existing `DataModelSpec` structure within sync log metadata.

## Alternatives Considered

### A1: Purely rule-based mapping

Only use name matching and alias dictionaries, no LLM. Rejected because:
- Cannot handle truly ambiguous fields (e.g., "campo1", "field_x", "dato_aggiuntivo").
- Requires exhaustive alias dictionaries for every possible source, which is impractical for unknown SaaS APIs.
- 20-40% of fields would always require manual mapping, creating a bottleneck for onboarding new sources.

### A2: Purely LLM-based mapping

Send all fields to an LLM for mapping. Rejected because:
- Unnecessary cost for obvious mappings (`email` -> `email`).
- Non-deterministic: same input may produce different mappings on different runs.
- Latency: LLM call adds 2-10 seconds per mapping request, even for trivial fields.
- Violates Architecture principle #1 ("cost-aware") -- estimated 10-50x more expensive than hybrid approach.

### A3: Schema-on-read (no mapping, store raw)

Store raw JSON from sources and map at query time. Rejected because:
- Prevents indexing, search, and cross-source queries.
- Pushes complexity to every consumer of the data.
- Incompatible with the existing pgvector embedding pipeline which requires structured fields.

### A4: Visual mapping UI (drag-and-drop)

Build a UI for operators to visually map source fields to target columns. Rejected for Phase 1 because:
- High implementation cost (estimated 2-3 weeks of UX/UI + frontend work).
- The hybrid mapper handles 90%+ of cases automatically.
- Can be added as a Phase 2 enhancement for the remaining manual review cases (Tier 3).

## References

- `lib/staff/data-connector/types.ts` -- `DataModelSpec` and `transformRules` definition
- `lib/staff/data-connector/models/legal-article-model.ts` -- current hardcoded mapping example
- `lib/tiers.ts` -- tier system for LLM selection
- `lib/ai-sdk/agent-runner.ts` -- `runAgent()` for LLM invocation
- ADR-001 (this series) -- generic connector framework
