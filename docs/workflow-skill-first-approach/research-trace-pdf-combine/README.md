# Trace + PDF Unified Finetune Pipeline

> **Started**: 2026-04-13
> **Status**: Complete (all 3 sprints shipped)

## Summary

The PDF finetune skill (`finetune-skill/`) auto-detects whether the input folder contains PDFs, OTel traces, or both. When traces are present alongside PDFs, the skill runs a **trace-informed pipeline** where production traces contribute topics, priority scores, seed queries, and grader dimensions.

| Input folder contains | Skill behavior |
|---|---|
| PDFs only | Standard knowledge pipeline (existing) |
| Traces only | Standard OTel pipeline (existing) |
| PDFs + Traces | Trace-informed pipeline -- traces shape topics, prompts, records, and grader |

Only `finetune-skill/` was modified. `finetune-skill-otel/` remains untouched per the two-skills isolation rule.

## How Traces Contribute to Each Step

| Pipeline step | What traces provide | Artifact |
|---|---|---|
| Topic generation | Discover missing topics, flag coverage gaps | `trace_topics.json` |
| System prompt | Extract production prompt, simplify for small model | `trace_prompts.json` |
| Record allocation | Priority scores: `frequency x failure_rate` per topic | `trace_priority.json` |
| Record prompts | Real user queries as seeds (15-25% real, 75-85% synthetic) | `trace_prompts.json` |
| Grader design | Failure dimensions, prompt rules as criteria, calibration pairs | `trace_grader_hints.json` |

## Documents

| Document | What it covers |
|----------|---------------|
| [research-trace-informed-curriculum.md](./research-trace-informed-curriculum.md) | Full research: literature review (20+ papers), architecture, flow diagrams |
| [implementation-plan.md](./implementation-plan.md) | Sprint plan, file-level changes, UI components, risk assessment |
| [test-plan.md](./test-plan.md) | 7 phases, 22 tests, concrete verification steps with expected values |
| [pipeline-reasoning-analysis-design.md](./pipeline-reasoning-analysis-design.md) | Structured decision cards (observation/analysis/decision/evidence) + progressive disclosure |
| [accessible-ui-design.md](./accessible-ui-design.md) | Plain-language UI for non-ML-experts: renamed labels, summaries, progressive disclosure |
| [folder-restructure-design.md](./folder-restructure-design.md) | Component folder reorganization: trace-analysis/, quality-checker/, test-runs/, training/ |
| [gateway-migration-spec.md](./gateway-migration-spec.md) | Gateway schema: `trace_analyses` table, model, service, handlers, routes |
| [testing-workflow-guide.md](./testing-workflow-guide.md) | **How to test**: pre-flight checks, running, monitoring, verifying, self-improving loop |

## Implementation Status

### Sprint 1: Skill -- DONE

| File | What |
|---|---|
| `finetune-skill/scripts/trace_analyze.py` | Trace analysis: 4 artifacts (topics, prompts, priority, grader hints) |
| `finetune-skill/scripts/generate_records.py` | Trace priority integration + seed query injection |
| `finetune-skill/scripts/grader_from_traces.py` | Auto-generates grader draft from trace failure dimensions |
| `finetune-skill/scripts/upload_trace_analysis.py` | Uploads analysis artifacts to gateway |
| `finetune-skill/SKILL.md` | Auto-detection logic + combined flow documentation |

### Sprint 2: UI -- DONE

| File | What |
|---|---|
| `src/types/dataset-types.ts` | TraceAnalysis types |
| `src/contexts/TraceAnalysisContext.tsx` | Trace analysis state management |
| `src/contexts/PipelineAnalysisContext.tsx` | Pipeline analysis state (PipelineAnalysisProvider) |
| `src/services/finetune-api.ts` | Trace analysis API service |
| `src/components/.../TraceAnalysisView.tsx` | Tabs inside OTel source viewer (not a separate sidebar section) |
| `src/components/.../PipelineAnalysisView.tsx` | Step timeline with decision cards |
| `src/components/.../SectionInsight.tsx` | Per-section analysis display |
| `src/components/.../QueryOriginBadge.tsx` | Badge showing record origin (real trace vs synthetic) |
| `src/components/.../TopicTreeNode.tsx` | Trace frequency/failure badges on topic nodes |

### Sprint 3: Gateway -- DONE

| What | Status |
|---|---|
| `trace_analyses` table (SQLite) | Shipped -- table, model, service, handlers, routes |
| Shared analysis (`analysis.json`) | Agent writes, UI displays verbatim -- single source of truth |

### Cross-Cutting -- DONE

| What |
|---|
| Accessible UI: sidebar labels renamed (Source Materials, Teaching Examples, Quality Checker, Test Runs, Training, Activity Log) |
| Plain-language summaries and progressive disclosure throughout |
| Folder restructure: `trace-analysis/`, `quality-checker/`, `test-runs/`, `training/` |
| Bug fixes: `prompt_type` in metadata, zsh glob, auto-flatten topics, test-grader fallback, cancel old evals/training, `objective_target_tokens` guidance, OTel scroll fix |

## Key Decisions

1. **Scope**: Only `finetune-skill/` modified -- `finetune-skill-otel/` untouched, no isolation rule conflict
2. **Gateway**: `trace_analyses` table in SQLite -- single API endpoint, 4 JSON columns, backward compatible
3. **Seed ratio**: 15-25% real queries, 75-85% synthetic -- variable per topic traffic level, real queries used as-is
4. **Priority formula**: `frequency x failure_rate` -- higher priority topics get more records
5. **Trace analysis placement**: Inside OTel source viewer tabs, not a separate sidebar section
6. **Shared analysis**: Agent writes `analysis.json`, UI displays verbatim -- no UI-side reinterpretation

## Test Scenario

`test-samples/tau-retail-combined/` -- 460 real GPT-4o retail traces + retail policy wiki (MIT license, tau-bench).
