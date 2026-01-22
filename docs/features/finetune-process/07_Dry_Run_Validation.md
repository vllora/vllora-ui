# 07 - Dry Run Validation

[← Back to Index](./00_INDEX.md) | [← Previous](./06_Grader_Setup.md)

---

## Step H — Dry Run Validation

**Purpose:** Test the grader on sample data to assess TWO things:
1. **Dataset Quality** - Are the prompts learnable?
2. **Grader Quality** - Does the evaluation function work correctly?

> ⚠️ **This step is CRITICAL.** Never skip dry run validation.

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
