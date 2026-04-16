#!/usr/bin/env bash
#
# Clean all test data for a scenario — processes, local files, and gateway DB.
# Prepares for a fresh test run.
#
# Usage: ./scripts/clean-test-data.sh <scenario-dir> [--keep-extractions]
#
# Options:
#   --keep-extractions  Keep knowledge/ dir (reuse expensive PDF extractions)
#
set -euo pipefail

SCENARIO_DIR="${1:?Usage: clean-test-data.sh <scenario-dir> [--keep-extractions]}"
KEEP_EXTRACTIONS=false
[ "${2:-}" = "--keep-extractions" ] && KEEP_EXTRACTIONS=true

VLLORA_UI_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCENARIO=$(basename "$SCENARIO_DIR")

echo "Cleaning test data for: $SCENARIO"
echo ""

# Step 1: Kill any running processes
echo "1. Killing processes..."
bash "$VLLORA_UI_DIR/scripts/kill-finetune-agent.sh" "$SCENARIO_DIR" 2>/dev/null || true

# Step 2: Delete gateway workflow data
echo ""
echo "2. Cleaning gateway DB..."
if [ -f "$SCENARIO_DIR/finetune-project/config.json" ]; then
  WF_ID=$(python3 -c "import json; print(json.load(open('$SCENARIO_DIR/finetune-project/config.json')).get('workflow_id',''))" 2>/dev/null || echo "")
  if [ -n "$WF_ID" ] && curl -s --connect-timeout 2 "http://localhost:9090/health" >/dev/null 2>&1; then
    # Delete records, topics, relations, eval jobs for this workflow
    DB="$HOME/.vllora/vllora.db"
    if [ -f "$DB" ]; then
      sqlite3 "$DB" "DELETE FROM workflow_records WHERE workflow_id='$WF_ID';" 2>/dev/null && echo "  Deleted records"
      sqlite3 "$DB" "DELETE FROM workflow_topic_sources WHERE workflow_id='$WF_ID';" 2>/dev/null && echo "  Deleted relations"
      sqlite3 "$DB" "DELETE FROM workflow_topics WHERE workflow_id='$WF_ID';" 2>/dev/null && echo "  Deleted topics"
      sqlite3 "$DB" "DELETE FROM eval_jobs WHERE workflow_id='$WF_ID';" 2>/dev/null && echo "  Deleted eval jobs"
      sqlite3 "$DB" "DELETE FROM workflow_record_scores WHERE workflow_id='$WF_ID';" 2>/dev/null && echo "  Deleted scores"
      sqlite3 "$DB" "UPDATE knowledge_sources SET deleted_at=datetime('now') WHERE workflow_id='$WF_ID';" 2>/dev/null && echo "  Soft-deleted knowledge sources"
      sqlite3 "$DB" "DELETE FROM workflows WHERE id='$WF_ID';" 2>/dev/null && echo "  Deleted workflow"
      echo "  Workflow $WF_ID cleaned from gateway DB"
    fi
  else
    echo "  Gateway not running or no workflow_id — skipping DB cleanup"
  fi
else
  echo "  No config.json — skipping DB cleanup"
fi

# Step 3: Clean local files
echo ""
echo "3. Cleaning local files..."
if [ -d "$SCENARIO_DIR/finetune-project" ]; then
  if [ "$KEEP_EXTRACTIONS" = true ]; then
    echo "  Keeping knowledge/ dir (--keep-extractions)"
    # Remove everything except knowledge/
    find "$SCENARIO_DIR/finetune-project" -maxdepth 1 -not -name "finetune-project" -not -name "knowledge" | while read f; do
      [ "$f" != "$SCENARIO_DIR/finetune-project" ] && rm -rf "$f" && echo "  Removed $(basename "$f")"
    done
  else
    rm -rf "$SCENARIO_DIR/finetune-project"
    echo "  Removed finetune-project/"
  fi
fi

# Step 4: Clean run transcripts
echo ""
echo "4. Cleaning run transcripts..."
if [ -d "$SCENARIO_DIR/finetune-runs" ]; then
  RUN_COUNT=$(ls -1d "$SCENARIO_DIR/finetune-runs"/run-* 2>/dev/null | wc -l | tr -d ' ')
  rm -rf "$SCENARIO_DIR/finetune-runs"
  echo "  Removed $RUN_COUNT run(s)"
else
  echo "  No runs to clean"
fi

# Step 5: Clean .claude cache (synced skill)
echo ""
echo "5. Cleaning .claude/ cache..."
if [ -d "$SCENARIO_DIR/.claude" ]; then
  rm -rf "$SCENARIO_DIR/.claude"
  echo "  Removed .claude/"
fi

echo ""
echo "========================================="
echo "  Clean complete: $SCENARIO"
if [ "$KEEP_EXTRACTIONS" = true ] && [ -d "$SCENARIO_DIR/finetune-project/knowledge" ]; then
  PARTS_COUNT=$(find "$SCENARIO_DIR/finetune-project/knowledge" -name "knowledge_parts.json" | wc -l | tr -d ' ')
  echo "  Kept: $PARTS_COUNT extraction(s) in knowledge/"
fi
echo "  Ready for fresh test run"
echo "========================================="
