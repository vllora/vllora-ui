Create an agent team to review and redesign the UI/UX for the Lucy Finetune Dataset feature. Focus: $ARGUMENTS

Each teammate MUST start by reading:
1. CLAUDE.md — cross-repo source map and key concepts
2. `docs/features/lucy-finetune-dataset/guided-onboarding.md` — current onboarding UX flow
3. `docs/features/lucy-finetune-dataset/state-machine.md` — workflow step progression
4. `docs/features/lucy-finetune-dataset/architecture.md` — which layer owns UI rendering
5. `docs/state-management-pattern.md` — state management rules

## Key UI Source Files (all teammates should review these)
- `src/components/datasets/LucyDatasetAssistant.tsx` — main sidebar assistant
- `src/components/datasets/DatasetDetailContentV2.tsx` — main dataset detail page
- `src/components/datasets/dataset-detail-header/WorkflowStepIndicator.tsx` — step progression UI
- `src/components/datasets/dataset-canvas/DatasetStepper.tsx` — canvas stepper
- `src/components/datasets/empty-dataset-state/index.tsx` — onboarding entry point
- `src/components/datasets/plan-section/PlanSection.tsx` — setup plan UI

## @distri/react Components (upstream — DO NOT edit, note changes needed for distri repo)
- `/Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/components/Chat.tsx`
- `/Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/components/ChatInput.tsx`
- `/Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/components/AskFollowUp.tsx`
- `/Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/components/renderers/MessageRenderer.tsx`
- `/Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/components/renderers/ToolExecutionRenderer.tsx`
- `/Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/components/renderers/StepBasedRenderer.tsx`

## Teammates

**1. UX Flow Analyst** — Map the complete user journey from first visit to completed dataset. Read guided-onboarding.md and trace through the actual code. For every screen/state the user encounters, document: what the user sees, what actions are available, what feedback they get, and where confusion or friction might occur. Identify: dead ends, unclear next steps, missing feedback, unnecessary clicks, confusing terminology, and places where the user has to guess what to do. Produce a flow map with pain points annotated.

**2. Visual & Interaction Reviewer** — Review every UI component for visual consistency, hierarchy, spacing, and interaction quality. Check: are loading/error/empty states polished or bare? Are transitions smooth or jarring? Is the information hierarchy clear (what's primary, secondary, tertiary)? Are interactive elements obviously clickable? Is there visual feedback for all user actions? Are the chat messages, tool results, and step indicators visually coherent? Review both the dataset components in this repo AND the @distri/react renderers. Flag any visual inconsistencies with specific component:line references.

**3. Information Architecture Reviewer** — Evaluate how information is organized and presented. Check: is the 7-step pipeline understandable to a new user? Are step names/descriptions clear? Is the relationship between the sidebar assistant and the main canvas intuitive? Is data presentation (tables, lists, configs) scannable? Are error messages actionable? Is the settings/configuration flow discoverable? Look at how tool results are displayed — are they meaningful to non-technical users? Propose restructuring where the current layout creates cognitive overload.

**4. Redesign Proposer** — After reviewing findings from the other 3 teammates, synthesize their pain points into concrete redesign proposals. For each proposal: describe the current problem, the proposed solution, which components need to change, and whether changes are in this repo (src/components/datasets/) or the distri repo (@distri/react). Prioritize proposals as: P0 (blocks usability), P1 (significant friction), P2 (polish). Include rough descriptions of what the improved UI should look like. Do NOT write code — produce a design spec that the Frontend Implementer from `/team-develop` can execute.

## Coordination rules
- UX Flow Analyst, Visual & Interaction Reviewer, and Information Architecture Reviewer start in parallel
- Redesign Proposer waits for all 3 reviewers to complete, then synthesizes
- Use delegate mode — lead coordinates only
- Each reviewer produces a structured report with: findings, severity (P0/P1/P2), component:line references, and screenshots if using Playwright MCP
- Redesign Proposer should group proposals by area (onboarding, step progression, assistant sidebar, data display, error handling)
- Lead synthesizes all reports into a final UX review + redesign spec when Redesign Proposer is done
- If Playwright MCP is available, reviewers should use `browser_screenshot` to capture current UI states as evidence
