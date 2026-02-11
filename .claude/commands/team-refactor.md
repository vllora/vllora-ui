Create an agent team to refactor existing code in the Lucy Finetune Dataset feature without changing behavior. Focus: $ARGUMENTS

Each teammate MUST start by reading CLAUDE.md (cross-repo source map, state management pattern) and relevant docs in `docs/features/lucy-finetune-dataset/`.

## Full Architecture Layers (all teammates must understand this)
1. Agent Definition — `vllora/gateway/agents/finetune/vllora-finetune-agent.md`
2. Backend Gateway — `vllora/gateway/src/distri.rs`
3. Distri Server (Rust) — `/Users/anhthuduong/Documents/GitHub/distri/server/`
   - `distri-core/src/agent/orchestrator.rs`, `agent_loop.rs`, `tools/mod.rs`
   - `distri-core/src/a2a/handler.rs`, `a2a/stream.rs`
   - `distri-server/src/routes.rs`
4. Frontend — `src/components/datasets/LucyDatasetAssistant.tsx` + `src/lib/distri-finetune-tools/`
5. @distri/react & @distri/core — `/Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/`
6. Sync script — `scripts/sync-distrijs.sh`

## State Management Pattern (MANDATORY)
!`cat docs/state-management-pattern.md`

## Teammates

**1. Dependency Mapper** — Analyze the code targeted for refactoring. Map all dependencies: what imports it, what it imports, what state it reads/writes, what events it emits/listens to, what APIs it calls. Produce a dependency graph showing which files/modules are coupled. Identify: circular dependencies, God components (too many responsibilities), duplicated logic, dead code, and overly complex functions (high cyclomatic complexity). Flag which dependencies cross repo boundaries (this repo vs distri repo). This map is critical — the other agents depend on it.

**2. Migration Planner** — After the Dependency Mapper finishes, design the refactoring plan. For each change: describe the current structure, the target structure, the migration steps, and the risk level (high/medium/low). Ensure: no behavior changes, all existing tests still pass, state management follows the Context pattern from `docs/state-management-pattern.md`, and @distri/react changes are flagged for the distri repo. Produce a step-by-step migration order that respects dependencies (refactor leaves before branches). Require plan approval before implementation begins.

**3. Refactor Implementer** — After the Migration Planner's plan is approved, execute the refactoring. Follow the plan exactly — do not improvise additional changes. For each step: make the change, run `npm run type-check` to verify types, and confirm no behavior changed. If a step breaks types or behavior, stop and report back to the Migration Planner. Only edit files in this repo (src/components/datasets/, src/lib/distri-finetune-tools/, src/contexts/). Flag any changes needed in the distri repo.

**4. Regression Validator** — After the Refactor Implementer finishes, verify nothing broke. Run `npm run type-check` and `npm run build`. Trace through the full code path for the refactored area: agent definition → distri server → JS client → frontend tools → UI. Verify: all imports resolve, all types match, state transitions still work, event emitter subscriptions are intact, no missing exports, no unused imports. Compare the before/after behavior — the refactoring MUST be behavior-preserving. Report any regressions back to the Refactor Implementer.

## Task dependencies
- Dependency Mapper: starts immediately
- Migration Planner: depends on Dependency Mapper completing
- Refactor Implementer: depends on Migration Planner's plan being approved
- Regression Validator: depends on Refactor Implementer completing

## Coordination rules
- Use delegate mode — lead coordinates only
- Require plan approval from Migration Planner before implementation begins
- Refactor Implementer should stop immediately if any step breaks types or behavior
- Regression Validator should message the Refactor Implementer directly with issues to fix
- Lead should NOT synthesize until Regression Validator confirms no regressions
- If the refactoring requires changes in multiple repos, the lead should summarize which repos need PRs
