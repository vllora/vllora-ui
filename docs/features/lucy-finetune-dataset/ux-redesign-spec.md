# Lucy Finetune Dataset — UX Redesign Specification

> Last updated: 2026-02-11 | Reviews: 5 rounds | Reviewers: UX Flow Analyst, Visual & Interaction Reviewer, Information Architecture Reviewer, Redesign Proposer

---

## Priority Dashboard

| Priority | Count | Proposal IDs |
|----------|-------|--------------|
| **P0** | 3 | 2.1, 8.1, 8.2 |
| **P1** | 18 | 2.3, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.1, 5.2, 6.1, 6.2, 7.2, 7.3, 8.3, 8.4, 9.1 |
| **P2** | 4 | 2.4, 4.4, 7.4, 10.5 |
| **Upstream** | 4 | U.1, U.2, U.3, U.4 |
| **Resolved** | 32 | See [Resolved Proposals](#resolved-proposals) |

---

## Implementation Roadmap

### Phase 1 — P0 Quick Wins
1. **8.1** — Chat error recovery (S)
2. **8.2** — Execution completion CTA balance (S)

### Phase 2 — P0 Major Changes
3. **2.1** — Consolidate 9 tabs to 5 + unify visual paradigm (M)

### Phase 3 — P1 High-Impact
4. **6.2** — Finetune theme-aware colors (S)
5. **8.3** — User-friendly tool results + display names (M)
6. **3.3** — Fix quick actions (S)
7. **9.1** — Standardize terminology (M)
8. **8.4** — Stop auto-switching tabs (S)

### Phase 4 — P1 Medium
9. **5.1** — Visual evaluation builder (M)
10. **6.1** — Surface training config (M)
11. **5.2** — Friendly dry run errors + inline config (M)
12. **7.2** — Persist execution progress (M)
13. **7.3** — Execution cancel mechanism (M)
14. **3.2** — Sidebar pin + responsive collapse (M)
15. **2.3** — Deploy tab actionable guidance (S)
16. **3.4** — Sidebar collapse notification badge (S)
17. **3.5** — Proactive analysis intent card (M)
18. **4.1** — Structured tool result renderers (M)
19. **4.2** — Structured plan editor (M)
20. **4.3** — Scannable stats + coverage legend (M)

### Phase 5 — P2 Polish
21-24. Remaining: success celebration (7.4), AI record badges (4.4), deploy tab non-interactive (2.4), state-machine docs update (10.5)

### Upstream Coordination
File issues for U.1–U.4 in the distri repo. Sync via `scripts/sync-distrijs.sh`.

---

## Active Proposals

### 1. Onboarding & First-Time Experience

> All proposals in this section have been resolved. See [Resolved Proposals](#resolved-proposals).

---

### 2. Navigation & Tab Structure

#### 2.1 — Consolidate 9 tabs to 5 + unify visual paradigm (P0)
**Problem:** 9 navigation tabs (4 arrow-segment workflow + 3 icon-text docs + Deploy) creates excessive cognitive load. Arrow stepper vs icon tabs creates dual-navigation confusion. 7-step pipeline maps poorly to 4 tabs. Doc tabs consume ~350px for secondary navigation. (IA-01, IA-03, VI-2.1, PP-11, old 7.2, 11.1, R-2.1)
**Solution:** Restructure into 5 primary tabs with unified visual language:
- **Data** (Records + merged Docs as collapsible section)
- **Plan** (promoted from secondary icon to primary tab)
- **Evaluation** (Evaluator + Dry Run)
- **Training** (renamed from "Finetune")
- **Deploy** (coming soon)

Remove arrow stepper. Use standard horizontal tab bar. README becomes header menu action.
**Components:** `SectionTabs.tsx`, `ArrowSegment.tsx` (remove), `DatasetUtilityBar.tsx`, `DatasetDetailContentV2.tsx`, `KnowledgeSourcesPanel.tsx`, `ReadmeWithPlan.tsx`
**Effort:** M

#### 2.3 — Deploy tab actionable guidance (P1)
**Problem:** Deploy tab shows "Coming Soon" with no alternative guidance after completing the pipeline. (PP-07, R-2.3)
**Solution:** Replace with download instructions, model ID copy button, and deployment docs links.
**Components:** New `DeploySection.tsx` or update `DatasetDetailContentV2.tsx`
**Effort:** S

#### 2.4 — Make Deploy tab non-interactive (P2)
**Problem:** Deploy tab has no-op click handler but cursor still shows `pointer`. Feels broken. (old 10.5)
**Solution:** Set `cursor-not-allowed`, suppress hover, add "Coming Soon" tooltip.
**Components:** `SectionTabs.tsx`, `ArrowSegment.tsx`
**Effort:** S

---

### 3. Lucy Sidebar Assistant

#### 3.2 — Sidebar pin + responsive collapse (P1)
**Problem:** Lucy auto-collapses on <1024px with no way to pin. (PP-08, R-3.1)
**Solution:** Add pin toggle, persist in localStorage. Unpinned narrow screens: floating "Lucy" button opens overlay.
**Components:** `LucyDatasetAssistant.tsx`
**Effort:** M

#### 3.3 — Fix quick actions (P1)
**Problem:** Quick actions send button label as literal user message (feels like putting words in user's mouth). `jobsCount` hardcoded to 0 so actions never update. (PP-04, PP-12, VI-3.5, R-3.3)
**Solution:** Map each action to a structured prompt. Fix `jobsCount` to read from actual context.
**Components:** `LucyDatasetAssistant.tsx`
**Effort:** S

#### 3.4 — Sidebar collapse notification badge (P1)
**Problem:** Collapsed sidebar shows only Lucy avatar. No indication of activity, pending responses, or processing state. (old 15.1)
**Solution:** Add notification badge on collapsed avatar when Lucy has pending response or is running a tool.
**Components:** `LucyDatasetAssistant.tsx`
**Effort:** S

#### 3.5 — Proactive analysis intent card (P1)
**Problem:** Auto-triggers analysis after 300ms without user consent. `lastAnalyzedDatasetRef` resets on refresh. (old 15.3)
**Solution:** Show intent card: "Lucy can analyze your dataset. [Analyze now] [Dismiss]". Persist in localStorage.
**Components:** `LucyDatasetAssistant.tsx`, `LucyChat.tsx`
**Effort:** M

---

### 4. Data Display & Tool Results

#### 4.1 — Structured tool result renderers (P1)
**Problem:** Tool results show raw JSON in chat. Non-technical users see developer-formatted data. (IA-11, old 4.1)
**Solution:** Add structured renderers for common tools (`get_dataset_stats`, `analyze_coverage`, `get_workflow_status`). Default renderer formats as clean key-value table instead of raw JSON.
**Components:** `lucy-agent/` renderers, `LucyDefaultToolRenderer.tsx`
**Effort:** M

#### 4.2 — Structured plan editor (P1)
**Problem:** Setup plan is raw markdown text. Editing requires markdown knowledge. (IA-15, old 4.2)
**Solution:** Add structured form view with collapsible sections (Topics, Generation Strategy, Evaluation Criteria). Raw markdown as secondary "Advanced" toggle.
**Components:** `SetupPlanEditor.tsx`, `propose-setup-plan.ts` types
**Effort:** M

#### 4.3 — Scannable stats + coverage legend (P1)
**Problem:** Records header stats too dense. Tab badges inconsistent (numbers vs dots). Topic tree coverage indicators lack legend. (IA-08, IA-09, PP-11, R-4.1)
**Solution:** Simplify header to stat pills. Standardize badges to numeric. Add colored legend to topic tree.
**Components:** `RecordsSectionHeader.tsx`, `SectionTabs.tsx`, `CoverageIndicator.tsx`
**Effort:** M

#### 4.4 — AI-generated record badge (P2)
**Problem:** No visual distinction between human-created and AI-generated records. (PP-14, R-4.2)
**Solution:** Small "AI" chip on synthetically generated records.
**Components:** `SourceCell.tsx`
**Effort:** S


---

### 5. Evaluation Section

#### 5.1 — Visual evaluation builder for non-developers (P1)
**Problem:** Evaluation requires JavaScript in Monaco editor. Non-technical users face a barrier. (PP-10, R-5.1)
**Solution:** Add "Simple Mode" / "Code Mode" toggle. Simple Mode: form with metric types, thresholds, rubric criteria. Generates JavaScript.
**Components:** `EvaluationConfigPanel.tsx`, `JavaScriptPanel.tsx`, new `SimpleEvaluationBuilder.tsx`
**Effort:** M

#### 5.2 — Friendly dry run errors + inline config (P1)
**Problem:** Dry run failures show technical backend errors. Config hidden behind gear icon. (IA-10, IA-13, R-5.2)
**Solution:** Translate errors to plain English with fix suggestions. Show dry run config summary inline.
**Components:** `dry-run-dialog/`, `EvaluationConfigPanel.tsx`
**Effort:** M

---

### 6. Finetune Section

#### 6.1 — Surface training config (P1)
**Problem:** Training config hidden behind gear icon. "Prerequisites missing" is a tiny 10px indicator with no navigation links. (IA-12, IA-04, PP-02, R-6.1)
**Solution:** Show config as primary content when no jobs (not in popover). Replace AlertCircle with full-width prerequisites banner with clickable links.
**Components:** `FinetuneConfigPanel.tsx`
**Effort:** M

#### 6.2 — Finetune theme-aware colors (P1)
**Problem:** `FinetuneConfigPanel` and `FinetuneBottomPanel` use hardcoded zinc-* colors that break in light mode. (VI-2.3, VI-2.4, VI-4.1, R-6.2)
**Solution:** Replace all hardcoded zinc references with semantic tokens (`bg-muted`, `text-muted-foreground`, `border-border`).
**Components:** `FinetuneConfigPanel.tsx`, `FinetuneBottomPanel.tsx`
**Effort:** S

---

### 7. Plan & Execution Flow

#### 7.2 — Persist execution progress (P1)
**Problem:** In-memory execution store lost on page refresh. (PP-09, R-7.2)
**Solution:** Save progress to IndexedDB. Restore on load. Show "Execution interrupted. [Resume] [Start Over]" if interrupted.
**Components:** `proposed-plan-store.ts`, `ExecutionProgressCard.tsx`
**Effort:** M

#### 7.3 — Execution cancel mechanism (P1)
**Problem:** No way to cancel/pause/abort plan execution once started. (old 5.2, 16.4)
**Solution:** Add "Cancel" button to ExecutionProgressCard. Gracefully stop after current step completes.
**Components:** `ExecutionProgressCard.tsx`, `execute-setup-plan.ts`
**Effort:** M

#### 7.4 — Plan execution success celebration (P2)
**Problem:** Success indicator is a tiny dot. Anticlimactic after multi-step process. (old 17.4)
**Solution:** Prominent success banner with green checkmark, execution summary ("7/7 steps completed").
**Components:** `PlanExecutedView.tsx`
**Effort:** S

---

### 8. Error Handling & Feedback

#### 8.1 — Chat error recovery (P0)
**Problem:** Connection/streaming errors show bare red div with no retry, dismiss, or guidance. Lucy connection failure has no retry button. Failed plan generation can get stuck in loading. (VI-1.1, VI-1.2, VI-1.3, old 13.1, R-3.2)
**Solution:** Add Retry/Dismiss buttons on chat errors. Add "Retry Connection" on connection failure with 10s timeout. Add 30s timeout on plan generation with retry/cancel.
**Components:** `LucyChat.tsx`, `LucyDatasetAssistant.tsx`, `ConnectGatewayCard.tsx`, `PlanLoadingState.tsx`
**Effort:** S

#### 8.2 — Execution completion CTA balance (P0)
**Problem:** "Start Fine-tuning" is prominent themed button while "Review Data" is secondary outline. Encourages skipping data review. (old 13.2)
**Solution:** Give both buttons equal visual weight. Add note: "We recommend reviewing your generated data before training."
**Components:** `ExecutionProgressCard.tsx`
**Effort:** S

#### 8.3 — User-friendly tool results + display names (P1)
**Problem:** Tool results are raw data. Step names are developer-facing (topics_config, grader_config). Tool card expand targets unclear. (IA-05, IA-11, VI-3.4, R-8.1)
**Solution:** Display name mapping (`topics_config` → "Topic Setup", etc.). Human-readable summary per tool card. Visible "Show details" label.
**Components:** `types.ts`, `LucyDefaultToolRenderer.tsx`
**Effort:** M

#### 8.4 — Stop auto-switching tabs (P1)
**Problem:** Events auto-switch active tab, disorienting users working in another tab. (old 8.1)
**Solution:** Replace auto-switching with pulsing dot on Plan tab + toast notification. Remove `setActiveSection("plan")` calls.
**Components:** `DatasetDetailContentV2.tsx`, `PlanSection.tsx`
**Effort:** S

---

### 9. Terminology & Labeling

#### 9.1 — Standardize terminology (P1)
**Problem:** Multiple terms for same concepts: "Finetune"/"Fine-tune"/"Fine-Tuning", "Records"/"Data"/"Training Data", "Evaluation"/"Grader"/"Quality Scoring", "Knowledge Sources"/"Documents". (old 6.1)
**Solution:** Canonical map:

| User-Facing | Replace | Code Only |
|---|---|---|
| Fine-tune / Fine-tuning | Finetune, Fine-Tuning | finetune |
| Training data | Records, Data, Training Examples | records |
| Quality scoring | Evaluation, Evaluator, Grader | grader |
| Reference documents | Knowledge Sources, Documents | knowledge_sources |
| Validation check | Dry Run | dry_run |

**Components:** `SectionTabs.tsx`, `LucyDatasetAssistant.tsx`, tooltips across `datasets/`, agent prompt
**Effort:** M

---

### 10. Visual Consistency & Polish

#### 10.5 — Update state-machine docs for disabled Deploy (P2)
**Problem:** `state-machine.md` lists deployment as Step 7 but UI has disabled it. (old 10.6)
**Solution:** Add "NOT YET IMPLEMENTED" note to deployment step section.
**Components:** `docs/features/lucy-finetune-dataset/state-machine.md`
**Effort:** S

---

## Upstream Changes (@distri/react)

These require changes in the distri repo. File issues and sync via `scripts/sync-distrijs.sh`.

#### U.1 — Fix non-functional Retry button (P1)
`MessageRenderer.tsx:202` has a Retry button with no `onClick` handler.

#### U.2 — Replace hardcoded colors in ChatInput and tool results (P1)
`ChatInput.tsx` uses `bg-[#0d0d0d]`, `ToolExecutionRenderer.tsx` uses `text-green-600`, `Chat.tsx` uses `border-yellow-400`. Replace with theme-aware tokens.

#### U.3 — Enable message queuing during streaming (P1)
`ChatInput.tsx:375-376` disables textarea during streaming, contradicting "Message will be queued..." placeholder. Keep textarea enabled, queue submitted messages. (VI-3.1)

#### U.4 — Expand file upload accept types (P1)
`ChatInput.tsx:439` hardcodes `accept="image/*"`. Expand to include `.pdf,.csv,.txt,.md,.json,.doc,.docx`. This repo's `handleBeforeSendMessage` already handles file processing.

---

## Resolved Proposals

| ID | Title | Resolution |
|----|-------|------------|
| — | Delete dead pipeline components (WorkflowStepIndicator, DatasetStepper) | Deleted. `SectionTabs` is sole pipeline representation. |
| — | Replace Deploy tab with download weights | Download weights added to finetune jobs UI. Deploy shows "Coming Soon". |
| — | Make locked Finetune tab actionable | Popover with prerequisite checklist and navigation links in `SectionTabs.tsx`. |
| — | Distinguish optional vs required steps | `required` flag + tooltip prefix ("Required ·" / "Optional ·") + dashed border for optional. |
| — | Add getting-started guidance | Enhanced `EmptyRecordsState` with 3-stage overview, dual CTAs, import link. |
| — | Dynamic transition screen duration | 800ms without files, 2.5s with files. |
| — | Differentiate sidebar loading states | Three distinct visuals: gear (config), dimmed avatar (loading), plug+progress (connecting). |
| — | Collapsed sidebar error indicator | Red dot badge on collapsed Lucy avatar when provider unconfigured. |
| — | Context-aware quick actions | `getContextualQuickActions()` filters by records, evaluator, and jobs state. |
| — | PDF uploads in chat input | This repo ready. Blocked on upstream `ChatInput.tsx` `accept` attribute (see U.4). |
| — | PlanExecutedView clear confirmation | Collapse behavior instead of immediate clear. "Dismiss" for permanent removal. |
| — | Standardize error message placement | Audited: already follows toast/inline/validation hierarchy. No changes needed. |
| — | Improve completion CTA | Themed success card with checkmark, "Setup Complete", primary "Start Fine-tuning" button. |
| — | Beta badge tooltip | Wrapped in Tooltip: "Lucy is in beta. AI-generated content should be reviewed for accuracy." |
| — | Replace hardcoded dark-mode colors (SectionTabs) | Main offender deleted. `SectionTabs` uses proper tokens. |
| — | Standardize loading/spinner patterns | Shared `LoadingIndicator` component with inline/section/progress variants. |
| — | Tone down AlertTriangle pulse | Moot: `DatasetStepper.tsx` deleted. |
| — | Improve empty state consistency | Shared `EmptyStateTemplate.tsx` used across Plan, Readme, Datasets empty states. |
| — | Fix download weights discoverability | Always visible (removed hover-only). Uses `triggerFileDownload()` helper. |
| — | Standardize download weights button styling | All 3 locations: `outline` variant, `h-4 w-4` icon, "Download Weights" label. |
| — | Distinguish "Coming Soon" from "prerequisites not met" | `"comingSoon"` ArrowSegmentStatus: Clock icon, dashed border, faded, non-interactive. |
| — | Fix hardcoded colors in finetune job components | Opacity-based pattern: `text-green-500`, `bg-red-500/15 text-red-500`. |
| 1.1 | Event-driven auto-plan trigger | Replaced `setTimeout(2000)` with event-driven approach: listens for `vllora_knowledge_source_updated`, triggers plan when all docs ready, 60s timeout fallback. |
| 1.2 | Transition screen escape route | Added "Skip" link + "Continue to dataset" fallback button after 5s timeout on Meet Lucy transition screen. |
| 1.3 | Plan dismiss confirmation | Added AlertDialog confirmation before discarding plan. Renamed "Dismiss" to "Discard Plan" with destructive styling. |
| 2.2 | Back navigation breadcrumb | Skipped — sidebar Datasets menu link provides equivalent navigation. |
| 3.1 | Plan empty state dead end fix | Button shows spinner + "Waiting for Lucy..." after click. 10s timeout shows warning + "Retry Generate Plan". |
| 4.5 | Better dataset naming | Added editable name input in ObjectiveInputTab footer. Auto-suggests from objective (first 5 words), user can edit before creating. |
| 7.1 | Deduplicate ExecutionProgressCard | Skipped — chat sidebar progress is intentional: provides continuous execution visibility when user switches tabs away from Plan. |
| 10.1 | Visual consistency audit | Standardized `rounded-lg` on cards (`ConnectGatewayCard`, `ImportFileCard`, `KnowledgeSourcesPanel`), `rounded-md` on icon containers. |
| 10.2 | Quick action emojis → Lucide icons | Replaced emoji strings with Lucide icons (`Rocket`, `BarChart3`, `TrendingUp`, `Sparkles`, `Scale`, `FlaskConical`). Updated `QuickAction.icon` type to `ReactNode`. |
| 10.3 | Dataset loading skeleton | Replaced "Loading dataset..." text with skeleton layout mirroring sidebar + header + tabs + content grid. |
| 10.4 | Knowledge sources per-document status | `DocsProcessingState` now shows per-document filename + spinner/checkmark/warning. 30s stuck detection with amber "Slow" label. |

---

## Appendix A: User Flow Map

### Screen 1: Empty Datasets State
`src/components/datasets/empty-dataset-state/index.tsx`
- "What is the objective of your dataset?" heading
- Tabs: "Enter Objective" | "Initialize via API"
- Textarea + file upload + suggestion pills + "Start Finetune" button
- → Creates dataset → Transition screen → Dataset detail

### Screen 2: Onboarding Transition
`empty-dataset-state/index.tsx:232-278`
- "Meet Lucy" animation, auto-redirect (2.5s files / 800ms no-files)
- No user actions (escape route needed — see Proposal 1.2)

### Screen 3: Dataset Detail (two-panel)
`DatasetDetailContentV2.tsx` — Lucy sidebar (340-384px) + Main content

| Tab | Content |
|-----|---------|
| **Data** | Records (Canvas/Table), topic hierarchy, coverage, import/export |
| **Evaluation** | Monaco editor (JS grader), dry run bottom panel (results/history) |
| **Finetune** | Jobs list, settings popover, prerequisites check |
| **Plan** | Priority-based: docs processing → generating → proposed → executing → executed → empty |
| **Docs** | Knowledge source cards with status |
| **Readme** | Auto-generated markdown |

### Lucy Sidebar States
Checking config → Provider check → Loading agent → Connected → Connecting

### Quick Actions (context-sensitive)
No records → "Start training setup", "Create examples" | Has records → "Check variety", "Set up scoring" | Has evaluator → "Test before training", "Start training" | Has jobs → "Check progress"

---

## Appendix B: Raw Reviewer Findings

### UX Flow Analyst (15 findings)

| ID | Sev | Finding | Component |
|----|-----|---------|-----------|
| PP-01 | P0 | No back navigation | `DatasetDetailContentV2.tsx` |
| PP-02 | P0 | Finetune tab lock-out, no inline guidance | `SectionTabs.tsx:81` |
| PP-03 | P0 | `autoGeneratePlan` 2s race condition | `DatasetDetailContentV2.tsx:262` |
| PP-04 | P1 | Quick actions don't map to tools/tabs | `LucyDatasetAssistant.tsx:46-54` |
| PP-05 | P1 | Plan tab only discoverable by accident | `PlanEmptyState.tsx`, `SectionTabs.tsx:46` |
| PP-06 | P1 | Plan dismiss: no confirmation | `PlanSection.tsx:226-233` |
| PP-07 | P1 | Deploy "Coming Soon" dead end | `SectionTabs.tsx:39` |
| PP-08 | P1 | Sidebar auto-collapse, no pin | `LucyDatasetAssistant.tsx:105-106` |
| PP-09 | P1 | Execution progress lost on refresh | `execution-state-store.ts` |
| PP-10 | P1 | Eval script: no guided setup | `EvaluationConfigPanel.tsx:50-62` |
| PP-11 | P2 | Tab badge inconsistency | `SectionTabs.tsx:180-200, 304-309` |
| PP-12 | P2 | Quick actions `jobsCount` hardcoded 0 | `LucyDatasetAssistant.tsx:282-289` |
| PP-13 | P2 | Poor auto-generated dataset names | `empty-dataset-state/index.tsx:167-168` |
| PP-14 | P2 | No AI vs human record distinction | Records table/canvas |
| PP-15 | P2 | Beta badge: no feedback link | `LucyDatasetAssistant.tsx:498-506` |

### Visual & Interaction Reviewer (29 findings)

| ID | Sev | Finding | Component |
|----|-----|---------|-----------|
| VI-1.1 | P0 | No error recovery for connection failure | `LucyDatasetAssistant.tsx:430-438` |
| VI-1.2 | P0 | Chat error: no retry/dismiss | `LucyChat.tsx:416-419` |
| VI-1.3 | P1 | Failed plan generation: stuck loading | `PlanSection.tsx:237-313` |
| VI-1.4 | P1 | Finetune empty state generic | `FinetuneBottomPanel.tsx:196-199` |
| VI-1.5 | P1 | ExecutionProgressCard: bare initial state | `ExecutionProgressCard.tsx:63-71` |
| VI-1.6 | P2 | LucyWelcome: wrong default text | `LucyWelcome.tsx:63-68` |
| VI-1.7 | P2 | PlanEmptyState: no differentiation | `PlanEmptyState.tsx:17-42` |
| VI-2.1 | P0 | Arrow stepper vs icon tabs confusion | `SectionTabs.tsx:143-319` |
| VI-2.2 | P1 | Beta badge competes with actions | `LucyDatasetAssistant.tsx:496-506` |
| VI-2.3 | P1 | FinetuneConfigPanel: hardcoded zinc-* | `FinetuneConfigPanel.tsx:137-314` |
| VI-2.4 | P1 | FinetuneBottomPanel: same issue | `FinetuneBottomPanel.tsx:77-263` |
| VI-2.5 | P1 | Message bubble ml-8 misalignment | `LucyMessage.tsx:125` |
| VI-2.6 | P2 | SetupPlanEditor thin header | `SetupPlanEditor.tsx:40-53` |
| VI-2.7 | P2 | Undefined `--theme-rgb` CSS var | `LucyChatInput.tsx:367` |
| VI-3.1 | P0 | Textarea disabled during streaming | `LucyChatInput.tsx:375-376` |
| VI-3.2 | P1 | Locked tabs: no click affordance | `SectionTabs.tsx:206-246` |
| VI-3.3 | P1 | "Dismiss" vs "Clear" confusion | `PlanExecutedView.tsx:43-46, 63-66` |
| VI-3.4 | P1 | Tool card expand target unclear | `LucyToolCallCard.tsx:77-106` |
| VI-3.5 | P1 | Quick actions send label as message | `LucyChat.tsx:315-318` |
| VI-3.6 | P2 | Attachment tooltip too long | `LucyChatInput.tsx:391` |
| VI-3.7 | P2 | Voice: no stop/cancel | `LucyChatInput.tsx:344-354` |
| VI-4.1 | P1 | Theme inconsistency: finetune vs rest | Multiple finetune components |
| VI-4.2 | P1 | Message bubble styling inconsistent | `LucyMessage.tsx`, `LucyAssistantMessage.tsx` |
| VI-4.3 | P1 | Timestamp formatting differs | Multiple Lucy components |
| VI-4.4 | P1 | Icon size inconsistency | Multiple components |
| VI-4.5 | P2 | Border radius inconsistency | Multiple components |
| VI-4.6 | P2 | LucyAvatar: "avarta" typo | `LucyAvatar.tsx:61` |
| VI-5.1 | P1 | Dual tool rendering paths | `LucyToolCallCard.tsx`, `LucyToolExecutionRenderer.tsx` |
| VI-5.2 | P1 | Excessive console.log | `LucySetupPlanRenderer.tsx:43-114` |
| VI-5.3 | P1 | Progress in both chat and Plan tab | `LucyExecutePlanRenderer.tsx:53-61` |
| VI-5.5 | P2 | Tool card: empty output tab default | `LucyToolCallCard.tsx:31` |
| VI-5.6 | P2 | Agent handover: confusing box | `LucyMessageRenderer.tsx:89-95` |

### Information Architecture Reviewer (19 findings)

| ID | Sev | Finding | Component |
|----|-----|---------|-----------|
| IA-01 | P0 | 7-step pipeline vs 4-tab mismatch | `SectionTabs.tsx:35-47` |
| IA-02 | P0 | Ambiguous sidebar/canvas ownership | `LucyDatasetAssistant.tsx`, `DatasetDetailContentV2.tsx` |
| IA-03 | P0 | 9 tabs = cognitive overload | `SectionTabs.tsx:35-47` |
| IA-04 | P0 | "Prerequisites missing" not actionable | `FinetuneConfigPanel.tsx:146-158` |
| IA-05 | P1 | Developer-facing step names | `state-machine.md:71-80` |
| IA-06 | P1 | Required vs optional not distinct | `ArrowSegment.tsx:88-95` |
| IA-07 | P1 | Plan in both chat + Plan tab | `PlanSection.tsx`, `LucySetupPlanRenderer.tsx` |
| IA-08 | P1 | Records header stats too dense | `RecordsSectionHeader.tsx:60-72` |
| IA-09 | P1 | Coverage indicators lack legend | `TopicNodeHeader.tsx`, `CoverageIndicator.tsx` |
| IA-10 | P1 | Dry run errors are technical | `ExecutionProgressCard.tsx:239-251` |
| IA-11 | P1 | Tool results: not user-friendly | Tool renderers |
| IA-12 | P1 | Training config hidden in gear | `FinetuneConfigPanel.tsx:162-265` |
| IA-13 | P1 | Dry run config hidden in gear | `EvaluationConfigPanel.tsx:326-377` |
| IA-14 | P1 | Empty states lack guidance | `PlanEmptyState.tsx` |
| IA-15 | P2 | Plan markdown not scannable | `SetupPlanEditor.tsx:56-60` |
| IA-16 | P2 | Execution step names generic | `ExecutionProgressCard.tsx:166-203` |
| IA-17 | P2 | Knowledge source errors silent | `KnowledgeSourcesPanel.tsx:28-38` |
| IA-18 | P2 | No centralized settings page | N/A |
| IA-19 | P2 | Quick actions change unexplained | `LucyDatasetAssistant.tsx:57-90` |

---

## Appendix C: Revision History

| Date | Round | Changes |
|------|-------|---------|
| 2026-02-11 | Initial review | 3 reviewers, 32 proposals (3 P0, 13 P1, 7 P2, 3 upstream) |
| 2026-02-11 | Re-review | 4 resolved, 6 new proposals added (10.1-10.6) |
| 2026-02-11 | Implementation | 11 resolved (1.3, 1.4, 2.1, 2.2, 3.1-3.4, 5.1, 5.4, 6.2), 1 audited (5.3) |
| 2026-02-11 | Consistency | 2 resolved (7.3, 7.5) — shared LoadingIndicator + EmptyStateTemplate |
| 2026-02-11 | Finetune polish | 4 resolved (10.1-10.4) — download weights, coming-soon state, colors |
| 2026-02-11 | Comprehensive 4-agent review | New proposals: 11.1-18.1 (7 P0, 14 P1, 5 P2) |
| 2026-02-11 | 4-agent synthesis | 63 findings → 25 proposals (R-1.1 through R-9.3) |
| 2026-02-11 | Reorganization | Deduplicated, unified numbering, clean structure |
