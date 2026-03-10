# DPA (Data Processing Agreement) — Action Plan

> **Autore:** Security Department (security-auditor)
> **Data:** 2026-03-10
> **Stato:** APPROVATO DAL BOSS — esecuzione autorizzata
> **Task:** 5c28dd4c
> **Prerequisito:** Firmati i DPA P0 e P1 prima del lancio B2B
> **Assessment completo:** `company/security/dpa-ai-act-assessment.md`

---

## Riepilogo Provider e Priorita

| # | Provider | Ruolo | Sede | DPA Self-Served | Priorita | Effort | Stato |
|---|----------|-------|------|-----------------|----------|--------|-------|
| 1 | **Anthropic** | Provider principale (tutti gli agenti) | US | Si — anthropic.com | **P0 BLOCCANTE** | 30 min | DA FARE |
| 2 | **Mistral** | Fallback tier Intern (EU nativo) | FR | Si — mistral.ai | **P1 ALTA** | 30 min | DA FARE |
| 3 | **Google** | Fallback tier Associate | US/EU | Da valutare | **P1 ALTA** | 1-3 ore | DA VALUTARE |
| 4 | OpenAI | Fallback opzionale | US | Si | P2 | 30 min | Bassa priorita |
| 5 | Groq | Fallback tier Intern | US | Su richiesta | P3 | 1-2 settimane | Valutare rimozione |
| 6 | Cerebras | Fallback ultimo resort | US | Su richiesta | P3 | 1-2 settimane | Valutare rimozione |
| 7 | Voyage AI | Embeddings (solo chunk) | US | Su richiesta | P3 | 1-2 settimane | Bassa priorita |

---

## Provider 1: Anthropic (P0 BLOCCANTE)

### Perche P0

Anthropic e il provider principale. L'Investigator e vincolato ad Anthropic (web_search tool proprietario). TUTTI i dati contrattuali transitano verso Anthropic in configurazione Partner. Senza DPA firmato, nessun dato personale puo essere legittimamente inviato.

### Procedura (self-served, ~30 minuti)

**Step 1 — Accedere al DPA Anthropic**
- URL: https://www.anthropic.com/legal/dpa
- Il DPA e disponibile come click-through agreement per clienti API
- Alternativa: https://console.anthropic.com → Settings → Legal → Data Processing Agreement

**Step 2 — Compilare le informazioni richieste**
- Nome azienda / entita giuridica (titolare del trattamento)
- Indirizzo sede legale
- Contatto DPO / referente privacy (email dedicata)
- Paese di stabilimento (Italia)
- Tipo di dati trattati: testo contrattuale contenente dati personali (nomi, indirizzi, CF, IBAN)
- Finalita del trattamento: analisi legale automatizzata di contratti
- Categorie di interessati: clienti finali (B2C) e dipendenti/partner commerciali dei clienti B2B
- Durata del trattamento: per la durata del contratto di servizio

**Step 3 — Verificare le clausole chiave**
Controllare che il DPA includa:

| Clausola | Cosa verificare |
|----------|----------------|
| SCCs (Standard Contractual Clauses) | Incluse per trasferimento UE→US (Decisione UE 2021/914) |
| Zero-retention | Conferma che i dati API non vengono conservati oltre il processing |
| No training | Conferma esplicita che i dati API non sono usati per addestrare modelli |
| Sub-processors | Lista sub-processor accessibile (AWS, etc.) |
| Notifica breach | Tempistica notifica (deve essere ≤ 72 ore per GDPR Art. 33) |
| Audit rights | Diritto di audit da parte del titolare |
| Cancellazione | Procedura per richiedere cancellazione dati a fine contratto |
| Misure tecniche | Encryption in transit (TLS), access controls, SOC 2 |

**Step 4 — Firmare e archiviare**
- Scaricare il DPA firmato in PDF
- Archiviare in `company/security/dpa/anthropic-dpa-signed-YYYY-MM-DD.pdf`
- Aggiornare `company/security/dpa-ai-act-assessment.md` con data firma

**Step 5 — Transfer Impact Assessment (TIA)**
Dopo la firma del DPA, completare il TIA per il trasferimento UE→US:
- Valutare rischio FISA 702 / EO 12333 per i dati trattati
- Documentare misure tecniche supplementari (TLS 1.3, zero-retention, no storage at rest)
- Archiviare TIA in `company/security/dpa/tia-anthropic-YYYY-MM-DD.md`

**Tempo stimato:** 30 minuti per DPA + 2-3 ore per TIA

---

## Provider 2: Mistral (P1 ALTA)

### Perche P1

Mistral e un provider EU (Francia) — il rischio GDPR e intrinsecamente basso. Non servono SCCs ne TIA. Tuttavia, un DPA formale e comunque obbligatorio per l'Art. 28 GDPR (rapporto titolare-responsabile).

### Procedura (self-served, ~30 minuti)

**Step 1 — Accedere al DPA Mistral**
- URL: https://mistral.ai/terms/ → Data Processing Agreement
- Alternativa: https://console.mistral.ai → Settings → Legal
- Mistral come azienda francese offre un DPA nativamente conforme al GDPR

**Step 2 — Compilare le informazioni richieste**
- Stesse informazioni di Anthropic (vedi sopra)
- Specificare che si usa il free tier (2 RPM) — verificare che il DPA copra anche il free tier

**Step 3 — Verificare le clausole chiave**

| Clausola | Cosa verificare |
|----------|----------------|
| Processing location | Conferma EU-only (Francia + Azure EU) |
| No transfer extra-UE | Nessun trasferimento fuori UE/EEA |
| Zero-retention | Conferma zero-retention su API |
| No training | Conferma no training su dati API |
| Sub-processors | Lista (Azure EU, etc.) |
| Breach notification | ≤ 72 ore |
| Free tier coverage | Il DPA copre anche il piano gratuito |

**Step 4 — Firmare e archiviare**
- Scaricare PDF firmato
- Archiviare in `company/security/dpa/mistral-dpa-signed-YYYY-MM-DD.pdf`

**Nota:** Nessun TIA necessario (provider EU, nessun trasferimento extra-UE).

**Tempo stimato:** 30 minuti

---

## Provider 3: Google Gemini (P1 ALTA — Da Valutare)

### Il problema specifico di Google

Google ha DUE ecosistemi separati con DPA diversi:

| Ecosistema | DPA | Applicabile a noi? |
|-----------|-----|-------------------|
| **Google Cloud** (Vertex AI) | DPA robusto, maturo, SCCs incluse, regioni EU disponibili | NO — non usiamo Vertex AI |
| **Gemini API** (ai.google.dev) | Terms of Service della Gemini API — DPA meno chiaro | SI — usiamo `@google/genai` SDK |

### Decisione da prendere

**Opzione A: Usare Gemini API cosi com'e**
- Verificare se i Terms of Service della Gemini API includono protezioni DPA equivalenti
- Rischio: il free tier (250 req/giorno) potrebbe avere condizioni diverse
- Pro: nessun cambiamento architetturale
- Contro: DPA meno robusto di Google Cloud

**Opzione B: Migrare a Vertex AI (Google Cloud)**
- DPA completo e maturo incluso nei Google Cloud ToS
- Possibilita di selezionare region EU per processing
- Pro: protezione GDPR massima
- Contro: richiede account Google Cloud, potenzialmente a pagamento, modifica a `lib/gemini.ts`

**Opzione C: Chiedere conferma scritta a Google**
- Contattare Google Developer Support per conferma che il DPA Google Cloud copra anche la Gemini API
- Se si: archiviare conferma scritta come evidenza
- Se no: valutare migrazione a Vertex AI

### Procedura raccomandata

**Step 1 — Verificare i ToS della Gemini API**
- URL: https://ai.google.dev/terms
- Cercare: "Data Processing", "GDPR", "Standard Contractual Clauses"
- Documentare cosa coprono e cosa no

**Step 2 — Contattare Google Developer Support**
- Formulare domanda specifica:
  "Does the Google Cloud DPA (https://cloud.google.com/terms/data-processing-addendum) cover the Gemini API accessed via the @google/genai SDK (ai.google.dev), or is a separate DPA required?"
- Canale: Google Cloud support ticket o Google Developers community

**Step 3 — Decisione (L2 CME)**
- Se il DPA copre la Gemini API: archiviare conferma, nessuna azione aggiuntiva
- Se non copre: valutare migrazione a Vertex AI (effort: 2-3 giorni dev per adattare `lib/gemini.ts`)

**Tempo stimato:** 1-3 ore per ricerca + attesa risposta Google (1-2 settimane)

---

## Provider 4-7: Azioni Differite

### OpenAI (P2 — post-lancio)

- DPA self-served disponibile su https://openai.com/policies/data-processing-addendum
- Procedura identica ad Anthropic
- Priorita bassa: OpenAI e solo fallback opzionale, attivabile solo con API key esplicita
- **Azione:** firmare entro 3 mesi dal lancio

### Groq (P3 — valutare rimozione)

- DPA **NON** self-served. Disponibile solo per clienti enterprise su richiesta
- Il free tier (1000 req/giorno) probabilmente non e coperto
- **Rischio aggiuntivo:** `groq-kimi-k2` (Moonshot AI, Cina) — stesse preoccupazioni di DeepSeek
- **Raccomandazione:** contattare Groq (support@groq.com) per richiedere DPA. Se non disponibile entro 30 giorni, rimuovere dalla catena di fallback per dati sensibili
- **Azione parallela:** rimuovere `groq-kimi-k2` dalla model registry (modello cinese)

### Cerebras (P3 — valutare rimozione)

- Stessa situazione di Groq: DPA enterprise-only, free tier non coperto
- **Rischio aggiuntivo:** `cerebras-qwen3-235b` (Alibaba/Qwen, Cina)
- **Raccomandazione:** contattare Cerebras per DPA. Se non disponibile, rimuovere
- **Azione parallela:** rimuovere `cerebras-qwen3-235b` dalla model registry (modello cinese)

### Voyage AI (P3 — rischio inferiore)

- Rischio inferiore: riceve solo chunk di testo (max 8000 char), non il documento intero
- Gli embeddings prodotti (vettori 1024d) non sono reversibili a testo
- **Azione:** richiedere DPA quando disponibile. Alternativa: valutare Mistral Embed (EU) come sostituto

---

## Procedura Archiviazione DPA

### Struttura directory

```
company/security/dpa/
  anthropic-dpa-signed-YYYY-MM-DD.pdf
  mistral-dpa-signed-YYYY-MM-DD.pdf
  google-dpa-signed-YYYY-MM-DD.pdf       (o conferma scritta)
  tia-anthropic-YYYY-MM-DD.md
  tia-google-YYYY-MM-DD.md               (se processing in US)
  README.md                               (indice dei DPA firmati)
```

### Checklist post-firma per ogni provider

- [ ] PDF firmato archiviato in `company/security/dpa/`
- [ ] `dpa-ai-act-assessment.md` aggiornato con data firma
- [ ] `department.md` aggiornato (stato priorita)
- [ ] TIA completato (solo per provider US)
- [ ] Sub-processor list ottenuta e archiviata
- [ ] Pagina `/legal/sub-processors` aggiornata (quando implementata)

---

## Timeline Riepilogativa

```
MARZO 2026 (settimane 2-4):
  [ ] Firmare DPA Anthropic (self-served, 30 min) — AZIONE IMMEDIATA
  [ ] Firmare DPA Mistral (self-served, 30 min) — AZIONE IMMEDIATA
  [ ] Avviare verifica DPA Google Gemini API
  [ ] Completare TIA per Anthropic (2-3 ore)

APRILE 2026:
  [ ] Risolvere questione Google (Gemini API vs Vertex AI)
  [ ] Completare TIA per Google (se processing US)
  [ ] Contattare Groq e Cerebras per DPA enterprise

MAGGIO 2026:
  [ ] Deadline Groq/Cerebras: DPA ottenuto o provider rimosso dalla catena
  [ ] Rimuovere modelli cinesi (Kimi K2, Qwen 3 235B) dalla registry

GIUGNO 2026 (+3 mesi):
  [ ] Firmare DPA OpenAI (se in uso)
  [ ] Firmare DPA Voyage AI (se disponibile)
  [ ] Tutte le azioni P0-P2 completate
```

---

## Azioni Immediate (questa settimana)

| # | Azione | Chi | Tempo | Blocca |
|---|--------|-----|-------|--------|
| 1 | Accedere a anthropic.com/legal/dpa e completare il DPA | CME / Boss | 30 min | Lancio B2B |
| 2 | Accedere a mistral.ai/terms e completare il DPA | CME / Boss | 30 min | Lancio B2B |
| 3 | Verificare i ToS di Google Gemini API per copertura DPA | Security | 1 ora | Decisione Google |
| 4 | Creare directory `company/security/dpa/` | Security | 5 min | Archiviazione |

---

## Riferimenti

- GDPR Art. 28 — Responsabile del trattamento
- GDPR Art. 44-49 — Trasferimenti extra-UE
- Decisione UE 2021/914 — Standard Contractual Clauses
- Assessment completo: `company/security/dpa-ai-act-assessment.md`
- Raccomandazione modelli cinesi: sezione 2.4 dell'assessment

---

> **Stato:** Boss ha approvato. DPA Anthropic e Mistral sono azioni immediate (self-served, 30 min ciascuno). Google richiede valutazione aggiuntiva.
