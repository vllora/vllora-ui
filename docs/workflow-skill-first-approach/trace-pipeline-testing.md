# Trace Pipeline Testing Strategy

> **Status:** Testing reference (2026-04-08). Companion to
> `otel-traces-as-finetune-input.md`,
> `otel-extractor-tooling-survey.md`,
> `trace-grader-reference.md`, and `trace-pipeline-isolation.md`.
> This doc specifies the full testing ladder for the `finetune-skill-otel/`
> pipeline: what tests exist at each level, what they verify, what
> runs in CI vs the cloud, and what the acceptance criteria are for
> shipping v1.

## TL;DR

Five levels of testing. Levels 1–3 run in CI on every PR (fast,
deterministic, stubbed). Levels 4–5 run post-training on real cloud
infrastructure (slow, require GPUs, can't be CI).

| Level | Scope | Answers | Runs where | Blocks merge? |
|---|---|---|---|---|
| **1 — Unit** | Pure functions in isolation | "Is this function correct?" | CI, <10s | ✅ |
| **2 — Integration** | Stage-to-stage data flow | "Does stage N's output match stage N+1's input shape?" | CI, <30s | ✅ |
| **3 — End-to-end golden** | Full local pipeline on a fixture | "Does uploading a trace bundle produce the expected artifacts?" | CI, <60s (stubbed LLM) | ✅ |
| **4 — Training validation** | Post-cloud-training quality check | "Did training actually improve the model vs the base?" | Cloud, per handoff | No (post-hoc alert) |
| **5 — Regression detection** | Golden training run comparison over time | "Did our changes regress a known-good run?" | Cloud, weekly / version-bump | No (post-hoc alert) |

**v1 ships when L1–L3 have been green for 3 consecutive days on a
stable branch AND at least one successful L4 run has completed
against the Phoenix shopping-agent fixture.**

## Level 1 — Unit tests

Pure-function tests in isolation. One pytest file per pipeline
component. Every file gets a minimum test coverage for its public
interface.

### Components and what to test

| Component | File | Tests |
|---|---|---|
| Grader function | `tests/unit/test_trace_grader.py` | Already specified in [`trace-grader-reference.md`](./trace-grader-reference.md) — 15+ cases covering perfect match, wrong tool floor, partial args, extra args, type leniency, parallel calls, refusal |
| Record extractor | `tests/unit/test_otel_distill.py` | Given a fixture trace with known Pattern A/B/C/D cases, verify it emits exactly the expected records, correct context prefixes, SCoRe-style correction records when applicable |
| Topic builder | `tests/unit/test_trace_topics.py` | Given a tool schema with 6 tools (4 called, 2 empty), verify it produces a 6-leaf topic tree, keeps empty topics in the hierarchy, excludes them from the per-record `tools` array |
| Grader builder | `tests/unit/test_trace_grader_builder.py` | Given a tool schema, verify it produces a callable with the expected Jaccard formula, verify sanity-check assertions (self-match=1.0, wrong tool=0.02, partial in (0.2, 0.8)) |
| System prompt rewriter | `tests/unit/test_system_prompt_rewriter.py` | Given a demonstrator prompt with known bad patterns (dynamic date strings, verbose capability claims, provider-specific syntax), verify the rewritten output strips them. Uses a stubbed LLM API so no real calls. |
| Probe gates | `tests/unit/test_trace_probe_gates.py` | Given mock K=8 rollout score distributions, verify each of the 4 gates (learnable_frac, trivial_wrong_frac, per_tool_trivial, refusal_frac) returns the expected pass/fail |
| Eval analyzer | `tests/unit/test_analyze_eval_trace.py` | Given mock eval results with a known confusion matrix shape, verify weak tools are identified and recommendations are produced |
| Format adapter | `tests/unit/test_openinference_to_semconv.py` | Given a mini-Phoenix parquet with known spans, verify OpenInference → OTel semconv mapping is correct |

### Guidelines

- **No I/O except local fixture files.** No network calls, no LLM
  API calls, no database. Stub everything.
- **Deterministic.** Seed any randomness. Frozen timestamps.
- **Fast.** Each test <100ms, whole suite <10 seconds.
- **One assertion per test where possible.** Easier to diagnose
  failures.
- **Use real fixture data** (mini-Phoenix parquet snippets, real
  tool schemas from `test-samples/otel-phoenix/`) rather than
  hand-crafted inputs — catches serialization bugs.

## Level 2 — Integration tests (stage-to-stage)

Verifies that the output of stage N is shaped correctly as the
input of stage N+1. Still fast and deterministic, but exercises
real inter-stage plumbing.

### Test list

```python
# tests/integration/

test_inspect_to_topics.py
  - Stage 1 output (bundle_summary.json) can be read by Stage 2
  - The tool schema in bundle_summary.json produces a topic tree
    with the expected number of leaves

test_topics_to_records.py
  - Stage 2 output (topic_tree.json) + raw spans can be consumed
    by otel_distill.py
  - Every emitted record is tagged with a topic that exists in
    the topic tree
  - The number of records matches the expected count from the
    fixture (33 for Phoenix shopping-agent)

test_records_to_grader.py
  - Stage 3 output (training.jsonl) + Stage 4 output (grader.py)
  - Self-match: grade(record.output, record.output) == 1.0 for
    every record in training.jsonl
  - Wrong-tool injection: grade({"name": "fake_tool", ...}, gt)
    == 0.02 for every record
  - Partial-arg injection: grade with one arg removed produces a
    score in (0.2, 0.8)

test_grader_to_probe.py
  - Given Stage 4's grader and a mock K=8 rollout distribution,
    Stage 6 probe correctly categorizes records into
    trivial_correct / trivial_wrong / learnable / impossible
    buckets
  - Gate decisions match expected outcomes for three scenarios:
    "all clear" (should pass all 4 gates), "too trivial"
    (should fail learnable_frac), "dominant tool bias" (should
    fail per_tool_trivial)

test_records_to_handoff.py
  - Assembled handoff payload (records + grader + system prompt
    + base model choice + probe report) matches the cloud
    handoff JSON schema
  - All required fields present, all types correct
```

### Guidelines

- **Use fixture files, not generated data.** Real parquet → real
  records → real grader → real probe.
- **Test both success and failure paths.** "All clear" and "gate
  blocks training" both matter.
- **Share setup helpers** across test files, but each test is
  independent — no cross-test state.

## Level 3 — End-to-end golden test

This is the big one. Upload the Phoenix shopping-agent parquet,
run the full local pipeline (Stages 1–6), diff every artifact
against a checked-in expected file.

### The test

```python
# tests/golden/test_trace_pipeline_golden.py

import pytest
from finetune_skill_otel.pipeline import run_full_pipeline
from finetune_skill_otel.testing import (
    seed_everything,
    stub_llm_api,
    assert_files_match,
)

def test_shopping_agent_full_pipeline():
    """
    Upload the Phoenix shopping-agent fixture, run Stages 1-6
    locally, verify every artifact matches the checked-in
    expected file.
    """
    # Setup: deterministic
    seed_everything(42)
    stub_llm_api(
        canned_response=open("tests/fixtures/stubbed_rewrite.txt").read()
    )
    
    # Run full pipeline with mock cloud (no actual GRPO training)
    result = run_full_pipeline(
        input_fixture="test-samples/otel-phoenix/source_traces.parquet",
        base_model="Qwen/Qwen3.5-4B",
        mock_cloud=True,
    )
    
    # Assert every artifact matches the checked-in expected file
    assert_files_match(
        actual=result.topic_tree,
        expected="tests/expected/shopping_agent/topic_tree.json",
    )
    assert_files_match(
        actual=result.records,
        expected="tests/expected/shopping_agent/records.jsonl",
    )
    assert_files_match(
        actual=result.grader_config,
        expected="tests/expected/shopping_agent/grader.json",
    )
    assert_files_match(
        actual=result.system_prompt,
        expected="tests/expected/shopping_agent/system_prompt.txt",
    )
    assert_files_match(
        actual=result.probe_report,
        expected="tests/expected/shopping_agent/probe_report.json",
    )
    assert_files_match(
        actual=result.handoff_payload,
        expected="tests/expected/shopping_agent/handoff_payload.json",
    )
```

### Expected files (checked into the repo)

```
tests/expected/shopping_agent/
├── topic_tree.json          (Stage 2 output)
├── records.jsonl            (Stage 3 output, one line per training record)
├── grader.json              (Stage 4 output, tool schema + Jaccard config)
├── system_prompt.txt        (Stage 5 output, the rewritten prompt)
├── probe_report.json        (Stage 6 output, the bucket distribution + gate decisions)
└── handoff_payload.json     (assembled cloud handoff JSON)
```

**These files are committed to the repo.** When a developer
intentionally changes pipeline behavior, they regenerate the
expected files and the diff is visible in the PR. Reviewers
inspect the diff to confirm the change is what the developer
meant.

### Properties

- **Deterministic** — seeded RNG, frozen timestamps, stubbed LLM
  calls for Stage 5 rewrite. Same input always produces the same
  output.
- **Fast** — <60 seconds total. No actual training happens (mock
  cloud).
- **Comprehensive** — exercises every stage from parquet input
  through handoff payload.
- **Breakage detector** — any pipeline change that produces
  different artifacts for the same input fails the test.

### Regenerating the expected files

When a pipeline change is intentional:

```bash
# Run the test with --regenerate-expected to write new files
pytest tests/golden/test_trace_pipeline_golden.py --regenerate-expected

# Review the diff
git diff tests/expected/shopping_agent/

# If it's what you meant, commit
git add tests/expected/shopping_agent/
git commit -m "Regenerate golden expected files after <change description>"
```

The `--regenerate-expected` flag is a development helper, not a
production feature. In CI it never runs — failing tests always
block the merge.

### The PDF-skill counterpart

Per Rule 3 of [`trace-pipeline-isolation.md`](./trace-pipeline-isolation.md):
**two independent golden tests run on every PR**. The trace-skill
golden test above has a sibling in the PDF skill:

```
tests/golden/
├── test_pdf_pipeline_golden.py    (PDF skill — existing or to be created)
└── test_trace_pipeline_golden.py  (trace skill — new)
```

**Any PR that breaks either test is blocked by CI**, regardless of
which skill the PR claims to touch. This catches cross-contamination
in shared surfaces (UI, gateway, DB) that Rules 1 and 2 don't fully
prevent.

## Level 4 — Training validation (post-cloud-training)

This is the "did the model actually get better?" test. Can't run
in CI because it needs actual GPU training. Runs after every cloud
handoff completes.

### The methodology

```
1. Before training (BASELINE)
   - Load the base model (Qwen3.5-4B untrained) on the cloud
   - Run it against the eval set (held-out paraphrases, not
     training records)
   - Record every Tier 1 and Tier 2 metric from Stage 8

2. Training runs on the cloud
   (this is the Stage 7 GRPO loop)

3. After training (TRAINED)
   - Load the trained model (base + new LoRA adapter)
   - Run it against the SAME eval set
   - Record the same metrics

4. Compute deltas
   - Overall grader score delta
   - Per-tool score deltas (for each tool in the schema)
   - Argument-match rate delta
   - Refusal precision/recall deltas
   - Train-vs-eval delta (overfitting indicator)
```

### Pass criteria (training succeeded if ALL hold)

| Metric | Threshold | Why |
|---|---|---|
| **Overall grader score delta** | `trained - base >= +0.10` | If training didn't move the needle by at least 10 points, it's not worth shipping |
| **Worst per-tool regression** | `>= -0.05` | No tool should get worse by more than 5 points (forgetting / catastrophic regression) |
| **Tool-name accuracy on unseen paraphrases** | `>= 0.92` after | This is the v1 Tier 1 target from Stage 8 |
| **Argument-match rate (right-tool subset)** | `>= 0.70` after | This is the v1 Tier 1 target from Stage 8 |
| **Refusal precision/recall** (if refusal is in the schema) | both `>= 0.80` after | This is the v1 Tier 1 target from Stage 8 |
| **Overfitting indicator** (train_score - eval_score) | `<= 0.15` | >15-point gap means the model memorized training and can't generalize |

### Failure response

If any criterion fails, the cloud handoff is rolled back:

```
1. The LoRA adapter is NOT released to the user's workflow
2. A training report is written with specific failure modes:
   - Which criteria failed
   - Which tools regressed (with before/after scores)
   - Which metrics didn't hit thresholds
3. The user is notified with actionable recommendations:
   - "Add more contrastive data for tool X"
   - "Lower trivial_wrong_frac_threshold"
   - "Switch to Qwen3-8B for more capacity"
4. The workflow state is rolled back to "ready-to-iterate"
```

### Pre-training baseline measurement

**The cloud team needs to run the baseline measurement before
training starts.** This is part of the cloud handoff contract and
should be documented there. The local pipeline can optionally
compute a baseline using vLLM offline inference (the same K=8
probe infrastructure from Stage 6), but the canonical "before"
measurement is the cloud's.

## Level 5 — Regression detection (weekly / version-bump)

Catches the failure mode: "unit tests pass, golden tests pass,
but actual training quality has silently degraded over N
refactors."

### The pattern

```
1. Pick a fixed reference run
   - Phoenix shopping-agent fixture (source_traces.parquet)
   - Base model Qwen3.5-4B
   - Fixed hyperparameters (the Stage 7 default deltas)
   - Fixed grader version

2. Run it once end-to-end through the full pipeline, including
   actual cloud GRPO training. Record every metric:
   - Baseline (before training)
   - Post-training metrics
   - All Tier 1 and Tier 2 metrics from Stage 8
   - The deltas

3. Commit those metrics as tests/regression/golden-regression.json

4. On major version bumps or weekly schedule:
   - Re-run the same fixed pipeline
   - Compare new metrics to golden-regression.json
   - Alert if any metric drifts beyond a threshold
```

### Drift thresholds

| Metric | Max drift before alert |
|---|---|
| Overall grader score (post-training) | ±3% |
| Per-tool accuracy (any tool) | ±5% |
| Tool-name accuracy (post-training) | ±2% |
| Argument-match rate (post-training) | ±5% |
| Training time | +20% (performance regression) |
| Probe learnable_frac | ±5% |

### Schedule

- **Weekly** — scheduled job runs the reference pipeline, produces
  a report, compares to golden. Alerts team if any metric drifts
  beyond threshold.
- **Major version bumps** — manually triggered before shipping a
  new version. Must pass before release.

**Deferred from v1 to v1.5.** The golden-regression.json file is
created once v1 is shipped and stable. Weekly runs begin after
that baseline is committed.

## What runs where

| Level | Where | When | Blocks merge? |
|---|---|---|---|
| L1 Unit | Local dev + CI | Every save / every PR | ✅ Yes |
| L2 Integration | CI | Every PR | ✅ Yes |
| L3 E2E golden | CI | Every PR | ✅ Yes |
| L4 Training validation | Cloud, after training completes | Per cloud handoff | No (post-hoc rollback) |
| L5 Regression | Cloud, scheduled | Weekly / version-bump | No (post-hoc alert) |

## Acceptance criteria for shipping v1

To say "the trace skill is ready to ship v1," ALL of these must
hold:

1. **L1 + L2 + L3 have been green for 3 consecutive days** on a
   stable branch (shakes out test flakes and CI infrastructure
   issues)
2. **At least one successful L4 training validation run** has
   completed against the Phoenix shopping-agent fixture — the
   trained model showed a measurable improvement over baseline
   per the pass criteria above
3. **The PDF skill's golden test still passes** with the trace
   skill merged (Rule 3 of `trace-pipeline-isolation.md`)
4. **At least one manual end-to-end test** — a developer uploads
   a trace bundle that is NOT the Phoenix shopping-agent fixture
   (a new bundle nothing has been tested against) and runs the
   full pipeline. This catches hardcoded-to-fixture bugs.

**Until all four hold, v1 is in beta, not release.**

## Missing pieces (things we don't have yet and must build)

Honestly acknowledging the gaps:

1. **Checked-in expected files for the golden test.** The
   `test-samples/otel-phoenix/` directory has the input parquet
   but not the expected output artifacts. Creating these is a
   one-time effort (~30 minutes after the pipeline code is
   stable) but needs a design decision: check in the raw JSON or
   a hash?

2. **Cloud-side hooks for L4 validation.** The cloud team needs
   to run the pre-training baseline measurement, the
   post-training comparison, and produce the deltas report.
   This is part of the cloud handoff contract and needs to be
   specified in a new `cloud-finetune-handoff.md` companion doc
   (TBD).

3. **Regression-run infrastructure.** L5 requires a scheduled job
   that can run real training on a fixed fixture and compare
   metrics over time. Deferred to v1.5.

4. **No production A/B testing story.** Level 6 (A/B testing
   against the base model in production traffic) is entirely
   out of scope for v1. Revisit when there's a real deployed
   model to A/B-test against.

5. **No tests for the UI components yet.** The `agent-prism`
   integration and the trace-specific UI components (records
   page, grader page, eval page) need their own React/Vitest
   tests. Deferred — UI tests are their own workstream.

## How to run each level locally

```bash
# L1 — unit tests, fast, runs during development
cd finetune-skill-otel/
pytest tests/unit/ -v

# L2 — integration tests, exercises inter-stage plumbing
pytest tests/integration/ -v

# L3 — golden test, full local pipeline with mocked cloud
pytest tests/golden/test_trace_pipeline_golden.py -v

# All three (what CI does)
pytest tests/unit/ tests/integration/ tests/golden/ -v

# L4 — training validation, requires cloud access, NOT a CI test
# (invoked manually after a cloud handoff completes)
python scripts/validate_training.py \
  --workflow-id=<id> \
  --baseline-report=baseline.json \
  --post-training-report=post_training.json

# L5 — regression check, requires cloud access
# (scheduled, not manual)
python scripts/regression_check.py \
  --fixture=test-samples/otel-phoenix/ \
  --compare-to=tests/regression/golden-regression.json
```

## Sources

- Software engineering practice for test pyramids (Mike Cohn,
  "Succeeding with Agile" — the canonical test-pyramid reference)
- The golden-test pattern from compiler and protocol testing
  (checked-in expected outputs, regenerable on intentional
  changes)
- The "training validation as a post-hoc check with rollback" 
  pattern from MLOps (Kreuzberger et al., arXiv:2205.02302
  "Machine Learning Operations (MLOps): Overview, Definition,
  and Architecture")
- The v1 Tier 1 metric thresholds come from the Stage 8 Eval
  analysis section of the concept doc, which are in turn grounded
  in [ToolRL (arXiv:2504.13958)](https://arxiv.org/abs/2504.13958)
  and [IRC (arXiv:2604.02869)](https://arxiv.org/abs/2604.02869).
