---
id: TC-CC-004
title: "Stale Data Detection: Old results don't bleed into new runs"
area: cross-cutting
priority: P0
type: regression
mock-scenario: varies
preconditions:
  - Dataset with completed eval results
  - Ability to switch mock scenarios
---

# TC-CC-004: Stale Data Detection

Tests that old evaluation/training results don't persist in the UI when new runs produce different results.

## Steps

### Step 1: Run eval with healthy scenario
```bash
curl -X POST http://localhost:9091/mock/scenario -d '{"evalScenario":"healthy"}'
```
- **Action**: Lucy runs eval → healthy results (mean ~0.65)
- **Record**: Screenshot of healthy eval results

### Step 2: Switch scenario to warning
```bash
curl -X POST http://localhost:9091/mock/scenario -d '{"evalScenario":"warning"}'
```
- **Action**: Ask Lucy to run another evaluation
- **Expected**: New results replace old ones
- **Hard checks**:
  - [ ] New eval results show warning scores (~0.42)
  - [ ] Old healthy scores (~0.65) NOT visible in current results
  - [ ] LucyAnalyzeEvalRenderer shows "Warning" not "Healthy"
  - [ ] Eval run ID is different from the first run
  - [ ] No mixing of old and new scores in the display

### Step 3: Check iteration history
- **Hard checks**:
  - [ ] Both eval runs appear in iteration history (if maintained)
  - [ ] History shows run 1 = healthy, run 2 = warning
  - [ ] Current/active result is the warning run (not healthy)

### Step 4: Run training after switching scenario
```bash
curl -X POST http://localhost:9091/mock/scenario -d '{"trainingScenario":"overfitting"}'
```
- **Action**: Switch training scenario and start training
- **Hard checks**:
  - [ ] Training results show overfitting pattern
  - [ ] No improving pattern data from TC-TRN-001 visible
  - [ ] LucyAnalyzeTrainingRenderer shows "Overfitting" not "Improving"

### Step 5: Refresh and verify
- **Action**: Refresh the page
- **Hard checks**:
  - [ ] Latest results still shown (not reverted to old ones)
  - [ ] No stale data from previous scenarios

## Pass Criteria

- New results completely replace old results in current view
- Iteration history correctly tracks all runs
- No mixing of old and new data
- Scenario switches produce different, correct results

## Fail Criteria

- Old scores visible alongside or instead of new scores
- Health badge doesn't update after scenario switch
- Analysis references wrong eval run data
- Refresh restores stale data
