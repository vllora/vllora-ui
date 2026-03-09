---
id: TC-LUCY-012
title: "Lucy Behavior - Plan cancellation mid-execution"
area: lucy-behavior
priority: P0
type: edge-case
mock-scenario: null
preconditions:
  - Dataset with approved plan actively executing
---

# TC-LUCY-012: Plan Cancellation Mid-Execution

Tests what happens when a user cancels a plan while Lucy is executing it. Cancellation should be clean, preserving all work done so far.

## Steps

### Step 1: Cancel plan via UI button
- **Action**: Approve plan, let 2-3 steps execute, then click "Cancel" button on plan execution progress
- **Hard checks**:
  - [ ] Current tool execution completes (not aborted mid-write)
  - [ ] Plan status changes from "executing" to "cancelled"/"dismissed"
  - [ ] LucyExecutePlanRenderer shows cancelled state
  - [ ] Data created by completed steps is PRESERVED (not rolled back)
  - [ ] Workflow state reflects the last completed step
  - [ ] No orphaned background operations
- **Evidence**: screenshot of cancelled plan with preserved data

### Step 2: Cancel plan via Lucy chat message
- **Action**: While plan is executing, type "Stop executing the plan" or "Cancel"
- **Hard checks**:
  - [ ] Lucy acknowledges cancellation request
  - [ ] Execution stops after current step completes
  - [ ] Lucy summarizes what was completed and what remains
  - [ ] User can re-start a new plan if desired
- **Soft checks**:
  - [ ] Lucy asks if user wants to modify and re-execute
- **Evidence**: screenshot of Lucy's cancellation response

### Step 3: Verify partial state is valid
- **Action**: After cancellation, check dataset state
- **Hard checks**:
  - [ ] Workflow state is at last completed step (not "executing")
  - [ ] Topics (if generated) are present and correct
  - [ ] Records (if generated) are present and correct
  - [ ] No half-written records (atomicity)
  - [ ] IndexedDB is consistent
- **Evidence**: screenshot of dataset state after cancel

### Step 4: Create new plan after cancellation
- **Action**: Say "Create a new plan" after cancelling previous
- **Hard checks**:
  - [ ] Lucy considers current state (partial completion)
  - [ ] New plan starts from where things left off (not from scratch)
  - [ ] No duplicate work proposed (e.g., don't re-generate existing topics)
  - [ ] Plan status properly transitions: cancelled → new proposed
- **Evidence**: screenshot of new plan acknowledging partial state

### Step 5: Cancel during a long-running step (data generation)
- **Action**: During `generate_initial_data` (which generates many records), cancel
- **Hard checks**:
  - [ ] Records generated BEFORE cancel are preserved
  - [ ] No partial/corrupted records
  - [ ] Record count is accurate (matches what was actually written)
  - [ ] Generation stops within reasonable time (not stuck)

## Pass Criteria

- Cancellation is clean and immediate (after current step)
- All completed work is preserved
- State is valid for re-planning
- No orphaned background operations

## Fail Criteria

- Cancellation corrupts data (half-written records)
- Completed steps' data lost on cancel
- Plan stuck in "executing" state after cancel
- Next plan doesn't account for partial completion
- Background operations continue after cancel
