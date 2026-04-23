---
id: TC-TRN-003
title: "Training - No Learning: Flat scores, Lucy returns to inner loop"
area: training
priority: P0
type: edge-case
mock-scenario: '{"trainingScenario":"noLearning","trainingPollsBeforeComplete":1}'
preconditions:
  - Dataset with eval complete
  - Mock training scenario set to noLearning
---

# TC-TRN-003: Training - No Learning

## Mock Setup

```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"healthy","trainingScenario":"noLearning","trainingPollsBeforeComplete":1}'
```

Expected: Training completes with 3 epochs where scores are flat — no improvement at all.

## Preconditions

- Dataset with eval passed
- Mock training scenario set to `noLearning`

## Steps

### Step 1: Training completes
- **Action**: Lucy starts training, it completes
- **Hard checks**:
  - [ ] Training job completes successfully (status: completed)
  - [ ] Metrics show flat scores across epochs

### Step 2: Lucy detects no learning
- **Action**: Lucy calls `analyze_training`
- **Expected**: No-learning pattern detected
- **Hard checks**:
  - [ ] LucyAnalyzeTrainingRenderer appears
  - [ ] Pattern badge shows "No Learning" (red/critical)
  - [ ] Next action shows "Improve Dataset" or "Inner Loop"
  - [ ] `next_action` is "inner_loop"
  - [ ] Per-epoch scores are flat (no upward trend)
- **Evidence**: screenshot of no-learning analysis

### Step 3: Lucy returns to inner loop (dataset iteration)
- **Action**: After detecting no learning, Lucy should go back to dataset improvement
- **Hard checks**:
  - [ ] Lucy does NOT deploy
  - [ ] Lucy does NOT start another training run with same data
- **Soft checks**:
  - [ ] Lucy explains the model didn't learn from this data
  - [ ] Lucy suggests: improving data quality, adjusting grader, adding more diverse examples
  - [ ] Lucy mentions returning to the evaluation/data refinement loop
- **Evidence**: screenshot of inner loop suggestion

### Step 4: Verify workflow state
- **Action**: Check workflow state in IndexedDB
- **Hard checks**:
  - [ ] Training result recorded with no-learning pattern
  - [ ] Workflow does NOT advance to deployment
  - [ ] Iteration history updated with this training attempt
- **Evidence**: IndexedDB state check

## Pass Criteria

- No-learning pattern correctly detected
- Lucy returns to inner loop (data/grader improvement)
- Flat epoch scores visible in analysis
- Lucy does NOT deploy or blindly retrain

## Fail Criteria

- Pattern misclassified as "improving" (only checks first vs last epoch)
- Lucy deploys a model that didn't learn
- Lucy starts another training without changing anything
- `next_action` is "deploy_eval" (should be "inner_loop")

## Agent Orchestration Checks

- [ ] Lucy correctly identified no learning (flat pattern, not improving)
- [ ] Lucy's decision: return to inner loop (improve data/grader)
- [ ] Lucy did NOT repeat the same training without changes
- [ ] Lucy suggested specific improvements before retraining
