---
id: TC-POLL-004
title: "Polling - Progress updates and UI feedback during polling"
area: polling
priority: P1
type: happy-path
mock-scenario: '{"evalScenario":"healthy","evalPollsBeforeComplete":5}'
preconditions:
  - Dataset with grader configured and records
  - Mock server configured for multiple polls
---

# TC-POLL-004: Progress Updates and UI Feedback During Polling

Tests that the UI shows meaningful progress updates during each poll cycle, not just at start and end.

## Steps

### Step 1: Start evaluation and observe progress updates
- **Action**: Start eval with 5 polls before complete, watch the UI
- **Hard checks**:
  - [ ] "Running" status visible immediately after job start
  - [ ] Progress indicator updates between polls (not static)
  - [ ] `pollingSnapshot` data updates on each poll (completed_rows changes)
  - [ ] Lucy shows status update (if sidebar open)
- **Evidence**: screenshots showing progress at poll 1, 3, and 5

### Step 2: Start training and observe SSE updates
- **Action**: Start training job, watch the UI for real-time updates
- **Hard checks**:
  - [ ] Training status shows in UI
  - [ ] Epoch/progress data updates via SSE (not polling interval)
  - [ ] Loss/metrics visible during training
  - [ ] Progress is more granular than eval (SSE vs polling)
- **Evidence**: screenshot of training progress mid-run

### Step 3: Verify completion notification
- **Action**: Wait for eval to complete
- **Hard checks**:
  - [ ] Status transitions from "running" to "completed"
  - [ ] Completion is detected on the poll that returns completed status
  - [ ] Results appear immediately after completion detected
  - [ ] No extra polls after job marked as completed
  - [ ] Polling interval cleared (no lingering timer)
- **Evidence**: network tab showing last poll + no further requests

### Step 4: Verify stall detection during polling
- **Action**: Set mock to stalled scenario, start eval
- **Hard checks**:
  - [ ] Stall detected when progress doesn't change across N polls
  - [ ] Stall warning shown to user
  - [ ] Lucy addresses stall if sidebar is open
  - [ ] Job doesn't keep polling forever (timeout eventually triggers)
- **Evidence**: screenshot of stall detection message

## Pass Criteria

- UI shows real-time progress during polling
- Polling stops immediately after completion
- SSE provides more granular training updates
- Stall detection works across multiple unchanged polls

## Fail Criteria

- Progress bar/indicator static during polling
- Extra polls after job is already completed
- No stall detection (polls forever with no progress)
- Memory leak from uncleaned polling interval
