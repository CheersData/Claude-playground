# Workflow: Research Integration Source

## Input
- **Source name**: `{SOURCE_NAME}` — the external data source to research
- **Target domain**: `{DOMAIN}` — the corpus domain (e.g. "legal", "fiscal")

## Objective
Research the target data source thoroughly and produce a structured report
that will be used by the Develop workflow to generate a connector.

## Instructions

1. **Search official documentation**
   - Find the official API docs, developer portal, or data download page
   - Identify if data is available via REST API, dataset download, scraping, or other means

2. **Search community resources**
   - Search Reddit, StackOverflow, GitHub for integration experiences
   - Look for existing npm/Python libraries that wrap this source
   - Note any common pitfalls or gotchas

3. **Analyze data format**
   - Identify the structure of records (JSON, HTML, CSV, XML)
   - Map source fields to our CorpusArticle schema:
     - `lawSource` — which law/regulation
     - `articleReference` — article identifier (e.g. "Art. 1")
     - `articleTitle` — title of the article
     - `articleText` — full text content
   - Note any extra metadata available (dates, cross-references, status)

4. **Assess feasibility**
   - Authentication: API key, OAuth, or open access?
   - Rate limits: what are the constraints?
   - Data volume: how many records are available?
   - Legal: any TOS restrictions on automated access?

5. **Write the report**
   Save the report to: `connectors/research/{SOURCE_NAME}.md`

## Report Template

```markdown
# Research Report: {SOURCE_NAME}

## Source Overview
- URL: ...
- Type: REST API / Dataset / Scraping / File download
- Domain: {DOMAIN}

## Access Method
- Authentication: None / API Key / OAuth
- Rate Limits: ...
- TOS Notes: ...

## Data Format
- Format: JSON / HTML / CSV / XML
- Record structure:
  - field_1: description
  - field_2: description
  ...

## Field Mapping to CorpusArticle
| Source Field | CorpusArticle Field | Notes |
|-------------|-------------------|-------|
| ... | lawSource | ... |
| ... | articleReference | ... |
| ... | articleTitle | ... |
| ... | articleText | ... |

## Existing Libraries / Implementations
- library_name: URL, notes
- ...

## Known Issues / Gotchas
- ...

## Estimated Volume
- Total records available: ~N
- Records relevant to our domain: ~N

## Confidence Assessment
- **Confidence**: Alta / Media / Bassa
- **Reason**: ...
- **Estimated development effort**: Low / Medium / High
```

## Output
- File: `connectors/research/{SOURCE_NAME}.md`
- Must include all sections from the template above
