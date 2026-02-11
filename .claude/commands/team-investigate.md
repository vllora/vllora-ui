Create an agent team to investigate and fix the following issue in the Lucy Finetune Dataset feature: $ARGUMENTS

Spawn 5 teammates with these roles. Each teammate MUST start by reading the CLAUDE.md cross-repo source map to understand the full 6-layer architecture, then read the relevant docs in `docs/features/lucy-finetune-dataset/`.

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

**1. Deep Code Reviewer** — Trace through the actual code paths related to the issue across ALL 6 layers. Start from the agent definition, follow through the distri server (orchestrator → agent_loop → tools → A2A handler → routes), then through the JS client (distri-client → useChat → chatStateStore), then to the frontend tools and UI. Validate that: tool definitions in agent md match tool implementations in distri-finetune-tools, A2A message flow is correct, props flow correctly, no logic bugs, missing imports, or broken event wiring. Report specific file:line findings.

**2. Behavior Validator** — Reproduce the expected behavior by reading the docs (README.md, state-machine.md, architecture.md). Compare documented behavior against the actual code at each layer. Check: does the distri server orchestrator handle the workflow state correctly? Does the A2A handler pass tool calls through properly? Does the frontend tool implementation match the spec? Report: "Doc says X should happen, but code does Y at file:line".

**3. UX/UI Reviewer** — Check the user-facing impact of the issue. Review LucyDatasetAssistant.tsx and related UI components. Check for: broken visual states, missing loading indicators, confusing error messages, accessibility issues, incorrect step progression UI. Also review guided-onboarding.md to verify onboarding flow is intact. Check how @distri/react components (Chat.tsx, ChatInput.tsx) render tool results.

**4. Fix Agent** — Wait for findings from the Deep Code Reviewer and Behavior Validator. Then implement the minimal fix that resolves the issue. Follow the architecture patterns documented in CLAUDE.md. Important: identify which layer the fix belongs to:
   - Agent definition → edit in vllora/gateway repo
   - Distri server → edit in distri repo (requires rebuild)
   - Frontend tools/UI → edit in this repo
   - @distri/react or @distri/core → edit in distri repo, sync via sync-distrijs.sh

**5. Docs Updater** — Wait for the Fix Agent to complete. Then check if any docs in `docs/features/lucy-finetune-dataset/` need updating based on the fix. Follow the Documentation Sync Rule in CLAUDE.md. Update relevant doc files to stay in sync with the code changes.

## Task dependencies
- Deep Code Reviewer and Behavior Validator and UX/UI Reviewer: start immediately in parallel
- Fix Agent: depends on Deep Code Reviewer and Behavior Validator completing
- Docs Updater: depends on Fix Agent completing

## Coordination rules
- Use delegate mode — lead should NOT implement anything, only coordinate
- Require plan approval from the Fix Agent before it makes changes
- Each teammate should report findings as a structured list with file:line references
- Teammates should message each other when they find contradictions between doc and code
- If the issue spans multiple layers, the Fix Agent should explain which repos need changes
