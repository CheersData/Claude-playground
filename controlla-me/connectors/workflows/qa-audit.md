# Workflow: Corpus Quality Audit

## Input
- **Domain**: `{DOMAIN}` — the corpus domain to audit (e.g. "legal")

## Objective
Run the automated QA script, interpret results, and either fix issues
directly or trigger connector workflows for missing data sources.

## Phase 1: Run automated audit

```bash
npx tsx scripts/qa-corpus.ts --domain={DOMAIN}
```

Read the QA report at `corpus-configs/{DOMAIN}.qa-report.json`.

## Phase 2: Triage issues

Classify each issue into one of these action types:

### A) Config Fix (can be fixed immediately)
- **hierarchy_gap**: Add missing hierarchy rules to `corpus-configs/{DOMAIN}.json`
- **institute_missing_landmark**: Add institute rules for uncovered landmark articles
- **term_pattern_missing**: Add missing term patterns
- **term_pattern_invalid**: Fix regex syntax

For these issues, proceed to the **Remediate** workflow.

### B) Source Fix (needs connector workflow)
- **source_empty_text**: Articles with no text need a better data source
- **source_recommended**: Missing law codes need a new connector

For these issues, trigger the connector workflow:
```bash
./scripts/run-connector.sh {source-name} {DOMAIN}
```

### C) Manual Review (needs human decision)
- **hierarchy_overlap**: May be intentional — flag for review
- **source_fetch_error**: Network issue or dataset moved
- **cross_validation**: Structural inconsistency

For these, create a note in the report and move on.

## Phase 3: Execute fixes

### For Config Fixes:
1. Read the current `corpus-configs/{DOMAIN}.json`
2. Read the QA report for specific issue details
3. Apply fixes directly to the JSON config
4. Re-run the QA script to verify fixes
5. If score improves and no new critical issues, commit changes

### For Source Fixes:
1. For each missing source, read `connectors/workflows/research.md`
2. Research the source
3. If viable, trigger `./scripts/run-connector.sh`
4. If not viable, document why in `connectors/research/{source}.md`

### For Quality Improvements:
After fixing config and adding sources, look for these enrichments:
1. **Hierarchy completeness**: Every article should be classifiable
2. **Institute depth**: Landmark articles need rich keyword sets
3. **Term patterns**: Add patterns for frequently searched legal concepts
4. **Cross-references**: Articles that reference each other should share keywords

## Phase 4: Re-audit and report

```bash
npx tsx scripts/qa-corpus.ts --domain={DOMAIN}
```

Compare before/after scores. Target: score >= 75.

## Success Criteria
- QA score >= 75 (up from initial score)
- Zero critical issues
- All hierarchy gaps < 50 articles filled
- All landmark articles have institute mapping
- Report saved and committed

## Output
- Updated `corpus-configs/{DOMAIN}.json`
- Updated `corpus-configs/{DOMAIN}.qa-report.json`
- Optional: new connector files in `connectors/`
- Optional: research reports in `connectors/research/`
