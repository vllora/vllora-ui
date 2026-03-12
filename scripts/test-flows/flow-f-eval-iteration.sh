#!/bin/bash
# Flow F: Evaluation Iteration (grader tuning)
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow F: Evaluation Iteration ═══"

WF_ID=$(create_workflow "flow-f-eval" "eval iteration test" | jq -r '.id')

# Add records
post "$BASE/workflows/$WF_ID/records" '{
  "records":[
    {"id":"r1","data":{"input":{"messages":[{"role":"user","content":"test"}]},"output":{"messages":[{"role":"assistant","content":"response"}]}}},
    {"id":"r2","data":{"input":{"messages":[{"role":"user","content":"test2"}]},"output":{"messages":[{"role":"assistant","content":"response2"}]}}}
  ]
}' > /dev/null

# RUN 1: Set grader v1
echo ""
echo "RUN 1: Grader v1"
patch "$BASE/workflows/$WF_ID/evaluator" '{"eval_script":"function v1() { return 0.3; }"}' > /dev/null

# Create eval job 1
EJ1=$(post "$BASE/workflows/$WF_ID/eval-jobs" '{"id":"ej1","status":"pending","cloud_run_id":"cloud-run-001"}')
patch "$BASE/workflows/$WF_ID/eval-jobs/ej1" '{"status":"running"}' > /dev/null
patch "$BASE/workflows/$WF_ID/eval-jobs/ej1" '{"status":"completed"}' > /dev/null
assert_eq "eval job 1 completed" "$(get "$BASE/workflows/$WF_ID/eval-jobs/ej1" | jq -r '.status')" "completed"

# Scores low
patch "$BASE/workflows/$WF_ID/records/r1/scores" '{"dry_run_score":0.3}' > /dev/null
patch "$BASE/workflows/$WF_ID/records/r2/scores" '{"dry_run_score":0.25}' > /dev/null

# EDIT grader
echo ""
echo "EDIT grader → v2"
patch "$BASE/workflows/$WF_ID/evaluator" '{"eval_script":"function v2() { return 0.8; }"}' > /dev/null
SCRIPT=$(get "$BASE/workflows/$WF_ID" | jq -r '.eval_script')
assert_eq "grader updated" "$SCRIPT" "function v2() { return 0.8; }"

# RUN 2: Create eval job 2
echo ""
echo "RUN 2: Re-evaluate"
EJ2=$(post "$BASE/workflows/$WF_ID/eval-jobs" '{"id":"ej2","status":"pending","cloud_run_id":"cloud-run-002"}')
patch "$BASE/workflows/$WF_ID/eval-jobs/ej2" '{"status":"completed"}' > /dev/null

# Better scores
patch "$BASE/workflows/$WF_ID/records/r1/scores" '{"dry_run_score":0.85}' > /dev/null
patch "$BASE/workflows/$WF_ID/records/r2/scores" '{"dry_run_score":0.78}' > /dev/null

# COMPARE: both eval jobs visible
echo ""
echo "COMPARE"
EVAL_JOBS=$(get "$BASE/workflows/$WF_ID/eval-jobs")
assert_eq "eval jobs count" "$(echo "$EVAL_JOBS" | jq 'length')" "2"

# Scores improved
R1_SCORE=$(get "$BASE/workflows/$WF_ID/records" | jq '.records[] | select(.id=="r1") | .dry_run_score')
assert_eq "r1 score improved" "$R1_SCORE" "0.85"

del "$BASE/workflows/$WF_ID" > /dev/null

summary
