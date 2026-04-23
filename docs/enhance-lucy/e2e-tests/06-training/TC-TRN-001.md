---
id: TC-TRN-001
title: "Training - Improving: Happy path with scores increasing each epoch"
area: training
priority: P0
type: happy-path
mock-scenario: '{"trainingScenario":"improving","trainingPollsBeforeComplete":2}'
preconditions:
  - Dataset with healthy eval complete (TC-EVAL-001 done)
  - Mock training scenario set to improving
---

# TC-TRN-001: Training - Improving (Happy Path)

## Mock Setup

```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"healthy","trainingScenario":"improving","trainingPollsBeforeComplete":2}'
```

Expected: Training polls 2 times (shows running), then completes with improving scores across 3 epochs.

## Preconditions

- Dataset passed healthy eval
- Lucy has decided to proceed to training
- Mock training scenario set to `improving`

## Steps

### Step 1: Lucy starts training
- **Action**: Lucy calls `start_training`
- **Expected**: Training job created, polling begins
- **Hard checks**:
  - [ ] `start_training` tool execution card appears
  - [ ] Network request to `POST /finetune/reinforcement-jobs` sent
  - [ ] Job ID returned (mock format: `mock-ft-NNN`)
  - [ ] Training status shows "pending" or "running"
  - [ ] Jobs tab/section in dataset detail updates
- **Evidence**: screenshot of training start

### Step 2: Training in progress
- **Action**: Mock returns "running" for 2 polls
- **Expected**: Progress visible in UI
- **Hard checks**:
  - [ ] Training status shows "running"
  - [ ] Progress indicator or epoch count visible
  - [ ] Job card shows metrics (trainReward, epoch info)
  - [ ] No error during polling
- **Evidence**: screenshot of running state

### Step 3: Training completes successfully
- **Action**: After 2 polls, mock returns completed with improving scores
- **Expected**: Completion state in UI
- **Hard checks**:
  - [ ] Training status transitions to "completed"
  - [ ] Fine-tuned model ID is set (not null)
  - [ ] Final metrics visible (reward scores, epoch count)
  - [ ] Job card shows success styling
  - [ ] Sidebar workflow indicator shows training complete
- **Evidence**: screenshot of completed training

### Step 4: Lucy analyzes training results
- **Action**: Lucy calls `analyze_training`
- **Expected**: LucyAnalyzeTrainingRenderer appears
- **Hard checks**:
  - [ ] `analyze_training` tool execution card appears
  - [ ] LucyAnalyzeTrainingRenderer shows in chat
  - [ ] Pattern badge shows "Improving" (green)
  - [ ] Next action shows "Run Post-Training Eval" or "Deploy"
  - [ ] `next_action` is "deploy_eval"
  - [ ] Per-epoch scores show upward trend
- **Evidence**: screenshot of training analysis

### Step 5: Finetune evaluation scores visible
- **Action**: Check finetune-evaluations endpoint data
- **Hard checks**:
  - [ ] Per-epoch, per-row training scores visible
  - [ ] Scores increase across epochs (improving pattern)
  - [ ] Network request to `GET /finetune/datasets/:id/finetune-evaluations` succeeded
- **Evidence**: screenshot or network log

### Step 6: Lucy proceeds toward deployment
- **Action**: After successful training, Lucy advances
- **Soft checks**:
  - [ ] Lucy mentions training was successful
  - [ ] Lucy suggests post-training eval or deployment
  - [ ] Lucy does NOT suggest retraining
- **Evidence**: screenshot of Lucy's next steps

## Pass Criteria

- Training starts, progresses, and completes successfully
- Improving pattern correctly identified in analysis
- Per-epoch scores show upward trend
- Lucy proceeds to deployment/post-training eval

## Fail Criteria

- Training stuck in "running" (never completes)
- Analysis shows wrong pattern (not "improving")
- `next_action` is not "deploy_eval"
- Lucy suggests retraining after improving results
- Job card shows stale data from previous runs

## Agent Orchestration Checks

- [ ] Lucy started training AFTER healthy eval (correct pipeline order)
- [ ] Lucy called `analyze_training` AFTER training completed
- [ ] Lucy's decision after improving training: deploy or post-training eval (not retrain)
- [ ] Lucy did not start a second training job unnecessarily
