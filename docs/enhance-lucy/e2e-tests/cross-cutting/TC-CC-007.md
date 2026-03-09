---
id: TC-CC-007
title: "Notification Badge - Lifecycle across sidebar states"
area: cross-cutting
priority: P1
type: regression
mock-scenario: '{\"evalScenario\":\"healthy\",\"evalPollsBeforeComplete\":0}'
preconditions:
  - Dataset with grader configured
  - Lucy sidebar can be collapsed
---

# TC-CC-007: Notification Badge Lifecycle

Tests the notification badge system across all sidebar states: open, closed, collapsed, after review.

## Steps

### Step 1: Badge appears when job completes while sidebar is collapsed
- **Action**: Start evaluation via Lucy, collapse sidebar, wait for completion
- **Hard checks**:
  - [ ] Badge appears on collapsed sidebar icon
  - [ ] Badge count = 1 (for one unreviewed job)
  - [ ] Badge is visually noticeable
- **Evidence**: screenshot of badge on collapsed sidebar

### Step 2: Badge count increments with multiple jobs
- **Action**: Run 2 evaluations, keep sidebar collapsed
- **Hard checks**:
  - [ ] Badge count = 2
  - [ ] Both jobs tracked as unreviewed in DryRunJobsContext
  - [ ] Badge doesn't exceed actual unreviewed count
- **Evidence**: screenshot of badge showing 2

### Step 3: Expanding sidebar shows unreviewed results
- **Action**: Expand sidebar with badge showing
- **Hard checks**:
  - [ ] Lucy catches up on completed jobs
  - [ ] `analyze_evaluation` called for each unreviewed result
  - [ ] LucyAnalyzeEvalRenderer appears for each
  - [ ] Badge count decrements as jobs are reviewed
- **Evidence**: screenshot of catch-up in expanded sidebar

### Step 4: Badge clears after review
- **Action**: After Lucy reviews all results (mark_job_reviewed)
- **Hard checks**:
  - [ ] Badge disappears completely (count = 0)
  - [ ] Re-collapsing and expanding doesn't show badge again
  - [ ] DryRunJobsContext shows no unreviewed jobs
  - [ ] No phantom badges from stale event listeners
- **Evidence**: screenshot of cleared badge

### Step 5: Badge survives page refresh
- **Action**: With badge showing, refresh the page
- **Hard checks**:
  - [ ] Badge reappears after refresh (unreviewed state persisted)
  - [ ] Count is correct after refresh
  - [ ] Opening sidebar triggers catch-up
- **Evidence**: screenshot of badge after refresh

### Step 6: Failed job badge
- **Action**: Start evaluation that fails, with sidebar collapsed
- **Hard checks**:
  - [ ] Badge appears for failed job too
  - [ ] Lucy acknowledges the failure on sidebar open
  - [ ] Failed job marked as reviewed after Lucy addresses it
  - [ ] Badge clears after review
- **Evidence**: screenshot of failed job badge

## Pass Criteria

- Badge accurately reflects unreviewed job count
- Badge appears/clears at correct moments
- Badge persists across page refresh
- Both completed and failed jobs tracked

## Fail Criteria

- Badge doesn't appear when it should
- Badge count incorrect (phantom badges or missing)
- Badge doesn't clear after review
- Badge lost on page refresh
- Failed jobs don't trigger badge
