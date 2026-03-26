# Iteration Strategy

How to analyze evaluation results, diagnose issues, assess data quality, and iteratively improve until the model is ready for training.

---

## The Iteration Loop

```
Run Evaluation → Analyze Results → Diagnose Issues → Apply Fixes → Re-evaluate
                                 ↘ Check Distribution
                                 ↘ Check Variety
```

Typically 2-5 iterations are needed to reach a GO verdict.

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

### Step 5: GO / NO-GO Decision

| Verdict | Criteria | Action |
|---------|----------|--------|
| **GO** | avg > 0.6, pass rate > 70%, std 0.15-0.30 | Proceed to training |
| **WARNING** | avg 0.5-0.6 or pass rate 60-70% | Can train, but improvements likely help |
| **NO-GO** | avg < 0.5 or pass rate < 60% or std < 0.1 | Must fix before training |

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

### Per-Record Epoch Comparison

For each record, compare epoch 0 (before training) to the last epoch:
- **Improved records**: Training is teaching the model correctly for these scenarios
- **Stagnant records**: The model can't figure out how to score better — the prompt may be too vague, or the grader criteria may conflict
- **Degraded records**: Something is wrong — check if the grader is penalizing behaviors the model learned from other records

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
  "base_model": "unsloth/Qwen3.5-4B",
  "fine_tuned_model": "my-custom-model",
  "training_config": {"learning_rate": 0.00001, "lora_rank": 8, "epochs": 2.0},
  "created_at": "...",
  "completed_at": "...",
  "error_message": null
}
```

Key fields: `status` (succeeded/failed), `fine_tuned_model` (model name for testing), `error_message` (if failed).

**Per-epoch training scores** — Save `GET /finetune/workflows/{id}/finetune-evaluations?finetune_job_id=JOB_ID` to `training-jobs/job-{N}-epochs.json`:
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

Maintain `iteration-log.md` to track what changed and why:

```markdown
## Iteration 1
- Dataset ID: my-dataset-v1 (backend: ds_abc123)
- Eval run: eval_xyz789 → saved to evaluations/eval-v1.json
- Result: avg=0.45, pass_rate=60%, std=0.35 → NO-GO
- Low-scoring topics: technical/api (avg=0.2), technical/login (avg=0.3)
- Top grader complaints: "Response too short", "Missing step-by-step instructions"
- Changes made: Relaxed length check in grader, added 15 prompts to technical/*

## Iteration 2
- Dataset ID: my-dataset-v2 (backend: ds_def456)
- Eval run: eval_abc012 → saved to evaluations/eval-v2.json
- Result: avg=0.72, pass_rate=85%, std=0.22 → GO
- Decision: Proceed to training

## Training Run 1
- Job: ft_job_001 → saved to training-jobs/job-001.json
- Base model: unsloth/Qwen3.5-4B → Output: my-custom-model
- Epoch scores: 0→0.52, 1→0.68, 2→0.79 → saved to training-jobs/job-001-epochs.json
- Status: succeeded
```

This log is critical for diagnosing stalls — if scores aren't improving, the history shows exactly what was tried, what the grader complained about, and what changed.

### Comparing Iterations

When reviewing whether a change helped, compare the previous and current evaluation files:

1. **Overall**: Did average score and pass rate improve?
2. **Per-topic**: Did the weak topics improve without degrading strong ones?
3. **Per-record**: Are the same records still failing, or different ones?
4. **Grader reasons**: Are the complaints changing (progress) or staying the same (stuck)?

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

**Root cause: The grader criteria don't fit that topic.**

A grader designed for question-answering may not work well for topics that require a different response style (e.g., troubleshooting, creative writing, emotional support).

**How to verify:** Check if the low-scoring topic requires fundamentally different response qualities than the high-scoring topics.

**Fix:**
1. Make the grader topic-aware — check the user's message to determine what kind of response is appropriate:
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
2. Or split into separate fine-tuning runs — one per topic cluster that needs different evaluation criteria

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
