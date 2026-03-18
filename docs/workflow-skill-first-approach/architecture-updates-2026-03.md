# Architecture Updates — March 2026

Captures architectural decisions and refactoring context from the March 2026 work session. Read this before working on eval polling, ID mapping, cross-view navigation, or training job UI.

---

## 1. Eval Polling Architecture

### Problem

The original polling design made three network calls per poll cycle: FE polled BE for the latest job state (GET from SQLite), BE wrote a `polling_snapshot` column on every update, and FE then separately fetched progress from the cloud API. This created unnecessary load and latency — the BE was acting as a caching proxy that the FE didn't actually need.

### Current Design: Dual Polling Model

Two independent polling loops run concurrently for each active evaluation:

```
BE Polling (30s interval)                    FE Polling (10s interval)
  Gateway polls cloud API                      Browser polls cloud API directly
  Reads status + final scores                  Reads progress % for UI updates
  Writes final results back to SQLite          Does NOT write to BE
  Handles completion detection                 Updates progress bars, status text
```

**Key optimization:** The FE no longer re-fetches the job object from BE SQLite on every poll cycle. Instead:

1. `startPolling(job: EvalJob)` takes the full job object at start time
2. The job is stored in an in-memory `pollingJobs` Map (keyed by `evaluationRunId`)
3. Each poll cycle makes exactly ONE network call: `GET /finetune/evaluations/{evaluationRunId}` to the cloud API
4. The in-memory job object provides all context needed for rendering (workflow ID, row count, grader version, etc.)

### What Was Removed

- The `polling_snapshot` column in BE SQLite — a migration drops it entirely
- The per-cycle PATCH call that wrote snapshot data to BE
- The per-cycle GET call that re-fetched the job from BE

### Why This Matters

If you need to add new data to the polling UI (e.g., per-row progress), fetch it from the cloud API response — do NOT add a new BE column or re-introduce the snapshot pattern. The BE's role is limited to final result writeback, not real-time progress caching.

### Files

| Layer | Key file | What it does |
|-------|----------|-------------|
| FE | `src/services/eval-polling.ts` | Polling loop, `pollingJobs` Map, cloud API calls |
| FE | `src/contexts/EvalJobsContext.tsx` | Consumes polling events, updates UI state |
| BE | `cloud/src/server/handler/finetune/` | BE-side polling (30s), result writeback |

---

## 2. ID Architecture (Eval Results)

### Problem

Eval results returned from the cloud contain rows that need to be matched back to local records. Two different IDs exist on each result row, and confusing them caused join failures where results couldn't be displayed against their source records.

### The Two IDs

| Field | What it is | Who generates it |
|-------|-----------|-----------------|
| `row.id` | Our local record UUID (the ID we assigned when creating the record) | FE / skill |
| `workflow_row_id` | Cloud database auto-generated primary key | Cloud DB (`Uuid::new_v4()`) |

### Cloud Fix

The cloud's `create_workflow_rows()` function was updated to use our local UUID as the DB primary key instead of generating a new `Uuid::new_v4()`. After this deploy, `row.id` and `workflow_row_id` will be identical.

### FE Fallback Chain

Until the cloud fix is fully deployed (and for backward compatibility with older eval runs), the FE uses a fallback chain when matching result rows to local records:

```typescript
const recordId = entry.dataset_row_id ?? entry.workflow_row_id ?? row.row?.id;
```

This chain handles three scenarios:

| Scenario | Which field matches | When |
|----------|-------------------|------|
| Post-deploy (ideal) | `dataset_row_id` | Cloud preserves our ID in the dedicated field |
| Pre-deploy legacy | `workflow_row_id` | Cloud generated its own PK (won't match, but is the only available ID) |
| Fallback | `row.row?.id` | Nested row object contains the original ID |

### Why This Matters

If you add new features that join cloud results with local records (e.g., training per-row results), always use this fallback chain pattern. Do not assume a single ID field will always match. The cloud fix makes all three IDs converge, but the FE must remain resilient to older data.

### Files

| File | What it does |
|------|-------------|
| `src/components/datasets/eval-dialog/DryrunEvaluationResultRow.tsx` | Renders per-row eval results, uses fallback chain |
| `src/components/datasets/eval-dialog/ResultsTable.tsx` | Results table, passes IDs to row components |
| `cloud/src/data/service/` | Cloud-side `create_workflow_rows()` — uses local UUID as PK |

---

## 3. Navigation Architecture: `vllora_navigate_to_record`

### Problem

The eval results table shows per-row scores. Users need to click a result row and navigate to the corresponding record in the records table view — but records live inside topic-grouped tabs, and the navigation needs to find the right topic, switch to table view, open the correct tab, and highlight the specific record.

The old approach used two separate events (`vllora_switch_tab` + `vllora_highlight_record`) which was fragile — the tab switch and highlight were not coordinated, leading to race conditions where the highlight fired before the tab content rendered.

### Current Design

A single event `vllora_navigate_to_record` handles the full navigation sequence:

```
User clicks eval result row
  -> emit("vllora_navigate_to_record", { recordId, topicId? })
  -> Handler:
     1. Look up record's topic from DatasetDetailContext
     2. Find the topic tab (or fall back to "All Topics" data tab)
     3. Switch view mode to "table"
     4. Open the correct topic tab
     5. Highlight the target record row (brief flash animation)
```

### Topicless Record Handling

Records without a topic assignment (orphaned records) are handled by falling back to the "All Topics" data tab, which shows all records regardless of topic grouping. The highlight still works because all records appear in this flat view.

### Event Contract

```typescript
interface NavigateToRecordPayload {
  readonly recordId: string;      // UUID of the record to navigate to
  readonly topicId?: string;      // Optional: topic hint for faster lookup
}

emitter.emit("vllora_navigate_to_record", payload);
```

### Files

| File | What it does |
|------|-------------|
| `src/components/datasets/eval-dialog/DryrunEvaluationResultRow.tsx` | Emits the event on row click |
| `src/components/datasets/sidebars/DatasetExplorer.tsx` | Listens for the event, performs navigation sequence |
| `src/contexts/DatasetDetailContext.tsx` | Provides topic lookup, view mode switching |

---

## 4. Training Job UI Design

### Design Pattern

The training job detail view follows the same layout pattern as the eval job detail view — header with metadata badges, summary stats, and a per-row results table. This consistency means users who understand the eval view can immediately navigate training results.

### New Columns in Per-Row Results

Two columns were added to the training per-row results table that do not exist in eval results:

| Column | Format | Purpose |
|--------|--------|---------|
| **Epoch** | `E1`, `E2`, `E3`... | Which training epoch produced this row's metrics |
| **Trend** | `+0.12` (green) / `-0.10` (red) | Score delta from previous epoch (shows learning direction) |

The trend column uses color coding: green with up arrow for improvement, red with down arrow for regression. This gives a per-record view of whether the model is learning.

### New Training Dialog: 3 States

The "New Training Job" dialog was redesigned to show evaluation context — users should see their latest eval score before deciding to train. The dialog has three distinct states:

| State | When | What it shows |
|-------|------|--------------|
| **First run** | No previous training jobs exist | Clean form, no eval context |
| **Returning** | Previous training jobs exist | Eval context card showing latest eval score and previous best training score |
| **Grader changed** | Grader was updated since last eval | Staleness warning: eval scores may not be comparable to previous runs |

The eval context card in the "returning" state shows:

```
┌─────────────────────────────────────────────┐
│  Latest Evaluation: 0.82 avg (50 samples)   │
│  Previous Best Training: 0.78 (E3)          │
│  Grader: v2 (current)                       │
└─────────────────────────────────────────────┘
```

The "grader changed" state adds a warning banner:

```
⚠ Grader updated since last evaluation (v2 → v3).
  Scores may not be directly comparable. Consider re-running evaluation first.
```

### Mockups

| Mockup | Location |
|--------|----------|
| Training job detail view | `docs/workflow-skill-first-approach/mockup-training-job.html` |
| New training dialog (all 3 states) | `docs/workflow-skill-first-approach/mockup-new-training-dialog.html` |

### Files

| File | What it does |
|------|-------------|
| `src/components/finetune/content/NewJobDialog.tsx` | Training dialog with 3 states |
| `src/components/finetune/content/PerRowDetailsSection.tsx` | Per-row results with Epoch + Trend columns |
| `src/components/finetune/content/index.tsx` | Training job detail view layout |
| `src/services/finetune-api.ts` | API calls for training job data |

---

## 5. Eval Job Guard Removal

### What Changed

The guard that prevented starting a new evaluation while another was running has been removed. Multiple concurrent evaluations are now allowed.

### Why

There was no technical reason to prevent parallel evals. The cloud API handles concurrent eval runs independently. The guard was originally added as a safety measure during early development when the polling architecture was less robust, but with the refactored dual polling model (Section 1), each eval run has its own polling loop and in-memory state.

### Impact

- Users can start eval runs back-to-back without waiting for completion
- Each eval run gets its own entry in the `pollingJobs` Map
- The sidebar shows all active eval runs with individual progress indicators

---

## 6. Result Row Hover UX

### Pattern

Result table rows (both eval and training) now show visual feedback on hover when they are clickable (i.e., when clicking navigates to the source record). The effect is:

- Text underline appears on the record content
- Row background brightens slightly

### Implementation

Uses Tailwind's `group` / `group-hover` pattern:

```html
<tr class="group cursor-pointer">
  <td class="group-hover:underline group-hover:brightness-110">...</td>
</tr>
```

This is a lightweight alternative to adding onClick handlers with custom hover state management. The `group` class on the parent row triggers `group-hover:` utilities on child cells.

### Where It Applies

- Eval result rows in `DryrunEvaluationResultRow.tsx`
- Training per-row results in `PerRowDetailsSection.tsx`
- Any future result table where rows are clickable
