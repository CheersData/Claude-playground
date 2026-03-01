# Runbook: Generare Status Report

## Procedura

### 1. Task Board

```bash
npx tsx scripts/company-tasks.ts board
```

Contare task per stato: open, in_progress, review, done, blocked.

### 2. Costi

```
GET /api/company/costs?days=7
```

### 3. Pipeline Dati

```bash
npx tsx scripts/data-connector.ts status
```

### 4. QA

Ultimo task QA completato con `result_data`.

### 5. Report

Formato:
```
OPERATIONS STATUS REPORT — [data]

TASK BOARD: X open, Y in progress, Z done
COSTS (7d): $X.XX totale, $X.XX/query media
PIPELINE: X fonti attive, ultimo sync Y giorni fa
QA: X/Y test pass, testbook Z%
ALERTS: [eventuali anomalie]
```
