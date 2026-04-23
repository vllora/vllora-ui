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
| Zero-score fraction < 10% | ✅ | If >10% of scores are exactly 0.0, those records are dead weight with zero gradient contribution. Fix grader to give nonzero scores for "wrong but attempted" (0.01-0.10). | GRPO gradient ∝ advantage; score=0.0 for all K completions → advantage=0 → zero gradient. See SKILL.md Step 5. |

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

---

## Headroom Gate (Step 7d)

**Purpose**: GRPO learns from within-group reward variance. A model that scores too high has no variance (all completions correct → advantage ≈ 0 → no gradient). A model that scores too low can't produce any correct completions (also no useful variance). The sweet spot is where the model sometimes succeeds and sometimes fails — that's where GRPO learns fastest (arXiv:2508.14094: hard examples yield 34% improvement vs 3.5% for easy ones).

This is a HARD GATE with TWO bounds. You MUST have a base model eval with avg score between 0.05 and 0.75 before proceeding to training.

- **Lower bound (< 0.05)**: Model has no latent capability — GRPO cannot create ability from scratch (arXiv:2504.03380: gradient vanishes at p=0; arXiv:2602.14868: Goldilocks RL confirms).
- **Upper bound (> 0.75)**: Near-zero gradient — most K=8 groups have zero variance (arXiv:2508.14094: 3.7% learnable steps).
- **Optimal zone (0.30-0.70)**: Maximum GRPO gradient signal. arXiv:2504.03380 Table 1 explicitly validated this range across 5 benchmarks.

### Headroom Table

| 4B avg score | Headroom | Action |
|-------------|----------|--------|
| **< 0.10** | Maximum | Proceed to training with 4B. (DeepSeek-R1: 15.6%→71%, arXiv:2501.12948) |
| **0.10 - 0.50** | High | Proceed to training with 4B. Strong learning signal expected. |
| **0.50 - 0.75** | Moderate | Proceed to training with 4B. |
| **0.75 - 0.80** | Low | **Do NOT train 4B.** Eval a smaller model. |
| **> 0.80** | Near-zero | **Do NOT train 4B.** Only 3.7% of training steps produce learnable variance (arXiv:2508.14094). Eval a smaller model. |

### 0.8B Eval Table

| 0.8B avg score | Action |
|---------------|--------|
| **< 0.10** | Too hard — 0.8B can't do the task. Try 2B as a middle ground, or accept 4B's marginal improvement. |
| **0.10 - 0.75** | **Train 0.8B.** This is the sweet spot — the model has enough capability to sometimes succeed but enough room for GRPO to improve it. |
| **> 0.75** | The task is easy for all model sizes. Options: (1) make grader stricter, (2) don't train — base model is already good enough, (3) report to user. |

### Diagnostic Tree: Capability Gate Fails (base model avg < 0.05)

The model has near-zero capability on this task. GRPO amplifies existing ability — it cannot create it.

- **Option 1**: Try a larger model (e.g., if on 0.8B, try 4B). Larger models have more latent capability.
- **Option 2**: Try an instruction-tuned variant (e.g., Qwen3.5-4B-Instruct). Instruction tuning gives the model a baseline to build from.
- **Option 3**: SFT warmup — fine-tune on a small set of correct examples first, THEN run GRPO. DeepSeek-R1 (arXiv:2501.12948) used SFT cold-start before GRPO. **Note: our pipeline does not currently support SFT — this requires manual training outside the pipeline, then using the SFT checkpoint as the base model for GRPO.**
- **Option 4**: Simplify the task — break it into sub-tasks the model can partially solve. A task the model cannot do at all is not suitable for GRPO.

### Diagnostic Tree: Headroom Gate Fails (base model avg > 0.75)

Three distinct root causes — each has a different fix. Diagnose before acting.

**Step A: Check per-topic scores.** Are ALL topics >0.75, or only some?
- If **some topics score <0.5**: those topics have headroom. The problem is imbalanced difficulty. Fix: generate more records on the hard topics (rebalance dataset toward difficulty). Check if easy topics have a lenient grader — tighten criteria on those topics specifically.
- If **ALL topics score >0.75**: proceed to Step B.

**Step B: Eval a smaller model (0.8B) on the same records.** This distinguishes "model too good" from "records too easy."
- If **0.8B also scores >0.75**: the records are too easy — even a much weaker model aces them. Fix: regenerate harder records that require inference, hidden knowledge, or edge-case reasoning (arXiv:2505.17063). Also consider adding harder sub-topics.
- If **0.8B scores 0.10-0.75**: the model is genuinely good at this task, but 0.8B has headroom. Fix: train 0.8B instead of 4B — natural headroom without changing data.
- If **0.8B scores <0.05**: 0.8B has no latent capability (capability gate FAIL). Do NOT train 0.8B with GRPO — it will waste compute. Instead: distill from 4B (SFT the 0.8B on 4B's correct outputs, per arXiv:2501.12948 §4), or accept that this task needs 4B and explore grader strictness.
- If **0.8B scores 0.05-0.10**: 0.8B has marginal capability. Training may work but expect slow convergence. Consider distillation as a more efficient path.

**Step C: If records are hard AND 0.8B has no headroom AND grader is strict** — the task itself may be too simple for GRPO at any model size. Report to user: the base model already meets requirements, or the task needs to be reframed.

**Research basis:**
- "Records too easy": arXiv:2505.17063 ("Synthetic Data RL") — LLM rewriting of easy examples into harder variants. 2.6pp improvement.
- "Smaller model for headroom": When a 4B model scores 0.83, GRPO has no room. A 0.8B model might score 0.35 — it knows some patterns but misses hard cases.
- Topic diversity: Kimi k1.5 confirms narrow datasets produce lower ceiling performance. GRPO++ states "too narrow coverage leads to lower plateau performance."
- Grader strictness caveats: no paper or platform explicitly endorses making a grader stricter to manufacture headroom. OpenAI RFT describes grader tightening to close reward-hacking loopholes — framed as fixing quality measurement, not headroom engineering.

---

## Source-Part Coverage Audit (Step 7d)

**Purpose**: After the base model eval, check whether the training records cover ALL the knowledge from the source documents — not just the easy parts. Records where all completions score 1.0 produce zero GRPO gradient, and knowledge parts exclusively covered by these easy records will never be written into model weights.

### How to Audit

```python
import json

with open('finetune-project/training.jsonl') as f:
    records = [json.loads(line) for line in f]

with open('finetune-project/evaluations/eval-NNN.json') as f:
    eval_data = json.load(f)
scores_by_id = {}
for r in eval_data.get('results', []):
    rid = r.get('row', {}).get('id', '')
    score = r.get('score', 0)
    scores_by_id[rid] = score

part_records = {}  # part_slug -> list of (record_id, score)
for rec in records:
    rid = rec.get('id', '')
    score = scores_by_id.get(rid, 0)
    for part in rec.get('source_parts', []):
        part_records.setdefault(part, []).append((rid, score))

# Find coverage gaps: parts where ALL records score > 0.9
easy_only_parts = []
for part, recs in part_records.items():
    scores = [s for _, s in recs]
    if all(s > 0.9 for s in scores):
        easy_only_parts.append((part, len(recs), sum(scores)/len(scores)))

print(f"Total source parts: {len(part_records)}")
print(f"Parts with ONLY easy records (all scores >0.9): {len(easy_only_parts)}")
for part, n, avg in sorted(easy_only_parts):
    print(f"  {part}: {n} records, avg={avg:.2f} — COVERAGE GAP RISK")
```

### Interpret Results

| Finding | Meaning | Action |
|---------|---------|--------|
| 0 easy-only parts | All knowledge parts have at least one hard record | No coverage gap. Proceed to training. |
| 1-5 easy-only parts | Small coverage gap | Generate 2-3 harder records per gap part. Target base model score 0.3-0.7. |
| >5 easy-only parts | Significant coverage gap — GRPO will miss this knowledge | Generate 3-5 harder records per gap part. Consider topic restructuring. |

**How to generate harder records**: Easy records test surface knowledge ("Is milk an allergen?" → yes). Harder records test the same knowledge from angles the model is less likely to know: regulatory thresholds, exceptions, cross-references, edge cases.

---

## Harden Trivial Records (Step 7c++)

### When to Harden

Apply to the **chosen model's** eval only — a rejected model's trivial% is irrelevant after model selection.

| Condition | Action | Rationale |
|-----------|--------|-----------|
| trivial > 40% AND learnable < 35% | **HARDEN** | Too many zero-gradient records, insufficient signal |
| dead > 30% | **ADVISORY** | DAPO filters dead records from gradients (no harm), but inference compute wasted |
| trivial > 40% BUT learnable > 35% | **No action** | Enough signal despite trivials — DAPO dynamic sampling handles them at batch time |
| trivial < 40% | **No action** | Normal distribution |

> **Threshold transparency:** The 40% trivial and 35% learnable thresholds are engineering heuristics inspired by arXiv:2508.14094 (easy-only=3.7% learnable steps, hard-only=34.1%), not directly stated thresholds in any paper. The conjunctive gate (both conditions must be true) avoids unnecessary hardening when learnable% is already sufficient.

> **Why chosen model only?** Trivial/learnable is per-model (arXiv:2508.14094). A record trivial for a 4B model may still produce variance for a 0.8B. No paper studies cross-model trivial contamination.

### How to Harden

```bash
uv run ${CLAUDE_SKILL_DIR}/scripts/finetune.py harden-records \
  --eval-file finetune-project/evaluations/eval-001.json \
  --training-file finetune-project/training.jsonl \
  --min-score 0.85
```

This **adds** harder variants alongside the originals (originals kept as anchors). The LLM rewrites each trivial record's input to require deeper reasoning while keeping the same GT answer.

After hardening: re-upload records (`upload-records`), re-eval BOTH models (`create-eval`), re-check readiness, re-compare learnable_frac. Hardening changes the difficulty distribution, which may change which model is best.

Research: arXiv:2505.17063 (Synthetic Data RL: +29.2% from generate-eval-rewrite). arXiv:2603.24202 (iterative teacher-student with pass-rate-conditional difficulty adjustment).
