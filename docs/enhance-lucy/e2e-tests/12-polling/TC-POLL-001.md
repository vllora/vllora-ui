---
id: TC-POLL-001
title: "Polling - Network error during active polling"
area: polling
priority: P0
type: edge-case
mock-scenario: '{"evalScenario":"healthy","evalPollsBeforeComplete":5}'
preconditions:
  - Dataset with grader configured
  - Mock server running in proxy mode
---

# TC-POLL-001: Network Error During Active Polling

Tests that the polling manager handles network failures gracefully — retries, recovers, and eventually fails with a clear message if the backend stays down.

## Steps

### Step 1: Start evaluation and verify polling begins
- **Action**: Start eval via Lucy, verify status shows "running"
- **Hard checks**:
  - [ ] `run_evaluation` tool fires successfully
  - [ ] Job status transitions to "running"
  - [ ] DryRunPollingManager starts polling (visible in console or network tab)
- **Evidence**: screenshot of running job

### Step 2: Kill mock server mid-poll
- **Action**: After 1-2 successful polls, stop the mock server process
- **Hard checks**:
  - [ ] UI does NOT crash
  - [ ] Job status does NOT immediately change to "failed"
  - [ ] DryRunPollingManager increments error counter (not crash)
  - [ ] No unhandled promise rejection in console
- **Evidence**: screenshot of UI during network failure

### Step 3: Restart mock server before error threshold
- **Action**: Restart mock server within a few seconds (before 150 consecutive errors)
- **Hard checks**:
  - [ ] Polling resumes automatically
  - [ ] Error counter resets on successful poll
  - [ ] Job eventually completes normally
  - [ ] Results appear correctly in UI
  - [ ] Lucy catches up and analyzes results
- **Evidence**: screenshot of recovered job completion

### Step 4: Kill mock server and let error threshold trigger
- **Action**: Start another eval, kill mock server, wait for consecutive error threshold (150 errors)
- **Hard checks**:
  - [ ] Job status changes to "failed" after threshold
  - [ ] Error message is user-friendly (not raw network error)
  - [ ] Error toast appears with clear explanation
  - [ ] Polling stops (no more network requests in background)
  - [ ] Lucy acknowledges the failure if sidebar is open
- **Evidence**: screenshot of failure message

## Pass Criteria

- Network errors during polling don't crash the app
- Recovery works when backend comes back
- Clear failure message after error threshold
- Polling stops cleanly after failure

## Fail Criteria

- App crashes on network error during poll
- Job stuck in "running" forever after backend failure
- No error message shown to user
- Polling continues after job marked as failed
- Unhandled promise rejections in console
