---
id: TC-LUCY-006
title: "Lucy Behavior - Dataset state awareness and context-appropriate actions"
area: lucy-behavior
priority: P0
type: happy-path
mock-scenario: null
preconditions:
  - Datasets at various workflow stages available
---

# TC-LUCY-006: Dataset State Awareness

Tests that Lucy reads the current dataset state and adapts her behavior accordingly — she should NOT restart from scratch when resuming an in-progress dataset, and should offer the right actions based on what's already done.

## Overview

Lucy should call `get_dataset_state` (or equivalent) when opening a dataset and adapt:
- Empty dataset → offer to start from scratch (planning)
- Topics done, no grader → offer grader setup
- Grader done, no eval → offer evaluation
- Eval done (healthy) → offer training
- Training done → offer deployment
- Training done (overfitting) → offer investigation

## Scenario A: Resume dataset with topics + categorization complete

### Preconditions
- Dataset exists with topics and categorized records
- No grader configured yet
- Open Lucy sidebar on this dataset

### Steps

1. **Action**: Open Lucy on dataset with topics+categories done
2. **Expected**: Lucy reads state and offers appropriate next step
- **Hard checks**:
  - [ ] Lucy calls `get_dataset_state` or equivalent state-reading tool
  - [ ] Lucy does NOT call `generate_topics` (already done)
  - [ ] Lucy does NOT call `categorize_records` (already done)
  - [ ] Lucy recognizes topics and categorization are complete
- **Soft checks**:
  - [ ] Lucy says something like "I see you have topics and categorized records"
  - [ ] Lucy suggests next step: grader configuration or coverage analysis
  - [ ] Lucy does NOT say "Let's start by setting up topics"

---

## Scenario B: Resume dataset with grader + failed eval

### Preconditions
- Dataset has topics, records, grader configured
- Previous eval run failed
- Open Lucy sidebar

### Steps

1. **Action**: Open Lucy on dataset with failed eval
2. **Expected**: Lucy acknowledges the failure and offers retry
- **Hard checks**:
  - [ ] Lucy reads the failed eval state
  - [ ] Lucy does NOT try to start training (eval failed)
  - [ ] Lucy offers to retry evaluation
- **Soft checks**:
  - [ ] Lucy mentions the previous eval failed
  - [ ] Lucy suggests possible causes or asks if user wants to retry
  - [ ] Lucy does NOT pretend the eval succeeded

---

## Scenario C: Resume dataset after healthy eval (no training yet)

### Preconditions
- Dataset has healthy eval results
- Training not started yet
- Open Lucy sidebar

### Steps

1. **Action**: Open Lucy on dataset with healthy eval
2. **Expected**: Lucy offers to start training
- **Hard checks**:
  - [ ] Lucy reads the eval results
  - [ ] Lucy recognizes eval was healthy
  - [ ] Lucy suggests starting training as next step
  - [ ] Lucy does NOT re-run evaluation
- **Soft checks**:
  - [ ] Lucy references the eval scores ("Your eval scored 0.65, which looks good")
  - [ ] Lucy offers to proceed to training

---

## Scenario D: Resume dataset after completed training (improving)

### Preconditions
- Dataset has completed training with improving pattern
- Open Lucy sidebar

### Steps

1. **Action**: Open Lucy on dataset with completed training
2. **Expected**: Lucy offers deployment
- **Hard checks**:
  - [ ] Lucy reads training results
  - [ ] Lucy does NOT re-run training
  - [ ] Lucy suggests deployment or post-training evaluation
- **Soft checks**:
  - [ ] Lucy mentions training was successful
  - [ ] Lucy provides model info

---

## Scenario E: Resume dataset after completed training (overfitting)

### Preconditions
- Dataset has completed training with overfitting pattern
- Open Lucy sidebar

### Steps

1. **Action**: Open Lucy on dataset with overfitting training
2. **Expected**: Lucy offers investigation (NOT deployment)
- **Hard checks**:
  - [ ] Lucy reads the overfitting analysis
  - [ ] Lucy does NOT offer deployment
  - [ ] Lucy suggests investigation steps
- **Soft checks**:
  - [ ] Lucy mentions the overfitting pattern
  - [ ] Lucy suggests reducing epochs, more data, or using earlier checkpoint

---

## Pass Criteria

- Lucy correctly reads dataset state in ALL 5 scenarios
- Lucy offers the appropriate NEXT action (not repeating completed steps)
- Lucy does NOT restart from scratch on any resumption
- Lucy's suggestions align with the dataset's actual state

## Fail Criteria

- Lucy ignores existing state and starts from scratch
- Lucy offers wrong next step (e.g., training after failed eval)
- Lucy re-runs completed steps unnecessarily
- Lucy deploys after overfitting (doesn't read analysis)
- Lucy says "Let's set up topics" on a dataset that already has them

## Agent Orchestration Checks

- [ ] Lucy always reads state before suggesting actions
- [ ] Lucy's first tool call is a state-reading tool (not an execution tool)
- [ ] Lucy adapted her suggestion differently across all 5 scenarios
- [ ] Lucy demonstrated genuine state awareness (not just replaying a script)
