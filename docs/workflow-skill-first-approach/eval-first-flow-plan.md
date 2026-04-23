# Implementation Plan: Eval-First Flow

**Goal:** Restructure the finetune skill pipeline from "eval + training in parallel" to "eval iterations first, training only after readiness gate passes."

**Why:** First training always wastes GPU time. Data has dead-weight records, grader thresholds are untested, max_tokens is often wrong. Eval is fast (~45 min) vs training is hours and costs money. Run cheap eval iterations to fix problems before committing to expensive training.

```
Current:  Eval + Training (parallel) → Analyze → Iterate → Eval + Training → ...
Proposed: Eval → Analyze → Fix → Eval → ... (readiness gate passes) → Train → Analyze → Iterate
```

---

## Phase 1: SKILL.md — Pipeline Restructure

The main change. Current Steps 7-9 assume parallel eval+training. Need to decouple them.

### Step 7: Evaluation (eval-only, no training)

**Current (lines 441-620):** "Start Evaluation & Training (Parallel)" — creates both jobs immediately.

**New:**
- Step 7a: Pre-training validation (RFT-specific checks) — **keep as-is**
- Step 7b: Create eval job only — remove `create-training` from this step
- Step 7c: Poll eval — keep foreground polling
- Step 7d: **NEW — Pre-Training Readiness Gate**

Key line to change: line 443 "Always start both eval AND training together" → "Start eval first. Training starts only after readiness gate passes."

Also update the comparison table (lines 445-449) to show the two-phase approach:

```
| Phase | What runs | What it answers | Duration |
|-------|-----------|----------------|----------|
| Eval iterations | Base model + data + grader | Is my data good? Grader fair? Score spread? | ~45 min/iteration |
| Training | Finetuned model | Is the model learning? Hyperparams right? | Hours |
```

### Step 7d: Pre-Training Readiness Gate (NEW)

Insert after eval completes. Uses criteria from `iteration-strategy.md` §5 and §5b:

```
After eval completes, compute readiness metrics:

| Check | Pass | Fail → Action |
|-------|------|---------------|
| Score std > 0.15 | ✅ | Grader not differentiating — add criteria, re-eval |
| Fraction scores > 0.9 < 50% | ✅ | Grader too lenient — tighten criteria, re-eval |
| Fraction exact 0/1 < 30% | ✅ | Too binary — add partial credit bands, re-eval |
| Dead-weight records (score=0) < 5% | ✅ | Remove + regenerate dead-weight, re-eval |
| Average score > 0.5 | ✅ | Data too hard or grader too strict — adjust, re-eval |
| Pass rate (>0.7) > 60% | ✅ | Data/grader quality insufficient — iterate |

Decision:
- ALL pass → READY FOR TRAINING → proceed to Step 7e
- Any fail → NOT READY → apply fixes (Step 9a), return to Step 7b (re-eval)
- Max 5 eval-only iterations before escalating to user
```

**Implementation:** Add a `finetune.py readiness-check` command that takes eval results and outputs PASS/FAIL with per-criterion details. The agent reads the output and decides.

### Step 7e: Start Training (conditional)

Only reached if readiness gate passes. This is the current "create training job + spawn monitor" logic, extracted from the old Step 7b.

```
Readiness gate passed → Now start training:
1. Create training job (create-training)
2. Spawn training-monitor subagent
3. Poll training in foreground OR wait for monitor report
```

### Step 8: Analyze Results

**Current:** "Analyze each job's results as soon as they arrive — don't wait for both."

**New:** Distinguish two analysis modes:

```
Step 8a: Eval-only analysis (during eval iterations, before training)
  - Score distribution, per-topic breakdown, dead-weight detection
  - Feeds into readiness gate decision
  - Does NOT analyze training metrics (no training yet)

Step 8b: Post-training analysis (after training completes)
  - Training metrics: reward trend, KL, clipping, grad norms
  - Epoch-level eval scores
  - Comparison: did training improve over base model eval?
```

### Step 9: Iterate

**Current:** "Apply fixes and start new jobs" — always creates both eval + training.

**New:** Three iteration loops:

```
Step 9a: Eval-only iteration (readiness gate failed)
  - Fix data/grader based on eval findings
  - Return to Step 7b (re-eval)
  - Does NOT create training job
  - Fast cycle: ~45 min per iteration

Step 9b: Post-training iteration (training completed but results unsatisfactory)
  - Adjust hyperparams, fix grader, regenerate data
  - Return to Step 7b (re-eval with new data)
  - May skip straight to Step 7e (training) if only hyperparams changed

Step 9c: Topic-level iteration (stalled topics after 2+ evals)
  - Per-topic diagnosis via diagnose-grader (DEAD_WEIGHT, AMBIGUOUS, HARD_BUT_LEARNING)
  - Split/remove/regenerate topics, re-upload, re-eval
  - Only triggered when topics show no improvement for 2+ consecutive evals
  - HARD_BUT_LEARNING topics (low avg, some variance) are kept — best GRPO signal
```

---

## Phase 2: New Script — `finetune.py readiness-check`

Add a new subcommand that formalizes the readiness gate:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py readiness-check \
  --eval-file evaluations/eval-001.json \
  --thresholds '{"min_score_std": 0.15, "max_high_score_frac": 0.5, "max_binary_frac": 0.3, "max_dead_weight_frac": 0.05, "min_avg_score": 0.5, "min_pass_rate": 0.6}'
```

Output:
```json
{
  "verdict": "FAIL",
  "checks": {
    "score_std": {"value": 0.08, "threshold": 0.15, "pass": false, "fix": "Grader not differentiating — add more criteria or partial credit bands"},
    "high_score_frac": {"value": 0.12, "threshold": 0.50, "pass": true},
    "binary_frac": {"value": 0.45, "threshold": 0.30, "pass": false, "fix": "Too many binary scores — add 0.2-0.8 partial credit in grader"},
    "dead_weight_frac": {"value": 0.03, "threshold": 0.05, "pass": true},
    "avg_score": {"value": 0.52, "threshold": 0.50, "pass": true},
    "pass_rate": {"value": 0.65, "threshold": 0.60, "pass": true}
  },
  "failed_checks": ["score_std", "binary_frac"],
  "recommendation": "Fix grader before training: add partial credit bands (0.2, 0.4, 0.6, 0.8) and more differentiating criteria."
}
```

Exit codes: 0 = PASS, 1 = FAIL, 2 = WARN (marginal — some checks borderline).

---

## Phase 3: Reference Docs Updates

### `reference/iteration-strategy.md`

**Section to add/update:** "The Eval-First Iteration Loop"

```
## Eval-First Iteration Loop

The pipeline runs in two phases:

Phase 1 — Eval Iterations (fast, cheap):
  Eval → Readiness Gate → [FAIL] → Fix → Re-eval → Readiness Gate → [PASS] →

Phase 2 — Training (slow, expensive):
  Train → Analyze → [good] → Deploy
                   → [bad]  → Fix → Back to Phase 1

Max 5 eval-only iterations (Phase 1) before requiring training.
Max 3 training iterations (Phase 2) before escalating.
```

**Update §5 GO/NO-GO:** Rename to "Readiness Gate" and reference the new `readiness-check` command.

### `reference/analysis-strategy.md`

**Section to add:** "Part 2a-i: Pre-Training Readiness Gate"

Move the readiness criteria here with clear thresholds, matching the `readiness-check` command output format. Reference the command so agents use it instead of manually computing.

---

## Phase 4: Checkpoint Updates

Add new checkpoint steps to track the eval-first flow:

```
Current steps: create-workflow, extract, topics, relations, generate-data, grader, validate, eval, training, analyze

New steps:
  create-workflow → extract → topics → relations → generate-data → grader → validate
  → eval-1 → readiness-check-1 (FAIL) → fix-1 → eval-2 → readiness-check-2 (PASS)
  → training-1 → analyze-1
```

Update `checkpoint.py` to track:
- `eval-N` (which eval iteration)
- `readiness-check-N` with result (PASS/FAIL/WARN)
- `training-ready` (boolean — set when readiness gate passes)

---

## Phase 5: SKILL.md Resume Logic

Update the resume scenarios table:

| State found | What happened | Action |
|-------------|---------------|--------|
| Eval completed, no readiness check | Crashed before readiness gate | Run `readiness-check`, decide |
| Readiness check FAIL, no fixes applied | Crashed during fix step | Read readiness output, apply fixes |
| Readiness check PASS, no training job | Crashed before training start | Create training job |
| Training running | Normal — poll it | Poll existing job |
| Training completed, no analysis | Crashed before analysis | Run `analyze_training.py` |

Update `finetune.py status` to show readiness gate state:

```
── Readiness Gate ──
  Eval-1: avg=0.35, std=0.08, dead_weight=4.8% → FAIL (std too low)
  Eval-2: avg=0.52, std=0.18, dead_weight=1.2% → PASS
  Training: READY (eval-2 passed all checks)
```

---

## Files to Modify

| File | Scope | Effort |
|------|-------|--------|
| `finetune-skill/SKILL.md` | Restructure Steps 7-9, add readiness gate, update resume logic | Large (2-3h) |
| `finetune-skill/scripts/finetune.py` | Add `readiness-check` command | Medium (1h) |
| `finetune-skill/scripts/checkpoint.py` | Add eval-N and readiness-check-N steps | Small (30m) |
| `finetune-skill/reference/iteration-strategy.md` | Add eval-first loop, rename GO/NO-GO to readiness gate | Small (30m) |
| `finetune-skill/reference/analysis-strategy.md` | Add readiness gate section | Small (30m) |
| `agents/training-monitor.md` | No changes needed | — |

**Total estimated effort: ~5 hours**

---

## Execution Order

1. Add `readiness-check` to `finetune.py` — self-contained, testable independently
2. Rewrite SKILL.md Steps 7-9 — the core change
3. Update checkpoint.py — support new step names
4. Update reference docs — iteration-strategy.md and analysis-strategy.md
5. Update `finetune.py status` — show readiness gate state
6. Test: run on financial-doc-analyzer to verify eval-first loop works

---

## Test Plan

Use the existing `/Users/anhthuduong/Documents/GitHub/test-samples/financial-doc-analyzer` folder:

1. **Clean state test:** Wipe training-jobs/ and evaluations/. Run agent with "continue from where you left off." It should:
   - Skip Steps 1-6 (checkpoint says done)
   - Run eval (Step 7b)
   - Run readiness-check (Step 7d) — should FAIL (base model scores ~0.35)
   - Fix dead-weight records, adjust grader (Step 9a)
   - Re-eval (back to Step 7b)
   - Eventually pass readiness gate → THEN start training

2. **Resume test:** Kill agent mid-eval-iteration. Restart. Should pick up from where it was (checkpoint has eval-N step).

3. **UI alignment test:** Verify the UI shows the eval-first flow correctly — multiple eval runs before any training jobs appear.
