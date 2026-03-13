# Skill-First Workflow Approach

## Overview

The finetune pipeline shifts from an in-app Lucy AI assistant to **external skills** (Codex agent, Claude Code). The UI becomes a **visualization layer** that reads data from the backend API.

```
CLI Skill (Codex/Claude Code)
  ├── Extract knowledge from documents (PDF, images, URLs)
  ├── Generate training data
  ├── Create/manage topics
  ├── Link data ↔ topics ↔ knowledge parts (with references)
  ├── Configure grader
  ├── Run evaluations
  └── Start training
         ↓ writes to ↓
    Gateway API (SQLite)
         ↓ reads from ↓
    UI (visualization only)
```

## Documents

| Doc | What it covers |
|-----|---------------|
| [knowledge-visualization.md](./knowledge-visualization.md) | Knowledge sources & parts: BE API, FE types, explorer tree, content viewers |
| [migration-plan.md](./migration-plan.md) | Step-by-step migration: what to build, what to rewrite, what to keep |

## Feature Flag

`VITE_LUCY_ENABLED` (default: `false`) — set to `true` in `.env` to re-enable Lucy.
Centralized at `src/lib/feature-flags.ts` as `IS_LUCY_ENABLED`.

## Principles

1. **BE is the single source of truth** — UI reads from gateway API, never writes workflow state directly
2. **UI = read-only visualization** — browse, inspect, navigate. No pipeline orchestration
3. **Skill = pipeline driver** — document extraction, data generation, topic linking all happen via CLI
4. **Same skill powers Lucy later** — when re-enabled, Lucy calls the same skill functions
