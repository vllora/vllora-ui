You are designing or enhancing the UI for the Lucy Finetune Dataset feature. Load UI-relevant sources and docs only — no backend or server code.

## Task
$ARGUMENTS

## UX Documentation

### Guided Onboarding (UX flow for new users)
!`cat docs/features/lucy-finetune-dataset/guided-onboarding.md`

### State Machine (to understand step progression UI)
!`cat docs/features/lucy-finetune-dataset/state-machine.md`

### Architecture (to understand which layer owns UI rendering)
!`cat docs/features/lucy-finetune-dataset/architecture.md`

## State Management Pattern (MANDATORY — read before writing any state code)
!`cat docs/state-management-pattern.md`

## Key UI Source Files

### LucyDatasetAssistant (main sidebar assistant component)
!`cat src/components/datasets/LucyDatasetAssistant.tsx`

### DatasetDetailContentV2 (main dataset detail page layout)
!`cat src/components/datasets/DatasetDetailContentV2.tsx`

### WorkflowStepIndicator (step progression UI)
!`cat src/components/datasets/dataset-detail-header/WorkflowStepIndicator.tsx`

### DatasetStepper (canvas stepper)
!`cat src/components/datasets/dataset-canvas/DatasetStepper.tsx`

### Empty Dataset State (onboarding entry point)
!`cat src/components/datasets/empty-dataset-state/index.tsx`

### Plan Section (setup plan UI)
!`cat src/components/datasets/plan-section/PlanSection.tsx`

## @distri/react Components (upstream chat UI — DO NOT edit directly, changes go to distri repo)

### Chat.tsx (main chat component)
!`cat /Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/components/Chat.tsx`

### ChatInput.tsx (input component)
!`cat /Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/components/ChatInput.tsx`

### AskFollowUp.tsx (follow-up prompt UI)
!`cat /Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/components/AskFollowUp.tsx`

### MessageRenderer.tsx (how messages are displayed)
!`cat /Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/components/renderers/MessageRenderer.tsx`

### ToolExecutionRenderer.tsx (how tool results are displayed)
!`cat /Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/components/renderers/ToolExecutionRenderer.tsx`

### StepBasedRenderer.tsx (step-based rendering in chat)
!`cat /Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/components/renderers/StepBasedRenderer.tsx`

## UI Component Directory Structure
!`find src/components/datasets -type f \( -name "*.tsx" -o -name "*.ts" \) | sort`

---

## Instructions

1. Read the UX documentation above to understand the expected user flow and step progression.
2. Review the existing UI components to understand current patterns: component structure, styling approach, state management.
3. When making UI changes:
   - Components in `src/components/datasets/` — edit directly in this repo
   - Components in @distri/react — DO NOT edit here. Note changes needed and flag they must be made in the distri repo + synced via `scripts/sync-distrijs.sh`
4. Follow existing UI patterns: use the same component library, styling approach, and layout conventions already in the codebase.
5. Ensure the UI correctly reflects workflow state transitions documented in state-machine.md.
6. If the change affects the onboarding flow, update `docs/features/lucy-finetune-dataset/guided-onboarding.md`.
