---
id: TC-EVAL-004
title: "Evaluation - Error scenario: Job failure handling"
area: evaluation
priority: P1
type: error-case
mock-scenario: '{"evalScenario":"error","evalPollsBeforeComplete":2}'
preconditions:
  - Dataset with grader configured
  - Mock scenario set to error
---

# TC-EVAL-004: Evaluation - Error Scenario

## Mock Setup

```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"error","evalPollsBeforeComplete":2}'
```

Expected: Eval polls 2 times (shows running), then returns failed status.

## Preconditions

- Dataset with grader configured
- Mock scenario set to `error`

## Steps

### Step 1: Eval job starts and polls
- **Action**: Lucy calls `run_evaluation`
- **Hard checks**:
  - [ ] Eval job created (POST returns success)
  - [ ] Polling shows "running" state for 2 polls
  - [ ] Progress indicator visible during polling

### Step 2: Eval job fails
- **Action**: After 2 polls, mock returns failed status
- **Expected**: Error state in UI
- **Hard checks**:
  - [ ] Eval status shows "failed" (not stuck on "running")
  - [ ] Error message visible in UI (not silent failure)
  - [ ] No crash or unhandled exception in console
  - [ ] Tool execution card shows failure state (red/error styling)
- **Evidence**: screenshot of failed eval

### Step 3: Lucy handles the error
- **Action**: Lucy should acknowledge the failure
- **Expected**: Lucy explains what happened and suggests next steps
- **Hard checks**:
  - [ ] Lucy does NOT proceed to training
  - [ ] Lucy does NOT silently ignore the failure
- **Soft checks**:
  - [ ] Lucy mentions the evaluation failed
  - [ ] Lucy suggests retrying or checking the grader
  - [ ] Lucy does not blame the user
- **Evidence**: screenshot of Lucy's error handling

### Step 4: Retry capability
- **Action**: Ask Lucy to retry the evaluation
- **Expected**: Lucy can start a new eval run
- **Hard checks**:
  - [ ] Lucy calls `run_evaluation` again (new eval run)
  - [ ] New eval run gets a fresh ID (not reusing failed one)
  - [ ] Previous failed run is preserved in history (not deleted)
- **Evidence**: screenshot of retry

## Pass Criteria

- Error state correctly displayed (not stuck on running)
- Lucy acknowledges failure and suggests next steps
- No silent failure (user informed of what happened)
- Retry works with fresh eval run

## Fail Criteria

- UI stuck in "running" state forever (doesn't detect failure)
- No error message shown to user (silent failure)
- Console shows unhandled rejection
- Lucy proceeds to training after failed eval
- Retry reuses the failed run ID

## Agent Orchestration Checks

- [ ] Lucy detected the eval failure (didn't proceed as if it succeeded)
- [ ] Lucy offered to retry (recoverable error)
- [ ] Lucy did NOT call `analyze_evaluation` on a failed job
- [ ] Lucy maintained pipeline position (didn't reset workflow)
