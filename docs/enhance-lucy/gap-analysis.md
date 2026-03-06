# Gap Analysis: Lucy Agent vs Claude Code Skill

## Key Context

- **RFT (Reinforcement Fine-Tuning)**: Output field can be empty — model generates responses during training, grader scores them. The grader IS the training signal.
- **Two loops**: Inner loop (dataset iteration via dry run eval) and outer loop (training iteration via finetune scores)
- **Two score types**: Dry Run (Eval) Scores (before training, from `DryRunStats`) and Training (Finetune) Scores (during/after training, from `FinetuneEvalResultsResponse`)
- **Multi-model evaluation**: Users can run dry run evals on any model (base, competitor, fine-tuned)
- **Multiple graders**: Users can create different grader functions testing different quality dimensions

## How Each System Works

### Lucy Agent (Browser-Based, Multi-Agent)

```
User ↔ React UI
       ↕ useChat / @distri/react
     Orchestrator Agent (vllora-finetune-agent.md)
       ├── finetune_topics sub-agent
       ├── finetune_workflow sub-agent
       └── data_generation sub-agent
       ↕
     53 Browser-Side Tools (execute locally)
       ↕
     IndexedDB (datasets, workflows, records)
       ↕
     Backend API (evaluations, training only)
```

- 3 sub-agents with fixed max_iterations (10, 20, 30)
- Hardcoded 7-step workflow with mandatory plan approval
- Tools return structured JSON, agent interprets results
- State machine controls step transitions with validation rules
- Event emitter pattern for UI updates
- **No iteration loop** — runs the pipeline once, top to bottom

### Claude Code Skill (Direct Execution)

```
User ↔ Claude Code CLI
       ↕ Reads SKILL.md + knowledge/ files
     Claude (single agent, full autonomy)
       ├── Read/Write files directly
       ├── Execute curl commands via Bash
       ├── Parse API responses inline
       └── Iterate based on results
       ↕
     Local Filesystem (JSONL, JS, JSON, logs)
       ↕
     Backend API (same endpoints)
```

- Single agent with full tool access (Bash, Read, Write, Edit)
- No workflow state machine — Claude drives execution sequentially
- Claude writes all artifacts directly (training data, grader JS, topic JSON)
- Full context of every iteration via execution-log.md and iteration-log.md
- Can branch, loop, retry, and change strategy at any point
- **Has both loops** — iterates dataset until dry run scores healthy, then trains, then evaluates trained model

---

## Gap 1: Evaluation Results Are Opaque

### What Claude Code does
After dry run eval completes, Claude reads the **full JSON response** — every record's dry run score, the grader's reasoning, and per-topic breakdowns. It sorts by worst score, reads the grader's `reason` field, and diagnoses whether the problem is the data, the grader, or the base model.

Claude also runs dry run evals on **multiple models** (base model + stronger model) and with **multiple graders** to build a score matrix.

```
Claude sees (per model, per grader):
  Record pins-003: dry run score=0.15, reason="Response discusses forks, not pins"
  Record pins-007: dry run score=0.20, reason="Algebraic notation is incorrect"

Score matrix:
                    Notation Grader    Pedagogy Grader
  gpt-4o-mini:     0.45               0.62
  gpt-4o:          0.71               0.78

Claude diagnoses:
  "gpt-4o scores 0.26 higher on Notation — dataset is valid,
   4o-mini needs more specific prompts for notation tasks."
```

### What Lucy does
Lucy's `run_evaluation` tool starts an async job and returns a summary:
```json
{ "average_score": 0.45, "passed_count": 52, "failed_count": 80 }
```

The agent sees aggregate dry run stats but **cannot read individual record scores or grader reasoning**. It runs one eval at a time on one model with one grader — no score matrix.

### What's missing
- A tool to retrieve per-record dry run details (score, reason, topic)
- Ability to sort/filter by score, topic, or failure pattern
- Grader reason text exposed to the agent
- Cross-model comparison (run same dataset+grader on different models)
- Multi-grader view (score matrix showing model x grader)

### Proposed fix
Add a `get_evaluation_details` tool:
```typescript
// Input
{ evaluation_id: string, sort_by: "score_asc" | "score_desc", limit: number, topic_filter?: string }

// Output
{
  summary: { average_score: 0.45, pass_rate: 0.39, total: 132 },
  per_topic: [
    { topic: "pins", avg_score: 0.22, count: 10, worst_record: "pins-003" },
    { topic: "forks", avg_score: 0.68, count: 11, worst_record: "forks-009" }
  ],
  worst_records: [
    { id: "pins-003", score: 0.15, topic: "pins", reason: "Response discusses forks, not pins" },
    { id: "combos-012", score: 0.10, topic: "combinations", reason: "Generic response" }
  ]
}
```

---

## Gap 2: No Cross-Iteration Memory

### What Claude Code does
Claude maintains two log files across iterations:
- `execution-log.md` — timestamped record of every action taken
- `iteration-log.md` — what changed each iteration and why

This gives Claude full context:
```
Iteration 1: avg=0.45, pins=0.22, forks=0.68
  → Decision: regenerate pin prompts, loosen grader on notation
Iteration 2: avg=0.58, pins=0.41 (+0.19), forks=0.65 (-0.03)
  → Decision: pins improving but forks regressed slightly. Check grader change.
Iteration 3: avg=0.62, pins=0.55 (+0.14), forks=0.67 (+0.02)
  → Decision: GO — submit training job
```

### What Lucy does
Each plan execution is independent. When Lucy runs a second evaluation, the agent doesn't know:
- What the previous evaluation scored
- What changes were made between iterations
- Whether scores are trending up or down
- Which topics improved vs regressed

### What's missing
- Iteration history stored in IndexedDB (per dataset)
- A tool to retrieve iteration history
- Agent instructions to compare current vs previous results

### Proposed fix
1. Add `iteration_history` store in IndexedDB:
```typescript
interface IterationRecord {
  iteration: number
  timestamp: string
  evaluation_id: string
  summary: { average_score: number, pass_rate: number }
  per_topic_scores: Record<string, number>
  changes_made: string  // what was different from previous iteration
  decision: "go" | "no-go" | "iterate"
}
```

2. Add `get_iteration_history` tool that returns all past iterations for a dataset
3. Add `log_iteration` tool that the agent calls after each eval to record what happened
4. Update the workflow agent instructions to always compare with previous iteration

---

## Gap 3: Fixed Pipeline, No Branching After Eval (No Iteration Loop)

### What Claude Code does
Claude has **two decision loops**:

**Inner loop (dataset iteration):** After dry run eval, Claude analyzes dry run scores:
- If dry run mean is in healthy range (0.25-0.65) and improving → proceed to training
- If specific topics have low dry run scores → regenerate data for those topics only
- If grader seems too strict (dry run mean < 0.25) → rewrite grader with partial credit
- If dry run scores plateau after 3 iterations → escalate (change approach entirely)
- Can run same eval on different models to build a score matrix

**Outer loop (training iteration):** After training, Claude analyzes training scores:
- If training scores improve across epochs → run post-training dry run eval on fine-tuned model
- If fine-tuned model dry run scores >> base model → deploy
- If overfitting → use earlier epoch, adjust training config
- If reward hacking → fix grader, re-train

### What Lucy does
Lucy's `execute_plan` runs steps sequentially from a fixed registry:
```typescript
const STEP_EXECUTORS: Record<ExecutionStepId, StepExecutor> = {
  topics: executeTopicsStep,
  adjust_topics: executeAdjustTopicsStep,
  categorize: executeCategorizeStep,
  generate: executeGenerateStep,
  grader: executeGraderStep,
  upload: executeUploadStep,
  dryrun: executeDryRunStep,
  finetune: executeFinetuneStep,
};
```

There is no `analyze_results` step. There is no conditional logic. The plan runs top-to-bottom. **Neither inner loop nor outer loop exists.**

### What's missing
- Post-eval analysis step that inspects dry run results and proposes next actions
- Ability for the agent to propose a new plan based on dry run scores
- Post-training analysis step that inspects training scores and epoch data
- Post-training dry run eval (compare fine-tuned model vs base model)
- The entire iteration loop concept (neither inner nor outer loop)

### Proposed fix
1. Add an `analyze_evaluation` step that runs after `dryrun`:
   - Reads evaluation details (per-record scores, per-topic breakdown)
   - Compares with iteration history
   - Generates a diagnosis: what's working, what's not, what to do next
   - Returns a structured recommendation

2. Allow the agent to call `propose_plan` again after analysis:
   - New plan should reference previous iteration
   - Plan should target specific improvements (not full re-run)
   - UI shows "Iteration 2 Plan" with what changed

3. Add step types for targeted fixes:
   - `regenerate_topic` — regenerate data for specific weak topics
   - `adjust_grader` — modify grader based on analysis
   - `rerun_evaluation` — re-evaluate without re-uploading (if only grader changed)

---

## Gap 4: No Stall Detection or Escalation Strategy

### What Claude Code does
The skill includes `knowledge/iteration-strategy.md` with:
- **10 stall patterns** the agent can recognize:
  1. Scores flat across iterations (no learning)
  2. One topic improves, another regresses (interference)
  3. High variance within a topic (inconsistent)
  4. All topics similar scores (grader not differentiating)
  5. Binary scores (0 or 1, no partial credit)
  6. Reward hacking (model games the grader)
  7. Base model can't do the task at all
  8. Task is ambiguous (experts disagree)
  9. Insufficient data variety
  10. Grader criteria don't match user intent

- **6-level escalation ladder**:
  1. Quick fix: tighten grader, add partial credit
  2. Data fix: add more varied prompts, improve coverage
  3. Grader rewrite: fundamentally change scoring approach
  4. Scope narrowing: make the task more specific
  5. Model change: try a different base model
  6. Start over: the approach isn't working

### What Lucy does
Nothing. If scores don't improve, Lucy re-runs the same pipeline. No detection, no escalation, no diagnosis.

### What's missing
- Stall detection logic (compare last 3 iterations)
- Escalation recommendations in the agent instructions
- UI indicator showing "scores are plateauing"

### Proposed fix
1. Add stall detection in the `analyze_evaluation` step:
```typescript
function detectStall(history: IterationRecord[]): StallPattern | null {
  const lastThree = history.slice(-3);
  if (lastThree.length < 3) return null;

  const scores = lastThree.map(h => h.summary.average_score);
  const improvement = scores[2] - scores[0];

  if (Math.abs(improvement) < 0.05) {
    return { pattern: "plateau", suggestion: "Consider escalating approach" };
  }
  // ... more patterns
}
```

2. Add stall pattern descriptions to the workflow agent instructions
3. Surface escalation suggestions in the UI (plan card shows warning)

---

## Gap 5: Grader Editing Is Template-Constrained

### What Claude Code does
Claude writes **full JavaScript grader functions** from scratch:
- Custom programmatic checks (regex for chess notation, domain-specific validation)
- LLM-as-judge with custom prompt and scoring rubric
- Weighted combination of multiple scoring dimensions
- Negative criteria (penalize reward hacking behaviors)
- Domain-specific validators (e.g., Stockfish for chess positions)

### What Lucy does
Lucy uses `configure_grader` with a template-based approach:
```typescript
interface GraderCriterion {
  name: string
  description: string
  weight: number
  type: "programmatic" | "llm_judge"
}
```

The tool converts these criteria into a grader function using a template. The agent cannot:
- Write custom JavaScript logic
- Add domain-specific validators
- Implement negative scoring criteria
- Fine-tune the LLM-as-judge prompt

### What's missing
- Ability for the agent to write/edit raw grader JavaScript
- Custom scoring logic beyond the template
- Domain-specific validation hooks

### Proposed fix
1. Add a `custom_grader_code` field to `configure_grader`:
```typescript
interface GraderConfig {
  criteria: GraderCriterion[]
  custom_code?: string  // Raw JS to merge with template
}
```

2. Alternatively, add an `edit_grader` tool that lets the agent modify the generated grader.js directly

3. Add pre-built "grader snippets" for common domains (chess notation validation, medical terminology checking, code syntax validation)

---

## Gap 6: No Task Viability Pre-Check

### What Claude Code does
Before starting the pipeline, the skill instructs Claude to verify prerequisites:
1. Test the base model on 5-10 sample prompts
2. If the model gets 30-60% right → fine-tuning can help
3. If the model produces garbage → base model is too small or task is too hard
4. If the model is already good → fine-tuning may not be needed

### What Lucy does
Jumps straight into topic generation and data creation. No pre-check.

### Proposed fix
Add a `test_base_model` tool:
```typescript
// Input
{ model: string, sample_prompts: string[], system_prompt: string }

// Output
{
  results: [
    { prompt: "...", response: "...", approximate_quality: "good" | "partial" | "poor" }
  ],
  viability: "ready" | "marginal" | "not_ready",
  recommendation: "Proceed with fine-tuning" | "Consider a larger base model"
}
```

Add this as an optional first step in the plan — run before generating data.

---

## Gap 7: Knowledge Sources Are Opaque to the Agent

### What Claude Code does
Claude reads documents in full, extracts structured content to `knowledge/document-extraction.md`, and references specific sections when generating data:
```
"Generate 10 prompts about pin tactics, specifically referencing
the examples from pages 16-18 of the PDF where Rook pins along
the e-file are demonstrated in the Petrov Defense."
```

### What Lucy does
Knowledge sources are processed by the `analyze_knowledge_sources` tool internally. The agent gets a summary but doesn't see the full extracted content. When generating data via `generate_initial_data`, knowledge is injected into the generation context automatically — the agent doesn't control how it's used.

### What's missing
- Agent access to extracted knowledge content
- Ability to reference specific sections when generating data
- Control over which knowledge sections apply to which topics

### Proposed fix
1. Add a `get_knowledge_content` tool that returns extracted sections with labels
2. Allow `generate_initial_data` to accept a `knowledge_sections` parameter
3. Link `sourceChunkRefs` in topics to actual knowledge source sections

---

## Gap 8: No Session Resumption or Catch-Up (NEW)

### What Claude Code does
Claude maintains full context in `execution-log.md` and `iteration-log.md`. If the user restarts a conversation, Claude reads these logs and picks up exactly where it left off.

### What Lucy does
When a user reopens a dataset:
- Chat thread is loaded (previous messages visible)
- Workflow state is loaded from IndexedDB
- But Lucy has **no structured context** about:
  - Whether a job completed/failed while the user was away
  - What iteration we're on
  - What Lucy proposed last time and whether user accepted
  - Whether there are unreviewed results

Lucy shows `DatasetStatusSummary` on reopen but cannot intelligently catch up.

### What's missing
- Iteration state persistence (what phase, what iteration number, pending proposals)
- "Reviewed by agent" tracking for completed jobs
- Catch-up protocol: on reopen, Lucy checks for unreviewed results and presents them
- Progressive background transition for long jobs
- Notification when jobs complete while user is away

### Proposed fix
See [session-lifecycle.md](./session-lifecycle.md) for the full design:
1. Add `IterationState` to IndexedDB (iteration number, phase, proposed changes)
2. Add `reviewedByAgent` flag to job records
3. Implement Lucy's catch-up protocol (check pending jobs → present results)
4. Progressive background transition (offer after 30s of waiting)
5. Notification badge on Lucy sidebar icon for unreviewed results
