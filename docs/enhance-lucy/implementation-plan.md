# Implementation Plan: Making Lucy Smarter

Prioritized by impact and effort. Organized around the two-loop architecture and session lifecycle.

**Key context:**
- Two score types: **Dry Run (Eval) Scores** (before training) and **Training (Finetune) Scores** (during/after training)
- Two loops: **Inner loop** (dataset iteration via dry run) and **Outer loop** (training iteration)
- Multi-model: dry run can target any model, enabling cross-model comparison
- Multi-grader: users can create multiple grader functions
- See [rft-decision-tree.md](./rft-decision-tree.md) for the full decision logic

---

## Implementation Status Summary (2026-03-09)

| Phase | Status | What's Done |
|-------|--------|-------------|
| **Phase 1: Give Lucy Eyes** | ✅ Done | 1A done (`get_evaluation_details`), 1B done (iteration state DB + `log_iteration`/`get_iteration_history` tools), 1C done (`reviewedByAgent` field, `mark_job_reviewed` tool, `buildCatchUpContext`, catch-up UI cards — only sidebar notification badge missing) |
| **Phase 2: Give Lucy Autonomy** | Partially done | 2A done (`analyze_evaluation` — 697-line tool with full RFT decision tree), 2B partial (inner/outer loop protocol in agent md, but `ExecutionStepId` not extended yet) |
| **Phase 3: Give Lucy Wisdom** | ✅ Done | 3A done (`analyze_training` tool), 3B comprehensive stall detection in `analyze_evaluation` (10 patterns, escalation ladder, RFT decision tree Steps A-F) |
| **Phase 4: Give Lucy Hands** | Partially done | `test_grader_sample` rewritten with real eval pipeline, `auto_test` on `configure_grader`. 4B not started |

### UI Renderers (2026-03-09)

All mockup scenarios now have corresponding UI card renderers:

| Component | Purpose | Score Format |
|-----------|---------|-------------|
| `LucyAnalyzeEvalRenderer` | Eval analysis card (health, per-topic, vs Iteration deltas, reasoning, proposed changes) | Raw decimal (0.45) |
| `LucyAnalyzeTrainingRenderer` | Training analysis card (epoch table, pipeline journey, pattern badges) | Raw decimal (0.45) |
| `LucyAutoCountdownCard` | Auto-continue countdown when eval healthy + train recommended | — |
| `LucyEvalProgressCard` | Live eval progress (67/132 records, partial score) | Raw decimal (0.45) |
| `LucyCompletedJobCard` | Welcome Back success card for catch-up | Raw decimal (0.45) |
| `LucyFailedJobCard` | Failed job catch-up card | — |
| `LucyPendingDecisionCard` | Pending iteration decision catch-up card | Raw decimal (0.45) |

Catch-up cards are shown as a landing view on fresh threads — each dataset session creates a new thread instead of restoring old messages.

### Auto-Trigger Analysis (2026-03-09)

Frontend event-driven auto-prompt when eval/training completes in background:
- `vllora_dry_run_job_completed` event emitted by `DryRunPollingManager` on job complete/fail
- `vllora_finetune_job_completed` event emitted by `FinetuneJobsContext` on status transition
- `LucySidebar` listens for both → emits `vllora_lucy_prompt` → Lucy auto-sends analysis message
- Documented in `event-emitter-guide.md` (events 13 & 14)

### Key Design Decision: Reactive Analysis (not blocking)

During E2E testing, we discovered that `analyze_evaluation` and `analyze_training` should **NOT** be plan execution steps. They are **reactive catch-up tools**:

- Evaluation runs 3-10+ minutes for 150 records
- Making analysis a blocking step means Lucy sits waiting, user sees no progress
- Skill Package and Training don't need eval results — they can proceed independently
- **Correct approach**: Fire-and-forget `run_evaluation`, continue pipeline, analyze reactively when user returns

See [issue/e2e-fresh-run-issues.md](./issue/e2e-fresh-run-issues.md) for all E2E testing issues found.

---

## Phase 1: Give Lucy Eyes (P0 — Enable Diagnosis)

### 1A. Evaluation Details Tool — DONE

**What**: New tool `get_evaluation_details` that returns per-record dry run scores, grader reasons, and per-topic breakdowns.
**Implemented in**: `src/lib/distri-finetune-tools/steps/get-evaluation-details.ts`

**Files to change**:
| File | Change |
|------|--------|
| `src/lib/distri-finetune-tools/steps/get-evaluation-details/` | New tool handler |
| `src/lib/distri-finetune-tools/index.ts` | Register tool |
| `src/lib/distri-finetune-tools/types.ts` | Add types |
| `src/services/finetune-api.ts` | Add API call to fetch detailed eval results |
| `gateway/agents/finetune/finetune-workflow-agent.md` | Add tool definition + usage instructions |

**Tool definition** (for agent md):
```
### get_evaluation_details
Retrieve detailed dry run evaluation results including per-record scores and grader reasoning.

Parameters:
- evaluation_id (string, required): The evaluation run ID
- sort_by (string, optional): "score_asc" | "score_desc" (default: "score_asc")
- limit (number, optional): Max records to return (default: 20)
- topic_filter (string, optional): Filter to specific topic

Returns per-topic dry run score breakdown and worst-scoring records with grader reasons.
Use this after a dry run evaluation completes to understand WHY records scored poorly.
```

**Effort**: ~2-3 hours
**Impact**: High — this alone enables the agent to diagnose problems using dry run scores

---

### 1B. Iteration History & State — DONE

**What**: Store iteration state and history in IndexedDB, with tools to retrieve and update.

**Implemented in**:
- `src/services/finetune-iteration-db.ts` (~220 lines) — Full CRUD: `getIterationState`, `saveIterationState`, `createIterationState`, `getOrCreateIterationState`, `addIterationEntry`, `getIterationHistory`, `updateIterationPhase`, `deleteIterationState`
- `src/lib/distri-finetune-tools/steps/iteration-history.ts` (~230 lines) — `log_iteration` and `get_iteration_history` tools
- IndexedDB schema v7 includes `iterationState` object store
- Both tools registered in `steps/index.ts` and listed in agent markdown files
- `IterationState` interface matches proposed schema (includes `innerLoop`, `outerLoop`, `history`, `phase` enum)

**Note**: Implementation uses direct IndexedDB access from tool handlers and `buildCatchUpContext`, NOT a dedicated React Context (the proposed `IterationStateContext` was skipped — direct access is simpler and sufficient).

---

### 1C. Session Catch-Up Protocol — MOSTLY DONE (missing sidebar notification badge only)

**What**: When user reopens a dataset, Lucy checks for unreviewed job results and catches up.

**Implemented**:
- `reviewedByAgent` and `reviewedByAgentAt` fields on `DryRunJob` type (`src/types/dry-run-job.ts`)
- `mark_job_reviewed` tool (`src/lib/distri-finetune-tools/steps/mark-job-reviewed.ts`) — sets `reviewedByAgent=true`
- `buildCatchUpContext()` in `src/hooks/useFineTuneAgentChat.ts` — on dataset open, checks for unreviewed completed/failed jobs and pending iteration proposals (`phase === 'awaiting_user'`), injects catch-up context into Lucy's first message
- Reactive catch-up instructions in agent markdown files
- Auto-trigger events (`vllora_dry_run_job_completed`, `vllora_finetune_job_completed`) — LucySidebar auto-sends Lucy a message when eval/training completes in background

**NOT yet implemented:**
- LucySidebar notification badge (visual indicator when unreviewed results exist)

---

## Phase 2: Give Lucy Autonomy (P1 — Enable Inner Loop)

### 2A. Post-Eval Analysis Step — DONE (reactive, not blocking)

**What**: After dry run eval, Lucy analyzes dry run scores using the decision tree (Steps A-F from [rft-decision-tree.md](./rft-decision-tree.md)).
**Implemented in**: `src/lib/distri-finetune-tools/steps/analyze-evaluation.ts` (~697 lines)

**Important**: This is a REACTIVE tool, not a plan execution step. It runs when the user returns after evaluation completes (catch-up flow), not as a blocking step during plan execution. See [issue/e2e-fresh-run-issues.md](./issue/e2e-fresh-run-issues.md) Issue 7 for why.

**Files to change**:
| File | Change |
|------|--------|
| `src/lib/distri-finetune-tools/steps/analyze-evaluation/` | New tool handler |
| `src/lib/distri-finetune-tools/index.ts` | Register tool |
| `gateway/agents/finetune/finetune-workflow-agent.md` | Add tool + decision framework from rft-decision-tree.md |

**Handler logic**:
```typescript
async function handleAnalyzeEvaluation(params) {
  const details = await getEvaluationDetails(params.evaluation_id)
  const history = await getIterationHistory(params.dataset_id)

  return {
    // Step A: Dry run score distribution
    distribution: {
      mean: details.summary.average_score,
      std: details.summary.std_deviation,
      verdict: classifyDryRunHealth(details.summary)  // 'healthy' | 'too_easy' | 'too_hard'
    },
    // Step C: Per-topic dry run analysis
    weakTopics: details.per_topic.filter(t => t.avg_score < 0.5),
    strongTopics: details.per_topic.filter(t => t.avg_score > 0.7),
    // Step D: Grader health
    graderHealth: assessGraderFromDryRun(details),
    // Step E: Cross-iteration dry run comparison
    deltaFromPrevious: computeDelta(history, details),
    stallDetected: detectStall(history),
    // Recommendations
    recommendations: generateRecommendations(details, history)
  }
}
```

**Effort**: ~4-6 hours
**Impact**: High — transforms Lucy from "execute plan" to "analyze and adapt"

---

### 2B. Re-Plan After Analysis (Inner Loop) — DONE

**What**: Allow the workflow agent to propose targeted changes after analyzing dry run results.

**Implemented**:
- Full inner/outer loop protocol in `finetune-workflow-agent.md`
- New `ExecutionStepId` types added to `execute-plan.ts`:
  - `'regenerate_topic'` — regenerates data for specific weak topics (reuses `generateInitialDataHandler` with `target_topics`)
  - `'adjust_grader'` — reconfigures evaluator with updated criteria
  - `'analyze'` — runs `analyzeEvaluationHandler` on most recent completed eval
  - `'post_training_eval'` — runs post-training evaluation (same as dry run, agent sets fine-tuned model)
- All 4 step executors added to `STEP_REGISTRY` and `STEP_ORDER`
- `buildCompletedStepDetails` updated with display text for new steps

---

## Phase 3: Give Lucy Wisdom (P1 — Enable Outer Loop + Stall Detection)

### 3A. Post-Training Analysis (Outer Loop) — DONE (reactive)

**What**: After training completes, analyze training (finetune) scores per epoch and run post-training dry run eval.
**Implemented in**: `src/lib/distri-finetune-tools/steps/analyze-training.ts`

**Important**: Like `analyze_evaluation`, this is a REACTIVE tool — runs when user returns after training completes.

**Files to change**:
| File | Change |
|------|--------|
| `src/lib/distri-finetune-tools/steps/analyze-training/` | New tool handler |
| `gateway/agents/finetune/finetune-workflow-agent.md` | Add outer loop decision logic from rft-decision-tree.md Section 5 |

**Handler logic**:
```typescript
async function handleAnalyzeTraining(params) {
  const epochResults = await getTrainingEvalResults(params.job_id)

  return {
    // Training (Finetune) Score trajectory per topic
    perTopicEpochScores: computePerTopicTrajectory(epochResults),
    // Overfitting detection (epoch N < epoch N-1?)
    overfittingTopics: detectOverfitting(epochResults),
    // Recommendation
    verdict: epochResults.allImproving ? 'run_post_training_eval' : 'investigate',
    // Suggest post-training dry run eval
    nextStep: 'Run dry run eval on fine-tuned model to compare with base model'
  }
}
```

**Effort**: ~4-5 hours
**Impact**: High — enables the outer loop

---

### 3B. Stall Detection & Escalation — DONE (comprehensive, embedded in analyze_evaluation)

**What**: Automatic detection of stall patterns in dry run scores with escalation suggestions.

**Implemented in**: `src/lib/distri-finetune-tools/steps/analyze-evaluation.ts` (~697 lines)

The implementation goes well beyond "partial" — it includes the full RFT decision tree (Steps A-F):
- `classifyMean()`, `classifyStd()` — score distribution classification
- `assessHealth()` — overall health assessment
- `analyzeTopics()` — per-topic diagnosis with weak/strong identification
- `assessGraderHealth()` — detects grader issues (too strict, too lenient, binary scores)
- `computeIterationComparison()` — cross-iteration delta analysis, stall detection
- `determineEscalation()` — multi-level escalation recommendations
- `generateRecommendations()` — lever-specific suggestions (grader, records, distribution, training config, topics)
- `decideNextAction()` — structured next-action decisions

**10 stall patterns detected** (from dry run scores across dataset iterations):

| # | Pattern | Detection | Escalation Lever |
|---|---------|-----------|-----------------|
| 1 | Dry run scores flat | abs(delta) < 0.03 for 3 iters | Change approach |
| 2 | Topic regression | Any topic dry run drops > 0.1 | Investigate interference |
| 3 | High variance | Dry run std > 0.25 in topic | Check prompt consistency |
| 4 | All topics similar | max - min dry run < 0.1 | Grader not differentiating |
| 5 | Binary scores | > 80% dry run scores are 0 or 1 | Add partial credit (L1) |
| 6 | Reward hacking | Training scores up, dry run quality down | Add negative criteria (L1) |
| 7 | Base model failure | All topics dry run < 0.3 on first eval | Task too hard for model |
| 8 | Ambiguous task | High variance + no improvement | Narrow task scope (L5) |
| 9 | Low variety | Same grader reasons repeat | Diversify prompts (L2) |
| 10 | Grader/data mismatch | Good prompts score low | Realign grader (L1) |

**Note**: UI-side stall indicators (warning badges on plan card) are NOT yet implemented — stall detection is tool-only.

---

## Phase 4: Give Lucy Hands (P2 — Enable Direct Control)

### 4A. Custom Grader Testing — DONE (via test_grader_sample + auto_test)

**What**: Let the agent test grader quality with real evaluation pipeline, not mock data.
**Implemented in**:
- `src/lib/distri-finetune-tools/steps/test-grader.ts` — `test_grader_sample` rewritten with real eval pipeline (generates sample, runs eval, returns scores)
- `src/lib/distri-finetune-tools/steps/configure-grader.ts` — `auto_test` parameter added to `configure_grader` (automatically tests after configuring)

**Note**: Full raw JS grader editing (letting agent write custom grader code) is NOT yet implemented — current implementation tests graders via criteria templates.

### 4B. Task Viability Pre-Check — DONE

**What**: Test the base model on sample prompts before committing to the full pipeline.
**Implemented in**: `src/lib/distri-finetune-tools/steps/check-viability.ts`

Reuses `runGraderTest()` from `test-grader.ts`. Runs a mini evaluation on 5-10 records and classifies:
- `viable` (mean >= 0.10) — safe to proceed
- `marginal` (mean 0.05-0.10) — consider simpler prompts or stronger base model
- `not_viable` (mean < 0.05) — task too hard for this model

**Effort**: ~1 hour (reused existing pipeline)
**Impact**: Medium — prevents wasted effort on impossible tasks

---

## Implementation Order

```
Phase 1 (Give Lucy Eyes)
  ├── 1A: get_evaluation_details tool          ✅ DONE
  ├── 1B: Iteration state + history in IndexedDB   ✅ DONE (finetune-iteration-db.ts, iteration-history.ts)
  └── 1C: Session catch-up protocol            ✅ MOSTLY DONE (reviewedByAgent, mark_job_reviewed, buildCatchUpContext, auto-trigger events — missing sidebar badge only)

Phase 2 (Give Lucy Autonomy — Inner Loop)
  ├── 2A: analyze_evaluation (reactive)        ✅ DONE (697 lines, full RFT decision tree)
  └── 2B: Re-plan after analysis               ✅ DONE (agent instructions + 4 new ExecutionStepId types + executors)

Phase 3 (Give Lucy Wisdom — Outer Loop + Stall)
  ├── 3A: Post-training analysis (reactive)    ✅ DONE
  └── 3B: Stall detection                      ✅ DONE (comprehensive, embedded in analyze_evaluation)

Phase 4 (Give Lucy Hands)
  ├── 4A: Grader testing (test_grader_sample)  ✅ DONE (real eval pipeline, auto_test)
  └── 4B: Task viability pre-check             ✅ DONE (check-viability.ts, reuses runGraderTest)

UI Polish
  ├── Iteration checkpoint renderers           ✅ DONE (LucyAnalyzeEvalRenderer, LucyAnalyzeTrainingRenderer)
  └── Stall warning on PlanCard                ✅ DONE (amber/red badge, reads iteration DB)
```

### Remaining Work (Priority Order)

None — all planned features are implemented.

### Lessons from E2E Testing

See [issue/e2e-fresh-run-issues.md](./issue/e2e-fresh-run-issues.md) for the full list. Key learnings:

- **Analysis must be reactive, not blocking**: Eval/training are long-running background processes (3-10+ min). Making analysis a plan execution step creates terrible UX (Lucy sits waiting, user sees no progress). Fire-and-forget is the right pattern.
- **Planning-only tools must be FORBIDDEN during execution**: The LLM ignored text instructions saying "don't call this" — it needed to be in a FORBIDDEN list. `generate_topics` and `generate_grader` are planning-only tools.
- **Backend restart kills running evaluations**: No recovery mechanism exists. Frontend shows stale "running" status. Future work: detect stale jobs or persist eval state across restarts.
