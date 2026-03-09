---
id: TC-LUCY-009
title: "Lucy Behavior - Plan after iteration: Replanning when eval says iterate"
area: lucy-behavior
priority: P0
type: edge-case
mock-scenario: '{"evalScenario":"warning"}'
preconditions:
  - First plan approved and executed through eval
  - Eval returned warning (iterate)
---

# TC-LUCY-009: Replanning After Iteration Feedback

Tests Lucy's ability to create a new plan after the evaluation says "iterate" — this is the inner loop where Lucy must diagnose what went wrong and propose concrete changes.

## Mock Setup

```bash
curl -X POST http://localhost:9091/mock/scenario \
  -H "Content-Type: application/json" \
  -d '{"evalScenario":"warning","evalPollsBeforeComplete":1}'
```

## Preconditions

- First plan approved and executed through evaluation
- Eval results show warning (mean ~0.42)
- `analyze_evaluation` returned `next_action: "iterate"`

## Steps

### Step 1: Lucy proposes iteration changes
- **Action**: After warning eval analysis, Lucy should propose specific changes
- **Expected**: Lucy creates a revised plan or describes what she'll change
- **Hard checks**:
  - [ ] Lucy identifies WHICH topics/areas scored low
  - [ ] Lucy proposes SPECIFIC changes (not just "let's try again")
  - [ ] Lucy does NOT propose restarting from scratch (topics → categorize → etc.)
  - [ ] Lucy targets the weak areas identified in eval analysis
- **Soft checks**:
  - [ ] Lucy references the specific eval scores per topic
  - [ ] Lucy explains WHY those topics are underperforming
  - [ ] Lucy proposes at least one of: more data for weak topics, grader adjustment, topic refinement
- **Evidence**: screenshot of Lucy's iteration proposal

### Step 2: Lucy makes targeted changes
- **Action**: Lucy executes the iteration changes
- **Hard checks**:
  - [ ] Lucy modifies ONLY the areas that need improvement
  - [ ] Topics that scored well are LEFT ALONE
  - [ ] Changes are proportional to the problem (not nuclear option)
  - [ ] If adding data, only for low-scoring topics
  - [ ] If adjusting grader, changes are specific (not rewriting from scratch)
- **Evidence**: screenshot of targeted changes

### Step 3: Re-run evaluation after changes
- **Action**: Lucy re-runs evaluation
- **Hard checks**:
  - [ ] New eval run created (fresh ID)
  - [ ] Lucy compares new results to previous results
  - [ ] Iteration history shows both eval runs
  - [ ] `log_iteration` called to track the change

### Step 4: Verify iteration tracking
- **Hard checks**:
  - [ ] Iteration count incremented
  - [ ] Previous eval results preserved in history
  - [ ] New eval results are the "current" ones
  - [ ] Lucy can explain what changed between iterations

## Pass Criteria

- Lucy's iteration is targeted (not a full restart)
- Changes address the specific weak areas from eval
- Re-evaluation produces new results (separate run)
- Iteration history tracks the progression

## Fail Criteria

- Lucy restarts the entire pipeline from topics
- Lucy makes random changes (not based on eval analysis)
- Lucy iterates without re-evaluating (no validation)
- Iteration history lost or overwritten
- Lucy treats iteration like a fresh start (ignores previous work)

## Agent Orchestration Checks

- [ ] Lucy diagnosed the problem from eval analysis before acting
- [ ] Lucy's changes were proportional (targeted, not scorched earth)
- [ ] Lucy re-evaluated after making changes (closed the loop)
- [ ] Lucy tracked the iteration (called `log_iteration`)
- [ ] If second eval is still warning, Lucy either iterates again or escalates (doesn't loop forever)
