---
id: TC-LUCY-004
title: "Lucy Behavior - Mid-execution user intervention and course correction"
area: lucy-behavior
priority: P0
type: edge-case
mock-scenario: null
preconditions:
  - Lucy is executing an approved plan
---

# TC-LUCY-004: Mid-Execution User Intervention

Tests Lucy's ability to handle user interrupts during plan execution — can she pause, adjust, and resume?

## Preconditions

- Lucy has an approved plan and is currently executing
- Some steps complete, some pending

## Steps

### Step 1: Interrupt during execution
- **Action**: While Lucy is executing (e.g., after topics but before grader), send: "Wait, I want to change the topics before you continue"
- **Expected**: Lucy pauses execution
- **Hard checks**:
  - [ ] Lucy stops calling execution tools
  - [ ] Lucy acknowledges the interruption
  - [ ] Lucy does NOT continue executing while user is talking
- **Soft checks**:
  - [ ] Lucy asks what the user wants to change
  - [ ] Lucy does not express annoyance or confusion
- **Evidence**: screenshot of Lucy pausing

### Step 2: Make changes mid-pipeline
- **Action**: Tell Lucy "Add a topic about Defense Strategies"
- **Expected**: Lucy adjusts topics without restarting from scratch
- **Hard checks**:
  - [ ] Lucy calls `adjust_topic_hierarchy` (not starting over)
  - [ ] New topic added to existing hierarchy
  - [ ] Previously completed steps preserved (not lost)
  - [ ] `categorize_records` re-runs if topics changed (records need re-categorization)
- **Evidence**: screenshot of adjusted topics

### Step 3: Resume execution
- **Action**: Tell Lucy "OK, continue with the plan"
- **Expected**: Lucy resumes from where she left off (adjusted)
- **Hard checks**:
  - [ ] Lucy continues execution (not re-planning from scratch)
  - [ ] Lucy uses the UPDATED topics (with Defense Strategies)
  - [ ] Steps already completed are not repeated (unless affected by change)
  - [ ] Grader and subsequent steps work with updated data
- **Evidence**: screenshot of resumed execution

### Step 4: Verify final state reflects changes
- **Action**: After pipeline completes, verify the change is reflected
- **Hard checks**:
  - [ ] "Defense Strategies" topic exists in final dataset
  - [ ] Records categorized under the new topic
  - [ ] Grader evaluates the new topic's records
  - [ ] No artifacts from the pre-change state

## Pass Criteria

- Lucy pauses execution on user request
- Changes applied mid-pipeline without losing progress
- Execution resumes correctly with updated state
- Final result reflects the mid-pipeline change

## Fail Criteria

- Lucy ignores the interruption and continues executing
- Lucy restarts the entire pipeline from scratch
- Previous progress lost after the change
- Final result doesn't include the requested change
- Lucy gets confused and enters an inconsistent state

## Agent Orchestration Checks

- [ ] Lucy respected the user interrupt (stopped tool calls)
- [ ] Lucy used the right tool for mid-pipeline changes (`adjust_topic_hierarchy`, not `apply_topic_hierarchy`)
- [ ] Lucy correctly identified which subsequent steps needed re-running
- [ ] Lucy did NOT repeat steps unaffected by the change
- [ ] Lucy maintained coherent state throughout the interruption
