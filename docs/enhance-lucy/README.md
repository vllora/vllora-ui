# Enhancing Lucy: Closing the Gap with Claude Code

Lucy's finetune agent follows a fixed 7-step pipeline. Claude Code with the finetune skill operates like an autonomous researcher — it reads results, diagnoses problems, changes strategy, and iterates until the model is good. This document set identifies the gaps and proposes concrete solutions.

## Implementation Status (2026-03-06)

| Phase | Status | Key Deliverables |
|-------|--------|-----------------|
| **Phase 1: Eyes** | 🟡 Partial | `get_evaluation_details` done, iteration state not started, catch-up partial |
| **Phase 2: Autonomy** | 🟡 Partial | `analyze_evaluation` done (reactive), re-plan not started |
| **Phase 3: Wisdom** | 🟡 Partial | `analyze_training` done (reactive), stall detection partial |
| **Phase 4: Hands** | 🟡 Partial | `test_grader_sample` + `auto_test` done, viability pre-check not started |

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
| [mockups-final.html](./mockups-final.html) | Interactive UX mockups: iteration checkpoints, intervention, stall, post-training, session lifecycle scenarios |
| [issue/](./issue/) | E2E testing issues found during implementation |

## Summary of Gaps

| # | Gap | Impact | Effort | Priority | Status |
|---|-----|--------|--------|----------|--------|
| 1 | Evaluation results are opaque (no per-record details) | High | Low | P0 | Closed |
| 2 | No cross-iteration memory | High | Medium | P0 | Open |
| 3 | Fixed pipeline, no branching after eval | High | Medium | P1 | Partial |
| 4 | No stall detection or escalation strategy | Medium | Medium | P1 | Partial |
| 5 | Grader editing is template-constrained | Medium | High | P2 | Partial |
| 6 | No task viability pre-check | Medium | Low | P2 | Open |
| 7 | Knowledge sources are opaque to the agent | Low | Medium | P3 | Closed |
| 8 | No session resumption / catch-up | High | Medium | P0 | Partial |

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
