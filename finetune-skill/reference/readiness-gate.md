# Pre-Training Readiness Gate & Difficulty Probe

Two post-eval validation steps that check whether data and grader are ready for training. Run after each evaluation (Step 7c and 7c+).

---

## Readiness Gate (Step 7c)

Run via `finetune.py readiness-check --file evaluations/eval-NNN.json`.

### Hard Checks (must ALL pass)

These ask "is the grader working?", NOT "is the base model good?" GRPO can learn from low base model scores — DeepSeek R1-Zero started at 15.6% and reached 71% (arXiv:2501.12948).

| Check | Pass | Fail → Action | Research basis |
|-------|------|---------------|----------------|
| Sample count >= 50 | ✅ | Too few prompts — GRPO needs sufficient samples for stable advantage estimates | OpenAI RFT: "several dozen to a few hundred" |
| Score std > 0.10 | ✅ | Grader not differentiating — when all completions score identically, advantages=0, zero gradient. Add criteria or partial credit | Zero-variance → zero gradient is fundamental to GRPO (DAPO §2.2). Threshold is a heuristic. |
| Average score > 0.05 | ✅ | Near-zero means no signal at all — 0% success rate means RFT cannot bootstrap | OpenAI RFT: "If a model has a 0% success rate, you cannot bootstrap to higher performance" |

### Soft Checks (warnings — training can proceed)

Low base model scores are expected — hard prompts are most valuable for GRPO learning (arXiv:2508.14094).

| Check | Pass | Fail → Action | Research basis |
|-------|------|---------------|----------------|
| Score concentration < 50% at single value | ✅ | If >50% of scores are one value, within-group variance is small → weak gradients. Std check can miss this when outliers inflate overall std | DAPO (arXiv:2503.14476): filters uniform groups. Threshold is a heuristic. |
| Fraction scores > 0.9 < 50% | ✅ | Grader may be too lenient — if most completions score near-identical, within-group variance is small → weak gradients | Heuristic. OpenAI recommends "smooth scores, not pass/fail stamps." |
| Fraction exact 0/1 < 60% | ✅ | Continuous scoring is more sample-efficient — binary rewards only produce signal when a group has mixed outcomes (some correct, some incorrect). DeepSeek-R1 and DAPO used binary rewards successfully, so this is a warning, not a blocker. | DAPO §2.2: filters all-correct/all-incorrect groups. "No Prompt Left Behind" (arXiv:2509.21880): 30-99% of prompts have zero variance with binary rewards. |
| Dead-weight (score < 0.1) < 50% | ✅ | Many zero-score records reduce sample efficiency. However, "No Prompt Left Behind" (arXiv:2509.21880) shows signal CAN be extracted from zero-variance prompts via entropy-guided shaping. DAPO uses dynamic sampling to skip them instead. | "No Prompt Left Behind": 30-99% zero-var is normal; argues for extracting signal, not filtering. |
| Pass rate (>0.7) > 20% | ✅ | Low pass rate — but with K=8, pass@8 >> pass@1. Hard prompts are most valuable for learning. | arXiv:2508.14094: training on hardest 10% yields 30-40% gains vs 3-15% for easy examples. |
| Prompt learnability > 30% | ✅ | Zero-variance prompts produce zero GRPO gradients. With dynamic sampling (DAPO), they're skipped. Without it, they waste compute. | DAPO §2.2: dynamic sampling filters groups where accuracy=0 or 1. |
| Score-length correlation < 0.3 | ✅ | Grader may reward/punish length instead of quality — reward hacking risk. Dr. GRPO identifies length bias from per-token loss normalization. | Dr. GRPO (arXiv:2503.20783): identifies length bias problem; recommends removing length normalization. Threshold is a heuristic. |
| Topic balance: no topic > 40% | ✅ | One topic dominates — training will over-optimize for it | Heuristic — balanced training data is standard ML practice. |

### WARN Safety Guide

**Not all WARN verdicts are safe to train through.** Check which soft checks failed:

| Failed soft check | Safe to train? | What to do |
|---|---|---|
| `score_concentration` > 70% | **NO — fix grader first.** At K=8, most groups will score identically → zero gradient → wasted GPU hours. The grader is broken. | Fix grader (add granularity, remove score snapping), re-eval |
| `score_concentration` 50-70% | **Caution.** Proceed if other checks are healthy, but expect some wasted compute. | Consider fixing grader if time allows |
| `pass_rate` low | **YES.** Expected for base model. With K=8, pass@8 >> pass@1. Hard prompts yield the largest GRPO gains. | Proceed to training |
| `binary_frac` high | **YES.** DeepSeek-R1 and DAPO trained with 100% binary rewards successfully. | Proceed — DAPO dynamic sampling handles uniform groups |
| `dead_weight` high | **YES.** 30-99% zero-variance is normal per "No Prompt Left Behind" (arXiv:2509.21880). | Proceed — optionally remove worst offenders |
| `topic_balance` off | **YES.** Suboptimal but won't break training. | Proceed — add data for weak topics later |
| `score_length_corr` high | **Caution.** Reward hacking risk — monitor during training. | Proceed but watch for length exploitation |

### Notes

**First eval with base model will often show low scores** — the base model hasn't been trained yet. This is expected. Focus on the hard checks (sample count, score spread, nonzero signal) rather than absolute score. Most soft warnings (pass_rate, binary_frac, dead_weight) are safe to train through. The exception is `score_concentration` > 70% — that indicates a grader problem, not a model problem.

**Binary rewards work.** DeepSeek-R1 (arXiv:2501.12948) and DAPO (arXiv:2503.14476) achieved state-of-the-art results using 100% binary rewards (0 or 1). They just produce learning signal only when a group has mixed outcomes, wasting compute on uniform groups. Continuous scoring is more sample-efficient but not strictly required.

---

## Difficulty Probe (Step 7c+)

Run via `finetune.py difficulty-probe --file evaluations/eval-NNN.json --save difficulty-report.json`.

**Purpose**: After the readiness gate passes (aggregate checks), the difficulty probe checks **per-prompt signal strength** — whether individual prompts will produce learning gradient at K=8. This catches a critical failure mode: data that looks good in aggregate but produces zero gradient at the prompt level.

### What It Reports

| Analysis | What it tells you | Research basis |
|----------|-------------------|----------------|
| Difficulty distribution | % dead / hard / learnable / easy / trivial prompts | DOTS+RR (arXiv:2506.05316): gradient ∝ p(1-p), max at p=0.5 |
| Predicted zero-variance rate | % of prompts where all K=8 completions will score identically → zero gradient | No Prompt Left Behind (arXiv:2509.21880): 30-99% is normal |
| Grader granularity | Score concentration, unique values, binary fraction — is the grader too coarse? | RGR-GRPO (arXiv:2511.12344): rubric >> binary verification |
| Per-topic learnability | Which topics have the least learning signal? | Hard Examples (arXiv:2508.14094) |
| Fix recommendations | Prioritized actions with cost/impact estimates | All of the above |

### Decision

| Exit code | Verdict | Action |
|-----------|---------|--------|
| 0 (PASS) | >= 30% learnable, grader granular | Proceed to Step 7d (training) |
| 2 (WARN) | 15-30% learnable or high zero-var | Review recommendations — consider grader redesign, increasing K, or SFT warm-up |
| 1 (FAIL) | < 15% learnable or grader broken (>70% concentration) | Fix grader or data before training — GPU hours will be wasted |

### Common Fixes

| Issue | Fix | Research |
|-------|-----|----------|
| Grader scores cluster at one value (>50%) | Redesign with multi-point rubric (0-7 scale) | RGR-GRPO (arXiv:2511.12344) |
| Many dead prompts (score < 0.05) | Remove or add SFT warm-up to bootstrap | DeepSeek-R1 (arXiv:2501.12948) |
| Many trivial prompts (score > 0.95) | Replace with harder variants using difficulty evolution (see below) | Hard Examples (arXiv:2508.14094) |
| High predicted zero-var at K=8 | Increase K to 16, or redesign grader | DAPO (arXiv:2503.14476) |

### Fixing Trivial Prompts: Difficulty Evolution Techniques

When the difficulty probe flags prompts as trivial (base model scores > 0.95 consistently), the user messages are too easy — the model's 8 completions all score high → zero variance → zero GRPO gradient. Replace these with harder versions of the same questions.

**Three techniques for making user messages harder** (the system prompt stays unchanged — only evolve the user message):

**1. Add Constraints** — add 2-3 extra requirements the answer must satisfy.

```
Before: "What is a fork in chess?"
After:  "What is a fork in chess? Your explanation must include (1) why
         the forked pieces can't both escape, (2) an example where a fork
         leads to material gain, and (3) a case where a fork is ineffective."
```

Why this helps GRPO: more constraints → harder to satisfy ALL of them → some completions miss one → score variance increases.

**2. Deepen** — require "why" and "how" reasoning, not just "what."

```
Before: "What is a discovered attack?"
After:  "Explain why discovered attacks are often more dangerous than direct
         attacks, and analyze how the tempo advantage compounds when the
         discovering piece also delivers check."
```

Why this helps GRPO: reasoning questions have more ways to partially succeed or fail → smoother score distribution.

**3. Increase Reasoning Steps** — require multi-step analysis where each step builds on the previous.

```
Before: "Is Nxe5 a good move here?"
After:  "Evaluate Nxe5 by considering: (1) the immediate material count after
         the capture, (2) what recapture options Black has, (3) the resulting
         position after Black's best recapture, and (4) whether White has a
         follow-up tactic in that position."
```

Why this helps GRPO: multi-step prompts produce partial-credit scores (got steps 1-2 right, failed step 3) → strong gradient signal.

**Rules for difficulty evolution:**
- Only evolve the **user message** — keep the system prompt and topic assignment unchanged
- The evolved question must still be **answerable from the linked source material** — don't drift outside the knowledge parts
- Update `ground_truth` if the harder question needs a broader excerpt
- Track lineage: set `evolved_from` pointing to the original record ID
- **Don't use "concretize" or "complicate input"** operations — these tend to fabricate specific details (board positions, data tables) that may not exist in the source material

> Technique names adapted from Evol-Instruct (WizardLM, ICLR 2024, arXiv:2304.12244). Only the 3 operations compatible with source-grounded data generation are recommended here.

---

## Relationship Between Gates

```
Data Quality Gate (Step 5.5b)     Readiness Gate (Step 7c)         Difficulty Probe (Step 7c+)
  Pre-eval                          Post-eval (aggregate)            Post-eval (per-prompt)
  Checks DATA quality               Checks GRADER + DATA interaction Checks SIGNAL STRENGTH
  Free or cheap (LLM samples)       Requires full eval run (~45 min) Uses eval results (free)
  Fix: rewrite data                 Fix: adjust grader or data       Fix: grader rubric, K, SFT
```

All three are needed. A dataset can pass data quality (well-constructed), pass readiness (good aggregate stats), but still produce flat training if most prompts fall outside the learnable difficulty range.
