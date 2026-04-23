---
id: TC-TOP-001
title: "Topics - Happy Path: Generate and save topic hierarchy"
area: topics
priority: P0
type: happy-path
mock-scenario: null
preconditions:
  - Fresh dataset created (no existing topics)
  - Lucy sidebar open
---

# TC-TOP-001: Topics - Happy Path

## Preconditions

- Fresh dataset created via "Start Finetune" with a clear task description
- Lucy sidebar is open and active
- No existing topic hierarchy

## Steps

### Step 1: Lucy proposes a plan
- **Action**: After starting a new finetune, Lucy should automatically generate a plan
- **Expected**: PlanCard appears in chat with proposed topics, record count, criteria
- **Hard checks**:
  - [ ] PlanCard renders in Lucy chat
  - [ ] `total_topic_count` > 0
  - [ ] `estimated_records` > 0
  - [ ] Plan shows grader criteria count
  - [ ] "Approve Plan" button is enabled
- **Soft checks**:
  - [ ] Lucy's message mentions the task domain (e.g., "chess", "finance")
  - [ ] Topic names are relevant to the task description
- **Evidence**: screenshot of PlanCard

### Step 2: Approve plan and topic generation begins
- **Action**: Click "Approve Plan" or tell Lucy to proceed
- **Expected**: Lucy begins executing — `generate_topics` tool fires (planning phase)
- **Hard checks**:
  - [ ] Tool execution cards appear in chat
  - [ ] `generate_topics` tool shows as completed
  - [ ] No error in tool execution card
- **Evidence**: screenshot of tool execution cards

### Step 3: Topics saved via apply_topic_hierarchy
- **Action**: Lucy calls `apply_topic_hierarchy` after generation
- **Expected**: Topic hierarchy is saved to IndexedDB, UI updates
- **Hard checks**:
  - [ ] `apply_topic_hierarchy` tool shows as completed
  - [ ] TopicHierarchyDialog or topic panel shows generated topics
  - [ ] Topic count matches what was proposed in the plan
  - [ ] No duplicate topic entries
  - [ ] Sidebar workflow indicator advances past topics step
- **Evidence**: screenshot of topics panel, DOM snapshot

### Step 4: Verify topic data in IndexedDB
- **Action**: Inspect IndexedDB via browser console
- **Check**: `javascript_tool` to query workflow state
  ```js
  // Verify workflow state has topicsConfig populated
  const stores = await indexedDB.databases();
  ```
- **Hard checks**:
  - [ ] `workflow.topicsConfig` is not null
  - [ ] `workflow.topicsConfig.topicCount` matches displayed count
  - [ ] `workflow.topicsConfig.method` is 'auto' or 'template'
- **Evidence**: console output

### Step 5: Verify persistence across refresh
- **Action**: Refresh the page, navigate back to dataset
- **Hard checks**:
  - [ ] Topics are still present after reload
  - [ ] Topic count unchanged
  - [ ] Workflow step indicator still shows topics as complete
  - [ ] No "flash of stale content" (old/empty state briefly visible)
- **Evidence**: screenshot after refresh

## Pass Criteria

- ALL hard checks pass
- No console errors related to IndexedDB, state management, or tool execution
- No duplicate topic entries in DOM
- Topic data survives page refresh

## Fail Criteria

- Any hard check fails
- Console shows unhandled promise rejection
- Topic count in sidebar differs from topic count in detail panel
- Topics disappear on refresh (IndexedDB persistence failure)

## Agent Orchestration Checks

These verify Lucy's decision-making, not just tool output:
- [ ] Lucy called `generate_topics` BEFORE `apply_topic_hierarchy` (correct order)
- [ ] Lucy did NOT call `generate_topics` again during execution phase (known issue — see Issue 1 in e2e-fresh-run-issues.md)
- [ ] Lucy advanced to the next step (categorization or grader) after topics were saved
