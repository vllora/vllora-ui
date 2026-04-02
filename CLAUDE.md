# vLLora UI

This repo contains **two products being actively developed**:

1. **`finetune-skill/`** — A user-facing Claude Code skill (the pipeline driver). Users plug this into their project to finetune models via CLI. **Currently in active development (v1-v9 testing).**
2. **`src/`** — A React/TypeScript UI that visualizes finetune workflow data (the presentation layer).

## How It Works: Skill-First Architecture

```
finetune-skill/ (user's Claude Code)       UI (this repo's src/)
  → Extracts documents (PDF/images)          → Visualizes workflow data
  → Generates training data                  → Browse records, topics, evals
  → Creates topic hierarchies                → Inspect training metrics
  → Links topics ↔ sources                   → Navigate canvas/sources/table views
  → Runs evaluations & training              → Read-only — no pipeline orchestration
  → Writes everything to Gateway API         → Reads from Gateway API
```

**The skill drives the pipeline. The UI displays the results.** Both are under active development.

### The Finetune Skill (`finetune-skill/`) — USER-FACING PRODUCT

**This is the product we're building for end users**, NOT a Claude Code internal skill for our development.

Users download/copy this skill into their own project, then use Claude Code (or Codex) to run the full finetune pipeline against the vLLora API. The skill tells Claude how to extract documents, generate training data, create topics, run evals, and train models.

**We are actively developing this skill.** It's currently in testing (v1-v9 iterations with Chess Tactics PDF).

| File | Purpose |
|------|---------|
| `finetune-skill/SKILL.md` | Main skill definition (6-step pipeline, constraints, execution format) |
| `finetune-skill/README.md` | **Read first** — architecture, 9 test iterations, known issues, debugging |
| `finetune-skill/reference/` | 7 reference docs (API, extraction, graders, topics, iteration, workflow, data format) |
| `finetune-skill/scripts/` | 6 Python helpers (eval, training, validation) |
| `finetune-skill/templates/` | Sample JSONL, project config, grader template |

**Relationship to UI**: The skill writes data to the Gateway API → the UI reads and visualizes it. They are two halves of the same product.

### Lucy AI Assistant (Disabled — Future)

Lucy is the in-app AI sidebar. Currently disabled via `VITE_LUCY_ENABLED` flag (default: `false`).
- Flag: `src/lib/feature-flags.ts` → `IS_LUCY_ENABLED`
- Gated: `LucySidebar`, `AgentPanelWrapper`, `SidebarAgentButton`, plan.md in explorer, PlanPreview buttons
- Set `VITE_LUCY_ENABLED=true` in `.env` to re-enable for testing
- Later, Lucy will call the same skill functions — same pipeline, different interface

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19, TypeScript 5.9 |
| Build | Vite 7 |
| Styling | Tailwind CSS 3.4, Radix UI, shadcn/ui |
| State | React Context + ahooks `useRequest` |
| Persistence | Gateway API (SQLite at `~/.vllora/vllora.db`). IndexedDB only for ephemeral UI state |
| Package Manager | pnpm |
| Testing | Vitest, @testing-library/react |
| AI Agent | Distri A2A protocol (@distri/core, @distri/react) |

## Common Commands

```bash
npm run dev           # Dev server → localhost:5173
npm run build         # Type-check + production build
npx tsc --noEmit      # Type-check only (run after every change)
npm test              # Run tests
pnpm mock-server      # Mock gateway on :9090 (for E2E testing without real backend)
pnpm dev:msw          # Dev server with MSW (in-browser API mocking)
scripts/sync-distrijs.sh  # Sync vendored @distri packages from distri repo
scripts/restart-backend.sh  # Restart Distri server + vLLora gateway (required after agent md changes)
```

Backend (Rust gateway) runs at `localhost:9090`. Start via `npm run start:backend` or from the gateway repo. For E2E testing without the real backend, use `pnpm mock-server` instead.

---

## E2E Testing Architecture

### Overview

50 E2E test scenarios across 15 areas covering the full finetune pipeline, Lucy AI assistant behavior, polling/job lifecycle, dummy user edge cases, UI interactions, and cross-cutting concerns. Tests use a **mock finetune API** so long-running operations (eval, training) complete instantly.

### Key Docs

| Doc | What it covers |
|-----|---------------|
| `docs/enhance-lucy/e2e-test-framework.md` | Framework, conventions, assertion types, how to run tests |
| `docs/enhance-lucy/e2e-tests/_registry.md` | Master list of all 50 tests with priorities and execution order |
| `docs/enhance-lucy/mock-test-architecture.md` | Mock server architecture, MSW integration, scenario system |

### Test Infrastructure

```
Frontend (5173)
    ├── Finetune API calls → Mock Server (9091) → instant mock responses
    ├── Non-finetune calls → Mock Server (9091) → proxy to Real Gateway (9090)
    └── Lucy chat → Distri Server (8081) → real LLM + A2A
```

**3-server setup for full Lucy chat + mock finetune**:
```bash
# Terminal 1: Real backend (Distri at 8081 + vLLora gateway at 9090)
./scripts/restart-backend.sh

# Terminal 2: Mock server in proxy mode (mocks finetune, proxies rest)
pnpm mock-server:lucy

# Terminal 3: Frontend pointing to mock server
VITE_BACKEND_PORT=9091 pnpm dev
```

**Mock scenarios** control eval/training outcomes:
```bash
# Set scenario via API
curl -X POST http://localhost:9091/mock/scenario \
  -H 'Content-Type: application/json' \
  -d '{"evalScenario":"critical","evalPollsBeforeComplete":2}'

# Available scenarios: healthy, warning, critical, stalled, error, overfitting, noLearning
```

### Test Case Structure

```
docs/enhance-lucy/e2e-tests/
├── _registry.md              # Master test list (READ THIS FIRST)
├── 01-topics/                # TC-TOP-001, TC-TOP-002
├── 02-categorization/        # TC-CAT-001
├── 03-coverage-generation/   # TC-COV-001
├── 04-grader/                # TC-GRD-001, TC-GRD-002
├── 05-evaluation/            # TC-EVAL-001 to TC-EVAL-004
├── 06-training/              # TC-TRN-001 to TC-TRN-004
├── 07-deployment/            # TC-DEP-001
├── 08-knowledge-sources/     # TC-KS-001, TC-KS-002
├── 09-records-management/    # TC-REC-001
├── 10-dataset-crud/          # TC-DS-001
├── 11-skill-package/         # TC-SKL-001
├── 12-polling/               # TC-POLL-001 to TC-POLL-005
├── lucy-behavior/            # TC-LUCY-001 to TC-LUCY-013 (10 tests)
├── dummy-user/               # TC-DU-001 to TC-DU-005
├── ui-interactions/          # TC-UI-001 to TC-UI-003
├── cross-cutting/            # TC-CC-001 to TC-CC-007
└── e2e-runs/                 # Test results (separate from scenarios)
    └── {run-id}/             # Per-run results + evidence
```

Each test case file has YAML frontmatter (`id`, `title`, `area`, `priority`, `type`, `mock-scenario`, `preconditions`) and markdown body with steps, hard checks (deterministic), soft checks (LLM-dependent), and evidence requirements.

### Scenarios vs Results Separation

- **Scenarios** (`e2e-tests/*.md`): Define WHAT to test. Immutable. Never modified by test runs.
- **Results** (`e2e-runs/{run-id}/`): WHERE outcomes go. Created per test run with pass/fail, evidence, notes.

### For Agents: Working with E2E Tests

**When fixing a bug found by a test**:
1. Read the failing test scenario file to understand expected behavior
2. Read the result file in `e2e-runs/` for failure details and evidence
3. Fix the source code
4. Re-run the specific test to verify the fix

**When adding a new feature**:
1. Check `_registry.md` for existing coverage
2. Determine which area the feature falls into (pipeline step, Lucy behavior, UI, etc.)
3. Create a new test file following the ID convention: `TC-{AREA}-{NNN}.md`
4. Add the test to `_registry.md` (test list, coverage summary, execution priority)
5. Use the frontmatter template from `e2e-test-framework.md`

**When fixing a broken test**:
1. Read the test scenario to understand what it checks
2. Check if the test's hard checks still match current behavior
3. Update the test if behavior intentionally changed; fix the code if it's a regression

**ID conventions**: `TC-TOP`, `TC-CAT`, `TC-COV`, `TC-GRD`, `TC-EVAL`, `TC-TRN`, `TC-DEP`, `TC-KS`, `TC-REC`, `TC-DS`, `TC-SKL`, `TC-POLL`, `TC-LUCY`, `TC-DU`, `TC-UI`, `TC-CC`

---

## Project Structure

```
finetune-skill/                        # Claude Code skill (THE pipeline driver)
├── SKILL.md                           # Main skill definition
├── README.md                          # Architecture, testing, debugging
├── reference/                         # 7 reference docs (API, extraction, graders, etc.)
├── scripts/                           # 6 Python helpers
└── templates/                         # Sample data, configs, grader template
src/
├── components/
│   ├── datasets/          # Main finetune UI (44 components)
│   ├── agent/lucy-agent/  # Lucy AI assistant components (disabled by default)
│   ├── chat/              # Chat/messaging UI
│   ├── ui/                # shadcn/ui primitives (32 files)
│   └── ...                # settings, models, traces, debug
├── contexts/              # 27 React Contexts (all shared state lives here)
├── services/              # 22 service modules (API adapters, polling, helpers)
├── lib/
│   ├── distri-finetune-tools/  # 70 finetune tool files (45 per-step)
│   ├── distri-dataset-tools/   # Dataset analysis & validation
│   └── distri-data-tools/      # Trace data fetching
├── types/                 # 11 type definition files
└── ...
docs/
├── state-management-pattern.md     # MANDATORY: read before writing state code
├── workflow-skill-first-approach/  # UI redesign: mockups, design specs, implementation status
│   ├── README.md                   # Index — START HERE for UI redesign work
│   ├── implementation-status.md    # What's done, what's TODO, architecture decisions
│   ├── ui-visualization-redesign.md # 3-page design spec (Canvas/Sources/Table)
│   └── mockup-dataset-redesign.html # Interactive HTML mockup (serve at :8888)
└── features/
    ├── lucy-finetune-dataset/      # 8 feature docs (see below)
    └── skill-package/              # 3 docs: README, architecture, data-flow
```

---

## Finetune Pipeline Architecture (Reference)

The finetune pipeline is driven by `finetune-skill/` (external) and visualized by the UI. Lucy (in-app AI sidebar) is disabled but the architecture remains — it will reuse the same skill functions when re-enabled.

### 7-Step Pipeline

```
Topics Config → Categorization → Coverage & Generation → Grader Config → Evaluation → Training → Deployment
```

> **Training stack**: GRPO via HuggingFace TRL `GRPOTrainer` + Unsloth (optimization wrapper, 90% VRAM reduction). Default base model: `Qwen3.5-4B`. β=0 by default (KL values informational only). Full details in `finetune-skill/reference/training-metrics-guide.md`.

> **Naming note**: The "Evaluation" step is called "Dry Run" in internal code (variable names, file names, DB stores, internal identifiers like `dryRunPollingManager`). The tool name is `run_evaluation`. Only user-facing display text says "Evaluation".

### Architecture (6 Layers, 3 Repos)

```
User ↔ React UI (this repo)
       ↕ useChat / chatStateStore (@distri/react — vendored)
       ↕ distri-client (@distri/core — A2A protocol)
       ↕ WebSocket/HTTP
     Rust Gateway (vllora/gateway repo)
       ↕ spawns
     Distri Server (distri repo)
       ├── orchestrator — loads agent defs, manages sessions
       ├── agent_loop — LLM ↔ tool execution loop
       ├── A2A handler — protocol messages
       └── tools — executes tools (external tools sent back to browser)
       ↕
     Frontend tools (this repo — execute locally in browser)
```

### Key Docs (read these first)

**Finetune Skill (user-facing product — active development):**

| Doc | What it covers |
|-----|---------------|
| `finetune-skill/README.md` | **START HERE for skill work** — architecture, 9 test iterations, known issues, debugging |
| `finetune-skill/SKILL.md` | The actual skill definition users get — 6-step pipeline, constraints |
| `finetune-skill/reference/api-reference.md` | All 58 gateway API endpoints |
| `finetune-skill/reference/workflow-guide.md` | Per-step deep dives |

**UI (visualization layer):**

| Doc | What it covers |
|-----|---------------|
| `docs/workflow-skill-first-approach/README.md` | **START HERE for UI work** — redesign status, mockup, implementation |
| `docs/workflow-skill-first-approach/implementation-status.md` | What's done, architecture decisions, file map |
| `docs/workflow-skill-first-approach/architecture-updates-2026-03.md` | March 2026: eval polling, ID mapping, navigation, training UI |
| `docs/state-management-pattern.md` | **MANDATORY** — Context + ahooks pattern |

**Architecture reference (read on demand):**

| Doc | What it covers |
|-----|---------------|
| `docs/features/lucy-finetune-dataset/architecture.md` | 3-tier system, tool definitions, state management |
| `docs/features/lucy-finetune-dataset/state-machine.md` | Workflow steps, transitions, validation rules |
| `docs/features/lucy-finetune-dataset/event-emitter-guide.md` | 14 events, emitters/listeners map |
| `docs/features/skill-package/README.md` | Skill package output format, how Claude uses it |

---

## Cross-Repo Source Map

When investigating issues, check the relevant layer(s). Paths are relative to the project root (`vllora/ui/`).

### Layer 1: Agent Definition (what the AI does)

| File | Purpose |
|------|---------|
| `../gateway/agents/finetune/vllora-finetune-agent.md` | Orchestrator agent (plan-first routing) |
| `../gateway/agents/finetune/finetune-topics-agent.md` | Topic hierarchy sub-agent |
| `../gateway/agents/finetune/finetune-workflow-agent.md` | Workflow execution sub-agent |
| `../gateway/agents/finetune/data-generation-agent.md` | Data generation sub-agent |

### Layer 2: Rust Gateway (localhost:9090)

To investigate BE endpoints, start here:

| File | Purpose |
|------|---------|
| `../gateway/src/http.rs` | **START HERE** — all HTTP route definitions for the gateway API |
| `../gateway/src/distri.rs` | Downloads distri binary, starts server, health checks |

### Layer 2b: Cloud Backend (LangDB Cloud)

To investigate cloud endpoints (eval, training), start here:

| File | Purpose |
|------|---------|
| `/Users/anhthuduong/Documents/GitHub/langdb-cloud/cloud/src/server/rest.rs` | **START HERE** — all cloud REST route definitions |

### Layer 3: Distri Server (Rust)

| File | Purpose |
|------|---------|
| `../../distri/server/distri-core/src/agent/orchestrator.rs` | Loads agent defs, manages sessions |
| `../../distri/server/distri-core/src/agent/agent_loop.rs` | Main LLM ↔ tool execution loop |
| `../../distri/server/distri-core/src/tools/mod.rs` | Tool execution framework |
| `../../distri/server/distri-core/src/a2a/handler.rs` | A2A protocol handler |
| `../../distri/server/distri-core/src/a2a/stream.rs` | A2A streaming |
| `../../distri/server/distri-server/src/routes.rs` | HTTP API routes |
| `../../distri/distri-a2a/src/a2a_types.rs` | A2A type definitions |

### Layer 4: Frontend (this repo)

| File/Dir | Purpose |
|----------|---------|
| `src/components/datasets/sidebars/LucySidebar.tsx` | Main Lucy sidebar (quick actions, chat) |
| `src/components/agent/lucy-agent/LucyChat.tsx` | Lucy chat component (messages, input, tool rendering) |
| `src/lib/distri-finetune-tools/index.ts` | Tool registry and exports |
| `src/lib/distri-finetune-tools/types.ts` | Shared TypeScript types |
| `src/lib/distri-finetune-tools/steps/` | 45 per-step tool implementations |
| `src/lib/distri-finetune-tools/workflow/` | Workflow state machine |
| `src/contexts/` | All shared state (27 contexts) |
| `src/services/` | API adapters, polling, helpers (22 modules) |

### Layer 5: @distri/react & @distri/core (vendored — DO NOT edit in this repo)

| File | Purpose |
|------|---------|
| `../../distri/distrijs/packages/react/src/useChat.ts` | Chat hook (message streaming, tool execution) |
| `../../distri/distrijs/packages/react/src/stores/chatStateStore.ts` | Zustand state store |
| `../../distri/distrijs/packages/react/src/components/Chat.tsx` | Main chat component |
| `../../distri/distrijs/packages/react/src/components/ChatInput.tsx` | Input component |
| `../../distri/distrijs/packages/core/src/distri-client.ts` | A2A protocol client |
| `../../distri/distrijs/packages/core/src/types.ts` | Core type definitions |
| `../../distri/distrijs/packages/core/src/events.ts` | Event system |

### Layer 6: Sync Mechanism

| File | Purpose |
|------|---------|
| `scripts/sync-distrijs.sh` | Copies built packages from distri repo into vendored location |

---

## Finetune Skill: Research-First Rule

**Before modifying or suggesting changes to `finetune-skill/` thresholds, criteria, workflow steps, or training/eval logic**, you MUST:

1. **Research first.** Search for what other platforms (OpenAI RFT, Together AI, HuggingFace TRL, Predibase) and papers (GRPO, DAPO, Dr. GRPO, DeepSeek-R1, "Tricks or Traps", "Hard Examples Are All You Need", "No Prompt Left Behind") actually do. Use web search or Agent tool for deep research.
2. **Cite sources.** Every threshold, criterion, or workflow decision must reference a specific paper (arXiv ID), platform doc, or empirical finding. No "general best practice" without a source.
3. **Explain the why.** When writing thresholds or criteria in code/docs, include inline comments with the research justification (paper name + arXiv ID). Anyone reading the code should understand why that specific number was chosen.
4. **Challenge assumptions.** If a proposed change seems reasonable but you haven't verified it against GRPO/RFT literature, say so and research it before implementing. The cost of a wrong threshold (wasting GPU hours or blocking valid training) is high.

This rule exists because GRPO/RFT has counterintuitive properties:
- Low base model scores are expected and even desirable (DeepSeek R1-Zero: 15.6% → 71%)
- Dead-weight prompts (30-99% per batch) are normal (ICLR 2026)
- Hard examples yield 47% gains vs 3-15% for easy ones (arXiv:2508.14094)
- Eval K=1 ≠ Training K=8, so eval metrics are lower bounds, not predictions

**Key reference papers** (check these before any threshold change):
- DeepSeek-R1 (arXiv:2501.12948) — GRPO from scratch, base model capabilities
- DAPO (arXiv:2503.14476) — Dynamic sampling, clip-higher, zero-variance handling
- Dr. GRPO (arXiv:2503.20783) — Length bias, score-length correlation
- "Hard Examples Are All You Need" (arXiv:2508.14094) — Difficulty distribution
- "No Prompt Left Behind" (arXiv:2509.21880, ICLR 2026) — Zero-variance prompt frequency
- OpenAI RFT Guide — Platform requirements, grader quality
- "Tricks or Traps" (arXiv:2508.08221) — Practical GRPO failure modes

---

## Mandatory Conventions

### State Management (read `docs/state-management-pattern.md` first)

- Use **React Context + ahooks `useRequest`** for shared/server state
- **NEVER** use Redux, Zustand, or custom hooks with useState+useEffect for shared state
- Naming: `[Feature]Context.tsx`, `[Feature]Provider`, `[Feature]Consumer()`
- Location: `src/contexts/[Feature]Context.tsx`
- Error handling: always `toast.error()` from Sonner in `onError` callbacks
- External events (from Lucy agent tools): use `emitter.on()` pattern, always clean up in useEffect return

### Key Contexts to Know

| Context | Purpose |
|---------|---------|
| `DatasetsContext` | Dataset CRUD (Gateway API) |
| `DatasetsUIContext` | Navigation, selection, search/sort |
| `DatasetDetailContext` | Current dataset detail state |
| `FinetuneProcessContext` | Finetune pipeline step state |
| `EvalJobsContext` | Evaluation job management (internal code still uses `dryRun` naming) |
| `KnowledgeSourcesContext` | Knowledge source state |
| `PlanContext` | Finetune plan state |
| `AgentPanelContext` | Lucy agent panel state |
| `ProjectContext` | Current project |

### Code Rules

- Run `npx tsc --noEmit` after every change (**automated** — PostToolUse hook runs this after `.ts`/`.tsx` edits)
- @distri/react and @distri/core are **vendored** — changes must be made in the distri repo and synced via `scripts/sync-distrijs.sh`
- Tools execute **locally in the browser**, not on the server
- Gateway API (SQLite at `~/.vllora/vllora.db`) is the primary persistence layer — IndexedDB only for upload sessions and plan state
- Auth: localStorage key `vlora_user_email` (for E2E testing: set to `test@e2e.local`)

### Hooks (`.claude/settings.json`)

Automated guardrails that run on every file edit — no manual steps needed.

| Hook | Trigger | What it does |
|------|---------|-------------|
| `post-edit-typecheck.sh` | After `Write`/`Edit` on `.ts`/`.tsx` | Runs `npx tsc --noEmit`, feeds errors back as context |
| `doc-sync-reminder.sh` | After `Write`/`Edit` on key source dirs | Reminds to update feature docs per the Documentation Sync Rule |
| `console-log-warning.sh` | After `Write`/`Edit` on `.ts`/`.tsx` | Warns if `console.log`/`console.debug` left in non-test files |

Deny rules: `Edit(vendor/**)` and `Write(vendor/**)` are blocked at the tool level.

Hook scripts live in `.claude/hooks/`. Configuration is in `.claude/settings.json`.

---

## Documentation Sync Rule

**MANDATORY — enforced by PostToolUse hook.** After ANY code change to pipeline source files, you MUST update the relevant docs **in the same response** (not "later", not "in a follow-up"). The hook will remind you which docs to check.

| What changed | Update |
|-------------|--------|
| `generate_records.py` | `how-skill-work/generate-records-deep-dive.md`, `pipeline-overview.md`, `data-pipeline-flow.md`, `SKILL.md` Step 4, `README.md` |
| `deduplicate_records.py` | `how-skill-work/generate-records-deep-dive.md`, `pipeline-overview.md` |
| `finetune.py` (subcommands/thresholds) | `SKILL.md`, `README.md`, `pipeline-overview.md`, verify `compute-readiness-gate.ts` sync |
| Other skill scripts | `README.md` script table, `pipeline-overview.md` helper scripts table |
| `SKILL.md` | `README.md`, `pipeline-overview.md` |
| Skill reference docs | `SKILL.md`, `README.md`, `agents/training-monitor.md` |
| Skill subagents | `README.md` agent delegation, `pipeline-overview.md` subagent table |
| Topic hierarchy or system prompt logic | `how-skill-work/generate-topics-deep-dive.md` |
| State machine transitions | `docs/features/lucy-finetune-dataset/state-machine.md` |
| Tools added/removed/modified | `docs/features/lucy-finetune-dataset/architecture.md` |
| Event emitters added/changed | `docs/features/lucy-finetune-dataset/event-emitter-guide.md` |
| Agent prompt/tools changed | The relevant agent md in `gateway/agents/finetune/` |
| Skill packaging logic | `docs/features/skill-package/README.md`, `architecture.md`, or `data-flow.md` |

**To verify all docs are in sync**: run `/sync-docs` — it reads all source files, compares against docs, and auto-fixes gaps.

---

## Skills

Skills extend Claude's capabilities. Auto-invoked when relevant, or invoke manually with `/name`.

| Skill | Auto-invoke | When to use |
|-------|-------------|------------|
| `/finetune-context` | Yes | Load full pipeline context — skill definition, architecture, agents, cross-layer sync points |
| `/finetune-fix <bug>` | Manual | Fix a bug (loads skill + UI readiness gate + state management) |
| `/finetune-develop <feature>` | Manual | Implement a feature (loads skill + agents + UI + API reference) |
| `/finetune-ui <task>` | Manual | Design or enhance UI (loads redesign docs, readiness gate, components) |
| `/finetune-e2e <test>` | Manual | E2E test with browser automation (screenshots, verification) |
| `/research-grpo` | Manual | Research latest GRPO/RFT papers, check if thresholds/techniques need updating |
| `/skill-package-context` | Yes | Load skill package docs — use when asked about skill packaging, SKILL.md, JSONL format |
| `/sync-docs` | Yes | Verify and auto-fix pipeline docs — reads source files, compares against docs, updates outdated content |

## Sub-Agents

Sub-agents run in isolated contexts with persistent project-level memory.

| Agent | Model | When to use |
|-------|-------|------------|
| `code-reviewer` | Sonnet | After writing/modifying code — reviews for quality, patterns, security, architecture |
| `architecture-explorer` | Sonnet | Cross-layer questions — traces data flow across all 6 layers (read-only) |
| `debugger` | Sonnet | When hitting bugs — diagnoses errors across the full stack, implements fixes |
| `grpo-researcher` | Sonnet | Research GRPO/RFT papers — searches arXiv, blogs, platform docs for new findings (read-only) |

## Team Commands

Multi-agent teams for complex tasks. Enabled via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `.claude/settings.json`.

Each team spawns 3 independent Claude sessions working in parallel. Teams cost 3-4x tokens vs single sessions — use only when parallelism provides real value (tasks > 4 hours sequentially, cross-layer work with clear file ownership, or competing hypotheses).

| Command | Teammates | When to use |
|---------|-----------|------------|
| `/team-develop <feature>` | architect (Opus) + implementer + reviewer | Non-trivial features touching skill + UI + gateway layers |
| `/team-investigate <issue>` | skill-investigator + ui-investigator + gateway-investigator | Cross-layer bugs where root cause is unclear — each explores a different layer |
| `/team-review` | quality-reviewer + security-reviewer + test-reviewer | Pre-PR review — parallel code quality, security audit, and test coverage analysis |

**Best practices** (from community research):
- 3-5 teammates is the sweet spot — beyond 5, coordination overhead exceeds productivity
- Each teammate should own different files — no two teammates editing the same file
- Aim for 5-6 tasks per teammate
- Monitor actively — redirect stuck teammates, synthesize findings
- Shut down teammates gracefully when done (SendMessage with shutdown_request)

---

## Common Gotchas

1. **"Evaluation" vs "Dry Run"**: Display text says "Evaluation" but all internal code uses `dryRun` / `dry_run` naming (file names, variables, DB stores, tool names). Don't rename internal identifiers.

2. **Vendored @distri packages**: These live in `vendor/` and are NOT editable in this repo. `Edit` and `Write` on `vendor/**` are **denied** in `.claude/settings.json`. To change them: edit in the distri repo → build → run `scripts/sync-distrijs.sh`.

3. **Gateway API (SQLite) is the source of truth**: Datasets, workflows, records, evaluation jobs, and knowledge sources are all stored in the Gateway's SQLite database at `~/.vllora/vllora.db`. The UI fetches everything via API adapters in `src/services/adapters/`. IndexedDB is only used for ephemeral UI state (upload sessions in `upload-session-db.ts`, plan state in `proposed-plan-store.ts`). To inspect data directly: `sqlite3 ~/.vllora/vllora.db ".tables"`

4. **Tools execute in the browser**: All 70 finetune tool files (45 per-step) run locally via the @distri/react tool execution pipeline. They are NOT server-side.

5. **Event emitter cleanup**: When using `emitter.on()` in a React component, ALWAYS return a cleanup function in `useEffect`. Missing cleanup = memory leaks + stale listeners. See `event-emitter-guide.md` for the full event map.

6. **State machine validation**: Workflow steps can only advance if validation passes. Check `state-machine.md` for the rules before modifying transitions.

7. **Cross-repo tool contracts**: Tool definitions in agent md files (gateway repo) must match tool implementations in `distri-finetune-tools/` (this repo). Mismatches cause silent failures.

8. **Lucy is disabled by default**: `VITE_LUCY_ENABLED` defaults to `false`. The UI is a visualization layer — the finetune pipeline is driven by external skills (Codex/Claude Code). All Lucy-gated code uses `IS_LUCY_ENABLED` from `src/lib/feature-flags.ts`. Gated: `LucySidebar`, `AgentPanelWrapper`, `SidebarAgentButton`, plan.md in explorer (when no plan exists), PlanPreview empty state buttons, default tab seeding.

9. **Auth for E2E testing**: Set `localStorage.setItem('vlora_user_email', 'test@e2e.local')` — no login UI needed.

10. **Backend restart after agent md changes**: When you modify any agent definition file in `gateway/agents/finetune/` (e.g., `vllora-finetune-agent.md`, `finetune-workflow-agent.md`), the backend must be restarted to pick up changes. Run `scripts/restart-backend.sh` — this kills ports 8081/9090/9091, cleans the Distri cache, and restarts both the Distri server and vLLora gateway. Warn the user that a restart is needed after editing agent files.

11. **Testing with Chrome MCP browser**: When verifying UI changes, use the **Claude in Chrome** MCP tools (`mcp__Claude_in_Chrome__*`) instead of Preview tools. The user's Chrome browser already has existing data (datasets, jobs, evaluations) which makes testing realistic. Use `tabs_context_mcp` first to get available tabs, then navigate to `localhost:5173` and use `computer` (screenshot), `read_page` (accessibility tree), `find` (element search), and `javascript_tool` (DOM inspection) to verify changes. Do NOT use `preview_*` tools for visual verification.

12. **Browser MCP context efficiency**: MCP browser tools return large responses that fill the context window fast. Follow these rules to stay efficient:

    **Prefer lightweight tools first** (ordered by context cost):
    | Tool | Context Cost | When to Use |
    |------|-------------|-------------|
    | `find(query)` | ~200 tokens | Finding specific elements — **use this first** |
    | `computer(screenshot)` | ~2-3k tokens | Visual verification ("does it look right?") |
    | `read_page(filter:"interactive")` | ~2-5k tokens | Need to interact with forms/buttons |
    | `read_page(ref_id, depth:3)` | ~1-3k tokens | Inspect one specific subtree |
    | `browser_snapshot` | ~10-15k tokens | **Last resort** — full page tree |
    | `read_page` (no filters) | ~10-20k tokens | **Avoid** — almost never needed |

    **Rules:**
    - NEVER call `read_page` or `browser_snapshot` without filters. Always pass `filter`, `depth`, `max_chars`, or `ref_id`
    - Use `find(query)` for locating elements, not `read_page`
    - Use `computer(screenshot)` for visual checks, not `browser_snapshot`
    - Save large outputs to files: `browser_snapshot(filename: "state.md")` — read later only if needed
    - Set `max_chars: 5000` on `read_page` unless you specifically need more
    - Run `/compact` after every 3-4 browser interactions during heavy E2E sessions
    - For clicking: `find` → get ref → `computer(left_click, coordinate)` (2 small calls, not 1 giant snapshot)
