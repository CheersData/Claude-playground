# Runbook: Fix Test Fallito

## Procedura

### 1. Identificare il test

Leggere il task con il bug report. Identificare:
- Quale test fallisce
- Il messaggio di errore
- Da quando fallisce (ultimo commit verde)

### 2. Riprodurre

```bash
npm test -- --filter "nome-test"
```

### 3. Diagnosticare

- Se errore di tipo → fix in codice sorgente
- Se errore di logica → fix nel test o nel codice
- Se errore di ambiente → fix nella configurazione

### 4. Fixare

Applicare la correzione minima necessaria.

### 5. Verificare

```bash
npm test
```

Tutti i test devono passare.

### 6. Report

Aggiornare il task con summary della fix.
