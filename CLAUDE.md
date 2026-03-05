# vLLora UI

React/TypeScript frontend for building AI finetune datasets with an AI assistant (Lucy).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19, TypeScript 5.9 |
| Build | Vite 7 |
| Styling | Tailwind CSS 3.4, Radix UI, shadcn/ui |
| State | React Context + ahooks `useRequest` |
| Persistence | IndexedDB (local-first, no backend DB) |
| Package Manager | pnpm |
| Testing | Vitest, @testing-library/react |
| AI Agent | Distri A2A protocol (@distri/core, @distri/react) |

## Common Commands

```bash
npm run dev           # Dev server → localhost:5173
npm run build         # Type-check + production build
npx tsc --noEmit      # Type-check only (run after every change)
npm test              # Run tests
scripts/sync-distrijs.sh  # Sync vendored @distri packages from distri repo
scripts/restart-backend.sh  # Restart Distri server + vLLora gateway (required after agent md changes)
```

Backend (Rust gateway) runs at `localhost:9090`. Start via `npm run start:backend` or from the gateway repo.

---

## Project Structure

```
src/
├── components/
│   ├── datasets/          # Main finetune UI (35+ components)
│   ├── agent/lucy-agent/  # Lucy AI assistant components
│   ├── chat/              # Chat/messaging UI
│   ├── ui/                # shadcn/ui primitives (32 files)
│   └── ...                # settings, models, traces, debug
├── contexts/              # 33 React Contexts (all shared state lives here)
├── services/              # 27 service modules (API clients, IndexedDB, polling)
├── lib/
│   ├── distri-finetune-tools/  # 53 finetune tool implementations
│   ├── distri-dataset-tools/   # Dataset analysis & validation
│   └── distri-data-tools/      # Trace data fetching
├── types/                 # 8 type definition files
└── ...
docs/
├── state-management-pattern.md     # MANDATORY: read before writing state code
└── features/
    ├── lucy-finetune-dataset/      # 8 feature docs (see below)
    └── skill-package/              # 3 docs: README, architecture, data-flow
```

---

## Lucy Finetune Dataset Feature (Active Development)

The main feature. An AI assistant (Lucy) in the sidebar guides users through building finetune datasets. Think Claude Code in VS Code: Lucy proposes plans, shows progress, executes — while the main area shows the workspace.

### 7-Step Pipeline

```
Topics Config → Categorization → Coverage & Generation → Grader Config → Evaluation → Training → Deployment
```

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

| Doc | What it covers |
|-----|---------------|
| `docs/features/lucy-finetune-dataset/README.md` | Overview and index |
| `docs/features/lucy-finetune-dataset/architecture.md` | 3-tier system, tool definitions, state management |
| `docs/features/lucy-finetune-dataset/state-machine.md` | Workflow steps, transitions, validation rules, `WorkflowState` type |
| `docs/features/lucy-finetune-dataset/guided-onboarding.md` | Onboarding flow, plan types, step registry |
| `docs/features/lucy-finetune-dataset/data-generation-agent.md` | Synthetic training data generation |
| `docs/features/lucy-finetune-dataset/dataset-readme-generation.md` | Auto-generated dataset README |
| `docs/features/lucy-finetune-dataset/event-emitter-guide.md` | 14 events, emitters/listeners map, context architecture |
| `docs/features/lucy-finetune-dataset/vendored-distri-packages.md` | Vendored package details |
| `docs/features/skill-package/README.md` | Skill package overview, output format, how Claude uses it |
| `docs/features/skill-package/architecture.md` | Skill package source map, types, functions, debugging |
| `docs/features/skill-package/data-flow.md` | End-to-end data flow from IndexedDB through packaging |
| `docs/state-management-pattern.md` | **MANDATORY** — Context + ahooks pattern |

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

### Layer 2: Rust Gateway

| File | Purpose |
|------|---------|
| `../gateway/src/distri.rs` | Downloads distri binary, starts server, health checks |

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
| `src/lib/distri-finetune-tools/steps/` | 42 per-step tool implementations |
| `src/lib/distri-finetune-tools/workflow/` | Workflow state machine |
| `src/contexts/` | All shared state (33 contexts) |
| `src/services/` | API clients, IndexedDB, polling (27 modules) |

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
| `DatasetsContext` | Dataset CRUD + IndexedDB |
| `DatasetsUIContext` | Navigation, selection, search/sort |
| `DatasetDetailContext` | Current dataset detail state |
| `FinetuneProcessContext` | Finetune pipeline step state |
| `DryRunJobsContext` | Evaluation job management |
| `KnowledgeSourcesContext` | Knowledge source state |
| `PlanContext` | Finetune plan state |
| `AgentPanelContext` | Lucy agent panel state |
| `ProjectContext` | Current project |

### Code Rules

- Run `npx tsc --noEmit` after every change (**automated** — PostToolUse hook runs this after `.ts`/`.tsx` edits)
- @distri/react and @distri/core are **vendored** — changes must be made in the distri repo and synced via `scripts/sync-distrijs.sh`
- Tools execute **locally in the browser**, not on the server
- IndexedDB is the primary persistence layer (datasets, workflows, jobs)
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

After ANY code change, check whether it affects behavior documented in `docs/features/`. If it does, **update the relevant doc file(s) in the same change**:

| What changed | Update |
|-------------|--------|
| State machine transitions | `lucy-finetune-dataset/state-machine.md` |
| Tools added/removed/modified | `lucy-finetune-dataset/architecture.md` |
| Onboarding flow or planning | `lucy-finetune-dataset/guided-onboarding.md` |
| Data generation logic | `lucy-finetune-dataset/data-generation-agent.md` |
| README generation | `lucy-finetune-dataset/dataset-readme-generation.md` |
| Vendored packages updated | `lucy-finetune-dataset/vendored-distri-packages.md` |
| Event emitters added/changed | `lucy-finetune-dataset/event-emitter-guide.md` |
| Agent prompt/tools changed | The relevant agent md in `gateway/agents/finetune/` |
| Skill packaging logic (generate, download, viewer) | `skill-package/README.md`, `architecture.md`, or `data-flow.md` |

---

## Skills

Skills extend Claude's capabilities. Auto-invoked when relevant, or invoke manually with `/name`.

| Skill | Auto-invoke | When to use |
|-------|-------------|------------|
| `/finetune-context` | Yes | Load all feature docs — use when asked about the finetune feature |
| `/finetune-fix <bug>` | Manual | Fix a bug (loads docs + cross-repo sources + state management pattern) |
| `/finetune-develop <feature>` | Manual | Implement a feature (loads docs + cross-repo sources) |
| `/finetune-arch` | Yes | Load full-stack architecture from all 6 layers across 3 repos |
| `/finetune-ui <task>` | Manual | Design or enhance UI (loads UI components, @distri/react renderers, UX docs) |
| `/finetune-e2e <test>` | Manual | E2E test with Playwright MCP (browser automation, screenshots, verification) |
| `/skill-package-context` | Yes | Load skill package docs — use when asked about skill packaging, SKILL.md, JSONL format |

## Sub-Agents

Sub-agents run in isolated contexts with persistent project-level memory.

| Agent | Model | When to use |
|-------|-------|------------|
| `code-reviewer` | Sonnet | After writing/modifying code — reviews for quality, patterns, security, architecture |
| `architecture-explorer` | Sonnet | Cross-layer questions — traces data flow across all 6 layers (read-only) |
| `debugger` | Sonnet | When hitting bugs — diagnoses errors across the full stack, implements fixes |

## Team Commands

Multi-agent teams for complex tasks. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

| Command | Agents | When to use |
|---------|--------|------------|
| `/team-investigate <issue>` | 5 | Deep investigation: code reviewer, behavior validator, UX reviewer, fix agent, docs updater |
| `/team-review <what>` | 5 | Comprehensive review: architecture, state machine, UX, devil's advocate, docs checker |
| `/team-develop <feature>` | 4 | New feature: architect → frontend implementer → test & validate → docs updater |
| `/team-ux-redesign <area>` | 4 | UX review: flow analyst, visual reviewer, info architecture → redesign proposer |
| `/team-refactor <target>` | 4 | Safe refactoring: dependency mapper → migration planner → implementer → regression validator |
| `/team-perf-audit <focus>` | 4 | Performance: bundle analyzer, render profiler, network analyzer → optimization implementer |
| `/team-e2e-test <focus>` | 4 | E2E testing: test planner → happy path runner + edge case runner → bug reporter |
| `/team-security <focus>` | 4 | Security audit: frontend, API, dependency, secrets auditors (OWASP-aligned) |

---

## Common Gotchas

1. **"Evaluation" vs "Dry Run"**: Display text says "Evaluation" but all internal code uses `dryRun` / `dry_run` naming (file names, variables, DB stores, tool names). Don't rename internal identifiers.

2. **Vendored @distri packages**: These live in `vendor/` and are NOT editable in this repo. `Edit` and `Write` on `vendor/**` are **denied** in `.claude/settings.json`. To change them: edit in the distri repo → build → run `scripts/sync-distrijs.sh`.

3. **IndexedDB is the source of truth**: Datasets, workflows, evaluation jobs, and knowledge sources are all stored in IndexedDB. There is no backend database — the backend only handles API calls to external services (OpenAI, eval server).

4. **Tools execute in the browser**: All 53 finetune tools run locally via the @distri/react tool execution pipeline. They are NOT server-side.

5. **Event emitter cleanup**: When using `emitter.on()` in a React component, ALWAYS return a cleanup function in `useEffect`. Missing cleanup = memory leaks + stale listeners. See `event-emitter-guide.md` for the full event map.

6. **State machine validation**: Workflow steps can only advance if validation passes. Check `state-machine.md` for the rules before modifying transitions.

7. **Cross-repo tool contracts**: Tool definitions in agent md files (gateway repo) must match tool implementations in `distri-finetune-tools/` (this repo). Mismatches cause silent failures.

8. **Auth for E2E testing**: Set `localStorage.setItem('vlora_user_email', 'test@e2e.local')` — no login UI needed.

9. **Backend restart after agent md changes**: When you modify any agent definition file in `gateway/agents/finetune/` (e.g., `vllora-finetune-agent.md`, `finetune-workflow-agent.md`), the backend must be restarted to pick up changes. Run `scripts/restart-backend.sh` — this kills ports 8081/9090/9091, cleans the Distri cache, and restarts both the Distri server and vLLora gateway. Warn the user that a restart is needed after editing agent files.

10. **Testing with Chrome MCP browser**: When verifying UI changes, use the **Claude in Chrome** MCP tools (`mcp__Claude_in_Chrome__*`) instead of Preview tools. The user's Chrome browser already has existing data (datasets, jobs, evaluations) which makes testing realistic. Use `tabs_context_mcp` first to get available tabs, then navigate to `localhost:5173` and use `computer` (screenshot), `read_page` (accessibility tree), `find` (element search), and `javascript_tool` (DOM inspection) to verify changes. Do NOT use `preview_*` tools for visual verification.

11. **Browser MCP context efficiency**: MCP browser tools return large responses that fill the context window fast. Follow these rules to stay efficient:

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
