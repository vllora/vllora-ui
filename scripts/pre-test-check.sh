#!/bin/bash
# Pre-test check — run before /finetune-run to catch known issues
# Usage: bash scripts/pre-test-check.sh <scenario-dir>
#
# This script grows over time. Each test cycle adds new checks
# based on issues found. See .claude/skills/pre-test-check.md.

set -e

SCENARIO_DIR="${1:-$HOME/Documents/GitHub/test-samples/tau-retail-combined}"
VLLORA_UI_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "═══════════════════════════════════════════════════════"
echo "  Pre-Test Check: $(basename $SCENARIO_DIR)"
echo "═══════════════════════════════════════════════════════"
echo ""

PASS=0
WARN=0
FAIL=0

check() {
  local label="$1"
  local status="$2"  # pass, warn, fail
  case "$status" in
    pass) echo "  ✓ $label"; PASS=$((PASS+1)) ;;
    warn) echo "  ⚠ $label"; WARN=$((WARN+1)) ;;
    fail) echo "  ✗ $label"; FAIL=$((FAIL+1)) ;;
  esac
}

# 1. Gateway running?
if curl -s --connect-timeout 3 "http://localhost:9090/health" >/dev/null 2>&1; then
  check "Gateway running at localhost:9090" pass
else
  check "Gateway NOT running — start with: bash scripts/restart-backend.sh" fail
fi

# 2. Dev server running? (for UI verification)
if curl -s --connect-timeout 3 "http://localhost:5173" >/dev/null 2>&1; then
  check "Dev server running at localhost:5173" pass
else
  check "Dev server not running — start with: npm run dev" warn
fi

# 3. Test folder clean?
if [ -d "$SCENARIO_DIR/finetune-project" ]; then
  check "Previous run data exists — clean with: rm -rf $SCENARIO_DIR/{finetune-project,finetune-runs,.claude}" warn
else
  check "Test folder clean (no previous data)" pass
fi

# 4. Source traces exist?
if [ -f "$SCENARIO_DIR/source_traces_semconv.json" ]; then
  check "Traces file exists" pass
else
  check "source_traces_semconv.json MISSING — regenerate with tau_bench_to_otel.py" fail
fi

# 5. PDF exists?
if find "$SCENARIO_DIR/pdfs" -maxdepth 1 \( -name "*.pdf" -o -name "*.md" \) 2>/dev/null | grep -q .; then
  check "PDF/doc found in pdfs/" pass
else
  check "No PDF in pdfs/ folder" fail
fi

# 6. No orphaned processes?
ORPHANS=$(ps aux | grep "$(basename $SCENARIO_DIR)" | grep -v grep | wc -l | tr -d ' ')
if [ "$ORPHANS" -gt 0 ]; then
  check "Found $ORPHANS orphaned processes — kill with: /finetune-kill $(basename $SCENARIO_DIR)" warn
else
  check "No orphaned processes" pass
fi

# 7. Python syntax check
cd "$VLLORA_UI_DIR"
SYNTAX_OK=true
for f in finetune-skill/scripts/trace_analyze.py finetune-skill/scripts/grader_from_traces.py finetune-skill/scripts/upload_trace_analysis.py finetune-skill/scripts/finetune.py finetune-skill/scripts/generate_records.py; do
  if ! python3 -c "import ast; ast.parse(open('$f').read())" 2>/dev/null; then
    check "Python syntax FAIL: $f" fail
    SYNTAX_OK=false
  fi
done
$SYNTAX_OK && check "All Python scripts: syntax OK" pass

# 8. TypeScript check
if npx tsc --noEmit 2>/dev/null; then
  check "TypeScript: clean" pass
else
  check "TypeScript errors found — run: npx tsc --noEmit" fail
fi

# 9. Stale path references
STALE_EVAL=$(grep -c '"evaluations"' finetune-skill/scripts/finetune.py 2>/dev/null || true)
STALE_TRAIN=$(grep -c '"training-jobs"' finetune-skill/scripts/finetune.py 2>/dev/null || true)
STALE=$(( ${STALE_EVAL:-0} + ${STALE_TRAIN:-0} ))
if [ "$STALE" -gt 0 ]; then
  check "Found $STALE stale folder references in finetune.py" fail
else
  check "No stale folder references" pass
fi

# 10. SKILL.md has cancel-before-re-eval
if grep -q "cancel-eval" finetune-skill/SKILL.md 2>/dev/null; then
  check "SKILL.md has cancel-before-re-eval logic" pass
else
  check "SKILL.md missing cancel-before-re-eval — add to Step 9a" warn
fi

# 11. SKILL.md has objective-target-tokens guidance
if grep -q "Conversational agent" finetune-skill/SKILL.md 2>/dev/null; then
  check "SKILL.md has objective-target-tokens task-type table" pass
else
  check "SKILL.md missing objective-target-tokens guidance" warn
fi

# 12. Gateway has trace_analyses table
if sqlite3 ~/.vllora/vllora.db ".tables" 2>/dev/null | grep -q "trace_analyses"; then
  check "Gateway has trace_analyses table" pass
else
  check "trace_analyses table MISSING — restart gateway to apply migration" fail
fi

# 13. SKILL.md says upload records separately (not --upload-incremental)
if grep -q "Upload records SEPARATELY" finetune-skill/SKILL.md 2>/dev/null; then
  check "SKILL.md: upload-records separate from generation" pass
else
  check "SKILL.md still uses --upload-incremental (can fail silently)" warn
fi

# 14. SKILL.md has system prompt length guidance
if grep -q "System prompt must be SHORT" finetune-skill/SKILL.md 2>/dev/null || grep -q "simplified_prompt" finetune-skill/SKILL.md 2>/dev/null; then
  check "SKILL.md has system prompt length guidance" pass
else
  check "SKILL.md missing system prompt length guidance — agent may use full 7K wiki" warn
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Results: $PASS passed, $WARN warnings, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "  ✗ FIX FAILURES before running test"
  echo "═══════════════════════════════════════════════════════"
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo "  ⚠ Warnings — test may work but check these"
  echo "═══════════════════════════════════════════════════════"
  exit 0
else
  echo "  ✓ All checks passed — ready to test!"
  echo "═══════════════════════════════════════════════════════"
  exit 0
fi
