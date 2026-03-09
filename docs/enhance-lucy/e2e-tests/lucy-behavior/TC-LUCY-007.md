---
id: TC-LUCY-007
title: "Lucy Behavior - Plan rejection: User says no to the plan"
area: lucy-behavior
priority: P0
type: edge-case
mock-scenario: null
preconditions:
  - Lucy has generated a plan (PlanCard visible)
  - Plan not yet approved
---

# TC-LUCY-007: Plan Rejection

Tests Lucy's behavior when the user rejects the proposed plan entirely.

## Preconditions

- Lucy has generated a plan with PlanCard visible
- Plan is in "proposed" or "draft" status

## Steps

### Step 1: Reject the plan
- **Action**: Tell Lucy "I don't like this plan. The topics are wrong and I want fewer records."
- **Expected**: Lucy accepts the rejection gracefully
- **Hard checks**:
  - [ ] Lucy does NOT start executing the rejected plan
  - [ ] Plan status does NOT change to "approved" or "executing"
  - [ ] No tool execution cards appear (no `apply_topic_hierarchy`, no `configure_grader`)
- **Soft checks**:
  - [ ] Lucy acknowledges the rejection without being defensive
  - [ ] Lucy asks what the user wants changed
  - [ ] Lucy does NOT say "OK I'll proceed anyway"
- **Evidence**: screenshot of Lucy's response

### Step 2: Lucy generates a new plan
- **Action**: Tell Lucy "I want only 3 topics focused on beginner chess, and about 50 records"
- **Expected**: Lucy creates a completely new plan based on feedback
- **Hard checks**:
  - [ ] Lucy calls planning tools again (`generate_topics`, `generate_grader`)
  - [ ] New PlanCard appears with ~3 topics
  - [ ] `estimated_records` is around 50 (not the original amount)
  - [ ] Old PlanCard is superseded (not both visible as active)
  - [ ] New topics reflect "beginner chess" focus
- **Soft checks**:
  - [ ] Lucy confirms the new plan matches the user's request
  - [ ] Lucy highlights what changed from the previous plan
- **Evidence**: screenshot of new plan

### Step 3: Reject again with vague feedback
- **Action**: Tell Lucy "No, this still isn't right"
- **Expected**: Lucy asks for clarification
- **Hard checks**:
  - [ ] Lucy does NOT execute
  - [ ] Lucy does NOT generate a random new plan
- **Soft checks**:
  - [ ] Lucy asks WHAT specifically is wrong
  - [ ] Lucy offers options or asks targeted questions
  - [ ] Lucy remains patient (no frustration language)
- **Evidence**: screenshot of Lucy asking for clarification

### Step 4: Approve after iteration
- **Action**: Provide specific feedback, then approve the revised plan
- **Hard checks**:
  - [ ] Lucy generates a plan matching the specific feedback
  - [ ] Execution uses the FINAL approved plan (not any rejected version)
  - [ ] `apply_topic_hierarchy` uses topics from the approved plan
- **Evidence**: screenshot of execution starting

## Pass Criteria

- Lucy never executes a rejected plan
- Lucy can iterate on plans multiple times without breaking
- Final execution matches the approved plan exactly
- No artifacts from rejected plans pollute the dataset

## Fail Criteria

- Lucy executes despite rejection
- Lucy generates identical plan after rejection (ignores feedback)
- Rejected plan topics appear in the dataset
- Lucy gets stuck in a loop (can't produce a new plan)
- Lucy gives up and says "I can't help"

## Agent Orchestration Checks

- [ ] Lucy respected plan rejection (no execution tools called)
- [ ] Lucy re-entered planning phase (called planning tools again)
- [ ] Lucy incorporated specific feedback into the new plan
- [ ] Lucy can handle multiple rejections without degradation
- [ ] Final execution was exclusively from the approved plan
