# Topic Hierarchy Guide

Topics organize training data into structured categories, ensuring balanced coverage across all areas the model should learn.

---

## Why Topics Matter

Without topics, training data tends to cluster around easy/common scenarios, leaving gaps in harder areas. Topics ensure:
- **Balanced coverage**: Every important area gets enough training examples
- **Targeted generation**: Generate data specifically for weak areas
- **Quality analysis**: Identify which areas score well vs. poorly in evaluation
- **Systematic improvement**: Fix specific areas without affecting others

---

## Topic Node Structure

```json
{
  "id": "unique-path-id",
  "name": "Human-Readable Name",
  "parent_id": null,
  "system_prompt": "Focus on...",
  "reference_id": "optional-external-ref"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | No | Topic identifier (auto-generated UUID if omitted) |
| `name` | Yes | Display name |
| `parent_id` | No | Parent topic ID (null for root topics) |
| `system_prompt` | No | System prompt context for this topic — guides the model during training |
| `reference_id` | No | External reference ID for topic-source linking |

---

## Linking Topics to Source Documents

Topic-source relations create a formal traceability chain: **document part → relation → topic → records**. The mapping is built in three phases across the pipeline:

### Phase 1: Extraction (Step 2)

When extracting documents, each document produces its own files in a per-document subdirectory (`knowledge/doc-N/`):
- `doc-N/knowledge_parts.json` — full typed parts with content for that document
- `doc-N/parts-index.json` — lightweight index with `{id, type, title, extraction_path, pages, content_preview, source_doc}` per part

After all documents are processed, a merged `knowledge/all-parts-index.json` combines all per-document indexes. This merged index is small enough to read in full during topic design and relation building.

### Phase 2: Relation Building (Step 3)

After designing topics, the `relation-builder` subagent reads `knowledge/all-parts-index.json` and `topics.json`, then runs an iterative retrieve-and-verify loop per leaf topic:
1. Search the index for parts matching the topic's subject (title, extraction_path, content_preview)
2. Verify each candidate is actually relevant
3. If fewer than 3 relations found, broaden the search (synonyms, parent topic context)

The subagent writes `relations.json` — a flat array of `{topic_identifier, part_identifier}` pairs. This keeps the heavy index scanning out of the main context window.

If there are no documents (objective-only pipeline), skip this phase — no relations needed.

### Phase 3: Upload (Step 6)

After uploading topics, upload the relations via the API:

```bash
if [ -f relations.json ]; then
  RELATIONS=$(cat relations.json)
  curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/topics/relations \
    -H "Content-Type: application/json" \
    -d "{\"relations\": $RELATIONS}"
fi
```

- `topic_identifier` — the topic's `id` or `reference_id`
- `part_identifier` — the knowledge source part's `id` or `reference_id` (alias: `source_identifier`)

### Why this matters

- When a topic scores poorly in evaluation, you know which document parts to re-read for better prompts
- When you need more variety for a topic, you know where to look for additional source material
- When the user updates a document, you know which topics and records may be affected

**Only create relations to parts you've actually extracted** — never fabricate references. If you haven't extracted the document yet, skip linking and add relations later.

For records, encode the topic in the ID (e.g., `billing-refunds-001`) so you can always map a record back to its topic and from there to the source parts.

---

## Designing a Good Hierarchy

### From Documents

1. **Read the document structure** — chapters, sections, headings map naturally to topics
2. **Group related sections** under parent topics using `parent_id`
3. **Link topics to source parts** — after uploading, use the topic-source relations API to trace back later
4. **Create leaf topics** specific enough to generate 5-20 unique training examples

**Example: From a product manual**
```
Product Manual
├── Chapter 1: Getting Started     → topic: "getting-started"
│   ├── Installation               → topic: "getting-started/installation"
│   ├── First Steps                → topic: "getting-started/first-steps"
│   └── Configuration              → topic: "getting-started/configuration"
├── Chapter 2: Core Features       → topic: "core-features"
│   ├── Dashboard                  → topic: "core-features/dashboard"
│   └── Reporting                  → topic: "core-features/reporting"
```

### From an Objective (no documents)

1. **Break the objective into domains** → root topics
2. **Split each domain into scenarios** → child topics
3. **Add edge cases and error handling** → leaf topics

**Example: Customer support objective**
```json
[
  {"id": "billing", "name": "Billing", "parent_id": null, "system_prompt": "Focus on payment, subscription, and invoicing questions"},
  {"id": "billing-refunds", "name": "Refunds", "parent_id": "billing", "system_prompt": "Focus on refund requests, policies, and processing"},
  {"id": "billing-upgrades", "name": "Plan Changes", "parent_id": "billing", "system_prompt": "Focus on upgrading, downgrading, and switching plans"},
  {"id": "billing-payment-issues", "name": "Payment Issues", "parent_id": "billing", "system_prompt": "Focus on failed payments, card updates, billing errors"},
  {"id": "technical", "name": "Technical Support", "parent_id": null, "system_prompt": "Focus on technical issues and troubleshooting"},
  {"id": "technical-api", "name": "API Issues", "parent_id": "technical", "system_prompt": "Focus on authentication, rate limits, endpoint errors"},
  {"id": "technical-integration", "name": "Integrations", "parent_id": "technical", "system_prompt": "Focus on third-party integrations and webhooks"},
  {"id": "technical-performance", "name": "Performance", "parent_id": "technical", "system_prompt": "Focus on slow queries, timeouts, optimization"},
  {"id": "account", "name": "Account Management", "parent_id": null, "system_prompt": "Focus on user accounts, access, and settings"},
  {"id": "account-login", "name": "Login Issues", "parent_id": "account", "system_prompt": "Focus on password reset, 2FA, locked accounts"},
  {"id": "account-permissions", "name": "Permissions", "parent_id": "account", "system_prompt": "Focus on roles, access control, team management"}
]
```

---

## Guidelines

### Structure

| Guideline | Why |
|-----------|-----|
| 3-7 root topics | Too few = too broad; too many = fragmented |
| 2-3 levels deep | Deeper = more specific but harder to balance |
| 5-20 examples per leaf | Fewer = undertrained; more may overfit |
| Descriptive names | Helps the agent generate relevant data |
| Add descriptions | Guides data generation with specific scope |

### ID Format

Use slash-separated paths matching the hierarchy:
```
root-topic
root-topic/child-topic
root-topic/child-topic/grandchild-topic
```

Keep IDs lowercase, use hyphens for spaces:
- Good: `"technical/api-auth"`
- Bad: `"Technical/API Authentication"`

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Too many leaf topics (50+) | Can't generate enough data per topic | Merge related topics |
| Overlapping topics | Records could fit in multiple places | Make boundaries clearer |
| Topics too broad ("General") | Catch-all dilutes training signal | Split into specific subtopics |
| Topics too narrow ("Refund for plan X in Q3") | Only 1-2 possible examples | Generalize |
| Missing error/edge case topics | Model fails on unusual inputs | Add explicit error handling topics |

---

## Coverage Analysis

After generating data, check topic distribution:

### Computing Balance Score

```
For each leaf topic:
  actual_percentage = records_in_topic / total_records
  target_percentage = 1 / number_of_leaf_topics
  gap = |actual_percentage - target_percentage|

balance_score = 1 - (sum_of_gaps / 2)  // 0 to 1
```

### Rating Scale

| Score | Rating | Meaning |
|-------|--------|---------|
| 0.8-1.0 | Excellent | Even distribution |
| 0.6-0.8 | Good | Minor imbalances |
| 0.4-0.6 | Fair | Some topics need more data |
| < 0.4 | Poor | Significant gaps |

### Fixing Imbalances

1. Identify under-represented topics (count < average * 0.5)
2. Generate more data specifically for those topics
3. Re-check coverage
4. Avoid over-generating for already-strong topics

---

## Evaluation Score Distribution by Topic

After running an evaluation, group scores by topic to understand where the model is strong and where it struggles. This is one of the most actionable analyses — it tells you exactly where to focus improvement effort.

### How to Build the Breakdown

Map each record's evaluation score back to its topic (using the record ID convention, e.g., `billing-refunds-001` → `billing/refunds`). Then compute per-topic stats:

```
Topic                    Records   Avg Score   Std Dev   Min    Max
billing/refunds              18      0.82       0.12     0.55   1.00
billing/upgrades             15      0.75       0.18     0.30   0.95
billing/payment-issues       12      0.70       0.15     0.40   0.90
technical/api                 8      0.35       0.25     0.00   0.70
technical/integration         6      0.40       0.20     0.10   0.75
technical/performance         5      0.28       0.15     0.05   0.50
account/login                20      0.42       0.30     0.00   0.85
account/permissions          16      0.78       0.10     0.55   0.95
```

### What the Distribution Tells You

| Pattern | What it means | Action |
|---------|--------------|--------|
| High avg, low std (e.g., billing/refunds) | Consistently good — model handles this well | Leave as-is |
| High avg, high std (e.g., account/login) | Good on average but inconsistent — some prompts work, others don't | Review the low-scoring records — they likely have different characteristics (complexity, tone) than the high-scoring ones |
| Low avg, low std (e.g., technical/performance) | Consistently bad — model struggles across the board | Fundamental issue: check system prompt for domain knowledge, check grader criteria fit, or add more varied prompts |
| Low avg, high std (e.g., technical/api) | Mixed results — some prompts work, most don't | The working prompts show the model CAN do it. Study what's different about them and generate more like those |
| All topics similar scores | Grader doesn't differentiate by topic | Scores are driven by generic criteria, not topic-specific quality. May be fine, or may mean the grader isn't checking domain accuracy |
| One topic much lower than others | Topic-specific weakness | Check: (1) enough records? (2) prompts specific enough? (3) grader criteria fit this topic type? (4) source knowledge sufficient? |

### Cross-Referencing Scores with Record Count

The most useful view combines score quality with data quantity:

```
                        Few records (<10)          Many records (10+)
                    ┌─────────────────────────┬─────────────────────────┐
  High scores       │ Lucky but risky —        │ Working well —          │
  (avg > 0.6)       │ add more to be safe      │ don't touch             │
                    ├─────────────────────────┼─────────────────────────┤
  Low scores        │ Under-covered AND weak — │ Enough data but wrong   │
  (avg < 0.6)       │ needs more AND better    │ kind — improve quality, │
                    │ prompts                  │ check grader fit        │
                    └─────────────────────────┴─────────────────────────┘
```

**Priority order for fixes:**
1. Low scores + few records (worst case — both quantity and quality problems)
2. Low scores + many records (quality problem — prompts or grader need rework)
3. High scores + few records (risky — add more prompts to solidify)
4. High scores + many records (no action needed)

### Tracking Score Distribution Across Iterations

Save per-topic scores each iteration so you can see which topics are improving:

```
                  Iter 1    Iter 2    Iter 3
billing/refunds:   0.65  →   0.78  →   0.82   ↑ improving
technical/api:     0.20  →   0.22  →   0.35   ↑ slow improvement
account/login:     0.45  →   0.42  →   0.40   ↓ getting worse — investigate
```

If a topic's score drops between iterations, your changes may have negatively affected it (e.g., grader changes that help one topic but hurt another). Check the grader reasons for that topic in both iterations.

---

## Using the Backend API

Optionally, use the topic generation endpoint instead of designing manually:

```bash
curl -X POST http://localhost:9090/finetune/topic-hierarchy/generate \
  -H "Content-Type: application/json" \
  -d '{
    "goals": "Customer support for SaaS",
    "depth": 3,
    "degree": 4,
    "records": [],
    "max_topics": 5,
    "seed_topics": ["Billing", "Technical Support", "Account Management"]
  }'
```

The `seed_topics` parameter is particularly useful — extract section headings from documents and pass them as seeds for a more grounded hierarchy.
