---
id: TC-DS-001
title: "Dataset CRUD - Create, rename, import, delete"
area: dataset-crud
priority: P0
type: happy-path
mock-scenario: null
preconditions:
  - Application loaded at home page
  - At least one existing dataset visible
---

# TC-DS-001: Dataset CRUD Operations

Tests all dataset-level operations a user can perform from the grid and detail views.

## Steps

### Step 1: Create dataset from grid
- **Action**: Click "+ Create experiment" card in dataset grid
- **Hard checks**:
  - [ ] CreateDatasetDialog opens
  - [ ] User can enter dataset name
  - [ ] "Create" button creates dataset
  - [ ] New dataset card appears in grid
  - [ ] Dataset persisted in IndexedDB
  - [ ] User navigated to new dataset detail view
- **Evidence**: screenshot of new dataset in grid

### Step 2: Create dataset via Lucy
- **Action**: Tell Lucy "Create a new dataset called Chess Training"
- **Hard checks**:
  - [ ] Lucy calls `create_dataset` tool with name
  - [ ] Dataset created in IndexedDB
  - [ ] Browser auto-navigates to new dataset
  - [ ] Lucy acknowledges creation
- **Evidence**: screenshot of Lucy creating dataset

### Step 3: Rename dataset from grid
- **Action**: Click "..." menu on dataset card → "Rename"
- **Hard checks**:
  - [ ] Inline edit mode activates on card
  - [ ] User can type new name
  - [ ] Enter saves, Escape cancels
  - [ ] Name updates in grid immediately
  - [ ] Name persisted in IndexedDB
- **Evidence**: screenshot of renamed dataset

### Step 4: Rename dataset from detail header
- **Action**: Click pencil icon next to dataset title in detail view
- **Hard checks**:
  - [ ] EditableTitle enters edit mode
  - [ ] User can type new name
  - [ ] Checkmark saves, X cancels
  - [ ] Title updates immediately
  - [ ] Change persists in IndexedDB
  - [ ] Sidebar also shows updated name (if visible)
- **Evidence**: screenshot of renamed title

### Step 5: Import data via file upload
- **Action**: Click "..." menu → "Import data" → "Upload File" tab
- **Hard checks**:
  - [ ] IngestDataDialog opens with tabs
  - [ ] "Upload File" tab shows drag-drop area
  - [ ] JSONL file accepted and parsed
  - [ ] Parsed records shown with checkboxes
  - [ ] "Import" button adds records to dataset
  - [ ] Record count increases after import
  - [ ] Imported records visible in records table
- **Evidence**: screenshot of import dialog and records table

### Step 6: Import data via Gateway Traces
- **Action**: Open IngestDataDialog → "Gateway Traces" tab
- **Hard checks**:
  - [ ] Spans from gateway displayed in table
  - [ ] User can select spans with checkboxes
  - [ ] "Import" adds selected spans as records
  - [ ] Records appear in dataset
- **Evidence**: screenshot of trace import

### Step 7: Delete dataset
- **Action**: Click "..." menu → "Delete"
- **Hard checks**:
  - [ ] DeleteConfirmationDialog appears with warning
  - [ ] "Cancel" closes dialog without deleting
  - [ ] "Delete" removes dataset
  - [ ] Dataset disappears from grid
  - [ ] Dataset removed from IndexedDB
  - [ ] All associated data cleaned up (records, workflow, eval jobs)
  - [ ] User navigated back to grid view
- **Evidence**: screenshot of grid without deleted dataset

### Step 8: Delete dataset with active Lucy conversation
- **Action**: Open Lucy sidebar on a dataset, then delete the dataset
- **Hard checks**:
  - [ ] Lucy sidebar handles dataset deletion gracefully
  - [ ] No crash or stale state in Lucy chat
  - [ ] Lucy does NOT try to continue operating on deleted dataset

## Pass Criteria

- All CRUD operations work correctly
- Data persists/cleans up in IndexedDB appropriately
- Navigation is correct after each operation
- No orphaned data after deletion

## Fail Criteria

- Create fails silently
- Rename doesn't persist
- Import creates duplicate records
- Delete leaves orphaned workflow/eval data in IndexedDB
- App crashes when deleting dataset with active Lucy session
