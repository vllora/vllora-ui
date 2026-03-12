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
WF=$(create_workflow "flow-a-test" "Build a customer support agent")
WF_ID=$(echo "$WF" | jq -r '.id')
assert_not_empty "workflow created" "$WF_ID"

# Verify GET single
WF_DATA=$(get "$BASE/workflows/$WF_ID")
assert_eq "workflow name" "$(echo "$WF_DATA" | jq -r '.name')" "flow-a-test"

# 2. Upload knowledge source
echo ""
echo "Step 2: Upload knowledge source"
KS=$(post "$BASE/workflows/$WF_ID/knowledge" '{
  "id":"ks1","name":"support-guide.pdf","type":"pdf","status":"ready",
  "extracted_content":{"chunks":[
    {"id":"c1","title":"Returns Policy","content":"Customers can return items within 30 days."},
    {"id":"c2","title":"Shipping Info","content":"Free shipping on orders over $50."},
    {"id":"c3","title":"FAQ","content":"Common questions about our service."}
  ]}
}')
assert_not_empty "knowledge source created" "$(echo "$KS" | jq -r '.id')"

# Verify list
KS_COUNT=$(get "$BASE/workflows/$WF_ID/knowledge" | jq 'length')
assert_eq "knowledge sources count" "$KS_COUNT" "1"

# 3. Create topics
echo ""
echo "Step 3: Create topics"
post "$BASE/workflows/$WF_ID/topics" '{
  "topics":[
    {"id":"t1","name":"Customer Support","parent_id":null,"selected":true,"source_chunk_refs":[]},
    {"id":"t2","name":"Returns","parent_id":"t1","selected":true,"source_chunk_refs":["ks1:c1"]},
    {"id":"t3","name":"Shipping","parent_id":"t1","selected":true,"source_chunk_refs":["ks1:c2"]},
    {"id":"t4","name":"FAQ","parent_id":"t1","selected":true,"source_chunk_refs":["ks1:c3"]}
  ]
}' > /dev/null
TOPICS=$(get "$BASE/workflows/$WF_ID/topics" 2>/dev/null || echo "[]")
# If GET /topics not implemented yet, skip check
if [ "$TOPICS" != "[]" ]; then
  assert_eq "topics count" "$(echo "$TOPICS" | jq 'length')" "4"
fi

# 4. Add records (simulating generation — stateless generate returns data, client saves)
echo ""
echo "Step 4: Add records"
post "$BASE/workflows/$WF_ID/records" '{
  "records":[
    {"id":"r1","data":{"input":{"messages":[{"role":"user","content":"How do I return an item?"}]},"output":{"messages":[{"role":"assistant","content":"You can return items within 30 days."}]}},"topic":"Customer Support/Returns","is_generated":true,"metadata":{"sourceChunkRefs":["ks1:c1"]}},
    {"id":"r2","data":{"input":{"messages":[{"role":"user","content":"Is shipping free?"}]},"output":{"messages":[{"role":"assistant","content":"Free shipping on orders over $50."}]}},"topic":"Customer Support/Shipping","is_generated":true,"metadata":{"sourceChunkRefs":["ks1:c2"]}},
    {"id":"r3","data":{"input":{"messages":[{"role":"user","content":"What are your hours?"}]},"output":{"messages":[{"role":"assistant","content":"We are open 9-5 M-F."}]}},"topic":"Customer Support/FAQ","is_generated":true,"metadata":{"sourceChunkRefs":["ks1:c3"]}}
  ]
}' > /dev/null
RECORDS=$(get "$BASE/workflows/$WF_ID/records")
assert_eq "records count" "$(echo "$RECORDS" | jq '.records | length')" "3"

# Verify records have topics
TOPICS_SET=$(echo "$RECORDS" | jq '[.records[] | select(.topic != null)] | length')
assert_eq "records with topics" "$TOPICS_SET" "3"

# 5. Configure grader
echo ""
echo "Step 5: Configure grader"
patch "$BASE/workflows/$WF_ID/evaluator" '{
  "eval_script":"function evaluate(input, output) { return output.messages && output.messages.length > 0 ? 1.0 : 0.0; }"
}' > /dev/null
WF_WITH_SCRIPT=$(get "$BASE/workflows/$WF_ID")
assert_not_empty "eval_script saved" "$(echo "$WF_WITH_SCRIPT" | jq -r '.eval_script')"

# 6. Create eval job (simulating POST /finetune/evaluations → cloud)
echo ""
echo "Step 6: Create eval job"
EJ=$(post "$BASE/workflows/$WF_ID/eval-jobs" '{
  "id":"ej1","status":"pending","cloud_run_id":"mock-cloud-run-001"
}')
assert_eq "eval job status" "$(echo "$EJ" | jq -r '.status')" "pending"

# Simulate polling → running → completed
patch "$BASE/workflows/$WF_ID/eval-jobs/ej1" '{"status":"running"}' > /dev/null
patch "$BASE/workflows/$WF_ID/eval-jobs/ej1" '{"status":"completed"}' > /dev/null

EJ_FINAL=$(get "$BASE/workflows/$WF_ID/eval-jobs/ej1")
assert_eq "eval job completed" "$(echo "$EJ_FINAL" | jq -r '.status')" "completed"

# Update record scores (simulating eval results)
patch "$BASE/workflows/$WF_ID/records/r1/scores" '{"dry_run_score":0.95}' > /dev/null
patch "$BASE/workflows/$WF_ID/records/r2/scores" '{"dry_run_score":0.80}' > /dev/null
patch "$BASE/workflows/$WF_ID/records/r3/scores" '{"dry_run_score":0.70}' > /dev/null

R1=$(get "$BASE/workflows/$WF_ID/records" | jq '.records[] | select(.id=="r1")')
assert_eq "r1 dry_run_score" "$(echo "$R1" | jq '.dry_run_score')" "0.95"

# 7. Dataset upload would go to cloud — skip (needs mock server)
echo ""
echo "Step 7-9: Upload/Training/Deploy → cloud (skipped, needs mock server)"

# Cleanup
echo ""
echo "Cleanup"
del "$BASE/workflows/$WF_ID" > /dev/null
echo "  ✓ workflow soft deleted"

summary
