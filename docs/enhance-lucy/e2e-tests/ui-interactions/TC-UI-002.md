---
id: TC-UI-002
title: "UI Interactions - Topic canvas drag, zoom, toolbar actions"
area: ui-interactions
priority: P1
type: happy-path
mock-scenario: null
preconditions:
  - Dataset with topic hierarchy (3+ topics, 2+ levels)
  - Canvas view active
---

# TC-UI-002: Topic Canvas Interactions

Tests all canvas-based interactions: node selection, toolbar actions, dragging, zooming, and topic manipulation.

## Steps

### Step 1: Select topic node and use toolbar
- **Action**: Click a topic node on the canvas
- **Hard checks**:
  - [ ] Node becomes selected (visual highlight)
  - [ ] Toolbar appears above selected node
  - [ ] Toolbar shows: View records, Generate records, Generate sub-topics, Delete icons
- **Evidence**: screenshot of selected node with toolbar

### Step 2: View records for a topic
- **Action**: Click "View records" icon in node toolbar
- **Hard checks**:
  - [ ] Records filtered to show only records for selected topic
  - [ ] Record count matches topic's assigned record count
  - [ ] Can navigate back to full records view
- **Evidence**: screenshot of filtered records

### Step 3: Generate records for specific topic
- **Action**: Click "Generate records" icon in node toolbar
- **Hard checks**:
  - [ ] Generation starts for selected topic only
  - [ ] New records assigned to correct topic
  - [ ] Other topics' records unchanged
  - [ ] Record count updates in node badge
- **Evidence**: screenshot of generation for specific topic

### Step 4: Generate sub-topics
- **Action**: Click "Generate sub-topics" icon in node toolbar
- **Hard checks**:
  - [ ] Sub-topics appear as children of selected node
  - [ ] Canvas re-renders with expanded hierarchy
  - [ ] Parent-child relationship correct in data model
- **Evidence**: screenshot of expanded hierarchy

### Step 5: Delete topic from canvas
- **Action**: Click "Delete" icon in node toolbar
- **Hard checks**:
  - [ ] Confirmation dialog appears
  - [ ] After confirmation: node removed from canvas
  - [ ] Records previously assigned to deleted topic are uncategorized
  - [ ] Child topics (if any) handled correctly (deleted or reparented)
  - [ ] Topic count updates
- **Evidence**: screenshot before/after deletion

### Step 6: Drag and zoom
- **Action**: Drag nodes, scroll to zoom, use zoom controls
- **Hard checks**:
  - [ ] Nodes can be repositioned by dragging
  - [ ] Scroll zoom in/out works smoothly
  - [ ] Zoom controls (+/-/reset) in toolbar work
  - [ ] Canvas doesn't break at extreme zoom levels
  - [ ] Expand all / Collapse all buttons work
- **Evidence**: screenshot at different zoom levels

### Step 7: Canvas ↔ Topic Dialog consistency
- **Action**: Open TopicHierarchyDialog, make a change, close, verify canvas
- **Hard checks**:
  - [ ] Changes in dialog reflected on canvas
  - [ ] Changes on canvas reflected in dialog
  - [ ] No stale hierarchy data between the two views
- **Evidence**: screenshots showing consistency

## Pass Criteria

- All canvas interactions work correctly
- Node toolbar actions execute properly
- Data consistency between canvas and topic dialog
- Zoom/drag doesn't break layout

## Fail Criteria

- Toolbar actions fail or target wrong topic
- Delete leaves orphaned records without re-assignment
- Canvas doesn't update after topic changes
- Zoom/drag causes canvas to become unusable
