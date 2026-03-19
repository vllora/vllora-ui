# Analysis Strategy: Post-Evaluation & Post-Training Improvement

How the agent should analyze evaluation and training results, diagnose issues, and suggest concrete improvements to the user — interactively, so the user drives the final decision.

This document complements `iteration-strategy.md` (which covers the diagnosis framework) by defining **what the agent should compute, present, and offer** at each stage.

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
| Loss | `metrics.loss` | Policy gradient loss — should decrease |
| Gradient norm | `metrics.grad_norm` | Training stability — spikes indicate instability |
| KL divergence | `metrics.kl` | Drift from base model — too high = forgetting |
| Clipping ratio | `metrics.completions/clipped_ratio` | Output truncation — > 0.7 is critical |
| Mean completion length | `metrics.completions/mean_length` | Whether responses are reasonable length |
| Zero-std fraction | `metrics.frac_reward_zero_std` | Records where all candidates scored same — wasted training |

**Derived metrics the agent should compute:**

| Metric | Formula | What it signals |
|--------|---------|-----------------|
| Reward trend | Slope of `reward` over last N steps | Positive = learning, flat = stuck, negative = degrading |
| KL trend | Slope of `kl` over last N steps | Rising = policy diverging, may need lower LR |
| Loss trend | Slope of `loss` over last N steps | Should decrease; flat = not learning |
| Reward plateau detection | Reward change < 0.01 over 20% of max_steps | Model has converged or stalled |
| Clipping trend | `clipped_ratio` increasing? | Model generating longer outputs than `max_output_tokens` allows |

### 1c. Per-Epoch Training Evaluations

**Source:** `GET /finetune/workflows/{id}/dataset/finetune-evaluations?finetune_job_id={job_id}`

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
| Zero (score = 0) | `score === 0` | N | Hard gate hit or truly unusable response |
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

**Step 4: Reason pattern analysis**

From the bottom 20% of records (by score), extract and group `reason` fields:
- Count recurring phrases or themes
- Identify the top 3-5 grader complaints
- Check for contradictory reasons (indicates grader instability)

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

| Check | Condition | Severity |
|-------|-----------|----------|
| NaN/Inf in any metric | Any NaN or Inf in loss, reward, KL, grad_norm | Critical |
| Clipping overload | `clipped_ratio` > 0.7 at any point | Critical |
| KL explosion | KL > 2.0 or KL increased > 3x from start | Warning |
| Reward collapse | `reward_std` < 0.05 for > 50% of steps | Warning |
| Weak signal | `frac_reward_zero_std` > 0.6 for > 50% of steps | Warning |
| Gradient instability | `grad_norm` spikes > 5x median | Warning |
| No learning | `reward_delta` < 0.05 after full training | Info |

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
- Low improvement rate (< 30%) = training cannot fix what eval identified — root cause is elsewhere (prompts too vague, grader misaligned, base model incapable)

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
                          NO-GO    WARNING    │
                              │       │    Check pass_rate
                              │       │       │
                         Diagnose  Optional  ┌──┴──┐
                         (see 3b) improve   <70%  >70%
                                            │      │
                                         WARNING   GO
                                            │      │
                                         Optional  │
                                         improve  Check score_std
                                                    │
                                               ┌────┴────┐
                                            < 0.1      0.1-0.3
                                               │         │
                                          Grader not    READY
                                          differentiating  │
                                               │      Proceed to
                                          Fix grader   training
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

This is iteration {n}/5. After {remaining} more failed iterations, I'll suggest trying a larger base model.

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

2. **Use the GO/WARNING/NO-GO framework** for every evaluation. Users need a clear "should I proceed?" signal.

3. **Rank suggestions by impact.** If there are 5 things to fix, start with the one that affects the most records.

4. **Offer concrete next steps as numbered choices.** "I can: 1. Do X, 2. Do Y, 3. Do Z. Which would you prefer?" — never leave the user without clear options.

5. **Respect user expertise.** The user may know things the agent does not — domain-specific quality criteria, business priorities, acceptable tradeoffs. Present findings and let the user decide.

6. **Show your work.** When suggesting a grader change, show the specific records that motivated the suggestion. When suggesting more data, show the distribution gap.

7. **Track what was tried.** Reference previous iterations: "In iteration 1, we tried X and scores went from A to B. This time I suggest Y instead."

### 5b. Presentation Format

**After evaluation, always present in this order:**

1. **Verdict**: GO / WARNING / NO-GO (one line)
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
- Whether to proceed to training (GO/WARNING/NO-GO is a suggestion)
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
2. **Multiple candidates**: For each prompt, the model generates `response_candidates_count` responses (default: 2). The grader scores each. Higher-scoring candidates are reinforced.
3. **Relative reward**: What matters is the *difference* between candidate scores, not absolute scores. If all candidates score 0.5, the model learns nothing from that prompt.
4. **KL regularization**: A KL penalty prevents the model from drifting too far from the base model, preserving general capabilities.

### 6b. RFT-Specific Diagnostics

| Signal | What it means in RFT context | Fix |
|--------|------------------------------|-----|
| `frac_reward_zero_std` > 0.6 | More than 60% of prompts produce candidates that all score the same — no learning signal | Make grader more granular (partial credit), or make prompts harder so candidates differ in quality |
| `reward_std` < 0.05 | Model has converged to a single response pattern — all responses nearly identical | Increase temperature during training inference, or add more diverse prompts |
| `reward` increasing but `kl` increasing fast | Model is "cheating" — diverging from base model to find reward shortcuts | Lower learning rate, or fix grader to not reward shortcuts |
| `clipped_ratio` > 0.3 | Model generating responses longer than `max_output_tokens` — responses are truncated before grading | Increase `max_output_tokens` or add a length penalty to the grader |
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

Prevention:
- Keep `kl` in check (lower LR if it rises above 1.5)
- Use fewer epochs (2-3 max for small datasets)
- Verify on held-out prompts after training

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
EPOCH_EVALS=$(curl -s "http://localhost:9090/finetune/workflows/$WF_ID/dataset/finetune-evaluations?finetune_job_id=$JOB_ID")

# 4. Fetch training job status
JOB_STATUS=$(curl -s "http://localhost:9090/finetune/workflows/$WF_ID/jobs/$JOB_ID/status")

# 5. Fetch all training jobs for a workflow (history)
ALL_JOBS=$(curl -s "http://localhost:9090/finetune/workflows/$WF_ID/jobs")

# 6. Fetch dataset analytics
ANALYTICS=$(curl -s "http://localhost:9090/finetune/workflows/$WF_ID/dataset/analytics")

# 7. Write eval scores back to records (for UI display)
curl -s -X PATCH "http://localhost:9090/finetune/workflows/$WF_ID/records/$RECORD_ID/scores" \
  -H "Content-Type: application/json" \
  -d "{\"dry_run_score\": $SCORE}"

# 8. Update grader (after fixing)
curl -s -X PATCH "http://localhost:9090/finetune/workflows/$WF_ID/evaluator" \
  -F "file=@grader.js"

# 9. Re-upload records (after regenerating)
uv run scripts/finetune.py upload-records \
  --workflow-id $WF_ID --file training.jsonl

# 10. Sync to cloud before next eval/training
curl -s -X POST "http://localhost:9090/finetune/workflows/$WF_ID/dataset/upload"
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
