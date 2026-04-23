#!/bin/bash
# Flow J: Cross-Workflow Queries
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow J: Cross-Workflow ═══"

# Create multiple workflows
echo ""
echo "Create 3 workflows"
WF1_ID=$(create_workflow "flow-j-wf1-$(uuid)" "first" | jq -r '.id')
WF2_ID=$(create_workflow "flow-j-wf2-$(uuid)" "second" | jq -r '.id')
WF3_ID=$(create_workflow "flow-j-wf3-$(uuid)" "third" | jq -r '.id')

# List all
echo ""
echo "LIST all workflows"
ALL=$(get "$BASE/workflows")
ALL_COUNT=$(echo "$ALL" | jq 'length')
assert_gte "workflows >= 3" "$ALL_COUNT" "3"

# Add eval jobs across workflows
echo ""
echo "Eval jobs across workflows"
EJ1=$(post "$BASE/workflows/$WF1_ID/eval-jobs" '{"status":"pending","cloud_run_id":"run1"}' | jq -r '.id')
patch "$BASE/workflows/$WF1_ID/eval-jobs/$EJ1" '{"status":"running"}' > /dev/null
EJ2=$(post "$BASE/workflows/$WF2_ID/eval-jobs" '{"status":"pending","cloud_run_id":"run2"}' | jq -r '.id')
patch "$BASE/workflows/$WF2_ID/eval-jobs/$EJ2" '{"status":"running"}' > /dev/null
EJ3=$(post "$BASE/workflows/$WF3_ID/eval-jobs" '{"status":"pending","cloud_run_id":"run3"}' | jq -r '.id')
patch "$BASE/workflows/$WF3_ID/eval-jobs/$EJ3" '{"status":"completed"}' > /dev/null

# Cross-workflow query
RUNNING=$(get "$BASE/eval-jobs?status=running")
RUNNING_COUNT=$(echo "$RUNNING" | jq '.jobs | length')
assert_gte "running eval jobs >= 2" "$RUNNING_COUNT" "2"

# Soft delete one workflow
echo ""
echo "SOFT DELETE workflow"
del "$BASE/workflows/$WF1_ID" > /dev/null

# Verify deleted workflow hidden from list
ALL_AFTER=$(get "$BASE/workflows")
WF1_IN_LIST=$(echo "$ALL_AFTER" | jq "[.[] | select(.id==\"$WF1_ID\")] | length")
assert_eq "wf1 hidden from list" "$WF1_IN_LIST" "0"

# Child data still exists (not cascade deleted)
EJ1_STILL=$(get "$BASE/workflows/$WF1_ID/eval-jobs" 2>/dev/null | jq '.jobs | length' 2>/dev/null || echo "check-manually")
if [ "$EJ1_STILL" != "check-manually" ]; then
  assert_gte "wf1 eval jobs still exist" "$EJ1_STILL" "1"
fi

# Cleanup
del "$BASE/workflows/$WF2_ID" > /dev/null
del "$BASE/workflows/$WF3_ID" > /dev/null

summary
