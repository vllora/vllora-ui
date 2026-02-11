You are fixing a bug in the Lucy Finetune Dataset feature. Load all relevant documentation and cross-repo sources first, then investigate and fix the issue.

## Task
Fix the following issue: $ARGUMENTS

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

1. Read the documentation and architecture sources above to understand the full stack and expected behavior.
2. Determine which layer the bug is in: agent definition, backend (distri.rs), frontend tools, UI component, or @distri/react hooks.
3. Investigate the reported issue by searching the relevant codebase layer.
4. Identify the root cause by comparing actual behavior against the documented design.
5. Implement a minimal, targeted fix that aligns with the documented architecture.
6. Verify the fix doesn't break the state machine transitions or tool contracts documented above.
7. If the fix touches @distri/react or @distri/core, note that changes must be made in the distri repo and synced via `scripts/sync-distrijs.sh`.
8. Explain what you changed, which layer it affects, and why.
