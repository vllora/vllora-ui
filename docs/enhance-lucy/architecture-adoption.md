# Architecture Adoption: What Needs to Change

Analysis of the existing codebase across all 3 repos to determine what architectural changes are needed to implement the enhanced Lucy iteration loops.

**Bottom line**: ~70% of the infrastructure already exists. The Distri server and SDK need zero changes. The work is concentrated in agent definitions (gateway) and frontend tools/state (this repo).

---

## Layer-by-Layer Verdict

| Layer | Repo | Changes Needed |
|-------|------|---------------|
| Distri Server | `distri/` | **None** — `replan()`, `InputRequired`, `max_iterations` all built-in |
| @distri/react + @distri/core SDK | `distri/distrijs/` (vendored) | **None** — multiple plans per task already supported |
| Agent Definitions | `vllora/gateway/` | **Medium** — add iteration instructions + feedback tool definitions |
| Frontend Tools | `vllora/ui/src/lib/distri-finetune-tools/` | **Medium** — add 3-4 new tool handlers |
| Frontend State | `vllora/ui/src/services/` + `src/contexts/` | **Medium** — add IterationState store + catch-up logic |
| Frontend UI | `vllora/ui/src/components/` | **Low-Medium** — iteration UI components, notification badge |

---

## Layer 1: Distri Server — No Changes

### What already exists

**`replan()` in `agent_loop.rs`:**
- When `planner.needs_replanning(execution_history)` returns `true`, the agent loop calls `replan()`
- Default `needs_replanning()` returns `false` — must be triggered explicitly
- On replan: resets `step_index = 0`, generates new plan with previous execution as context
- Emits `PlanStarted { initial_plan: false }` for replans — UI can distinguish Iteration 1 vs Iteration 2

**`InputRequired` in A2A protocol:**
- Agent can transition task to `InputRequired` state
- Preserves all execution context (plan, steps, history)
- Frontend sends follow-up message to resume
- Already wired through `chatStateStore` → `useChat` → UI

**`max_iterations` enforcement:**
- Configurable per agent definition (currently: orchestrator=30, workflow=20, data-gen=30)
- Agent loop enforces: `if step_index >= max_iterations → error`
- Agent sees remaining iterations via `get_iteration_info()`

**Parent/child task hierarchy:**
- `parent_task_id` links sub-tasks to parent
- Already used by orchestrator → sub-agent routing

### Why no changes needed

The iteration loop is conceptually:
```
plan → execute → [tool returns analysis] → agent reads analysis → agent calls replan → new plan → execute
```

The agent loop already supports this flow. The missing piece is NOT in the server — it's that the agent doesn't have the right **tools** to analyze results and the right **instructions** to trigger replanning. Those live in the agent definitions (Layer 3) and frontend tools (Layer 4).

---

## Layer 2: SDK (@distri/react + @distri/core) — No Changes

### What already exists

**Multiple plans per task (`chatStateStore`):**
```
plans: Map<planId, PlanState>
currentTaskId persists across plan_started events
```
- Each `plan_started` event creates a new entry in the `plans` Map
- `currentTaskId` is NOT overwritten when a new plan starts
- Tool results accumulate and are available for the next plan cycle
- The step renderer already iterates all plans, showing them sequentially

**Event pipeline:**
- `plan_started`, `plan_finished`, `step_started`, `step_completed` — all fire correctly for replans
- `tool_execution_start`, `tool_execution_end` — accumulate across plans
- `run_started`, `run_finished` — bracket the entire task lifecycle

### Why no changes needed

The SDK already supports the cycle: plan → execute → analyze → re-plan → execute. The `PlanStarted { initial_plan: false }` event from the server flows through to the UI without any SDK changes. The step renderer will show "Plan 1" and "Plan 2" as separate collapsible sections automatically.

---

## Layer 3: Agent Definitions — Medium Changes

These files live in `vllora/gateway/agents/finetune/` and define what the AI agent does.

### Current state

| File | Role | Iteration Support |
|------|------|-------------------|
| `vllora-finetune-agent.md` | Orchestrator (plan-first router) | No loop logic |
| `finetune-workflow-agent.md` | Workflow execution (step runner) | No analysis after eval |
| `finetune-topics-agent.md` | Topic hierarchy generation | N/A (stateless) |
| `data-generation-agent.md` | Data generation | Has preview→feedback loop, but user-driven |

### What to change

#### 3A. `finetune-workflow-agent.md` — Add iteration loop instructions

**Add new tool definitions:**
```
### get_evaluation_details
Retrieve detailed dry run evaluation results including per-record scores and grader reasoning.
Parameters: evaluation_id, sort_by, limit, topic_filter
Returns: per-topic dry run score breakdown, worst-scoring records with grader reasons

### log_iteration
Save an iteration record for cross-iteration comparison.
Parameters: dataset_id, evaluation_id, scores, changes_made, decision

### get_iteration_history
Retrieve all past iterations for a dataset.
Parameters: dataset_id
Returns: iteration history with scores, changes, decisions per iteration
```

**Add post-eval analysis instructions:**
```
After every dry run evaluation completes:
1. Call get_evaluation_details to understand dry run results
2. Call get_iteration_history to compare with previous iterations
3. Analyze using the RFT decision tree:
   - Check dry run score distribution (mean, std, per-topic)
   - Compare with previous iteration (delta, regression, stall)
   - Diagnose weak topics using grader reasons
4. Call log_iteration with your analysis
5. If dry run scores not healthy: propose targeted changes (which lever to pull)
6. If dry run scores healthy: proceed to training
7. Present analysis + recommendation to user with action buttons
```

**Add post-training analysis instructions:**
```
After training job completes:
1. Get training scores per epoch per topic
2. Check for overfitting (epoch N score < epoch N-1)
3. If scores improving: recommend post-training dry run eval
4. If overfitting: recommend using earlier epoch
5. For post-training eval: compare fine-tuned model vs base model dry run scores
```

#### 3B. `vllora-finetune-agent.md` — Update orchestrator routing

**Add re-plan routing:**
```
When the workflow agent reports iteration analysis:
- If recommendation is "iterate": route back to workflow agent with targeted changes
- If recommendation is "train": route to training flow
- If recommendation is "escalate": present escalation options to user
```

**Note:** After editing any agent md file, the backend must be restarted (`scripts/restart-backend.sh`).

---

## Layer 4: Frontend Tools — Medium Changes

These are browser-side tool handlers in `src/lib/distri-finetune-tools/`.

### Current tool registry

```
Workflow: start_finetune_workflow, get_workflow_status, advance_to_step, rollback_to_step
Steps:    propose_plan, adjust_plan, execute_plan, get_dataset_state, ...
          apply_hierarchy, categorize_records, generate_initial_data,
          configure_grader, test_grader, run_dry_run, upload_dataset, ...
```

The pipeline is linear: `execute_plan` iterates `plan.steps_to_execute` sequentially, calling registered step executors:

```typescript
// Current STEP_ORDER — linear, no branching
const STEP_ORDER: ExecutionStepId[] = [
  'topics', 'adjust_topics', 'categorize', 'generate',
  'grader', 'upload', 'dryrun', 'finetune'
];
```

### New tools to add

#### 4A. `get_evaluation_details` tool

**Location:** `src/lib/distri-finetune-tools/steps/get-evaluation-details/`

**What it does:**
- Fetches per-record dry run scores, grader reasons, per-topic breakdown from the eval API
- The data already exists — `DryRunStats` has per-record scores, and `EvaluationResultResponse` has details
- This tool just exposes it to the agent in a structured format

**Data source:** `src/services/finetune-api.ts` already has `getEvaluationResults()` and `getDryRunStats()`. The per-record data flows from `DryRunPollingManager` into IndexedDB records. We just need a tool that reads and structures it for the agent.

**Effort:** Low (~2-3h) — mostly wiring existing data

#### 4B. `log_iteration` + `get_iteration_history` tools

**Location:** `src/lib/distri-finetune-tools/steps/iteration-history/`

**What they do:**
- `log_iteration`: Save an iteration record to IndexedDB (scores, changes, decision)
- `get_iteration_history`: Read all iterations for a dataset from IndexedDB

**New IndexedDB store needed:** See Layer 5 below.

**Effort:** Low-Medium (~3-4h)

#### 4C. `analyze_evaluation` tool (optional — can be agent-driven instead)

**Two options:**
1. **Tool-based analysis:** A tool that takes eval results + history and returns structured diagnosis (weak topics, stall detection, recommendations). Pro: deterministic. Con: hardcoded logic.
2. **Agent-driven analysis:** Give the agent `get_evaluation_details` + `get_iteration_history` and let the LLM reason about the results using the decision tree in the agent md. Pro: flexible, can reason about novel patterns. Con: depends on LLM quality.

**Recommendation:** Start with agent-driven (option 2). Add tool-based stall detection later if the agent misses patterns consistently. This is simpler to implement and the agent md instructions (with the RFT decision tree) give the LLM everything it needs.

#### 4D. New step types for `execute_plan`

Add to the step registry:
```typescript
type ExecutionStepId =
  | 'topics' | 'adjust_topics' | 'categorize' | 'generate'
  | 'grader' | 'upload' | 'dryrun' | 'finetune'
  // NEW: targeted improvement steps (inner loop)
  | 'regenerate_topic'    // regenerate data for specific weak topics
  | 'adjust_grader'       // modify grader based on dry run analysis
  | 'analyze'             // run post-eval analysis
  // NEW: outer loop steps
  | 'post_training_eval'  // run eval on fine-tuned model vs base
```

**Effort:** Medium (~4-6h) — the step handlers need to integrate with existing generation and grader flows

---

## Layer 5: Frontend State — Medium Changes

### 5A. New IndexedDB Store: `iterationState`

**Location:** `src/services/finetune-iteration-db.ts` (new file)

```typescript
interface IterationState {
  id: string                    // datasetId (one per dataset)
  iterationNumber: number
  phase: 'idle' | 'evaluating' | 'analyzing' | 'awaiting_user' | 'applying_changes' | 'training' | 'post_training'
  innerLoop: {
    lastEvalId?: string
    lastDryRunScore?: number
    proposedChanges?: ProposedChange[]
    userDecision?: 'accepted' | 'rejected' | 'modified'
  }
  outerLoop: {
    lastTrainingJobId?: string
    lastEpochScores?: Record<string, number[]>
    postTrainingEvalId?: string
  }
  history: IterationHistoryEntry[]
}
```

**Integration:** Add `iterationState` object store to the existing IndexedDB database (same DB as datasets, workflows, jobs). Follow the pattern in `src/services/finetune-workflow-db.ts`.

### 5B. Job Review Tracking

**What:** Add `reviewedByAgent: boolean` field to `DryRunJob` records in IndexedDB.

**Location:** `src/services/finetune-workflow-db.ts` (modify existing `DryRunJob` interface)

**How it works:**
1. Job completes → `DryRunPollingManager` writes result to IndexedDB with `reviewedByAgent: false`
2. Lucy presents results → tool marks `reviewedByAgent: true`
3. On dataset reopen → catch-up protocol checks for `reviewedByAgent === false`

### 5C. Catch-Up Protocol

**Location:** `src/hooks/useFineTuneAgentChat.ts` (modify existing hook)

**What:** On dataset open, before showing the chat, run:
1. Check for completed-but-unreviewed dry run jobs
2. Check for completed/failed finetune jobs
3. Check for pending iteration proposals (IterationState with `phase === 'awaiting_user'`)
4. Generate appropriate catch-up context for Lucy's first message

**Implementation approach:** Inject catch-up context as the first system message when initializing the chat, so the agent knows what happened and can generate an appropriate greeting.

### 5D. New Event Emitter Events

```typescript
// Add to existing event emitter
'vllora_iteration_started':    { iteration: number, datasetId: string }
'vllora_iteration_completed':  { iteration: number, scores: {...} }
'vllora_iteration_stall':      { pattern: string, suggestion: string }
```

Follow the existing pattern in `src/utils/eventEmitter.ts`. See `event-emitter-guide.md` for the full event map.

---

## Layer 6: Frontend UI — Low-Medium Changes

### 6A. Iteration Progress in Chat

Lucy's chat messages already show structured content (plan cards, progress bars, action buttons). The iteration checkpoint UI from `mockups-final.html` would be rendered as chat message components.

**Location:** `src/components/agent/lucy-agent/` — add new message renderer for iteration checkpoints.

**Renders:**
- Score summary (per-topic bars with color coding)
- Cross-iteration delta ("+0.19 from last iteration")
- Lucy's reasoning chain
- Action buttons (Accept & Apply, Modify, Skip to Training)

### 6B. Notification Badge

**Location:** `src/components/datasets/sidebars/LucySidebar.tsx`

**What:** Show a dot/badge on the Lucy sidebar icon when there are unreviewed job results.

**Data source:** Query IndexedDB for `reviewedByAgent === false` on completed jobs for the current dataset.

### 6C. Plan Versioning in UI

**Current:** Single plan card, replaced on new plan.
**Enhanced:** Show "Iteration 1 Plan" → "Iteration 2 Plan" as collapsible sections.

**The SDK already supports this** — each `plan_started` event creates a separate `PlanState` in `chatStateStore.plans`. The step renderer just needs to label them differently based on `initial_plan: false`.

---

## What Explicitly Does NOT Change

| Component | Why No Change |
|-----------|-------------|
| `DryRunPollingManager` | Already polls, persists, auto-recovers — perfect for iteration loop |
| `FinetuneJobsContext` | SSE + polling for training jobs already works |
| IndexedDB per-record scores | Already persisted by dry run completion handler |
| Thread persistence | `lucy_thread_{datasetId}` in localStorage survives everything |
| Chat message history | Reloaded from Distri server via threadId |
| `@distri/react` useChat | Multiple plans per task already supported |
| `@distri/core` client | A2A protocol handles all needed states |
| Distri server `agent_loop.rs` | `replan()`, `InputRequired`, `max_iterations` all work |

---

## Implementation Sequence

Ordered by dependency (each phase builds on the previous):

```
Phase 1: Give Lucy Eyes (Tools Only — No Architecture Change)
  ├── 1A: get_evaluation_details tool handler
  │     → reads existing DryRunStats + EvaluationResultResponse
  │     → exposes per-record scores + grader reasons to agent
  ├── 1B: IterationState IndexedDB store + tools (log_iteration, get_iteration_history)
  │     → new store, follows finetune-workflow-db pattern
  └── 1C: reviewedByAgent flag + catch-up protocol
        → modify DryRunJob schema, add catch-up logic to useFineTuneAgentChat

Phase 2: Give Lucy Autonomy (Agent Instructions + New Steps)
  ├── 2A: Update finetune-workflow-agent.md with iteration loop instructions
  │     → post-eval analysis, decision tree, re-plan trigger
  │     → REQUIRES backend restart after changes
  ├── 2B: Add new step types to execute_plan (regenerate_topic, adjust_grader, analyze)
  │     → extend STEP_REGISTRY, add step handlers
  └── 2C: Update vllora-finetune-agent.md orchestrator routing
        → add re-plan routing logic

Phase 3: Enable Outer Loop (Training Analysis)
  ├── 3A: Post-training analysis instructions in agent md
  └── 3B: post_training_eval step type

Phase 4: Polish (UI + Stall Detection)
  ├── 4A: Iteration checkpoint message renderer
  ├── 4B: Notification badge on sidebar
  └── 4C: Tool-based stall detection (if agent-driven isn't sufficient)
```

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Agent may not follow iteration instructions reliably | Start with explicit tool-based analysis, fall back to agent-driven |
| Replan may reset too much context | Test with `initial_plan: false` — verify prior plan context is preserved |
| IterationState + WorkflowState may conflict | IterationState tracks iterations, WorkflowState tracks steps — orthogonal concerns |
| max_iterations may be hit before convergence | Allow user to extend via chat ("give me 5 more iterations") |
| Backend restart friction after agent md changes | Accept this — it's a dev-time cost, not user-facing |
| Catch-up messages may be stale if multiple jobs ran | Process all unreviewed jobs chronologically, present as ordered list |
