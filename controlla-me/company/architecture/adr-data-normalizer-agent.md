# ADR — Data Model Agent + Data Normalizer Agent

**Data:** 2026-03-01
**Autore:** Architecture Department
**Stato:** PROPOSTA — in attesa approvazione boss
**Task correlati:** e2690657 (Data Model Agent), fc9c4eb8 (Data Normalizer Agent)
**Supersede:** `adr/ADR-DE-AI-pipeline.md` (bozza preliminare)

---

## 1. Problem Statement

### Perche servono questi agenti

La pipeline Data Connector attuale segue il pattern CONNECT → MODEL → LOAD, dove:

- **CONNECT** scarica dati grezzi da fonti esterne (Normattiva, EUR-Lex)
- **MODEL** verifica lo schema DB e produce regole di trasformazione
- **LOAD** valida, trasforma e carica i dati in `legal_articles`

Il problema e che la fase MODEL e i parser (AKN, HTML) sono **hardcoded per formato**:

| Componente | File | Limite |
|-----------|------|--------|
| `LegalArticleModel` | `lib/staff/data-connector/models/legal-article-model.ts` | Schema fisso `legal_articles`. Le `transformRules` sono dichiarative ma non interpretate da un motore — servono solo come documentazione. |
| `parseAkn()` | `lib/staff/data-connector/parsers/akn-parser.ts` | Parser specifico per Akoma Ntoso XML italiano. ~400 righe di logica regex/DOM. |
| `parseEurLexHtml()` | `lib/staff/data-connector/parsers/html-parser.ts` | Parser specifico per HTML EUR-Lex. ~400 righe di regex con 3 strategie di fallback. |

**Conseguenza:** ogni nuova fonte richiede la scrittura manuale di un nuovo parser. Per le 14 fonti attuali (tutte AKN o HTML EUR-Lex) il costo e stato accettabile. Ma per le fonti future il pattern non scala:

- **Verticale HR** (D.Lgs. 81/2008, D.Lgs. 276/2003): stesso formato AKN, ma struttura interna diversa (allegati tecnici, tabelle, norme di rinvio)
- **CCNL** (Contratti Collettivi Nazionali di Lavoro): formato PDF/HTML non standard, struttura completamente diversa
- **Fonti INPS/INAIL**: circolari, messaggi, risoluzioni — nessun formato standard
- **Piattaforma multi-verticale** (vision: PropTech, HealthTech): formati dati completamente diversi per ogni verticale

### Cosa propone il boss

Due nuovi agenti AI nel dipartimento Data Engineering:

1. **Data Model Agent** — analizza i dati grezzi di una nuova fonte e suggerisce il data model/schema ottimale
2. **Data Normalizer Agent** — prende dati destrutturati e li normalizza secondo il data model predisposto dal primo agente

---

## 2. Architettura Corrente

### Flusso dati completo

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA CONNECTOR PIPELINE                       │
│                                                                  │
│  [1] CONNECT                                                    │
│      │ NormattivaConnector.connect() / EurLexConnector.connect()│
│      │ → fetch API, censimento, sampleData                      │
│      ▼                                                          │
│  [2] MODEL                                                      │
│      │ LegalArticleModel.analyze(sampleData)                    │
│      │ → DataModelSpec (colonne, indici, transformRules)         │
│      │ LegalArticleModel.checkSchema(spec)                      │
│      │ → verifica tabella DB, genera migration SQL se necessaria│
│      ▼                                                          │
│  [3] LOAD                                                       │
│      │ Connector.fetchAll() / fetchDelta()                      │
│      │ → raw items (AKN XML o HTML)                             │
│      │                                                          │
│      │ *** PARSING (hard-coded) ***                             │
│      │ parseAkn(xml) o parseEurLexHtml(html)                    │
│      │ → ParsedArticle[]                                        │
│      │                                                          │
│      │ validateBatch(articles)                                   │
│      │ → filtra articoli invalidi                               │
│      │                                                          │
│      │ Trasformazione ParsedArticle → LegalArticle              │
│      │ (mapping hardcoded in index.ts righe 222-232)            │
│      │                                                          │
│      │ LegalCorpusStore.save(articles)                           │
│      │ → ingestArticles() → upsert + embeddings Voyage AI       │
│      ▼                                                          │
│  [legal_articles] ~5600 articoli, 14 fonti                      │
└─────────────────────────────────────────────────────────────────┘
```

### Punti di rigidita

1. **Parsing nel connettore:** `NormattivaConnector.fetchAll()` chiama internamente `parseAkn()`. Il parsing e accoppiato al fetch, non separabile.
2. **Mapping in index.ts:** le righe 222-232 di `index.ts` fanno un mapping hardcoded `ParsedArticle → LegalArticle` con campo `lawSource` dalla config della fonte.
3. **Schema fisso:** `LegalArticleModel.analyze()` ritorna sempre lo stesso `DataModelSpec` per `legal_articles`. Non analizza realmente i dati — restituisce lo schema noto.
4. **Plugin Registry rigido:** `plugin-registry.ts` risolve connector/model/store per `connectorId` e `dataType`, ma non prevede un passaggio di normalizzazione tra fetch e store.

---

## 3. Architettura Proposta

### Pipeline estesa: CONNECT → DESIGN → NORMALIZE → LOAD

```
┌──────────────────────────────────────────────────────────────────────┐
│                    PIPELINE ESTESA (proposta)                         │
│                                                                      │
│  [1] CONNECT (invariato)                                            │
│      │ → raw data + census + sampleData[]                            │
│      ▼                                                               │
│  [2] DESIGN (nuovo — Data Model Agent, opzionale)                   │
│      │ Input: sampleData[] (5-10 campioni raw)                       │
│      │ AI analizza: struttura, campi, tipi, relazioni                │
│      │ Output: DataModelSpec arricchito + mapping rules              │
│      │ → salva come .mapping.json nella config della fonte           │
│      │ ⚠️ Solo alla prima sync di una fonte, o su richiesta          │
│      ▼                                                               │
│  [3] MODEL (invariato — checkSchema)                                │
│      │ → verifica che lo schema DB supporti il DataModelSpec         │
│      │ → genera migration SQL se serve                               │
│      ▼                                                               │
│  [4] NORMALIZE (nuovo — Data Normalizer Agent, opzionale)           │
│      │ Input: raw items[] + mapping rules da DESIGN                  │
│      │ Strategia:                                                    │
│      │   a) Se esiste parser hardcoded (AKN/HTML) → usa quello       │
│      │   b) Se esiste .mapping.json → applica regole deterministiche │
│      │   c) Se nessuna delle due → chiama LLM per normalizzazione    │
│      │ Output: ParsedArticle[] (o tipo target del verticale)         │
│      ▼                                                               │
│  [5] LOAD (invariato — validate + store)                            │
│      │ → validazione, mapping, upsert + embeddings                   │
│      ▼                                                               │
│  [DB]                                                                │
└──────────────────────────────────────────────────────────────────────┘
```

### Principio chiave: fallback graduale

L'intelligenza artificiale non sostituisce i parser esistenti ma li integra:

```
Parser hardcoded (costo zero, veloce, testato)
       ↓ se non disponibile
Mapping rules deterministiche (costo zero, veloce, generato da AI)
       ↓ se non disponibile
Normalizzazione LLM (costo token, lenta, adattiva)
```

Questo rispetta il principio Architecture #3: "se 3 righe bastano, non creare un framework".

---

## 4. Specifiche Agente: Data Model Agent (Designer)

### Identita

| Campo | Valore |
|-------|--------|
| Nome interno | `data-model-designer` |
| Dipartimento | Data Engineering |
| Tipo | Staff agent (non runtime — non tocca utenti) |
| Trigger | Manuale (CLI), alla prima sync di una nuova fonte |
| Frequenza | 1 volta per fonte, poi on-demand |

### Input

```typescript
interface DesignerInput {
  /** Campioni raw dalla fase CONNECT (5-10 items) */
  sampleData: unknown[];
  /** Formato dei campioni: "akn-xml" | "html" | "json" | "csv" | "pdf-text" */
  format: string;
  /** Schema target esistente (se noto) — es. DataModelSpec di legal_articles */
  targetSchema?: DataModelSpec;
  /** Descrizione della fonte (da CorpusSource.description) */
  sourceDescription: string;
  /** Verticale (legal, hr, real-estate...) */
  vertical: string;
}
```

### Output

```typescript
interface DesignerOutput {
  /** Mapping rules generate dall'AI — deterministiche, interpretabili senza LLM */
  mappingRules: MappingRule[];
  /** Schema suggerito se targetSchema non e stato fornito */
  suggestedSchema?: DataModelSpec;
  /** Confidence dell'agente (0-1) */
  confidence: number;
  /** Note per l'operatore umano */
  notes: string;
  /** Campi non mappabili automaticamente */
  unmappedFields: string[];
}

interface MappingRule {
  /** Percorso nel dato raw: XPath, CSS selector, JSONPath */
  sourcePath: string;
  /** Colonna target nello schema DB */
  targetColumn: string;
  /** Tipo di trasformazione */
  transform: "direct" | "concat" | "extract_regex" | "clean_html" | "parse_date" | "map_enum" | "custom";
  /** Parametri della trasformazione (regex, formato data, enum map...) */
  params?: Record<string, unknown>;
  /** Esempio: input → output */
  example?: { input: string; output: string };
}
```

### Modello AI suggerito

| Tier | Modello | Costo per invocazione | Motivazione |
|------|---------|----------------------|-------------|
| **Raccomandato** | `gemini-2.5-flash` | ~$0.002 (~3K in, ~2K out) | Context window 1M (puo ricevere campioni grandi), costo bassissimo, buono su task strutturati |
| Alternativa premium | `claude-sonnet-4.5` | ~$0.04 | Se Flash non produce mapping accurati (verificare su 2-3 fonti) |
| Free tier | `groq-llama4-scout` | ~$0.001 | Per test e sviluppo |

**Stima costi totali:** 1 invocazione per fonte nuova. Con 14 fonti attuali = ~$0.03 totali. Trascurabile.

### Prompt design (schema)

```
Sei un data modeler specializzato in dati legislativi. Ti vengono forniti campioni
raw di una fonte dati legislativa.

Analizza la struttura e produci mapping rules deterministiche che permettano
di trasformare i dati raw nel seguente schema target:
[schema target]

Per ogni campo nello schema target, indica:
1. Il percorso nel dato raw (XPath per XML, CSS selector per HTML, JSONPath per JSON)
2. La trasformazione necessaria
3. Un esempio concreto input → output

IMPORTANTE: le mapping rules devono essere DETERMINISTICHE — eseguibili senza LLM.
Non usare trasformazioni che richiedono comprensione del linguaggio naturale.

Rispondi ESCLUSIVAMENTE con JSON puro.
```

### Dove si inserisce nel codice

```
lib/staff/data-connector/
├── designers/
│   └── ai-model-designer.ts     # Implementa ModelInterface con AI
├── models/
│   └── legal-article-model.ts   # Invariato — resta il default
scripts/
├── model-designer.ts            # CLI: npx tsx scripts/model-designer.ts <source-id>
```

Il designer viene registrato nel plugin registry come alternativa al model hardcoded:

```typescript
// In plugin-registry.ts
registerModel("ai-designed", (source) => new AiModelDesigner(source));
```

Le fonti che vogliono usare il designer AI specificano `dataType: "ai-designed"` nella loro config.

---

## 5. Specifiche Agente: Data Normalizer Agent

### Identita

| Campo | Valore |
|-------|--------|
| Nome interno | `data-normalizer` |
| Dipartimento | Data Engineering |
| Tipo | Staff agent (non runtime) |
| Trigger | Durante fase LOAD, solo per fonti senza parser hardcoded |
| Frequenza | Per ogni articolo/item di fonti non-standard |

### Input

```typescript
interface NormalizerInput {
  /** Item raw singolo (un articolo, un documento) */
  rawItem: unknown;
  /** Formato raw */
  format: string;
  /** Mapping rules dal Data Model Designer */
  mappingRules: MappingRule[];
  /** Schema target */
  targetSchema: DataModelSpec;
}
```

### Output

```typescript
interface NormalizerOutput {
  /** Articolo normalizzato, conforme allo schema target */
  article: ParsedArticle;
  /** Confidence della normalizzazione (0-1) */
  confidence: number;
  /** Campi per cui il normalizzatore non e sicuro */
  uncertainFields: string[];
}
```

### Strategia a 3 livelli (critica per i costi)

```typescript
async function normalize(
  rawItem: unknown,
  source: DataSource,
  mappingRules?: MappingRule[]
): Promise<ParsedArticle> {

  // Livello 1: parser hardcoded (costo $0, latenza ~1ms)
  if (source.connector === "normattiva") return parseAkn(rawItem);
  if (source.connector === "eurlex") return parseEurLexHtml(rawItem);

  // Livello 2: mapping rules deterministiche (costo $0, latenza ~5ms)
  if (mappingRules && mappingRules.length > 0) {
    return applyMappingRules(rawItem, mappingRules);
  }

  // Livello 3: normalizzazione LLM (costo ~$0.001/articolo, latenza ~2-5s)
  return normalizeWithLLM(rawItem, targetSchema);
}
```

### Modello AI suggerito (solo per Livello 3)

| Tier | Modello | Costo per articolo | Motivazione |
|------|---------|-------------------|-------------|
| **Raccomandato** | `gemini-2.5-flash-lite` | ~$0.0003 (~500 in, ~300 out) | Il piu economico nel registry. Per estrazione strutturata basta. |
| Alternativa | `gemini-2.5-flash` | ~$0.0005 | Se Lite non e sufficientemente accurato |
| Free tier | `groq-llama3-8b` | ~$0.00004 | Per batch grandi. 1000 req/giorno limite Groq. |

**Stima costi per Livello 3:**

| Scenario | Articoli | Costo Flash Lite | Costo Flash |
|----------|----------|------------------|-------------|
| Singola fonte nuova (~100 art.) | 100 | ~$0.03 | ~$0.05 |
| CCNL completo (~400 art.) | 400 | ~$0.12 | ~$0.20 |
| Verticale HR completo (~800 art.) | 800 | ~$0.24 | ~$0.40 |
| Full re-process corpus (5600 art.) | 5600 | ~$1.70 | ~$2.80 |

**Nota critica:** il Livello 3 costa 1000x di piu del parser hardcoded. E 10-50x piu lento. Va usato SOLO per fonti dove scrivere un parser hardcoded costerebbe piu ore-sviluppo del valore dei dati.

### Prompt design (schema)

```
Sei un normalizzatore di dati legislativi. Ricevi un documento raw e devi
estrarre i dati secondo lo schema target fornito.

Schema target:
[schema con tipi e descrizioni]

Documento raw:
[testo/html/xml del singolo articolo]

Estrai:
- articleNumber: il numero dell'articolo
- articleTitle: il titolo (null se assente)
- articleText: il testo completo dell'articolo
- hierarchy: {book, title, chapter, section} se presenti
- isInForce: false se l'articolo e esplicitamente abrogato

Rispondi ESCLUSIVAMENTE con JSON puro.
```

### Dove si inserisce nel codice

```
lib/staff/data-connector/
├── normalizers/
│   ├── rule-based-normalizer.ts   # Interpreta MappingRule[] senza LLM
│   └── ai-normalizer.ts           # Fallback LLM per fonti senza regole
```

Il normalizer si inserisce nella pipeline come step tra fetch e validate in `index.ts`:

```typescript
// In runPipeline(), fase LOAD — dopo fetchAll(), prima di validateBatch()
const rawItems = fetchResult.items;

// Normalizzazione (nuovo step)
const normalizer = resolveNormalizer(source);
const articles: ParsedArticle[] = await normalizer.normalize(rawItems);

// Validazione (invariato)
const validation = validateBatch(articles);
```

---

## 6. Integration Points

### File da modificare

| File | Modifica | Impatto |
|------|---------|--------|
| `lib/staff/data-connector/types.ts` | Aggiungere `NormalizerInterface`, `MappingRule`, `DesignerOutput` | Basso — nuove interfacce, nessuna modifica a quelle esistenti |
| `lib/staff/data-connector/index.ts` | Inserire step NORMALIZE tra fetch e validate nella fase LOAD | Medio — tocca la funzione principale `runPipeline()` |
| `lib/staff/data-connector/plugin-registry.ts` | Aggiungere `registerNormalizer()` / `resolveNormalizer()` | Basso — pattern identico a connector/model/store |
| `scripts/data-connector.ts` | Aggiungere comando CLI `design <source-id>` | Basso — nuovo subcommand |

### File da creare

| File | Scopo |
|------|-------|
| `lib/staff/data-connector/designers/ai-model-designer.ts` | Data Model Agent |
| `lib/staff/data-connector/normalizers/rule-based-normalizer.ts` | Normalizer deterministico |
| `lib/staff/data-connector/normalizers/ai-normalizer.ts` | Normalizer LLM (Livello 3) |
| `scripts/model-designer.ts` | CLI per invocare il Designer |
| `company/data-engineering/agents/data-model-designer.md` | Identity card agente |
| `company/data-engineering/agents/data-normalizer.md` | Identity card agente |

### File che NON cambiano

- `parsers/akn-parser.ts` — resta invariato, usato come Livello 1
- `parsers/html-parser.ts` — resta invariato, usato come Livello 1
- `models/legal-article-model.ts` — resta il model default per `legal-articles`
- `stores/legal-corpus-store.ts` — resta invariato
- `validators/article-validator.ts` — resta invariato

### Compatibilita con il Plugin Registry

Il plugin registry (`plugin-registry.ts`) gia supporta registrazione dinamica. L'aggiunta di normalizer segue esattamente lo stesso pattern:

```typescript
// Nuove factory e registry
const normalizerRegistry = new Map<string, NormalizerFactory>();

export function registerNormalizer(id: string, factory: NormalizerFactory): void {
  normalizerRegistry.set(id, factory);
}

export function resolveNormalizer(source: DataSource): NormalizerInterface {
  // Fallback chain: hardcoded → rule-based → ai
  const factory = normalizerRegistry.get(source.connector);
  if (factory) return factory(source);

  // Default: rule-based se ha mapping, altrimenti AI
  return new FallbackNormalizer(source);
}
```

---

## 7. Stima Costi

### Costi una tantum (design-time)

| Operazione | Modello | Invocazioni | Costo |
|-----------|---------|-------------|-------|
| Design mapping per 1 fonte nuova | Gemini Flash | 1-3 | ~$0.01 |
| Design mapping per tutte le 14 fonti attuali | Gemini Flash | 14-42 | ~$0.10 |
| Validazione output Designer su 3 fonti | Sonnet 4.5 | 3 | ~$0.12 |
| **Totale design-time** | | | **~$0.23** |

### Costi ricorrenti (runtime — solo Livello 3)

| Scenario | Frequenza | Costo/esecuzione |
|----------|-----------|-----------------|
| Delta update fonte standard (parser hardcoded) | settimanale | $0.00 |
| Delta update fonte con mapping rules | settimanale | $0.00 |
| Nuova fonte non-standard (100 articoli LLM) | una tantum | ~$0.03-0.05 |
| Re-sync completa fonte non-standard | rara | ~$0.03-0.05 |

### Confronto costo con lo status quo

| Approccio | Costo per nuova fonte | Tempo implementazione |
|-----------|----------------------|----------------------|
| Parser hardcoded manuale | $0.00 (token) + 4-8h sviluppo | 1-2 giorni |
| Data Model Designer + Normalizer | ~$0.05 (token) + 1-2h setup | 15-30 minuti |
| **Break-even**: il Designer si ripaga dalla **3a fonte nuova** in termini di ore-sviluppo. |

---

## 8. Stima Effort Implementazione

### Fase 1: Data Model Designer (CLI tool)

| Task | Effort | Dipendenze |
|------|--------|-----------|
| Interfacce TypeScript (`MappingRule`, `DesignerOutput`) | 2h | Nessuna |
| `ai-model-designer.ts` con prompt engineering | 4h | Interfacce |
| `scripts/model-designer.ts` (CLI) | 2h | Designer |
| Test su 3 fonti esistenti (verifica accuracy) | 3h | CLI |
| Identity card agente | 0.5h | Nessuna |
| **Totale Fase 1** | **~12h (2 giorni)** | |

### Fase 2: Data Normalizer (pipeline integration)

| Task | Effort | Dipendenze |
|------|--------|-----------|
| `rule-based-normalizer.ts` (interprete MappingRule) | 4h | MappingRule da Fase 1 |
| `ai-normalizer.ts` (fallback LLM) | 3h | Interfacce |
| Registrazione in plugin-registry | 1h | Normalizer |
| Modifica `index.ts` per step NORMALIZE | 2h | Normalizer + registry |
| Test su fonte non-standard (es. CCNL o circolare INPS) | 4h | Pipeline integrata |
| Identity card agente | 0.5h | Nessuna |
| **Totale Fase 2** | **~15h (2-3 giorni)** | Fase 1 completata |

### Totale progetto

**~27h (4-5 giorni lavorativi)** per entrambi gli agenti con test.

---

## 9. Analisi Rischi

| Rischio | Probabilita | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| LLM produce mapping rules errate | Media | Medio | Validazione su fonti note prima di usare su fonti nuove. Confronto output LLM vs parser hardcoded. |
| Costo LLM Livello 3 fuori controllo su batch grandi | Bassa | Medio | Limite hardcoded: max 500 articoli per invocazione Livello 3. Oltre → richiede approvazione. |
| Latenza normalizzazione LLM rallenta la pipeline | Alta | Basso | Livello 3 usato solo per fonti senza alternative. Parser hardcoded restano il default. |
| Over-engineering: costruiamo un framework per 2-3 fonti nuove | Media | Alto | Implementare SOLO Fase 1 inizialmente. Fase 2 solo se Fase 1 dimostra valore concreto. |
| Mapping rules non coprono edge case | Alta | Basso | Fallback automatico a LLM Livello 3 per items dove le regole falliscono. |

---

## 10. Raccomandazione

### Verdetto: IMPLEMENTARE Fase 1, RIMANDARE Fase 2

**Motivazione:**

1. **Il Data Model Designer (Fase 1) ha ROI immediato** — e un CLI tool che genera mapping rules una tantum. Costo trascurabile (~$0.01 per fonte), effort contenuto (2 giorni), e risolve un problema reale: accelera l'onboarding di nuove fonti senza scrivere parser custom.

2. **Il Data Normalizer (Fase 2) ha ROI condizionale** — il valore dipende da quante fonti non-standard aggiungeremo. Oggi tutte le 14 fonti sono AKN o HTML EUR-Lex, gia coperte dai parser hardcoded. Il Normalizer diventa utile solo quando arrivano CCNL, circolari INPS, o fonti multi-verticale.

3. **Il rischio principale e l'over-engineering** — costruire un framework di normalizzazione AI per un problema che oggi non esiste. Le 14 fonti funzionano. Le 2-3 fonti HR in arrivo (D.Lgs. 81/2008, 276/2003) sono AKN standard.

### Piano di azione proposto

```
Settimana 1: Fase 1 — Data Model Designer CLI
  ├─ Interfacce + implementazione
  ├─ Test su codice_civile, gdpr, dlgs_231_2001
  └─ Valutazione accuracy: obiettivo > 80% match con parser hardcoded

Gate di approvazione: se accuracy > 80% → procedere con Fase 2

Settimana 2-3: Fase 2 — Data Normalizer (solo se approvato)
  ├─ Rule-based normalizer + AI fallback
  ├─ Integrazione pipeline
  └─ Test su fonte reale non-standard
```

### Quick-win immediato

Indipendentemente dalla decisione sugli agenti, si puo gia:

1. **Disaccoppiare il parsing dal connettore** — spostare `parseAkn()` e `parseEurLexHtml()` come step esplicito nella pipeline (oggi sono dentro `fetchAll()`). Questo prepara il terreno per il Normalizer senza aggiungere AI. Effort: ~2h.

2. **Rendere le `transformRules` di `LegalArticleModel` eseguibili** — oggi sono solo documentazione. Un interprete semplice (50 righe) potrebbe applicarle automaticamente, eliminando il mapping hardcoded in `index.ts` righe 222-232. Effort: ~3h.

---

## Appendice A: Confronto con ADR-DE-AI-pipeline.md

L'ADR precedente (`adr/ADR-DE-AI-pipeline.md`) proponeva un approccio simile ma meno dettagliato. Le differenze chiave:

| Aspetto | ADR precedente | Questa ADR |
|---------|---------------|------------|
| Strategia fallback | Non specificata | 3 livelli: hardcoded → rules → LLM |
| Costi dettagliati | Stima approssimativa | Costi per modello, per fonte, per scenario |
| Integration points | Generici | File specifici con diff stimati |
| Effort | "2-3 giorni / 3-5 giorni" | Breakdown per task con ore |
| Rischi | 4 rischi generici | 5 rischi con probabilita, impatto, mitigazione |
| Raccomandazione | "Approvato concettualmente" | "Implementare Fase 1, gate per Fase 2" |

Questa ADR supersede la precedente con analisi piu approfondita.

---

## Appendice B: Modelli AI candidati (da lib/models.ts)

Per riferimento, i modelli piu rilevanti per questi agenti staff:

| Modello | Provider | Input $/1M | Output $/1M | Context | Note |
|---------|----------|-----------|-------------|---------|------|
| `gemini-2.5-flash-lite` | Google | $0.10 | $0.40 | 1M | Piu economico. Buono per normalizzazione batch. |
| `gemini-2.5-flash` | Google | $0.15 | $0.60 | 1M | Buon compromesso. Context 1M per campioni grandi. |
| `mistral-small-3` | Mistral | $0.06 | $0.18 | 128K | Free tier (2 RPM). Alternativa per test. |
| `groq-llama3-8b` | Groq | $0.05 | $0.08 | 128K | Free tier. Velocissimo su Groq hardware. |
| `groq-llama4-scout` | Groq | $0.11 | $0.34 | 128K | Free tier. Migliore qualita di Llama 3.1 8B. |
| `gemini-2.5-pro` | Google | $1.25 | $10.00 | 1M | Overkill per normalizzazione. Riserva per design complesso. |
| `claude-sonnet-4.5` | Anthropic | $3.00 | $15.00 | 200K | Troppo costoso per batch. Solo per validazione output. |

**Scelta raccomandata:** `gemini-2.5-flash` per il Designer, `gemini-2.5-flash-lite` per il Normalizer batch.
