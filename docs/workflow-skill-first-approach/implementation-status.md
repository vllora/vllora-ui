# UI Redesign — Implementation Status

## Date: 2026-03-18 (latest)

## Overview

This document tracks the implementation progress of the 3-page UI redesign (Canvas, Sources, Table) as described in `ui-visualization-redesign.md` and prototyped in `mockup-dataset-redesign.html`.

---

## Mockup (HTML Prototype)

**File:** `mockup-dataset-redesign.html`
**Served at:** `localhost:8888` (use any local HTTP server)

The mockup contains all 3 views with working interactions, live data from the gateway API, and a Mockup Controls panel. It serves as the **source of truth** for visual design.

### Mockup Features Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| Canvas view with topic nodes | Done | Quality scores, coverage bars, source counts |
| Sources view (All Sources + Single Doc) | Done | Coverage matrix, part outline, topic dots |
| Table view with hierarchical grouping | Done | Parent/child groups, score columns, prompt panel |
| Record detail sidebar | Done | Split eval/train scores, conversation (system+user), source context, details grid |
| Data Flow Banner | Done | Normal/Empty/Extracting states |
| Keyboard shortcuts | Done | 1/2/3 switch pages, Esc close, ? help |
| Empty/Extracting states | Done | Via Mockup Controls toggle |
| Dedicated score columns per job | Done | Eval v1, v2, v3 + Train v1, v2 with bar charts, trends, running/queued states |
| Parent-level records | Done | Records assigned to non-leaf topics get amber tag |

### Record Detail Sidebar Design (Latest)

The sidebar was redesigned through multiple iterations. Current design:

```
┌─────────────────────────────────────────────┐
│ Record #1            ‹ 1/150 ›   ✏️ 🗑️ ✕  │
├─────────────────────────────────────────────┤
│ Basic Tactical Patterns › [Forks]           │
├─────────────────────────────────────────────┤
│ SCORES                                      │
│ ● Evaluations                               │
│   v1  ██████████████████    0.87             │
│   v2  ████████████████████  0.90  ↑          │
│   v3  ░░░░░░░░░░░░░░░░░░    ⟳              │
│ ● Training                                  │
│   v1  ██████████████████    0.90             │
│   v2  ░░░░░░░░░░░░░░░░░░  queued            │
├─────────────────────────────────────────────┤
│ CONVERSATION                                │
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│ │ SYSTEM                                  │ │
│ │ You are an expert chess tutor...        │ │
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
│ ┌───────────────────────────────────────┐   │
│ │ USER                                  │   │
│ │ Explain the knight fork tactic...     │   │
│ └───────────────────────────────────────┘   │
├─────────────────────────────────────────────┤
│ SOURCE CONTEXT                              │
│ 📄 chess-tactics.pdf · 3 sources            │
│ "The knight fork is the most common..."     │
├─────────────────────────────────────────────┤
│ DETAILS                                     │
│ ┌──────────┬──────────┬──────────┐          │
│ │ 284      │ 3 sources│ 2        │          │
│ │ Tokens   │ Src Ref  │ Turns    │          │
│ └──────────┴──────────┴──────────┘          │
└─────────────────────────────────────────────┘
```

**Key decisions:**
- Scores split into **Evaluations** (blue dot) and **Training** (green dot) groups — prevents confusion between eval and train scores
- Labels simplified to "v1", "v2" etc. since the group header identifies the type
- Conversation shows **only system + user** messages (no assistant) — training records don't have assistant output
- System prompt: dashed border, dim text. User message: solid border, full brightness
- Trend arrows calculated **within** each group (eval trends compare to prev eval, train to prev train)

---

## React UI — Implementation Status

### Completed Components

| Component | File | Status | What it does |
|-----------|------|--------|-------------|
| **RecordDetailSidebar** | `src/components/datasets/records-table/RecordDetailSidebar.tsx` | ✅ Done | Redesigned sidebar matching mockup: split eval/train scores, conversation layout, source context, details grid |
| **UnifiedRecordTable** | `src/components/datasets/records-table/UnifiedRecordTable.tsx` | ✅ Done | Single-table layout with parent/child groups, dynamic job score columns |
| **useJobScoreColumns** | `src/hooks/useJobScoreColumns.ts` | ✅ Done | Hook that merges eval + finetune jobs into unified score columns with per-record lookups |
| **job-score-columns** | `src/components/datasets/records-table/job-score-columns.ts` | ✅ Done | Types (`JobColumn`, `RecordJobScore`) and helpers (`buildJobColumns`, `getScoreClass`) |
| **DatasetMainContent** | `src/components/datasets/DatasetMainContent.tsx` | ✅ Modified | Wired up `useJobScoreColumns` + `FinetuneJobsConsumer`, passes job data to sidebar |
| **RecordsTable** | `src/components/datasets/records-table/RecordsTable.tsx` | ✅ Modified | Uses `UnifiedRecordTable` with job score columns |
| **Canvas quality scores** | `src/components/datasets/dataset-canvas/topic-node/CollapsedTopicNode.tsx` | ✅ Already done | Color-coded score dots on topic nodes |
| **Sources topic dots** | `src/components/datasets/sources-view/SourcesView.tsx` | ✅ Already done | `TopicLinkBadge` shows linked topic counts per part |
| **DataFlowBanner** | `src/components/datasets/DataFlowBanner.tsx` | ✅ Done | Pipeline visualization with normal/empty/extracting states |
| **PromptInheritancePanel** | `src/components/datasets/records-table/PromptInheritancePanel.tsx` | ✅ Done | 3-card prompt chain display |
| **CanvasEmptyState** | `src/components/datasets/dataset-canvas/CanvasEmptyState.tsx` | ✅ Done | Empty state for canvas when no topics |
| **SourceGhostNodes** | `src/components/datasets/dataset-canvas/SourceGhostNodes.tsx` | ✅ Done | Source nodes appearing during zoom-to-inspect |
| **TopicInspectorDrawer** | `src/components/datasets/dataset-canvas/TopicInspectorDrawer.tsx` | ✅ Done | Bottom drawer for topic inspection |
| **useKeyboardShortcuts** | `src/hooks/useKeyboardShortcuts.ts` | ✅ Done | Page switching (1/2/3), Esc close |
| **usePromptScrollTracking** | `src/hooks/usePromptScrollTracking.ts` | ✅ Done | Auto-tracks prompt panel to current topic on scroll |

### Score Column Architecture

The score column system uses a hook pattern because `FinetuneJobsContext` is not directly exportable:

```
DatasetMainContent
  ├── FinetuneJobsConsumer() → finetuneCtx
  ├── useJobScoreColumns(finetuneCtx) → { columns, getScoresForRecord }
  ├── RecordsTable
  │     └── UnifiedRecordTable(jobColumns, getScoresForRecord)  // score columns in table
  └── RecordDetailSidebar(jobColumns, getScoresForRecord)       // score bars in sidebar
```

**Data flow:**
1. `buildJobColumns()` merges eval jobs (from `EvalJobsContext`) + finetune jobs into chronologically sorted `JobColumn[]`
2. `getScoresForRecord(recordId)` returns a `Map<jobId, RecordJobScore>` with score, trend, and status for each job
3. Both the table (column cells) and sidebar (bar charts) consume the same data

### Known Issues / Minor Items

| Issue | Severity | Notes |
|-------|----------|-------|
| Topic breadcrumb in sidebar may show only leaf name | Low | `record.topic` ID matching with `AvailableTopic.id` — parent path not always resolved |
| No assistant message in sidebar | By design | Training records only contain system + user messages |

---

## How to Continue

### If you want to modify the mockup
1. Edit `mockup-dataset-redesign.html`
2. Serve with `python3 -m http.server 8888` from this directory
3. The mockup loads live data from `localhost:9090` (gateway API)

### If you want to modify the React UI
1. Run `npm run dev` (localhost:5173)
2. The sidebar is in `RecordDetailSidebar.tsx` — it receives `jobColumns` and `getScoresForRecord` from `DatasetMainContent`
3. Score column logic is in `useJobScoreColumns.ts` and `job-score-columns.ts`
4. Run `npx tsc --noEmit` after every change (automated via PostToolUse hook)

### Files to know about

| Purpose | File |
|---------|------|
| Record detail sidebar | `src/components/datasets/records-table/RecordDetailSidebar.tsx` |
| Unified table with score columns | `src/components/datasets/records-table/UnifiedRecordTable.tsx` |
| Job score column hook | `src/hooks/useJobScoreColumns.ts` |
| Job score types + helpers | `src/components/datasets/records-table/job-score-columns.ts` |
| Main content (wires up hooks) | `src/components/datasets/DatasetMainContent.tsx` |
| Table entry point | `src/components/datasets/records-table/RecordsTable.tsx` |
| HTML mockup | `docs/workflow-skill-first-approach/mockup-dataset-redesign.html` |
