# Dashboard Spec — Integration Health Monitoring

**Autore**: Operations / ops-monitor
**Data**: 2026-03-10
**Stato**: SPEC
**Task**: 08c3f075

---

## 1. Overview

Estensione della dashboard `/ops` con un nuovo pannello **Integration Health** per monitorare lo stato dei connettori dati, sync history, errori e alert. Il pannello si integra con i componenti esistenti (`OpsPageClient.tsx`, pannelli in `components/ops/`).

---

## 2. Nuovo Pannello: IntegrationHealthPanel

### Posizione nel layout

Aggiungere come tab/sezione in `/ops` sotto i pannelli esistenti (dopo `OverviewSummaryPanel` e `DaemonControlPanel`).

### Componente React

**File**: `components/ops/IntegrationHealthPanel.tsx`

### Struttura UI

```
+-------------------------------------------------------------------+
| INTEGRATION HEALTH                                    [Refresh] [?]|
+-------------------------------------------------------------------+
|                                                                     |
| +------------------+ +------------------+ +------------------+     |
| | NORMATTIVA       | | EUR-LEX          | | OPENSTAX         |     |
| | [GREEN DOT]      | | [YELLOW DOT]     | | [RED DOT]        |     |
| |                  | |                  | |                  |     |
| | 2.969 articoli   | | 1.245 articoli   | | 47 articoli      |     |
| | Ultimo sync:     | | Ultimo sync:     | | Ultimo sync:     |     |
| | 2h fa            | | 3 giorni fa      | | FALLITO          |     |
| | Errori: 0        | | Errori: 2        | | Errori: 15       |     |
| | Durata: 45s      | | Durata: 2m 30s   | | Durata: --       |     |
| +------------------+ +------------------+ +------------------+     |
|                                                                     |
| +--- SYNC HISTORY (last 7 days) --------------------------------+ |
| |                                                                 | |
| |  [BAR CHART]                                                    | |
| |  |||  ||   ||| |||  ||   |   |||                                | |
| |  Mon  Tue  Wed Thu  Fri  Sat Sun                                | |
| |                                                                 | |
| |  Legend: [green] Success  [red] Failed  [grey] Skipped          | |
| +----------------------------------------------------------------+ |
|                                                                     |
| +--- ERROR LOG ------------------------------------------------+ |
| | [Filter: All | Normattiva | EUR-Lex | OpenStax]  [Search]    | |
| |                                                               | |
| | 2026-03-10 09:15 | OPENSTAX   | HTTP 404 /api/v1/books     | |
| | 2026-03-09 14:22 | EUR-LEX    | Timeout after 30s (Cellar) | |
| | 2026-03-09 14:20 | EUR-LEX    | OAuth token expired        | |
| | 2026-03-08 03:00 | NORMATTIVA | WAF block (User-Agent)     | |
| |                                                               | |
| | [Load more...]                                                | |
| +--------------------------------------------------------------+ |
|                                                                     |
| +--- ALERTS CONFIGURATION ------------------------------------+ |
| | [x] Notify on sync failure          [Telegram] [Dashboard]   | |
| | [x] Notify if no sync in 7 days     [Telegram] [Dashboard]   | |
| | [x] Notify on error rate > 10%      [Telegram] [Dashboard]   | |
| | [ ] Notify on every successful sync [Dashboard only]          | |
| +--------------------------------------------------------------+ |
+-------------------------------------------------------------------+
```

---

## 3. Connector Status Cards

### Design

Ogni connettore ha una card con stato visivo immediato.

### Stato e colori

| Stato | Colore | Condizione |
|-------|--------|-----------|
| **Healthy** | Verde (#4ECDC4) | Ultimo sync < 24h, errori = 0 |
| **Warning** | Giallo (#FFC832) | Ultimo sync 1-7 giorni fa OPPURE errori > 0 ma < 5 |
| **Error** | Rosso (#FF6B6B) | Ultimo sync fallito OPPURE errori >= 5 OPPURE nessun sync in 7+ giorni |
| **Unknown** | Grigio (#6B7280) | Nessun sync mai eseguito |

### Dati per card

```typescript
interface ConnectorStatus {
  id: string;                    // es. "normattiva"
  name: string;                  // es. "Normattiva Open Data"
  status: "healthy" | "warning" | "error" | "unknown";
  articleCount: number;          // Articoli nel corpus per questa fonte
  lastSyncAt: string | null;     // ISO timestamp ultimo sync
  lastSyncDuration: number | null; // millisecondi
  lastSyncResult: "success" | "partial" | "failed" | null;
  errorCount7d: number;         // Errori negli ultimi 7 giorni
  articlesAdded7d: number;      // Nuovi articoli negli ultimi 7 giorni
  articlesUpdated7d: number;    // Articoli aggiornati negli ultimi 7 giorni
}
```

### Fonte dati

Query da `connector_sync_log` (tabella Supabase):

```sql
-- Ultimo sync per connettore
SELECT source_id, status, started_at, completed_at,
       articles_processed, articles_added, articles_updated, error_message
FROM connector_sync_log
WHERE source_id = $1
ORDER BY started_at DESC
LIMIT 1;

-- Conteggio errori ultimi 7 giorni
SELECT COUNT(*) as error_count
FROM connector_sync_log
WHERE source_id = $1
  AND status = 'failed'
  AND started_at > NOW() - INTERVAL '7 days';

-- Conteggio articoli per fonte
SELECT COUNT(*) as article_count
FROM legal_articles
WHERE source_id = $1;
```

---

## 4. Error Log Panel

### Funzionalita

| Feature | Descrizione |
|---------|-------------|
| **Filtering** | Per connettore (dropdown), per severita, per data range |
| **Search** | Ricerca full-text nel messaggio di errore |
| **Pagination** | 20 errori per pagina, "Load more" |
| **Dettaglio** | Click su errore espande con stack trace e contesto |
| **Export** | Bottone per scaricare CSV errori filtrati |

### Schema dati

```typescript
interface SyncError {
  id: string;
  sourceId: string;
  sourceName: string;
  timestamp: string;
  severity: "error" | "warning" | "info";
  message: string;
  details?: string;           // Stack trace o contesto aggiuntivo
  syncLogId?: string;         // Riferimento a connector_sync_log
  resolved: boolean;          // Errore risolto da un sync successivo
}
```

### Fonte dati

```sql
SELECT id, source_id, status, started_at, error_message,
       articles_processed, articles_added
FROM connector_sync_log
WHERE status IN ('failed', 'partial')
ORDER BY started_at DESC
LIMIT 20 OFFSET $offset;
```

---

## 5. Sync History Chart

### Tipo: Stacked Bar Chart (7 giorni)

- **Asse X**: Ultimi 7 giorni (label giorno della settimana)
- **Asse Y**: Numero di sync
- **Colori barre**: Verde (success), Rosso (failed), Grigio (skipped/partial)
- **Hover**: tooltip con dettagli (fonte, durata, articoli processati)

### Implementazione

Usare CSS puro con `div` styled (no libreria chart esterna, coerente con lo stile del progetto che usa Tailwind + Framer Motion).

```typescript
interface SyncHistoryDay {
  date: string;         // "2026-03-10"
  dayLabel: string;     // "Lun"
  success: number;
  failed: number;
  partial: number;
}
```

### Query

```sql
SELECT
  DATE(started_at) as sync_date,
  status,
  COUNT(*) as count
FROM connector_sync_log
WHERE started_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(started_at), status
ORDER BY sync_date;
```

---

## 6. Alert Configuration

### Alert types

| Alert | Default | Canali |
|-------|---------|--------|
| Sync fallito | ON | Telegram + Dashboard |
| Nessun sync da 7+ giorni | ON | Telegram + Dashboard |
| Error rate > 10% (7d) | ON | Telegram + Dashboard |
| Ogni sync riuscito | OFF | Dashboard only |
| Articoli corrotti rilevati | ON | Telegram + Dashboard |

### Implementazione alert

Gli alert usano il sistema Telegram gia esistente (`utils/telegram.py` per trading, estendere o creare equivalente TypeScript).

```typescript
// lib/alerts/integration-alerts.ts

interface IntegrationAlert {
  type: "sync_failed" | "no_sync" | "high_error_rate" | "corrupted_data";
  sourceId: string;
  message: string;
  severity: "warning" | "critical";
  channels: ("telegram" | "dashboard")[];
}

async function checkIntegrationHealth(): Promise<IntegrationAlert[]> {
  // 1. Query connector_sync_log per ultimo sync per fonte
  // 2. Verifica condizioni alert
  // 3. Ritorna lista alert da inviare
}
```

### Storage alert config

Salvare in `ops-alert-state.json` (gia esistente in `company/`), sezione dedicata `integrations`:

```json
{
  "integrations": {
    "alerts": {
      "sync_failed": { "enabled": true, "channels": ["telegram", "dashboard"] },
      "no_sync_7d": { "enabled": true, "channels": ["telegram", "dashboard"] },
      "high_error_rate": { "enabled": true, "channels": ["telegram", "dashboard"] },
      "every_success": { "enabled": false, "channels": ["dashboard"] }
    }
  }
}
```

---

## 7. API Endpoints

### Nuovi endpoint necessari

| Endpoint | Metodo | Descrizione | Auth |
|----------|--------|-------------|------|
| `/api/ops/integration/status` | GET | Status di tutti i connettori | Console auth |
| `/api/ops/integration/errors` | GET | Error log con filtering | Console auth |
| `/api/ops/integration/history` | GET | Sync history ultimi N giorni | Console auth |
| `/api/ops/integration/alerts` | GET/POST | Config alert | Console auth |

### Esempio response `/api/ops/integration/status`

```json
{
  "connectors": [
    {
      "id": "normattiva",
      "name": "Normattiva Open Data",
      "status": "healthy",
      "articleCount": 2969,
      "lastSyncAt": "2026-03-10T07:15:00Z",
      "lastSyncDuration": 45000,
      "lastSyncResult": "success",
      "errorCount7d": 0,
      "articlesAdded7d": 0,
      "articlesUpdated7d": 3
    }
  ],
  "summary": {
    "totalConnectors": 13,
    "healthy": 10,
    "warning": 2,
    "error": 1,
    "totalArticles": 5623,
    "lastGlobalSync": "2026-03-10T07:15:00Z"
  }
}
```

---

## 8. Dipendenze Tecniche

| Dipendenza | Stato | Note |
|-----------|-------|------|
| `connector_sync_log` table | Esistente | Usata da data-connector pipeline |
| `legal_articles` table | Esistente | Conteggio articoli per fonte |
| `requireConsoleAuth` middleware | Esistente | Auth per endpoint ops |
| `checkRateLimit` middleware | Esistente | Rate limit per endpoint |
| Telegram bot | Esistente | Riusare infrastruttura trading alerts |
| Framer Motion | Esistente | Animazioni card e transizioni |
| Tailwind CSS 4 | Esistente | Styling coerente con il resto di /ops |

---

## 9. Implementazione — Fasi

### Fase 1 — Backend (1 sessione)
1. Creare API routes `/api/ops/integration/*`
2. Query `connector_sync_log` e `legal_articles`
3. Calcolare status per connettore
4. Test unitari API

### Fase 2 — Frontend Cards (1 sessione)
5. Componente `IntegrationHealthPanel.tsx`
6. Componente `ConnectorStatusCard.tsx`
7. Integrare in `OpsPageClient.tsx`
8. Responsive layout (mobile: 1 card per riga, desktop: 3-4 per riga)

### Fase 3 — Error Log & Chart (1 sessione)
9. Componente `SyncErrorLog.tsx` con filtering
10. Componente `SyncHistoryChart.tsx` (CSS bar chart)
11. Pagination e search

### Fase 4 — Alerts (1 sessione)
12. `lib/alerts/integration-alerts.ts`
13. Alert config UI
14. Integrazione Telegram
15. Cron check health (riusare pattern esistente)

---

## 10. Design Notes

- **Coerenza**: seguire lo stile dei pannelli esistenti in `/ops` (sfondo scuro `#0a0a0a`, bordi `border-white/10`, testo `text-white/70`)
- **Icone**: usare `lucide-react` (Activity, AlertTriangle, CheckCircle, XCircle, RefreshCw, Database)
- **Animazioni**: `framer-motion` per transizioni card, fade-in al caricamento, pulse su status dot
- **Accessibilita**: status dot con `aria-label`, colori non usati come unico indicatore (aggiungere icona + testo)
- **Refresh**: auto-refresh ogni 60s con indicatore visivo, bottone refresh manuale
