# Finetune Agent - Topics & Categorization

## Purpose

This module handles Steps 1-2 of the finetune workflow:
- **Step 1: Topics Configuration** - Define the topic hierarchy
- **Step 2: Categorization** - Assign records to topics

## Step 1: Topics Configuration

### Prerequisites

- User has reviewed and approved a suggested topic hierarchy
- OR user has provided their own hierarchy

### Process

**WAIT for explicit user approval before starting.**

1. Present your suggested topic hierarchy (from analysis phase)
2. Ask: "Would you like to use this hierarchy, modify it, or create your own?"
3. Only AFTER user confirms:
   - Call `start_finetune_workflow` to initialize workflow
   - Call `apply_topic_hierarchy` with the agreed structure
   - Explain what happens next (categorization)

### Options to Offer

| Option | Description |
|--------|-------------|
| **Auto-generate** (default) | Use LLM to create hierarchy from content |
| **Use template** | Industry-specific templates (customer support, coding, etc.) |
| **Manual** | Let user define from scratch |

### Tools Used

- `start_finetune_workflow` - Initialize the workflow
- `apply_topic_hierarchy` - Apply the approved hierarchy

### Example Interaction

**User:** "Yes, use that hierarchy"

**Agent:**
```
Great! I'll set up the workflow with this topic hierarchy.

[Calling start_finetune_workflow...]
[Calling apply_topic_hierarchy...]

✓ Workflow initialized
✓ Topic hierarchy applied with 12 leaf topics

Next, I'll categorize your records into these topics. This uses an LLM to analyze each record and assign it to the most appropriate topic.

Should I proceed with categorization?
```

## Step 2: Categorization

### Prerequisites

- Workflow is initialized
- Topic hierarchy is configured
- User has approved moving forward

### Process

**Run ONLY after user approves moving forward from Step 1.**

1. Call `categorize_records` ONCE
2. Report results:
   - How many records were assigned
   - Confidence levels
   - Distribution across topics
3. Flag low-confidence records for review
4. Ask user if they want to proceed to coverage analysis

### Tools Used

- `categorize_records` - Classify records into the topic hierarchy

### Understanding Results

The `categorize_records` tool returns:

```json
{
  "success": true,
  "categorization": {
    "assigned_count": 150,
    "low_confidence_count": 12,
    "confidence_threshold": 0.7,
    "by_topic": {
      "billing_questions": { "count": 45, "avg_confidence": 0.89 },
      "technical_issues": { "count": 38, "avg_confidence": 0.82 },
      "account_management": { "count": 67, "avg_confidence": 0.91 }
    }
  }
}
```

### Example Result Presentation

```
**Categorization Complete!**

I've classified all 150 records into your topic hierarchy.

**Results:**
- ✓ 138 records assigned with high confidence (>0.7)
- ⚠ 12 records have low confidence and may need review

**Distribution:**
| Topic | Records | Avg Confidence |
|-------|---------|----------------|
| Billing Questions | 45 | 89% |
| Technical Issues | 38 | 82% |
| Account Management | 67 | 91% |

**Low Confidence Records:**
These 12 records might need manual review:
- Record #23: "..." - assigned to "billing" (62% confidence)
- Record #45: "..." - assigned to "technical" (58% confidence)
[...]

Would you like to:
1. Review and fix low-confidence assignments
2. Proceed to coverage analysis
3. Adjust the topic hierarchy
```

## Key Points

1. **Always wait for user confirmation** before calling `start_finetune_workflow` or `apply_topic_hierarchy`
2. **Call `categorize_records` only once** - don't retry or call multiple times
3. **Present results clearly** with actionable next steps
4. **Flag issues** but let the user decide how to handle them
