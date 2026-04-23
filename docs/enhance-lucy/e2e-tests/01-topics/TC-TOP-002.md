---
id: TC-TOP-002
title: "Topics - Edge Case: Empty input and duplicate handling"
area: topics
priority: P1
type: edge-case
mock-scenario: null
preconditions:
  - Dataset with existing topics from TC-TOP-001
  - Lucy sidebar open
---

# TC-TOP-002: Topics - Empty Input and Duplicate Handling

## Preconditions

- Dataset already has a topic hierarchy (from a previous run)
- Lucy sidebar is open

## Steps

### Step 1: Ask Lucy to regenerate topics
- **Action**: Tell Lucy "Can you regenerate the topics? I want different ones"
- **Expected**: Lucy should acknowledge existing topics and propose changes
- **Hard checks**:
  - [ ] Lucy does NOT silently overwrite existing topics
  - [ ] Lucy either asks for confirmation or shows a plan with new topics
- **Soft checks**:
  - [ ] Lucy mentions that topics already exist
  - [ ] Lucy explains what will change
- **Evidence**: screenshot of Lucy's response

### Step 2: Verify no duplicate topics after regeneration
- **Action**: Approve the regeneration
- **Expected**: New topics replace old ones (no duplicates)
- **Hard checks**:
  - [ ] Topic panel shows exactly the new set of topics
  - [ ] No topics from the old hierarchy remain (unless Lucy merged them)
  - [ ] No duplicate entries (same topic name appearing twice)
  - [ ] Topic count is reasonable (not doubled)
- **Evidence**: screenshot of topics panel, DOM snapshot

### Step 3: Ask Lucy to add a single topic manually
- **Action**: Tell Lucy "Add a topic called 'Advanced Tactics'"
- **Expected**: Lucy calls `adjust_topic_hierarchy` to add the topic
- **Hard checks**:
  - [ ] `adjust_topic_hierarchy` tool executes successfully
  - [ ] "Advanced Tactics" appears in the topic list
  - [ ] Existing topics are preserved (not replaced)
  - [ ] Total topic count = previous count + 1
- **Evidence**: screenshot showing new topic in hierarchy

### Step 4: Try adding a duplicate topic
- **Action**: Tell Lucy "Add 'Advanced Tactics' again"
- **Expected**: Lucy should detect the duplicate and not add it
- **Soft checks**:
  - [ ] Lucy explains the topic already exists
  - [ ] Topic count remains unchanged
- **Evidence**: screenshot of Lucy's response

## Pass Criteria

- No duplicate topics at any point
- Regeneration replaces cleanly (no orphaned entries)
- Manual topic addition works without disrupting existing hierarchy
- IndexedDB `topicsConfig.topicCount` matches displayed count after every operation

## Fail Criteria

- Duplicate topic names appear in the hierarchy
- Old topics persist after regeneration (stale data)
- Manual addition replaces all topics instead of appending
- Topic count in sidebar disagrees with detail panel

## Agent Orchestration Checks

- [ ] Lucy used `adjust_topic_hierarchy` (not `apply_topic_hierarchy`) for single-topic addition
- [ ] Lucy did not re-run `generate_topics` when asked to add a single topic
- [ ] Lucy correctly identified the duplicate request and refused it
