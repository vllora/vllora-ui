---
id: TC-LUCY-011
title: "Lucy Behavior - New conversation reset and context cleanup"
area: lucy-behavior
priority: P1
type: regression
mock-scenario: null
preconditions:
  - Dataset with active Lucy conversation (multiple messages + tool calls)
---

# TC-LUCY-011: New Conversation Reset

Tests that starting a new conversation properly cleans up state and doesn't leak context from the previous conversation.

## Steps

### Step 1: Have a multi-turn conversation, then reset
- **Action**: Chat with Lucy through several exchanges (generate topics, approve plan, etc.), then click "+" (New Conversation)
- **Hard checks**:
  - [ ] Chat history clears completely
  - [ ] No previous messages visible
  - [ ] No previous tool execution cards visible
  - [ ] Quick actions reappear (fresh state)
- **Evidence**: screenshot of clean new conversation

### Step 2: Verify no stale context in new conversation
- **Action**: In the new conversation, say "Continue what you were doing"
- **Hard checks**:
  - [ ] Lucy does NOT resume previous conversation's plan
  - [ ] Lucy does NOT reference previous tool calls
  - [ ] Lucy treats this as a fresh interaction
- **Soft checks**:
  - [ ] Lucy asks what the user wants to work on
  - [ ] Lucy may use dataset state (which is separate from conversation state)
- **Evidence**: screenshot of fresh response

### Step 3: Verify dataset state is preserved (not conversation state)
- **Action**: In new conversation, say "What's the current state of this dataset?"
- **Hard checks**:
  - [ ] Lucy calls `get_dataset_state` (fresh read)
  - [ ] Dataset state reflects all changes from previous conversation
  - [ ] Topics, records, workflow progress all preserved
  - [ ] Only the conversation context is reset, not the data
- **Evidence**: screenshot of dataset state response

### Step 4: Start new plan in clean conversation
- **Action**: Say "Create a new plan for this dataset"
- **Hard checks**:
  - [ ] Lucy creates a FRESH plan (not re-using previous plan)
  - [ ] If previous plan was completed: Lucy considers current state
  - [ ] If previous plan was mid-execution: Lucy doesn't try to resume it
  - [ ] No plan status conflicts (previous plan's status doesn't interfere)
- **Evidence**: screenshot of new plan

### Step 5: Multiple resets in quick succession
- **Action**: Click "+" three times rapidly
- **Hard checks**:
  - [ ] No crash
  - [ ] Final state is a clean new conversation
  - [ ] No orphaned event listeners from previous conversations

## Pass Criteria

- Conversation state fully cleared on reset
- Dataset state preserved (separate from conversation)
- No stale context leaks into new conversation
- Multiple resets handled gracefully

## Fail Criteria

- Previous conversation's context leaks into new one
- Dataset state lost on conversation reset
- Previous plan's execution status interferes with new conversation
- Memory leak from repeated resets
