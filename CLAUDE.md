## Lucy Finetune Dataset Feature

The main feature under active development. Documentation lives in `docs/features/lucy-finetune-dataset/`. When working on finetune-related code, ALWAYS read the relevant docs first.

### Key Documentation Files
- `README.md` — Full design doc: 7-step RFT workflow, data structures, tools spec, conversation flows, chess/Stockfish support, datasets UI
- `architecture.md` — 3-tier system architecture (Frontend React/TS → vllora gateway Rust → Distri A2A server), tool definitions, state management
- `state-machine.md` — Workflow state machine: step transitions, validation rules, `WorkflowState` type, step-specific logic
- `guided-onboarding.md` — Onboarding UX flow for new users entering the finetune pipeline
- `data-generation-agent.md` — Data generation sub-agent: how synthetic training data is produced
- `dataset-readme-generation.md` — Auto-generation of dataset README files
- `vendored-distri-packages.md` — Vendored distri package details and versioning
- `team-review-report.md` — Team review feedback and architectural decisions

### Key Concepts
- **7-Step Pipeline**: Topics Config → Categorization → Coverage & Generation → Grader Config → Dry Run → Training → Deployment
- **State Machine**: `WorkflowState` in IndexedDB, steps can be OPTIONAL or REQUIRED, supports rollback
- **Two Workflows**: Full pipeline (from scratch) and Quick pipeline (pre-existing dataset)
- **Tools**: ~15 process-focused tools (workflow control + step execution + data access)
- **Architecture**: Frontend tools execute locally in browser, agent runs on Distri server via A2A protocol

### Cross-Repo Source Map

The Lucy Finetune feature spans 3 repositories. When investigating issues, ALWAYS check the relevant layer(s):

**1. Agent Definition (what the AI agent does)**
- Agent prompt/tools: `/Users/anhthuduong/Documents/GitHub/vllora/gateway/agents/finetune/vllora-finetune-agent.md`

**2. Backend — vllora gateway (Rust)**
- Distri server lifecycle (download binary, start server, health check): `/Users/anhthuduong/Documents/GitHub/vllora/gateway/src/distri.rs`

**3. Frontend — this repo (React/TypeScript)**
- Main UI component: `src/components/datasets/LucyDatasetAssistant.tsx`
- Finetune tools (workflow, steps, types): `src/lib/distri-finetune-tools/`
  - `workflow/` — workflow state machine, transitions
  - `steps/` — per-step tool implementations
  - `types.ts` — shared TypeScript types
  - `index.ts` — tool registry and exports

**4. Distri server & client (Rust — the actual binary that gateway downloads and runs)**
- Repo: `/Users/anhthuduong/Documents/GitHub/distri/`
- Client binary: `/Users/anhthuduong/Documents/GitHub/distri/distri/src/`
  - `client.rs` — main client logic
  - `client_app.rs` — client application
  - `client_stream.rs` — streaming
  - `local_tools.rs` — local tool execution
  - `external_tools_runtime.rs` — external tool runtime
- Server: `/Users/anhthuduong/Documents/GitHub/distri/server/`
  - `distri-core/src/agent/orchestrator.rs` — AgentOrchestrator (loads agent defs, runs agent loop)
  - `distri-core/src/agent/agent_loop.rs` — main agent execution loop
  - `distri-core/src/tools/mod.rs` — tool execution framework
  - `distri-core/src/tools/builtin.rs` — built-in tools
  - `distri-core/src/a2a/handler.rs` — A2A protocol handler
  - `distri-core/src/a2a/stream.rs` — A2A streaming
  - `distri-core/src/llm.rs` — LLM integration
  - `distri-server/src/routes.rs` — HTTP API routes
  - `distri-server/src/agent_server.rs` — agent server setup
- A2A types: `/Users/anhthuduong/Documents/GitHub/distri/distri-a2a/src/a2a_types.rs`

**5. @distri/react & @distri/core packages (upstream JS dependency)**
- Source: `/Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/`
  - `useChat.ts` — chat hook (message streaming, tool execution)
  - `stores/chatStateStore.ts` — Zustand state store for chat
  - `useAgent.ts` — agent connection hook
  - `useThreads.ts` — thread management
  - `components/Chat.tsx` — main chat component
  - `components/ChatInput.tsx` — input component
  - `components/AskFollowUp.tsx` — follow-up prompt component
- Core client: `/Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/core/src/`
  - `distri-client.ts` — A2A protocol client
  - `types.ts` — core type definitions
  - `events.ts` — event system
  - `encoder.ts` — message encoding

**6. Sync mechanism (how distrijs changes reach this repo)**
- Script: `scripts/sync-distrijs.sh` — copies built packages from distri repo into vendored location

### State Management Pattern (MANDATORY)

When modifying or creating UI code in this repo, ALWAYS follow the React Context pattern documented in `docs/state-management-pattern.md`. Read that file before writing any new state management code.

**Key rules:**
- Use **React Context + ahooks `useRequest`** for shared/server state — NOT Redux, NOT Zustand, NOT custom hooks with useState+useEffect
- Naming: `[Feature]Context.tsx`, `[Feature]Provider`, `[Feature]Consumer()`
- Location: `src/contexts/[Feature]Context.tsx`
- Error handling: always use `toast.error()` from Sonner in `onError` callbacks
- External events (Lucy agent tools): use `emitter.on()` pattern, always clean up in useEffect return
- Existing contexts to know about: `DatasetsContext` (CRUD + IndexedDB), `DatasetsUIContext` (navigation, selection, search/sort), `ProjectContext`, `LocalModelsContext`
- Do NOT create new custom hooks for server state — create a Context instead
- Do NOT use local component state for data shared across components

### Documentation Sync Rule

After ANY code change (bug fix, new feature, refactor), check whether the change affects behavior documented in `docs/features/lucy-finetune-dataset/`. If it does, update the relevant doc file(s) in the same change. Key triggers:
- State machine transitions changed → update `state-machine.md`
- Tools added/removed/modified → update `architecture.md` and `README.md` (Tools Specification section)
- Data structures changed → update `README.md` (Data Structures section)
- Onboarding flow changed → update `guided-onboarding.md`
- Data generation logic changed → update `data-generation-agent.md`
- Dataset README generation changed → update `dataset-readme-generation.md`
- Vendored packages updated → update `vendored-distri-packages.md`
- Agent prompt/tools changed → update the agent md at `gateway/agents/finetune/vllora-finetune-agent.md`

Do NOT skip this step. Outdated docs cause compounding errors in future sessions.

### Slash Commands

**Single-agent commands** (one Claude session with full context):
- `/finetune-context` — Load all feature docs into context for Q&A
- `/finetune-fix <description>` — Fix a bug (loads docs + cross-repo sources)
- `/finetune-develop <description>` — Implement a feature (loads docs + cross-repo sources)
- `/finetune-arch` — Load full-stack architecture sources from all repos
- `/finetune-ui <description>` — Design or enhance UI (loads UI components, @distri/react renderers, UX docs — no backend code)
- `/finetune-e2e <description>` — E2E test with Playwright MCP (launches browser, screenshots, verifies UI against docs)

**Agent team commands** (multiple parallel Claude sessions, requires experimental flag):
- `/team-investigate <issue>` — 5 agents: Deep Code Reviewer, Behavior Validator, UX/UI Reviewer, Fix Agent, Docs Updater. Reviewers run in parallel, Fix Agent waits for findings, Docs Updater syncs docs after fix.
- `/team-review <what to review>` — 5 agents: Architecture Reviewer, State Machine Reviewer, UX/UI Reviewer, Devil's Advocate, Docs Checker. All run in parallel, Devil's Advocate challenges other findings.
- `/team-develop <feature>` — 4 agents: Architect (plans), Frontend Implementer (builds), Test & Validate (verifies), Docs Updater (syncs docs). Sequential pipeline with plan approval gate.
- `/team-ux-redesign <focus area>` — 4 agents: UX Flow Analyst, Visual & Interaction Reviewer, Information Architecture Reviewer (all parallel), then Redesign Proposer synthesizes into a prioritized design spec (P0/P1/P2).
- `/team-refactor <target>` — 4 agents: Dependency Mapper, Migration Planner, Refactor Implementer, Regression Validator. Sequential pipeline with plan approval gate. Behavior-preserving only.
- `/team-perf-audit <focus>` — 4 agents: Bundle Analyzer, Render Profiler, Network & Data Analyzer (all parallel), then Optimization Implementer applies highest-impact fixes.
- `/team-e2e-test <focus>` — 4 agents: Test Planner, Happy Path Runner, Edge Case Runner (parallel after plan), Bug Reporter. Uses Playwright MCP for browser automation.
- `/team-security <focus>` — 4 agents: Frontend Security Auditor, API & Network Auditor, Dependency & Supply Chain Auditor, Secrets & Data Exposure Auditor. All parallel, OWASP-aligned findings.