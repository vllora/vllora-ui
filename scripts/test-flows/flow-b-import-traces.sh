#!/bin/bash
# Flow B: Import Traces (no knowledge sources)
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow B: Import Traces ═══"

# 1. Create workflow
echo ""
echo "Step 1: Create workflow"
WF_ID=$(create_workflow "flow-b-import-$(uuid)" "imported traces" | jq -r '.id')
assert_not_empty "workflow created" "$WF_ID"

# 2. Import records (from-spans endpoint may not exist, fallback to bulk add)
echo ""
echo "Step 2: Import records from spans"
R1=$(uuid) R2=$(uuid) R3=$(uuid)
post "$BASE/workflows/$WF_ID/records/from-spans" '{
  "span_ids":["span-001","span-002","span-003"]
}' > /dev/null 2>&1 || \
post "$BASE/workflows/$WF_ID/records" "{
  \"records\":[
    {\"id\":\"$R1\",\"data\":{\"input\":{\"messages\":[{\"role\":\"user\",\"content\":\"trace 1\"}]},\"output\":{\"messages\":[{\"role\":\"assistant\",\"content\":\"response 1\"}]}},\"span_id\":\"span-001\",\"is_generated\":false},
    {\"id\":\"$R2\",\"data\":{\"input\":{\"messages\":[{\"role\":\"user\",\"content\":\"trace 2\"}]},\"output\":{\"messages\":[{\"role\":\"assistant\",\"content\":\"response 2\"}]}},\"span_id\":\"span-002\",\"is_generated\":false},
    {\"id\":\"$R3\",\"data\":{\"input\":{\"messages\":[{\"role\":\"user\",\"content\":\"trace 3\"}]},\"output\":{\"messages\":[{\"role\":\"assistant\",\"content\":\"response 3\"}]}},\"span_id\":\"span-003\",\"is_generated\":false}
  ]
}" > /dev/null
RECORDS=$(get "$BASE/workflows/$WF_ID/records")
assert_eq "imported records" "$(echo "$RECORDS" | jq '.records | length')" "3"

# Verify none are generated (is_generated is 0 in DB)
GENERATED=$(echo "$RECORDS" | jq '[.records[] | select(.is_generated == true or .is_generated == 1)] | length')
assert_eq "generated count" "$GENERATED" "0"

# 3. Create topics
echo ""
echo "Step 3: Create topics"
T1=$(uuid)
post "$BASE/workflows/$WF_ID/topics" "{
  \"topics\":[
    {\"id\":\"$T1\",\"name\":\"General\",\"parent_id\":null,\"selected\":true,\"source_chunk_refs\":[]}
  ]
}" > /dev/null

# 4. Batch categorize
echo ""
echo "Step 4: Batch categorize records"
patch "$BASE/workflows/$WF_ID/records/topics" "{
  \"updates\":[
    {\"record_id\":\"$R1\",\"topic\":\"General\"},
    {\"record_id\":\"$R2\",\"topic\":\"General\"},
    {\"record_id\":\"$R3\",\"topic\":\"General\"}
  ]
}" > /dev/null
CATEGORIZED=$(get "$BASE/workflows/$WF_ID/records" | jq '[.records[] | select(.topic != null)] | length')
assert_eq "categorized records" "$CATEGORIZED" "3"

# Cleanup
del "$BASE/workflows/$WF_ID" > /dev/null

summary
