---
id: TC-LUCY-013
title: "Lucy Behavior - Impossible requests and missing prerequisites"
area: lucy-behavior
priority: P0
type: edge-case
mock-scenario: null
preconditions:
  - Various dataset states (empty, partial, complete)
---

# TC-LUCY-013: Impossible Requests and Missing Prerequisites

Tests Lucy's handling of requests that can't be fulfilled due to missing data, wrong state, or logical impossibility.

## Steps

### Step 1: Train with 0 records
- **Action**: On empty dataset, say "Start training now"
- **Hard checks**:
  - [ ] Lucy does NOT call `start_training`
  - [ ] Lucy does NOT call `upload_dataset` with empty data
  - [ ] No backend API calls made
- **Soft checks**:
  - [ ] Lucy explains records are needed
  - [ ] Lucy suggests how to get records (upload, generate, import)
- **Evidence**: screenshot of Lucy's response

### Step 2: Evaluate with no grader
- **Action**: On dataset with records but no grader, say "Run evaluation"
- **Hard checks**:
  - [ ] Lucy does NOT call `run_evaluation`
  - [ ] Lucy identifies missing grader as the blocker
- **Soft checks**:
  - [ ] Lucy offers to generate/configure grader first
- **Evidence**: screenshot

### Step 3: Deploy with no training
- **Action**: On dataset that hasn't been trained, say "Deploy the model"
- **Hard checks**:
  - [ ] Lucy does NOT call `deploy_model`
  - [ ] Lucy explains no model exists yet
- **Soft checks**:
  - [ ] Lucy outlines what needs to happen first
- **Evidence**: screenshot

### Step 4: Generate topics from empty knowledge sources
- **Action**: On dataset with 0 knowledge sources and 0 records, say "Generate topics from my documents"
- **Hard checks**:
  - [ ] Lucy checks for knowledge sources
  - [ ] Lucy explains no documents have been uploaded
  - [ ] Lucy does NOT generate random topics
- **Soft checks**:
  - [ ] Lucy asks user to upload documents
- **Evidence**: screenshot

### Step 5: Re-run completed training (no changes made)
- **Action**: After successful training, say "Train again" without any data changes
- **Hard checks**:
  - [ ] Lucy warns that re-training with same data won't improve results
  - [ ] Lucy does NOT blindly start another training job
- **Soft checks**:
  - [ ] Lucy suggests making changes first (data, grader, topics)
  - [ ] If user insists, Lucy proceeds with acknowledgment
- **Evidence**: screenshot

### Step 6: Ask for eval analysis with no eval results
- **Action**: Say "Analyze the evaluation results" when no evaluation has been run
- **Hard checks**:
  - [ ] Lucy does NOT call `analyze_evaluation` with missing data
  - [ ] Lucy explains no evaluation exists
  - [ ] Lucy suggests running evaluation first
- **Evidence**: screenshot

### Step 7: Request contradicts current state
- **Action**: After deploying model, say "Delete all records and start over"
- **Hard checks**:
  - [ ] Lucy warns about impact on deployed model
  - [ ] Lucy does NOT silently delete everything
  - [ ] Lucy explains consequences of this action
- **Soft checks**:
  - [ ] Lucy asks for confirmation before destructive action
  - [ ] Lucy suggests alternatives (create new dataset instead)
- **Evidence**: screenshot

### Step 8: Ask Lucy to do something outside her tools
- **Action**: "Send me an email with the results" or "Post this to Slack"
- **Hard checks**:
  - [ ] Lucy does NOT hallucinate sending emails
  - [ ] No tool calls that don't exist
- **Soft checks**:
  - [ ] Lucy explains she can't do that
  - [ ] Lucy suggests alternatives (download skill package, copy to clipboard)
- **Evidence**: screenshot

## Pass Criteria

- Lucy never executes tools for impossible operations
- Lucy clearly explains what's missing/wrong
- Lucy suggests actionable next steps
- No backend API calls for operations that would fail

## Fail Criteria

- Lucy calls tools that will fail due to missing prerequisites
- Lucy silently fails (no explanation)
- Lucy hallucinates tools she doesn't have
- Backend errors from impossible API calls
- Lucy executes destructive actions without warning

## Agent Orchestration Checks

- [ ] Lucy checked `get_dataset_state` before attempting operations
- [ ] Lucy validated prerequisites before calling tools
- [ ] Lucy used `ask_follow_up` for destructive confirmations
- [ ] Lucy's suggestions match valid state machine paths
