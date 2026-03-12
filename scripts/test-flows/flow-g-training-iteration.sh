#!/bin/bash
# Flow G: Training Iteration (improve dataset, re-train)
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow G: Training Iteration ═══"

WF_ID=$(create_workflow "flow-g-training-$(uuid)" "training iteration test" | jq -r '.id')

# Initial records
R1=$(uuid) R2=$(uuid) R3=$(uuid)
post "$BASE/workflows/$WF_ID/records" "{
  \"records\":[
    {\"id\":\"$R1\",\"data\":{\"input\":{\"messages\":[]},\"output\":{\"messages\":[]}},\"topic\":\"A\"},
    {\"id\":\"$R2\",\"data\":{\"input\":{\"messages\":[]},\"output\":{\"messages\":[]}},\"topic\":\"A\"},
    {\"id\":\"$R3\",\"data\":{\"input\":{\"messages\":[]},\"output\":{\"messages\":[]}},\"topic\":\"B\"}
  ]
}" > /dev/null

# Simulate: metrics show overfitting → edit records
echo ""
echo "EDIT records (fix bad data)"
R4=$(uuid)
post "$BASE/workflows/$WF_ID/records" "{
  \"records\":[{\"id\":\"$R4\",\"data\":{\"input\":{\"messages\":[]},\"output\":{\"messages\":[]}},\"topic\":\"B\"}]
}" > /dev/null
assert_eq "after add" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "4"

# Fix bad example
FIXED_DATA=$(echo '{"input":{"messages":[{"role":"user","content":"fixed input"}]},"output":{"messages":[{"role":"assistant","content":"fixed output"}]}}' | jq -Rs '.')
patch "$BASE/workflows/$WF_ID/records/$R1/data" "{\"data\":$FIXED_DATA}" > /dev/null

# Remove bad record
del "$BASE/workflows/$WF_ID/records/$R3" > /dev/null
assert_eq "after delete" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "3"

# Replace all at once
echo ""
echo "REPLACE all records"
R10=$(uuid) R11=$(uuid) R12=$(uuid) R13=$(uuid) R14=$(uuid)
put "$BASE/workflows/$WF_ID/records" "{
  \"records\":[
    {\"id\":\"$R10\",\"data\":{\"input\":{\"messages\":[{\"role\":\"user\",\"content\":\"new1\"}]},\"output\":{\"messages\":[]}},\"topic\":\"A\"},
    {\"id\":\"$R11\",\"data\":{\"input\":{\"messages\":[{\"role\":\"user\",\"content\":\"new2\"}]},\"output\":{\"messages\":[]}},\"topic\":\"A\"},
    {\"id\":\"$R12\",\"data\":{\"input\":{\"messages\":[{\"role\":\"user\",\"content\":\"new3\"}]},\"output\":{\"messages\":[]}},\"topic\":\"B\"},
    {\"id\":\"$R13\",\"data\":{\"input\":{\"messages\":[{\"role\":\"user\",\"content\":\"new4\"}]},\"output\":{\"messages\":[]}},\"topic\":\"B\"},
    {\"id\":\"$R14\",\"data\":{\"input\":{\"messages\":[{\"role\":\"user\",\"content\":\"new5\"}]},\"output\":{\"messages\":[]}},\"topic\":\"C\"}
  ]
}" > /dev/null
assert_eq "replaced records" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "5"

# Verify old records are gone
OLD=$(get "$BASE/workflows/$WF_ID/records" | jq "[.records[] | select(.id==\"$R1\")] | length")
assert_eq "old records gone" "$OLD" "0"

del "$BASE/workflows/$WF_ID" > /dev/null

summary
