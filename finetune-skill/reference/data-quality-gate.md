# Data Quality Gate Reference

Pre-eval validation that catches data issues before they waste expensive evaluation and training runs. This gate runs between Step 5.5 (Dataset Validation) and Step 6 (Verify) in the pipeline.

> **Core principle**: "Before adding more compute, invest in data quality: clean, trusted data and methodical updates almost always buys more accuracy than extra epochs." — OpenAI RFT Guide

## Why This Gate Exists

The finetune pipeline has two expensive steps:
1. **Evaluation** (~45 min, LLM calls) — tests the base model against your data + grader
2. **Training** (hours, GPU) — runs GRPO on your data

If your data has quality issues (vague ground truths, misaligned prompts, low diversity), you'll discover them only AFTER paying for eval — then need to fix and re-run. With training, the cost is 10-100x higher.

The data quality gate catches these issues **for free** (structural + diversity gates) or **cheaply** (LLM gates scoring 30 samples), saving iteration cycles.

**Expected impact**: DOTS+RR (arXiv:2506.05316, NeurIPS 2025) showed difficulty-targeted data selection reduces training time by **23-62%**. Clean data + fewer iterations = lower total cost.

## Gates

### Gate 1: Structural (free)

Validates data format and distribution without any API calls.

| Check | Threshold | Severity | Research basis |
|-------|-----------|----------|----------------|
| Record count | >= 50 | Hard | OpenAI RFT: "several dozen to a few hundred" for GRPO |
| Duplicate IDs | 0 | Hard | Data integrity |
| Empty user prompts | 0 | Hard | No training signal from empty prompts |
| Short prompts | < 20 chars → warn | Soft | Trivially short prompts yield no useful signal |
| Ground truth coverage | >= 70% of records | Soft | GTs enable grader calibration and quality assessment |
| Short ground truths | < 30 chars → warn | Soft | GTs must be substantive for grading |
| Topic count | >= 3 leaf topics | Soft | Diversity prevents distribution collapse (arXiv:2511.01490) |
| Topic dominance | No topic > 40% | Soft | Balanced training data is standard ML practice |
| Thin topics | >= 5 records per topic | Soft | GRPO needs enough examples per skill for stable batches |
| Missing system prompts | 0 → warn | Soft | System prompts define the task context |
| Orphan topics | 0 → warn | Soft | Records should reference valid topic IDs |

### Gate 2: Diversity (free — trigram-based)

Analyzes prompt diversity without API calls. Uses character trigram Jaccard similarity (same algorithm as `deduplicate_records.py`).

| Check | Threshold | Severity | Research basis |
|-------|-----------|----------|----------------|
| Near-duplicate fraction | < 10% at 0.85 similarity | Soft | Redundant prompts waste training compute |
| Average pairwise distance | >= 0.40 | Soft | "Synthetic Eggs in Many Baskets" (arXiv:2511.01490): low diversity causes distribution collapse |
| Per-topic diversity | Avg distance >= 0.35 within topic | Soft | "What Matters in LLM-generated Data" (arXiv:2506.19262): diversity > quality > complexity |

**Why trigrams instead of embeddings?** Zero dependencies, instant execution, and sufficient for catching obvious redundancy. Embedding-based diversity analysis can be added as a future enhancement but requires an embedding model call per record.

### Gate 3: Ground Truth Quality (LLM-scored, $)

Samples records and uses LLM-as-judge to score each ground truth on:
- **Specificity** (0.4 weight): Cites concrete rules, facts, numbers? Or vague/general?
- **Completeness** (0.3 weight): Covers the key aspects the question asks about?
- **Actionability** (0.3 weight): Could a grader reliably distinguish good vs bad responses using this GT?

| Check | Threshold | Severity | Research basis |
|-------|-----------|----------|----------------|
| Mean GT quality score | >= 0.60 | Soft | DeepSeek-R1 (arXiv:2501.12948): rejection sampling filters low-quality data |
| Low-quality GT fraction | < 20% scoring below 0.4 | Soft | OpenAI RFT: "have a domain expert relabel the noisy slice" |

**Default sample size**: 30 records (configurable via `--sample`). This catches systemic issues without scoring every record. Increase to 50-100 for large datasets (500+ records).

### Gate 4: Prompt-GT Alignment (LLM-scored, $)

Checks whether the ground truth actually answers the user's question completely. Catches:
- Multi-part questions with partial answers
- Scope mismatch (question about X, answer about Y)
- Opinion questions with factual answers
- Missing aspects

| Check | Threshold | Severity | Research basis |
|-------|-----------|----------|----------------|
| Mean alignment score | >= 0.60 | Soft | OpenAI RFT: "Check whether qualified human experts agree on the answers" |
| Misaligned fraction | < 15% scoring below 0.4 | Soft | Misaligned GTs confuse the grader → noisy rewards → wasted training |

### Gate 5: Completion Length (free)

Estimates whether `max_output_tokens` is sufficient by combining ground truth length with task complexity.

**How it works**: The gate computes an adaptive multiplier based on system prompt complexity (per-record, since system prompts are composed per-topic from the hierarchy chain):
- Short system prompts (<100 tokens, simple Q&A): GT length × 2.0
- Medium system prompts (100-250 tokens, structured tasks): GT length × 3.0
- Long system prompts (>250 tokens, multi-step analysis): GT length × 5.0

The multiplier accounts for model verbosity — base models produce chain-of-thought, hedging, and formatting overhead that makes outputs 2-5x longer than concise ground truth references.

| Check | Threshold | Severity | Research basis |
|-------|-----------|----------|----------------|
| Estimated P95 > max_output_tokens | Any exceedance | Soft | DAPO (arXiv:2503.14476): uses 25% buffer above expected max |
| Estimated truncation fraction | > 5% | Soft | "Tricks or Traps" (arXiv:2508.08221): truncation = training noise |
| Estimated truncation fraction | > 30% | Hard | 100% truncation in food-label training caused completely flat reward |

**Why this matters**: In the food-label compliance test, `max_output_tokens=512` caused 100% completion truncation. The grader scored truncated answers, all K=8 completions were equally cut off, and the reward signal became noise. The training monitor flagged `clipped_ratio=1.0` at step 1, but training continued for 140 steps before cancellation — wasting ~9 hours of GPU time.

**Limitation**: This is a heuristic. Ground truth length is a proxy, not a measurement of actual model output length. The adaptive multiplier improves accuracy but cannot perfectly predict model verbosity. For highest confidence, run a few base model rollouts and measure actual completion lengths.

## Decision Table

| Verdict | Exit code | Action |
|---------|-----------|--------|
| PASS | 0 | Proceed to Step 6 (Verify) |
| WARN | 2 | Review fix priorities. High-impact fixes (GT quality, alignment) are worth doing before eval. Low-impact (thin topics, short prompts) can wait. |
| FAIL | 1 | Must fix before proceeding. Hard failures (duplicate IDs, empty prompts, too few records) break the pipeline. |

## When to Run Which Gates

| Scenario | Gates | Command |
|----------|-------|---------|
| Quick check during iteration | structural, diversity | `--gate structural,diversity` (default) |
| First pipeline pass | All 4 gates | `--all-gates` |
| After regenerating records | structural, diversity | Default is sufficient |
| After rewriting ground truths | All 4 gates | `--all-gates --sample 50` |
| Debugging grader issues | GT quality only | `--gate ground_truth_quality --sample 50` |

## Relationship to Other Gates

```
Data Quality Gate (Step 5.5b)     Readiness Gate (Step 7c)         Difficulty Probe (Step 7c+)
  Pre-eval                          Post-eval (aggregate)            Post-eval (per-prompt)
  Checks DATA quality               Checks GRADER + DATA interaction Checks SIGNAL STRENGTH
  Free or cheap (LLM samples)       Requires full eval run (~45 min) Uses eval results (free)
  Fix: rewrite data                 Fix: adjust grader or data       Fix: grader rubric, K, SFT
  
  Structural → Diversity →          Sample Count → Score Variance →  Difficulty buckets →
  GT Quality → Alignment            Concentration → Pass Rate → ...  Zero-var prediction →
                                                                     Grader granularity →
                                                                     Per-topic signal
```

Three gates catch three different failure modes:
1. **Data Quality Gate** catches data construction problems **before** eval
2. **Readiness Gate** catches grader+data interaction problems **after** eval (aggregate)
3. **Difficulty Probe** catches per-prompt signal problems **after** eval (granular)

All three are needed. A dataset can pass the data quality gate (well-constructed), pass the readiness gate (good aggregate statistics), but still produce flat training if most prompts fall outside the learnable difficulty range or the grader produces clustered scores.

## Common Failure Patterns

### Pattern 1: Vague Ground Truths (GT Quality gate)

**Symptom**: GT quality mean < 0.5, many GTs are policy statements instead of specific rules.

**Example**:
```
Prompt: "What are the FALCPA allergen labeling requirements for fish?"
GT (bad): "FDA requires allergen labeling on food products."
GT (good): "FALCPA (21 CFR 101.4) requires declaring major food allergens including fish. Each specific fish species must be named (e.g., 'cod', 'salmon'). Tree nuts and crustacean shellfish also require species-level declaration per FD&C Act §403(w)(2)."
```

**Fix**: Rewrite vague GTs with specific citations. Use `chat_completion.py` to generate improved GTs from the knowledge source parts.

### Pattern 2: Prompt-GT Misalignment (Alignment gate)

**Symptom**: Alignment mean < 0.5. Prompts ask multi-part questions but GTs only address one part.

**Example**:
```
Prompt: "Compare RACC vs actual serving size and how it affects consumer understanding"
GT (misaligned): "RACC is used to derive serving size. The closest fraction to RACC with actual gram weight is used."
Issue: GT doesn't address "consumer understanding" aspect at all.
```

**Fix**: Either narrow the prompt ("What is the relationship between RACC and serving size?") or expand the GT to cover all asked aspects.

### Pattern 3: Low Diversity (Diversity gate)

**Symptom**: Near-duplicate fraction > 10%, or average pairwise distance < 0.40.

**Root cause**: `generate_records.py` produced similar prompts across overlapping topics, or prompt types are too uniform (all "explain" type, no scenarios or edge cases).

**Fix**:
1. Run `deduplicate_records.py` to remove near-duplicates
2. Regenerate with explicit prompt type diversity: `--prompt-types scenario,edge_case,compare_analyze,application`
3. Check per-topic diversity — some topics may need manual prompt crafting

## Research Citations

| Paper | arXiv ID | Key finding for data quality |
|-------|----------|------------------------------|
| Hard Examples Are All You Need | 2508.14094 | Hard 10% gives 47% gains; easy examples nearly useless. Difficulty distribution matters. |
| No Prompt Left Behind | 2509.21880 (ICLR 2026) | 30-99% dead-weight prompts per batch in standard GRPO. Quality-curated data reduces waste. |
| Synthetic Eggs in Many Baskets | 2511.01490 | Synthetic data diversity significantly affects distribution collapse. Diverse sources prevent it. |
| What Matters in LLM-generated Data | 2506.19262 | Among quality, diversity, and complexity, **diversity has the strongest effect**. |
| DeepSeek-R1 | 2501.12948 | Rejection sampling + LLM-as-judge filtering for data curation. Quality > quantity. |
| DOTS+RR | 2506.05316 (NeurIPS 2025) | Difficulty-targeted online data selection reduces training time 23-62%. |
| Fixing It in Post | 2506.06522 (NeurIPS 2025) | Specific samples and curation strategies measurably affect downstream performance. |
| Towards Next-Gen LLM Training | 2603.14712 | Agent-driven data prep with composable quality operators. Closest to our pipeline architecture. |
| OpenAI RFT Guide | platform.openai.com | "Invest in data quality before adding more compute." Grader calibration before training. |
| Data-Centric AI | Andrew Ng / MIT Sloan | Systematically engineer data quality rather than iterating on models. |
