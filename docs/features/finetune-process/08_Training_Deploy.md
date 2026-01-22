# 08 - Training & Deploy

[← Back to Index](./00_INDEX.md) | [← Previous](./07_Dry_Run_Validation.md)

---

## Overview

When user clicks `[Start RFT]`, they enter a linear wizard:

- **Step 1:** Configure Train/Validation Split
- **Step 2:** Train RFT Model
- **Step 3:** Deploy Model

**Prerequisites before starting:**
- ✅ Dataset has valid records
- ✅ Grader is configured
- ✅ Dry run passed (recommended)

---

## Step 1 — Configure Split

**Purpose:** Define how to split records for training.

**User Configures:**
- Train/validation ratio (default 90/10)
- Stratification by topic (recommended)
- Whether to include generated data in validation

```typescript
interface SplitConfig {
  trainRatio: number;       // default: 0.9
  stratifyByTopic: boolean; // default: true
  includeGeneratedInValid: boolean; // default: false
}

function createSplit(
  records: DatasetRecord[],
  config: SplitConfig
): { train: DatasetRecord[]; valid: DatasetRecord[] } {
  const validRecords = records.filter(r => r.metadata?.valid !== false);
  
  if (config.stratifyByTopic) {
    // Split each topic proportionally
    const byTopic = groupBy(validRecords, r => r.topic);
    const train: DatasetRecord[] = [];
    const valid: DatasetRecord[] = [];
    
    for (const [topic, topicRecords] of Object.entries(byTopic)) {
      const shuffled = shuffle(topicRecords);
      const splitIdx = Math.floor(shuffled.length * config.trainRatio);
      train.push(...shuffled.slice(0, splitIdx));
      valid.push(...shuffled.slice(splitIdx));
    }
    
    return { train: shuffle(train), valid: shuffle(valid) };
  }
  
  // Simple random split
  const shuffled = shuffle(validRecords);
  const splitIdx = Math.floor(shuffled.length * config.trainRatio);
  return {
    train: shuffled.slice(0, splitIdx),
    valid: shuffled.slice(splitIdx),
  };
}
```

---

## Step 2 — Train RFT Model

**Purpose:** Execute reinforcement fine-tuning with validated dataset and grader.

**Prerequisites:**
- ✅ Dry run validation passed
- ✅ Train/validation datasets ready
- ✅ Grader config finalized

### API Call (OpenAI)

```python
import openai

job = openai.fine_tuning.jobs.create(
    model="o4-mini",
    training_file="file-abc123",        # rft_prompts.train.jsonl
    validation_file="file-def456",      # rft_prompts.valid.jsonl
    method={
        "type": "reinforcement",
        "reinforcement": {
            "grader": grader_config
        }
    },
    hyperparameters={
        "n_epochs": 2,
        "reasoning_effort": "medium"
    }
)
```

### Configuration Options

| Parameter | Options | Default | Notes |
|-----------|---------|---------|-------|
| `n_epochs` | 1-10 | 2 | More epochs = more training |
| `reasoning_effort` | low/medium/high | medium | Higher = better but slower |
| `batch_size` | auto or integer | auto | Samples per update |

### Monitoring During Training

Track these metrics:

| Metric | Description | Healthy Trend |
|--------|-------------|---------------|
| Train reward | Score on training set | Increasing |
| Valid reward | Score on validation set | Increasing (slower than train) |
| Loss | Training loss | Decreasing |

**Warning signs:**
- Valid reward decreasing = overfitting
- Train reward flat = learning stalled
- Large train-valid gap = overfitting

### Training Status Response

```json
{
  "id": "ftjob-abc123",
  "status": "running",
  "model": "o4-mini",
  "created_at": "2025-01-22T14:00:00Z",
  "training_file": "file-abc123",
  "validation_file": "file-def456",
  "current_epoch": 1,
  "total_epochs": 2,
  "metrics": {
    "train_reward_mean": 0.52,
    "valid_reward_mean": 0.48,
    "train_reward_std": 0.18
  },
  "estimated_completion": "2025-01-22T18:00:00Z"
}
```

---

## Step 3 — Results & Deploy

**Purpose:** Review training results and deploy the improved model.

### Success Criteria

| Metric | Threshold | Meaning |
|--------|-----------|---------|
| Valid reward improvement | > 10% | Model learned |
| No regression | Valid > baseline | Didn't break things |
| Consistent across topics | All topics improved | Balanced learning |

### Results Report

```json
{
  "training_id": "ftjob-abc123",
  "completed_at": "2025-01-22T18:00:00Z",
  "fine_tuned_model": "ft:o4-mini:org:custom-name:abc123",
  "baseline_metrics": {
    "overall_reward": 0.42,
    "by_topic": {
      "data_queries": 0.51,
      "calculations": 0.38,
      "content_gen": 0.45
    }
  },
  "final_metrics": {
    "overall_reward": 0.67,
    "by_topic": {
      "data_queries": 0.72,
      "calculations": 0.61,
      "content_gen": 0.68
    }
  },
  "improvement": {
    "overall": "+59.5%",
    "by_topic": {
      "data_queries": "+41.2%",
      "calculations": "+60.5%",
      "content_gen": "+51.1%"
    }
  }
}
```

### Deployment

```python
# Get fine-tuned model ID
model_id = job.fine_tuned_model  # "ft:o4-mini:org:custom-name:abc123"

# Use in production
response = openai.chat.completions.create(
    model=model_id,
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Calculate the ROI..."}
    ]
)
```

### Post-Deployment Monitoring

Recommended checks:
- A/B test against baseline
- Monitor production metrics
- Watch for regressions
- Collect feedback for next iteration

---

## Training Outcomes

| Outcome | Meaning | Action |
|---------|---------|--------|
| ✅ Improved significantly | Success | Deploy |
| ⚠️ Marginal improvement | Partial success | Test more, consider adjustments |
| ❌ No improvement | Grader or dataset issue | Revise and retry |
| ❌ Regression | Training problem | Investigate, don't deploy |

---

## UI Mockups

### Step I: Training Progress

```
┌─────────────────────────────────────────────┐
│ Training in Progress                        │
├─────────────────────────────────────────────┤
│ Model: o4-mini                              │
│ Dataset: 12,664 train / 1,407 valid         │
│                                             │
│ ████████████░░░░░░░░ 60%                    │
│                                             │
│ Epoch: 1 / 2                                │
│                                             │
│ Metrics:                                    │
│ ┌─────────────────────────────────────────┐ │
│ │ Train Reward:  0.52 (+24% from start)   │ │
│ │ Valid Reward:  0.48 (+14% from start)   │ │
│ │                                         │ │
│ │ Reward Curve:                           │ │
│ │     ╱─────                              │ │
│ │   ╱                                     │ │
│ │ ╱                                       │ │
│ │─────────────────────                    │ │
│ │ 0%              60%            100%     │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ETA: ~2 hours                               │
│                                             │
│ [Cancel Training]                           │
└─────────────────────────────────────────────┘
```

### Step J: Results

```
┌─────────────────────────────────────────────┐
│ Training Complete ✅                        │
├─────────────────────────────────────────────┤
│                                             │
│ Overall Improvement:                        │
│ ┌─────────────────────────────────────────┐ │
│ │        0.42  →  0.67                    │ │
│ │        ████████████████████████ +60%    │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ By Topic:                                   │
│   data_queries:  0.51 → 0.72  (+41%)       │
│   calculations:  0.38 → 0.61  (+61%) 🎉    │
│   content_gen:   0.45 → 0.68  (+51%)       │
│   tool_usage:    0.35 → 0.58  (+66%) 🎉    │
│                                             │
│ Sample Comparison:                          │
│ ┌───────────────────┬───────────────────┐   │
│ │ Before            │ After             │   │
│ │ Score: 0.35       │ Score: 0.72       │   │
│ │ [View Output]     │ [View Output]     │   │
│ └───────────────────┴───────────────────┘   │
│                                             │
│ Model ID: ft:o4-mini:org:custom:abc123      │
│                                             │
│ [Run Benchmarks] [A/B Test] [Deploy →]      │
└─────────────────────────────────────────────┘
```

---

## Platform Reference

| Platform | Models | API |
|----------|--------|-----|
| OpenAI | o4-mini | `fine_tuning.jobs.create` |
| Azure | o4-mini, GPT-5 | Similar to OpenAI |
| AWS Bedrock | Nova 2 Lite | Bedrock customization API |

---

[Next: UI Screens →](./09_UI_Screens.md)
