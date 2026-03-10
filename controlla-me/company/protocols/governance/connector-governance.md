# Connector Governance

Regole, ciclo di vita e policy per tutti i connettori dati di Controlla.me.

Riferimento decision tree: `company/protocols/decision-trees/integration-request.yaml`

---

## 1. Ciclo di vita connettore

Ogni connettore segue un ciclo di vita in 7 fasi. La progressione tra fasi richiede il completamento di tutti gli artifact della fase corrente.

```
PROPOSAL → REVIEW → DEVELOPMENT → TESTING → BETA → GA → DEPRECATION
```

### 1.1 Fasi

| Fase | Lifecycle | Chi | Artifact richiesti | Durata tipica |
|------|-----------|-----|-------------------|---------------|
| **Proposal** | — | Richiedente | RICE evaluation, CorpusSource draft, giustificazione | 1 giorno |
| **Review** | `planned` | Architecture + CME | Approvazione da decision tree (L1/L2/L3), review architetturale | 1-2 giorni |
| **Development** | `planned` → `api-tested` | Data Engineering | ConnectorInterface implementata, test CONNECT passato | 2-5 giorni |
| **Testing** | `api-tested` → `schema-ready` | Data Engineering + QA | MODEL completato, schema DB verificato, test su sample data | 1-3 giorni |
| **Beta** | `schema-ready` → `loaded` | Data Engineering | LOAD completato, dati verificati, monitoring attivo | 1-2 giorni |
| **GA (General Availability)** | `loaded` → `delta-active` | Operations | Security review passata, SLA attivi, delta sync configurato | 1 giorno |
| **Deprecation** | `delta-active` → `blocked` | Data Engineering | Piano migrazione eseguito, dati archiviati, connettore rimosso | 30+ giorni |

### 1.2 Gate tra fasi

Ogni transizione ha un gate esplicito. Non si procede senza completare il gate.

**Proposal → Review**
- RICE score calcolato e documentato
- Entry in `corpus-sources.ts` con lifecycle `planned`
- Tipo connettore identificato (normattiva/eurlex/openstax/nuovo)

**Review → Development**
- Approvazione dal decision tree (vedi `integration-request.yaml`)
- Se nuovo tipo provider: RFC architetturale approvato (L3)
- Architecture ha confermato che il pattern si integra nel registry

**Development → Testing**
- `connect()` ritorna `ConnectResult` con `ok: true`
- Sample data disponibile (minimo 10 record)
- Parser/transformer implementato e funzionante su sample

**Testing → Beta**
- `checkSchema()` ritorna `ModelResult` con `ready: true`
- Migration SQL scritta e testata su Supabase
- Almeno 50 articoli caricati correttamente in ambiente di test
- Error rate su sample < 2%

**Beta → GA**
- Full load completato (`StoreResult` con errors < 2%)
- Security review passata (vedi sezione 4)
- Monitoring configurato (sync log, error alerting)
- Delta sync testato (almeno 1 ciclo delta riuscito)
- Entry aggiornata in `corpus-sources.ts` con lifecycle `delta-active`

**GA → Deprecation**
- Piano migrazione documentato e approvato da CME (L2)
- Comunicazione ai dipartimenti impattati (minimo 30 giorni anticipo per connettori interni)
- Dati migrati o archiviati
- Connettore disabilitato (lifecycle `blocked`)
- Entry rimossa o marcata deprecated in `corpus-sources.ts`

---

## 2. SLA per tier

I connettori in GA devono rispettare SLA differenziati per tier di servizio.

### 2.1 Tier Free (utenti gratuiti)

| Metrica | Target | Azione su violazione |
|---------|--------|---------------------|
| Uptime sync | 95% (max 36h downtime/mese) | Notifica data-engineering leader |
| Latency sync | < 30min per fonte < 1000 art., < 2h per fonti grandi | Log warning |
| Error rate | < 5% articoli falliti per sync run | Retry automatico 3x |
| Freshness | Delta sync settimanale o mensile | Nessuna azione (best effort) |
| Recovery time | 72h dopo incident | Escalation a CME se superato |

### 2.2 Tier Pro (utenti paganti)

| Metrica | Target | Azione su violazione |
|---------|--------|---------------------|
| Uptime sync | 99% (max 7h downtime/mese) | Notifica CME |
| Latency sync | < 5min per fonte < 1000 art., < 30min per fonti grandi | Alert su Telegram |
| Error rate | < 2% articoli falliti per sync run | Retry automatico 3x + notifica |
| Freshness | Delta sync giornaliero o settimanale | Alert se delta ritarda > 2x intervallo |
| Recovery time | 24h dopo incident | Escalation a boss se superato |

### 2.3 Tier Enterprise (futuro)

| Metrica | Target | Azione su violazione |
|---------|--------|---------------------|
| Uptime sync | 99.5% (max 3.5h downtime/mese) | Incident automatico |
| Latency sync | < 2min per fonte < 1000 art., < 15min per fonti grandi | Alert immediato |
| Error rate | < 1% articoli falliti per sync run | Retry + rollback automatico |
| Freshness | Delta sync giornaliero (configurabile sub-orario) | Alert immediato |
| Recovery time | 4h dopo incident | Escalation immediata a boss + Security |

### 2.4 Escalation path per violazione SLA

```
1. Retry automatico (3x, backoff esponenziale)
2. Notifica data-engineering leader (dopo 3 retry falliti)
3. Se dati persi o corrotti → L2 a CME
4. Se downtime > SLA recovery time → L3 a boss
5. Se breach sicurezza → L4 (vedi decision tree: connector_security_breach)
```

---

## 3. Monitoring e alerting

### 3.1 Metriche monitorate

Ogni connettore in GA deve produrre le seguenti metriche, tracciate in `connector_sync_log`:

| Metrica | Fonte | Retention |
|---------|-------|-----------|
| Sync success/failure | `SyncLogEntry.status` | 90 giorni dettaglio, aggregato permanente |
| Items fetched/inserted/updated/skipped/errors | `SyncLogEntry.*` | 90 giorni |
| Sync duration | `SyncLogEntry.completedAt - startedAt` | 90 giorni |
| Error details | `SyncLogEntry.errorDetails` | 30 giorni |
| Embedding generation time | metadata campo custom | 90 giorni |

### 3.2 Alert trigger

| Evento | Canale | Destinatario |
|--------|--------|-------------|
| 3 sync fallite consecutive | Telegram | CME |
| Error rate > SLA threshold | Telegram | data-engineering leader |
| Downtime > recovery time | Telegram | CME + boss (se > 2x recovery time) |
| Security incident | Telegram | CME + boss + Security |
| Credenziale in scadenza (se tracciabile) | Task board | Operations |

---

## 4. Security review checklist (pre-GA)

Ogni connettore deve superare questa checklist prima di passare a GA. Il Security dept esegue la review.

### 4.1 Autenticazione e credenziali

- [ ] Credenziali salvate in env vars, mai nel codice sorgente
- [ ] Credenziali non loggabili (no print di API key in log/errori)
- [ ] Rotazione credenziali testata e documentata
- [ ] Scopes/permessi minimi richiesti (principio del least privilege)
- [ ] Se OAuth: redirect URI validata, token storage sicuro

### 4.2 Dati in transito

- [ ] Comunicazione solo via HTTPS
- [ ] Nessun dato sensibile in URL parameters (solo body/headers)
- [ ] Timeout configurato su tutte le richieste HTTP (max 30s per default)
- [ ] User-Agent header impostato (per rispetto policy provider)

### 4.3 Dati a riposo

- [ ] Nessun dato personale (PII) salvato senza base giuridica
- [ ] RLS attivo sulle tabelle coinvolte
- [ ] TTL configurato per dati temporanei (sync log: 90gg, error log: 30gg)
- [ ] Embedding non reversibili (voyage-law-2 produce vettori, non testo)

### 4.4 Resilienza

- [ ] Retry con backoff esponenziale (max 3 tentativi)
- [ ] Circuit breaker o kill switch manuale disponibile
- [ ] Nessun crash su risposta malformata (parser gestisce errori gracefully)
- [ ] Rollback possibile: dati caricabili nuovamente da zero senza duplicati

### 4.5 Dipendenze

- [ ] Nessuna dipendenza con CVE critiche note
- [ ] Dipendenze pinned a versione specifica (no `latest` o `*`)
- [ ] Licenza dipendenze compatibile con progetto (MIT, Apache 2.0, ISC)

---

## 5. Breaking change policy

### 5.1 Definizione di breaking change

Un breaking change e un qualsiasi cambiamento che:
- Rinomina, rimuove o cambia il tipo di una colonna del DB usata da query esterne
- Modifica il formato di output di `fetchAll()` o `fetchDelta()` in modo non backward-compatible
- Rimuove o rinomina un campo nella `DataSource` interface
- Cambia il behavior di `connect()`, `checkSchema()`, o `save()` in modo incompatibile

### 5.2 Semver per interfacce connettore

Le interfacce del data connector seguono semver concettuale (non pubblicato come package, ma come convenzione interna):

| Tipo modifica | Semver | Approvazione | Esempio |
|--------------|--------|-------------|---------|
| Bug fix, performance | PATCH | L1 | Fix normalizzazione testo, ottimizzazione query |
| Nuovo campo opzionale, nuova feature | MINOR | L1 | Aggiungere campo `isInForce` a `ParsedArticle` |
| Rinomina campo, rimozione, cambio tipo | MAJOR | L2 | Rinominare `articleText` → `content` |
| Cambio interfaccia `ConnectorInterface` | MAJOR | L3 | Aggiungere parametro obbligatorio a `connect()` |

### 5.3 Periodo di notifica

| Tipo | Notifica minima | A chi |
|------|----------------|-------|
| PATCH | Nessuna | — |
| MINOR | Comunicazione nel task di completamento | Dept dipendenti |
| MAJOR (interno) | 7 giorni prima dell'applicazione | Tutti i dept dipendenti + CME |
| MAJOR (esterno, se API pubblica futura) | 30 giorni | Utenti + changelog pubblico |

### 5.4 Procedura breaking change

1. Aprire task con `--priority high` e `--desc` che descrive il breaking change
2. Creare migration SQL con rollback esplicito
3. Notificare dipartimenti impattati (Architecture, QA, dept che consumano i dati)
4. Testare migration su staging (sample data)
5. Eseguire migration in produzione durante finestra di basso traffico
6. Verificare post-migration: query funzionanti, API route OK, UI aggiornata
7. Chiudere task con summary completo

---

## 6. Deprecation policy

### 6.1 Motivi validi per deprecazione

- Provider ha dismesso l'API sorgente
- Fonte non piu mantenuta o affidabile (error rate > 10% per 30 giorni)
- Fonte sostituita da alternativa superiore
- Costo operativo non giustificato dal valore (RICE ricalcolato < 10)
- Decisione strategica (riduzione scope, pivot verticale)

### 6.2 Timeline deprecazione

```
Giorno 0:    ANNUNCIO — Task board + notifica a dept dipendenti
             lifecycle → "loaded" (stop delta sync)
             Label "DEPRECATED" aggiunta a CorpusSource

Giorno 1-30: MIGRAZIONE — Dati migrati a fonte alternativa (se esiste)
             Dipartimenti impattati aggiornano query/logica
             Supporto attivo per problemi di migrazione

Giorno 30:   SUNSET — Connettore disabilitato
             lifecycle → "blocked"
             Dati mantenuti in DB (read-only) per 90 giorni

Giorno 120:  RIMOZIONE — Dati rimossi dal DB
             Entry rimossa da corpus-sources.ts
             Migration SQL per cleanup tabelle/indici
```

### 6.3 Eccezioni alla timeline

| Scenario | Timeline ridotta | Approvazione |
|----------|-----------------|-------------|
| Security breach | Immediata (0 giorni) | L4 |
| Provider down permanente | 7 giorni | L2 |
| Costo insostenibile (billing spike) | 7 giorni | L2 + Finance |

### 6.4 Obblighi durante deprecazione

- I dati gia caricati restano accessibili in read-only per almeno 90 giorni dopo sunset
- Se esiste fonte alternativa, data-engineering fornisce script di migrazione
- Se non esiste alternativa, CME comunica l'impatto agli utenti (se feature pubblica)
- Nessun dato viene eliminato senza backup verificato

---

## 7. RICE evaluation template

Per ogni nuovo connettore, compilare la seguente valutazione:

```
Connettore: [nome]
Data: [YYYY-MM-DD]
Valutatore: [dept/agent]

Reach (1-100): quanti utenti/analisi beneficiano?
  → [score] — [motivazione]

Impact (1-3): quanto migliora l'esperienza? (1=minimo, 2=medio, 3=forte)
  → [score] — [motivazione]

Confidence (0.5-1.0): quanto siamo sicuri delle stime? (0.5=bassa, 0.8=media, 1.0=alta)
  → [score] — [motivazione]

Effort (1-10): quanti giorni-persona per implementare?
  → [score] — [motivazione]

RICE = (Reach x Impact x Confidence) / Effort = [score finale]

Threshold: > 50 = L1 auto-approve | <= 50 = L2 CME review
Tipo provider: esistente (L1/L2) | nuovo (L3 boss approval)
```

---

## 8. Registro connettori attivi

Fonte di verita: `scripts/corpus-sources.ts` (campo `lifecycle`).

Snapshot dei connettori per tipo:

| Tipo | Connettori | Esempio fonti |
|------|-----------|---------------|
| `normattiva` | NormattivaConnector | Codice Civile, D.Lgs. 206/2005, L. 300/1970 |
| `eurlex` | EurLexConnector | GDPR, Direttiva Consumatori, Reg. Roma I |
| `openstax` | OpenStaxConnector | Anatomy & Physiology (verticale medico) |
| `ncbi-bookshelf` | StatPearlsConnector | StatPearls (verticale medico) |
| `europe-pmc` | EuropePMCConnector | Articoli scientifici (verticale medico) |

Per lo stato aggiornato di ogni fonte: `npx tsx scripts/data-connector.ts status`
