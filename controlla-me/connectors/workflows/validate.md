# Workflow: Validate Connector

## Input
- **Source name**: `{SOURCE_NAME}`
- **Connector file**: `connectors/{SOURCE_NAME}.ts`
- **Registry**: `connectors/registry.json`

## Objective
Run the connector's `validate()` method, verify the output is correct,
fix any issues, and register the connector if validation passes.

## Instructions

### 1. Run validation

Execute the connector's validate method:

```bash
npx tsx -e "
  import connector from './connectors/{SOURCE_NAME}';
  const result = await connector.validate();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
"
```

### 2. Check validation output

Verify ALL of the following:
- [ ] `ok` is `true`
- [ ] `sampleCount` is >= 1 (ideally 5)
- [ ] `errors` array is empty
- [ ] Sample articles have non-empty `articleText` (>= 50 chars)
- [ ] Sample articles have valid `articleReference`
- [ ] Sample articles have correct `lawSource`
- [ ] Sample articles have correct `domain`
- [ ] Text content is clean (no HTML tags, proper encoding)

### 3. If validation fails

1. Read the error messages carefully
2. Read the connector source code
3. Identify the root cause:
   - Network error → check URL, auth, connectivity
   - Parse error → check data format, field mapping
   - Empty data → check API endpoint, query params
   - Type error → check TypeScript types
4. Fix the connector code
5. Re-run validation
6. Repeat until validation passes (max 3 attempts)

### 4. If validation passes — Register the connector

Update `connectors/registry.json`:

```json
{
  "id": "{SOURCE_NAME}",
  "name": "Human Readable Name",
  "domain": "{DOMAIN}",
  "status": "validated",
  "filePath": "connectors/{SOURCE_NAME}.ts",
  "configPath": null,
  "sourceUrl": "https://...",
  "validatedAt": "YYYY-MM-DDTHH:mm:ssZ",
  "sampleCount": N,
  "note": "Brief description of what this connector provides"
}
```

### 5. Optional: Add to corpus config

If the connector should be loaded automatically with a domain's corpus,
add a dataSource entry to the relevant `corpus-configs/{DOMAIN}.json`:

```json
{
  "name": "Source Name",
  "type": "connector",
  "connectorId": "{SOURCE_NAME}",
  "lawSource": "Name of the law/regulation"
}
```

## Success criteria
- Connector `validate()` returns `ok: true`
- At least 1 sample article is returned with valid content
- Connector is registered in `registry.json` with status "validated"
- No TypeScript errors

## Output
- Updated `connectors/registry.json` with new entry
- Optionally updated `corpus-configs/{DOMAIN}.json`
