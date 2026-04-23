---
id: TC-CC-009
title: "Catch-Up After Navigate Away — Job Completes in Background"
area: cross-cutting
priority: P1
type: edge-case
mock-scenario: '{"evalScenario":"healthy","evalPollsBeforeComplete":0}'
preconditions:
  - Dataset at eval-ready state
  - Second dataset exists for navigation target
---

# TC-CC-009: Catch-Up After Navigate Away

## Purpose

Verify the session catch-up protocol: when a user navigates away from a dataset while an eval job is running, the job completes in the background. When the user returns, Lucy catches up by presenting the results and analysis automatically.

## Mock Setup

```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"healthy","evalPollsBeforeComplete":0}'
```

## Preconditions

- Dataset A at eval-ready state (topics + records + grader configured)
- Dataset B exists (any state, used as navigation target)

## Steps

### Step 1: Start eval on Dataset A

- **Action**: Ask Lucy to run evaluation on Dataset A
- **Hard checks**:
  - [ ] Eval job created and polling starts
  - [ ] Job status visible in UI

### Step 2: Navigate to Dataset B

- **Action**: Click on Dataset B in the dataset list
- **Hard checks**:
  - [ ] Navigation succeeds to Dataset B
  - [ ] Polling continues in background (`DryRunPollingManager` survives navigation)
  - [ ] Eval completes while viewing Dataset B

### Step 3: Check for notification badge

- **Action**: Observe Lucy sidebar while on Dataset B
- **Hard checks**:
  - [ ] Notification badge (amber dot) appears on Lucy sidebar icon
  - [ ] Badge indicates Dataset A has unreviewed results
- **Evidence**: screenshot showing notification badge

### Step 4: Navigate back to Dataset A

- **Action**: Click on Dataset A in the dataset list
- **Hard checks**:
  - [ ] Lucy catches up automatically
  - [ ] `buildCatchUpContext` detects unreviewed completed job
  - [ ] Lucy presents: "Welcome back! Evaluation completed..."
  - [ ] Analysis card shown in chat

### Step 5: Verify badge clears

- **Action**: Observe badge state after catch-up
- **Hard checks**:
  - [ ] Notification badge clears after Lucy presents analysis
  - [ ] Job marked as reviewed (`reviewedByAgent: true`)
  - [ ] No duplicate analysis on next navigation away/back
- **Evidence**: screenshot showing cleared badge

## Pass Criteria

- Eval completes in background while user is on different dataset
- Notification badge appears to indicate pending results
- Lucy catches up on return with analysis + card
- Badge clears after catch-up

## Fail Criteria

- Eval job stops when user navigates away
- No notification badge appears
- Lucy doesn't catch up on return (user must manually ask)
- Badge persists after catch-up is presented
