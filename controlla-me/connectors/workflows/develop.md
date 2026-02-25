# Workflow: Develop Connector

## Input
- **Source name**: `{SOURCE_NAME}`
- **Domain**: `{DOMAIN}`
- **Research report**: `connectors/research/{SOURCE_NAME}.md`

## Objective
Generate a TypeScript connector that implements the `CorpusConnector` interface,
using the information gathered during the Research phase.

## Prerequisites
1. Read `connectors/template.ts` to understand the interface
2. Read `connectors/research/{SOURCE_NAME}.md` for source-specific details
3. Read `lib/db/corpus.ts` for the `CorpusArticle` type definition
4. Optionally read an existing connector for reference patterns

## Instructions

### 1. Create the connector file

Save to: `connectors/{SOURCE_NAME}.ts`

```typescript
import { defineConnector, type RawRecord } from "./template";
import type { CorpusArticle } from "../lib/db/corpus";

export default defineConnector({
  id: "{SOURCE_NAME}",
  name: "Human Readable Name",
  domain: "{DOMAIN}",
  sourceUrl: "https://...",

  async fetch(opts) {
    const limit = opts?.limit;
    // Implement data fetching logic here
    // Use the access method identified in research
    // Respect rate limits
    // Return raw records
    return [];
  },

  normalize(records) {
    // Map raw records to CorpusArticle format
    // Apply the field mapping from research report
    return records.map((record) => ({
      lawSource: "...",
      articleReference: "...",
      articleTitle: "...",
      articleText: "...",
      hierarchy: {},
      keywords: [],
      relatedInstitutes: [],
      isInForce: true,
      domain: "{DOMAIN}",
    }));
  },

  async validate() {
    try {
      const records = await this.fetch({ limit: 5 });
      const articles = this.normalize(records);

      const errors: string[] = [];

      for (const article of articles) {
        if (!article.articleText || article.articleText.length < 10) {
          errors.push(`Empty/short text for ${article.articleReference}`);
        }
        if (!article.articleReference) {
          errors.push("Missing articleReference");
        }
        if (!article.lawSource) {
          errors.push("Missing lawSource");
        }
      }

      return {
        ok: errors.length === 0 && articles.length > 0,
        sampleCount: articles.length,
        errors,
        samples: articles.slice(0, 3),
      };
    } catch (err) {
      return {
        ok: false,
        sampleCount: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      };
    }
  },
});
```

### 2. Implementation guidelines

- **Error handling**: Use try/catch, return meaningful error messages
- **Rate limiting**: Add delays between requests if needed (`await sleep(ms)`)
- **Pagination**: Handle paginated APIs correctly
- **Text cleaning**: Remove HTML tags, normalize whitespace, trim text
- **Encoding**: Handle Italian characters (à, è, é, ì, ò, ù) correctly
- **Idempotency**: `articleReference` must be stable across runs

### 3. Do NOT
- Hard-code credentials — use `process.env` for API keys
- Skip validation — every connector must implement `validate()`
- Ignore rate limits — always respect source TOS
- Import from `node_modules` without checking `package.json`

## Output
- File: `connectors/{SOURCE_NAME}.ts`
- Must implement the full `CorpusConnector` interface
- Must be valid TypeScript (check with `npx tsc --noEmit`)
