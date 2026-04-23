---
id: TC-POLL-002
title: "Polling - Page refresh while actively polling"
area: polling
priority: P0
type: edge-case
mock-scenario: '{"evalScenario":"healthy","evalPollsBeforeComplete":10}'
preconditions:
  - Dataset with grader configured
  - Mock server running with high poll count (10+)
---

# TC-POLL-002: Page Refresh While Actively Polling

Tests that refreshing the page during active polling properly resumes polling via the DryRunPollingManager's `initialize()` cold-start recovery.

## Steps

### Step 1: Start evaluation with many polls
- **Action**: Set mock to `evalPollsBeforeComplete: 10`, start eval via Lucy
- **Hard checks**:
  - [ ] Job status is "running"
  - [ ] Polling is active (network requests visible every ~6 seconds)
- **Evidence**: screenshot of running job + network tab

### Step 2: Refresh page after 2-3 polls
- **Action**: Wait for 2-3 polls (12-18 seconds), then hard refresh (F5 / Cmd+R)
- **Hard checks**:
  - [ ] Page reloads without error
  - [ ] Job still shows "running" status (not lost)
  - [ ] DryRunPollingManager.initialize() resumes polling
  - [ ] Network tab shows polling resumes within seconds of page load
  - [ ] Poll count continues from where it left off (job eventually completes)
- **Evidence**: screenshot of resumed polling after refresh

### Step 3: Verify job completes after refresh
- **Action**: Wait for remaining polls to complete
- **Hard checks**:
  - [ ] Job transitions to "completed"
  - [ ] Results appear correctly
  - [ ] Lucy catches up with analysis
  - [ ] No duplicate job entries from refresh
- **Evidence**: screenshot of completed job

### Step 4: Double refresh during polling
- **Action**: Start new eval, refresh twice rapidly during polling
- **Hard checks**:
  - [ ] No duplicate polling intervals created
  - [ ] Single job entry (not duplicated)
  - [ ] Polling resumes normally after double refresh
  - [ ] Job completes successfully
- **Evidence**: network tab showing single polling stream

## Pass Criteria

- Polling resumes automatically after page refresh
- No duplicate jobs or polling intervals
- Job completes normally despite refresh interruption
- Cold-start recovery via `initialize()` works correctly

## Fail Criteria

- Polling doesn't resume after refresh (job stuck as "running")
- Duplicate polling intervals (double network requests)
- Job lost from IndexedDB after refresh
- Multiple job entries created by refresh
