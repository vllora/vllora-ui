# Finetune Agent - Coverage & Generation

## Purpose

This module handles Step 3 of the finetune workflow:
- Analyze topic coverage/balance
- Generate synthetic data to fill gaps
- Iterate until coverage is satisfactory

## Step 3: Coverage & Generation

This step can iterate multiple times until the dataset is balanced.

### Phase 1: Analyze Coverage

Call `analyze_coverage` to understand the current state:

```json
{
  "success": true,
  "coverage": {
    "balance_score": 0.45,
    "total_records": 150,
    "topic_distribution": {
      "billing_questions": 45,
      "technical_issues": 15,
      "account_management": 90
    },
    "under_represented": ["technical_issues"],
    "recommendations": [
      "Generate 30+ records for 'technical_issues' to improve balance"
    ]
  }
}
```

### Understanding Balance Score

| Score | Status | Action |
|-------|--------|--------|
| 0.8 - 1.0 | Excellent | Ready to proceed |
| 0.5 - 0.8 | Good | Can proceed, or generate more |
| < 0.5 | Poor | Recommend generating synthetic data |

### Phase 2: Recommend Actions

Based on analysis, recommend one of:

1. **Proceed to grader** - If balance is good (>0.5)
2. **Generate synthetic data** - If balance is poor (<0.5)
3. **Manual review** - If specific topics need attention

### Phase 3: Generate Synthetic Data

**Only generate after user approval.**

Call `generate_synthetic_data` with appropriate strategy:

#### Generation Strategies

| Strategy | Best For | Description |
|----------|----------|-------------|
| **Message Variation** | Multi-turn conversations | Vary the last user message while keeping context |
| **Few-Shot** | Consistent patterns | Generate similar examples from existing records |
| **Topic Description** | New topics | Generate from topic description alone |
| **Scenario Expansion** | Specific cases | Expand edge cases and variations |
| **Tool Chain** | Tool-using agents | Generate tool usage patterns |

#### Example Tool Call

```json
{
  "tool": "generate_synthetic_data",
  "input": {
    "workflow_id": "wf-123",
    "topic": "technical_issues",
    "count": 30,
    "strategy": "message_variation"
  }
}
```

### Phase 4: Iterate

After generation:

1. Call `analyze_coverage` again
2. Check if balance improved
3. Repeat if needed

**Target thresholds:**
- Balance score > 0.5
- All topics have minimum 100 samples (when possible)

## Example Interaction Flow

```
**Coverage Analysis**

I've analyzed your dataset's topic distribution:

**Balance Score:** 0.45 (Poor)

**Topic Distribution:**
| Topic | Records | % of Total |
|-------|---------|------------|
| Billing Questions | 45 | 30% |
| Technical Issues | 15 | 10% | ⚠️ Under-represented |
| Account Management | 90 | 60% |

**Recommendation:**
The "Technical Issues" topic only has 15 records, which may cause the model to underperform on these types of questions.

I recommend generating ~30 synthetic records for this topic using the "message variation" strategy.

Would you like me to:
1. Generate synthetic data for "Technical Issues"
2. Generate for all under-represented topics
3. Skip generation and proceed to grader config
4. Review existing records first
```

After generation:

```
**Generation Complete**

I've generated 30 new synthetic records for "Technical Issues".

**Updated Coverage:**
- Balance Score: 0.45 → 0.72 ✓
- Technical Issues: 15 → 45 records

**New Distribution:**
| Topic | Records | % of Total |
|-------|---------|------------|
| Billing Questions | 45 | 25% |
| Technical Issues | 45 | 25% | ✓ Improved |
| Account Management | 90 | 50% |

The dataset is now better balanced. Would you like to:
1. Proceed to grader configuration
2. Generate more data to further balance
3. Review the synthetic records
```

## Key Points

1. **Always analyze before generating** - Understand what's needed
2. **Get user approval** before generating synthetic data
3. **Show clear metrics** - Balance scores, distributions, improvements
4. **Iterate as needed** - One round may not be enough
5. **Explain strategies** - Help users understand their options
