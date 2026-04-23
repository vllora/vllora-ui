---
id: TC-REC-001
title: "Records Management - Edit, bulk ops, and variants"
area: records-management
priority: P0
type: happy-path
mock-scenario: null
preconditions:
  - Dataset with 10+ records and topics configured
  - Lucy sidebar open, records tab visible
---

# TC-REC-001: Records Management

Tests all user interactions with individual records and bulk operations.

## Steps

### Step 1: View records in table mode
- **Action**: Click "Records" tab, ensure table view is active
- **Hard checks**:
  - [ ] RecordsTable renders with all columns (content, topic, evaluation, etc.)
  - [ ] Record count in table matches dataset record count
  - [ ] Search box filters records by content
  - [ ] Sort dropdown works (Timestamp, Topic, Evaluation)
  - [ ] "Generated" filter shows only synthetic/non-synthetic records
- **Evidence**: screenshot of records table

### Step 2: Edit a single record
- **Action**: Click "..." on a record row → "Edit record"
- **Hard checks**:
  - [ ] RecordDataDialog opens with full conversation thread
  - [ ] "Edit" mode button enables editing
  - [ ] User can modify message content
  - [ ] Save persists changes to IndexedDB
  - [ ] Changes reflected in records table after dialog close
  - [ ] Edited record does NOT lose its topic assignment
- **Evidence**: screenshot of edit dialog, screenshot after save

### Step 3: Assign topic to record manually
- **Action**: Click topic cell on a record → opens topic assignment
- **Hard checks**:
  - [ ] AssignTopicDialog shows full topic tree
  - [ ] Selecting topic assigns it to the record
  - [ ] Topic column updates in table
  - [ ] Categorization stats update (assignedCount)
- **Evidence**: screenshot of topic assignment

### Step 4: Bulk select and delete records
- **Action**: Select 3 records via checkboxes → click "Delete"
- **Hard checks**:
  - [ ] Checkboxes work on individual rows
  - [ ] Header checkbox selects/deselects all visible
  - [ ] "Delete" button appears in toolbar when records selected
  - [ ] Confirmation dialog appears before deletion
  - [ ] Records removed from table after confirmation
  - [ ] Record count decremented correctly
  - [ ] Deleted records removed from IndexedDB
- **Evidence**: screenshot before/after deletion

### Step 5: Generate record variants
- **Action**: Click "..." on a record → "Generate variants"
- **Hard checks**:
  - [ ] Variant generation dialog opens
  - [ ] Generated variants appear in records table
  - [ ] Variants share same topic as source record
  - [ ] Variants have distinct content (not exact copies)
  - [ ] Record count incremented correctly
- **Evidence**: screenshot of variants in table

### Step 6: Column visibility toggle
- **Action**: Click "Columns" dropdown → toggle columns off/on
- **Hard checks**:
  - [ ] Columns can be hidden and shown
  - [ ] Table re-renders correctly with changed columns
  - [ ] Column preferences persist during session

### Step 7: Copy record ID
- **Action**: Click "..." → "Copy record ID"
- **Hard checks**:
  - [ ] Toast confirmation "Copied!" appears
  - [ ] Action doesn't crash or show error

## Pass Criteria

- All record CRUD operations work correctly
- Data persists in IndexedDB after each operation
- Bulk operations update counts correctly
- No orphaned data after deletions

## Fail Criteria

- Edit doesn't save to IndexedDB
- Bulk delete leaves records in IndexedDB
- Variant generation creates duplicates of source
- Count mismatches between UI and IndexedDB
