# Runbook: Esecuzione Suite Completa

## Obiettivo

Eseguire tutti i test e produrre un report strutturato come task completato.

## Procedura

### 1. Test unitari

```bash
npm test
```

Parsare output: quanti test pass, quanti fail, quali falliscono.

### 2. Type check

```bash
npx tsc --noEmit
```

Parsare output: zero errori = pass, altrimenti elenco errori.

### 3. Lint

```bash
npm run lint
```

Parsare output: zero errori = pass, altrimenti elenco errori.

### 4. Testbook (opzionale)

```bash
npx tsx scripts/testbook.ts
```

Se disponibile, eseguire validazione output agenti su casi di riferimento.

### 5. Report

Creare task completato con `result_data`:

```json
{
  "unitTests": { "pass": 67, "fail": 2, "total": 69, "failures": ["test1", "test2"] },
  "typeCheck": { "pass": true, "errors": 0 },
  "lint": { "pass": true, "errors": 0 },
  "testbook": { "accuracy": 0.78, "cases": 50, "passed": 39 },
  "overall": "warning"
}
```

`overall`: "pass" (tutto verde), "warning" (testbook < 75%), "fail" (test/types/lint falliti)
