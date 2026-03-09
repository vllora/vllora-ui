---
id: TC-CC-006
title: "Multi-Dataset - Context switching and data isolation"
area: cross-cutting
priority: P0
type: regression
mock-scenario: null
preconditions:
  - 2+ datasets at different pipeline stages
  - Lucy sidebar available
---

# TC-CC-006: Multi-Dataset Context Switching

Tests that switching between datasets properly isolates state, Lucy context, and UI data.

## Steps

### Step 1: Open Dataset A, chat with Lucy, switch to Dataset B
- **Action**: Open Dataset A → chat with Lucy about topics → navigate to Dataset B
- **Hard checks**:
  - [ ] Dataset B loads with its OWN data (not A's)
  - [ ] Lucy's chat history is specific to each dataset
  - [ ] Workflow progress shows B's state (not A's)
  - [ ] Quick actions reflect B's pipeline stage
  - [ ] Overview stats match B's records/topics
- **Evidence**: screenshots of both datasets showing distinct data

### Step 2: Verify no data bleed between datasets
- **Action**: Switch rapidly between Dataset A and B (5+ times)
- **Hard checks**:
  - [ ] No topics from A appearing in B (or vice versa)
  - [ ] No records from A showing in B's records table
  - [ ] Eval results are dataset-specific
  - [ ] Training jobs are dataset-specific
  - [ ] Workflow state never shows wrong pipeline stage
- **Evidence**: screenshots after rapid switching

### Step 3: Lucy operations on wrong dataset prevention
- **Action**: On Dataset A, tell Lucy "Generate topics". Then switch to Dataset B. Check Lucy's response.
- **Hard checks**:
  - [ ] Lucy's tool calls use the CORRECT dataset ID
  - [ ] No cross-contamination of generated data
  - [ ] If Lucy was mid-operation on A, it doesn't apply to B
- **Evidence**: verify tool call parameters in chat

### Step 4: Run jobs on different datasets simultaneously
- **Action**: Start evaluation on Dataset A, switch to Dataset B, start evaluation on B
- **Hard checks**:
  - [ ] Both evaluations run independently
  - [ ] Results arrive to correct datasets
  - [ ] Notification badges are dataset-specific
  - [ ] No results mixing between A and B
- **Evidence**: screenshots of both datasets with independent results

### Step 5: Delete one dataset, verify other unaffected
- **Action**: Delete Dataset A, verify Dataset B is completely untouched
- **Hard checks**:
  - [ ] Dataset B's records, topics, workflow intact
  - [ ] B's eval results preserved
  - [ ] B's Lucy chat history preserved
  - [ ] No orphaned references to deleted dataset

## Pass Criteria

- Complete data isolation between datasets
- Lucy's context is dataset-scoped
- Simultaneous operations don't interfere
- Deletion doesn't affect other datasets

## Fail Criteria

- Data from one dataset appears in another
- Lucy uses wrong dataset ID in tool calls
- Eval/training results delivered to wrong dataset
- Deletion cascades to other datasets
