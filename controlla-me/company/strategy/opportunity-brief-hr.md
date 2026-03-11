# Opportunity Brief: Verticale HR Italia

> Autore: CME | Data: 2026-03-07 | Stato: Draft

## Executive Summary

Estendere controlla.me con un verticale dedicato all analisi di contratti e documenti di lavoro.
Il corpus normativo HR (548+ articoli da 6 fonti) e gia caricato nel vector DB.
L opportunita sfrutta l infrastruttura multi-verticale gia in produzione per raggiungere
un segmento (PMI italiane) con alta domanda di compliance e basso accesso a consulenza legale.
## Market Data

### Target Segment
- PMI italiane (< 50 dipendenti): ~4.4M imprese (ISTAT 2024)
- HR manager / consulenti del lavoro: ~30.000 professionisti attivi
- Dipendenti: ~18M lavoratori subordinati
- Pain point: comprensione diritti, clausole contrattuali, licenziamento, CIG

### Competitor Gap
- Nessun tool AI in Italia analizza specificamente contratti di lavoro
- Tool esistenti (JustAnswer, LegalZoom) sono generici, non specializzati su diritto del lavoro IT
- Consulenti del lavoro costano 50-150 EUR/h, inaccessibili per la maggior parte dei lavoratori
- Sindacati offrono consulenza gratuita ma con tempi di attesa lunghi

### Demand Signals
- Google Trends IT: diritti lavoratore ~40K ricerche/mese
- contratto di lavoro clausole ~8K ricerche/mese
- licenziamento illegittimo ~12K ricerche/mese
- Forum: alta frequenza domande su contratti atipici, straordinari, ferie
## Technical Requirements

### Corpus (gia disponibile)
| Fonte | Articoli | Stato |
|-------|----------|-------|
| D.Lgs. 81/2008 (Sicurezza) | 306 | Caricato |
| D.Lgs. 276/2003 (Riforma Biagi) | ~88 | Caricato |
| L. 300/1970 (Statuto Lavoratori) | 41 | Caricato |
| D.Lgs. 23/2015 (Jobs Act) | 12 | Caricato |
| D.Lgs. 81/2015 (Codice contratti) | ~55 | Caricato |
| D.Lgs. 148/2015 (CIG) | ~46 | Caricato |
| **Totale** | **548+** | **Pronto** |

### Corpus mancante (Phase 2)
- CCNL (Contratti Collettivi Nazionali): ~800 contratti su archivio CNEL
- Richiede custom CcnlConnector (www.cnel.it/CCNL o API INPS)
- Senza CCNL: copertura ~60%. Con CCNL: ~90%

### Nuovi agenti necessari
- Prompt HR specializzati per classifier, analyzer, investigator, advisor
- Punto di vista: sempre dalla parte del lavoratore
- Focus: licenziamento, dimissioni, straordinari, ferie, malattia, maternita, TFR
- Effort: adattamento prompt (non nuovi agenti), 2-3 giorni

### Modifiche infrastrutturali
- Nessuna: il sistema multi-verticale e gia config-driven
- I prompt HR sono parametrizzabili per sotto-tipo contratto
- RAG gia supporta vertical filter su legal_articles
## RICE Scoring

| Metrica | Valore | Note |
|---------|--------|------|
| Reach | 5.000 utenti/trimestre | Basato su keyword volume e TAM PMI |
| Impact | 2.0 (alto) | Nuovo verticale = nuovo segmento utenti |
| Confidence | 70% | Corpus pronto, ma CCNL mancante limita completezza |
| Effort | 2 settimane | Prompt adaptation + testing + UI vertical |
| **RICE Score** | **3.500** | Alto: corpus pronto, effort basso |

## Prerequisiti

1. Prompt HR per i 4 agenti (classifier, analyzer, investigator, advisor)
2. Testbook HR con 10+ documenti di lavoro reali
3. UI routing per /lavoro o /hr (config-driven, gia supportato)
4. Marketing validation con keyword research e landing page test

## Rischi

- CCNL gap: senza contratti collettivi, analisi incompleta per casistiche settoriali
- Complessita normativa: diritto del lavoro IT stratificato (statuto + dlgs + CCNL + circolari)
- Responsabilita legale: disclaimer chiaro che non sostituisce consulente del lavoro

## Raccomandazione

Procedere con Phase 1 (2 settimane):
- Adattare prompt agenti per documenti HR
- Creare testbook con 10+ contratti lavoro
- Lanciare verticale /lavoro con corpus attuale (548 articoli)
- Rimandare CCNL a Phase 2 (Q2 2026)

Phase 2 (Q2 2026):
- Custom CcnlConnector per archivio CNEL
- 800+ contratti collettivi nazionali
- Coverage 90%+ casistiche HR