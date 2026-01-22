# 05 - Coverage & Generation

[← Back to Index](./00_INDEX.md) | [← Previous](./04_Topic_Categorization.md)

---

## Overview

This module covers:
- **Step E:** Generate Synthetic Samples
- **Step F:** Review Final Distribution

---

## Step E — Generate Synthetic Samples

**Purpose:** Fill coverage gaps with high-quality LLM-generated prompts.

**Input:** `categorized_prompts.jsonl`, `coverage_report.json`, `topic_hierarchy.json`  
**Output:** `synthetic_prompts.jsonl`

### Generation Plan

Based on coverage gaps, calculate what to generate:

```python
def create_generation_plan(coverage: dict, target_total: int) -> dict:
    """Calculate how many prompts to generate per topic"""
    
    plan = {}
    
    for topic, stats in coverage["distribution"].items():
        if stats["status"] == "under":
            gap_percentage = stats["gap"]
            prompts_needed = int(gap_percentage / 100 * target_total)
            
            plan[topic] = {
                "count": prompts_needed,
                "current": stats["count"],
                "target": stats["count"] + prompts_needed
            }
    
    return plan
```

### Generation Strategy

For each under-represented topic:

1. **Sample examples** - Pick 3-5 existing prompts from that topic
2. **Build generation prompt** - Include examples + constraints
3. **Generate batch** - Create N new prompts
4. **Validate** - Check structure and quality
5. **Deduplicate** - Remove copies of existing prompts

### Generation Prompt Template

```
You are generating training prompts for an AI assistant.

Topic: {topic_name}
Description: {topic_description}

Requirements:
- Each prompt must end with a user message
- Prompts should be realistic and varied
- Match the style and complexity of the examples
- Do NOT copy examples exactly

Examples from this topic:
---
{example_1}
---
{example_2}
---
{example_3}

Generate {count} unique, diverse prompts for this topic.
Output as a JSON array of message arrays.
```

### Validation of Generated Prompts

Apply same validation as Step A, plus:

| Check | Reason | Action |
|-------|--------|--------|
| Not duplicate of seed | Redundant | REJECT |
| Not duplicate of other synthetic | Diversity | REJECT |
| No LLM artifacts | "I cannot...", "[INSERT]" | REJECT |
| Matches topic | On-topic generation | REJECT |
| Reasonable length | Not too short/long | REJECT |

```python
def validate_synthetic(prompt: dict, seed_hashes: set, topic: str) -> tuple[bool, str]:
    # Basic structure validation
    valid, err = validate_prompt(prompt)
    if not valid:
        return False, err
    
    # Check for LLM artifacts
    content = get_user_content(prompt)
    artifacts = ["I cannot", "I'm sorry", "As an AI", "[INSERT]", "TODO"]
    if any(a.lower() in content.lower() for a in artifacts):
        return False, "llm_artifact"
    
    # Check not duplicate
    h = compute_hash(prompt)
    if h in seed_hashes:
        return False, "duplicate_of_seed"
    
    return True, "ok"
```

### Generation Statistics

Track quality metrics during generation:

```json
{
  "topic": "calculations",
  "requested": 1500,
  "generated": 1650,
  "valid": 1423,
  "rejected": 227,
  "rejection_reasons": {
    "duplicate_of_seed": 89,
    "duplicate_synthetic": 45,
    "llm_artifact": 34,
    "structural_error": 59
  },
  "pass_rate": "86.2%"
}
```

---

## Step F — Review Final Distribution

**Purpose:** Confirm combined dataset is balanced and ready for training.

**Input:** `categorized_prompts.jsonl`, `synthetic_prompts.jsonl`  
**Output:** `rft_prompts.train.jsonl`, `rft_prompts.valid.jsonl`

### Merge Process

1. **Combine** seed + synthetic prompts
2. **Final deduplication** (in case of overlap)
3. **Shuffle** to mix sources
4. **Split** into train/validation

### Train/Validation Split

| Setting | Recommended | Notes |
|---------|-------------|-------|
| Train % | 80-90% | Main training set |
| Valid % | 10-20% | Evaluation during training |
| Min valid | 50 samples | Minimum for meaningful eval |
| Stratification | By topic | Ensure balanced representation |

```python
def create_train_valid_split(
    prompts: list,
    train_ratio: float = 0.9,
    stratify_by: str = "topic"
) -> tuple[list, list]:
    """Create stratified train/validation split"""
    
    # Group by topic
    by_topic = defaultdict(list)
    for p in prompts:
        topic = p["metadata"]["topic"]
        by_topic[topic].append(p)
    
    train, valid = [], []
    
    for topic, topic_prompts in by_topic.items():
        random.shuffle(topic_prompts)
        split_idx = int(len(topic_prompts) * train_ratio)
        
        train.extend(topic_prompts[:split_idx])
        valid.extend(topic_prompts[split_idx:])
    
    # Shuffle final sets
    random.shuffle(train)
    random.shuffle(valid)
    
    return train, valid
```

### Final Distribution Report

```json
{
  "timestamp": "2025-01-22T12:00:00Z",
  "summary": {
    "total_prompts": 14071,
    "from_traces": 11892,
    "from_synthetic": 2179,
    "synthetic_percentage": "15.5%"
  },
  "distribution_comparison": {
    "data_queries": {
      "before": {"count": 4521, "percentage": 38.0},
      "after": {"count": 4521, "percentage": 32.1},
      "change": "-5.9%"
    },
    "calculations": {
      "before": {"count": 892, "percentage": 7.5},
      "after": {"count": 2315, "percentage": 16.5},
      "change": "+9.0%",
      "synthetic_added": 1423
    }
  },
  "balance_score": {
    "before": 0.20,
    "after": 0.72,
    "improvement": "+260%"
  },
  "split": {
    "train": 12664,
    "valid": 1407,
    "ratio": "90/10"
  }
}
```

---

## UI Mockups

### Step E: Generation Progress

```
┌─────────────────────────────────────────────┐
│ Generating Synthetic Samples                │
├─────────────────────────────────────────────┤
│ Filling coverage gaps...                    │
│                                             │
│ calculations:                               │
│   Target: +1,500                            │
│   Generated: 1,423 ✓                        │
│   Pass rate: 86.2%                          │
│   ████████████████████ Complete             │
│                                             │
│ tool_usage:                                 │
│   Target: +250                              │
│   Generated: 189 / 250                      │
│   ████████████░░░░░░░░ 76%                  │
│                                             │
│ Sample preview:                             │
│ ┌─────────────────────────────────────────┐ │
│ │ User: Calculate the monthly payment     │ │
│ │ for a $250,000 mortgage at 6.5% APR...  │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [Regenerate Failed] [Edit Sample]           │
└─────────────────────────────────────────────┘
```

### Step F: Final Distribution Review

```
┌─────────────────────────────────────────────┐
│ Final Dataset Distribution                  │
├─────────────────────────────────────────────┤
│                  Before    After            │
│ data_queries     38.0%  →  32.1%           │
│ calculations      7.5%  →  16.5%  ✓ Fixed  │
│ content_gen      27.3%  →  24.5%           │
│ tool_usage       17.9%  →  18.4%  ✓ Fixed  │
│ other             9.3%  →   8.5%           │
│                                             │
│ Balance Score: 0.20 → 0.72 (+260% ↑)       │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Total:     14,071 prompts               │ │
│ │ From data: 11,892 (84.5%)               │ │
│ │ Synthetic:  2,179 (15.5%)               │ │
│ │                                         │ │
│ │ Train set: 12,664 (90%)                 │ │
│ │ Valid set:  1,407 (10%)                 │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [Adjust Split] [View Samples] [Continue →]  │
└─────────────────────────────────────────────┘
```

---

## Quality Checklist

Before proceeding to grader setup, verify:

- [ ] All topics have sufficient samples (min 100 each)
- [ ] Balance score > 0.5
- [ ] Synthetic percentage < 50% (prefer real data)
- [ ] No single topic dominates (< 40%)
- [ ] Validation set covers all topics

---

[Next: Grader Setup →](./06_Grader_Setup.md)
