# Checklist Operativa: Firma DPA con Provider AI

**Autore:** security-auditor (Dipartimento Security)
**Data:** 2026-03-10
**Task:** 5c28dd4c
**Priorita:** HIGH (prerequisito per lancio commerciale PMI)

---

## Premessa

Il GDPR (Art. 28) richiede un Data Processing Agreement (DPA) con ogni "responsabile del trattamento" che processa dati personali per conto del titolare. Per Controlla.me, i provider AI sono responsabili del trattamento quando processano i documenti degli utenti.

**Provider prioritari (processano direttamente testo dei documenti utente):**
1. Anthropic (Claude) — analisi primaria
2. Google (Gemini) — corpus agent + fallback
3. Mistral — fallback tier intern

**Provider secondari (da valutare):**
4. Groq — fallback (processa prompt con dati utente)
5. Cerebras — fallback (processa prompt con dati utente)
6. DeepSeek — **ATTENZIONE: server in Cina** (gia documentato come rischio)
7. Voyage AI — embeddings (processa testo per generare vettori)
8. Supabase — storage dati
9. Vercel — hosting
10. Stripe — pagamenti

---

## 1. Anthropic DPA

### 1.1 Informazioni chiave

| Campo | Valore |
|-------|--------|
| **URL DPA** | https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa |
| **Tipo** | Self-serve (incorporato nei Commercial Terms of Service) |
| **SCCs incluse** | Si — Standard Contractual Clauses per trasferimenti extra-UE |
| **Sede processamento** | USA |
| **Zero data retention** | Si, per API usage (i prompt non vengono usati per training) |

### 1.2 Step-by-step

- [ ] **Step 1**: Verificare di avere un account API Anthropic attivo (console.anthropic.com)
- [ ] **Step 2**: Accedere a https://privacy.claude.com
- [ ] **Step 3**: Navigare alla sezione "Commercial Customers" > "Data Processing Addendum"
- [ ] **Step 4**: Leggere il DPA completo — il DPA con SCCs e automaticamente incorporato nei Commercial Terms of Service
- [ ] **Step 5**: Accettando i Commercial Terms of Service dell'API, si accetta anche il DPA
- [ ] **Step 6**: Verificare che il DPA copra:
  - Finalita del trattamento (fornire il servizio API)
  - Categorie di dati personali processati
  - Misure di sicurezza tecniche e organizzative
  - Obblighi di notifica data breach
  - Diritto di audit
  - Sub-processori elencati
  - SCCs per trasferimenti USA
- [ ] **Step 7**: Scaricare e archiviare una copia del DPA con data di accettazione
- [ ] **Step 8**: Annotare la data di accettazione nel registro trattamenti

### 1.3 Punti di attenzione

- Anthropic non usa i dati API per training modelli (confermato nella policy)
- Verificare la lista dei sub-processori di Anthropic (cloud provider: AWS/GCP)
- Il DPA copre sia Claude API che Claude.ai — assicurarsi che le condizioni API siano quelle applicate
- Se si usa Claude via terze parti (es. Amazon Bedrock), serve un DPA separato con AWS

---

## 2. Mistral DPA

### 2.1 Informazioni chiave

| Campo | Valore |
|-------|--------|
| **URL DPA** | https://legal.mistral.ai/terms/data-processing-addendum |
| **Pagina legale** | https://legal.mistral.ai/terms |
| **Help Center** | https://help.mistral.ai/en/articles/347641-where-can-i-consult-your-dpa-data-processing-agreement |
| **Tipo** | Self-serve (disponibile online) |
| **Sede** | Francia (EU) — nessun trasferimento extra-UE di default |
| **Storage dati** | EU (confermato: https://help.mistral.ai/en/articles/347629) |

### 2.2 Step-by-step

- [ ] **Step 1**: Verificare di avere un account Mistral API attivo (console.mistral.ai)
- [ ] **Step 2**: Accedere a https://legal.mistral.ai/terms/data-processing-addendum
- [ ] **Step 3**: Leggere il DPA completo — e un documento pubblico accessibile senza login
- [ ] **Step 4**: Verificare che il DPA copra:
  - Ruoli (Mistral = processore, cliente = titolare)
  - Finalita del trattamento
  - Categorie di dati e interessati
  - Misure di sicurezza (Art. 32 GDPR)
  - Procedura di notifica data breach
  - Clausole su sub-processori
  - Diritto di audit del titolare
- [ ] **Step 5**: Se il DPA richiede controfirma, verificare il processo:
  - Alcuni provider hanno un form di accettazione online
  - Altri richiedono invio firmato via email
  - Controllare la sezione "How to sign" nel help center
- [ ] **Step 6**: Scaricare e archiviare il DPA firmato/accettato
- [ ] **Step 7**: Annotare la data nel registro trattamenti

### 2.3 Punti di attenzione

- Mistral ha sede in Francia (EU) — **niente SCCs necessarie** per trasferimenti dati
- Verificare se il free tier (2 RPM) ha condizioni diverse dal tier a pagamento
- Mistral e conforme GDPR e certificata SOC 2 — verificare certificazioni aggiornate
- I dati sono conservati in EU — punto di forza per compliance

---

## 3. Google Cloud DPA (Gemini API)

### 3.1 Informazioni chiave

| Campo | Valore |
|-------|--------|
| **URL DPA (Cloud)** | https://cloud.google.com/terms/data-processing-addendum |
| **URL DPA (Admin)** | https://admin.google.com/terms/apps/8/1/en/dpa_terms.html |
| **Gemini API Terms** | https://ai.google.dev/gemini-api/terms |
| **Data Governance** | https://docs.cloud.google.com/gemini/docs/discover/data-governance |
| **Tipo** | Dipende dal servizio utilizzato |
| **Zero training** | Si — Google non usa prompt Gemini API per training modelli |

### 3.2 Decisione richiesta: quale Gemini API?

Controlla.me usa `@google/genai` (SDK nativo Gemini). Ci sono due percorsi possibili:

| Opzione | Servizio | DPA | Costo | Vantaggi |
|---------|---------|-----|-------|----------|
| **A** | Google AI Studio (ai.google.dev) | Gemini API Additional Terms of Service | Free tier generoso | Piu semplice, gia in uso |
| **B** | Vertex AI (cloud.google.com) | Cloud Data Processing Addendum (CDPA) | Pay-as-you-go | DPA enterprise completo, compliance EU garantita |

**Raccomandazione:** Verificare se il DPA di Google AI Studio (opzione A) e sufficiente per GDPR. Se non lo e, migrare a Vertex AI (opzione B) che ha un CDPA enterprise completo.

### 3.3 Step-by-step (Opzione A — Google AI Studio)

- [ ] **Step 1**: Verificare i Gemini API Additional Terms of Service (https://ai.google.dev/gemini-api/terms)
- [ ] **Step 2**: Verificare se includono clausole DPA / data processing
- [ ] **Step 3**: Se non includono DPA adeguato, valutare migrazione a Vertex AI (Opzione B)
- [ ] **Step 4**: Contattare Google Developer Support per chiarire la copertura DPA per l'uso API

### 3.4 Step-by-step (Opzione B — Vertex AI / Google Cloud)

- [ ] **Step 1**: Creare un progetto Google Cloud (se non esistente)
- [ ] **Step 2**: Accedere a https://cloud.google.com/terms/data-processing-addendum
- [ ] **Step 3**: Il CDPA si attiva accettando i Google Cloud Terms of Service
- [ ] **Step 4**: Verificare nel CDPA:
  - Google agisce come processore (confermato per Paid Services)
  - Dati processati in regione EU (selezionare `europe-west1` o simile)
  - SCCs incluse per trasferimenti extra-UE
  - Zero data retention per Gemini API pagata
  - Sub-processori elencati
- [ ] **Step 5**: Configurare la regione di elaborazione dati su EU
- [ ] **Step 6**: Scaricare e archiviare il CDPA
- [ ] **Step 7**: Aggiornare `lib/gemini.ts` per usare l'endpoint Vertex AI se necessario

### 3.5 Punti di attenzione

- Google AI Studio (free tier) potrebbe **non** avere un DPA adeguato per uso commerciale con dati personali
- Vertex AI ha un CDPA completo ma richiede billing account
- Per i Paid Services, Google NON usa prompt/risposte per training modelli
- Verificare la lista sub-processori Google Cloud aggiornata
- La migrazione da `@google/genai` a Vertex AI richiede modifiche minime al codice

---

## 4. Checklist pre-signing (valida per tutti i DPA)

### 4.1 Verifica contenuto obbligatorio (Art. 28 GDPR)

Per ogni DPA, verificare che contenga **tutti** i seguenti elementi:

| # | Elemento | Art. GDPR | Verifica |
|---|---------|----------|---------|
| 1 | Oggetto e durata del trattamento | 28(3) | [ ] |
| 2 | Natura e finalita del trattamento | 28(3) | [ ] |
| 3 | Tipo di dati personali trattati | 28(3) | [ ] |
| 4 | Categorie di interessati | 28(3) | [ ] |
| 5 | Obblighi e diritti del titolare | 28(3) | [ ] |
| 6 | Trattamento solo su istruzioni documentate del titolare | 28(3)(a) | [ ] |
| 7 | Riservatezza del personale autorizzato | 28(3)(b) | [ ] |
| 8 | Misure di sicurezza tecniche e organizzative (Art. 32) | 28(3)(c) | [ ] |
| 9 | Condizioni per ricorrere a sub-processori | 28(3)(d) | [ ] |
| 10 | Assistenza al titolare per diritti degli interessati | 28(3)(e) | [ ] |
| 11 | Assistenza per obblighi Art. 32-36 (sicurezza, DPIA, consultazione) | 28(3)(f) | [ ] |
| 12 | Cancellazione/restituzione dati alla fine del servizio | 28(3)(g) | [ ] |
| 13 | Informazioni per dimostrare conformita + diritto di audit | 28(3)(h) | [ ] |

### 4.2 Verifica SCCs (trasferimenti extra-UE)

Se il provider ha sede fuori dall'UE:

- [ ] SCCs (Standard Contractual Clauses) incluse nel DPA
- [ ] SCCs conformi alla Decisione di esecuzione (UE) 2021/914
- [ ] Transfer Impact Assessment (TIA) disponibile o incluso
- [ ] Misure supplementari identificate se necessario (es. cifratura end-to-end)

### 4.3 Verifica data retention

- [ ] Il provider non conserva i dati oltre il necessario per fornire il servizio
- [ ] I prompt/risposte NON vengono usati per training dei modelli
- [ ] Periodo di retention dei log specificato (e ragionevole)
- [ ] Procedura di cancellazione dati alla fine del rapporto

### 4.4 Verifica sub-processori

- [ ] Lista dei sub-processori disponibile e aggiornata
- [ ] Meccanismo di notifica per nuovi sub-processori (email, pagina web)
- [ ] Diritto di opporsi a nuovi sub-processori
- [ ] Sub-processori vincolati da obblighi equivalenti

---

## 5. Post-signing: archiviazione e gestione

### 5.1 Dove archiviare

```
company/security/dpa/
├── README.md                           # Registro DPA con date e scadenze
├── anthropic-dpa-2026-03-XX.pdf        # Copia DPA Anthropic
├── mistral-dpa-2026-03-XX.pdf          # Copia DPA Mistral
├── google-cdpa-2026-03-XX.pdf          # Copia CDPA Google
├── supabase-dpa-2026-XX-XX.pdf         # Copia DPA Supabase
├── vercel-dpa-2026-XX-XX.pdf           # Copia DPA Vercel
├── stripe-dpa-2026-XX-XX.pdf           # Copia DPA Stripe
└── voyage-ai-dpa-2026-XX-XX.pdf        # Copia DPA Voyage AI
```

### 5.2 Registro DPA (template per README.md)

```markdown
# Registro Data Processing Agreements

| Provider | Tipo servizio | Data firma | Scadenza | SCCs | Storage dati | Link DPA |
|----------|-------------|-----------|---------|------|-------------|---------|
| Anthropic | API AI (Claude) | YYYY-MM-DD | Durata contratto | Si | USA | [link] |
| Mistral | API AI (modelli) | YYYY-MM-DD | Durata contratto | No (EU) | EU (Francia) | [link] |
| Google | API AI (Gemini) | YYYY-MM-DD | Durata contratto | Si | Configurabile | [link] |
| Supabase | Database + Auth | YYYY-MM-DD | Durata contratto | Verificare | EU | [link] |
| Vercel | Hosting | YYYY-MM-DD | Durata contratto | Si | Configurabile | [link] |
| Stripe | Pagamenti | YYYY-MM-DD | Durata contratto | Si | USA/EU | [link] |
| Voyage AI | Embeddings | YYYY-MM-DD | Durata contratto | Verificare | Verificare | [link] |

Ultimo aggiornamento: YYYY-MM-DD
```

### 5.3 Reminder e scadenze

- [ ] **Calendario reminder annuale**: verificare aggiornamenti DPA di ogni provider (i DPA possono essere aggiornati unilateralmente)
- [ ] **Monitorare sub-processori**: iscriversi alle notifiche di cambio sub-processori di ogni provider
- [ ] **Aggiornare registro**: ad ogni nuova integrazione o cambio provider
- [ ] **Backup offline**: conservare copie PDF dei DPA anche fuori dal repository (es. Google Drive aziendale, cassaforte digitale)

### 5.4 Notifiche sub-processori (dove iscriversi)

| Provider | Pagina sub-processori | Come iscriversi |
|----------|----------------------|----------------|
| Anthropic | https://privacy.claude.com (sezione sub-processors) | Verificare se offre notifiche email |
| Mistral | https://help.mistral.ai/en/collections/789670 | Verificare nel DPA |
| Google Cloud | https://cloud.google.com/terms/subprocessors | Email notification disponibile |
| Supabase | Privacy policy Supabase | Verificare |
| Vercel | Privacy policy Vercel | Verificare |

---

## 6. Stato attuale e prossimi passi

### 6.1 Stato per provider

| Provider | DPA | Stato | Azione richiesta | Deadline |
|----------|-----|-------|-----------------|----------|
| Anthropic | Self-serve | Da verificare/firmare | Verificare accettazione Commercial Terms, archiviare copia | Marzo 2026 |
| Mistral | Self-serve | Da verificare/firmare | Leggere DPA, verificare copertura, archiviare | Marzo 2026 |
| Google | Da decidere | Decisione necessaria | Decidere AI Studio vs Vertex AI, poi firmare | Marzo 2026 |
| Groq | Da verificare | Non avviato | Cercare DPA sul sito Groq | Aprile 2026 |
| Cerebras | Da verificare | Non avviato | Cercare DPA sul sito Cerebras | Aprile 2026 |
| DeepSeek | **RISCHIO** | Non avviato | Server in Cina — valutare se continuare a usarlo | Aprile 2026 |
| Voyage AI | Da verificare | Non avviato | Cercare DPA sul sito Voyage AI | Aprile 2026 |
| Supabase | Da verificare | Non avviato | Verificare DPA nel contratto Supabase | Aprile 2026 |
| Vercel | Da verificare | Non avviato | Verificare DPA nel contratto Vercel | Aprile 2026 |
| Stripe | Da verificare | Non avviato | Verificare DPA nel contratto Stripe | Aprile 2026 |

### 6.2 Azioni immediate (marzo 2026)

1. [ ] Creare directory `company/security/dpa/` con README.md registro
2. [ ] Firmare DPA Anthropic (self-serve, priorita massima — provider primario)
3. [ ] Firmare DPA Mistral (self-serve, stesso giorno)
4. [ ] Prendere decisione Google AI Studio vs Vertex AI (escalation a Architecture + Boss)
5. [ ] Firmare DPA Google (dopo decisione)

### 6.3 Azioni successive (aprile 2026)

6. [ ] Verificare e firmare DPA per provider secondari (Groq, Cerebras, Voyage AI)
7. [ ] Valutare rimozione DeepSeek dalla catena di fallback (server in Cina)
8. [ ] Verificare DPA Supabase, Vercel, Stripe
9. [ ] Completare registro DPA
10. [ ] Aggiornare sezione 18 di CLAUDE.md con stato DPA

---

## Riferimenti

- GDPR Art. 28 (Responsabile del trattamento): https://gdpr-info.eu/art-28-gdpr/
- GDPR Art. 44-49 (Trasferimenti extra-UE): https://gdpr-info.eu/art-44-gdpr/
- SCCs Decisione (UE) 2021/914: https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj
- Anthropic Privacy Center: https://privacy.claude.com
- Anthropic DPA info: https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa
- Mistral DPA: https://legal.mistral.ai/terms/data-processing-addendum
- Mistral Legal: https://legal.mistral.ai/terms
- Mistral Help Center DPA: https://help.mistral.ai/en/articles/347641-where-can-i-consult-your-dpa-data-processing-agreement
- Google Cloud CDPA: https://cloud.google.com/terms/data-processing-addendum
- Google Gemini Data Governance: https://docs.google.com/gemini/docs/discover/data-governance
- Gemini API Terms: https://ai.google.dev/gemini-api/terms
