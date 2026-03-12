#!/bin/bash
# Flow C: Manual Record CRUD
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow C: Record CRUD ═══"

WF_ID=$(create_workflow "flow-c-crud" "crud test" | jq -r '.id')

# Add
echo ""
echo "ADD"
post "$BASE/workflows/$WF_ID/records" '{
  "records":[
    {"id":"r1","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"topicA"},
    {"id":"r2","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"topicB"},
    {"id":"r3","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"topicA"}
  ]
}' > /dev/null
assert_eq "after add" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "3"

# Edit data
echo ""
echo "EDIT data"
patch "$BASE/workflows/$WF_ID/records/r1/data" '{
  "data":{"input":{"messages":[{"role":"user","content":"updated"}]},"output":{"messages":[{"role":"assistant","content":"new response"}]}}
}' > /dev/null
R1_MSG=$(get "$BASE/workflows/$WF_ID/records" | jq -r '.records[] | select(.id=="r1") | .data.input.messages[0].content')
assert_eq "updated data" "$R1_MSG" "updated"

# Edit topic
echo ""
echo "EDIT topic"
patch "$BASE/workflows/$WF_ID/records/r1" '{"topic":"topicC"}' > /dev/null
R1_TOPIC=$(get "$BASE/workflows/$WF_ID/records" | jq -r '.records[] | select(.id=="r1") | .topic')
assert_eq "updated topic" "$R1_TOPIC" "topicC"

# Delete one
echo ""
echo "DELETE one"
del "$BASE/workflows/$WF_ID/records/r2" > /dev/null
assert_eq "after delete one" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "2"

# Replace all
echo ""
echo "REPLACE all"
put "$BASE/workflows/$WF_ID/records" '{
  "records":[
    {"id":"r10","data":{"input":{"messages":[]},"output":{"messages":[]}}},
    {"id":"r11","data":{"input":{"messages":[]},"output":{"messages":[]}}},
    {"id":"r12","data":{"input":{"messages":[]},"output":{"messages":[]}}},
    {"id":"r13","data":{"input":{"messages":[]},"output":{"messages":[]}}}
  ]
}' > /dev/null
assert_eq "after replace" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "4"

# Old records gone
R1_EXISTS=$(get "$BASE/workflows/$WF_ID/records" | jq '[.records[] | select(.id=="r1")] | length')
assert_eq "old r1 gone" "$R1_EXISTS" "0"

# Delete all
echo ""
echo "DELETE all"
del "$BASE/workflows/$WF_ID/records" > /dev/null
assert_eq "after delete all" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "0"

del "$BASE/workflows/$WF_ID" > /dev/null

summary
