---
id: TC-LUCY-002
title: "Lucy Planning - Dynamic replanning after user feedback"
area: lucy-behavior
priority: P0
type: happy-path
mock-scenario: null
preconditions:
  - Plan generated but not yet approved (TC-LUCY-001 Step 3)
---

# TC-LUCY-002: Dynamic Replanning After User Feedback

Tests that Lucy can revise her plan when the user provides feedback or requests changes.

## Preconditions

- Lucy has generated a plan (PlanCard visible)
- Plan NOT yet approved

## Steps

### Step 1: Request topic changes
- **Action**: Tell Lucy "I want to add a topic about Endgame Techniques, and remove the topic about Opening Theory"
- **Expected**: Lucy revises the plan
- **Hard checks**:
  - [ ] Lucy does NOT ignore the feedback
  - [ ] Lucy does NOT approve the original plan anyway
  - [ ] Updated PlanCard appears (or Lucy describes changes)
  - [ ] "Endgame Techniques" appears in updated topics
  - [ ] "Opening Theory" (or similar) removed from topics
  - [ ] Topic count adjusts accordingly
- **Soft checks**:
  - [ ] Lucy confirms the changes
  - [ ] Lucy explains how this affects the rest of the plan
- **Evidence**: screenshot of revised plan

### Step 2: Request grader criteria change
- **Action**: Tell Lucy "The grader should also check for move notation accuracy"
- **Expected**: Lucy adds the criterion
- **Hard checks**:
  - [ ] Grader criteria count increases
  - [ ] New criterion appears in plan
  - [ ] Existing criteria preserved
- **Soft checks**:
  - [ ] Lucy explains how the new criterion will be evaluated
- **Evidence**: screenshot of updated criteria

### Step 3: Request fundamental approach change
- **Action**: Tell Lucy "Actually, I want this to be a financial advisor, not a chess tutor"
- **Expected**: Lucy generates a completely new plan
- **Hard checks**:
  - [ ] Lucy does NOT just rename topics (generates new ones)
  - [ ] New PlanCard appears with finance-relevant topics
  - [ ] Grader criteria updated for finance domain
  - [ ] Old chess topics completely gone
  - [ ] Lucy calls `generate_topics` and `generate_grader` again
- **Soft checks**:
  - [ ] Lucy acknowledges the domain change
  - [ ] New plan is coherent for financial advisory task
- **Evidence**: screenshot of completely revised plan

### Step 4: Edit plan via direct command
- **Action**: Tell Lucy "Remove step 3 from the plan" or "Add a step to upload sample data"
- **Hard checks**:
  - [ ] Lucy modifies the plan steps directly
  - [ ] PlanCard updates to reflect added/removed steps
  - [ ] Step numbering adjusts correctly
  - [ ] Plan remains valid after structural edits
- **Soft checks**:
  - [ ] Lucy confirms the edit before applying
- **Evidence**: screenshot of edited plan structure

### Step 5: Edit plan parameters via chat
- **Action**: Tell Lucy "Change the record count to 200" or "Set the number of topics to 8"
- **Hard checks**:
  - [ ] Lucy updates the plan parameters
  - [ ] Updated values shown in PlanCard
  - [ ] Other plan parts remain unchanged
- **Evidence**: screenshot of updated parameters

### Step 6: Approve revised plan
- **Action**: Click "Approve Plan"
- **Expected**: Lucy begins executing the REVISED plan (not the original)
- **Hard checks**:
  - [ ] Execution uses the revised topics (finance, not chess)
  - [ ] Grader criteria match revised plan
  - [ ] `apply_topic_hierarchy` applies the finance topics
  - [ ] `configure_grader` uses the finance criteria
- **Evidence**: screenshot of execution starting

## Pass Criteria

- Lucy accepts and incorporates user feedback into the plan
- Minor changes adjust the existing plan (not regenerate from scratch)
- Major changes trigger full plan regeneration
- Execution uses the final revised plan, not any intermediate version

## Fail Criteria

- Lucy ignores user feedback and proceeds with original plan
- Lucy generates incoherent plan after revision (chess+finance mixed)
- Execution uses old plan despite revision
- Plan revision breaks the PlanCard rendering

## Agent Orchestration Checks

- [ ] Lucy used planning tools for revisions (not execution tools)
- [ ] Lucy regenerated fully when domain changed (not just renamed topics)
- [ ] Lucy did not execute any plan until explicit approval
- [ ] Lucy maintained plan coherence (topics align with criteria align with data strategy)
