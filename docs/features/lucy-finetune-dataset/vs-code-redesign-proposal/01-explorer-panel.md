# Explorer Panel — VS Code File-Tree Sidebar

> **Phase:** B8-B9 (structural, after core fixes)
> **Architectural decision:** This spec implements **Vision A** — full VS Code file/tab model.
> Clicking any file in the Explorer opens it as a dynamic, closeable tab in the workspace.

---

## The Problem: No Structural Orientation

Currently, the sidebar only shows Lucy Chat. When Lucy is idle or disconnected, the user has **no structural overview** of their dataset — no way to see "where things are" without asking Lucy or clicking through tabs. A chat-only sidebar doesn't give spatial awareness.

## Why NOT a Separate Activity Bar

The app already has an **AppSidebar** (`src/components/app-sidebar.tsx`) — a collapsed 16px icon strip on the far left with Home, Chat, Datasets, and Settings navigation. Adding another Activity Bar (48px) would create **two vertical icon strips** side by side.

```
Current layout (no change to AppSidebar):
┌──────┬──────────────────────────────┬──────────────────────────────────────┐
│ App  │ SIDEBAR (340px)              │ WORKSPACE                            │
│ Side │ (Lucy Chat today)            │ (tabs + content)                     │
│ bar  │                              │                                      │
│      │                              │                                      │
│ 16px │          340px               │           flex-1                     │
└──────┴──────────────────────────────┴──────────────────────────────────────┘
  ^
  Already exists — Home, Chat, Datasets, Settings
  DO NOT add another Activity Bar here
```

## Proposed: Tab Strip on Existing Sidebar

Add a **simple 2-tab strip** at the top of the existing Lucy sidebar. The sidebar switches between Explorer and Lucy Chat views. The sidebar container and width stay the same (340px).

```
┌──────────────────────────────────┐
│ [Explorer] [Lucy]          [collapse]  │
├──────────────────────────────────┤
│                                  │
│  (Explorer file tree             │
│   or Lucy chat content)          │
│                                  │
└──────────────────────────────────┘
         340px (unchanged)
```

---

## Explorer File Tree — Dataset as a Project

When the Explorer tab is selected, the sidebar shows the dataset's structure as a **VS Code-style file tree**. Every item is either a file (opens as a tab) or a folder (expandable/collapsible). The tree represents the dataset's actual artifacts.

```
┌──────────────────────────────────┐
│ [Explorer] [Lucy dot-2]   [collapse] │
├──────────────────────────────────┤
│                                  │
│ CHESS TRAINING DATASET           │  ← project name (bold)
│ In Fine-tune · 247 records       │  ← status line
│                                  │
│ 📄 readme.md                     │  ← auto-generated dataset README
│ 📄 plan.md                       │  ← current plan (or "No plan yet")
│ 📄 tasks.md                      │  ← Lucy's task checklist / todos
│ 📄 logs.md                       │  ← execution log / activity
│                                  │
│ 📁 documents/                    │  ← uploaded reference docs
│   📄 chess-openings.pdf     done │
│   📄 chess-openings.md      done │  ← extracted content
│   📄 tactics-guide.pdf      done │
│   📄 tactics-guide.md       done │  ← extracted content
│   📄 endgame-manual.pdf  loading │
│                                  │
│ 📁 topics/                       │  ← topic hierarchy + records
│   📁 openings/ (85)              │
│     📄 record-001.jsonl          │
│     📄 record-002.jsonl          │
│     📄 ...                       │
│   📁 endgames/ (62)              │
│     📄 record-086.jsonl          │
│     📄 ...                       │
│   📁 tactics/ (50)               │
│   📁 strategy/ (50)              │
│   📁 puzzles/ (0)                │  ← empty folder
│                                  │
│ 📁 evaluations/                  │  ← evaluation scripts + jobs
│   📄 grader-script.ts            │  ← the evaluation script
│   📁 jobs/                       │
│     📄 dry-run-001.json   pass   │
│     📄 dry-run-002.json   fail   │
│                                  │
│ 📁 finetune/                     │  ← fine-tune jobs as files
│   📄 ft-chess-v2.json  running   │
│   📄 ft-chess-v1.json  done      │
│                                  │
│ 📁 quick-stats/                  │  ← aggregated metrics
│   📄 coverage.md                 │
│   📄 balance.md                  │
│   📄 quality-scores.md           │
│                                  │
└──────────────────────────────────┘
```

---

## File Tree — Item Types and Actions

### Top-Level Files

| File | Content | Opens As |
|------|---------|----------|
| `readme.md` | Auto-generated dataset README | Markdown viewer/editor tab (replaces ReadmeDrawer) |
| `plan.md` | Current plan YAML/markdown | Plan preview/editor tab (replaces PlanPreview overlay) |
| `tasks.md` | Lucy's current task checklist | Todo viewer tab (read-only, updated by Lucy) |
| `logs.md` | Execution activity log | Log viewer tab (scrollable, timestamped entries) |

### `documents/` Folder

| Item | Content | Opens As |
|------|---------|----------|
| `*.pdf` | Original uploaded document | Document viewer tab (replaces DocsDrawer) |
| `*.md` | Extracted/processed content from the PDF | Markdown viewer tab showing what Lucy extracted |

**Status badges:** `done` (fully processed), `loading` (still extracting), `error` (extraction failed)

### `topics/` Folder

| Item | Content | Opens As |
|------|---------|----------|
| `topic-name/` | Folder containing records for this topic | Expands to show records |
| `record-NNN.jsonl` | Individual training record | Record detail tab (user + assistant messages, metadata, score) |

**Record count badges:** Each topic folder shows `(count)` badge. Count animates during generation.

### `evaluations/` Folder

| Item | Content | Opens As |
|------|---------|----------|
| `grader-script.ts` | The evaluation JavaScript/TypeScript script | Monaco editor tab (replaces Evaluation tab content) |
| `jobs/` | Subfolder containing dry-run/evaluation job results | Expands to show individual jobs |
| `dry-run-NNN.json` | Single dry-run job result | Job result viewer tab (scores, pass/fail, per-record breakdown) |

**Status badges:** `pass` (all records passed), `fail` (some failed), `running` (in progress)

### `finetune/` Folder

| Item | Content | Opens As |
|------|---------|----------|
| `ft-name.json` | Fine-tune job details | Job detail tab (config, progress, loss curve, download) |

**Status badges:** `running` (in progress with epoch X/Y), `done` (completed), `failed`, `queued`

### `quick-stats/` Folder

| Item | Content | Opens As |
|------|---------|----------|
| `coverage.md` | Topic coverage analysis | Stats viewer tab |
| `balance.md` | Record balance across topics | Stats viewer tab |
| `quality-scores.md` | Average quality scores by topic | Stats viewer tab |

---

## Explorer → Workspace Tab Mapping

Every file in the Explorer opens as a **dynamic, closeable editor tab** in the workspace:

```
EXPLORER ITEM                          OPENS AS WORKSPACE TAB
──────────────────────────────────     ──────────────────────────────────────
📄 readme.md                       ->  [readme.md ×]           (markdown viewer/editor)
📄 plan.md                         ->  [plan.md ×]             (plan preview/editor)
📄 tasks.md                        ->  [tasks.md ×]            (task checklist viewer)
📄 logs.md                         ->  [logs.md ×]             (activity log viewer)
📁 documents/chess-openings.pdf    ->  [chess-openings.pdf ×]  (document viewer)
📁 documents/chess-openings.md     ->  [chess-openings.md ×]   (extracted content viewer)
📁 topics/openings/                ->  [openings/ ×]           (records table filtered)
📁 topics/openings/record-001      ->  [record-001 ×]          (record detail view)
📁 evaluations/grader-script.ts    ->  [grader-script.ts ×]    (Monaco editor)
📁 evaluations/jobs/dry-run-001    ->  [dry-run-001 ×]         (job result viewer)
📁 finetune/ft-chess-v2            ->  [ft-chess-v2 ×]         (job detail + progress)
📁 quick-stats/coverage.md         ->  [coverage.md ×]         (stats viewer)
```

**This replaces:**
- Fixed navigation tabs (Overview, Data, Evaluation, Fine-tune, Deploy) → **dynamic editor tabs**
- ReadmeDrawer (Sheet overlay) → **`readme.md` tab in workspace**
- DocsDrawer (Sheet overlay) → **individual document tabs in workspace**
- PlanPreview (overlay that hides tabs) → **`plan.md` tab alongside other tabs**
- Separate Evaluation tab → **`grader-script.ts` tab + `jobs/` tabs**
- Separate Fine-tune tab → **individual job tabs**

---

## Tab Behavior (matching VS Code)

| Behavior | Description |
|----------|-------------|
| **Single click** in Explorer | Opens as preview tab (italic title, replaced by next preview) |
| **Double click** in Explorer | Pins the tab (normal title, persists) |
| **Tab close (×)** | Closes the tab; if active, activates the next tab |
| **Tab overflow** | Horizontal scroll when too many tabs open |
| **Default open** | New dataset → `[readme.md]` tab pinned |
| **Tab persistence** | Open tabs saved to localStorage, restored on revisit |
| **Dirty indicator** | Dot on tab for unsaved changes (e.g., editing grader script) |
| **Tab types** | Each file extension renders its own content component |

---

## Tab Strip Behavior (Explorer ↔ Lucy)

| Behavior | Description |
|----------|-------------|
| **Default tab** | Lucy Chat (preserves current behavior; Explorer is opt-in) |
| **Lucy badge** | Show unread count badge on Lucy tab when Explorer is active and Lucy has new messages |
| **Processing indicator** | Pulsing dot on Lucy tab when she's working on something |
| **Error indicator** | Red dot on Lucy tab for connection errors or missing API keys |
| **Auto-switch to Lucy** | When Lucy proposes a plan or needs attention, auto-switch to Lucy tab with a toast |
| **Keyboard shortcut** | `Cmd+Shift+E` opens Explorer, `Cmd+Shift+L` opens Lucy |
| **Collapse** | Collapse button collapses entire sidebar (same as current behavior) |

## Collapsed Sidebar State

When collapsed, show the current behavior (Lucy avatar + indicators). The tab strip is hidden since there's no room. Expanding the sidebar restores whichever tab was last active.

---

## How Files Map to Actual Data

The file tree is **virtual** — it doesn't represent real files on disk. Each "file" maps to data stored in IndexedDB, the backend, or computed from state:

| Virtual File | Actual Data Source | Access Pattern |
|-------------|-------------------|----------------|
| `readme.md` | `Dataset.readme?: string` (`dataset-types.ts:321`) | `DatasetsContext` → `dataset.readme` |
| `plan.md` | `PlanContext.proposedPlan` (type `Plan`, persisted to IndexedDB `proposedPlans` store) | `PlanConsumer()` → `proposedPlan`, `planStatus` |
| `tasks.md` | `useChatStateStore.todos` from `@distri/react` Zustand store | `useChatStateStore((s) => s.todos)` — **ephemeral, lost on page reload** |
| `logs.md` | **Computed aggregation** from 7+ existing timestamped sources: `FinetuneWorkflowState` (step timestamps: `topicsConfig.generatedAt`, `graderConfig.configuredAt`, `training.startedAt`, `deployment.deployedAt`), `GenerationHistory` store (per-round stats), `DryRunJob` (`createdAt/startedAt/completedAt`), `FinetuneJob` (`created_at/completed_at`), `KnowledgeSource` (`createdAt/processedAt`), `Snapshots` store | New `activity-log-service.ts` reads all sources, merges by timestamp → `LogsViewer.tsx` renders timeline |
| `documents/*.pdf` | `KnowledgeSource` type (`dataset-types.ts:373`) in separate `vllora-knowledge-sources` IndexedDB store | `KnowledgeSourcesContext` (`src/contexts/KnowledgeSourcesContext.tsx`) |
| `documents/*.md` | `KnowledgeSource.extractedContent?: ExtractedContent` (has `text`, `sections`, `sectionHeadings`) | Same `KnowledgeSourcesContext` |
| `topics/*/` | `Dataset.topicHierarchy?: TopicHierarchyConfig` (`dataset-types.ts:309`) + records grouped by `DatasetRecord.topic` field | `DatasetsContext` for tree structure, records filtered by `record.topic` path |
| `topics/*/record-NNN` | `DatasetRecord` (`dataset-types.ts:28`) in `vllora-datasets` IndexedDB store | `DatasetsContext` → records array |
| `evaluations/grader-script.ts` | `Dataset.evalScript?: string` (`dataset-types.ts:311`) | `DatasetsContext` → `dataset.evalScript` |
| `evaluations/jobs/*` | `DryRunJob` (`src/types/dry-run-job.ts:24`) in IndexedDB `dryRunJobs` store | `DryRunJobsContext` (`src/contexts/DryRunJobsContext.tsx`) |
| `finetune/*` | `FinetuneJob` (`src/services/finetune-api.ts:85`) from backend API | `FinetuneJobsContext` (`src/contexts/FinetuneJobsContext.tsx`) |
| `quick-stats/*` | Computed from `Dataset.stats`, `Dataset.coverageStats`, `Dataset.dryRunStats` | `DatasetsContext` → `dataset.stats`, `dataset.coverageStats`, `dataset.dryRunStats` |

---

## File Tree State Updates

The file tree must update in real-time as Lucy works:

| Event | Tree Update | Emitter Event | Status |
|-------|-------------|---------------|--------|
| Document uploaded | New file appears in `documents/` with `loading` badge | `vllora_knowledge_source_updated` | EXISTS |
| Document processed | Badge changes to `done`, extracted `.md` file appears | `vllora_knowledge_source_updated` | EXISTS |
| Plan proposed | `plan.md` gains a dot indicator (needs attention) | `vllora_plan_proposed` | EXISTS |
| Topics configured | New folders appear in `topics/` | `vllora_dataset_refresh` (broad) | PARTIAL — no dedicated event |
| Records generated | Files appear inside topic folders, counts animate | `vllora_data_generation_progress` | EXISTS |
| Evaluation script saved | `grader-script.ts` shows "modified" indicator | **None** | MISSING — need `vllora_eval_script_updated` |
| Dry run completed | New file in `evaluations/jobs/` with pass/fail badge | `vllora_dry_run_job_update` | EXISTS |
| Fine-tune job started | New file in `finetune/` with `running` badge | `vllora_finetune_job_created` | EXISTS |
| Fine-tune job done | Badge changes to `done` | `vllora_finetune_job_created` (reused) | EXISTS |
| Tasks updated by Lucy | `tasks.md` shows unread indicator | `lucy-todos-updated` (window CustomEvent) | PARTIAL — different event system |
| Workflow state changes | Status line updates (e.g., "In Fine-tune") | `vllora_workflow_updated` | EXISTS |

> **Implementation note:** Two events need to be added before the Explorer can have full real-time updates:
> 1. `vllora_eval_script_updated` — emit when `configure_grader` tool saves `Dataset.evalScript`
> 2. Optionally: `vllora_topics_configured` — emit when topics are first configured (currently uses broad `vllora_dataset_refresh`)

---

## Why File-Tree > Flat Sections

1. **Mental model alignment** — Developers already know how to navigate file trees
2. **Concrete artifacts** — `readme.md`, `plan.md`, `grader-script.ts` feel like real files you can open and edit
3. **Natural grouping** — `documents/` contains both uploads and extractions; `evaluations/` contains both script and results
4. **Scalable** — 50 records become 50 files in a folder (collapsible); flat list would be overwhelming
5. **VS Code muscle memory** — Single-click preview, double-click pin, close with ×, tab overflow scroll

---

## Implementation

| Item | Description | Effort |
|------|-------------|--------|
| `SidebarTabStrip.tsx` | New component: 2-tab strip (`Explorer` / `Lucy`) with badge support | S |
| `DatasetExplorer.tsx` | New component: file tree with virtual file/folder items, expand/collapse, badges | L |
| `FileTreeItem.tsx` | New component: single tree item (file icon, name, badge, indent level) | S |
| `WorkspaceTabManager.tsx` | New component: dynamic tab bar with open/close/preview/pin behavior | M |
| `TabContentRouter.tsx` | New component: renders correct content component based on tab file type | M |
| Modify `LucyDatasetAssistant.tsx` | Wrap current content to be switchable with Explorer. Add tab state. | S |
| Modify `DatasetDetailContentV2.tsx` | Replace fixed tabs with `WorkspaceTabManager`. Route content through `TabContentRouter`. | M |
| **Total effort** | **L (3-5 days)** | |

No new `ActivityBar.tsx` or `SidebarContainer.tsx` needed. The existing sidebar component gains a tab strip and conditionally renders Explorer or Lucy content.
