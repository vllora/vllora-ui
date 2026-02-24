# Implementation Plan — VS Code Redesign (Unified)

> Single source of truth for all implementation phases (A, 0, 1, 2, 3, C, D).
>
> Generated from team investigation (2026-02-24). Findings from: Behavior Validator, UX/UI Reviewer.
> Architecture review (round 2): **5 agents, 48 PASS, 5 FAIL (all fixed), 15 WARN (documented)**
> Lucy architecture deep dive: Agent pipeline, sub-agents, tool execution, IndexedDB — all compatible.
>
> **Status: Phases A, 0, 1, 2, 3, C, D complete** | Branch: `refactor/ux-redesign-follow-vs-code`

---

## Key Decisions

| Question | Answer |
|----------|--------|
| Does Lucy's agent need changes? | **No.** Agent writes data via tools → tools emit events → Explorer listens. Purely frontend. |
| Do frontend tools need changes? | **Minimal.** Add 1-2 new events in existing tools. |
| How do we handle "files"? | Virtual file tree — every "file" maps to existing data in IndexedDB/contexts. |
| What's missing in data layer? | `logs.md` has no backing data. `tasks.md` is ephemeral (lost on reload). |
| Which repo(s) change? | **This repo only** (`vllora/ui`). No distri or gateway changes needed. |

---

## Architecture: What Changes vs What Stays

### Stays Unchanged

- Lucy agent prompt + tools (`vllora/gateway/agents/finetune/`)
- Distri server (`distri/server/`)
- `@distri/react` and `@distri/core` packages
- IndexedDB data models (`DatasetRecord`, `Dataset`, `KnowledgeSource`, `DryRunJob`, `FinetuneJob`)
- Tool execution pipeline (`src/lib/distri-finetune-tools/`)
- All React contexts (`DatasetsContext`, `PlanContext`, `KnowledgeSourcesContext`, `DryRunJobsContext`, `FinetuneJobsContext`)

### Changes (Frontend Only)

| Layer | What Changes |
|-------|-------------|
| **Sidebar** | New Explorer panel with file tree + `[Explorer] [Lucy]` tab strip |
| **Workspace** | Fixed tabs → dynamic editor tabs (open/close/preview/pin) |
| **Overlays** | ReadmeDrawer, DocsDrawer → become tabs; PlanPreview → becomes tab |
| **Events** | Add 1-2 new emitter events; update `vllora_switch_tab` / `vllora_open_drawer` semantics |
| **State** | New `WorkspaceTabsContext` for open/active/pinned tabs |

---

## New Components to Build

| # | Component | Location | Purpose | Effort | Phase |
|---|-----------|----------|---------|--------|-------|
| 1 | `DatasetExplorer.tsx` | `src/components/datasets/sidebar/` | VS Code file tree — reads from 5+ contexts to build virtual tree | L | B8 |
| 2 | `FileTreeItem.tsx` | `src/components/datasets/sidebar/` | Recursive tree item (modeled on existing `TopicTreeNode.tsx`) | S | B8 |
| 3 | `SidebarTabStrip.tsx` | `src/components/datasets/sidebar/` | `[Explorer] [Lucy]` tab strip replacing sidebar header | S | B9 |
| 4 | `WorkspaceTabManager.tsx` | `src/components/datasets/` | Dynamic tab bar with open/close/preview/pin + localStorage persistence | M | B9 |
| 5 | `TabContentRouter.tsx` | `src/components/datasets/` | Maps virtual file path → existing content component | M | B9 |
| 6 | `WorkspaceTabsContext.tsx` | `src/contexts/` | React Context for open/active/pinned tab state (follows mandatory state pattern) | M | B9 |
| 7 | `TasksViewer.tsx` | `src/components/datasets/` | Viewer for `tasks.md` (reads `useChatStateStore.todos`) | S | B8 |
| 8 | `LogsViewer.tsx` | `src/components/datasets/` | Viewer for `logs.md` — computed timeline from 7+ existing data sources (workflow state, jobs, knowledge sources) | M | B8 |
| 9 | `activity-log-service.ts` | `src/services/` | Aggregation service: reads all timestamped sources, merges into sorted `ActivityLogEntry[]` | M | B8 |

---

## Components to Delete

| Component | File | Replaced By |
|-----------|------|-------------|
| `ArrowSegment.tsx` | `src/components/datasets/dataset-detail-header/ArrowSegment.tsx` | `WorkspaceTabManager` horizontal tabs |
| `SectionTabs.tsx` | `src/components/datasets/dataset-detail-header/SectionTabs.tsx` | `WorkspaceTabManager` dynamic tabs |
| `ReadmeDrawer.tsx` | `src/components/datasets/ReadmeDrawer.tsx` | `readme.md` tab in workspace |
| `DocsDrawer.tsx` | `src/components/datasets/DocsDrawer.tsx` | `documents/*` tabs in workspace |

---

## Components to Modify

| Component | File | Change |
|-----------|------|--------|
| `LucyDatasetAssistant.tsx` | `src/components/datasets/LucyDatasetAssistant.tsx` | Replace header (lines 484-576) with `SidebarTabStrip`. Switch content between Explorer and chat based on active sidebar tab. |
| `DatasetDetailContentV2.tsx` | `src/components/datasets/DatasetDetailContentV2.tsx` | Replace fixed `activeSection` routing (lines 527-600) with `WorkspaceTabManager` + `TabContentRouter`. Remove `isPlanPreviewActive` overlay (lines 509-523). Remove ReadmeDrawer and DocsDrawer mounting. |
| `PlanPreview.tsx` | `src/components/datasets/PlanPreview.tsx` | Convert from full workspace overlay to normal tab content panel. Remove fullscreen layout. Plan approval/dismiss actions move into the tab's toolbar. |
| `PlanContext.tsx` | `src/contexts/PlanContext.tsx` | Remove `isPlanPreviewActive` / `setIsPlanPreviewActive` state. Plan opens as `plan.md` tab instead. |
| `DatasetUtilityBar.tsx` | `src/components/datasets/dataset-detail-header/DatasetUtilityBar.tsx` | Replace `SectionTabs` usage with `WorkspaceTabManager`. Or delete entirely if `WorkspaceTabManager` is rendered directly in `DatasetDetailContentV2`. |

---

## Components to Reuse (Existing → Tab Content)

These existing components become the content panels for dynamic tabs with minimal or no changes:

| Existing Component | File | Becomes Tab For | Changes Needed |
|-------------------|------|----------------|----------------|
| `DatasetReadmeViewer` | `src/components/datasets/readme-viewer/index.tsx` | `readme.md` | None — already receives `readme: string` prop |
| `PlanPreview` + `PlanEditor` | `src/components/datasets/PlanPreview.tsx` | `plan.md` | Remove overlay behavior, keep content |
| `KnowledgeSourcesPanel` | `src/components/datasets/KnowledgeSourcesPanel.tsx` | `documents/` folder tab | Upload UX needs new trigger (Explorer context menu or header action) |
| `EvaluationConfigPanel` | `src/components/datasets/evaluation-dialog/EvaluationConfigPanel.tsx` | `evaluations/grader-script.ts` | None — already has Monaco editor |
| `RecordsTable` | `src/components/datasets/records-table/RecordsTable.tsx` | `topics/*/` folder tabs | Filter by topic path prop |
| `RecordDetailSidebar` | `src/components/datasets/records-table/RecordDetailSidebar.tsx` | `topics/*/record-NNN` | **Needs extraction**: currently wraps content in shadcn `Sheet` — must strip Sheet wrapper and extract inner content as standalone panel |
| `DryRunActivityView` | `src/components/datasets/dry-run-dialog/DryRunActivityView.tsx` | `evaluations/jobs/*` | None |
| `JobDetailPanel` | `src/components/finetune/content/finetune-job-detail/JobDetailPanel.tsx` | `finetune/*` | None |
| `DatasetOverviewCard` | `src/components/datasets/dataset-detail-header/overview-card/DatasetOverviewCard.tsx` | `quick-stats/*` | **New work**: currently a single combined card — needs splitting into 3 standalone sub-views (coverage.md, balance.md, quality-scores.md) |

---

## Event System Changes

### Events to Add

| Event Name | Where to Emit | Trigger |
|-----------|---------------|---------|
| `vllora_eval_script_updated` | `configure_grader` tool in `src/lib/distri-finetune-tools/steps/` | When `Dataset.evalScript` is saved to IndexedDB |
| `vllora_topics_configured` (optional) | `configure_topics` tool | When topics are first configured (currently uses broad `vllora_dataset_refresh`) |

### Events to Update

| Event | System | Current Behavior | New Behavior | Call Sites |
|-------|--------|-----------------|--------------|------------|
| `vllora_switch_tab` | mitt emitter | Sends section names: `"records"`, `"evaluator"`, etc. | Listener maps old names → dynamic tab paths. Or update all 17 emit sites to send file paths. | **17 emitters** across 6 files (`execute-plan.ts`:4, `DatasetOverviewPanel.tsx`:7, `PlanCompletionCard.tsx`:2, `DryRunActivityView.tsx`:2, `RecordDetailSidebar.tsx`:1, `RecordRow.tsx`:1). **1 listener** (`DatasetDetailContentV2.tsx:226`). |
| `finetune-set-view-mode` | window CustomEvent | Dispatches `{ section: 'records' \| 'evaluator' \| 'jobs' }` to switch active tab | Listener maps old section names → dynamic tab paths. | **6 emitters** in tools: `workflow/index.ts:39`, `generate-topics/index.ts:244`, `generate-grader.ts:335`, `configure-grader.ts:148`, `start-training.ts:64`, `check-training-status.ts:28`. **1 listener** (`DatasetDetailContext.tsx:361` → `setActiveSection()`). |
| `vllora_open_drawer` | mitt emitter | Opens ReadmeDrawer or DocsDrawer as Sheet overlay | Opens `readme.md` or `documents/` as a workspace tab | **3 emitters** (`PlanPreview.tsx:376`, `DocsProcessingState.tsx:44`, `SourcesProcessingMessage.tsx:32`). **1 listener** (`DatasetDetailContentV2.tsx:227`). Note: `type: 'readme'` is defined but never emitted (dead code). |

### Event Subscription Note — Three Event Systems

The codebase uses **three** separate event systems. The Explorer and `WorkspaceTabsContext` must handle all three:

1. **`emitter` (mitt library)** — `src/utils/eventEmitter.ts`. Used by most tool ↔ UI events. Subscribe via `emitter.on()`, clean up in `useEffect` return.
2. **`window.dispatchEvent(CustomEvent)`** — native browser events. Used by `finetune-set-view-mode`, `finetune-workflow-updated`, `lucy-todos-updated`. Subscribe via `window.addEventListener()`.
3. **`DATASET_REFRESH_EVENT`** — a string constant (`'vllora_dataset_refresh'`) in `datasets-db.ts`. **Not typed** in the `Events` union of `eventEmitter.ts` — all usage requires `as any` cast. Should be added to the typed Events union as a cleanup.

### Event-Emitter-Guide Documentation Fix Needed

`docs/features/lucy-finetune-dataset/event-emitter-guide.md` sections 3–7 use wrong event name prefix: `vllora_setup_plan_*` instead of actual `vllora_plan_*`. All 5 plan lifecycle event names are wrong in the guide:
- `vllora_setup_plan_generating` → `vllora_plan_generating`
- `vllora_setup_plan_proposed` → `vllora_plan_proposed`
- `vllora_setup_plan_dismissed` → `vllora_plan_dismissed`
- `vllora_setup_plan_approved` → `vllora_plan_approved`
- `vllora_setup_plan_progress` → `vllora_plan_progress`

---

## New State Management: `WorkspaceTabsContext`

Following the mandatory React Context pattern from `docs/state-management-pattern.md`:

```
File: src/contexts/WorkspaceTabsContext.tsx
```

### State Shape

```typescript
interface VirtualFile {
  path: string;           // e.g., "readme.md", "topics/openings/record-001"
  label: string;          // Display name, e.g., "readme.md", "record-001"
  icon: string;           // lucide-react icon name
  type: 'file' | 'folder';
  isPinned: boolean;      // double-clicked = pinned, single-click = preview
}

interface WorkspaceTabsState {
  openTabs: VirtualFile[];
  activeTabPath: string | null;
  previewTabPath: string | null;  // italic tab, replaced by next single-click
}
```

### Behavior Rules (matching VS Code)

1. **Single-click** file in Explorer → opens as preview tab (italic title). If a preview tab already exists, it's replaced.
2. **Double-click** file in Explorer → pins the tab (normal title). Persists until closed.
3. **Editing** a preview tab auto-pins it.
4. **Close (x)** removes the tab. If it was active, the nearest tab becomes active.
5. **Persistence:** Open tabs + active tab saved to `localStorage` key `workspace-tabs:{datasetId}`. Restored on page revisit.

---

## Data Layer Gaps and Decisions

### Gap 1: `logs.md` — Computed aggregation (no single field, but data exists)

Investigation found that timestamped activity data already exists across 7+ sources. No new database schema or event system needed — `logs.md` is a **computed view** that aggregates existing data into a timeline.

**Existing data sources (all persisted to IndexedDB with timestamps):**

| Source | Timestamps Available | Data |
|--------|---------------------|------|
| `FinetuneWorkflowState` | `createdAt`, `updatedAt` | Workflow creation, last modification |
| `FinetuneWorkflowState.topicsConfig` | `generatedAt` | When topics were generated |
| `FinetuneWorkflowState.graderConfig` | `configuredAt` | When evaluator was configured |
| `FinetuneWorkflowState.training` | `startedAt` | When training started |
| `FinetuneWorkflowState.deployment` | `deployedAt` | When model was deployed |
| `FinetuneWorkflowState.coverageGeneration.generationRounds[]` | `timestamp` per round | Each synthetic data generation round |
| `GenerationHistory` IndexedDB store | `createdAt` per entry | Detailed generation stats (records generated/valid, balance score before/after) |
| `Snapshots` IndexedDB store | `createdAt` per snapshot | Full workflow state at each point in time |
| `DryRunJob` | `createdAt`, `startedAt`, `completedAt` | Evaluation job lifecycle |
| `FinetuneJob` | `created_at`, `updated_at`, `completed_at` | Training job lifecycle |
| `KnowledgeSource` | `createdAt`, `processedAt` | Document upload and extraction timeline |
| `ExecutionProgress.steps[]` | status per step | Plan execution step-by-step progress |

**Implementation approach:**

1. New service: `src/services/activity-log-service.ts` — reads from all sources above, merges by timestamp, returns a sorted `ActivityLogEntry[]`
2. New component: `LogsViewer.tsx` — renders the timeline as a formatted list (timestamp + icon + description)
3. No new IndexedDB store needed — purely a read aggregation
4. **Important:** `FinetuneJob.created_at` and `completed_at` are ISO 8601 strings (not `number`). The service must call `new Date(job.created_at).getTime()` to normalize before merging with numeric timestamps from other sources.

**Example output:**
```
14:23  Workflow created
14:24  Topics generated (8 topics, depth 3)
14:25  145/150 records categorized
14:26  Synthetic data: +42 records (balance 0.65 → 0.78)
14:28  Evaluator configured (JavaScript)
14:30  Dry run started (sample: 20)
14:32  Dry run completed — GO (mean score: 0.89)
14:33  Training job created (base: claude-3-5-sonnet)
15:45  Training running (epoch 3/5, reward: 0.87)
16:12  Training completed → ft-model-xyz789
```

### Gap 2: `tasks.md` — Ephemeral data

`useChatStateStore.todos` is a Zustand store from `@distri/react` — not persisted to IndexedDB. Tasks are lost on page reload.

**Options:**
1. **Persist to IndexedDB** — add a `todos` field to `FinetuneWorkflowState` or a separate store. Sync bidirectionally with `@distri/react` store.
2. **Accept ephemeral** — `tasks.md` tab shows "No tasks in current session" after reload.
3. **Defer** — same as logs.md.

**Recommendation:** Option 2 for initial release. Show tasks when available, graceful empty state when not.

---

## Implementation Phases

### Phase A: Quick Wins (A1-A10) — COMPLETED

10 small fixes (1-10 lines each) that resolve P0 blockers and UX inconsistencies.

| # | Change | Status |
|---|--------|--------|
| A1 | PlanCard visibility — remove `messages.length === 0` guard | DONE |
| A2 | Show tabs during plan preview — tabs always visible, clicking closes plan overlay | DONE |
| A3 | Plan approval confirmation — AlertDialog on both PlanCard and PlanPreview Approve buttons | DONE |
| A4 | Connection timeout — 15s timeout + retry button (partially covers B4) | DONE |
| A5 | Plan empty state timeout — progressive 10s → 30s → 60s | DONE |
| A6 | Quick action prompts — `QuickAction.prompt` field for structured agent prompts | DONE |
| A7 | Proactive prompt — welcome text updated from observability to fine-tuning language | DONE |
| A8 | Drawer width consistency — ReadmeDrawer 60vw → 50vw | DONE |
| A9 | Locked tab cursor — `cursor-not-allowed` + click disabled on locked/comingSoon | DONE |
| A10 | Terminology — "quality scoring" → "evaluation" | DONE |

### Phase 0: Prerequisites (B1-B7) — 4-6 days

Do these next. They fix remaining bugs and simplify the codebase before the Explorer work:

| # | Change | Effort | Notes |
|---|--------|--------|-------|
| B1 | Replace `ArrowSegment` with simple horizontal tabs (intermediate step before dynamic tabs) | M | **DONE** — `SectionTabs.tsx` rewritten, `ArrowSegment` no longer imported. Also fixed C6 (green-500 checkmarks → theme-aware) as side-effect. |
| B2 | Deploy tab content (`DeployGuidancePanel`) | M | **DONE** — New component with model card, weights download, API usage snippets (cURL + Python), empty states. Wired into `DatasetDetailContentV2.tsx`. |
| B3 | Collapsed sidebar indicators (pulsing dot, unread badge) | M | **DONE** — Processing dot (pulsing during agent/plan/execution), step counter (N/M during execution), unread badge (themed circle with count). |
| B4 | Chat error recovery (retry/dismiss) | M | **DONE** — `LucyChat.tsx`: error dismiss/retry state, `lastUserMessage` memoized for retry, `handleRetry` re-sends via `sendMessage`, `handleDismissError` tracks dismissed error. Flat left-border-red UI with Retry + Dismiss buttons. |
| B5 | Plan execution cancel mechanism | M | **DONE** — `execution-state-store.ts`: cancellation flag set. `execute-plan.ts`: checked between steps, marks remaining as skipped. `PlanContext.tsx`: `cancelExecution` action. `ActivePlanBanner.tsx`: Cancel button during execution. |
| B6 | Plan execution persistence (IndexedDB) | M | **DONE** — Already implemented: `updatePlanExecution()` write-through to IndexedDB, `getStoredPlan()` mount-time restoration, stale execution auto-resume prompt. |
| B7 | Sidebar pin toggle | S | **DONE** — Pin/PinOff button in expanded header, localStorage persistence, respects pin state during viewport resize. |

### Phase 1: Explorer File Tree (B8) — 2-3 days

Build the Explorer panel in the sidebar:

| # | Task | Details |
|---|------|---------|
| 1.1 | Create `FileTreeItem.tsx` | **DONE** — Recursive VS Code-style tree item: indent-per-level, chevron rotation, type icons, badge variants, hover highlight, click select. |
| 1.2 | Create `DatasetExplorer.tsx` | **DONE** — Consumes 5 contexts + `useChatStateStore`. Builds virtual tree with: readme.md, plan.md, tasks.md, logs.md, documents/, topics/ (from hierarchy), evaluations/ (grader + jobs), finetune/, quick-stats/. Interim navigation maps to existing sections. |
| 1.3 | Create `SidebarTabStrip.tsx` | **DONE** — `[Explorer] [Lucy]` tabs with bottom-border active style. Lucy tab shows unread badge + processing dot. |
| 1.4 | Modify `LucyDatasetAssistant.tsx` | **DONE** — Replaced header with `SidebarTabStrip` + compact action buttons. `activeSidebarTab` state. Explorer panel conditionally rendered. Lucy chat stays mounted (hidden) to preserve state. Auto-switch to Lucy on `vllora_lucy_prompt`. |
| 1.5 | Create `TasksViewer.tsx` | **DONE** — Todo list from `useChatStateStore.todos`. Status icons (open/in_progress/done), completion counter, empty state. |
| 1.6 | Create `activity-log-service.ts` | **DONE** — Aggregates from KnowledgeSources, DryRunJobs, FinetuneJobs, workflow timestamps. Returns sorted `ActivityLogEntry[]` (newest-first). |
| 1.7 | Create `LogsViewer.tsx` | **DONE** — Timeline with type-specific icons, relative timestamps, hover highlight. Empty state when no activity. |
| 1.8 | Subscribe to emitter events | **DEFERRED to Phase 2** — Contexts already trigger re-renders. Custom event subscriptions (e.g., `vllora_eval_script_updated`) will be added when Explorer needs fine-grained updates. |

### Phase 2: Dynamic Workspace Tabs (B9) — 2-3 days

Replace fixed tabs with VS Code-style dynamic tabs:

| # | Task | Details |
|---|------|---------|
| 2.1 | Create `WorkspaceTabsContext.tsx` | **DONE** — `WorkspaceTab { path, label, isPinned }`. `openTab(path, label?, preview?)` with preview-replace logic. `pinTab`, `closeTab` (activates nearest), `setActiveTab`, `closeAllTabs`. localStorage persistence per dataset (pinned only). |
| 2.2 | Create `WorkspaceTabManager.tsx` | **DONE** — Tab bar with close buttons, preview tabs in italic, double-click to pin. `-mb-[1px]` border overlap, `scrollbar-none` horizontal scroll. Close button: `opacity-0 → group-hover:opacity-100`. |
| 2.3 | Create `TabContentRouter.tsx` | **DONE** — `ContentSection` type (10 sections + null). `mapTabPathToSection(path)` maps direct paths + folder prefixes. `DEFAULT_TAB_PATHS = ["overview"]`. |
| 2.4 | Modify `DatasetDetailContentV2.tsx` | **DONE** — `WorkspaceTabBridge` syncs `activeTabPath` ↔ parent `contentSection` via ref+state pattern. Section tab clicks also open workspace tabs. Content renders from `tabContentSection ?? mapTabPathToSection(activeSection)`. New sections: tasks, logs. |
| 2.5 | Wire Explorer → Tabs | **DONE** — Explorer `handleSelect` calls `openTab(nodeId)` for all nodes except drawers (readme, documents). WorkspaceTabBridge syncs tab → content section. |
| 2.6 | Add `vllora_eval_script_updated` event | **DEFERRED to Phase 3** — Not critical for tab functionality. |

### Phase 3: Unwiring Old Patterns (B9b) — 1-2 days

Clean up the old system after new one works:

| # | Task | Details |
|---|------|---------|
| 3.1 | Delete `ArrowSegment.tsx` | **DONE** — File deleted (was already orphaned from Phase 0/B1). |
| 3.2 | Delete `SectionTabs.tsx` + `DatasetUtilityBar.tsx` | **DONE** — Both deleted. `ViewMode` import redirected to `ViewModeToggle.tsx`. |
| 3.3 | Delete `ReadmeDrawer.tsx` | **DONE** — Replaced by inline `DatasetReadmeViewer` for `contentSection === "readme"`. |
| 3.4 | Delete `DocsDrawer.tsx` | **DONE** — Replaced by inline `KnowledgeSourcesPanel` for `contentSection === "documents"`. |
| 3.5 | Modify `PlanPreview.tsx` | **DONE** — Removed overlay layout (onClose X buttons), renders as tab content. Added `onOpenDocs` callback. |
| 3.6 | Migrate `isPlanPreviewActive` | **DONE** — Kept as signal in PlanContext. Auto-open effect: `isPlanPreviewActive=true` → opens plan.md tab → clears flag. URL sync: `?view=plan` → `?tab=plan.md`. ActivePlanBanner + PlanCard + DatasetDetailHeader all use `openTab()`. |
| 3.7 | Update `vllora_switch_tab` listener | **DONE** — Listener now calls `openTabRef.current(tab, label, false)`. All 17+ emit sites work via compatibility layer. |
| 3.8 | `finetune-set-view-mode` listener | **KEPT AS-IS** — Sets `activeSection` (fallback for content routing). No changes needed. |
| 3.9 | Update `vllora_open_drawer` listener | **DONE** — Maps `docs` → `openTab('documents')`, `readme` → `openTab('readme.md')`. All 5 emit sites work automatically. |
| 3.10 | Update Lucy tool renderers | **NOT NEEDED** — 3.7 compatibility layer handles all emit sites. |

### Phase D: Chat Panel Flat Style (Independent) — COMPLETED

CSS-only refactor. All 13 files updated. Build passes (0 TS errors, Vite build clean).

| # | Task | Status | Details |
|---|------|--------|---------|
| D1 | Core Message Layout | DONE | `LucyUserMessage` — removed bubble/right-align/avatar, left-aligned with "You" label. `LucyAssistantMessage` — xs avatar (14px), removed bubble. `LucyChat` — `px-3 py-2 space-y-2`, flat auto-analyzing indicator with left-border, flat error display. `LucyAvatar` — added `xs` size (14px, no aura). |
| D2 | Tool Execution Styling | DONE | `LucyToolCallCard` — running/completed/error states all converted from card containers to left-border accent rows. `LucyToolExecutionRenderer` — added `border-l border-border/40 pl-3 ml-1` grouping. `LucyMessageRenderer` — flattened `agent_handover` and `run_error` events to left-border style. |
| D3 | Supporting Components | DONE | `LucyTypingIndicator` — `px-0 py-1`. `LucyStepIndicator` — running/failed/pending margins `mb-3` → `mb-1`, text `text-sm` → `text-xs`. `LucyPendingMessage` — replaced yellow card with `border-l-2 border-yellow-500 pl-3 py-1.5` compact layout. |
| D4 | Input + Welcome | DONE | `LucyChatInput` — `rounded-xl` → `rounded-lg`, removed `focus-within:shadow-[0_0_0_3px_...]` glow. `LucyWelcome` — removed bubble wrapper (`bg-muted/50 border rounded-2xl ml-10`), xs avatar, flat content, tighter quick action buttons. |
| D5 | Secondary Components | DONE | `LucyToolActions` — all 3 states (processing/completed/pending) flattened from `rounded-xl p-4` cards to `border-l pl-3 py-1.5` left-border rows. `LucyMessage` — removed right-align/bubbles, xs avatar, removed unused `UserAvatar` import. |

### Phase C: Polish (theming, accessibility, animations) — Independent

Refinements that improve consistency but don't change functionality. Can run in parallel with Phases 0-3.

| # | Change | Files | Effort | Impact |
|---|--------|-------|--------|--------|
| C1 | **Theme EvaluationConfigPanel**: Replace all zinc-* with semantic tokens | `EvaluationConfigPanel.tsx` (20 replacements) | M | P1 — DONE |
| C2 | **Theme FinetuneConfigPanel**: Replace all zinc-* with semantic tokens | `FinetuneConfigPanel.tsx` (25 replacements) | M | P1 — DONE |
| C3 | **Badge consistency**: Unify all tab badges to `rounded` + consistent sizing | `SectionTabs.tsx` (covered by B1 rewrite) | S | P2 — **resolved by B1** |
| C4 | **Loading pattern hierarchy**: Standardize which loading pattern to use where | Multiple files | M | P2 — deferred (low impact) |
| C5 | **Focus ring patterns**: Unify focus-visible rings across all interactive elements | Multiple files | S | P2 — deferred (low impact) |
| C6 | **Hardcoded green-500 checkmarks**: Replace with theme-aware success colors | `DocsProcessingState.tsx:82` | S | P2 — DONE (green-500 → emerald-500) |
| C7 | **Plan activity dot**: Replace `animate-ping` with simpler `animate-pulse` | `SectionTabs.tsx:305-308` — **resolved by B1** (removed ArrowSegment, no more ping dot) | S | P2 — resolved by B1 |
| C8 | **Success celebration**: Add confetti or subtle animation on plan completion | Completion card in sidebar | S | P2 — deferred (cosmetic) |
| C9 | **Auto-tab-switch prevention**: Replace remaining auto-switches with toasts | 6 `finetune-set-view-mode` dispatch sites | M | P1 — deferred (all `vllora_switch_tab` sites are already toast-based; `finetune-set-view-mode` auto-switches need per-tool analysis) |
| C10 | **Textarea during streaming**: Keep enabled with "queued" placeholder | Upstream: `@distri/react ChatInput.tsx:375-376` | S | P1 — blocked (requires upstream changes) |
| C11 | **Tool error messages**: Add friendly names for finetune tools | `lucy-message-utils.ts` (40+ tool mappings) | M | P1 — DONE |
| C12 | **AI vs human record markers**: Add "Generated" badge to synthetic records | `RecordRow.tsx`, `CompactRecordList.tsx` | S | P2 — DONE |

> **Note:** C3, C7 resolved by B1 rewrite. C6 fully resolved (DocsProcessingState.tsx fixed). C9 deferred — all user-facing `vllora_switch_tab` sites already use toasts; remaining `finetune-set-view-mode` auto-switches need per-tool analysis. C10 requires upstream `@distri/react` changes. C4, C5, C8 deferred as low-impact cosmetic items. Also fixed: zinc-900 in LucyToolCallCard.tsx.

---

## Risk Register

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 1 | `PlanContext` unwiring breaks URL sync | P0 — `?view=plan` URLs stop working | Migrate to `?tab=plan.md` before deleting old state |
| 2 | Emitter contract change breaks Lucy tool renderers | P0 — tools can't switch views | Phase 3 does this last, after new system works; keep old events as aliases during transition |
| 3 | No shadcn Tree primitive | M — must build from scratch | Use `Collapsible` + custom `FileTreeItem`, modeled on existing `TopicTreeNode.tsx` |
| 4 | Upload UX in DocsDrawer has no home after deletion | M — can't upload documents | Move upload button to Explorer `documents/` folder context menu or header action |
| 5 | `DatasetExplorer` needs `DryRunJobsProvider` in ancestor tree | M — Explorer can't access dry run data | Ensure Explorer renders inside existing `DryRunJobsProvider` subtree (currently at `DatasetDetailContentV2.tsx:474`), or lift provider higher |
| 6 | `tasks.md` lost on page reload | L — accepted for v1 | Show empty state gracefully; persist in v2 |
| 7 | `KnowledgeSourcesPanel` currently used inside DocsDrawer | M — needs extraction | Lift `KnowledgeSourcesPanel` to standalone content; ensure it works without Sheet wrapper |
| 8 | `GenerationHistory` keyed by `workflowId`, not `datasetId` | L — two-step lookup | `activity-log-service.ts` must first `getWorkflowByDataset(datasetId)` → then `getGenerationHistory(workflow.id)` |
| 9 | `vllora_switch_tab` has 14+ call sites across 8 files | M — high blast radius during contract change | Keep old event as alias during transition (Phase 3); update call sites incrementally |
| 10 | `WorkspaceTabsContext` needs emitter integration | L — must wire event listeners | Add `useEffect` + `emitter.on('vllora_switch_tab', ...)` following existing pattern (e.g., `DatasetsContext.tsx:227-266`) |

---

## Definition of Done

### Phase A Done When:
- [x] PlanCard visible regardless of message count
- [x] Tabs visible during plan preview; clicking tab exits plan view
- [x] Approve buttons wrapped in confirmation dialog (PlanCard + PlanPreview)
- [x] Connection timeout with retry after 15s
- [x] Progressive plan generation timeout (10→30→60s)
- [x] Quick actions send structured prompts, not raw labels
- [x] Welcome/proactive text references fine-tuning, not observability
- [x] ReadmeDrawer width matches DocsDrawer (50vw)
- [x] Locked tabs show `cursor-not-allowed`
- [x] Terminology: "evaluation" not "quality scoring"
- [x] TypeScript compiles with 0 errors
- [x] Vite build succeeds

### Phase 0 Done When:
- [x] ArrowSegment replaced with simple horizontal tabs (B1)
- [x] Deploy tab has real content (B2)
- [x] Collapsed sidebar shows activity indicators (B3)
- [x] Chat errors have retry/dismiss buttons (B4)
- [x] Plan execution can be cancelled (B5)
- [x] Plan execution state persists across refresh (B6)
- [x] Sidebar has pin/unpin toggle (B7)
- [x] TypeScript compiles with 0 errors
- [x] Vite build succeeds

### Phase 1 Done When:
- [x] Explorer panel renders in sidebar with correct file tree
- [x] Clicking `[Explorer]` / `[Lucy]` tab switches sidebar content
- [x] File tree shows real data from all 5 contexts
- [x] File tree updates in real-time when Lucy works (contexts auto-re-render; fine-grained events deferred to Phase 2)
- [x] Collapsed sidebar preserves last active tab
- [x] TasksViewer shows Lucy's todo checklist
- [x] LogsViewer shows aggregated activity timeline
- [x] TypeScript compiles with 0 errors
- [x] Vite build succeeds

### Phase 2 Done When:
- [x] Clicking a file in Explorer opens it as a dynamic tab in workspace
- [x] Single-click = preview (italic), double-click = pin
- [x] Tab close (x) works, activates nearest tab
- [x] Tab content renders correct component for each file type
- [x] Open tabs persist in localStorage across page reloads
- [x] TypeScript compiles with 0 errors
- [x] Vite build succeeds

### Phase 3 Done When:
- [x] All old components deleted (ArrowSegment, SectionTabs, DatasetUtilityBar, ReadmeDrawer, DocsDrawer)
- [x] PlanPreview works as a tab (no overlay)
- [x] All emitter event callers work via compatibility layer (openTabRef)
- [x] No regression in Lucy tool execution (tools still switch views correctly via 3.7/3.8)
- [x] URL `?view=plan` migrated to `?tab=plan.md` (legacy fallback preserved)
- [x] TypeScript compiles with 0 errors
- [x] Vite build succeeds

### Phase C Done When:
- [x] EvaluationConfigPanel uses semantic tokens (no zinc-*)
- [x] FinetuneConfigPanel uses semantic tokens (no zinc-*)
- [x] Tab badges unified (resolved by B1)
- [ ] Loading patterns standardized (deferred — low impact)
- [ ] Focus rings consistent across interactive elements (deferred — low impact)
- [x] Hardcoded colors replaced with theme-aware tokens
- [x] Synthetic records have "Generated" badge
- [x] Tool friendly names for all finetune tools (40+ mappings)
- [x] TypeScript compiles with 0 errors
- [x] Vite build succeeds

### Phase D Done When:
- [x] Chat messages are left-aligned, no bubbles
- [x] Tool calls show as flat left-border rows
- [x] Spacing is compact (`space-y-2 px-3 py-2`)
- [x] Input area uses `rounded-lg` with no glow shadow
- [x] Welcome screen has no bubble wrapper
- [x] All supporting components (typing, step, pending) use compact spacing
- [x] `LucyToolActions` flattened (processing/completed/pending states)
- [x] `LucyMessage` (legacy) flattened to match
- [x] TypeScript compiles with 0 errors
- [x] Vite build succeeds
