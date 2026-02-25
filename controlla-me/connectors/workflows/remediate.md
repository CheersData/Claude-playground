# Workflow: Remediate Corpus Issues

## Input
- **Domain**: `{DOMAIN}`
- **QA Report**: `corpus-configs/{DOMAIN}.qa-report.json`
- **Target issues**: specific issue IDs or categories to fix

## Objective
Read the QA report, fix the identified issues in the corpus config,
and re-validate. This workflow handles config-level fixes only.
For missing data sources, use the connector workflow instead.

## Instructions

### 1. Read the QA report

```
Read corpus-configs/{DOMAIN}.qa-report.json
```

Focus on issues with severity "critical" and "high" first.

### 2. Fix hierarchy gaps

For each `hierarchy_gap` issue:

1. Identify which Book of the Civil Code the gap belongs to
2. Look up the correct hierarchy using this reference:

```
Libro I (art. 1-455): Delle persone e della famiglia
  Titolo I (1-10): Delle persone fisiche
  Titolo II (11-35): Delle persone giuridiche
  Titolo III (36-42): Del domicilio e della residenza
  Titolo IV (43-73): Dell'assenza e della dichiarazione di morte presunta
  Titolo V (74-78): Della parentela e dell'affinità
  Titolo VI (79-230): Del matrimonio
  Titolo VII (231-314): Della filiazione
  Titolo VIII (315-342): Dell'adozione di persone di maggiore età
  Titolo IX (343-399): Della responsabilità genitoriale e dei diritti e doveri del figlio
  Titolo X (400-413): Della tutela e dell'emancipazione
  Titolo XI (414-432): Dell'affiliazione — abrogato
  Titolo XII (414-432): Delle misure di protezione
  Titolo XIII (433-455): Degli alimenti

Libro II (art. 456-809): Delle successioni
  Titolo I (456-586): Disposizioni generali sulle successioni
  Titolo II (565-586): Delle successioni legittime
  Titolo III (587-712): Delle successioni testamentarie
  Titolo IV (713-768): Della divisione
  Titolo V (769-809): Delle donazioni

Libro III (art. 810-1172): Della proprietà
  Titolo I (810-831): Dei beni
  Titolo II (832-951): Della proprietà
  Titolo III (952-956): Della superficie
  Titolo IV (957-1026): Dell'enfiteusi
  Titolo V (1027-1099): Delle servitù prediali
  Titolo VI (1100-1116): Dell'usufrutto, dell'uso e dell'abitazione
  Titolo VII (1100-1139): Della comunione
  Titolo VIII (1140-1172): Del possesso

Libro IV (art. 1173-2059): Delle obbligazioni
  Titolo I (1173-1320): Delle obbligazioni in generale
  Titolo II (1321-1469): Dei contratti in generale
  Titolo III (1470-1986): Dei singoli contratti
  Titolo IV (1987-2042): Delle promesse unilaterali e dei titoli di credito
  Titolo IX (2043-2059): Dei fatti illeciti

Libro V (art. 2060-2642): Del lavoro
  Titolo I (2060-2081): Della disciplina delle attività professionali
  Titolo II (2082-2246): Del lavoro nell'impresa
  Titolo III (2247-2290): Del lavoro autonomo
  Titolo IV (2291-2312): Della società semplice
  Titolo V (2247-2574): Delle società
  Titolo VI (2555-2574): Delle società cooperative e delle mutue assicuratrici
  Titolo VII (2575-2594): Dell'associazione in partecipazione
  Titolo VIII (2555-2642): Dell'azienda
  Titolo IX (2575-2642): Dei diritti sulle opere dell'ingegno

Libro VI (art. 2643-2969): Della tutela dei diritti
  Titolo I (2643-2696): Della trascrizione
  Titolo II (2697-2739): Delle prove
  Titolo III (2740-2783): Della responsabilità patrimoniale
  Titolo IV (2784-2899): Delle cause di prelazione
  Titolo V (2900-2969): Della prescrizione e della decadenza
```

3. Create a hierarchy rule entry for each gap following the format in the existing config
4. Add to `corpus-configs/{DOMAIN}.json` in the `hierarchy` array

### 3. Fix institute gaps

For each `institute_missing_landmark` issue:

1. Read the article number and description from the issue
2. Determine which legal institute it belongs to
3. Create an institute rule with:
   - Appropriate `from`/`to` range (group nearby related articles)
   - `institutes` array with legal institute identifiers
   - `keywords` array with search terms

### 4. Fix term pattern issues

For `term_pattern_missing`:
- Add new regex patterns following existing format
- Use case-insensitive patterns
- Test regex validity before adding

For `term_pattern_invalid`:
- Fix the regex syntax error
- Test with a sample text to verify

### 5. Validate fixes

After making changes:

```bash
npx tsx scripts/qa-corpus.ts --domain={DOMAIN}
```

Compare new score to previous score. Verify:
- No new critical issues introduced
- Fixed issues no longer appear
- Score improved

### 6. If corpus needs reload

After config changes, the live DB data won't reflect the fixes until reload:

```bash
npx tsx scripts/seed-corpus.ts --domain={DOMAIN}
```

This re-processes all articles with updated hierarchy/institute/keyword rules.

## Do NOT
- Delete existing hierarchy or institute rules (they may be correct)
- Change data source configurations (use connector workflow for that)
- Modify the QA script itself
- Invent article numbers or legal references — use the reference above

## Output
- Updated `corpus-configs/{DOMAIN}.json` with fixes
- New `corpus-configs/{DOMAIN}.qa-report.json` after re-audit
- Score improvement documented
