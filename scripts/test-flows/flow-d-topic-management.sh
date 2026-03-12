#!/bin/bash
# Flow D: Topic Management
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow D: Topic Management ═══"

WF_ID=$(create_workflow "flow-d-topics" "topic test" | jq -r '.id')

# Setup: add records with topics
post "$BASE/workflows/$WF_ID/records" '{
  "records":[
    {"id":"r1","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"Animals/Dogs"},
    {"id":"r2","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"Animals/Dogs"},
    {"id":"r3","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"Animals/Cats"},
    {"id":"r4","data":{"input":{"messages":[]},"output":{"messages":[]}},"topic":"Plants"}
  ]
}' > /dev/null

# Rename topic
echo ""
echo "RENAME topic"
patch "$BASE/workflows/$WF_ID/records/rename-topic" '{"old_name":"Animals/Dogs","new_name":"Animals/Canines"}' > /dev/null
CANINES=$(get "$BASE/workflows/$WF_ID/records" | jq '[.records[] | select(.topic=="Animals/Canines")] | length')
assert_eq "renamed to Canines" "$CANINES" "2"
DOGS=$(get "$BASE/workflows/$WF_ID/records" | jq '[.records[] | select(.topic=="Animals/Dogs")] | length')
assert_eq "Dogs gone" "$DOGS" "0"

# Clear one topic
echo ""
echo "CLEAR one topic"
del "$BASE/workflows/$WF_ID/records/topics/Animals%2FCats" > /dev/null
CATS=$(get "$BASE/workflows/$WF_ID/records" | jq '[.records[] | select(.topic=="Animals/Cats")] | length')
assert_eq "Cats cleared" "$CATS" "0"
# Others unchanged
CANINES2=$(get "$BASE/workflows/$WF_ID/records" | jq '[.records[] | select(.topic=="Animals/Canines")] | length')
assert_eq "Canines still there" "$CANINES2" "2"

# Clear ALL topics
echo ""
echo "CLEAR all topics"
del "$BASE/workflows/$WF_ID/records/topics" > /dev/null
WITH_TOPIC=$(get "$BASE/workflows/$WF_ID/records" | jq '[.records[] | select(.topic != null and .topic != "")] | length')
assert_eq "all topics cleared" "$WITH_TOPIC" "0"
# Records still exist
assert_eq "records still exist" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "4"

# Create + delete topic tree
echo ""
echo "Topic tree CRUD"
post "$BASE/workflows/$WF_ID/topics" '{
  "topics":[
    {"id":"t1","name":"Root","parent_id":null,"selected":true,"source_chunk_refs":[]},
    {"id":"t2","name":"Child","parent_id":"t1","selected":true,"source_chunk_refs":["ks1:c1"]}
  ]
}' > /dev/null
del "$BASE/workflows/$WF_ID/topics" > /dev/null
echo "  ✓ topic tree created and deleted"

del "$BASE/workflows/$WF_ID" > /dev/null

summary
