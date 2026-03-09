---
id: TC-CC-005
title: "Session Resumption / Catch-Up: Lucy reopens after background job completes"
area: cross-cutting
priority: P1
type: regression
mock-scenario: '{"evalScenario":"healthy","evalPollsBeforeComplete":0}'
preconditions:
  - Dataset with an eval or training job completed while sidebar was closed
---

# TC-CC-005: Session Resumption / Catch-Up

Tests Lucy's catch-up protocol — when the user closes the sidebar during a running job, then reopens it after the job completes, Lucy should acknowledge the completion and continue.

## Steps

### Step 1: Start eval and close sidebar
- **Action**: Lucy starts `run_evaluation`, then user closes the Lucy sidebar
- **Hard checks**:
  - [ ] Eval job continues in background (not cancelled by sidebar close)
  - [ ] Sidebar notification badge shows unreviewed job (when visible)

### Step 2: Wait for job to complete
- **Action**: Job completes via mock (instant with `evalPollsBeforeComplete: 0`)
- **Hard checks**:
  - [ ] Notification badge appears on sidebar icon
  - [ ] Job marked as unreviewed in `DryRunJobsContext`

### Step 3: Reopen sidebar
- **Action**: Open Lucy sidebar
- **Expected**: Lucy catches up — acknowledges the completed job
- **Hard checks**:
  - [ ] Lucy recognizes a job completed while she was away
  - [ ] Lucy calls `get_evaluation_details` to fetch results
  - [ ] Lucy calls `analyze_evaluation` on the completed results
  - [ ] LucyAnalyzeEvalRenderer appears with correct analysis
  - [ ] `mark_job_reviewed` called (clears notification badge)
- **Soft checks**:
  - [ ] Lucy says something like "Your evaluation completed while I was away"
  - [ ] Lucy continues the pipeline from where it left off
- **Evidence**: screenshot of catch-up behavior

### Step 4: Verify no duplicate processing
- **Hard checks**:
  - [ ] Lucy does NOT re-run the evaluation
  - [ ] Lucy does NOT analyze the same results twice
  - [ ] Only one analysis checkpoint in chat (not duplicated)
  - [ ] Notification badge cleared after review

### Step 5: Lucy continues pipeline
- **Action**: After catch-up, Lucy should continue
- **Hard checks**:
  - [ ] If eval was healthy, Lucy proceeds to training
  - [ ] If eval was warning, Lucy suggests iteration
  - [ ] Lucy's next action is appropriate for the eval results

### Step 6: Lucy responds to polling failure during catch-up
- **Action**: Set mock to `evalScenario: error` or kill mock server mid-poll. Close sidebar, wait for polling to fail (DryRunPollingManager hits error threshold), then reopen sidebar.
- **Hard checks**:
  - [ ] Lucy acknowledges the failed job (not silent)
  - [ ] Lucy calls `get_evaluation_details` and sees error/failed status
  - [ ] Lucy does NOT attempt to analyze a failed/incomplete result
  - [ ] Lucy suggests next steps (retry, check config, etc.)
  - [ ] Job marked as reviewed (notification badge clears)
- **Soft checks**:
  - [ ] Lucy explains what likely went wrong (network issue, server error)
  - [ ] Lucy offers to re-run the evaluation
- **Evidence**: screenshot of Lucy's error acknowledgment message

### Step 7: Lucy handles stalled job on catch-up
- **Action**: Set mock to return same progress on every poll (stalled). Close sidebar during polling, reopen after stall detection triggers.
- **Hard checks**:
  - [ ] Lucy recognizes job is stalled (not completed, not failed — stuck)
  - [ ] Lucy reports stall to user with relevant context
  - [ ] Lucy suggests action (cancel and retry, check server, wait longer)
  - [ ] Polling state is correctly reflected in UI
- **Soft checks**:
  - [ ] Lucy doesn't claim the job "completed" when it stalled
  - [ ] Lucy's tone is helpful, not alarming
- **Evidence**: screenshot of Lucy's stall acknowledgment

## Pass Criteria

- Lucy catches up on completed job when sidebar reopens
- Analysis is performed on the completed results (not re-running)
- Notification badge clears after catch-up
- Pipeline continues from correct point
- Lucy acknowledges failed/stalled jobs with helpful guidance
- Lucy does NOT analyze incomplete or failed results

## Fail Criteria

- Lucy ignores the completed job
- Lucy re-runs the evaluation instead of reviewing results
- Duplicate analysis entries in chat
- Notification badge doesn't clear
- Lucy doesn't continue the pipeline after catch-up
- Lucy silently ignores a failed or stalled job
- Lucy attempts to analyze results from a failed job
- Lucy claims a stalled job "completed successfully"

## Agent Orchestration Checks

- [ ] Lucy used `buildCatchUpContext` / catch-up protocol on reopen
- [ ] Lucy checked for unreviewed jobs via event listener
- [ ] Lucy analyzed results without re-running the job
- [ ] Lucy correctly resumed pipeline after catch-up
- [ ] Lucy distinguished between completed, failed, and stalled jobs during catch-up
- [ ] Lucy provided appropriate next steps for each job outcome
