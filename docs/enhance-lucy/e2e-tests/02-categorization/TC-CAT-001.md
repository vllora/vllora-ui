---
id: TC-CAT-001
title: "Categorization - Happy Path: Auto-categorize records into topics"
area: categorization
priority: P0
type: happy-path
mock-scenario: null
preconditions:
  - Dataset with topics configured (TC-TOP-001 complete)
  - Records exist (either uploaded or generated)
  - Lucy sidebar open
---

# TC-CAT-001: Categorization - Happy Path

## Preconditions

- Dataset has a topic hierarchy with 3+ topics
- Records exist in the dataset (10+ records)
- Lucy sidebar is open, workflow is at or past `topics_config`

## Steps

### Step 1: Lucy categorizes records as part of plan execution
- **Action**: During plan execution, Lucy should auto-categorize records after topics are set
- **Expected**: `categorize_records` tool fires
- **Hard checks**:
  - [ ] `categorize_records` tool execution card appears in chat
  - [ ] Tool completes successfully (no error state)
  - [ ] Tool result shows `assignedCount` > 0
- **Soft checks**:
  - [ ] Lucy mentions categorization progress
- **Evidence**: screenshot of tool execution card

### Step 2: Records show topic assignments in UI
- **Action**: Navigate to the records view
- **Expected**: Each record shows its assigned topic
- **Hard checks**:
  - [ ] RecordsTable shows records with topic column populated
  - [ ] Assigned topic names match topics from the hierarchy
  - [ ] No records show "uncategorized" or empty topic (unless expected)
  - [ ] `assignedCount` in workflow state matches visible assigned records
- **Evidence**: screenshot of records table

### Step 3: Verify categorization quality indicators
- **Action**: Check categorization stats
- **Hard checks**:
  - [ ] `categorization.assignedCount` matches total records with topics
  - [ ] `categorization.lowConfidenceCount` is reasonable (< 20% of total)
  - [ ] Low-confidence records are visually distinguishable (if UI supports it)
- **Evidence**: screenshot or DOM snapshot of categorization stats

### Step 4: Verify distribution across topics
- **Action**: Check that records are spread across topics (not all in one)
- **Hard checks**:
  - [ ] At least 2 different topics have assigned records
  - [ ] No single topic has > 80% of all records (unless dataset is genuinely skewed)
- **Soft checks**:
  - [ ] Distribution roughly matches expected proportions
- **Evidence**: coverage/distribution view if available

## Pass Criteria

- All records categorized (or categorization attempted for all)
- Topic assignments are from the configured hierarchy (no invalid topics)
- Categorization data persists in IndexedDB
- Workflow advances past categorization step

## Fail Criteria

- Records show topics that don't exist in the hierarchy
- `assignedCount` doesn't match what's displayed
- All records assigned to a single topic (distribution bug)
- Categorization data lost on page refresh

## Agent Orchestration Checks

- [ ] Lucy called `categorize_records` AFTER `apply_topic_hierarchy` (correct order)
- [ ] Lucy did not skip categorization when records were available
- [ ] Lucy advanced to coverage/generation step after categorization
