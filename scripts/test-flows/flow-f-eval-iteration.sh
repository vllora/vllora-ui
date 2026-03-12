#!/bin/bash
# Flow F: Evaluation Iteration (grader tuning)
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow F: Evaluation Iteration ═══"

WF_ID=$(create_workflow "flow-f-eval-$(uuid)" "eval iteration test" | jq -r '.id')

# Add records
R1=$(uuid) R2=$(uuid)
post "$BASE/workflows/$WF_ID/records" "{
  \"records\":[
    {\"id\":\"$R1\",\"data\":{\"input\":{\"messages\":[{\"role\":\"user\",\"content\":\"test\"}]},\"output\":{\"messages\":[{\"role\":\"assistant\",\"content\":\"response\"}]}}},
    {\"id\":\"$R2\",\"data\":{\"input\":{\"messages\":[{\"role\":\"user\",\"content\":\"test2\"}]},\"output\":{\"messages\":[{\"role\":\"assistant\",\"content\":\"response2\"}]}}}
  ]
}" > /dev/null

# RUN 1: Set grader v1 (via PUT workflow — PATCH /evaluator is a cloud proxy)
echo ""
echo "RUN 1: Grader v1"
WF_NAME=$(get "$BASE/workflows/$WF_ID" | jq -r '.name')
put "$BASE/workflows/$WF_ID" "{\"name\":\"$WF_NAME\",\"eval_script\":\"function v1() { return 0.3; }\"}" > /dev/null

# Create eval job 1 (server generates its own ID)
EJ1=$(post "$BASE/workflows/$WF_ID/eval-jobs" '{"status":"pending","cloud_run_id":"cloud-run-001"}' | jq -r '.id')
patch "$BASE/workflows/$WF_ID/eval-jobs/$EJ1" '{"status":"running"}' > /dev/null
patch "$BASE/workflows/$WF_ID/eval-jobs/$EJ1" '{"status":"completed"}' > /dev/null
assert_eq "eval job 1 completed" "$(get "$BASE/workflows/$WF_ID/eval-jobs/$EJ1" | jq -r '.status')" "completed"

# Scores low
patch "$BASE/workflows/$WF_ID/records/$R1/scores" '{"dry_run_score":0.3}' > /dev/null
patch "$BASE/workflows/$WF_ID/records/$R2/scores" '{"dry_run_score":0.25}' > /dev/null

# EDIT grader
echo ""
echo "EDIT grader → v2"
put "$BASE/workflows/$WF_ID" "{\"name\":\"$WF_NAME\",\"eval_script\":\"function v2() { return 0.8; }\"}" > /dev/null
SCRIPT=$(get "$BASE/workflows/$WF_ID" | jq -r '.eval_script')
assert_eq "grader updated" "$SCRIPT" "function v2() { return 0.8; }"

# RUN 2: Create eval job 2
echo ""
echo "RUN 2: Re-evaluate"
EJ2=$(post "$BASE/workflows/$WF_ID/eval-jobs" '{"status":"pending","cloud_run_id":"cloud-run-002"}' | jq -r '.id')
patch "$BASE/workflows/$WF_ID/eval-jobs/$EJ2" '{"status":"completed"}' > /dev/null

# Better scores
patch "$BASE/workflows/$WF_ID/records/$R1/scores" '{"dry_run_score":0.85}' > /dev/null
patch "$BASE/workflows/$WF_ID/records/$R2/scores" '{"dry_run_score":0.78}' > /dev/null

# COMPARE: both eval jobs visible
echo ""
echo "COMPARE"
EVAL_JOBS=$(get "$BASE/workflows/$WF_ID/eval-jobs")
assert_eq "eval jobs count" "$(echo "$EVAL_JOBS" | jq '.jobs | length')" "2"

# Scores improved (f32 precision)
R1_SCORE=$(get "$BASE/workflows/$WF_ID/records" | jq ".records[] | select(.id==\"$R1\") | .dry_run_score")
R1_SCORE_OK=$(echo "$R1_SCORE" | awk '{print ($1 > 0.84 && $1 < 0.86) ? "yes" : "no"}')
assert_eq "r1 score improved ~0.85" "$R1_SCORE_OK" "yes"

del "$BASE/workflows/$WF_ID" > /dev/null

summary
