# Design: Daemon Idle Detection — Plenaria CME + Auto-Task Generation

**ADR**: 015
**Data**: 2026-03-08
**Owner**: Architecture
**Stato**: proposed

---

## Problema

Quando il daemon (`cme-autorun.ts`) esaurisce i task open, la Phase 2 attuale genera nuovi task tramite scansione codebase (tsc errors, build failures, tech debt da CLAUDE.md). Questo approccio:

1. **Disconnesso dai dipartimenti** — i task generati non riflettono gap reali, visioni, o priorità dei dept
2. **Report stale** — i `status.json` non vengono aggiornati dopo il completamento dei task, quindi la plenaria legge dati vecchi
3. **Nessuna plenaria automatica** — le plenarie sono manuali, convocate solo dal boss o da CME in chat

Il boss vuole: **board vuoto → CME convoca plenaria automatica → legge report aggiornati → genera task allineati alle visioni**.

---

## Design

### Flusso completo: Idle → Plenaria → Task

```
┌────────────────────────────────────┐
│  DAEMON (cme-autorun.ts)           │
│  Phase 1: esegue task open         │
│  ...                               │
│  Board vuoto o < IDLE_THRESHOLD    │
└──────────┬─────────────────────────┘
           │
           ▼
┌────────────────────────────────────┐
│  STEP 1: AUTO-UPDATE STATUS        │
│                                    │
│  Per ogni dipartimento:            │
│  - Leggi task completati (ultimi   │
│    7 giorni) da company_tasks      │
│  - Leggi task open/blocked         │
│  - Calcola health automatico:      │
│    - blocked > 0 → warning         │
│    - 0 task done in 7gg → warning  │
│    - critical gap aperto → critical│
│    - altrimenti → ok               │
│  - Aggiorna status.json con        │
│    summary e open_tasks reali      │
│  - Preserva campi custom/runtime   │
└──────────┬─────────────────────────┘
           │
           ▼
┌────────────────────────────────────┐
│  STEP 2: PLENARIA AUTOMATICA       │
│                                    │
│  Input:                            │
│  - Tutti i status.json aggiornati  │
│  - department.md (visione, priorità│
│    operative, gap, fase)           │
│  - company/vision.json             │
│  - Ultimi 3 daily plans            │
│  - CLAUDE.md §17 (feature          │
│    incomplete) + §19 (tech debt)   │
│                                    │
│  Output:                           │
│  - Verbale plenaria (.md)          │
│  - Lista task proposti con:        │
│    dept, titolo, priorità, desc    │
└──────────┬─────────────────────────┘
           │
           ▼
┌────────────────────────────────────┐
│  STEP 3: CREA TASK DAL VERBALE     │
│                                    │
│  Per ogni task proposto:           │
│  - company-tasks.ts create         │
│    con routing EXEMPT (auto-gen)   │
│  - Min 5, max 15 task              │
│  - Priorità: almeno 2 high        │
│  - Mix: code/test/refactor (70%)   │
│         + planning/doc (30%)       │
│  - Distribuiti su almeno 3 dept    │
└──────────┬─────────────────────────┘
           │
           ▼
┌────────────────────────────────────┐
│  STEP 4: ESEGUI IMMEDIATAMENTE     │
│                                    │
│  Il daemon NON aspetta il ciclo    │
│  successivo. Torna a Phase 1 e     │
│  esegue i task appena creati.      │
└────────────────────────────────────┘
```

---

## Componenti da modificare

### 1. Nuovo script: `scripts/auto-update-dept-status.ts`

Aggiorna automaticamente i `status.json` di tutti i dipartimenti basandosi sui dati reali del task board.

```typescript
// Pseudocodice
for (const dept of ALL_DEPARTMENTS) {
  const tasks = await queryTasks({ dept, last7days: true });
  const openTasks = await queryTasks({ dept, status: 'open' });
  const blockedTasks = await queryTasks({ dept, status: 'blocked' });

  const currentStatus = readStatusJson(dept);

  // Calcola health automatico
  let health = 'ok';
  if (blockedTasks.length > 0) health = 'warning';
  if (currentStatus.gaps?.some(g => g.severity === 'critical')) health = 'critical';
  if (tasks.done === 0 && openTasks.length === 0) health = 'warning'; // dept inattivo

  // Aggiorna preservando campi custom (runtime, phase, ecc.)
  const updated = {
    ...currentStatus,
    health,
    summary: generateSummary(tasks, openTasks, blockedTasks),
    open_tasks: openTasks.map(t => ({ id: t.id, title: t.title, priority: t.priority })),
    _meta: {
      ...currentStatus._meta,
      last_updated: new Date().toISOString(),
      updated_by: 'auto-update-dept-status',
    },
  };

  writeStatusJson(dept, updated);
}
```

**Trigger**: chiamato da `cme-autorun.ts` prima della plenaria.
**Idempotente**: può girare N volte senza effetti collaterali.

### 2. Nuovo script: `scripts/auto-plenary.ts`

Genera una plenaria automatica leggendo i dati aggiornati.

```typescript
// Input
const deptStatuses = readAllStatusJsons();      // status.json di tutti i dept
const deptVisions = readAllDepartmentMds();      // department.md → visione, priorità
const vision = readVisionJson();                 // company/vision.json
const techDebt = extractFromClaudeMd('§19');     // tech debt attivo
const incompleteFeatures = extractFromClaudeMd('§17'); // feature incomplete

// Analisi
const warnings = deptStatuses.filter(d => d.health !== 'ok');
const idleDepts = deptStatuses.filter(d => d.open_tasks.length === 0);
const unmetPriorities = findUnmetPriorities(deptVisions, recentTasks);

// Genera verbale
const minutes = generatePlenaryMinutes({
  deptStatuses,
  warnings,
  idleDepts,
  unmetPriorities,
  techDebt,
  incompleteFeatures,
});

// Salva verbale
const pianoNumber = getNextPianoNumber();
savePlenaryMinutes(minutes, pianoNumber);

// Output: lista task proposti
return minutes.proposedTasks;
```

**Non usa LLM**: la plenaria automatica è algoritmica (regole deterministiche). Non serve Claude per decidere che un dept con 0 task open e priorità P0 non coperta ha bisogno di task.

**Regole di generazione task**:

| Condizione | Task generato | Priorità |
|-----------|--------------|----------|
| Dept health=critical | Fix per il gap critico | critical |
| Dept health=warning + blocked tasks | Unblock task | high |
| Dept con P0 non coperto da task open | Task per P0 | high |
| Dept idle (0 open, 0 in_progress) | Task da visione/priorità | medium |
| Tech debt attivo (CLAUDE.md §19) | Fix tech debt | medium |
| Feature incompleta (CLAUDE.md §17) | Implementa feature | medium |
| Dept senza task da >7gg | Manutenzione/review | low |

### 3. Modifica: `scripts/cme-autorun.ts` — Phase 2 refactored

Sostituire la Phase 2 attuale (scansione codebase) con il flusso plenaria:

```typescript
// PHASE 2 — ATTUALE (da sostituire)
// tsc --noEmit, npm run build, leggi tech debt
// Genera task generici dal codebase

// PHASE 2 — NUOVO
// Step 1: Aggiorna status.json di tutti i dept
spawnSync('npx', ['tsx', 'scripts/auto-update-dept-status.ts'], ...);

// Step 2: Esegui plenaria automatica
const plenaryResult = spawnSync('npx', ['tsx', 'scripts/auto-plenary.ts'], ...);
// Output: JSON con lista task proposti

// Step 3: Crea task dal risultato plenaria
for (const task of proposedTasks) {
  spawnSync('npx', ['tsx', 'scripts/company-tasks.ts', 'create',
    '--title', task.title,
    '--dept', task.dept,
    '--priority', task.priority,
    '--by', 'cme-daemon',
    '--desc', task.desc,
    '--routing', 'EXEMPT',
  ], ...);
}

// Step 4: Torna a Phase 1 (esegui i nuovi task)
```

### 4. Hook post-completamento: auto-update singolo dept

Quando un task viene completato (`company-tasks.ts done`), aggiornare automaticamente il `status.json` del dipartimento coinvolto.

Aggiunta a `scripts/company-tasks.ts` nel comando `done`:

```typescript
// Dopo aver marcato il task come done:
// 1. Aggiorna summary del dept nel status.json
// 2. Rimuovi il task dalla lista open_tasks
// 3. Aggiorna last_updated
spawnSync('npx', ['tsx', 'scripts/auto-update-dept-status.ts', '--dept', task.department], ...);
```

---

## Idle Threshold

```typescript
const IDLE_THRESHOLD = 3; // task open fattibili (esclusi human_required)
```

Quando `openFeasibleTasks < IDLE_THRESHOLD` → trigger plenaria automatica.

Più basso del threshold attuale (5 in daily-standup.ts) perché la plenaria è un'operazione più pesante e deve attivarsi solo quando il board è davvero scarico.

---

## Vincoli

1. **No LLM nella plenaria automatica** — regole deterministiche, zero costi API
2. **Idempotenza** — auto-update e auto-plenary possono girare N volte senza side-effect
3. **Preserva dati custom** — auto-update NON sovrascrive campi `runtime`, `phase`, `backtest_history` e altri campi dept-specific
4. **Max 15 task per plenaria** — evita board flooding
5. **Min 3 dept coinvolti** — evita concentrazione su un solo dept
6. **70% task concreti** — code, fix, test, refactor. Max 30% planning/doc

---

## File coinvolti

| File | Azione |
|------|--------|
| `scripts/auto-update-dept-status.ts` | NUOVO — aggiorna status.json da dati reali |
| `scripts/auto-plenary.ts` | NUOVO — genera plenaria algoritmica + lista task |
| `scripts/cme-autorun.ts` | MODIFICA — Phase 2 refactored con plenaria |
| `scripts/company-tasks.ts` | MODIFICA — hook post-done per auto-update dept |
| `company/*/status.json` | AGGIORNATI automaticamente |
| `company/plenary-minutes/*.md` | GENERATI automaticamente |

---

## Sequenza temporale (come gira nel daemon)

```
T+0s    Daemon wake up
T+1s    Phase 1: leggi board, esegui task open
T+Ns    Tutti i task open eseguiti
T+N+1s  Conta task open rimanenti: < IDLE_THRESHOLD?
        ├─ No → Fine ciclo, aspetta prossimo intervallo
        └─ Si → Phase 2 (plenaria)
T+N+2s     Step 1: auto-update-dept-status.ts (aggiorna tutti i status.json)
T+N+5s     Step 2: auto-plenary.ts (genera verbale + lista task)
T+N+6s     Step 3: crea task dal verbale (company-tasks.ts create × N)
T+N+8s     Step 4: torna a Phase 1 (esegui i nuovi task)
T+M        Ciclo completo. Board pieno. Fine.
```

---

## Rischi e mitigazioni

| Rischio | Mitigazione |
|---------|-------------|
| Loop infinito (crea task → li completa → crea altri) | Max 1 plenaria per ciclo daemon. Flag `plenaryDone` nel ciclo |
| Task duplicati | auto-plenary.ts controlla se esiste già un task open con titolo simile per lo stesso dept |
| Status.json corrotto | auto-update preserva struttura originale, solo merge di campi specifici |
| Dept senza status.json | Skip, log warning, crea status.json minimale |
| Troppe plenarie | Max 1 al giorno in modalità automatica. Counter in daemon state |

---

## Metriche di successo

1. Il board non resta mai vuoto per più di 1 ciclo daemon (10-15 min)
2. I task generati dalla plenaria coprono almeno 3 dipartimenti diversi
3. I status.json riflettono lo stato reale (last_updated < 1 ora)
4. Zero intervento manuale necessario per generare nuovi task
