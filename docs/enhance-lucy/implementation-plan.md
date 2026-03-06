# Implementation Plan: Making Lucy Smarter

Prioritized by impact and effort. Organized around the two-loop architecture and session lifecycle.

**Key context:**
- Two score types: **Dry Run (Eval) Scores** (before training) and **Training (Finetune) Scores** (during/after training)
- Two loops: **Inner loop** (dataset iteration via dry run) and **Outer loop** (training iteration)
- Multi-model: dry run can target any model, enabling cross-model comparison
- Multi-grader: users can create multiple grader functions
- See [rft-decision-tree.md](./rft-decision-tree.md) for the full decision logic

---

## Phase 1: Give Lucy Eyes (P0 — Enable Diagnosis)

### 1A. Evaluation Details Tool

**What**: New tool `get_evaluation_details` that returns per-record dry run scores, grader reasons, and per-topic breakdowns.

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

### 1C. Session Catch-Up Protocol

**What**: When user reopens a dataset, Lucy checks for unreviewed job results and catches up.

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

### 2A. Post-Eval Analysis Step

**What**: After dry run eval, Lucy analyzes dry run scores using the decision tree (Steps A-F from [rft-decision-tree.md](./rft-decision-tree.md)).

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

### 3A. Post-Training Analysis (Outer Loop)

**What**: After training completes, analyze training (finetune) scores per epoch and run post-training dry run eval.

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

### 4A. Custom Grader Editing

**What**: Let the agent write or edit raw grader JavaScript, not just template criteria.

**Effort**: ~4-6 hours
**Impact**: Medium — enables domain-specific grading

### 4B. Task Viability Pre-Check

**What**: Test the base model on sample prompts before committing to the full pipeline.

**Effort**: ~3-4 hours
**Impact**: Medium — prevents wasted effort on impossible tasks

---

## Implementation Order

```
Week 1: Phase 1 (Give Lucy Eyes)
  ├── 1A: get_evaluation_details tool (2-3h)
  ├── 1B: Iteration state + history in IndexedDB (4-5h)
  └── 1C: Session catch-up protocol (3-4h)

Week 2: Phase 2 (Give Lucy Autonomy — Inner Loop)
  ├── 2A: analyze_evaluation step using dry run scores (4-6h)
  └── 2B: Re-plan after analysis (6-8h)

Week 3: Phase 3 (Give Lucy Wisdom — Outer Loop + Stall)
  ├── 3A: Post-training analysis using finetune scores (4-5h)
  └── 3B: Stall detection using dry run score trends (3-4h)

Week 4: Phase 4 (Give Lucy Hands)
  ├── 4A: Custom grader editing (4-6h)
  └── 4B: Task viability pre-check (3-4h)
```

Total estimated effort: ~35-45 hours across 4 weeks.

Each phase delivers independent value:
- **Phase 1 alone** makes Lucy see what's happening and catch up on reopen
- **Phase 2 alone** enables the inner dataset iteration loop
- **Phase 3 alone** enables the outer training loop and stall prevention
- **Phase 4 alone** gives Lucy direct control over graders and model testing
