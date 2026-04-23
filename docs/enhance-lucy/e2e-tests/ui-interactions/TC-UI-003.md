---
id: TC-UI-003
title: "UI Interactions - Sidebar pin, collapse, expand with active operations"
area: ui-interactions
priority: P1
type: regression
mock-scenario: '{\"evalScenario\":\"healthy\",\"evalPollsBeforeComplete\":1}'
preconditions:
  - Dataset with active Lucy conversation
  - Operations in progress (optional)
---

# TC-UI-003: Sidebar Pin, Collapse, Expand

Tests Lucy sidebar toggle behavior including pinning, collapse during operations, notification badges, and state preservation.

## Steps

### Step 1: Pin and unpin sidebar
- **Action**: Click pin icon in sidebar header
- **Hard checks**:
  - [ ] Pin state toggles (pinned ↔ unpinned)
  - [ ] Pinned sidebar stays open when clicking elsewhere
  - [ ] Unpinned sidebar auto-collapses on outside click
  - [ ] Pin state persists to localStorage
  - [ ] After page refresh, pin state restored
- **Evidence**: screenshot of pinned vs unpinned state

### Step 2: Collapse sidebar during Lucy response
- **Action**: While Lucy is typing a response, collapse the sidebar
- **Hard checks**:
  - [ ] Sidebar collapses smoothly
  - [ ] Lucy's response continues generating (not cancelled)
  - [ ] Expanding sidebar shows complete response
  - [ ] No truncated messages
  - [ ] Notification badge appears on collapsed sidebar
- **Evidence**: screenshot of collapsed sidebar with badge

### Step 3: Sidebar resize interaction with detail panel
- **Action**: With sidebar expanded, check detail panel layout
- **Hard checks**:
  - [ ] Detail panel resizes to accommodate sidebar
  - [ ] No content overflow or hidden elements
  - [ ] At narrow viewport, layout doesn't break
  - [ ] All detail panel interactions still work with sidebar open

### Step 4: Quick actions update based on workflow state
- **Action**: Check quick action buttons at different pipeline stages
- **Hard checks**:
  - [ ] At topics stage: shows "Generate topics" type actions
  - [ ] At grader stage: shows "Set up evaluation" type actions
  - [ ] After eval: shows "Start training" or "Iterate" type actions
  - [ ] Quick actions are context-sensitive (not always the same)
  - [ ] Clicking a quick action sends appropriate prompt
- **Evidence**: screenshots of quick actions at different stages

## Pass Criteria

- Sidebar pin/collapse preserves state
- Quick actions are contextually appropriate

## Fail Criteria

- Pin state lost after refresh
- Quick actions don't match current pipeline stage
- Layout breaks with sidebar open/closed
