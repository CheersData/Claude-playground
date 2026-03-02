# Runbook: Route Request

## Quando usare

Quando CME riceve una richiesta (dal boss, dallo scheduler, o da un dipartimento) e deve determinare il percorso decisionale.

## Procedura

### 1. Identifica il tipo di richiesta

Leggi la richiesta e cerca keyword per match con i decision trees:

| Decision Tree | Keywords |
|--------------|----------|
| `feature-request.yaml` | nuova feature, miglioramento, aggiunta, modifica codice |
| `trading-operations.yaml` | trading, ordini, strategia trading, backtest, go-live, risk |
| `data-operations.yaml` | dati, corpus, sync, ingest, nuova fonte, embeddings |
| `infrastructure.yaml` | deploy, server, VM, security, CI/CD, env vars |
| `company-operations.yaml` | nuovo dipartimento, nuovo agente, processi, riorganizzazione, vision, prompt |

### 2. Applica il decision tree

1. Apri il file YAML corrispondente in `decision-trees/`
2. Valuta le condizioni di ogni routing option
3. Seleziona il match più specifico
4. Annota: tipo, livello approvazione, dipartimenti da consultare

### 3. Se nessun tree corrisponde

1. Classifica come `L2 — CME`
2. Consulta Architecture per determinare il routing
3. Proponi un nuovo decision tree a CME per coprire il caso

### 4. Esecuzione del routing

```
1. Crea task nel task system con routing info
2. Se consultazione necessaria: crea task paralleli ai dipartimenti
3. Se approvazione boss necessaria: invia via Telegram
4. Traccia tutto nel task system
```

## Output atteso

Il routing produce un oggetto con:
- `request_type`: operativo / strategico / critico
- `departments_to_consult`: lista dipartimenti
- `approval_level`: L1 / L2 / L3 / L4
- `decision_tree_used`: nome del file YAML
- `rationale`: motivazione del routing

## Errori comuni

- **Routing troppo ampio**: consultare tutti i dipartimenti rallenta tutto. Scegli solo quelli necessari.
- **Livello troppo basso**: se dubiti tra L2 e L3, scegli L3 (meglio sicuri).
- **Nessun tree match**: non improvvisare, escala a CME.
