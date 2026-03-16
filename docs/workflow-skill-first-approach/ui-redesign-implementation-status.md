# UI Visualization Redesign — Implementation Status

## Date: 2026-03-16

Tracks progress against [ui-visualization-redesign.md](./ui-visualization-redesign.md).

---

## Files Created (9 new)

| File | Lines | Purpose |
|------|-------|---------|
| `src/components/datasets/DataFlowBanner.tsx` | 128 | 4-stage pipeline banner with 3 states |
| `src/components/datasets/dataset-canvas/CanvasEmptyState.tsx` | 52 | Canvas empty state (no topics) |
| `src/components/datasets/dataset-canvas/SourceGhostNodes.tsx` | 107 | Floating source part links on zoom |
| `src/components/datasets/dataset-canvas/TopicInspectorDrawer.tsx` | 356 | Bottom drawer, 3-column compact + tabbed full-view, drag resize |
| `src/components/datasets/records-table/PromptInheritancePanel.tsx` | 166 | Root → Parent → Leaf prompt chain with crossfade animation |
| `src/components/datasets/sources-view/SourcesView.tsx` | 614 | Sources browsing page (All Sources + Single Doc + coverage bars + grouped parts + markdown + footer) |
| `src/components/datasets/sources-view/CoverageMatrix.tsx` | 125 | Topics × documents coverage grid |
| `src/hooks/useKeyboardShortcuts.ts` | 68 | 1/2/3 view switch, Esc, ? |
| `src/hooks/usePromptScrollTracking.ts` | 81 | Scroll-based topic detection for prompt panel |

## Files Modified (9 existing)

| File | Changes |
|------|---------|
| `ViewModeToggle.tsx` | Extended to `"canvas" \| "sources" \| "table"`, added FileText icon |
| `DatasetDetailContext.tsx` | Extended ViewMode type |
| `DatasetDetailContentV2.tsx` | ViewMode type fix for handler |
| `DatasetMainContent.tsx` | Banner integration, 3-view switching, keyboard shortcuts |
| `TopicCanvasContext.tsx` | Zoom-to-inspect state (`zoomedTopicId`, `zoomToTopic`, `zoomOut`) |
| `TopicHierarchyCanvas.tsx` | Viewport zoom, fade/blur, vignette, ghost nodes overlay, drawer replaces RecordsPanel |
| `CollapsedTopicNode.tsx` | Simplified to 3 signals: header, coverage bar, source count. Zoom glow ring |
| `RecordsTable.tsx` | Prompt panel integration + scroll tracking |
| `TopicTreeNodeRow.tsx` | Added `data-topic-group` attribute for scroll tracking |

---

## Phase-by-Phase Status

### Phase 1: Foundation — 5/5 done

| Task | Status | Notes |
|------|--------|-------|
| 1.1 Canvas/Sources/Table toggle | Done | `ViewModeToggle.tsx`, `DatasetMainContent.tsx` |
| 1.2 `DataFlowBanner.tsx` with 3 states | Done | 128 lines, normal/empty/extracting |
| 1.3 "All Sources" nav item in sidebar | Done | `DatasetExplorer.tsx` — "All Sources" item in knowledge section, dispatches view switch |
| 1.4 Banner integrated into layout | Done | In `DatasetMainContent.tsx` |
| 1.5 `useKeyboardShortcuts.ts` | Done | 1/2/3 + Esc + ? |

### Phase 2: Canvas — 8/8 done

| Task | Status | Notes |
|------|--------|-------|
| 2.1 Simplify CollapsedTopicNode (3 signals) | Done | Only header (name+count), coverage bar, source count. Removed quality row, description, reassignment warning |
| 2.2 Coverage bar color coding | Done | emerald/amber/red thresholds |
| 2.3 Remove "No description" empty state | Done | Only shows if description exists |
| 2.4 Zoom-to-inspect | Done | Fade, blur, vignette, setCenter |
| 2.5 `SourceGhostNodes.tsx` | Done | max 3 + overflow |
| 2.6 `TopicInspectorDrawer.tsx` (3-column) | Done | 3-column compact + tabbed full-view |
| 2.7 Drawer resize + full-view | Done | Full-view switches to Records/Sources tabs via `TabButton` component |
| 2.8 `CanvasEmptyState.tsx` | Done | Wired into `TopicHierarchyCanvasInner` — shows when no hierarchy + no records |

**Remaining polish (nice-to-have):**
- Dotted SVG edges from ghost nodes to selected node (N1)

### Phase 3: Sources Page — 5/5 done

| Task | Status | Notes |
|------|--------|-------|
| 3.1 Sidebar doc selection drives main content | Done | SourcesView internal sidebar + DatasetExplorer "All Sources" dispatches `vllora_switch_view` |
| 3.2 CoverageMatrix + doc cards | Done | `CoverageMatrix.tsx` + cards in `AllSourcesView` |
| 3.3 SingleDocView (header, topic bars, parts outline) | Done | Header + `computeTopicCoverage()` renders color-coded bars per topic |
| 3.4 PartOutline (extraction path groups) | Done | `groupPartsByExtractionPath()` with section headers (FolderOpen icon) |
| 3.5 PartViewer redesign | Done | Prev/next nav, `react-markdown` rendering, footer with linked topic chips + records generated count |

### Phase 4: Table Page — 5/6 done

| Task | Status | Notes |
|------|--------|-------|
| 4.1 GroupedRecordsTable | Done | Uses existing `TopicRecordTree` |
| 4.2 Group/subgroup headers with collapse | Done | In `TopicTreeNodeRow` |
| 4.3 `PromptInheritancePanel.tsx` | Done | 166 lines, 3-card chain with crossfade animation |
| 4.4 `usePromptScrollTracking.ts` + integration | Done | Hook + wiring + prompt icon (MessageSquare) on `TopicNodeHeader.tsx` dispatching `vllora_toggle_prompt_panel` |
| 4.5 RecordDetailSidebar | Done | Pre-existing |
| 4.6 Column resize handles | **Missing** | No resize handles on Input/Output columns |

### Phase 5: Polish — 2/3 done

| Task | Status | Notes |
|------|--------|-------|
| 5.1 Animations | Done | Ghost fade-in (SourceGhostNodes), drawer transition, crossfade on prompt auto-tracking |
| 5.2 Empty states consistency | Done | SourcesView + CanvasEmptyState wired. Table empty state pre-existing |
| 5.3 Responsive (sidebar collapse < 1200px) | **Missing** | No responsive handling |

---

## Mockup vs Actual — Gap Analysis (2026-03-16)

Compared live mockup (`mockup-dataset-redesign.html`) against actual app side-by-side.

### Canvas Page — Mostly Matching

| Mockup Element | Status | Gap |
|---------------|--------|-----|
| Simplified nodes (name + count, coverage bar, source count) | **Match** | Nodes show 3 signals as spec'd |
| Coverage bar color coding (emerald/amber/red) | **Match** | Thresholds implemented |
| Root node with totals | **Match** | Shows total topics + records |
| Zoom-to-inspect (fade, blur, vignette) | **Match** | Click node → zoom + effects |
| Source ghost nodes (max 3 + overflow) | **Match** | Renders on zoom |
| Bottom drawer (3-column compact) | **Match** | Info / Sources / Records columns |
| Drawer full-view tabs | **Match** | Switches to Records/Sources tabs |
| Canvas empty state | **Match** | Shows when no topics |
| Dotted SVG edges ghost → node | **Missing** | N1 nice-to-have |

### Sources Page — Partial (3 bugs found + visual gaps)

| Mockup Element | Status | Gap |
|---------------|--------|-----|
| Internal sidebar (All Sources + docs) | **Match** | Sidebar with doc selection works |
| CoverageMatrix (topics × docs grid) | **Match** | Green/gray cells render correctly |
| Source cards with stats | **Match** | Shows parts, chars, type breakdown |
| Document header (icon, title, meta, stats) | **Match** | 10 parts · 21.0K chars |
| **Topic coverage bars** | **BUG FIXED** | `computeTopicCoverage()` used wrong ref format (`sourceId:chunkId` colon split). CoverageMatrix uses `partId` or `sourceId/partId` (slash). Fixed to match CoverageMatrix's `hasLink()` logic |
| **Part outline grouped by extractionPath** | **Data gap** | Code works but parts have no `extractionPath` field set. Mockup shows "Part I — Foundations", "Part II — Tactical Motifs" sections — our data doesn't have these |
| Part outline with topic link dots | **Missing** | Mockup shows colored dots on each part indicating how many topics reference it. Not implemented |
| Part viewer: type badge + prev/next nav | **Match** | TEXT/TABLE/IMAGE badge + "1/10" nav |
| Part viewer: meta row (file, section, chars) | **Partial** | Shows file + chars but no section path (no `extractionPath` data) |
| Part viewer: rendered markdown | **Match** | ReactMarkdown renders headings, lists, bold, blockquotes |
| **Part viewer: footer (topic chips + records)** | **BUG FIXED** | `findTopicsForPart()` used wrong ref format (`sourceId:partId` colon). Fixed to check all 3 formats: raw `partId`, `sourceId/partId`, `sourceId:partId` |
| Explorer "All Sources" click | **BUG FIXED** | Was opening a tab showing "Document not found". Fixed: now skips `openTab()` and only dispatches `vllora_switch_view` |

### Table Page — Major Visual Gap

The mockup shows a **completely different table layout** from what we currently render.

| Mockup Element | Status | Gap |
|---------------|--------|-----|
| **Clean hierarchical table** | **Major gap** | Mockup: parent group row → subgroup row → flat record rows in a single `<table>`. Actual: `TopicRecordTree` with system prompt displayed inline, different indentation/structure |
| **Parent group headers** (collapsible, count + avg score + coverage bar) | **Partial** | We have collapsible headers but they show system prompt inline instead of compact stats row |
| **Subgroup headers** (tree connector, count pill, avg score, source count, prompt icon) | **Partial** | We show count + coverage % but not avg score, source count, or tree connector styling |
| **Record rows with score pills** | **Missing** | Mockup shows colored score pill (green/amber/red) per row. Our table has a "score" column but no color-coded pills |
| **Source column** on record rows | **Missing** | Mockup shows "ch.1", "ch.2.1" source chapter references |
| **Prompt inheritance panel** (3-card chain above table) | **Match** | PromptInheritancePanel renders Root → Parent → Leaf cards with crossfade |
| **Toolbar** (search, All Topics filter, All Scores filter, record count) | **Partial** | We have search + record count but not the filter dropdowns |
| **Record detail sidebar** (slide-in on row click) | **Pre-existing** | Was already implemented before redesign |
| Column resize handles | **Missing** | N2 nice-to-have |

**Summary**: The table page uses the old `TopicRecordTree` component which was extended with prompt icons and count pills, but the overall visual structure is very different from the mockup's clean flat table with parent/subgroup header rows.

---

## Remaining Work — Prioritized

### Critical (blocks core functionality) — ALL DONE

| # | Item | Phase | Status |
|---|------|-------|--------|
| C1 | Prompt icon on topic headers | 4.4 | Done |
| C2 | CanvasEmptyState wired | 2.8 | Done |
| C3 | Explorer sidebar "All Sources" nav | 1.3 | Done (bug fixed: was opening tab instead of switching view) |

### Bugs Fixed (2026-03-16)

| Bug | Fix | File |
|-----|-----|------|
| Canvas zero-height (ReactFlow not visible) | Changed `flex-1` → `h-full` on canvas container | `TopicHierarchyCanvas.tsx:307` |
| I1/I5: Topic coverage bars + footer not rendering | Fixed ref format mismatch: was splitting on `:`, CoverageMatrix uses raw `partId` or `sourceId/partId` | `SourcesView.tsx` |
| Explorer "All Sources" shows "Document not found" | Skip `openTab()` for All Sources, only dispatch view switch event | `DatasetExplorer.tsx:596` |

### Important — Visual Gap Closure

| # | Item | Phase | Effort | What to do |
|---|------|-------|--------|------------|
| V1 | Table page layout overhaul | 4 | L | Replace inline system prompt display with compact parent/subgroup header rows matching mockup. Add score pills, source column, tree connectors |
| V2 | Part outline topic link dots | 3 | S | Add colored dots on each part item showing how many topics reference it |
| V3 | Table filter dropdowns | 4 | M | Add "All Topics" and "All Scores" filter buttons to toolbar |

### Nice-to-have (polish)

| # | Item | Phase | What to do |
|---|------|-------|------------|
| N1 | Dotted SVG edges ghost → node | 2.5 | Draw dashed SVG lines connecting ghost nodes to selected canvas node |
| N2 | Column resize handles | 4.6 | Add visual resize indicator on Input/Output column borders |
| N3 | Responsive sidebar collapse | 5.3 | Collapse sidebar at < 1200px viewport width |
