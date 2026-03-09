---
id: TC-CC-001
title: "Full Pipeline E2E: Complete flow from start to deployment"
area: cross-cutting
priority: P0
type: happy-path
mock-scenario: '{"evalScenario":"healthy","trainingScenario":"improving","evalPollsBeforeComplete":1,"trainingPollsBeforeComplete":1}'
preconditions:
  - Clean state (new dataset)
  - All servers running (Distri + vLLora + mock server)
  - Mock scenario: healthy eval + improving training
---

# TC-CC-001: Full Pipeline E2E

Tests the complete 7-step pipeline from start to deployment in a single session.

## Mock Setup

```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"healthy","trainingScenario":"improving","evalPollsBeforeComplete":1,"trainingPollsBeforeComplete":1}'
```

## Steps

### Step 1: Start new finetune
- **Action**: Enter task description on home page, click "Start Finetune"
- **Hard checks**:
  - [ ] Dataset created
  - [ ] Lucy sidebar opens
  - [ ] Lucy begins planning

### Step 2: Plan generation and approval
- **Hard checks**:
  - [ ] PlanCard appears with topics, records, criteria
  - [ ] Plan is approvable

### Step 3: Topics → Categorization → Coverage
- **Hard checks**:
  - [ ] `generate_topics` + `apply_topic_hierarchy` execute
  - [ ] `categorize_records` executes
  - [ ] `analyze_coverage` executes
  - [ ] Synthetic data generated if needed
  - [ ] Workflow advances through each step sequentially

### Step 4: Grader → Evaluation
- **Hard checks**:
  - [ ] `generate_grader` + `configure_grader` execute
  - [ ] `sync_evaluator` succeeds
  - [ ] `run_evaluation` completes with healthy results
  - [ ] `analyze_evaluation` shows "Healthy" + "Train"

### Step 5: Training → Analysis
- **Hard checks**:
  - [ ] `start_training` executes
  - [ ] Training completes
  - [ ] `analyze_training` shows "Improving" + "Deploy"

### Step 6: Deployment
- **Hard checks**:
  - [ ] Model ID available
  - [ ] Pipeline reaches deployment step
  - [ ] All workflow steps show as complete

### Step 7: Final state verification
- **Hard checks**:
  - [ ] All 7 workflow steps complete in sidebar
  - [ ] No stale data from intermediate states
  - [ ] No duplicate tool executions
  - [ ] Data persists across page refresh
  - [ ] Iteration history is clean (no spurious entries)
- **Evidence**: GIF recording of full pipeline (use Chrome MCP gif_creator)

## Pass Criteria

- Complete pipeline executes without manual intervention (after plan approval)
- All tool executions succeed
- Correct workflow step progression
- Final state is clean and complete

## Fail Criteria

- Pipeline stalls at any step
- Tool execution fails
- Steps execute out of order
- Stale data visible at pipeline end

## Agent Orchestration Checks

- [ ] Lucy executed steps in correct order (no skipping, no backtracking)
- [ ] Lucy made correct decisions at each branch point (train after healthy eval, deploy after improving training)
- [ ] Lucy did not call planning-only tools during execution (`generate_topics`, `generate_grader`)
- [ ] Total pipeline completed in a reasonable number of tool calls (no infinite loops)
