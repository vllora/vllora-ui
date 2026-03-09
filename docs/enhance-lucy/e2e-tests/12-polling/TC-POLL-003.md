---
id: TC-POLL-003
title: "Polling - Multiple simultaneous jobs"
area: polling
priority: P0
type: edge-case
mock-scenario: '{"evalScenario":"healthy","evalPollsBeforeComplete":5}'
preconditions:
  - 2 datasets with grader configured
  - Mock server running in proxy mode
---

# TC-POLL-003: Multiple Simultaneous Polling Jobs

Tests that the polling manager correctly handles multiple jobs polling simultaneously — each with independent intervals, error counts, and completion.

## Steps

### Step 1: Start evaluation on Dataset A
- **Action**: Open Dataset A, start evaluation via Lucy
- **Hard checks**:
  - [ ] Job A starts polling
  - [ ] Status shows "running" for Dataset A
- **Evidence**: screenshot of running job A

### Step 2: Start evaluation on Dataset B while A is still polling
- **Action**: Switch to Dataset B, start another evaluation
- **Hard checks**:
  - [ ] Job B starts polling independently
  - [ ] Job A polling continues (not interrupted)
  - [ ] Network tab shows separate polling streams for A and B
  - [ ] Both jobs show "running" status
- **Evidence**: network tab showing two polling streams

### Step 3: Verify independent completion
- **Action**: Wait for both jobs to complete (may complete at different times)
- **Hard checks**:
  - [ ] Each job completes independently
  - [ ] Results arrive to correct dataset (no cross-contamination)
  - [ ] Job A results show in Dataset A only
  - [ ] Job B results show in Dataset B only
  - [ ] Lucy analysis triggered for each (dataset-specific)
  - [ ] Notification badges are dataset-specific
- **Evidence**: screenshots of both datasets with independent results

### Step 4: One job fails, other continues
- **Action**: Start two new evals, kill/restart mock server briefly to fail one
- **Hard checks**:
  - [ ] Failed job shows error, surviving job continues
  - [ ] No interference between failed and running job
  - [ ] Surviving job completes normally
  - [ ] Failed job's polling stops, surviving job's polling continues
- **Evidence**: screenshot showing one failed, one still running

## Pass Criteria

- Independent polling intervals per job
- Results delivered to correct datasets
- Job failure doesn't affect other running jobs
- No cross-contamination between simultaneous jobs

## Fail Criteria

- One job's polling interferes with another
- Results delivered to wrong dataset
- Failing one job stops all polling
- Duplicate results from simultaneous jobs
