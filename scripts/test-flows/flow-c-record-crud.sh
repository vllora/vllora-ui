#!/bin/bash
# Flow C: Manual Record CRUD
set -e
source "$(dirname "$0")/helpers.sh"

echo "═══ Flow C: Record CRUD ═══"

WF_ID=$(create_workflow "flow-c-crud-$(uuid)" "crud test" | jq -r '.id')

R1=$(uuid) R2=$(uuid) R3=$(uuid)

# Add
echo ""
echo "ADD"
post "$BASE/workflows/$WF_ID/records" "{
  \"records\":[
    {\"id\":\"$R1\",\"data\":{\"input\":{\"messages\":[]},\"output\":{\"messages\":[]}},\"topic\":\"topicA\"},
    {\"id\":\"$R2\",\"data\":{\"input\":{\"messages\":[]},\"output\":{\"messages\":[]}},\"topic\":\"topicB\"},
    {\"id\":\"$R3\",\"data\":{\"input\":{\"messages\":[]},\"output\":{\"messages\":[]}},\"topic\":\"topicA\"}
  ]
}" > /dev/null
assert_eq "after add" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "3"

# Edit data (PATCH /data expects data as a JSON string, not an object)
echo ""
echo "EDIT data"
ESCAPED_DATA=$(echo '{"input":{"messages":[{"role":"user","content":"updated"}]},"output":{"messages":[{"role":"assistant","content":"new response"}]}}' | jq -Rs '.')
patch "$BASE/workflows/$WF_ID/records/$R1/data" "{\"data\":$ESCAPED_DATA}" > /dev/null
# data comes back as a JSON string in the response
R1_DATA=$(get "$BASE/workflows/$WF_ID/records" | jq -r ".records[] | select(.id==\"$R1\") | .data")
R1_MSG=$(echo "$R1_DATA" | jq -r '.input.messages[0].content')
assert_eq "updated data" "$R1_MSG" "updated"

# Edit topic
echo ""
echo "EDIT topic"
patch "$BASE/workflows/$WF_ID/records/$R1" '{"topic":"topicC"}' > /dev/null
R1_TOPIC=$(get "$BASE/workflows/$WF_ID/records" | jq -r ".records[] | select(.id==\"$R1\") | .topic")
assert_eq "updated topic" "$R1_TOPIC" "topicC"

# Delete one
echo ""
echo "DELETE one"
del "$BASE/workflows/$WF_ID/records/$R2" > /dev/null
assert_eq "after delete one" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "2"

# Replace all
echo ""
echo "REPLACE all"
R10=$(uuid) R11=$(uuid) R12=$(uuid) R13=$(uuid)
put "$BASE/workflows/$WF_ID/records" "{
  \"records\":[
    {\"id\":\"$R10\",\"data\":{\"input\":{\"messages\":[]},\"output\":{\"messages\":[]}}},
    {\"id\":\"$R11\",\"data\":{\"input\":{\"messages\":[]},\"output\":{\"messages\":[]}}},
    {\"id\":\"$R12\",\"data\":{\"input\":{\"messages\":[]},\"output\":{\"messages\":[]}}},
    {\"id\":\"$R13\",\"data\":{\"input\":{\"messages\":[]},\"output\":{\"messages\":[]}}}
  ]
}" > /dev/null
assert_eq "after replace" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "4"

# Old records gone
R1_EXISTS=$(get "$BASE/workflows/$WF_ID/records" | jq "[.records[] | select(.id==\"$R1\")] | length")
assert_eq "old r1 gone" "$R1_EXISTS" "0"

# Delete all
echo ""
echo "DELETE all"
del "$BASE/workflows/$WF_ID/records" > /dev/null
assert_eq "after delete all" "$(get "$BASE/workflows/$WF_ID/records" | jq '.records | length')" "0"

del "$BASE/workflows/$WF_ID" > /dev/null

summary
