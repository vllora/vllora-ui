#!/usr/bin/env bash
#
# Run finetune agent on multiple test scenarios and produce a summary.
#
# Usage:
#   ./scripts/run-finetune-batch.sh <test-samples-dir> [scenario1 scenario2 ...]
#   ./scripts/run-finetune-batch.sh ~/test-samples
#   ./scripts/run-finetune-batch.sh ~/test-samples medical-qa tax-credit-calculator
#
# What it does:
#   1. Discovers scenarios in <test-samples-dir> (or uses the listed ones)
#   2. Runs each scenario sequentially via run-finetune-agent.sh
#   3. Collects verdict.json from each run
#   4. Prints a summary table + writes batch-summary.json
#
# Environment variables:
#   GATEWAY_URL    Gateway URL (default: http://localhost:9090)
#   MAX_TURNS      Max agent turns per scenario (default: 200)
#   CLAUDE_MODEL   Model override
#   SKIP_ON_FAIL   If "true", skip remaining scenarios after first FAIL (default: false)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ─── Args ────────────────────────────────────────────────────────────────────

if [[ $# -lt 1 ]]; then
  cat <<'USAGE'
Usage: run-finetune-batch.sh <test-samples-dir> [scenario1 scenario2 ...]

If no scenarios are listed, runs all directories containing finetune-prompt.md.

Examples:
  ./scripts/run-finetune-batch.sh ~/test-samples
  ./scripts/run-finetune-batch.sh ~/test-samples medical-qa food-label-compliance
USAGE
  exit 1
fi

SAMPLES_DIR="$(cd "$1" 2>/dev/null && pwd)" || {
  echo "Error: Directory does not exist: $1"
  exit 1
}
shift

SKIP_ON_FAIL="${SKIP_ON_FAIL:-false}"
BATCH_ID="batch-$(date +%Y%m%d-%H%M%S)"
BATCH_DIR="$SAMPLES_DIR/.batch-runs/$BATCH_ID"
mkdir -p "$BATCH_DIR"

# ─── Discover scenarios ──────────────────────────────────────────────────────

SCENARIOS=()
if [[ $# -gt 0 ]]; then
  # Use provided scenario names
  for name in "$@"; do
    dir="$SAMPLES_DIR/$name"
    if [[ -d "$dir" ]]; then
      SCENARIOS+=("$name")
    else
      echo "Warning: Scenario directory not found: $dir (skipping)"
    fi
  done
else
  # Auto-discover: any dir with finetune-prompt.md
  for dir in "$SAMPLES_DIR"/*/; do
    if [[ -f "$dir/finetune-prompt.md" ]]; then
      SCENARIOS+=("$(basename "$dir")")
    fi
  done
fi

if [[ ${#SCENARIOS[@]} -eq 0 ]]; then
  echo "Error: No scenarios found in $SAMPLES_DIR"
  echo "Each scenario dir needs a finetune-prompt.md file."
  exit 1
fi

echo "═══════════════════════════════════════════════════════"
echo "  Batch:      $BATCH_ID"
echo "  Scenarios:  ${#SCENARIOS[@]}"
for s in "${SCENARIOS[@]}"; do
  echo "    - $s"
done
echo "  Results:    $BATCH_DIR/"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── Run scenarios ───────────────────────────────────────────────────────────

declare -A VERDICTS
declare -A RUN_DIRS
declare -A EXIT_CODES
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
SKIP_COUNT=0

for i in "${!SCENARIOS[@]}"; do
  scenario="${SCENARIOS[$i]}"
  n=$((i + 1))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  [$n/${#SCENARIOS[@]}] $scenario"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  scenario_dir="$SAMPLES_DIR/$scenario"

  set +e
  BATCH_MODE=true "$SCRIPT_DIR/run-finetune-agent.sh" "$scenario_dir"
  run_exit=$?
  set -e

  EXIT_CODES[$scenario]=$run_exit

  # Find the latest run dir (most recent by name sort)
  latest_run=""
  for run_dir in "$scenario_dir"/finetune-runs/run-*/; do
    [[ -d "$run_dir" ]] && latest_run="$run_dir"
  done
  RUN_DIRS[$scenario]="${latest_run:-unknown}"

  # Read verdict
  verdict_file="${latest_run}verdict.json"
  if [[ -f "$verdict_file" ]]; then
    overall=$(python3 -c "import json; print(json.load(open('$verdict_file'))['overall'])" 2>/dev/null || echo "ERROR")
    VERDICTS[$scenario]="$overall"

    # Copy verdict to batch dir for easy access
    cp "$verdict_file" "$BATCH_DIR/${scenario}.verdict.json"
  else
    VERDICTS[$scenario]="ERROR"
  fi

  case "${VERDICTS[$scenario]}" in
    PASS) PASS_COUNT=$((PASS_COUNT + 1)) ;;
    FAIL) FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
    WARN) WARN_COUNT=$((WARN_COUNT + 1)) ;;
    *)    FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
  esac

  # Check SKIP_ON_FAIL
  if [[ "$SKIP_ON_FAIL" == "true" && "${VERDICTS[$scenario]}" == "FAIL" ]]; then
    echo ""
    echo "⏭  SKIP_ON_FAIL is set — skipping remaining scenarios"
    remaining=$((${#SCENARIOS[@]} - n))
    SKIP_COUNT=$remaining
    break
  fi
done

# ─── Write batch summary ────────────────────────────────────────────────────

SUMMARY_FILE="$BATCH_DIR/summary.json"
python3 -c "
import json, sys

scenarios = []
for name in sys.argv[1:]:
    scenarios.append(name)

# Read individual verdicts
results = []
for name in scenarios:
    vf = '$BATCH_DIR/' + name + '.verdict.json'
    try:
        with open(vf) as f:
            v = json.load(f)
        results.append({
            'scenario': name,
            'overall': v.get('overall', 'ERROR'),
            'turns': v.get('turns', 0),
            'tool_calls': v.get('tool_calls', 0),
            'errors': v.get('errors', 0),
            'warnings': v.get('warnings', []),
        })
    except (FileNotFoundError, json.JSONDecodeError):
        results.append({
            'scenario': name,
            'overall': 'ERROR',
            'turns': 0,
            'tool_calls': 0,
            'errors': 0,
            'warnings': ['verdict.json not found or invalid'],
        })

summary = {
    'batch_id': '$BATCH_ID',
    'total': len(scenarios),
    'pass': sum(1 for r in results if r['overall'] == 'PASS'),
    'fail': sum(1 for r in results if r['overall'] in ('FAIL', 'ERROR')),
    'warn': sum(1 for r in results if r['overall'] == 'WARN'),
    'skip': $SKIP_COUNT,
    'results': results,
}

with open('$SUMMARY_FILE', 'w') as f:
    json.dump(summary, f, indent=2)
" "${SCENARIOS[@]}"

# ─── Print summary table ────────────────────────────────────────────────────

echo ""
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  BATCH SUMMARY: $BATCH_ID"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
printf "  %-30s %-8s %-6s\n" "SCENARIO" "VERDICT" "EXIT"
printf "  %-30s %-8s %-6s\n" "────────────────────────────" "───────" "────"

for scenario in "${SCENARIOS[@]}"; do
  verdict="${VERDICTS[$scenario]:-SKIP}"
  exit_code="${EXIT_CODES[$scenario]:-–}"
  case "$verdict" in
    PASS) icon="✅" ;;
    FAIL) icon="❌" ;;
    WARN) icon="⚠️ " ;;
    *)    icon="❓" ;;
  esac
  printf "  %-30s %s %-5s %s\n" "$scenario" "$icon" "$verdict" "$exit_code"
done

echo ""
echo "  ✅ Pass: $PASS_COUNT  ❌ Fail: $FAIL_COUNT  ⚠️  Warn: $WARN_COUNT  ⏭  Skip: $SKIP_COUNT"
echo ""
echo "  📋 Summary: $SUMMARY_FILE"
echo "═══════════════════════════════════════════════════════════════════"

# Exit non-zero if any scenario failed
if [[ $FAIL_COUNT -gt 0 ]]; then
  exit 1
fi
exit 0
