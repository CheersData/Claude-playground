# Memo: DPA Provider AI + EU AI Act Compliance

**Data**: 2026-03-01
**Autore**: CME
**Destinatario**: Boss
**Priorità**: CRITICAL — sblocca commercializzazione PMI

---

## 1. DPA Provider AI — Stato e Azioni

### Anthropic (Claude)

**DPA disponibile**: Sì — Anthropic offre un Data Processing Addendum (DPA) standard.
**Come firmarlo**:
1. Vai su https://www.anthropic.com/legal/data-processing-addendum
2. Il DPA è auto-served: firma digitale via piattaforma (nessun contatto sales richiesto per volume standard)
3. Assicurati di avere un account business (non personale) su console.anthropic.com
4. Il DPA copre: sub-processor list, dati personali trattati, misure di sicurezza, diritti dell'interessato

**Nota**: Anthropic classifica i dati inviati via API come "Customer Data" — non usati per training senza consenso esplicito (optin).

---

### Google (Gemini API)

**DPA disponibile**: Sì — Google Cloud Data Processing Addendum (CDPA).
**Come firmarlo**:
1. Accedi a https://cloud.google.com/terms/data-processing-addendum
2. Se usi Google AI Studio (gratuito): dati usati per miglioramento prodotto — **non adatto per PMI con dati sensibili**
3. Se usi Google Cloud Vertex AI (Gemini Enterprise): il CDPA è firmabile e i dati NON vengono usati per training
4. **Azione immediata**: migrare da Google AI Studio a Vertex AI per il tier Partner, oppure escludere Gemini dal tier Partner PMI

---

### Mistral AI

**DPA disponibile**: Sì — Mistral ha un DPA standard GDPR-compliant.
**Come firmarlo**:
1. Vai su https://mistral.ai/terms/data-processing-agreement
2. Firma digitale disponibile per account business
3. Mistral dichiara: nessun uso dei dati per training su API (solo per utenti console.mistral.ai)

---

### DeepSeek

**Raccomandazione: ESCLUDERE dal tier PMI con dati sensibili.**
**Motivazione**:
- Server localizzati in Cina (PRC)
- Trasferimento dati verso paese terzo senza adeguatezza GDPR (Cina non è in lista adeguatezza EU)
- Richiederebbe Binding Corporate Rules o Standard Contractual Clauses specifiche — effort sproporzionato
- **Azione**: rimuovere DeepSeek dalla catena di fallback del tier Partner, o limitarlo a dati non-sensibili (es. solo per analisi interne CME)

---

### Groq / Cerebras

**DPA**: Groq e Cerebras hanno DPA disponibili ma meno consolidati.
**Raccomandazione**: Usarli SOLO per task interni company (scheduler, tagging) — mai per documenti utente. Tier Intern OK, tier Partner PMI NO.

---

## 2. Piano d'azione DPA

| Priorità | Azione | Owner | Scadenza |
|----------|--------|-------|----------|
| P0 | Firma DPA Anthropic | Boss (account business) | Prima del lancio PMI |
| P0 | Valuta Vertex AI vs Google AI Studio | Boss + Architecture | Prima del lancio PMI |
| P0 | Firma DPA Mistral | Boss (account business) | Prima del lancio PMI |
| P1 | Rimuovi DeepSeek da catena fallback tier Partner | Architecture | Sprint corrente |
| P2 | DPA Groq + Cerebras | Boss | Entro Q2 2026 |

---

## 3. EU AI Act — Status e Gap Analysis

### Classificazione di Controlla.me

**Sistema ad alto rischio?**
Controlla.me rientra in **Allegato III, punto 5(b)** dell'EU AI Act: "sistemi AI destinati a essere usati per interpretare contratti o documenti legali, compresa la valutazione del rischio contrattuale".

**Conseguenza**: Classificato come **sistema AI ad alto rischio** — soggetto agli obblighi del Titolo III.

### Obblighi Titolo III (alto rischio)

| Obbligo | Stato attuale | Gap |
|---------|--------------|-----|
| Art. 9: Sistema gestione rischi | ❌ Non formale | Documentare risk management process |
| Art. 10: Governance dati | 🟡 Parziale (RLS, audit log) | Formalizzare data lineage |
| Art. 11: Documentazione tecnica | ❌ Non formale | CLAUDE.md è tecnico ma non è il formato richiesto |
| Art. 13: Trasparenza | 🟡 Parziale (disclaimer UI) | Rafforzare disclosure "AI-generated" |
| Art. 14: Supervisione umana | 🟡 Presente (lawyer CTA) | Documentare formalmente |
| Art. 15: Robustezza | ❌ Non formale | Test set, metriche accuracy |
| Art. 16-29: Conformità fornitori | ❌ Non avviata | Dipende da DPA + consulente |

### Scadenza

L'EU AI Act entra in vigore per sistemi ad alto rischio: **2 agosto 2026** (12 mesi dopo entrata in vigore agosto 2025).

---

## 4. Piano consulente EU AI Act

**Azione**: Ingaggiare un consulente entro aprile 2026 per avere 4 mesi di lavoro prima della scadenza.

**Profili cercati**:
1. Studi legali specializzati in AI Law + GDPR (es. Bird & Bird, DLA Piper, Osborne Clarke — tutti hanno practice EU AI Act)
2. Consulenti indipendenti con certificazione CIPP/E + esperienza AI systems
3. Associazioni di settore: AI4EU, IAPP Italia

**Come trovare**:
- LinkedIn: "EU AI Act consultant Italy" / "AI Act compliance"
- IAPP: https://iapp.org/connect/directory/
- Cammino obbligatorio: gap analysis → piano conformità → documentazione tecnica → CE marking (se applicabile)

**Budget stimato**: €5.000-15.000 per gap analysis + piano conformità (PMI, non multinazionale).

---

## 5. Immediato — Azioni Boss

1. **Questa settimana**: Firma DPA Anthropic e Mistral (self-served, ~30 min ciascuno)
2. **Questa settimana**: Valuta account Google Cloud vs AI Studio
3. **Entro aprile 2026**: Ingaggia consulente EU AI Act
4. **Ora (Architecture)**: Rimuovi DeepSeek dalla catena fallback tier Partner
