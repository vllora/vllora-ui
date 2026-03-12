#!/bin/bash
# Flow G: Training Iteration (improve dataset, re-train)
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow G: Training Iteration ═══"

WF_ID=$(create_workflow "flow-g-training" "training iteration test" | jq -r '.id')

# Initial records
post "$BASE/workflows/$WF_ID/records" '{
  "records":[
    {"id":"r1","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"A"},
    {"id":"r2","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"A"},
    {"id":"r3","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"B"}
  ]
}' > /dev/null

# JOB 1 would be POST /workflows/{id}/jobs → cloud + local
# Simulate: metrics show overfitting → edit records
echo ""
echo "EDIT records (fix bad data)"
# Add more
post "$BASE/workflows/$WF_ID/records" '{
  "records":[{"id":"r4","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"B"}]
}' > /dev/null
assert_eq "after add" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "4"

# Fix bad example
patch "$BASE/workflows/$WF_ID/records/r1/data" '{
  "data":{"input":{"messages":[{"role":"user","content":"fixed input"}]},"output":{"messages":[{"role":"assistant","content":"fixed output"}]}}
}' > /dev/null

# Remove bad record
del "$BASE/workflows/$WF_ID/records/r3" > /dev/null
assert_eq "after delete" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "3"

# OR: Replace all at once
echo ""
echo "REPLACE all records"
put "$BASE/workflows/$WF_ID/records" '{
  "records":[
    {"id":"r10","data":{"input":{"messages":[{"role":"user","content":"new1"}]},"output":{"messages":[]}},"topic":"A"},
    {"id":"r11","data":{"input":{"messages":[{"role":"user","content":"new2"}]},"output":{"messages":[]}},"topic":"A"},
    {"id":"r12","data":{"input":{"messages":[{"role":"user","content":"new3"}]},"output":{"messages":[]}},"topic":"B"},
    {"id":"r13","data":{"input":{"messages":[{"role":"user","content":"new4"}]},"output":{"messages":[]}},"topic":"B"},
    {"id":"r14","data":{"input":{"messages":[{"role":"user","content":"new5"}]},"output":{"messages":[]}},"topic":"C"}
  ]
}' > /dev/null
assert_eq "replaced records" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "5"

# Verify old records are gone
OLD=$(get "$BASE/workflows/$WF_ID/records" | jq '[.records[] | select(.id | startswith("r1") and length == 2)] | length')
assert_eq "old records gone" "$OLD" "0"

del "$BASE/workflows/$WF_ID" > /dev/null

summary
