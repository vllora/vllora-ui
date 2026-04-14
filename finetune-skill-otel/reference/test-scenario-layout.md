# Test Scenario Layout

This doc describes the expected folder layout for a **test scenario** under `~/Documents/GitHub/test-samples/`, used by `/finetune-otel-run`, `/finetune-otel-kill`, and `/finetune-otel-analyze`.

A test scenario is a self-contained directory that holds everything the trace finetune skill needs to run against a specific set of OTel traces: the raw inputs, a prompt, and a place for run artifacts and transcripts.

## Minimum required layout

```
~/Documents/GitHub/test-samples/<scenario>/
├── finetune-prompt.md                    # REQUIRED — the agent prompt
├── source_traces.parquet                 # REQUIRED — raw OTel trace input
│                                         #   (or source_traces_semconv.json
│                                         #    if pre-converted)
└── finetune-project/                     # OPTIONAL — skill working dir
                                          #   (created by the skill on first run)
```

**At least one of:**
- `source_traces.parquet` — raw OpenInference / Phoenix parquet (the skill will convert via `openinference_to_semconv.py`)
- `source_traces_semconv.json` — pre-converted OTel-semconv JSON
- `traces/*.parquet` or `traces/*.json` — multiple trace files under a `traces/` subdir

The run script counts files matching any of these patterns and reports the count in the transcript header. The skill itself picks up whichever input actually exists.

## Full layout after one run

```
~/Documents/GitHub/test-samples/<scenario>/
├── finetune-prompt.md
├── source_traces.parquet
├── source_traces_semconv.json            # converted form, cached
├── .claude/                              # synced on each run (don't edit by hand)
│   └── skills/
│       └── finetune-skill-otel/          # the skill copied in by
│                                         # sync-finetune-otel-skill.sh
│           ├── SKILL.md
│           ├── reference/
│           └── scripts/
├── finetune-project/                     # skill's local working dir
│   ├── training.jsonl                    # Stage 3 records
│   ├── per_record_tools.json             # Stage 3 tool schema
│   ├── topics.json                       # Stage 2 hierarchy + per-record tools
│   ├── grader.json                       # Stage 4 declarative grader
│   ├── system_prompt.txt                 # Stage 5 rewritten system prompt
│   ├── training_config.json              # Stage 7 hyperparameter deltas
│   ├── probe.json                        # Stage 6 probe report (optional)
│   ├── handoff.json                      # Stage 7 cloud handoff bundle (optional)
│   └── eval_report.json                  # Stage 8 per-tool analysis (optional)
└── finetune-runs/                        # run transcripts + metadata
    └── run-YYYYMMDD-HHMMSS/
        ├── transcript.md                 # human-readable transcript
        ├── stream.jsonl                  # raw Claude Code event stream
        ├── tool-results.jsonl            # tool call results only
        ├── meta.json                     # run metadata (exit code, turns, etc.)
        ├── pid                           # PID file (removed on exit)
        ├── prompt.md                     # copy of the prompt used
        └── subagents/                    # subagent transcripts (if any)
```

## `finetune-prompt.md` conventions

The prompt is the same file format the PDF skill uses. Start with a one-line intent, then give the agent the context it needs:

```markdown
Run the finetune skill — **<scenario description>**.

## What this scenario is

<2-3 sentences explaining the trace source, the tools involved, and what we're trying to achieve>

## Goal

<what success looks like — e.g., "extract ≥30 training records, pass all 4
probe gates, produce a handoff.json ready for cloud upload">

## Constraints

- Use the OTel trace skill (`finetune-skill-otel/`), not the PDF skill
- Input lives at `./source_traces.parquet` (or `./source_traces_semconv.json`)
- Do NOT touch `finetune-skill/` — we're testing the trace pipeline in isolation
- Stop after producing the handoff bundle; no cloud upload in this scenario
```

**Keep it short.** The skill knows how to run the pipeline; the prompt only tells it what's special about _this_ scenario (input path, goal, any constraints like "skip stage X").

## Running the scenario

```
/finetune-otel-run <scenario>                   # launch (headless)
/finetune-otel-kill <scenario>                  # kill if it's stuck
/finetune-otel-analyze <scenario>               # inspect the latest run
```

All three commands derive paths from `~/Documents/GitHub/test-samples/<scenario>/` by convention — no additional flags needed.

## Adding a new scenario

Minimum steps:

1. `mkdir -p ~/Documents/GitHub/test-samples/<scenario>`
2. Drop your input file in as `source_traces.parquet` (or `source_traces_semconv.json`)
3. Write `finetune-prompt.md` following the template above
4. Run `/finetune-otel-run <scenario>`

The first run will create `.claude/skills/finetune-skill-otel/` (synced from the repo), then `finetune-project/` (produced by the skill), then `finetune-runs/run-<ts>/` (transcript + metadata).

## Reference scenario — `otel-phoenix`

The canonical reference scenario is `~/Documents/GitHub/test-samples/otel-phoenix/`. It holds:
- `source_traces.parquet` — a real Arize Phoenix demo trace (LangGraph shopping agent, multi-tool)
- `source_traces_semconv.json` — the same data pre-converted via `openinference_to_semconv.py`
- `finetune-prompt.md` — the reference prompt that exercises Stages 1–5/7

The orchestrator's integration test (`finetune-skill-otel/tests/integration/test_pipeline_end_to_end.py`) runs the full pipeline against this fixture as part of the CI loop. If the integration test passes but the `/finetune-otel-run` harness fails on this scenario, the bug is in the harness (sync, prompt, or transcript plumbing), not the pipeline logic.
