---
id: TC-POLL-005
title: "Polling - Job cancellation stops polling cleanly"
area: polling
priority: P1
type: edge-case
mock-scenario: '{"evalScenario":"healthy","evalPollsBeforeComplete":10}'
preconditions:
  - Dataset with grader configured
  - Mock server with high poll count
---

# TC-POLL-005: Job Cancellation Stops Polling Cleanly

Tests that cancelling a job during active polling properly cleans up the polling interval and doesn't leave orphaned background processes.

## Steps

### Step 1: Start evaluation and cancel via UI
- **Action**: Start eval with 10 polls, after 2-3 polls cancel via UI button (if available)
- **Hard checks**:
  - [ ] Cancel request sent to backend
  - [ ] Job status changes to "cancelled" or "failed"
  - [ ] Polling stops immediately (no more network requests)
  - [ ] Polling interval cleared from DryRunPollingManager
  - [ ] No lingering timers in background
- **Evidence**: network tab showing polling stops after cancel

### Step 2: Start evaluation and cancel via Lucy
- **Action**: Start eval, then tell Lucy "Cancel the evaluation"
- **Hard checks**:
  - [ ] Lucy calls appropriate cancellation tool
  - [ ] Polling stops after cancellation confirmed
  - [ ] Lucy acknowledges cancellation
  - [ ] Job marked as cancelled in IndexedDB
- **Evidence**: screenshot of Lucy's cancellation response

### Step 3: Start new evaluation after cancellation
- **Action**: After cancelling, start a fresh evaluation
- **Hard checks**:
  - [ ] New job starts with clean polling state
  - [ ] No interference from cancelled job's state
  - [ ] New job polls independently
  - [ ] Old cancelled job doesn't restart
- **Evidence**: screenshot of new job running cleanly

### Step 4: Navigate away during polling
- **Action**: Start eval, then navigate back to dataset grid (away from detail view)
- **Hard checks**:
  - [ ] Polling continues in background (DryRunPollingManager is singleton)
  - [ ] Navigating back to dataset shows correct job status
  - [ ] Job completes normally
  - [ ] Results appear when returning to dataset
- **Evidence**: screenshot of results after navigating back

## Pass Criteria

- Cancellation immediately stops polling
- No orphaned polling intervals after cancel
- New jobs work cleanly after cancellation
- Navigation away doesn't stop singleton polling

## Fail Criteria

- Polling continues after job cancelled
- Memory leak from uncleaned intervals
- Cancelled job's state interferes with new job
- Navigation away kills singleton polling
