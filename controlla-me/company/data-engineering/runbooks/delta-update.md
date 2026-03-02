# Runbook: Aggiornamento Incrementale (Delta Update)

## Quando eseguire

- Ogni 7 giorni (o su richiesta CME)
- Dopo notifica di modifica legislativa

## Procedura

### 1. Verificare stato attuale

```bash
npx tsx scripts/data-connector.ts status
```

Identificare fonti con ultimo sync > 7 giorni.

### 2. Eseguire update per ogni fonte

```bash
npx tsx scripts/data-connector.ts update <source-id>
```

Questo esegue CONNECT → MODEL → LOAD in sequenza.

### 3. Verificare risultati

Controllare il sync log per errori:
- `items_inserted`: nuovi articoli
- `items_updated`: articoli modificati
- `items_skipped`: articoli invariati
- `errors`: errori di parsing/caricamento

### 4. Report

Creare task completato con summary:
```
Delta update completato: X fonti aggiornate, Y nuovi articoli, Z errori
```
