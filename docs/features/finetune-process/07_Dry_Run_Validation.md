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

> Note: If a topic has 0 samples, Balance Score becomes 0.  
> This is a quick heuristic to catch severe imbalance early.

---

### 2. Score Distribution Quality (from Dry Run)

Dry Run produces a set of **reward scores** (usually normalized to **0.0 → 1.0**) for base-model outputs.

A “healthy” score distribution means:
- the base model can solve **some** tasks (signal exists),
- but not **all** tasks (room to improve),
- and the grader produces **enough spread** to distinguish good vs bad outputs.

> ✅ **Important note:** In some dashboards you may see `_mean` metrics that refer to **token usage mean** (prompt/completion tokens) for model graders.  
> In this document, **mean/std always refer to the reward score distribution** from Dry Run.

---

#### What makes a "good" score distribution for RFT?

Instead of relying on strict `min > 0` and `max < 1` (which can be misleading), use **distribution-based checks**.

| Metric | Healthy Range (Reward 0..1) | Why It Matters |
|--------|------------------------------|----------------|
| **Mean** | **0.25 - 0.65** | Enough failures to learn, enough wins to guide learning |
| **Std Dev** | **0.10 - 0.25** | Grader can differentiate outputs (not flat/noisy) |
| **% Scores > 0** | **> 10 - 20%** | Base model can solve some tasks → learnable signal |
| **% Scores = 1.0** | **< 30 - 50%** | Prevents "too easy" datasets or overly-lenient grading |
| **Percentiles** | `p10 < p50 < p90` with visible gaps | Confirms useful spread across easy/medium/hard cases |

✅ A common “good shape” looks like:
- some 0.0-0.2 (hard/failed)
- many 0.3-0.7 (learnable)
- some 0.8-1.0 (easy/high quality)

---

#### Why mean should be in the middle (not too high)

RFT improves the model by reinforcing higher-reward outputs.  
If the base model already scores near **0.9+**, there’s little improvement signal left.

```
┌─────────────────────────────────────────────────────────────────┐
│                      IDEAL ZONE FOR RFT                          │
│                                                                 │
│  Too Hard          Sweet Spot                 Too Easy           │
│  (SFT first)       (RFT works best)           (RFT low signal)   │
│                                                                 │
│  0.0     0.15      0.25                0.65     0.85        1.0  │
│   │───────│──────────│──────────────────│────────│──────────│   │
│           Mean too low        ✅ best            Mean too high   │
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
|------|-----------|--------|
| Balance Score | > 0.5 | ☐ |
| Dry Run Mean | 0.25 - 0.65 | ☐ |
| Dry Run Std | 0.10 - 0.25 | ☐ |
| % Scores > 0 | > 10 - 20% | ☐ |
| % Scores = 1.0 | < 30 - 50% | ☐ |
| Manual sample review | Scores match intuition | ☐ |
| Per-topic breakdown | No topic mean < 0.15 | ☐ |

**All checks pass?** → 🟢 GO - Proceed to training

**Any check fails?** → 🔴 NO-GO - Diagnose and fix first

---

## Interpreting Results

### Key Metrics

Use these metrics to interpret the Dry Run outcome:

| Metric | Healthy Range (Reward 0..1) | Meaning |
|--------|------------------------------|---------|
| Mean | 0.25 - 0.65 | Average base model performance with room to improve |
| Std | 0.10 - 0.25 | Grader distinguishes outputs meaningfully |
| p10 / p50 / p90 | separated by visible gaps | Confirms tasks span hard → medium → easy |
| % > 0 | > 10 - 20% | Confirms learnability (some success exists) |
| % = 1.0 | < 30 - 50% | Avoids "everything already perfect" |

> ⚠️ `min == 0` or `max == 1` is **not automatically bad**.  
> It’s normal to have a few perfect or failed cases — the *percentage* is what matters.

---

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

Mean: 0.45  Std: 0.18
%>0: 85%   %=1.0: 8%
```
- Mid-range hump (learnable)
- Visible spread across difficulty levels
- Base model partially succeeds

#### ⚠️ Mean Too Low (Dataset too hard OR Grader too strict)
```
Score Distribution:
████████████████████
████████░░░░░░░░░░░░
██░░░░░░░░░░░░░░░░░░
0.0  0.2  0.4  0.6  0.8  1.0

Mean: 0.08  Std: 0.09
%>0: 12%   %=1.0: 0%
```

**Possible causes:**
1. **Dataset too hard:** Base model can't perform tasks
   - Solution: Use SFT first to bootstrap capability
2. **Grader too strict:** Valid outputs marked as failures
   - Solution: Relax thresholds / allow partial credit

#### ⚠️ Mean Too High (Dataset too easy OR Grader too lenient)
```
Score Distribution:
░░░░░░░░░░░░░░░░░░██
░░░░░░░░░░░░░░████████
░░░░░░░░░░████████████
0.0  0.2  0.4  0.6  0.8  1.0

Mean: 0.92  Std: 0.06
%>0: 99%   %=1.0: 78%
```

**Possible causes:**
1. **Dataset too easy:** Model already solves tasks
   - Solution: RFT may not help, add harder tasks/examples
2. **Grader too lenient:** Scoring criteria too permissive
   - Solution: Add stricter dimensions (correctness, constraints, evidence)

#### ⚠️ Low Variance / Flat Scores (Grader Issue)
```
Score Distribution:
░░░░░░████████░░░░░░
░░░░██████████████░░
░░████████████████░░
0.0  0.2  0.4  0.6  0.8  1.0

Mean: 0.52  Std: 0.06
```

**Cause:** Grader doesn't differentiate good from bad
- Solution: Add more discriminating dimensions (partial credit, step-based scoring)

#### ⚠️ Bimodal (Binary scoring / Hard thresholds)
```
Score Distribution:
████████░░░░░░████████
██████████░░██████████
██████████░░██████████
0.0  0.2  0.4  0.6  0.8  1.0

Mean: 0.50  Std: 0.35
```

**Cause:** Grader is binary (pass/fail) instead of gradient
- Solution: Break reward into components and combine into a smooth score:
  - format correctness (0/1)
  - content correctness (0..1)
  - completeness (0..1)
  - constraint adherence (0/1)

---

## Diagnosis Decision Tree

```
                    ┌─────────────────┐
                    │  Run Dry Run    │
                    └────────┬────────┘
                             │
                    ┌────────▼───────────────┐
                    │ Mean outside 0.25-0.65 │
                    └────────┬───────────────┘
                             │
              ┌──────────────┼──────────────┐
              │ Yes          │              │ No
              ▼              │              ▼
    ┌───────────────────────┐│     ┌───────────────────────┐
    │ Mean too low (<0.25)  ││     │ Mean too high (>0.65) │
    └──────────┬────────────┘│     └──────────┬────────────┘
               │             │                │
               ▼             │                ▼
    ┌───────────────────────┐│     ┌────────────────────────────┐
    │ Check %>0 and samples  ││     │ Check %=1.0 and samples    │
    │ - %>0 too small?       ││     │ - %=1.0 too large?         │
    │ - Good outputs low?    ││     │ - Bad outputs high?        │
    └──────────┬────────────┘│     └──────────┬─────────────────┘
               │             │                │
   ┌───────────┴───────────┐ │   ┌────────────┴─────────────┐
   │ Dataset too hard OR    │ │   │ Dataset too easy OR      │
   │ grader too strict      │ │   │ grader too lenient       │
   └───────────┬───────────┘ │   └────────────┬─────────────┘
               │             │                │
               ▼             │                ▼
    ┌───────────────────────┐│     ┌────────────────────────────┐
    │ Fix grader first       ││     │ Tighten grader / add harder │
    │ If still low: use SFT  ││     │ examples (RFT may not help) │
    └───────────────────────┘│     └────────────────────────────┘
                             │
                             ▼
                 ┌───────────────────────────┐
                 │ Std too low (<0.10)?      │
                 └──────────┬────────────────┘
                            │
                ┌───────────┼───────────┐
                │ Yes       │           │ No
                ▼           │           ▼
      ┌───────────────────┐ │  ┌───────────────────┐
      │ Grader too flat    │ │  │ 🟢 GO             │
      │ Add more dimensions│ │  │ Proceed to train  │
      └───────────────────┘ │  └───────────────────┘
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
| Edge cases (0.4-0.6) | Grader boundary behavior |

---

## Dry Run Report

```json
{
  "timestamp": "2025-01-22T13:00:00Z",
  "samples_evaluated": 300,
  "statistics": {
    "mean": 0.45,
    "std": 0.18,
    "median": 0.44,
    "percentiles": {
      "p10": 0.18,
      "p25": 0.32,
      "p75": 0.58,
      "p90": 0.73
    },
    "score_fractions": {
      "gt_0": 0.86,
      "eq_1": 0.07
    }
  },
  "distribution": {
    "0.0-0.2": 0.18,
    "0.2-0.4": 0.28,
    "0.4-0.6": 0.34,
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
│ Mean: 0.45  Std: 0.18                       │
│ %>0: 86%   %=1.0: 7%                        │
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
│ Mean: 0.08  Std: 0.09                       │
│ %>0: 12%   %=1.0: 0%                        │
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
│ • Review samples to determine the cause     │
│ • If dataset issue: Use SFT to bootstrap    │
│ • If grader issue: Adjust grader config     │
│                                             │
│ [Review Samples] [Adjust Grader] [Try SFT]  │
└─────────────────────────────────────────────┘
```

---

[Next: Training & Deploy →](./08_Training_Deploy.md)
