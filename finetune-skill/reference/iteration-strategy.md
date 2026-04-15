# Iteration Strategy

How to analyze evaluation results, diagnose issues, assess data quality, and iteratively improve until the model is ready for training.

---

## The Eval-First Iteration Loop

The pipeline runs in two phases, with a topic-level iteration path when topics themselves are the problem:

```
Phase 1 — Eval Iterations (fast, ~45 min each, cheap):
  Eval → Readiness Gate → [FAIL] → Fix data/grader → Re-eval → ... → [PASS] →
                                  → Fix topics (if DEAD_WEIGHT/AMBIGUOUS for 2+ evals) → Re-eval

Phase 2 — Training (slow, hours, expensive):
  Train → Analyze → [good] → Deploy
                   → [bad]  → Fix → Back to Phase 1
```

**Max 5 eval-only iterations** (Phase 1) before training. **Max 3 training iterations** (Phase 2) before escalating. Topic-level fixes (SKILL.md Step 9c) count toward the Phase 1 budget.

Use `finetune.py readiness-check --file evaluations/eval-NNN.json` to run the readiness gate programmatically. See §5 for the criteria.

Typically 2-3 eval iterations are needed to reach readiness, then 1-2 training iterations to converge.

### Budget definition and budget check

**Budget** means the maximum resources the user allows for this iteration plan:
- **Money budget**: max USD spend (for example, `$20` total for all training iterations).
- **Time budget**: max wall-clock time (for example, `6 hours total` or `2 hours per run`).
- **Run budget** (optional): max number of training runs.

Before proposing Phase 2 training runs, the agent must ask the user:
- "What budget am I allowed to use (time and money)?"
- If not provided, ask a follow-up and do not assume unlimited budget.

Use the budget to choose conservative defaults (smaller first run, fewer epochs, lower token/candidate settings), then expand only if the user approves.

During training steps, the agent must track budget consumption and report it:
- Before each training run: show **estimated cost/time** and ask for confirmation if it exceeds remaining budget.
- After each run (or cancellation/failure): update **spent vs remaining** money/time budget.
- If remaining budget is insufficient for the next planned run, stop and ask the user whether to increase budget or change plan.

### Load precision (Phase 2 training)

Set `training_config.load_precision` when creating a provider finetune job (`bf16`, `4bit`, or `8bit`). The training container maps this to Unsloth / HF load flags.

| Value | When to use |
|-------|-------------|
| `bf16` | Default. Best numerical stability and usually fewer quantization edge cases; use when VRAM fits the model at full precision. |
| `4bit` | Tight GPU memory or larger base models; classic QLoRA-style loading. |
| `8bit` | Middle ground between memory and stability. |

### Infrastructure metrics (use when OOM or GPU pressure is suspected)

Training metrics (`GET .../jobs/{job_id}/metrics`) show GRPO loss, reward, and clipping — they do **not** show whether the accelerator ran out of memory. When a job **fails with OOM / CUDA out of memory**, **CUDA allocation errors**, or **sudden worker restarts**, call **`GET /finetune/workflows/{workflow_id}/jobs/{job_id}/infra-metrics`** (see [api-reference.md](api-reference.md) §Training Jobs) **before** only changing hyperparameters.

**What to look for:**
- **`GPU_MEMORY`** (or equivalent) high near the failure time → reduce VRAM pressure: lower `load_precision` to `4bit` or `8bit`, reduce `response_candidates_count` (K), reduce `max_output_tokens`, or use a smaller `base_model`.
- **`GPU_UTIL`** consistently low while the job is slow → may be I/O or scheduling; less often the root cause of OOM.

**Order of operations after OOM:** (1) Inspect infra-metrics if available. (2) Apply the [load precision](#load-precision-phase-2-training) table and the hyperparameter ladder in [Part 10](#part-10-post-training-iteration-training-metrics-diagnosis) (`max_output_tokens`, K, batching). (3) Retry with **one** change at a time so you can attribute the fix.

---

## Part 1: Analyzing Evaluation Results

After running an evaluation via `GET /finetune/evaluations/{id}`, you get back a response with `results` (per-record scores) and `summary` (aggregate stats). Here's how to read them.

### Step 1: Read the Summary

```json
{
  "summary": {
    "average_score": 0.58,
    "passed_count": 36,
    "failed_count": 14
  },
  "total_rows": 50,
  "completed_rows": 48,
  "failed_rows": 2
}
```

Compute these metrics from the results:

| Metric | How to compute | Target | What it tells you |
|--------|---------------|--------|-------------------|
| Average score | `summary.average_score` | > 0.6 | Overall quality floor |
| Pass rate | `passed_count / total_rows` | > 70% | How many records produce acceptable responses |
| Failure rate | `failed_rows / total_rows` | < 5% | Records that errored (grader crashed, timeout) — these are bugs, not quality issues |
| Score spread | Compute std dev from individual scores | 0.15-0.30 | Whether the grader differentiates quality levels |

### Step 2: Read Individual Record Results

Each record in `results` has:
```json
{
  "row_index": 0,
  "row": {"id": "billing-refunds-001", "messages": [...]},
  "epochs": {
    "0": [{
      "score": 0.85,
      "reason": "Response accurately addresses the query with good detail",
      "status": "completed"
    }]
  }
}
```

**What to look at:**
- `score` — The grader's score for the model's generated response (0-1)
- `reason` — The grader's explanation of why it gave that score. **This is the most valuable field** — it tells you exactly what the grader liked or disliked
- `row.id` — Maps back to your JSONL record ID, so you can find which prompt produced this result
- `row.messages` — The original prompt that was sent to the model

### Step 3: Sort and Bucket the Results

Group records into buckets for targeted analysis:

| Bucket | Criteria | What to do |
|--------|----------|------------|
| Failed (score = 0) | `score === 0` | Check `reason` — is the grader broken, or is the model truly producing garbage? |
| Low (score < 0.4) | `score > 0 && score < 0.4` | Read the `reason` — these are your improvement targets |
| Medium (0.4-0.7) | In-between | Acceptable but could improve — read a few reasons to spot patterns |
| High (score > 0.7) | `score > 0.7` | These are working well — generate more prompts like these |
| Perfect (score = 1.0) | `score === 1.0` | If too many (>50%), the grader may be too lenient |

### Step 4: Look for Patterns in the Reasons

Read the `reason` field from 5-10 low-scoring records. Look for:

- **Same reason repeated** → Systematic issue (e.g., "Response doesn't include step-by-step instructions" across many records means the grader expects structure the model isn't producing)
- **Contradictory reasons** → Grader is unstable (e.g., one record says "too verbose" and a similar one says "not detailed enough")
- **Irrelevant reasons** → Grader criteria misaligned with your objective
- **"No assistant response found"** → The model didn't generate a response — check if the prompt is malformed

### Step 5: Pre-Training Readiness Gate

Run the readiness gate to decide whether to proceed to training:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py readiness-check --file evaluations/eval-NNN.json
```

| Verdict | Criteria | Action |
|---------|----------|--------|
| **PASS** (exit 0) | All 4 hard + 8 soft checks pass | Proceed to training (Step 7d) |
| **WARN** (exit 2) | 1 check marginally fails | Can train, but improvements likely help |
| **FAIL** (exit 1) | Any check fails | Must fix before training — return to Step 7b |

**Hard checks** (must ALL pass — gate training):

These focus on **grader quality** ("is the grader working?"), not model performance. GRPO can learn from low base model scores — DeepSeek R1-Zero started at 15.6% accuracy and reached 71% via GRPO alone (arXiv:2501.12948).

| Check | Threshold | Why | Source |
|-------|-----------|-----|--------|
| Sample count | >= 50 prompts | GRPO advantage estimates are noisy below 50 | OpenAI RFT: "several dozen to a few hundred" |
| Score std | > 0.10 | Grader must differentiate — zero-std groups produce zero gradient (GRPO advantage = (r-mean)/std; std=0 → advantage=0) | Zero-variance → zero gradient is fundamental to GRPO (DAPO §2.2). Threshold is a heuristic. |
| Average score | > 0.05 | Just needs nonzero signal — only 0% success rate is truly fatal | OpenAI RFT: "0% success rate means RFT cannot bootstrap" |

**Soft checks** (warnings — don't gate training, but fixing improves outcomes):

Low base model scores are **expected and even desirable**. "Hard Examples Are All You Need" (arXiv:2508.14094) shows training on the hardest 10% yields 30-40% gains vs 3-15% for easy examples on GSM8K. Note: binary rewards work — DeepSeek-R1 (arXiv:2501.12948) and DAPO (arXiv:2503.14476) achieved state-of-the-art with 100% binary (0/1) rewards.

| Check | Threshold | Why | Source |
|-------|-----------|-----|--------|
| Score concentration | < 50% at any single value | If >50% of scores cluster at one value, within-group variance is small → weak gradients | DAPO (arXiv:2503.14476): filters all-correct/all-incorrect groups. Threshold is a heuristic. |
| High-score fraction | < 50% scoring > 0.9 | Lenient grader → small within-group variance → weak gradients | Heuristic. OpenAI recommends "smooth scores, not pass/fail stamps." |
| Binary fraction | < 60% scoring 0 or 1 | Continuous scoring is more sample-efficient — binary produces signal only when a group has mixed outcomes. But binary works: DeepSeek-R1 used 100% binary successfully. | DeepSeek-R1 (arXiv:2501.12948), DAPO (arXiv:2503.14476) both use binary rewards. |
| Dead-weight fraction | < 50% scoring < 0.1 | Reduces sample efficiency. "No Prompt Left Behind" (arXiv:2509.21880) shows 30-99% zero-var is normal AND argues signal can be extracted via entropy-guided shaping. DAPO skips these via dynamic sampling instead. | "No Prompt Left Behind" (ICLR 2026, arXiv:2509.21880) |
| Pass rate (>0.7) | > 20% | Nice to have — but hard prompts are the most valuable. With K=8, pass@8 >> pass@1 | "Hard Examples Are All You Need" (arXiv:2508.14094) |
| Prompt learnability | > 30% of prompts have score variance | Per-prompt variance drives GRPO learning — zero-variance prompts waste compute | DAPO dynamic sampling (arXiv:2503.14476) |
| Score-length correlation | \|r\| < 0.3 | High correlation means grader rewards/punishes length — reward hacking risk. Dr. GRPO identifies length bias from per-token loss normalization. | Dr. GRPO (arXiv:2503.20783) identifies the problem; threshold is a heuristic. |
| Topic balance | No topic > 40% of data | Imbalanced topics cause over-optimization for common topics | Heuristic — balanced training data is standard ML practice |

**⚠️ Why eval scores don't predict training performance:** Eval generates 1 completion per prompt. GRPO training generates K=8. A model with 6.5% pass@1 has ~41% chance of at least one good completion per prompt (1-0.935^8). The eval distribution is a lower bound on training signal, not a prediction of it.

### Step 5b: Grader Score Distribution Pre-Flight (Before Training)

Even if the readiness gate passes, check whether the grader's score distribution will produce a **useful GRPO training signal**. GRPO learns by comparing G=8 completions per prompt — if all completions score similarly, the gradient is near-zero and the model learns nothing.

**Check the score distribution from eval results:**

```
From your eval results, compute:
  - Score mean (already in summary.average_score)
  - Score std (compute from individual scores)
  - Fraction of scores > 0.9
  - Fraction of scores that are exactly 0 or exactly 1

HEALTHY distribution (good GRPO signal):
  Scores spread across 0.2-0.9, std > 0.10
  Example: [0.2, 0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 0.4]

PROBLEMATIC distributions (weak GRPO signal):
  ❌ Clustered high:  [0.85, 0.88, 0.90, 0.92, 0.87, 0.91, 0.89, 0.90]
     → std ≈ 0.02. Base model already good. Grader too lenient.
     → GRPO will have near-zero advantages → no learning.
     → FIX: Make grader harder — add stricter criteria, penalize minor issues.

  ❌ Binary (0 or 1): [0, 1, 0, 1, 0, 0, 1, 0]
     → Coarse signal. Model can't distinguish "almost right" from "garbage."
     → FIX: Add partial credit rubric (see grader-writing.md §Smooth Scoring).

  ❌ All zeros:        [0, 0, 0, 0, 0, 0, 0, 0]
     → No positive signal. GRPO cannot learn from negative-only rewards.
     → FIX: Lower grader bar or try larger base model (see Part 8, Symptom 7).
```

**Pre-flight checklist before committing to training** (quick check — see `finetune.py readiness-check` for the full gate with all 11 checks):

| Check | Pass | Fail → Action |
|---|---|---|
| Score std > 0.10 | ✅ | Grader not differentiating — add more criteria (HARD gate) |
| Average score > 0.05 | ✅ | No signal — base model may be incapable (HARD gate) |
| Fraction of scores > 0.9 is < 50% | ✅ | Grader too lenient — raise the bar (soft warning) |
| Fraction of exact 0 or 1 is < 60% | ✅ | Binary works (DeepSeek-R1, DAPO) but less sample-efficient (soft warning) |

> **Why this matters**: The most common GRPO training failure is "everything scores 0.9" — the base model is already good enough that the grader gives high marks to all G completions. The advantage formula divides by std: if std ≈ 0, advantages ≈ 0, gradients ≈ 0. The model trains for hours and learns nothing. This pre-flight check catches this BEFORE you waste compute.
>
> Reference: DAPO (arXiv:2503.14476) — identifies zero-variance groups as producing zero gradients and introduces dynamic sampling to filter them. Dr. GRPO (arXiv:2503.20783) — proposes removing std normalization entirely to avoid difficulty-dependent bias. See also `rft-grpo-training-explained.md` §What is Standard Deviation.

### Step 6: Continuation Readiness (for `finetuned/{cloud_job_id}` or `checkpointed/{cloud_job_id}`)

Before launching a continuation run, verify the source job is eligible:

| Check | Required value | Why |
|-------|----------------|-----|
| Source job status (`finetuned/`) | `succeeded` | Final-adapter continuation requires a successful source run |
| Source job status (`checkpointed/`) | terminal: `succeeded`/`failed`/`cancelled` | Checkpoint continuation may resume from failed/cancelled terminal runs |
| Provider live status (`finetuned/`) | succeeded | Guards against stale local state for final-adapter continuation |
| Provider live status (`checkpointed/`) | terminal: succeeded/failed/cancelled | Allows checkpoint resume from failed terminal runs |
| Final adapter exists (`finetuned/`) | Yes | Required to load prior adapter |
| Checkpoint exists (`checkpointed/`) | latest `checkpoint-step-*` present | Required to resume from checkpoint |

If any check fails, do not continue training from that source job. Fix/re-run the source job first.

---

## Part 2: Analyzing Training Progress (Per-Epoch Results)

During training, use `GET /finetune/workflows/{id}/finetune-evaluations?finetune_job_id=JOB_ID` to see how the model improves across epochs.

On **LangDB Cloud**, `limit` and `offset` define a **half-open range** on numeric `row_index`: `[offset, offset + limit)` (default `limit` is 20). This assumes workflow rows are numbered contiguously starting at 0; if not, use `row_index` for one row at a time. To scan all rows, step `offset` by `limit` until a page returns no rows (or use one large `limit`). For a **single row** across all epochs, use `row_index=N` (pagination params are ignored). See `reference/api-reference.md` (section **GET `/finetune/workflows/{workflow_id}/finetune-evaluations`**) for the full parameter table.

```json
{
  "results": [{
    "row_index": 0,
    "row": {"id": "record-1"},
    "epochs": {
      "0": [{"score": 0.5, "reason": "..."}],
      "1": [{"score": 0.7, "reason": "..."}],
      "2": [{"score": 0.85, "reason": "..."}]
    }
  }]
}
```

For gateway training metrics (`reward`, `loss`, `kl`, `grad_norm`, `learning_rate`), use the helper script:

```bash
# Per-epoch aggregate view
python3 ${CLAUDE_SKILL_DIR}/scripts/print_metrics_table.py \
  --workflow-id "$WORKFLOW_ID" \
  --job-id "$JOB_ID" \
  --mode epoch

# Per-step detailed view (includes fractional epoch + step)
python3 ${CLAUDE_SKILL_DIR}/scripts/print_metrics_table.py \
  --workflow-id "$WORKFLOW_ID" \
  --job-id "$JOB_ID" \
  --mode step
```

Use `--mode epoch` when deciding if the run trend is improving or degrading overall. Use `--mode step` when diagnosing instability (KL spikes, loss jumps, grad explosions, or learning-rate schedule issues at specific steps).

### What to Look For

| Pattern | Meaning | Action |
|---------|---------|--------|
| Scores increase each epoch (0.5 → 0.7 → 0.85) | Training is working | Keep going |
| Scores flat across epochs (0.5 → 0.5 → 0.5) | Model not learning from these prompts | Check if prompts are too ambiguous or grader criteria don't align with what the model can improve |
| Scores decrease (0.7 → 0.5 → 0.3) | Overfitting or grader instability | Reduce epochs, check grader consistency |
| Some records improve, others don't | Mixed prompt quality | The non-improving records likely have issues — examine their prompts |

### Reward Drop Drill-Down (Mandatory)

If aggregate `reward` drops between epochs or across recent steps, do not only look at summary metrics. Drill into row-level behavior:

1. Pull per-epoch row results (`/finetune-evaluations?finetune_job_id=...`), paging with `limit`/`offset` as `row_index` ranges if the dataset is large (or set `row_index` for one row).
2. Identify rows with the largest score drops (for example: epoch 0/1 score > 0.7 but latest epoch < 0.4).
3. For each dropped row, compare outputs across epochs (not just scores):
   - Did the model become shorter, vague, or generic?
   - Did it start missing required constraints it previously satisfied?
   - Did the grader `reason` change consistently with output quality, or look inconsistent/noisy?
4. Separate causes:
   - Output quality clearly worsened -> training/data issue (overfitting drift, weak data balance, too many epochs).
   - Output looks similar but score drops a lot -> grader instability or criteria mismatch.
5. Apply fixes only after this row-level check. Do not change learning rate/epochs blindly from aggregate reward alone.

This check is required whenever you detect a reward decrease, because aggregate reward can hide whether the problem is model behavior or grader behavior.

#### Helper command: print one row across epochs

Use `scripts/finetune.py print-row-outputs` to print a compact epoch-sorted table for one row:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py print-row-outputs \
  --workflow-id "$WORKFLOW_ID" \
  --finetune-job-id "$JOB_ID" \
  --row-index 12
```

Output format:

```
epoch | rollout_output | score | reason
0 | ... | 0.82 | ...
1 | ... | 0.67 | ...
2 | ... | 0.39 | ...
```

Tips:
- Start with rows that show the biggest score drop from early epochs to the latest epoch.
- Increase `--max-chars` if output/reason text is truncated (default is 160 chars per text cell).

### Per-Record Epoch Comparison

For each record, compare epoch 0 (before training) to the last epoch:
- **Improved records**: Training is teaching the model correctly for these scenarios
- **Stagnant records**: The model can't figure out how to score better — the prompt may be too vague, or the grader criteria may conflict
- **Degraded records**: Something is wrong — check if the grader is penalizing behaviors the model learned from other records

When per-topic trajectories show stagnant or degraded topics, **always check whether the fix is in records/topics, not just hyperparams**. See the **Training Metrics → Topics/Records Diagnosis** table in `analysis-strategy.md` §2d for the full mapping from training signals to data fixes.

---

## Part 3: Analyzing Topic Distribution

A balanced dataset trains the model evenly across all areas. An imbalanced one produces a model that's strong in some areas and weak in others.

### How to Check Distribution

Count records per leaf topic from your `training.jsonl` (each record should have an `id` that maps to a topic, or you track this via your `topics.json`):

```
billing/refunds:          18 records  (18%)
billing/upgrades:         15 records  (15%)
billing/payment-issues:   12 records  (12%)
technical/api:             3 records   (3%)  ← problem
technical/integration:     5 records   (5%)  ← problem
technical/performance:     4 records   (4%)  ← problem
account/login:            22 records  (22%)
account/permissions:      21 records  (21%)
```

### What the Distribution Tells You

| Pattern | What it means | Impact on model | Fix |
|---------|--------------|-----------------|-----|
| Even spread (~10-15% each) | Balanced coverage | Model learns all areas equally | None needed |
| One topic dominates (>30%) | Over-represented area | Model may default to that topic's patterns even for other topics | Remove some records or generate more for others |
| Topic has <5% of records | Under-represented area | Model will be weak here | Generate more prompts for this topic |
| Topic has 0 records | Missing coverage | Model has zero training on this area | Critical gap — generate immediately |
| All records in 2-3 topics | Most topics empty | Model only learns a narrow slice | Major rebalancing needed |

### Computing Balance Score

```
For each leaf topic:
  actual_percentage = records_in_topic / total_records
  target_percentage = 1 / number_of_leaf_topics
  gap = |actual_percentage - target_percentage|

balance_score = 1 - (sum_of_gaps / 2)    // 0 to 1
```

| Score | Rating | Action |
|-------|--------|--------|
| 0.8-1.0 | Excellent | Proceed |
| 0.6-0.8 | Good | Minor gaps, optional to fix |
| 0.4-0.6 | Fair | Generate more for weak topics before evaluating |
| < 0.4 | Poor | Significant rebalancing needed |

### Cross-Referencing Distribution with Eval Scores

The most powerful analysis combines distribution with evaluation results. Group eval scores by topic:

```
billing/refunds:          avg=0.82, 18 records  → Well-covered AND scoring well ✓
billing/upgrades:         avg=0.75, 15 records  → Well-covered AND scoring well ✓
technical/api:            avg=0.35,  3 records  → Under-covered AND scoring poorly ✗
account/login:            avg=0.40, 22 records  → Well-covered BUT scoring poorly ✗
```

This tells you different things:
- **Low records + low scores** (`technical/api`): Needs more AND better prompts
- **High records + low scores** (`account/login`): Enough prompts, but they're not effective — improve prompt quality or check if the grader criteria fit this topic
- **High records + high scores**: Working well — don't touch
- **Low records + high scores**: Lucky, but risky — add more prompts to be safe

---

## Part 4: Analyzing Data Variety

Repetitive prompts waste training capacity. The model sees nearly-identical scenarios multiple times and learns nothing new from the duplicates. Diverse prompts teach the model to generalize.

### Signs of Low Variety

| Signal | How to detect | Why it's bad |
|--------|--------------|--------------|
| Same question phrased slightly differently | Read 5 prompts from one topic — do they feel interchangeable? | Model memorizes one pattern instead of generalizing |
| All prompts same length/complexity | Check character counts — are they all similar? | Model only learns to handle one difficulty level |
| No edge cases | All prompts are "happy path" | Model fails on unusual inputs |
| Same user persona | Every prompt sounds like the same person | Model can't handle different communication styles |
| No error scenarios | No prompts about failures, mistakes, or confusion | Model doesn't learn how to handle errors gracefully |

### Variety Checklist Per Topic

For each leaf topic, your prompts should include a mix of:

**Question types:**
- [ ] Direct questions ("How do I...?")
- [ ] Complaints/frustration ("This isn't working and I'm frustrated")
- [ ] Vague/ambiguous requests ("I need help with my account")
- [ ] Detailed/specific requests ("I need to change my billing from annual to monthly, but I'm mid-cycle")
- [ ] Follow-up scenarios (multi-turn with prior context)

**Complexity levels:**
- [ ] Simple (one-step answer)
- [ ] Medium (requires explanation or multiple steps)
- [ ] Complex (edge case, multiple factors, requires judgment)

**User personas:**
- [ ] Beginner (doesn't know terminology)
- [ ] Technical user (uses precise terms)
- [ ] Frustrated user (emotional, possibly rude)
- [ ] Non-native speaker (shorter sentences, possible grammar issues)

**Scenario coverage:**
- [ ] Happy path (standard use case)
- [ ] Error/failure scenario (something went wrong)
- [ ] Boundary condition (limits, quotas, expiration)
- [ ] Ambiguous situation (unclear what the user wants)

### How to Improve Variety

If a topic's prompts are too similar:

1. **Rephrase aggressively**: Don't just swap synonyms — change the entire framing
   - "How do I get a refund?" → "I want my money back, this product sucks"
   - → "Can you reverse last month's charge? I was billed by mistake"
   - → "hi i was wondering if its possible to get refunded? not sure how this works"

2. **Change specifics**: Different amounts, dates, product names, error codes, user situations

3. **Vary complexity**: Mix one-liner questions with detailed multi-paragraph scenarios

4. **Add failure modes**: "What if the refund fails?", "What if they've already been refunded once?"

5. **Shift tone**: Professional → casual → frustrated → confused → sarcastic

---

## Part 5: Diagnosing — Data Problem or Grader Problem?

### It's a DATA problem when:

| Signal | Cause | Fix |
|--------|-------|-----|
| Specific topics score low, others fine | Weak prompts for those topics | Generate better, more specific prompts |
| Scores spread reasonably but average low | Prompts too vague | Make prompts clearer and more targeted |
| Model gives factually wrong responses | Missing domain context | Improve system prompt with domain knowledge |
| Model responses too short/generic | Prompts lack specificity | Write more detailed, scenario-specific prompts |
| Same error across many records | Systematic prompt issue | Fix the system prompt or generation approach |

### It's a GRADER problem when:

| Signal | Cause | Fix |
|--------|-------|-----|
| All scores ~0 or all ~1 | Grader too strict/lenient | Adjust scoring thresholds |
| Good responses score poorly | Criteria misaligned | Revise criteria to match objective |
| Std deviation < 0.1 | Not differentiating | Add more nuanced scoring criteria |
| Random-seeming scores | Unstable LLM judge prompt | Make judge prompt more specific |
| Scores don't correlate with quality | Wrong criteria | Rewrite grader to match what matters |
| All records fail same check | Overly strict constraint | Relax or remove that constraint |

### Quick Diagnostic (Do This First)

Pick 5 low-scoring records and manually review:
1. Read the prompt — is it clear and specific?
2. Read the model's generated response (from `row.messages`) — is it actually good?
3. Read the grader's `reason` — does the critique make sense?
4. If the response is good but score is low → **grader problem**
5. If the response is genuinely bad → **prompt or system prompt problem**
6. If the reason doesn't make sense → **grader is broken**

---

## Part 6: Applying Fixes

### Fixing Data Issues

**For specific weak topics:**
1. Identify the topic's lowest-scoring records
2. Read the grader's `reason` for each — what's the model doing wrong?
3. Generate replacement prompts that are more specific and varied
4. Add edge cases and error scenarios for that topic

**For overall quality:**
1. Review your system prompt — is it clear and specific enough?
2. Make prompts more specific so the model has clearer context
3. Ensure the system prompt includes relevant domain knowledge
4. Add prompts that require different response styles (step-by-step, comparison, code)

**For repetitive data:**
1. Run the variety checklist from Part 4 on each topic
2. Identify which question types, complexity levels, and personas are missing
3. Generate prompts that fill those gaps
4. Aim for no two prompts in the same topic that could be answered identically

### Fixing Grader Issues

**Grader too strict:**
- Lower thresholds for what counts as "good"
- Remove criteria that don't align with the objective
- Use partial credit instead of pass/fail

**Grader too lenient:**
- Add more evaluation criteria
- Raise the bar for high scores
- Add negative checks (things that should lower the score)

**Unstable LLM judge:**
- Be more specific in the judge prompt
- Use structured output format (JSON with explicit fields)
- Break evaluation into clear numbered criteria
- Set temperature to 0.0 in `completion_params`

**After changing the grader** — update without re-uploading data:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-grader --workflow-id $WORKFLOW_ID --file grader.js
```

**After changing the data** — re-upload records and sync to cloud:
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records --workflow-id $WORKFLOW_ID --file training.jsonl

# No manual sync needed — gateway auto-uploads workflow data to the cloud
# when creating eval or training jobs (via ensure_dataset_uploaded())
```

---

## Part 7: Tracking Progress Across Iterations

### Train/Validation Split (Recommended)

Before training, split your records into a **training set (80-90%)** and a **validation set (10-20%)**. The validation set is NOT used during training — it's used to detect reward hacking afterward.

**Why this matters for GRPO**: During training, the model generates fresh responses to training prompts, and the grader scores them. `train_reward_mean` will always go up (that's the objective). But if the model is reward hacking (exploiting grader shortcuts), it will score high on training prompts while performing the same or worse on unseen prompts. The validation set catches this.

**How to split:**
```
From your training.jsonl (e.g., 100 records):
  - training set: 80-90 records → used for training
  - validation set: 10-20 records → held out, used for post-training eval only

Rules:
  - Split proportionally across topics (don't put all of one topic in validation)
  - Validation records should cover all leaf topics if possible
  - Save as separate files: training.jsonl + validation.jsonl
```

**How to use after training:**
1. Run eval on the validation set using the fine-tuned model
2. Compare `valid_reward_mean` to `train_reward_mean`
3. If train reward is 20%+ higher than valid reward → reward hacking likely
4. Select the checkpoint with the highest `valid_reward_mean`, not `train_reward_mean`

> Reference: OpenAI RFT Guide — "Use a held-out validation set to detect reward hacking. Select checkpoints by validation reward, not training reward." See also Part 10, Step 2 for post-training diagnosis.

**Note**: This is currently a manual process (split the file yourself). A future version of `finetune.py` will support `--validation-split 0.15` to automate this.

### Saving Results

After every evaluation and training run, save the full API responses locally so you can compare across iterations:

**Evaluation results** — Save `GET /finetune/evaluations/{id}` response to `evaluations/eval-v{N}.json`:
```json
{
  "evaluation_run_id": "eval_xyz789",
  "status": "completed",
  "total_rows": 50,
  "completed_rows": 48,
  "failed_rows": 2,
  "results": [
    {
      "row_index": 0,
      "row": {"id": "record-1", "messages": [...]},
      "epochs": {
        "0": [{"score": 0.85, "reason": "Response accurately addresses the query", "status": "completed"}]
      }
    }
  ],
  "summary": {"average_score": 0.72, "passed_count": 40, "failed_count": 10}
}
```

Key fields to use for analysis:
- `summary.average_score` — overall quality metric
- `summary.passed_count / total_rows` — pass rate
- `results[].epochs["0"][0].score` — per-record score
- `results[].epochs["0"][0].reason` — grader's explanation (most valuable for diagnosis)
- `results[].row.id` — maps back to your JSONL record ID

**Training job results** — Save `GET /finetune/workflows/{workflow_id}/jobs/{job_id}/status` to `training-jobs/job-{N}.json`:
```json
{
  "id": "ft_job_001",
  "provider_job_id": "ftjob-abc123",
  "status": "succeeded",
  "base_model": "Qwen3.5-4B",
  "fine_tuned_model": "my-custom-model",
  "training_config": {"learning_rate": 0.00001, "lora_rank": 8, "epochs": 2.0},
  "created_at": "...",
  "completed_at": "...",
  "error_message": null
}
```

Key fields: `status` (succeeded/failed), `provider_job_id` (cloud job ID), `error_message` (if failed). For post-training eval, test the final adapter as `finetuned/{provider_job_id}`; do not pass raw `fine_tuned_model` or raw `provider_job_id`. To inspect available checkpoint aliases for the same job, call `GET /finetune/workflows/{workflow_id}/jobs/{job_id}/models` and use the returned `checkpointed/{provider_job_id}:{step}` values.

For a quick cross-job snapshot, call:
`GET /finetune/workflows/{workflow_id}/jobs?include_metrics=true`

This returns `eval_metrics` per job (when available): `latest_epoch_with_score` (1-based), overall average score, `avg_score_by_epoch` as an ascending list of `{epoch, avg_score}`, and distinct rows with any eval score. Use it to quickly compare multiple jobs before deeper per-row analysis.

For evaluation-run overviews (mean/std/min/max across many runs), use:
`GET /finetune/workflows/{workflow_id}/evaluations/metrics`

This returns bulk metrics per `evaluation_run_id` and avoids N calls to
`GET /finetune/evaluations/{evaluation_run_id}` when rendering eval-run tables.

**Per-epoch training scores** — Save `GET /finetune/workflows/{id}/finetune-evaluations?finetune_job_id=JOB_ID` to `training-jobs/job-{N}-epochs.json`. On cloud, each request returns `row_index` in `[offset, offset + limit)` (default `limit` 20). Merge pages by increasing `offset`, or use one large `limit` for a full snapshot if payload size allows.
```json
{
  "results": [{
    "row_index": 0,
    "row": {"id": "record-1"},
    "epochs": {
      "0": [{"score": 0.5, "reason": "..."}],
      "1": [{"score": 0.7, "reason": "..."}],
      "2": [{"score": 0.85, "reason": "..."}]
    }
  }]
}
```

Compare scores across epochs to see if training is working. See Part 2 for how to interpret epoch progression.

### Iteration Log

Use `finetune.py log-iteration` to maintain `iterations.json` — a structured changelog with metrics and delta comparisons:

```bash
# After each eval readiness check:
uv run scripts/finetune.py log-iteration --project-dir finetune-project \
  --phase eval --eval-file evaluations/eval-001.json \
  --changes "Initial eval with default grader" --change-type baseline --verdict FAIL

# After each training analysis:
uv run scripts/finetune.py log-iteration --project-dir finetune-project \
  --phase training --training-file training-jobs/train-001.json \
  --changes "First training: lr=1e-6, beta=0.01, epochs=adaptive" --change-type baseline --verdict PASS
```

The command auto-computes metrics and prints a delta comparison vs the previous same-phase iteration:
- **Eval**: avg_score, zero_rate, distinct_buckets, **plus per-topic metrics** (avg_score, zero_rate, score_std per topic). Topics with >80% zeros and std<0.05 across consecutive evals are flagged as `stalled_topics` in the entry.
- **Training**: final_reward, reward_delta, KL.

Read `iterations.json` before making changes to check if the last fix helped — the per-topic deltas show which topics improved and which are stuck.

Example output:
```
## Training Run 1
- Job: ft_job_001 → saved to training-jobs/job-001.json
- Base model: Qwen3.5-4B → Output: my-custom-model
- Epoch scores: 0→0.52, 1→0.68, 2→0.79 → saved to training-jobs/job-001-epochs.json
- Status: succeeded
```

This log is critical for diagnosing stalls — if scores aren't improving, the history shows exactly what was tried, what the grader complained about, and what changed.

### Comparing Iterations

When reviewing whether a change helped, compare the previous and current evaluation files. `log-iteration` prints this automatically:

1. **Overall**: Did average score and pass rate improve?
2. **Per-topic** (from `per_topic` field in iterations.json): Did the weak topics improve without degrading strong ones? The delta output shows `avg old→new` and `zero old→new` per topic.
3. **Per-record**: Are the same records still failing, or different ones?
4. **Grader reasons**: Are the complaints changing (progress) or staying the same (stuck)?
5. **Stalled topics**: If `stalled_topics` appears in the iteration entry, those topics had no improvement AND no score variance (>80% zeros, std<0.05) — they're dead weight for GRPO. See SKILL.md Step 9c for topic-level fixes.

**Important**: A topic with low avg but some variance (std>=0.05) is `HARD_BUT_LEARNING` — the strongest training signal for GRPO. Do not remove it. Only topics with near-zero variance are truly stalled.

If the same records keep failing with the same reasons after multiple iterations, the issue is likely fundamental — move to Part 8.

### When to Stop Iterating

- **Average > 0.6 and pass rate > 70%** → Ready to train
- **3+ iterations with no improvement** → Move to Part 8 below
- **Scores plateaued at 0.5-0.6** → May be acceptable for some use cases — discuss with user, or try the strategies in Part 8

---

## Part 8: When Iterations Stall

If you've done 3+ iterations and scores aren't improving, something fundamental is wrong. Don't keep making small tweaks — step back and diagnose the root cause.

### Symptom 1: Scores stuck at 0.3-0.5 despite data changes

**Root cause: The system prompt and grader are misaligned.**

The model generates responses based on the system prompt, but the grader evaluates based on different criteria. They're talking past each other.

**How to verify:** Take 3 low-scoring records. Read the model's response and the grader's reason side by side. Ask: "Is the grader penalizing something the system prompt never asked for?"

**Fix:**
1. Write down the 3-5 most important behaviors you want
2. Rewrite the system prompt to explicitly ask for those behaviors
3. Rewrite the grader to check for exactly those behaviors — nothing more
4. Strip out any grader criteria that aren't directly tied to the objective
5. Re-upload and evaluate from scratch

**Example:** System prompt says "be helpful and friendly" but grader checks for structured formatting, step-by-step instructions, and code blocks. The model writes friendly conversational answers and gets penalized. Fix: either add formatting requirements to the system prompt, or remove formatting checks from the grader.

### Symptom 2: Scores fluctuate randomly between iterations

**Root cause: Unstable grader (usually LLM-as-judge).**

If you're using `__langdb_call_llm_as_judge_obj`, the LLM judge may give different scores for the same response each time. This makes iteration impossible because you can't tell if a change helped or the scores just rolled differently.

**How to verify:** Run the same evaluation twice without changing anything. If scores differ by more than 0.1 on average, the grader is unstable.

**Fix:**
1. Set `temperature: 0.0` in the evaluator's `completion_params`
2. Make the judge prompt much more specific — vague prompts like "rate the quality" produce inconsistent results
3. Use numbered criteria with explicit point values:
   ```
   Rate 0-10:
   - Accuracy (0-3): Does the response contain correct information?
   - Completeness (0-3): Are all parts of the question addressed?
   - Clarity (0-2): Is the response easy to understand?
   - Tone (0-2): Is it professional and appropriate?
   ```
4. Consider switching to a **hybrid grader** — use programmatic checks for objective criteria and only use LLM-as-judge for subjective ones. This reduces the "surface area" of instability.
5. As a last resort, switch to a **pure programmatic grader** if the task has objectively verifiable criteria

### Symptom 3: Most records score 0

**Root cause: Grader has a hard gate that almost everything fails.**

A common pattern: the grader has a check early on that returns `score: 0` for most inputs. Everything after that check never runs.

**How to verify:** Read the `reason` field on the zero-scoring records. If they all say the same thing (e.g., "Response too short", "Missing required field"), you found the gate.

**Fix:**
1. Remove the hard gate — use partial credit instead:
   ```javascript
   // Bad: hard gate
   if (content.length < 100) return { score: 0, reason: "Too short" };

   // Good: partial credit
   let score = 0;
   if (content.length > 200) score += 0.3;
   else if (content.length > 100) score += 0.15;
   // ... other criteria
   ```
2. If the gate exists for a valid reason (e.g., safety check), keep it but make sure the threshold is reasonable for what the rollout model actually produces
3. Test your grader manually against a few real model responses before deploying

### Symptom 3b: Some records score 0 while others score normally (dead-weight records)

**Root cause: Individual records that the model cannot answer — not a grader-wide issue.**

Unlike Symptom 3 (where MOST records score 0 due to a broken grader), here a subset of records consistently produce all-zero rewards while the rest of the dataset works fine. These are "dead-weight" records.

**Why this matters (research-backed):** GRPO/RFT research demonstrates that **LLMs cannot learn from negative-only rewards**. When every sampled response to a prompt scores 0, the model gets zero gradient — it learns nothing from that record. Worse, these records can actively destabilize training by contributing noise to the policy gradient. The model needs at least SOME responses that score > 0 to have something to reinforce — partial credit (0.3, 0.5) is fine, but pure zero is dead weight.

**Common causes of dead-weight records:**
- **Wrong question premise** — the LLM that generated the training data misread the source material (e.g., confused a pin with a skewer in chess), making the question unanswerable
- **Question too hard for the base model** — the question is valid but the model can't produce any reasonable response at its current capability level
- **Ambiguous question** — multiple interpretations exist, the model picks one the grader doesn't expect, scores 0 every time
- **Mismatched ground_truth** — the ground_truth excerpt doesn't match the question, so the grader's factual accuracy check always fails

**How to verify:** After eval, extract records with max score < 0.1. If this is a small subset (< 20%) while the rest scores normally, it's dead-weight records, not a grader issue.

**Fix — remove and regenerate:**
1. **Remove** the zero-scoring records from `training.jsonl`
2. **Regenerate replacements** for the same topics using `generate_records.py --append` with different parameters (higher temperature, different prompt types) to get different questions
3. **Re-validate and re-upload** the updated dataset
4. **Re-eval** to confirm the replacements score > 0

See SKILL.md Step 8b+ for the full procedure with code.

**When to skip regeneration:** If dead-weight records are < 5% of total and not concentrated in a single topic, removing without replacement is fine.

**Key insight:** This is fundamentally different from Symptom 3. Symptom 3 is a grader problem (fix the grader). Symptom 3b is a data quality problem (fix the records). The fix for 3b is always remove + replace — never just "fix the grader to give partial credit" because the records themselves are the issue.

### Symptom 4: High scores on eval but model performs badly after training

**Root cause: Grader rewards the wrong thing.**

The model learned to game the grader — producing responses that score well but aren't actually useful.

**How to verify:** After training, test the model with prompts NOT in the training set. Compare its responses to the base model. If the fine-tuned model is worse or just different (not better), the grader was rewarding superficial patterns.

**Fix:**
1. Review what the grader actually checks — is it checking for quality or for surface patterns?
   - Checking for keywords = model learns to stuff keywords
   - Checking for length = model learns to pad responses
   - Checking for structure = model learns to use bullet points even when inappropriate
2. Rewrite the grader to check for **outcomes**, not **patterns**:
   - Instead of "contains step-by-step" → "correctly solves the user's problem"
   - Instead of "response > 200 chars" → "covers all aspects of the question"
   - Instead of "includes code block" → "code is syntactically valid and addresses the question"
3. Add negative criteria: things that should lower the score even if other criteria pass (hallucinations, incorrect facts, off-topic content)

### Symptom 5: Scores plateau at 0.5-0.6, can't break through

**Root cause: Usually one of these three things.**

**A. The objective is too broad.** You're trying to train the model to do too many things at once. A model can't simultaneously learn to be a Python expert, a customer support agent, and a creative writer from 100 prompts.

**Fix:** Narrow the scope. Pick the most important behavior and optimize for that first. You can always do additional fine-tuning runs for other behaviors.

**B. The base model genuinely can't do what you're asking.** Smaller models (4B parameters) have real limitations. If your task requires deep reasoning, multi-step logic, or broad world knowledge, the base model may not have the capacity.

**Fix:** Try a larger base model. Or simplify the task — break complex multi-step prompts into simpler single-step ones.

**C. The prompts don't represent real-world usage.** If your training prompts are too clean, too formal, or too uniform, the model learns a narrow pattern. Real users are messy, vague, and unpredictable.

**Fix:** Make prompts messier and more varied:
- Add typos and casual language
- Include vague requests ("help me with the thing")
- Mix in frustrated/confused users
- Add scenarios where the right answer is "I don't know" or "Let me clarify"

### Symptom 6: One topic always scores low, no matter what

**Root cause depends on the per-topic classification.** Run `diagnose-grader` — the `per_topic` section classifies each topic:

| Classification | Pattern | Meaning |
|---|---|---|
| `DEAD_WEIGHT` | >80% zeros, std<0.05 | No useful gradient — model can't produce anything scoreable |
| `AMBIGUOUS` | high variance (std>0.3), low avg | Topic too broad — records don't agree on what "good" looks like |
| `WEAK` | low avg, >50% zeros, std<0.08 | Model stuck, almost no variance |
| `HARD_BUT_LEARNING` | low avg but std>=0.05 | Hard topic with partial credit — **best training signal, keep it** |

**How to verify:** Check `iterations.json` per-topic metrics across 2+ evals. A single bad eval doesn't mean the topic is broken — look for persistent patterns.

**Fix — depends on classification:**

1. **`HARD_BUT_LEARNING`** — do nothing. Low average with score variance is exactly what GRPO needs. These topics produce the strongest gradient signal.

2. **`WEAK` or grader doesn't fit the topic** — make the grader topic-aware:
   ```javascript
   // Adjust expectations based on query type
   const isTroubleshooting = userContent.match(/error|broken|not working|help/i);
   if (isTroubleshooting) {
     // Check for diagnostic steps, not just information
     if (content.match(/step|try|check|verify/i)) score += 0.3;
   } else {
     // Check for informative content
     if (content.length > 100) score += 0.3;
   }
   ```

3. **`AMBIGUOUS`** — split into 2-3 narrower subtopics in `topics.json`, regenerate records, re-upload and re-eval (SKILL.md Step 9c).

4. **`DEAD_WEIGHT`** (persistent across 2+ evals) — remove the topic and its records. The base model genuinely cannot do this task.

5. Or split into separate fine-tuning runs — one per topic cluster that needs different evaluation criteria.

### Symptom 7: Base model scores near 0% — can't even get started

**Root cause: The base model has no capability on this task.**

Fine-tuning makes gradual improvements by reinforcing good responses. If the base model can't produce ANY reasonable response, there's nothing to reinforce. This is a fundamental limitation — you can't bootstrap from zero.

**How to verify:** Run evaluation on a small sample (10-20 prompts). If every single record scores 0 or near-0, and the model's generated responses are complete garbage (not just imperfect), the base model can't do this task.

**Fix — graduated approach:**
1. **Try a larger base model** — A 4B model may lack the capacity. Try 7B or larger.
2. **Simplify the task** — Break complex multi-step tasks into simpler subtasks. Fine-tune for one subtask first.
3. **Enrich the system prompt** — Add more explicit instructions, examples, and domain context directly in the system prompt. This gives the model more to work with before training even starts.
4. **Lower grader expectations** — If the grader expects expert-level responses, the base model can never score above 0. Start with a lenient grader that rewards "directionally correct" responses, train, then tighten the grader for a second round.
5. **Consider the task scope** — Some tasks are genuinely too hard for smaller models. If the task requires broad world knowledge, complex reasoning chains, or precise domain expertise, a small model may not have the capacity regardless of training.

### Symptom 8: Training rewards increase but model quality doesn't improve (reward hacking)

**Root cause: The model learned to game the grader, not to be genuinely better.**

This is called reward hacking. The model finds shortcuts that score well without producing useful responses. For example: padding responses with filler to hit a length threshold, stuffing keywords the grader looks for, or producing technically valid but useless structured output.

**How to verify:**
1. After training, test the model with novel prompts (NOT from the training set)
2. Compare responses to the base model
3. If responses feel formulaic, repetitive, or "gaming" a pattern — reward hacking occurred
4. If training reward metrics diverge significantly from what you'd expect, the grader may need re-engineering

**Fix:**
1. **Audit the grader for exploitable patterns** — Look for simple checks the model could game:
   - Length thresholds → model pads with filler
   - Keyword presence → model stuffs keywords
   - Structure checks → model adds headers/bullets to everything
2. **Replace pattern checks with outcome checks** — Use LLM-as-judge for subjective quality, or check if the actual problem was solved rather than if the response looks right
3. **Add negative criteria** — Explicitly penalize filler text, off-topic content, repetition, and hallucination
4. **Start with a small training run** — Run 1 epoch on a subset of data, inspect the model's behavior, then scale up only if it looks right
5. **Domain expert spot-check** — Have the user review 10-15 model responses after a test run before committing to full training

### Symptom 9: Scores have no variability (all clustered at the same value)

**Root cause: Insufficient reward signal variability.**

If all scores cluster around the same value (e.g., everything scores 0.5-0.6), the training gradients effectively vanish. The model can't distinguish better from worse responses because they all score the same.

**How to verify:** Compute the standard deviation of scores. If std < 0.1, the grader isn't differentiating.

**Fix:**
1. **Make the grader more granular** — Add more criteria with different weights so scores spread across the range
2. **Use partial credit** — Replace binary checks with graduated scoring (see `reference/grader-writing.md` "Smooth Scoring" section)
3. **Add both positive and negative criteria** — The gap between "has good qualities" and "also avoids bad qualities" creates natural score spread
4. **Redesign the rubric** — If using LLM-as-judge, break evaluation into 4-5 specific subcategories each worth different points

### Symptom 10: Task is ambiguous — model can't converge

**Root cause: Multiple valid answers exist, and the grader can't consistently score them.**

If domain experts would disagree on the "right" answer for your prompts, the training signal will be noisy. The model gets rewarded for contradictory behaviors across different records and can't converge on a consistent strategy.

**How to verify:** Take 5 prompts and write 2 different "good" answers for each. Would your grader score them similarly? If one good answer scores 0.8 and another equally good answer scores 0.3, the task is ambiguous.

**Fix:**
1. **Make the task more specific** — Instead of "write a good response", define exactly what good means: "respond with the correct refund policy, include the processing time, and ask if they need anything else"
2. **Narrow the grader to verifiable criteria** — Focus on things that have one right answer: factual accuracy, format compliance, presence of required information
3. **Remove subjective criteria** from the grader that could go either way — or make them worth less (e.g., "tone" worth 0.1 vs "accuracy" worth 0.5)
4. **Reframe open-ended tasks** — If the task is inherently creative/subjective, use LLM-as-judge with a very specific rubric rather than programmatic checks

---

## Part 9: The Escalation Ladder

When iterations stall, work through these strategies in order. Each level is more drastic than the last.

### Level 1: Quick fixes (try these first)

- Tighten the grader prompt (more specific criteria, numbered rubric)
- Set LLM judge temperature to 0.0
- Remove hard gates, add partial credit
- Rebalance data (fill under-represented topics)

### Level 2: Realignment

- Rewrite system prompt and grader together to target the same 3-5 behaviors
- Test grader against hand-written gold-standard responses before deploying
- Simplify — if objective has 10 criteria, focus on the 3 most important

### Level 3: Scope reduction

- Narrow the objective to one specific capability
- Reduce topic count (fewer, more focused topics)
- Use a larger base model if the task is too complex for the current one

### Level 4: Approach change

- Switch grader pattern (e.g., from pure programmatic → hybrid with LLM-as-judge, or vice versa)
- Make the grader topic-aware so it evaluates different topic types with different criteria
- Split into multiple fine-tuning runs — one per task type

### Level 5: Start over

If nothing else works after 5+ iterations across multiple strategies:

1. **Re-interview the user** — Maybe the original objective was unclear or contradictory
2. **Write 5 gold-standard prompt/response pairs by hand** — Not for training, but to clarify what "good" actually looks like
3. **Build the grader first** — Test it against your hand-written examples. Make sure it scores your gold-standard responses > 0.8
4. **Then generate prompts** — Now you know exactly what the grader expects
5. **Start with 20 prompts** — Get a small dataset working well before scaling up

This reverses the usual flow (data first, grader second) and often breaks through plateaus because it forces alignment between the objective, the grader, and the data from the start.

### Level 6: Reconsider the approach

If even starting over doesn't work:
- The task may be too ambitious for the base model size — try a larger model
- The task may be too ambiguous for automated grading — simplify to verifiable subtasks
- Fine-tuning may not be the right solution — consider prompt engineering, RAG (retrieval-augmented generation), or a multi-agent workflow instead

---

## Part 10: Post-Training Iteration (Training Metrics Diagnosis)

Parts 1-9 cover **pre-training iteration** (eval → fix data/grader → re-eval). This part covers what to do when **training itself fails or underperforms** — the model trained but metrics look bad.

> For detailed metric definitions and thresholds, see [`training-metrics-guide.md`](training-metrics-guide.md).

### Step 1: Run the Analysis Script

After training completes (or fails), analyze the metrics:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/analyze_training.py \
  --workflow-id "$WORKFLOW_ID" \
  --job-id "$JOB_ID"
```

This outputs alerts (CRITICAL/HIGH/WARNING) and a summary. Use the alerts to guide diagnosis.

### Step 2: Diagnose Using the Quick Decision Table

| What You See | Likely Cause | What to Change |
|---|---|---|
| OOM / CUDA OOM / container killed mid-step | VRAM exceeded (long completions × K, large model, or high `load_precision`) | **Call `GET .../jobs/{job_id}/infra-metrics`** (see [api-reference.md](api-reference.md)); confirm `GPU_MEMORY` near limits if series exist. Then reduce **one of**: `response_candidates_count` (K), `max_output_tokens`, `load_precision` → `4bit`/`8bit`, or `base_model` size. See [§Infrastructure metrics](#infrastructure-metrics-use-when-oom-or-gpu-pressure-is-suspected). |
| KL explodes from step 1 (>1000) | Learning rate too high for this model/task | Halve LR: `1e-6` → `5e-7` → `2.5e-7` |
| grad_norm NaN or Inf | Numerical overflow — often from zero-length completions or bad chat template | Check completions/min_length. If 0 → fix chat template or increase max_output_tokens |
| Loss stuck at exactly 0.0 | All advantages are zero (reward_std ≈ 0) | Grader is too lenient — all responses score the same. Make grader harder (see Part 5) |
| reward flat + frac_reward_zero_std > 0.5 | Base model already good at this task — limited GRPO headroom | **Check base model eval score.** If >0.75: GRPO efficiency drops dramatically — 96% compute wasted for easy prompts (arXiv:2508.14094). (1) Make grader stricter to create headroom. (2) Consider SFT instead — teaches format without needing score variance. (3) Don't train — base model may be good enough. (4) For smaller model: use distillation from a larger model, not direct GRPO. |
| reward never rose above baseline + base score >0.75 | **Insufficient GRPO headroom** — base model already good, most groups have zero within-group variance, advantages ≈ 0 | **Should have been caught at Step 7d headroom gate.** Fix: (1) switch to smaller base model (4B→0.8B) — creates natural headroom, (2) regenerate harder records or add harder sub-topics, (3) make grader stricter (only if criteria reflect genuine quality differences — see SKILL.md caveats), (4) don't train. **Do NOT increase K** — at p=0.35, K=8 already produces informative groups 96.6% of the time; K=16 adds 3.3pp at 2x compute (EBPO arXiv:2602.05165 shows K=16 can be worse than K=8). See SKILL.md Step 9b case A. |
| reward rose then declined + base score <0.75 | Entropy collapse, LLD (arXiv:2512.04220), or reward hacking | Reduce LR by 50%, optionally enable KL penalty (beta=0.001), inspect outputs for format gaming. See SKILL.md Step 9b case B. |
| reward declining from start + base score <0.75 | Model getting worse — possible instability or misaligned grader | Reduce LR, check grader for exploitable patterns, inspect outputs manually |
| completions/clipped_ratio > 0.5 | Most responses truncated at max_output_tokens | Increase max_output_tokens (512 → 1024). Watch cost: G × tokens |
| clip_ratio/region_mean = 0 + KL exploding | Trust region not constraining updates | Reduce LR. If using custom epsilon, check it's not too large |
| reward up but KL >10 + outputs degenerate | Reward hacking | Add quality-focused grader criteria, enable KL penalty (beta=0.04), manual output review |
| Per-record inspection shows FP > FN in degraded records (multi-label tasks) | **Over-prediction exploit** — GRPO learned that high recall + some FP outscores missing labels in group comparisons. The grader's precision-recall balance favors recall. | **Fix the grader**: use F0.5 instead of F1 for precision-critical tasks (1 FP costs as much as 2 FN). Add precision floor: `if precision < 0.75, cap score at 0.5`. Do NOT reduce K — the root cause is grader asymmetry. Ref: MO-GRPO (arXiv:2509.22047 Theorem 1), CoRPO (arXiv:2511.04439). |
| reward_std collapsing (>50% decline from start) + reward still rising | **Expected saturation** — model learning but running out of signal. Not a problem if reward is still rising. Epochs after std collapse have diminishing returns (~96% wasted compute per "Hard Examples" arXiv:2508.14094). | Monitor but do not intervene. Consider stopping 1-2 epochs earlier on next run. Cosine LR schedule contributes to std collapse in final epochs (near-zero LR → near-identical completions). Ref: AEnt (arXiv:2509.03493). |

### Step 3: The Hyperparameter Iteration Ladder

Work through these in order — each level is more drastic. **Change ONE parameter at a time** so you can attribute the result.

**GRPO-specific switches (before touching LR):**

- `loss_type` (default `dr_grpo`): Keep `dr_grpo` unless you have a paper-backed reason to switch; other modes change loss scale and can invalidate thresholds in `training-metrics-guide.md`.
- `mask_truncated_completions` (default `true`): Leave enabled; if you see NaN KL with all completions truncated, fix truncation first (increase `max_output_tokens`) instead of disabling masking.
- `beta` (default `0.0`): Modern GRPO practice is `beta=0` (no KL penalty). Only increase beta when you explicitly want KL regularization to fight reward hacking — see `training-metrics-guide.md` §KL for recommended ranges.

**Level 1: Learning Rate (most common fix)**

```
Default: 1e-6
If KL explodes or grad_norm spikes: halve → 5e-7 → 2.5e-7
If training is too slow (reward barely moves after full run): double → 2e-6
Never go above 5e-6 for small models (4B)
```

**Level 2: max_output_tokens**

```
Default: 512
If clipped_ratio > 0.3: increase → 1024
If clipped_ratio > 0.5: increase → 1536 or 2048
⚠️ Cost scales linearly: 1024 = 2× cost of 512 (G=8 × 1024 tokens per prompt)
⚠️ May cause OOM on cloud infra above 1024 — if OOM happens, use `GET .../jobs/{job_id}/infra-metrics` first (see §Infrastructure metrics above), then reduce K, `load_precision`, or tokens before retrying.
```

**Level 3: Epochs**

```
Default: 8
If reward is still improving at end of run: increase → 12 or 15
If reward peaks early then declines: decrease → 5
GRPO is safe with many epochs (fresh responses each time) — no memorization risk
```

**Level 4: Batch Size / Gradient Accumulation**

```
Default: batch_size=5, gradient_accumulation_steps=5 (effective=25)
If gradients are noisy (reward oscillates wildly): increase effective batch
  → batch_size=5, accumulation=8 (effective=40)
If training is too slow per step: decrease
  → batch_size=5, accumulation=3 (effective=15)
```

**Level 5: LoRA Rank**

```
Default: 8
If model can't learn the task (reward flat after LR tuning): increase → 16
If overfitting (train reward high, valid reward low): decrease → 4
Higher rank = more capacity but slower training
```

**Level 6: Grader Redesign (not a hyperparam — a strategy change)**

If hyperparameter tuning doesn't help, the problem is usually the grader signal, not the training config. Go back to Part 5 (Data vs Grader diagnosis).

### Step 4: Quick LR Calibration (Before Full Training)

Before committing to a full training run (which may take hours), run a **5-10 step calibration**:

```bash
# Create a short training run
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-training \
  --workflow-id "$WORKFLOW_ID" \
  --config '{"epochs": 1, "max_steps": 10}' \
  --inference-params '{"max_output_tokens": 512}'

# Poll for 5-10 steps, then check metrics
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py poll-training \
  --workflow-id "$WORKFLOW_ID" --job-id "$JOB_ID" --max-polls 5

# Analyze
python3 ${CLAUDE_SKILL_DIR}/scripts/analyze_training.py \
  --workflow-id "$WORKFLOW_ID" --job-id "$JOB_ID"
```

**What to look for after 5-10 steps:**

| Metric | Healthy | Problem → Action |
|---|---|---|
| KL | < 10 | > 100 → halve LR and re-run calibration |
| grad_norm | < 10 | > 1000 or NaN → halve LR, check data |
| loss | 0.001 - 1.0 | > 100 → halve LR. Exactly 0 → grader issue |
| reward_std | > 0.05 | < 0.02 → grader too lenient |
| clipped_ratio | < 0.3 | > 0.5 → increase max_output_tokens |

If calibration looks healthy, cancel the short run and start the full training:

```bash
# Cancel calibration run
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py cancel-training \
  --workflow-id "$WORKFLOW_ID" --job-id "$CALIBRATION_JOB_ID"

# Start full run with validated params
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py create-training \
  --workflow-id "$WORKFLOW_ID" \
  --config '{"epochs": 8}'
```

### Step 5: Comparing Training Runs

Use `finetune.py log-iteration --phase training` after each run. It auto-extracts metrics from the training side files and compares with the previous run:

```bash
# After run 1
uv run scripts/finetune.py log-iteration --project-dir finetune-project \
  --phase training --training-file training-jobs/train-001.json \
  --changes "Default params: lr=1e-6, epochs=8" --change-type baseline --verdict FAIL

# After run 2
uv run scripts/finetune.py log-iteration --project-dir finetune-project \
  --phase training --training-file training-jobs/train-002.json \
  --changes "Halved LR to 5e-7" --change-type hyperparams --verdict PASS
```

Output:
```
=== Iteration 4 (training) vs 3 ===
Changes: [hyperparams] Halved LR to 5e-7

  final_reward        : 0.0000 → 0.7500 (↑ 0.7500) ✓
  final_kl            : 603000000 → 4.8000 (↓ ...) ✓
  reward_delta        : 0.0000 → 0.1500 (↑ 0.1500) ✓

  Verdict: PASS
```

All iterations (eval + training) live in `iterations.json` — the agent reads this before making changes to understand the full history.

### Step 6: When to Stop Training Iteration

| Condition | Action |
|---|---|
| Reward trending up, KL stable, no alerts | ✅ Training is working — let it finish |
| Reward plateaued for >3 epochs | Stop and deploy — more epochs won't help |
| 3+ training runs with different LR all fail | Problem is grader signal, not hyperparams → go back to Part 5 |
| Reward up but model outputs are bad (manual check) | Reward hacking → redesign grader (Part 8, Symptom 8) |
| All runs produce NaN within 5 steps | Data issue (empty completions, bad template) → check data pipeline |
