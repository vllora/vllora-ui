---
id: TC-GRD-001
title: "Grader Config - Happy Path: Generate and configure evaluator"
area: grader
priority: P0
type: happy-path
mock-scenario: null
preconditions:
  - Dataset with topics, categorized records, coverage complete
  - Lucy sidebar open
---

# TC-GRD-001: Grader Config - Happy Path

## Preconditions

- Dataset has completed topics + categorization + coverage steps
- Records exist with good topic distribution
- Lucy sidebar is open

## Steps

### Step 1: Lucy generates grader
- **Action**: During plan execution, Lucy calls `generate_grader`
- **Expected**: LLM generates evaluation criteria and JS grader script
- **Hard checks**:
  - [ ] `generate_grader` tool execution card appears
  - [ ] Tool completes successfully
  - [ ] Grader script content is generated (not empty)
- **Soft checks**:
  - [ ] Lucy describes what the grader evaluates
  - [ ] Criteria are relevant to the dataset's task domain
- **Evidence**: screenshot of grader generation

### Step 2: Grader saved via configure_grader
- **Action**: Lucy calls `configure_grader` to save the script
- **Expected**: Grader persisted to dataset
- **Hard checks**:
  - [ ] `configure_grader` tool execution card shows success
  - [ ] Evaluator section in dataset detail shows the grader
  - [ ] EvaluatorEditor displays the JS script content
  - [ ] `graderConfig.type` is 'js' in workflow state
  - [ ] `graderConfig.configuredAt` is set (non-null timestamp)
- **Evidence**: screenshot of evaluator editor

### Step 3: Grader synced to backend
- **Action**: Lucy calls `sync_evaluator` to push grader to backend
- **Expected**: Backend acknowledges the grader update
- **Hard checks**:
  - [ ] `sync_evaluator` tool execution card shows success
  - [ ] Network request to `PATCH /finetune/datasets/:id/evaluator` succeeded (200)
  - [ ] No error toast or console error
- **Evidence**: network request log

### Step 4: Test grader on sample records
- **Action**: Lucy calls `test_grader_sample` to validate the grader works
- **Expected**: Sample records scored, results shown
- **Hard checks**:
  - [ ] `test_grader_sample` tool shows results
  - [ ] Sample scores are in valid range (0-1)
  - [ ] At least some scores > 0 (grader not always-failing)
  - [ ] At least some scores < 1 (grader not always-passing)
- **Soft checks**:
  - [ ] Lucy interprets the sample results
  - [ ] Lucy proceeds to evaluation or asks about adjustments
- **Evidence**: screenshot of sample test results

### Step 5: Verify grader in UI
- **Action**: Navigate to the Evaluator tab in dataset detail
- **Hard checks**:
  - [ ] EvaluatorEditor shows the saved JS script
  - [ ] Script is syntactically valid JavaScript
  - [ ] "Evaluator" tab is accessible and shows content
  - [ ] No stale grader from a previous dataset
- **Evidence**: screenshot of evaluator tab

## Pass Criteria

- Grader generated, saved, and synced successfully
- Sample test produces valid scores with variance
- Grader script visible in UI editor
- Workflow state shows `graderConfig` populated

## Fail Criteria

- Grader script is empty or null
- Sample test returns all 0s or all 1s (useless grader)
- Sync to backend fails (network error)
- Evaluator tab shows stale or wrong grader

## Agent Orchestration Checks

- [ ] Lucy called `generate_grader` BEFORE `configure_grader` (correct order)
- [ ] Lucy called `sync_evaluator` after configuring grader
- [ ] Lucy tested the grader before proceeding to evaluation
- [ ] Lucy did NOT call `generate_grader` again during execution (planning-only tool)
- [ ] After grader config, Lucy advanced to dry run / evaluation step
