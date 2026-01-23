# 07 - Dry Run Validation

[← Back to Index](./00_INDEX.md) | [← Previous](./06_Grader_Setup.md)

---

## Action H — Dry Run

**Trigger:** `[Dry Run]` button in Dataset Details  
**Can Repeat:** ✅ Yes - run anytime to validate dataset + grader

**Purpose:** Test the grader on sample data to assess TWO things:
1. **Dataset Quality** - Are the prompts learnable?
2. **Grader Quality** - Does the evaluation function work correctly?

**When to Use:**
- After defining/changing grader
- After adding new data
- After generating samples
- Before starting RFT training

> ⚠️ **This step is CRITICAL.** Always run dry run before training.

---

## Why Dry Run Matters

| Without Dry Run | With Dry Run |
|-----------------|--------------|
| Wasted training budget | Early problem detection |
| Unknown failure cause | Clear diagnostics |
| Days of debugging | Minutes of validation |

---

## Process

1. **Sample** N prompts from dataset (200-500 recommended)
2. **Generate** responses using base model
3. **Score** each response with configured grader
4. **Analyze** the score distribution
5. **Diagnose** issues and make GO/NO-GO decision

```python
def run_dry_run(
    prompts: list,
    grader_config: dict,
    base_model: str = "o4-mini",
    sample_size: int = 300
) -> dict:
    # Sample prompts
    samples = random.sample(prompts, min(sample_size, len(prompts)))
    
    results = []
    for prompt in samples:
        # Generate response
        response = generate(base_model, prompt["messages"])
        
        # Score with grader
        score = evaluate(response, prompt, grader_config)
        
        results.append({
            "prompt": prompt,
            "response": response,
            "score": score
        })
    
    # Analyze
    scores = [r["score"] for r in results]
    return {
        "samples": results,
        "statistics": compute_stats(scores),
        "diagnosis": diagnose(scores)
    }
```

---

## Quality Assessment Framework

Dry Run helps assess **two independent qualities** that both need to be good:

### 1. Data Distribution Quality (from Coverage Dashboard)

**Balance Score** measures how evenly distributed your records are across topics.

| Balance Score | Rating | Meaning |
|---------------|--------|---------|
| **0.8 - 1.0** | ✅ Excellent | Topics are well-balanced |
| **0.6 - 0.8** | ✅ Good | Minor imbalance, acceptable |
| **0.4 - 0.6** | ⚠️ Fair | Noticeable gaps, consider generating more |
| **0.2 - 0.4** | 🔴 Poor | Significant imbalance, needs attention |
| **0.0 - 0.2** | 🔴 Critical | Severe imbalance, will hurt training |

**How it's calculated:**
```
Balance Score = min(topic_percentages) / max(topic_percentages)
```

**Example:**
- Topics at 25%, 25%, 25%, 25% → Balance = 1.0 (perfect)
- Topics at 40%, 30%, 20%, 10% → Balance = 0.25 (poor)

---

### 2. Score Distribution Quality (from Dry Run)

**What makes a "good" score distribution for RFT?**

| Metric | Good Range | Why It Matters |
|--------|------------|----------------|
| **Mean** | 0.20 - 0.60 | Room for model to improve |
| **Std** | > 0.15 | Grader can differentiate good vs bad |
| **Min** | > 0.0 | Some tasks are solvable |
| **Max** | < 1.0 | Not everything is trivially easy |

**Why mean should be 0.2-0.6 (not higher)?**

RFT learns by reinforcing good outputs and discouraging bad ones. If base model already scores 0.9+, there's little room to improve.

```
┌─────────────────────────────────────────────────────────────────┐
│              IDEAL ZONE FOR RFT                                 │
│                                                                 │
│  Too Hard    │    Sweet Spot     │    Too Easy                 │
│  (SFT first) │    (RFT works)    │    (RFT won't help)         │
│              │                   │                             │
│  ◀──────────▶│◀─────────────────▶│◀──────────────────────────▶ │
│  0.0    0.15 │ 0.20         0.60 │ 0.65                   1.0  │
│              │                   │                             │
│  Mean < 0.15 │  Mean 0.20-0.60   │  Mean > 0.65               │
│  RFT fails   │  RFT learns well  │  RFT no signal             │
└─────────────────────────────────────────────────────────────────┘
```

---

### 3. The Relationship: Data Quality vs Grader Quality

**The critical insight:** Low scores could mean bad data OR bad grader. You need to diagnose which.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DIAGNOSTIC MATRIX                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                        GRADER QUALITY                                   │
│                    ┌─────────────┬─────────────┐                        │
│                    │   Good      │    Bad      │                        │
│               ┌────┼─────────────┼─────────────┤                        │
│               │    │ ✅ IDEAL    │ ⚠️ FIX      │                        │
│    DATA   Good│    │             │ GRADER      │                        │
│  QUALITY      │    │ Proceed to  │             │                        │
│               │    │ training    │ Scores don't│                        │
│               │    │             │ reflect     │                        │
│               │    │             │ actual      │                        │
│               │    │             │ quality     │                        │
│               ├────┼─────────────┼─────────────┤                        │
│               │    │ ⚠️ FIX      │ 🔴 FIX      │                        │
│           Bad │    │ DATA        │ BOTH        │                        │
│               │    │             │             │                        │
│               │    │ Generate    │ Start with  │                        │
│               │    │ more, or    │ grader,     │                        │
│               │    │ use SFT     │ then data   │                        │
│               └────┴─────────────┴─────────────┘                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 4. How to Diagnose: Data Issue or Grader Issue?

**Step 1: Manually inspect samples**

| Look At | If Good Outputs Score Low | If Bad Outputs Score High |
|---------|---------------------------|---------------------------|
| **Diagnosis** | Grader too strict | Grader too lenient |
| **Fix** | Relax grader thresholds | Add stricter dimensions |

**Step 2: Check per-topic breakdown**

| Pattern | Diagnosis | Fix |
|---------|-----------|-----|
| One topic scores much lower | That topic is harder | SFT for that topic, or exclude |
| All topics uniformly low | Grader issue OR base model weak | Try relaxing grader first |
| Scores vary widely within topic | Good! Grader differentiates | Proceed |

**Step 3: Test grader on known examples**

```typescript
// Create test cases with known quality
const testCases = [
  { input: "...", output: "perfect response", expectedScore: 0.9 },
  { input: "...", output: "mediocre response", expectedScore: 0.5 },
  { input: "...", output: "terrible response", expectedScore: 0.1 },
];

// If grader scores don't match expectations, fix grader
for (const test of testCases) {
  const actualScore = grader.evaluate(test.output);
  console.log(`Expected: ${test.expectedScore}, Actual: ${actualScore}`);
}
```

---

### 5. Decision Checklist Before Training

| Check | Threshold | Status |
|-------|-----------|--------|
| Balance Score | > 0.5 | ☐ |
| Dry Run Mean | 0.20 - 0.60 | ☐ |
| Dry Run Std | > 0.15 | ☐ |
| Manual sample review | Scores match intuition | ☐ |
| Per-topic variance | No topic < 0.10 mean | ☐ |

**All checks pass?** → 🟢 GO - Proceed to training

**Any check fails?** → 🔴 NO-GO - Diagnose and fix first

---

## Interpreting Results

### Key Metrics

| Metric | Healthy Range | Meaning |
|--------|---------------|---------|
| Mean | 0.20 - 0.80 | Average performance |
| Std | > 0.15 | Grader differentiates outputs |
| Min | > 0.0 | Some tasks are solvable |
| Max | < 1.0 | Room for improvement |

### Score Distribution Patterns

#### ✅ Good Distribution (Proceed to Training)
```
Score Distribution:
    ██
   ████
  ██████  ██
 ████████████  ██
██████████████████
0.0  0.2  0.4  0.6  0.8  1.0

Mean: 0.42  Std: 0.21
```
- Bell-shaped curve
- Mean in middle range
- Good variance

#### ⚠️ Mean Too Low (Dataset Issue OR Grader Too Strict)
```
Score Distribution:
████████████████████
████████░░░░░░░░░░░░
██░░░░░░░░░░░░░░░░░░
0.0  0.2  0.4  0.6  0.8  1.0

Mean: 0.08  Std: 0.12
```

**Possible causes:**
1. **Dataset issue:** Prompts are too hard for base model
   - Solution: Use SFT first to bootstrap capability
2. **Grader issue:** Scoring criteria too strict
   - Solution: Relax grader thresholds

#### ⚠️ Mean Too High (Dataset Issue OR Grader Too Lenient)
```
Score Distribution:
░░░░░░░░░░░░░░░░░░██
░░░░░░░░░░░░░░████████
░░░░░░░░░░████████████
0.0  0.2  0.4  0.6  0.8  1.0

Mean: 0.91  Std: 0.08
```

**Possible causes:**
1. **Dataset issue:** Tasks are too easy, model already good
   - Solution: RFT may not help, consider harder tasks
2. **Grader issue:** Scoring criteria too lenient
   - Solution: Add stricter dimensions

#### ⚠️ Low Variance (Grader Issue)
```
Score Distribution:
░░░░░░░░████████░░░░░░
░░░░░░██████████████░░
░░░░████████████████░░
0.0  0.2  0.4  0.6  0.8  1.0

Mean: 0.50  Std: 0.08
```

**Cause:** Grader doesn't differentiate good from bad
- Solution: Add more discriminating dimensions

#### ⚠️ Bimodal (Grader Calibration Issue)
```
Score Distribution:
████████░░░░░░████████
██████████░░██████████
██████████░░██████████
0.0  0.2  0.4  0.6  0.8  1.0

Mean: 0.50  Std: 0.35
```

**Cause:** Grader is binary (pass/fail) instead of gradient
- Solution: Add partial credit dimensions

---

## Diagnosis Decision Tree

```
                    ┌─────────────────┐
                    │  Run Dry Run    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Mean < 0.10?  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │ Yes          │              │ No
              ▼              │              ▼
    ┌─────────────────┐      │    ┌─────────────────┐
    │ Dataset too hard│      │    │   Mean > 0.90?  │
    │   OR            │      │    └────────┬────────┘
    │ Grader too strict│     │             │
    └─────────────────┘      │  ┌──────────┼──────────┐
              │              │  │ Yes      │          │ No
              ▼              │  ▼          │          ▼
    ┌─────────────────┐      │  ┌─────────────────┐  ┌─────────────────┐
    │ Try: Review     │      │  │ Dataset too easy│  │   Std < 0.10?   │
    │ grader config   │      │  │   OR            │  └────────┬────────┘
    │ If still low:   │      │  │ Grader lenient  │           │
    │ Use SFT first   │      │  └─────────────────┘  ┌────────┼────────┐
    └─────────────────┘      │           │           │ Yes    │        │ No
                             │           ▼           ▼        │        ▼
                             │  ┌─────────────────┐  ┌─────────────────┐
                             │  │ RFT may not help│  │ Grader can't    │
                             │  │ Model is good   │  │ differentiate   │
                             │  └─────────────────┘  └─────────────────┘
                             │                                │
                             │                                ▼
                             │                       ┌─────────────────┐
                             │                       │ Add more grader │
                             │                       │ dimensions      │
                             │                       └─────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    🟢 GO        │
                    │ Proceed to      │
                    │ training        │
                    └─────────────────┘
```

---

## Per-Topic Analysis

Check if certain topics perform very differently:

```json
{
  "by_topic": {
    "data_queries": {"mean": 0.51, "std": 0.18, "status": "good"},
    "calculations": {"mean": 0.12, "std": 0.08, "status": "problem"},
    "content_gen": {"mean": 0.45, "std": 0.21, "status": "good"}
  }
}
```

**If one topic is much lower:**
- That topic may need SFT first
- Or exclude from RFT dataset
- Or adjust grader for that topic

---

## Sample Inspection

Always manually review:

| Sample Type | Why Review |
|-------------|------------|
| 5 highest scores | Are they actually good? (detect reward hacking) |
| 5 lowest scores | Are they actually bad? (detect over-strict grader) |
| 5 around mean | Typical performance |
| Edge cases (0.5) | Grader boundary behavior |

---

## Dry Run Report

```json
{
  "timestamp": "2025-01-22T13:00:00Z",
  "samples_evaluated": 300,
  "statistics": {
    "mean": 0.42,
    "std": 0.21,
    "min": 0.0,
    "max": 0.95,
    "median": 0.40,
    "percentiles": {
      "p10": 0.15,
      "p25": 0.28,
      "p75": 0.55,
      "p90": 0.72
    }
  },
  "distribution": {
    "0.0-0.2": 0.15,
    "0.2-0.4": 0.30,
    "0.4-0.6": 0.35,
    "0.6-0.8": 0.15,
    "0.8-1.0": 0.05
  },
  "by_topic": {
    "data_queries": {"mean": 0.51, "count": 95},
    "calculations": {"mean": 0.38, "count": 82},
    "content_gen": {"mean": 0.45, "count": 78},
    "tool_usage": {"mean": 0.35, "count": 45}
  },
  "diagnosis": {
    "dataset_quality": "good",
    "grader_quality": "good",
    "verdict": "GO",
    "warnings": [],
    "recommendations": []
  }
}
```

---

## UI Mockups

### GO State

```
┌─────────────────────────────────────────────┐
│ Dry Run Validation                   [🟢 GO]│
├─────────────────────────────────────────────┤
│ Tested: 300 samples                         │
│                                             │
│ Score Distribution:                         │
│     ██                                      │
│    ████                                     │
│   ██████  ██                                │
│  ████████████  ██                           │
│ ██████████████████                          │
│ 0.0  0.2  0.4  0.6  0.8  1.0               │
│                                             │
│ Mean: 0.42  Std: 0.21                       │
│                                             │
│ ✓ Dataset quality: Good                     │
│   Base model can partially solve tasks      │
│                                             │
│ ✓ Grader quality: Good                      │
│   Scores differentiate outputs well         │
│                                             │
│ [View High Scores] [View Low Scores]        │
│                                             │
│                           [Start Training →]│
└─────────────────────────────────────────────┘
```

### NO-GO State

```
┌─────────────────────────────────────────────┐
│ Dry Run Validation              [🔴 NO-GO]  │
├─────────────────────────────────────────────┤
│ Tested: 300 samples                         │
│                                             │
│ Score Distribution:                         │
│ ████████████████████                        │
│ ██████░░░░░░░░░░░░░░                        │
│ 0.0  0.2  0.4  0.6  0.8  1.0               │
│                                             │
│ Mean: 0.08  Std: 0.12                       │
│                                             │
│ ⚠️ Problem Detected                         │
│                                             │
│ Likely causes:                              │
│ 1. Dataset: Prompts too difficult           │
│    → Base model can't perform these tasks   │
│                                             │
│ 2. Grader: Scoring too strict               │
│    → Valid outputs marked as failures       │
│                                             │
│ Recommended actions:                        │
│ • Review sample outputs to determine cause  │
│ • If dataset issue: Use SFT fine-tuning     │
│ • If grader issue: Adjust grader config     │
│                                             │
│ [Review Samples] [Adjust Grader] [Try SFT]  │
└─────────────────────────────────────────────┘
```

---

[Next: Training & Deploy →](./08_Training_Deploy.md)
