# Runbook: Prioritizzazione Feature (RICE Framework)

## Obiettivo

Decidere quali feature sviluppare prima, usando dati oggettivi invece di intuizioni.

## Quando eseguire

- Prima di ogni trimestre (durante Quarterly Review)
- Quando arriva una nuova richiesta feature urgente
- Quando il team non riesce a decidere tra 2+ opzioni

## Il Framework RICE

```
RICE Score = (Reach × Impact × Confidence) / Effort
```

| Campo | Definizione | Valori |
|-------|-------------|--------|
| **Reach** | Utenti impattati per trimestre | Numero assoluto (es. 500) |
| **Impact** | Quanto impatta la North Star | 0.25 (minimo) / 0.5 / 1 / 2 / 3 (massivo) |
| **Confidence** | Certezza sui numeri | 0-100% (es. 80%) |
| **Effort** | Settimane/persona totali | Numero (es. 3) |

**Esempio:**
```
Dashboard reale:
  Reach = 200 utenti attivi
  Impact = 2 (engagement diretto)
  Confidence = 90%
  Effort = 2 settimane/persona

RICE = (200 × 2 × 0.9) / 2 = 180
```

## Procedura

### Fase 1: Raccogli candidati

1. Leggi la backlog corrente:
   ```bash
   npx tsx scripts/company-tasks.ts list --status open
   ```

2. Identifica feature potenziali da:
   - Task aperti in Architecture
   - Feature incomplete in `CLAUDE.md` sezione 16
   - Richieste utente o feedback
   - Gap dalla competitive analysis

### Fase 2: Calcola RICE per ogni candidato

3. Per ogni feature, stima i 4 parametri
4. Crea una tabella comparativa:

```markdown
| Feature | Reach | Impact | Conf | Effort | RICE |
|---------|-------|--------|------|--------|------|
| Dashboard reale | 200 | 2 | 90% | 2w | 180 |
| UI scoring multi | 150 | 1 | 80% | 1w | 120 |
| OCR immagini | 50 | 1 | 60% | 3w | 10 |
| Sistema referral | 300 | 3 | 50% | 4w | 113 |
```

### Fase 3: Aggiusta per fattori qualitativi

5. Considera **dipendenze tecniche** (es. "OCR richiede infra non presente")
6. Considera **rischi** (es. "Referral avvocati richiede GDPR review")
7. Considera **strategia** (es. "Corpus agent differenzia da competitor")

### Fase 4: Seleziona top 3

8. Prendi i top 3 per RICE score (aggiustato)
9. Verifica che almeno 1 sia un "quick win" (Effort ≤ 1 settimana)
10. Presenta al CME con motivazione

### Fase 5: Crea task

11. Per ogni feature selezionata:
    ```bash
    npx tsx scripts/company-tasks.ts create \
      --title "[Feature]: [nome]" \
      --dept architecture \
      --priority high \
      --by strategist \
      --desc "RICE: [score] | Reach: [n] | Impact: [n] | Effort: [n]w"
    ```

## Output atteso

```markdown
## Feature Prioritization — Q2 2026

### Selezionate per la roadmap
1. **Dashboard reale** (RICE: 180) — 2w — Task: ARCH-XXX
2. **UI scoring multidimensionale** (RICE: 120) — 1w — Task: ARCH-XXX
3. **Sistema referral avvocati** (RICE: 113) — 4w — Task: ARCH-XXX

### Backlog (prossimo trimestre)
- OCR immagini (RICE: 10) — dipendenza infra non pronta
- CI/CD GitHub Actions (RICE: 35) — bassa priorità utente

### Assunzioni chiave
- Utenti attivi stimati: ~200/mese (dato da Operations)
- Impact calibrato su conversion free→pro come North Star
```

## Errori comuni

| Errore | Soluzione |
|--------|-----------|
| Confidence sempre al 100% | Sii onesto: se non hai dati, metti 50% |
| Effort sottostimato | Moltiplica la stima iniziale per 1.5 (legge di Hofstadter) |
| Scegliere per passione, non RICE | Il punteggio vince, salvo motivi strategici espliciti |
| Troppi candidati | Pre-filtra: scarta feature con Effort > 6 settimane nel trimestre |
