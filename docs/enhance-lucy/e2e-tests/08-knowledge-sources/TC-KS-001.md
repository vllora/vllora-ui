---
id: TC-KS-001
title: "Knowledge Sources - Upload and extraction happy path"
area: knowledge-sources
priority: P0
type: happy-path
mock-scenario: null
preconditions:
  - Dataset exists (empty or with some records)
  - Lucy sidebar open
---

# TC-KS-001: Knowledge Source Upload & Extraction

Tests the full knowledge source lifecycle: upload PDF/text via chat drag-drop or panel, extraction, topic discovery, and impact on plan generation.

## Steps

### Step 1: Upload document via KnowledgeSourcesPanel button (or Lucy chat)
- **Action**: Click "Upload documents" in KnowledgeSourcesPanel (or tell Lucy to upload a document)
- **Hard checks**:
  - [ ] File picker opens and accepts PDF/text formats
  - [ ] Upload progress toast appears
  - [ ] Knowledge source appears in KnowledgeSourcesPanel
  - [ ] Source shows "Processing" status initially
  - [ ] `upload_knowledge_source` tool fires (or equivalent handler)
- **Soft checks**:
  - [ ] Lucy acknowledges the upload
- **Evidence**: screenshot of upload in progress

### Step 2: Extraction completes
- **Action**: Wait for knowledge source processing to finish
- **Hard checks**:
  - [ ] Source status changes from "Processing" to "Ready"
  - [ ] Extracted topics/content visible in source card
  - [ ] Source card shows topic count and record linkage stats
  - [ ] No duplicate sources created
- **Evidence**: screenshot of completed extraction

### Step 3: Upload via KnowledgeSourcesPanel button
- **Action**: Click "Upload documents" button in KnowledgeSourcesPanel
- **Hard checks**:
  - [ ] File picker opens
  - [ ] Selected file stages for upload
  - [ ] Optional comment/objective input available
  - [ ] "Confirm" button triggers upload
  - [ ] Second source appears in panel (no duplicates with first)
- **Evidence**: screenshot of panel with multiple sources

### Step 4: Lucy auto-analyzes knowledge sources
- **Action**: After sources ready, Lucy should auto-analyze
- **Hard checks**:
  - [ ] `analyze_knowledge_sources` tool fires
  - [ ] Tool result shows source structure, topic suggestions
  - [ ] Lucy proposes a plan based on extracted content
  - [ ] Plan references the uploaded documents
- **Soft checks**:
  - [ ] Lucy mentions the document names/content areas
  - [ ] Plan topics align with document content
- **Evidence**: screenshot of plan based on knowledge sources

### Step 5: Delete a knowledge source
- **Action**: Click delete (X) on a knowledge source card
- **Hard checks**:
  - [ ] Source removed from panel
  - [ ] Source removed from IndexedDB
  - [ ] Related topic suggestions updated (if applicable)
  - [ ] No orphaned data from deleted source

## Pass Criteria

- Documents upload and extract successfully
- Both upload methods work (drag-drop and panel button)
- Lucy auto-analyzes and uses sources in planning
- Delete removes source cleanly

## Fail Criteria

- Upload fails silently (no error shown)
- Extraction hangs indefinitely
- Duplicate sources created from same file
- Lucy ignores uploaded sources in planning
- Delete leaves orphaned data
