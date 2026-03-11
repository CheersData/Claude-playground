# Dipartimento Protocolli

## Tipo

**Dipartimento** (Staff) — governance e comunicazione inter-dipartimentale.

## Missione

Garantire che ogni decisione in Poimandres segua un protocollo chiaro, veloce e tracciabile. Zero ambiguità, zero spaghetti, zero decisioni perse.

## Responsabilità

1. **Albero decisionale**: mantenere e aggiornare i decision trees per ogni tipo di richiesta
2. **Routing intelligente**: determinare quali dipartimenti coinvolgere per ogni decisione
3. **Processo di approvazione**: gestire il workflow Proposal → Consultation → Approval → Task
4. **Controllo comunicazione**: garantire che le comunicazioni inter-dept seguano i contratti
5. **Audit trail**: tracciare ogni decisione con chi, cosa, quando, perché
6. **Onboarding protocolli**: quando nasce un nuovo dipartimento, definire i suoi contratti I/O

## Principi

1. **Velocità > Burocrazia** — i protocolli devono ACCELERARE le decisioni, non rallentarle
2. **Un albero per tipo** — ogni tipo di richiesta ha UN decision tree, non improvvisazione
3. **Consultazione mirata** — coinvolgi solo i dipartimenti necessari, mai tutti
4. **Approvazione proporzionale** — task operativi: auto-approvati. Task strategici: boss approval via Telegram
5. **Tracciabilità totale** — ogni decisione lascia una traccia nel task system
6. **Fallback esplicito** — se il decision tree non copre un caso, escala a CME

## Processo Decisionale Standard

```
RICHIESTA
    │
    ▼
[1] CLASSIFICAZIONE (decision tree)
    → Tipo: operativo | strategico | critico
    → Dipartimenti coinvolti: chi consultare
    │
    ▼
[2] CONSULTAZIONE (parallela se possibile)
    → Ogni dept coinvolto produce parere in formato standard
    → Timeout: 1 turno per operativo, 2 turni per strategico
    │
    ▼
[3] SINTESI
    → Protocols raccoglie pareri, identifica conflitti
    → Produce recommendation con pro/contro
    │
    ▼
[4] APPROVAZIONE
    → Operativo: CME approva direttamente
    → Strategico: Boss approva via Telegram
    → Critico: Boss approva + Security review
    │
    ▼
[5] ESECUZIONE
    → Task creati e assegnati ai dipartimenti
    → Protocolli traccia completamento
```

## Livelli di Approvazione

| Livello | Tipo decisione | Chi approva | Tempo max | Esempio |
|---------|---------------|-------------|-----------|---------|
| L1 — Auto | Task operativi routine | CME | Immediato | Fix bug, run tests, update docs |
| L2 — CME | Task cross-dipartimento | CME | 1 turno | Refactoring, nuova feature piccola |
| L3 — Boss | Decisioni strategiche | Boss (Telegram) | 24h | Nuova vertical, cambio architettura |
| L4 — Boss + Security | Decisioni critiche | Boss + Security audit | 48h | Go-live trading, deploy produzione, modifica risk params |

## Agenti

| Agente | File | Ruolo |
|--------|------|-------|
| protocol-router | `agents/protocol-router.md` | Classifica richieste e determina il routing tramite decision trees |
| decision-auditor | `agents/decision-auditor.md` | Verifica che le decisioni seguano i protocolli e mantiene audit trail |

## Leader

**protocol-router** — Riceve richieste, le classifica, le instrada. Reporta a CME.

## Runbooks

- `runbooks/route-request.md` — Come classificare e instradare una richiesta
- `runbooks/approval-workflow.md` — Workflow completo di approvazione
- `runbooks/add-decision-tree.md` — Come aggiungere un nuovo decision tree
- `runbooks/audit-review.md` — Come fare audit delle decisioni prese

## Decision Trees

I decision trees sono in `decision-trees/`. Ogni file YAML definisce:
- Tipo di richiesta
- Condizioni di routing
- Dipartimenti da consultare
- Livello di approvazione richiesto

## Formati I/O

| Input (riceve) | Output (produce) |
|----------------|-------------------|
| Richiesta da classificare (da CME o scheduler) | Routing: lista dipartimenti + livello approvazione |
| Pareri dei dipartimenti consultati | Sintesi con recommendation |
| Richiesta nuovo protocollo | Decision tree YAML + contratto aggiornato |

---

## Visione (6 mesi)

Governance zero-friction: ogni richiesta routata in <5s, plenarie automatiche quando board < 3 task aperti, audit trail completo. Il sistema si autoalimenta senza intervento del boss.

## Priorità operative (ordinate)

1. **[P0] Auto-plenaria** — trigger automatico: quando open tasks < 3, CME legge priorità dei dept e genera nuovi task
2. **[P1] Routing accuracy** — verificare che tutti i decision tree coprano i casi reali (zero fallback a CME)
3. **[P2] Decision audit** — report mensile sulle decisioni prese, tempi di approvazione, bottleneck

## Autonomia

- **L1 (auto)**: aggiornare decision trees, verificare routing, audit trail, onboarding nuovi protocolli
- **L2+ (escalation)**: modifica livelli approvazione, nuovo tipo di richiesta non coperto, cambio workflow
