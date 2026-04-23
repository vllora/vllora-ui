---
id: TC-DU-005
title: "Dummy User - Rapid messages, interruptions, and impatience"
area: dummy-user
priority: P1
type: edge-case
mock-scenario: '{\"evalScenario\":\"healthy\",\"evalPollsBeforeComplete\":1}'
preconditions:
  - Dataset with topics and records
  - Lucy sidebar open
---

# TC-DU-005: Rapid Messages, Interruptions, and Impatience

Tests what happens when a user sends multiple messages rapidly, interrupts Lucy mid-response, or keeps asking "is it done yet?"

## Steps

### Step 1: Send 3 messages before Lucy responds to first
- **Action**: Rapidly type and send:
  1. "Generate topics for this dataset"
  2. "Actually, generate 50 records"
  3. "Wait, first show me the current state"
- **Hard checks**:
  - [ ] App does NOT crash from message queue
  - [ ] Lucy processes messages in order
  - [ ] No duplicate tool executions
  - [ ] Lucy's final response addresses the latest intent
  - [ ] Chat shows all 3 messages correctly within the current session
- **Soft checks**:
  - [ ] Lucy acknowledges the changing instructions gracefully
- **Evidence**: screenshot of chat with rapid messages

### Step 2: Ask "is it done?" repeatedly during evaluation
- **Action**: Start evaluation, then send "is it done?" 5 times while polling
- **Hard checks**:
  - [ ] Each message gets a response (not silently dropped)
  - [ ] No additional `run_evaluation` calls triggered
  - [ ] Lucy gives status updates (not just "still running" copies)
  - [ ] Evaluation completes normally despite interruptions
- **Evidence**: screenshot of repeated status queries

### Step 3: Send contradictory instructions
- **Action**: Say "Generate 100 records" then immediately say "Actually, delete all records"
- **Hard checks**:
  - [ ] Lucy does NOT execute both simultaneously
  - [ ] Lucy asks for clarification OR follows latest instruction
  - [ ] No data corruption from conflicting operations
  - [ ] Clear state after resolution
- **Evidence**: screenshot of contradictory handling

### Step 4: Click "New Conversation" (+) button during execution
- **Action**: While Lucy is executing tools, click the "+" button to start new conversation
- **Hard checks**:
  - [ ] `handleNewChat()` fires
  - [ ] Chat history clears
  - [ ] Tool execution state is properly cleaned up
  - [ ] No orphaned background operations
  - [ ] Lucy can start fresh without stale context
- **Evidence**: screenshot of clean new conversation

### Step 5: Close sidebar during tool execution, reopen immediately
- **Action**: While Lucy is executing a tool, collapse sidebar, wait 2 seconds, expand
- **Hard checks**:
  - [ ] Tool execution continues during sidebar collapse
  - [ ] On reopen, chat shows correct state
  - [ ] No duplicate messages or tool cards
  - [ ] Progress is not lost
- **Evidence**: screenshot after reopen

## Pass Criteria

- App handles rapid input without crashes
- No duplicate tool executions from repeated messages
- Interruptions are handled gracefully (current op finishes, then new instruction)
- Contradictory instructions resolved without data corruption
- New conversation properly cleans up state

## Fail Criteria

- App crashes from message queue overflow
- Duplicate tool calls (e.g., 5 evaluations started)
- Data corruption from conflicting operations
- Orphaned background operations after new conversation
- Chat history garbled from rapid messages
