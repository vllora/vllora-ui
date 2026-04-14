# Design Doc: Pipeline Folder Restructure

> **Date**: 2026-04-14
> **Status**: Design ready, implementing
> **Goal**: Organize finetune-project/ into readable, self-contained subfolders that match the accessible UI labels.

## Current Structure (messy)

```
finetune-project/
├── config.json
├── .checkpoint.json
├── execution-log.md
├── pipeline-journal.json
├── iterations.json
├── training.jsonl                    ← at root
├── topics.json                       ← at root
├── relations.json                    ← at root
├── grader.js                         ← at root
├── grader-draft.js                   ← at root
├── trace_priority.json               ← trace files scattered at root
├── trace_topics.json
├── trace_prompts.json
├── trace_grader_hints.json
├── knowledge/                        ← good structure
│   ├── all-parts-index.json
│   └── retail-agent-policy/
├── evaluations/                      ← flat files, no per-run structure
│   ├── eval-001.json
│   ├── eval-002.json
│   └── ...
└── training-jobs/                    ← flat files, mixed with metrics
    ├── train-001.json
    ├── {JOB_ID}-metrics.json
    ├── {JOB_ID}-epoch-evals.json
    └── ...
```

**Problems:**
- Trace files scattered at root with no grouping
- Eval runs are flat JSON files, no human-readable summary
- Training jobs mix config/metrics/reports in one flat directory
- File names use internal conventions (`training.jsonl`, `grader.js`) not accessible names
- No `analysis.json` or per-run insight files

## Proposed Structure (organized)

```
finetune-project/
├── config.json                         # Workflow config
├── analysis.json                       # Shared analysis (agent + UI)
├── execution-log.md                    # Activity log (human-readable)
├── pipeline-journal.json               # Structured journal (machine-readable)
│
├── knowledge/                          # Source materials (unchanged)
│   ├── all-parts-index.json
│   └── {doc-slug}/
│       ├── extraction-result.json
│       ├── knowledge_parts.json
│       └── parts-index.json
│
├── trace-analysis/                     # Trace insights (was: root-level files)
│   ├── priority.json
│   ├── topics.json
│   ├── prompts.json
│   └── grader-hints.json
│
├── topics.json                         # Topic hierarchy (stays at root — referenced everywhere)
├── relations.json                      # Topic-source relations (stays at root)
├── training.jsonl                      # Teaching examples (stays at root — too many references to move)
│
├── quality-checker/                    # Grader (was: root-level files)
│   ├── grader.js                       # Active grader
│   └── grader-draft.js                 # Auto-generated draft from traces
│
├── test-runs/                          # Eval runs (was: evaluations/)
│   ├── eval-001/                       # Each run = subfolder
│   │   ├── result.json                 # Raw eval data (scores, per-record)
│   │   └── summary.md                  # Human-readable: what was tested, what was found, what to do
│   ├── eval-002/
│   │   ├── result.json
│   │   └── summary.md
│   └── ...
│
└── training/                           # Training jobs (was: training-jobs/)
    ├── train-001/                      # Each job = subfolder
    │   ├── config.json                 # Hyperparameters + model
    │   ├── metrics.json                # Training metrics (loss, reward per epoch)
    │   ├── epoch-evals.json            # Per-epoch eval scores
    │   ├── monitor-report.json         # Training monitor output
    │   └── insights.md                 # Human-readable: what happened, why stopped, next steps
    ├── train-002/
    │   └── ...
    └── ...
```

## What Changes

### Moved files

| Current path | New path | Breaking? |
|---|---|---|
| `trace_priority.json` | `trace-analysis/priority.json` | Low — only trace_analyze.py writes it |
| `trace_topics.json` | `trace-analysis/topics.json` | Low |
| `trace_prompts.json` | `trace-analysis/prompts.json` | Low |
| `trace_grader_hints.json` | `trace-analysis/grader-hints.json` | Low |
| `grader.js` | `quality-checker/grader.js` | Medium — referenced in upload-grader, test-grader, eval |
| `grader-draft.js` | `quality-checker/grader-draft.js` | Low |
| `evaluations/eval-001.json` | `test-runs/eval-001/result.json` | Medium — referenced in poll-eval, readiness-check |
| `training-jobs/train-001.json` | `training/train-001/config.json` | Medium — referenced in poll-training |
| `training-jobs/{ID}-metrics.json` | `training/train-001/metrics.json` | Low |

### Stays at root (too many references to move)

| File | Why it stays |
|---|---|
| `config.json` | Referenced by every script |
| `training.jsonl` | Referenced by generate_records, upload-records, readiness-check, harden-records, etc. |
| `topics.json` | Referenced by upload-topics, generate_records, etc. |
| `relations.json` | Referenced by upload-relations, generate_records |
| `pipeline-journal.json` | Referenced by log-step, pipeline_journal.py |
| `execution-log.md` | Appended by log-step |

### New files (per-run insights)

| File | Who writes it | Content |
|---|---|---|
| `test-runs/eval-001/summary.md` | Agent via update-analysis or log-step | Human-readable eval summary: model, avg score, learnable%, recommendation |
| `training/train-001/insights.md` | Agent via update-analysis or log-step | Human-readable training summary: what happened, final metrics, whether to iterate |

## Implementation Plan

### Phase 1: Move trace analysis files (low risk)

1. Update `trace_analyze.py` to write to `trace-analysis/` subdirectory
2. Update `upload_trace_analysis.py` to read from new path
3. Update `grader_from_traces.py` to read from new path
4. Update `generate_records.py` trace-priority-file default path
5. Update SKILL.md examples

### Phase 2: Move grader to quality-checker/ (medium risk)

1. Update `upload-grader` to look in `quality-checker/grader.js`
2. Update `test-grader` to use new path
3. Update `dry_run_grader.py` default path
4. Add backward compat: if `quality-checker/grader.js` doesn't exist, fall back to `grader.js`
5. Update SKILL.md

### Phase 3: Restructure test-runs (medium risk)

1. Update `create-eval` to write to `test-runs/eval-NNN/result.json`
2. Update `poll-eval` to read from new path
3. Update `readiness-check` to read from new path
4. Add `summary.md` generation after eval completes
5. Backward compat: accept both `evaluations/eval-001.json` and `test-runs/eval-001/result.json`

### Phase 4: Restructure training (medium risk)

1. Update `create-training` to write to `training/train-NNN/config.json`
2. Update `poll-training` to write metrics/epoch-evals to the subfolder
3. Update training-monitor to write to subfolder
4. Add `insights.md` generation after training completes
5. Backward compat: accept both old and new paths
