# Runbook: Mapping Troubleshooting

## Scopo

Guida per diagnosticare e risolvere problemi di mapping dei campi nell'Ufficio Integrazione. I 4 livelli di mapping (regole, Levenshtein, LLM, learning) hanno ciascuno i propri failure mode.

## Prerequisiti

- Accesso ai log di sync (`integration_events` in Supabase)
- Accesso alle regole di mapping (`lib/staff/data-connector/mapping/rules/`)
- Conoscenza del formato dati del vendor in questione

## Triage rapido

```
Documento mal-mappato
    |
[1] Quale livello ha mappato il campo?
    -> Controlla mapping_levels_used nel log
    |
    ├── L1 (regole) → Vai a "Problemi L1"
    ├── L2 (Levenshtein) → Vai a "Problemi L2"
    ├── L3 (LLM) → Vai a "Problemi L3"
    ├── L4 (learning) → Vai a "Problemi L4"
    └── Nessuno (campo non mappato) → Vai a "Campo non mappato"
```

## Problemi L1 — Regole Deterministiche

### Sintomo: campo mappato al target sbagliato

**Causa piu comune**: regola errata nel file JSON.

**Diagnosi**:
```bash
# Verifica la regola per il campo problematico
cat lib/staff/data-connector/mapping/rules/<vendor>.json | grep "<campo>"
```

**Soluzione**:
1. Correggere la regola nel file JSON
2. Testare con il documento problematico
3. Verificare che la correzione non rompa altri mapping

### Sintomo: campo noto ma non mappato

**Causa piu comune**: campo mancante nel file regole (il vendor ha aggiunto un campo nuovo).

**Diagnosi**:
1. Confrontare campi nel record grezzo con le regole L1
2. Identificare campi presenti nel record ma assenti nelle regole

**Soluzione**:
1. Aggiungere la regola mancante al file JSON
2. Se il campo e specifico di pochi documenti: considerare se vale la pena aggiungerlo o lasciarlo a L2

### Sintomo: campo mappato due volte (duplicato)

**Causa**: due campi sorgente mappano allo stesso target.

**Soluzione**:
1. Decidere quale campo sorgente ha la precedenza (di solito il piu specifico)
2. Aggiungere logica di priorita nel file regole, oppure rinominare uno dei target

## Problemi L2 — Fuzzy Matching (Levenshtein)

### Sintomo: matching errato (falso positivo)

**Causa**: nome campo sorgente troppo simile a un target sbagliato.

**Esempio**: `"data_creazione"` matchato a `"data_documento"` quando il target corretto era `"data_creazione_record"`.

**Diagnosi**:
```
Campo: data_creazione
Match L2: data_documento (distanza: 0.27)
Target corretto: data_creazione_record
```

**Soluzioni** (in ordine di preferenza):
1. **Aggiungere regola L1**: se il mapping e prevedibile, aggiungi una regola esplicita
2. **Abbassare soglia L2**: se il problema e diffuso, ridurre `levenshtein_threshold` (default 0.3 → 0.2)
3. **Blacklist match**: aggiungere eccezione nel file regole: `"data_creazione": "!data_documento"` (non mappare a questo target)

### Sintomo: nessun match L2 per campo che dovrebbe matchare

**Causa**: soglia troppo bassa o nomi troppo diversi.

**Diagnosi**:
```bash
# Calcola distanza manualmente
npx tsx -e "
const a = 'campo_sorgente';
const b = 'campo_target';
// Levenshtein distance / max(len(a), len(b))
console.log('Normalized distance:', levenshtein(a, b) / Math.max(a.length, b.length));
"
```

**Soluzione**:
- Se distanza > soglia ma < 0.5: alzare la soglia (ma attenzione ai falsi positivi)
- Se distanza > 0.5: il campo e troppo diverso per L2, serve regola L1 o L3

## Problemi L3 — LLM Classification

### Sintomo: LLM mappa campo al target sbagliato

**Causa piu comuni**:
- Campo ambiguo senza contesto sufficiente
- LLM del tier Intern non abbastanza capace
- Prompt inadeguato

**Diagnosi**:
1. Controllare il prompt inviato al LLM
2. Controllare il sample value usato per il contesto
3. Controllare la confidence del mapping

**Soluzioni**:
1. **Arricchire contesto**: fornire piu sample values al prompt (non solo 1, ma 3-5)
2. **Aggiungere istruzione specifica**: "Il campo '{fieldName}' in {vendor} si riferisce a {spiegazione}"
3. **Alzare confidence threshold**: se il LLM e incerto (< 0.7), forzare la richiesta di conferma utente
4. **Promuovere a L1**: se il mapping e noto e ricorrente, aggiungerlo direttamente alle regole

### Sintomo: LLM non disponibile (fallback chain esaurita)

**Causa**: tutti i provider del tier Intern sono down o rate-limited.

**Diagnosi**:
```
[MAPPING] L3 LLM fallback chain exhausted: groq(429) → cerebras(timeout) → mistral(429)
```

**Soluzione**:
1. **Non bloccare**: il mapping deve continuare con solo L1 + L2
2. I campi non mappati vengono marcati come `unknown`
3. Al prossimo sync, il LLM sara probabilmente disponibile
4. Se il problema persiste (> 1 ora): verificare stato provider su status page

### Sintomo: costi LLM mapping troppo alti

**Causa**: troppi campi arrivano a L3 (regole L1 insufficienti).

**Diagnosi**:
```sql
-- Conta quanti mapping usano L3 per vendor
SELECT provider, COUNT(*) as l3_count
FROM integration_events
WHERE event_type = 'mapping' AND mapping_levels_used @> '["L3"]'
AND created_at > now() - interval '7 days'
GROUP BY provider;
```

**Soluzione**:
1. Analizzare i campi che arrivano a L3
2. Per quelli ricorrenti: aggiungere regola L1 (costo zero)
3. Obiettivo: < 5% dei campi deve arrivare a L3

## Problemi L4 — Learning

### Sintomo: correzione utente non applicata

**Causa**: non ancora raggiunte 3 correzioni identiche (soglia di promozione).

**Diagnosi**:
```sql
SELECT field_name, correction_target, count
FROM mapping_corrections
WHERE vendor = '<vendor>' AND field_name = '<campo>';
```

**Soluzione**:
- Se correzione e ovviamente giusta: promuoverla manualmente a regola L1 senza aspettare 3 occorrenze
- Se correzione e ambigua: attendere altre occorrenze per confermare

### Sintomo: regola L4 promossa ma sbagliata

**Causa**: 3 utenti hanno fatto la stessa correzione, ma era sbagliata (bias collettivo).

**Soluzione**:
1. Rimuovere la regola promossa dal file JSON L1
2. Resettare il contatore correzioni per quel campo
3. Se il campo e ambiguo: aggiungere opzione di mapping nella UI per guidare l'utente

## Campo Non Mappato (nessun livello)

### Diagnosi

Il campo non e stato mappato da nessun livello. Possibili cause:
- Campo nuovo aggiunto dal vendor
- Campo raro non presente nei dati di test iniziali
- Campo con nome completamente diverso dai target

### Procedura

1. **Identificare il campo**: nome, tipo, valore di esempio
2. **Determinare se e rilevante** per l'analisi legale:
   - Se si: aggiungere regola L1 (mapping diretto)
   - Se no: aggiungere a lista ignorati (`"_ignored": ["campo_irrilevante"]` nelle regole)
3. **Aggiornare mapping** e ri-processare i documenti affected

## Monitoring e Prevenzione

### Alert automatici

| Condizione | Soglia | Azione |
|-----------|--------|--------|
| Mapping accuracy < 95% (rolling 24h) | Critico | Alert Lead + review urgente |
| Campi `unknown` > 10% in un sync | Warning | Review regole per il vendor |
| L3 usage > 20% dei campi | Warning | Aggiungere regole L1 per campi ricorrenti |
| Learning corrections spike (> 10/giorno) | Info | Verificare se schema vendor e cambiato |

### Review periodica

- **Settimanale**: controllare distribuzione mapping per livello (obiettivo: L1 > 80%, L2 ~10%, L3 < 5%, unknown < 5%)
- **Mensile**: confrontare schema vendor attuale con schema al momento del setup. Cercare campi aggiunti/rimossi/rinominati
- **Per vendor update**: quando il vendor annuncia cambiamenti API, review proattiva delle regole di mapping

## Comandi utili

```bash
# Statistiche mapping per vendor (ultimo 7 giorni)
npx tsx scripts/integration-sources.ts mapping-stats --vendor hubspot --days 7

# Test mapping su singolo documento
npx tsx scripts/integration-sources.ts test-mapping --vendor hubspot --doc-id <id>

# Esporta regole L1 correnti
cat lib/staff/data-connector/mapping/rules/hubspot.json

# Verifica coverage regole L1 vs campi reali
npx tsx scripts/integration-sources.ts mapping-coverage --vendor hubspot
```
