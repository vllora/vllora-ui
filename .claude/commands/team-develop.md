Create an agent team to implement a new feature for the Lucy Finetune Dataset feature: $ARGUMENTS

Each teammate MUST start by reading the CLAUDE.md cross-repo source map to understand the full 6-layer architecture, then read relevant docs in `docs/features/lucy-finetune-dataset/`.

## Full Architecture Layers (all teammates must understand this)
1. Agent Definition — `vllora/gateway/agents/finetune/vllora-finetune-agent.md`
2. Backend Gateway — `vllora/gateway/src/distri.rs` (downloads distri binary, starts server)
3. Distri Server (Rust) — `/Users/anhthuduong/Documents/GitHub/distri/server/`
   - `distri-core/src/agent/orchestrator.rs` — loads agent defs, manages sessions
   - `distri-core/src/agent/agent_loop.rs` — main LLM ↔ tool execution loop
   - `distri-core/src/tools/mod.rs` — tool execution framework
   - `distri-core/src/a2a/handler.rs` — A2A protocol handler
   - `distri-core/src/a2a/stream.rs` — A2A streaming
   - `distri-server/src/routes.rs` — HTTP API routes
4. Frontend — `src/components/datasets/LucyDatasetAssistant.tsx` + `src/lib/distri-finetune-tools/`
5. @distri/react & @distri/core — `/Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/`
   - `react/src/useChat.ts`, `react/src/stores/chatStateStore.ts`
   - `core/src/distri-client.ts`, `core/src/types.ts`
6. Sync script — `scripts/sync-distrijs.sh`

## Teammates

**1. Architect** — Plan the implementation across all 6 layers. Read README.md, architecture.md, and state-machine.md. Determine: which layers need changes? Does the agent definition need new tools or modified prompts? Does the distri server need changes to how it handles tool calls, A2A messages, or the agent loop? What frontend tools/types/workflow transitions are needed? What UI changes are required? What new types/interfaces are needed? Produce a detailed implementation plan with file-by-file changes per layer. Clearly mark which repo each change belongs to:
   - Agent definition → vllora/gateway repo
   - Distri server → distri repo (requires rebuild)
   - Frontend tools/UI → this repo (vllora/ui)
   - @distri/react or @distri/core → distri repo, then sync via sync-distrijs.sh
   Require plan approval before anyone starts coding.

**2. Frontend Implementer** — After the Architect's plan is approved, implement the frontend changes. Own: distri-finetune-tools/ (new/modified tools, types, workflow transitions) and LucyDatasetAssistant.tsx (UI changes). Follow existing patterns in the codebase. Do NOT touch @distri/react or @distri/core files. If the plan requires distri server or agent definition changes, flag them clearly — those must be done in separate repos.

**3. Test & Validate** — After the Frontend Implementer finishes, validate the implementation across all affected layers. Run type-check (`npm run type-check`). Trace through the full code path: agent definition → distri server (orchestrator, agent_loop, tools, A2A) → JS client (distri-client, useChat) → frontend tools → UI. Verify: state transitions are correct, tool contracts in the agent md match frontend implementations, A2A message format is consistent, props flow correctly, no missing imports. Report any issues back to the Frontend Implementer.

**4. Docs Updater** — After implementation is validated, update all affected docs in `docs/features/lucy-finetune-dataset/`. Follow the Documentation Sync Rule in CLAUDE.md. If the state machine changed, update state-machine.md. If tools changed, update architecture.md and README.md. If onboarding changed, update guided-onboarding.md. If the agent definition changed, verify the agent md is also updated.

## Task dependencies
- Architect: starts immediately, produces plan
- Frontend Implementer: depends on Architect's plan being approved
- Test & Validate: depends on Frontend Implementer completing
- Docs Updater: depends on Test & Validate completing (so docs reflect the final, validated code)

## Coordination rules
- Use delegate mode — lead coordinates only
- Require plan approval from the Architect before implementation begins
- Frontend Implementer should message the Architect if the plan has gaps or ambiguities
- Test & Validate should message the Frontend Implementer directly with issues to fix
- If the feature requires changes in multiple repos, the lead should summarize which repos need PRs
- Lead should NOT synthesize until Docs Updater is done
