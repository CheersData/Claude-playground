# Mapping Engine

## Ruolo

AI mapping ibrido (regole + Levenshtein + LLM) per normalizzazione campi. Trasforma i dati eterogenei delle piattaforme esterne in un formato unificato analizzabile dalla pipeline legale.

## Quando gira

- **Setup**: quando un nuovo connettore viene configurato (mapping iniziale dei campi)
- **Sync**: ad ogni documento sincronizzato (applicazione mapping)
- **Learning**: quando l'utente corregge un mapping errato (aggiornamento regole)

## Input

- Record grezzo dalla piattaforma esterna (JSON con campi vendor-specific)
- Schema target (`business-documents` format)
- Regole di mapping esistenti per il vendor
- Storico correzioni utente (per learning)

## Logica

### Pipeline di mapping a 4 livelli

```
Record grezzo
    |
[L1] REGOLE DETERMINISTICHE
    -> Mapping diretto per campi noti (es. "invoice_number" → "numero_fattura")
    -> Tabella di mapping per-vendor in lib/staff/data-connector/mapping/
    -> Se match esatto: applica e prosegui
    |
[L2] FUZZY MATCHING (Levenshtein)
    -> Per campi non mappati al L1
    -> Calcola distanza Levenshtein tra nome campo e nomi target
    -> Se distanza < soglia (0.3): proponi mapping con confidence
    -> Se confidence > 0.8: applica automaticamente
    -> Se 0.5 < confidence < 0.8: chiedi conferma utente
    |
[L3] LLM CLASSIFICATION
    -> Per campi non mappati ai livelli precedenti
    -> Prompt al LLM (tier Intern per costi minimi):
       "Dato il campo '{fieldName}' con valore esempio '{sampleValue}',
        quale campo target corrisponde? Opzioni: [lista campi target]"
    -> Output: mapping suggerito + confidence
    -> Se confidence > 0.7: applica automaticamente
    -> Altrimenti: chiedi conferma utente
    |
[L4] LEARNING
    -> Correzioni utente salvate come nuove regole L1
    -> Al raggiungimento di 3 correzioni identiche: promossa a regola permanente
    -> Feedback loop: ogni correzione migliora i livelli precedenti
```

### Formato output normalizzato

```json
{
  "source": "hubspot",
  "source_id": "deal-12345",
  "document_type": "contratto_commerciale",
  "title": "Contratto fornitura ABC Srl",
  "text": "... testo estratto del documento ...",
  "metadata": {
    "counterparty": "ABC Srl",
    "date": "2026-03-10",
    "value": 15000.00,
    "currency": "EUR",
    "status": "active"
  },
  "mapping_confidence": 0.94,
  "mapping_levels_used": ["L1", "L2"]
}
```

### Gestione errori

| Errore | Azione |
|--------|--------|
| Campo obbligatorio non mappato | Marca documento come `needs_review`, notifica utente |
| Confidence mapping < 0.5 su tutti i livelli | Skip campo, log warning, chiedi input manuale |
| LLM non disponibile (tutti i fallback falliti) | Usa solo L1 + L2, marca campi non mappati come `unknown` |
| Schema vendor cambiato (campi nuovi) | Log nuovi campi, alert Lead, proponi mapping con L2+L3 |
| Valore campo in formato inatteso | Tenta parsing con heuristic (date, numeri), altrimenti raw string |

## Metriche

| Metrica | Target |
|---------|--------|
| Accuracy mapping L1 (regole) | 100% (deterministico) |
| Accuracy mapping L2 (Levenshtein) | > 90% |
| Accuracy mapping L3 (LLM) | > 85% |
| Accuracy complessiva | > 95% |
| Campi che richiedono input manuale | < 5% |
| Tempo mapping per documento | < 2s (L1+L2), < 5s (con L3) |

## Parametri configurabili

| Parametro | Default | Note |
|-----------|---------|------|
| levenshtein_threshold | 0.3 | Max distanza normalizzata per match L2 |
| auto_apply_confidence | 0.8 | Soglia confidence per mapping automatico (L2, L3) |
| review_confidence | 0.5 | Sotto questa soglia: chiedi conferma utente |
| learning_promotion_count | 3 | Correzioni identiche per promuovere a regola L1 |
| llm_tier | "intern" | Tier AI per mapping LLM (costi minimi) |

## File chiave

```
lib/staff/data-connector/mapping/
├── rules/                     # Regole L1 per-vendor (JSON)
│   ├── fatture-in-cloud.json  # Mapping campi Fatture in Cloud
│   ├── google-drive.json      # Mapping metadata Google Drive
│   └── hubspot.json           # Mapping campi HubSpot deal/contact
├── engine.ts                  # Orchestratore 4 livelli
├── levenshtein.ts             # Fuzzy matching L2
├── llm-mapper.ts              # LLM classification L3
└── learning-store.ts          # Persistenza correzioni utente L4
```

## Tabelle DB

Legge da `integration_connections` (per sapere quale vendor).
Scrive in `integration_events` (log mapping applicato).
Legge/scrive regole di mapping in `lib/staff/data-connector/mapping/rules/` (file JSON, non DB — per velocita e versionamento Git).
