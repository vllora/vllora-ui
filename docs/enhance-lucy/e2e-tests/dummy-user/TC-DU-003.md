---
id: TC-DU-003
title: "Dummy User - Invalid, empty, and wrong inputs"
area: dummy-user
priority: P0
type: edge-case
mock-scenario: null
preconditions:
  - Application loaded
  - Lucy sidebar available
---

# TC-DU-003: Invalid, Empty, and Wrong Inputs

Tests how the app handles garbage inputs, empty submissions, wrong file types, and other mistakes a careless user might make.

## Steps

### Step 1: Empty task description on home page
- **Action**: Click "Start Finetune" with empty text input
- **Hard checks**:
  - [ ] Form validation prevents submission (or shows error)
  - [ ] No empty-named dataset created
  - [ ] No crash
- **Evidence**: screenshot of validation message

### Step 2: Very long dataset name (500+ characters)
- **Action**: Create dataset with extremely long name
- **Hard checks**:
  - [ ] Either truncated or rejected with clear message
  - [ ] No UI overflow/breaking
  - [ ] Dataset card renders correctly in grid
- **Evidence**: screenshot of long-name handling

### Step 3: Special characters in dataset name
- **Action**: Create dataset with name: `<script>alert("xss")</script>`
- **Hard checks**:
  - [ ] Name is sanitized or escaped (no XSS)
  - [ ] Dataset created with literal text (not executed)
  - [ ] Name renders correctly in UI
- **Evidence**: screenshot showing safe rendering

### Step 4: Upload wrong file type as knowledge source
- **Action**: Try to upload a .exe, .zip, or .mp3 file as knowledge source
- **Hard checks**:
  - [ ] File rejected with clear error message
  - [ ] No crash or silent failure
  - [ ] Error toast explains accepted formats
- **Evidence**: screenshot of error message

### Step 5: Upload empty/corrupted file
- **Action**: Upload a 0-byte PDF or corrupted JSONL
- **Hard checks**:
  - [ ] Clear error message (not a generic "something went wrong")
  - [ ] No partial source entry created
  - [ ] User can retry with correct file
- **Evidence**: screenshot of error handling

### Step 6: Send empty message to Lucy
- **Action**: Press Enter with empty chat input
- **Hard checks**:
  - [ ] Message not sent (input validation)
  - [ ] No empty message bubble in chat
  - [ ] No tool execution triggered
- **Evidence**: verify no empty messages in chat

### Step 7: Import malformed JSONL file
- **Action**: Upload a JSONL file with invalid JSON on some lines
- **Hard checks**:
  - [ ] Clear error message identifying the problem
  - [ ] Valid lines still importable (partial import option)
  - [ ] No crash from JSON parse error
  - [ ] No corrupted records created
- **Evidence**: screenshot of import error handling

### Step 8: Create duplicate dataset names
- **Action**: Create two datasets with the same name
- **Hard checks**:
  - [ ] Either prevented (unique name constraint) OR both created with distinct IDs
  - [ ] No confusion in navigation (both accessible)
  - [ ] Lucy can distinguish between them if asked

## Pass Criteria

- All invalid inputs handled with clear error messages
- No crashes from unexpected input
- No data corruption from malformed files
- XSS prevented for all text inputs
- Lucy handles impossible requests gracefully

## Fail Criteria

- App crashes on any invalid input
- Silent failures (no error message shown)
- XSS vulnerability from unsanitized input
- Corrupted data from malformed imports
- Lucy executes tools on impossible operations
