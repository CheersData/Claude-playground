# Runbook: Approval Workflow

## Quando usare

Dopo che il Protocol Router ha classificato una richiesta e determinato il livello di approvazione.

## Workflow per livello

### L1 — Auto (CME approva)

```
Richiesta → CME valida → Task creato → Dipartimento esegue
Tempo: immediato
```

1. CME verifica che il task sia coerente
2. Crea task con `--by cme`
3. Esegue immediatamente

### L2 — CME Review

```
Richiesta → Consultazione dept → CME valida → Task creato → Esecuzione → QA review
Tempo: 1 turno
```

1. Protocol Router identifica dipartimenti da consultare
2. CME chiede parere ai dipartimenti (in parallelo se possibile)
3. CME raccoglie pareri
4. CME decide e crea task
5. Post-esecuzione: QA valida se necessario

### L3 — Boss Approval (Telegram)

```
Richiesta → Consultazione dept → Sintesi → Telegram al boss → Boss approva/modifica → Task creati
Tempo: max 24h
```

1. Protocol Router identifica dipartimenti da consultare
2. CME raccoglie pareri (parallelo)
3. CME produce sintesi con:
   - Cosa si propone
   - Pareri dei dipartimenti (pro/contro)
   - Recommendation CME
   - Effort stimato
4. Invia al boss via Telegram con bottoni: ✅ Approva | ✏️ Modifica | ❌ Annulla
5. Su approvazione: crea task e assegna
6. Su modifica: rigenera con feedback del boss
7. Su annulla: logga motivazione e chiudi

### L4 — Boss + Security

```
Come L3 + Security audit obbligatorio prima E dopo implementazione
Tempo: max 48h
```

1. Stessi step di L3
2. Security produce audit pre-implementazione
3. Boss approva con awareness del security audit
4. Post-implementazione: Security valida
5. Se Security trova problemi: STOP e notifica boss

## Template messaggio Telegram (L3/L4)

```
📋 APPROVAZIONE RICHIESTA — [Titolo]

Tipo: [strategico/critico]
Richiesta: [descrizione breve]

📊 Pareri dipartimenti:
• Architecture: [sintesi parere]
• Security: [sintesi parere]
• [altri]

💡 Recommendation CME: [cosa consiglio]
⏱ Effort stimato: [ore/giorni]

[✅ Approva] [✏️ Modifica] [❌ Annulla]
```

## Audit trail

Ogni approvazione deve loggare:
- Chi ha approvato
- Quando
- Quali pareri sono stati raccolti
- Decisione finale
- Task creati come risultato
