# Implementation Plan: Making Lucy Smarter

Prioritized by impact and effort. Organized around the two-loop architecture and session lifecycle.

**Key context:**
- Two score types: **Dry Run (Eval) Scores** (before training) and **Training (Finetune) Scores** (during/after training)
- Two loops: **Inner loop** (dataset iteration via dry run) and **Outer loop** (training iteration)
- Multi-model: dry run can target any model, enabling cross-model comparison
- Multi-grader: users can create multiple grader functions
- See [rft-decision-tree.md](./rft-decision-tree.md) for the full decision logic

---

## Implementation Status Summary (2026-03-06)

| Phase | Status | What's Done |
|-------|--------|-------------|
| **Phase 1: Give Lucy Eyes** | Partially done | 1A done (`get_evaluation_details`), 1B not started (iteration state), 1C partially done (reactive catch-up in agent instructions) |
| **Phase 2: Give Lucy Autonomy** | Partially done | 2A done (`analyze_evaluation` — 697-line tool with full RFT decision tree), 2B not started (re-plan after analysis) |
| **Phase 3: Give Lucy Wisdom** | Partially done | 3A done (`analyze_training` tool), 3B partially embedded in analyze_evaluation stall detection |
| **Phase 4: Give Lucy Hands** | Partially done | `test_grader_sample` rewritten with real eval pipeline, `auto_test` on `configure_grader`. 4B not started |

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

### 1B. Iteration History & State

**What**: Store iteration state and history in IndexedDB, with tools to retrieve and update.

**Files to change**:
| File | Change |
|------|--------|
| `src/services/finetune-iteration-db.ts` | New IndexedDB store |
| `src/lib/distri-finetune-tools/steps/log-iteration/` | New tool: save iteration record |
| `src/lib/distri-finetune-tools/steps/get-iteration-history/` | New tool: retrieve history |
| `src/lib/distri-finetune-tools/index.ts` | Register both tools |
| `gateway/agents/finetune/finetune-workflow-agent.md` | Add tool definitions + comparison instructions |

**DB schema**:
```typescript
interface IterationState {
  id: string                    // datasetId
  iterationNumber: number
  phase: 'idle' | 'evaluating' | 'analyzing' | 'awaiting_user' | 'applying_changes' | 'training' | 'post_training'
  innerLoop: {
    lastEvalId?: string
    lastDryRunScore?: number     // Dry Run (Eval) Score
    proposedChanges?: ProposedChange[]
    userDecision?: 'accepted' | 'rejected' | 'modified'
  }
  outerLoop: {
    lastTrainingJobId?: string
    lastEpochScores?: Record<string, number[]>  // Training (Finetune) Scores per topic
    postTrainingEvalId?: string
  }
  history: IterationHistoryEntry[]
}

interface IterationHistoryEntry {
  iteration: number
  timestamp: string
  evalId: string
  dryRunScores: { mean: number, perTopic: Record<string, number> }
  changesMade: string
  decision: 'iterate' | 'train' | 'escalate'
}
```

**Agent instructions** (add to workflow agent md):
```
After every dry run evaluation completes:
1. Call get_evaluation_details to understand dry run results
2. Call get_iteration_history to compare dry run scores with previous iterations
3. Call log_iteration with your analysis and decision
4. If dry run scores not healthy: propose changes (Levers 1-3, 5 from rft-decision-tree)
5. If dry run scores healthy: proceed to training (outer loop)
```

**Effort**: ~4-5 hours
**Impact**: High — enables trend analysis and session resumption

---

### 1C. Session Catch-Up Protocol — PARTIALLY DONE (agent instructions only)

**What**: When user reopens a dataset, Lucy checks for unreviewed job results and catches up.

**What's done**: Reactive catch-up section added to `vllora-finetune-agent.md` — when user returns, `get_dataset_state` checks for completed jobs, then calls `analyze_evaluation`/`analyze_training`. The IndexedDB `reviewedByAgent` field and frontend notification badge are NOT yet implemented.

**Files to change**:
| File | Change |
|------|--------|
| `src/services/finetune-workflow-db.ts` | Add `reviewedByAgent` to DryRunJob schema |
| `src/hooks/useFineTuneAgentChat.ts` | Add catch-up logic on mount |
| `src/components/datasets/sidebars/LucySidebar.tsx` | Show notification badge for unreviewed results |

**Implementation** (see [session-lifecycle.md](./session-lifecycle.md) for full design):
```
On dataset open:
1. Load workflow + iteration state from IndexedDB
2. Check for completed-but-unreviewed jobs (reviewedByAgent === false)
3. If unreviewed results exist → Lucy generates catch-up message
4. If pending proposal exists → Lucy re-presents it
5. If running job exists → show live progress
6. Otherwise → show DatasetStatusSummary (current behavior)
```

**Effort**: ~3-4 hours
**Impact**: High — Lucy never loses context across sessions

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

### 2B. Re-Plan After Analysis (Inner Loop)

**What**: Allow the workflow agent to propose targeted changes after analyzing dry run results.

**Files to change**:
| File | Change |
|------|--------|
| `src/lib/distri-finetune-tools/steps/propose-plan/handler.ts` | Support `iteration_context` param |
| `src/lib/distri-finetune-tools/steps/execute-plan.ts` | Add `regenerate_topic` and `adjust_grader` step types |
| `gateway/agents/finetune/vllora-finetune-agent.md` | Update routing rules for re-planning |

**New step types for iteration**:
```typescript
type ExecutionStepId =
  | 'topics' | 'adjust_topics' | 'categorize' | 'generate' | 'grader' | 'upload' | 'dryrun' | 'finetune'
  // NEW: targeted improvement steps (inner loop)
  | 'regenerate_topic'    // regenerate data for specific weak topics
  | 'adjust_grader'       // modify grader based on dry run analysis
  | 'analyze'             // run post-eval analysis on dry run results
  // NEW: outer loop steps
  | 'post_training_eval'  // run dry run eval on fine-tuned model vs base
```

**Effort**: ~6-8 hours
**Impact**: High — enables the full inner loop

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

### 3B. Stall Detection & Escalation

**What**: Automatic detection of stall patterns in dry run scores with escalation suggestions.

**10 stall patterns to detect** (from dry run scores across dataset iterations):

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

**Effort**: ~3-4 hours
**Impact**: Medium — prevents wasted iterations

---

## Phase 4: Give Lucy Hands (P2 — Enable Direct Control)

### 4A. Custom Grader Testing — DONE (via test_grader_sample + auto_test)

**What**: Let the agent test grader quality with real evaluation pipeline, not mock data.
**Implemented in**:
- `src/lib/distri-finetune-tools/steps/test-grader.ts` — `test_grader_sample` rewritten with real eval pipeline (generates sample, runs eval, returns scores)
- `src/lib/distri-finetune-tools/steps/configure-grader.ts` — `auto_test` parameter added to `configure_grader` (automatically tests after configuring)

**Note**: Full raw JS grader editing (letting agent write custom grader code) is NOT yet implemented — current implementation tests graders via criteria templates.

### 4B. Task Viability Pre-Check — NOT STARTED

**What**: Test the base model on sample prompts before committing to the full pipeline.

**Effort**: ~3-4 hours
**Impact**: Medium — prevents wasted effort on impossible tasks

---

## Implementation Order

```
Phase 1 (Give Lucy Eyes)
  ├── 1A: get_evaluation_details tool          ✅ DONE
  ├── 1B: Iteration state + history in IndexedDB   ⬜ NOT STARTED
  └── 1C: Session catch-up protocol            🟡 PARTIAL (agent instructions only)

Phase 2 (Give Lucy Autonomy — Inner Loop)
  ├── 2A: analyze_evaluation (reactive)        ✅ DONE (697 lines, full RFT decision tree)
  └── 2B: Re-plan after analysis               ⬜ NOT STARTED

Phase 3 (Give Lucy Wisdom — Outer Loop + Stall)
  ├── 3A: Post-training analysis (reactive)    ✅ DONE
  └── 3B: Stall detection                      🟡 PARTIAL (embedded in analyze_evaluation)

Phase 4 (Give Lucy Hands)
  ├── 4A: Grader testing (test_grader_sample)  ✅ DONE (real eval pipeline, auto_test)
  └── 4B: Task viability pre-check             ⬜ NOT STARTED
```

### Remaining Work (Priority Order)

1. **1B: Iteration state + history in IndexedDB** — Required for cross-iteration memory, trend analysis, and session resumption. Without this, Lucy can't compare current eval results to previous iterations.
2. **2B: Re-plan after analysis** — Required for the inner loop. Lucy can analyze eval results but can't yet propose targeted changes (regenerate weak topics, adjust grader).
3. **1C: Full session catch-up** — Agent instructions handle catch-up, but frontend needs `reviewedByAgent` tracking in IndexedDB + notification badge in LucySidebar.
4. **4B: Task viability pre-check** — Nice-to-have, prevents wasted effort on impossible tasks.

### Lessons from E2E Testing

See [issue/e2e-fresh-run-issues.md](./issue/e2e-fresh-run-issues.md) for the full list. Key learnings:

- **Analysis must be reactive, not blocking**: Eval/training are long-running background processes (3-10+ min). Making analysis a plan execution step creates terrible UX (Lucy sits waiting, user sees no progress). Fire-and-forget is the right pattern.
- **Planning-only tools must be FORBIDDEN during execution**: The LLM ignored text instructions saying "don't call this" — it needed to be in a FORBIDDEN list. `generate_topics` and `generate_grader` are planning-only tools.
- **Backend restart kills running evaluations**: No recovery mechanism exists. Frontend shows stale "running" status. Future work: detect stale jobs or persist eval state across restarts.
