---
id: TC-EVAL-003
title: "Evaluation - Critical scenario: Stall detection and escalation"
area: evaluation
priority: P0
type: edge-case
mock-scenario: '{"evalScenario":"critical","evalPollsBeforeComplete":1}'
preconditions:
  - Dataset with grader configured
  - Mock scenario set to critical
---

# TC-EVAL-003: Evaluation - Critical Scenario + Stall Detection

## Mock Setup

```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"critical","evalPollsBeforeComplete":1}'
```

Expected mock response: mean ~0.18, binary 0/1 scores (grader issues), `next_action: "escalate"`

## Preconditions

- Dataset with grader configured
- Mock scenario set to `critical`

## Steps

### Step 1: Run evaluation with critical results
- **Action**: Lucy calls `run_evaluation`
- **Hard checks**:
  - [ ] Eval completes
  - [ ] Mean score very low (~0.18)
  - [ ] Scores show binary pattern (0s and 1s, little middle ground)

### Step 2: Lucy analyzes critical results
- **Action**: Lucy calls `analyze_evaluation`
- **Expected**: Critical analysis with escalation
- **Hard checks**:
  - [ ] LucyAnalyzeEvalRenderer appears
  - [ ] Health badge shows "Critical" (red)
  - [ ] Action badge shows "Escalate" or "Hard Stop"
  - [ ] `next_action` is "escalate"
  - [ ] Analysis identifies binary scoring pattern
  - [ ] Analysis suggests grader may be broken (not just data quality)
- **Evidence**: screenshot of critical analysis

### Step 3: Stall warning on PlanCard
- **Action**: Check if stall detection triggers
- **Expected**: If this is iteration 2+ with no improvement, stall warning appears
- **Hard checks (if applicable)**:
  - [ ] PlanCard shows stall warning badge (if iteration count >= 2)
  - [ ] `computeStallCount` correctly identifies consecutive non-improving iterations
  - [ ] Stall count displayed matches actual iteration history
- **Soft checks**:
  - [ ] Lucy mentions this might be a fundamental issue, not just needing more data
- **Evidence**: screenshot of PlanCard with stall warning

### Step 4: Lucy escalates (does not train)
- **Action**: After critical analysis, Lucy should escalate
- **Expected**: Lucy explains the issue and suggests fundamental changes
- **Hard checks**:
  - [ ] Lucy does NOT proceed to training
  - [ ] Lucy does NOT just suggest "add more data" (that's iterate, not escalate)
- **Soft checks**:
  - [ ] Lucy suggests checking the grader function
  - [ ] Lucy suggests the task might not be viable for RFT
  - [ ] Lucy recommends human review of sample results
- **Evidence**: screenshot of escalation message

### Step 5: Verify stall detection data
- **Action**: Check iteration history in IndexedDB
- **Hard checks**:
  - [ ] Iteration history records this critical eval
  - [ ] `dryRun.verdict` is "NO-GO"
  - [ ] Previous iterations (if any) are preserved
- **Evidence**: IndexedDB state

## Pass Criteria

- Critical scenario produces correct red badge and escalation
- Lucy does NOT proceed to training or simple iteration
- Stall detection works when applicable
- Binary scoring pattern identified in analysis

## Fail Criteria

- Health badge shows "Warning" or "Healthy" (misclassified)
- Lucy proceeds to training despite critical results
- Stall warning missing when iterations show no improvement
- Binary scoring pattern not mentioned in analysis

## Agent Orchestration Checks

- [ ] Lucy correctly identified critical (not warning) severity
- [ ] Lucy escalated (not iterated) — the key difference from TC-EVAL-002
- [ ] Lucy suggested grader investigation (not just more data)
- [ ] If stalled, Lucy suggested `check_viability` or fundamental approach change
