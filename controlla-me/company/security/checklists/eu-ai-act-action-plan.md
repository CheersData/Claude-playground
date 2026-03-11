# EU AI Act — Action Plan

> **Autore:** Security Department (security-auditor)
> **Data:** 2026-03-10
> **Stato:** APPROVATO DAL BOSS — esecuzione autorizzata
> **Task:** d2110293
> **Scadenza legale:** 2 agosto 2026 (Art. 6, Reg. UE 2024/1689)
> **Budget approvato:** 5.000-15.000 EUR

---

## Classificazione del Sistema

| Aspetto | Valutazione |
|---------|-------------|
| **Tipo sistema** | Piattaforma AI per analisi contratti legali |
| **Classificazione proposta** | Rischio limitato (non alto rischio) |
| **Allegato III pertinente** | Punto 5(b) — accesso a servizi essenziali: **NON applicabile** (il sistema analizza, non decide) |
| **Allegato III secondario** | Punto 8 — amministrazione della giustizia: **NON applicabile** (strumento informativo, non decisionale) |
| **Rischio condizionale** | Se il verticale HR evolve verso decisioni su assunzione/licenziamento: reclassificazione a **alto rischio** necessaria |
| **Obblighi certi** | Trasparenza AI (Art. 50), marcatura output AI-generated (Art. 50(2)), documentazione deployer (Art. 50(4)) |
| **Validazione richiesta** | Consulente esterno deve confermare la classificazione entro giugno 2026 |

---

## Checklist Operativa (8 punti)

### PUNTO 1 — Identificare 3 consulenti italiani EU AI Act

**Deadline:** 31 marzo 2026
**Owner:** Security Department + CME
**Effort:** 2-3 giorni di ricerca

**Criteri di selezione:**
- Esperienza specifica con EU AI Act (Reg. UE 2024/1689), non generico "GDPR"
- Conoscenza del settore legal tech / AI applicata al diritto
- Presenza in Italia (preferibile) o EU con competenza su diritto italiano
- Referenze verificabili su progetti di classificazione AI
- Disponibilita entro aprile 2026

**Dove cercare:**
1. **Associazioni di categoria**: ANORC (Associazione Nazionale Operatori e Responsabili della Custodia digitale), AIGA (Associazione Italiana Giovani Avvocati) sezione tech
2. **Studi legali specializzati**: cercare studi con practice group "AI & Technology" o "Data Protection" che hanno pubblicato su EU AI Act
3. **Consulenti GDPR gia attivi**: DPO certificati (ISO 17024) che hanno aggiunto EU AI Act alle competenze
4. **Network europeo**: EU AI Act compliance network, AI Alliance Europe
5. **Conferenze**: speaker a eventi 2025-2026 su EU AI Act (Richmond IT Forum, AIDP, Dig.eat)

**Output atteso:** Lista di 3 candidati con nome, studio/azienda, referenze, tariffa indicativa, disponibilita.

---

### PUNTO 2 — Inviare RFQ (Request for Quotation) entro aprile 2026

**Deadline:** 30 aprile 2026
**Owner:** CME
**Effort:** 1-2 giorni di preparazione + 1-2 settimane attesa risposte

**Contenuto RFQ:**

```
OGGETTO: Consulenza EU AI Act — Classificazione e conformita sistema AI legal tech

DESCRIZIONE SISTEMA:
- Nome: Controlla.me
- Funzione: Analisi automatizzata di contratti legali tramite pipeline multi-agente AI
- Modelli AI usati: Claude (Anthropic), Gemini (Google), modelli open-source via Groq/Cerebras/Mistral
- Utenti target: privati (B2C) e PMI italiane (B2B)
- Dati trattati: testo contrattuale integrale (contenente potenziali dati personali)
- Verticali: contratti civili, commerciali, lavoro (HR)
- Stato attuale: classificazione interna "rischio limitato" — richiesta validazione esterna

DELIVERABLES RICHIESTI:
1. Classificazione formale del sistema (rischio limitato / alto rischio)
2. Gap analysis rispetto agli obblighi applicabili
3. Piano di remediation con priorita e timeline
4. Revisione disclaimer e marcatura AI nella UI
5. Supporto per eventuale registrazione presso autorita nazionale
6. (Opzionale) Supporto per DPIA integrata

TIMELINE:
- Inizio engagement: maggio 2026
- Deliverable finale: luglio 2026 (1 mese prima della scadenza agosto 2026)

BUDGET INDICATIVO: 5.000-15.000 EUR (indicare costo fisso o a giornata)

FORMATO RISPOSTA:
- Proposta tecnica (max 5 pagine)
- CV del team assegnato
- Referenze 2-3 progetti similari
- Offerta economica dettagliata
- Calendario di massima
```

---

### PUNTO 3 — Selezionare consulente e firmare contratto

**Deadline:** 15 maggio 2026
**Owner:** CME + Boss (approvazione finale spesa)
**Effort:** 1 settimana (valutazione proposte + call + decisione)

**Criteri di valutazione:**

| Criterio | Peso |
|----------|------|
| Esperienza specifica EU AI Act + legal tech | 35% |
| Qualita proposta tecnica e comprensione del sistema | 25% |
| Prezzo | 20% |
| Disponibilita (deve consegnare entro luglio 2026) | 15% |
| Referenze verificabili | 5% |

**Approvazione:** L3 Boss (spesa > 5K EUR)

---

### PUNTO 4 — Gap Analysis: deliverables necessari dal consulente

**Deadline:** giugno 2026 (prima consegna parziale)
**Owner:** Consulente + Security Department

**Il consulente deve produrre:**

1. **Classificazione formale**
   - Conferma o rettifica della classificazione "rischio limitato"
   - Analisi specifica per il verticale HR (rischio condizionale)
   - Analisi dell'impatto dei modelli GPAI usati come componenti

2. **Gap analysis** (rispetto allo stato attuale)
   - Trasparenza AI (Art. 50): stato dei disclaimer e della marcatura output
   - Documentazione tecnica per deployer (Art. 50(4)): stato attuale vs requisiti
   - Registro utilizzo (Art. 12): audit log esistente vs requisiti
   - Governance e supervisione umana: human-in-the-loop attuale vs requisiti
   - Accuratezza e robustezza (Art. 15 se alto rischio): testing attuale vs requisiti

3. **Piano di remediation**
   - Lista azioni correttive ordinate per priorita
   - Effort stimato per ciascuna azione (giorni dev, giorni legale)
   - Timeline compatibile con deadline agosto 2026
   - Responsabilita (cosa fa il consulente, cosa fa il team interno)

4. **Revisione UI**
   - Testo disclaimer AI per la landing page
   - Label "analisi generata da AI" — formulazione legalmente corretta
   - Informativa trasparenza per utenti B2B

5. **Template documentazione deployer**
   - Scheda tecnica del sistema AI (Art. 50(4))
   - Istruzioni d'uso per clienti B2B
   - Limiti noti e rischi del sistema

---

### PUNTO 5 — Implementare azioni correttive (sviluppo)

**Deadline:** luglio 2026
**Owner:** Security Department + UX/UI + Architecture
**Effort stimato:** 5-10 giorni dev (dipende dalla gap analysis)

**Azioni gia identificate (pre-consulente):**

| # | Azione | Stato | Effort | Priorita |
|---|--------|-------|--------|----------|
| 5.1 | Disclaimer "Questo e un sistema AI" nella UI | Non implementato | 1 giorno | P0 |
| 5.2 | Label "Analisi generata da intelligenza artificiale" su output | Non implementato | 1 giorno | P0 |
| 5.3 | Pagina `/about/ai-transparency` con spiegazione del sistema | Non implementato | 1-2 giorni | P1 |
| 5.4 | Documentazione tecnica deployer per B2B (PDF/pagina web) | Non implementato | 2-3 giorni | P1 |
| 5.5 | Log strutturato delle decisioni AI (estensione audit-log.ts) | Parziale | 1-2 giorni | P1 |
| 5.6 | Canale contatto autorita di mercato (email dedicata) | Non implementato | 0.5 giorni | P2 |

**Nota:** la lista definitiva verra dal gap analysis del consulente (punto 4). Queste sono azioni gia identificate internamente.

---

### PUNTO 6 — Registrazione presso autorita nazionale (se richiesta)

**Deadline:** agosto 2026
**Owner:** Consulente + CME
**Effort:** 1-2 giorni

**Stato:** Da verificare con il consulente. Per sistemi a rischio limitato la registrazione potrebbe non essere obbligatoria. Per sistemi ad alto rischio e obbligatoria nella EU AI Database.

**Autorita italiana:** AGID (Agenzia per l'Italia Digitale) / Garante Privacy (in attesa di designazione dell'autorita nazionale competente per EU AI Act).

---

### PUNTO 7 — Monitoraggio post-deployment

**Deadline:** continuo, a partire da agosto 2026
**Owner:** Security Department

**Attivita:**
- Revisione trimestrale della classificazione (il sistema evolve, la classificazione puo cambiare)
- Aggiornamento documentazione deployer ad ogni release significativa
- Monitoraggio linee guida EDPB e autorita nazionale su EU AI Act
- Rivisitazione obbligatoria della classificazione se:
  - Si aggiunge un nuovo verticale (es. medico, HR decisionale)
  - Si cambia il tipo di output (da informativo a decisionale)
  - Cambiano i modelli AI sottostanti in modo significativo

---

### PUNTO 8 — Budget breakdown

| Voce | Min | Max | Note |
|------|-----|-----|------|
| Classificazione + gap analysis | 3.000 | 7.000 | Core del mandato |
| Piano di remediation + template | 1.000 | 3.000 | Incluso nella consulenza |
| Revisione UI/testi | 500 | 2.000 | Opzionale se semplice |
| Supporto registrazione | 500 | 1.500 | Solo se necessario |
| Contingency (20%) | 1.000 | 2.500 | Imprevisti |
| **Totale** | **5.000** | **15.000** | |

---

## Timeline Riepilogativa

```
MARZO 2026 (settimane 1-3):
  [x] Assessment interno completato (dpa-ai-act-assessment.md)
  [x] Action plan approvato dal boss
  [ ] Ricerca 3 consulenti — DEADLINE: 31 marzo

APRILE 2026:
  [ ] RFQ inviata ai 3 candidati — DEADLINE: 30 aprile
  [ ] Ricezione e valutazione proposte

MAGGIO 2026:
  [ ] Selezione consulente + firma contratto — DEADLINE: 15 maggio
  [ ] Kick-off engagement

GIUGNO 2026:
  [ ] Prima consegna: classificazione formale + gap analysis
  [ ] Inizio azioni correttive di sviluppo

LUGLIO 2026:
  [ ] Consegna finale: piano remediation + template + revisione UI
  [ ] Completamento azioni correttive di sviluppo
  [ ] Test e validazione finale

AGOSTO 2026:
  [ ] Scadenza legale EU AI Act per sistemi ad alto rischio
  [ ] Piena conformita raggiunta (anche se classificati rischio limitato)
  [ ] Registrazione se richiesta
  [ ] Avvio monitoraggio post-deployment
```

---

## Riferimenti

- Regolamento UE 2024/1689 (EU AI Act) — [Testo ufficiale](https://eur-lex.europa.eu/eli/reg/2024/1689)
- Allegato III — Sistemi ad alto rischio
- Art. 50 — Obblighi di trasparenza per determinati sistemi di IA
- Assessment interno: `company/security/dpa-ai-act-assessment.md`

---

> **Stato:** Boss ha approvato il budget e l'approccio. Procedere con la ricerca consulenti (punto 1) come azione immediata.
