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
  "description": "What this topic covers — guides data generation",
  "children": [],
  "sourceChunkRefs": ["source1:chunk3", "source1:chunk7"]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Slash-separated path (e.g., `"billing/refunds"`) |
| `name` | Yes | Display name |
| `description` | No | Guides the agent when generating data for this topic |
| `children` | Yes | Array of child topic nodes (empty for leaves) |
| `sourceChunkRefs` | No | Which document sections informed this topic (e.g., `"product-manual:ch2-billing"`) |

---

## Tracing Topics Back to Source Documents

When you build topics from user documents, note which sections informed each topic. This creates a lightweight traceability chain: **document section → topic → records**. You don't need a formal schema — just enough breadcrumbs so you can trace back when something goes wrong.

**Only add sourceChunkRefs after you have actually read the document and extracted content from specific sections.** The values must point to real sections you read — not guesses based on what a document might contain. If the user mentions having a PDF but you haven't read it yet, omit sourceChunkRefs entirely. Add them later when you actually process the document.

**Why this matters:**
- When a topic scores poorly in evaluation, you know which document sections to re-read for better prompts
- When you need more variety for a topic, you know where to look for additional source material
- When the user updates a document, you know which topics and records may be affected

**How to track it:**

Use `sourceChunkRefs` on each topic node, and use a simple naming convention like `"filename:section"`:

```json
{
  "id": "billing/refunds",
  "name": "Refunds",
  "description": "Refund requests, policies, and processing timeframes",
  "sourceChunkRefs": ["product-manual:ch3-refund-policy", "faq:billing-section"],
  "children": []
}
```

For records, encode the topic in the ID (e.g., `billing-refunds-001`) so you can always map a record back to its topic and from there to the source document.

If you extract knowledge into the `knowledge/` directory, organize files to mirror the document structure. This makes it easy to find the right source material when generating prompts for a specific topic.

---

## Designing a Good Hierarchy

### From Documents

1. **Read the document structure** — chapters, sections, headings map naturally to topics
2. **Group related sections** under parent topics
3. **Note which sections inform each topic** — add `sourceChunkRefs` so you can trace back later
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
  {
    "id": "billing",
    "name": "Billing",
    "description": "Payment, subscription, and invoicing questions",
    "children": [
      {"id": "billing/refunds", "name": "Refunds", "description": "Refund requests, policies, and processing", "children": []},
      {"id": "billing/upgrades", "name": "Plan Changes", "description": "Upgrading, downgrading, and switching plans", "children": []},
      {"id": "billing/payment-issues", "name": "Payment Issues", "description": "Failed payments, card updates, billing errors", "children": []}
    ]
  },
  {
    "id": "technical",
    "name": "Technical Support",
    "description": "Technical issues and troubleshooting",
    "children": [
      {"id": "technical/api", "name": "API Issues", "description": "Authentication, rate limits, endpoint errors", "children": []},
      {"id": "technical/integration", "name": "Integrations", "description": "Third-party integrations and webhooks", "children": []},
      {"id": "technical/performance", "name": "Performance", "description": "Slow queries, timeouts, optimization", "children": []}
    ]
  },
  {
    "id": "account",
    "name": "Account Management",
    "description": "User accounts, access, and settings",
    "children": [
      {"id": "account/login", "name": "Login Issues", "description": "Password reset, 2FA, locked accounts", "children": []},
      {"id": "account/permissions", "name": "Permissions", "description": "Roles, access control, team management", "children": []}
    ]
  }
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
