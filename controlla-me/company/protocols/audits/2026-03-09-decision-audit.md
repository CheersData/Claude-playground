# Audit Report — Settimana 2026-03-09 (PRIMO AUDIT)

**Auditor**: decision-auditor (Dipartimento Protocolli)
**Periodo**: Tutte le decisioni completate fino al 2026-03-09
**Tipo**: Primo audit inaugurale — copertura storica completa

---

## Summary

| Metrica | Valore |
|---------|--------|
| Task completati totali | 50 |
| Decisioni L1 (auto) | 22 |
| Decisioni L2 (CME) | 15 |
| Decisioni L3 (Boss) | 5 |
| Decisioni EXEMPT | 8 |
| Compliance rate L2+ | **65% (13/20)** |
| Violazioni trovate | 7 |
| Severity alta | 3 |
| Severity media | 4 |

---

## Decisioni L2+ auditate (20 totali)

### L2 — CME Approval (15 decisioni)

| # | Task ID | Titolo | Routing dichiarato | Verdict |
|---|---------|--------|--------------------|---------|
| 1 | c836f56e | Analyzer + Advisor: calibrare prompt per prospettiva lavoratore | company-operations:prompt_change / L2 / consult: department_owner | PASS |
| 2 | d26a9f60 | Classifier prompt: aggiungere 8+ documentSubType HR | company-operations:prompt_change / L2 / consult: department_owner | PASS |
| 3 | e1fba86b | Migration 029 FTS + integrazione fallback searchArticles | data-operations:schema_change / L2 / consult: architecture | PASS |
| 4 | dcdb0df3 | Question-prep: dizionario trigger-word per istituti giuridici | company-operations:prompt_change / L2 / consult: department_owner | PASS |
| 5 | 8ef6e805 | Prompt corpus-agent: risposte definitive, no rinvii generici | company-operations:prompt_change / L2 / consult: department_owner | PASS |
| 6 | f4e3fce3 | Riscrivere prompt CME: solo routing, zero esecuzione | company-operations:prompt_change / L2 / consult: department_owner | PASS |
| 7 | 262c4c52 | Bug: pallini progress non riflettono stato reale | ui-ux-request:page / L2 / consult: architecture | PASS |
| 8 | 084c1ad8 | Implementare scoring multidimensionale nel frontend | ui-ux-request:page / L2 / consult: architecture | PASS |
| 9 | afea4569 | Question-prep: dizionario trigger-word (duplicato) | company-operations:prompt_change / L2 / consult: department_owner | PASS |
| 10 | aad82057 | Prompt corpus-agent: risposte definitive (duplicato) | company-operations:prompt_change / L2 / consult: department_owner | PASS |
| 11 | a377738e | Migration 029 FTS (re-routing corretto) | data-operations:schema_change / L2 / consult: architecture | PASS |
| 12 | 987ce69a | Aggiornare c.p.c. post-Riforma Cartabia | data-operations:new_source / L2 / consult: architecture | PASS |
| 13 | be7b82f1 | Verificare Art. 570-bis c.p. nel Codice Penale | data-operations:new_source / L2 / consult: architecture | PASS |
| 14 | 0557b7fd | Aggiungere DPR 602/1973 | data-operations:new_source / L2 / consult: architecture | PASS |
| 15 | f1502ecb | Caricare L. 392/1978 (Equo canone) | data-operations:new_source / L2 / consult: architecture | PASS |

**L2 compliance: 15/15 (100%)**

Tutte le decisioni L2 hanno usato il decision tree corretto e dichiarato le consultazioni necessarie.

---

### L3 — Boss Approval (5 decisioni)

| # | Task ID | Titolo | Routing dichiarato | Verdict | Dettaglio |
|---|---------|--------|--------------------|---------|-----------|
| 1 | 35a354ce | Aggiornare status.json stale | company-operations:process_change / L3 / consult: protocols,architecture | **FAIL** | Vedi V-001 |
| 2 | 8b57d87b | Board reset: chiusura 25 task stale | company-operations:vision_mission / L3 / consult: strategy | **FAIL** | Vedi V-002 |
| 3 | fa344b24 | Audit accessibilita WCAG 2.1 AA | ui-ux-request:design_system / L3 / consult: architecture,strategy | **FAIL** | Vedi V-003 |
| 4 | 01a18915 | Scrivere articolo: Contratti scritti da AI | company-operations:process_change / L3 / consult: protocols,architecture | **FAIL** | Vedi V-004 |
| 5 | b0424256 | Scrivere articolo: Patto non concorrenza | company-operations:process_change / L3 / consult: protocols,architecture | **FAIL** | Vedi V-005 |

**Nota aggiuntiva**: altri 3 articoli marketing (dc25a547, 79fd63c0) hanno lo stesso problema di V-004/V-005.

**L3 compliance: 0/5 (0%)**

---

### EXEMPT (8 decisioni)

| # | Task ID | Titolo | Routing dichiarato | Verdict | Dettaglio |
|---|---------|--------|--------------------|---------|-----------|
| 1 | 990fe805 | Analisi competitiva Q1 2026 | EXEMPT — Strategy scouting pianificato | **FAIL** | Vedi V-006 |
| 2 | 528325fa | Deploy produzione su Vercel | EXEMPT — Decisione strategica L3 gia approvata | **FAIL** | Vedi V-007 |
| 3 | 4e45edd6 | Decision audit settimanale | EXEMPT — Governance interna protocolli | PASS |
| 4 | e05cb887 | Configurare Tiingo IEX | EXEMPT — Trading infrastructure gia approvata | PASS |
| 5 | 64803a31 | Grid search TP/SL | EXEMPT — Trading operations gia approvate L3 | PASS |
| 6 | a53c38fa | Re-run QA stress test | EXEMPT — Follow-up ciclo QA in corso | PASS |
| 7 | 9aef3b18 | Migration 029 FTS | data-operations:new_source / L2 / consult: architecture | PASS |
| 8 | 57fc9795 | Retrieval strutturale per modelli economici | feature-request:large / L3 / consult: architecture,strategy | PASS (board reset) |

**EXEMPT compliance: 6/8 (75%)**

---

## Violazioni

### V-001 — Severity: MEDIA

**Task**: 35a354ce — Aggiornare status.json stale
**Routing dichiarato**: company-operations:process_change / L3 / consult: protocols,architecture
**Problema**: Il routing a `process_change` (L3) e eccessivo. Aggiornare file `status.json` per allinearli alla realta non e un "cambiamento di processo". E un task operativo di manutenzione. Il tree corretto sarebbe `feature-request:small` (L1) oppure un nuovo sub-type in company-operations per "status update" (L1).
**Impatto**: Over-routing. Il task richiedeva L1, e stato classificato L3. Non ha causato danni ma ha gonfiato inutilmente il livello di approvazione.
**Raccomandazione**: Aggiungere sub-type `status_update` (L1) in company-operations.yaml per task di aggiornamento status/metadati.

### V-002 — Severity: ALTA

**Task**: 8b57d87b — Board reset: chiusura 25 task stale
**Routing dichiarato**: company-operations:vision_mission / L3 / consult: strategy
**Problema**: Il reset del board e un'operazione organizzativa, non un cambio di vision/mission. `vision_mission` richiede L3 con consultazione Strategy per decisioni tipo "pivot strategico". Un board reset e piu vicino a `process_change` (L3) o potrebbe essere un nuovo sub-type `board_maintenance` (L2). Inoltre, il result mostra "25 task chiusi" senza evidenza di consultazione Strategy.
**Impatto**: Tree sbagliato + consultazione Strategy probabilmente non effettuata per un task che non la richiedeva.
**Raccomandazione**: (1) Aggiungere sub-type `board_maintenance` (L2) in company-operations.yaml. (2) Se il tree dice "consult: strategy", la consultazione deve essere tracciata.

### V-003 — Severity: MEDIA

**Task**: fa344b24 — Audit accessibilita WCAG 2.1 AA
**Routing dichiarato**: ui-ux-request:design_system / L3 / consult: architecture,strategy
**Problema**: Un audit WCAG non e un cambio al design system. Il tree ui-ux-request ha gia un sub-type `accessibility` (L2, consult: nessuno, review: qa+security). Il routing corretto era `ui-ux-request:accessibility` (L2). Invece e stato usato `design_system` (L3) con consultazioni non necessarie (architecture, strategy).
**Impatto**: Over-routing a L3 quando L2 bastava. Consultazioni non necessarie richieste.
**Raccomandazione**: Usare `ui-ux-request:accessibility` per audit WCAG. Il tree gia lo prevede.

### V-004 — Severity: ALTA

**Task**: 01a18915 — Scrivere articolo: Contratti scritti da AI
**Routing dichiarato**: company-operations:process_change / L3 / consult: protocols,architecture
**Problema**: Scrivere un articolo SEO per il blog non e un "cambio di processo aziendale". E un task di content marketing, piccolo (1 file markdown), senza impatto architetturale. Il tree corretto e `feature-request:small` (L1). I task gemelli (clausole illegali, diritto recesso, clausole pericolose PMI, EU AI Act) sono stati correttamente routati come `feature-request:small` (L1).
**Impatto**: Over-routing grave. Un task L1 trattato come L3. Consultazioni protocols + architecture completamente inutili per un articolo di blog.
**Raccomandazione**: Standardizzare: articoli marketing/blog = `feature-request:small` (L1). Almeno 5 task hanno questo errore.

### V-005 — Severity: ALTA (stesso pattern di V-004)

**Task**: b0424256 — Scrivere articolo: Patto non concorrenza
**Routing dichiarato**: company-operations:process_change / L3 / consult: protocols,architecture
**Problema**: Identico a V-004. Articolo blog routato come L3 process_change.
**Impatto**: Stesso di V-004.
**Task con stesso errore**: dc25a547 (Caparra confirmatoria), 79fd63c0 (Clausole affitto). Totale: 4 task marketing con routing L3 errato.

### V-006 — Severity: MEDIA

**Task**: 990fe805 — Analisi competitiva Q1 2026
**Routing dichiarato**: EXEMPT — Strategy scouting pianificato
**Problema**: "EXEMPT" non e un routing valido nei decision trees. Ogni task deve avere un routing tracciabile. Un'analisi competitiva potrebbe rientrare in `company-operations:process_change` (L3) oppure serve un nuovo tree `strategy-operations` per task di Strategy. L'esenzione "gia pianificato" non giustifica saltare il protocollo.
**Impatto**: Nessun audit trail formale. Impossibile verificare se l'approvazione era adeguata.
**Raccomandazione**: Eliminare la categoria EXEMPT. Ogni task deve avere un routing valido. Se il task e "gia approvato", indicare il task/decisione originale che lo ha approvato (parent task ID).

### V-007 — Severity: MEDIA

**Task**: 528325fa — Deploy produzione su Vercel
**Routing dichiarato**: EXEMPT — Decisione strategica L3 gia approvata dal boss
**Problema**: Come V-006. Il routing corretto e `infrastructure:deploy_production` (L3, consult: architecture+security+finance). Il result dice "Routing corretto: ricreo con infrastructure:deploy_production" ma il task e stato chiuso nel board reset senza ri-creazione effettiva.
**Impatto**: Un deploy di produzione (task critico) senza routing formale.
**Raccomandazione**: Come V-006 — eliminare EXEMPT, usare sempre un tree valido.

---

## Pattern identificati

### 1. Over-routing sistematico su articoli marketing

4 articoli blog sono stati routati come `company-operations:process_change` (L3) invece di `feature-request:small` (L1). Questo suggerisce confusione tra "creare contenuto" (L1) e "cambiare un processo" (L3). I task di content marketing non sono process changes.

**Task affetti**: 01a18915, b0424256, dc25a547, 79fd63c0

### 2. Uso improprio di EXEMPT

8 task (16%) usano "EXEMPT" come routing. Questo bypassa completamente il sistema di protocolli. Anche se un task e "gia approvato", il routing deve essere tracciabile.

**Mitigazione**: Sostituire EXEMPT con routing reale + campo `parent_decision_id` che punta alla decisione originale.

### 3. Board reset ha cancellato 25 task senza re-routing

Il board reset (8b57d87b) ha chiuso 25 task in blocco. Molti sono stati "rigenerati" ma il trail tra vecchio e nuovo task non e tracciabile. I result dicono "Board reset #714 - task rigenerato con priorita aggiornata" senza indicare l'ID del nuovo task.

**Mitigazione**: Quando si chiude un task per re-generazione, il campo result dovrebbe contenere l'ID del nuovo task (es. "Rigenerato come task [new_id]").

### 4. Consultazioni dichiarate ma non verificabili

I task dichiarano "consult: department_owner" o "consult: architecture" ma non c'e evidenza nel task system che la consultazione sia avvenuta. Il sistema attuale non traccia i pareri dei dipartimenti consultati.

**Mitigazione**: Aggiungere campo `consultations` al task system con timestamp e parere di ogni dipartimento consultato.

---

## Compliance per dipartimento

| Dipartimento | Task L2+ | Compliant | Rate |
|-------------|----------|-----------|------|
| ufficio-legale | 5 | 5 | 100% |
| data-engineering | 6 | 6 | 100% |
| architecture | 2 | 2 | 100% |
| protocols | 1 | 1 | 100% |
| ux-ui | 3 | 1 | 33% |
| marketing | 4 | 0 | 0% |
| operations | 1 | 0 | 0% |
| cme | 1 | 0 | 0% |
| trading | 0 | N/A | N/A |
| quality-assurance | 0 | N/A | N/A |

**Nota**: I task marketing/operations/cme con violazioni non riflettono problemi del dipartimento esecutore, ma del routing CME al momento della creazione del task.

---

## Decision Trees da aggiornare

| Tree | Modifica proposta | Priorita |
|------|-------------------|----------|
| company-operations.yaml | Aggiungere sub-type `status_update` (L1, consult: nessuno) per aggiornamenti status.json e metadati | Media |
| company-operations.yaml | Aggiungere sub-type `board_maintenance` (L2, consult: nessuno) per reset/pulizia task board | Media |
| (nuovo) | Considerare tree `content-operations.yaml` per articoli, blog, SEO — oppure chiarire che vanno sotto `feature-request:small` | Alta |
| (sistema) | Eliminare routing EXEMPT — ogni task deve avere tree:sub-type valido | Alta |
| (sistema) | Aggiungere campo `parent_decision_id` per task derivati da decisioni precedenti | Media |
| (sistema) | Aggiungere campo `consultations[]` per tracciare pareri dei dipartimenti consultati | Bassa |

---

## Raccomandazioni finali

1. **[P0] Standardizzare routing articoli marketing**: tutti gli articoli blog/SEO = `feature-request:small` (L1). Zero consultazioni. Creare nota esplicita nel tree o nel runbook marketing.

2. **[P0] Eliminare EXEMPT**: ogni task deve avere un routing `tree:sub-type` valido. Se gia approvato, indicare il task padre.

3. **[P1] Aggiungere sub-types mancanti**: `status_update` e `board_maintenance` in company-operations.yaml per evitare over-routing.

4. **[P2] Tracciabilita consultazioni**: il task system non registra se le consultazioni dichiarate sono avvenute. Aggiungere campo strutturato.

5. **[P2] Tracciabilita re-generazione task**: quando un task viene chiuso per board reset e rigenerato, registrare il mapping old_id -> new_id.

---

## Prossimo audit

**Data**: 2026-03-16 (settimanale)
**Scope**: Solo task completati nella settimana 2026-03-09 / 2026-03-16
**Focus**: Verificare che le raccomandazioni P0 di questo audit siano state implementate
