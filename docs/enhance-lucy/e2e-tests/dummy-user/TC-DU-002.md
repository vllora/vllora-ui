---
id: TC-DU-002
title: "Dummy User - Page refresh during active operations"
area: dummy-user
priority: P0
type: edge-case
mock-scenario: '{\"evalScenario\":\"healthy\",\"evalPollsBeforeComplete\":1}'
preconditions:
  - Dataset with active plan execution or running job
---

# TC-DU-002: Page Refresh During Active Operations

Tests what happens when a user refreshes the browser at various critical moments. Real users accidentally hit F5, navigate away, or lose connection.

## Steps

### Step 1: Refresh during plan execution
- **Action**: Approve plan, let it start executing (at step 2-3 of 7). Press F5.
- **Hard checks**:
  - [ ] Page reloads without crash
  - [ ] Dataset data preserved in IndexedDB (topics, records created so far)
  - [ ] Workflow state accurately reflects last completed step
  - [ ] Lucy sidebar reopens with chat history
  - [ ] Plan status shows correctly (not "executing" since page reloaded)
  - [ ] No half-completed steps in workflow state
- **Soft checks**:
  - [ ] Lucy acknowledges interrupted execution on reopen
  - [ ] Lucy offers to resume from where it stopped
- **Evidence**: screenshot after refresh showing preserved state

### Step 2: Refresh during evaluation polling
- **Action**: Start `run_evaluation`, while it's polling for results, press F5
- **Hard checks**:
  - [ ] Evaluation job continues on backend (not cancelled by page refresh)
  - [ ] After reload, polling manager re-initializes
  - [ ] If job completed during refresh: results available, badge shown
  - [ ] If job still running: polling resumes automatically
  - [ ] No duplicate evaluation jobs created
- **Evidence**: screenshot showing eval job state after refresh

### Step 3: Refresh during training
- **Action**: Start training job, refresh page while training is in progress
- **Hard checks**:
  - [ ] Training job continues on backend
  - [ ] After reload, training status is pollable
  - [ ] No duplicate training jobs
  - [ ] Training progress resumes showing correctly
- **Evidence**: screenshot of training state after refresh

### Step 4: Refresh during knowledge source extraction
- **Action**: Upload a PDF, refresh while extraction is processing
- **Hard checks**:
  - [ ] Upload/extraction status preserved or re-fetchable
  - [ ] No duplicate source entries
  - [ ] Source eventually shows as "Ready" after extraction completes

### Step 5: Refresh during data generation
- **Action**: Lucy is generating synthetic data, user refreshes
- **Hard checks**:
  - [ ] Records generated BEFORE refresh are preserved in IndexedDB
  - [ ] Records generated AFTER refresh are NOT in IndexedDB (generation stopped)
  - [ ] No partial/corrupted records
  - [ ] Lucy can re-generate remaining records on next interaction

### Step 6: Rapid double-refresh (F5 F5)
- **Action**: Press F5 twice in quick succession
- **Hard checks**:
  - [ ] No race conditions in IndexedDB reads
  - [ ] No duplicate context providers initialized
  - [ ] App loads correctly (single instance)
  - [ ] No "IndexedDB already open" errors

## Pass Criteria

- All data persisted to IndexedDB survives refresh
- Backend jobs (eval, training) continue independently
- No data corruption from interrupted operations
- App recovers gracefully on reload

## Fail Criteria

- Data loss after refresh (records, topics, workflow state)
- Duplicate jobs created from stale polling state
- App crashes on reload (IndexedDB initialization errors)
- "Flash of stale content" shows wrong/old data permanently
- Half-completed workflow steps left in inconsistent state
