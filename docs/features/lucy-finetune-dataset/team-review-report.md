# Consolidated Agent Team Review: vLLora Fine-Tuning Web App

**Date:** 2026-02-10
**Branch:** feat/finetune-integration
**Reviewers:** UX Specialist, Technical Architect, UI Designer, Devil's Advocate

---

## Team Members

- **UX Specialist** - User experience and journey analysis
- **Technical Architect** - Code architecture and reliability
- **UI Designer** - Visual design and design system
- **Devil's Advocate** - Fundamental challenges and hidden risks

---

## Cross-Team Critical Issues (Consensus)

These issues were flagged by multiple agents as highest priority:

### 1. Jarring Transition After "Start Finetune" (UX + UI Design)

After clicking "Start Finetune", users are dropped into a complex tabbed interface (7 tabs) with an AI chatbot auto-analyzing their empty dataset. No transition screen, no orientation, no explanation of Lucy or the workflow.

### 2. Pending Plan Race Condition (Architecture + Devil's Advocate)

The approved plan is stored in a module-level variable with a 60-second auto-clear. If the agent takes >60s to invoke `execute_setup_plan`, the plan silently nullifies. No fallback to the IndexedDB-persisted plan.

**File:** `src/lib/distri-finetune-tools/steps/execute-setup-plan.ts`, lines 22-34

### 3. Rollback Snapshot ID Parsing Bug (Architecture)

`snapshotId.split('-')[0]` only gets the first segment of a UUID (e.g., `a1b2c3d4` from `a1b2c3d4-e5f6-7890-...`). **Every rollback operation silently returns null.**

**File:** `src/services/finetune-workflow-db.ts`, lines 497-503

### 4. No Binary Integrity Verification (Architecture + Devil's Advocate)

The Distri binary is downloaded from GitHub and executed without checksum/signature verification. Supply chain attack vector.

**File:** `gateway/src/distri.rs`, lines 181-198

### 5. Client-Side Data Loss Risk (Devil's Advocate)

All data stored in IndexedDB. Clearing browser data = everything lost. No backup, no cloud sync, no export-before-delete warning.

### 6. Dual Color Token Systems (UI Design)

shadcn/ui HSL tokens vs theme RGB tokens used inconsistently. Primary action color is ambiguous. Hardcoded `emerald-*`, `zinc-*`, `purple-*` colors break theme switching.

---

## UX Specialist Report

### Strengths

1. **Strong Entry Point Design** - `ObjectiveInputTab` with large textarea, sparkle icon, suggestion pills, hint text.
2. **Drag-and-Drop Document Upload** - `KnowledgeSourcesUpload` integrates file upload directly into objective input card.
3. **Proactive AI Assistant (Lucy)** - Auto-analyzes dataset on first open via `buildDatasetAnalysisPrompt`. `ask_follow_up` creates structured choice cards.
4. **Setup Plan as Core UX Primitive** - Upload docs -> propose plan -> review/edit -> approve -> execute. `SetupPlanEditor` renders markdown with preview/edit toggle.
5. **Collapsible Lucy Sidebar** - Collapse/expand preserves chat state via `hidden` class.
6. **Quick Actions for Common Tasks** - Six one-click actions in Lucy welcome screen.
7. **Workflow Arrow Stepper Tabs** - `ArrowSegment` SVG-based stepper communicates progression visually.
8. **Sample Dataset "Escape Hatch"** - "Chess Tutor Sample" button for immediate exploration.

### Concerns

| Severity | ID | Issue |
|----------|----|-------|
| Critical | C1 | Jarring transition from objective input to dataset detail page - no orientation |
| Critical | C2 | Lucy's welcome message is generic ("traces/logs") not finetune-specific |
| Critical | C3 | OpenAI API key required with no upfront warning on objective page |
| High | H1 | Tab labels expose technical jargon ("Evaluation Config", "Finetune", "README") |
| High | H2 | Quick actions use technical terms ("synthetic data", "grader", "dry run") |
| High | H3 | No guidance on what the Plan tab is or why it appeared |
| High | H4 | No recovery path if user closes tab during plan execution |
| High | H5 | Fixed 384px sidebar not responsive - unusable on tablets/small laptops |
| Medium | M1 | "Start Finetune" button label is misleading (doesn't start training) |
| Medium | M2 | Two separate file upload paths create confusion |
| Medium | M3 | Seven tabs is overwhelming for non-technical users |
| Medium | M4 | Agent definition leaks technical terms (LoRA rank, learning rate, epochs) |
| Medium | M5 | Plan editor edit mode exposes raw markdown |
| Medium | M6 | No file size limits or upload feedback for large files |
| Low | L1 | Character count alone is insufficient feedback for objectives |
| Low | L2 | "Initialize via API" tab exposed to non-technical users |
| Low | L3 | Inconsistent loading state labels |
| Low | L4 | No ARIA attributes on interactive elements |
| Low | L5 | WorkflowStepIndicator is commented out |

### Recommendations

| Priority | Recommendation |
|----------|---------------|
| Critical | R1: Add transition/onboarding screen between objective input and dataset detail |
| Critical | R2: Replace generic Lucy welcome with finetune-specific greeting |
| Critical | R3: Check OpenAI API key before dataset creation, not after |
| High | R4: Rename tabs using non-technical language (e.g., "Quality Check" not "Evaluation Config") |
| High | R5: Rewrite quick actions for plain language |
| High | R6: Add brief explanation to Plan tab on first appearance |
| High | R7: Implement session recovery for plan execution |
| High | R8: Make Lucy sidebar responsive |
| Medium | R9: Rename "Start Finetune" to "Create Project" or "Get Started" |
| Medium | R10: Unify file upload paths or differentiate clearly |
| Medium | R11: Progressively disclose tabs (initially show only 3) |
| Medium | R12: Hide plan edit mode or restrict to advanced users |
| Medium | R13: Add file size validation and upload progress |

---

## Technical Architect Report

### Strengths

1. **Well-Designed Workflow State Machine** - Explicit step ordering, validated transitions, snapshot-based rollback, automatic snapshot creation.
2. **Separation of Concerns in Tool Architecture** - 4 workflow tools + 28+ step tools + domain-specific (Stockfish). Pure async handlers with structured result types.
3. **Guided Onboarding via Setup Plans** - 7-step pipeline with per-step progress emission, non-fatal failure handling.
4. **Dual Event Systems for Different Scopes** - mitt (typed, React) + CustomEvent (cross-framework).
5. **Graceful Degradation in Binary Management** - Version checking, fallback to existing binaries, platform detection.
6. **Persistent Proposed Plans** - IndexedDB persistence survives page refreshes.

### Concerns

| Severity | ID | Issue | File |
|----------|----|-------|------|
| Critical | C1 | Pending plan module-level state with 60s auto-clear, not multi-tab safe | `steps/execute-setup-plan.ts:22-34` |
| Critical | C2 | Rollback snapshot ID parsing always returns null (`split('-')[0]` on UUID) | `services/finetune-workflow-db.ts:497-503` |
| Critical | C3 | No binary integrity verification for Distri download | `gateway/src/distri.rs:181-198` |
| High | H1 | No reconnection logic for Distri server (stale `isConnected`) | `providers/DistriProvider.tsx` |
| High | H2 | Cached IndexedDB connections can become stale (no `onclose` handler) | `services/finetune-workflow-db.ts:172`, `knowledge-sources-db.ts:27` |
| High | H3 | LLM config cache never invalidates | `steps/propose-setup-plan/llm-service.ts:17-23` |
| High | H4 | Race condition in event-driven plan approval flow | `steps/execute-setup-plan.ts` |
| High | H5 | PDF extraction runs entirely client-side, no size limits | `steps/pdf-extractor.ts` |
| Medium | M1 | Dual event systems (mitt + CustomEvent) create confusion | Multiple files |
| Medium | M2 | Knowledge source raw content (base64) stored alongside extracted content | `services/knowledge-sources-db.ts:89` |
| Medium | M3 | No file upload validation (size, MIME, type verification) | `steps/knowledge-sources.ts:370-411` |
| Medium | M4 | Two IndexedDB databases without cascading deletes | `finetune-workflow-db.ts`, `knowledge-sources-db.ts` |
| Medium | M5 | External tool timeout of 600s with no cancellation mechanism | `vllora-finetune-agent.md:29` |
| Medium | M6 | Hardcoded model defaults scattered across files | `llm-service.ts:66`, `quick-finetune.ts:95` |
| Low | L1 | Verbose console logging in production | All tool handlers |
| Low | L2 | Mixed ID generation strategies (crypto.randomUUID vs Date.now+Math.random) | `execute-setup-plan.ts:127` |
| Low | L3 | Naive string matching for knowledge search | `knowledge-sources-db.ts:253-292` |
| Low | L4 | 5-second auto-clear on execution completion state | `execution-state-store.ts:62-69` |

### Recommendations

| Priority | Recommendation |
|----------|---------------|
| P1 | R1: Fix rollback snapshot ID parsing (use workflow ID from snapshot record) |
| P1 | R2: Add IndexedDB fallback to plan consumption, remove 60s timeout |
| P2 | R3: Add periodic Distri health checks (every 30s) |
| P2 | R4: Handle stale IndexedDB connections (add `onclose` handler) |
| P3 | R5: Add binary checksum verification (SHA-256) |
| P3 | R6: Add file upload validation (size limits, MIME type, magic bytes) |
| P4 | R7: Clean up raw content after extraction |
| P4 | R8: Add size limits to PDF processing |
| P5 | R9: Unify event systems to typed mitt emitter |
| P5 | R10: Centralize model configuration in `model-defaults.ts` |
| P5 | R11: Add TTL to LLM config cache |
| P6 | R12: Add structured logging utility |
| P6 | R13: Add cross-database cascade deletes |

---

## UI Designer Report

### Strengths

1. **Entry Flow (Empty Dataset State)** - Hero title with accent color, pill-style tab switcher, gradient border hover effect, suggestion pills, "Chess Tutor Sample" CTA.
2. **Theme Architecture** - CSS custom properties as RGB triplets, 11 color themes, proper HSL shadcn/ui tokens, `applyTheme()` forces dark mode.
3. **Lucy Avatar** - Three sizes, emerald glow aura, optional pulse and Zap badge.
4. **Section Tabs (ArrowSegment Stepper)** - SVG-based arrow/chevron, three states with color coding, checkmark on completion.
5. **Plan Section State Management** - Five distinct visual states with dedicated components.
6. **Typing Indicator** - Theme-colored bouncing dots with staggered delays.

### Concerns

| Severity | ID | Issue | Affected Files |
|----------|----|-------|---------------|
| Critical | C1 | Dual color token systems (`--primary` HSL vs `--theme-500` RGB) create ambiguity | `LucyChatInput.tsx:422`, `ObjectiveInputTab.tsx:116`, `SetupPlanEditor.tsx:82`, `PlanEmptyState.tsx:46`, `ExecutionProgressCard.tsx:77,83,160-161` |
| Critical | C2 | Hardcoded colors break theme switching | `LucyAvatar.tsx:53,69,73` (emerald), `LucyAssistantMessage.tsx:55` (zinc), `LucyUserMessage.tsx:43` (zinc), `LucyMessage.tsx:91,137` (purple), `LucyChatInput.tsx:314-319` (red/blue), `SectionTabs.tsx:144` (blue), `DocsProcessingState.tsx:33,45-46` (amber) |
| High | H1 | Two parallel message rendering systems with different styles | `LucyMessage.tsx` vs `LucyAssistantMessage.tsx`/`LucyUserMessage.tsx` |
| High | H2 | 384px sidebar too wide for standard laptops (1366px) | `LucyDatasetAssistant.tsx:399` |
| High | H3 | Font inconsistency in timestamps (`font-mono` in some, not others) | `LucyWelcome.tsx:48`, `LucyAssistantMessage.tsx:43`, `LucyMessage.tsx:129,150` |
| High | H4 | Scrollbars globally hidden - accessibility concern | `index.css:97-104` |
| Medium | M1 | Transition duration inconsistency (150ms, 200ms, 300ms, 500ms ad-hoc) | Multiple components |
| Medium | M2 | Max-width mismatch: welcome 85%, newer messages 100% | `LucyWelcome.tsx:56`, `LucyAssistantMessage.tsx:49`, `LucyUserMessage.tsx:43` |
| Medium | M3 | Gradient overlay height inconsistency (h-12 vs h-8) | `ObjectiveInputTab.tsx:87`, `ApiInitializeTab.tsx:211` |
| Medium | M4 | Quick actions use emoji icons instead of Lucide | `LucyDatasetAssistant.tsx:46-76` |
| Medium | M5 | Three different user avatar implementations, none theme-aware | `LucyMessage.tsx:91`, `LucyUserMessage.tsx:37` |
| Medium | M6 | No focus ring on custom buttons (suggestion pills, tab switcher, quick actions) | `ObjectiveInputTab.tsx:138-149`, `EmptyDatasetsState:235-256`, `LucyWelcome.tsx:76-90` |
| Medium | M7 | Inline `<style>` tag in JSX for keyframes | `PlanLoadingState.tsx:34-40` |
| Low | L1 | Duplicate keyframes in Tailwind config | `tailwind.config.js:71-103` |
| Low | L2 | `theme: 'colors.emerald'` string literal may not resolve | `tailwind.config.js:57` |
| Low | L3 | Typo: `/lucy-avarta.png` should be `/lucy-avatar.png` | `LucyAvatar.tsx:61` |
| Low | L4 | "Beta" badge uses hardcoded emerald | `LucyDatasetAssistant.tsx:446` |

### Recommendations

| Priority | Recommendation |
|----------|---------------|
| Critical | R1: Unify primary action color token (map `--primary` to theme color or create `--brand`) |
| Critical | R2: Replace all hardcoded colors with theme-aware tokens |
| High | R3: Restore scrollbar visibility (remove global hiding, apply selectively) |
| High | R4: Reduce Lucy sidebar default width (384px -> 340px or responsive) |
| Medium | R5: Establish transition duration scale (Fast 150ms, Normal 200ms, Slow 300-500ms) |
| Medium | R6: Standardize message bubble max-width to 85% |
| Medium | R7: Replace emoji quick action icons with Lucide |
| Medium | R8: Add focus-visible rings to all interactive elements |
| Medium | R9: Consolidate user avatar into single `UserAvatar` component |
| Low | R10: Move inline keyframes to Tailwind config |

---

## Devil's Advocate Report

### Fundamental Challenges

#### 1. The "Non-Technical User" Promise May Be an Illusion

- Users cannot evaluate if 5 topics x 30 records = 150 total is adequate (hardcoded in `llm-service.ts` lines 97-98)
- Auto-generated grader criteria are circular (LLM judges LLM-generated data)
- Base model defaults to `llama-v3-8b-instruct` - users have no basis to evaluate appropriateness
- 8B model fine-tuned on 150 synthetic examples for complex domains may produce dangerously confident but wrong outputs

#### 2. Synthetic Data Quality Is the Weakest Link

- Training data quality limited by GPT-4.1's domain understanding
- Knowledge source sections capped at 1000 chars, text at 3000 chars per source - truncation strips important content
- Validation is self-referential: LLM generates data, LLM evaluates, LLM validates
- No deduplication or quality filtering - identical examples all go into training set

#### 3. RFT Is Not the Right Default for Non-Technical Users

- RFT requires well-designed reward/grader function (auto-generated LLM-as-judge is a prompt, not verifiable metric)
- "Empty output" format requires more examples and more carefully calibrated rewards than SFT
- Chess datasets get Stockfish for data generation but still use LLM-as-judge for evaluation

### Hidden Risks

#### 4. Client-Side Architecture Is a Data Loss Time Bomb

All critical data in browser IndexedDB:
- `datasets-db.ts`: All datasets, records, eval scripts, topic hierarchies
- `finetune-workflow-db.ts`: All workflow state, generation history
- `knowledge-sources-db.ts`: All uploaded PDFs, extracted content
- `dry-run-jobs-db.ts`: All validation results

No backup, no cloud sync, no export-before-delete warning. Browser data clear = everything lost.

#### 5. Pending Plan Race Condition

Module-level variable with 60s timeout. Multi-tab unsafe. No IndexedDB fallback.

#### 6. Binary Download Supply Chain Risk

- No checksum verification
- GitHub API rate limiting (60/hour unauthenticated)
- Silent fallback to outdated binary

#### 7. 1200-Line Agent Prompt Is Fragile

- Instruction adherence degrades with prompt length
- UUID copy problem acknowledged but not solved
- Sub-agent delegation has overlapping responsibilities

#### 8. No Concurrency Control on IndexedDB

Multiple components read/write same stores simultaneously. No cross-store transactions. Browser crash mid-execution = inconsistent state.

#### 9. External Tool Timeout UX Landmine

600s timeout applies to all tools. If execution takes >10min, agent connection severed but browser-side execution continues. Agent may retry or hallucinate response.

### Competitive Analysis

| Feature | vLLora | OpenAI Fine-Tuning UI | Anyscale/Together | Predibase |
|---------|--------|----------------------|-------------------|-----------|
| Data storage | Browser IndexedDB | Server-side | Server-side | Server-side |
| Data loss risk | High | Low | Low | Low |
| Multi-user | No | Yes | Yes | Yes |
| Audit logging | No | Yes | Yes | Yes |
| Custom eval | LLM-as-judge only | Python scripts | Custom code | Custom code |
| Training methods | RFT only | SFT + DPO | SFT + RLHF | SFT + adapters |
| Model hosting | Unclear | Built-in | Built-in | Built-in |
| Data privacy | Sent to OpenAI | Stays with OpenAI | Configurable | Configurable |

### Data Privacy Concerns

- User PDFs base64-encoded in IndexedDB, text sent to OpenAI for extraction and data generation
- Training data generated by OpenAI then sent to backend for fine-tuning
- No data processing agreements, retention policies, or GDPR compliance documented

### Provocative Questions

1. If training data, evaluation criteria, and validation are all LLM-generated, what is the user contributing? Is the result meaningfully different from just prompting GPT-4.1?
2. What happens when the fine-tuned model is worse than the base model? No A/B testing, no comparison, no rollback.
3. Why is all logic client-side? Data loss, no multi-user, no audit trail.
4. Is 150 records sufficient for RFT? Likely too few for non-trivial tasks.
5. What is the actual API cost? Estimated $5-20 for setup alone - undisclosed to users.
6. What prevents agent loops? 30 max iterations but sub-agent delegation and tool calls can chain.

### Constructive Recommendations

| Priority | Recommendation |
|----------|---------------|
| Highest | 1. Add server-side persistence (at minimum "sync to cloud") |
| Highest | 2. Add checksum verification for binary downloads |
| Highest | 3. Implement human-in-the-loop validation for generated data |
| Highest | 4. Add cost estimation and confirmation before execution |
| Highest | 5. Fix pending plan race condition (use IndexedDB, remove 60s timeout) |
| Medium | 6. Add deterministic evaluation options (Stockfish for chess eval, unit tests for code) |
| Medium | 7. Reduce agent prompt length (split into focused sub-agent prompts) |
| Medium | 8. Add storage monitoring and export-to-JSON backup |
| Medium | 9. Add concurrency guards (per-dataset lock in IndexedDB) |
| Medium | 10. Add SFT as first-class option (default for new users) |
| Strategic | 11. Consider wizard UI alongside chat UI |
| Strategic | 12. Add telemetry and error reporting |
| Strategic | 13. Document full cost model |

---

## Documentation Agent Findings

The docs agent analyzed all 7 files in `docs/features/lucy-finetune-dataset/` and identified these gaps:

| File | Status | Key Updates Needed |
|------|--------|-------------------|
| `architecture.md` | Significantly outdated | Step tools 20->29, missing 3rd IndexedDB database, missing component tree, missing knowledge source + guided onboarding tools, thread management incorrect |
| `re-enabling-ask-follow-up.md` | **REMOVED** | File deleted — `ask_follow_up` is now enabled by default, doc was obsolete |
| `guided-onboarding.md` | Minor updates | Missing `?autoGeneratePlan=true` flow, PlanSection path incorrect, missing step 5 "Setup Fine-tune Job" |
| `state-machine.md` | Minor updates | DB version should be 4, missing stores (`dryRunJobs`, `jobEvaluations`, `proposedPlans`), context injection format changed |
| `data-generation-agent.md` | Mostly accurate | Design doc, minor drift |
| `dataset-readme-generation.md` | Mostly accurate | Design doc |
| `vendored-distri-packages.md` | Accurate | No changes needed |
| `README.md` | Mixed | Planning/spec document, some aspirational vs actual |

---

## Priority Matrix: What to Tackle First

### Tier 1: Critical Bugs (Fix Immediately)

| # | Status | Issue | Source | What was done |
|---|--------|-------|--------|---------------|
| 1 | DONE | Fix rollback snapshot ID parsing | Architect C2 | Replaced `snapshotId.split('-')[0]` with `snapshot.workflowId` from the snapshot record in `finetune-workflow-db.ts` |
| 2 | DONE | Fix pending plan race condition | Architect C1, DA #5 | Made `consumePendingPlan` async with IndexedDB fallback via `getProposedPlan()`. Removed 60s auto-clear timeout in `execute-setup-plan.ts` |
| 3 | DONE | Replace generic Lucy welcome with finetune-specific greeting | UX C2 | Added finetune-specific `proactivePrompt` to `LucyChat` in `LucyDatasetAssistant.tsx` |

### Tier 2: High-Impact UX (Next Sprint)

| # | Status | Issue | Source | What was done |
|---|--------|-------|--------|---------------|
| 4 | DONE | Add transition/onboarding screen after "Start Finetune" | UX C1 | Added interstitial in `EmptyDatasetsState` showing Lucy avatar, 3-step overview (Data → Evaluation → Finetune), 2.5s before navigation |
| 5 | SKIPPED | Check OpenAI API key before dataset creation | UX C3 | Skipped - API key is handled elsewhere in the architecture |
| 6 | DONE | Rename tabs to non-technical language | UX H1 | Workflow: Data / Evaluation / Finetune / Deploy. Docs: Reference Docs / Setup Plan / Overview. Equal-width arrow segments via `flex-1`. Updated across `SectionTabs.tsx`, `WorkflowStepIndicator.tsx`, `DatasetStepper.tsx`, `ArrowSegment.tsx` |
| 7 | DONE | Rewrite quick actions in plain language | UX H2 | Updated all 6 labels in `LucyDatasetAssistant.tsx` (e.g., "Generate synthetic data" → "Create more training examples") |
| 8 | DONE | Make sidebar responsive | UX H5, UI H2 | Auto-collapse <1024px, 340px standard, 384px wide (>1536px). Added resize listener in `LucyDatasetAssistant.tsx` |

### Tier 3: Design System Fixes (Parallel Track)

| # | Status | Issue | Source | Effort |
|---|--------|-------|--------|--------|
| 9 | DONE | Unify color token systems | UI C1 | Mapped `--primary` HSL to theme color (emerald-500). Updated `index.css` for light/dark. Added `hexToHsl` to `brand-toggle.tsx` to sync `--primary` when brand color changes. |
| 10 | DONE | Replace hardcoded colors with theme-aware tokens | UI C2 | Replaced hardcoded `emerald-*`, `purple-*`, `zinc-*` with `--theme-*` tokens across 20+ files: Lucy agent components (`LucyAvatar`, `LucyToolCallCard`, `LucyStepIndicator`, `LucyToolRenderer`, `LucyToolActions`, `lucy-ask-follow-up-styles`), dataset navigation (`WorkflowStepIndicator`, `DatasetStepper`, `SectionTabs`), plan section (`DocsProcessingState`, `PlanCompletedState`, `PlanExecutedView`), dry-run dialog, finetune dialog, and message bubbles. |
| 11 | DONE | Restore scrollbar visibility | UI H4 | Removed global scrollbar hiding in `index.css`, added thin scrollbar defaults with theme-aware colors. |
| 12 | DONE | Consolidate user avatar implementation | UI M5 | Created shared `UserAvatar.tsx` with theme-aware gradient. Replaced inline implementations in `LucyMessage.tsx` and `LucyUserMessage.tsx`. |

### Tier 4: Architecture Hardening (Before Production)

| # | Status | Issue | Source | Effort |
|---|--------|-------|--------|--------|
| 13 | TODO | Add Distri server reconnection logic | Architect H1 | Medium |
| 14 | TODO | Handle stale IndexedDB connections | Architect H2 | Small |
| 15 | TODO | Add binary checksum verification | Architect C3, DA #2 | Medium |
| 16 | TODO | Add file upload validation | Architect M3 | Medium |
| 17 | TODO | Add server-side persistence / cloud sync | DA #1 | Large |

### Tier 5: Strategic (Before Scale)

| # | Status | Issue | Source | Effort |
|---|--------|-------|--------|--------|
| 18 | TODO | Human-in-the-loop validation for generated data | DA #3 | Medium |
| 19 | TODO | Add cost estimation and confirmation | DA #4 | Medium |
| 20 | TODO | Add SFT as first-class option | DA #10 | Large |
| 21 | TODO | Add deterministic evaluation options | DA #6 | Medium |
| 22 | TODO | Consider wizard UI alongside chat | DA #11 | Large |
