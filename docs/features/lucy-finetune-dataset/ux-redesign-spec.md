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
