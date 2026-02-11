Create an agent team to do a comprehensive review of recent changes to the Lucy Finetune Dataset feature. $ARGUMENTS

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

**1. Architecture Reviewer** — Review changes against the full 6-layer architecture. Check: does the change respect layer boundaries? Are tools still executing locally in browser? Does the agent definition stay in sync with frontend tool implementations? Are the distri server's orchestrator and A2A handler correctly routing tool calls? Are there new coupling points between layers that shouldn't exist? Review all layers: agent md, distri.rs, distri server (orchestrator, agent_loop, tools, A2A handler, routes), distri-finetune-tools/, and @distri/react hooks.

**2. State Machine Reviewer** — Review changes against state-machine.md. Check: are all state transitions valid? Can the workflow get stuck in an unreachable state? Are OPTIONAL vs REQUIRED step rules respected? Does rollback still work? Are validation rules enforced before advancing? Read the workflow/ directory in distri-finetune-tools/. Also check if the distri server's agent_loop.rs and orchestrator.rs correctly handle workflow state during tool execution.

**3. UX/UI Reviewer** — Review user-facing changes in LucyDatasetAssistant.tsx and related components. Check: is the onboarding flow intact per guided-onboarding.md? Are loading states, error states, and empty states handled? Is the step progression clear to users? Are quick actions working? Does the UI reflect the current workflow state correctly? Check how @distri/react components (Chat.tsx, ChatInput.tsx, AskFollowUp.tsx) render tool results and streaming responses.

**4. Devil's Advocate** — Challenge every change across ALL layers. Look for: edge cases that will break, assumptions that won't hold, race conditions in async operations, what happens when the distri server is down or returns errors, what happens if the A2A stream disconnects mid-tool-call, what happens with malformed data from the LLM, what happens if IndexedDB is cleared mid-workflow, what happens if the agent definition's tool schema doesn't match the frontend implementation. Try to break things the other reviewers missed.

**5. Docs Checker** — Verify that all docs in `docs/features/lucy-finetune-dataset/` are still accurate after the changes. Follow the Documentation Sync Rule in CLAUDE.md. Cross-reference each doc against the actual code at every layer. Flag any doc that is now outdated and propose specific updates.

## Coordination rules
- All 5 teammates start in parallel — no dependencies
- Use delegate mode — lead coordinates only
- Each teammate should produce a structured report with: findings, severity (critical/warning/info), and file:line references
- Devil's Advocate should actively challenge findings from other teammates
- Lead synthesizes all reports into a final review summary when everyone is done
