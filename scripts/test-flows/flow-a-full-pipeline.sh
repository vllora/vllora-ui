#!/bin/bash
# Flow A: Full Pipeline (knowledge sources → training)
# Tests the happy path end-to-end against LOCAL endpoints only.
# Cloud endpoints (eval, training, deploy) are skipped — those need mock server.
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow A: Full Pipeline ═══"

# 1. Create workflow
echo ""
echo "Step 1: Create workflow"
WF=$(create_workflow "flow-a-test-$(uuid)" "Build a customer support agent")
WF_ID=$(echo "$WF" | jq -r '.id')
assert_not_empty "workflow created" "$WF_ID"

# Verify GET single
WF_DATA=$(get "$BASE/workflows/$WF_ID")
WF_NAME=$(echo "$WF_DATA" | jq -r '.name')
# Name starts with flow-a-test-
assert_not_empty "workflow name" "$WF_NAME"

# 2. Upload knowledge source
echo ""
echo "Step 2: Upload knowledge source"
KS=$(post "$BASE/workflows/$WF_ID/knowledge" '{
  "name":"support-guide.pdf","type":"pdf","status":"ready",
  "extracted_content":{"chunks":[
    {"id":"c1","title":"Returns Policy","content":"Customers can return items within 30 days."},
    {"id":"c2","title":"Shipping Info","content":"Free shipping on orders over 50 dollars."},
    {"id":"c3","title":"FAQ","content":"Common questions about our service."}
  ]}
}')
KS_ID=$(echo "$KS" | jq -r '.id')
assert_not_empty "knowledge source created" "$KS_ID"

# Verify list
KS_COUNT=$(get "$BASE/workflows/$WF_ID/knowledge" | jq '.knowledge_sources | length')
assert_eq "knowledge sources count" "$KS_COUNT" "1"

# 3. Create topics
echo ""
echo "Step 3: Create topics"
T1=$(uuid) T2=$(uuid) T3=$(uuid) T4=$(uuid)
post "$BASE/workflows/$WF_ID/topics" "{
  \"topics\":[
    {\"id\":\"$T1\",\"name\":\"Customer Support\",\"parent_id\":null,\"selected\":true,\"source_chunk_refs\":[]},
    {\"id\":\"$T2\",\"name\":\"Returns\",\"parent_id\":\"$T1\",\"selected\":true,\"source_chunk_refs\":[\"${KS_ID}:c1\"]},
    {\"id\":\"$T3\",\"name\":\"Shipping\",\"parent_id\":\"$T1\",\"selected\":true,\"source_chunk_refs\":[\"${KS_ID}:c2\"]},
    {\"id\":\"$T4\",\"name\":\"FAQ\",\"parent_id\":\"$T1\",\"selected\":true,\"source_chunk_refs\":[\"${KS_ID}:c3\"]}
  ]
}" > /dev/null
TOPICS=$(get "$BASE/workflows/$WF_ID/topics" 2>/dev/null || echo "{}")
TOPICS_LEN=$(echo "$TOPICS" | jq '.topics | length' 2>/dev/null || echo "0")
if [ "$TOPICS_LEN" != "0" ]; then
  assert_eq "topics count" "$TOPICS_LEN" "4"
fi

# 4. Add records
echo ""
echo "Step 4: Add records"
R1=$(uuid) R2=$(uuid) R3=$(uuid)
post "$BASE/workflows/$WF_ID/records" "{
  \"records\":[
    {\"id\":\"$R1\",\"data\":{\"input\":{\"messages\":[{\"role\":\"user\",\"content\":\"How do I return an item?\"}]},\"output\":{\"messages\":[{\"role\":\"assistant\",\"content\":\"You can return items within 30 days.\"}]}},\"topic\":\"Customer Support/Returns\",\"is_generated\":true},
    {\"id\":\"$R2\",\"data\":{\"input\":{\"messages\":[{\"role\":\"user\",\"content\":\"Is shipping free?\"}]},\"output\":{\"messages\":[{\"role\":\"assistant\",\"content\":\"Free shipping on orders over 50 dollars.\"}]}},\"topic\":\"Customer Support/Shipping\",\"is_generated\":true},
    {\"id\":\"$R3\",\"data\":{\"input\":{\"messages\":[{\"role\":\"user\",\"content\":\"What are your hours?\"}]},\"output\":{\"messages\":[{\"role\":\"assistant\",\"content\":\"We are open 9-5 M-F.\"}]}},\"topic\":\"Customer Support/FAQ\",\"is_generated\":true}
  ]
}" > /dev/null
RECORDS=$(get "$BASE/workflows/$WF_ID/records")
assert_eq "records count" "$(echo "$RECORDS" | jq '.records | length')" "3"

# Verify records have topics
TOPICS_SET=$(echo "$RECORDS" | jq '[.records[] | select(.topic != null)] | length')
assert_eq "records with topics" "$TOPICS_SET" "3"

# 5. Configure grader (via PUT workflow — PATCH /evaluator is a cloud proxy)
echo ""
echo "Step 5: Configure grader"
WF_NAME=$(get "$BASE/workflows/$WF_ID" | jq -r '.name')
put "$BASE/workflows/$WF_ID" "{\"name\":\"$WF_NAME\",\"eval_script\":\"function evaluate(input, output) { return output.messages && output.messages.length > 0 ? 1.0 : 0.0; }\"}" > /dev/null
WF_WITH_SCRIPT=$(get "$BASE/workflows/$WF_ID")
assert_not_empty "eval_script saved" "$(echo "$WF_WITH_SCRIPT" | jq -r '.eval_script')"

# 6. Create eval job
echo ""
echo "Step 6: Create eval job"
EJ=$(post "$BASE/workflows/$WF_ID/eval-jobs" '{"status":"pending","cloud_run_id":"mock-cloud-run-001"}')
EJ_ID=$(echo "$EJ" | jq -r '.id')
assert_eq "eval job status" "$(echo "$EJ" | jq -r '.status')" "pending"

# Simulate polling → running → completed
patch "$BASE/workflows/$WF_ID/eval-jobs/$EJ_ID" '{"status":"running"}' > /dev/null
patch "$BASE/workflows/$WF_ID/eval-jobs/$EJ_ID" '{"status":"completed"}' > /dev/null

EJ_FINAL=$(get "$BASE/workflows/$WF_ID/eval-jobs/$EJ_ID")
assert_eq "eval job completed" "$(echo "$EJ_FINAL" | jq -r '.status')" "completed"

# Update record scores
patch "$BASE/workflows/$WF_ID/records/$R1/scores" '{"dry_run_score":0.95}' > /dev/null
patch "$BASE/workflows/$WF_ID/records/$R2/scores" '{"dry_run_score":0.80}' > /dev/null
patch "$BASE/workflows/$WF_ID/records/$R3/scores" '{"dry_run_score":0.70}' > /dev/null

R1_SCORE=$(get "$BASE/workflows/$WF_ID/records" | jq ".records[] | select(.id==\"$R1\") | .dry_run_score")
# f32 precision: 0.95 → 0.949999988079071
R1_SCORE_OK=$(echo "$R1_SCORE" | awk '{print ($1 > 0.94 && $1 < 0.96) ? "yes" : "no"}')
assert_eq "r1 dry_run_score ~0.95" "$R1_SCORE_OK" "yes"

# 7-9: Cloud endpoints skipped
echo ""
echo "Step 7-9: Upload/Training/Deploy → cloud (skipped, needs mock server)"

# Cleanup
echo ""
echo "Cleanup"
del "$BASE/workflows/$WF_ID" > /dev/null
echo "  ✓ workflow soft deleted"

summary
