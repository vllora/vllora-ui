---
id: TC-CC-002
title: "Sidebar ↔ Detail Panel Consistency"
area: cross-cutting
priority: P0
type: regression
mock-scenario: '{"evalScenario":"healthy","trainingScenario":"improving"}'
preconditions:
  - Dataset at various pipeline stages
---

# TC-CC-002: Sidebar ↔ Detail Panel Consistency

Tests that the sidebar workflow indicator always matches what the detail panel shows — no divergence.

## Steps

### Step 1: During topic configuration
- **Hard checks**:
  - [ ] Sidebar shows "Topics" as current step
  - [ ] Detail panel shows topic hierarchy editor
  - [ ] Topic count in sidebar matches detail panel

### Step 2: After evaluation completes
- **Hard checks**:
  - [ ] Sidebar shows evaluation step as complete
  - [ ] Detail panel shows eval results
  - [ ] Eval score in sidebar summary matches detail panel score
  - [ ] Unreviewed job badge appears (if applicable)

### Step 3: During training
- **Hard checks**:
  - [ ] Sidebar shows training as active step
  - [ ] Jobs tab shows training job in progress
  - [ ] Training progress consistent between sidebar and job card

### Step 4: Navigate away and back
- **Action**: Navigate to a different dataset, then back
- **Hard checks**:
  - [ ] Sidebar state reloads correctly for the returned dataset
  - [ ] No stale state from the other dataset
  - [ ] Detail panel matches sidebar after navigation

### Step 5: Quick action alignment
- **Hard checks**:
  - [ ] Quick actions in sidebar are appropriate for current state
  - [ ] "Test before training" only appears if grader is configured
  - [ ] "Start training" only appears if eval passed
  - [ ] Quick actions don't reference completed steps

## Pass Criteria

- Sidebar and detail panel agree at every pipeline stage
- Navigation between datasets doesn't cause divergence
- Quick actions are contextually appropriate

## Fail Criteria

- Sidebar shows different step than detail panel
- Scores disagree between sidebar and detail panel
- Quick actions reference wrong pipeline stage
- Stale data from another dataset appears
