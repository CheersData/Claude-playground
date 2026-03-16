# ADR-004: Google Vertex AI vs AI Studio

**Data:** 2026-03-15
**Stato:** Proposta (L3 — richiede approvazione boss)
**Proponente:** Architecture
**Impatta:** Gemini integration, GDPR, Finance, Security

---

## Contesto

Controlla.me usa Gemini via Google AI Studio (`@google/genai` con `GEMINI_API_KEY`). Gemini è il provider #2 dopo Anthropic: presente nelle fallback chain di 8 agenti su 10, priorità #1 nella free LLM chain (`lib/llm.ts`), e usato dal corpus-agent e question-prep come provider preferito.

La domanda: restare su AI Studio o migrare a Vertex AI? Impatto diretto su GDPR compliance e costi.

---

## Analisi

### Pricing

**Identico** per i rate standard. Vertex offre in più:
- **Flex/Batch**: 50% sconto per workload non real-time
- **Priority**: 1.8x per throughput garantito

| Modello | Input | Output |
|---------|-------|--------|
| Gemini 2.5 Flash | $0.30/1M | $2.50/1M |
| Gemini 2.5 Pro | $1.25/1M | $10.00/1M |

### GDPR e DPA — IL PUNTO CRITICO

| Criterio | AI Studio Free | AI Studio Paid | Vertex AI |
|----------|---------------|----------------|-----------|
| DPA | ❌ NO | ✅ Sì | ✅ Sì (CDPA enterprise) |
| Google usa i dati per training | ✅ Sì | ❌ No | ❌ No |
| Data residency EU | ❌ No control | ❌ No control | ✅ `europe-west4` (NL) |
| Legale per utenti EEA | ❌ **Vietato dai ToS Google** | ✅ Sì | ✅ Sì |

**Fatto critico**: i ToS di Google AI Studio dichiarano esplicitamente che utenti EEA/UK/CH *devono* usare i Paid Services. Il free tier è tecnicamente accessibile ma **giuridicamente vietato** per un SaaS italiano. Il nostro uso attuale viola i termini Google.

### Data Residency

- **AI Studio**: nessun controllo sulla regione di processing
- **Vertex AI**: regioni EU disponibili (`europe-west1` BE, `europe-west3` DE, `europe-west4` NL, `europe-west9` FR)

Per GDPR art. 44-49 (trasferimenti extra-UE), Vertex con regione EU è l'unica opzione che garantisce processing in UE.

### Migrazione — Effort minimo

Il SDK `@google/genai` (già in uso, v1.42.x) supporta **nativamente** sia AI Studio che Vertex AI. La migrazione è una modifica di 1 riga:

```typescript
// ATTUALE (AI Studio)
_client = new GoogleGenAI({ apiKey });

// VERTEX AI
_client = new GoogleGenAI({
  vertexai: true,
  project: process.env.GCP_PROJECT_ID,
  location: process.env.GCP_LOCATION || 'europe-west4',
});
```

Tutto il resto del codice (`generateContent`, response parsing, token counting) resta identico.

### Free Tier — Impatto

Perdiamo il free tier AI Studio (250 req/giorno). Ma:
1. Quel free tier è illegale per noi (ToS EEA)
2. GCP offre $300 di crediti trial (90 giorni)
3. Gemini Flash costa $0.30/1M input — con 100 req/giorno da ~2K token = ~$0.06/giorno
4. La free LLM chain in `lib/llm.ts` ha 4 fallback: perde Gemini free ma ha ancora Groq (1000 req/day), Cerebras (24M tok/day), Mistral (2 RPM)

### Cosa cambia nel codice

| File | Modifica |
|------|----------|
| `lib/gemini.ts` | Client init: `vertexai: true` + project/location. Rimuovere logica API key rotation (non serve su Vertex) |
| `.env.local` | Sostituire `GEMINI_API_KEY` con `GCP_PROJECT_ID`, `GCP_LOCATION`, `GOOGLE_APPLICATION_CREDENTIALS` |
| `lib/llm.ts` | Aggiornare check `isGeminiEnabled()` per nuove env vars |
| Infra | Creare progetto GCP, abilitare Vertex AI API, creare service account con `roles/aiplatform.user` |

Effort stimato: **2-4 ore** (incluso setup GCP).

---

## Decisione proposta

**Migrare a Google Vertex AI** con regione `europe-west4` (Paesi Bassi).

### Motivazioni

1. **Compliance legale**: l'uso attuale del free tier AI Studio viola i ToS Google per utenti EEA
2. **GDPR**: DPA enterprise incluso, data residency EU garantita, nessun uso dati per training
3. **Zero impatto pricing**: tariffe identiche, con opzione Flex/Batch per risparmiare
4. **Migrazione banale**: 1 riga di codice, stesso SDK già in uso
5. **Prerequisito lancio commerciale**: senza DPA con Google non possiamo processare dati utenti PMI via Gemini

### Rischi

1. **Disponibilità modelli EU**: modelli nuovi possono arrivare in EU con ritardo (giorni/settimane). Mitigazione: fallback chain già gestisce provider non disponibili
2. **Costo fisso**: niente più free tier Gemini. Mitigazione: costo minimo ($0.06/giorno stima attuale), altri free provider disponibili

---

## Alternativa scartata

**Restare su AI Studio Paid**: risolve il DPA ma non la data residency. Non puoi scegliere la regione di processing → non garantisce GDPR art. 44.

---

## Azioni richieste

1. **[Boss]** Approvare migrazione a Vertex AI
2. **[Architecture]** Creare progetto GCP + service account
3. **[Architecture]** Modificare `lib/gemini.ts` (1 riga + cleanup key rotation)
4. **[Architecture]** Aggiornare env vars e documentazione
5. **[Finance]** Attivare billing GCP e monitorare costi
6. **[Security]** Verificare service account permissions (principio least privilege)
