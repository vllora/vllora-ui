# E2E Run Issues & Enhancements (2026-03-10)

Issues and UX improvements found during full-pipeline E2E testing with mock server (port 2209).

**Test scenario**: Create fresh dataset → Lucy proposes plan → approve → topics + data generation → evaluation → training → Lucy analyzes → Accept & Apply × 3 iterations → navigate away and return → catch-up card.

---

## Issue 1: Score color inconsistency between progress bar and text (FIXED)

**Severity:** Medium (confusing visual — green text + amber bar for same score)
**Status:** Fixed
**Where:** `src/components/agent/lucy-agent/plan-render/LucyAnalyzeEvalRenderer.tsx`

**Problem:**
In the Evaluation Analysis card, `scoreBarColor()` and `scoreTextColor()` used different thresholds. Scores 0.60–0.69 showed green text but an amber progress bar.

Old thresholds:
- `scoreBarColor`: green ≥ 0.7, amber < 0.7 (4-tier with yellow)
- `scoreTextColor`: green ≥ 0.6, amber < 0.6

**Fix:**
Aligned both functions to use the same 3-tier thresholds matching `LucyCatchUpCard.scoreColor()`:

```
< 0.5    → red
0.5–0.64 → amber
≥ 0.65   → green
```

Also fixed reasoning bullet color (line 290) which was binary (red/green, skipping amber) — now uses the same 3-tier logic.

**Files changed:**
- `src/components/agent/lucy-agent/plan-render/LucyAnalyzeEvalRenderer.tsx` — `scoreBarColor()`, `scoreTextColor()`, reasoning bullet ternary

---

## Issue 2: Catch-up card shows "TRAINING IN PROGRESS" when training is completed (FIXED)

**Severity:** High (misleading status — user sees completed job in explorer but "in progress" in catch-up)
**Status:** Fixed
**Where:** `src/test/mock-server/server.ts`

**Problem:**
After navigating away and returning to a dataset where training had completed, the catch-up card showed "TRAINING IN PROGRESS" even though the explorer showed the job as completed (green ✅).

**Root cause:**
JobId mismatch between workflow storage and mock server poll tracking:

1. Mock server creates job: `id = 'mock-ft-001'`, `provider_job_id = 'prov-mock-ft-001'`
2. Workflow stores: `jobId = job.provider_job_id || job.id` = `'prov-mock-ft-001'`
3. During execution, polling used `prov-mock-ft-001` → poll counter reached threshold → returned `'succeeded'`
4. On catch-up (fresh page load), `resolveTrainingStatus()` calls `getReinforcementJobStatus('prov-mock-ft-001')`
5. Mock server tracked polls under `'mock-ft-001'`, so polling with `'prov-mock-ft-001'` started a **fresh counter** at 1
6. Fresh counter never reached `trainingPollsBeforeComplete` → returned `'running'` instead of `'succeeded'`

**Fix:**
Added `providerJobIdMap` to the mock server that maps `provider_job_id → id`. When a training job is created, the mapping is registered. The status endpoint now resolves the incoming jobId through this map before tracking polls.

```typescript
const providerJobIdMap = new Map<string, string>();

function resolveJobId(rawJobId: string): string {
  return providerJobIdMap.get(rawJobId) ?? rawJobId;
}
```

**Files changed:**
- `src/test/mock-server/server.ts` — added `providerJobIdMap`, `resolveJobId()`, map registration in job creation, map usage in status endpoint, map cleanup in `resetMockData()`

**Note:** This is a mock server bug, not a production bug. In the real backend, the status endpoint likely accepts `provider_job_id` as a valid lookup key. However, this pattern (storing `provider_job_id` but polling with it) should be verified against the real backend too.

---

## Issue 3: Cross-Model Insight shows "0.00 higher" when models are the same

**Severity:** Low (noisy / misleading when all evals use the same model)
**Status:** Open

**Problem:**
When all evaluation runs use the same rollout model (e.g., `gpt-4o-mini`), the Cross-Model Insight section shows:

> "gpt-4o-mini scores 0.00 higher than gpt-4o-mini"

This is meaningless — comparing a model to itself with zero delta.

**Where found:** Catch-up card after 3 eval iterations, all using `gpt-4o-mini`.

**Where:** `src/components/agent/lucy-agent/plan-render/LucyCatchUpCard.tsx` — `CrossModelInsight` component (lines 305-358)

**Expected behavior:**
- Suppress the Cross-Model Insight section when both entries have the same model name
- Or suppress when `absDiff === '0.00'` (zero delta)
- Only show when comparing genuinely different models (e.g., base vs fine-tuned, or two different base models)

**Suggested fix:**
Add early-return guard in `CrossModelInsight`:

```typescript
// Don't show when comparing same model with zero/negligible delta
if (base.model === compare.model && Math.abs(diff) < 0.01) return null;
```

---

## Issue 4: Per-topic table shows identical model name for each eval iteration

**Severity:** Medium (confusing — 3 rows all labeled "gpt-4o-mini" under each topic)
**Status:** Open

**Problem:**
In the catch-up card's Per-Topic section, each eval iteration is labeled with `j.rolloutModel ?? 'Eval ${i + 1}'`. When all evals use the same model (e.g., `gpt-4o-mini`), the table shows 3 identical rows under each topic:

```
Addition
  gpt-4o-mini  0.65
  gpt-4o-mini  0.67
  gpt-4o-mini  0.66
```

**Where:** `src/components/agent/lucy-agent/plan-render/LucyCatchUpCard.tsx` — `PerTopicSection` (line 381)

**Expected behavior:**
When multiple evals use the same rollout model, label them by iteration number instead:

```
Addition
  Eval 1  0.65
  Eval 2  0.67
  Eval 3  0.66
```

**Suggested fix:**
In the label logic (line 381), detect duplicate model names and fall back to iteration labels:

```typescript
// After building initial labels
const labelCounts = new Map<string, number>();
for (const m of models) {
  labelCounts.set(m.label, (labelCounts.get(m.label) ?? 0) + 1);
}
// If any label appears more than once, replace with "Eval N" / "FT N"
if ([...labelCounts.values()].some((c) => c > 1)) {
  let evalIdx = 1;
  let ftIdx = 1;
  for (const m of models) {
    m.label = m.tag === 'eval' ? `Eval ${evalIdx++}` : `FT ${ftIdx++}`;
  }
}
```

---

## Issue 5: No iteration counter visible during multi-iteration flow

**Severity:** Medium (user has no sense of "where am I" across iterations)
**Status:** Open

**Problem:**
After 3 Accept & Apply iterations, there's no visible indicator showing the current iteration number. The user can't tell if they're on iteration 1 or iteration 5. Each Evaluation Analysis card looks identical except for potentially different scores.

**Where found:** During the Accept & Apply × 3 test flow.

**Where:** `src/components/agent/lucy-agent/plan-render/LucyAnalyzeEvalRenderer.tsx` — `EvalCheckpointCard`

**Expected behavior:**
Show iteration number in the card header:

```
Evaluation Analysis — Iteration 3     [Warning]
```

**Suggested fix options:**
1. Add iteration number to the `analyze_evaluation` result (from `iteration_history`)
2. Show it in the `EvalCheckpointCard` header next to the health badge
3. Track iteration count in the component via a counter or from the tool result's `iteration_comparison.iteration_number`

---

## Issue 6: "vs Previous Iteration" comparison never shown

**Severity:** High (core iteration feature not working — stall detection, regression detection disabled)
**Status:** Open

**Problem:**
The `iteration_comparison` field in the Evaluation Analysis card is never populated, so:
- No "vs Iteration N" section is shown
- No "N iterations stalled" warning appears
- The escalation mechanism (which depends on stall_count) never triggers
- `next_action` defaults to `'iterate'` instead of potentially `'train'` or `'escalate'`

**Root cause:**
`analyze_evaluation` calls `getIterationHistoryHandler()` to get history, then `computeIterationComparison(history, ...)`. But `log_iteration` is never called by Lucy after each iteration, so the history is always empty → `computeIterationComparison` returns `null`.

The chain:
1. `analyze_evaluation.ts` line 596: `getIterationHistoryHandler({ dataset_id })` → returns `{ history: [] }` (empty)
2. `computeIterationComparison([], ...)` → returns `null` (line 256: `if (history.length === 0) return null`)
3. Result has no `iteration_comparison` field
4. `LucyAnalyzeEvalRenderer` skips the "vs Iteration" section (line 246: `{iteration_comparison && ...}`)

**Why `log_iteration` is never called:**
The agent definition (`vllora-finetune-agent.md`) doesn't instruct Lucy to call `log_iteration` after analyzing evaluation results. The `analyze_evaluation` tool is called reactively (via auto-trigger on eval completion), but there's no follow-up step to persist the iteration record.

**Expected fix:**
Two options:
1. **Agent instruction fix**: Add instruction to call `log_iteration` after each `analyze_evaluation` call, passing the scores, eval_id, and decision
2. **Auto-log in tool**: Make `analyze_evaluation` automatically call `logIterationHandler` at the end of its execution (self-contained, doesn't rely on LLM following instructions)

**Recommendation:** Option 2 is more reliable — tool self-logs, removing LLM dependency.

**Files likely affected:**
- `src/lib/distri-finetune-tools/steps/analyze-evaluation.ts` — auto-call `logIterationHandler` at the end
- Optionally: `gateway/agents/finetune/vllora-finetune-agent.md` — add instruction for belt-and-suspenders

---

## Issue 7: Lucy only shows Evaluation Analysis, never Training Analysis

**Severity:** High (user has no visibility into training results from Lucy)
**Status:** Open

**Problem:**
After the full pipeline completes (eval + training), Lucy only shows the Evaluation Analysis card. The training job completes (visible in the explorer view), but Lucy never automatically analyzes training results or shows a Training Analysis card.

**Where found:** During the full-pipeline E2E test. Training completed (mock), but Lucy only showed eval analysis.

**Root cause:**
The auto-trigger for training analysis (`vllora_finetune_job_completed` event in `LucySidebar.tsx`) fires and emits a prompt asking Lucy to analyze training results. However, in the mock testing scenario, the training job completes very quickly (mock instant response), and the auto-trigger may race with the ongoing eval analysis conversation. The prompt gets queued but may not be processed if Lucy is already mid-stream with eval analysis.

Additionally, with the mock server, training completes almost instantly after creation. The `vllora_finetune_job_completed` event fires, but if Lucy is already analyzing eval results (mid-stream), the prompt injection via `emitter.emit('vllora_lucy_prompt')` may not interrupt the current stream.

**Expected behavior:**
After training completes, Lucy should automatically analyze training results and show a Training Analysis card — or at minimum, a combined summary.

**Related:** See Enhancement 1 below (unified Eval + Training Analysis).

---

## Issue 8: Training Analysis shows "uncategorized" topics (EXISTING — from 2026-03-09)

**Severity:** Medium
**Status:** Open (see `e2e-run-2026-03-09-issues.md` Issue 4)

Same as Issue 4 from the previous run. Mock training response uses generic row IDs that don't match actual IndexedDB record UUIDs. Not re-listed in detail here — see previous issue file.

---

## Enhancement 1: Unified Eval + Training Results Analysis Component

**Priority:** High
**Status:** Proposed

**Problem:**
After the full pipeline completes, the user sees separate Evaluation Analysis and Training Analysis (if triggered at all — see Issue 7). Users expect a single holistic summary answering: "How did it go? What should I do next?"

**Current UX gap:**
1. Eval completes → Evaluation Analysis card (per-topic scores, health, recommendations)
2. Training completes → no automatic analysis (Issue 7), or separate Training Analysis card
3. No combined view showing: eval baseline → training improvement → deploy readiness

**Proposed unified component:**
A single `LucyResultsSummaryCard` that combines:

| Section | Content |
|---------|---------|
| Overall Status | Pipeline health badge (healthy/warning/critical) |
| Eval Summary | Mean score, per-topic breakdown, grader health |
| Training Summary | Epoch progression, best epoch, overfitting detection |
| Comparison | Eval baseline vs post-training score delta |
| Next Step | Single actionable recommendation (deploy / iterate / investigate) |
| Action Buttons | Context-aware (Deploy, Iterate, Retrain, etc.) |

**Implementation options:**
- **Option A**: New `analyze_pipeline` tool that calls both `analyze_evaluation` + `analyze_training` internally and returns a merged result → dedicated renderer
- **Option B**: Modify agent instructions to call both tools sequentially → present combined text summary
- **Option C**: New renderer component that accepts both eval + training results as props

**Recommendation:** Option A — single tool call, cleanest separation, dedicated renderer. The tool can be auto-triggered when both eval and training have completed.

---

## Enhancement 2: Catch-up card should show completed training details

**Priority:** Medium
**Status:** Open

**Problem:**
When returning to a dataset with completed training, the catch-up card correctly shows "TRAINING COMPLETED" (after Issue 2 fix), but doesn't show any training metrics — only the eval scores are visible. The user has no visibility into:
- How many epochs ran
- Best epoch score
- Whether overfitting was detected
- The fine-tuned model name

**Expected behavior:**
The catch-up card should include a Training Summary section when training has completed, showing key metrics (best epoch, final reward score, model name, epoch count).

**Where:** `src/hooks/useFineTuneAgentChat.ts` — `resolveTrainingStatus()` function and `src/components/agent/lucy-agent/plan-render/LucyCatchUpCard.tsx` — training status rendering.

---

## Enhancement 3: Evaluation Analysis should show iteration context

**Priority:** Medium
**Status:** Open

**Problem:**
Each Evaluation Analysis card is context-free — it doesn't know or show:
- Which iteration this is (1st, 2nd, 3rd?)
- What changes were made since the last iteration
- Whether scores improved, regressed, or stalled vs the previous run

This is directly related to Issue 5 (no iteration counter) and Issue 6 (`iteration_comparison` never populated). Fixing Issue 6 would automatically enable the "vs Iteration N" section in the card, which partially addresses this.

**Additional improvement beyond Issue 6:**
Show a brief "Changes applied" summary in the card, listing what was modified between iterations (e.g., "Updated grader criteria", "Regenerated 15 records for Subtraction topic"). This requires `log_iteration` to record `changes_made` text, which Lucy would need to provide.

---

## Enhancement 4: Auto-countdown for training should consider training completion

**Priority:** Low
**Status:** Open

**Problem:**
When eval scores are healthy and `next_action === 'train'`, the Evaluation Analysis card shows a `LucyAutoCountdownCard` that auto-proceeds to training after a countdown. However, if training has ALREADY completed (e.g., from a previous pipeline run), auto-proceeding to training again is wasteful.

**Where:** `src/components/agent/lucy-agent/plan-render/LucyAnalyzeEvalRenderer.tsx` line 312-316

**Expected behavior:**
Check whether a training job already exists for this dataset before showing the auto-countdown. If training already succeeded, show a "Training already completed" badge instead.

---

## Summary Table

| # | Issue/Enhancement | Severity | Status | Type |
|---|---|---|---|---|
| 1 | Score color inconsistency (bar vs text) | Medium | ✅ Fixed | Bug |
| 2 | Catch-up card shows "TRAINING IN PROGRESS" when completed | High | ✅ Fixed | Bug |
| 3 | Cross-Model Insight shows "0.00 higher" (same model) | Low | ✅ Fixed | Bug |
| 4 | Per-topic table shows duplicate model names | Medium | ✅ Fixed | Bug |
| 5 | No iteration counter visible | Medium | ✅ Fixed | UX gap |
| 6 | "vs Previous Iteration" comparison never shown | High | ✅ Fixed | Bug |
| 7 | Lucy never shows Training Analysis | High | ✅ Fixed | Bug |
| 8 | Training Analysis shows "uncategorized" topics | Medium | ✅ Fixed | Bug (existing) |
| E1 | Unified Eval + Training Results Analysis | High | ✅ Covered | Enhancement |
| E2 | Catch-up card should show training details | Medium | ✅ Covered | Enhancement |
| E3 | Eval Analysis should show iteration context | Medium | ✅ Covered | Enhancement |
| E4 | Auto-countdown should check existing training | Low | ✅ Fixed | Enhancement |
