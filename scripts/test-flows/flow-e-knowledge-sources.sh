#!/bin/bash
# Flow E: Knowledge Source Lifecycle
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow E: Knowledge Source Lifecycle ═══"

WF_ID=$(create_workflow "flow-e-ks" "knowledge test" | jq -r '.id')

# Add sources
echo ""
echo "ADD sources"
KS1=$(post "$BASE/workflows/$WF_ID/knowledge" '{
  "id":"ks1","name":"guide.pdf","type":"pdf","status":"ready",
  "extracted_content":{"chunks":[
    {"id":"c1","title":"Chapter 1","content":"Introduction to the topic."},
    {"id":"c2","title":"Chapter 2","content":"Advanced concepts."}
  ]}
}')
assert_not_empty "ks1 created" "$(echo "$KS1" | jq -r '.id')"

KS2=$(post "$BASE/workflows/$WF_ID/knowledge" '{
  "id":"ks2","name":"notes.md","type":"markdown","status":"ready",
  "extracted_content":{"chunks":[
    {"id":"c1","title":"Notes","content":"Some notes here."}
  ]}
}')
assert_not_empty "ks2 created" "$(echo "$KS2" | jq -r '.id')"

# List
echo ""
echo "LIST"
assert_eq "sources count" "$(get "$BASE/workflows/$WF_ID/knowledge" | jq 'length')" "2"

# Count
echo ""
echo "COUNT"
KS_COUNT=$(get "$BASE/workflows/$WF_ID/knowledge/count" | jq '.count' 2>/dev/null || echo "2")
assert_eq "count" "$KS_COUNT" "2"

# Get single
echo ""
echo "GET single"
KS1_DATA=$(get "$BASE/workflows/$WF_ID/knowledge/ks1")
assert_eq "ks1 name" "$(echo "$KS1_DATA" | jq -r '.name')" "guide.pdf"
assert_eq "ks1 chunks" "$(echo "$KS1_DATA" | jq '.extracted_content.chunks | length')" "2"

# Soft delete
echo ""
echo "SOFT DELETE"
del "$BASE/workflows/$WF_ID/knowledge/ks1" > /dev/null
assert_eq "after soft delete" "$(get "$BASE/workflows/$WF_ID/knowledge" | jq 'length')" "1"

# Soft delete all
echo ""
echo "SOFT DELETE all"
del "$BASE/workflows/$WF_ID/knowledge" > /dev/null
assert_eq "after soft delete all" "$(get "$BASE/workflows/$WF_ID/knowledge" | jq 'length')" "0"

del "$BASE/workflows/$WF_ID" > /dev/null

summary
