# Lucy Finetune Dataset — VS Code-Style Redesign Proposal

> Synthesized from 3-reviewer audit (UX Flow, Visual/Interaction, Info Architecture)
> Date: 2026-02-24 | Status: **Phase A + D complete, Phases 0-3 pending** | Branch: `refactor/ux-redesign-follow-vs-code`

---

## Executive Summary

### What is changing and why

The Lucy Finetune experience aims to feel like **VS Code with Copilot Chat**: an AI assistant in the sidebar orchestrates the workflow while the workspace displays the artifacts the user is building. After three independent reviews, we found **27 of 43 known issues still open**, several P0 usability blockers, and significant gaps between the IDE-style redesign spec and the current implementation.

**The core principle remains:** Lucy owns orchestration (plans, progress, guidance). The workspace owns artifacts as dynamic editor tabs. With Vision A, Plan/Docs/Readme become openable tabs in the workspace (via Explorer file-tree) rather than sheet overlays.

### What has been done

The IDE-style redesign spec (Phase 1 ~90%, Phase 2 ~85%) delivered:
- Plan/Docs/Readme moved out of tabs into header buttons and drawers
- `PlanContext` as single source of truth for plan lifecycle
- `PlanPreview` in workspace (display + edit modes) with URL persistence
- `PlanCard` in sidebar chat, `ActivePlanBanner` between header and tabs
- `ReadmeDrawer` (60vw) and `DocsDrawer` (50vw) as right-side Sheets
- Overview tab with stat cards, README viewer, and activity timeline
- Data tab: Stitch visual redesign, unified RecordDetailSidebar, canvas improvements

### What remains (this proposal)

| Category | Count | Key items |
|----------|-------|-----------|
| **P0 blockers** | 6 | ~~PlanCard visibility, tabs during plan, confirmation dialog, connection timeout~~ (4 fixed in Phase A), error recovery, Deploy tab empty |
| **Structural** | 4 | Remove ArrowSegment, remove/reduce Overview tab, simple horizontal tabs, collapsed sidebar indicators |
| **Polish** | 12 | Hardcoded zinc-* colors, badge inconsistencies, drawer width mismatch, quick actions, terminology |
| **Missing patterns** | 4 | Plan cancel, execution persistence, progressive timeout, status bar |
| **Chat panel style** | 13 files | ~~Transform bubble-style chat to flat IDE-panel conversation log~~ **DONE** ([10-chat-panel-redesign.md](./10-chat-panel-redesign.md)) |

---

## Architectural Decision: Vision A — Full VS Code File/Tab Model

> **Decision: Vision A** — confirmed. Explorer shows dataset as a virtual file tree; clicking files opens dynamic, closeable editor tabs in the workspace.

### What this means

The Explorer sidebar presents the dataset as a **project** with files and folders (readme.md, plan.md, documents/, topics/, evaluations/, finetune/, quick-stats/). Every file in the tree opens as a **dynamic, closeable editor tab** in the workspace — replacing the fixed navigation tabs (Overview, Data, Evaluation, Fine-tune, Deploy) and sheet overlays (ReadmeDrawer, DocsDrawer, PlanPreview).

```
Explorer file clicked  →  [grader-script.ts ×] [record-001 ×] [ft-chess-v2 ×]
```

See [01-explorer-panel.md](./01-explorer-panel.md) for the full file-tree structure, tab behavior, and virtual file → data source mapping.

### Implementation strategy

**Implement Vision B fixes first (Phases A + B1-B7), then layer Vision A on top (B8-B9).** Vision B's bug fixes and structural improvements are needed regardless. Vision A's Explorer + dynamic tabs build on top of a working foundation.

| Phase | What | Effort |
|-------|------|--------|
| A + B1-B7 | Bug fixes, simple tabs, collapsed indicators, plan cancel, deploy content | 4-6 days |
| B8-B9 | Explorer file-tree, dynamic workspace tabs, tab content routing | 3-5 days |

---

## Document Index

| File | Description |
|------|-------------|
| [01-explorer-panel.md](./01-explorer-panel.md) | Explorer sidebar: VS Code file-tree (virtual files/folders), dynamic tab mapping, file→data source mapping |
| [02-wireframes.md](./02-wireframes.md) | All ASCII wireframes: every major UI state |
| [03-tab-redesign.md](./03-tab-redesign.md) | Tab system: ArrowSegment removal, simple tabs, locked state fix |
| [04-sidebar-redesign.md](./04-sidebar-redesign.md) | Sidebar: PlanCard, collapsed indicators, connection timeout, error recovery, quick actions, confirmation dialog |
| [05-terminology.md](./05-terminology.md) | Terminology standardization across UI |
| [06-component-changes.md](./06-component-changes.md) | Component create / modify / delete summary |
| [07-mockups-e2e.md](./07-mockups-e2e.md) | Visual mockups with E2E test experiments (Playwright) |
| [08-open-issues.md](./08-open-issues.md) | Out-of-scope items + validation checklist |
| [09-user-flow.md](./09-user-flow.md) | End-to-end user journey flows, state machine, error recovery paths |
| [10-chat-panel-redesign.md](./10-chat-panel-redesign.md) | Chat panel flat IDE style: bubble→flat transformation, component-by-component changes, spacing rules — **IMPLEMENTED** |
| [11-implementation-plan.md](./11-implementation-plan.md) | **Unified implementation plan** (single source of truth): all phases (A/0/1/2/3/C/D), architecture, events, risks, DoD — **Phase A + D complete** |
