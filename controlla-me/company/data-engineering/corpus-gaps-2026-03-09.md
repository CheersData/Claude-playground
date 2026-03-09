# Corpus Gap Analysis — 2026-03-09

## Sources currently loaded: 7,981 articles from 35 distinct law_source values

Top sources by article count:
- 3018 Codice Civile
- 930 Codice del Consumo
- 800 Codice di Procedura Civile
- 753 Codice Penale
- 386 TUB D.Lgs. 385/1993
- 321 T.U. Sicurezza
- 236 TUIR
- 169 D.IVA
- 151 Testo Unico Edilizia
- 113 AI Act
- 109 D.Lgs. 231/2001
- 99 GDPR
- 93 DSA
- 88 D.Lgs. 276/2003 (Biagi)
- 66 Jobs Act Contratti
- 54 CIG
- 46 NIS2
- 44 D.Lgs. 28/2010
- 41 L. 300/1970 (Statuto Lavoratori)
- 39 L. 590/1965
- 37 Statuto Contribuente
- 35 Dir. 2011/83
- 29 Roma I
- 27 Dir. 2019/771
- 19 Reg. CE 261/2004
- 19 D.Lgs. 122/2005
- 18 D.Lgs. 70/2003
- 16 L. 431/1998
- 13 D.Lgs. 231/2002
- 12 D.Lgs. 23/2015
- 11 Dir. 93/13

## FAIL test analysis: 15 tests examined

Of 15 FAIL tests, only **3 are caused by corpus gaps**. The remaining **12 are agent/search quality issues** where the needed articles ARE present in the corpus but the agent fails to retrieve or use them correctly.

## TRUE CORPUS GAPS (3 tests, 2 sources)

### Gap 1: L. 392/1978 — Equo canone (Disciplina delle locazioni di immobili urbani)

- **Needed by**: TC69
- **Specific articles needed**: Art. 6 (successione nel contratto di locazione per morte del conduttore)
- **Source**: Normattiva
- **URN**: urn:nir:stato:legge:1978-07-27;392
- **URL**: https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:1978-07-27;392
- **Priority**: HIGH
- **Estimated articles**: ~84
- **Status in corpus-sources.ts**: `lifecycle: "planned"` — source is already defined but NOT yet loaded
- **Notes**: This is a foundational source for residential tenancy law. Art. 6 governs succession in tenancy contracts when the tenant dies — the test expects the agent to know that the contract does NOT automatically terminate, and that cohabitants (spouse, heirs, family members) have the right to succeed in the contract. Without this source, the agent defaults to citing art. 1614 c.c. (generic lease termination) which gives an incorrect answer.

### Gap 2: DPR 602/1973 — Disposizioni sulla riscossione delle imposte sul reddito

- **Needed by**: TC27
- **Specific articles needed**: Art. 76 (limiti al pignoramento immobiliare da parte dell'agente della riscossione)
- **Source**: Normattiva
- **URN**: urn:nir:stato:decreto.del.presidente.della.repubblica:1973-09-29;602
- **URL**: https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.del.presidente.della.repubblica:1973-09-29;602
- **Priority**: HIGH
- **Estimated articles**: ~90
- **Status in corpus-sources.ts**: NOT DEFINED — needs to be added
- **Notes**: Art. 76 is the critical provision that limits home seizure to only the tax collection agency (Agenzia Entrate-Riscossione), NOT private creditors. This is a common legal misconception (people think the first home is always protected). Without this source, the agent cannot correctly distinguish between public vs. private creditors in the context of home seizure.

### Gap 3: Art. 570-bis c.p. (D.Lgs. 21/2018) — Missing article within existing Codice Penale

- **Needed by**: TC56
- **Specific articles needed**: Art. 570-bis c.p. (violazione degli obblighi di assistenza familiare in caso di separazione o scioglimento del matrimonio)
- **Source**: Already in Codice Penale corpus, but art. 570-bis is MISSING
- **Priority**: MEDIUM
- **Estimated articles**: 1 (single article to add)
- **Status**: The Codice Penale has 753 articles loaded, but art. 570-bis (added by D.Lgs. 21/2018) is not among them. Art. 570 IS present. This is likely because the CP was loaded from a source that predates D.Lgs. 21/2018 or the article numbering (with -bis suffix) was not captured during ingest.
- **Fix**: Either re-ingest the full Codice Penale from an updated Normattiva source, or manually add art. 570-bis. D.Lgs. 21/2018 itself is a very small decree (riserva di codice) that moved scattered criminal provisions into the CP — only art. 570-bis needs to be added.

---

## NOT CORPUS GAPS — Agent/Search Quality Issues (12 tests)

These tests FAIL despite all required articles being present in the corpus. The root cause is the agent's inability to retrieve or correctly use the existing articles. These require improvements to the search/retrieval pipeline or agent prompts, NOT new data.

### TC22 (Score: 30/100) — Ultra petita, art. 112 c.p.c.
- **Required**: art. 112 c.p.c. -- **PRESENT** in corpus
- **Agent issue**: Found art. 1226 c.c. (equitable damages) instead of art. 112 c.p.c. (correspondence between request and ruling). The question-prep agent failed to reformulate the colloquial question into the correct legal query targeting ultra petita.

### TC23 (Score: 25/100) — Riforma Cartabia, art. 171-ter c.p.c.
- **Required**: art. 171-ter c.p.c. -- **PRESENT** in corpus
- **Agent issue**: Did not retrieve art. 171-ter despite it being in the corpus. The search did not connect "deposito documenti nuovi in udienza" with the Cartabia reform. The question-prep agent should include "riforma Cartabia" or "art. 171-ter" in the legal reformulation.

### TC33 (Score: 35/100) — Licenziamento per giusta causa durante malattia
- **Required**: art. 2110 + art. 2119 c.c. -- **BOTH PRESENT** in corpus
- **Agent issue**: Retrieved both articles but failed to articulate the correct legal conclusion (that art. 2110 protection does NOT apply to giusta causa dismissals under art. 2119). This is a reasoning quality issue, not a retrieval issue.

### TC34 (Score: 30/100) — Legittimari e azione di riduzione
- **Required**: art. 536, 553, 554 c.c. -- **ALL PRESENT** in corpus
- **Agent issue**: Mentioned art. 537, 538, 565 but not the correct articles. Retrieved wrong articles from the same area of law. Search ranking issue.

### TC39 (Score: 28/100) — Clausola risolutiva vs. condizione risolutiva
- **Required**: art. 1353 + art. 1456 c.c. -- **BOTH PRESENT** in corpus
- **Agent issue**: Found art. 1456 but missed art. 1353. Did not recognize the ambiguity between the two institutes. Reasoning/prompt quality issue.

### TC43 (Score: 45/100) — Clausola vessatoria costruttore
- **Required**: art. 33 Codice del Consumo -- **PRESENT** in corpus
- **Agent issue**: Found articles about "tutela acquirenti immobili" but not art. 33 Cod. Consumo. The question-prep agent should connect "clausola unilaterale costruttore" with "clausola vessatoria B2C". Search failed to bridge the gap between the colloquial framing and the legal category.

### TC45 (Score: 20/100) — Responsabilita notaio per mancata visura
- **Required**: art. 1176 c.c. -- **PRESENT** in corpus
- **Agent issue**: Generic response without retrieving the specific article. The legal query reformulation was too vague.

### TC48 (Score: 50/100) — Registrazione conversazione partecipante
- **Required**: art. 617 c.p. -- **PRESENT** in corpus
- **Agent issue**: Found art. 617-bis and 617-ter but failed to draw the critical distinction between participant recording (legal) vs. third-party interception (illegal). Reasoning quality issue.

### TC52 (Score: 15/100) — Mutuo verbale e prova testimoniale
- **Required**: art. 2721 c.c. -- **PRESENT** in corpus
- **Agent issue**: Retrieved completely wrong articles (art. 2033, 2034, 2041 on unjust enrichment instead of art. 2721 on testimonial proof limits). Major search/prep failure — the query reformulation went in the wrong direction entirely.

### TC59 (Score: 55/100) — Obbligazione in valuta estera
- **Required**: art. 1277, 1278, 1279 c.c. -- **ALL PRESENT** in corpus
- **Agent issue**: Found art. 1278 but not 1277 and 1279. Partial retrieval, incomplete reasoning. Close to passing.

### TC61 (Score: 30/100) — Asta giudiziaria e abusi edilizi
- **Required**: art. 46 DPR 380/2001 -- **PRESENT** in corpus
- **Agent issue**: Mentioned art. 46 but did not explain its special application to forced sales. Retrieval was partially successful but reasoning was insufficient.

### TC70 (Score: 35/100) — Testamento olografo con data incompleta
- **Required**: art. 602, 606 c.c. -- **BOTH PRESENT** in corpus
- **Agent issue**: Retrieved art. 602 and 606 but confused nullity with annullability. The agent incorrectly stated the will is invalid (nullo) when it should be annullable (art. 606 co.2). Pure reasoning/quality error.

---

## Summary and Recommendations

### Data Engineering actions (corpus gaps to fill):

| Priority | Source | Tests Fixed | Effort |
|----------|--------|-------------|--------|
| HIGH | L. 392/1978 (Equo canone) | TC69 | Load ~84 art. via Normattiva directAkn. Source already defined in corpus-sources.ts as `legge_392_1978` with lifecycle "planned". |
| HIGH | DPR 602/1973 (Riscossione imposte) | TC27 | Define new source in corpus-sources.ts, then load ~90 art. via Normattiva. |
| MEDIUM | Art. 570-bis c.p. (from D.Lgs. 21/2018) | TC56 | Add 1 missing article to existing Codice Penale. May require re-ingest of CP or manual insertion. |

### NOT Data Engineering scope (agent quality issues affecting 12 tests):

These 12 tests require improvements to the **question-prep agent**, **search/retrieval pipeline**, and/or **corpus-agent reasoning quality**. Suggested areas for QA/Architecture:

1. **Question-prep reformulation**: TC22, TC23, TC34, TC43, TC45, TC52 all show the prep agent generating legal queries that miss the core legal institute. The prep agent should be tuned to better map colloquial language to precise legal terminology.

2. **Search ranking/retrieval**: TC34, TC43, TC52 show the search retrieving wrong articles from the corpus despite correct articles being available. Vector similarity search may need re-ranking or keyword boosting.

3. **Agent reasoning quality**: TC33, TC39, TC48, TC61, TC70 show the agent retrieving relevant articles but drawing incorrect legal conclusions. This is a prompt quality issue — the corpus-agent prompt should be improved to better handle legal distinctions (nullo vs. annullabile, general rule vs. exception, etc.).

4. **Near-pass tests**: TC59 (55/100) is close to passing and may be fixed by minor search improvements.
