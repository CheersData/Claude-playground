#!/bin/bash
# run-connector.sh — Run the full connector workflow (Research → Develop → Validate)
#
# Usage:
#   ./scripts/run-connector.sh <source-name> <domain>
#
# Examples:
#   ./scripts/run-connector.sh normattiva legal
#   ./scripts/run-connector.sh agenzia-entrate fiscal
#
# Each phase runs as a separate Claude Code session.
# Results accumulate in connectors/ directory.

set -euo pipefail

SOURCE="${1:?Usage: ./scripts/run-connector.sh <source-name> <domain>}"
DOMAIN="${2:?Usage: ./scripts/run-connector.sh <source-name> <domain>}"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Connector Workflow: $SOURCE"
echo "║  Domain: $DOMAIN"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Phase 1: Research ───

echo "═══ Phase 1: Research ═══"
echo ""

claude -p "Read connectors/workflows/research.md and execute it for source=$SOURCE domain=$DOMAIN. \
Search the web thoroughly for API documentation, existing implementations, and community experiences. \
Write the research report to connectors/research/$SOURCE.md." \
  --allowedTools "WebSearch,WebFetch,Read,Write,Glob,Grep"

echo ""
echo "✓ Research complete: connectors/research/$SOURCE.md"
echo ""

# ─── Phase 2: Develop ───

echo "═══ Phase 2: Develop ═══"
echo ""

claude -p "Read connectors/workflows/develop.md. \
Read the research report at connectors/research/$SOURCE.md. \
Read connectors/template.ts for the interface. \
Read lib/db/corpus.ts for the CorpusArticle type. \
Generate the connector at connectors/$SOURCE.ts following the template and research. \
Domain is $DOMAIN." \
  --allowedTools "Read,Write,Glob,Grep"

echo ""
echo "✓ Connector developed: connectors/$SOURCE.ts"
echo ""

# ─── Phase 3: Validate ───

echo "═══ Phase 3: Validate ═══"
echo ""

claude -p "Read connectors/workflows/validate.md. \
Validate connectors/$SOURCE.ts by running it with the validate() method. \
Fix any issues you find (up to 3 attempts). \
If validation passes, update connectors/registry.json to register the connector. \
Source: $SOURCE, Domain: $DOMAIN." \
  --allowedTools "Read,Write,Edit,Bash,Glob,Grep"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Connector workflow complete for: $SOURCE"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
