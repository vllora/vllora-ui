# UX Flow Assessment: Fine-Tuning for Non-Technical Users

**Date:** 2026-02-10
**Branch:** feat/finetune-integration

---

## Overall Verdict

The core flow is **solid (80%)** but has gaps that could confuse non-technical users. The biggest missing piece is a lightweight **"what do I do next?"** indicator.

---

## Complete User Journey

### Step 1: Entry Point (Empty Dataset State)

**What users see:**
- Large headline: "What is the objective of **your dataset?**"
- Subheading: "Define your goal to let our AI agent optimize your data enhancement strategy"
- Two tabs: "Enter Objective" (default) | "Initialize via API"
- Large textarea with placeholder: "Describe what you want your model to do..."
- Suggestion pills: Chess Tutor Assistant | Financial Report Summarizer | Code Generation Assistant
- "Add docs" button for file upload
- "Start Finetune" button (disabled until text entered)
- Sample escape hatch: "or jumpstart with Chess Tutor Sample"

**Assessment:** Excellent. Clear, focused, non-intimidating. Suggestion pills lower the barrier to entry.

### Step 2: Transition Screen

**What users see (2.5 seconds):**
- Lucy Avatar (animated)
- "Meet Lucy, your finetune assistant"
- "Lucy will guide you through preparing data, evaluating quality, and training your model"
- Visual 3-step overview: Data -> Evaluation -> Finetune
- Loading text: "Processing your documents..." or "Setting up your project..."

**Assessment:** Good bridge between empty state and full UI. Sets expectations clearly.

### Step 3: Dataset Detail Page

**Layout:** Two columns - Lucy sidebar (left, 340-384px) + Main content (right)

**Section Tabs (Arrow Stepper):**
- Workflow: Data | Evaluation | Finetune | Deploy
- Documentation: Reference Docs | Setup Plan | Overview
- Arrow segments show visual progression with completion states

**Lucy Sidebar:**
- Header: Lucy Avatar + "Lucy Assistant" + Beta badge
- Welcome message with 6 quick action pills
- Chat input at bottom

**Auto-behavior:** Lucy immediately starts analyzing the dataset (300ms delay). If files were uploaded with `?autoGeneratePlan=true`, a setup plan auto-generates after 2 seconds.

---

## What Works Well

### 1. Entry point is clear and approachable
The objective input with suggestion pills gives users instant starting points. The "Chess Tutor Sample" escape hatch lets people explore without committing.

### 2. Transition screen bridges the gap
The "Meet Lucy" screen with the 3-step visual (Data -> Evaluation -> Finetune) sets clear expectations before the full UI loads.

### 3. Tab labels are non-technical
Data / Evaluation / Finetune / Deploy reads naturally as a progression.

### 4. Arrow stepper communicates flow
The connected arrow segments make it feel like a guided pipeline, not random tabs.

### 5. Lucy's quick actions use plain language
"Start training setup", "Check data variety", "Test before training" are approachable for non-technical users.

### 6. Setup Plan flow is well-guided
Propose -> Review/Edit -> Approve -> Execute with real-time step progress is intuitive.

### 7. Responsive sidebar
Auto-collapses on small screens (<1024px), expands to 384px on large screens (>1536px).

---

## What Could Confuse Users

### 1. No "what to do next" guidance (HIGH IMPACT)
After the transition screen, users land on the Data tab with no indication of what needs to happen in each tab or what order to follow. A non-technical user will ask: "Do I need to do something here before going to Evaluation? Can I skip ahead?"

**Recommendation:** Add a lightweight workflow checklist, either:
- In the header area showing: [ ] Training data ready, [ ] Evaluation configured, [ ] Ready to finetune
- Or as tooltips on each arrow segment explaining what "complete" means

### 2. Tab completion criteria invisible (MEDIUM)
Tabs show checkmarks when "complete" but users don't know what triggers completion:
- Data: records exist
- Evaluation: grader configured
- Finetune: job started

**Recommendation:** Add tooltips on the completed/pending indicators explaining the criteria.

### 3. Lucy auto-messages without warning (MEDIUM)
Lucy starts analyzing immediately after page load (300ms delay). First-time users might be startled by unsolicited AI messages.

**Recommendation:** A small banner or animation: "Lucy is reviewing your dataset..." before the first auto-message.

### 4. Plan auto-generation is silent (MEDIUM)
When files are uploaded at the entry point, `?autoGeneratePlan=true` triggers plan generation 2 seconds after navigation. The Plan tab gets a pulsing indicator but users on the Data tab won't notice.

**Recommendation:** Show a brief toast or banner: "Lucy is creating a setup plan from your documents..."

### 5. Three file upload paths, no guidance (LOW)
Files can be uploaded at:
- Entry point ("Add docs" button)
- Lucy chat (attachment button)
- Reference Docs tab

Users won't know which method to use when.

**Recommendation:** Document the intended use for each or consolidate paths.

### 6. No persistent workflow progress indicator (MEDIUM)
There's no single view showing "you need X, Y, Z before you can finetune." Users might try to start training early and not understand why it's disabled.

**Recommendation:** Show a progress ring or mini-checklist in the header.

### 7. Plan markdown editing is risky (LOW)
Users can toggle to "Edit" mode in the SetupPlanEditor and modify raw markdown. Invalid edits could break the plan structure.

**Recommendation:** Consider removing edit mode for non-technical users or adding validation.

### 8. Lucy chat input is generic (LOW)
Placeholder says "Ask Lucy to analyze your dataset" regardless of current tab or workflow state.

**Recommendation:** Context-aware placeholder based on current tab (e.g., on Evaluation tab: "Ask Lucy to set up quality scoring").

---

## Recommended Priority Improvements

| Priority | Improvement | Effort |
|----------|------------|--------|
| HIGH | Add workflow checklist/progress indicator in header | Medium |
| HIGH | Add tooltips explaining tab completion criteria | Small |
| MEDIUM | Add notification when plan auto-generates from uploaded docs | Small |
| MEDIUM | Soften Lucy's auto-analysis with a "reviewing..." indicator | Small |
| LOW | Context-aware chat input placeholder per tab | Small |
| LOW | Add validation or guard rails to plan markdown editing | Medium |

---

## Flow Diagram Summary

```
┌─────────────────────────────┐
│ Empty State                 │
│ "What is the objective..."  │
│ + suggestion pills          │
│ + file upload (optional)    │
│ + "Start Finetune" button   │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ Transition Screen (2.5s)    │
│ "Meet Lucy, your assistant" │
│ Data → Evaluation → Finetune│
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│ Dataset Detail Page                                 │
│                                                     │
│ ┌──────────┐  ┌──────────────────────────────────┐ │
│ │ Lucy     │  │ Arrow Stepper Tabs               │ │
│ │ Sidebar  │  │ [Data] [Evaluation] [Finetune]   │ │
│ │          │  │ [Deploy]                         │ │
│ │ - Welcome│  │ + [Ref Docs] [Setup Plan] [Ovw]  │ │
│ │ - Chat   │  ├──────────────────────────────────┤ │
│ │ - Quick  │  │ Tab Content Area                 │ │
│ │   Actions│  │                                  │ │
│ └──────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### If files were uploaded:
```
Start Finetune (with files)
    │
    ▼
Navigate to /datasets/{id}?autoGeneratePlan=true
    │
    ▼
Transition screen (2.5s)
    │
    ▼
Dataset Detail loads → Lucy auto-analyzes
    │ (2s delay)
    ▼
?autoGeneratePlan=true triggers:
  → Lucy sends "Please create a setup plan"
  → Plan tab shows loading indicator
  → propose_setup_plan runs
  → SetupPlanEditor appears with plan
  → User reviews → "Approve & Execute"
  → 7-step execution with progress
  → "Ready for fine-tuning!"
```

### If no files uploaded:
```
Start Finetune (no files)
    │
    ▼
Navigate to /datasets/{id}
    │
    ▼
Transition screen (2.5s)
    │
    ▼
Dataset Detail loads → Lucy auto-analyzes
    │
    ▼
Lucy welcome message + quick actions
    │
    ▼
User interacts with Lucy or tabs manually
```
