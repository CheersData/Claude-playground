#!/bin/bash
# Seed middleware configs into the database via admin API
# Usage: bash seed-configs.sh [BASE_URL]
#
# Default BASE_URL: http://localhost:8080

set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
EXAMPLES_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🌱 Seeding middleware configs..."
echo "   Target: $BASE_URL"
echo ""

# Count successes/failures
SUCCESS=0
FAIL=0

for config_file in "$EXAMPLES_DIR"/*.json; do
    slug=$(jq -r '.slug' "$config_file")
    name=$(jq -r '.name' "$config_file")

    echo -n "  → $slug ($name)... "

    response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/admin/configs" \
        -H "Content-Type: application/json" \
        -d @"$config_file")

    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -1)

    if [ "$http_code" = "201" ] || [ "$http_code" = "200" ]; then
        echo "✅ ($http_code)"
        SUCCESS=$((SUCCESS + 1))
    else
        echo "❌ ($http_code) $body"
        FAIL=$((FAIL + 1))
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Successo: $SUCCESS"
echo "  ❌ Falliti:  $FAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAIL -gt 0 ]; then
    exit 1
fi

echo ""
echo "Test rapido — echo-test:"
echo "  curl -X POST $BASE_URL/api/middleware/test/echo \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"nome\": \"Mattia\", \"email\": \"mattia@test.com\", \"importo\": 42.50}'"
