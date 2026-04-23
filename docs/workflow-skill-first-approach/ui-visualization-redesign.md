# UI Visualization Redesign — Finalized Design

## Date: 2026-03-18 (updated)

## Mockup Reference

**Live mockup:** `docs/workflow-skill-first-approach/mockup-dataset-redesign.html`

Open in browser to see all 3 pages with working interactions. Use the **Mockup Controls** panel (top-right) to toggle between Normal / Empty / Extracting states. Press `?` for keyboard shortcuts.

---

## Design Summary

The redesign replaces the current disconnected views with a **3-page experience** (Canvas, Sources, Table) unified by a persistent Data Flow Banner and sidebar. The design language is dark-mode, minimal, and Linear-inspired.

### Page Overview

| Page | Purpose | Key Interaction |
|------|---------|----------------|
| **Canvas** | Topic hierarchy visualization with zoom-to-inspect | Click node → zoom in + bottom drawer with sources/records/stats |
| **Sources** | Knowledge source browsing with sidebar-driven doc selection | Sidebar selects doc → left shows parts outline + topic coverage, right shows part viewer |
| **Table** | Flat record browsing with hierarchy context | Collapsible parent/child groups, sticky prompt inheritance panel, scroll-based tracking, record detail sidebar |

---

## Design Components

### 1. App Layout

```
┌──────┬──────────┬─────────────────────────────────────────┐
│ Icon │ Top Bar  │ Breadcrumb · Spacer · [Canvas|Sources|Table] │
│ Rail ├──────────┼─────────────────────────────────────────┤
│  56px│ Sidebar  │ Main Content                             │
│      │  240px   │ (Data Flow Banner + page content)        │
│      │          │                                          │
└──────┴──────────┴─────────────────────────────────────────┘
```

- **Icon Rail** (56px): Logo, Home, Datasets, Settings
- **Sidebar** (240px): Source Documents, Training Data (topics), Eval Runs, Training Jobs
- **Top Bar**: Breadcrumb (updates per page/selection) + Canvas/Sources/Table toggle
- **View toggle** switches pages while sidebar + banner persist

### 2. Data Flow Banner

Always visible at top of main content. Horizontal pipeline showing the data generation strategy:

```
📄 Documents  →  📋 Extracted  →  🏷️ Topics  →  💬 Records
   3 sources       19 parts        12 topics     150 records
   chess.pdf...    14 text...      5 categories   82% quality
```

- Each stage is clickable (navigates to corresponding page)
- Active stage highlighted with accent background
- Arrows use gradient line + chevron icon

**States:**
- **Normal:** Shows real counts and details
- **Empty:** All stages dimmed, Documents stage shows "No documents yet", others show "waiting"
- **Extracting:** Documents stage shows count, Extracted stage has shimmer animation + "EXTRACTING" badge, remaining stages dimmed

### 3. Canvas Page (Page 1)

#### Topic Nodes (Simplified)

Nodes show only 3 signals for fast scanning:
- **Name + record count** (header)
- **Coverage bar** (color-coded: emerald ≥80%, amber ≥60%, red <60%)
- **Source count** (footer)

Root node: centered, shows total topics + records.

#### Zoom-to-Inspect Interaction

Click any node → canvas zooms in smoothly (scale 1.4x):
1. Other nodes fade + blur (`opacity: 0.15; filter: blur(1px)`)
2. Selected node gets accent border + animated glow ring
3. Vignette overlay darkens edges
4. **Source ghost nodes** appear to the left (max 3 visible + "+N more" overflow link)
5. Dotted SVG edges connect ghosts to selected node
6. **Bottom drawer** slides up (320px default, resizable via drag handle)

**Zoom-out:** Click canvas background, press `Esc`, or click drawer close button.

#### Bottom Drawer

3-column layout when a topic is selected:

| Column | Width | Content |
|--------|-------|---------|
| Info | 260px | Title, description, 2×2 stats grid, quality bar, actions |
| Sources | 300px | Source material cards with file/chapter/preview |
| Records | flex | Sample records (user/assistant pairs with scores) |

**Full-view mode:** Drag handle upward past 60% viewport height. Switches to:
- Full header with stats
- Tabs: Records (table with score pills) · Sources (2-col cards with topic chips)
- Double-click handle to toggle between compact/full

#### Source Ghost Nodes

Appear only for the selected node:
- Part title, source filename, page range
- Dashed accent border, fade-in animation (staggered)
- **Max 3 visible** — additional sources show "+N more sources..." overflow link
- Click ghost to navigate to KnowledgePartViewer

#### Empty State

When no topics exist, the canvas shows:
- Large dashed icon placeholder
- "No topics yet" heading
- Upload prompt + skill command hint: `claude /run finetune chess-tactics.pdf`

### 4. Sources Page (Page 2)

**Two modes driven by sidebar selection:**

#### Mode 1: "All Sources" (sidebar → All Sources)

Left panel shows:
- **Coverage Matrix** at top: grid of topics (rows) × documents (columns)
  - Green cells = has parts (shows count), gray = no data, red dashed = gap
- **All document cards** below with summaries

#### Mode 2: Single Document (sidebar → specific PDF)

Left panel shows:
- **Document header card**: icon, title, meta, stats (parts/topics/chars)
- **Topic coverage bars**: horizontal bars showing how many parts cover each topic
- **Full parts list**: structured outline grouped by `extractionPath` sections
  - Section headers (e.g., "Part II — Tactical Motifs")
  - Part items with type icon (T=text, ▪=table), title, page range, char count
  - Topic link dots (visual indicator of how many topics reference this part)
  - Click part → highlights it and updates right viewer

**Breadcrumb** updates to show selected document name or "All Sources".

#### Right: Part Viewer (both modes)

- Title row with type badge (TEXT/TABLE/IMAGE) + prev/next nav buttons
- Meta row with icons: source file, section path, character count
- Content area: **rendered markdown** (headings, bullet lists, bold, chess notation, blockquotes)
- Footer: "Referenced by Topics" chips + "Records Generated" count with avg score

### 5. Table Page (Page 3)

#### Hierarchical Grouped Table

Records organized by topic hierarchy:

```
▼ Basic Tactical Patterns                    34 records · 0.85 avg · ████████░░
  ├ ▼ Forks                         14       0.82 avg · 💬
  │   #1  "Explain the knight..."   "A knight fork..."    0.93    ← click to open detail
  │   #2  "What is a family..."     "A family fork..."    0.87
  ├ ▼ Pins and Skewers              12       0.74 avg · 💬
  ...
▼ Advanced Combinations                      28 records · 0.71 avg · █████░░░░░
  ...
```

- **Group headers** (parent topics): collapsible, show record count + avg score + coverage bar
- **Subgroup headers** (leaf topics): tree-line connector, count pill, avg score, **prompt icon button** (💬)
- **Record rows**: clickable → opens **Record Detail Sidebar** (slides in from right)
- **Column resize handles**: Input and Output columns show resize indicator on hover
- Toolbar: search, filter dropdown (All Topics / All Scores), record count

#### Record Detail Sidebar

Slides in from right (520px) when clicking a record row. Layout:

1. **Header**: "Record #N" with prev/next nav group, edit/delete/close buttons
2. **Topic breadcrumb**: Parent path > Leaf topic (green chip)
3. **Scores**: Split into two groups:
   - **Evaluations** (blue dot): v1, v2, v3... with gradient bars, scores, trend arrows
   - **Training** (green dot): v1, v2... same format
   - Running jobs show animated bar + spinner. Queued shows italic text.
   - Trends calculated within each group (not across types)
4. **Conversation**: System prompt (dashed border, dim text) → User message (solid border). No assistant message (training records only have system + user).
5. **Source Context**: File icon, source name, ref count, excerpt with highlighted keywords
6. **Details grid**: Tokens | Sources | Turns in 3-column card layout

#### Sticky Prompt Inheritance Panel

Opens above the table when user clicks a prompt icon (💬) on any subgroup header:

```
┌──────────────────────────────────────────────────────────────────┐
│ 💬 SYSTEM PROMPT CHAIN   Root > Basic Tactical > Forks      [×] │
│                                                                  │
│ ┌── ROOT ─────────┐  →  ┌── PARENT ──────────┐  →  ┌── LEAF ─────────────┐ │
│ │ You are a chess  │     │ Focus on basic     │     │ Specialize in forks: │ │
│ │ tutor AI...      │     │ tactical patterns..│     │ knight forks, queen..│ │
│ └─────────────────┘     └────────────────────┘     └─────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

- **3-card chain**: Root (inherited, muted) → Parent (inherited) → Leaf (own, accent-highlighted)
- Each card: expandable (click "Show more"), monospace font
- Breadcrumb shows hierarchy path
- **Behavior:**
  - Starts closed
  - Opens on first click of any prompt icon (💬)
  - Once open, **auto-tracks on scroll** — crossfades to show the current topic's prompt chain
  - Closing the panel disables auto-tracking
  - Active prompt icon highlighted with accent color

### 6. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` / `2` / `3` | Switch to Canvas / Sources / Table |
| `Esc` | Zoom out (canvas), close drawer, close record detail sidebar |
| `?` | Toggle keyboard shortcuts help |

---

## Component Mapping: Mockup → React

| Mockup Element | New/Modified Component | Existing Component |
|----------------|----------------------|-------------------|
| App Layout | — | `DatasetDetailContentV2.tsx` (modify grid) |
| Data Flow Banner | **New:** `DataFlowBanner.tsx` | — |
| Banner empty/extracting states | Built into `DataFlowBanner.tsx` | — |
| Canvas nodes (simplified) | Modify | `CollapsedTopicNode.tsx` |
| Zoom interaction | **New:** zoom logic in | `TopicHierarchyCanvas.tsx` |
| Source ghosts + overflow | **New:** `SourceGhostNodes.tsx` | — |
| Bottom drawer | **New:** `TopicInspectorDrawer.tsx` | (replaces/augments `RecordsPanel.tsx`) |
| Drawer full-view | **New:** `TopicInspectorFull.tsx` | — |
| Focus ring + vignette | **New:** CSS in canvas | — |
| Canvas empty state | **New:** `CanvasEmptyState.tsx` | — |
| Sources page layout | Modify | `KnowledgeSourcesPanel.tsx` |
| Sources sidebar-driven selection | Modify | `ExplorerSidebar.tsx` + `KnowledgeSourcesPanel.tsx` |
| Coverage matrix (All Sources mode) | **New:** `CoverageMatrix.tsx` | — |
| Single doc view (topic bars + parts) | **New:** `SingleDocView.tsx` | — |
| Document card (All Sources mode) | Modify | `KnowledgeSourceCard.tsx` |
| Part outline (structured) | **New:** `PartOutline.tsx` | — |
| Part viewer (markdown + footer) | Modify | `KnowledgePartViewer.tsx` |
| Table page | Modify | `RecordsTable.tsx` |
| Hierarchical grouping | **New:** `GroupedRecordsTable.tsx` | — |
| Record detail sidebar | **New:** `RecordDetailSidebar.tsx` | — |
| Prompt panel | **New:** `PromptInheritancePanel.tsx` | — |
| Prompt scroll tracking | **New:** hook `usePromptScrollTracking.ts` | — |
| Sidebar (renamed + doc selection) | Modify | `ExplorerSidebar.tsx` |
| View toggle (3 pages) | Modify | `RecordsSectionHeader.tsx` |
| Keyboard shortcuts | **New:** hook `useKeyboardShortcuts.ts` | — |

---

## Implementation Plan

> **See [implementation-status.md](./implementation-status.md) for the latest status of each component.**

### Phase 1: Foundation (Layout + Banner + View Toggle) — ✅ DONE

| Task | File(s) | Status |
|------|---------|--------|
| 1.1 Add Canvas/Sources/Table page toggle | `DatasetMainContent.tsx`, `ViewModeToggle.tsx` | ✅ |
| 1.2 Create `DataFlowBanner.tsx` with 3 states | New component | ✅ |
| 1.3 Rename sidebar sections + add "All Sources" item | `DatasetExplorer.tsx` | ✅ |
| 1.4 Integrate banner into layout | `DatasetDetailContentV2.tsx` | ✅ |
| 1.5 Add `useKeyboardShortcuts.ts` (page switching, Esc) | New hook | ✅ |

### Phase 2: Canvas Improvements (Nodes + Zoom + Drawer) — ✅ DONE

| Task | File(s) | Status |
|------|---------|--------|
| 2.1 Simplify `CollapsedTopicNode` (3 signals only) | `CollapsedTopicNode.tsx` | ✅ |
| 2.2 Add coverage bar color coding (emerald/amber/red) | `CollapsedTopicNode.tsx` | ✅ |
| 2.3 Quality score dots on nodes | `CollapsedTopicNode.tsx` | ✅ |
| 2.4 Implement zoom-to-inspect (transform, fade, vignette) | `TopicHierarchyCanvas.tsx` | ✅ |
| 2.5 Create `SourceGhostNodes.tsx` (max 3 + overflow) | New component | ✅ |
| 2.6 Create `TopicInspectorDrawer.tsx` (3-column) | New component | ✅ |
| 2.7 Create `CanvasEmptyState.tsx` | New component | ✅ |

### Phase 3: Sources Page Redesign — ✅ DONE

| Task | File(s) | Status |
|------|---------|--------|
| 3.1 Add sidebar doc selection → drives main content | `DatasetExplorer.tsx`, `SourcesView.tsx` | ✅ |
| 3.2 Create "All Sources" view with `CoverageMatrix.tsx` + doc cards | `SourcesView.tsx` | ✅ |
| 3.3 Create `SingleDocView` (header, topic bars, parts outline) | `SourcesView.tsx` | ✅ |
| 3.4 Topic link badges on parts | `SourcesView.tsx` (`TopicLinkBadge`) | ✅ |
| 3.5 Part viewer with markdown + footer | `SourcesView.tsx` | ✅ |

### Phase 4: Table Page (Hierarchy + Scores + Record Detail) — ✅ DONE

| Task | File(s) | Status |
|------|---------|--------|
| 4.1 Create `UnifiedRecordTable.tsx` (parent/child grouping) | New component | ✅ |
| 4.2 Add dynamic job score columns (eval + finetune) | `job-score-columns.ts`, `useJobScoreColumns.ts` | ✅ |
| 4.3 Create `PromptInheritancePanel.tsx` (3-card chain) | New component | ✅ |
| 4.4 Create `usePromptScrollTracking.ts` hook | New hook | ✅ |
| 4.5 Redesign `RecordDetailSidebar.tsx` (split scores, conversation, source context) | Rewritten | ✅ |
| 4.6 Wire up score columns in `DatasetMainContent` → sidebar | Modified | ✅ |

### Phase 5: Polish — Ongoing

| Task | File(s) | Status |
|------|---------|--------|
| 5.1 Animations (zoom easing, drawer slide) | CSS | Partial |
| 5.2 Topic breadcrumb parent path in sidebar | `RecordDetailSidebar.tsx` | Minor bug |
| 5.3 Responsive adjustments | CSS | TODO |

---

## Resolved Mockup Items

The following items from the initial review have been addressed in the mockup:

| Item | Status | How |
|------|--------|-----|
| Keyboard shortcuts | Done | `1`/`2`/`3` page switch, `Esc` close, `?` help panel |
| Empty states | Done | Mockup Controls → "Empty" state with upload prompt |
| Loading/extracting states | Done | Mockup Controls → "Extracting" with shimmer animation |
| Source ghost overflow | Done | Max 3 ghosts + "+3 more sources..." link |
| Part viewer markdown | Done | Headings, lists, bold, chess notation, blockquotes |
| Table column resize | Done | Visual resize handles on Input/Output columns |
| Record detail on click | Done | Slide-in sidebar with full messages, prompt, metadata |
| Sources sidebar selection | Done | "All Sources" vs specific doc drives left panel content |

### Remaining Open Items

1. **Prompt data source** — System prompts come from topic metadata or data generation config. Need to define the API contract.
2. **Coverage matrix scalability** — With 20+ topics, matrix needs scrollable container or grouped rows.
3. **Drawer↔Table sync** — Viewing a topic in canvas drawer then switching to Table should scroll to that group.
4. **Responsive layout** — Sidebar collapse at <1200px width not yet prototyped.
