---
id: TC-CC-010
title: "Catch-Up After Failed Job — Error Diagnosis on Return"
area: cross-cutting
priority: P1
type: error-case
mock-scenario: '{"evalScenario":"error","evalPollsBeforeComplete":0}'
preconditions:
  - Dataset at eval-ready state
  - Second dataset exists for navigation target
---

# TC-CC-010: Catch-Up After Failed Job

## Purpose

Verify the failed-job catch-up protocol: when an eval job fails while the user is away, Lucy catches up on return with error context and recovery suggestions.

## Mock Setup

```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"error","evalPollsBeforeComplete":0}'
```

## Preconditions

- Dataset A at eval-ready state
- Dataset B exists (navigation target)

## Steps

### Step 1: Start eval on Dataset A

- **Action**: Ask Lucy to run evaluation
- **Hard checks**:
  - [ ] Eval job created

### Step 2: Navigate away — eval fails in background

- **Action**: Navigate to Dataset B
- **Hard checks**:
  - [ ] Eval fails in background (error scenario)
  - [ ] Job status updated to "failed" in IndexedDB

### Step 3: Check for error notification badge

- **Action**: Observe sidebar
- **Hard checks**:
  - [ ] Notification badge appears (amber dot)
  - [ ] Badge visible while on Dataset B
- **Evidence**: screenshot of badge

### Step 4: Navigate back to Dataset A

- **Action**: Click on Dataset A
- **Hard checks**:
  - [ ] Lucy catches up with error context
  - [ ] `buildCatchUpContext` detects unreviewed failed job
  - [ ] Lucy mentions the failure and error message
  - [ ] Lucy suggests recovery options (retry, fix grader, etc.)

### Step 5: Verify no re-execution

- **Action**: Observe Lucy's behavior after catch-up
- **Hard checks**:
  - [ ] Lucy does NOT automatically re-run the eval
  - [ ] Lucy waits for user to decide next action
  - [ ] Failed job marked as reviewed
- **Evidence**: screenshot of error catch-up message

## Pass Criteria

- Failed job detected on return
- Lucy presents error context with recovery suggestions
- No automatic re-execution (user decides)
- Job marked as reviewed after catch-up

## Fail Criteria

- Lucy ignores the failed job
- Lucy automatically retries without user consent
- No error context provided (just generic "something went wrong")
- Badge doesn't appear for failed jobs
