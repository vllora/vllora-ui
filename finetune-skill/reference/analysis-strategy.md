# Analysis Strategy: Post-Evaluation & Post-Training Improvement

How the agent should analyze evaluation and training results, diagnose issues, and suggest concrete improvements to the user — interactively, so the user drives the final decision.

This document complements `iteration-strategy.md` (which covers the diagnosis framework) by defining **what the agent should compute, present, and offer** at each stage.

> **Metric thresholds**: For all GRPO metric healthy ranges, red flags, and paper-backed threshold values, see [`training-metrics-guide.md`](training-metrics-guide.md). This document references those thresholds but does not redefine them — `training-metrics-guide.md` is the single source of truth for what metric values mean.

---

## Part 1: Available Data & How to Collect It

### 1a. Evaluation Results

**Source:** `GET /finetune/evaluations/{evaluation_run_id}`

| Field | Path | What it tells you |
|-------|------|-------------------|
| Overall score | `summary.average_score` | Quality floor — target > 0.6 |
| Pass/fail counts | `summary.passed_count`, `summary.failed_count` | What fraction meets minimum bar |
| Completion rate | `completed_rows / total_rows` | Whether eval itself ran cleanly |
| Error rate | `failed_rows / total_rows` | Grader crashes, timeouts — bugs, not quality |
| Per-record score | `results[].epochs["0"][0].score` | Individual record quality (0-1) |
| Per-record reason | `results[].epochs["0"][0].reason` | Grader's explanation — **most diagnostic field** |
| Per-record status | `results[].epochs["0"][0].status` | `completed` or `failed` |
| Record ID | `results[].row.id` | Maps back to JSONL record |
| Record topic | `results[].row.topic` | Maps to topic hierarchy (if present in JSONL) |
| Record messages | `results[].row.messages` | The original prompt — needed for diagnosis |
| Record source_parts | `results[].row.source_parts` | Which knowledge chunks grounded this record |

**Derived metrics the agent should compute:**

| Metric | Formula | Target |
|--------|---------|--------|
| Pass rate | `passed_count / total_rows` | > 70% |
| Score std deviation | Compute from individual scores | 0.15-0.30 (grader differentiates) |
| Score distribution | Bucket: 0, 0-0.4, 0.4-0.7, 0.7-1.0, 1.0 | No single bucket > 50% |
| Per-topic avg score | Group scores by `row.topic` | Identify weak/strong topics |
| Per-topic record count | Count records by `row.topic` | Identify coverage gaps |
| Reason frequency | Extract common phrases from low-scoring `reason` fields | Spot systematic issues |

### 1b. Training Metrics (Real-Time)

**Source:** `GET /finetune/workflows/{id}/jobs/{job_id}/metrics`

Each metric point in `metrics[]` contains:

| Field | Path | What it tells you |
|-------|------|-------------------|
| Step progress | `metrics.global_step`, `metrics.max_steps` | How far through training |
| Epoch | `metrics.epoch` | Current epoch (fractional) |
| Learning rate | `metrics.learning_rate` | Current LR (may decay) |
| Reward | `metrics.reward` | Average grader score the model is achieving |
| Reward std | `metrics.reward_std` | Diversity of scores across batch — should be > 0.05 |
| Loss | `metrics.loss` | GRPO policy loss — **absolute scale varies by backend** (TRL DAPO: 0.0-0.05; other backends: can be 1e6+). Use trend analysis, not absolute thresholds. NaN = catastrophic. See `training-metrics-guide.md` §Loss |
| Gradient norm | `metrics.grad_norm` | Training stability — **scale varies by backend**. Use spike detection (>10x recent average), not absolute thresholds. NaN = catastrophic |
| KL divergence | `metrics.kl` | Drift from base model — **informational with β=0** (TRL/DAPO default). Use trend: grew >10x from early training = diverging. NaN = catastrophic. See `training-metrics-guide.md` §KL |
| Clipping ratio | `metrics.completions/clipped_ratio` | Output truncation — healthy <0.1, critical >0.5. See `training-metrics-guide.md` §Completions |
| Mean completion length | `metrics.completions/mean_length` | Whether responses are reasonable length |
| Zero-std fraction | `metrics.frac_reward_zero_std` | Records where all candidates scored same — wasted training |

**Derived metrics the agent should compute:**

| Metric | Formula | What it signals |
|--------|---------|-----------------|
| Reward trend | Slope of `reward` over last N steps | Positive = learning, flat = stuck, negative = degrading |
| KL trend | Slope of `kl` over last N steps | Rising = policy diverging, may need lower LR |
| Loss trend | Slope of `loss` over last N steps | GRPO loss rises slightly as policy diverges — stuck at 0 = zero advantages (no learning) |
| Reward plateau detection | Reward change < 0.01 over 20% of max_steps | Model has converged or stalled |
| Clipping trend | `clipped_ratio` increasing? | Model generating longer outputs than `max_output_tokens` allows |

### 1c. Per-Epoch Training Evaluations

**Source:** `GET /finetune/workflows/{id}/finetune-evaluations?finetune_job_id={job_id}`

Same structure as eval results but with multiple epochs:

| Field | Path | What it tells you |
|-------|------|-------------------|
| Score progression | `results[].epochs["0"][0].score` → `epochs["1"][0].score` → ... | Whether each record improved |
| Reason progression | `results[].epochs["0"][0].reason` → ... | What changed in grader's assessment |
| Per-record trajectory | Compare epoch 0 to final epoch | Categorize: improved, stagnant, degraded |

**Derived metrics:**

| Metric | Formula | What it signals |
|--------|---------|-----------------|
| Improved records | Final epoch score > epoch 0 score + 0.1 | Training is working for these |
| Stagnant records | Score difference < 0.1 across all epochs | Model cannot figure out how to score better |
| Degraded records | Final epoch score < epoch 0 score - 0.1 | Something is wrong — conflicting signals |
| Per-topic improvement | Group epoch-0-to-final deltas by topic | Which topics benefited most from training |
| Learning velocity | Average per-epoch score delta | How fast the model is improving |

### 1d. Training Job Status

**Source:** `GET /finetune/workflows/{id}/jobs/{job_id}/status`

| Field | Path | What it tells you |
|-------|------|-------------------|
| Status | `status` | `pending`, `running`, `succeeded`, `failed`, `cancelled` |
| Model name | `fine_tuned_model` | Output model identifier (after success) |
| Config | `training_config` | LR, LoRA rank, epochs, batch size used |
| Error | `error_message` | What went wrong (if failed) |
| Timing | `created_at`, `completed_at` | Duration — sanity check |

---

## Part 2: Analysis Framework

### 2a. Post-Evaluation Analysis (eval results only)

Run this analysis after every evaluation completes. Present findings grouped by severity.

**Step 1: Compute summary statistics**

```
avg_score = summary.average_score
pass_rate = summary.passed_count / total_rows
fail_rate = failed_rows / total_rows  (grader errors, not low scores)
score_std = std_dev(all individual scores)
```

**Step 2: Bucket records by score**

| Bucket | Criteria | Count | Interpretation |
|--------|----------|-------|----------------|
| Failed (errors) | `status === "failed"` | N | Grader bugs — fix before anything else |
| Zero (score = 0) | `score === 0` | N | **Low signal for standard GRPO** — zero-score completions produce zero-variance groups. DAPO skips these via dynamic sampling. "No Prompt Left Behind" (arXiv:2509.21880) shows signal can be extracted via entropy-guided shaping. Diagnose cause; optionally remove + regenerate replacements (see SKILL.md Step 8b+). |
| Low (0 < score < 0.4) | ... | N | Primary improvement targets |
| Medium (0.4-0.7) | ... | N | Acceptable, could improve |
| High (0.7-1.0) | ... | N | Working well |
| Perfect (score = 1.0) | ... | N | May indicate lenient grader |

**Step 3: Topic-level breakdown**

Group scores by `row.topic`:
```
topic_name: avg_score, record_count, pass_rate, lowest_score
```

Identify:
- **Weak topics**: avg < 0.4 — primary improvement targets
- **Strong topics**: avg > 0.7 — leave alone
- **Under-represented topics**: < 5% of total records — needs more data
- **Over-represented topics**: > 30% of total records — may dominate training

**Step 4: Reason pattern analysis (BOTH low-scoring AND high-scoring)**

**Bottom 20%** (by score) — extract and group `reason` fields:
- Count recurring phrases or themes
- Identify the top 3-5 grader complaints
- Check for contradictory reasons (indicates grader instability)

**Top 10-15%** (by score) — verify high scores are earned, not gamed:
- Read grader reasons: does the reason show the model genuinely answered well, or satisfied the grader via a shortcut (listing all options, padding with keywords, matching format without correct content)?
- If many high-scoring reasons are shallow (e.g., "matches", "correct format") without checking substance → grader has exploitable weaknesses that GRPO WILL amplify during training
- This step catches reward hacking before training starts — the cheapest possible detection point (Ref: OpenAI RFT Cookbook documented reward hacking found only by reading high-scoring outputs, not from metrics; MO-GRPO arXiv:2509.22047)

**Step 5: Source part coverage analysis**

If records have `source_parts`, check:
- Which knowledge parts produce high-scoring vs low-scoring records
- Whether any knowledge source is systematically underperforming
- Whether records with more source_parts score differently than those with fewer

### 2b. Post-Training Analysis (training results only)

Run this after a training job completes (or is cancelled due to anomaly).

**Step 1: Training metrics trajectory**

From the metrics timeseries:
```
reward_start = first reward value
reward_end = last reward value
reward_delta = reward_end - reward_start
kl_final = last KL value
loss_delta = last loss - first loss
clipping_max = max clipped_ratio during training
```

**Step 2: Anomaly detection**

| Check | Condition | Severity | Source/Rationale |
|-------|-----------|----------|-----------------|
| NaN/Inf in any metric | Any NaN or Inf in loss, reward, KL, grad_norm | Critical | Unsloth docs: often from zero-length truncated completions |
| Clipping overload | `clipped_ratio` > 0.5 at any point | Critical | DAPO, TRL — majority of completions incomplete, training signal degraded. See `training-metrics-guide.md` §Completions |
| KL explosion | KL > 5.0 or KL increased > 3x from start | Warning only when beta > 0. **With beta=0 (modern GRPO default per DAPO/TRL): KL is unpenalized and not even tracked in most frameworks.** Only monitor KL trend relative to reward when beta=0. KL > 10.0 with beta > 0 = critical. | Original GRPO (DeepSeekMath, arXiv:2402.03300) used β=0.04; DeepSeek-R1 (arXiv:2501.12948) used β=0.001; DAPO/Dr. GRPO/TRL default to β=0. See `training-metrics-guide.md` §KL |
| Reward collapse | `reward_std` < 0.05 for > 50% of steps | Warning. `reward_std` < 0.01 = Critical (zero learning signal). | Empirical heuristic for [0,1] grader scale; TRL docs: "little diversity for that prompt". See `training-metrics-guide.md` §Reward Std |
| Weak signal | `frac_reward_zero_std` > 0.5 **+ reward flat** for > 50% of steps | **Warning** (>0.8 + flat reward = **Critical**) — most records produce identical rewards and model isn't improving. **Note**: 30-99% zero-std is normal in GRPO when reward is still rising ("No Prompt Left Behind", arXiv:2509.21880). **First check**: is `response_candidates_count` ≥ 8? With G=2, this metric will be inherently high. **Then**: remove dead-weight records (score=0) and regenerate replacements. See SKILL.md Step 8b+. | arXiv:2509.21880 (30-99% normal); TRL: "fraction of samples with reward std of zero". See `training-metrics-guide.md` §frac_reward_zero_std |
| Entropy collapse | `entropy` dropping rapidly (>50% decline from start) | **Warning** — model losing exploration ability, becoming deterministic. Precursor to reward hacking. | DAPO (2503.14476, Section 4.3): *"Entropy... key metrics that we closely monitor."* TRL docs: *"A collapse in entropy means the policy is becoming overconfident."* |
| Response length growing | `completions/mean_length` increasing >30% while `reward` flat or declining | **Warning** — possible length exploitation. Since `dr_grpo` is active, this is likely reward-correlated (grader rewards verbosity), not algorithmic. | Dr. GRPO (2503.20783) algorithmic cause already mitigated. Check grader for length bias; see DRPO (2510.04474) for safe penalty patterns. Threshold: 30% per `training-metrics-guide.md` SSOT. |
| Length-reward correlation | Correlation between response length and score > 0.7 | **Warning** — grader has exploitable length bias. Model will learn to pad responses. | MO-GRPO (2509.22047), GR3 (2603.10535): *"vacuous elongation can inflate the gradient norm"* |
| Gradient instability | `grad_norm` spikes > 5x median | Warning | — |
| No learning | `reward_delta` < 0.05 after full training | Info | — |

**Step 2b: Trigger-based output sampling** (read individual records when metrics flag anomalies)

Aggregate metrics are systematically blind to reward hacking — the model can satisfy the grader while violating the task intent, and all metrics look healthy (Ref: OpenAI RFT Cookbook; MO-GRPO arXiv:2509.22047; "Tricks or Traps" arXiv:2508.08221). When the following triggers fire, sample and read individual model completions + grader reasons before continuing:

| Trigger | What to read | What you're looking for |
|---------|-------------|----------------------|
| KL rising while reward stagnates or rises | 5 high-reward completions | Grader exploitation — model found shortcut that scores well but violates task intent |
| `mean_length` growing >30% while reward flat/declining | 5 longest completions | Verbosity padding, aimless continuation after correct answer (arXiv:2508.08221 Appendix B.2) |
| `clipped_ratio` > 0.3 rising trend | 3 clipped completions | Distinguish "model needs more tokens" (fixable) from "model can't stop" (degenerate) |
| Per-topic `reward_std` near zero + that topic's reward flat | 3 completions for that topic | Mode collapse on that topic — all outputs identical |
| `entropy` dropped >50% from start | 5 completions across topics | Model becoming deterministic — precursor to reward hacking (DAPO arXiv:2503.14476 §4.3) |

**Cost**: reading 5-20 records adds ~10 minutes. This is negligible compared to re-training costs if reward hacking corrupts the model.

**Step 3: Per-epoch record trajectories** (from finetune-evaluations)

Categorize every record:
```
improved:  final_score - epoch0_score > 0.1
stagnant:  |final_score - epoch0_score| <= 0.1
degraded:  epoch0_score - final_score > 0.1
```

Report:
- Count and percentage in each category
- Which topics have the most stagnant/degraded records
- Whether degraded records share common characteristics (same topic, similar prompts, etc.)

**Degradation early warning**: At each epoch eval during training (not just post-training), identify records that dropped >0.2 from previous epoch. If >15% of records are degrading by epoch 2, this is strong evidence of conflicting reward signals or grader exploitation — consider pausing training and inspecting outputs before continuing. (Ref: "Tricks or Traps" arXiv:2508.08221 on ostensible positives showing in per-record behavior before aggregate metrics detect it.)

### 2c. Cross-Analysis (both eval + training results)

When both are available, the most powerful insights come from comparing them.

**Pre/post comparison:**

| Metric | Pre-training (eval) | Post-training (final epoch) | Delta |
|--------|--------------------|-----------------------------|-------|
| Average score | X | Y | Y-X |
| Pass rate | X% | Y% | Y-X% |
| Per-topic: topic_A | X | Y | ... |
| Per-topic: topic_B | X | Y | ... |

**What the comparison reveals:**

| Pattern | Meaning | Action |
|---------|---------|--------|
| Overall score improved, all topics improved | Training worked as expected | Deploy or run more epochs |
| Overall improved but some topics degraded | Conflicting training signals between topics | Check if degraded topics have contradictory grader criteria |
| Overall flat despite training | Grader not providing useful signal, or base model at capacity | Try grader changes or larger base model |
| Pre-training scores high, post-training degraded | Catastrophic forgetting or reward hacking | Lower learning rate, reduce epochs, check grader for exploitable patterns |

**Eval-to-training learning efficiency:**

For records that scored low on eval (< 0.4), how many improved during training?
- High improvement rate (> 70% of low records improved) = good training signal
- Low improvement rate (< 30%) = training may not be helping these records — but **first check if training ran enough epochs** (records may still be converging). If enough epochs ran, the root cause is likely elsewhere: prompts too vague, grader misaligned, or base model incapable.
- Note: these thresholds (70%, 30%) are arbitrary heuristics with no paper backing. Use as rough guidelines, not hard cutoffs.

### 2d. Training Metrics → Diagnosis (Grader, Data, or Hyperparams)

When training metrics indicate the problem isn't just hyperparams, use this table to determine whether the fix is in the **grader**, the **data** (topics/records), or both. **Check this before defaulting to hyperparams-only changes.**

> **Disclaimer**: These are heuristics inferred from GRPO mechanics, not paper-backed rules. Only MO-GRPO (arXiv:2509.22047) and "No Prompt Left Behind" (arXiv:2509.21880) directly inform specific rows. Always investigate the specific cause before acting.

| Training metric signal | Possible causes (check in order) | Fix |
|----------------------|--------------------------------|-----|
| Per-topic: some topics **stagnant** while others improve | **1) Topic already saturated** — base model scores >0.8 on that topic (check per-topic scores from Step 7d pre-training eval). No headroom for GRPO. **2) Records too vague or GTs incorrect** — zero-variance from all-wrong or all-right completions. | 1) Make grader stricter for that topic, or accept base model performance. 2) `filter-records` + `generate_records.py --append` to regenerate. Check per-topic base eval score first to distinguish these causes. |
| Per-topic: some topics **degraded** | **1) Grader criteria inconsistency** — grader rewards behavior in topic A that it penalizes in topic B. Most likely cause. MO-GRPO (arXiv:2509.22047) shows high reward-variance objectives dominate gradient in GRPO. **2) System prompt conflict** — less likely, only matters if prompts directly contradict what grader rewards. | 1) Review grader rubric — ensure criteria are compatible across all topics. Check reward_std per-topic: high-variance topics dominate gradient. 2) Review system prompts only if grader criteria check out. |
| `frac_reward_zero_std` high + reward flat | **1) Easy-saturation** — per-topic base scores >0.8, all completions score similarly. **2) Hard-impossible** — per-topic base scores ~0, base model can't bootstrap. **3) Insufficient epochs** — training hasn't converged yet. Note: arXiv:2509.21880 recommends extracting signal from zero-variance prompts (RL-ZVP), NOT removing them. | 1) Make grader stricter to create headroom. Do NOT just remove easy records. 2) Larger base model, or simplify prompts. 3) Run more epochs before concluding data is the problem. |
| `reward_std` near zero + grader verified OK | **1) Model saturation** — if mean reward ~1.0, the model has learned the task. This is success, not a problem. **2) Task ceiling** — legitimately narrow task. **3) Prompts lack diversity** — all test the same pattern. | 1) Deploy — training is done. 2) Accept the result. 3) Add diverse prompts: vary question types, input formats, edge cases. |
| Reward hacking (reward up, std collapsing) | **Primary: Grader has exploitable weakness** — model found a pattern (format, length, keywords) that scores high without genuine quality. This is fundamentally a grader problem (Ref: Weng 2024 reward hacking survey; our `training-metrics-guide.md` §Reward Hacking). | **Primary**: Inspect model outputs to identify exploit. Tighten grader to penalize it. Enable/increase beta to slow divergence. **Secondary** (after grader fixed): add targeted adversarial records that expose the now-closed exploit. |
| Low per-record improvement (<30% of low-scoring records improved) | **1) Insufficient epochs** — training may not have converged yet. **2) Prompts too vague** — model can't learn what "good" looks like. **3) Base model incapable** — lacks domain knowledge. Note: 30% is an arbitrary heuristic with no paper backing. | 1) Run more epochs first. 2) Review low-scoring records: regenerate with stricter `--ground-truth-format`. 3) Try larger base model. Rule out (1) before concluding (2) or (3). |

**Key principle:** Training metrics tell you **what** is failing; per-topic analysis tells you **where**. But the root cause may be grader, data, or model capability — always check grader consistency first (it's the cheapest fix), then data quality, then model choice.

---

## Part 3: Decision Trees

### 3a. After Evaluation Completes

```
                         Eval Complete
                              │
                    ┌─────────┴─────────┐
                    │                   │
              fail_rate > 5%?     fail_rate <= 5%
                    │                   │
           Fix grader bugs        Check avg_score
            (syntax, crashes)          │
                              ┌───────┼───────┐
                              │       │       │
                          avg < 0.5  0.5-0.6  avg > 0.6
                              │       │       │
                          FAIL     WARN       │
                              │       │    Check pass_rate
                              │       │       │
                         Diagnose  Optional  ┌──┴──┐
                         (see 3b) improve   <70%  >70%
                                            │      │
                                         WARN    Run readiness-check
                                            │      │
                                         Optional  ┌────┴────┐
                                         improve  FAIL     PASS
                                                    │         │
                                               Fix failing  READY
                                               criteria      │
                                                    │      Proceed to
                                               Re-eval    training
```

### 3b. Diagnosing Low Eval Scores

```
                    avg_score < 0.5
                         │
              ┌──────────┴──────────┐
              │                     │
        All scores ~0          Scores spread out
        or all ~1              but average low
              │                     │
        GRADER PROBLEM         Check per-topic scores
              │                     │
     ┌────────┴────────┐    ┌──────┼──────┐
     │                 │    │             │
  All ~0            All ~1  Some topics  All topics
     │                 │    low, others   uniformly
  Hard gate        Too      high          low
  or broken        lenient     │            │
  criteria            │     DATA PROBLEM  GRADER or
     │           Tighten  for weak      SYSTEM PROMPT
  Remove gates   grader   topics        misalignment
  Add partial       │        │            │
  credit        Add more  Regenerate   Rewrite both
                criteria  weak topic   to target same
                          prompts      3-5 behaviors
```

### 3c. After Training Completes

```
                    Training Complete
                          │
                 ┌────────┴────────┐
                 │                 │
            succeeded           failed
                 │                 │
         Fetch per-epoch     Read error_message
         evaluations              │
                 │          ┌─────┴─────┐
         Check reward       │           │
         trajectory     Infra error  Config error
                 │          │           │
        ┌────────┼────────┐ Retry     Fix config
        │        │        │ same       & retry
    Improved  Flat    Degraded
        │        │        │
    Check for  Check for  Possible
    reward     weak       overfitting
    hacking    signal     or reward
        │        │        hacking
    Test with  Fix grader │
    novel      or add     Lower LR,
    prompts    more data  reduce epochs
```

### 3d. Training Anomaly Response

```
               Anomaly Detected
                     │
            ┌────────┼────────────┬──────────┐
            │        │            │          │
        NaN/Inf   High KL    Clipping   Weak signal
            │        │        > 0.7         │
        Lower LR  Lower LR   Increase   Fix grader
        by 2x     by 2x      max_output  scoring
                              _tokens     spread
                              by 2x
```

---

## Part 3e: Pre-Training Readiness Gate

After each eval completes, run the readiness gate before starting training. This prevents wasting GPU hours on bad data or a broken grader.

**Run programmatically:**
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py readiness-check --file evaluations/eval-NNN.json
```

**Hard checks** — grader quality gates (must ALL pass):

These ask "is the grader working?", NOT "is the base model good?" GRPO can learn from low base model scores — DeepSeek R1-Zero started at 15.6% and reached 71% via GRPO alone (arXiv:2501.12948). OpenAI RFT Guide confirms only 0% success rate is truly fatal.

| Check | Threshold | Why it matters | Fix if failing | Source |
|-------|-----------|---------------|----------------|--------|
| Sample count | >= 50 prompts | GRPO advantage estimates are noisy below 50 | Add more training data | OpenAI RFT: "several dozen to a few hundred" |
| Score std | > 0.10 | Grader must differentiate — zero-std groups produce zero gradient (GRPO advantage = (r - mean)/std; std=0 → advantage=0) | Add criteria or partial credit bands (0.2, 0.4, 0.6, 0.8) | Zero-variance → zero gradient is fundamental to GRPO (DAPO §2.2). Threshold is a heuristic. |
| Average score | > 0.05 | Just needs nonzero signal — only 0% success is fatal | If truly zero, base model may be incapable — try larger model | OpenAI RFT: "0% success rate means RFT cannot bootstrap" |

**Soft checks** — quality signals (warnings, don't gate training):

Low base model scores are **expected and even desirable**. "Hard Examples Are All You Need" (arXiv:2508.14094) shows training on the hardest 10% of examples yields 30-40% performance gains vs 3-15% for easy examples on GSM8K. Note: binary rewards work — DeepSeek-R1 (arXiv:2501.12948) and DAPO (arXiv:2503.14476) achieved state-of-the-art with 100% binary (0/1) rewards.

| Check | Threshold | Why it matters | Fix if failing | Source |
|-------|-----------|---------------|----------------|--------|
| Score concentration | < 50% at single value | If >50% of scores cluster at one value, within-group variance is small → weak gradients | Add more granular scoring criteria | DAPO (arXiv:2503.14476): filters all-correct/all-incorrect groups. Threshold is a heuristic. |
| High-score fraction (> 0.9) | < 50% | Lenient grader → small within-group variance → weak gradients | Tighten grader criteria | Heuristic. OpenAI recommends "smooth scores, not pass/fail stamps." |
| Binary fraction (0 or 1) | < 60% | Continuous scoring is more sample-efficient — binary rewards produce signal only when a group has mixed outcomes, wasting compute on uniform groups. But binary works: DeepSeek-R1 used 100% binary. | Add intermediate scoring tiers if desired | DeepSeek-R1 (arXiv:2501.12948) uses binary; DAPO (arXiv:2503.14476) uses binary with dynamic sampling. |
| Dead-weight fraction (< 0.1) | < 50% | Dead-weight prompts reduce sample efficiency. Real GRPO training has 30-99% zero-variance prompts per batch. "No Prompt Left Behind" (arXiv:2509.21880) argues signal CAN be extracted from these via entropy-guided shaping. | DAPO handles via dynamic sampling (skips uniform groups). Optionally remove worst offenders, but the cited paper argues against blanket filtering. | "No Prompt Left Behind" (ICLR 2026, arXiv:2509.21880) |
| Pass rate (>= 0.7) | > 20% | Nice to have, but hard prompts are most valuable. Eval uses K=1; training uses K=8, so pass@8 >> pass@1 | Not a problem — hard examples produce the largest gains | "Hard Examples Are All You Need" (arXiv:2508.14094) |
| Prompt learnability | > 30% of prompts have score variance | Zero-variance prompts give zero GRPO gradient — wasted compute | DAPO dynamic sampling skips these; or rewrite prompts for more variance | DAPO dynamic sampling (arXiv:2503.14476) |
| Score-length correlation | \|r\| < 0.3 | High correlation means grader rewards/punishes length, not quality — reward hacking risk. Dr. GRPO identifies length bias from per-token loss normalization. | Rewrite grader to judge content, not length | Dr. GRPO (arXiv:2503.20783) identifies the problem; threshold is a heuristic. |
| Topic balance | No single topic > 40% | Imbalanced topics cause over-optimization for common topics | Add data for under-represented topics | Heuristic — balanced training data is standard ML practice |

**Why eval scores don't predict training performance:** Eval generates 1 completion per prompt (K=1). GRPO training generates K=8. A base model with 6.5% pass@1 has ~41% chance of at least 1 good completion per prompt (1-0.935^8). The eval distribution is a **lower bound** on training signal.

**Verdicts:**
| Exit code | Verdict | Meaning | Action |
|-----------|---------|---------|--------|
| 0 | PASS | All hard checks pass, no soft warnings | Proceed to training (Step 7d) |
| 2 | WARN | Only soft checks failed, or 1 hard check marginally fails | Can train, but fixing the issue first is recommended |
| 1 | FAIL | Any hard check fails | Must fix before training — return to Step 7b |

**Max iterations:** 5 eval-only iterations before training. If readiness gate never passes after 5 iterations, escalate to user with a summary of all attempts.

The `readiness-check` command outputs structured JSON with per-criterion values, thresholds, pass/fail status, and fix suggestions. The output distinguishes `hard_failed` (must fix) from `soft_failed` (should fix). The agent reads this output and either applies fixes (Step 9a) or proceeds to training (Step 7d).

---

## Part 4: Concrete Action Templates

These are ready-to-use prompts the agent should offer. Each template describes what the agent will do and asks the user for permission before proceeding.

### 4a. Evaluation-Phase Actions

**Template: Regenerate records for a weak topic**
```
I found that topic "{topic_name}" has an average score of {avg:.2f} across {count} records.
The grader's main complaints are:
  1. "{reason_pattern_1}" ({n1} records)
  2. "{reason_pattern_2}" ({n2} records)

I can regenerate {count} new prompts for this topic that address these issues:
- More specific scenarios that give the model clearer context
- Edge cases the current prompts don't cover
- Varied difficulty levels and user personas

This will replace the current "{topic_name}" records and re-upload to the gateway.

Want me to proceed? You can also tell me to adjust the approach (e.g., keep existing records and add more, or focus on a specific complaint).
```

**Template: Adjust grader criteria**
```
Looking at the eval results, the grader appears to be {too_strict|too_lenient|unstable}:
- {evidence_line_1}
- {evidence_line_2}
- {evidence_line_3}

I recommend these specific grader changes:
  1. {change_1} — because {rationale_1}
  2. {change_2} — because {rationale_2}

After updating, I'll run a dry-run on 3 sample records to verify the fix before re-evaluating.

Should I make these changes? Or would you prefer to review the grader source first?
```

**Template: Rebalance topic distribution**
```
Your dataset has uneven topic coverage:

Topic                    Records    % of total    Avg Score
────────────────────────────────────────────────────────────
{topic_1}               {n1:>5}      {pct1:>5.1f}%    {avg1:.2f}
{topic_2}               {n2:>5}      {pct2:>5.1f}%    {avg2:.2f}
...
Balance score: {balance:.2f} (target: > 0.8)

Under-represented topics (< 5%):
  - {under_topic_1}: only {n} records — should have ~{target}
  - {under_topic_2}: only {n} records — should have ~{target}

I can generate {needed} additional records for the under-represented topics to bring the balance score above 0.8.

Should I proceed? Alternatively, I can remove some records from over-represented topics instead, or you can tell me which topics matter most.
```

**Template: Fix grader instability (LLM judge)**
```
The grader appears unstable — I found contradictory scores for similar prompts:
  - Record "{id_1}" (score {s1}): "{reason_1}"
  - Record "{id_2}" (score {s2}): "{reason_2}"
  These prompts are similar but scored very differently.

This usually means the LLM judge prompt is too vague. I recommend:
  1. Setting temperature to 0.0 in completion_params
  2. Breaking the evaluation into {n} numbered criteria with explicit point values:
     {proposed_criteria}
  3. Using structured output to force consistent scoring

Want me to rewrite the grader with this approach? I'll dry-run it on 5 records to verify stability before deploying.
```

### 4b. Training-Phase Actions

**Template: Report successful training**
```
Training completed successfully.

Summary:
  - Base model: {base_model}
  - Final reward: {reward_final:.3f} (started at {reward_start:.3f}, +{delta:.3f})
  - KL divergence: {kl_final:.3f} (acceptable < 1.0)
  - Epochs completed: {epochs}
  - Duration: {duration}

Per-epoch progression:
  Epoch 0: avg {e0:.2f} | Epoch 1: avg {e1:.2f} | Epoch 2: avg {e2:.2f}

Record breakdown:
  - Improved: {improved_count} ({improved_pct:.0f}%)
  - Stagnant: {stagnant_count} ({stagnant_pct:.0f}%)
  - Degraded: {degraded_count} ({degraded_pct:.0f}%)

{if degraded_count > 0}
The {degraded_count} degraded records are mostly in topics: {degraded_topics}.
This may indicate conflicting training signals for those topics.
{endif}

Next steps I can help with:
  1. Deploy the model for testing
  2. Run a comparison eval (base model vs fine-tuned)
  3. Start a continuation run from this checkpoint for further improvement
  4. Investigate the {stagnant_count} stagnant records

What would you like to do?
```

**Template: Diagnose training anomaly**
```
Training anomaly detected at step {step}/{max_steps} (epoch {epoch:.1f}):

Anomaly: {anomaly_type}
  - {metric_name}: {metric_value} (threshold: {threshold})
  - Trend: {trend_description}

What this means: {explanation}

Recommended fix:
  {fix_description}
  Specifically: change {param} from {old_value} to {new_value}

I can:
  1. Cancel this job and start a new one with the fix applied
  2. Let it continue and see if it recovers (risky — {risk_explanation})
  3. Cancel and investigate further before retrying

What do you prefer?
```

**Template: Suggest hyperparameter adjustment**
```
Based on {source_description}, I recommend adjusting training config:

Current → Proposed:
  - learning_rate: {old_lr} → {new_lr} ({lr_rationale})
  - lora_rank: {old_rank} → {new_rank} ({rank_rationale})
  - epochs: {old_epochs} → {new_epochs} ({epochs_rationale})
  - max_output_tokens: {old_tokens} → {new_tokens} ({tokens_rationale})

Rationale: {overall_rationale}

This is training iteration {n}/3. After {remaining} more failed iterations, I'll suggest trying a larger base model.

Start a new training job with these settings?
```

**Template: Suggest continuation run**
```
Training run {job_id} {succeeded|stopped at checkpoint}.

Scores are improving but haven't plateaued yet:
  Epoch {last}: avg {last_avg:.2f} (up from {first_avg:.2f})
  Learning velocity: {velocity:.3f} per epoch

I recommend a continuation run to push scores higher:
  - Continue from: {continuation_type} (finetuned/{job_id} or checkpointed/{job_id})
  - Additional epochs: {more_epochs}
  - Same config (or adjusted: {adjustments})

This preserves the progress from the current run and extends training without starting over.

Want me to start the continuation?
```

### 4c. Cross-Analysis Actions

**Template: Pre-training vs post-training comparison**
```
Comparison: Evaluation (pre-training) vs Final Training Epoch

                        Pre-training    Post-training    Delta
Average score           {pre_avg:.2f}         {post_avg:.2f}          {delta_avg:+.2f}
Pass rate               {pre_pass:.0f}%           {post_pass:.0f}%            {delta_pass:+.0f}%

Per-topic changes:
  Topic               Pre     Post    Change
  ─────────────────────────────────────────
  {topic_1}          {t1_pre:.2f}    {t1_post:.2f}    {t1_delta:+.2f} {t1_emoji}
  {topic_2}          {t2_pre:.2f}    {t2_post:.2f}    {t2_delta:+.2f} {t2_emoji}
  ...

{if any topics degraded}
Topics that degraded: {degraded_list}
These may have conflicting grader criteria with the topics that improved.
I can investigate the specific records that degraded.
{endif}

{if overall improved}
Overall, training improved the model. Options:
  1. Deploy and test with real prompts
  2. Run another iteration targeting the {n} stagnant records
  3. Run a continuation for {n} more epochs
{else}
Training did not improve overall scores. This suggests:
  {diagnosis}
  Recommended: {recommendation}
{endif}
```

**Template: Identify records that resist improvement**
```
These {n} records scored low on both evaluation AND training (never improved above {threshold}):

  ID                  Topic              Eval Score    Best Training Score    Grader Complaint
  ─────────────────────────────────────────────────────────────────────────────────────────────
  {id_1}             {topic_1}          {eval_s1:.2f}           {train_s1:.2f}              {reason_1}
  {id_2}             {topic_2}          {eval_s2:.2f}           {train_s2:.2f}              {reason_2}
  ...

Common patterns in these resistant records:
  - {pattern_1}
  - {pattern_2}

This suggests: {diagnosis}

Options:
  1. Remove these records (they may be adding noise to training)
  2. Rewrite the prompts to be more specific
  3. Adjust the grader — the criteria may not fit these scenarios
  4. Split them into a separate topic with topic-specific grading

Which approach do you want to try?
```

---

## Part 5: Interactive Presentation Strategy

### 5a. Principles for Agent Communication

1. **Lead with numbers, then explain.** Always show the scores/counts first, then interpret.

2. **Use the readiness gate** (PASS/WARN/FAIL) for every evaluation. Users need a clear "should I proceed?" signal. Run `readiness-check` programmatically — see Part 3e.

3. **Rank suggestions by impact.** If there are 5 things to fix, start with the one that affects the most records.

4. **Offer concrete next steps as numbered choices.** "I can: 1. Do X, 2. Do Y, 3. Do Z. Which would you prefer?" — never leave the user without clear options.

5. **Respect user expertise.** The user may know things the agent does not — domain-specific quality criteria, business priorities, acceptable tradeoffs. Present findings and let the user decide.

6. **Show your work.** When suggesting a grader change, show the specific records that motivated the suggestion. When suggesting more data, show the distribution gap.

7. **Track what was tried.** Reference previous iterations: "In iteration 1, we tried X and scores went from A to B. This time I suggest Y instead."

### 5b. Presentation Format

**After evaluation, always present in this order:**

1. **Verdict**: PASS / WARN / FAIL from readiness gate (one line)
2. **Key numbers**: avg score, pass rate, score std, error rate (2-3 lines)
3. **Score distribution**: 5-bucket histogram (text-based)
4. **Topic breakdown**: table of per-topic scores (sorted by score ascending)
5. **Top grader complaints**: 3-5 most common reason phrases from low-scoring records
6. **Diagnosis**: data problem, grader problem, or both — with evidence
7. **Recommended actions**: numbered list, most impactful first
8. **User prompt**: "Which would you like to try?" or "Ready to proceed to training?"

**After training, present in this order:**

1. **Outcome**: succeeded / failed / anomaly (one line)
2. **Reward trajectory**: start, end, trend (one line)
3. **Anomaly alerts**: any threshold violations (if applicable)
4. **Per-epoch averages**: table
5. **Record trajectory summary**: improved/stagnant/degraded counts
6. **Per-topic training impact**: which topics improved most/least
7. **Comparison to eval**: if pre-training eval exists, show delta
8. **Next steps**: deploy, continue, iterate, or investigate

### 5c. What the Agent Should Decide vs What the User Should Decide

**Agent decides (no need to ask):**
- Which metrics to compute and present
- How to bucket and sort records
- What patterns to surface from reason fields
- Whether to flag anomalies and at what severity
- Iteration tracking (save results, update log)

**Agent suggests, user decides:**
- Whether to proceed to training (readiness gate PASS/WARN/FAIL is a suggestion)
- Which grader criteria to change (agent proposes, user approves)
- Whether to regenerate data for a topic (agent identifies, user confirms)
- When to stop iterating (agent tracks progress, user makes the call)
- Base model selection (agent suggests when to escalate, user approves)
- Whether to deploy (agent reports readiness, user gives the go-ahead)

**User decides, agent supports:**
- The objective and what "good" means for their domain
- Business tradeoffs (speed vs quality, narrow vs broad)
- When the model is "good enough" for their use case
- Which topics matter most (priority weighting)

---

## Part 6: RFT-Specific Techniques

### 6a. Understanding RFT Training Dynamics

In reinforcement fine-tuning (RFT/GRPO), the training loop differs from supervised fine-tuning:

1. **No teacher forcing**: The model generates its own responses during training. There are no "gold" answers to copy. The model explores the response space.
2. **Multiple candidates**: For each prompt, the model generates `response_candidates_count` responses. The grader scores each. Higher-scoring candidates are reinforced. **Use at least 8 candidates** — see 6g below.
3. **Relative reward**: What matters is the *difference* between candidate scores, not absolute scores. If all candidates score the same, the advantage is zero and the model learns nothing from that prompt.
4. **KL regularization**: A KL penalty prevents the model from drifting too far from the base model, preserving general capabilities. For pure programmatic graders (rule-based, not LLM-judge), KL can be safely reduced or disabled (beta=0) — DAPO removes KL entirely when using verifiable rewards (DAPO, arxiv 2503.14476), and Dr. GRPO uses KL coefficient 0.0 (arxiv 2503.20783, Table 6). Keep KL enabled when using LLM-as-judge graders, which are more vulnerable to reward hacking.

### 6b. RFT-Specific Diagnostics

| Signal | What it means in RFT context | Fix |
|--------|------------------------------|-----|
| `frac_reward_zero_std` > 0.6 | More than 60% of prompts produce candidates that all score the same — no learning signal. With G=2, this will be very common because only 2 samples are easily identical. | **First**: increase `response_candidates_count` to 8 (see 6g). **Then**: make grader more granular (partial credit), or make prompts harder so candidates differ in quality |
| `reward_std` < 0.05 | Model has converged to a single response pattern — all responses nearly identical | Increase temperature during training inference, or add more diverse prompts |
| `entropy` dropping rapidly | **Entropy collapse** — model is becoming deterministic and losing exploration ability. DAPO (arxiv 2503.14476, Section 4.3) identifies this as a key metric: *"Entropy of the Actor Model and Generation Probability are related to the model's exploration capability and are key metrics that we closely monitor."* TRL docs confirm: *"A collapse in entropy means the policy is becoming overconfident and deterministic, often too early. This can stall learning."* | Lower learning rate. Note: the cloud uses tight asymmetric clipping (epsilon=3e-4/4e-4) which is already conservative; if entropy still collapses, the issue is likely LR or data diversity, not clipping |
| `completions/mean_length` increasing without reward increase | **Response length bias** — model is generating progressively longer responses without improving quality. Note: the algorithmic root cause (Dr. GRPO's `1/|o_i|` normalization, arXiv:2503.20783) is already mitigated by the default `loss_type="dr_grpo"` + `repetition_penalty=1.1`. If length is STILL growing, the cause is **reward-correlated** — the grader rewards verbosity. | **First**: tighten `max_output_tokens` to GT P95 + 50% headroom. **Then**: add conciseness criterion to LLM-as-judge (10-15% weight). ⚠️ **DRPO anti-pattern (arXiv:2510.04474)**: do NOT add a uniform word-count penalty to all answers — it can invert correct-answer GRPO advantages. Apply word-count penalties only to wrong/partial answers. See `training-metrics-guide.md` §Length-Reward Divergence |
| `reward` increasing but `kl` increasing fast | Model is "cheating" — diverging from base model to find reward shortcuts | Lower learning rate, or fix grader to not reward shortcuts |
| `clipped_ratio` > 0.3 | Model generating responses longer than `max_output_tokens` — with `mask_truncated_completions=True` (active), truncated samples contribute zero gradient = wasted compute | Increase `max_output_tokens`. Note: the cloud already applies DAPO overlong masking, so truncated completions are automatically excluded |
| `reward` plateaued early | Either the task is solved or the model is stuck in a local optimum | If scores are high (> 0.8), the model may be done. If low, increase `lora_rank` or try a larger model |

### 6c. Reward Shaping Strategies

The grader IS the reward function. Shape it carefully:

**Smooth scoring (better than binary)**
- Instead of `score = condition ? 1 : 0`, use graduated scales
- Multiple criteria each contributing 0.1-0.3 to total score
- This creates richer gradients for GRPO optimization

**Score spread target: 0.15-0.30 std dev**
- Too narrow (< 0.1): model sees all responses as "about the same" — no learning
- Too wide (> 0.4): highly variable grading, noisy signal
- Check `frac_reward_zero_std` — if high, the grader needs more nuance

**Avoid hard gates at the beginning of the grader**
- A `if (!condition) return {score: 0}` at the top means most records score 0
- The model cannot learn from a sea of zeros — it needs partial credit to understand what's "less wrong"

**Negative criteria are as important as positive**
- Without penalties for bad patterns, the model may find shortcuts that score well
- Add checks for: hallucination, off-topic content, repetition, keyword stuffing

**Overlong reward shaping** (from DAPO, arxiv 2503.14476)
- Instead of hard truncation at `max_output_tokens`, apply a graduated penalty for responses approaching the limit
- Responses that hit the max length without an EOS token get score -1. Responses nearing the limit get proportionally penalized
- This *"reduces reward noise and stabilizes training"* — better than just increasing `max_output_tokens`

**Length-reward correlation check**
- After eval, compute correlation between response length and score. If longer responses systematically score higher, the grader has a length bias the model will exploit
- MO-GRPO (arxiv 2509.22047) found that GRPO's advantage function is *"more strongly correlated with reward components that exhibit higher variance"* — length being a common high-variance dimension
- GR3 (arxiv 2603.10535) warns that *"innocuous paraphrases or vacuous elongation can inflate the gradient norm"*

### 6d. Curriculum Learning (Progressive Difficulty)

If the base model struggles (avg score < 0.3 on eval):

1. **Start lenient**: Set grader thresholds low — reward "directionally correct" responses
2. **Train one round**: Model learns basic patterns
3. **Tighten grader**: Raise thresholds, add more criteria
4. **Continue from checkpoint**: `base_model: "finetuned/{job_id}"` preserves progress
5. **Repeat**: Each round the grader gets stricter and the model gets better

This is more effective than starting with a strict grader that scores everything 0.

### 6e. Catastrophic Forgetting Detection

Signs that the model is losing general capability:
- Scores on easy/basic topics decrease while hard topics improve
- `kl` > 2.0 and rising — model has drifted far from base
- Responses become formulaic — model has over-optimized for grader patterns
- `entropy` dropping rapidly — model losing exploration ability (see 6b)

Prevention:
- Keep `kl` in check (lower LR if it rises above 1.5)
- Use fewer epochs (2-3 max for small datasets)
- Verify on held-out prompts after training (see 6h)

### 6f. GRPO Default Hyperparameters

**Learning rate: 1e-6** — This is the universal consensus across all published GRPO work:

| Source | LR Used | Reference |
|--------|---------|-----------|
| DeepSeekMath (original GRPO) | 1e-6 | arxiv 2402.03300, Section 4.2: *"we set the learning rate of the policy model as 1e-6"* |
| DAPO | 1e-6 | arxiv 2503.14476: *"we utilize the AdamW optimizer with a constant learning rate of 1×10⁻⁶"* |
| Dr. GRPO | 1e-6 | arxiv 2503.20783, Table 6: *"Learning rate: 1×10⁻⁶, constant scheduler"* |
| "Tricks or Traps" | 1e-6 | arxiv 2508.08221: *"The learning rate is set to 1e-6"* |
| TRL GRPOTrainer | 1e-6 | `grpo_config.py`: `learning_rate = field(default=1e-6)` — explicitly overrides Transformers default of 5e-5 |

Do NOT use SFT learning rates (2e-5 to 5e-5) for GRPO — they are 20-50x too high and will cause KL explosions and training instability.

**Warmup**: No strong consensus — ranges from 0 to 50 steps across implementations:
- DAPO uses *"linear warm-up over 20 rollout steps"* (arxiv 2503.14476)
- "Tricks or Traps" uses `warmup_steps: 50` (arxiv 2508.08221, Section A.1)
- TRL defaults to 0 warmup

Recommendation: use 20-50 steps of linear warmup, then constant LR. This is not critical — all three approaches (0, 20, 50 warmup steps) produce good results in published work.

**Epochs**: Prefer 1 epoch of policy updates per generation round. Multiple epochs risk overoptimization on the same batch of generated responses. DeepSeekMath uses *"a single update following each exploration stage"* (arxiv 2402.03300). For dataset passes (how many times training iterates through all prompts), 2-3 is fine but monitor per-epoch score deltas — stop if degradation appears.

### 6g. Response Candidates Count (Group Size G)

**Use at least 8 candidates per prompt.** This is the single most impactful hyperparameter for GRPO training quality.

**Why**: GRPO computes advantages by comparing candidates within each group. With G=2, the advantage estimate is extremely noisy — you're computing mean and std from just 2 samples. Any prompt where both candidates happen to score similarly (very common) produces zero gradient. With G=8+, it's much more likely that at least some candidates differ in score, giving the model actual signal to learn from.

**No published GRPO work uses G < 8:**

| Source | Group Size G | Reference |
|--------|-------------|-----------|
| DeepSeekMath (original GRPO) | **64** | arxiv 2402.03300, Section 4.2: *"For each question, we sample 64 outputs"* |
| DAPO | **16** | arxiv 2503.14476, Section 4.1: *"the prompt batch size is 512 and we sample 16 responses for each prompt"* |
| Dr. GRPO | **8** | arxiv 2503.20783, Table 6: *"Number of responses per question: 8"* |
| "Tricks or Traps" | **8** | arxiv 2508.08221, Section 3.1: *"sampling 8 responses per prompt"* |
| TRL GRPOTrainer default | **8** | `grpo_config.py`: `num_generations = field(default=8)` |

**Tradeoff**: More candidates = better signal quality but higher compute cost per step. G=8 is the practical minimum; G=16 is better if compute allows; G=64 (DeepSeekMath) is ideal but expensive.

**Effective batch size**: The total number of generated responses per training step is `batch_size × G`. Larger effective batches produce more stable advantage estimates. "Tricks or Traps" (arxiv 2508.08221) found that *"Batch-level normalization exhibits high sensitivity to reward distribution skew, often leading to performance collapse under an imbalanced batch situation."* With small G, you need larger batch sizes to compensate.

**Impact on `frac_reward_zero_std`**: With G=2, expect this metric to be very high (many prompts where both candidates score identically). With G=8, it drops significantly because more candidates means more chance of score variance within each group.

### 6h. Post-Training Validation with Held-Out Prompts

**After every training run, test the model with prompts NOT in the training set.** This catches reward hacking and overfitting that in-distribution metrics miss.

OpenAI's RFT cookbook recommends creating non-overlapping splits: *"Randomly select 100 training samples... Remove training samples... Randomly select 100 test samples from the remaining samples (no overlap)"* and evaluating the final model on the test set.

**How to do it:**
1. Before training, set aside 10-20% of records as a held-out validation set (or generate new prompts for the same topics that weren't used in training)
2. After training completes, run the trained model on these held-out prompts
3. Compare scores to the base model on the same prompts
4. If the trained model is worse or no better on held-out prompts while in-distribution scores improved, reward hacking occurred (see iteration-strategy.md Symptom 4 and Symptom 8)

### 6i. GRPO Variants Reference

For advanced users or when standard GRPO isn't working, these variants address specific failure modes:

**DAPO** (arxiv 2503.14476) — 4 techniques for training at scale:
1. **Clip-Higher**: Asymmetric clipping (paper: epsilon_low=0.2, epsilon_high=0.28; **vLLora cloud uses much tighter: epsilon=3e-4, epsilon_high=4e-4**) — *"promotes the diversity of the system and avoids entropy collapse."* Our tight values mean very conservative policy updates — `clip_ratio` should stay near zero; if it rises, it's a stronger diagnostic signal than with DAPO's wider values.
2. **Dynamic Sampling**: Filters batches to only include prompts where 0 < accuracy < 1 — *"improves training efficiency and stability"* by excluding prompts where all candidates score identically (our dead-weight record problem)
3. **Token-Level Policy Gradient Loss**: Normalizes by total tokens across all sequences — *"critical in long-CoT RL scenarios"*
4. **Overlong Reward Shaping**: Soft penalty for truncated responses — *"reduces reward noise and stabilizes training"*

**Dr. GRPO** (arxiv 2503.20783) — Fixes 2 biases in standard GRPO:
1. **Response-level length bias**: Removes `1/|o_i|` normalization that causes incorrect responses to grow longer
2. **Question-level difficulty bias**: Removes `std()` normalization — *"treating all questions equally"* instead of weighting easy questions disproportionately

**SAPO** (arxiv 2511.20347) — Smooth alternative to hard clipping:
- *"Replaces hard clipping with a smooth, temperature-controlled gate that adaptively attenuates off-policy updates"*
- Uses asymmetric temperatures for positive vs negative token updates

These are reference implementations. The vLLora cloud already uses `loss_type="dr_grpo"` (length-unbiased normalization) and `mask_truncated_completions=True` by default. If your training shows specific failure modes (entropy collapse → try DAPO's Clip-Higher; length bias → already mitigated by dr_grpo, check grader for reward-correlated verbosity instead; clipping issues → try SAPO), consult the relevant paper for implementation details.

---

## Part 7: Iteration Playbook

### 7a. First Evaluation — What to Expect

Most first evaluations score avg 0.3-0.5. This is normal. Common first-run issues:

| Issue | Frequency | Typical fix |
|-------|-----------|-------------|
| Grader too strict | Very common | Remove hard gates, add partial credit |
| System prompt/grader misalignment | Common | Rewrite both to target same 3-5 behaviors |
| Prompts too vague | Common | Make prompts more specific and varied |
| Base model incapable | Rare (for appropriate models) | Try larger model |

### 7b. Iteration Cadence

| Iteration | Focus | Expected improvement |
|-----------|-------|---------------------|
| 1 → 2 | Fix grader (biggest lever) | +0.10-0.20 avg score |
| 2 → 3 | Fix data (weak topics, variety) | +0.05-0.15 avg score |
| 3 → 4 | Fine-tune grader weights | +0.02-0.05 avg score |
| 4+ | Diminishing returns | Consider training |

**Rule of thumb**: If avg > 0.6 and pass rate > 70%, proceed to training. Further eval iteration has diminishing returns — training itself provides additional learning.

### 7c. Post-Training Iteration

After a training run, the next iteration is different from eval-only iteration:

1. **Compare eval vs training results** (Part 4c templates above)
2. **If training improved scores but not enough**: continue from checkpoint with same or adjusted config
3. **If training showed anomalies**: fix the anomaly cause and retrain
4. **If training showed no improvement**: the issue is upstream (grader or data) — go back to eval iteration
5. **If training degraded some topics**: investigate conflicting signals, consider topic-aware grading

### 7d. When to Stop

| Signal | Interpretation | Action |
|--------|---------------|--------|
| avg > 0.8 after training, pass rate > 90% | Excellent result | Deploy |
| avg 0.6-0.8, improving each epoch | Good result, may benefit from more epochs | Continue or deploy |
| avg 0.6-0.8, plateaued | Good enough, more training won't help | Deploy |
| avg < 0.6 after 3+ training iterations | Fundamental issue | Go back to eval iteration or change approach |
| avg < 0.4 after all strategies tried | Task may not be suitable for this model size | Escalate model or simplify task |

---

## Part 8: API Cheat Sheet for Analysis

Quick reference for all data fetching the agent needs during analysis.

```bash
# 1. Fetch eval results
EVAL_RESULT=$(curl -s http://localhost:9090/finetune/evaluations/$EVAL_ID)

# 2. Fetch training metrics (time-series)
METRICS=$(curl -s "http://localhost:9090/finetune/workflows/$WF_ID/jobs/$JOB_ID/metrics")

# 3. Fetch per-epoch training evaluations
EPOCH_EVALS=$(curl -s "http://localhost:9090/finetune/workflows/$WF_ID/finetune-evaluations?finetune_job_id=$JOB_ID")

# 4. Fetch training job status
JOB_STATUS=$(curl -s "http://localhost:9090/finetune/workflows/$WF_ID/jobs/$JOB_ID/status")

# 5. Fetch all training jobs for a workflow (history)
ALL_JOBS=$(curl -s "http://localhost:9090/finetune/workflows/$WF_ID/jobs")

# 6. Fetch dataset analytics
ANALYTICS=$(curl -s "http://localhost:9090/finetune/workflows/$WF_ID/analytics")

# 7. Read per-record eval scores (read-only — scores live on eval results, not on records)
SCORES=$(curl -s "http://localhost:9090/finetune/workflows/$WF_ID/records/scores")

# 8. Update grader (after fixing)
curl -s -X PATCH "http://localhost:9090/finetune/workflows/$WF_ID/evaluator" \
  -F "file=@grader.js"

# 9. Re-upload records (after regenerating)
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records \
  --workflow-id $WF_ID --file training.jsonl

# 10. Sync to cloud — no manual sync needed, gateway auto-uploads
# via ensure_dataset_uploaded() when creating eval or training jobs
```

---

## Part 9: Analysis Scripts

The agent should use inline Python (via bash) for analysis — no script files needed. Key computations:

**Compute score statistics from eval results:**
```bash
echo "$EVAL_RESULT" | python3 -c "
import sys, json, math
r = json.load(sys.stdin)
scores = [e['score'] for rec in r.get('results',[]) for ep in rec.get('epochs',{}).values() for e in ep if 'score' in e]
if not scores:
    print('No scores found'); sys.exit(1)
avg = sum(scores)/len(scores)
std = math.sqrt(sum((s-avg)**2 for s in scores)/len(scores))
buckets = {'zero':0, 'low':0, 'medium':0, 'high':0, 'perfect':0}
for s in scores:
    if s == 0: buckets['zero'] += 1
    elif s < 0.4: buckets['low'] += 1
    elif s < 0.7: buckets['medium'] += 1
    elif s < 1.0: buckets['high'] += 1
    else: buckets['perfect'] += 1
print(f'Average: {avg:.3f}  Std: {std:.3f}  N: {len(scores)}')
for k,v in buckets.items():
    print(f'  {k}: {v} ({v/len(scores)*100:.1f}%)')
"
```

**Compute per-topic breakdown from eval results:**
```bash
echo "$EVAL_RESULT" | python3 -c "
import sys, json
from collections import defaultdict
r = json.load(sys.stdin)
topics = defaultdict(list)
for rec in r.get('results', []):
    topic = (rec.get('row') or {}).get('topic', 'uncategorized')
    for ep in rec.get('epochs', {}).values():
        for e in ep:
            if 'score' in e:
                topics[topic].append(e['score'])
print(f'{\"Topic\":<30} {\"Avg\":>6} {\"Count\":>6} {\"Min\":>6}')
print('-'*52)
for t in sorted(topics, key=lambda t: sum(topics[t])/len(topics[t])):
    ss = topics[t]
    print(f'{t:<30} {sum(ss)/len(ss):>6.2f} {len(ss):>6} {min(ss):>6.2f}')
"
```

**Compute epoch progression from training evaluations:**
```bash
echo "$EPOCH_EVALS" | python3 -c "
import sys, json
from collections import defaultdict
r = json.load(sys.stdin)
epoch_scores = defaultdict(list)
for rec in r.get('results', []):
    for ep_key, ep_list in rec.get('epochs', {}).items():
        for e in ep_list:
            if 'score' in e:
                epoch_scores[int(ep_key)].append(e['score'])
print('Epoch  Avg Score  Records')
print('-'*30)
for ep in sorted(epoch_scores):
    ss = epoch_scores[ep]
    print(f'{ep:>5}  {sum(ss)/len(ss):>9.3f}  {len(ss):>7}')
"
```

**Categorize records by training trajectory:**
```bash
echo "$EPOCH_EVALS" | python3 -c "
import sys, json
r = json.load(sys.stdin)
improved = stagnant = degraded = 0
for rec in r.get('results', []):
    epochs = rec.get('epochs', {})
    if not epochs: continue
    sorted_eps = sorted(epochs.keys(), key=int)
    first = [e.get('score',0) for e in epochs[sorted_eps[0]]]
    last = [e.get('score',0) for e in epochs[sorted_eps[-1]]]
    if not first or not last: continue
    delta = (sum(last)/len(last)) - (sum(first)/len(first))
    if delta > 0.1: improved += 1
    elif delta < -0.1: degraded += 1
    else: stagnant += 1
total = improved + stagnant + degraded
print(f'Improved:  {improved} ({improved/max(total,1)*100:.0f}%)')
print(f'Stagnant:  {stagnant} ({stagnant/max(total,1)*100:.0f}%)')
print(f'Degraded:  {degraded} ({degraded/max(total,1)*100:.0f}%)')
"
```

**Extract common reason phrases from low-scoring records:**
```bash
echo "$EVAL_RESULT" | python3 -c "
import sys, json, re
from collections import Counter
r = json.load(sys.stdin)
reasons = []
for rec in r.get('results', []):
    for ep in rec.get('epochs', {}).values():
        for e in ep:
            if e.get('score', 1) < 0.4 and e.get('reason'):
                reasons.append(e['reason'])
# Extract key phrases (simplified: split by sentence, count)
phrases = Counter()
for reason in reasons:
    for sent in re.split(r'[.;]', reason):
        sent = sent.strip()
        if len(sent) > 15:
            phrases[sent] += 1
print(f'Low-scoring records: {len(reasons)}')
print('\\nTop grader complaints:')
for phrase, count in phrases.most_common(5):
    print(f'  ({count}x) {phrase[:80]}')
"
```
