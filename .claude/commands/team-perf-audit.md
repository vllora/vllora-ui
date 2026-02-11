Create an agent team to audit performance of the Lucy Finetune Dataset feature. Focus: $ARGUMENTS

Each teammate MUST start by reading CLAUDE.md (cross-repo source map) and relevant docs in `docs/features/lucy-finetune-dataset/`.

## Key Source Files
- Frontend components: `src/components/datasets/` (all .tsx files)
- Finetune tools: `src/lib/distri-finetune-tools/`
- Contexts: `src/contexts/DatasetsContext.tsx`, `src/contexts/DatasetsUIContext.tsx`
- @distri/react hooks: `/Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/useChat.ts`
- @distri/react store: `/Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/react/src/stores/chatStateStore.ts`
- @distri/core client: `/Users/anhthuduong/Documents/GitHub/distri/distrijs/packages/core/src/distri-client.ts`

## Teammates

**1. Bundle Analyzer** — Analyze the frontend bundle for size and loading performance. Run `npm run build` and examine the output. Check: are there large dependencies that could be lazy-loaded? Are there unused imports or dead code inflating bundle size? Is code splitting being used effectively? Are dataset components lazy-loaded or all bundled upfront? Check `package.json` for heavy dependencies. Check if `@distri/react` and `@distri/core` vendored packages are tree-shakeable. Produce a report with: total bundle size, largest chunks, and specific recommendations to reduce size.

**2. Render Profiler** — Analyze React rendering performance in the dataset components. Check: are components re-rendering unnecessarily? Are expensive computations memoized (useMemo, useCallback)? Are Context providers causing cascade re-renders? Is `DatasetsContext` re-rendering all consumers when only one field changes? Are list renders using proper keys? Are there missing React.memo wrappers on pure components? Check the @distri/react Chat component and renderers for render efficiency. Produce a report with: components that re-render too often, missing memoization, and Context splitting opportunities.

**3. Network & Data Analyzer** — Analyze API call patterns and data flow. Check: are there redundant API calls (same data fetched multiple times)? Is IndexedDB access optimized (batch reads vs individual reads)? Are there request waterfalls (sequential calls that could be parallel)? Is the A2A streaming connection efficient? Are tool results cached or re-fetched? Is the `useRequest` from ahooks configured with proper caching and deduplication? Check how `DatasetsContext` loads data — does it over-fetch? Produce a report with: API call patterns, caching gaps, and data flow inefficiencies.

**4. Optimization Implementer** — After the other 3 agents complete, review their findings and implement the highest-impact optimizations. Prioritize by impact: P0 (user-visible lag or unnecessary loading), P1 (wasteful but not user-visible), P2 (minor improvements). Only implement changes in this repo — flag @distri/react or @distri/core changes for the distri repo. Follow the state management pattern from `docs/state-management-pattern.md`. Run `npm run type-check` and `npm run build` after each change to verify nothing broke.

## Task dependencies
- Bundle Analyzer, Render Profiler, Network & Data Analyzer: start in parallel
- Optimization Implementer: depends on all 3 analysts completing

## Coordination rules
- Use delegate mode — lead coordinates only
- The 3 analysts run in parallel — no dependencies between them
- Each analyst produces a structured report with: findings, impact (P0/P1/P2), file:line references, and specific fix recommendations
- Optimization Implementer should get plan approval before making changes
- Lead synthesizes all reports + implementation results into a final performance audit summary
