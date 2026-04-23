#!/bin/bash
# Run all flow tests
set -e

DIR="$(dirname "$0")"
TOTAL_PASS=0
TOTAL_FAIL=0

echo "╔══════════════════════════════════════╗"
echo "║  Gateway Flow Integration Tests      ║"
echo "║  Target: ${GATEWAY_URL:-http://localhost:9090}  ║"
echo "╚══════════════════════════════════════╝"
echo ""

for test_script in "$DIR"/flow-*.sh; do
  echo ""
  echo "────────────────────────────────────────"
  bash "$test_script"
  echo ""
done

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  All flow tests complete!            ║"
echo "╚══════════════════════════════════════╝"
