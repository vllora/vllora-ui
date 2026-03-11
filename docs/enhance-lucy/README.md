# Enhancing Lucy: Closing the Gap with Claude Code

Lucy's finetune agent follows a fixed 7-step pipeline. Claude Code with the finetune skill operates like an autonomous researcher — it reads results, diagnoses problems, changes strategy, and iterates until the model is good. This document set identifies the gaps and proposes concrete solutions.

## Implementation Status (2026-03-10)

| Phase | Status | Key Deliverables |
|-------|--------|-----------------|
| **Phase 1: Eyes** | ✅ Done | `get_evaluation_details`, iteration state DB, catch-up (`buildCatchUpContext`, `reviewedByAgent`, `mark_job_reviewed`, auto-trigger events). Sidebar notification badge wiring complete but visual indicator not yet rendered. |
| **Phase 2: Autonomy** | ✅ Done | `analyze_evaluation` (reactive), inner/outer loop protocol in agent md, 4 new `ExecutionStepId` types (`regenerate_topic`, `adjust_grader`, `analyze`, `post_training_eval`) with executors |
| **Phase 3: Wisdom** | ✅ Done | `analyze_training` done (reactive), `get_training_metrics` (GRPO/GSPO reinforcement metrics), stall detection comprehensive (RFT decision tree Steps A-F in `analyze_evaluation`) |
| **Phase 4: Hands** | ✅ Done | `test_grader_sample` + `auto_test`, `check_viability` tool, 9 UI card renderers (see below), fresh thread per session (no history restoration), all scores in raw decimal format |

### UI Card Renderers

| Component | Purpose |
|-----------|---------|
| `LucyAnalyzeEvalRenderer` | Eval analysis results card |
| `LucyAnalyzeTrainingRenderer` | Training analysis results card |
| `LucyAutoCountdownCard` | Auto-continue countdown (8s) |
| `LucyEvalProgressCard` | Live eval progress (records, partial score) |
| `LucyCatchUpCard` | Unified catch-up card (replaces 4 separate cards below) |
| `LucyCompletedJobCard` | Completed evaluation results |
| `LucyTrainingJobCard` | Training job status and metrics |
| `LucyFailedJobCard` | Failed job errors |
| `LucyPendingDecisionCard` | Awaiting-user decisions |

See [implementation-plan.md](./implementation-plan.md) for detailed status and [issue/](./issue/) for E2E testing issues.

## Key Concepts

- **Two iteration loops**: Inner loop (dataset iteration via dry run eval) and outer loop (training iteration via finetune scores)
- **Two score types**: Dry Run (Eval) Scores (before training) and Training (Finetune) Scores (during/after training)
- **Multi-model evaluation**: Dry run can target any model, enabling cross-model comparison
- **Multiple grader functions**: Users can create different graders testing different quality dimensions
- **RFT-specific**: Reinforcement Fine-Tuning, not SFT — the grader IS the training signal

## Documents

| Doc | What it covers |
|-----|---------------|
| [gap-analysis.md](./gap-analysis.md) | Full comparison: Lucy vs Claude Code capabilities (7 gaps) |
| [architecture-diff.md](./architecture-diff.md) | Side-by-side architecture: current Lucy vs enhanced Lucy, two loops, async lifecycle |
| [rft-decision-tree.md](./rft-decision-tree.md) | RFT-specific decision tree: what data to analyze, what decisions to make, what levers to adjust. Clearly distinguishes dry run scores vs training scores |
| [session-lifecycle.md](./session-lifecycle.md) | How Lucy handles long-running async jobs: active watching, background transition, session resumption, catch-up protocol on reopen |
| [distri-capabilities.md](./distri-capabilities.md) | What already exists in the distri stack that we can reuse (~70%) |
| [implementation-plan.md](./implementation-plan.md) | Prioritized 4-phase plan with specific file changes per gap |
| [architecture-adoption.md](./architecture-adoption.md) | Source code analysis: what needs to change per layer, what already works, implementation sequence |
| [testing-strategy.md](./testing-strategy.md) | E2E + integration + unit test specs, API mock strategy, test fixtures, per-phase checklists |
| [mock-test-architecture.md](./mock-test-architecture.md) | Mock API architecture: MSW (Vitest) + Express server (Playwright), scenario registry, response bridges |
| [e2e-test-framework.md](./e2e-test-framework.md) | E2E test framework: test case structure, evidence collection, UI consistency checks, result tracking |
| [e2e-tests/](./e2e-tests/) | Test case definitions per workflow step + master registry |
| [mockups-final.html](./mockups-final.html) | Interactive UX mockups: iteration checkpoints, intervention, stall, post-training, session lifecycle scenarios |
| [end-to-end-flow.md](./end-to-end-flow.md) | Full request flow: FE → Gateway → Cloud API → Distri. Port map, endpoint tables, polling architecture, data residency |
| [issue/](./issue/) | E2E testing issues found during implementation |

## Summary of Gaps

| # | Gap | Impact | Effort | Priority | Status |
|---|-----|--------|--------|----------|--------|
| 1 | Evaluation results are opaque (no per-record details) | High | Low | P0 | Closed |
| 2 | No cross-iteration memory | High | Medium | P0 | Closed |
| 3 | Fixed pipeline, no branching after eval | High | Medium | P1 | Closed |
| 4 | No stall detection or escalation strategy | Medium | Medium | P1 | Closed |
| 5 | Grader editing is template-constrained | Medium | High | P2 | Partial |
| 6 | No task viability pre-check | Medium | Low | P2 | Closed |
| 7 | Knowledge sources are opaque to the agent | Low | Medium | P3 | Closed |
| 8 | No session resumption / catch-up | High | Medium | P0 | Closed |

## Read Order

1. **gap-analysis.md** — understand what's missing
2. **architecture-diff.md** — understand the two-loop architecture
3. **rft-decision-tree.md** — understand the decision logic
4. **session-lifecycle.md** — understand async job UX
5. **distri-capabilities.md** — understand what we can reuse
6. **architecture-adoption.md** — understand what code changes are needed per layer
7. **implementation-plan.md** — understand the build plan
8. **testing-strategy.md** — understand how to test everything
9. **mockups-final.html** — see the UX (open in browser, `python3 -m http.server 8888`)
