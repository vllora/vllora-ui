# Component Changes Summary

---

## Components to CREATE

| Component | Location | Purpose |
|-----------|----------|---------|
| `DatasetExplorer.tsx` | `src/components/datasets/sidebar/` | Explorer panel: VS Code-style file tree with virtual files/folders mapping to dataset artifacts |
| `FileTreeItem.tsx` | `src/components/datasets/sidebar/` | Single tree item: file icon, name, status badge, indent level, expand/collapse for folders |
| `SidebarTabStrip.tsx` | `src/components/datasets/sidebar/` | Tab strip component (`[Explorer] [Lucy]`) with badge support, renders at top of existing sidebar |
| `WorkspaceTabManager.tsx` | `src/components/datasets/` | Dynamic tab bar: open/close/preview/pin behavior matching VS Code (replaces fixed navigation tabs) |
| `TabContentRouter.tsx` | `src/components/datasets/` | Routes tab file type to correct content component (markdown viewer, Monaco editor, job detail, etc.) |
| `DeployGuidancePanel.tsx` | `src/components/datasets/` | Deploy tab content: weights download guide, code snippets, resource links |
| `PlanApprovalDialog.tsx` | `src/components/datasets/plan-section/` | AlertDialog confirming plan execution with summary and cost warning |

---

## Components to MODIFY

| Component | File Path | Changes |
|-----------|-----------|---------|
| `SectionTabs.tsx` | `src/components/datasets/dataset-detail-header/SectionTabs.tsx` | Full rewrite: remove ArrowSegment, simple horizontal tabs with bottom-border active state, fix locked cursor |
| `DatasetDetailContentV2.tsx` | `src/components/datasets/DatasetDetailContentV2.tsx` | L499: Show tabs during plan preview. Add Deploy section rendering |
| `LucyDatasetAssistant.tsx` | `src/components/datasets/LucyDatasetAssistant.tsx` | L445: Remove messages.length guard on PlanCard. L463: Add connection timeout. L488: Add collapsed sidebar indicators. L52: Add quick action prompts. L458: Update welcome message |
| `PlanCard.tsx` | `src/components/agent/lucy-agent/plan-render/PlanCard.tsx` | Wrap Approve button in confirmation dialog |
| `PlanPreview.tsx` | `src/components/datasets/PlanPreview.tsx` | Wrap Approve & Execute in confirmation dialog. Progressive timeout in empty state |
| `ActivePlanBanner.tsx` | `src/components/datasets/ActivePlanBanner.tsx` | Add Cancel button during execution |
| `PlanContext.tsx` | `src/contexts/PlanContext.tsx` | Add cancel execution action. Persist execution to IndexedDB |
| `ReadmeDrawer.tsx` | `src/components/datasets/ReadmeDrawer.tsx` | Standardize width to 50vw/700px |
| `EvaluationConfigPanel.tsx` | `src/components/datasets/evaluation-dialog/EvaluationConfigPanel.tsx` | Replace ~30 zinc-* color references with semantic tokens |
| `FinetuneConfigPanel.tsx` | `src/components/finetune/content/FinetuneConfigPanel.tsx` | Replace ~30 zinc-* color references with semantic tokens |
| `DatasetUtilityBar.tsx` | `src/components/datasets/dataset-detail-header/DatasetUtilityBar.tsx` | Type update: may add Deploy section type if not present |
| `execution-state-store.ts` | `src/lib/distri-finetune-tools/steps/execution-state-store.ts` | Add IndexedDB persistence for execution state (refresh resilience) |

---

## Components to DELETE

> **Note:** The MODIFY table above describes Phase B1-B7 (intermediate fixes). With Vision A (Phase B8-B9), `SectionTabs.tsx`, `ReadmeDrawer.tsx`, `DocsDrawer.tsx`, and `DatasetUtilityBar.tsx` are ultimately **deleted** and replaced by `WorkspaceTabManager` + `TabContentRouter`. See [11-implementation-plan.md](./11-implementation-plan.md) for the final state.

| Component | File Path | Reason | Phase |
|-----------|-----------|--------|-------|
| `ArrowSegment.tsx` | `src/components/datasets/dataset-detail-header/ArrowSegment.tsx` | Replaced by simple horizontal tabs (B1), then dynamic tabs (B9) | B1 |
| `SectionTabs.tsx` | `src/components/datasets/dataset-detail-header/SectionTabs.tsx` | Rewritten to simple tabs in B1, then deleted and replaced by `WorkspaceTabManager` in B9 | B9 |
| `ReadmeDrawer.tsx` | `src/components/datasets/ReadmeDrawer.tsx` | Width standardized in B-polish, then deleted — `readme.md` becomes a workspace tab | B9 |
| `DocsDrawer.tsx` | `src/components/datasets/DocsDrawer.tsx` | Deleted — `documents/*` files open as workspace tabs | B9 |
| `DatasetUtilityBar.tsx` | `src/components/datasets/dataset-detail-header/DatasetUtilityBar.tsx` | Shell for tab bar — replaced by `WorkspaceTabManager` | B9 |

---

## Chat Panel Flat Style — Component Changes

> Transform Lucy Chat from bubble style to flat IDE-panel style.
> See [10-chat-panel-redesign.md](./10-chat-panel-redesign.md) for full spec.

### Phase 1: Core Message Layout

| Component | File Path | Changes |
|-----------|-----------|---------|
| `LucyUserMessage.tsx` | `src/components/agent/lucy-agent/messages/LucyUserMessage.tsx` | Remove right-align, remove `UserAvatar`, remove bubble (`bg-muted/40 border rounded-2xl shadow-sm`), left-align with text label "You" |
| `LucyAssistantMessage.tsx` | `src/components/agent/lucy-agent/messages/LucyAssistantMessage.tsx` | Remove bubble wrapper, shrink avatar from `sm` (24px) to `xs` (14px), reduce gap from `gap-2` to `gap-1` |
| `LucyChat.tsx` | `src/components/agent/lucy-agent/LucyChat.tsx` | Reduce spacing: `space-y-4` → `space-y-2`, `px-4 py-4` → `px-3 py-2`. Flatten auto-analyzing indicator from bubble to left-border accent |

### Phase 2: Tool Execution Styling

| Component | File Path | Changes |
|-----------|-----------|---------|
| `LucyToolCallCard.tsx` | `src/components/agent/lucy-agent/LucyToolCallCard.tsx` | Flatten all 3 states (running/completed/error) from card containers to left-border accent rows. Running: `border-l-2 border-theme pl-3 py-1.5`. Completed: `border-l border-border/40 pl-3 py-1`. Error: `border-l-2 border-destructive pl-3 py-1.5` |
| `LucyToolExecutionRenderer.tsx` | `src/components/agent/lucy-agent/LucyToolExecutionRenderer.tsx` | Add left-border grouping: `border-l border-border/40 pl-3 ml-1` |
| `LucyMessageRenderer.tsx` | `src/components/agent/lucy-agent/messages/LucyMessageRenderer.tsx` | Reduce wrapper margins/padding |

### Phase 3: Supporting Components

| Component | File Path | Changes |
|-----------|-----------|---------|
| `LucyAvatar.tsx` | `src/components/agent/lucy-agent/LucyAvatar.tsx` | Add `xs` size variant (14px) for inline role labels |
| `LucyTypingIndicator.tsx` | `src/components/agent/lucy-agent/LucyTypingIndicator.tsx` | Reduce padding from `px-3 py-2` to `px-0 py-1` |
| `LucyStepIndicator.tsx` | `src/components/agent/lucy-agent/LucyStepIndicator.tsx` | Reduce bottom margins: `mb-3` → `mb-1` |
| `LucyPendingMessage.tsx` | `src/components/agent/lucy-agent/LucyPendingMessage.tsx` | Compact layout to match new density |

### Phase 4: Input and Welcome

| Component | File Path | Changes |
|-----------|-----------|---------|
| `LucyChatInput.tsx` | `src/components/agent/lucy-agent/LucyChatInput.tsx` | `rounded-xl` → `rounded-lg`. Remove glow shadow (`focus-within:shadow-[0_0_0_3px_rgba(...)]`). Keep simple `focus-within:border-theme` |
| `LucyWelcome.tsx` | `src/components/agent/lucy-agent/LucyWelcome.tsx` | Remove bubble wrapper (`bg-muted/50 border rounded-2xl ml-10`). Flatten to left-aligned content |
| `lucy-ask-follow-up-styles.ts` | `src/lib/distri-finetune-tools/lucy-ask-follow-up-styles.ts` | Flatten theme to match IDE panel feel |

### Phase 5: Secondary

| Component | File Path | Changes |
|-----------|-----------|---------|
| `LucyToolActions.tsx` | `src/components/agent/lucy-agent/LucyToolActions.tsx` | Tighten button padding for compact fit |
| `LucyMessage.tsx` | `src/components/agent/lucy-agent/LucyMessage.tsx` | Verify/adjust wrapper spacing |

---

## Upstream Changes Needed (@distri/react)

| Component | Change | Priority |
|-----------|--------|----------|
| `MessageRenderer.tsx:202` | Wire retry button onClick handler | P0 |
| `ChatInput.tsx:375-376` | Keep textarea enabled during streaming | P1 |
| `ChatInput.tsx:439` | Expand file upload accept types beyond image/* | P1 |
| `ToolExecutionRenderer.tsx:27-52` | Add toolNameMap prop for extensible friendly names | P1 |
| `Chat.tsx` | Make maxWidth configurable via prop | P2 |
