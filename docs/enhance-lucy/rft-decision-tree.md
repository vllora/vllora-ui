# RFT Iteration Decision Tree

Practical decision tree for Lucy's iteration loop. Based on OpenAI RFT best practices + our available data.

**Key difference from SFT**: In RFT, the output field can be empty — the model generates responses during training, and the grader scores them. The grader IS the training signal. This means the grader quality is as important as the dataset quality.

---

## 1. What Data We Have (Per Checkpoint)

### From Evaluation (Dry Run)

| Data | Source | What It Tells Us |
|------|--------|-----------------|
| **Per-record score** (0-1) | `EpochEntry.score` | How well the model answered this prompt |
| **Per-record grader reason** | `EpochEntry.reason` | WHY the grader gave that score |
| **Score distribution** (mean, std, percentiles, histogram) | `DryRunStats.statistics` | Overall signal quality |
| **Per-topic breakdown** (mean, std, count, status) | `DryRunStats.byTopic` | Which topics are weak |
| **Pass/fail counts** | `EvaluationSummary` | Quick health check |
| **Sample results** (highest, lowest, around mean) | `DryRunStats.sampleResults` | Concrete examples to inspect |
| **Diagnosis & recommendations** | `DryRunStats.diagnosis` | Automated warnings |
| **Topic distribution** | `DatasetStats.topicDistribution` | Record count per topic |
| **Balance score** | `CoverageStats.balanceScore` | How evenly distributed records are |

### From Training Job (Per Epoch)

| Data | Source | What It Tells Us |
|------|--------|-----------------|
| **Per-record per-epoch score** | `EpochEvalResult.score` | Learning trajectory per record |
| **Per-record per-epoch reason** | `EpochEvalResult.reason` | What the model is doing differently each epoch |
| **Training reward curve** | `WorkflowState.training.metrics` | trainReward, validReward, loss per epoch |
| **Fine-tuned model ID** | `FinetuneJob.fine_tuned_model` | For post-training evaluation |

### Derived Analysis (What Lucy Should Compute)

| Analysis | How to Compute | Why It Matters |
|----------|---------------|----------------|
| **Score delta per topic** | Compare topic means across iterations | Shows if targeted fixes worked |
| **Record-level delta** | Compare same record's score across iterations | Finds records that improved/regressed |
| **Grader consistency** | Same record scored twice → different scores? | Detects noisy grader |
| **Reward hacking detection** | Score goes up + grader reasons show superficial changes | Model gaming the grader |
| **Topic coverage gap** | Topics with < N records or < X% of total | Under-represented areas |
| **Score variance by topic** | Std per topic | Low std = no signal for that topic |
| **Failure pattern clustering** | Group similar grader reasons from failed records | Common root causes |

---

## 2. Healthy Score Ranges for RFT

RFT has specific requirements for the score distribution to provide useful training signal.

> **Which score?** This section applies to **Dry Run (Eval) Scores** — the scores you get BEFORE training, when you run your grader(s) against a model on your dataset. These tell you whether the dataset + grader combo will produce a good training signal. Training (Finetune) Scores are analyzed separately in Section 5.

### Dry Run Score Distribution Health Check

| Metric | Healthy Range | Too Low | Too High |
|--------|--------------|---------|----------|
| **Mean dry run score** | 0.25 – 0.65 | < 0.25 → "too hard, no signal" | > 0.65 → "too easy, limited room" |
| **Std deviation** | 0.10 – 0.25 | < 0.10 → "no differentiation" | > 0.25 → "bimodal, inconsistent" |
| **% above zero** | > 10% | < 10% → "model can't do this task at all" | — |
| **% perfect (1.0)** | < 50% | — | > 50% → "too easy, not enough to learn from" |

### Why These Ranges Matter for RFT

- **Too easy (mean > 0.65)**: The model already knows this. RFT learns by reinforcing successes — if everything succeeds, there's no gradient to improve.
- **Too hard (mean < 0.25)**: RFT needs the model to sometimes succeed so it can reinforce those behaviors. If it never succeeds, there's no positive signal.
- **Sweet spot (0.25–0.65)**: Enough successes to reinforce, enough failures to learn from. The model has room to improve.
- **No variance (std < 0.10)**: All dry run scores are similar → grader can't differentiate quality → no useful training signal.

---

## 3. The Five Adjustable Levers

When something is wrong, Lucy can adjust these (ordered by impact).

> **Which scores trigger which levers?** Levers 1–3 and 5 are adjusted based on **dry run (eval) scores** in the inner loop. Lever 4 is adjusted based on **training (finetune) scores** in the outer loop.

### Lever 1: Grader/Evaluation Function

The grader IS the training signal in RFT. A bad grader = bad training.

| Adjustment | When to Use (based on dry run scores) |
|-----------|------------|
| **Loosen criteria** | Dry run mean too low (< 0.25), model can't pass anything |
| **Tighten criteria** | Dry run mean too high (> 0.65), everything passes, no learning signal |
| **Add partial credit** | Many 0.0 dry run scores where answer was partially correct (grader reasons say "close but...") |
| **Fix reward hacking** | Training scores improving but grader reasons show superficial/padded answers |
| **Add contrastive examples** | Grader inconsistent (same quality → different dry run scores) |
| **Split into multiple graders** | Single grader conflating different quality dimensions (notation + pedagogy) |
| **Change grader model** | Use stronger model (gpt-4o) for more nuanced judging |

**Key RFT insight**: "Before adding more compute, invest in data quality — clean trusted data and methodical grader updates almost always buy more accuracy than extra epochs." (OpenAI Cookbook)

### Lever 2: Record Content (Prompt Quality)

The prompts in the training data determine what the model learns.

| Adjustment | When to Use (based on dry run scores & grader reasons) |
|-----------|------------|
| **Make prompts more specific** | Dry run grader reasons say "response is vague/off-topic" — prompt didn't constrain the model enough |
| **Add context to prompts** | Dry run grader reasons say "missing information" — prompt didn't provide enough setup |
| **Simplify prompts** | Most records get dry run score 0 for a topic — task is too complex, break it down |
| **Add variety** | Low dry run std in a topic — all prompts are too similar, model memorizes |
| **Ground in knowledge source** | Dry run grader reasons say "generic/not specific" — prompts don't reference real domain content |
| **Fix incorrect records** | Specific records consistently get dry run score 0 across dataset iterations — likely bad data |

### Lever 3: Record Distribution (Count & Balance)

How many records per topic and overall.

| Adjustment | When to Use (based on dry run scores & topic stats) |
|-----------|------------|
| **Add records to weak topic** | Topic has < 20 records AND low dry run score — not enough examples to learn from |
| **Add records for variety** | Topic has ok count but low dry run std — add different prompt styles |
| **Remove low-quality records** | Records that get dry run score 0.0 every dataset iteration — they're noise, not signal |
| **Rebalance across topics** | Balance score < 0.5 — some topics have 5x more records than others |
| **Total count check** | < 50 total records → probably too few for RFT to work well |

**OpenAI guidance**: "Start with several dozen to a few hundred examples. Dozens can be meaningful as long as they're high quality." Max 50,000 training / 1,000 test.

### Lever 4: Training Configuration

Hyperparameters affect how the model learns from the grader signal.

| Adjustment | When to Use (based on training/finetune scores) |
|-----------|------------|
| **Reduce epochs** | Overfitting — training score at epoch N+1 drops below epoch N |
| **Increase epochs** | Training scores still improving at last epoch — model hasn't converged |
| **Increase batch size** | Noisy training reward curves — larger batches stabilize updates |
| **Lower learning rate** | Training reward spikes/oscillates — updates too aggressive |
| **Increase LoRA rank** | Model can't capture task complexity — needs more parameters |
| **Adjust response_candidates_count** | More candidates = more exploration, but slower training |

### Lever 5: Topic Hierarchy

Restructuring what the model is learning about.

| Adjustment | When to Use (based on dry run scores per topic) |
|-----------|------------|
| **Split topic** | One topic has high dry run std — it's actually two different skills |
| **Merge topics** | Two topics have identical dry run performance — they're not distinct |
| **Add sub-topics** | Topic is too broad — dry run scores vary widely within it |
| **Remove topic** | Topic consistently gets dry run score 0 — may be outside model capability |

---

## 4. Inner Loop Decision Tree — Dry Run (Eval) Scores

> **This entire section uses Dry Run (Eval) Scores** — from `DryRunStats` / `EvaluationResultResponse`.
> These are scores from running your grader(s) against a model on your dataset BEFORE training.
> The goal: validate that the dataset + grader combo produces a healthy training signal before spending compute on training.

### Step A: Read the Dry Run Score Distribution

```
Mean Dry Run Score?
├── < 0.10  → HARD STOP: Model can't do this task at all
│              → Try: easier prompts, different base model, or simpler grader
│
├── 0.10–0.25 → WARNING: Very low signal
│              → Check: Is the grader too strict? Are prompts too hard?
│              → Try: Loosen grader, simplify prompts, add partial credit
│
├── 0.25–0.65 → HEALTHY: Good training signal range
│              → Continue to Step B (per-topic analysis)
│
├── 0.65–0.85 → WARNING: Getting easy
│              → Check: Is the grader too lenient? Are prompts too simple?
│              → Try: Tighten grader criteria, add harder prompts
│
└── > 0.85    → PROBLEM: Too easy, minimal learning potential
               → Must: Tighten grader significantly, add challenging records
```

### Step B: Check Dry Run Score Variance

```
Dry Run Std Deviation?
├── < 0.10    → PROBLEM: No differentiation
│              → Grader gives everything similar dry run scores
│              → Try: Add more granular scoring criteria, use partial credit
│
├── 0.10–0.25 → HEALTHY: Good variance
│              → Continue to Step C
│
└── > 0.25    → WARNING: Bimodal distribution
               → Check: Is there a cluster of 0s and a cluster of 1s?
               → May indicate: grader is binary (pass/fail), not graduated
               → Try: Add intermediate scoring levels
```

### Step C: Per-Topic Analysis (Dry Run Scores)

```
For each topic, check mean dry run score:
├── Dry run score < 0.20 AND count < 20
│   → Not enough data + model fails → ADD 20-30 records + simplify prompts
│
├── Dry run score < 0.20 AND count >= 20
│   → Enough data but model still fails → CHECK grader reasons
│   ├── Grader says "off-topic" → Fix prompts (more specific)
│   ├── Grader says "incorrect" → Content quality issue, regenerate records
│   └── Grader says "format wrong" → Grader too strict on format, loosen
│
├── Dry run score 0.20–0.50
│   → Model partially succeeds → READ grader reasons for failed records
│   ├── Common failure pattern? → Targeted fix (lever 1 or 2)
│   └── Random failures? → Add variety (more diverse prompts)
│
├── Dry run score 0.50–0.70
│   → Decent performance → CHECK if it's improving across dataset iterations
│   ├── Improving → Keep going, no changes needed
│   └── Stalled → Try: different prompt styles, tighten grader on edge cases
│
└── Dry run score > 0.70
    → Strong → No changes needed for this topic
    → BUT check: is the grader actually rigorous here?
```

### Step D: Grader Health Check (Using Dry Run Results)

```
Check grader behavior from dry run results:
├── Do grader reasons make sense?
│   ├── Yes → Grader is aligned, trust the dry run scores
│   └── No  → GRADER PROBLEM: Fix grader before changing dataset
│
├── Is grader consistent? (same record → similar dry run score?)
│   ├── Yes → Grader is reliable
│   └── No  → Add contrastive examples, reduce temperature, use eval_samples=3
│
├── Are high-scoring records actually good? (inspect top dry run results)
│   ├── Yes → Grader is working
│   └── No  → REWARD HACKING risk: Tighten grader, add negative criteria
│
└── Are low-scoring records actually bad? (inspect bottom dry run results)
    ├── Yes → Grader is working
    └── No  → Grader too strict: loosen criteria, add partial credit
```

### Step E: Cross-Iteration Comparison (Dataset Iteration 2+, Using Dry Run Scores)

```
Compare dry run scores to previous dataset iteration:
├── Overall dry run mean improved (delta > 0.03)?
│   ├── Yes → Dataset/grader changes worked, continue with similar strategy
│   └── No  → STALL DETECTED
│       ├── Same failure patterns in grader reasons? → Previous fix didn't work, try different lever
│       ├── New failure patterns? → Fix introduced regression, investigate
│       └── Plateau (delta < 0.03 for 2+ iters)? → ESCALATION needed
│           ├── Changed only dataset? → Try changing grader
│           ├── Changed only grader? → Try changing dataset
│           └── Changed both? → Step back, re-examine fundamentals
│
├── Per-topic: which topics' dry run scores improved?
│   ├── Targeted topic improved → Fix worked ✓
│   ├── Targeted topic same/worse → Fix didn't work, read new grader reasons
│   └── Non-targeted topic regressed → Fix had side effects, investigate
│
└── Per-record: same records still failing in dry run?
    ├── Same records fail with same reasons → Fix didn't reach these
    ├── Same records fail with NEW reasons → Partial progress, iterate
    └── Previously failing records now pass → Fix worked ✓
```

### Step F: Cross-Model Comparison (Using Dry Run Scores on Different Models)

```
Run same grader + dataset against multiple models, compare dry run scores:
├── Stronger model (gpt-4o) passes, target model (4o-mini) fails?
│   → Dataset is valid, target model needs clearer prompts
│   → Make prompts more explicit/specific for smaller model
│
├── Both models fail on same records?
│   → Dataset/grader issue, not model issue
│   → Fix records or grader criteria
│
├── Stronger model also struggles on a topic?
│   → Topic may be genuinely too hard
│   → Consider: simplify the task, break into sub-tasks
│
└── Target model matches stronger model?
    → Dataset is well-calibrated for this model
    → Can proceed to training
```

---

## 5. Outer Loop Decision Tree — Training (Finetune) Scores

> **This entire section uses Training (Finetune) Scores** — from `FinetuneEvalResultsResponse`.
> These are per-record, per-epoch scores generated DURING training. After training completes, you can also re-run dry run evals on the fine-tuned model to compare against the base model.

After training completes, analyze epoch-by-epoch **training scores**:

```
Training (Finetune) Scores by Epoch:
├── All topics: Training score at Epoch N > Epoch N-1 > Epoch 1?
│   → Model is learning, no overfitting
│   → NEXT: Run dry run eval on fine-tuned model to confirm real quality → DEPLOY ✓
│
├── Some topics: Training score at Epoch N < Epoch N-1? (regression)
│   → OVERFITTING on those topics
│   ├── Try: Use earlier epoch checkpoint (where training score was highest)
│   ├── Try: Reduce epochs in training config
│   ├── Try: Add more diverse prompts for those topics → re-train
│   └── Try: Increase LoRA rank (more capacity)
│
├── Some topics: Training score at Epoch N ≈ Epoch 1? (no improvement)
│   → Model didn't learn this topic
│   ├── Check: Enough records? (< 20 → add more)
│   ├── Check: Records too similar? (add variety)
│   ├── Check: Grader signal clear? (inspect grader reasons from training)
│   └── Go back to inner loop (dry run eval) for this topic only
│
├── Training scores increasing but output quality decreasing? (inspect model outputs)
│   → REWARD HACKING
│   ├── Model learned to game the grader, not the actual task
│   ├── How to detect: Run dry run eval on fine-tuned model, manually inspect high-scoring outputs
│   ├── Fix grader: add discriminative criteria
│   ├── Add contrastive examples to grader prompt
│   └── Re-train with fixed grader
│
├── Post-training dry run eval: Fine-tuned model vs Base model
│   ├── Fine-tuned model dry run scores >> Base model dry run scores → Training worked ✓
│   ├── Fine-tuned model dry run scores ≈ Base model dry run scores → Training didn't help
│   │   → Check: Was dry run signal healthy? (Section 2) Maybe dataset was too easy
│   └── Fine-tuned model dry run scores < Base model dry run scores → Training made it worse
│       → Likely overfitting or reward hacking, investigate
│
└── Training failed?
    ├── Data format error → Fix JSONL structure
    ├── Timeout → Reduce dataset size or simplify
    └── Resource error → Retry or contact provider
```

---

## 6. Stall Escalation Strategy

When **dry run scores** plateau across dataset iterations (inner loop):

```
Escalation levels (try in order):
│
├── Level 1: Targeted data fix
│   Read grader reasons from dry run → Fix specific prompts → Re-run dry run eval
│
├── Level 2: Grader refinement
│   Add partial credit, contrastive examples, or split grader → Re-run dry run eval
│
├── Level 3: Data expansion
│   Add 30-50% more records, focus on weak topics → Re-run dry run eval
│
├── Level 4: Structural change
│   Restructure topics, change prompt strategy fundamentally → Re-run dry run eval
│
├── Level 5: Configuration change (only after training)
│   Adjust training hyperparameters (epochs, LR, batch size)
│   → Only relevant if training scores are plateauing in the outer loop
│
└── Level 6: Fundamental reassessment
    → Task may be too hard for this model
    → Consider: stronger base model, simpler task definition,
      or accept current performance and deploy
```

---

## 7. Summary: Two Loops, Two Score Types

```
┌─────────────────────────────────────────────────────────────────────┐
│ INNER LOOP (Dataset Iteration) — uses DRY RUN (EVAL) SCORES        │
│                                                                     │
│ ANALYZE dry run scores:                                             │
│   Dry run distribution (mean, std, percentiles)                     │
│   Per-topic dry run breakdown (score, count, balance)               │
│   Per-record dry run details (score, grader reason, content)        │
│   Grader behavior (consistency, alignment, hacking)                 │
│   Cross-iteration dry run delta (improved? stalled? regressed?)     │
│   Cross-model dry run comparison (target vs reference model)        │
│                                                                     │
│ DECIDE what to fix:                                                 │
│   Is the problem the grader? → Fix grader first                     │
│   Is the problem the data? → Fix data                               │
│   Is the problem the distribution? → Rebalance                      │
│   Is everything healthy? → Proceed to training (outer loop)         │
│   Is nothing working? → Escalate (Section 6)                        │
│                                                                     │
│ ADJUST (Levers 1-3, 5):                                             │
│   Lever 1: Grader content (criteria, strictness, rubric)            │
│   Lever 2: Record content (prompt clarity, specificity)             │
│   Lever 3: Record distribution (count, balance, variety)            │
│   Lever 5: Topic hierarchy (split, merge, restructure)              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Dry run scores healthy → Train
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ OUTER LOOP (Training Iteration) — uses TRAINING (FINETUNE) SCORES  │
│                                                                     │
│ ANALYZE training scores:                                            │
│   Per-epoch training score trajectory (improving? plateauing?)      │
│   Per-topic training scores (all topics learning?)                  │
│   Post-training dry run eval (fine-tuned vs base model)             │
│   Reward hacking check (scores up but quality down?)                │
│                                                                     │
│ DECIDE:                                                             │
│   Training scores improving across epochs? → Check for overfitting  │
│   Topics not improving? → Go back to inner loop for those topics    │
│   Reward hacking? → Fix grader, re-train                            │
│   Fine-tuned > Base in dry run? → DEPLOY ✓                          │
│                                                                     │
│ ADJUST (Lever 4, or go back to inner loop):                         │
│   Lever 4: Training config (epochs, LR, batch size, LoRA rank)     │
│   Or: Go back to inner loop to fix dataset/grader, then re-train   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Sources

- [OpenAI RFT Guide](https://developers.openai.com/api/docs/guides/reinforcement-fine-tuning/)
- [OpenAI Cookbook: Exploring Model Graders for RFT](https://developers.openai.com/cookbook/examples/reinforcement_fine_tuning/)
- [OpenAI Cookbook: RFT for Conversational Reasoning (HealthBench)](https://developers.openai.com/cookbook/examples/fine-tuned_qa/reinforcement_finetuning_healthbench)
- [OpenAI Cookbook: Fine-Tuning Techniques — SFT vs DPO vs RFT](https://developers.openai.com/cookbook/examples/fine_tuning_direct_preference_optimization_guide/)
- [OpenAI RFT Use Cases](https://platform.openai.com/docs/guides/rft-use-cases)
- Existing codebase: `DryRunStats`, `FinetuneEvalResultsResponse`, `DatasetRecord.evaluation`
