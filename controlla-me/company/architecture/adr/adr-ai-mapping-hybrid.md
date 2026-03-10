# ADR: AI Mapping Hybrid Rules+LLM

**Status:** Proposed
**Date:** 2026-03-10
**Author:** Architecture Department
**Deciders:** CME, Architecture, Data Engineering, Finance
**Task:** f9c369b8

---

## Context

Quando si integrano sistemi esterni (CRM, ERP, piattaforme SaaS), il mapping dei campi sorgente→destinazione e uno dei problemi piu complessi. Ogni sistema ha il proprio schema: un CRM chiama il campo "Company Name", un altro "Ragione Sociale", un terzo "org_name". Il data-connector attuale risolve questo con `transformRules` hardcoded nel model (`LegalArticleModel`):

```typescript
// Attuale: regole statiche per tipo di dato
transformRules: [
  { sourceField: "articleNumber",  targetColumn: "article_reference", transform: "format_as_Art_N" },
  { sourceField: "articleTitle",   targetColumn: "article_title",     transform: "direct" },
  { sourceField: "articleText",    targetColumn: "article_text",      transform: "clean_html_entities" },
  { sourceField: "hierarchy",      targetColumn: "hierarchy",         transform: "direct" },
  { sourceField: "(computed)",     targetColumn: "keywords",          transform: "extract_legal_terms_from_text" },
  { sourceField: "(concatenated)", targetColumn: "embedding",         transform: "voyage_law_2_embedding" },
]
```

Questo approccio funziona per fonti con schema noto e stabile (Normattiva, EUR-Lex), ma non scala per:

1. **Schema sconosciuti** — Quando un utente connette il suo CRM, non sappiamo a priori i nomi dei campi.
2. **Schema variabili** — Lo stesso tipo di sistema (es. Salesforce vs HubSpot) usa nomi diversi per lo stesso concetto.
3. **Campi ambigui** — "status" potrebbe essere lo stato dell'ordine, del contratto, o del ticket.
4. **Nuovi verticali** — Ogni verticale (legale, medico, trading) ha uno schema destinazione diverso.

### Requisito

Un sistema di mapping che:
- Funzioni **senza configurazione manuale** per l'80% dei campi (nomi standard, pattern noti).
- Usi un **LLM come fallback** per il 20% ambiguo (costo accettabile, non per ogni campo).
- Sia **deterministico e auditabile** — l'utente deve poter vedere e correggere il mapping.
- Si **migliori nel tempo** — i mapping validati dall'utente diventano regole.

---

## Decision

Implementare un sistema ibrido a 3 livelli di risoluzione, con fallback progressivo.

### Architettura a 3 livelli

```
Campi sorgente → [L1: Regole deterministiche] → mapping trovato? → FATTO
                                                       ↓ NO
                  [L2: Similarity heuristica]  → mapping trovato? → FATTO (confidence > 0.8)
                                                       ↓ NO
                  [L3: LLM fallback]           → mapping proposto → utente conferma → FATTO
                                                                                        ↓
                  [L4: Learning loop]          → mapping confermato salvato come regola L1
```

### L1: Regole deterministiche (costo: zero)

Database di mapping esatti e alias noti. Copre l'80% dei casi.

```typescript
// mapping/rules.ts

export interface MappingRule {
  /** Pattern di match sul nome campo sorgente (case-insensitive) */
  sourcePatterns: string[];
  /** Colonna destinazione */
  targetColumn: string;
  /** Trasformazione da applicare */
  transform: TransformType;
  /** Confidenza (1.0 = match esatto) */
  confidence: number;
}

const DETERMINISTIC_RULES: MappingRule[] = [
  // Nomi persona
  {
    sourcePatterns: ["first_name", "firstname", "nome", "given_name", "prenom"],
    targetColumn: "first_name",
    transform: "direct",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["last_name", "lastname", "cognome", "surname", "family_name", "nom"],
    targetColumn: "last_name",
    transform: "direct",
    confidence: 1.0,
  },
  // Email
  {
    sourcePatterns: ["email", "email_address", "e_mail", "mail", "pec"],
    targetColumn: "email",
    transform: "normalize_email",
    confidence: 1.0,
  },
  // Ragione sociale
  {
    sourcePatterns: ["company_name", "company", "ragione_sociale", "org_name", "organization"],
    targetColumn: "company_name",
    transform: "direct",
    confidence: 1.0,
  },
  // Codice fiscale / P.IVA
  {
    sourcePatterns: ["codice_fiscale", "cf", "fiscal_code", "tax_id"],
    targetColumn: "tax_id",
    transform: "normalize_cf",
    confidence: 1.0,
  },
  {
    sourcePatterns: ["partita_iva", "p_iva", "piva", "vat_number", "vat_id", "vat"],
    targetColumn: "vat_number",
    transform: "normalize_piva",
    confidence: 1.0,
  },
  // Indirizzi
  {
    sourcePatterns: ["address", "indirizzo", "street", "via", "street_address"],
    targetColumn: "address",
    transform: "direct",
    confidence: 0.95,
  },
  // ... regole espandibili per verticale
];
```

**Pattern matching robusto:**

```typescript
function matchField(sourceFieldName: string, rules: MappingRule[]): MappingRule | null {
  const normalized = sourceFieldName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")  // "Company Name" → "company_name"
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  // Match esatto
  for (const rule of rules) {
    if (rule.sourcePatterns.includes(normalized)) {
      return rule;
    }
  }

  // Match parziale (contiene il pattern)
  for (const rule of rules) {
    for (const pattern of rule.sourcePatterns) {
      if (normalized.includes(pattern) || pattern.includes(normalized)) {
        return { ...rule, confidence: rule.confidence * 0.9 };
      }
    }
  }

  return null;
}
```

### L2: Similarity heuristica (costo: zero)

Per campi che non matchano le regole ma hanno nomi "simili" alla destinazione.

```typescript
// mapping/similarity.ts

function computeSimilarity(source: string, target: string): number {
  // Levenshtein distance normalizzata
  const maxLen = Math.max(source.length, target.length);
  if (maxLen === 0) return 1.0;
  const distance = levenshtein(source.toLowerCase(), target.toLowerCase());
  return 1.0 - distance / maxLen;
}

function findBestMatch(
  sourceField: string,
  targetColumns: string[],
  threshold = 0.8
): { column: string; confidence: number } | null {
  let best: { column: string; confidence: number } | null = null;

  for (const col of targetColumns) {
    const sim = computeSimilarity(sourceField, col);
    if (sim >= threshold && (!best || sim > best.confidence)) {
      best = { column: col, confidence: sim };
    }
  }

  return best;
}
```

### L3: LLM fallback (costo: ~$0.001-0.01 per batch)

Per i campi rimasti non mappati dopo L1 e L2. Un singolo prompt batch mappa tutti i campi residui.

**Scelta modello dal tier system:**

| Tier | Modello | Costo per mapping batch (20 campi) | Latenza |
|------|---------|-----------------------------------|---------|
| Intern | `groq-llama4-scout` | ~$0.0003 (gratis su free tier) | ~1s |
| Associate | `gemini-2.5-flash` | ~$0.0005 | ~2s |
| Partner | `claude-haiku-4.5` | ~$0.002 | ~3s |

**Raccomandazione:** Usare la catena del `classifier` agent (gia ottimizzata per task di classificazione strutturata):
```
Haiku 4.5 → Gemini Flash → Groq Llama 4 → Cerebras → SambaNova → Mistral Small
```

Il mapping e un task di classificazione (assegnare un campo sorgente a una categoria destinazione) — stessa natura del classifier. Non serve un modello di ragionamento profondo.

**Prompt batch:**

```typescript
// mapping/llm-mapper.ts

const MAPPING_PROMPT = `Sei un data engineer specializzato in mapping di schemi dati.

Ti vengono forniti:
1. Campi sorgente non ancora mappati (nome + tipo + valore di esempio)
2. Colonne destinazione disponibili (nome + tipo + descrizione)

Per ogni campo sorgente, suggerisci:
- targetColumn: la colonna destinazione migliore (o null se nessuna)
- transform: tipo di trasformazione (direct, format, convert, compute)
- confidence: 0.0-1.0
- reasoning: breve spiegazione (1 riga)

IMPORTANTE: Rispondi ESCLUSIVAMENTE con JSON puro. NON usare backtick, code fence, markdown.
La tua risposta deve iniziare con { e finire con }.

{
  "mappings": [
    {
      "sourceField": "nome_campo",
      "targetColumn": "colonna_destinazione",
      "transform": "direct",
      "confidence": 0.85,
      "reasoning": "Motivo del mapping"
    }
  ]
}`;

async function llmMapFields(
  unmappedFields: Array<{ name: string; type: string; sampleValue: string }>,
  targetColumns: Array<{ name: string; type: string; description: string }>,
): Promise<MappingRule[]> {
  const prompt = `${MAPPING_PROMPT}

Campi sorgente non mappati:
${JSON.stringify(unmappedFields, null, 2)}

Colonne destinazione disponibili:
${JSON.stringify(targetColumns, null, 2)}`;

  // Usa runAgent("classifier", prompt) per sfruttare la catena di fallback
  const result = await runAgent("classifier", prompt, { maxTokens: 2048 });
  return parseJsonResponse(result).mappings;
}
```

### L4: Learning loop (costo: zero dopo il primo mapping)

I mapping confermati dall'utente vengono salvati come regole L1 per riuso futuro.

```typescript
// mapping/learned-rules.ts

interface LearnedMapping {
  id: string;
  connectorType: string;       // "salesforce" | "hubspot" | "google-sheets"
  sourceField: string;
  targetColumn: string;
  transform: TransformType;
  confirmedBy: string;         // user_id
  confirmedAt: string;
  usageCount: number;          // quante volte e stato riusato
}

// Tabella Supabase: integration_field_mappings
// Consultata PRIMA delle regole hardcoded (priorita utente > default)
```

### Pipeline completa

```typescript
// mapping/mapper.ts

export async function mapFields(
  sourceSchema: FieldSchema[],
  targetSchema: FieldSchema[],
  connectorType: string,
  options?: { useLLM?: boolean }
): Promise<MappingResult> {
  const result: MappingResult = {
    mapped: [],
    unmapped: [],
    confidence: 1.0,
  };

  let remaining = [...sourceSchema];

  // L0: Mapping salvati dall'utente per questo connectorType
  const learned = await getLearnedMappings(connectorType);
  for (const field of remaining) {
    const match = learned.find(l => l.sourceField === field.name);
    if (match) {
      result.mapped.push({ ...match, source: "learned", confidence: 1.0 });
    }
  }
  remaining = remaining.filter(f => !result.mapped.some(m => m.sourceField === f.name));

  // L1: Regole deterministiche
  for (const field of remaining) {
    const match = matchField(field.name, DETERMINISTIC_RULES);
    if (match) {
      result.mapped.push({ ...match, sourceField: field.name, source: "rules" });
    }
  }
  remaining = remaining.filter(f => !result.mapped.some(m => m.sourceField === f.name));

  // L2: Similarity
  const targetCols = targetSchema.map(t => t.name);
  for (const field of remaining) {
    const match = findBestMatch(field.name, targetCols);
    if (match) {
      result.mapped.push({
        sourceField: field.name,
        targetColumn: match.column,
        transform: "direct",
        confidence: match.confidence,
        source: "similarity",
      });
    }
  }
  remaining = remaining.filter(f => !result.mapped.some(m => m.sourceField === f.name));

  // L3: LLM (solo se abilitato e ci sono campi rimasti)
  if (options?.useLLM !== false && remaining.length > 0) {
    const llmMappings = await llmMapFields(
      remaining.map(f => ({ name: f.name, type: f.type, sampleValue: f.sampleValue ?? "" })),
      targetSchema.map(t => ({ name: t.name, type: t.type, description: t.description ?? "" })),
    );
    for (const m of llmMappings) {
      if (m.confidence >= 0.6) {
        result.mapped.push({ ...m, source: "llm" });
      } else {
        result.unmapped.push({ field: m.sourceField, reason: `LLM confidence troppo bassa: ${m.confidence}` });
      }
    }
    remaining = remaining.filter(f => !result.mapped.some(m => m.sourceField === f.name));
  }

  // Residui non mappati
  for (const field of remaining) {
    result.unmapped.push({ field: field.name, reason: "Nessun match trovato" });
  }

  // Confidenza aggregata
  const confidences = result.mapped.map(m => m.confidence);
  result.confidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;

  return result;
}
```

### Integrazione con DataModelSpec

Le `transformRules` attuali in `DataModelSpec` restano invariate per i connettori esistenti. Il mapper produce lo stesso formato:

```typescript
// Il mapper genera transformRules compatibili con il model attuale
const mappingResult = await mapFields(sourceSchema, targetSchema, "salesforce");
const transformRules: DataModelSpec["transformRules"] = mappingResult.mapped.map(m => ({
  sourceField: m.sourceField,
  targetColumn: m.targetColumn,
  transform: m.transform,
}));
```

---

## Cost/Benefit Analysis

### Costi

| Voce | Dettaglio |
|------|----------|
| **Sviluppo** | ~5 giorni (L1: 1g, L2: 0.5g, L3: 1.5g, L4: 1g, test: 1g) |
| **API cost L3** | ~$0.001-0.01 per batch di 20 campi. Su 100 integrazioni/mese = ~$0.10-1.00/mese |
| **Storage L4** | Tabella Supabase `integration_field_mappings` — trascurabile |
| **Manutenzione** | Regole L1 da aggiornare per nuovi verticali — ~1h per verticale |

### Benefici

| Voce | Dettaglio |
|------|----------|
| **UX** | L'utente vede il mapping proposto e lo conferma con un click. Zero configurazione manuale per l'80% dei campi. |
| **Scalabilita** | Ogni connettore nuovo beneficia dei mapping learned da tutti gli utenti (per connectorType). |
| **Auditabilita** | Ogni mapping ha `source` (rules/similarity/llm/learned) e `confidence`. L'utente sa perche un campo e mappato cosi. |
| **Costo marginale** | L3 chiamato solo per i campi residui (tipicamente 2-5 per integrazione, non tutti i 20). |
| **Miglioramento** | Learning loop: piu integrazioni = meno chiamate LLM nel tempo. |

### Rischi

| Rischio | Mitigazione |
|---------|------------|
| LLM hallucina un mapping errato | Confidenza threshold 0.6 + review utente obbligatorio per mapping LLM |
| Latenza L3 su connessioni lente | L3 e one-time (al primo setup), non su ogni sync. Cache del risultato. |
| Regole L1 incomplete per verticale | Learning loop colma i gap. Le regole iniziali coprono i campi universali (nome, email, indirizzo). |
| Costo LLM scala con integrazioni | L4 ammortizza: dopo 3-5 integrazioni dello stesso tipo, L3 non e piu necessario. |

---

## Alternatives Considered

### 1. Solo regole deterministiche (no LLM)

**Pro:** Zero costo API, deterministico, auditabile.
**Contro:** Non copre schemi sconosciuti. Richiede manutenzione costante delle regole. L'utente deve mappare manualmente i campi non riconosciuti.
**Decisione:** Parzialmente adottato come L1, ma insufficiente da solo.

### 2. Solo LLM per tutto

**Pro:** Zero regole da mantenere, gestisce qualsiasi schema.
**Contro:** Costo ~$0.01 per OGNI sync (non solo setup). Non deterministico: lo stesso campo puo essere mappato diversamente in run successive. Latenza su ogni operazione. Impossibile auditing.
**Decisione:** Scartato. L'LLM e utile come fallback, non come sistema primario.

### 3. Embedding-based matching

**Pro:** Cattura similarita semantica (es. "Ragione Sociale" ↔ "company_name") senza LLM.
**Contro:** Richiede embeddings pre-calcolati per tutti i nomi di colonne target. Overhead: una chiamata Voyage AI per ogni campo sorgente. Per 20 campi = 20 chiamate embedding + ricerca cosine. Piu lento e costoso di L2+L3 combinati.
**Decisione:** Scartato. La Levenshtein distance (L2) copre il 90% dei casi di similarita sintattica, e L3 copre la similarita semantica che L2 non cattura.

---

## Consequences

### Positive

- **Mapping zero-config per l'80% dei campi** — L'utente connette il CRM e vede i campi gia mappati.
- **Costo API trascurabile** — L3 chiamato raramente grazie a L1+L2+L4.
- **Miglioramento continuo** — Il sistema impara dai mapping confermati.
- **Compatibile con il data-connector** — Produce `transformRules` nello stesso formato di `DataModelSpec`.

### Negative

- **Regole iniziali incomplete** — Le prime integrazioni di un nuovo connectorType richiederanno piu intervento LLM. Migliora dopo 3-5 utenti.
- **Complessita test** — L3 non e deterministico; i test devono usare mock LLM o snapshot.
- **Dipendenza tier system** — Il mapping usa `runAgent("classifier")` che dipende dalla disponibilita provider. Se tutti i provider sono down, L3 fallisce silenziosamente e i campi restano unmapped.

---

## References

- `lib/staff/data-connector/types.ts` — `DataModelSpec.transformRules`
- `lib/staff/data-connector/models/legal-article-model.ts` — Regole attuali
- `lib/tiers.ts` — Catene di fallback per agent
- `lib/models.ts` — Catalogo modelli e costi
- `lib/ai-sdk/agent-runner.ts` — `runAgent()` function
- ADR integration-framework (companion) — Framework connettori
