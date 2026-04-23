---
id: TC-CC-003
title: "Data Persistence Across Refresh"
area: cross-cutting
priority: P0
type: regression
mock-scenario: null
preconditions:
  - Dataset with various data populated
---

# TC-CC-003: Data Persistence Across Refresh

Tests that ALL data survives a page refresh — IndexedDB is the source of truth.

## Steps

### Step 1: Populate dataset fully
- **Action**: Run pipeline to at least evaluation step
- **Record current state**:
  - Topic count
  - Record count
  - Grader presence
  - Eval scores
  - Workflow step

### Step 2: Hard refresh
- **Action**: Ctrl+Shift+R (hard refresh)
- **Hard checks**:
  - [ ] Dataset still appears in dataset list
  - [ ] Topic count unchanged
  - [ ] Record count unchanged
  - [ ] Grader still configured
  - [ ] Eval results still present (if they existed)
  - [ ] Workflow step unchanged
  - [ ] Lucy chat history preserved (if using persistent sessions)
  - [ ] No "flash of empty state" followed by data loading

### Step 3: Close tab and reopen
- **Action**: Close browser tab, open `localhost:5173`, navigate to dataset
- **Hard checks**:
  - [ ] All data still present
  - [ ] Same checks as Step 2

### Step 4: Verify no phantom data
- **Action**: Create a NEW dataset
- **Hard checks**:
  - [ ] New dataset starts empty (no data from old dataset)
  - [ ] Topic panel empty
  - [ ] No records
  - [ ] No grader configured
  - [ ] Workflow at `not_started`

## Pass Criteria

- All data survives refresh and tab close
- New datasets start clean (no cross-contamination)
- No flash of stale/empty content on reload

## Fail Criteria

- Any data lost on refresh
- Old dataset data appears in new dataset
- Workflow step resets to beginning on refresh
- IndexedDB corrupt or empty after refresh
