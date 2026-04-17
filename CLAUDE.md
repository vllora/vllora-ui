# vLLora UI

Two products under active development:

1. **`finetune-skill/`** — User-facing Claude Code skill for the finetune pipeline (PDFs + OTel traces → training data → GRPO). Actively developed.
2. **`src/`** — React/TypeScript UI that visualizes workflow data (read-only presentation layer).

The skill drives the pipeline. The UI displays the results. The gateway is a side-effect persistence store, not the orchestrator.

> Load `/finetune-context` for full pipeline architecture, cross-repo source map, and agent definitions.
> Load `/otel-finetune-context` for the OTel trace pipeline (separate `finetune-skill-otel/`).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19, TypeScript 5.9 |
| Build | Vite 7, pnpm |
| Styling | Tailwind CSS 3.4, shadcn/ui |
| State | React Context + ahooks `useRequest` (see `docs/state-management-pattern.md`) |
| Persistence | Gateway API (SQLite `~/.vllora/vllora.db`). IndexedDB only for ephemeral UI state |
| Testing | Vitest, @testing-library/react |

## Commands

```bash
npm run dev           # Dev server → localhost:5173
npm run build         # Type-check + production build
npx tsc --noEmit      # Type-check only (automated via PostToolUse hook)
npm test              # Run tests
pnpm mock-server      # Mock gateway on :9090
scripts/restart-backend.sh  # Restart gateway + Distri server
```

Gateway runs at `localhost:9090`. Backend (Rust) repo: `../gateway/`. Cloud repo: `langdb-cloud` (gateway is a git submodule at `ai-gateway/`).

## Cross-Repo Deployment

```
1. Commit vllora repo (gateway + finetune crate)
2. cd langdb-cloud/ai-gateway && git pull origin feat/finetune
3. Commit langdb-cloud (cloud handler changes + updated submodule)
4. Restart BE: scripts/restart-backend.sh
5. Wait for cloud CI deploy
```

## Mandatory Conventions

### State Management

- **React Context + ahooks `useRequest`** for shared/server state. NEVER Redux/Zustand.
- Naming: `[Feature]Context.tsx`, `[Feature]Provider`, `[Feature]Consumer()`
- Error handling: always `toast.error()` in `onError` callbacks
- Event emitter: always clean up `emitter.on()` in useEffect return

### Code Rules

- `npx tsc --noEmit` after every change (automated via hook)
- `@distri/react` and `@distri/core` are **vendored** — `Edit(vendor/**)` denied. Change in distri repo → `scripts/sync-distrijs.sh`
- Tools execute locally in the browser, NOT on the server
- Lucy is **disabled** (`VITE_LUCY_ENABLED=false`). UI is visualization-only.

### Pagination Architecture (April 2026)

- **UI → Gateway**: `getAllRecordsPaginated()` at 200/page. `getByDatasetIdPaged()` for infinite scroll.
- **Gateway → Cloud**: Dataset upload chunked at 100 records/batch with retry + per-workflow mutex.
- **Eval polling (UI)**: `limit=200` during polling, full fetch on completion for readiness gate.
- **Eval polling (Skill)**: Full results every poll (CLI, not browser — needs data for quality analysis).
- **Cloud summary**: `EvaluationSummary` has `scored_count`, `zero_score_count`, `perfect_score_count` — computed from ALL results regardless of limit.

### Documentation Sync Rule

**MANDATORY — enforced by PostToolUse hook.** After code changes to pipeline source files, update relevant docs in the same response. Run `/sync-docs` to verify.

## Gotchas

1. **"Evaluation" vs "Dry Run"**: Display = "Evaluation", code = `dryRun`. "Source Materials" (not "Source Documents"), "Teaching Examples" (not "Training Data"), "Quality Checker" (not "Evaluator"), "Test Runs" (not "Eval Runs").
2. **Vendored packages**: `vendor/` is read-only. Edit in distri repo → build → sync.
3. **Gateway is NOT central**: Skill-first. Gateway = persistence + OTel ingest store.
4. **Backend restart**: After editing `gateway/agents/finetune/*.md`, run `scripts/restart-backend.sh`.
5. **OTel semconv**: Use `gen_ai.input.messages` / `gen_ai.output.messages`. NEVER `gen_ai.prompt` / `gen_ai.completion` (removed in v1.38.0).
6. **Topic IDs are slugs**: Local files use `"cancel-pending-order"` not UUIDs. Gateway assigns UUIDs at upload boundary only.
7. **Finetune-project folder structure**: `trace-analysis/`, `quality-checker/`, `test-runs/`, `training/` — NOT root-level files.
8. **Cross-repo tool contracts**: Agent md definitions (gateway) must match tool implementations in `distri-finetune-tools/` (UI). Mismatches = silent failures.

## Skills (auto-invoked)

| Skill | When to use |
|-------|------------|
| `/finetune-context` | Full pipeline context — architecture, agents, cross-layer sync |
| `/otel-finetune-context` | OTel trace pipeline context (separate `finetune-skill-otel/`) |
| `/finetune-run <scenario>` | Run finetune skill against a test scenario |
| `/finetune-analyze <scenario>` | Analyze results of a test run |
| `/finetune-kill <scenario>` | Kill orphaned processes from a test run |
| `/research-grpo` | Research latest GRPO/RFT papers |
| `/sync-docs` | Verify and auto-fix pipeline docs |
| `/safe-commit` | Type-check + doc sync + commit |
| `/finetune-e2e` | E2E test with browser automation (manual only) |
| `/finetune-test-loop <scenario>` | Autonomous test loop — run, watch, fix, repeat (use with `/loop`) |
| `/changelog` | Generate release notes (manual only) |

## Sub-Agents

| Agent | Model | Use |
|-------|-------|-----|
| `code-reviewer` | Sonnet | After writing/modifying code |
| `architecture-explorer` | Sonnet | Cross-layer investigation (read-only) |
| `debugger` | Sonnet | Diagnosing bugs across the full stack |
| `grpo-researcher` | Sonnet | Research GRPO/RFT papers (read-only) |

## Hooks

| Hook | Trigger | Effect |
|------|---------|--------|
| `post-edit-typecheck.sh` | Write/Edit on `.ts`/`.tsx` | Runs `npx tsc --noEmit` |
| `doc-sync-reminder.sh` | Write/Edit on key source dirs | Reminds to update docs |
| `console-log-warning.sh` | Write/Edit on `.ts`/`.tsx` | Warns about `console.log` in non-test files |
| `stale-path-check.sh` | Write/Edit | Checks for stale file paths |

## Context Management

When compacting, preserve: current task scope, file paths being modified, any failing test output, and the pagination architecture section above.
