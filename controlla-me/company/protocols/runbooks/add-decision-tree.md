# Runbook: Add Decision Tree

## Quando usare

Quando emerge un tipo di richiesta non coperto dai decision trees esistenti.

## Procedura

### 1. Identifica il gap

- Una richiesta è arrivata e nessun tree corrisponde
- Il decision-auditor ha trovato casi ricorrenti non coperti
- Un nuovo dipartimento o ufficio è stato creato

### 2. Crea il file YAML

Percorso: `company/protocols/decision-trees/<nome>.yaml`

Template:

```yaml
# Decision Tree: [Nome]
# [Quando si applica]

name: <nome-kebab-case>
description: [Descrizione breve]
trigger: "[Keywords che attivano questo tree]"

routing:
  <scenario_1>:
    condition: "[Quando si applica questo scenario]"
    type: operativo | strategico | critico
    approval: L1 | L2 | L3 | L4
    consult: [lista dipartimenti]
    execute: [chi implementa]
    review: [chi valida dopo]
    example: "[Esempio concreto]"
    requirement: "[Prerequisiti opzionali]"
```

### 3. Valida

- Consultare Architecture per coerenza con l'architettura
- Verificare che i dipartimenti referenziati esistano
- Verificare che non ci siano sovrapposizioni con tree esistenti

### 4. Aggiungi al routing

Aggiornare `runbooks/route-request.md` con il nuovo tree nella tabella keywords.

### 5. Notifica

Informare CME e i dipartimenti coinvolti del nuovo tree.

## Regole

- Ogni tree DEVE avere almeno 2 scenari (altrimenti è troppo specifico)
- Ogni scenario DEVE avere un `example` concreto
- I trigger keywords NON devono sovrapporsi con altri tree
- Approval level deve essere proporzionale all'impatto
