# Lucy Finetune Dataset — UX Redesign Specification

Synthesized from 3 reviewer reports (UX Flow, Visual & Interaction, Information Architecture) and grounded in the current codebase.

---

## Priority Summary

| Priority | Count | Proposals |
|----------|-------|-----------|
| P0 | 0 | — |
| P1 | 6 | 4.1, 4.2, 5.2, 6.1, 7.2, 8.1 |
| P2 | 2 | 10.5, 10.6 |
| Upstream | 3 | 9.1, 9.2, 9.3 |
| Resolved | 21 | 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 5.1, 5.3, 5.4, 6.2, 7.1, 7.3, 7.4, 7.5, 10.1, 10.2, 10.3, 10.4 |

## Recommended Implementation Order

**Phase 1 — Foundation (P0s):**
1. Proposal 1.3 — Make locked tabs actionable
2. Proposal 2.1 — Add getting-started guidance

**Phase 2 — Core Improvements (P1s):**
3. Proposal 8.1 — Stop auto-switching tabs (quick win, high impact)
4. Proposal 6.1 — Standardize terminology
5. Proposal 3.3 — Context-aware quick actions
6. Proposal 10.1 — Fix download weights discoverability and mechanism
7. Proposal 10.3 — Distinguish "coming soon" from "prerequisites not met" lock state
8. Proposal 4.1 — Structured tool result renderers
9. Proposal 3.1 — Differentiate loading states
10. Proposal 5.4 — Improve completion CTA
11. Proposal 5.2 — Add cancel mechanism for plan execution
12. Proposal 4.2 — Structured plan editor
13. Proposal 7.2 — Harmonize tab paradigms
14. Proposal 3.2 — Collapsed sidebar error indicator
15. Proposal 1.4 — Optional vs required step indicators
16. Proposal 5.1 — Clear button confirmation

**Phase 3 — Polish (P2s):**
17. Proposal 10.2 — Standardize download weights button styling
18. Proposal 10.4 — Fix hardcoded colors in finetune components
19. Proposal 10.5 — Make Deploy tab non-interactive
20. Proposal 10.6 — Update state machine docs for disabled Deploy
21. Proposals 7.3, 7.5 — Visual consistency cleanup
22. Proposals 2.2, 5.3, 6.2 — Minor UX polish
23. Proposal 3.4 — PDF upload in chat (requires upstream)

**Upstream coordination:**
File issues for Proposals 9.1, 9.2, 9.3 in the distri repo.

---

## 1. Pipeline & Step Progression

### Proposal 1.1 — Delete Dead Pipeline Components [RESOLVED]

**Status:** Resolved. Dead components `WorkflowStepIndicator` and `DatasetStepper` have been deleted. `SectionTabs` is confirmed as the sole pipeline representation.

---

### Proposal 1.2 — Replace Deploy Tab with Download Weights in Finetune Tab [RESOLVED]

**Status:** Resolved. Deploy placeholder has been removed as a dead-end. Download weights functionality has been added to the finetune jobs UI. The Deploy tab now shows as a disabled "Coming Soon" indicator via `SectionTabs`.

---

### Proposal 1.3 — Make Locked Finetune Tab Actionable [RESOLVED]

**Status:** Resolved. Locked workflow tabs now show an actionable Popover (not tooltip) with a prerequisite checklist. Each prerequisite shows a checkmark if completed or a clickable link to navigate to the relevant tab. Implemented in `SectionTabs.tsx`.

**Problem:** When the Finetune/Jobs tab is locked (missing data or evaluator), the lock icon tooltip says "Add training data and set up evaluation first" but gives no way to navigate to those tabs. Users must figure out on their own which tab to go to. (UX Flow: P0-3; Info Arch: Finding 2)

**Solution:** Replace the tooltip text with clickable links. When the locked tab is hovered or clicked, show a popover (not just tooltip) with two actionable items:
1. "Add training data" — navigates to Records tab
2. "Set up evaluation" — navigates to Evaluator tab

Each item shows a checkmark if already completed. Only incomplete items are clickable.

**Components to modify:**
- `src/components/datasets/dataset-detail-header/SectionTabs.tsx` — replace tooltip with Popover for locked tabs; add onClick handlers that call `onSectionChange`
- `src/components/datasets/dataset-detail-header/ArrowSegment.tsx` — ensure click events propagate correctly for locked state

**Improved UI:** Clicking a locked "Finetune" tab opens a small popover: "Before you can start fine-tuning: [checkmark] Training data (42 records) — [arrow] Set up evaluation (click to go)". The incomplete item is a clickable link.

**Dependencies:** None.

---

### Proposal 1.4 — Distinguish Optional vs Required Steps Visually [RESOLVED]

**Status:** Resolved. Added `required` flag to TabConfig. Tooltip text now shows "Required ·" or "Optional ·" prefix for pending workflow tabs. ArrowSegment supports dashed border via `isOptional` prop for optional steps (Evaluation). Implemented in `SectionTabs.tsx` and `ArrowSegment.tsx`.

**Problem:** The state machine defines steps as OPTIONAL or REQUIRED, but the UI does not reflect this. Users cannot tell which steps they can skip. (Info Arch: Finding 2)

**Solution:** Add visual indicators to pipeline segments. Required steps get a small asterisk or solid indicator. Optional steps (like categorization, dry run) get a dashed outline or "(optional)" label in their tooltip. The `SectionTabs` arrow segments should use a subtle visual difference (e.g., dashed border for optional steps).

**Components to modify:**
- `src/components/datasets/dataset-detail-header/SectionTabs.tsx` — add `isOptional` prop per tab, adjust styling
- `src/components/datasets/dataset-detail-header/ArrowSegment.tsx` — support dashed variant

**Improved UI:** The "Data" and "Evaluation" segments appear with solid borders/fills. If individual sub-steps are exposed (e.g., in tooltips), optional ones like "Categorize" show "(optional)" text.

**Dependencies:** None (Proposal 1.1 resolved).

---

## 2. Onboarding & Getting Started

### Proposal 2.1 — Add Explicit Getting-Started Guidance on Dataset Detail Page [RESOLVED]

**Status:** Resolved. Enhanced `EmptyRecordsState` with 3-stage pipeline overview (Data → Evaluation → Fine-tune), dual CTAs ("Upload Documents" navigates to docs tab, "Ask Lucy to Get Started" triggers sidebar prompt), and secondary "import existing data" link. Threaded `onDocsClick` and `onImportClick` props through `DatasetMainContent`.

**Problem:** When a user navigates to a dataset without `?autoGeneratePlan=true`, the main content shows an empty records tab. The Lucy sidebar might be collapsed (on screens < 1024px). There is no in-canvas guidance about what to do next. (UX Flow: P0-1)

**Solution:** When a dataset has zero records AND no workflow state AND no proposed plan, show an in-canvas empty state on the Records tab (similar to `PlanEmptyState` but for the whole dataset). This should:
1. Welcome the user and explain the 3 high-level stages (Data — Evaluation — Finetune)
2. Offer two primary CTAs: "Upload documents" (opens docs tab) and "Ask Lucy to get started" (expands sidebar + sends prompt)
3. Show a secondary link: "Or import existing data" (opens import dialog)

**Components to modify:**
- `src/components/datasets/DatasetMainContent.tsx` — add empty state check (records.length === 0 and no workflow)
- Create new: `src/components/datasets/DatasetGettingStartedState.tsx` — the welcome/guidance component
- `src/components/datasets/LucyDatasetAssistant.tsx` — ensure sidebar expands when "Ask Lucy" CTA is clicked

**Improved UI:** A centered card with: heading "Get started with your dataset", brief description of the 3-stage process, two prominent buttons, and a subtle "Import data" link below. This replaces the blank records table when the dataset is truly empty.

**Dependencies:** None.

---

### Proposal 2.2 — Make Transition Screen Duration Dynamic [RESOLVED]

**Status:** Resolved. No-file creation now uses 800ms transition (fast). With-file creation keeps 2.5s to allow document processing to start in background. File uploads already begin processing before the transition screen is shown. Implemented in `empty-dataset-state/index.tsx`.

**Problem:** The transition screen after dataset creation (`EmptyDatasetsState`, line 196-198) has a fixed 2.5s `setTimeout` regardless of whether files were uploaded. Without files, there is nothing to "process" and the delay feels arbitrary. (UX Flow: P2-3)

**Solution:** When `hasFiles` is false, reduce the timeout to 800ms (just enough for a brief animation). When `hasFiles` is true, keep 2.5s or make it event-driven (listen for knowledge source processing completion).

**Components to modify:**
- `src/components/datasets/empty-dataset-state/index.tsx` — adjust setTimeout duration based on `transition.hasFiles`

**Improved UI:** No-file creation: fast transition (< 1s). With-file creation: meaningful delay that matches actual processing.

**Dependencies:** None.

---

## 3. Assistant Sidebar

### Proposal 3.1 — Differentiate Loading States in Sidebar [RESOLVED]

**Status:** Resolved. Three loading states now have distinct visuals: (1) Settings2 gear icon + "Verifying API keys and providers" for config check, (2) Dimmed LucyAvatar + "Preparing the assistant agent" for agent loading, (3) Plug icon + progress bar + "Establishing connection" for connecting. Implemented in `LucyDatasetAssistant.tsx`.

**Problem:** Three loading states in `LucyDatasetAssistant.tsx` (lines 375-416) all look identical: `Loader2` spinner + text. "Checking configuration...", "Loading assistant...", and "Connecting to assistant..." are visually indistinguishable. (Visual: 1.1)

**Solution:** Create a unified `LucySidebarLoadingState` component with distinct visual stages:
1. **Configuration check**: Show a settings/gear icon + "Checking configuration..."
2. **Agent loading**: Show the Lucy avatar (dimmed) + "Loading Lucy..."
3. **Connecting**: Show a connection/link icon + "Connecting..." with a subtle progress bar

Each state should have a different icon and optionally a brief helper text explaining what's happening.

**Components to modify:**
- `src/components/datasets/LucyDatasetAssistant.tsx` — replace the three identical loading blocks with `LucySidebarLoadingState` stages
- Create new: `src/components/datasets/LucySidebarLoadingState.tsx`

**Improved UI:** Each loading phase has a distinct icon and message, so users understand what's happening and can diagnose issues (e.g., "Checking configuration..." suggests API key problems; "Connecting..." suggests network issues).

**Dependencies:** None.

---

### Proposal 3.2 — Show Error State on Collapsed Sidebar When Provider Unconfigured [RESOLVED]

**Status:** Resolved. Added a red dot badge (`bg-destructive` with border) overlaid on the collapsed Lucy avatar when `!isOpenAIConfigured && !providersLoading`. Clicking expands to reveal the provider configuration prompt. Implemented in `LucyDatasetAssistant.tsx`.

**Problem:** When the OpenAI provider is not configured and the sidebar is collapsed, there is no visual indicator that something is wrong. The collapsed sidebar just shows the Lucy avatar and expand button. (Visual: 1.3, 1.2)

**Solution:** Add a red dot / warning badge on the collapsed Lucy avatar when `!isOpenAIConfigured`. When expanded, the existing `LucyProviderCheck` component already handles this.

**Components to modify:**
- `src/components/datasets/LucyDatasetAssistant.tsx` — add a badge overlay on the collapsed avatar button when `!isOpenAIConfigured && !providersLoading`

**Improved UI:** Collapsed sidebar shows a small red dot on the Lucy avatar, signaling that configuration is needed. Clicking expands to reveal the full provider configuration prompt.

**Dependencies:** None.

---

### Proposal 3.3 — Make Quick Actions Context-Aware [RESOLVED]

**Status:** Resolved. Replaced static `FINETUNE_QUICK_ACTIONS` with `getContextualQuickActions()` function that filters based on record count, evaluator status, and jobs count. 4 stages: no records → setup + generate; has records no evaluator → analyze + configure grader; has records + evaluator → dry run + start training; has jobs → check progress. Implemented in `LucyDatasetAssistant.tsx`.

**Problem:** The 6 `FINETUNE_QUICK_ACTIONS` are static regardless of workflow state. A user who hasn't added any data sees "Check data variety" and "Test before training" — irrelevant at that stage. (UX Flow: P1-7; Info Arch: Finding 9)

**Solution:** Filter/reorder quick actions based on current workflow state. Introduce a function `getContextualQuickActions(workflow, recordCount, hasEvaluator)` that returns only relevant actions:
- **No records**: Show "Start training setup", "Create more training examples"
- **Has records, no evaluator**: Show "Check data variety", "Set up quality scoring", "Create more training examples"
- **Has records + evaluator**: Show "Test before training", "Check progress"
- **Post dry-run**: Show "Check progress", "Start training setup" (renamed to "Start training")

**Components to modify:**
- `src/components/datasets/LucyDatasetAssistant.tsx` — replace static `FINETUNE_QUICK_ACTIONS` with dynamic filtering based on workflow/records/evaluator state
- Potentially `src/components/agent/lucy-agent/LucyWelcome.tsx` if it needs to accept dynamic actions

**Improved UI:** Quick action buttons change as the user progresses. Early stage shows "Start training setup" and "Upload documents". Later stages show "Run evaluation" and "Start training". Users always see relevant next steps.

**Dependencies:** None.

---

### Proposal 3.4 — Support PDF/Document Uploads in Chat Input [RESOLVED — Upstream Needed]

**Status:** Partially resolved. The `handleBeforeSendMessage` in this repo already handles file processing (converts to knowledge sources). The bottleneck is `@distri/react` `ChatInput.tsx:439` which hardcodes `accept="image/*"`. Upstream change needed: expand the `accept` attribute to include `.pdf,.csv,.txt,.md,.json,.doc,.docx`. No changes needed in this repo.

**Problem:** The chat input currently only accepts image files. Users cannot drag-and-drop PDFs or documents into the chat, even though the system processes them as knowledge sources. (UX Flow: P1-6)

**Solution:** This requires changes to the `@distri/react` `ChatInput` component to accept additional MIME types. In this repo, the `handleBeforeSendMessage` already handles file parts and converts them to knowledge sources — the bottleneck is the chat input's file picker configuration.

**Components to modify:**
- `@distri/react` — `ChatInput.tsx`: expand accepted file types (upstream change, NOT in this repo)
- `src/components/datasets/LucyDatasetAssistant.tsx` — the `handleBeforeSendMessage` already handles file processing, no changes needed here

**Improved UI:** Users can drag PDFs, CSVs, and text files directly into the chat. Files appear as attachment chips before sending. After sending, they are processed as knowledge sources with a toast notification.

**Dependencies:** Requires upstream `@distri/react` changes.

---

## 4. Data Display & Tool Results

### Proposal 4.1 — Render Tool Results as Structured Cards Instead of Raw JSON (P1)

**Problem:** Tool results from the agent show raw JSON output in the chat. Non-technical users see developer-formatted data that is hard to interpret. (Info Arch: Finding 7)

**Solution:** Expand the `lucyToolRenderers` registry to include structured renderers for the most common tool results:
- `get_dataset_stats` — card with record count, topic distribution bar chart, coverage score
- `analyze_coverage` — visual coverage heatmap or distribution chart
- `get_workflow_status` — mini pipeline indicator showing current state
- `propose_setup_plan` — already handled (switches to Plan tab)

For tools without custom renderers, the `LucyDefaultToolRenderer` should format key-value pairs as a clean table rather than raw JSON.

**Components to modify:**
- `src/components/agent/lucy-agent/` — add new tool renderers in the `lucyToolRenderers` map
- `src/components/agent/lucy-agent/LucyDefaultToolRenderer.tsx` — improve fallback rendering from raw JSON to formatted key-value table
- `src/components/datasets/LucyDatasetAssistant.tsx` — no changes (renderers auto-register)

**Improved UI:** When Lucy calls `get_dataset_stats`, the chat shows a compact card: "42 records across 8 topics | Coverage: Good (78%)" with a small horizontal bar. Raw JSON is never shown to end users.

**Dependencies:** None.

---

### Proposal 4.2 — Present Setup Plan as Structured Form Instead of Raw Markdown (P1)

**Problem:** The setup plan is rendered as raw markdown text in `SetupPlanEditor`. Users must read through dense text to understand and modify the plan. Editing requires understanding markdown syntax. (Info Arch: Finding 4)

**Solution:** Transform `SetupPlanEditor` to render the plan as a structured form with collapsible sections:
- **Topics**: editable list with add/remove/reorder
- **Generation Strategy**: dropdowns for approach, sliders for quantity
- **Evaluation Criteria**: editable rubric items
- **Each section**: toggle to enable/disable, brief description

The raw markdown view can remain as a secondary "Advanced" toggle for power users.

**Components to modify:**
- `src/components/datasets/plan-section/SetupPlanEditor.tsx` — add structured form view alongside existing markdown view
- Type definitions in `src/lib/distri-finetune-tools/steps/propose-setup-plan.ts` — ensure SetupPlan type supports structured editing

**Improved UI:** The plan appears as a form with clear sections: "Topics (5 categories)" with an expandable list, "Data Generation (target: 200 examples)" with a slider, "Evaluation (3 criteria)" with editable items. An "Edit as Markdown" toggle reveals the raw view.

**Dependencies:** None.

---

## 5. Error Handling & Feedback

### Proposal 5.1 — Add Confirmation Dialog to PlanExecutedView Clear Button [RESOLVED]

**Status:** Resolved. Implemented Option B (collapse behavior). Clicking the header now collapses the plan to a single-line summary with chevron + "Plan Executed Successfully". Click to re-expand. "Dismiss" button permanently removes it (was "Clear"). Added `useState` for collapse state, `ChevronDown`/`ChevronRight` icons. Implemented in `PlanExecutedView.tsx`.

**Problem:** The "Clear" button in `PlanExecutedView.tsx` (line 34-38) has no confirmation. Clicking it immediately removes the executed plan from view with no way to recover it. (Visual: 9.1)

**Solution:** Replace instant clear with a collapse behavior:
- Option A: Add a confirmation dialog ("Are you sure? The executed plan will be removed from view.")
- Option B (preferred): Show the plan in a collapsed/minimized state with "Show plan" to re-expand.

**Components to modify:**
- `src/components/datasets/plan-section/PlanExecutedView.tsx` — add confirmation or collapse behavior to the Clear button

**Improved UI:** Clicking "Clear" either shows a small inline confirmation ("Clear plan? Undo") or collapses the plan to a single-line summary that can be re-expanded.

**Dependencies:** None.

---

### Proposal 5.2 — Add Cancel/Abort Mechanism for Plan Execution (P1)

**Problem:** Once a setup plan execution starts, there is no way to stop it. Users are locked into watching the progress card with no abort option. (UX Flow: P1-5)

**Solution:** Add a "Cancel" button to the `ExecutionProgressCard` that emits a cancellation event. The execution engine should listen for this event and gracefully stop after the current step completes (not mid-step).

**Components to modify:**
- `src/components/datasets/plan-section/ExecutionProgressCard.tsx` — add Cancel button during execution (not after completion)
- `src/lib/distri-finetune-tools/steps/execute-setup-plan.ts` — add cancellation event listener
- Event system: add `vllora_setup_plan_cancel` event

**Improved UI:** During execution, a subtle "Cancel" link appears below the progress bar. Clicking it shows "Cancelling after current step..." and the execution stops cleanly after the in-progress step finishes.

**Dependencies:** None.

---

### Proposal 5.3 — Standardize Error Message Placement [RESOLVED]

**Status:** Resolved via audit. The codebase already follows the proposed hierarchy: user-action errors use `toast.error()` (Sonner), tool/agent errors render inline with destructive styles, validation errors appear inline next to fields. Pattern is consistent across the datasets components. No new components needed.

**Problem:** Errors appear in different locations: some in the sidebar chat, some as toasts, some inline in the canvas. There is no consistent pattern. (Info Arch: Finding 5)

**Solution:** Establish a clear error hierarchy:
1. **User-action errors** (failed upload, failed save) — toast notification (Sonner)
2. **Agent/tool errors** (tool execution failed) — inline in chat with red border
3. **System errors** (connection lost, IndexedDB failure) — persistent banner at top of sidebar
4. **Validation errors** (missing fields, invalid config) — inline next to the field

Document this in a shared pattern and audit existing error handling to conform.

**Components to modify:**
- Multiple components across `src/components/datasets/` — audit and standardize
- `src/components/agent/lucy-agent/` — ensure tool errors render inline in chat
- Consider creating `src/components/datasets/ErrorBanner.tsx` for persistent system errors

**Improved UI:** Users always know where to look for errors. Action errors pop up as toasts. Tool errors appear in the chat flow. System errors show a dismissible banner.

**Dependencies:** None.

---

### Proposal 5.4 — Improve Completion CTA After Plan Execution [RESOLVED]

**Status:** Resolved. Replaced muted completion footer with a themed success card: checkmark circle, "Setup Complete" heading, "Your dataset is ready for fine-tuning" description, primary "Start Fine-tuning" button (themed), and secondary "Review Data" button. Implemented in `ExecutionProgressCard.tsx`.

**Problem:** After completing all 5 execution steps, the completion footer in `ExecutionProgressCard` is understated: a small muted box with "Ready for fine-tuning" and a ghost "Go to Jobs" button. This is anticlimactic after a multi-step process. (Visual: 8.2)

**Solution:** Replace the muted completion footer with a celebratory but tasteful completion state:
- Success icon/animation (brief confetti or checkmark animation)
- "Setup complete! Your dataset is ready for fine-tuning." in prominent text
- Primary CTA button: "Start Fine-tuning" (not ghost variant)
- Secondary: "Review data first" — navigates to Records tab

**Components to modify:**
- `src/components/datasets/plan-section/ExecutionProgressCard.tsx` — redesign the completion footer (lines 208-225)

**Improved UI:** After execution completes, the card transitions to a success state with a green checkmark, clear "Setup Complete" heading, and a prominent blue "Start Fine-tuning" button. The completion state feels like an achievement.

**Dependencies:** None.

---

## 6. Terminology & Labeling

### Proposal 6.1 — Standardize Terminology Across the Application (P1)

**Problem:** Multiple terms used for the same concepts throughout the codebase:
- "Finetune"/"Fine-tune"/"Fine-Tuning" (3 spellings)
- "Records"/"Data"/"Training Data"/"Training Examples" (4 terms)
- "Evaluation"/"Evaluator"/"Grader"/"Quality Scoring" (4 terms)
- "Reference Docs"/"Knowledge Sources"/"Documents" (3 terms)
- "Dry Run" is jargon that non-technical users won't understand
(UX Flow: Terminology Issues section)

**Solution:** Define a canonical terminology map and apply it:

| Canonical (user-facing) | Alternatives to replace | Developer/DB context |
|---|---|---|
| Fine-tune (verb), Fine-tuning (noun) | Finetune, Fine-Tuning | finetune (code only) |
| Training data | Records, Data, Training Examples | records (DB/code) |
| Quality scoring | Evaluation, Evaluator, Grader | grader (code) |
| Reference documents | Knowledge Sources, Documents | knowledge_sources (code) |
| Validation check | Dry Run | dry_run (code) |
| Summary | Overview | readme (code) |

**Components to modify:**
- `src/components/datasets/dataset-detail-header/SectionTabs.tsx` — update DOCUMENTATION_TABS labels
- `src/components/datasets/LucyDatasetAssistant.tsx` — update quick action labels
- Multiple tooltip texts and placeholder strings across `src/components/datasets/`
- Agent prompt: `gateway/agents/finetune/vllora-finetune-agent.md` — ensure agent uses same terminology

**Improved UI:** Consistent language everywhere. Users never see "grader" in one place and "quality scoring" in another.

**Dependencies:** None (Proposal 1.1 resolved, DatasetStepper no longer exists).

---

### Proposal 6.2 — Replace "Beta" Badge with Contextual Information [RESOLVED]

**Status:** Resolved. Wrapped the Beta badge in a Tooltip with `cursor-help`. Hovering shows: "Lucy is in beta. AI-generated content should be reviewed for accuracy." Implemented in `LucyDatasetAssistant.tsx`.

**Problem:** The "Beta" badge on the Lucy sidebar header is prominent but provides no useful information. Users see it but don't know what it implies. (UX Flow: P2-2)

**Solution:** Add a tooltip to the badge explaining what "Beta" means ("Lucy is in beta. Responses may not always be accurate. Please review generated content.").

**Components to modify:**
- `src/components/datasets/LucyDatasetAssistant.tsx` — wrap the Beta badge in a Tooltip with explanatory text (around line 470)

**Improved UI:** Hovering "Beta" shows: "Lucy is in beta. AI-generated content should be reviewed for accuracy."

**Dependencies:** None.

---

## 7. Visual Consistency

### Proposal 7.1 — Replace Hardcoded Dark-Mode Colors with Theme Tokens [RESOLVED]

**Status:** Partially resolved. The main offender `WorkflowStepIndicator.tsx` has been deleted (dead code cleanup from Proposal 1.1). The active component `SectionTabs.tsx` uses proper theme tokens. Remaining hardcoded colors in finetune components are tracked in new Proposal 10.4.

---

### Proposal 7.2 — Unify Two Visual Paradigms in Tab Bar (P1)

**Problem:** The SectionTabs component uses two different visual paradigms on the same bar: arrow segments (SVG clip-path based) for workflow tabs and rounded buttons for documentation tabs. This inconsistency creates visual discord. (Visual: 10.1)

**Solution (recommended):** Keep the two groups visually distinct (they represent different concepts) but harmonize them. Make documentation tabs pill-shaped instead of square-ish rounded. Ensure the border/separator between groups uses a consistent style. Add a subtle group label ("Workflow" | "Resources").

**Components to modify:**
- `src/components/datasets/dataset-detail-header/SectionTabs.tsx` — harmonize the two tab groups with consistent sizing, spacing, and visual weight

**Improved UI:** The tab bar clearly shows two groups: "Workflow: Data > Evaluation > Finetune" (arrow segments) and "Resources: Docs | Plan | Summary" (pills), separated by a thin divider with consistent sizing.

**Dependencies:** None (Proposal 1.1 resolved).

---

### Proposal 7.3 — Standardize Loading/Spinner Patterns [RESOLVED]

**Status:** Resolved. Created shared `LoadingIndicator` component (`src/components/ui/LoadingIndicator.tsx`) with three variants: `inline` (spinner + text), `section` (centered with message/submessage), `progress` (indeterminate progress bar). Added `loading-progress` keyframe to `tailwind.config.js`. Refactored: `PlanLoadingState.tsx` (removed inline `<style>` + `@keyframes`, now uses `progress` variant), `LucyDatasetAssistant.tsx` (three loading states use `section`/`progress` variants), `DatasetDetailContentV2.tsx` (page loading uses `section` variant), `DialogStates.tsx` (`LoadingState` now delegates to `LoadingIndicator`), `DatasetsGrid.tsx` (grid loading uses `section` variant).

---

### Proposal 7.4 — Tone Down AlertTriangle Pulse Animation [RESOLVED]

**Status:** Resolved. `DatasetStepper.tsx` has been deleted as part of dead code cleanup (Proposal 1.1). The pulsing AlertTriangle no longer exists in the codebase.

---

### Proposal 7.5 — Improve Empty State Consistency [RESOLVED]

**Status:** Resolved. Created shared `EmptyStateTemplate.tsx` with props: `icon`, `heading`, `description`, `action?`, `helperText?`, `className?`. Refactored `PlanEmptyState`, `ReadmeEmptyState`, and `DatasetsEmptyState` to use the template. All now share consistent layout: themed gradient icon (14×14 rounded-2xl), heading (text-lg), description (text-sm muted), action slot, and optional helper text. Inline empty states (e.g., FinetuneJobsPanel) left unchanged as they serve a different contextual purpose.

---

## 8. Plan Section Interactions

### Proposal 8.1 — Stop Auto-Switching Tabs Without User Consent (P1)

**Problem:** Events like `vllora_setup_plan_generating`, `vllora_switch_tab`, and persisted plan detection auto-switch the active tab. This is disorienting when users are actively working in another tab. (UX Flow: P1-3; Info Arch: Finding 3)

**Solution:** Replace auto-switching with non-intrusive notifications:
1. When plan generation starts: add a pulsing dot to the "Plan" tab (already partially done via `hasPlanActivity`) but do NOT switch tabs
2. When plan is proposed: show a toast "Setup plan ready — click to review" with a button that navigates to Plan tab
3. When execution switches context: use a toast notification instead of force-switching

Remove the `setActiveSection("plan")` calls from event handlers in `DatasetDetailContentV2.tsx` (lines 176, 234).

**Components to modify:**
- `src/components/datasets/DatasetDetailContentV2.tsx` — remove auto-switch logic from handlePlanGenerating and checkPersistedPlan; replace with toast + badge
- `src/components/datasets/plan-section/PlanSection.tsx` — ensure it doesn't force tab changes

**Improved UI:** Users stay on their current tab. A pulsing dot on the Plan tab and a toast notification alert them that something needs attention. They switch when ready.

**Dependencies:** None.

---

## 9. Upstream Changes (@distri/react — for tracking only)

These issues require changes in the distri repo, NOT in this repo. Listed here for upstream coordination.

### Proposal 9.1 — Fix Non-Functional Retry Button (P1, upstream)

**Problem:** `MessageRenderer.tsx:202` has a Retry button with no `onClick` handler. (Visual: 11.1)

**Repo:** `@distri/react` at `/Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/components/renderers/MessageRenderer.tsx`

---

### Proposal 9.2 — Replace Hardcoded Colors in ChatInput and Tool Results (P1, upstream)

**Problem:** ChatInput uses `bg-[#0d0d0d]` (hardcoded dark), tool completion uses hardcoded `text-green-600`, pending messages use hardcoded `border-yellow-400`. These fight the host theme. (Visual: 11.2, 12.1, 13.1)

**Repo:** `@distri/react` — `ChatInput.tsx`, `ToolExecutionRenderer.tsx`, `Chat.tsx`

---

### Proposal 9.3 — Add Agent Badge Differentiation (P2, upstream)

**Problem:** No visual differentiation for agent identity badges when sub-agents hand off. All badges use the same `bg-primary/10 text-primary` style. (Visual: 14.1)

**Repo:** `@distri/react` — `StepBasedRenderer.tsx`

---

## 10. Finetune Jobs UI

### Proposal 10.1 — Fix Download Weights Discoverability and Mechanism [RESOLVED]

**Status:** Resolved. Download button is now always visible (removed `opacity-0 group-hover:opacity-100` from table row actions). All 3 download locations (`FinetuneJobTableRow`, `FinetuneJobDetailsSection`, `FinetuneJobsPanel`) now use `triggerFileDownload()` helper (anchor element with `download` attribute) instead of `window.open()`. Helper added to `src/components/finetune/content/utils.ts`.

---

### Proposal 10.2 — Standardize Download Weights Button Styling [RESOLVED]

**Status:** Resolved. All 3 download locations now use consistent styling: `outline` variant, `h-4 w-4` icon size, "Download Weights" label. `FinetuneJobTableRow` changed from `ghost`/`h-3.5`/"Weights" to `outline`/`h-4`/"Download Weights". `FinetuneJobsPanel` icon size updated from `h-3.5` to `h-4` and label from "Download Trained Weights" to "Download Weights". `FinetuneJobDetailsSection` label shortened to "Download Weights".

---

### Proposal 10.3 — Distinguish "Coming Soon" from "Prerequisites Not Met" Lock State [RESOLVED]

**Status:** Resolved. Added `"comingSoon"` as a distinct `ArrowSegmentStatus` in `ArrowSegment.tsx`. Coming-soon tabs now have: more faded background (`hsl(var(--muted) / 0.3)`), more muted text (`0.35` opacity), dashed border, `cursor-default` (non-interactive), and a Clock icon instead of Lock. In `SectionTabs.tsx`, coming-soon tabs now use `"comingSoon"` status instead of `"locked"`. Users can visually distinguish "not yet built" (Clock + dashed + faded) from "prerequisites needed" (Lock + popover + interactive).

---

### Proposal 10.4 — Fix Hardcoded Colors in Finetune Components [RESOLVED]

**Status:** Resolved. Replaced all hardcoded colors with opacity-based pattern matching `FinetuneJobStatusBadge.tsx`: `text-green-600` → `text-green-500` (in `FinetuneJobDetailsSection`, `FinetuneJobsPanel`), `bg-red-50 text-red-800` → `bg-red-500/15 text-red-500` (error message in `FinetuneJobsPanel`), `text-red-600 hover:bg-red-100` → `text-red-500 hover:bg-red-500/10` (cancel button in `FinetuneJobTableRow`), and panel error state `bg-red-50 text-red-600` → `bg-red-500/15 text-red-500`.

---

### Proposal 10.5 — Make Deploy Tab Non-Interactive (P2)

**Problem:** The Deploy tab has a no-op click handler but the cursor still shows `pointer` and hover effects still apply. Users can click it and nothing happens, which feels broken. (UX Flow: NEW-4; Visual: NEW-3)

**Solution:** For tabs marked as `comingSoon`:
- Set `cursor-not-allowed` (or `cursor-default`)
- Suppress hover highlight styles
- Optionally show a tooltip on hover: "Deployment is coming soon"

**Components to modify:**
- `src/components/datasets/dataset-detail-header/SectionTabs.tsx` — suppress interactivity for comingSoon tabs
- `src/components/datasets/dataset-detail-header/ArrowSegment.tsx` — add cursor and hover style overrides

**Improved UI:** Hovering Deploy tab shows `cursor-not-allowed` and no highlight. A tooltip says "Coming Soon". Users understand it's not clickable.

**Dependencies:** Pairs with Proposal 10.3.

---

### Proposal 10.6 — Update State Machine Docs for Disabled Deploy (P2)

**Problem:** `state-machine.md` still lists deployment as Step 7 and types still include `DeploymentResult`, but the UI has disabled the Deploy tab. The docs don't reflect the current state of the feature. (Info Arch: NEW)

**Solution:** Add a note in `state-machine.md` that the deployment step is UI-disabled pending implementation. Mark the deployment step section with a "NOT YET IMPLEMENTED" indicator. Do not remove it entirely since it represents the planned architecture.

**Components to modify:**
- `docs/features/lucy-finetune-dataset/state-machine.md` — add "NOT YET IMPLEMENTED" note to deployment step

**Improved UI:** N/A (documentation-only change).

**Dependencies:** None.

---

## Appendix: Reviewer Reports Summary

### UX Flow Analyst
- Mapped 8+ screens/states from first visit through completion
- Documented Full Pipeline and Quick Pipeline paths
- 3 P0, 7 P1, 5 P2 findings (original)
- Re-review: 4 resolved, 20 still valid, 5 new issues found
- 4 dead ends, 5 missing feedback areas, 7 terminology inconsistencies

### Visual & Interaction Reviewer
- Reviewed 15 components across this repo and @distri/react
- 6 P1, 12 P2 findings in this repo (original)
- Re-review: 4 resolved, remaining confirmed, 4 new issues found
- 5 findings requiring upstream @distri/react changes
- Identified 2 positive patterns worth replicating (transition screen, ExecutionProgressCard)

### Information Architecture Reviewer
- 1 P0, 7 P1, 2 P2 findings (original)
- Re-review: 2 resolved, remaining confirmed, 3 new issues found
- Cognitive load ratings: 4 HIGH, 4 MEDIUM, 2 LOW
- Key insight: pipeline unification (#1) and interaction model clarity (#10) compound each other

---

## Revision History

### Re-review Update (2026-02-11)

**Resolved proposals (4):**
- **1.1** — Dead components `WorkflowStepIndicator` and `DatasetStepper` deleted
- **1.2** — Deploy placeholder removed; download weights added to finetune jobs UI
- **7.1** — Partially resolved: main offender `WorkflowStepIndicator.tsx` deleted; `SectionTabs` uses proper tokens; remaining hardcoded colors tracked in new Proposal 10.4
- **7.4** — Resolved (moot): `DatasetStepper.tsx` deleted, pulsing AlertTriangle no longer exists

**New proposals added (6):**
- **10.1** (P1) — Fix download weights discoverability (hover-only) and mechanism (`window.open()`)
- **10.2** (P2) — Standardize download weights button styling across 3 locations
- **10.3** (P1) — Distinguish "coming soon" from "prerequisites not met" lock state
- **10.4** (P2) — Fix hardcoded colors in finetune components (dark mode support)
- **10.5** (P2) — Make Deploy tab non-interactive (cursor, hover suppression)
- **10.6** (P2) — Update state-machine.md for disabled Deploy step

**Updated proposals:**
- **1.4** — Removed dependency on 1.1 (now resolved)
- **5.1** — Added re-review confirmation note
- **5.4** — Added re-review confirmation note for still-understated CTA
- **6.1** — Removed DatasetStepper from components list (deleted)
- **6.2** — Added re-review note confirming tooltip still missing
- **7.2** — Removed dependency on 1.1 (now resolved)
- **7.3** — Added re-review confirmation for PlanLoadingState inline styles
- **7.5** — Reduced scope (Deploy placeholder gone), updated description

**Priority summary changes:**
- P0: 3 → 2 (1.2 resolved)
- P1: 13 → 14 (7.1 resolved, +10.1 and +10.3 added)
- P2: 7 → 10 (7.4 resolved, +10.2, +10.4, +10.5, +10.6 added)
- Resolved: 0 → 4

### Implementation Update (2026-02-11)

**Newly resolved proposals (11):**
- **1.3** — Locked tabs now show actionable Popover with prerequisite checklist and navigation links
- **1.4** — Added `required`/optional distinction: tooltip prefixes ("Required ·" / "Optional ·"), dashed border for optional steps in ArrowSegment
- **2.1** — Enhanced EmptyRecordsState with 3-stage pipeline overview, dual CTAs (Upload Docs + Ask Lucy), and import link
- **2.2** — Transition screen: 800ms for no-file creation, 2.5s for file uploads (processing starts before transition)
- **3.1** — Three distinct loading states: gear icon (config), dimmed avatar (agent loading), plug + progress bar (connecting)
- **3.2** — Red dot badge on collapsed Lucy avatar when provider unconfigured
- **3.3** — Dynamic quick actions via `getContextualQuickActions()` based on records, evaluator, and jobs state
- **3.4** — Confirmed upstream change needed in @distri/react ChatInput.tsx (`accept` attribute). No changes in this repo.
- **5.1** — PlanExecutedView now collapses to single-line summary instead of immediate clear. "Dismiss" for permanent removal.
- **5.4** — Prominent completion CTA: themed success card with checkmark, "Setup Complete" heading, primary "Start Fine-tuning" button
- **6.2** — Beta badge wrapped in Tooltip with explanatory text

**Audited (no code changes needed):**
- **5.3** — Error handling already follows the proposed hierarchy (toast for user actions, inline for tool errors, inline for validation)

**Priority summary changes:**
- P0: 2 → 0 (1.3, 2.1 resolved)
- P1: 14 → 8 (1.4, 3.1, 3.2, 3.3, 5.1, 5.4 resolved)
- P2: 10 → 6 (2.2, 3.4, 5.3, 6.2 resolved)
- Resolved: 4 → 15

### Consistency Standardization Update (2026-02-11)

**Newly resolved proposals (2):**
- **7.5** — Created shared `EmptyStateTemplate.tsx` component. Refactored `PlanEmptyState`, `ReadmeEmptyState`, `DatasetsEmptyState` to use it. All empty states now share consistent layout with themed gradient icon, heading, description, optional CTA, and helper text.
- **7.3** — Created shared `LoadingIndicator` component (`src/components/ui/LoadingIndicator.tsx`) with `inline`, `section`, and `progress` variants. Added `loading-progress` keyframe to Tailwind config. Refactored `PlanLoadingState`, `LucyDatasetAssistant`, `DatasetDetailContentV2`, `DialogStates`, and `DatasetsGrid` to use it. Eliminated inline `<style>` + `@keyframes` from PlanLoadingState.

**Priority summary changes:**
- P2: 6 → 4 (7.3, 7.5 resolved)
- Resolved: 15 → 17

### Finetune Components Polish Update (2026-02-11)

**Newly resolved proposals (4):**
- **10.1** — Download button always visible for succeeded jobs (removed hover-only). All 3 download locations use `triggerFileDownload()` (anchor + `download` attribute) instead of `window.open()`.
- **10.2** — Standardized all download buttons: `outline` variant, `h-4 w-4` icon, "Download Weights" label across `FinetuneJobTableRow`, `FinetuneJobDetailsSection`, `FinetuneJobsPanel`.
- **10.3** — Added `"comingSoon"` as distinct `ArrowSegmentStatus`. Deploy tab now shows Clock icon (not Lock), dashed border, more faded styling, and `cursor-default`. Visually distinct from "prerequisites not met" Lock + popover.
- **10.4** — Fixed all hardcoded colors to opacity-based pattern: `text-green-600` → `text-green-500`, `bg-red-50 text-red-800` → `bg-red-500/15 text-red-500`, `text-red-600` → `text-red-500`.

**Priority summary changes:**
- P1: 8 → 6 (10.1, 10.3 resolved)
- P2: 4 → 2 (10.2, 10.4 resolved)
- Resolved: 17 → 21

### Comprehensive UX Redesign Review (2026-02-11)

Full 4-agent team review: UX Flow Analyst, Visual & Interaction Reviewer, Information Architecture Reviewer, Redesign Proposer. Reviewed all source files across frontend and upstream @distri/react.

**New proposals added (16):**

---

## 11. Documentation Tabs Redesign (USER PRIORITY)

### Proposal 11.1 — Convert Documentation Tabs to Icon-Only Buttons (P0)

**Problem:** The documentation tabs in `SectionTabs.tsx` (lines 263-323) show "Reference Docs" (`FolderOpen`), "Setup Plan" (`Wand2`), "Overview" (`FileText`) with full text labels + badges. Issues:
- **Too much text:** "Reference Docs" (14 chars), "Setup Plan" (10 chars), "Overview" (8 chars) — verbose for secondary navigation
- **~350px horizontal footprint** for 3 secondary tabs, consuming ~40% of available bar while the 4-tab workflow stepper gets ~60%
- **Same `text-sm font-medium`** as workflow arrow labels — no visual subordination
- **Weak `border-l border-border` separator** (line 264) — 1px line insufficient to communicate categorical difference
- **Docs count badge** (`lines 289-294`) uses vivid `bg-[rgba(var(--theme-500),0.15)]` — more prominent than workflow tabs' own `bg-background/50` badges
- **Plan activity dot** (lines 297-302) is 8x8 — simultaneously too small to notice and too animated to ignore

**Space Analysis:**

| Element | Width |
|---------|-------|
| "Reference Docs" (icon + text + count) | ~110px |
| "Setup Plan" (icon + text + dot) | ~100px |
| "Overview" (icon + text) | ~80px |
| Container overhead (gap, padding, border) | ~40px |
| **Total** | **~330-350px** |

**Solution:** Convert to icon-only buttons with tooltips. Reduces footprint from ~350px to ~120px:

```
Current:  [Data →] [Eval →] [Finetune →] [Deploy]  |  [Reference Docs 3] [Setup Plan ●] [Overview]
Proposed: [Data →] [Eval →] [Finetune →] [Deploy]     [📁] [✨] [📄]
                                                         ↑ tooltips on hover
```

Implementation:
- Remove `<span>{tab.label}</span>` from documentation tabs (line 287)
- Change button sizing from `px-3 py-1.5` to `p-2` with `w-8 h-8`
- Wrap ALL doc tabs in `<Tooltip>` (currently only processing tabs have tooltips, lines 306-318)
- Badge becomes corner overlay: `absolute -top-0.5 -right-0.5` dot
- Active state: `bg-muted text-foreground` on icon button
- Strengthen separator: replace `border-l border-border ml-4 pl-4` with wider gap `ml-6 pl-6` or `border-l-2 border-muted-foreground/20`

**Reviewer consensus:** 2/3 prefer all icon-only (Option A), 1/3 prefers hybrid keeping Plan text visible (Option C). Recommendation: Option A for consistency.

**Components to modify:**
- `src/components/datasets/dataset-detail-header/SectionTabs.tsx` (lines 263-323)

**Priority:** P0 | **Effort:** S

---

## 12. Additional Onboarding & Flow Proposals

### Proposal 12.1 — Empty Dataset Without Files Has No Clear Path (P0)

**Problem:** `empty-dataset-state/index.tsx:201-208` — When a user enters an objective but does NOT upload files, they land on dataset detail with empty records, no docs, no plan. No actionable guidance beyond waiting for Lucy. If Lucy is slow to connect, user stares at empty screen.

**Solution:** Add explicit guided empty state in records tab with clear CTAs: "Upload documents", "Import records", "Let Lucy generate sample data". Reduce dependency on Lucy chat being immediately available.

**Components to modify:**
- `src/components/datasets/empty-dataset-state/index.tsx`
- `src/components/datasets/DatasetMainContent.tsx` (empty records state)

**Priority:** P0 | **Effort:** M

---

### Proposal 12.2 — Auto-Plan Generation Fragile 2-Second Timing (P0)

**Problem:** `DatasetDetailContentV2.tsx:263` — The `autoGeneratePlan` flow waits a hardcoded 2 seconds before triggering Lucy. If documents take longer to process (large PDFs), plan generates without proper knowledge source data.

**Solution:** Replace fixed delay with event-driven trigger: poll knowledge sources processing status, trigger plan only when all sources are done. Show progress indicator in Plan tab during wait.

**Components to modify:**
- `src/components/datasets/DatasetDetailContentV2.tsx`

**Priority:** P0 | **Effort:** M

---

### Proposal 12.3 — Plan Tab Empty State Is a Dead End (P0)

**Problem:** `plan-section/PlanSection.tsx:312` — PlanEmptyState shows "Generate Setup Plan" button. If Lucy is loading/not connected, clicking does nothing visible. No error feedback, no loading state.

**Solution:** Disable button with tooltip ("Lucy is connecting...") when agent not connected. Show loading spinner after click. Add plan explainer text: "A Setup Plan analyzes your documents and creates a step-by-step training configuration."

**Components to modify:**
- `src/components/datasets/plan-section/PlanEmptyState.tsx`
- `src/components/datasets/plan-section/PlanLoadingState.tsx`
- `src/components/datasets/plan-section/PlanSection.tsx`

**Priority:** P0 | **Effort:** S

---

### Proposal 12.4 — Transition Screen Has No Escape Route (P0)

**Problem:** `empty-dataset-state/index.tsx:232-278` — Full-screen "Meet Lucy" animation with no back/cancel button. If the `setTimeout` navigation fails, user is permanently stuck.

**Solution:** Add cancel/back button. Add timeout fallback: if navigation doesn't happen within 5s, show manual "Continue" button.

**Components to modify:**
- `src/components/datasets/empty-dataset-state/index.tsx` (lines 232-278)

**Priority:** P0 | **Effort:** S

---

## 13. Chat Error & Recovery Proposals

### Proposal 13.1 — LucyChat Error State Has No Recovery Path (P0)

**Problem:** `LucyChat.tsx:417` — Connection/streaming errors show bare red div with error text only. No retry button, no dismiss, no suggestion. Users must refresh the page.

**Solution:** Add Retry button, Dismiss button, and actionable text: "Connection lost. [Retry] or [Start new chat]". For specific errors, show targeted messages.

**Components to modify:**
- `src/components/agent/lucy-agent/LucyChat.tsx`

**Priority:** P0 | **Effort:** S

---

### Proposal 13.2 — ExecutionProgressCard Completion Biases Fine-tuning Over Review (P0)

**Problem:** `ExecutionProgressCard.tsx:217-234` — "Start Fine-tuning" is full theme-colored button with Sparkles icon. "Review Data" is secondary outline button. Encourages skipping data review.

**Solution:** Give both buttons equal visual weight, or make "Review Data" the primary CTA. Add note: "We recommend reviewing your generated data before training."

**Components to modify:**
- `src/components/datasets/plan-section/ExecutionProgressCard.tsx`

**Priority:** P0 | **Effort:** S

---

## 14. Workflow Stepper Improvements

### Proposal 14.1 — Arrow Stepper Responsiveness (P1)

**Problem:** `SectionTabs.tsx:147` uses `gridTemplateColumns: repeat(4, 1fr)` giving equal width regardless of label length. On narrow screens (<1200px), labels truncate. Locked tabs look disabled and many users don't try clicking them.

**Solution:** Auto-width arrows with `min-width`. Below 1200px collapse to icon-only with tooltip. Add hover tooltip on locked tabs (in addition to popover). Use distinct "Coming Soon" visual vs "locked."

**Components to modify:**
- `src/components/datasets/dataset-detail-header/ArrowSegment.tsx`
- `src/components/datasets/dataset-detail-header/SectionTabs.tsx` (lines 143-261)

**Priority:** P1 | **Effort:** M

---

### Proposal 14.2 — Step Dependency Visibility (P1)

**Problem:** Step dependencies (`SectionTabs.tsx:78-98`) only surfaced through lock icon and popover. Users don't see the dependency chain.

**Solution:** Subtle pulse/glow on next recommended step. When "Data" is complete, pulse "Evaluation" arrow. Add "Next step" indicator.

**Components to modify:**
- `src/components/datasets/dataset-detail-header/SectionTabs.tsx`
- `src/components/datasets/dataset-detail-header/ArrowSegment.tsx`

**Priority:** P1 | **Effort:** S

---

## 15. Sidebar Improvements

### Proposal 15.1 — Sidebar Collapse Notification Badge (P1)

**Problem:** `LucyDatasetAssistant.tsx:99-115` — Collapsed sidebar (w-14) shows only Lucy avatar. No indication of activity, pending responses, or processing state.

**Solution:** Add notification badge on collapsed avatar when Lucy has pending response or is running a tool. Add pulsing indicator during processing.

**Components to modify:**
- `src/components/datasets/LucyDatasetAssistant.tsx`

**Priority:** P1 | **Effort:** S

---

### Proposal 15.2 — Quick Actions Persistence After First Message (P1)

**Problem:** `LucyDatasetAssistant.tsx:46-90` — Quick actions only visible in welcome/empty state. Once user sends first message, they disappear permanently.

**Solution:** Persist as compact action bar above chat input. Show as small pill buttons updating dynamically with workflow state.

**Components to modify:**
- `src/components/datasets/LucyDatasetAssistant.tsx`
- `src/components/agent/lucy-agent/LucyChat.tsx`
- **Upstream:** `@distri/react/components/Chat.tsx` — needs `persistentActions` prop or slot

**Priority:** P1 | **Effort:** M (upstream change)

---

### Proposal 15.3 — Proactive Analysis Intent Card (P1)

**Problem:** `LucyDatasetAssistant.tsx:191-240` — Auto-triggers analysis after 300ms without user consent. If user starts typing before 300ms, they get unexpected auto-message. `lastAnalyzedDatasetRef` resets on refresh.

**Solution:** Show intent card instead of auto-sending: "Lucy can analyze your dataset. [Analyze now] [Dismiss]". Persist state in localStorage.

**Components to modify:**
- `src/components/datasets/LucyDatasetAssistant.tsx`
- `src/components/agent/lucy-agent/LucyChat.tsx`

**Priority:** P1 | **Effort:** M

---

### Proposal 15.4 — New Chat Confirmation Dialog (P1)

**Problem:** `LucyDatasetAssistant.tsx:517` — "New Chat" button clears conversation with no confirmation.

**Solution:** Add confirmation dialog: "Start a new conversation? Your current chat will be cleared."

**Components to modify:**
- `src/components/datasets/LucyDatasetAssistant.tsx`

**Priority:** P1 | **Effort:** S

---

### Proposal 15.5 — Stop Button Color Mismatch (P1)

**Problem:** `LucyChatInput.tsx:418-422` — Stop button uses `bg-destructive` (red). Upstream uses `bg-amber-500`. Red = danger; amber = interrupt (semantically correct).

**Solution:** Change from `bg-destructive` to `bg-amber-500`.

**Components to modify:**
- `src/components/agent/lucy-agent/LucyChatInput.tsx`

**Priority:** P1 | **Effort:** S

---

## 16. Error Handling Improvements

### Proposal 16.1 — Tool Execution Error Recovery (P1)

**Problem:** `@distri/react` `ToolExecutionRenderer.tsx:132-150` shows tool errors with no retry. Error messages like "Executing generate_topics failed" are meaningless to non-technical users. `run_error` retry button in `MessageRenderer.tsx:194-205` doesn't work.

**Solution:** Add functional Retry button. Map common errors to user-friendly messages. Wire `run_error` retry to `sendMessage`.

**Components to modify:**
- **Upstream:** `@distri/react/renderers/ToolExecutionRenderer.tsx`, `MessageRenderer.tsx`
- This repo: Custom tool renderers in `src/components/agent/lucy-agent/`

**Priority:** P1 | **Effort:** M (upstream change)

---

### Proposal 16.2 — Plan Execution Error Handling (P1)

**Problem:** `PlanSection.tsx:167-197` — When execution step fails: no recovery option, plan becomes read-only, no partial success acknowledgment.

**Solution:** Add "Retry from failed step" button. Show partial success: "3/7 steps completed. Failed at: Configure Evaluator. [Retry step] [Edit plan]"

**Components to modify:**
- `src/components/datasets/plan-section/ExecutionProgressCard.tsx`
- `src/components/datasets/plan-section/PlanSection.tsx`

**Priority:** P1 | **Effort:** M

---

### Proposal 16.3 — Plan Dismiss Confirmation (P1)

**Problem:** `SetupPlanEditor.tsx:84-86` — "Dismiss" button immediately clears plan (30+ seconds to generate). No confirmation, no undo.

**Solution:** Add undo toast: "Plan dismissed. [Undo]" with 5s window. Or confirmation dialog.

**Components to modify:**
- `src/components/datasets/plan-section/SetupPlanEditor.tsx`

**Priority:** P1 | **Effort:** S

---

### Proposal 16.4 — Execution Cancel Mechanism (P1)

**Problem:** `PlanSection.tsx:255-281` — No way to cancel/pause/abort plan execution once started.

**Solution:** Add "Cancel Execution" button. Gracefully stop after current step completes.

**Components to modify:**
- `src/components/datasets/plan-section/ExecutionProgressCard.tsx`
- `src/lib/distri-finetune-tools/steps/execute-setup-plan.ts`

**Priority:** P1 | **Effort:** M

---

## 17. Cross-Component Inconsistencies (NEW)

### Proposal 17.1 — Visual Consistency Audit (P2)

Issues found across the feature:

| Issue | Current State | Fix |
|-------|--------------|-----|
| **Border radius** | `rounded-2xl` (chat), `rounded-xl` (input), `rounded-lg` (cards), `rounded-md` (buttons) | Standardize: `rounded-lg` cards, `rounded-md` buttons, `rounded-xl` chat |
| **Button sizing** | `h-8` (plan), `h-7` (sidebar), `h-8` (chat send), `h-10` (upstream) | Standardize: `h-8` actions, `h-7` icon-only |
| **Icon sizing** | Emojis (quick actions), `h-3.5`-`h-8` (various) | Scale: `h-3.5` small, `h-4` standard, `h-5` emphasis |
| **Success color** | `theme-500` (plan) vs `emerald-500` (dataset config) | Standardize on `emerald-500` |
| **Heading hierarchy** | `text-4xl` (onboarding) to `text-sm` (chat) | Define scale: `text-2xl` page, `text-lg` section, `text-base` card |
| **Focus ring** | `--theme-rgb` (possibly undefined) in `LucyChatInput.tsx:367` | Use `ring-ring` from shadcn/ui tokens |

**Components to modify:** Multiple files across `src/components/datasets/` and `src/components/agent/lucy-agent/`

**Priority:** P2 | **Effort:** M

---

### Proposal 17.2 — Quick Action Emojis to Lucide Icons (P2)

**Problem:** `LucyDatasetAssistant.tsx:47-54` — Quick actions use emoji strings instead of Lucide icons. Emojis render differently across platforms.

**Solution:** Replace with Lucide icons for consistency.

**Priority:** P2 | **Effort:** S

---

### Proposal 17.3 — Dataset Loading Skeleton (P2)

**Problem:** `DatasetDetailContentV2.tsx:366-369` — Basic `LoadingIndicator` with "Loading dataset..." and no skeleton preview.

**Solution:** Skeleton layout mirroring final page structure: sidebar skeleton + header + tabs + content area.

**Priority:** P2 | **Effort:** S

---

### Proposal 17.4 — Plan Execution Success Celebration (P2)

**Problem:** `PlanExecutedView.tsx:32-49` — Success indicator is a tiny `w-2 h-2` dot. Anticlimactic after multi-step process.

**Solution:** Prominent success banner with green checkmark, execution summary ("7/7 steps completed").

**Priority:** P2 | **Effort:** S

---

### Proposal 17.5 — Knowledge Sources Processing Per-Document Status (P2)

**Problem:** `DocsProcessingState` shows "X of Y remaining" with no per-document status. If processing fails silently, state stays stuck.

**Solution:** Show per-document filename + spinner/checkmark. Add timeout detection: if no progress for 30s, show "Having trouble? [Retry] [Skip]"

**Priority:** P2 | **Effort:** S

---

## 18. Evaluation Panel Redesign (VS Code-Style Layout)

### Proposal 18.1 — Redesign EvaluationConfigPanel as VS Code-Style Editor + Bottom Panel (P1)

**Problem:** The current `EvaluationConfigPanel` (`src/components/datasets/evaluation-dialog/EvaluationConfigPanel.tsx`, 315 lines) has an IDE-style code editor (Monaco) for the grader script with a resizable inline dry run panel (`DryRunInlinePanel`). However the layout has several issues:

- **Single-purpose bottom panel:** `DryRunInlinePanel.tsx` (217 lines) only handles dry run views (config/running/results/history). There's no way to see dry run history while viewing current results, or to check logs while editing.
- **No multi-tab bottom panel:** Unlike VS Code where the bottom area has tabs (Terminal, Problems, Output, Debug Console), the current panel only shows one context at a time with internal state switching (`activeView: "config" | "running" | "results" | "history"`).
- **Dry run results are ephemeral:** The `ResultsView` shows a single scrollable page with scores, histogram, recommendations, and full results table all stacked vertically. Switching to HistoryView loses the current results view.
- **No persistent status bar integration:** The status bar footer in `EvaluationConfigPanel` (lines ~250-315) shows a contextual button and mean score, but this duplicates information that should be in the bottom panel tabs.
- **Modal fallback:** `DryRunDialog.tsx` (248 lines) exists as a separate modal dialog with the same views — this creates two parallel implementations (inline panel vs modal) for the same functionality.

**Current Component Structure:**
```
EvaluationConfigPanel (315 lines)
├── Monaco Editor (top) — grader script
├── DryRunInlinePanel (bottom, resizable) — single-view switcher
│   ├── ConfigView — sample size + model selection
│   ├── RunningView — progress during evaluation
│   ├── ResultsView — scores, histogram, recommendations, table
│   └── HistoryView — past dry run jobs
└── Status Bar Footer — save button, contextual action, mean score
```

**Proposed Solution — VS Code-Style Layout:**

Restructure into a true VS Code-style layout with code editor on top and a tabbed bottom panel:

```
┌─────────────────────────────────────────────┐
│  Editor Toolbar  [JS ▾] [LLM Judge ▾] [Save]│
├─────────────────────────────────────────────┤
│                                             │
│           Monaco Code Editor                │
│         (grader script / judge prompt)      │
│                                             │
├──┬──────────┬──────────┬──────────┬─────────┤
│  │ Results  │ History  │ Running  │  Logs   │  ← tab bar
├──┴──────────┴──────────┴──────────┴─────────┤
│                                             │
│         Tab Content Area                    │
│   (results table / history list / progress  │
│    / execution logs)                        │
│                                             │
├─────────────────────────────────────────────┤
│ Status: Mean 0.82 | Verdict: GO | 42 samples│  ← status bar
└─────────────────────────────────────────────┘
```

**Bottom Panel Tabs:**

| Tab | Content | Badge |
|-----|---------|-------|
| **Results** | Latest dry run results: score summary cards, histogram, recommendations, results table. Shows most recent completed job. | Score badge (e.g., "0.82") |
| **History** | List of all past dry run jobs with date, sample count, mean score, verdict. Click to load into Results tab. | Job count (e.g., "5") |
| **Running** | Live progress of current dry run: progress bar, completed/total rows, live score updates. Only visible when a job is active. | Spinner when active |
| **Logs** | Execution logs, errors, and warnings from dry run jobs. Useful for debugging grader script issues. | Error count if > 0 |

**Key Design Decisions:**

1. **Resizable splitter:** The divider between editor and bottom panel is draggable (like VS Code). Default split: 60% editor / 40% panel. User's preferred split persisted in localStorage.

2. **Editor modes:** The editor toolbar has a mode switcher:
   - **JavaScript** — Monaco with JS syntax, for custom grader scripts
   - **LLM Judge** — Split view with judge prompt template (left) + output schema (right), reusing existing `JudgeInstructionsPanel` and `OutputSchemaPanel`

3. **Bottom panel collapsible:** Double-click the splitter bar or click a "collapse" chevron to hide the bottom panel entirely, giving full space to the editor. Click any tab to re-expand.

4. **Status bar:** Persistent single-line footer showing: save status (saved/unsaved dot), last dry run score + verdict, quick "Run Test" button. This replaces the current contextual footer.

5. **Eliminate DryRunDialog modal:** The bottom panel replaces the need for a separate modal. All dry run functionality lives in the tabs. Remove `DryRunDialog.tsx` and its sub-components, or refactor them as tab content components.

6. **Tab persistence:** Active tab and panel height are persisted per dataset in localStorage so the user's workspace setup is remembered.

**Implementation Approach:**

Phase 1 — Bottom panel shell:
- Create `EvaluationBottomPanel.tsx` with tab bar + content area
- Migrate `DryRunInlinePanel` views into tab components: `ResultsTab`, `HistoryTab`, `RunningTab`, `LogsTab`
- Replace inline panel toggle with always-visible bottom panel (collapsible)

Phase 2 — Editor toolbar:
- Add mode switcher (JS / LLM Judge) to editor toolbar
- In LLM Judge mode, render `JudgeInstructionsPanel` + `OutputSchemaPanel` side-by-side in the editor area
- In JS mode, render Monaco editor (current behavior)

Phase 3 — Status bar:
- Consolidate footer into a VS Code-style status bar
- Show: save indicator, grader type, last score/verdict, "Run Test" button
- Remove redundant contextual button logic from current footer

Phase 4 — Cleanup:
- Remove or deprecate `DryRunDialog.tsx` (modal) — all functionality now in bottom panel
- Remove `DryRunInlinePanel.tsx` — replaced by `EvaluationBottomPanel`
- Update `DatasetDetailContentV2.tsx` integration

**Components to modify:**
- `src/components/datasets/evaluation-dialog/EvaluationConfigPanel.tsx` — major restructure into VS Code layout
- `src/components/datasets/evaluation-dialog/DryRunInlinePanel.tsx` — refactor into tab components or remove
- `src/components/datasets/dry-run-dialog/` — migrate views to bottom panel tabs
- New: `src/components/datasets/evaluation-dialog/EvaluationBottomPanel.tsx` — tabbed bottom panel
- New: `src/components/datasets/evaluation-dialog/EvaluationStatusBar.tsx` — persistent status bar
- `src/components/datasets/DatasetDetailContentV2.tsx` — update integration (lines 447-454)

**Priority:** P1 (significant UX improvement — makes evaluation workflow feel professional and integrated) | **Effort:** L

---

## Updated Implementation Roadmap

### P0 — Fix Immediately (7 items)

| # | Proposal | Components | Effort |
|---|----------|------------|--------|
| 1 | **11.1 — Documentation Tabs → Icon-only** | `SectionTabs.tsx` | S |
| 2 | **12.1 — Empty dataset without files guidance** | `empty-dataset-state/index.tsx`, `DatasetMainContent.tsx` | M |
| 3 | **12.2 — Auto-plan timing → event-driven** | `DatasetDetailContentV2.tsx` | M |
| 4 | **12.3 — Plan empty state dead end** | `PlanEmptyState.tsx`, `PlanSection.tsx` | S |
| 5 | **12.4 — Transition screen escape route** | `empty-dataset-state/index.tsx` | S |
| 6 | **13.1 — Chat error recovery** | `LucyChat.tsx` | S |
| 7 | **13.2 — Execution CTA balance** | `ExecutionProgressCard.tsx` | S |

### P1 — Next Sprint (13 items)

| # | Proposal | Components | Effort | Upstream? |
|---|----------|------------|--------|-----------|
| 8 | 14.1 — Arrow stepper responsiveness | `ArrowSegment.tsx`, `SectionTabs.tsx` | M | No |
| 9 | 14.2 — Step dependency visibility | `SectionTabs.tsx`, `ArrowSegment.tsx` | S | No |
| 10 | 15.1 — Sidebar collapse badge | `LucyDatasetAssistant.tsx` | S | No |
| 11 | 15.2 — Quick actions persistence | `LucyDatasetAssistant.tsx`, `LucyChat.tsx` | M | Yes |
| 12 | 15.3 — Proactive analysis intent card | `LucyDatasetAssistant.tsx` | M | No |
| 13 | 15.4 — New Chat confirmation | `LucyDatasetAssistant.tsx` | S | No |
| 14 | 15.5 — Stop button color fix | `LucyChatInput.tsx` | S | No |
| 15 | 16.1 — Tool error recovery | Custom renderers + upstream | M | Yes |
| 16 | 16.2 — Plan execution error handling | `ExecutionProgressCard.tsx`, `PlanSection.tsx` | M | No |
| 17 | 16.3 — Plan dismiss confirmation | `SetupPlanEditor.tsx` | S | No |
| 18 | 16.4 — Execution cancel mechanism | `ExecutionProgressCard.tsx` | M | No |
| 19 | 4.1 — Structured tool result renderers | `lucy-agent/` renderers | M | No |
| 20 | 8.1 — Stop auto-switching tabs | `DatasetDetailContentV2.tsx` | S | No |
| 21 | **18.1 — EvaluationConfigPanel VS Code-style layout** | `EvaluationConfigPanel.tsx`, `DryRunInlinePanel.tsx`, new components | L | No |

### P2 — Future Polish (5 items)

| # | Proposal | Components | Effort |
|---|----------|------------|--------|
| 21 | 17.1 — Visual consistency audit | Multiple files | M |
| 22 | 17.2 — Quick action emojis → Lucide | `LucyDatasetAssistant.tsx` | S |
| 23 | 17.3 — Dataset loading skeleton | `DatasetDetailContentV2.tsx` | S |
| 24 | 17.4 — Plan execution success celebration | `PlanExecutedView.tsx` | S |
| 25 | 17.5 — Docs processing per-document status | `DocsProcessingState.tsx` | S |

### Upstream Changes (@distri/react)

| Proposal | File | Change |
|----------|------|--------|
| 15.2 | `Chat.tsx` | New `persistentActions` prop/slot above footer |
| 16.1 | `ToolExecutionRenderer.tsx` | `onRetry` callback for failed tools |
| 16.1 | `MessageRenderer.tsx` | Wire `run_error` retry to `sendMessage` |
| 3.4 | `ChatInput.tsx` | Expand `accept` attribute for document uploads |

Sync via `scripts/sync-distrijs.sh` after upstream changes.

---

**Priority summary (cumulative with all prior proposals):**
- P0: 7 new (11.1, 12.1-12.4, 13.1-13.2)
- P1: 14 new (14.1-14.2, 15.1-15.5, 16.1-16.4, 18.1, plus existing 4.1, 8.1)
- P2: 5 new (17.1-17.5)
- Resolved: 21 (from prior rounds)

---

## Comprehensive 4-Agent UX Redesign Review (2026-02-11)

Full-team review with 4 specialized agents: UX Flow Analyst, Visual & Interaction Reviewer, Information Architecture Reviewer, Redesign Proposer. 63 findings synthesized into 25 redesign proposals.

### Review Methodology

Each reviewer read all documentation (CLAUDE.md, guided-onboarding.md, state-machine.md, architecture.md, state-management-pattern.md) and traced through all key UI source files across this repo and upstream @distri/react.

---

### Reviewer 1: UX Flow Analysis (15 findings)

#### Complete Flow Map

**Screen 1: Empty Datasets State** (`src/components/datasets/empty-dataset-state/index.tsx`)
- Heading: "What is the objective of your dataset?"
- Tab switcher: "Enter Objective" | "Initialize via API"
- Textarea with suggestion pills, file upload (drag-and-drop), "Start Finetune" button
- Chess tutor sample link at bottom

**Screen 2: Onboarding Transition** (lines 232-278)
- Lucy avatar animated, "Meet Lucy" text
- Auto-redirect: 2.5s with files, 800ms without
- No user actions available, no escape route

**Screen 3: Dataset Detail View** (`DatasetDetailContentV2.tsx`)
- Two-panel: Lucy sidebar (340-384px) + Main content
- Section tabs: Data → Evaluation → Finetune → Deploy + Docs, Plan, Readme
- Locked tabs show prerequisite popover

**Screen 3a: Data Section** — Records with Canvas/Table toggle, topic hierarchy, coverage indicators
**Screen 3b: Evaluation Section** — Monaco editor, dry run bottom panel, results/history tabs
**Screen 3c: Finetune Section** — Jobs list, settings popover, prerequisites warning
**Screen 3d: Plan Section** — Priority-based rendering (docs processing → generating → proposed → executing → executed → empty)
**Screen 3e: Docs Section** — Knowledge source cards with status
**Screen 3f: Readme Section** — Auto-generated markdown

**Lucy Sidebar States**: Checking config → Provider check → Loading agent → Connected → Connecting
**Quick Actions**: Context-sensitive (no records → has records → has evaluator → has jobs)

#### Pain Points

| ID | Severity | Finding | Component |
|----|----------|---------|-----------|
| PP-01 | P0 | No "back to datasets list" navigation | `DatasetDetailContentV2.tsx` |
| PP-02 | P0 | Finetune tab lock-out with no inline guidance for partial plan failure | `SectionTabs.tsx:81` |
| PP-03 | P0 | `autoGeneratePlan` 2-second race condition with no retry | `DatasetDetailContentV2.tsx:262` |
| PP-04 | P1 | Quick actions don't map to actual tool names/tab locations | `LucyDatasetAssistant.tsx:46-54` |
| PP-05 | P1 | Plan tab only discoverable by accident (icon-only, grouped with docs) | `PlanEmptyState.tsx`, `SectionTabs.tsx:46` |
| PP-06 | P1 | Dismissing plan has no confirmation, loses all content | `PlanSection.tsx:226-233` |
| PP-07 | P1 | Deploy tab "Coming Soon" dead end with no alternative | `SectionTabs.tsx:39` |
| PP-08 | P1 | Lucy auto-collapses on <1024px with no pin option | `LucyDatasetAssistant.tsx:105-106` |
| PP-09 | P1 | No progress persistence for plan execution across page reloads | `execution-state-store.ts` |
| PP-10 | P1 | Evaluation script requires JavaScript with no guided setup | `EvaluationConfigPanel.tsx:50-62` |
| PP-11 | P2 | Tab counts inconsistent (numbers vs dots) | `SectionTabs.tsx:180-200, 304-309` |
| PP-12 | P2 | Quick actions `jobsCount` hardcoded to 0 | `LucyDatasetAssistant.tsx:282-289` |
| PP-13 | P2 | Dataset names auto-generated from first 4 words | `empty-dataset-state/index.tsx:167-168` |
| PP-14 | P2 | No visual distinction between human and AI-generated records | Records table/canvas |
| PP-15 | P2 | Beta badge has no link to feedback or docs | `LucyDatasetAssistant.tsx:498-506` |

---

### Reviewer 2: Visual & Interaction Review (29 findings)

#### Loading/Error/Empty States

| ID | Severity | Finding | Component |
|----|----------|---------|-----------|
| VI-1.1 | P0 | No error recovery for Lucy connection failure | `LucyDatasetAssistant.tsx:430-438` |
| VI-1.2 | P0 | Chat error display has no retry/dismiss | `LucyChat.tsx:416-419` |
| VI-1.3 | P1 | No error state for failed plan generation (stuck loading) | `PlanSection.tsx:237-313` |
| VI-1.4 | P1 | Finetune empty state is generic, config hidden behind gear | `FinetuneBottomPanel.tsx:196-199` |
| VI-1.5 | P1 | ExecutionProgressCard has bare initial state | `ExecutionProgressCard.tsx:63-71` |
| VI-1.6 | P2 | LucyWelcome default text inconsistent with finetune context | `LucyWelcome.tsx:63-68` |
| VI-1.7 | P2 | PlanEmptyState no visual differentiation | `PlanEmptyState.tsx:17-42` |

#### Visual Hierarchy

| ID | Severity | Finding | Component |
|----|----------|---------|-----------|
| VI-2.1 | P0 | Arrow stepper vs icon tabs creates dual-navigation confusion | `SectionTabs.tsx:143-319` |
| VI-2.2 | P1 | Beta badge competes with primary header actions | `LucyDatasetAssistant.tsx:496-506` |
| VI-2.3 | P1 | FinetuneConfigPanel hardcoded dark theme colors (zinc-*) | `FinetuneConfigPanel.tsx:137-314` |
| VI-2.4 | P1 | FinetuneBottomPanel same hardcoded dark theme issue | `FinetuneBottomPanel.tsx:77-263` |
| VI-2.5 | P1 | Assistant message bubble `ml-8` misalignment | `LucyMessage.tsx:125` |
| VI-2.6 | P2 | SetupPlanEditor thin header doesn't anchor panel | `SetupPlanEditor.tsx:40-53` |
| VI-2.7 | P2 | LucyChatInput uses undefined `--theme-rgb` CSS variable | `LucyChatInput.tsx:367` |

#### Interaction Quality

| ID | Severity | Finding | Component |
|----|----------|---------|-----------|
| VI-3.1 | P0 | Textarea disabled during streaming (contradicts "Message will be queued...") | `LucyChatInput.tsx:375-376` |
| VI-3.2 | P1 | Locked tabs lack clickability affordance | `SectionTabs.tsx:206-246` |
| VI-3.3 | P1 | "Dismiss" vs "Clear" naming confusion in plan views | `PlanExecutedView.tsx:43-46, 63-66` |
| VI-3.4 | P1 | Tool call card expand target unclear (only chevron suggests it) | `LucyToolCallCard.tsx:77-106` |
| VI-3.5 | P1 | Quick actions send label text as user message | `LucyChat.tsx:315-318` |
| VI-3.6 | P2 | Attachment button tooltip overly long | `LucyChatInput.tsx:391` |
| VI-3.7 | P2 | Voice input has no stop/cancel mechanism | `LucyChatInput.tsx:344-354` |

#### Cross-Component Consistency

| ID | Severity | Finding | Component |
|----|----------|---------|-----------|
| VI-4.1 | P1 | Theme color inconsistency (finetune panels vs rest) | Multiple finetune components |
| VI-4.2 | P1 | Message bubble styling differs across components | `LucyMessage.tsx`, `LucyAssistantMessage.tsx`, `LucyWelcome.tsx` |
| VI-4.3 | P1 | Timestamp formatting inconsistent | Multiple Lucy components |
| VI-4.4 | P1 | Icon size inconsistency in action buttons | Multiple components |
| VI-4.5 | P2 | Border radius inconsistency across cards | Multiple components |
| VI-4.6 | P2 | LucyAvatar image path typo "avarta" | `LucyAvatar.tsx:61` |

#### Chat/Tool Result Display

| ID | Severity | Finding | Component |
|----|----------|---------|-----------|
| VI-5.1 | P1 | Two parallel tool rendering paths create duplication | `LucyToolCallCard.tsx`, `LucyToolExecutionRenderer.tsx` |
| VI-5.2 | P1 | Excessive console.log in LucySetupPlanRenderer | `LucySetupPlanRenderer.tsx:43-114` |
| VI-5.3 | P1 | ExecutionProgressCard shown in BOTH chat AND Plan tab | `LucyExecutePlanRenderer.tsx:53-61` |
| VI-5.5 | P2 | Tool card defaults to output tab even when empty | `LucyToolCallCard.tsx:31` |
| VI-5.6 | P2 | Agent handover renders as confusing plain box | `LucyMessageRenderer.tsx:89-95` |

---

### Reviewer 3: Information Architecture Review (19 findings)

| ID | Severity | Area | Finding | Component |
|----|----------|------|---------|-----------|
| IA-01 | P0 | Pipeline | 7-step pipeline vs 4-tab stepper mismatch | `SectionTabs.tsx:35-47` |
| IA-02 | P0 | Sidebar/Canvas | Ambiguous ownership of actions between panels | `LucyDatasetAssistant.tsx`, `DatasetDetailContentV2.tsx` |
| IA-03 | P0 | Cognitive Load | 9 navigation tabs is excessive | `SectionTabs.tsx:35-47` |
| IA-04 | P0 | Errors | "Prerequisites missing" not actionable (10px AlertCircle) | `FinetuneConfigPanel.tsx:146-158` |
| IA-05 | P1 | Pipeline | Step names are developer-facing (topics_config, grader_config) | `state-machine.md:71-80` |
| IA-06 | P1 | Pipeline | Required vs optional not visually differentiated | `ArrowSegment.tsx:88-95` |
| IA-07 | P1 | Sidebar/Canvas | Plan appears in BOTH chat and Plan tab | `PlanSection.tsx`, `LucySetupPlanRenderer.tsx` |
| IA-08 | P1 | Data | Records header stats too dense | `RecordsSectionHeader.tsx:60-72` |
| IA-09 | P1 | Data | Topic tree coverage lacks legend | `TopicNodeHeader.tsx`, `CoverageIndicator.tsx` |
| IA-10 | P1 | Errors | Dry run failures are technical | `ExecutionProgressCard.tsx:239-251` |
| IA-11 | P1 | Tool Results | Tool results not summarized for non-tech users | Tool renderers |
| IA-12 | P1 | Config | Training config hidden in gear icon | `FinetuneConfigPanel.tsx:162-265` |
| IA-13 | P1 | Config | Dry run config hidden in gear icon | `EvaluationConfigPanel.tsx:326-377` |
| IA-14 | P1 | Cognitive Load | Empty states don't guide to right starting point | `PlanEmptyState.tsx` |
| IA-15 | P2 | Data | Setup plan markdown not scannable | `SetupPlanEditor.tsx:56-60` |
| IA-16 | P2 | Tool Results | Execution step names generic | `ExecutionProgressCard.tsx:166-203` |
| IA-17 | P2 | Errors | Knowledge source processing errors silent | `KnowledgeSourcesPanel.tsx:28-38` |
| IA-18 | P2 | Config | No centralized settings page | N/A |
| IA-19 | P2 | Cognitive Load | Quick actions change without explanation | `LucyDatasetAssistant.tsx:57-90` |

---

### Synthesized Redesign Proposals (25 total)

#### Area 1: Onboarding & First-Time Experience

**Proposal R-1.1: Event-driven auto-plan trigger** (P0)
- Replace `setTimeout(2000)` in `DatasetDetailContentV2.tsx:262` with event-driven approach
- Listen for `vllora_all_docs_processed` event from knowledge source pipeline
- Show progress: "Processing document 2 of 3..."
- Add retry if doc processing fails
- Components: `DatasetDetailContentV2.tsx`, `knowledge-sources-db.ts`, `DocsProcessingState.tsx`
- Findings: PP-03

**Proposal R-1.2: Promote Plan as first-class workflow entry** (P1)
- Add summary card to PlanSection with status and key stats
- Redesign PlanEmptyState with guidance text and illustration
- Deduplicate plan display: chat shows "Plan proposed — see Plan tab" link card only
- Components: `PlanSection.tsx`, `PlanEmptyState.tsx`, `SetupPlanCard.tsx`, Lucy chat renderers
- Findings: PP-05, IA-07, IA-14, IA-15

**Proposal R-1.3: Plan dismiss confirmation** (P1)
- Add confirmation dialog before discarding generated plan
- Rename "Dismiss" to "Discard Plan" for clarity
- Components: `PlanHeaderActions.tsx`, `SetupPlanEditor.tsx`
- Findings: PP-06, VI-3.3

#### Area 2: Navigation & Tab Structure

**Proposal R-2.1: Consolidate 9 tabs to 5** (P0)
- Restructure: Data (+ merged Docs) → Plan (promoted) → Evaluation → Training (renamed) → Deploy
- Remove arrow stepper, use standard horizontal tab bar
- README becomes header menu action, not a tab
- Components: `SectionTabs.tsx`, `DatasetUtilityBar.tsx`, `ArrowSegment.tsx` (remove), `DatasetDetailContentV2.tsx`, `KnowledgeSourcesPanel.tsx`, `ReadmeWithPlan.tsx`
- Findings: IA-01, IA-03, VI-2.1, PP-11

**Proposal R-2.2: Back navigation breadcrumb** (P0)
- Ensure always-visible "Datasets > [Name]" breadcrumb at top
- Components: `DatasetBreadcrumb.tsx`, dataset-detail-header `index.tsx`
- Findings: PP-01

**Proposal R-2.3: Deploy tab actionable guidance** (P1)
- Replace "Coming Soon" with download instructions, model ID copy, deployment docs link
- Components: New `DeploySection.tsx` or update `DatasetDetailContentV2.tsx`
- Findings: PP-07

#### Area 3: Lucy Sidebar Assistant

**Proposal R-3.1: Pin/persist + responsive collapse** (P1)
- Add pin toggle next to collapse button, persist in localStorage
- Unpinned narrow screens: floating "Lucy" button opens overlay
- Components: `LucyDatasetAssistant.tsx`
- Findings: PP-08

**Proposal R-3.2: Connection error recovery** (P0)
- Add retry button for connection failures (after 10s timeout)
- Add retry/dismiss on chat errors
- Add 30s timeout on plan generation with retry/cancel
- Components: `LucyDatasetAssistant.tsx`, `ConnectGatewayCard.tsx`, `LucyChat.tsx`, `PlanLoadingState.tsx`
- Findings: VI-1.1, VI-1.2, VI-1.3

**Proposal R-3.3: Fix quick actions** (P1)
- Map each action to a structured prompt (not label text)
- Fix `jobsCount` hardcoded to 0
- Components: `LucyDatasetAssistant.tsx`
- Findings: PP-04, PP-12, VI-3.5

**Proposal R-3.4: Enable message queuing during streaming** (P1)
- Keep textarea enabled during streaming
- Show "Queued" badge on pending messages
- Components: `@distri/react ChatInput.tsx` (upstream), `useFineTuneAgentChat.ts`
- Findings: VI-3.1

#### Area 4: Data Section

**Proposal R-4.1: Scannable stats + coverage legend** (P1)
- Simplify header to row of stat pills
- Standardize badges to numeric across all tabs
- Add colored legend to topic tree
- Components: `RecordsSectionHeader.tsx`, `SectionTabs.tsx`, `CoverageIndicator.tsx`
- Findings: IA-08, PP-11, IA-09

**Proposal R-4.2: AI-generated record badge** (P2)
- Small "AI" chip on synthetically generated records
- Components: `SourceCell.tsx`
- Findings: PP-14

**Proposal R-4.3: Better dataset naming** (P2)
- Prompt user to name during creation, with editable auto-suggestion
- Components: `CreateDatasetDialog.tsx`
- Findings: PP-13

#### Area 5: Evaluation Section

**Proposal R-5.1: Visual evaluation builder for non-developers** (P1)
- "Simple Mode" / "Code Mode" toggle above Monaco editor
- Simple Mode: form with metric types, thresholds, rubric criteria
- Generates JavaScript code from form inputs
- Components: `EvaluationConfigPanel.tsx`, `JavaScriptPanel.tsx`, new `SimpleEvaluationBuilder.tsx`
- Findings: PP-10

**Proposal R-5.2: Friendly dry run errors + inline config** (P1)
- Translate technical errors to plain English with fix suggestions
- Show dry run config summary inline (sample size, model)
- Components: `dry-run-dialog/`, `EvaluationConfigPanel.tsx`
- Findings: IA-10, IA-13

#### Area 6: Finetune Section

**Proposal R-6.1: Surface training config** (P1)
- Show config as primary content when no jobs (not hidden in popover)
- Replace 10px AlertCircle with full-width prerequisites banner with navigation links
- Components: `FinetuneConfigPanel.tsx`
- Findings: IA-12, PP-02, IA-04

**Proposal R-6.2: Theme-aware colors** (P1)
- Replace all hardcoded zinc-* with semantic tokens
- Components: `FinetuneConfigPanel.tsx`, `FinetuneBottomPanel.tsx`
- Findings: VI-2.3, VI-2.4, VI-4.1

#### Area 7: Plan & Execution Flow

**Proposal R-7.1: Deduplicate ExecutionProgressCard** (P1)
- Progress renders ONLY in Plan tab
- Chat shows compact "Plan executing... Step 3/7 [View in Plan tab]"
- Components: Lucy chat renderers, `ExecutionProgressCard.tsx`
- Findings: VI-5.1, VI-5.3, IA-07

**Proposal R-7.2: Persist execution progress** (P1)
- Save progress to IndexedDB alongside workflow state
- Restore on page load; show "Execution interrupted. [Resume] [Start Over]" if interrupted
- Components: `proposed-plan-store.ts`, `ExecutionProgressCard.tsx`
- Findings: PP-09

#### Area 8: Error Handling & Feedback

**Proposal R-8.1: User-friendly tool results** (P1)
- Display name mapping: `topics_config` → "Topic Setup", `grader_config` → "Evaluation Setup", etc.
- Human-readable summary per tool result card
- Visible "Show details" / "Hide details" label
- Components: `types.ts`, `LucyDefaultToolRenderer.tsx`
- Findings: IA-05, IA-11, VI-3.4

**Proposal R-8.2: Knowledge source error surfacing** (P1)
- Failed docs show red indicator with error + "Retry" button
- Toast on processing failure
- Components: `KnowledgeSourcesPanel.tsx`, `knowledge-sources-db.ts`
- Findings: IA-17

**Proposal R-8.3: Remove console.log** (P2)
- Audit and remove from production paths
- Components: `lucy-agent/` components, `DatasetDetailContentV2.tsx`
- Findings: VI-5.2

#### Area 9: Visual Consistency & Polish

**Proposal R-9.1: Standardize styling tokens** (P2)
- Consistent message margins, timestamp format, icon sizes, border radius
- Fix undefined `--theme-rgb` CSS variable
- Components: `lucy-agent/` components, new `ui-constants.ts`
- Findings: VI-2.5, VI-4.2, VI-4.3, VI-4.4, VI-4.5, VI-2.7

**Proposal R-9.2: Fix avatar typo + Beta badge** (P2)
- "avarta" → "avatar" in image path
- Reposition Beta badge next to "Lucy" label, add feedback link
- Components: `LucyAvatar.tsx`, sidebar header
- Findings: VI-4.6, VI-2.2, PP-15

**Proposal R-9.3: Agent handover + tool card defaults** (P2)
- Handover: subtle inline indicator, not a full card
- Tool cards: default to "input" tab when output empty
- Components: `@distri/react` renderers or `lucy-agent/`, tool card component
- Findings: VI-5.6, VI-5.5

---

### Priority Summary (New Proposals)

| Priority | Count | Proposals |
|----------|-------|-----------|
| **P0** | 4 | R-1.1 (event-driven auto-plan), R-2.1 (consolidate tabs), R-2.2 (back nav), R-3.2 (error recovery) |
| **P1** | 15 | R-1.2, R-1.3, R-2.3, R-3.1, R-3.3, R-3.4, R-4.1, R-5.1, R-5.2, R-6.1, R-6.2, R-7.1, R-7.2, R-8.1, R-8.2 |
| **P2** | 6 | R-4.2, R-4.3, R-8.3, R-9.1, R-9.2, R-9.3 |

### Repo Ownership

| Repo | Proposals |
|------|-----------|
| This repo (`src/components/datasets/`, `src/components/finetune/`, `src/lib/`) | ~90% of changes |
| @distri/react (upstream) | R-3.4 (ChatInput streaming), R-9.3 (handover rendering) |

### Recommended Implementation Order

**Phase 1 — P0 quick wins**: R-2.2 (back nav), R-3.2 (error recovery)
**Phase 2 — P0 major**: R-1.1 (auto-plan fix), R-2.1 (tab consolidation)
**Phase 3 — P1 high-impact easy**: R-6.2 (theme tokens), R-7.1 (deduplicate progress), R-8.1 (user-friendly tools), R-3.3 (quick actions)
**Phase 4 — P1 medium**: R-5.1 (eval builder), R-6.1 (surface config), R-1.2 (plan promotion), R-5.2 (dry run errors)
**Phase 5 — P2 polish**: Batch all together after P0/P1 stable
