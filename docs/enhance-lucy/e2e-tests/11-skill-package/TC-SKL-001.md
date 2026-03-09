---
id: TC-SKL-001
title: "Skill Package - Generate, preview, and download"
area: skill-package
priority: P1
type: happy-path
mock-scenario: null
preconditions:
  - Dataset with completed pipeline (at least through evaluation)
  - Records with topic assignments and eval scores
---

# TC-SKL-001: Skill Package Generation & Download

Tests the skill packaging flow — assembling dataset into a downloadable SKILL.md + JSONL package.

## Steps

### Step 1: Generate skill package via Lucy
- **Action**: Tell Lucy "Generate a skill package for this dataset"
- **Hard checks**:
  - [ ] `generate_skill_package` tool fires
  - [ ] Tool execution completes without error
  - [ ] Tool result shows package contents (files, record count)
  - [ ] No LLM calls made (pure data assembly)
- **Evidence**: screenshot of tool execution

### Step 2: Preview skill package in viewer
- **Action**: Open SkillFileViewer (via dataset card menu or detail view)
- **Hard checks**:
  - [ ] File explorer shows SKILL.md and examples/training-data.jsonl
  - [ ] Clicking SKILL.md shows markdown preview
  - [ ] Clicking JSONL shows conversation table with collapsible examples
  - [ ] View/Edit mode toggle works
  - [ ] JSONL rows contain: system, user, assistant, base_score, eval_scores, sources
- **Evidence**: screenshot of skill file viewer

### Step 3: Download skill package
- **Action**: Click "Download SKILL" button (from card menu or viewer)
- **Hard checks**:
  - [ ] `download_skill_package` tool fires (or direct download)
  - [ ] Browser download dialog triggers
  - [ ] No errors during download process
- **Evidence**: screenshot of download trigger

### Step 4: Download from dataset card menu
- **Action**: Click "..." on dataset card → "Download SKILL"
- **Hard checks**:
  - [ ] Menu item only visible for datasets with skill package ready
  - [ ] Download triggers correctly from grid view
  - [ ] Same file as downloading from detail view

## Pass Criteria

- Skill package generated from IndexedDB data (no LLM calls)
- Preview shows correct file structure and content
- Download produces valid ZIP
- JSONL format matches expected schema

## Fail Criteria

- Package generation makes LLM calls (should be pure data assembly)
- Preview shows stale or incorrect data
- Download fails or produces corrupt ZIP
- JSONL records missing required fields
