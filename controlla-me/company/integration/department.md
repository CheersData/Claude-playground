# Ufficio Integrazione

## Tipo

**Ufficio** (Revenue) — non un dipartimento staff.

## Missione

Integrazione dati business per PMI italiane — connettori OAuth2 verso piattaforme esterne (fatturazione, CRM, document management), pipeline CONNECT-AUTH-MAP-SYNC, analisi legale automatica sui documenti importati. Ogni contratto, fattura o documento che transita nei sistemi di una PMI viene analizzato automaticamente dai 4 agenti legali di controlla.me.

## Vincoli Architetturali

- **Riuso framework data-connector**: tutti i connettori estendono `AuthenticatedBaseConnector` (che estende `BaseConnector` da `lib/staff/data-connector/connectors/base.ts`)
- **Zero breaking changes**: i connettori legislativi esistenti (Normattiva, EUR-Lex, ecc.) non devono essere toccati. I connettori business usano la stessa pipeline CONNECT-MODEL-LOAD con DataType `"business-documents"`
- **Credential vault**: credenziali OAuth2 per-utente criptate con AES-256-GCM tramite `lib/credential-vault.ts`. Mai in chiaro nel DB
- **Tenant isolation**: ogni PMI ha le sue credenziali, i suoi dati. RLS Supabase esteso alle tabelle `integration_*`
- **CME unico interlocutore**: nessun dipartimento parla direttamente con l'Ufficio Integrazione, tutto passa da CME
- **Pipeline agenti riusata al 100%**: l'analisi legale usa la stessa pipeline 4 agenti dell'Ufficio Legale (Classifier-Analyzer-Investigator-Advisor), non una copia

## Stack

- **Linguaggio**: TypeScript / Next.js (App Router)
- **Framework connettori**: `lib/staff/data-connector/` (esteso con `AuthenticatedBaseConnector`)
- **Auth**: OAuth2 per-utente con refresh token management
- **Encryption**: AES-256-GCM (credential vault)
- **Database**: Supabase condiviso (schema `integration_*`)
- **AI Pipeline**: `lib/agents/orchestrator.ts` + tier system (`lib/tiers.ts`)
- **Mapping**: Ibrido regole + Levenshtein + LLM (`lib/staff/data-connector/mapping/`)

## Pipeline

```
[1] CONNECT — OAuth2 flow per-utente
    -> L'utente autorizza l'accesso al suo HubSpot/Fatture in Cloud/Google Drive
    -> Token OAuth criptato e salvato nel credential vault
    |
[2] AUTH — Validazione e refresh token
    -> Verifica token valido prima di ogni sync
    -> Refresh automatico se scaduto
    -> Revoca e notifica se refresh fallisce
    |
[3] MAP — Normalizzazione campi (AI ibrido)
    -> Livello 1: regole deterministiche (campo noto → mapping diretto)
    -> Livello 2: fuzzy matching Levenshtein (campo simile → mapping probabile)
    -> Livello 3: LLM classification (campo sconosciuto → mapping AI)
    -> Livello 4: learning da feedback utente (correzioni → aggiornamento regole)
    -> Output: documento normalizzato pronto per analisi legale
    |
[4] SYNC — Estrazione e analisi
    -> Watch: webhook o polling rileva nuovo documento
    -> Extract: connettore estrae testo (stessa logica di upload manuale)
    -> Analyze: pipeline 4 agenti AI (identica a analisi manuale)
    -> Notify: risultato scritto nel sistema origine + notifica utente
    -> Index: documento e risultato indicizzati nel vector DB
```

## Connettori

### MVP (Fase 1) — Top 3 RICE Score

| Connettore | RICE Score | Categoria | API | Stato |
|-----------|------------|-----------|-----|-------|
| **Fatture in Cloud** | 216.0 | Fatturazione IT | REST | Pianificato |
| **Google Drive** | 168.0 | Document Mgmt | REST | Pianificato |
| **HubSpot** | 126.0 | CRM | REST | Pianificato |

### Fase 2 — Espansione

| Connettore | RICE Score | Categoria |
|-----------|------------|-----------|
| Shopify | 94.5 | E-commerce |
| Zucchetti HR | 64.0 | HR/Payroll |
| Slack | 60.0 | Communication |

### Fase 3 — Scale

| Connettore | RICE Score | Categoria |
|-----------|------------|-----------|
| Salesforce | 45.7 | CRM |
| WooCommerce | 42.0 | E-commerce |
| Microsoft Teams | 42.0 | Communication |
| SharePoint | 40.8 | Document Mgmt |

## Agenti

| Agente | File | Ruolo |
|--------|------|-------|
| integration-lead | `agents/integration-lead.md` | Coordinatore ufficio, gestione pipeline, reporta a CME |
| connector-builder | `agents/connector-builder.md` | Costruisce e mantiene connettori OAuth2 per piattaforme esterne |
| mapping-engine | `agents/mapping-engine.md` | AI mapping ibrido (regole + Levenshtein + LLM) per normalizzazione campi |

## Leader

**integration-lead** — Coordina i 3 agenti, gestisce la pipeline CONNECT-AUTH-MAP-SYNC, reporta a CME.

## KPI

| Metrica | Target |
|---------|--------|
| Connettori attivi in produzione | 3 (MVP) → 10+ (6 mesi) |
| Sync success rate | > 99% |
| Mapping accuracy (campi normalizzati correttamente) | > 95% |
| User adoption (PMI con almeno 1 connettore) | 20 (beta) → 100 (6 mesi) |
| Tempo medio setup connettore (utente) | < 5 minuti |
| Documenti auto-analizzati/mese | 200 (beta) → 2000 (6 mesi) |
| Costo AI per doc auto-analizzato | < EUR 0.05 |

## Runbooks

- `runbooks/add-connector.md` — Procedura per aggiungere un nuovo connettore
- `runbooks/credential-management.md` — OAuth2 flow, token storage, refresh, rotazione, revoca
- `runbooks/mapping-troubleshoot.md` — Debug problemi di mapping su 4 livelli

## Fasi di Deployment

| Fase | Contenuto | Stato |
|------|----------|-------|
| 0. Infrastruttura | Credential vault, AuthenticatedBaseConnector, schema DB, OAuth2 flow generico | **IN CORSO** |
| 1A. Fatture in Cloud | Connettore, OAuth, watch fatture/contratti, analisi automatica | Pianificato |
| 1B. Google Drive | Connettore, OAuth, watch cartella, estrazione PDF/DOCX | Pianificato |
| 1C. HubSpot | Connettore, OAuth, watch deal attachments, push risultati | Pianificato |
| Beta chiusa | 10-20 PMI invitate, feedback, iterazione UX | Pianificato |
| 2. Espansione | Shopify + Zucchetti HR + Slack | Pianificato |
| 3. Scale | Salesforce, WooCommerce, Teams, SharePoint | Pianificato |

## Env vars richieste

```env
# Credential Vault (obbligatorio)
VAULT_MASTER_KEY=...            # AES-256-GCM master key per encryption credenziali utente

# Fatture in Cloud (MVP)
FATTURE_CLIENT_ID=...           # OAuth2 client ID (da TeamSystem developer portal)
FATTURE_CLIENT_SECRET=...       # OAuth2 client secret

# Google Drive (MVP)
GOOGLE_CLIENT_ID=...            # OAuth2 client ID (da Google Cloud Console)
GOOGLE_CLIENT_SECRET=...        # OAuth2 client secret

# HubSpot (MVP)
HUBSPOT_CLIENT_ID=...           # OAuth2 client ID (da HubSpot developer portal)
HUBSPOT_CLIENT_SECRET=...       # OAuth2 client secret
```

---

## Visione (6 mesi)

10+ connettori attivi, self-service setup wizard per PMI (connetti in 3 click), auto-mapping 95%+ accuracy, 100+ PMI con almeno 1 connettore, 2000+ documenti auto-analizzati al mese. Revenue da piani Business (EUR 29.99/mese) che contribuisce alla sostenibilita finanziaria di controlla.me.

## Priorita operative (ordinate)

1. **[P0] Infrastruttura** — Credential vault AES-256-GCM, AuthenticatedBaseConnector, schema DB `integration_*`, OAuth2 flow generico riusabile
2. **[P1] MVP 3 connettori** — Fatture in Cloud, Google Drive, HubSpot (in ordine RICE). Ogni connettore: connect, auth, map, sync funzionanti end-to-end
3. **[P2] UI dashboard integrazione** — Setup wizard OAuth per utente, pannello monitoring documenti sincronizzati, stato connettori, storico analisi automatiche

## Autonomia

- **L1 (auto)**: nuovo connettore standard (API REST, OAuth2 standard), fix mapping, monitoring sync, health check
- **L2 (escalation CME)**: connettore complesso (API non-standard, auth custom), cambio logica mapping, modifica schema DB
- **L3 (escalation boss)**: nuovo tipo di provider (non-OAuth), partnership con vendor (es. TeamSystem), cambio pricing, go-live beta
