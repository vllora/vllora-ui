You are developing new functionality for the Lucy Finetune Dataset feature. Load all relevant documentation and cross-repo sources first, then plan and implement the feature.

## Task
Implement the following: $ARGUMENTS

## State Management Pattern (MANDATORY for any UI state changes)
!`cat docs/state-management-pattern.md`

## Feature Documentation

### Design Document
!`cat docs/features/lucy-finetune-dataset/README.md`

### Architecture
!`cat docs/features/lucy-finetune-dataset/architecture.md`

### State Machine
!`cat docs/features/lucy-finetune-dataset/state-machine.md`

### Guided Onboarding
!`cat docs/features/lucy-finetune-dataset/guided-onboarding.md`

### Data Generation Agent
!`cat docs/features/lucy-finetune-dataset/data-generation-agent.md`

### Dataset README Generation
!`cat docs/features/lucy-finetune-dataset/dataset-readme-generation.md`

### Team Review Report
!`cat docs/features/lucy-finetune-dataset/team-review-report.md`

### Vendored Distri Packages
!`cat docs/features/lucy-finetune-dataset/vendored-distri-packages.md`

## Cross-Repo Architecture Sources

### Agent Definition (what the AI agent does, its tools and prompt)
!`cat /Users/anhthuduong/Documents/GitHub/vllora/gateway/agents/finetune/vllora-finetune-agent.md`

### Backend — distri.rs (server lifecycle: download, start, health check)
!`cat /Users/anhthuduong/Documents/GitHub/vllora/gateway/src/distri.rs`

### Sync Script (how distrijs changes reach this repo)
!`cat scripts/sync-distrijs.sh`

### @distri/react — useChat hook (message streaming, tool execution)
!`cat /Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/useChat.ts`

### @distri/react — chatStateStore (Zustand state)
!`cat /Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/stores/chatStateStore.ts`

### @distri/core — distri-client (A2A protocol client)
!`cat /Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/core/src/distri-client.ts`

### @distri/core — types
!`cat /Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/core/src/types.ts`

---

## Instructions

1. Read the documentation and architecture sources above to fully understand the existing full-stack architecture and design decisions.
2. Plan the implementation by identifying which layers are affected: agent definition, backend (distri.rs), frontend tools, UI component, or @distri/react hooks.
3. Follow the documented patterns:
   - Tools execute locally in the browser (frontend tier)
   - State machine transitions must follow the documented validation rules
   - New tools should follow the existing tool contract patterns
   - UI changes should align with the guided onboarding UX patterns
4. Implement the feature incrementally, testing each piece against the documented behavior.
5. If the change affects the state machine, update both the code AND `docs/features/lucy-finetune-dataset/state-machine.md`.
6. If the change adds new tools, update `docs/features/lucy-finetune-dataset/architecture.md`.
7. If the change requires modifying @distri/react or @distri/core, those changes must be made in the distri repo and synced via `scripts/sync-distrijs.sh`.
8. Explain what you built, which layers it touches, and how it fits into the existing architecture.
