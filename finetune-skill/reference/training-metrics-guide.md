# GRPO / RFT Training Metrics Reference

How to interpret training metrics, diagnose issues, and decide what to change in the next iteration.

> **This is the single source of truth for metric thresholds.** The analysis workflow that uses these thresholds is in [`analysis-strategy.md`](analysis-strategy.md). The UI chart insights (`src/components/finetune/training-metrics-insights.ts`) also derive their thresholds from this document. When updating a threshold, update it HERE first — the other files reference this doc.

## Our Setup

vLLora uses **GRPO (Group Relative Policy Optimization)** for reinforcement fine-tuning:

- **Reward source**: Your grader script (`grader.js`) — NOT a learned reward model. The grader runs on each candidate completion and returns a score (0-1). This means reward quality depends entirely on grader quality.
- **Training provider**: vLLora cloud (LangDB) running GRPO on the base model (e.g., Qwen3.5-4B).
- **Data format**: RFT — system + user messages only (no assistant messages). The model generates its own completions during training.
- **Defaults**: `learning_rate=1e-6`, `response_candidates_count=8` (G=8), `max_output_tokens=512`.
- **Metrics**: Reported per training step via the cloud API. The UI displays them in real-time charts with auto-generated insights.

## Quick Decision Table

| Observation | Diagnosis | Action |
|---|---|---|
| Reward trending up, KL < 1.0, clipped_ratio < 0.1 | Healthy training | Continue or deploy |
| Reward flat, frac_reward_zero_std > 0.5 | No learning signal | Fix grader (avoid binary 0/1), increase G, adjust difficulty |
| Reward up but KL rising + outputs degenerate | Reward hacking (KL alone is not diagnostic — check output quality) | Enable/increase beta, add quality grader criteria, inspect outputs |
| Loss stuck at 0.0 | Zero advantages | Check data pipeline, reward function, chat template |
| clipped_ratio > 0.5 | Truncation dominating | Increase max_output_tokens |
| grad_norm NaN | Numerical failure | Fix truncation, check for zero masks |
| reward_std near 0 | Uniform outcomes | Adjust task difficulty or grader sensitivity |
| mean_length collapsing toward 0 | Length exploitation | Add length penalty to reward |
| All completions at max_output_tokens | Model can't stop | Increase max_output_tokens, verify EOS in template |

## Metric Reference

### Reward Metrics

**`reward`** — Average reward score across all completions in the batch.
- **What it is**: Each training step, the model generates G completions per prompt. Your grader scores each one (0-1). This metric averages all those scores. Think of it as "how well is the model doing right now, according to your grader?"
- Healthy: Steady upward trend. Absolute value depends on grader scale.
- Red flag: Rapid explosion (reward hacking), plateau at baseline (no learning), wild oscillation.
- Fix: If plateau → check grader gradient. If explosion → increase KL penalty. If oscillating → reduce LR.

**`reward_std`** — Standard deviation of rewards across the batch.
- **What it is**: How much do the scores vary? If the model generates 8 answers to a question and they ALL get the same score, std is 0. GRPO learns by comparing better completions to worse ones within the same group — if there's no difference, there's nothing to learn from.
- Healthy: Non-zero, proportional to reward scale (0.05-0.3 for [0,1] graders).
- Red flag: Near zero → all completions score identically, killing GRPO's learning signal.
- Fix: Adjust grader to provide more granular scores. Increase G (completions per prompt).

**`frac_reward_zero_std`** — Fraction of prompts where ALL G completions got identical rewards.
- **What it is**: What percentage of training questions produced zero learning signal? If 8 out of 8 completions for a question all score 0.7, that question taught the model nothing. This metric tells you how many questions are "wasted" each step.
- Healthy: Below 0.2 (20%).
- Red flag: Above 0.5 → half the batch provides no gradient. Above 0.8 → training is stalled.
- Fix: Increase G, adjust grader sensitivity, mix easy/hard prompts.

### Stability Metrics

**`loss`** — Clipped surrogate policy loss (the GRPO objective).
- **What it is**: The mathematical objective being minimized. Unlike SFT loss (where lower = better), GRPO loss starts near 0 and rises slightly as the model starts learning. It measures how much the current policy disagrees with the generation policy, weighted by advantages. A small positive loss means the model is making controlled updates.
- Healthy: 0.01-0.1. Loss starts near 0 (on-policy) and rises slightly as policy diverges from generation distribution.
- Red flag: Stuck at 0 (zero advantages), spikes sharply (instability), goes negative (numerical issues).
- Note: This is NOT like cross-entropy loss — lower is not always better. Moderate loss = active learning.

**`kl`** — KL divergence from the reference (base) model.
- **What it is**: How different has the model become from where it started? KL measures the policy divergence from the base model. In GRPO, some divergence is **expected and necessary** — the model must change to learn new behaviors.
- **⚠️ IMPORTANT: KL is NOT the primary constraint in GRPO.** DAPO and TRL both default to `beta=0` (no KL penalty). The **clipping mechanism** (epsilon) serves as the trust region constraint instead. High KL alone does NOT mean training is failing — check reward trend, clipping ratio, and output quality instead.
- **When KL matters**: Only when `beta > 0` (KL penalty is active). With beta=0, KL is informational only.
- Healthy: Varies by setup. With beta>0: below 1.0. **With beta=0: values in billions or trillions are normal** — do NOT treat high absolute KL as an anomaly.
- **Monitor thresholds**: beta>0: warn >5.0, critical >10.0. **beta=0: skip absolute thresholds entirely.** Only monitor the KL *trend* relative to reward trend.
- Warning: KL **rising while reward stagnates** → possible reward hacking. KL rising with reward improving → normal learning.
- Critical: KL divergence + degenerate outputs (repetitive, verbose padding, format exploitation) → reward hacking.
- Fix: If reward hacking suspected → enable/increase beta, add quality-focused grader criteria, inspect outputs manually. Do NOT reduce LR just because KL is high — that slows learning without fixing the root cause.
- (Reference: DeepSeekMath §3.2 uses beta=0.04; DAPO removes KL entirely (beta=0); TRL defaults to beta=0.0; Dr. GRPO does not use KL penalty)

**`grad_norm`** — L2 norm of all gradients before clipping.
- **What it is**: How aggressively is the model trying to update its weights this step? Think of gradients as the "force" pushing the model in a direction. Large forces = big changes = potential instability. Gradient clipping caps this force, but if the pre-clip norm is huge, the model is being pushed hard. NaN means the math broke (division by zero, often from empty batches).
- Healthy: 0.5-2.0 with default clipping of 1.0.
- Red flag: NaN (catastrophic — often from zero-length truncated completions), 10x spikes (bad batch).
- Fix: Reduce LR, tighten gradient clipping. If NaN, fix truncation issue first.

**`learning_rate`** — Current learning rate from the schedule.
- **What it is**: How big of a step does the optimizer take each update? Higher = faster but riskier. GRPO needs much smaller learning rates than SFT because the reward signal is noisier. Our default (1e-6) follows DeepSeekMath, DAPO, and Dr. GRPO consensus.
- Typical: 1e-6 to 5e-6 for large models, up to 1e-5 for small models.
- If training is unstable → halve LR. If too slow → increase 2-3x.

### Completion Metrics

**`completions/clipped_ratio`** — Fraction of completions that hit max_output_tokens.
- **What it is**: What percentage of the model's responses were cut off before finishing? When a response hits the token limit (default 512), it's forcibly truncated — like being cut off mid-sentence. Your grader then scores an incomplete answer, which gives noisy/wrong rewards. At 100% clipping, NO response ever finishes naturally, and training gets no useful signal about when to stop.
- Healthy: Below 0.1 (10%).
- Warning: 0.1-0.5.
- Critical: Above 0.5 — majority of completions are incomplete. At 1.0 — training is broken.
- Fix: Increase max_output_tokens. But only if the task genuinely needs longer outputs (not if model is babbling).

**`completions/mean_length`** — Average completion length in tokens.
- Should be well below max_output_tokens.
- If equal to max → all completions are truncated.
- If collapsing toward 0 → model may be gaming a length-insensitive reward.

**`completions/max_length`** / **`completions/min_length`** — Longest and shortest completions.
- If min = max = max_output_tokens → uniform truncation (critical).
- Wide spread (min << max) is normal and healthy.

**`completions/mean_terminated_length`** — Average length of naturally-ended completions only.
- **What it is**: Of the responses that DID finish naturally (produced an end-of-sequence token), how long were they on average? This tells you the model's "natural" response length when it's allowed to finish. If this is 0 or NaN, no responses ever finished — they were all truncated.
- If 0 or NaN → no completions end naturally (100% truncation).
- Should be meaningfully less than max_output_tokens.
- If growing over training → model is learning longer reasoning chains (expected for reasoning tasks).

### Throughput Metrics

**`num_tokens`** — Total tokens processed per step (prompts + completions).
- **What it is**: How many tokens did the GPU process this step? This is your throughput indicator. Sudden drops mean something is wrong (batches being skipped, completions getting shorter). Useful for estimating training cost and time-to-completion.
- Should increase steadily. Drops indicate skipped batches or shorter completions.

**`row_indices_count`** — Number of unique training records sampled per step.
- **What it is**: How many different training questions were used in this batch? GRPO samples records from your dataset each step. If some records are too long, they get filtered out, reducing the effective batch size and making gradients noisier.
- Should match configured batch size.
- If consistently low → prompts may be too long (filtered by overlong_filter).

**`completion_length`** — Average completion length across all candidates.
- **What it is**: Average token count of model responses in the batch. This is the same as `completions/mean_length` but reported from a throughput perspective. Tracks whether responses are getting longer/shorter over training.
- Equivalent to `completions/mean_length`. Use for throughput analysis.

### Clip Ratio Metrics (PPO Trust Region)

**`clip_ratio/region_mean`** — Overall fraction of tokens where the importance ratio was clipped.
- **What it is**: GRPO uses a "trust region" — it limits how much the policy can change in one step. The importance ratio measures how different the new policy is from the old one. When it exceeds the bounds (1±epsilon), it gets clipped. This metric tells you how often clipping occurs. Too much clipping = the model is trying to change faster than the trust region allows. Too little = the model is barely changing. (Reference: DAPO §3.2, TRL docs on epsilon parameters)
- Healthy: 0.1-0.3 (moderate, trust-region updates).
- High (>0.5): Policy is trying to make too-large updates. Reduce LR or increase epsilon.
- Near 0: Policy barely changing. Increase LR.

**`clip_ratio/high_mean`** / **`clip_ratio/low_mean`** — Asymmetric clipping breakdown.
- **What it is**: Breaks down clipping into two directions. `high_mean` = how often the model is trying to INCREASE a token's probability beyond the bound. `low_mean` = how often it's trying to DECREASE beyond the bound. If `high_mean` dominates, the model is aggressively reinforcing certain responses. DAPO introduced asymmetric bounds (epsilon_low=0.2, epsilon_high=0.28) to balance exploration and exploitation.
- high_mean >> low_mean → model is aggressively upweighting certain tokens.
- Consider DAPO-style asymmetric clipping (epsilon_low=0.2, epsilon_high=0.28).

### Progress Metrics

**`epoch`** — Current training epoch as a fraction (0.0 to num_epochs).
- **What it is**: How many times has the model seen the full dataset? `epoch=0.5` means halfway through the first pass. Unlike SFT (where 1-3 epochs is typical because the same responses are reused), GRPO generates **fresh responses each epoch** — the model never sees the same output twice. This means more epochs don't cause memorization the way SFT does. Typical GRPO training uses 5-15 epochs for datasets under 200 records.
- (Reference: DeepSeekMath uses multiple passes over the same prompts. DAPO trains for extended periods. Our default is 8 epochs — see `rft-grpo-training-explained.md` §Epochs)

**`global_step`** — Current training step number.
- **What it is**: How many gradient updates have been applied. Combined with `max_steps`, tells you how far along training is. Each step processes one batch of prompts × G completions.

**`max_steps`** — Total number of training steps planned.
- **What it is**: Set by the training config (derived from dataset size, batch size, and epochs). Used to compute progress percentage: `global_step / max_steps`.

### Per-Reward-Function Metrics

**`rewards/vllora_reward_fn/mean`** — Mean reward from the vLLora grader reward function.
- **What it is**: When using a single grader (our default), this equals `reward`. In multi-reward setups, each reward function reports separately. This is the raw score from your `grader.js` before any weighting or aggregation.

**`rewards/vllora_reward_fn/std`** — Standard deviation of the vLLora grader reward.
- **What it is**: Same as `reward_std` for single-grader setups. In multi-reward setups, tracks variance per reward function independently.

### Additional Completion Metrics

**`completions/max_terminated_length`** — Length of the longest naturally-ended completion.
- **What it is**: The longest response that DID produce an end-of-sequence token (wasn't truncated). If this is close to `max_output_tokens`, even the best-case completions barely fit — you need more room.

**`completions/min_terminated_length`** — Length of the shortest naturally-ended completion.
- **What it is**: The shortest response that ended naturally. If very short (< 10 tokens), some prompts may be getting trivial or empty answers — check if your grader penalizes brevity.

### Additional Clip Ratio Metrics

**`clip_ratio/high_max`** — Maximum high-side clip ratio across the batch.
- **What it is**: The worst-case token in the batch — how aggressively was the model trying to increase one token's probability? Occasional spikes are normal; persistent high values suggest aggressive over-optimization on specific tokens.

**`clip_ratio/low_min`** — Minimum low-side clip ratio across the batch.
- **What it is**: The most aggressive probability decrease the model attempted. Together with `high_max`, these show the extremes of policy updates.

### Batch Composition

**`row_indices`** — Array of training record indices sampled in this batch.
- **What it is**: Which records from your dataset were used this step. Each record index appears G times (once per generated completion) — e.g., `[52,52,52,52,52,52,52,52,69,69,69,69,69,69,69,69]` means records #52 and #69 were used with G=8 completions each (batch_size=2). This is normal GRPO behavior, NOT duplicate sampling. Across steps, tracks whether all records get fair coverage.

## Common Failure Modes

### 100% Completion Clipping
All completions are exactly max_output_tokens long. The model never produces EOS.

**Causes**: max_output_tokens too low for the task, model never learned EOS during SFT, chat template misconfigured.

**Consequences**: Rewards computed on incomplete outputs (noisy/wrong). If mask_truncated_completions=True, all masks become zero → NaN gradients. Training produces no useful signal.

**Fix**: Increase max_output_tokens to 1024-2048. Verify chat template. Consider SFT warm-up before GRPO.

### Reward Hacking
Reward increases while output quality degrades. The model exploits grader weaknesses instead of genuinely improving.

**Signs**: `train_reward_mean` climbing while `valid_reward_mean` stagnates or diverges + outputs become repetitive, verbose, or format-exploiting. KL may be high but KL alone is NOT diagnostic.

**Concrete examples** (from OpenAI RFT and research):
- Synonym/verbosity padding: model adds extra correct-sounding terms to boost similarity scores
- Format exploitation: model learns output formatting tricks that score well without substance
- Length exploitation: model produces increasingly verbose outputs to game length-correlated rewards

**Detection**: Compare train vs validation reward trends (requires a validation set — see Step 7a-iii). If `train_reward` rises 20%+ above `valid_reward`, reward hacking is likely.

**Fix**: Bounded rewards (0-1), add quality-focused grader criteria (penalize verbosity, repetition), enable/increase KL penalty (beta), manual output inspection, select checkpoint by `valid_reward_mean`.

### No Learning Signal
Reward is flat, loss is near zero.

**Signs**: frac_reward_zero_std > 0.8, reward_std ≈ 0, loss ≈ 0.

**Fix**: Check grader provides gradient (not all-or-nothing). Increase G. Mix easy/hard prompts. Consider SFT warm-up.

## When to Iterate

After each eval + training cycle, check:

1. **Pass rate < 80%?** → Iterate on grader criteria or data quality
2. **train_reward rising but valid_reward flat?** → Reward hacking — improve grader quality, add stricter criteria
3. **clipped_ratio > 0.3?** → Increase max_output_tokens (but watch cost: 8 completions × more tokens)
4. **frac_reward_zero_std > 0.5?** → Grader not discriminating — add partial credit, increase G
5. **Reward plateaued for >50% of steps?** → Change approach (different model, more data, different grader)
6. **High KL with healthy reward trend?** → Normal for GRPO (beta=0 default). Only act if outputs degenerate

Max 5 iterations before escalating (change base model or rethink approach).

## Sources & References

The metric ranges, red flags, and recommendations in this guide are derived from:

### Papers
- **DeepSeekMath** (Shao et al., 2024) — Introduced GRPO. Uses G=64, LR=1e-6, KL penalty via beta. [arXiv:2402.03300](https://arxiv.org/abs/2402.03300)
- **DAPO** (Yu et al., 2025) — Open-source GRPO at scale. Asymmetric clipping (epsilon_low=0.2, epsilon_high=0.28), no KL penalty (beta=0), overlong filtering. [arXiv:2503.14476](https://arxiv.org/abs/2503.14476)
- **Dr. GRPO** (Liu et al., 2025) — Removes length and std bias from GRPO. G=8, shows frac_reward_zero_std impact. [arXiv:2503.20783](https://arxiv.org/abs/2503.20783)
- **GTPO** (Zhang et al., 2025) — Stabilizing GRPO via gradient and entropy control. Entropy monitoring catches collapse earlier than KL. [arXiv:2508.03772](https://arxiv.org/abs/2508.03772)
- **GRPO Effective Loss** (Gu et al., 2025) — Analysis of GRPO loss dynamics and success amplification bias. [arXiv:2503.06639](https://arxiv.org/abs/2503.06639)

### Implementation Docs
- **TRL GRPOTrainer** — Hugging Face reference implementation. Metric definitions, default hyperparameters. [docs.huggingface.co/trl/grpo_trainer](https://huggingface.co/docs/trl/main/en/grpo_trainer)
- **Unsloth GRPO** — Advanced RL documentation, known issues (NaN grad_norm from truncation, chat template bugs). [unsloth.ai/docs](https://docs.unsloth.ai/basics/reward-model-and-rlhf-grpo-support)
- **OpenAI RFT Guide** — Reinforcement fine-tuning best practices, grader design, evaluation strategy. [platform.openai.com/docs/guides/reinforcement-fine-tuning](https://platform.openai.com/docs/guides/reinforcement-fine-tuning)

### Analysis & Tutorials
- **GRPO Illustrated** (Wolfe, 2025) — Detailed walkthrough of GRPO mechanics, clipping, advantage normalization. [cameronrwolfe.substack.com](https://cameronrwolfe.substack.com/p/grpo)
- **GRPO++ Tricks** (Wolfe, 2025) — Practical improvements: overlong filtering, token-level KL, entropy bonuses. [cameronrwolfe.substack.com](https://cameronrwolfe.substack.com/p/grpo-tricks)
- **Reward Hacking in GRPO** (Mukherjee, 2025) — Concrete examples of reward hacking with GRPO, detection, mitigation. [ishanjmukherjee.github.io](https://ishanjmukherjee.github.io/reward-hacking-grpo)
- **Reward Hacking in RL** (Weng, 2024) — Comprehensive survey of reward hacking phenomena. [lilianweng.github.io](https://lilianweng.github.io/posts/2024-11-28-reward-hacking/)
- **From PPO to GRPO to DAPO** (SoftmaxData, 2025) — Parameter-by-parameter explanation of GRPO training. [softmaxdata.com](https://softmaxdata.com/blog/from-ppo-to-grpo-to-dapo-understanding-rl-for-llms-and-every-training-parameter-explained/)
