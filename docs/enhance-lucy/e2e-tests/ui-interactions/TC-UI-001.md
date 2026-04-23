---
id: TC-UI-001
title: "UI Interactions - Tab switching, view modes, and navigation during operations"
area: ui-interactions
priority: P0
type: regression
mock-scenario: null
preconditions:
  - Dataset with records, topics, evaluation results
  - Lucy sidebar open with active conversation
---

# TC-UI-001: Tab Switching, View Modes, and Navigation

Tests that switching between tabs, view modes, and navigating between sections doesn't break state, lose data, or show stale content.

## Steps

### Step 1: Switch between Overview/Records/Evaluator/Plan tabs
- **Action**: Rapidly click through each section tab
- **Hard checks**:
  - [ ] Each tab renders without error
  - [ ] Overview tab shows correct stats (record count, topic distribution)
  - [ ] Records tab shows all records with correct data
  - [ ] Evaluator tab shows grader config and eval history
  - [ ] Plan tab shows current plan (if exists)
  - [ ] No data disappears after switching back and forth
  - [ ] Tab content matches IndexedDB state
- **Evidence**: screenshot of each tab

### Step 2: Toggle Canvas vs Table view mode
- **Action**: On Records tab, toggle between Canvas and Table view
- **Hard checks**:
  - [ ] Canvas view shows topic hierarchy with nodes
  - [ ] Table view shows records in tabular format
  - [ ] Switching doesn't reset scroll position (within same mode)
  - [ ] Data is consistent between both views
  - [ ] Topic counts in canvas match record assignments in table
- **Evidence**: screenshots of both views

### Step 3: Switch tabs while Lucy is executing
- **Action**: While Lucy is running a tool, switch from Plan tab to Records tab
- **Hard checks**:
  - [ ] Lucy's execution continues (not interrupted by tab switch)
  - [ ] Records tab shows fresh data (including any new records from Lucy)
  - [ ] Switching back to Plan tab shows correct progress
  - [ ] No stale data from cached tab content
- **Evidence**: screenshots showing consistent state across tabs

### Step 4: Search and filter records
- **Action**: Type in search box on Records tab → clear → sort → filter
- **Hard checks**:
  - [ ] Search filters records by content/topic in real-time
  - [ ] Clearing search shows all records again
  - [ ] Sort by Timestamp/Topic/Evaluation works correctly
  - [ ] "Generated" filter shows only synthetic records
  - [ ] Source document filter works
  - [ ] Group by topic correctly nests records
  - [ ] Filter combinations don't break (search + sort + filter)
- **Evidence**: screenshots of filtered/sorted views

### Step 5: Dataset overview card interactions
- **Action**: Click on overview stats, donut chart, analytics
- **Hard checks**:
  - [ ] Record count accurate
  - [ ] Topic distribution chart renders correctly
  - [ ] Coverage stats update after data changes
  - [ ] No clickable elements that lead to dead ends

## Pass Criteria

- All tabs render correctly with fresh data
- View mode toggle preserves data integrity
- Search/filter/sort work correctly and can be combined

## Fail Criteria

- Tab shows stale data after switch
- Canvas/Table count mismatch
- Search/filter breaks when combined
