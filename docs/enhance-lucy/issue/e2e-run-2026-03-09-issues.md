# E2E Run Issues & Enhancements (2026-03-09)

Issues and UX improvements found during E2E testing with mock server.

---

## Issue 1: `generate_topics` called again during plan execution (KNOWN)

**Severity:** Medium (wastes ~11s)
**Status:** Known issue from previous run — see `e2e-fresh-run-issues.md` Issue 1
**Where:** Agent instruction not being followed by LLM

Topics are generated during planning (stored in `plan.proposed_topics`) but NOT applied to `dataset.topicHierarchy`. During execution, `get_dataset_state` returns `leaf_count: 0`, so LLM calls `generate_topics` again instead of just `apply_topic_hierarchy`.

---

## Issue 2: Mock eval returned "Uncategorized 42.0%" (FIXED)

**Severity:** High (eval analysis showed wrong topic distribution)
**Status:** Fixed

**Problem:**
Mock eval response used generic row IDs (`row-0`, `row-1`, ...) that didn't match actual IndexedDB record UUIDs. `get-evaluation-details.ts` joins eval results with records by ID — unmatched rows fell through to `'Uncategorized'`.

**Fix:**
- Mock server now parses real row IDs from uploaded JSONL (`parseRowIdsFromJsonl`)
- `makeCompletedEvalResponse` uses real IDs in eval results
- `resolveEvalPollResponse` forwards `rowIds` to response builder

**Files changed:**
- `src/test/mock-server/server.ts`
- `src/test/msw/scenarios/eval-scenario-bridge.ts`

---

## Issue 3: Mock data generation was slow (~4min instead of ~700ms) (FIXED)

**Severity:** High (blocked fast E2E testing)
**Status:** Fixed

**Problem:**
The `localStorage` mock check was only wired into `stepToolHandlers` map, but tools are dispatched via the tool's own `.handler` property (set on `generateInitialDataTool`). The `execute-plan.ts` also imported `generateInitialDataHandler` directly.

**Fix:**
- Created `maybeUseMockHandler()` in `mock-generate-initial-data.ts` (single source of truth)
- Updated all 3 code paths to use it:
  1. `generateInitialDataTool.handler` (tool definition)
  2. `stepToolHandlers['generate_initial_data']` (handler map)
  3. `execute-plan.ts` `callGenerateInitialData()` wrapper

**Files changed:**
- `src/test/mock-data/mock-generate-initial-data.ts`
- `src/lib/distri-finetune-tools/steps/generate-initial-data.ts`
- `src/lib/distri-finetune-tools/steps/execute-plan.ts`
- `src/lib/distri-finetune-tools/steps/index.ts`

---

## Issue 4: Training Analysis shows "uncategorized" topic instead of real topics

**Severity:** Medium (training analysis card shows wrong topic breakdown)
**Status:** Open

**Problem:**
Same root cause as Issue 2 but for training results. The mock training response uses generic row IDs that don't match actual IndexedDB record UUIDs. `analyze-training.ts` joins training results with records by ID — unmatched rows appear as `'uncategorized'`.

**Where found:** TC-TRN-002 (Overfitting scenario). Training Analysis card shows single "uncategorized" topic instead of the 12 real topics across 3 categories.

**Expected fix:**
Apply the same `parseRowIdsFromJsonl` pattern from Issue 2's fix to the mock training response builder. The training poll endpoint needs to forward real row IDs just like the eval poll endpoint now does.

**Files likely affected:**
- `src/test/mock-server/server.ts` (training poll response)
- `src/test/msw/scenarios/eval-scenario-bridge.ts` (training response builder if separate)

---

## Enhancement 1: Combined Eval + Training Analysis Card

**Priority:** Medium
**Status:** Proposed

**Problem:**
After the full pipeline completes (eval + training), the user sees separate Eval Analysis and Training Analysis cards. They must ask Lucy to analyze each one separately. Normal users expect a single summary answering "How did it go? What should I do next?"

**Current flow:**
1. Pipeline completes → user asks "analyze eval" → Eval Analysis card
2. User asks "analyze training" → Training Analysis card
3. No combined "here's the full picture" view

**Proposed flow:**
1. After eval completes → show Eval Analysis card (as today)
2. After training completes → auto-trigger combined summary that shows:
   - Eval baseline score → Training improvement → Delta
   - Per-topic comparison (eval vs post-training)
   - Single "Next Step" recommendation (deploy / iterate / investigate)
3. Keep individual cards available for deep-dive

**Implementation options:**
- Option A: New `analyze_pipeline` tool that calls both `analyze_evaluation` + `analyze_training` and merges results into a single renderer
- Option B: Modify agent instructions to auto-call both tools after training completes and present a combined text summary
- Option C: New `LucyCombinedAnalysisRenderer` that takes both eval + training results

**Recommendation:** Option A — cleanest separation, single tool call, dedicated renderer.

---

## Enhancement 2: Auto-trigger analysis after job completion

**Priority:** Low
**Status:** ✅ Already Implemented

~~Currently Lucy doesn't automatically analyze eval/training results — the user must ask. Consider auto-triggering analysis via the `vllora_evaluation_job_done` / `vllora_training_job_done` events that already fire when polling detects completion.~~

**Implementation (found during audit 2026-03-09):**

Auto-trigger is already implemented in `LucySidebar.tsx` (lines 352-380):

1. **Eval completion** → `vllora_dry_run_job_completed` event → auto-emits `vllora_lucy_prompt` asking Lucy to analyze results (handles both success and FAILED verdicts)
2. **Training completion** → `vllora_finetune_job_completed` event → auto-emits `vllora_lucy_prompt` asking Lucy to analyze training results

Events emitted from:
- `dry-run-polling-manager.ts` (eval polling detects completion → emits event)
- `FinetuneJobsContext.tsx` (training job status transition → emits event)

**E2E test:** TC-CC-008 covers this flow.
