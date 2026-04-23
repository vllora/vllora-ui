---
id: TC-EVAL-001
title: "Evaluation - Healthy scenario: Run eval, analyze, proceed to training"
area: evaluation
priority: P0
type: happy-path
mock-scenario: '{"evalScenario":"healthy","evalPollsBeforeComplete":1}'
preconditions:
  - Dataset with grader configured (TC-GRD-001 complete)
  - Mock scenario set to healthy
---

# TC-EVAL-001: Evaluation - Healthy Scenario

## Mock Setup

```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"healthy","evalPollsBeforeComplete":1}'
```

Expected mock response: mean ~0.65, all topics passing, `next_action: "train"`

## Preconditions

- Dataset has topics, records, and grader configured
- Workflow state is at `grader_config` or later
- Mock scenario set to `healthy`

## Steps

### Step 1: Lucy starts evaluation
- **Action**: Lucy calls `run_evaluation` (or `run_dry_run` internally) as part of pipeline
- **Expected**: Eval job created, polling begins
- **Hard checks**:
  - [ ] `run_evaluation` tool execution card appears in chat
  - [ ] Tool shows "running" state initially
  - [ ] Network request to `POST /finetune/evaluations` sent
  - [ ] Eval run ID returned (mock format: `mock-eval-NNN`)
- **Evidence**: screenshot of running eval card

### Step 2: Evaluation completes with healthy results
- **Action**: Mock returns completed eval after 1 poll
- **Expected**: Results appear in UI
- **Hard checks**:
  - [ ] Eval status transitions from "running" to "completed"
  - [ ] EvaluationRenderer shows score summary
  - [ ] Mean score displayed (~0.65 for healthy scenario)
  - [ ] Per-topic scores visible
  - [ ] No error in tool execution card
  - [ ] Sidebar shows evaluation complete
- **Evidence**: screenshot of eval results

### Step 3: Lucy calls analyze_evaluation
- **Action**: Lucy automatically analyzes the results
- **Expected**: LucyAnalyzeEvalRenderer appears in chat
- **Hard checks**:
  - [ ] `analyze_evaluation` tool execution card appears
  - [ ] LucyAnalyzeEvalRenderer shows in chat with structured analysis
  - [ ] Health badge shows "Healthy" (green)
  - [ ] Action badge shows "Ready to Train" or "Train"
  - [ ] `next_action` is "train"
  - [ ] Score summary matches eval results (mean, std, percentAboveZero)
  - [ ] Per-metric breakdown visible (mean, std, % above zero, % perfect)
- **Evidence**: screenshot of analysis checkpoint

### Step 4: Verify eval data in sidebar and detail panel
- **Action**: Check sidebar workflow state and detail panel
- **Hard checks**:
  - [ ] Sidebar shows evaluation step as complete
  - [ ] Dry run results visible in evaluation tab/section
  - [ ] No duplicate eval results (only one run shown)
  - [ ] EvalHealthCard shows "Healthy" status
- **Evidence**: screenshot of sidebar + detail panel

### Step 5: Lucy proceeds to training
- **Action**: After healthy eval, Lucy should advance to training step
- **Soft checks**:
  - [ ] Lucy mentions the eval results look good
  - [ ] Lucy proposes starting training
  - [ ] Lucy calls `start_training` or asks for confirmation to train
- **Evidence**: screenshot of Lucy's next message

## Pass Criteria

- Evaluation runs and completes with mock healthy scenario
- Analysis correctly identifies "healthy" with "train" action
- LucyAnalyzeEvalRenderer renders with correct badges
- Lucy proceeds to training (correct orchestration decision)

## Fail Criteria

- Eval never completes (stuck in polling)
- Analysis shows wrong health status (not "healthy")
- `next_action` is not "train" for healthy scenario
- Duplicate eval results displayed
- Lucy does NOT proceed to training after healthy eval

## Agent Orchestration Checks

- [ ] Lucy called `run_evaluation` (or `run_dry_run`) at the correct pipeline stage
- [ ] Lucy called `analyze_evaluation` AFTER eval completed (not during polling)
- [ ] Lucy's decision after healthy eval: proceed to training (not iterate or escalate)
- [ ] Lucy did not ask user for unnecessary confirmation on healthy results
