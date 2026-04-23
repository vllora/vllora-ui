---
id: TC-DU-004
title: "Dummy User - Skips steps or does things out of order"
area: dummy-user
priority: P0
type: edge-case
mock-scenario: null
preconditions:
  - Dataset exists at various pipeline stages
  - Lucy sidebar open
---

# TC-DU-004: Out-of-Order Actions and Step Skipping

Tests what happens when a user tries to do things in the wrong order, skip required steps, or jump ahead in the pipeline.

## Steps

### Step 1: Try to categorize without topics
- **Action**: Tell Lucy "Categorize my records" on dataset with NO topics
- **Hard checks**:
  - [ ] Lucy does NOT call `categorize_records` without topics
  - [ ] Lucy explains topics must be configured first
  - [ ] Lucy suggests generating or setting up topics
- **Evidence**: screenshot of Lucy's response

### Step 2: Try to generate data without topics
- **Action**: Tell Lucy "Generate 50 records" on dataset with NO topics
- **Hard checks**:
  - [ ] Lucy handles this gracefully
  - [ ] Either: generates without topics (if allowed) or explains topics needed
  - [ ] No crash from missing topic references
- **Evidence**: screenshot

### Step 3: Try rapid pipeline: jump from empty to evaluation
- **Action**: On brand new empty dataset, say "Run evaluation right now"
- **Hard checks**:
  - [ ] Lucy does NOT attempt to evaluate empty dataset
  - [ ] Lucy identifies ALL missing prerequisites (topics, records, grader)
  - [ ] Lucy proposes a plan to get from current state to evaluation
  - [ ] Proposed steps are in correct order
- **Soft checks**:
  - [ ] Lucy's explanation is clear and structured
- **Evidence**: screenshot of Lucy's response

### Step 4: Re-run a completed step
- **Action**: After pipeline is at "training", tell Lucy "Regenerate topics"
- **Hard checks**:
  - [ ] Lucy warns about impact on downstream steps
  - [ ] If user confirms: rollback happens correctly
  - [ ] Workflow state machine rolls back to appropriate step
  - [ ] Downstream data (categorization, coverage) is invalidated or re-run
- **Soft checks**:
  - [ ] Lucy explains what will be affected by re-running this step
- **Evidence**: screenshot of rollback warning

### Step 5: Quick path: skip all prep, go straight to grader
- **Action**: On dataset with records but no topics, say "Just set up the grader and evaluate"
- **Hard checks**:
  - [ ] State machine allows not_started → grader_config transition
  - [ ] Lucy configures grader without topics/categorization
  - [ ] Evaluation runs successfully
  - [ ] No errors from missing topic references in results

## Pass Criteria

- Lucy prevents impossible operations with clear explanations
- State machine enforces step ordering correctly
- Quick paths work where the state machine allows them
- Rollbacks properly invalidate downstream data

## Fail Criteria

- Lucy executes tools without required prerequisites
- Backend API calls made with missing data
- State machine allows invalid transitions
- Rollback leaves data in inconsistent state
- App crashes from out-of-order operations

## Agent Orchestration Checks

- [ ] Lucy checked workflow state before executing tools
- [ ] Lucy used `get_dataset_state` to understand current position
- [ ] Lucy's suggestions match valid state machine transitions
- [ ] Rollback properly used `rollback_to_step` (not manual state manipulation)
