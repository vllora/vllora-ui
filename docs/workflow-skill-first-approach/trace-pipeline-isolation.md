# Trace Pipeline Isolation — Engineering Contract

> **Status:** Engineering contract (2026-04-08). Companion to
> `otel-traces-as-finetune-input.md`. This doc specifies **what the
> trace-skill work is allowed to touch, what it is forbidden to
> touch, and how the split is enforced.** It exists so that a
> developer implementing the trace pipeline has an unambiguous
> list of safe and forbidden surfaces, and so that PR reviewers can
> enforce the split mechanically.

## TL;DR

The trace pipeline ships as a **new, parallel skill** at
`finetune-skill-otel/`. The existing `finetune-skill/` (PDF
pipeline) is **never modified** as part of trace work. The two
skills share the UI, gateway, storage layer, and cloud handoff
— but all shared-surface changes are **additive only** (new
variants, new components, new columns, new endpoints). No
existing path is reshaped.

## The three hard rules

### Rule 1 — `finetune-skill/` is frozen for trace-work purposes

**No file inside `finetune-skill/` is modified by the trace-skill
work.** This includes:

- `finetune-skill/SKILL.md`
- Any file under `finetune-skill/scripts/`
- Any file under `finetune-skill/reference/`
- Any file under `finetune-skill/templates/`

**If trace-skill work needs a change to a file in this directory,
the answer is one of:**
1. The change belongs in `finetune-skill-otel/` (create the parallel file)
2. The change belongs in a shared library outside both skills (create a new `shared-finetune-utils/` location)
3. The change is not actually needed (reconsider the design)

**The change does NOT go into `finetune-skill/`.** Period.

The only exception: if the PDF skill has a genuine bug that
*already* affects PDF workflows (independent of trace work), that
bug can be fixed in `finetune-skill/` as its own separate PR
unrelated to the trace work. The PR must not reference trace or
OTel in its description.

### Rule 2 — Shared-surface changes are additive only

The UI, gateway API, database schema, and cloud handoff receive
changes as part of trace-skill work. **Every such change must be
strictly additive.** Specifically:

- **New database columns must be nullable** with a safe default. No
  existing row is modified by the migration.
- **New database tables are fine** (e.g. `trace_bundles`).
- **New API endpoints are fine.** Existing endpoints can accept new
  enum variants (e.g. `kind="otel-trace"` as a new option) but their
  signatures, request shapes, and response shapes are otherwise
  unchanged.
- **New UI components are fine.** Existing components are not
  refactored as part of trace work.
- **No existing column is dropped, renamed, or semantically
  changed.**
- **No existing API endpoint path is changed.**
- **No existing UI component is reshaped or moved** as part of trace
  work.

**Test for "is this additive?":** if you reverted every change in
the trace-skill PR, would the existing PDF-skill end-to-end test
still pass? If yes, the change is additive. If no, something is
wrong.

### Rule 3 — Golden-path CI tests run on every PR

Two independent golden tests are added to CI:

1. **`test_pdf_pipeline_golden.py`** — uploads a known PDF fixture
   (e.g. Chess Tactics), runs the `finetune-skill/` pipeline with a
   mock trainer, and diffs output records + grader against a
   checked-in expected file.
2. **`test_trace_pipeline_golden.py`** — uploads the Phoenix
   shopping-agent parquet fixture, runs the `finetune-skill-otel/`
   pipeline with a mock trainer, and diffs output records + grader
   against a checked-in expected file.

Both tests:

- Run on every PR.
- Are deterministic (seeded RNG, frozen timestamps, stubbed LLM calls).
- Take <30 seconds each so developers aren't tempted to skip them.
- Block merge on failure.

**Any PR that breaks either test is blocked**, regardless of
which skill the PR claims to touch. This is the safety net that
catches cross-contamination in the shared surfaces (UI, gateway,
DB) that rules 1 and 2 don't fully prevent.

---

## File-by-file ownership

### Files owned by `finetune-skill/` (PDF — frozen for trace work)

**Every file in this list is off-limits to trace-skill PRs.**

```
finetune-skill/
├── SKILL.md
├── README.md
├── scripts/
│   ├── docling_extract.py
│   ├── build_knowledge_parts.py
│   ├── consolidate_parts.py
│   ├── generate_records.py
│   ├── deduplicate_records.py
│   ├── finetune.py                  ← orchestrator, stays PDF-only
│   └── (all other scripts currently in this directory)
├── reference/
│   ├── api-reference.md
│   ├── data-format.md
│   ├── data-quality-gate.md
│   ├── extraction-guide.md
│   ├── grader-writing.md            ← LLM judge focus, stays PDF-only
│   ├── iteration-strategy.md        ← stays PDF-only
│   ├── analysis-strategy.md         ← per-topic, stays PDF-only
│   ├── training-metrics-guide.md
│   ├── readiness-gate.md
│   ├── topic-hierarchy.md
│   ├── workflow-guide.md
│   └── (all other reference docs currently in this directory)
├── templates/
└── test-samples/ (via ~/Documents/GitHub/test-samples/)
```

### Files owned by `finetune-skill-otel/` (trace — new, parallel)

**Every file in this list is created by the trace-skill work.** The
skill directory does not exist yet; it is created when the trace
pipeline is implemented.

```
finetune-skill-otel/
├── SKILL.md                          (new, copy + modify from finetune-skill/SKILL.md)
├── README.md                         (new, trace-specific)
├── scripts/
│   ├── openinference_to_semconv.py   (moved from finetune-skill/scripts/)
│   ├── otel_extract.py               (moved from finetune-skill/scripts/)
│   ├── otel_distill.py               (new — Stage 3 extraction)
│   ├── trace_topics.py               (new — Stage 2 tool-schema lifting)
│   ├── trace_grader_builder.py       (new — Stage 4 Jaccard grader)
│   ├── trace_grader.py               (new — the grader function itself)
│   ├── system_prompt_rewriter.py     (new — Stage 5 lift + rewrite)
│   ├── trace_probe_gates.py          (new — Stage 6 4 gates)
│   ├── trace_hparams.py              (new — Stage 7 delta table)
│   ├── analyze_eval_trace.py         (new — Stage 8 per-tool analysis)
│   ├── trace_confusion_matrix.py     (new — Stage 8 confusion matrix)
│   └── finetune-otel.py              (new — orchestrator, parallel to finetune.py)
├── reference/
│   ├── otel-trace-ingestion.md       (moved from finetune-skill/reference/)
│   ├── trace-grader-reference.md     (moved from docs/workflow-skill-first-approach/)
│   ├── trace-hyperparameters.md      (new, consolidated from concept doc)
│   ├── trace-analysis-strategy.md    (new, per-tool workflow)
│   ├── trace-iteration-strategy.md   (new, data-focused iteration)
│   └── trace-readiness-gate.md       (new, 4-gate thresholds)
├── templates/
├── test-samples/ → ~/Documents/GitHub/test-samples/otel-phoenix/
└── subagents/                       (intentionally empty for v1 — see note below)
```

**Sub-agents: intentionally zero in v1.** The PDF skill delegates
to four sub-agents (`knowledge-extractor`, `relation-builder`,
`nemo-data-generator`, `training-monitor`) because its pipeline
stages are LLM-heavy or long-running. The trace skill's equivalent
stages are **mechanical extraction** (span-tree walk, tool-schema
lift, deterministic decision-point extraction, deterministic
grader generation, deterministic confusion matrix) — no LLM, no
long-running loops, no heavy work to isolate. The trace skill's
entire pipeline has exactly **one** LLM call (the Stage 5 system
prompt rewrite), which runs inline in the main skill.

The only plausible v1 sub-agent is `trace-job-monitor` — a polling
loop that watches the cloud for Stage 6 (probe), Stage 7 (training),
and Stage 8 (eval) job completion. **Defer this decision** until
the PDF skill's `training-monitor` has shipped and stabilized. If
`training-monitor` turns out to be load-bearing (PDF skill would be
broken without it), create a parallel `trace-job-monitor` for
consistency. If it's a nice-to-have that inline polling could
replace, skip it for the trace skill too.

This is **not a gap** — it's evidence that the two skills have
different workloads. The PDF skill orchestrates LLM-heavy generation;
the trace skill runs mechanical extraction. The sub-agent count
reflects that difference and should not be forced into symmetry.

### Shared surfaces — additive-only changes allowed

These paths receive changes from trace-skill work, but all changes
must be strictly additive per Rule 2.

| Path | What changes | Rule |
|---|---|---|
| `src/types/otel-trace-types.ts` | Already exists — keep | Used by new trace viewer |
| `src/components/datasets/sources-view/` | New `OtelTraceSourceViewer.tsx` component added alongside existing `PdfSourceViewer.tsx` | Additive only |
| `src/components/datasets/grader/` | New `ProgrammaticGraderViewer.tsx` added alongside existing `LlmJudgeEditor.tsx` | Additive only |
| `src/components/datasets/analysis/` | New `TraceEvalAnalysis.tsx` added alongside existing `PdfEvalAnalysis.tsx` | Additive only |
| `src/components/agent-prism/` | New directory (shadcn-style `npx degit`) | Additive only |
| `src/contexts/` | Existing contexts keep their current API. May add a new `TraceBundleContext.tsx` if needed. | Additive only |
| `../gateway/http.rs` (routes) | `POST /trace_bundles`, `GET /trace_bundles/{id}` endpoints added | Additive only |
| `../gateway/` (schema migrations) | New migration adds `trace_bundles` table + `knowledge_sources.trace_bundle_id` nullable column | Additive only |
| `../gateway/agents/finetune/` | **No changes** — agent definitions are PDF-skill-specific; trace skill does not need agents | — |
| LangDB Cloud handoff payload | New `source_kind` field; new `grader.type="programmatic_tool_call"` variant | Additive only |
| `tailwind.config.js` | Add `agent-prism/**` to `content` paths | Additive only |
| `package.json` | Add `@evilmartians/agent-prism-data`, `@evilmartians/agent-prism-types` deps | Additive only |

### Forbidden paths for trace-skill work

**Trace-skill PRs must never touch these files:**

- Anything inside `finetune-skill/` (Rule 1)
- `gateway/agents/finetune/*.md` — PDF-skill agent definitions
- `finetune-skill/reference/analysis-strategy.md` — PDF-specific
- `finetune-skill/reference/grader-writing.md` — PDF-specific
- `finetune-skill/reference/iteration-strategy.md` — PDF-specific
- `finetune-skill/scripts/generate_records.py` — PDF-specific record generator
- `finetune-skill/scripts/finetune.py` — PDF orchestrator
- Existing `PdfSourceViewer.tsx`, `LlmJudgeEditor.tsx`, `PdfEvalAnalysis.tsx` — PDF UI components
- Any existing database column in `knowledge_sources` (only adding a new nullable FK column is allowed)
- Any existing gateway endpoint's request or response shape (only adding new enum variants or new endpoints is allowed)

---

## PR checklist for trace-skill work

Reviewers should run through this checklist on every trace-skill
PR:

### Rule 1 check

- [ ] Zero files inside `finetune-skill/` are modified. (Run
      `git diff --name-only main -- finetune-skill/` — should be empty.)
- [ ] Zero files listed in "Forbidden paths for trace-skill work"
      are modified.

### Rule 2 check

- [ ] New database columns are nullable with a safe default.
- [ ] No existing database column is dropped, renamed, or type-changed.
- [ ] No existing API endpoint path is renamed.
- [ ] No existing API endpoint's request or response shape is
      reshaped. (New enum variants are fine.)
- [ ] No existing UI component is refactored. (New components added
      alongside are fine.)
- [ ] The "reversion test": if the trace-skill PR were reverted,
      the existing PDF-skill golden test would still pass.

### Rule 3 check

- [ ] Both golden tests pass in CI.
- [ ] If the PR adds new trace-skill functionality, the
      `test_trace_pipeline_golden.py` expected file is updated.
- [ ] If the PR adds a new shared-surface addition, it's verified
      that the PDF golden test still passes (catches accidental
      cross-contamination).

### Additional checks

- [ ] New files are placed in `finetune-skill-otel/` or a shared
      location, not `finetune-skill/`.
- [ ] New reference docs (grader, hyperparameters, analysis,
      iteration) are in `finetune-skill-otel/reference/`, parallel
      to the existing PDF ones.
- [ ] Any "existing file that moves from finetune-skill/ to
      finetune-skill-otel/" move is done as a clean `git mv` with
      no content changes in the same commit.

---

## When the rules can be relaxed

**After the trace skill has shipped and stabilized** (say, after 3–5
successful end-to-end runs against real trace bundles), the
three-rule contract can be relaxed in the following ways:

1. **Bug fixes to the PDF skill can be made** independently. They
   follow the normal PDF-skill review process, not these rules.
2. **The two skills may refactor shared utilities** into a genuine
   shared library (`shared-finetune-utils/`) if maintenance burden
   warrants it. This is done as a separate refactor PR that touches
   both skills simultaneously, reviewed as a whole.
3. **The golden tests can be relaxed** (e.g. combined into one
   parameterized test) once both skills have demonstrated stable
   independent operation.

**Until then, the rules are hard.** They exist specifically to
protect the PDF skill during trace-skill development.

---

## Sources

This contract is derived from:

- [`otel-traces-as-finetune-input.md`](./otel-traces-as-finetune-input.md)
  — the concept doc, section "Two skills, shared surfaces"
- [`otel-extractor-tooling-survey.md`](./otel-extractor-tooling-survey.md)
  — the tooling survey, section "Architecture: two skills, shared
  surfaces"
- Standard software engineering practice for adding new
  functionality to a codebase with an existing working component.
  This is not a novel pattern; it's the "parallel implementation"
  pattern from refactoring literature (see Martin Fowler's
  *Refactoring* §6 "Composing Methods" for the general principle).
