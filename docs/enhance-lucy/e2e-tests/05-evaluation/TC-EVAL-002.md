---
id: TC-EVAL-002
title: "Evaluation - Warning scenario: Mixed results, Lucy suggests iteration"
area: evaluation
priority: P0
type: edge-case
mock-scenario: '{"evalScenario":"warning","evalPollsBeforeComplete":1}'
preconditions:
  - Dataset with grader configured
  - Mock scenario set to warning
---

# TC-EVAL-002: Evaluation - Warning Scenario

## Mock Setup

```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"warning","evalPollsBeforeComplete":1}'
```

Expected mock response: mean ~0.42, mixed topics (some failing), `next_action: "iterate"`

## Preconditions

- Dataset with grader configured
- Mock scenario set to `warning`

## Steps

### Step 1: Run evaluation
- **Action**: Lucy calls `run_evaluation`
- **Hard checks**:
  - [ ] Eval job created and completes
  - [ ] Mean score displayed (~0.42 for warning)

### Step 2: Lucy analyzes warning results
- **Action**: Lucy calls `analyze_evaluation`
- **Expected**: Warning-level analysis with iteration recommendation
- **Hard checks**:
  - [ ] LucyAnalyzeEvalRenderer appears
  - [ ] Health badge shows "Warning" (yellow/amber)
  - [ ] Action badge shows "Iterate"
  - [ ] `next_action` is "iterate"
  - [ ] Per-topic breakdown shows which topics are failing
  - [ ] Recommendations mention specific topics to improve
- **Evidence**: screenshot of warning analysis

### Step 3: Lucy suggests iteration (inner loop)
- **Action**: After warning analysis, Lucy should suggest improvements
- **Expected**: Lucy proposes iterating on the dataset or grader
- **Hard checks**:
  - [ ] Lucy does NOT proceed to training (wrong for warning scenario)
  - [ ] Lucy proposes concrete next steps (adjust topics, more data, tweak grader)
- **Soft checks**:
  - [ ] Lucy identifies which topics have low scores
  - [ ] Lucy suggests specific improvements
  - [ ] Lucy mentions this is iteration, not a dead end
- **Evidence**: screenshot of Lucy's iteration suggestion

### Step 4: Verify iteration state
- **Action**: Check workflow state
- **Hard checks**:
  - [ ] Workflow state records the evaluation result
  - [ ] Iteration history shows this eval run
  - [ ] `dryRun.verdict` is "WARNING" or "NO-GO"
- **Evidence**: IndexedDB state check

## Pass Criteria

- Warning scenario produces correct health badge and action recommendation
- Lucy correctly identifies this as needing iteration (not training)
- Per-topic breakdown highlights failing topics
- Lucy does NOT proceed to training

## Fail Criteria

- Health badge shows "Healthy" (wrong classification)
- `next_action` is "train" (should be "iterate" for warning)
- Lucy proceeds to training despite warning
- No topic-level breakdown shown

## Agent Orchestration Checks

- [ ] Lucy analyzed eval results (called `analyze_evaluation`)
- [ ] Lucy's decision: iterate, NOT train (critical distinction)
- [ ] Lucy proposed concrete improvements (not just "try again")
- [ ] Lucy did not skip analysis and go straight to training
