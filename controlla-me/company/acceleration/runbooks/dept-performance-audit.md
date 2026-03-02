# Runbook: Department Performance Audit

**Owner**: Acceleration / accelerator
**Trigger**: audit mensile o richiesta esplicita da CME
**Output**: report con metriche dipartimentali + lista interventi prioritizzati

---

## Obiettivo

Misurare l'efficienza operativa di ogni dipartimento della virtual company per identificare colli di bottiglia, task che si bloccano, runbook obsoleti e aree dove l'automazione farebbe risparmiare tempo.

---

## Step 1 — Raccolta dati

### 1a. Stato task board globale

```bash
npx tsx scripts/company-tasks.ts board
```

Annotare:
- Numero task per stato (open, in_progress, blocked, done)
- Task in stato `blocked` con data creazione (calcolare giorni bloccati)
- Task in stato `in_progress` da più di 48h

### 1b. Task per dipartimento

```bash
# Per ogni dipartimento rilevante:
npx tsx scripts/company-tasks.ts list --dept architecture --status open
npx tsx scripts/company-tasks.ts list --dept qa --status open
npx tsx scripts/company-tasks.ts list --dept data-engineering --status open
npx tsx scripts/company-tasks.ts list --dept security --status open
npx tsx scripts/company-tasks.ts list --dept operations --status open
npx tsx scripts/company-tasks.ts list --dept finance --status open
npx tsx scripts/company-tasks.ts list --dept strategy --status open
npx tsx scripts/company-tasks.ts list --dept acceleration --status open
```

Per ogni dipartimento raccogliere:
- Backlog size (task open + in_progress)
- Blocked count
- Task aperti da più di 7 giorni

### 1c. Cycle time (stima da task completati)

Dai task in stato `done` con data di completamento, stimare:
- Cycle time medio per priorità (low, medium, high, critical)
- Task riaperiti (re-open rate)

### 1d. Runbook obsoleti

Per ogni dipartimento, leggere il `department.md` e verificare:
- I comandi nei runbook esistono ancora? (script rinominati, dipendenze cambiate)
- I file referenziati nei runbook esistono ancora?
- Le soglie/KPI sono aggiornate?

```bash
# Esempio: verifica che i comandi nei runbook puntino a file esistenti
ls scripts/
ls company/<dept>/runbooks/
```

---

## Step 2 — Calcolo metriche

### Metriche primarie

| Metrica | Formula | Soglia OK | Soglia Alert |
|---------|---------|-----------|--------------|
| Cycle time medio (medium/high) | media(data_done - data_creazione) per task medium e high | < 48h | > 48h |
| Blocked rate | blocked / (open + in_progress + blocked) | < 10% | > 10% |
| Stale task rate | task open da > 7 giorni / totale open | < 20% | > 20% |
| Backlog crescita | backlog questa settimana - backlog settimana scorsa | 0 o negativo | > +5 task/settimana |

### Metriche secondarie

- Task senza `--desc`: indica task creati in fretta senza contesto — difficili da eseguire
- Task `in_progress` senza aggiornamenti da > 24h: potenziale blocco silenzioso
- Dipartimenti senza task completati nell'ultimo mese: attività ferma

---

## Step 3 — Identificazione colli di bottiglia

### Pattern da cercare

1. **Dipartimento con blocked rate > 10%**: identificare il blocco comune (attesa decision, dipendenza esterna, risorse)
2. **Task high priority bloccati > 24h**: escalation a CME immediata
3. **Runbook non aggiornati**: se un runbook fa riferimento a file/comandi non esistenti, è un costo nascosto per chi lo segue
4. **Task ripetitivi identici**: stesso tipo di task creato più volte in settimane diverse = candidato automazione

### Domande da porsi per ogni collo di bottiglia

- È un problema di processo (runbook mancante, decisione non chiara)?
- È un problema di risorse (troppi task per un agente)?
- È un problema di dipendenza (attesa su altro dipartimento)?
- È automatizzabile con uno script?

---

## Step 4 — Prioritizzazione interventi

Usa la matrice impatto/effort:

| | Effort basso | Effort alto |
|--|-------------|-------------|
| **Impatto alto** | Fare subito (P1) | Pianificare (P2) |
| **Impatto basso** | Fare se c'è tempo (P3) | Non fare (P4) |

Per ogni intervento identificato, creare un task nel board:

```bash
npx tsx scripts/company-tasks.ts create \
  --title "Acceleration: <intervento>" \
  --dept acceleration \
  --priority <priority> \
  --by accelerator \
  --desc "<baseline misurata> → <risultato atteso> — <motivo priorità>"
```

---

## Step 5 — Report

Produrre report in `company/reports/acceleration-audit-YYYY-MM-DD.md`:

```markdown
# Department Performance Audit — YYYY-MM-DD

## Sommario esecutivo
<3-5 righe: stato generale, finding principali, azioni raccomandate>

## Metriche per dipartimento

| Dipartimento | Backlog | Blocked | Cycle time medio | Stale (>7gg) | Stato |
|-------------|---------|---------|-----------------|--------------|-------|
| Architecture | N | N | Nh | N | OK/Alert |
| QA | N | N | Nh | N | OK/Alert |
| ... | | | | | |

## Colli di bottiglia identificati

### [DEPT] — <descrizione problema>
- Baseline: <metrica>
- Causa probabile: <analisi>
- Intervento proposto: <azione>
- Effort stimato: basso/medio/alto

## Runbook obsoleti

| File | Problema | Azione |
|------|----------|--------|
| `company/<dept>/runbooks/<file>.md` | Comando X non esiste più | Aggiornare runbook |

## Task creati

| ID | Dipartimento | Titolo | Priorità |
|----|-------------|--------|----------|
| ... | ... | ... | ... |

## Metriche globali

- Task totali open: N
- Blocked rate globale: N%
- Cycle time medio (medium/high): Nh
- Dipartimenti in alert: N/N totali
```

---

## Frequenza raccomandata

| Tipo | Frequenza | Trigger |
|------|-----------|---------|
| Quick check (solo board + metriche) | Settimanale | Automatico |
| Full audit (runbook + colli di bottiglia) | Mensile | Fine mese o richiesta CME |
| Emergency audit | On-demand | Blocked rate > 25% o task critical bloccato > 24h |
