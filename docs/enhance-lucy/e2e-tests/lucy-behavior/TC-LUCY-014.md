---
id: TC-LUCY-014
title: "Full Inner Loop Iteration Cycle: eval → analyze → propose → accept → re-eval → improve"
area: lucy-behavior
priority: P0
type: edge-case
mock-scenario: '{"evalScenario":"warning","evalPollsBeforeComplete":1}'
preconditions:
  - Dataset with topics + records + grader configured
  - Mock scenario starts as warning, then switches to healthy for second eval
---

# TC-LUCY-014: Full Inner Loop Iteration Cycle

## Purpose

Verify that the complete inner iteration loop works end-to-end: Lucy evaluates, analyzes warning results, proposes targeted changes, user accepts, Lucy executes changes, re-evaluates with improved scores, and recommends proceeding to training.

This is the **most critical gap** in test coverage — no existing test verifies the full iteration loop.

## Mock Setup

```bash
# First eval: warning scenario (mean ~0.42)
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"warning","evalPollsBeforeComplete":1}'
```

After first eval analysis completes and user accepts changes:
```bash
# Switch to healthy scenario for second eval (mean ~0.65)
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"healthy","evalPollsBeforeComplete":1}'
```

## Preconditions

- Dataset with topics configured, records generated, grader configured
- Mock data generation enabled (`localStorage.setItem('vllora_mock_data_generation', 'true')`)
- Mock scenario set to `warning`

## Steps

### Step 1: First evaluation — warning result

- **Action**: Ask Lucy to run evaluation on the dataset
- **Hard checks**:
  - [ ] Eval job created and completes
  - [ ] `analyze_evaluation` called automatically (auto-trigger event)

### Step 2: Lucy presents warning analysis

- **Action**: Lucy analyzes and presents results
- **Hard checks**:
  - [ ] LucyAnalyzeEvalRenderer appears in chat
  - [ ] Health badge shows "Warning"
  - [ ] Mean score ~0.42
  - [ ] Per-topic breakdown visible
  - [ ] `next_action` is "iterate" (NOT "train")
  - [ ] Recommendations reference specific weak topics
- **Evidence**: screenshot of warning analysis card

### Step 3: Lucy proposes targeted changes

- **Action**: Lucy proposes improvements based on analysis
- **Hard checks**:
  - [ ] Lucy proposes specific changes (e.g., regenerate records for weak topics)
  - [ ] Proposed changes mention specific topics from the analysis
  - [ ] Lucy does NOT proceed to training
- **Soft checks**:
  - [ ] Lucy explains WHY each change is proposed (references grader feedback)

### Step 4: User accepts proposed changes

- **Action**: User says "Yes, apply those changes" or similar
- **Hard checks**:
  - [ ] Lucy starts executing the changes
  - [ ] `regenerate_topic` or `generate_initial_data` step executes
  - [ ] New/modified records appear in the dataset

### Step 5: Switch mock scenario and re-evaluate

- **Action**: Switch mock to healthy scenario, Lucy re-evaluates
- **Mock**: Change scenario to `{"evalScenario":"healthy"}`
- **Hard checks**:
  - [ ] Second eval job created and completes
  - [ ] `analyze_evaluation` called with new results

### Step 6: Lucy presents improved analysis with delta

- **Action**: Lucy analyzes second eval results
- **Hard checks**:
  - [ ] LucyAnalyzeEvalRenderer appears with "Healthy" badge
  - [ ] Mean score ~0.65 (improved from ~0.42)
  - [ ] **Iteration comparison shown**: delta ~+0.23 from previous iteration
  - [ ] **Trend**: "improving"
  - [ ] `next_action` is "train" (scores now healthy)
- **Evidence**: screenshot of healthy analysis card with delta

### Step 7: Verify iteration history persistence

- **Action**: Check IndexedDB iteration state
- **Hard checks**:
  - [ ] `iterationState` has 2 history entries for this dataset
  - [ ] Entry 1: warning eval, decision = "iterate"
  - [ ] Entry 2: healthy eval, decision = "train"
  - [ ] `iterationNumber` is 2
- **Evidence**: IndexedDB state dump

## Pass Criteria

- Full iteration loop completes: eval → analyze (warning) → propose → accept → execute → re-eval → analyze (healthy with delta)
- Lucy correctly identifies when to iterate vs when to train
- Cross-iteration comparison shows improvement
- Iteration history persists with correct entries

## Fail Criteria

- Lucy proceeds to training after first warning eval (skips iteration)
- Second eval doesn't show delta from first eval
- Iteration history missing or incorrect
- Lucy doesn't reference specific topics in proposals

## Agent Orchestration Checks

- [ ] Lucy called `analyze_evaluation` after each eval
- [ ] Lucy called `log_iteration` to persist iteration records
- [ ] Lucy's decision after warning: iterate (not train)
- [ ] Lucy's decision after healthy: train (not iterate more)
- [ ] Lucy called `get_iteration_history` before second analysis (for comparison)
