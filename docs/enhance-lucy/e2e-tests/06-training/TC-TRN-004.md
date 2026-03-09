---
id: TC-TRN-004
title: "Training - Error: Job failure handling and retry"
area: training
priority: P1
type: error-case
mock-scenario: '{"trainingScenario":"error","trainingPollsBeforeComplete":1}'
preconditions:
  - Dataset with eval complete
  - Mock training scenario set to error
---

# TC-TRN-004: Training - Error Handling

## Mock Setup

```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"healthy","trainingScenario":"error","trainingPollsBeforeComplete":1}'
```

Expected: Training polls once (running), then returns failed status.

## Steps

### Step 1: Training starts and fails
- **Action**: Lucy calls `start_training`, polls, gets failure
- **Hard checks**:
  - [ ] Training job created
  - [ ] Status transitions from "running" to "failed"
  - [ ] Error visible in job card (not silent failure)
  - [ ] Tool execution card shows failure state

### Step 2: Lucy handles training failure
- **Action**: Lucy acknowledges the failure
- **Hard checks**:
  - [ ] Lucy does NOT proceed to deployment
  - [ ] Lucy does NOT call `analyze_training` on failed job
- **Soft checks**:
  - [ ] Lucy explains training failed
  - [ ] Lucy suggests retrying or investigating
  - [ ] Lucy does not blame the user

### Step 3: Retry training
- **Action**: Ask Lucy to retry
- **Hard checks**:
  - [ ] Lucy creates a NEW training job (fresh ID)
  - [ ] Previous failed job preserved in history
  - [ ] New job starts polling

### Step 4: Verify error state in UI
- **Hard checks**:
  - [ ] Failed job card shows error styling
  - [ ] No crash or unhandled exception in console
  - [ ] Sidebar does NOT show training as complete

## Pass Criteria

- Error state clearly shown (not silent)
- Lucy handles gracefully and offers retry
- New retry uses fresh job ID
- No workflow advancement on failure

## Fail Criteria

- UI stuck on "running" forever
- Silent failure (no error shown)
- Lucy deploys after failed training
- Console shows unhandled rejection

## Agent Orchestration Checks

- [ ] Lucy detected training failure
- [ ] Lucy offered retry (recoverable error)
- [ ] Lucy did NOT analyze a failed training job
- [ ] Lucy maintained correct pipeline position
