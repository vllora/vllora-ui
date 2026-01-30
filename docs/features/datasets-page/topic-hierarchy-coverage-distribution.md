# Topic Hierarchy Coverage Distribution

This document defines a clean, non-ambiguous way to compute **coverage distribution** over a **topic hierarchy** when you **do not have `parent_id`**, only `childrenIds[]`.

---

## 1) Data Model

### Topics
Each topic node has:
- `id: string`
- `childrenIds: string[]` (empty array means leaf)

Example:
```json
{
  "id": "graphql",
  "childrenIds": ["graphql.query", "graphql.mutation"]
}
```

### Records
Each record has:
- `assignedTopicId: string` (the topic this record is assigned to)

Example:
```json
{
  "recordId": "r-001",
  "assignedTopicId": "graphql.query"
}
```

---

## 2) Definitions

### Leaf topic
A topic is a **leaf** if:
- `childrenIds.length == 0`

### Direct count
For any topic `T`:
- `directCount(T)` = number of records assigned directly to `T`

Formally:
\[
directCount(T) = \#\{ r \mid r.assignedTopicId = T \}
\]

### Total count (the “distribution” value shown for a node)
- `totalCount(T)` = the count used for coverage distribution charts/metrics

---

## 3) Recommended Rule: Leaf-Only Assignment (Cleanest)

### Rule A — Assign each record to exactly one **leaf**
- Every record MUST have exactly one `assignedTopicId`.
- That topic SHOULD be a **leaf**.

If a record is “general” and does not fit a specific child:
- create a dedicated leaf bucket under the parent, e.g.
  - `SomeParent/__general` (a real leaf)
- or use a global leaf:
  - `__unmapped`

This keeps counting unambiguous and avoids double counting.

---

## 4) Distribution Logic (Leaf-Only Assignment)

### 4.1 Leaf node total
If `T` is a leaf:
\[
totalCount(T) = directCount(T)
\]

### 4.2 Non-leaf node total = sum of children totals
If `T` is non-leaf:
\[
totalCount(T) = \sum_{c \in children(T)} totalCount(c)
\]

**Meaning:** a non-leaf’s distribution is the combined distribution of its descendants (through its children).

---

## 5) Finding Roots Without `parent_id`

Because you only have `childrenIds[]`, you can identify roots like this:

1. Build a set `allChildren` = union of every `childrenIds` across all topics.
2. Any topic whose `id` is NOT in `allChildren` is a **root**.

Formally:
- `roots = { T | T.id ∉ allChildren }`

Notes:
- You may have **one root** or **multiple roots**.
- Multiple roots are fine; treat them as a forest.

---

## 6) Computing Counts (Algorithm)

### Inputs
- `topicsById: Map<topicId, Topic>`
- `records: Record[]`

### Outputs
- `directCountById: Map<topicId, number>`
- `totalCountById: Map<topicId, number>`
- `roots: topicId[]`

### Steps

#### Step 1 — Initialize direct counts
- Set `directCountById[id] = 0` for every topic.

#### Step 2 — Count record assignments
For each record `r`:
- `directCountById[r.assignedTopicId] += 1`

Validation (recommended):
- If `r.assignedTopicId` is missing from `topicsById`, classify as invalid or map to `__unmapped`.

#### Step 3 — Find roots (no parent_id)
- Compute `allChildren`
- `roots = all topic ids not in allChildren`

#### Step 4 — Compute total counts bottom-up (DFS)
Use a recursive function:

- If node is leaf: `totalCount = directCount`
- Else: `totalCount = sum(totalCount(child))`

Important safeguards:
- Use a `visiting` set to detect cycles (bad data).
- Use a `memo` (cache) so each node is computed once.

---

## 7) Percent Distribution (Optional)

Let:
- `grandTotal = sum(totalCount(root) for each root)`

Then for any topic `T`:
\[
percent(T) = \frac{totalCount(T)}{grandTotal}
\]

---

## 8) Optional Variant: If You Allow Non-Leaf Assignments

If you choose to allow records assigned to non-leaf nodes too, define:

\[
totalCount(T) = directCount(T) + \sum_{c \in children(T)} totalCount(c)
\]

Trade-off:
- Pros: supports “general” records directly on parent nodes.
- Cons: mixes granularity (parent totals include records not attributed to any child).
- Recommendation: prefer `__general` leaf buckets instead.

---

## 9) Sanity Checks / Invariants

### With leaf-only assignment
- `directCount(nonLeaf)` should be `0` (or near 0 if you’re still migrating data).
- `totalCount(nonLeaf) == sum(totalCount(children))`
- Sum of all leaf `directCount` equals `grandTotal` (if every record assigned somewhere valid).

### General validation
- No missing children references: every `childId` should exist in `topicsById`.
- No cycles: a node cannot be its own descendant.

---

## 10) Practical Recommendation Summary

- Assign records to **exactly one leaf** topic.
- For “general” records, use `Parent/__general` (leaf) or `__unmapped`.
- Compute distribution as:
  - leaf: `total = direct`
  - non-leaf: `total = sum(children totals)`
- Roots are detected by “never appears as a child”.

This produces clean, additive distributions that are easy to visualize and rebalance.
