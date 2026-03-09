---
id: TC-KS-002
title: "Knowledge Sources - Processing wait behavior and plan blocking"
area: knowledge-sources
priority: P0
type: edge-case
mock-scenario: null
preconditions:
  - Empty dataset with NO knowledge sources yet
  - Lucy sidebar open
---

# TC-KS-002: Knowledge Source Processing Wait

Tests Lucy's behavior when sources are still processing — Lucy MUST NOT retry or proceed until extraction completes. This is a critical guardrail.

## Steps

### Step 1: Upload document and immediately ask Lucy for a plan
- **Action**: Upload a PDF, then immediately say "Create a plan for this dataset"
- **Hard checks**:
  - [ ] Lucy calls `analyze_knowledge_sources`
  - [ ] Tool returns `sources_processing: true`
  - [ ] Lucy STOPS and tells user "Still extracting, I'll create a plan when ready"
  - [ ] Lucy does NOT retry `analyze_knowledge_sources` in a loop
  - [ ] Lucy does NOT proceed to `generate_topics` or `propose_plan`
- **Soft checks**:
  - [ ] Lucy's message is clear about waiting
  - [ ] Lucy doesn't apologize excessively or seem confused
- **Evidence**: screenshot showing Lucy's wait message

### Step 2: Source finishes processing
- **Action**: Wait for extraction to complete
- **Hard checks**:
  - [ ] Source status changes to "Ready"
  - [ ] Lucy receives notification (via event or next interaction)
  - [ ] Lucy auto-proceeds to plan creation (or prompts user)
- **Evidence**: screenshot of completed processing

### Step 3: Verify plan uses extracted content
- **Action**: Lucy should now propose a plan
- **Hard checks**:
  - [ ] `generate_topics` fires with knowledge source context
  - [ ] `generate_grader` fires with extracted domain info
  - [ ] `propose_plan` produces plan referencing the documents
  - [ ] Plan topics align with extracted content
- **Evidence**: screenshot of plan

### Step 4: User asks again while still processing (repeat test)
- **Action**: Upload another document, rapidly ask "analyze my documents" 3 times
- **Hard checks**:
  - [ ] Lucy does NOT make 3 separate analyze_knowledge_sources calls
  - [ ] Lucy handles rapid requests gracefully (single response)
  - [ ] No duplicate tool executions
  - [ ] No race conditions in source processing

## Pass Criteria

- Lucy correctly waits for processing (no retry loops)
- Lucy proceeds after processing completes
- Plan incorporates extracted knowledge
- Rapid requests don't cause duplicates

## Fail Criteria

- Lucy retries analyze_knowledge_sources while processing
- Lucy proceeds without waiting for extraction
- Lucy enters infinite wait loop
- Multiple duplicate plans generated from rapid requests

## Agent Orchestration Checks

- [ ] Lucy checked `sources_processing` flag before proceeding
- [ ] Lucy did NOT call `generate_topics` while sources processing
- [ ] Lucy used event notification (not polling) to know when ready
- [ ] No more than 1 `analyze_knowledge_sources` call per user request
