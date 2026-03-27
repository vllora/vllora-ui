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

## Installing the Skill

Users must copy **2 folders** from this repo into their project's `.claude/` directory:

```bash
# From the vllora/ui repo root:
REPO_DIR=/path/to/vllora/ui

# 1. Skill (pipeline definition, scripts, reference docs, templates)
mkdir -p .claude/skills/finetune-skill
cp -r "$REPO_DIR/finetune-skill/"* .claude/skills/finetune-skill/

# 2. Sub-agents (execution-logger, relation-builder, training-monitor)
mkdir -p .claude/agents
cp "$REPO_DIR/agents/"*.md .claude/agents/
```

| Folder | Destination | Contents |
|--------|-------------|----------|
| `finetune-skill/` | `.claude/skills/finetune-skill/` | SKILL.md, reference/, scripts/, templates/ |
| `agents/` | `.claude/agents/` | 3 sub-agents: execution-logger (logging), relation-builder (topic↔part matching), training-monitor (background metric watchdog) |

Without the agents, the skill still runs but loses auto-logging, automated relation building, and training anomaly detection.

See [skill-testing-guide.md](./skill-testing-guide.md) for detailed setup and testing instructions.

## Current Status (2026-03-18)

The **3-page UI redesign** (Canvas, Sources, Table) is the active workstream. An HTML mockup serves as the design source of truth, and the React UI is being updated to match it.

**What's done:**
- HTML mockup with all 3 views + record detail sidebar (fully interactive)
- React: Unified table with dynamic job score columns (eval + train)
- React: Redesigned record detail sidebar (split eval/train scores, conversation layout, source context)
- React: Canvas quality scores, source topic dots, data flow banner, prompt panel

**Read [implementation-status.md](./implementation-status.md) for the full breakdown.**

## Documents

| Doc | What it covers |
|-----|---------------|
| **[implementation-status.md](./implementation-status.md)** | **START HERE** — Current implementation progress, what's done vs TODO, architecture decisions, file map |
| **[onboarding-flow.md](./onboarding-flow.md)** | Onboarding UX: 6-screen user journey, component map, shared components, debugging guide |
| [ui-visualization-redesign.md](./ui-visualization-redesign.md) | 3-page Canvas/Sources/Table design spec with component mapping and implementation phases |
| [knowledge-visualization.md](./knowledge-visualization.md) | Knowledge sources & parts: BE API, FE types, explorer tree, content viewers |
| [architecture-updates-2026-03.md](./architecture-updates-2026-03.md) | March 2026 refactoring: eval polling, ID mapping, cross-view navigation, training UI |
| [entity-relationships.md](./entity-relationships.md) | Knowledge, topics, records: data model and traceability chain |
| [topic-knowledge-visualization.md](./topic-knowledge-visualization.md) | Topic-source relationship visualization phases |
| [evaluator-versioning-ux.md](./evaluator-versioning-ux.md) | Grader version tracking: badges, snapshots, diff indicators |
| [skill-e2e-test-notes.md](./skill-e2e-test-notes.md) | Skill E2E test results, API issues found, verification status |
| [run-infrastructure.md](./run-infrastructure.md) | Run harness: `run-finetune-agent.sh`, `format-finetune-log.py`, transcript format, debugging logs |

## Mockups

| File | What it shows |
|------|--------------|
| **[mockup-dataset-redesign.html](./mockup-dataset-redesign.html)** | Main mockup — all 3 views (Canvas, Sources, Table) + record detail sidebar. Loads live data from gateway. |
| **[mockup-onboarding-flow.html](./mockup-onboarding-flow.html)** | Onboarding flow mockup — 6 screens from homepage to workflow detail. Click nav bar to browse. |
| [mockup-eval-dialog.html](./mockup-eval-dialog.html) | Evaluation job dialog design |
| [mockup-training-job.html](./mockup-training-job.html) | Training job view design |
| [mockup-new-training-dialog.html](./mockup-new-training-dialog.html) | New training job creation dialog |
| [mockup-record-row-design.html](./mockup-record-row-design.html) | Record row design explorations |

## Feature Flag

`VITE_LUCY_ENABLED` (default: `false`) — set to `true` in `.env` to re-enable Lucy.
Centralized at `src/lib/feature-flags.ts` as `IS_LUCY_ENABLED`.

## Principles

1. **BE is the single source of truth** — UI reads from gateway API, never writes workflow state directly
2. **UI = read-only visualization** — browse, inspect, navigate. No pipeline orchestration
3. **Skill = pipeline driver** — document extraction, data generation, topic linking all happen via CLI
4. **Same skill powers Lucy later** — when re-enabled, Lucy calls the same skill functions
