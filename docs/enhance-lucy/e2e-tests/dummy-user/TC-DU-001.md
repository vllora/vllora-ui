---
id: TC-DU-001
title: "Dummy User - Modifies data while Lucy is executing"
area: dummy-user
priority: P0
type: edge-case
mock-scenario: '{\"evalScenario\":\"healthy\",\"evalPollsBeforeComplete\":1}'
preconditions:
  - Dataset with topics and records
  - Lucy actively executing a plan (mid-execution)
---

# TC-DU-001: User Modifies Data During Lucy Execution

Tests race conditions when a user manually changes data (topics, records, grader) while Lucy is actively executing tools. A "dummy user" won't wait for Lucy to finish.

## Steps

### Step 1: Start plan execution, then manually edit topics
- **Action**: Approve a plan, let Lucy start executing. While Lucy is on categorization or generation step, manually open topic dialog and rename a topic.
- **Hard checks**:
  - [ ] App does NOT crash
  - [ ] Lucy's ongoing tool execution completes (not corrupted)
  - [ ] Topic rename persists
  - [ ] If Lucy's next tool depends on topics, it uses the UPDATED topics
  - [ ] No "topic not found" errors from stale references
- **Evidence**: screenshot of topic rename during execution

### Step 2: Delete records while Lucy is generating
- **Action**: While Lucy is running `generate_initial_data`, go to records table and delete 3 existing records
- **Hard checks**:
  - [ ] Deletion succeeds
  - [ ] Record count updates correctly
  - [ ] Lucy's generation continues (doesn't crash from missing records)
  - [ ] No IndexedDB write conflicts (concurrent writes)
  - [ ] Final record count = (generated) + (existing - deleted)
- **Evidence**: screenshot of records table during generation

### Step 3: Change grader while evaluation is running
- **Action**: While Lucy is polling for evaluation results, manually edit the grader script in Evaluator tab
- **Hard checks**:
  - [ ] Grader edit saves successfully
  - [ ] Running evaluation completes with ORIGINAL grader (not mid-changed)
  - [ ] Lucy's analysis uses the completed eval results (not confused by grader change)
  - [ ] Next evaluation run uses the NEW grader
- **Evidence**: screenshots before/after grader change

### Step 4: Navigate away from dataset during execution
- **Action**: While Lucy is executing a multi-step plan, click on a different dataset in the grid
- **Hard checks**:
  - [ ] Plan execution continues in background (not cancelled)
  - [ ] Navigating back shows correct progress
  - [ ] No "dataset not found" errors
  - [ ] Lucy's chat history preserved when returning
- **Evidence**: screenshot of returning to dataset mid-execution

### Step 5: Upload knowledge source while plan is executing
- **Action**: During plan execution, drag-drop a new PDF into Lucy chat
- **Hard checks**:
  - [ ] Upload is accepted
  - [ ] Plan execution is NOT interrupted
  - [ ] New knowledge source appears in panel
  - [ ] Lucy handles the upload gracefully (queues it, or acknowledges but continues plan)
  - [ ] No duplicate tool calls from competing workflows

## Pass Criteria

- App remains stable during all concurrent modifications
- No IndexedDB write conflicts or data corruption
- Lucy handles unexpected data changes gracefully
- Background execution continues when user navigates away

## Fail Criteria

- App crashes from race condition
- IndexedDB corruption (data loss, mangled records)
- Lucy's tools fail with stale data references
- Plan execution silently stops when user makes changes
- Duplicate data created from concurrent operations

## Agent Orchestration Checks

- [ ] Lucy's tool handlers use fresh data reads (not cached state)
- [ ] IndexedDB writes are atomic (no partial updates)
- [ ] Event emitters fire correctly for manual changes during execution
- [ ] No deadlocks between manual operations and Lucy's tools
