# Piano Estensione Dashboard /ops — Integration Health Monitoring

**Data**: 2026-03-10
**Task**: 08c3f075
**Autore**: ops-monitor (Operations dept)
**Priorita'**: MEDIUM

---

## 1. Audit dello stato attuale

### Cosa esiste gia'

La dashboard `/ops` (file `app/ops/OpsPageClient.tsx`, 876 righe) e' una dashboard tab-based con 9 tab:

| Tab | Componente | Funzionalita' |
|-----|-----------|---------------|
| **Dashboard** | `OverviewSummaryPanel`, `CompanyRoadmap`, `TaskBoard`, `ActivityFeed`, `CostSummary`, `QAStatus` | Overview completa: focus giorno, task board kanban, costi 7gg, QA status |
| **Trading** | `TradingDashboard`, `TradingSlopePanel` | Portfolio, posizioni, slope strategy |
| **CME** | `CompanyPanel` (embedded) | Chat con CME direttamente da /ops |
| **Vision** | `VisionMissionPanel` | Vision e mission aziendale |
| **Reports** | `ReportsPanel` | Report generati |
| **Archivio** | `ArchivePanel` | Storico sessioni CME |
| **Daemon** | `DaemonControlPanel` | Controllo daemon CME |
| **Agenti** | `AgentHealth`, `PipelineStatus` | Health agenti + stato pipeline dati |
| **QA & Test** | `QAResultsDashboard`, `LegalQATestPanel`, `DebugPanel` | Risultati QA, test esecuzione, debug sistema |

### Componenti ops esistenti (32 file in `components/ops/`)

| Componente | Cosa mostra | Fonte dati |
|-----------|-------------|-----------|
| `AgentHealth.tsx` | Dot verde/giallo/rosso per agente, modello attivo, enabled/disabled | `/api/company/status` -> `AGENT_MODELS` + tier info |
| `PipelineStatus.tsx` | Lista connettori con dot status, articoli, ultimo sync | `/api/company/status` -> `getConnectorStatus()` |
| `CostSummary.tsx` | Totale speso, chiamate, costo medio, breakdown per provider, fallback rate | `/api/company/costs` |
| `OverviewSummaryPanel.tsx` | Focus giorno, prossime azioni, report dipartimenti espandibili, note manuali | `/api/company/summary` |
| `DebugPanel.tsx` | Tier/agenti/catene fallback, env vars check, costi API 7d, provider health (ok/degraded/error), live console | `/api/console/tier`, `/api/company/env-check`, `/api/company/costs` |
| `QAResultsDashboard.tsx` | KPI test (pass/borderline/fail), distribuzione score, breakdown per tier/blocco, stress test pipeline documenti | `/api/company/legal-qa-tests`, `/api/company/stress-test-results` |
| `TaskBoard.tsx` | Kanban task per stato (open/in_progress/done/blocked) | `/api/company/status` |
| `ActivityFeed.tsx` | Feed attivita' recenti con priorita' | Derived da board data |
| `AgentDots.tsx` | Pallini animati in header per agenti attivi | SSE `/api/company/agents/live` |
| `CapacityIndicator.tsx` | Indicatore capacita' agenti | Count agenti attivi |

### Cosa manca per integration health monitoring

1. **Panel sync health dedicato** — `PipelineStatus.tsx` mostra solo una lista minimale (8 righe max) con dot/articoli/tempo. Manca: durata sync, errori 7gg, trend, stato visivo immediato (healthy/warning/error/unknown).

2. **Connettori attivi con status real-time** — Non c'e' una vista che mostri tutti i 13 connettori con metriche dettagliate per ognuno (articoli aggiunti/aggiornati, errori, durata media, uptime).

3. **Error log con AI fix suggestions** — Nessun componente mostra errori di sync con dettaglio, filtering, e suggerimenti di fix.

4. **Metriche aggregate per connettore** — Nessuna aggregazione storica (trend, rate di successo, articoli processati nel tempo).

### Dati gia' disponibili nel backend

| Dato | Disponibile | Via |
|------|------------|-----|
| Ultimo sync per connettore | Si | `getConnectorStatus()` in `sync-log.ts` |
| Storico sync per connettore | Si | `getSyncHistory(sourceId, limit)` in `sync-log.ts` |
| Items fetched/inserted/updated/skipped | Si | Campi in `connector_sync_log` |
| Errori e error_details | Si | Campi `errors`, `error_details` in `connector_sync_log` |
| Articoli per fonte | Si | Query `legal_articles` con `WHERE source_id = ?` |
| Provider health (ok/degraded/error) | Si | `getProviderHealth()` in `cost-logger.ts` |
| Conteggio connettori registrati | Si | `corpus-sources.ts` (14 fonti) |

---

## 2. Piano di estensione

### 2.1 Panel Sync Health (PRIORITA' 1)

**Componente**: `IntegrationHealthPanel.tsx`
**Posizione**: Nuovo tab "Integrazioni" in `OpsPageClient.tsx` oppure sezione nel tab "Agenti" sotto `PipelineStatus`

**Funzionalita'**:
- Summary bar in alto: N connettori totali, N healthy, N warning, N error
- Grid di card connettore (responsive: 1-3 colonne)
- Ogni card mostra:
  - Nome connettore + status dot (healthy/warning/error/unknown)
  - Articoli totali nel corpus
  - Ultimo sync: timestamp relativo + risultato (success/partial/failed)
  - Durata ultimo sync (in secondi/minuti)
  - Errori ultimi 7 giorni (badge)
  - Articoli aggiunti/aggiornati ultimi 7 giorni

**Logica status**:
```
healthy  = ultimo sync < 24h && errori 7d == 0
warning  = ultimo sync 1-7 giorni fa || (errori 7d > 0 && errori 7d < 5)
error    = ultimo sync fallito || errori 7d >= 5 || nessun sync in 7+ giorni
unknown  = nessun sync mai eseguito
```

**API necessaria**: Estendere `GET /api/company/status` con campo `integrationHealth` oppure creare `GET /api/ops/integration/status` dedicato.

**Stima effort**: 1 sessione (backend query + frontend component)

### 2.2 Connettori attivi con status real-time (PRIORITA' 2)

**Componente**: `ConnectorDetailPanel.tsx` (drill-down da card)
**Trigger**: Click su card connettore nel `IntegrationHealthPanel`

**Funzionalita'**:
- Dettaglio connettore selezionato:
  - Tabella storico sync (ultime 20 esecuzioni) con colonne: data, tipo, durata, items processati, errori, status
  - Mini bar chart: sync success/fail ultimi 7 giorni (CSS puro, no librerie esterne)
  - Bottone "Trigger sync" (chiama `/api/platform/cron/data-connector` con `CRON_SECRET`)
- Status connettore in tempo reale:
  - Se un sync e' in corso (status=running nel sync_log), mostrare spinner + durata real-time
  - Auto-refresh ogni 30s

**API necessaria**: `GET /api/ops/integration/history?sourceId=xxx&limit=20`

**Stima effort**: 1 sessione (component + API route)

### 2.3 Error Log con AI fix suggestions (PRIORITA' 3)

**Componente**: `SyncErrorLog.tsx`
**Posizione**: Sezione nel tab "Integrazioni" o dentro `ConnectorDetailPanel`

**Funzionalita'**:
- Lista errori da `connector_sync_log` dove `status = 'failed'` o `errors > 0`
- Filtering per:
  - Connettore (dropdown con tutti i source_id)
  - Periodo (ultime 24h, 7gg, 30gg)
  - Severita' (error vs warning)
- Ogni riga errore mostra:
  - Timestamp, connettore, messaggio, items processati prima del fallimento
  - Click per espandere: `error_details` completo (array di `{item, error}`)
- **AI Fix suggestions** (futura, richiede LLM call):
  - Pattern matching rule-based (no LLM) come fase 1:
    - `HTTP 429` -> "Rate limit raggiunto. Aumentare intervallo tra richieste o ridurre batch size."
    - `HTTP 404` -> "Risorsa non trovata. Verificare URL endpoint e versione API."
    - `ECONNREFUSED` -> "Server non raggiungibile. Verificare stato servizio esterno."
    - `timeout` -> "Timeout. Aumentare timeout in BaseConnector o verificare performance rete."
    - `WAF block` -> "Bloccato da firewall. Verificare User-Agent header nel connettore."
    - `OAuth expired` -> "Token scaduto. Rigenerare credenziali."
  - Fase 2 (futura): LLM analizza errore + contesto connettore per suggerimenti piu' specifici

**API necessaria**: `GET /api/ops/integration/errors?sourceId=xxx&days=7&limit=20&offset=0`

**Stima effort**: 1-2 sessioni (query + component + rule engine fix suggestions)

### 2.4 Metriche aggregate per connettore (PRIORITA' 4)

**Componente**: `SyncMetricsPanel.tsx`
**Posizione**: Dentro `ConnectorDetailPanel` o come sezione nel tab "Integrazioni"

**Funzionalita'**:
- Per ogni connettore (e aggregato totale):
  - **Success rate** (7gg, 30gg): % sync riusciti
  - **Articoli processati** (7gg, 30gg): somma items_fetched, items_inserted, items_updated
  - **Tempo medio sync** (7gg): media durata in secondi
  - **Error rate** (7gg): % sync con errori > 0
- Visualizzazione:
  - KPI cards in stile QAResultsDashboard (riusare pattern `KPICard`)
  - Sparkline trend (CSS, 7 punti per i 7 giorni)
- Aggregazione globale:
  - Totale articoli corpus (da `legal_articles` count)
  - Totale connettori attivi vs configurati (da `corpus-sources.ts` vs `connector_sync_log`)
  - Last global sync timestamp

**API necessaria**: `GET /api/ops/integration/metrics?sourceId=xxx&days=7`

**Stima effort**: 1 sessione (query aggregazione + component)

---

## 3. Architettura API

### Opzione A: Estendere `/api/company/status` (raccomandata)

Aggiungere campo `integrationHealth` alla response esistente. Pro: un solo fetch dal frontend, coerenza con il pattern attuale. Contro: response diventa piu' pesante.

```typescript
// In /api/company/status/route.ts, aggiungere:
const integrationHealth = await getIntegrationHealth();

return NextResponse.json({
  board, costs, pipeline, agents,
  integrationHealth,  // NUOVO
  timestamp: new Date().toISOString(),
});
```

### Opzione B: API dedicate sotto `/api/ops/integration/`

| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/api/ops/integration/status` | GET | Status tutti i connettori + summary |
| `/api/ops/integration/history` | GET | Storico sync per connettore (`?sourceId=&limit=`) |
| `/api/ops/integration/errors` | GET | Error log con filtering (`?sourceId=&days=&limit=&offset=`) |
| `/api/ops/integration/metrics` | GET | Metriche aggregate (`?sourceId=&days=`) |

Tutti protetti da `requireConsoleAuth` + `checkRateLimit`.

**Raccomandazione**: Opzione B per separazione di responsabilita'. Il `/api/company/status` e' gia' pesante (3 query parallele). Le query di integration health possono essere costose (aggregazioni su sync_log).

---

## 4. Modifiche a OpsPageClient.tsx

### Opzione 1: Nuovo tab "Integrazioni"

```typescript
// Aggiungere a TABS:
{ id: "integrations", label: "Integrazioni", icon: Plug2 },

// Aggiungere nel render:
{activeTab === "integrations" && (
  <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6">
    <IntegrationHealthPanel />
  </div>
)}
```

### Opzione 2: Estendere tab "Agenti"

Aggiungere `IntegrationHealthPanel` sotto `PipelineStatus` nel tab "agents" esistente, dentro un `SectionCard`.

**Raccomandazione**: Opzione 1 (tab dedicato). Il tab "Agenti" e' gia' denso e l'integration health merita visibilita' propria dato che e' un sistema critico (il corpus alimenta tutti gli agenti).

---

## 5. Dipendenze e vincoli

### Gia' disponibili (nessun lavoro aggiuntivo)

- `connector_sync_log` tabella Supabase (migration 009)
- `legal_articles` tabella Supabase (migration 003)
- `sync-log.ts` con funzioni `getConnectorStatus()`, `getSyncHistory()`, `getLastSuccessfulSync()`
- `requireConsoleAuth` + `checkRateLimit` middleware
- Design system ops (variabili CSS, SectionCard wrapper, KPICard pattern)
- Framer Motion per animazioni
- Lucide React per icone

### Da creare

| Artefatto | Tipo | Stima |
|-----------|------|-------|
| `lib/integration/health.ts` | Backend service | Query aggregate per health status |
| `app/api/ops/integration/status/route.ts` | API route | Status connettori |
| `app/api/ops/integration/errors/route.ts` | API route | Error log |
| `app/api/ops/integration/history/route.ts` | API route | Sync history |
| `app/api/ops/integration/metrics/route.ts` | API route | Metriche aggregate |
| `components/ops/IntegrationHealthPanel.tsx` | React component | Panel principale |
| `components/ops/ConnectorStatusCard.tsx` | React component | Card per connettore |
| `components/ops/ConnectorDetailPanel.tsx` | React component | Drill-down connettore |
| `components/ops/SyncErrorLog.tsx` | React component | Error log con filtering |
| `components/ops/SyncMetricsPanel.tsx` | React component | Metriche aggregate |
| `lib/integration/fix-suggestions.ts` | Rule engine | Pattern matching error -> fix |

---

## 6. Fasi di implementazione

| Fase | Contenuto | Dipendenze | Sessioni |
|------|-----------|-----------|----------|
| **Fase 1** | Backend `getIntegrationHealth()` + API route `/status` + `IntegrationHealthPanel` con card connettori | `sync-log.ts` esistente | 1 |
| **Fase 2** | `ConnectorDetailPanel` drill-down + API `/history` + storico sync tabellare | Fase 1 | 1 |
| **Fase 3** | `SyncErrorLog` + API `/errors` + fix suggestions rule-based | Fase 1 | 1-2 |
| **Fase 4** | `SyncMetricsPanel` + API `/metrics` + aggregazioni + sparkline | Fase 1 | 1 |
| **Fase 5** | Alert config Telegram (estendere `ops-alerting.ts` con check integration health) | Fase 1 | 1 |

**Totale stimato**: 5-6 sessioni di implementazione.

---

## 7. Spec di riferimento

La spec dettagliata con wireframe ASCII, interfacce TypeScript e query SQL e' disponibile in:
`company/operations/specs/integration-dashboard-spec.md`

Questa spec (prodotta precedentemente dal dipartimento Operations) e' confermata come allineata e puo' essere usata come base per l'implementazione. Le uniche differenze con questo piano sono:
- Questo piano definisce le fasi e priorita' (la spec non le aveva)
- Questo piano documenta cosa esiste gia' e cosa manca (audit)
- Questo piano raccomanda API dedicate sotto `/api/ops/integration/` anziche' estendere `/api/company/status`
