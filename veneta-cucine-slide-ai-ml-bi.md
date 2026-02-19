# Veneta Cucine — Parte 2: AI / ML / BI
## Ordini di Sostituzione: Intercettare Trend e Anomalie in Tempo Reale

---

## Contesto

- **130 ordini di sostituzione/giorno** gestiti su ERP, senza strumenti di analisi rapida
- **Power BI** presente in azienda ma l'analisi manuale dei dati richiede troppo tempo, riducendo la reattività nell'individuare problemi ricorrenti
- **Nessun meccanismo di alerting proattivo** su trend anomali legati a codici articolo/componente specifici
- Le devianze nei componenti vengono identificate tardi, con impatto su costi di sostituzione, qualità percepita e carico operativo
- L'IT interno è sovraccarico: serve una soluzione leggera, innestabile nell'architettura esistente senza grandi progettualità

---

## Obiettivi della Proposta

1. **Rilevamento automatico di anomalie e trend**
   Identificare in modo proattivo picchi e pattern ricorrenti sugli ordini di sostituzione, segmentati per codice articolo, componente, lotto, linea produttiva e periodo temporale

2. **Alerting in tempo reale**
   Notifiche automatiche quando un codice articolo/componente supera soglie statistiche di sostituzione, per innescare azioni correttive immediate nel processo produttivo

3. **Riduzione del tempo di analisi**
   Passare da un'analisi manuale e reattiva su Power BI a insight automatici e azionabili, abbattendo i tempi di identificazione dei problemi da giorni/settimane a ore

4. **Integrazione leggera nell'ecosistema esistente**
   Innesto sulla stack Microsoft/Power BI già in uso, senza sostituire strumenti e senza richiedere un progetto di trasformazione

---

## Soluzione Proposta: Agente Verticale di Anomaly Detection

### Architettura

```
ERP (dati ordini sostituzione)
        |
        v
   Data Pipeline (estrazione e normalizzazione)
        |
        v
   Modulo ML — Anomaly Detection & Trend Analysis
   (modelli statistici + AI su serie storiche)
        |
        v
   Layer di Alerting & Reporting
   (integrato con Power BI / Teams / Email)
```

### Componenti chiave

| Componente | Descrizione |
|---|---|
| **Data Connector** | Estrazione automatica dati ordini sostituzione dall'ERP verso il modulo di analisi |
| **Anomaly Detection Engine** | Algoritmi ML (es. Isolation Forest, Prophet, Z-score dinamico) per identificare devianze statisticamente significative su codici articolo e componenti |
| **Trend Analyzer** | Analisi di serie storiche per individuare trend crescenti/decrescenti e stagionalità nelle sostituzioni |
| **Alert System** | Notifiche configurabili via Teams/Email con soglie personalizzabili per codice, categoria, linea |
| **Dashboard sintetica** | Vista operativa integrata in Power BI con evidenza automatica delle anomalie rilevate |

---

## Approccio e Principi Guida

- **Snello e focalizzato**: componente verticale che risolve un problema specifico, non un progetto di trasformazione
- **Time-to-value rapido**: prima versione operativa in poche settimane, con cicli iterativi di miglioramento
- **Rispetto dell'ecosistema**: si innesta su Power BI e stack Microsoft esistente, nessuna rivoluzione tecnologica
- **Scalabile per il futuro**: il modulo potra' essere arricchito con ulteriori fonti dati e use case (es. predizione guasti, ottimizzazione scorte ricambi) quando il cliente sara' pronto

---

## Risultati Attesi

- Intercettazione proattiva di codici/componenti problematici prima che generino volumi critici di reclami
- Riduzione dei costi di sostituzione attraverso azioni correttive tempestive sulla produzione
- Visibilita' immediata per il management su qualita' e performance dei componenti
- Base dati strutturata per decisioni data-driven sul processo produttivo

---

## Prossimi Passi

1. Workshop di approfondimento con Veneta Cucine per mappare dati disponibili e priorita'
2. Accesso a un campione di dati ordini sostituzione per proof of concept
3. Definizione delle soglie di alerting con il team qualita' e area tecnica
4. Sviluppo e rilascio MVP dell'agente verticale
5. Ciclo di tuning e feedback con gli utenti operativi
