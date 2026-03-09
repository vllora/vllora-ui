---
id: TC-LUCY-015
title: "Stall Detection Across Multiple Iterations — Escalation Ladder"
area: lucy-behavior
priority: P1
type: edge-case
mock-scenario: '{"evalScenario":"stalled","evalPollsBeforeComplete":1}'
preconditions:
  - Dataset with 3+ iteration history entries showing flat scores
  - Mock scenario set to stalled
---

# TC-LUCY-015: Stall Detection Across Multiple Iterations

## Purpose

Verify that Lucy detects when scores stall across 3+ iterations and escalates to a different approach lever. This tests the stall detection algorithm and the escalation ladder (L1→L2→L3).

## Mock Setup

```bash
# Stalled scenario: mean ~0.42, std ~0.03 (flat, no improvement)
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"stalled","evalPollsBeforeComplete":1}'
```

## Preconditions

- Dataset with topics + records + grader configured
- Either:
  - (A) Run 3 iterations with stalled scenario to build history naturally, OR
  - (B) Pre-seed iteration history in IndexedDB with 2 prior stalled entries

## Steps

### Step 1: Seed iteration history (if using approach B)

- **Action**: Inject 2 prior iteration entries via browser console / IndexedDB
  ```json
  {
    "iterationNumber": 2,
    "history": [
      { "iteration": 1, "mean_score": 0.41, "decision": "iterate" },
      { "iteration": 2, "mean_score": 0.42, "decision": "iterate" }
    ]
  }
  ```
- **Hard checks**:
  - [ ] Iteration state has 2 history entries
  - [ ] Both entries show small deltas (<0.03)

### Step 2: Run evaluation (iteration 3)

- **Action**: Ask Lucy to evaluate — stalled scenario (mean ~0.42 again)
- **Hard checks**:
  - [ ] Eval completes with mean ~0.42
  - [ ] `analyze_evaluation` called

### Step 3: Lucy detects stall and escalates

- **Action**: Lucy presents analysis with stall detection
- **Hard checks**:
  - [ ] LucyAnalyzeEvalRenderer shows "Warning" or "Critical" badge
  - [ ] Iteration comparison shows stall_count >= 3
  - [ ] **Stall warning** visible in the card
  - [ ] **Escalation recommendation** present (e.g., "L3: Data expansion" or different lever)
  - [ ] Lucy does NOT recommend repeating the same lever that failed before
- **Soft checks**:
  - [ ] Lucy mentions that previous changes didn't improve scores
  - [ ] Lucy suggests a fundamentally different approach
  - [ ] Lucy may suggest checking grader health or task viability
- **Evidence**: screenshot of stall detection card with escalation

### Step 4: Verify escalation is actionable

- **Action**: Review Lucy's specific proposal
- **Hard checks**:
  - [ ] Lucy proposes a different lever than previous iterations used
  - [ ] Proposal includes specific actions (not just "try something different")
  - [ ] `next_action` is "escalate" (not "iterate" with same approach)
- **Evidence**: screenshot of escalation proposal

## Pass Criteria

- Lucy correctly detects 3-iteration stall pattern
- Stall count shown in analysis card
- Escalation recommendation references a different lever
- Lucy doesn't repeat failed approaches

## Fail Criteria

- No stall detection despite 3 flat iterations
- Lucy recommends the same approach that already failed
- No escalation ladder — Lucy just says "try again"
- Stall count not displayed or incorrect

## Notes

The stalled mock scenario should produce mean ~0.42 consistently. If the existing `stalled` scenario doesn't exist in the registry, this test may need to use `warning` scenario (which produces ~0.42) and rely on the iteration history to trigger stall detection logic.
