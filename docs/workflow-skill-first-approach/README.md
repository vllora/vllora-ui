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
| [architecture-updates-2026-03.md](./architecture-updates-2026-03.md) | March 2026 refactoring: eval polling, ID mapping, cross-view navigation, training UI |
| [entity-relationships.md](./entity-relationships.md) | Knowledge, topics, records: data model and traceability chain |
| [topic-knowledge-visualization.md](./topic-knowledge-visualization.md) | Topic-source relationship visualization phases |
| [evaluator-versioning-ux.md](./evaluator-versioning-ux.md) | Grader version tracking: badges, snapshots, diff indicators |
| [ui-visualization-redesign.md](./ui-visualization-redesign.md) | 3-page Canvas/Sources/Table redesign with implementation plan |
| [skill-e2e-test-notes.md](./skill-e2e-test-notes.md) | Skill E2E test results, API issues found, verification status |

## Feature Flag

`VITE_LUCY_ENABLED` (default: `false`) — set to `true` in `.env` to re-enable Lucy.
Centralized at `src/lib/feature-flags.ts` as `IS_LUCY_ENABLED`.

## Principles

1. **BE is the single source of truth** — UI reads from gateway API, never writes workflow state directly
2. **UI = read-only visualization** — browse, inspect, navigate. No pipeline orchestration
3. **Skill = pipeline driver** — document extraction, data generation, topic linking all happen via CLI
4. **Same skill powers Lucy later** — when re-enabled, Lucy calls the same skill functions
