#!/bin/bash
# run-qa.sh — Run the Corpus Quality Audit + Remediation loop
#
# Usage:
#   ./scripts/run-qa.sh <domain>
#   ./scripts/run-qa.sh legal
#   ./scripts/run-qa.sh legal --fix    # also auto-fix config issues
#
# Phases:
#   1. Run automated QA audit
#   2. (If --fix) Trigger Claude Code to remediate issues
#   3. Re-audit to verify improvements

set -euo pipefail

DOMAIN="${1:?Usage: ./scripts/run-qa.sh <domain> [--fix]}"
FIX_FLAG="${2:-}"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Corpus Quality Audit: $DOMAIN"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Phase 1: Audit ───

echo "═══ Phase 1: Automated Audit ═══"
echo ""

npx tsx scripts/qa-corpus.ts --domain="$DOMAIN" || true

echo ""
echo "✓ Audit complete: corpus-configs/$DOMAIN.qa-report.json"
echo ""

# ─── Phase 2: Remediate (if --fix) ───

if [ "$FIX_FLAG" = "--fix" ]; then
  echo "═══ Phase 2: Auto-Remediate ═══"
  echo ""

  claude -p "Read connectors/workflows/qa-audit.md. \
  Read the QA report at corpus-configs/$DOMAIN.qa-report.json. \
  Read the current config at corpus-configs/$DOMAIN.json. \
  Execute Phase 3 (Execute fixes) from the qa-audit workflow. \
  Focus on config fixes first (hierarchy gaps, institute gaps, term patterns). \
  Follow connectors/workflows/remediate.md for the fix instructions. \
  Domain is $DOMAIN." \
    --allowedTools "Read,Write,Edit,Bash,Glob,Grep"

  echo ""
  echo "✓ Remediation complete"
  echo ""

  # ─── Phase 3: Re-audit ───

  echo "═══ Phase 3: Re-Audit ═══"
  echo ""

  npx tsx scripts/qa-corpus.ts --domain="$DOMAIN" || true

  echo ""
  echo "✓ Re-audit complete"
  echo ""
fi

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ QA workflow complete for: $DOMAIN"
echo "║  Report: corpus-configs/$DOMAIN.qa-report.json"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
