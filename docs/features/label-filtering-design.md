# Label Filtering Feature Design

## Overview

This document outlines the design for adding label-based filtering across the vLLora UI, including the Threads tab, Traces tab, and Lucy AI assistant.

## Current State Analysis

### Database Schema

Labels are stored in the `traces` table within the `attribute` JSON column:

```sql
CREATE TABLE traces (
    trace_id TEXT NOT NULL,
    span_id TEXT NOT NULL,
    thread_id TEXT,
    attribute TEXT NOT NULL, -- JSON with optional 'label' field
    ...
);
```

**Label storage format:**
```json
{
  "label": "flight_search",
  "model": { ... },
  "input": { ... }
}
```

### Current Label Usage

- **54 unique labels** exist in the database
- Examples: `activity_extraction`, `flight_search`, `budget_agent`, `analysis_agent`, etc.
- Labels are attached to individual spans (ModelCall, ToolCall, ApiCall)

### Current UI Components

| Component | Location | Current Filtering | Proposed Label Filter |
|-----------|----------|-------------------|----------------------|
| Threads Tab | `/chat` left sidebar | None (sorted by updated_at) | No change |
| Traces Panel | `/chat` right panel | None | **Filter current thread's spans by label** |
| Traces Page | `/traces` | Group by time/thread/run | Filter all spans by label |
| Lucy | Floating/side panel | None | Query/apply label filters via tools |

---

## Proposed Solution

### 1. Label Filter Component

Create a reusable `LabelFilter` component that can be used across all locations.

#### Interaction Pattern: **Dropdown Popover** (Recommended)

| Option | Pros | Cons |
|--------|------|------|
| **Dropdown/Popover** ✓ | No layout shift, familiar pattern, easy to dismiss | Limited space for many labels |
| Dialog/Modal | More space, focused interaction | Feels heavy for quick filtering |
| Inline Expand | Always visible | Pushes content down, layout shift |

**Recommendation:** Use a **Popover** (like Radix UI Popover or shadcn/ui Popover)
- Opens on click, overlays content
- Closes on click outside or Escape
- No layout shift
- Consistent with other filter dropdowns in the app

#### Collapsed State (Trigger Button)

```
┌─────────────────────────────────────────────┐
│ 🏷️ Filter labels...                     ▼  │  ← No selection
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 🏷️ 2 labels selected                    ▼  │  ← With selection
└─────────────────────────────────────────────┘
```

#### Expanded State (Popover Content)

```
                    ┌─────────────────────────────────────────┐
                    │  ┌───────────────────────────────────┐  │
                    │  │ 🔍 Search labels...               │  │
                    │  └───────────────────────────────────┘  │
                    │                                         │
                    │  This Thread (8 labels):                │
                    │  ┌────────────┐ ┌────────────┐          │
                    │  │☑ flight_se │ │☐ budget_ag │          │
                    │  │   (12)     │ │   (8)      │          │
                    │  └────────────┘ └────────────┘          │
                    │  ┌────────────┐ ┌────────────┐          │
                    │  │☐ hotel_sea │ │☐ activity_ │          │
                    │  │   (5)      │ │   (3)      │          │
                    │  └────────────┘ └────────────┘          │
                    │  ... (4 more)                           │
                    │                                         │
                    │  ───────────────────────────────────    │
                    │  ┌─────────────────────────────────┐    │
                    │  │         Clear All               │    │
                    │  └─────────────────────────────────┘    │
                    └─────────────────────────────────────────┘
```

#### Selected Labels Display (Below Trigger)

When labels are selected, show pills below the trigger (this DOES push content down slightly, but only by one row):

```
┌─────────────────────────────────────────────┐
│ 🏷️ 2 labels selected                    ▼  │
└─────────────────────────────────────────────┘
┌────────────┐ ┌────────────┐
│✕ flight_se │ │✕ budget_ag │  Clear All
└────────────┘ └────────────┘
Showing 5 of 12 runs
─────────────────────────────────────────────
```

#### Features

- **Search box**: Fuzzy search through available labels
- **Checkbox list**: Multi-select with checkboxes (instant apply, no "Apply" button needed)
- **Label counts**: Show span count per label `(12)`
- **Selected pills**: Show below trigger with remove (✕) button
- **Clear All**: Quick way to reset filter
- **Filter summary**: "Showing X of Y runs" below pills

---

### 2. Traces Panel Integration (Right Side)

This filter applies to the **current thread's traces** in the right-side Traces panel. Users select a thread first, then filter within that thread's traces.

#### Location

Add filter controls in the TraceView header (TracesRightSidebar), below the header:

```
┌─────────────────────────────────────────────────────┐
│  Traces                                    🔄  ↗️   │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐   │
│  │ 🏷️ Filter labels...                    ▼   │   │
│  └─────────────────────────────────────────────┘   │
│  ┌──────────────┐ ┌──────────────┐                 │
│  │ ✕ flight_sea │ │ ✕ budget_age │  Clear All     │
│  └──────────────┘ └──────────────┘                 │
│  Showing 3 of 12 runs                              │
├─────────────────────────────────────────────────────┤
│  ▶ Run abc123 - 2:45 PM                            │
│    └─ [flight_search] Search flights     ← match   │
│    └─ [budget_agent] Calculate budget    ← match   │
│                                                     │
│  ▶ Run def456 - 2:30 PM                            │
│    └─ [flight_search] Search flights     ← match   │
└─────────────────────────────────────────────────────┘
```

#### User Flow

1. User selects a thread from the left sidebar
2. Traces panel loads all spans for that thread
3. User clicks the label filter dropdown
4. Dropdown shows all labels found **in this thread only**
5. User selects one or more labels
6. Traces panel filters to show only matching spans/runs

#### Filtering Behavior

**Filter by Runs** - When a label is selected:
- Show only runs that contain at least one span with the selected label
- Entire run is shown if any span matches (keeps context intact)
- Non-matching spans within a run are **dimmed** but still visible
- This preserves parent/child relationships and call context

#### Visual Indicators

- **Matched spans**: Normal display with highlighted label badge
- **Non-matched spans** (in matching runs): Slightly dimmed (opacity: 0.5)
- **Filter summary**: "Showing 3 of 12 runs" below filter
- **Empty state**: "No runs match the selected labels"

#### Label Discovery

The filter dropdown should show:
- Only labels that exist in the **current thread**
- Count of spans per label in this thread
- Sorted by count (most common first)

---

### 3. Full Traces Page (`/traces`)

The same label filter should also work on the standalone `/traces` page, filtering across all threads.

#### Location

Add filter in the traces page header, alongside existing group-by controls:

```
┌─────────────────────────────────────────────────────────────┐
│  Traces                                                     │
├─────────────────────────────────────────────────────────────┤
│  Group by: [Time ▼]  Duration: [1h ▼]  🏷️ Labels ▼        │
│                                                             │
│  Selected: flight_search, budget_agent            Clear All │
├─────────────────────────────────────────────────────────────┤
│  ▶ 2:00 PM - 3:00 PM (5 runs)                              │
│  ▶ 1:00 PM - 2:00 PM (3 runs)                              │
└─────────────────────────────────────────────────────────────┘
```

#### Behavior

- Shows labels from **all threads** in the project
- Filters runs/groups to only those containing matching labels
- Works in combination with existing group-by modes

---

### 4. Lucy Integration

#### Approach

Lucy can filter traces using natural language queries that get translated to label filters.

#### User Experience

```
┌─────────────────────────────────────────────────────┐
│  Lucy                                    📌  ✕     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  User: Show me all flight search traces             │
│                                                     │
│  Lucy: I found 156 traces with the "flight_search" │
│        label. Here's a summary:                     │
│                                                     │
│        • 156 total spans                            │
│        • 45 unique threads                          │
│        • Avg duration: 2.3s                         │
│        • Total cost: $0.42                          │
│                                                     │
│        [View in Traces Tab]  [Apply Filter]         │
│                                                     │
│  User: Compare flight_search with hotel_search      │
│                                                     │
│  Lucy: Comparison of flight_search vs hotel_search: │
│        ...                                          │
│                                                     │
├─────────────────────────────────────────────────────┤
│  [Type a message...]                                │
└─────────────────────────────────────────────────────┘
```

#### Lucy Tools Required

Update existing tools and add new ones for label filtering:

| Tool | Change | Backend Call |
|------|--------|--------------|
| `fetch_spans` | **Update** - Add `labels` parameter | `GET /spans?labels=x,y` |
| `list_labels` | **New** - Get available labels | `GET /labels` |
| `apply_label_filter` | **New** - Update UI filter state | None (frontend state) |

```typescript
// Tool: fetch_spans (EXISTING - add labels parameter)
// Used when: User asks "Show me flight search traces" or "Analyze budget_agent calls"
{
  name: "fetch_spans",
  description: "Fetch spans/traces with optional filters",
  parameters: {
    project_id?: string,
    thread_id?: string,
    run_id?: string,
    operation_names?: string[],
    labels?: string[],        // NEW: Filter by labels
    include_stats?: boolean,
    limit?: number
  }
}

// Tool: list_labels (NEW)
// Used when: User asks "What labels exist?" or "Show me available labels"
// Returns: List of unique labels with counts
{
  name: "list_labels",
  description: "Get all unique labels used in traces",
  parameters: {
    project_id?: string,
    thread_id?: string,
    limit?: number
  }
}

// Tool: apply_label_filter (NEW)
// Used when: User says "Filter the traces panel by flight_search"
// Action: Updates the label filter dropdown in the Traces Panel UI
{
  name: "apply_label_filter",
  description: "Apply label filter to the current traces/threads view",
  parameters: {
    labels: string[],
    view: "threads" | "traces"
  }
}
```

**Key Distinction:**
- `fetch_spans` with `labels` → Lucy fetches data to **analyze and respond** (e.g., "I found 156 traces...")
- `apply_label_filter` → Lucy changes the **UI state** so user sees filtered traces in the panel

#### Context-Aware Queries

Lucy should understand context from:
- Current page (threads/traces)
- Selected thread
- Current project
- Already applied filters

---

### 5. URL State Management

Persist filter state in URL for shareability:

```
/chat?project_id=xxx&labels=flight_search,budget_agent
/traces?labels=activity_extraction&group_by=time
```

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `labels` | string (comma-separated) | Selected label filters |
| `label_mode` | "any" \| "all" | Match any or all labels (default: "any") |

---

### 6. Backend Implementation

#### 6.1 New Endpoint: `GET /labels`

Fetch available labels for autocomplete/dropdown.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | Yes | Project to fetch labels from |
| `thread_id` | string | No | Scope to specific thread |
| `limit` | number | No | Max labels to return (default: 100) |

**Response:**
```json
{
  "labels": [
    { "name": "flight_search", "count": 156 },
    { "name": "budget_agent", "count": 98 },
    { "name": "hotel_search", "count": 87 }
  ]
}
```

**SQL Query:**
```sql
SELECT
  json_extract(attribute, '$.label') as label,
  COUNT(*) as count
FROM traces
WHERE project_id = ?
  AND json_extract(attribute, '$.label') IS NOT NULL
  AND (thread_id = ? OR ? IS NULL)
GROUP BY label
ORDER BY count DESC
LIMIT ?;
```

#### 6.2 When `/labels` is Called from Frontend

| Trigger | Scope | Parameters |
|---------|-------|------------|
| User clicks label filter dropdown in **Traces Panel** | Current thread only | `project_id`, `thread_id` |
| User clicks label filter dropdown in **Traces Page** (`/traces`) | Entire project | `project_id` |
| Lucy executes `list_labels` tool | Depends on context | `project_id`, optionally `thread_id` |

**Caching Strategy:**
- Cache labels per thread (invalidate when thread changes)
- Cache project-wide labels with short TTL (e.g., 30 seconds)
- No need to refetch on every dropdown open if cached

---

#### 6.3 Add `labels` Parameter to Existing Endpoints

**Affected endpoints:**
- `GET /spans` - Add `labels` query param
- `GET /traces` - Add `labels` query param

**Query Parameter:**
```
?labels=flight_search,budget_agent
```

**Filter Logic (in service layer):**
```rust
// Label filtering using JSON_EXTRACT
if let Some(labels) = &query.labels {
    if !labels.is_empty() {
        for label in labels {
            db_query = db_query.filter(
                diesel::dsl::sql::<diesel::sql_types::Bool>(
                    &format!("json_extract(attribute, '$.label') = '{}'", label)
                )
            );
        }
    }
}
```

#### 6.4 Files to Modify

| File | Change |
|------|--------|
| `core/src/handler/labels.rs` | **New** - Labels endpoint handler |
| `core/src/handler/spans.rs` | Add `labels` to `ListSpansQueryParams` |
| `core/src/handler/traces.rs` | Add `labels` to `ListTracesQueryParams` |
| `core/src/types/metadata/services/trace.rs` | Add `labels: Option<Vec<String>>` to `ListTracesQuery` |
| `core/src/metadata/services/trace.rs` | Add JSON_EXTRACT filter in `list()` method |
| `gateway/src/http.rs` | Add route: `GET /labels` |

#### 6.5 Database Index

**New migration file:** `core/sqlite_migrations/YYYY-MM-DD-XXXXXX_add_label_index/up.sql`

```sql
-- Index for label filtering
CREATE INDEX IF NOT EXISTS idx_traces_label
ON traces(project_id, json_extract(attribute, '$.label'))
WHERE json_extract(attribute, '$.label') IS NOT NULL;
```

---

### 7. Implementation Phases

#### Phase 1: Backend API
- [ ] Create `GET /labels` endpoint
  - [ ] Add handler in `core/src/handler/labels.rs`
  - [ ] Add route in `gateway/src/http.rs`
  - [ ] Support `thread_id` param for thread-specific labels
  - [ ] Support `project_id` param for project-wide labels
- [ ] Add `labels` parameter to spans/traces query API
  - [ ] Update `ListSpansQueryParams` in `spans.rs`
  - [ ] Update `ListTracesQueryParams` in `traces.rs`
  - [ ] Update `ListTracesQuery` in types
  - [ ] Add JSON_EXTRACT filter in service layer
- [ ] Add database index for label queries (new migration)

#### Phase 2: LabelFilter Component (1 day)
- [ ] Create `LabelFilter.tsx` component
- [ ] Implement search/autocomplete
- [ ] Add multi-select with pills
- [ ] Create `useLabelFilter` hook
- [ ] Support both thread-scoped and project-scoped modes

#### Phase 3: Traces Panel Integration (1-2 days)
- [ ] Add filter controls to TraceView header (right panel)
- [ ] Update ChatWindowContext with label filter state
- [ ] Fetch labels for current thread
- [ ] Filter spans client-side based on selected labels
- [ ] Visual highlighting/dimming of matched vs non-matched spans
- [ ] Show "X of Y runs" summary

#### Phase 4: Full Traces Page Integration (1 day)
- [ ] Add filter to TracesPage header
- [ ] Update TracesPageContext with label filter state
- [ ] Fetch project-wide labels
- [ ] Filter runs/groups by label

#### Phase 5: Lucy Integration (1-2 days)
- [ ] Update `fetch_spans` tool to support `labels` parameter
- [ ] Create `list_labels` tool (new)
- [ ] Create `apply_label_filter` tool (new)
- [ ] Update tool definitions in `vllora-data-agent.md`
- [ ] Test natural language label queries

#### Phase 6: Polish & Testing (1 day)
- [ ] URL state persistence (`?labels=x,y`)
- [ ] Clear filter when thread changes
- [ ] Empty states and error handling
- [ ] Performance optimization for large label sets
- [ ] Accessibility (keyboard navigation, screen readers)

---

### 8. Component Specifications

#### LabelFilter Component

```typescript
interface LabelFilterProps {
  // Selected labels
  selectedLabels: string[];
  onLabelsChange: (labels: string[]) => void;

  // Mode: match any or all
  mode?: 'any' | 'all';
  onModeChange?: (mode: 'any' | 'all') => void;

  // Data source
  projectId?: string;
  threadId?: string;

  // Display options
  showPopularLabels?: boolean;
  showCount?: boolean;
  maxVisibleLabels?: number;

  // Style
  variant?: 'dropdown' | 'inline';
  size?: 'sm' | 'md' | 'lg';
}
```

#### useLabelFilter Hook

```typescript
interface UseLabelFilterOptions {
  projectId?: string;
  threadId?: string;
  persistKey?: string; // localStorage key
  syncToUrl?: boolean;
}

interface UseLabelFilterReturn {
  // State
  selectedLabels: string[];
  mode: 'any' | 'all';

  // Available labels
  availableLabels: LabelInfo[];
  popularLabels: LabelInfo[];
  isLoading: boolean;

  // Actions
  addLabel: (label: string) => void;
  removeLabel: (label: string) => void;
  clearLabels: () => void;
  setMode: (mode: 'any' | 'all') => void;

  // Search
  searchLabels: (query: string) => LabelInfo[];
}

interface LabelInfo {
  name: string;
  count: number;
  lastUsed?: number;
}
```

---

### 9. Mockups

#### Chat Page with Traces Panel Label Filter

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  vLLora                                                                   [Lucy 🤖]  │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ┌────────────┐ ┌────────────────────────────────┐ ┌────────────────────────────────┐ │
│ │ Threads    │ │  Flight Planning Session       │ │  Traces                  🔄 ↗️ │ │
│ ├────────────┤ ├────────────────────────────────┤ ├────────────────────────────────┤ │
│ │ + New Chat │ │                                │ │ ┌────────────────────────────┐ │ │
│ │            │ │  User:                         │ │ │ 🏷️ Filter labels...    ▼  │ │ │
│ │ ──────────-│ │  Find me flights to Tokyo      │ │ └────────────────────────────┘ │ │
│ │            │ │                                │ │ ┌────────────┐ ┌────────────┐  │ │
│ │ Tokyo Trip │ │  ─────────────────────────────-│ │ │✕ flight_se │ │✕ budget_ag │  │ │
│ │ 2m ago     │ │                                │ │ └────────────┘ └────────────┘  │ │
│ │            │ │  Assistant:                    │ │ Showing 5 of 12 runs           │ │
│ │ Paris Trip │ │  I found 5 flight options:     │ │ ──────────────────────────────-│ │
│ │ 1h ago     │ │  1. JAL - $850                 │ │ ▼ Run abc123 - 2:45 PM         │ │
│ │            │ │  2. ANA - $920                 │ │   ├─ [flight_search] Search    │ │
│ │ London...  │ │  ...                           │ │   │   ← highlighted            │ │
│ │ 2h ago     │ │                                │ │   ├─ [budget_agent] Calculate  │ │
│ │            │ │                                │ │   │   ← highlighted            │ │
│ │            │ │                                │ │   └─ format_response           │ │
│ │            │ │                                │ │       ← dimmed (no label)      │ │
│ │            │ │                                │ │                                │ │
│ │            │ │  [Type a message...]           │ │ ▶ Run def456 - 2:30 PM         │ │
│ └────────────┘ └────────────────────────────────┘ └────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

#### Label Filter Dropdown (Expanded)

```
┌──────────────────────────────────────┐
│  🏷️ Filter by Labels            ▲   │
├──────────────────────────────────────┤
│  ┌────────────────────────────────┐  │
│  │ 🔍 Search labels...            │  │
│  └────────────────────────────────┘  │
│                                      │
│  Match: ○ Any  ● All                 │
│                                      │
│  ─────────────────────────────────── │
│  Popular                             │
│  ┌────────────┐ ┌──────────────┐     │
│  │☑ flight_se │ │☐ budget_agen │     │
│  │  (156)     │ │   (98)       │     │
│  └────────────┘ └──────────────┘     │
│  ┌────────────┐ ┌──────────────┐     │
│  │☐ hotel_sea │ │☐ activity_ex │     │
│  │   (87)     │ │   (65)       │     │
│  └────────────┘ └──────────────┘     │
│                                      │
│  ─────────────────────────────────── │
│  All Labels (54)                     │
│  ┌────────────┐ ┌──────────────┐     │
│  │☐ analysis_ │ │☐ agentic_orc │     │
│  │   (45)     │ │   (23)       │     │
│  └────────────┘ └──────────────┘     │
│  ...                                 │
│                                      │
│  ┌─────────────┐ ┌───────────────┐   │
│  │ Clear All   │ │ Apply (1)     │   │
│  └─────────────┘ └───────────────┘   │
└──────────────────────────────────────┘
```

---

### 10. Success Metrics

| Metric | Target |
|--------|--------|
| Filter usage rate | >30% of users use label filters |
| Time to find specific traces | <10 seconds with filter vs >30s without |
| Lucy label query success | >80% of label-related queries understood |
| Page load with filters | <500ms additional latency |

---

### 11. Open Questions

1. **Label Creation**: Should users be able to create/assign labels from the UI, or only filter existing labels?

2. **Label Hierarchy**: Should we support hierarchical labels (e.g., `agent/flight`, `agent/budget`)?

3. **Negative Filters**: Should we support "exclude these labels" in addition to "include these labels"?

4. **Label Aliases**: Should we support label aliases or groupings (e.g., `search = flight_search, hotel_search, activity_search`)?

5. **Filter Persistence**: Should label filters persist when switching between threads, or clear automatically?

6. **Quick Filter from Span**: Should clicking a label on a span automatically add it to the filter?

---

## Appendix

### A. Database Query Examples

**Get all unique labels with counts:**
```sql
SELECT
  json_extract(attribute, '$.label') as label,
  COUNT(*) as count
FROM traces
WHERE json_extract(attribute, '$.label') IS NOT NULL
  AND project_id = ?
GROUP BY label
ORDER BY count DESC;
```

**Get threads with specific labels:**
```sql
SELECT DISTINCT thread_id
FROM traces
WHERE project_id = ?
  AND json_extract(attribute, '$.label') IN ('flight_search', 'budget_agent')
ORDER BY start_time_us DESC;
```

**Get spans with labels for a thread:**
```sql
SELECT *
FROM traces
WHERE thread_id = ?
  AND json_extract(attribute, '$.label') IS NOT NULL
ORDER BY start_time_us;
```

### B. Related Files

**Frontend:**

| File | Purpose |
|------|---------|
| `ui/src/components/chat/ThreadsSidebar.tsx` | Thread list sidebar |
| `ui/src/components/chat/thread/ThreadList.tsx` | Virtual thread list |
| `ui/src/components/chat/thread/ThreadTagsDisplay.tsx` | Tag/label display |
| `ui/src/components/chat/traces/TraceView.tsx` | Trace panel |
| `ui/src/contexts/ThreadsContext.tsx` | Thread state management |
| `ui/src/contexts/TracesPageContext.tsx` | Traces page state |
| `ui/src/types/common-type.ts` | Span/Label types |

**Backend:**

| File | Purpose |
|------|---------|
| `core/src/handler/labels.rs` | **New** - Labels endpoint handler |
| `core/src/handler/spans.rs` | Spans API handler (add `labels` param) |
| `core/src/handler/traces.rs` | Traces API handler (add `labels` param) |
| `core/src/types/metadata/services/trace.rs` | Query types (`ListTracesQuery`) |
| `core/src/metadata/services/trace.rs` | Database query implementation |
| `core/src/metadata/schema.rs` | Database schema (traces table) |
| `gateway/src/http.rs` | HTTP route definitions |
