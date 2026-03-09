---
id: TC-GRD-002
title: "Grader Config - Test sample, viability check, manual editing"
area: grader
priority: P1
type: edge-case
mock-scenario: null
preconditions:
  - Dataset with records and grader configured (TC-GRD-001 complete)
  - Lucy sidebar open
---

# TC-GRD-002: Grader Edge Cases

Tests grader testing, viability checking, manual script editing, and sync without re-upload.

## Steps

### Step 1: Test grader on sample records
- **Action**: Lucy calls `test_grader_sample` (or user triggers via Evaluator tab)
- **Hard checks**:
  - [ ] Sample evaluation runs on a few records
  - [ ] Results show per-record scores/verdicts
  - [ ] Scores are reasonable (not all 0 or all 1)
  - [ ] No grader script errors
- **Soft checks**:
  - [ ] Lucy comments on sample quality
- **Evidence**: screenshot of sample test results

### Step 2: Check viability
- **Action**: Lucy calls `check_viability` before proceeding to full eval
- **Hard checks**:
  - [ ] Viability result returned (viable/not_viable/uncertain)
  - [ ] If `not_viable`: Lucy suggests grader modifications
  - [ ] If `viable`: Lucy proceeds to evaluation
  - [ ] Lucy does NOT skip viability check and jump to training
- **Evidence**: screenshot of viability result

### Step 3: Manually edit grader script in Evaluator tab
- **Action**: Navigate to Evaluator tab → edit JavaScript evaluation function
- **Hard checks**:
  - [ ] JavaScript editor is editable
  - [ ] Changes can be saved
  - [ ] Judge instructions editor works
  - [ ] Output schema editor works
  - [ ] "Save" persists grader to dataset
- **Evidence**: screenshot of grader editor

### Step 4: Sync evaluator after manual edit
- **Action**: After manual grader edit, Lucy should sync without re-uploading full dataset
- **Hard checks**:
  - [ ] `sync_evaluator` tool fires (not full `upload_dataset`)
  - [ ] Sync completes successfully
  - [ ] New grader config active for next evaluation
  - [ ] Previous eval results NOT invalidated (preserved in history)
- **Evidence**: screenshot of sync confirmation

### Step 5: Lucy detects binary scoring (grader health issue)
- **Action**: If grader produces only 0/1 scores (no gradients)
- **Hard checks**:
  - [ ] `analyze_evaluation` flags `binary_scoring` in grader health
  - [ ] Lucy recommends adjusting grader to use gradient scoring
  - [ ] LucyAnalyzeEvalRenderer shows grader health warning
- **Evidence**: screenshot of grader health warning

## Pass Criteria

- Grader testing provides meaningful sample results
- Viability check prevents proceeding with broken graders
- Manual editing workflow is functional
- Sync updates grader without full re-upload
- Grader health issues detected and surfaced

## Fail Criteria

- Sample test crashes or returns empty results
- Viability check skipped, leading to wasted eval run
- Manual edits don't persist
- Sync fails, requiring full re-upload
- Binary scoring not detected by analysis
