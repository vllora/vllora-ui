---
id: TC-TRN-002
title: "Training - Overfitting: Scores rise then fall, Lucy investigates"
area: training
priority: P0
type: edge-case
mock-scenario: '{"trainingScenario":"overfitting","trainingPollsBeforeComplete":1}'
preconditions:
  - Dataset with eval complete
  - Mock training scenario set to overfitting
---

# TC-TRN-002: Training - Overfitting Detection

## Mock Setup

```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"healthy","trainingScenario":"overfitting","trainingPollsBeforeComplete":1}'
```

Expected: Training completes with 4 epochs where scores rise then fall (classic overfitting curve).

## Preconditions

- Dataset with eval passed
- Mock training scenario set to `overfitting`

## Steps

### Step 1: Training starts and completes
- **Action**: Lucy calls `start_training`, polls, completes
- **Hard checks**:
  - [ ] Training job created and completes
  - [ ] Status shows "completed" (overfitting is detected post-hoc, not during training)

### Step 2: Lucy analyzes training — detects overfitting
- **Action**: Lucy calls `analyze_training`
- **Expected**: Overfitting pattern detected
- **Hard checks**:
  - [ ] LucyAnalyzeTrainingRenderer appears
  - [ ] Pattern badge shows "Overfitting" (yellow/amber warning)
  - [ ] Next action shows "Investigate"
  - [ ] `next_action` is "investigate"
  - [ ] Per-epoch scores show the rise-then-fall pattern
  - [ ] Analysis mentions overfitting specifically
- **Evidence**: screenshot of overfitting analysis

### Step 3: Lucy does NOT deploy
- **Action**: After detecting overfitting, Lucy should not deploy
- **Hard checks**:
  - [ ] Lucy does NOT call `deploy_model`
  - [ ] Lucy does NOT proceed to deployment step
- **Soft checks**:
  - [ ] Lucy explains overfitting (scores improved then degraded)
  - [ ] Lucy suggests reducing epochs, adjusting learning rate, or more data
  - [ ] Lucy suggests using an earlier checkpoint (best epoch, not final)
- **Evidence**: screenshot of Lucy's investigation suggestions

### Step 4: Verify overfitting data in UI
- **Action**: Check training analysis card details
- **Hard checks**:
  - [ ] Epoch scores show clear rise-then-fall pattern:
    - Epochs 1-2: scores increasing
    - Epochs 3-4: scores decreasing
  - [ ] Warning indicator visible on training job card
  - [ ] No stale "improving" badge from previous analysis
- **Evidence**: screenshot of epoch scores

## Pass Criteria

- Overfitting correctly detected (not classified as "improving")
- Lucy investigates instead of deploying
- Per-epoch score pattern clearly shows rise-then-fall
- Lucy suggests remediation steps

## Fail Criteria

- Pattern badge shows "Improving" (misclassified — looks at only final vs initial)
- Lucy deploys despite overfitting
- `next_action` is "deploy_eval" (should be "investigate")
- Overfitting pattern not visible in epoch scores display

## Agent Orchestration Checks

- [ ] Lucy detected overfitting (not just "training completed, let's deploy")
- [ ] Lucy's decision: investigate (not deploy, not retrain blindly)
- [ ] Lucy provided actionable suggestions (reduce epochs, check data, etc.)
- [ ] Lucy did NOT start another training job without investigating first
