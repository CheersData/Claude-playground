# DPA e EU AI Act — Assessment di Conformita

> **Autore:** Security Department (security-auditor)
> **Data:** 2026-03-01
> **Stato:** DRAFT — da sottoporre a revisione legale esterna prima del lancio B2B
> **Prossima revisione:** 2026-06-01 (3 mesi prima della scadenza EU AI Act agosto 2026)

---

## Indice

1. [Contesto e Ambito](#1-contesto-e-ambito)
2. [Assessment DPA per Provider](#2-assessment-dpa-per-provider)
3. [Classificazione EU AI Act](#3-classificazione-eu-ai-act)
4. [Checklist GDPR per Lancio B2B](#4-checklist-gdpr-per-lancio-b2b)
5. [Piano d'Azione Prioritizzato](#5-piano-dazione-prioritizzato)
6. [Allegati](#6-allegati)

---

## 1. Contesto e Ambito

### 1.1 Descrizione del Servizio

**Controlla.me** e una piattaforma AI che analizza contratti legali caricati dagli utenti (PDF, DOCX, TXT) tramite una pipeline multi-agente:

1. **Classifier** — classifica il tipo di contratto e identifica istituti giuridici
2. **Analyzer** — individua clausole rischiose dal punto di vista della parte debole
3. **Investigator** — ricerca giurisprudenziale con web search
4. **Advisor** — produce un parere comprensibile con scoring multidimensionale

Funzionalita aggiuntive:
- **Corpus Agent** — Q&A su ~5600 articoli legislativi italiani ed europei
- **Deep Search** — approfondimento su clausole specifiche
- **Vector DB** — embeddings semantici per ricerca normativa (Voyage AI)

### 1.2 Dati Trattati

| Categoria | Tipo | Sensibilita | Dove vengono inviati |
|-----------|------|-------------|---------------------|
| Testo contrattuale | Contenuto integrale del documento | **ALTA** — contiene dati personali (nomi, indirizzi, CF, IBAN), clausole riservate, condizioni economiche | Provider AI per analisi |
| Classificazione | Tipo contratto, istituti giuridici | Media | Supabase (PostgreSQL) |
| Analisi rischi | Clausole rischiose, scoring | Media | Supabase + Provider AI |
| Ricerca legale | Query web search | Bassa | Anthropic (web_search tool) |
| Embeddings | Vettori numerici 1024d | Bassa (non reversibili) | Voyage AI + Supabase pgvector |
| Dati utente | Email, nome, piano, contatore analisi | Media — dati personali | Supabase + Stripe |
| Dati di pagamento | Carta, transazioni | **ALTA** — PCI-DSS | Solo Stripe (non transitano dal server) |

### 1.3 Flusso Dati verso Provider AI

```
Utente carica documento
    |
    v
Server Next.js (Vercel / Node.js)
    |
    +---> [1] Anthropic API (US) — classificazione, analisi, investigazione, consiglio
    |         Dati inviati: testo contrattuale integrale + prompt di sistema
    |
    +---> [2] Google Gemini API (US/EU) — fallback per classificazione, analisi, corpus
    |         Dati inviati: testo contrattuale integrale + prompt di sistema
    |
    +---> [3] OpenAI API (US) — fallback nella catena tier
    |         Dati inviati: testo contrattuale integrale + prompt di sistema
    |
    +---> [4] Mistral API (FR/EU) — fallback nella catena tier
    |         Dati inviati: testo contrattuale integrale + prompt di sistema
    |
    +---> [5] Groq API (US) — fallback nella catena tier
    |         Dati inviati: testo contrattuale integrale + prompt di sistema
    |
    +---> [6] Cerebras API (US) — fallback nella catena tier
    |         Dati inviati: testo contrattuale integrale + prompt di sistema
    |
    +---> [7] Voyage AI API (US) — embeddings semantici
    |         Dati inviati: chunk di testo (max 8000 char) per vettorizzazione
    |
    +---> [8] Supabase (EU-West) — storage dati
    |         Dati salvati: analisi, profili, sessioni
    |
    +---> [9] Stripe (US) — pagamenti
              Dati: solo token di pagamento, mai dati carta sul server
```

**Nota critica:** Il testo contrattuale integrale viene inviato a provider AI extra-UE. Questo e il rischio GDPR principale.

### 1.4 Provider Rimossi

| Provider | Stato | Motivo | Riferimento |
|----------|-------|--------|-------------|
| **DeepSeek** | RIMOSSO (SEC-001) | Server in Cina. Nessun accordo di adeguatezza UE-Cina. Legge cinese sulla sicurezza dei dati impone obblighi di accesso governativo incompatibili con GDPR. | `lib/models.ts`, `lib/ai-sdk/openai-compat.ts` |

---

## 2. Assessment DPA per Provider

### 2.1 Tabella Riepilogativa

| # | Provider | Sede | DPA Disponibile | Data Processing Location | Retention Dichiarata | Training sui Dati | GDPR Status | Priorita DPA |
|---|----------|------|----------------|--------------------------|---------------------|-------------------|-------------|-------------|
| 1 | **Anthropic** | US (San Francisco) | Si — DPA standard disponibile su richiesta, accetta SCCs | US (AWS us-east, us-west) | 30 giorni per safety, poi cancellazione. Zero-retention con API in produzione | No (API business) | Parziale — richiede SCCs | **P0 CRITICA** |
| 2 | **Google (Gemini)** | US (Mountain View) / EU | Si — DPA integrato in Google Cloud ToS, SCCs pre-firmate | EU disponibile (Google Cloud region) | Zero-retention su API paid. Free tier: fino a 30gg | No (API business con opt-out confermato) | Buono — DPA robusto, EU regions disponibili | **P1 ALTA** |
| 3 | **Mistral** | FR (Parigi) | Si — DPA conforme GDPR nativo, provider EU | EU (Francia, Azure EU) | Zero-retention su API | No | **Ottimo** — provider EU nativo | **P2 MEDIA** |
| 4 | **OpenAI** | US (San Francisco) | Si — DPA standard, SCCs incluse | US (Azure US), EU in espansione | Zero-retention su API business (30gg per abuse monitoring revocabile) | No (API business) | Parziale — richiede SCCs | **P3 MEDIA** |
| 5 | **Groq** | US (Mountain View) | In fase di sviluppo — DPA su richiesta per enterprise | US | Non documentata pubblicamente — da verificare | Non chiaro — da chiarire contrattualmente | Debole — startup, DPA non maturo | **P4 ALTA** |
| 6 | **Cerebras** | US (Sunnyvale) | In fase di sviluppo — DPA enterprise su richiesta | US | Non documentata pubblicamente — da verificare | Non chiaro — da chiarire contrattualmente | Debole — startup, DPA non maturo | **P5 ALTA** |
| 7 | **Voyage AI** | US | Limitato — ToS standard, DPA su richiesta | US | Non documentata esplicitamente | Potenziale uso per miglioramento modelli — da verificare | Debole — richiede chiarimento | **P6 MEDIA** |

### 2.2 Analisi Dettagliata per Provider

#### Provider 1: Anthropic (PRIORITA CRITICA)

**Ruolo nel sistema:** Provider principale. Usato per tutti e 7 gli agenti nella configurazione Partner. L'Investigator e vincolato ad Anthropic (web_search tool proprietario).

**File coinvolti:**
- `lib/anthropic.ts` — client SDK, retry logic
- `lib/ai-sdk/generate.ts` — adapter Anthropic
- `lib/models.ts` — 3 modelli registrati (Opus 4.5, Sonnet 4.5, Haiku 4.5)
- `lib/tiers.ts` — presente in tutte le catene di fallback

**Dati inviati:** Testo contrattuale integrale come `messages[].content`, prompt di sistema con istruzioni in italiano. Output JSON strutturato.

**DPA Status:**
- Anthropic offre un DPA su richiesta per clienti API business
- Supporta Standard Contractual Clauses (SCCs) come base per trasferimenti extra-UE
- Politica di zero-retention dichiarata per API commerciali (no training)
- API usage logging per 30 giorni per safety review, poi eliminazione
- Non utilizza i dati API per addestrare modelli (confermato in Usage Policy)

**Rischi specifici:**
- Dati transitano e sono processati in US (AWS). Nessun data center EU attivo per API
- Post-Schrems II: le SCCs sono necessarie ma non sufficienti da sole — serve Transfer Impact Assessment (TIA)
- Anthropic e soggetta a possibili richieste FISA 702 / ordini di sorveglianza US
- Misura supplementare raccomandata: crittografia in transito (gia attiva via HTTPS/TLS 1.3)

**Azioni richieste:**
1. Contattare Anthropic per firmare il DPA formale
2. Ottenere copia delle SCCs firmate
3. Completare Transfer Impact Assessment (TIA) per trasferimento UE->US
4. Documentare misure tecniche supplementari (encryption, access controls)

---

#### Provider 2: Google Gemini (PRIORITA ALTA)

**Ruolo nel sistema:** Secondo provider in catena (tier Associate). Usato come fallback per classifier, analyzer, advisor, corpus-agent.

**File coinvolti:**
- `lib/gemini.ts` — client SDK nativo Google GenAI
- `lib/ai-sdk/generate.ts` — adapter Gemini
- `lib/models.ts` — 3 modelli (Flash, Flash Lite, Pro)

**Dati inviati:** Identici ad Anthropic — testo contrattuale integrale + prompt.

**DPA Status:**
- Google Cloud offre DPA completo e maturo, integrato nei Terms of Service
- SCCs pre-firmate e disponibili
- Possibilita di selezionare region EU per il processing (da verificare per Gemini API specificamente)
- Google ha superato audit SOC 2, ISO 27001, ISO 27018 (protezione PII nel cloud)
- Data Processing Addendum (DPA) conforme all'Art. 28 GDPR

**Rischi specifici:**
- La Gemini API (non Cloud AI Platform) potrebbe processare in US anche con Google Cloud EU
- Verificare se il DPA Google Cloud copre anche la Gemini API consumer/developer
- Google ha un track record solido ma e soggetta anch'essa a FISA 702

**Azioni richieste:**
1. Verificare che il DPA Google Cloud copra esplicitamente la Gemini API
2. Richiedere conferma scritta della location di processing per Gemini API
3. Se possibile, configurare processing EU-only
4. Documentare nel TIA

---

#### Provider 3: Mistral (PRIORITA MEDIA)

**Ruolo nel sistema:** Terzo provider in catena (tier Intern). Usato come fallback per analyzer, advisor.

**File coinvolti:**
- `lib/ai-sdk/openai-compat.ts` — client via SDK OpenAI con `baseURL: "https://api.mistral.ai/v1"`
- `lib/models.ts` — 10 modelli registrati (Large, Medium, Small, Nemo, Ministral, Magistral, Codestral)

**Dati inviati:** Identici — testo contrattuale + prompt, via protocollo OpenAI-compatible.

**DPA Status:**
- **Situazione ottimale:** Mistral e un'azienda francese, soggetta direttamente al GDPR
- DPA conforme GDPR disponibile e nativo
- Processing interamente in EU (data center in Francia e Azure EU)
- Nessun trasferimento extra-UE richiesto
- Zero-retention dichiarata su API
- Non utilizza dati API per training

**Rischi specifici:**
- Rischio minimo — provider EU nativo
- Free tier (2 RPM) potrebbe avere condizioni diverse dal piano a pagamento — verificare ToS
- Mistral usa Azure EU come infrastruttura — verificare che il sub-processing rimanga EU

**Azioni richieste:**
1. Firmare DPA formale con Mistral
2. Verificare che il free tier sia coperto dalle stesse garanzie del piano enterprise
3. Ottenere lista sub-processors

---

#### Provider 4: OpenAI (PRIORITA MEDIA)

**Ruolo nel sistema:** Fallback in catena. Non usato di default, attivabile con API key.

**File coinvolti:**
- `lib/ai-sdk/openai-compat.ts` — client SDK nativo OpenAI
- `lib/models.ts` — 14 modelli registrati

**Dati inviati:** Identici — testo contrattuale + prompt.

**DPA Status:**
- DPA standard disponibile, SCCs incluse
- Zero-retention su API business (opt-out confermato per /v1/chat/completions)
- 30 giorni di retention per abuse monitoring (revocabile su richiesta per clienti enterprise)
- Non utilizza dati API per training (API Terms of Use)
- Audit SOC 2 Type II disponibile

**Rischi specifici:**
- Processing in US (Azure US). Stesse considerazioni Schrems II di Anthropic
- OpenAI e soggetta a FISA 702
- Il piano con $5 di crediti iniziali potrebbe avere condizioni diverse dall'enterprise

**Azioni richieste:**
1. Firmare DPA formale
2. Verificare che il piano developer/API sia coperto dallo stesso DPA enterprise
3. Includere nel Transfer Impact Assessment

---

#### Provider 5: Groq (PRIORITA ALTA — rischio startup)

**Ruolo nel sistema:** Fallback in catena (tier Intern). 7 modelli registrati.

**File coinvolti:**
- `lib/ai-sdk/openai-compat.ts` — `baseURL: "https://api.groq.com/openai/v1"`
- `lib/models.ts` — 7 modelli (Llama 4, Llama 3.3, Qwen 3, GPT-OSS, Kimi K2)

**Dati inviati:** Identici — testo contrattuale + prompt.

**DPA Status:**
- **CRITICO:** Groq e una startup (fondata 2016, Series D). Il framework DPA non e maturo
- DPA disponibile "su richiesta" per clienti enterprise
- Non esiste un DPA self-service o click-through
- Politica di retention non documentata pubblicamente
- Politica di training sui dati non chiaramente documentata
- Nessun audit SOC 2 pubblicato (da verificare)

**Rischi specifici:**
- Startup: rischio di cambiamento policy senza preavviso
- Hardware proprietario (LPU) — i dati sono processati su infrastruttura Groq in US
- Free tier (1000 req/giorno) probabilmente non coperto da DPA enterprise
- Nessuna opzione EU per processing
- Kimi K2 (moonshotai) e un modello di Moonshot AI (Cina) hostato su Groq — stesse considerazioni di DeepSeek per il modello, anche se l'infrastruttura e US

**Azioni richieste:**
1. Contattare Groq per DPA formale — BLOCCANTE per uso in produzione con dati reali
2. Chiarire politica retention e training
3. **Valutare rimozione di `groq-kimi-k2`** dalla registry — modello cinese, stesse preoccupazioni di DeepSeek
4. Se DPA non ottenibile: rimuovere Groq dalla catena di fallback per dati sensibili

---

#### Provider 6: Cerebras (PRIORITA ALTA — rischio startup)

**Ruolo nel sistema:** Fallback ultimo resort (tier Intern). 3 modelli registrati.

**File coinvolti:**
- `lib/ai-sdk/openai-compat.ts` — `baseURL: "https://api.cerebras.ai/v1"`
- `lib/models.ts` — 3 modelli (GPT-OSS 120B, Llama 3.1 8B, Qwen 3 235B)

**Dati inviati:** Identici — testo contrattuale + prompt.

**DPA Status:**
- **CRITICO:** Simile a Groq — startup con DPA non maturo
- DPA "su richiesta" per enterprise
- Politica retention non documentata
- Hardware proprietario (WSE) — processing in US
- Free tier (24M token/giorno) presumibilmente senza DPA

**Rischi specifici:**
- Stesse considerazioni di Groq: startup, mancanza di documentazione GDPR
- Nessuna opzione EU
- Qwen 3 235B e un modello Alibaba (Cina) hostato su Cerebras — considerazioni simili a Kimi K2

**Azioni richieste:**
1. Contattare Cerebras per DPA formale
2. Chiarire politica retention e training
3. **Valutare rimozione di modelli di provenienza cinese** (Qwen 3 235B) dalla registry
4. Se DPA non ottenibile: limitare Cerebras a dati non sensibili o rimuovere

---

#### Provider 7: Voyage AI (PRIORITA MEDIA)

**Ruolo nel sistema:** Unico provider per embeddings semantici. Non riceve il testo contrattuale integrale ma chunk di max 8000 caratteri.

**File coinvolti:**
- `lib/embeddings.ts` — client HTTP diretto (no SDK)

**Dati inviati:** Chunk di testo (frammenti, non il documento intero). Output: vettori numerici 1024d (non reversibili a testo).

**DPA Status:**
- DPA limitato — Voyage AI e una startup con focus su embeddings
- ToS standard disponibili
- DPA formale su richiesta
- Retention e training policy non chiaramente documentate

**Rischi specifici:**
- I chunk inviati potrebbero contenere dati personali (nomi, indirizzi nelle clausole)
- Gli embeddings risultanti sono archiviati in Supabase, non in Voyage AI
- Rischio inferiore rispetto ai provider LLM: i dati sono frammenti, non il documento intero
- Voyage AI e raccomandata da Anthropic — relazione commerciale consolidata

**Azioni richieste:**
1. Richiedere DPA formale a Voyage AI
2. Chiarire se i chunk inviati per embedding sono conservati o eliminati dopo il processing
3. Valutare alternativa EU per embeddings (es. embedding models locali, Mistral Embed)

### 2.3 Priorita di Negoziazione DPA

```
PRIORITA 0 (BLOCCANTE per lancio):
  1. Anthropic     — provider principale, testo integrale, nessuna alternativa per Investigator

PRIORITA 1 (CRITICA, da completare prima del lancio):
  2. Google Gemini — secondo provider, alto volume in fallback
  3. Groq          — DPA immaturo, rischio modelli cinesi
  4. Cerebras      — DPA immaturo, rischio modelli cinesi

PRIORITA 2 (IMPORTANTE, completare entro 3 mesi dal lancio):
  5. Mistral       — basso rischio (EU), ma serve DPA formale
  6. OpenAI        — fallback opzionale, DPA gia maturo
  7. Voyage AI     — rischio inferiore (solo chunk)
```

### 2.4 Raccomandazione: Modelli di Provenienza Cinese

**AZIONE IMMEDIATA RACCOMANDATA:** Rimuovere dalla registry i seguenti modelli:

| Modello | Provider hosting | Origine modello | Rischio |
|---------|-----------------|-----------------|---------|
| `groq-kimi-k2` | Groq (US) | Moonshot AI (Cina) | Il modello potrebbe avere backdoor o bias introdotti durante il training in Cina. Anche se hostato in US, la provenienza del modello solleva dubbi sulla sicurezza dei dati processati. |
| `cerebras-qwen3-235b` | Cerebras (US) | Alibaba/Qwen (Cina) | Stesse considerazioni. |
| `groq-gpt-oss-*` | Groq (US) | OpenAI (US, open source) | OK — provenienza US/open-source verificabile. |

**Motivazione giuridica:** La rimozione di DeepSeek (SEC-001) per server in Cina e coerente con la rimozione di modelli cinesi hostati altrove. Il rischio non e solo nella location del server ma anche nella provenienza del modello e nella possibile compliance con la legge cinese sulla sicurezza nazionale durante la fase di training.

**Nota:** Questa e una raccomandazione prudenziale. Non esiste al momento un obbligo GDPR esplicito di escludere modelli addestrati in Cina se hostati in UE/US. Tuttavia, per un'app che processa dati legali sensibili di PMI italiane, il principio di precauzione e appropriato.

---

## 3. Classificazione EU AI Act

### 3.1 Inquadramento del Regolamento

Il Regolamento UE 2024/1689 (EU AI Act) e entrato in vigore il 1 agosto 2024. Le disposizioni pertinenti entrano in applicazione graduale:

| Scadenza | Disposizioni |
|----------|-------------|
| 2 febbraio 2025 | Divieti (pratiche AI inaccettabili) |
| 2 agosto 2025 | Obblighi per GPAI (modelli general-purpose) |
| **2 agosto 2026** | **Obblighi per sistemi ad alto rischio (Allegato III)** |
| 2 agosto 2027 | Obblighi per sistemi ad alto rischio (Allegato I) |

### 3.2 Classificazione di Controlla.me

#### E un sistema AI ad alto rischio?

**Analisi dell'Allegato III del Regolamento UE 2024/1689:**

| Area | Applicabilita | Note |
|------|--------------|------|
| 1. Biometria | NO | Non usa dati biometrici |
| 2. Infrastrutture critiche | NO | Non gestisce infrastrutture |
| 3. Istruzione e formazione | NO | Non valuta studenti |
| 4. Occupazione e lavoro | **POTENZIALE** | Analizza contratti di lavoro — ma NON prende decisioni su assunzione/licenziamento |
| 5. Accesso a servizi essenziali | **POTENZIALE** | Analizza contratti — ma NON decide sull'erogazione di servizi |
| 6. Applicazione della legge | NO | Non e un sistema di law enforcement |
| 7. Migrazione e asilo | NO | Non pertinente |
| 8. Amministrazione della giustizia | **DA VALUTARE** | Fornisce analisi legale — ma NON e un sistema decisionale giudiziario |

**Classificazione proposta: RISCHIO LIMITATO (non alto rischio)**

**Motivazione:**

1. **Controlla.me non e un sistema decisionale.** Non prende decisioni automatizzate che producono effetti giuridici sulle persone (Art. 22 GDPR). Fornisce un'analisi informativa che l'utente e libero di ignorare.

2. **Non rientra nell'Allegato III, punto 4** (occupazione) perche non decide su assunzione, selezione, promozione o licenziamento. Analizza contratti gia stipulati o in fase di revisione.

3. **Non rientra nell'Allegato III, punto 8** (giustizia) perche non assiste autorita giudiziarie nel decidere casi. E uno strumento informativo per privati.

4. **E analogo a un tool di legal tech** per revisione contrattuale, categoria che il legislatore EU ha esplicitamente escluso dall'alto rischio quando non produce decisioni vincolanti.

#### Obblighi applicabili (sistema a rischio limitato)

Anche come sistema a rischio limitato, Controlla.me ha obblighi specifici:

| Obbligo | Articolo | Stato | Azione |
|---------|---------|-------|--------|
| **Trasparenza AI** | Art. 50(1) | PARZIALE | L'utente deve sapere che interagisce con un sistema AI. La UI mostra i 4 agenti con nomi/avatar. Servono disclaimer piu espliciti. |
| **Contenuto AI-generated** | Art. 50(2) | NON IMPLEMENTATO | L'output dell'analisi deve essere marcato come generato da AI. Serve watermarking o label esplicita. |
| **Informazioni al deployer** | Art. 50(4) | NON IMPLEMENTATO | Documentazione tecnica per clienti B2B su come funziona il sistema, limiti, rischi. |
| **Registro utilizzo** | Art. 12 (volontario) | PARZIALE | Audit log presente (`lib/middleware/audit-log`), cost tracking attivo. Manca log strutturato delle decisioni AI. |

#### Obblighi come deployer di GPAI (modelli general-purpose)

Controlla.me usa modelli GPAI (Claude, Gemini, GPT, ecc.) come componenti. In quanto **deployer** (non provider) di questi modelli:

| Obbligo | Stato | Azione |
|---------|-------|--------|
| Verificare che i provider GPAI rispettino gli obblighi Art. 53 | DA VERIFICARE | Richiedere conferma a ciascun provider che il modello sia conforme (model card, technical documentation) |
| Non usare modelli GPAI con rischio sistemico senza valutazione | OK | Nessun modello usato e classificato come "rischio sistemico" al momento |
| Cooperazione con autorita di mercato | DA IMPLEMENTARE | Predisporre canale per richieste autorita (email dedicata, processo interno) |

### 3.3 Rischio Elevato Condizionale — Scenario Verticale HR

**ATTENZIONE:** Se Controlla.me espande al verticale HR (punto 11 delle feature incomplete in CLAUDE.md), la classificazione potrebbe cambiare:

- Analisi di contratti di lavoro con suggerimenti su clausole di non-compete, periodo di prova, licenziamento -> **potenziale alto rischio** se usato da datori di lavoro per decidere sui lavoratori
- Analisi di policy aziendali HR -> potenziale impatto su condizioni di lavoro

**Raccomandazione:** Prima di lanciare il verticale HR, ripetere questa classificazione con un consulente EU AI Act specializzato.

### 3.4 Timeline di Conformita

```
MARZO 2026 (ORA):
  [x] Classificazione iniziale completata
  [x] DeepSeek rimosso (SEC-001)
  [ ] Disclaimer AI trasparenza nella UI
  [ ] Label "contenuto generato da AI" sull'output

GIUGNO 2026 (3 mesi prima):
  [ ] DPA firmati con tutti i provider attivi
  [ ] Transfer Impact Assessment completato
  [ ] Documentazione tecnica per deployer (Art. 50(4))
  [ ] Consulente EU AI Act ingaggiato per revisione

AGOSTO 2026 (SCADENZA):
  [ ] Piena conformita EU AI Act
  [ ] Registro AI presso autorita nazionale (se richiesto)
  [ ] Processo di monitoraggio post-deployment attivo
```

---

## 4. Checklist GDPR per Lancio B2B

### 4.1 Base Giuridica del Trattamento

| Trattamento | Base giuridica proposta | Note |
|-------------|----------------------|------|
| Analisi contrattuale (utente B2C) | Art. 6(1)(b) — esecuzione del contratto | L'utente chiede analisi, noi la forniamo |
| Analisi contrattuale (utente B2B/PMI) | Art. 6(1)(b) — esecuzione del contratto | Il cliente B2B commissiona l'analisi per i propri contratti |
| Invio dati a provider AI | Art. 6(1)(b) + Art. 28 (sub-processing) | Necessario per erogare il servizio. DPA obbligatorio. |
| Arricchimento knowledge base (vector DB) | Art. 6(1)(f) — legittimo interesse | Miglioramento del servizio. Serve bilanciamento con diritti interessati. |
| Embeddings / vettorizzazione | Art. 6(1)(f) — legittimo interesse | I vettori non sono reversibili. Rischio minimo per interessati. |
| Pagamenti | Art. 6(1)(b) — esecuzione del contratto | Stripe come sub-processor |
| Marketing (se implementato) | Art. 6(1)(a) — consenso | Consenso esplicito richiesto |
| Analytics / audit log | Art. 6(1)(f) — legittimo interesse + Art. 6(1)(c) obbligo legale (EU AI Act) | Log per compliance e sicurezza |

### 4.2 Minimizzazione dei Dati

| Area | Stato | Valutazione |
|------|-------|-------------|
| Testo contrattuale inviato a AI | INTERO DOCUMENTO | **MIGLIORABILE** — valutare se inviare solo le clausole rilevanti dopo classificazione |
| Dati utente raccolti | Email, nome, piano | OK — minimo necessario |
| Retention analisi | Indefinita (Supabase) | **DA MIGLIORARE** — implementare TTL (es. 12 mesi, poi anonimizzazione) |
| Cache filesystem | `.analysis-cache/` con TTL | OK — cache temporanea con cleanup |
| Embeddings in vector DB | Permanenti | OK — non reversibili a dati personali |
| Log server | Non strutturati (console.log) | **DA MIGLIORARE** — no dati personali nei log, retention definita |

**Raccomandazioni minimizzazione:**
1. Implementare anonimizzazione pre-invio: rimuovere nomi, CF, IBAN dal testo prima di inviarlo ai provider AI. Complessita: ALTA (rischio di perdere contesto legale rilevante). Alternativa: pseudonimizzazione reversibile server-side.
2. Definire retention policy per analisi in Supabase: max 24 mesi, poi anonimizzazione automatica.
3. Garantire che i log non contengano testo contrattuale (attualmente `lib/anthropic.ts` logga "primi 8000 char" della risposta — la risposta contiene citazioni dal contratto).

### 4.3 Trasferimenti Extra-UE

| Destinazione | Provider | Meccanismo | Stato |
|-------------|----------|-----------|-------|
| US | Anthropic, OpenAI, Groq, Cerebras, Voyage AI | SCCs (Standard Contractual Clauses) | DA FIRMARE |
| US / EU | Google Gemini | SCCs + possibile DPF (Data Privacy Framework) | DA VERIFICARE |
| EU (Francia) | Mistral | Nessun meccanismo necessario (intra-UE) | OK |

**Transfer Impact Assessment (TIA) necessario per:**
- Tutti i provider US (Anthropic, OpenAI, Groq, Cerebras, Voyage AI)
- Il TIA deve valutare: leggi di sorveglianza US (FISA 702, EO 12333), probabilita di accesso governativo, misure tecniche supplementari

**Misure tecniche supplementari gia implementate:**
- Crittografia in transito (TLS 1.3) per tutte le comunicazioni API
- Nessun dato a riposo presso i provider AI (zero-retention dichiarata, da verificare)
- Pseudonimizzazione parziale (nomi agenti, non nomi reali nel prompt)

**Misure tecniche supplementari raccomandate:**
- Crittografia end-to-end per i documenti caricati (pre-upload)
- Anonimizzazione/pseudonimizzazione del testo contrattuale prima dell'invio ai provider
- Logging con PII redaction
- Data residency EU-only come opzione per clienti B2B premium

### 4.4 Diritti degli Interessati

| Diritto | Articolo GDPR | Stato implementazione | Azione |
|---------|--------------|----------------------|--------|
| Accesso (Art. 15) | Art. 15 | PARZIALE — dashboard mostra storico analisi | Aggiungere export completo dei dati in formato strutturato |
| Rettifica (Art. 16) | Art. 16 | NON IMPLEMENTATO | Implementare modifica profilo + rianalisi documento |
| Cancellazione (Art. 17) | Art. 17 | NON IMPLEMENTATO | **CRITICO** — serve endpoint per cancellazione account + tutti i dati associati |
| Portabilita (Art. 20) | Art. 20 | NON IMPLEMENTATO | Implementare export JSON/PDF di tutte le analisi |
| Opposizione (Art. 21) | Art. 21 | NON IMPLEMENTATO | Implementare opt-out da knowledge base / vector DB |
| Limitazione (Art. 18) | Art. 18 | NON IMPLEMENTATO | Implementare "freeze" account senza cancellazione |
| Decisione automatizzata (Art. 22) | Art. 22 | PARZIALE | L'analisi e informativa (non decisionale). Aggiungere disclaimer esplicito. |

### 4.5 Sub-processor Management

Per il B2B, il cliente (titolare del trattamento) deve poter conoscere e approvare i sub-processor:

| Requisito | Stato | Azione |
|-----------|-------|--------|
| Lista sub-processor pubblica | NON PRESENTE | Creare pagina `/legal/sub-processors` con lista aggiornata |
| Notifica cambio sub-processor | NON IMPLEMENTATO | Processo email per notifica ai clienti B2B |
| Diritto di opposizione al sub-processor | NON IMPLEMENTATO | Clausola nel DPA: 30 giorni per opposizione |
| Audit rights | NON IMPLEMENTATO | Clausola nel DPA: diritto di audit annuale |

### 4.6 Responsabile Protezione Dati (DPO)

| Requisito | Applicabilita | Stato |
|-----------|--------------|-------|
| DPO obbligatorio | **PROBABILE** — trattamento su larga scala di dati di natura legale/contrattuale | NON NOMINATO |
| Registro dei trattamenti (Art. 30) | Obbligatorio per organizzazioni > 250 dipendenti O trattamento non occasionale di dati particolari | NON PRESENTE |

**Raccomandazione:** Anche se Controlla.me e una startup, il trattamento di dati contrattuali su larga scala (analisi AI di documenti legali) suggerisce la necessita di un DPO o quantomeno di un referente privacy. Per il lancio B2B, i clienti PMI si aspettano un punto di contatto privacy.

### 4.7 DPIA (Data Protection Impact Assessment)

**E necessaria una DPIA?** Art. 35 GDPR — SI, per almeno due criteri:

1. **Trattamento su larga scala** di dati che includono informazioni contrattuali e potenzialmente dati sensibili (es. contratti di lavoro con dati sanitari, retribuzione)
2. **Nuove tecnologie** (AI/LLM) applicate al trattamento
3. **Valutazione sistematica** di aspetti personali (analisi di clausole che riguardano diritti delle persone)

**Stato DPIA:** NON EFFETTUATA

**Contenuto richiesto della DPIA:**
- Descrizione sistematica dei trattamenti
- Valutazione necessita e proporzionalita
- Valutazione rischi per i diritti degli interessati
- Misure per affrontare i rischi
- Consultazione del DPO (se nominato)

---

## 5. Piano d'Azione Prioritizzato

### 5.1 MUST-HAVE per il Lancio B2B

Senza questi elementi, il lancio B2B con PMI italiane espone a rischio sanzionatorio e reputazionale significativo.

| # | Azione | Area | Effort | Scadenza |
|---|--------|------|--------|----------|
| **A1** | Firmare DPA con Anthropic | DPA | 2-4 settimane (negoziazione) | Prima del lancio |
| **A2** | Firmare DPA con Google (Gemini) | DPA | 1-2 settimane (DPA standard) | Prima del lancio |
| **A3** | Completare Transfer Impact Assessment (TIA) per US | GDPR | 2-3 settimane | Prima del lancio |
| **A4** | Implementare diritto alla cancellazione (Art. 17) | GDPR | 3-5 giorni dev | Prima del lancio |
| **A5** | Implementare disclaimer AI trasparenza nella UI | EU AI Act | 1 giorno dev | Prima del lancio |
| **A6** | Creare informativa privacy aggiornata con lista sub-processor | GDPR | 3-5 giorni (legale) | Prima del lancio |
| **A7** | Implementare label "analisi generata da AI" sull'output | EU AI Act | 1 giorno dev | Prima del lancio |
| **A8** | Effettuare DPIA | GDPR | 2-3 settimane | Prima del lancio |
| **A9** | Creare template DPA per clienti B2B (noi come responsabile) | DPA | 1-2 settimane (legale) | Prima del lancio |
| **A10** | Rimuovere modelli cinesi dalla registry (Kimi K2, Qwen 3 235B) | Security | 1 ora dev | Immediata |
| **A11** | Ridurre logging PII in `lib/anthropic.ts` e `lib/gemini.ts` | GDPR | 2-4 ore dev | Prima del lancio |

### 5.2 SHOULD-HAVE (Entro 3 Mesi dal Lancio)

| # | Azione | Area | Effort | Scadenza |
|---|--------|------|--------|----------|
| **B1** | Firmare DPA con Mistral, OpenAI | DPA | 2-3 settimane | +3 mesi |
| **B2** | Firmare DPA con Groq e Cerebras (o rimuoverli) | DPA | 2-4 settimane | +3 mesi |
| **B3** | Firmare DPA con Voyage AI | DPA | 2-3 settimane | +3 mesi |
| **B4** | Implementare export dati (diritto di portabilita, Art. 20) | GDPR | 3-5 giorni dev | +3 mesi |
| **B5** | Implementare retention policy con TTL su Supabase | GDPR | 2-3 giorni dev | +3 mesi |
| **B6** | Implementare pagina `/legal/sub-processors` | GDPR | 1 giorno dev | +3 mesi |
| **B7** | Nominare DPO o referente privacy | GDPR | Decisione organizzativa | +3 mesi |
| **B8** | Creare Registro dei Trattamenti (Art. 30) | GDPR | 3-5 giorni (legale) | +3 mesi |
| **B9** | Ingaggiare consulente EU AI Act per revisione | EU AI Act | 2-4 settimane | +3 mesi (entro giugno 2026) |
| **B10** | Documentazione tecnica per deployer B2B (Art. 50(4)) | EU AI Act | 5-10 giorni | +3 mesi |

### 5.3 NICE-TO-HAVE (Entro 12 Mesi)

| # | Azione | Area | Effort | Scadenza |
|---|--------|------|--------|----------|
| **C1** | Pseudonimizzazione pre-invio a provider AI | GDPR | 2-3 settimane dev | +12 mesi |
| **C2** | Opzione "EU-only processing" per clienti premium | GDPR | 2-4 settimane dev | +12 mesi |
| **C3** | SOC 2 Type II audit | Trust | 3-6 mesi | +12 mesi |
| **C4** | Alternativa EU per embeddings (sostituire Voyage AI) | GDPR | 1-2 settimane dev | +12 mesi |
| **C5** | Processo di notifica cambio sub-processor | GDPR | 1 settimana dev | +12 mesi |
| **C6** | ISO 27001 certificazione | Trust | 6-12 mesi | +12 mesi |

### 5.4 Stima Costo Totale

| Categoria | Stima | Note |
|-----------|-------|------|
| Negoziazione DPA (7 provider) | 3.000-8.000 EUR | Assistenza legale per revisione e negoziazione |
| Consulente EU AI Act | 5.000-15.000 EUR | Revisione classificazione + conformita |
| DPIA | 3.000-8.000 EUR | Redazione con supporto legale |
| DPO esterno (annuale) | 5.000-15.000 EUR/anno | Servizio DPO as a Service |
| Sviluppo (diritti GDPR, disclaimer, logging) | 5-10 giorni dev interni | Nessun costo aggiuntivo se sviluppo interno |
| **TOTALE LANCIO (MUST-HAVE)** | **~15.000-35.000 EUR** | Prima tranche per lancio B2B |
| **TOTALE ANNUALE** | **~25.000-50.000 EUR** | Incluso mantenimento compliance |

---

## 6. Allegati

### 6.1 Mappa Flusso Dati — Provider AI

```
                    Controlla.me (Server Next.js)
                              |
           +------------------+------------------+
           |                  |                  |
     [TIER PARTNER]     [TIER ASSOCIATE]   [TIER INTERN]
           |                  |                  |
     Anthropic (US)    Google Gemini       Mistral (EU)
     - Sonnet 4.5      - Flash             - Large 3
     - Haiku 4.5       - Pro               - Small 3
     - Opus 4.5        - Flash Lite        OpenAI (US)
           |                                 - GPT-5.x
           |                                 - GPT-4.x
     web_search                            Groq (US)
     (solo Anthropic)                      - Llama 4
                                           - Llama 3.x
                                           Cerebras (US)
                                           - GPT-OSS 120B
                                           - Llama 3.1 8B

     Voyage AI (US)         Supabase (EU)        Stripe (US)
     - Embeddings           - PostgreSQL          - Pagamenti
     - voyage-law-2         - pgvector            - Token only
                            - RLS attivo
```

### 6.2 Checklist Pre-Lancio Sintetica

```
DPA:
  [ ] Anthropic DPA firmato
  [ ] Google Gemini DPA verificato/firmato
  [ ] TIA per trasferimenti US completato

GDPR:
  [ ] Informativa privacy aggiornata
  [ ] Diritto alla cancellazione implementato
  [ ] DPIA completata
  [ ] Template DPA per clienti B2B pronto
  [ ] PII logging ridotto

EU AI Act:
  [ ] Disclaimer "sistema AI" visibile
  [ ] Label "generato da AI" su output
  [ ] Classificazione confermata da consulente

Security:
  [ ] Modelli cinesi rimossi (Kimi K2, Qwen 3 235B)
  [ ] DPA startup (Groq, Cerebras) firmati o provider rimossi
```

### 6.3 Riferimenti Normativi

- **GDPR** — Regolamento UE 2016/679
- **EU AI Act** — Regolamento UE 2024/1689
- **Schrems II** — Sentenza CGUE C-311/18 (16 luglio 2020)
- **SCCs** — Decisione di esecuzione UE 2021/914
- **EU-US DPF** — Decisione di adeguatezza UE 2023/1795
- **EDPB Guidelines 06/2020** — Misure supplementari per trasferimenti
- **Provvedimento Garante Privacy italiano** — Linee guida AI e protezione dati (2024)

### 6.4 Change Log

| Data | Autore | Modifica |
|------|--------|----------|
| 2026-03-01 | security-auditor | Creazione documento — assessment iniziale completo |

---

> **DISCLAIMER:** Questo documento e un assessment tecnico-legale preliminare redatto dal dipartimento Security di Controlla.me. NON sostituisce una consulenza legale professionale. Prima del lancio B2B, il documento deve essere revisionato da un avvocato specializzato in diritto della privacy e da un consulente EU AI Act certificato.
