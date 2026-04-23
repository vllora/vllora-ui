---
id: TC-LUCY-001
title: "Lucy Planning - Plan generation quality and structure"
area: lucy-behavior
priority: P0
type: happy-path
mock-scenario: null
preconditions:
  - Fresh start (new dataset via task description)
---

# TC-LUCY-001: Plan Generation Quality

Tests that Lucy generates a high-quality plan tailored to the user's task before executing anything.

## Preconditions

- No existing dataset — start fresh from home page
- Task description provided (e.g., "A chess tutor assistant that teaches tactical patterns")

## Steps

### Step 1: Submit task description
- **Action**: Enter clear task description on home page, click "Start Finetune"
- **Expected**: Lucy starts planning (not executing immediately)
- **Hard checks**:
  - [ ] Lucy does NOT immediately call execution tools
  - [ ] Lucy enters planning phase first
  - [ ] Lucy calls planning tools: `generate_topics`, `generate_grader`, `check_viability`
- **Evidence**: screenshot of Lucy's initial response

### Step 2: Plan card appears
- **Action**: Wait for PlanCard to render in chat
- **Expected**: Structured plan with all key components
- **Hard checks**:
  - [ ] PlanCard renders with plan summary
  - [ ] `total_topic_count` > 0 and relevant to task
  - [ ] `estimated_records` is reasonable (not 0, not 10000)
  - [ ] Grader criteria listed (criteria count > 0)
  - [ ] `estimated_duration` is shown
  - [ ] "View Plan" and "Approve Plan" buttons present
- **Soft checks**:
  - [ ] Topic names are relevant to the task (chess → Pins, Forks, etc.)
  - [ ] Criteria are relevant (chess → correctness, explanation quality)
  - [ ] Lucy's explanation covers what the plan will do
- **Evidence**: screenshot of PlanCard

### Step 3: View plan details
- **Action**: Click "View Plan"
- **Expected**: Plan markdown shows detailed breakdown
- **Hard checks**:
  - [ ] Plan includes topic hierarchy
  - [ ] Plan includes grader criteria descriptions
  - [ ] Plan includes data generation strategy
  - [ ] Plan includes evaluation approach
- **Soft checks**:
  - [ ] Plan is coherent and well-structured
  - [ ] No contradictions between plan sections
  - [ ] Topics align with grader criteria
- **Evidence**: screenshot of plan detail view

### Step 4: Plan waits for approval (not auto-executing)
- **Action**: Observe that Lucy waits
- **Hard checks**:
  - [ ] Lucy does NOT start executing before approval
  - [ ] No tool execution cards appear until "Approve Plan" is clicked
  - [ ] Plan status is "draft" or "proposed" (not "executing")
- **Evidence**: verify no execution tools fired

## Pass Criteria

- Lucy plans BEFORE executing (plan-first behavior)
- PlanCard contains all required fields
- Topics and criteria are relevant to the task
- Lucy waits for explicit approval before executing

## Fail Criteria

- Lucy skips planning and starts executing immediately
- PlanCard missing key fields (topics, records, criteria)
- Topics completely irrelevant to the task description
- Lucy auto-executes without waiting for approval

## Agent Orchestration Checks

- [ ] Lucy followed plan-first protocol (planning tools before execution tools)
- [ ] Lucy called `generate_topics` during planning (not `apply_topic_hierarchy`)
- [ ] Lucy called `generate_grader` during planning (not `configure_grader`)
- [ ] Lucy called `check_viability` to validate the task is feasible
- [ ] Lucy presented plan and waited for user input
