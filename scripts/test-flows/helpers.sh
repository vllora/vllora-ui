#!/bin/bash
# Shared helpers for flow tests

BASE="${GATEWAY_URL:-http://localhost:9090}/finetune"
PASS=0
FAIL=0

post()  { curl -sf -X POST   "$1" -H 'Content-Type: application/json' -d "$2"; }
put()   { curl -sf -X PUT    "$1" -H 'Content-Type: application/json' -d "$2"; }
patch() { curl -sf -X PATCH  "$1" -H 'Content-Type: application/json' -d "$2"; }
get()   { curl -sf "$1"; }
del()   { curl -sf -X DELETE "$1"; }

assert_eq() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $label (got: $actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $label (expected: $expected, got: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_gte() {
  local label="$1" actual="$2" min="$3"
  if [ "$actual" -ge "$min" ] 2>/dev/null; then
    echo "  ✓ $label (got: $actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $label (expected >= $min, got: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_empty() {
  local label="$1" actual="$2"
  if [ -n "$actual" ] && [ "$actual" != "null" ]; then
    echo "  ✓ $label (got: $actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $label (expected non-empty, got: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_http_ok() {
  local label="$1" url="$2" method="${3:-GET}"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" -H 'Content-Type: application/json' ${4:+-d "$4"})
  if [ "$status" -ge 200 ] && [ "$status" -lt 300 ]; then
    echo "  ✓ $label (HTTP $status)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $label (HTTP $status)"
    FAIL=$((FAIL + 1))
  fi
}

create_workflow() {
  local name="${1:-test-flow}"
  local obj="${2:-test objective}"
  post "$BASE/workflows" "{\"name\":\"$name\",\"objective\":\"$obj\"}"
}

summary() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Passed: $PASS  Failed: $FAIL"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━"
  [ "$FAIL" -eq 0 ] && return 0 || return 1
}
