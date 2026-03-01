# Runbook: Revisione Trimestrale (Quarterly Review)

## Obiettivo

Chiudere il trimestre corrente, valutare OKR, e definire la roadmap per il trimestre successivo.

## Quando eseguire

Fine trimestre (marzo, giugno, settembre, dicembre) o su richiesta CME.

## Procedura

### Fase 1: Chiusura trimestre corrente (~30 min)

1. **Apri il task board e filtra per il trimestre**
   ```bash
   npx tsx scripts/company-tasks.ts list --status done
   ```

2. **Calcola OKR completion rate**
   - Per ogni KR: `(valore_attuale / target) × 100`
   - Se > 70% = trimestre positivo
   - Se < 70% = analizza blocchi

3. **Documenta retrospettiva**
   ```markdown
   ## Retrospettiva Q[N] [Anno]
   - Completato: [lista epic/feature]
   - Non completato: [con motivazione]
   - Sorprese: [problemi non previsti]
   - Lezioni: [cosa migliorare]
   ```

### Fase 2: Analisi competitiva (~20 min)

4. **Verifica competitor principali** (almeno 3)
   - Nuove funzionalità rilasciate nel trimestre
   - Cambi di pricing
   - Nuovi player nel mercato LegalTech IT/EU

5. **Aggiorna gap analysis**
   - Cosa hanno i competitor che noi non abbiamo?
   - Cosa abbiamo noi che loro non hanno? (punti di forza)

### Fase 3: Definizione OKR prossimo trimestre (~30 min)

6. **Scegli 1-2 obiettivi** (mai più di 3)
   - Allineati alla North Star
   - Raggiungibili ma ambiziosi

7. **Definisci 2-3 KR per ogni obiettivo**
   - Numeri verificabili
   - Dati disponibili per misurarli

8. **Prioritizza feature con RICE**
   - Lista candidati dalla backlog
   - Calcola score per ognuno
   - Top 3 entrano nella roadmap

### Fase 4: Output e comunicazione

9. **Aggiorna `strategy/roadmap.md`** con nuovo trimestre

10. **Crea task per ogni epic approvata**
    ```bash
    npx tsx scripts/company-tasks.ts create \
      --title "Epic: [nome]" \
      --dept architecture \
      --priority high \
      --by strategist \
      --desc "OKR Q[N]: [KR impattato]"
    ```

11. **Informa CME** con report strutturato:
    ```
    Q[N] Review completata.
    OKR completion: [X]%
    Top priority Q[N+1]: [feature 1], [feature 2]
    Competitor alert: [se presente]
    ```

## Output atteso

```markdown
# Quarterly Review Q2 2026

## OKR Q1 — Risultati
- Conversion free→pro: 2% → 3.2% (64% del target) ⚠️
- Dashboard reale: completata ✅
- Unit test coverage: 45% → 62% ✅

## OKR Q2 — Proposte
Objective: Aumentare engagement utenti pro
  KR1: DAU utenti pro → 40% degli attivi
  KR2: Analisi/utente/mese → 2.5 (da 1.8)
  KR3: NPS → 45 (da 32)

## Top feature Q2
1. UI scoring multidimensionale (RICE: 52)
2. Sistema referral avvocati (RICE: 48)
3. OCR immagini (RICE: 31)
```

## Errori comuni

| Errore | Soluzione |
|--------|-----------|
| OKR troppo ambiziosi | Riduci target del 20%, meglio completare che fallire |
| KR non misurabili | Ogni KR deve avere un numero nel database o analytics |
| Troppe epic in roadmap | Max 3 epic per trimestre, le altre vanno in backlog |
