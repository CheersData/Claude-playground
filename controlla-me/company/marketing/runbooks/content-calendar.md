# Runbook: Pianificazione Contenuti Mensile (Content Calendar)

## Obiettivo

Produrre un piano editoriale mensile con articoli SEO e contenuti social, allineato alle keyword target e agli OKR di Strategy.

## Quando eseguire

Ultima settimana di ogni mese (per il mese successivo) o su richiesta CME.

## Procedura

### Fase 1: Ricerca keyword (~20 min)

1. **Identifica le query principali** per il mese
   - Focus su: contratti (affitto, lavoro, servizi, acquisto), diritti consumatori
   - Priorità: keyword con intento informazionale (non transazionale)
   - Difficoltà target: bassa-media (nuovi siti faticano su keyword ad alta difficoltà)

2. **Fonti per la ricerca**
   - Google Suggest e "Ricerche correlate"
   - AnswerThePublic o simili per domande reali degli italiani
   - Forum e Reddit italiano (es. r/italy) per problemi reali
   - Corpus legislativo di Controlla.me (le query degli utenti nel corpus agent)

3. **Seleziona 4 keyword per il mese** (1 per settimana)
   - 2 guida lunga (pillar content, ≥ 1.500 parole)
   - 1 FAQ (risposta breve, snippet)
   - 1 listicolo (es. "5 clausole da non firmare mai")

### Fase 2: Pianificazione articoli (~15 min)

4. **Per ogni keyword, definisci**:
   ```markdown
   **Keyword:** [keyword principale]
   **Tipo:** guida / FAQ / listicolo
   **Intent:** informazionale / navigazionale
   **Struttura:** [H1, H2, H2, H2...]
   **Fonti normative:** [artt. di legge da citare]
   **CTA:** [come collegare a Controlla.me]
   **Revisione legale:** [sì/no — sempre sì per articoli con citazioni normative]
   **Data pubblicazione:** [settimana target]
   ```

5. **Verifica con Ufficio Legale**
   ```bash
   npx tsx scripts/company-tasks.ts create \
     --title "Revisione legale: [titolo articolo]" \
     --dept ufficio-legale \
     --priority medium \
     --by content-writer \
     --desc "Articolo su [topic]. Verificare accuratezza citazioni normative prima pubblicazione."
   ```

### Fase 3: Contenuti social (~10 min)

6. **Pianifica 8-12 post social** (2-3 per settimana)
   - LinkedIn: 1 articolo adattato per professionisti + 1 caso d'uso B2B
   - Instagram: 1 carosello educativo (es. "3 clausole affitto che devi leggere")
   - Format suggeriti: carosello, citazione legge + spiegazione, "lo sapevi che..."

### Fase 4: Output calendar

7. **Produci il piano mensile**:

```markdown
# Content Calendar — [Mese] [Anno]

## Settimana 1 ([Date])
**Articolo:** [Titolo] — Keyword: [keyword]
**Social:** LinkedIn — [tema] | Instagram — [carosello tema]
**Status:** bozza / in revisione / pubblicato

## Settimana 2 ([Date])
...

## KPI target del mese
- Articoli pubblicati: 4
- Post social: 10
- Keyword nuove indicizzate: 4
- Traffic goal: +15% vs mese precedente
```

8. **Crea task per ogni articolo**:
   ```bash
   npx tsx scripts/company-tasks.ts create \
     --title "Articolo: [titolo]" \
     --dept marketing \
     --priority medium \
     --by content-writer \
     --desc "Keyword: [keyword] | Data: [settimana] | Revisione legale: richiesta"
   ```

## Output atteso

```markdown
# Content Calendar — Marzo 2026

## Settimana 1 (3-7 marzo)
**Articolo pillar:** "Contratto di affitto: 10 cose da controllare prima di firmare"
Keyword: "contratto affitto cosa controllare" (1.200/mese)
Fonti: Art. 1571-1620 Codice Civile, L. 431/1998
Revisione legale: sì
**Social:** LinkedIn "5 clausole affitto che i proprietari inseriscono spesso" | IG carosello

## Settimana 2 (10-14 marzo)
**FAQ:** "Posso disdire un abbonamento in qualsiasi momento?"
Keyword: "recesso contratto abbonamento" (900/mese)
Fonti: Art. 52-54 Codice del Consumo
Revisione legale: sì
**Social:** LinkedIn "Diritti recesso online" | IG "Lo sapevi che..."

## Settimana 3 (17-21 marzo)
...

## KPI target marzo
- Articoli: 4 pubblicati
- Post social: 12
- Traffic goal: 550 sessioni organiche (+20% vs febbraio)
```

## Errori comuni

| Errore | Soluzione |
|--------|-----------|
| Articoli senza keyword research | Inizia sempre dalla keyword, non dall'idea |
| Citazioni normative non verificate | Task obbligatorio a Ufficio Legale prima della pubblicazione |
| Troppi contenuti, poca qualità | 4 articoli eccellenti > 12 mediocri |
| CTA aggressiva | "Prova Controlla.me" non "Abbonati ora" — l'utente deve scegliere |
