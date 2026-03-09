---
id: TC-LUCY-010
title: "Lucy Behavior - Out-of-scope requests and irrelevant messages"
area: lucy-behavior
priority: P1
type: edge-case
mock-scenario: null
preconditions:
  - Dataset exists with Lucy sidebar open
---

# TC-LUCY-010: Out-of-Scope Requests

Tests Lucy's behavior when users ask questions or make requests unrelated to finetune dataset building.

## Steps

### Step 1: Ask general knowledge question
- **Action**: "What's the capital of France?"
- **Hard checks**:
  - [ ] Lucy does NOT call any finetune tools
  - [ ] Lucy does NOT create/modify dataset data
  - [ ] No tool execution cards appear
- **Soft checks**:
  - [ ] Lucy redirects to finetune context politely
  - [ ] Lucy explains what she CAN help with
- **Evidence**: screenshot of response

### Step 2: Ask to write code
- **Action**: "Write me a Python function to sort a list"
- **Hard checks**:
  - [ ] No finetune tools called
  - [ ] No dataset modifications
- **Soft checks**:
  - [ ] Lucy stays in her finetune assistant role
  - [ ] Lucy suggests how she can help with the dataset instead
- **Evidence**: screenshot of response

### Step 3: Ask about a different product/service
- **Action**: "How do I set up a GPT fine-tune on OpenAI?"
- **Hard checks**:
  - [ ] No finetune tools called on the current dataset
  - [ ] Lucy does NOT confuse external tools with her own
- **Soft checks**:
  - [ ] Lucy acknowledges the question but stays focused
- **Evidence**: screenshot of response

### Step 4: Ask Lucy about herself
- **Action**: "Who are you? What can you do?"
- **Soft checks**:
  - [ ] Lucy explains she's a finetune dataset assistant
  - [ ] Lucy lists her capabilities (topics, generation, evaluation, training)
  - [ ] Response is helpful and accurate
- **Evidence**: screenshot

### Step 5: Emotional/social message
- **Action**: "I'm frustrated, this isn't working" (no specific error)
- **Hard checks**:
  - [ ] Lucy does NOT randomly call tools to "fix" things
- **Soft checks**:
  - [ ] Lucy responds empathetically
  - [ ] Lucy asks what specific issue they're having
  - [ ] Lucy offers to check dataset state or show progress
- **Evidence**: screenshot of empathetic response

## Pass Criteria

- Lucy never calls tools for non-finetune requests
- Lucy stays in role and redirects appropriately
- No data modifications from out-of-scope messages

## Fail Criteria

- Lucy calls random tools in response to unrelated messages
- Lucy leaves finetune context entirely
- Lucy modifies dataset data based on irrelevant input
