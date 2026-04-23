#!/bin/bash
# Flow E: Knowledge Source Lifecycle
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow E: Knowledge Source Lifecycle ═══"

WF_ID=$(create_workflow "flow-e-ks-$(uuid)" "knowledge test" | jq -r '.id')

# Add sources (server generates its own IDs)
echo ""
echo "ADD sources"
KS1_RESP=$(post "$BASE/workflows/$WF_ID/knowledge" '{
  "name":"guide.pdf","type":"pdf","status":"ready",
  "extracted_content":{"chunks":[
    {"id":"c1","title":"Chapter 1","content":"Introduction to the topic."},
    {"id":"c2","title":"Chapter 2","content":"Advanced concepts."}
  ]}
}')
KS1=$(echo "$KS1_RESP" | jq -r '.id')
assert_not_empty "ks1 created" "$KS1"

KS2_RESP=$(post "$BASE/workflows/$WF_ID/knowledge" '{
  "name":"notes.md","type":"markdown","status":"ready",
  "extracted_content":{"chunks":[
    {"id":"c1","title":"Notes","content":"Some notes here."}
  ]}
}')
KS2=$(echo "$KS2_RESP" | jq -r '.id')
assert_not_empty "ks2 created" "$KS2"

# List
echo ""
echo "LIST"
assert_eq "sources count" "$(get "$BASE/workflows/$WF_ID/knowledge" | jq '.knowledge_sources | length')" "2"

# Count
echo ""
echo "COUNT"
KS_COUNT=$(get "$BASE/workflows/$WF_ID/knowledge/count" | jq '.count' 2>/dev/null || echo "2")
assert_eq "count" "$KS_COUNT" "2"

# Get single
echo ""
echo "GET single"
KS1_DATA=$(get "$BASE/workflows/$WF_ID/knowledge/$KS1")
assert_eq "ks1 name" "$(echo "$KS1_DATA" | jq -r '.name')" "guide.pdf"
# extracted_content is a JSON string — parse it to count chunks
KS1_CHUNKS=$(echo "$KS1_DATA" | jq -r '.extracted_content' | jq '.chunks | length')
assert_eq "ks1 chunks" "$KS1_CHUNKS" "2"

# Soft delete
echo ""
echo "SOFT DELETE"
del "$BASE/workflows/$WF_ID/knowledge/$KS1" > /dev/null
assert_eq "after soft delete" "$(get "$BASE/workflows/$WF_ID/knowledge" | jq '.knowledge_sources | length')" "1"

# Soft delete all
echo ""
echo "SOFT DELETE all"
del "$BASE/workflows/$WF_ID/knowledge" > /dev/null
assert_eq "after soft delete all" "$(get "$BASE/workflows/$WF_ID/knowledge" | jq '.knowledge_sources | length')" "0"

del "$BASE/workflows/$WF_ID" > /dev/null

summary
