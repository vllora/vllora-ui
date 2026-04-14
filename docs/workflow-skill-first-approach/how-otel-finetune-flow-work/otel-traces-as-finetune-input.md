# OTel Traces as Finetune Input — Concept

> **Status:** Concept doc (2026-04-08). Implementation detail intentionally
> excluded — see the run/test scenarios for the concrete plumbing.
> Backed by inspection of a real Phoenix shopping-agent fixture
> (`agents-toolcalling-tracesv2.parquet`, 609 spans, 6 tools, GPT-4o).
>
> ---
>
> ### Scope: this doc specifies `finetune-skill-otel/`, a new skill separate from `finetune-skill/`
>
> **This doc specifies a new, architecturally separate skill** —
> `finetune-skill-otel/` — that lives alongside the existing
> `finetune-skill/` (PDF pipeline). The two skills share the UI,
> gateway, storage layer, training JSONL format, and cloud handoff
> API — **but they share no pipeline code.** The existing PDF skill
> is never modified by trace-skill work. See the "Two skills, shared
> surfaces" section below for the architectural split and
> [`trace-pipeline-isolation.md`](./trace-pipeline-isolation.md) for
> the engineering contract.
>
> The motivation is risk minimization: the existing PDF pipeline is
> already working and has been validated against real test samples
> (Chess Tactics, medical-qa, etc.). Adding trace support by
> extending the existing skill would create shared-code breakage
> vectors that are hard to defend against. Creating a new parallel
> skill **physically eliminates** the risk — trace-skill code
> literally cannot reach PDF-skill code.
>
> ---
>
> **Companion docs:**
> - [`otel-extractor-tooling-survey.md`](./otel-extractor-tooling-survey.md)
>   — library/platform decisions (storage, UI, base model, extractor tooling)
> - [`trace-grader-reference.md`](./trace-grader-reference.md)
>   — grader formula implementation reference with unit tests
> - [`trace-pipeline-isolation.md`](./trace-pipeline-isolation.md)
>   — engineering contract for the split (files owned by each skill)
> - [`trace-pipeline-testing.md`](./trace-pipeline-testing.md)
>   — five-level testing ladder, pass criteria, CI vs cloud split
>
> ---
>
> ### Parallel development
>
> **This design is intentionally structured so the backend
> (gateway schema + endpoints), frontend (trace source viewer +
> eval analysis), and OTel skill (`finetune-skill-otel/`) can be
> built by separate engineers in parallel.** Three JSON contracts
> lock the interfaces between them:
>
> 1. **`trace_bundles` row shape + `POST /trace_bundles` endpoint**
>    (specified in the "Storage" subsection under "How traces
>    enter the system" in this doc, and in the "Storage decision"
>    section of the tooling survey)
> 2. **`knowledge_sources.content_metadata.kind` discriminator**
>    (`"document"` vs `"otel-trace"`) for UI dispatching
>    (specified throughout this doc and the tooling survey)
> 3. **Cloud handoff payload JSON** with the `source_kind` field
>    and tool-routing `training_config` block (specified in the
>    Stage 7 section of this doc and the base-model section of
>    the tooling survey)
>
> As long as all three tracks agree on these contracts, **none
> blocks the others**. Week 1 is unblocked for all three tracks
> from the moment this doc set freezes. Week 2 ends with a
> contract-review sync. Week 4 ends with an integration dry run.
> Week 6 ends with the first L4 training validation (see
> `trace-pipeline-testing.md` for the acceptance criteria).
>
> The cloud team (Stage 7 training) is a fourth track that needs
> to be looped in at week 0 with the handoff spec so they can
> prepare the ingestion side. It is not in this repo.

## Core idea

**Documents and traces are two different teaching tools for two different
things.**

|  | Documents teach | Traces teach |
|---|---|---|
| What | Knowledge — facts, rules, content | Behavior — when to act and how |
| Source of "right answer" | Must be invented from the text | Already in the trace (the agent already did it) |
| Success looks like | Model can answer questions about the content | Model can do the same job, on new phrasings |
| Reward signal | Squishy ("is this answer good?") | Verifiable ("did it pick the right tool with the right args?") |
| Effort needed | A lot of LLM work — invent everything | Almost no LLM work — unpack the finished example |

That's the whole concept. Everything else in this doc is consequences.

---

## What goes in, what comes out

**Goes in:** OpenTelemetry GenAI traces — recordings of an LLM agent doing
its job, with the user messages, the chosen tool calls, the tool results,
and the final assistant responses all captured as spans.

**Comes out:** A trained smaller model that can do the same job the agent
did, on customer phrasings it has never seen.

The classic use case: **replace an expensive frontier model (GPT-4o,
Claude) used as the "brain" of a tool-using agent with a small, cheap,
fast open model (Qwen3.5-4B by default; 0.8B/2B/8B available) — without losing the ability to pick the
right tool with the right arguments.**

That's what makes the trace pipeline worth building. PDFs can't teach a
model how to behave as an agent. Traces can.

---

## What we're assuming about the demonstrator

The trace pipeline rests on **one foundational assumption**, and the rest
of the design only makes sense if it holds:

> The agent that produced the trace (e.g. GPT-4o) is **competent enough at
> the task** for its choices to serve as an imitation target. We are not
> claiming the agent was mathematically correct on every record. We are
> claiming it was right *often enough*, *at the horizon we care about*,
> that cloning its behavior produces a model that is useful in
> production.

**Important framing note**: this doc is *not* describing a behavioral
cloning pipeline. We do **GRPO directly on a tool-capable base model**
with no SFT/BC warm-start (see "Why we skip BC warm-start" below). The
demonstrator's tool choices are not used as supervised loss targets —
they are **pseudo-labels for the programmatic grader** that scores
GRPO rollouts. The assumption still applies because if the
demonstrator picked the wrong tool for an input, the grader will
reward the student for making the same wrong choice.

The rest of this section discusses behavioral cloning (BC) failure
modes from the imitation-learning literature **as a reference** —
because the same concerns about demonstrator competence apply at the
pseudo-label level even though the training objective is RL, not SFT.
Where the literature talks about "training on the demonstrator's
actions," substitute "scoring the student's rollouts against the
demonstrator's actions" and the failure modes still bite. BC is the
imitation-learning name for `(state, action)` supervised training from
an expert ([SFT as Inverse RL, arXiv:2403.12017](https://arxiv.org/html/2403.12017v1));
we cite it because the failure-mode literature is the same.

### Eight ways the assumption breaks

The first four are intuitive. The last four come from the
imitation-learning literature and are the ones that actually bite in
practice; earlier drafts of this doc missed them.

1. **The demonstrator was wrong.** GPT-4o picks `product_search` when
   the user actually wanted `product_details`. We'd train the student
   to make the same mistake.
2. **Multiple choices were defensible.** "Find me a tablet" could be
   `product_search(query="tablet")` OR `product_search(query="tablet",
   category="electronics")`. Picking one arbitrarily penalizes the
   "wrong" defensible alternative.
3. **No outcome signal in the trace.** The trace ends when the
   assistant stopped talking, not when the user got what they wanted.
4. **Demonstrator nondeterminism.** Same input twice, different tool
   call. Whichever one landed in the bundle becomes "the" label.
5. **Covariate shift / compounding error.** Proven in
   [Ross, Gordon, Bagnell 2011 (DAgger)](https://www.cs.cmu.edu/~sross1/publications/Ross-AIStats11-NoRegret.pdf):
   BC has **O(T²) worst-case error in horizon T**, not O(T). Small
   per-step errors cascade because the student visits states the
   demonstrator never showed. **This is the biggest caveat in IL
   literature and was completely absent from earlier drafts.**
6. **Causal confusion**
   ([de Haan et al. 2019](https://arxiv.org/abs/1905.11979)).
   BC latches onto spurious features correlated with expert actions —
   e.g. the student might learn "call `product_search` when the user
   message has more than 10 words" instead of "when the user wants to
   find something." Particularly dangerous when features correlate
   with the pseudo-label by coincidence.
7. **Mode averaging under multi-modal experts.** When the demonstrator
   uses two valid action distributions for the same input, BC with
   cross-entropy loss collapses them toward the average — which may be
   a *third* action that matches neither valid option. Our
   "demonstrator nondeterminism" bullet above is the surface
   symptom; mode averaging is the mechanism.
8. **Exposure bias.** Training always sees clean teacher-forced
   prefixes; inference sees the student's own (noisy) prior outputs.
   Classic seq2seq problem; real for multi-turn tool use.

### Frontier-model tool-use accuracy is not 95%

Earlier drafts claimed the assumption is defensible when the
demonstrator is ≥95% accurate on the task. **Real benchmark numbers
contradict this at face value.** As of April 2026:

| Benchmark | Model | Score |
|---|---|---|
| [BFCL V4 overall](https://gorilla.cs.berkeley.edu/leaderboard.html) | Claude Opus 4.1 | **70.4%** |
| [BFCL V4 overall](https://gorilla.cs.berkeley.edu/leaderboard.html) | Claude Sonnet 4 | **70.3%** |
| [BFCL V4 overall](https://gorilla.cs.berkeley.edu/leaderboard.html) | GPT-5 | **59.2%** |
| [τ-bench retail (pass@1)](https://arxiv.org/pdf/2406.12045) | GPT-4o | **65.2%** |
| [τ-bench retail (pass@1)](https://arxiv.org/pdf/2406.12045) | Claude Sonnet 4.5 | **86.2%** |
| [τ-bench airline (pass@1)](https://arxiv.org/pdf/2406.12045) | GPT-4o | **35.2%** |
| [τ-bench airline (pass@1)](https://arxiv.org/pdf/2406.12045) | Claude Sonnet 4.5 | **70.0%** |

**No frontier model hits 95% on realistic multi-turn tool-use
benchmarks.** The ≥95% number is defensible *only* on the narrowest
single-turn, single-function, fixed-schema slice — essentially BFCL's
"simple" category. That happens to be roughly where the shopping-agent
fixture sits, but it is **not** a general property of frontier models on
tool use, and the assumption should be stated with that narrow scope.

### When the assumption is defensible (revised)

| Condition | Defensible? | Why |
|---|---|---|
| **Single-turn, fixed-schema, narrow routing task** (BFCL "simple" regime) | ✅ Yes | Per-step demonstrator accuracy is high (≥90% on narrow slices) and horizon T is effectively 1, so the O(T²) compounding bound doesn't hurt us. |
| **Shallow-horizon ReAct** (2–3 sequential decisions per turn) | 🟡 Qualified | Per-step accuracy is still acceptable; trajectory accuracy starts to degrade. Fine for the shopping-agent fixture; risky beyond it. |
| **Long-horizon agentic tasks** (τ-bench-style, 10+ turns) | ❌ No | O(T²) error compounds. Even the best frontier models are at 35–86% on τ-bench. Cloning an unreliable demonstrator at long horizons amplifies its errors. |
| **Ambiguous task with no objectively right answer** | ❌ No | Cloning becomes "match this particular run" rather than "learn the task." Mode averaging bites hard here. |
| **Trace bundle from production telemetry with outcome signals** | ✅ Better than cloning | Use user satisfaction / retry / conversion as real labels instead of pseudo-labels. Replaces the assumption entirely. |

For the shopping-agent fixture: **single-turn, narrow schema, fixed
tool set, horizon ≤3 (the ReAct sub-case). The assumption holds for this
specific workload.** It does not generalize to arbitrary agent traces.

### BC vs. GRPO on a tool-capable base — when each matters

Earlier drafts of this doc mixed BC and GRPO together as if the
pipeline ran both. **It doesn't.** Because our base model is already
tool-capable, the pipeline runs **GRPO only**, on the tool-capable
base, with no BC warm-start. Here's how the two techniques compare —
this table is a reference, not a description of what we do:

| Technique | What it does | What it fights | What it creates / doesn't touch |
|---|---|---|---|
| **BC warm-start (SFT on demonstrations)** | Clones demonstrator's (state, action) pairs via supervised loss | Teaches the tool schema to a base model that doesn't already know it. Cheap and fast if the base needs it. | Creates compounding error, causal confusion, mode averaging. Does nothing for a base that's already tool-capable. |
| **GRPO on tool-capable base (our choice)** | Samples K rollouts from the base, scores with a verifier, updates toward higher-reward rollouts | Compounding error (on-policy samples see the real distribution the student reaches); mode averaging (partial-credit grader lets the policy pick one consistent mode); generalization gap to unseen paraphrases | Doesn't fix causal confusion if the grader has the same spurious correlation the student picks up. Costs more GPU per step than BC. |

**Partial credit belongs to GRPO, not BC.** BC with supervised loss
doesn't use a grader at all — it just minimizes cross-entropy against
the demonstrator's action. Partial credit is exactly what our
programmatic verifier gives GRPO, which is why we skip the BC stage
and go straight to GRPO on the tool-capable base.

See "Why we skip BC warm-start" below for the full argument. Short
version: the base model is already tool-capable, so BC would re-teach
things it already knows. GRPO-only on a tool-capable base is the
[DeepSeek-R1-Zero](https://arxiv.org/abs/2501.12948) pattern and is
research-backed for this case.

### What this is NOT

- **Not behavioral cloning / SFT.** We do not minimize supervised loss
  against the demonstrator's actions. The training objective is GRPO
  on a tool-capable base. The demonstrator's choices are pseudo-labels
  the grader scores against, not training targets fed to a cross-entropy
  loss. (Earlier drafts of this section framed everything as BC; that
  was misleading. BC is referenced because the failure-mode literature
  is the same, not because we run a BC stage.)
- **Not RLHF.** RLHF uses pairwise human preferences. We don't have
  those.
- **Not RL from outcomes.** Outcome RL needs environment reward signals.
  We don't have those either (yet — outcome supervision is on the
  ingest roadmap).
- **Not "the demonstrator's output is the right answer."** It is a
  pseudo-label for the programmatic grader. Conflating "pseudo-label"
  with "ground truth" is the failure mode this section exists to
  prevent.

If the demonstrator isn't trustworthy on a given task, the trace
pipeline should not be used for that task. Pick a different training
method (SFT on human-curated data, RLHF, RL from outcomes, DPO from
preference pairs) or pick a different demonstrator.

### How to reduce the assumption's load — real techniques from the literature

These are all real, cited techniques. Earlier drafts invented informal
names ("self-consistency filtering," "multi-demonstrator voting") that
conflated them with things from unrelated papers. The correct
attributions:

- **Rejection-Sampling Fine-Tuning (RFT)** — filter extracted records
  through a verifier *before* training. Keep only records where the
  demonstrator's action passes a programmatic check (tool-call
  validity, argument schema match, etc.). Even though we skip BC
  warm-start, RFT still applies at the GRPO stage: pre-filter records
  whose demonstrator action fails the grader and never let them enter
  the GRPO training set in the first place. We already have the
  verifier; RFT says "use it as a filter, not just as a rollout
  scorer." Precedent: OpenAI's RFT platform.
- **Self-training / STaR**
  ([arXiv:2203.14465](https://arxiv.org/abs/2203.14465),
  [LLMs Can Self-Improve, arXiv:2210.11610](https://arxiv.org/pdf/2210.11610)).
  Re-run the demonstrator N times per input, keep records where it
  agrees with itself across samples. Drops records the demonstrator is
  internally uncertain about. This is **not** the Wang 2022
  self-consistency paper — that one was about inference-time
  marginalization, not training-data filtering.
- **Multi-model consensus / RLAIF / Constitutional AI**
  ([arXiv:2212.08073](https://arxiv.org/abs/2212.08073)). Have multiple
  frontier models pick the action; keep records where they agree.
  Higher-quality pseudo-labels at the cost of N× demonstrator runs.
- **DAgger**
  ([Ross 2011](https://www.cs.cmu.edu/~sross1/publications/Ross-AIStats11-NoRegret.pdf)).
  The textbook fix for compounding error: roll out the student, have
  the demonstrator relabel states the student actually visits, retrain.
  Expensive (needs interactive demonstrator access) but it is the
  canonical solution to the O(T²) problem. Worth mentioning as the
  fundamental mitigation.
- **Outcome supervision.** When production telemetry carries user
  satisfaction / retry / conversion signals, use those as real labels
  instead of pseudo-labels. Replaces the assumption entirely. Belongs
  in the cloud OTel ingest roadmap.
- **Expert iteration**
  ([Anthony et al. 2017](https://arxiv.org/abs/1705.08439)). Alternate
  BC on the current policy's best rollouts with re-sampling. The
  AlphaZero-style loop; bridges BC and RL.

**For v1, the pipeline does GRPO-only on a tool-capable base** — no BC
warm-start, because the base model already has tool-calling from its
instruction-tuning phase. RFT (as a pre-GRPO record filter) is the
most plausible next addition because it reuses the grader we already
have. DAgger, STaR, and RLAIF-style voting are later roadmap items.

### The line we're holding in v1

**The trace pipeline is GRPO on a tool-capable base model, specialized
to single-turn or shallow-horizon tool-routing tasks via a
partial-credit programmatic grader. No BC warm-start stage — the base
model already has tool-calling from its instruction-tuning phase, so
BC would re-teach things it already knows. On-policy sampling (GRPO's
structural property) is what prevents compounding error, not a
correction step applied after the fact. The "demonstrator assumption"
in this section applies to whoever produced the trace: if their tool
choices are used as pseudo-labels via the programmatic grader, their
competence at the task has to hold for the records to be useful.**

This is the [DeepSeek-R1-Zero (arXiv:2501.12948)](https://arxiv.org/abs/2501.12948)
pattern — RL directly on a capable base model — applied to narrow tool
routing instead of chain-of-thought reasoning. Defensible in the
single-turn / shallow-horizon regime where BFCL "simple" accuracy is
already high; contradicted for long-horizon agentic tasks where even
frontier demonstrators sit at 35–70% on τ-bench and compounding effects
would overwhelm the grader's signal.

We document this honestly because the cost of mistaking the assumption
for a guarantee is a pipeline that silently trains the wrong thing.

---

## How traces enter the system

A trace can come from one of three sources, but they all funnel into the
same place:

```
① Cloud OTel ingest endpoint  ┐
② Local gateway OTel endpoint  ┼──→  one trace bundle, one workflow
③ User-supplied trace file    ┘
```

For the user, it doesn't matter which source. Conceptually, a trace bundle
is **a knowledge ingredient on a workflow**, exactly like a PDF is a
knowledge ingredient on a workflow. It lives next to documents in the
Knowledge node of the workflow UI, gets a viewer, gets summary stats, and
participates in training.

The skill is what decides which traces feed which workflow. There is **no
global trace browser.** Users don't shop for traces from a giant list
— the skill picks, the workflow owns.

### Storage: a separate `trace_bundles` table, FK from `knowledge_sources`

Earlier drafts of this doc said traces would live in the same
`knowledge_sources` table as PDFs, with a `kind="otel-trace"` discriminator
and a raw OTLP-JSONL blob column on the same row. **That was wrong, and
research disproves it.** Verified against the actual schemas of every
production trace platform we checked, the consensus is unambiguous:

| Platform | How traces are stored | How datasets link to traces |
|---|---|---|
| **[Langfuse](https://github.com/langfuse/langfuse/blob/main/packages/shared/prisma/schema.prisma)** | Separate `traces` + `observations` tables (moved to ClickHouse in v3) | `dataset_items.sourceTraceId` / `sourceObservationId` — soft FK by ID string |
| **[Arize Phoenix](https://github.com/Arize-ai/phoenix/blob/main/MIGRATION.md)** | Separate `spans` + `traces` tables (one row per span, attributes as JSON column) | `dataset_examples.span_rowid` — hard FK |
| **[LangSmith](https://blog.langchain.com/dataset-schemas/)** | Separate `runs` (traces) and `datasets` | `DatasetExample.source_run_id` |
| **OTel collectors** ([ClickHouse](https://clickhouse.com/blog/storing-traces-and-spans-open-telemetry-in-clickhouse), [wperron/sqliteexporter](https://github.com/wperron/sqliteexporter)) | Always one row per span, in dedicated trace tables | (not dataset stores) |

**No production platform stores traces as a blob column on a documents
row.** Doing so would be unique to vLLora in a way no prior art supports.
The "escape hatch from same-table-with-blob to a real schema later"
claim from the earlier draft is also wrong: that migration is
substantially more expensive than starting clean, because every consumer
of `knowledge_sources` that touches the blob has to be updated.

The right schema, per the research:

```sql
CREATE TABLE trace_bundles (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES projects(id),
    name          TEXT,
    source_system TEXT,           -- "phoenix" / "langfuse" / "user-upload" / etc.
    uploaded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    span_count    INTEGER,
    model_names   TEXT,           -- JSON array: ["gpt-4o", ...]
    token_total   INTEGER,
    raw_payload   BLOB            -- Full OTLP-JSONL, optionally compressed
);

ALTER TABLE knowledge_sources ADD COLUMN trace_bundle_id TEXT
    REFERENCES trace_bundles(id);
-- kind = "otel-trace"  ⇒  trace_bundle_id IS NOT NULL
-- kind = "document"    ⇒  trace_bundle_id IS NULL
```

Three properties this gets right:

1. **`knowledge_sources` keeps its document-shaped schema clean.** No
   NULL columns for non-trace rows, no opaque blobs in the main table.
   The FK is the seam between document-flavored metadata and
   trace-flavored payloads.
2. **Bundle-level metadata is queryable** without deserializing the
   blob — `model_names`, `span_count`, `source_system` are all
   first-class columns. The UI's summary chips read from `trace_bundles`
   directly.
3. **Future migration to a fully normalized `spans` table is one SQL
   statement.** When/if we need per-span querying ("filter by
   `model=gpt-4o`," "link `dataset_examples` to specific spans"),
   SQLite's `json_each()` decomposes the blob in-place:
   `INSERT INTO spans SELECT ... FROM trace_bundles, json_each(raw_payload)`.
   Self-contained within the `trace_bundles` boundary; doesn't touch
   `knowledge_sources` or any pipeline table.

The pipeline (`otel_extract.py`) reads `trace_bundles.raw_payload` and
writes the same `knowledge_parts.json` format documents produce. Steps
3–7 of the pipeline are unchanged. The UI's `OtelTraceSourceViewer`
reads `knowledge_sources` for metadata + `trace_bundles.raw_payload`
only when the user opens the viewer — not on every page load.

See the tooling survey
([`otel-extractor-tooling-survey.md`](./otel-extractor-tooling-survey.md))
for the full four-option trade-off analysis (a/b/c/d) and the
verified-against-prior-art reasoning.

### UI: Workflow → Knowledge node → trace bundle viewer

The workflow's Knowledge node renders a trace bundle as a clickable
source row alongside any PDFs. Clicking the trace bundle opens a tab
that visualizes the OTel spans inside the bundle — span tree,
timeline, message bubbles, tool calls — using
**[evilmartians/agent-prism](https://github.com/evilmartians/agent-prism)**,
a React component library purpose-built for visualizing agent
execution traces.

```
Workflow > Knowledge node
├── 📄 contracts.pdf            (existing — opens PdfSourceViewer)
└── 📡 phoenix-shopping-traces  (new — opens AgentPrism TraceViewer)
        │
        │ click
        ▼
   Tab opens:
   ├── Tree view       (span hierarchy, errors highlighted)
   ├── Timeline (Gantt) (concurrency, duration, cost accumulation)
   ├── Details panel    (selected span: input/output, cost, tokens)
   └── Sequence diagram (step-by-step replay)
```

**Why agent-prism specifically:**

1. **Built for this exact use case.** It's a React component library
   for visualizing agent execution traces — not a standalone app, not
   a CLI. The flagship component `<TraceViewer>` renders all four
   visualizations side-by-side.
2. **OTel adapter ships out of the box.**
   `openTelemetrySpanAdapter.convertRawDocumentsToSpans(otlpData)`
   takes our `trace_bundles.raw_payload` directly and produces
   agent-prism's internal schema. It recognizes `gen_ai.*`, `llm.*`,
   and `retrieval.*` semconv attributes — exactly what
   `otel-trace-types.ts` defines.
3. **Stack match.** Requires React 19 + Tailwind 3 + TypeScript +
   Radix UI — all of which vLLora UI already has.
4. **Same install pattern as shadcn/ui.** Components are copied into
   the project via `npx degit`, plus two npm data packages
   (`@evilmartians/agent-prism-data`, `@evilmartians/agent-prism-types`).
   The team is already familiar with this pattern from the existing
   shadcn/ui usage.

**Caveats worth knowing:**

1. **Alpha release** (322 stars, actively developed). Pin a specific
   version and revisit when it reaches 1.0. APIs may change between
   versions and require manual rebase.
2. **Tailwind config update needed**: must add `agent-prism/**` to
   `tailwind.config.content` paths or the utility classes won't
   compile.
3. **Theme integration effort**: agent-prism uses CSS variable theme
   tokens that need to merge with vLLora's existing design tokens.
4. **Verify the LICENSE file** before committing — the README says
   open source but the specific license needs confirmation.

**Data flow at runtime:**

```
1. User clicks the trace bundle node in the Knowledge UI
2. UI fetches GET /trace_bundles/{id} → row + raw_payload blob
3. Pass raw_payload through openTelemetrySpanAdapter
4. Render <TraceViewer data={[{ traceRecord, spans }]} /> in a tab
```

The existing `OtelTraceSourceViewer.tsx` we built earlier becomes a
thin wrapper around `<TraceViewer>` — most of yesterday's hand-rolled
viewer code is replaced by the library, saving an estimated ~1000
LOC of React work that the team would otherwise have to write
(timeline / span tree / sequence diagram from scratch).

See the tooling survey for the full agent-prism integration findings.

---

## The conceptual fork

A workflow can hold both document sources and trace sources. They share
storage, ingestion, and the UI shell. **Where they differ is the middle of
the pipeline.**

```
Documents                              Traces
─────────                              ──────
content with no framing                behavior with framing baked in
        │                                  │
        │ invent topics                    │ derive topics from prompts + tools
        │ invent records                   │ extract records from spans
        │ invent grader                    │ derive grader from schema
        │ invent system prompt             │ extract system prompt
        │                                  │   structurally + REWRITE
        │                                  │   for the student model
        │                                  │
        ▼                                  ▼
   (lots of LLM work)                (one-shot rewrite, no LLM
        │                             between trace and trainer)
        │                                  │
        └──────────► training ◄────────────┘
                     (same)
```

The left side: documents are raw material. We have to discover topics,
generate records, design a grader, compose a system prompt — all of it
through LLM inference because the document doesn't tell us any of that.

The right side: traces are a finished example. The agent already chose
which tools to use, already wrote the system prompt, already executed the
behavior we want to clone. We just have to unpack what's already there.

The fork happens **at the part level, not the workflow level.** A single
workflow with a PDF and a trace bundle runs both pipelines on their
respective parts and re-converges at training. The trainer doesn't know or
care which source produced which record.

---

## What traces contribute to a workflow

### Topics

Topics for traces are **the agent's tool-calling scenarios, grouped by
agent identity.** Unlike document-based pipelines (which discover topics
via LLM clustering), trace topics are derived deterministically from the
data itself — no LLM inference needed.

**Note this is our invention**: none of LangSmith, Langfuse, or Phoenix
produces a topic hierarchy on fine-tuning export. Their exports are flat
lists of records. The "topic hierarchy from a trace bundle" concept is a
UI affordance we add on top of the trace data, not an industry-standard
primitive.

#### Two-level hierarchy (agent → pattern)

The topic hierarchy has two levels:

**Level 0 — Agent identity (roots):** derived from the **first sentence**
of each trace's system prompt. The first sentence is where agents declare
their role ("You are a customer service agent for ShopSmart.") and is
stable across sessions — everything after it (dates, user IDs, session
tokens) is dynamic context injection. Numbers embedded in the role line
are stripped for normalization (e.g., "employee count: 2,847" → grouping
ignores the count). Traces with no system prompt fall back to an
"Unknown Agent" root.

**Level 1 — Tool-call pattern (leaves):** within each agent root,
records are grouped by the tool(s) called at the decision point.
Single-tool records produce a leaf named after the tool; parallel-call
records (Pattern D) produce a leaf named after the sorted set of tools
(e.g., "search, filter"). Each leaf has a `record_count`.

This design is supported by recent research:
- GRPO-LEAD (arXiv:2504.09696) proves difficulty-stratified data organization improves convergence — agent roots naturally separate easy agents (simple lookup) from hard ones (multi-step orchestration)
- "No Prompt Left Behind" (ICLR 2026, arXiv:2509.21880) found 30-99% dead-weight prompts per batch — the hierarchy lets you identify *which agent* generates dead-weight, not just "some tool"
- RC-GRPO (arXiv:2602.03025) confirms tool-calling scenarios have distinct difficulty profiles that benefit from structured grouping

**Example from Nemotron 3k-trace dataset (6 agents, 7,226 records):**

```
Root
├── Customer Service Agent (173 patterns, 198 records)
│   ├── search_products (3 records)
│   ├── track_order (2 records)
│   └── ... 170 more patterns
├── Technical Support Specialist (188 patterns, 211 records)
├── Financial Advisor Assistant (157 patterns, 193 records)
├── Travel Booking Assistant (156 patterns, 188 records)
├── AI Ordering Assistant (170 patterns, 195 records)
└── HR Operations Assistant (160 patterns, 192 records)
```

#### Topic hierarchy vs. per-record `tools` array — two different concepts

These are two distinct outputs from `trace_topics.py`:

**Topic hierarchy (UI concept):** the two-level tree described above.
Agent roots from system prompts, tool-pattern leaves from records.
Every record maps to exactly one leaf. The hierarchy exists for the
user to browse what scenarios the workflow is training.

**Per-record `tools` array (training concept):** each training record
carries the tool schema **from its own trace** — not a global schema.
This supports multi-agent datasets where different conversations have
different tool sets. The union of all per-trace schemas is used for
the topic hierarchy and grader config.

| Rule | Why | Source |
|---|---|---|
| **Each record carries its own trace's tool schema** | Multi-agent systems have different tools per agent. A global schema forces irrelevant tools onto records, wasting tokens and confusing the model. Per-trace schemas match what the agent actually had available. | ToolBench (arXiv:2307.16789) uses per-API tool subsets |
| **Union across traces for topics/grader** | The topic hierarchy and grader need to cover all tools across all agents. The union is computed by `extract_union_tool_schema()` from all per-trace schemas. | Same ToolBench precedent |
| **For description conflicts on the same tool name, use the most recent** | Developer intent evolved toward the latest description. | (developer-intent principle) |
| **Exclude tools never called in any trace** from the per-record `tools` array (but keep them in the topic hierarchy) | Including dead-weight tools adds prompt tokens without gradient signal. | [OpenAI cookbook](https://developers.openai.com/cookbook/examples/fine_tuning_for_function_calling) |

**The two concepts can disagree.** The topic hierarchy might show 6
agents with 200 patterns; the per-record `tools` arrays vary per trace
(3-91 tools depending on the conversation). That's correct: the UI
shows the full landscape, each record sees only what its agent had.

### Records

A training record from a trace is **(user message → tool call)**. Both
sides of the pair already exist in the trace — the user said something,
the agent picked a tool, and the agent's choice is treated as a
**high-confidence pseudo-label** that the GRPO grader will use to
score the student's rollouts. We are not asserting the agent was
mathematically correct on every record; we are assuming it was right
*often enough* that scoring against its choices produces a useful
training signal. See "What we're assuming about the demonstrator"
above — this assumption is load-bearing for the entire trace pipeline,
even though the actual training objective is GRPO and not BC.

> **The unit of record extraction is an LLM DECISION POINT, not a turn
> and not a trace.** A trace contains zero or more turns. A turn
> contains zero or more LLM decision points. **Each decision point can
> produce a record** — successful ones produce imitation records (clone
> the teacher); failed ones produce error-correction records (learn
> where the student's policy would diverge). The shopping-agent fixture
> contains all four of the patterns the v1 rule has to handle (A/B/C/D)
> and is missing several patterns real production traces will exhibit
> (E–J, deferred). See "Which records to emit" below for the full rule.

> **Note on the research position**: this rule is roughly what the
> [LangSmith Fine-Tuning Cookbook](https://github.com/langchain-ai/langsmith-cookbook/blob/main/fine-tuning-examples/export-to-openai/fine-tuning-on-chat-runs.ipynb)
> does in practice and what [Langfuse's Generations-level export](https://langfuse.com/docs/api-and-data-platform/features/fine-tuning)
> produces. It is **in the mainstream of platform tooling but behind the
> research state of the art** — specifically, recent agent-distillation
> papers like [SCoRe (arXiv:2509.14257)](https://arxiv.org/abs/2509.14257)
> and [Structured Agent Distillation (arXiv:2505.13820)](https://arxiv.org/abs/2505.13820)
> argue that error-recovery sequences carry *more* training signal than
> happy-path extractions, not less. We reflect that framing below. See
> the Research references section at the bottom for the full source
> list.

#### Which records to emit (4 patterns supported in v1, 6 recognized but deferred)

The rule has two clauses for v1-supported patterns. SCoRe-style
correction records cover error recovery within a turn that eventually
succeeds; they do **not** cover entire turns where nothing ever worked
(see Pattern I below for why).

> **Imitation records** — For every LLM span inside a turn whose tool
> calls all **succeeded**, emit one record. Input = that span's input
> messages (the conversation history including all prior tool calls and
> results). Output = that span's output messages (the set of tool calls
> emitted, even if it's just one).
>
> **Correction records** — For every LLM span whose tool calls all
> **failed**, if a subsequent LLM span in the same turn retried and
> succeeded, emit a record. Input = the conversation history **up to
> and including the failed attempt and its error**. Output = the
> **corrected** LLM span's output. This teaches the model "given this
> mistake and its error, here's the recovery." This is the SCoRe-style
> path ([arXiv:2509.14257](https://arxiv.org/abs/2509.14257)) — note
> that SCoRe specifically requires a corrected action as the label, so
> it only applies when a turn eventually recovers.
>
> If no LLM span in a given turn ever succeeded, drop **that turn**
> only — other turns in the same trace are still kept. See Pattern I
> below for why this is the right call (and not a v1 gap).

**The rule supports 4 patterns in v1.** Six more patterns exist in
real agent traces but are **explicitly deferred** because the research
literature shows they need treatments more sophisticated than what our
extraction-only pipeline provides. Each deferral is grounded in cited
literature, not hand-wavy.

##### v1 supported (4 patterns)

| # | Pattern | What happens in one turn | Records emitted | Fixture count |
|---|---|---|---|---|
| **A** | **Single-shot** | 1 LLM decision → 1 tool call → 1 result | 1 imitation record | 29 turns |
| **B** | **Error recovery** | wrong call → error → right call → success | 1 imitation + 1 SCoRe correction record (both emitted) | 0 in fixture |
| **C** | **Sequential ReAct** | N LLM decisions in order, each informed by previous tool results | N imitation records, each with a growing context prefix | 5 turns |
| **D** | **Parallel tool calls** | 1 LLM decision emits a **set** of K calls in one output | 1 imitation record with a set output (matches [OpenAI fine-tuning format](https://cookbook.openai.com/examples/fine_tuning_for_function_calling)) | 1 turn |

##### Recognized but not in v1 (6 patterns)

| # | Pattern | Why it's deferred (with citation) | Status |
|---|---|---|---|
| **E** | **Reflection / self-critique** (LLM → LLM critique → LLM revise, no tools between) | Technically caught by the rule but low-signal for behavioral cloning of tool routing. [Structured Agent Distillation (arXiv:2505.13820)](https://arxiv.org/abs/2505.13820) tags these as `[REASON]` spans and down-weights — the right treatment is span-tagged loss, not flat extraction. Promotion requires span-level loss support in the trainer. | ⏸ defer |
| **F** | **Nested sub-agent calls** (LangGraph subgraphs, CrewAI, AutoGen) | Needs an explicit policy decision: train parent-only, child-only, or both? [MAGDi (arXiv:2402.01620)](https://arxiv.org/html/2402.01620) argues graph-aware distillation matters; flat extraction loses delegation structure. Preserve `parent_span_id` on every record so a future graph-aware path is possible without re-extraction. | ⏸ defer (policy TBD) |
| **G** | **Clarifying questions to the user** (agent asks user mid-task instead of calling a tool) | **Naive extraction is the wrong treatment**, even though it's tempting. [ICLR 2025 — Modeling Future Conversation Turns (arXiv:2410.13788)](https://arxiv.org/abs/2410.13788) shows that SFT on `(user_msg → clarifying_question)` is the baseline that preference-rollout methods *beat* by 5% F1 — because the correct label depends on whether the clarification leads to a better tailored response in future turns, which can't be seen from a single trace. SFT on isolated clarifying questions trains *syntax*, not *judgment*, and the documented failure mode is over-clarification (model loops asking instead of acting — see [ChatDev "Communicative Dehallucination"](https://arxiv.org/html/2503.13657v3)). [AwN (arXiv:2409.00557)](https://arxiv.org/html/2409.00557v1) confirms Toolformer / Gorilla / ToolLLM all assume unambiguous instructions. **Honest v1 treatment**: only extract clarifying-question records when the trace contains the complete arc — *ambiguous request → clarifying question → user response → successful resolution*. Without that 4-span arc as evidence the clarification was the right call, drop the example. v1 doesn't yet implement arc-detection, so G is deferred. | ⏸ defer (needs arc detection) |
| **H** | **Human-in-the-loop approvals** | The human decision is a *label*, not an LLM decision. [ARIA (arXiv:2507.17131)](https://arxiv.org/abs/2507.17131) writes approvals into structured knowledge updates. For SFT, most people collapse the approval into a synthetic user turn — that requires a recognition step we don't have. | ⏸ defer |
| **I** | **Aborted / failed-only traces** (every tool attempt fails, no successful recovery anywhere in the turn) | **Earlier drafts called this a "SCoRe-style correction record path." That was a mischaracterization.** SCoRe ([arXiv:2509.14257](https://arxiv.org/abs/2509.14257)) classifies failure-only traces as "Hard-to-Teach" and uses them **only in the RL phase** where the reward function provides the missing positive signal — there is **no SFT on raw failure-only trajectories** in their method. The technique that *does* train on failures is NAT ([Learning From Failure, arXiv:2402.11651](https://arxiv.org/html/2402.11651v1)) — Negative-Aware Training with explicit prompt prefixes — but it requires pairing each failure with a successful trace of the **same task** to provide contrastive signal. We don't have a task-pairing component. Promoting I via standalone failure extraction would put dead-weight prompts into GRPO (all rollouts score 0 → group variance collapses to 0 → no learning, per `feedback_signal_density_check`). v1 correctly drops these turns. v2 path is NAT with task pairing, not "SCoRe-style correction." | ⏸ defer (needs task pairing for NAT) |
| **J** | **Multi-agent collaboration** (trace contains 2+ role-playing agents) | Flat extraction destroys the role structure. [MAGDi](https://arxiv.org/html/2402.01620) keeps graph structure with role-tagged distillation; no platform has shipped this. | ❌ out of scope |

**Net v1 coverage: 4 patterns supported, 5 deferred with explicit
research-backed reasons, 1 out of scope.** This is honest about what
the rule does and doesn't do — the previous "ten patterns" framing
oversold v1 coverage, and two of the proposed promotions (G and I)
turned out to be blocked by literature when actually checked.

**Patterns C and D can coexist in the same turn.** The fixture has a
`"Compare the dishwasher and the toaster"` trace that does both: LLM
decision #1 fans out to 2 parallel `product_search` calls (D), then
decisions #2 and #3 each add one more tool call in sequence (C). Three
records come out of that single turn, not one — each teaching a
different reasoning step:

- Record 1: "compare two things → fan out to parallel searches"
- Record 2: "prior results weren't enough → paginate / search more"
- Record 3: "now I have both ids → call product_comparison"

The naive "last successful" rule would collapse those three lessons into
just Record 3 (`product_comparison(8, 7)`), teaching the model the
nonsense "immediately call product_comparison with ids 8 and 7" — ids
the model can't possibly know without having done the searches first.

**Fixture-wide impact of the v1 rule:** ~33 records under the naive
per-turn rule, **~40 records under the v1 rule** (decision-point
extraction) — +20% more training signal recovered from the same 38
traces. Adding SCoRe correction records (when we encounter fixtures
that have them) will add more on top.

##### Training objective vs. JSONL line format — don't confuse them

"One record per LLM decision point" describes the **training
objective**: the model is trained to predict the chosen tool call
given the conversation state up to that decision. It does **NOT**
describe the JSONL file format. The two are different things.

**The industry-standard JSONL format** (verified across [OpenAI
fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning),
[LangSmith export](https://github.com/langchain-ai/langsmith-cookbook/blob/main/fine-tuning-examples/export-to-openai/fine-tuning-on-chat-runs.ipynb),
[Together AI multi-turn](https://www.together.ai/blog/fine-tuning-llms-for-multi-turn-conversations-a-technical-deep-dive))
is **one full conversation per JSONL line**:

```jsonc
// One JSONL line = prompt (messages) + ground truth (separate field)
// GRPO format: messages end with user/tool turn, ground_truth stores
// the demonstrated tool call separately (consistent with TRL GRPOTrainer,
// OpenAI RFT, and ToolRL arXiv:2504.13958).
{"messages": [
  {"role": "system", "content": "You are a shopping assistant ..."},
  {"role": "user", "content": "Compare the dishwasher and the toaster"},
  {"role": "assistant", "tool_calls": [{"id": "c02", ...}, {"id": "c03", ...}]},
  {"role": "tool", "tool_call_id": "c02", "content": "..."},
  {"role": "tool", "tool_call_id": "c03", "content": "..."}
  // ↑ prompt ends here — model generates from this point ↑
],
 "tools": [...full schema...],
 "ground_truth": "[{\"id\": \"c04\", \"function\": {\"name\": \"product_search\", \"arguments\": \"{...page=2...}\"}}]"
 // ↑ grader compares model's K completions against this ↑
}
```

**Multi-step ReAct trajectories produce N JSONL lines per turn**, not
one. The "Compare the dishwasher and the toaster" turn (3 decision
points) becomes **3 separate JSONL lines**:

| Line # | `messages` content (the prompt) | `ground_truth` (what grader scores against) |
|---|---|---|
| 1 | `[system, user]` | The two parallel `product_search` calls |
| 2 | `[system, user, assistant#1, tool_result_c02, tool_result_c03]` | The pagination `product_search(page=2)` call |
| 3 | `[system, user, assistant#1, tools, assistant#2, tool_c04]` | The final `product_comparison(8, 7)` call |

Each line is a **complete conversation prompt** (system + user + all prior
assistant/tool turns) ending with the last user or tool turn. The ground
truth tool call is stored in a separate `ground_truth` field — during GRPO
training, the model generates K completions from the prompt and the grader
scores each against the ground truth. This matches the [planner fine-tuning
approach on synthetic trajectories](http://krasserm.github.io/2024/05/31/planner-fine-tuning/),
which is the canonical reference for "explode a trajectory into N
training examples, one per step."

> **Format note:** The `ground_truth` field stores the demonstrated
> tool calls as a JSON string (array of tool_call objects). The grader
> accesses it via reward function kwargs (TRL) or `{{ item.ground_truth }}`
> (OpenAI RFT). The model never sees the ground truth during generation.

#### Span trees and turn boundaries

Spans in a trace form a **tree**, not a flat list. The extractor has to
respect that tree to find turn boundaries and to pair tool calls with
their results. There are two conceptual links to worry about.

**Precise definition of a turn boundary:**

> **A turn ends at the next externally-provided input.** "External"
> means any of:
> - a new user message,
> - a human-in-the-loop approval coming back from a pending HITL span,
> - a sub-agent returning control to its parent agent.
>
> Everything else — reflection, self-critique, tool calls, tool results,
> clarifying questions the agent emits but does not wait for, error
> retries — is **inside the same turn**. The turn only ends when
> something outside the agent's loop provides new input.

This definition matters because the naive "turn = one user message"
model breaks on Patterns G (clarifying questions), H (HITL), and F
(nested sub-agents). The external-input definition handles all three.

**Finding turn boundaries — what production tools actually do.**
Verified against LangSmith, Langfuse, Phoenix, and the OTel GenAI
semconv. There is **no automatic per-turn span type** in OTel —
[the agent spans spec](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/)
defines only `create_agent` and `invoke_agent`, with `chat` /
`execute_tool` as their children. There is no `gen_ai.turn.id`. Turn
boundaries come from one of three places, in decreasing order of
explicitness:

1. **One trace per turn (Langfuse Sessions model).** [Langfuse
   Sessions](https://langfuse.com/docs/observability/features/sessions)
   confirm the canonical pattern: developers manually create one trace
   per conversation turn and tag them with the same `sessionId`. Turn
   boundaries are explicit because each turn IS a separate trace
   sharing a session id. **This is the cleanest mapping** and the one
   any extractor should prefer when present.
2. **One `invoke_agent` span per turn.** When agents emit a wrapping
   span per user input (LangGraph's `invoke agent`, LangChain's
   `AgentExecutor.invoke`), each such wrapper IS a turn. Walk the
   `parent_span_id` chain up from each LLM span to find which
   `invoke_agent` it belongs to. Note that this is a *convention*, not
   a guaranteed semconv attribute — instrumentations vary.
3. **`gen_ai.conversation.id` + time gap.** When neither of the above
   is present (raw OpenAI client traces, hand-rolled instrumentation),
   group LLM spans by `gen_ai.conversation.id` and segment by time
   gaps between user messages within the same conversation. This is a
   heuristic, not a documented standard; flag uncertainty.

> **Earlier drafts called the heuristic above "user-message diffing"
> and presented it as a fallback technique. That term is not
> recognized in any platform documentation or paper — it was an
> informal name. The honest replacement is "group by
> `gen_ai.conversation.id` plus time-gap segmentation," and it should
> be marked as a heuristic of last resort, not a named standard.**

**Walking the span tree — what production tools actually do.** Despite
the "tree" framing, production extractors do not traverse trees
recursively. They:

1. Pull all spans flat (`get_spans_dataframe` in
   [Phoenix](https://arize.com/docs/phoenix/tracing/how-to-tracing/importing-and-exporting-traces/extract-data-from-spans),
   `list_runs` in
   [LangSmith](https://github.com/langchain-ai/langsmith-cookbook/blob/main/fine-tuning-examples/export-to-openai/fine-tuning-on-chat-runs.ipynb),
   batch-export in [Langfuse](https://langfuse.com/docs/export-and-fine-tuning)).
2. Index the result by `span_id`.
3. Group by `parent_span_id` or `trace_id` to reconstruct logical
   groupings.
4. Filter by `span_kind == LLM` (or `run_type == "llm"` in LangSmith)
   to get the records that matter.

LangSmith's cookbook is the clearest example: it filters
`run_type="llm"` first, then uses `parent_run_id` for sibling lookups
on demand. The tree exists in the data model; the extractor navigates
it via parent-pointer joins on flat query results, not depth-first
traversal. Our implementation should follow the same pattern.

**Linking tool calls to their results inside a turn** — one canonical
signal, with one provider-specific normalization:

- **`tool_call_id` (OpenAI / OpenInference)** or **`tool_use_id`
  (Anthropic).** Every tool call emitted by an LLM span has an id;
  every tool execution / tool result references the same id. Pair them
  by id. The field name differs by provider — OpenAI's chat completion
  format and [OpenInference's semantic conventions](https://github.com/Arize-ai/openinference/blob/main/spec/semantic_conventions.md)
  use `tool_call_id`; [Anthropic's tool use format](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)
  uses `tool_use_id`. **An extractor targeting both providers must
  normalize.** The OTel GenAI semconv abstracts this as
  `gen_ai.tool.call.id` on `execute_tool` spans, regardless of which
  provider produced the trace.
- **Why id-based linking and not `parent_span_id`?** When a single LLM
  call emits multiple parallel tool calls (Pattern D), they often
  share the same parent span. Only the call id distinguishes which
  result belongs to which call. `parent_span_id` gives you coarse
  grouping (which LLM step triggered tools at all); the id gives you
  the precise pairing GRPO needs.

**Preserving nested-agent structure for the future:** every emitted
record should carry its source `parent_span_id` alongside the trace and
span identifiers. For SFT/GRPO today we flatten and ignore the
hierarchy, but preserving the id means we can reconstruct the delegation
tree later for graph-aware distillation
([MAGDi, arXiv:2402.01620](https://arxiv.org/html/2402.01620)) without
re-extracting. Same principle as the "raw OTLP-JSONL blob stays on the
knowledge source" escape hatch: never discard structure you can't
regenerate.

**How this looks for a real multi-pattern trace** (all four patterns in
one trace — this is close to the actual `"Compare the dishwasher and the
toaster"` trace from the fixture):

```
trace
└── CHAIN: agent_executor
    │
    ├── CHAIN: turn_1                                ◄── Pattern A
    │   ├── LLM: decide
    │   │    tool_call id=c01 → product_search(query="tablet")
    │   ├── TOOL: product_search  id=c01 status=OK
    │   └── LLM: write_response                      ← dropped (B)
    │   → 1 record: input=[system, user]
    │                output=[product_search(query="tablet")]
    │
    ├── CHAIN: turn_2                                ◄── Patterns C + D
    │   ├── LLM: decide                              ── decision #1
    │   │    tool_call id=c02 → product_search(query="dishwasher")
    │   │    tool_call id=c03 → product_search(query="toaster")
    │   │    (2 parallel calls in ONE output = Pattern D)
    │   ├── TOOL: product_search  id=c02 status=OK
    │   ├── TOOL: product_search  id=c03 status=OK
    │   │
    │   ├── LLM: decide                              ── decision #2 (Pattern C step)
    │   │    input now contains: user + c02_call + c02_result + c03_call + c03_result
    │   │    tool_call id=c04 → product_search(query="dishwasher", page=2)
    │   ├── TOOL: product_search  id=c04 status=OK
    │   │
    │   ├── LLM: decide                              ── decision #3 (Pattern C step)
    │   │    input now contains: user + all 3 prior calls + all 3 prior results
    │   │    tool_call id=c05 → product_comparison(product_a=8, product_b=7)
    │   ├── TOOL: product_comparison  id=c05 status=OK
    │   │
    │   └── LLM: write_response                      ← dropped (B)
    │   → 3 records from THIS ONE TURN:
    │     record 1: input=[system, user]
    │                output=[product_search("dishwasher"), product_search("toaster")]  ← set
    │     record 2: input=[system, user, c02_call, c02_result, c03_call, c03_result]
    │                output=[product_search("dishwasher", page=2)]
    │     record 3: input=[system, user, c02..c04 all calls + results]
    │                output=[product_comparison(8, 7)]
    │
    ├── CHAIN: turn_3                                ◄── Pattern B
    │   ├── LLM: decide
    │   │    tool_call id=c06 → product_details(product_id=1)     ← wrong
    │   ├── TOOL: product_details  id=c06 status=ERROR
    │   ├── LLM: decide                              ── retry, sees error
    │   │    tool_call id=c07 → track_package(tracking="K91...")  ← corrected
    │   ├── TOOL: track_package  id=c07 status=OK
    │   └── LLM: write_response                      ← dropped (B)
    │   → 1 record from this turn (the corrected one; c06 is discarded)
    │
    └── CHAIN: turn_4                                ◄── complete failure
        ├── LLM: decide → tool_call → ERROR
        ├── LLM: decide → tool_call → ERROR
        └── (no successful call in this turn)
        → 0 records from this turn, but other turns are kept

TOTAL FROM THIS TRACE: 5 records (1 + 3 + 1 + 0) from 4 turns
```

**Four consequences worth noting:**

1. **One trace can produce many records** — once per successful LLM
   decision point, not once per turn and not once per trace. The naive
   "one trace = one record" model is off by a large factor on any real
   agent trace.
2. **A single turn can produce multiple records** when the agent does
   sequential ReAct reasoning (Pattern C). Each record has a different
   context prefix — growing history. This is what teaches the model to
   reason across steps instead of only making first decisions.
3. **Error recovery is scoped to a single LLM decision point**, not a
   turn. The wrong first attempt in turn 3 is dropped; the corrected
   decision's record is emitted. Other turns are untouched.
4. **Failures drop only the affected turn**, not the whole trace. A
   4-turn conversation where turn 4 completely failed still yields
   records from turns 1, 2, and 3.

#### What the pipeline does NOT extract

- **It does not generate new questions or new answers.** Records are pure
  extraction from data the trace already contains.
- **It does not rewrite the user message** or invent argument values.
- **It deliberately discards the "friendly response"** the agent wrote
  after seeing the tool result. Training on that is the circular-grader
  trap — the model would learn to imitate the past assistant rather
  than learning to act. This is Capability B in the old draft,
  intentionally skipped.
- **It does not extract reflection / self-critique chains** (Pattern E)
  in v1. They produce low-signal records for tool-routing training.
  Deferred, not lost — [Structured Agent Distillation (arXiv:2505.13820)](https://arxiv.org/abs/2505.13820)
  shows how to incorporate them with span-tagged losses when we're
  ready.
- **It does not flatten nested sub-agent trees** (Pattern F). It
  preserves `parent_span_id` on every record but does not auto-join
  parent/child decisions. The policy decision (train parent only,
  child only, or both) is deferred.
- **It does not train on multi-actor collaboration traces** (Pattern
  J) — flat extraction destroys the role structure and platforms
  haven't solved this yet either.

#### What a trace can teach (capabilities)

| # | Capability | What it teaches | Status | Record shape |
|---|---|---|---|---|
| **A** | **Tool routing** (imitation) | "Given user msg + conversation state, pick the right tool with the right args" | ✅ **v1** | `(state → tool_call)` — one per successful LLM decision point |
| **B** | **Response writing** | "Given a tool result, write a friendly response" | ❌ skipped (circular grader trap) | — |
| **C** | **Refusal** | "Given user msg with no matching tool, refuse politely" | ✅ **v1** | `(state → no_tool_call)` when the LLM emitted text only |
| **D** | **Error recovery** (correction) | "Given a failed attempt and its error, emit the corrected action" | ✅ **v1** | `(state_including_failure → corrected_tool_call)` — SCoRe-style, emitted alongside the imitation record |
| **E** | Reflection / self-critique | "Given an attempt, critique and revise it" | ⏸ defer | Needs span-tagged loss ([SAD](https://arxiv.org/abs/2505.13820)) |
| **F** | Nested sub-agent delegation | "When to call a sub-agent vs. do it yourself" | ⏸ defer (needs policy decision) | Needs graph-aware extraction ([MAGDi](https://arxiv.org/html/2402.01620)) |

**Capability D was promoted from "future" to v1 in the latest revision**
because the research position is unambiguous: [SCoRe](https://arxiv.org/abs/2509.14257)
and related work show error-recovery sequences carry the highest-value
training signal in trace data, not noise to be filtered out. Earlier
drafts of this doc had the error-recovery framing backwards. Fixed.

Capabilities E and F are real patterns that will appear in production
traces from framework-instrumented agents (LangGraph, CrewAI,
Reflexion-style self-critique loops). They are deferred, not lost —
the "preserve `parent_span_id` on every record" rule keeps the data we
need to pick them up later.

### Grader

The grader checks two things: did the model pick the right tool(s), and
did it produce the right argument values? Both are **mechanical checks**
— string match on tool names, Jaccard overlap on argument keys and
values. There is **no LLM judge.** No rubric, no scoring dimensions,
no second model deciding "was this good."

The grader is a deterministic verifier derived from the same tool
schema the topics came from. **The scoring formula is published:**
[ToolRL (arXiv:2504.13958)](https://arxiv.org/abs/2504.13958) is the
first systematic study of reward design for tool-use GRPO training,
and its ablation (Table 7) shows fine-grained Jaccard decomposition
beats coarse exact-match by **+1.58 points on Qwen2.5-3B** — "finer-
grained reward decomposition provides richer learning signals."

#### The scoring formula (ToolRL-grounded)

For a single tool call:

```
r_name  = 1 if name(pred) == name(gt) else 0
r_param = |keys(gt) ∩ keys(pred)| / |keys(gt) ∪ keys(pred)|   # Jaccard on arg keys
r_value = Σ 𝟙[gt[k] == pred[k] for k in keys(gt) ∩ keys(pred)]

S_raw = r_name + r_param + r_value
S_max = 1 + len(gt_args)                     # one for the name, one per arg key
score = max(0.02, S_raw / S_max)             # floor = 0.02, ceiling = 1.0
```

Concrete mapping: wrong tool → `0.02` floor. Right tool + no arg
match → ~`(1 / (1 + n))`. Right tool + all args match →
`(1 + n + n) / (1 + n) = (1 + 2n) / (1 + n)` which converges to 2.0
for large n; we clamp at 1.0 on the output side. Partial arg matches
fall proportionally.

**Why the 0.02 floor (not 0.0)** — per our memory rule
`feedback_grader_no_zero_hard_gate`, a grader returning 0.0 for
attempted-but-wrong answers causes 80% zero-variance and flat training.
The floor ensures wrong-tool rollouts still contribute a non-zero
gradient. ToolRL's rescaled range `[-3, 4]` works because negative
advantages are still gradient-bearing; our `[0.02, 1.0]` range is the
equivalent for a non-negative reward formulation.

#### Parallel tool calls (Pattern D) — set-match formula

```python
def grade_parallel(pred_calls, gt_calls) -> float:
    per_call = [grade(p, best_match(p, gt_calls)) for p in pred_calls]
    coverage = min(len(pred_calls), len(gt_calls)) / max(len(pred_calls), len(gt_calls))
    return max(0.02, mean(per_call) * coverage)
```

The coverage penalty handles "too few" and "too many" calls
symmetrically. BFCL's all-or-nothing parallel matching is **correct
for benchmarking but wrong for GRPO training** — it produces too many
zero-variance batches. The coverage-penalized average is what ToolRL's
set-level Jaccard computation implicitly produces and is consistent
with the single-call Jaccard formula applied element-wise.

#### Edge-case handling (grounded in BFCL + ToolRL)

| Case | Rule | Source |
|---|---|---|
| Extra arguments the model emitted | Include in the Jaccard `keys(∪)` denominator — shrinks `r_param`. **Don't ignore silently** (matches memory rule `feedback_oov_counts_as_fp`) | BFCL rejects entirely; our Jaccard penalizes proportionally |
| Missing required arguments | Reduces `r_param` and `r_value` proportionally via Jaccard — no special case needed | — |
| Int vs float (type lenient) | `int(1) == float(1.0)` passes; `str("1") != int(1)` fails | BFCL convention |
| Nested dict values | Recurse one level, count leaf matches toward `r_value` | ToolRL |
| Null / None values | Predicted `null` on required arg = miss; GT `null` matched by `null` = match | Standard |
| Enum case differences | Case-insensitive string match | BFCL convention |
| Float tolerance | **Exact equality** — no published grader uses epsilon tolerance | BFCL, ToolRL |

See [`trace-grader-reference.md`](./trace-grader-reference.md) for
the full Python implementation with unit tests for every edge case.

#### Why this matters for our pipeline specifically

Traces are a much cleaner training source than documents in one
specific way: the reward is fully verifiable, with zero ambiguity
and zero risk of grader gaming. This is the one area where the
trace pipeline is strictly better than the document pipeline — and
ToolRL confirms this advantage was **empirically measured**, not
theoretical: fine-grained programmatic grading consistently beat
holistic LLM-judge grading on tool routing.

### System prompt — extract structurally, then rewrite (don't lift verbatim)

Earlier drafts of this doc said *"the system prompt comes from the
trace itself — we lift it once at the workflow level and use it as
the trained model's system prompt."* **That was wrong**, and verified
research now contradicts it. No production paper or platform endorses
verbatim lift as a recommended approach. LangSmith and Phoenix do
verbatim lift **only because they have no canonicalization step**, not
because the literature says it's right. Every paper that bothers to
address the question recommends a **purpose-built, consistent system
prompt** instead.

#### What the literature actually recommends

| Source | Strategy | What it does |
|---|---|---|
| **[OpenAI Fine-Tuning Best Practices](https://platform.openai.com/docs/guides/fine-tuning-best-practices)** | Consistent template (mandatory) | "Make sure all of your training examples are in the same format expected for inference." Strong consistency requirement. |
| **[OpenAI community thread](https://community.openai.com/t/system-prompt-in-dataset-fine-tuning-or-assistants-api/1053159)** | Consistent template | "You are not 'baking in' the system prompt — you are training a subset of the model for when your system prompt appears." Including a system prompt in only some training examples does not teach the model to use it consistently. |
| **[Microsoft Azure Q&A](https://learn.microsoft.com/en-gb/answers/questions/2201586/will-changing-system-prompts-in-fine-tuning-mess-t)** | Consistent template | Varying system prompts across training examples leads to "model sensitivity to minor prompt changes and loss of anchoring effect." |
| **[OpenAI Cookbook function-calling fine-tuning](https://developers.openai.com/cookbook/examples/fine_tuning_for_function_calling)** | Consistent template (in practice) | Defines one `modified_function_list` and applies it identically across every training record. |
| **[Orca (arXiv:2306.02707)](https://arxiv.org/abs/2306.02707)** | Curated template set | Used 15 predefined system instruction templates, none of which were lifted from the demonstrator (GPT-4). |
| **[ToolLLM (arXiv:2307.16789)](https://arxiv.org/html/2307.16789v2)** | Schema-derived template | Tool documentation concatenated into the prompt as text, not lifted as a structured system message. Different examples expose different tool subsets. |
| **[Gorilla (arXiv:2305.15334)](https://ar5iv.labs.arxiv.org/html/2305.15334)** | Template + injected retrieved doc | Fixed task-description template with API documentation injected from a retrieval store at training time. |
| **[krasserm planner fine-tuning](http://krasserm.github.io/2024/05/31/planner-fine-tuning/)** | Tool list omitted entirely | Most extreme form: the planner learns the available tools implicitly from training trajectories rather than from a system-prompt enumeration, to reduce inference latency. |

**No paper or platform recommends verbatim lift.** It is what tools do
by default when they have no canonicalization step. Following that
default for our pipeline reproduces multiple known failure modes from
the literature (see "Failure modes" subsection below).

#### Recommended treatment — hybrid (a)+(c)

1. **Extract the most common system prompt from the bundle as a
   structural baseline.** This captures the task intent the demonstrator
   was actually working toward — what role the agent was playing, what
   the success criteria were, what behavioral instructions the
   developer wrote.
2. **Rewrite it for the student model.** Specifically:
   - Remove demonstrator-specific capability claims (references to
     long-context reasoning, GPT-4o-style chain-of-thought, etc. that
     a Qwen 2B/4B can't fulfill).
   - Strip dynamic context (current date, user IDs, session state)
     that would otherwise vary per training record and break anchoring.
   - Replace references to tools the student won't have at inference.
   - Add student-model-specific format instructions (e.g. Qwen's tool-
     call syntax if it differs from the demonstrator's).
   - Shorten to fit the student's context budget.
3. **Apply this one rewritten prompt identically across every training
   record.** Consistency is mandatory per OpenAI's guidance and the
   anchoring-effect warning from Microsoft Azure.

This is what OpenAI documents, what Orca demonstrates, and what every
paper that bothers to address it does. The doc previously hand-waved
this as "lift from the trace" — that was wrong.

#### Anthropic / Claude format note

Claude fine-tuning on Bedrock uses a top-level `"system"` field
separate from the `"messages"` array
([AWS Bedrock guide](https://aws.amazon.com/blogs/machine-learning/best-practices-and-lessons-for-fine-tuning-anthropics-claude-3-haiku-on-amazon-bedrock/)).
This is structurally distinct from OpenAI's format where the system
message is a `{"role": "system", ...}` entry inside the messages
array. If we ever target a Claude student instead of Qwen, the system
content has to be hoisted to a top-level field. v1 targets OpenAI
format because the student is Qwen.

### Failure modes for system prompt and tool schema extraction

Seven failure modes from the literature, each tied to a specific
mistake the v1 pipeline must avoid. None of these were in earlier
drafts of this doc; all of them come from research the design has now
been verified against.

| # | Failure mode | What goes wrong | Where it bites |
|---|---|---|---|
| **FM-1** | **Verbatim demonstrator prompt → student-incompatible distribution** | If GPT-4o's system prompt assumes capabilities the student (Qwen 2B/4B) doesn't have — long-context reasoning, specific CoT format, implicit tool constraints — training the student on those demonstrations conditions it on context it never receives at inference. | Verbatim lift path (what LangSmith / Phoenix do by default). [OpenAI guidance](https://platform.openai.com/docs/guides/fine-tuning-best-practices) directly warns this breaks fine-tuning. |
| **FM-2** | **Dynamic content in system prompts → loss of anchoring effect** | Production system prompts inject per-session content (current date, user ID, session state). Verbatim lift puts these into every record's system prompt as unique strings. [Microsoft Azure Q&A](https://learn.microsoft.com/en-gb/answers/questions/2201586/will-changing-system-prompts-in-fine-tuning-mess-t) documents that this causes "model sensitivity to minor prompt changes and loss of anchoring effect." | Same as FM-1. |
| **FM-3** | **Inconsistent tools arrays → incoherent calling conventions** | Training records with different versions of the same tool's parameter schema teach the model to interpolate between calling conventions. The OpenAI cookbook's explicit recommendation to use an identical `modified_function_list` across all examples exists to prevent this. | Naively unioning all tool versions across the bundle. |
| **FM-4** | **Never-called tools inflate prompt tokens without gradient signal** | Tools defined but never called still appear in the `tools` array of training records under naive union. The model receives no demonstration of how to call them, but pays context budget for their schema. Worse, the model may learn to call them incorrectly by interpolation from similar tools it did see called. | Including the topic-hierarchy union directly in the per-record `tools` array. (Topic hierarchy keeps them; per-record array drops them.) |
| **FM-5** | **Schema drift without timestamp ordering → contradictory supervision** | If we mix old and new parameter shapes for the same tool name, the model receives contradictory gradients. This is worse than training on only one version because the gradients partially cancel. | Multi-version trace bundles where the schema changed mid-recording. |
| **FM-6** | **Implicit tool learning breaks for heterogeneous bundles** | The "omit tool list and let the model learn implicitly" strategy ([krasserm](http://krasserm.github.io/2024/05/31/planner-fine-tuning/)) only works when there is one consistent tool set across all training trajectories from a single agent configuration. Multi-version bundles cause the implicit representation to never converge. | If we ever try to follow krasserm's "no tool list in prompt" approach without verifying the bundle is homogeneous. |
| **FM-7** | **Gorilla's retrieval answer requires shipping a retrieval component** | [Gorilla](https://ar5iv.labs.arxiv.org/html/2305.15334)'s schema-versioning fix (train the model to read retrieved API docs at inference time) is architecturally sound but only works if the deployed inference endpoint has retrieval. v1's deployment is a simple chat endpoint with no retrieval step. Treating "schema versioning solved by Gorilla" as a v1 mitigation is wrong — it's a v2+ option that requires a separate retrieval component. | Pretending we can defer schema versioning to "Gorilla-style retrieval" without committing to ship retrieval at inference. |

The system prompt and tools-array rules above (hybrid extract-rewrite,
union-with-conflict-resolution) are designed to prevent FM-1 through
FM-5 directly. FM-6 and FM-7 are listed as future-design constraints,
not v1 risks.

### Extraction vs. synthesis — who calls an LLM, and when

A useful summary that ties topics, records, grader, and system prompt
together: **the training records themselves are pure extraction. No
LLM rewrites them between bundle arrival and training.** The two
exceptions are the **system prompt rewrite** (one workflow-level
rewrite, applied identically to every record) and any optional
**paraphrase expansion** for small bundles. The training records'
content — input messages, tool call labels — is never invented or
rewritten by an LLM. This matches what every major trace-observability
platform actually does in production — confirmed against
[LangSmith's fine-tuning cookbook](https://docs.smith.langchain.com/cookbook/fine-tuning-examples/export-to-openai),
[Langfuse's Export for Fine-Tuning](https://langfuse.com/docs/api-and-data-platform/features/fine-tuning),
[Arize Phoenix's dataset export](https://arize.com/docs/phoenix/datasets-and-experiments/how-to-datasets/exporting-datasets),
and [OpenAI's Stored Completions → Distillation flow](https://openai.com/index/api-model-distillation/).
The consistent pattern is **capture → filter by score/tag → reformat
→ train**.

| Stage | What happens to the data | Extraction or synthesis? | Is an LLM called? |
|---|---|---|---|
| **Topic hierarchy** | Union of all tool names from `invocation_parameters.tools` across the bundle | Extraction | No |
| **Per-record `tools` array** | Subset of the topic hierarchy: only tools actually called, latest description per name, latest parameter shape per name | Extraction with rules | No |
| **Records — training set** | One per successful LLM decision point + one per error-recovery sequence, pulled directly from `input_messages` / `output_messages` of LLM spans | **Extraction** | **No** |
| **Grader** | Derived mechanically from the tool schema | Derivation | No |
| **System prompt** | Extract the most common system prompt from the bundle as a structural baseline, then **rewrite** for the student model (drop dynamic context, drop demo-only capability claims, fit student context budget). Apply ONE rewritten prompt identically across every record | **Hybrid: extract + rewrite** | **Yes, once, at the workflow level** (manual or LLM-assisted; see "System prompt" section above) |
| **Records — eval set** | Customer requests the trained model has never seen. **Preferred**: held-out tasks or held-out tools from later captured production traces. **Fallback only**: LLM-synthesized rephrasings of training intents (see caveat below) | **Extraction preferred, synthesis is a fallback** | Only if synthesis fallback is used |
| **Paraphrase expansion** (optional, for small bundles) | Use an LLM to rephrase training user messages N ways, keeping the ground-truth tool call. Correct name: **instruction paraphrasing / Self-Instruct-style augmentation**. **Critical caveat**: [GPT4Tools](https://huggingface.co/papers/2305.18752) found negative-sample augmentation was the key factor, not paraphrasing alone | **Synthesis** (augmenting, not replacing) | Yes, once, offline |

Two properties fall out of this:

1. **The training records' content is an honest projection of what the
   demonstrator actually did.** No LLM reinterprets, rephrases, or
   invents the user messages or the tool-call labels. The pseudo-labels
   are the demonstrator's own choices, preserved as the grader's target.
2. **Synthesis, where it does happen, is always additive and always
   carries real ground truth forward.** The system prompt rewrite is
   one-shot and applies the same prompt to every record. Eval
   paraphrases and expansion paraphrases inherit the tool call from
   the record they're derived from — synthesis changes the surface
   form, not the label.

Contrast with the document pipeline, where **Step 4 literally calls an
LLM to invent new Q/A pairs from PDF passages.** Documents have no
built-in labels, so synthesis is the only option. Traces have labels
already; the only synthesis steps in the trace pipeline are (1) the
one-shot system-prompt rewrite at the workflow level, (2) optional
paraphrase expansion for small bundles, and (3) the eval-set fallback
when held-out production traffic isn't available. The training records'
labels are never invented.

#### Evaluation: held-out tasks, not paraphrased strings

Earlier drafts said "the eval set is LLM-generated paraphrases of the
training intents." **Research says that's the weaker fallback, not the
canonical technique.** The tool-use literature converges on three
stronger alternatives:

| Eval technique | What it measures | Source |
|---|---|---|
| **Held-out tasks** (τ-bench) | The model attempts a task it hasn't seen and is scored against the goal database state, not against a string | [τ-bench (arXiv:2406.12045)](https://arxiv.org/abs/2406.12045) |
| **Held-out functions** (BFCL) | Tools not shown during training appear at eval time; AST-based matching, not string match | [BFCL](https://gorilla.cs.berkeley.edu/leaderboard.html) |
| **Simulator-driven dialogue variation** | A user-simulator LLM drives test turn variation at runtime, so variation isn't pre-generated | τ-bench |
| **pass^k reliability** (multi-trial) | Single-pass accuracy under-reports real agent failure rates; measure reliability across K independent attempts | τ-bench |
| **LLM-paraphrased eval strings** | Weaker fallback — only use when held-out production traffic and task schemas aren't available | general robustness literature, not tool-use-specific |

For v1, with a shopping-agent fixture, the realistic eval set is:
held-out customer phrasings from later production traffic if we can
get them; otherwise LLM-paraphrased intents from the training set as
the weaker fallback. Document the choice explicitly.

#### Failure modes of instruction paraphrasing (if we do it)

If we do add Self-Instruct-style augmentation to expand a small
training set, four failure modes from the literature:

1. **Fine-tuning distorts pretrained features OOD**
   ([arXiv:2202.10054](https://arxiv.org/abs/2202.10054)). A narrow
   paraphrase-augmented training set can hurt generalization more than
   linear probing. Bound the augmentation ratio — don't 10× a tiny
   dataset and expect to win.
2. **LoRA on paraphrased data mostly learns style tokens, not
   capability** ([arXiv:2402.05119](https://arxiv.org/html/2402.05119v5)).
   The model picks up response-initiation patterns and surface form
   instead of the underlying routing logic.
3. **Paraphrases collapse to the paraphraser LLM's fingerprint.** If
   GPT-4 generates all the paraphrases, the augmented data carries
   GPT-4's style, and the student learns to imitate that style rather
   than the original customer language distribution.
4. **Paraphrasing alone is insufficient for tool use.** GPT4Tools
   specifically found that **negative-sample augmentation** (wrong
   tools, wrong arguments, out-of-domain requests) was the key factor
   for tool-use finetuning, not paraphrasing alone. A v2 paraphrase
   stage should pair positives with generated negatives.

#### Other pre-training hygiene (from platform docs, not research)

Before any record lands in the training set — whether extracted or
synthesized:

- **Score-gate filtering.** Every major platform filters trace records
  by quality tags / user feedback / custom scores before export.
  Langfuse, LangSmith, and OpenAI Stored Completions all do this as
  the default step between capture and export.
- **PII / near-duplicate scrubbing.** The LangSmith cookbook pipelines
  [Lilac](https://github.com/langchain-ai/langsmith-cookbook/blob/main/fine-tuning-examples/lilac/lilac.ipynb)
  specifically to detect near-duplicates and check for PII before
  finetuning. Trace data is raw production traffic and needs this
  pass — the extractor does not currently do it.
- **OTel content is opt-in.** `gen_ai.input.messages` and
  `gen_ai.output.messages` may be absent if the producer didn't
  opt in (per the OTel GenAI semconv status). The extractor must
  skip or flag traces with missing content rather than guess.

---

## The detailed workflow — from trace bundle to trained model

Following a real trace bundle (the Phoenix shopping-agent fixture: 6 tools
defined, 4 actually called, 33 unique tool-call decisions across 38 traces)
through every stage. No implementation — just what happens, in what order,
with what conceptual output.

### The full workflow in one diagram

```
                            TRACE BUNDLE arrives at workflow
                       (e.g. shopping-agent.parquet · 609 spans · 38 traces)
                                            │
                                            ▼
        ╔════════════════════════════════════════════════════════════════════╗
        ║  STAGE 1 — Inspect bundle  (no LLM, no extraction)                 ║
        ║  ────────────────────────                                          ║
        ║   spans:    LLM=76  TOOL=41  AGENT=264  CHAIN=152  UNKNOWN=76      ║
        ║   traces:   38 total · 33 with a successful tool decision          ║
        ║   schema:   6 tools defined · 4 actually used                      ║
        ║   model:    gpt-4o                                                 ║
        ╚════════════════════════════════════════════════════════════════════╝
                                            │
              ┌─────────────────────────────┼────────────────────────────┐
              │                             │                            │
              ▼                             ▼                            ▼
    ┌───────────────────┐     ┌───────────────────────┐    ┌────────────────────┐
    │ STAGE 2  TOPICS   │     │ STAGE 3  RECORDS      │    │ STAGE 4  GRADER  + │
    │  read schema      │     │  extract from spans   │    │ STAGE 5  PROMPT    │
    │  (no LLM)         │     │  (no LLM)             │    │  derive + REWRITE  │
    │ ─────────────     │     │ ──────────────────    │    │ ─────────────────  │
    │ Topic hierarchy   │     │ walk SPAN TREE via    │    │ GRADER             │
    │ (UI concept):     │     │  flat query + parent  │    │ single call:       │
    │  Shopping Agent   │     │  pointer joins        │    │  wrong tool  = 0.02│
    │  ├ product_       │     │                       │    │  right + 0   = 0.20│
    │  │  search  (13)  │     │ UNIT = one LLM        │    │  right + all = 1.00│
    │  ├ product_       │     │  DECISION POINT       │    │  partial in btw    │
    │  │  details  (5)  │     │  (not turn, not       │    │                    │
    │  ├ product_       │     │   trace)              │    │ set call (parallel)│
    │  │ comparison(0)◄─┼─┐   │                       │    │  per-call avg ×    │
    │  ├ track_         │ │   │ Turn boundaries from: │    │  min(K,M)/max(K,M) │
    │  │  package (11)  │ │   │  ① Langfuse Sessions  │    │                    │
    │  ├ apply_         │ │   │  ② invoke_agent span  │    │ NEVER returns 0.0  │
    │  │  discount (4)  │ │   │  ③ gen_ai.conv.id +   │    │                    │
    │  └ customer_      │ │   │     time-gap (heur.)  │    │ Same `tools` array │
    │    support   (0)◄─┼─┘   │                       │    │ on every record    │
    │                   │     │ Tool↔result link via  │    │ (OpenAI consist.   │
    │ empty topics KEPT │     │  tool_call_id (OpenAI)│    │ rule)              │
    │ in the hierarchy  │     │  / tool_use_id        │    │                    │
    │                   │     │  (Anthropic) — OTel   │    │ ─────────────      │
    │ Per-record tools  │     │  abstracts as         │    │ SYSTEM PROMPT      │
    │ array (training): │     │  gen_ai.tool.call.id  │    │ ❶ extract most     │
    │  ONLY tools that  │     │                       │    │   common from      │
    │  were CALLED      │     │ FOUR PATTERNS         │    │   bundle as        │
    │  (drop 0-call     │     │ (all in fixture):     │    │   structural       │
    │   ones to prevent │     │ ─────────────         │    │   baseline         │
    │   FM-4: dead-     │     │ Ⓐ single-shot:         │    │ ❷ REWRITE for      │
    │   weight tokens)  │     │   1 dec, 1 call, OK    │    │   student model:   │
    │                   │     │   → 1 imitation rec    │    │   • drop dynamic   │
    │ → 4 tools in the  │     │   (fixture: 29 turns)  │    │     ctx (date,     │
    │   per-record      │     │                        │    │     user_id, etc.) │
    │   array, 6 in     │     │ Ⓑ error→correction:    │    │   • drop demo-only │
    │   the hierarchy   │     │   wrong → ERR →         │    │     capability    │
    │                   │     │   right → OK            │    │     claims        │
    │ Description       │     │   → 1 imitation +       │    │   • shorten to    │
    │ conflicts: use    │     │     1 SCoRe correction │    │     student ctx    │
    │ MOST RECENT       │     │   = 2 records (both    │    │   • use student's  │
    │ (resolves drift)  │     │     emitted, NOT one)  │    │     tool-call      │
    │                   │     │                        │    │     syntax         │
    │                   │     │ Ⓒ sequential ReAct:    │    │ ❸ apply ONE        │
    │                   │     │   N decisions, each    │    │   rewritten        │
    │                   │     │   informed by prior    │    │   prompt           │
    │                   │     │   results              │    │   IDENTICALLY      │
    │                   │     │   → N records w/       │    │   on every record  │
    │                   │     │     growing context    │    │                    │
    │                   │     │   (fixture: 5 turns)   │    │ NOT verbatim lift  │
    │                   │     │                        │    │ — that's what      │
    │                   │     │ Ⓓ parallel calls:      │    │ tools do by        │
    │                   │     │   1 decision emits     │    │ DEFAULT, not       │
    │                   │     │   K calls at once      │    │ what the           │
    │                   │     │   → 1 record, output   │    │ literature         │
    │                   │     │     is a SET           │    │ recommends         │
    │                   │     │   (fixture: 1 turn)    │    │ (OpenAI / Orca /   │
    │                   │     │                        │    │ ToolLLM / Gorilla /│
    │                   │     │ C + D can coexist in   │    │ krasserm all do    │
    │                   │     │ one turn (fixture has  │    │ template, not      │
    │                   │     │ this: compare trace)   │    │ verbatim)          │
    │                   │     │                        │    │                    │
    │                   │     │ COUNTS:                │    │                    │
    │                   │     │  ~40 imitation records │    │                    │
    │                   │     │  from the 38-trace     │    │                    │
    │                   │     │  fixture (~33 under    │    │                    │
    │                   │     │  naive per-turn rule   │    │                    │
    │                   │     │  — +20% signal)        │    │                    │
    │                   │     │  + 0 SCoRe records     │    │                    │
    │                   │     │  (no Pattern B traces  │    │                    │
    │                   │     │  in this fixture; real │    │                    │
    │                   │     │  bundles add more)     │    │                    │
    └───────────────────┘     └───────────────────────┘    └────────────────────┘
              │                             │                            │
              └─────────────────────────────┼────────────────────────────┘
                                            │
                                            ▼
        ╔════════════════════════════════════════════════════════════════════╗
        ║  STAGE 6 — Pre-training probe  (THE only trace-specific gate)      ║
        ║  ────────────────────────────                                      ║
        ║   run untrained base model × K=8 rollouts over each record         ║
        ║   bucket each record by passing-rollouts:                          ║
        ║                                                                    ║
        ║      8/8 passing  →  TRIVIAL    (no gradient signal)               ║
        ║      1–7 passing  →  LEARNABLE  (where GRPO actually learns)       ║
        ║      0/8 passing  →  IMPOSSIBLE (no foothold)                      ║
        ║                                                                    ║
        ║   GATE:                                                            ║
        ║      GO     if learnable_frac ≥ 30%                                ║
        ║              AND no single tool is > 70% trivial                   ║
        ║      NO-GO  otherwise → block + actionable message to user         ║
        ║                                                                    ║
        ║   trivial records are KEPT, not deleted                            ║
        ║   (filtering them is the wrong move — they anchor the loss)       ║
        ╚════════════════════════════════════════════════════════════════════╝
                                            │
                                            │  GO
                                            ▼
                          ┌─────────────────────────────────┐
                          │     HANDOFF TO CLOUD SERVER     │
                          │     (LangDB Cloud)              │
                          │                                 │
                          │  Local pipeline ships:          │
                          │    • records (JSONL)            │
                          │    • grader (callable / spec)   │
                          │    • rewritten system prompt    │
                          │    • base model choice          │
                          │    • probe report               │
                          └─────────────────────────────────┘
                                            │
                                            ▼
        ╔════════════════════════════════════════════════════════════════════╗
        ║  STAGE 7 — Training  (handled by CLOUD SERVER, not local code)     ║
        ║  ─────────────────                                                 ║
        ║                                                                    ║
        ║   The cloud runs GRPO on a tool-capable base model.                ║
        ║   No BC warm-start: the base (Qwen 2B/4B etc.) already knows       ║
        ║   tool-calling from its instruction-tuning phase.                  ║
        ║                                                                    ║
        ║   Per record (cloud-side):                                         ║
        ║     base model emits K=8 rollouts at temperature                   ║
        ║     grader scores each rollout                                     ║
        ║                                                                    ║
        ║     example rollout spread for one record:                         ║
        ║       [1.00, 0.47, 0.02, 1.00, 0.47, 1.00, 0.02, 1.00]             ║
        ║         ↑perfect ↑partial ↑wrong-tool  group_mean = 0.625          ║
        ║                                                                    ║
        ║     advantage = score − group_mean                                 ║
        ║     PPO-style clipped policy update                                ║
        ║                                                                    ║
        ║   On-policy sampling = no compounding error in the first place.   ║
        ║                                                                    ║
        ║   Early stop on eval-set LEARNABLE_FRAC (NOT avg reward).         ║
        ║                                                                    ║
        ║   ─── Local pipeline doesn't implement any of this ───             ║
        ║   The cloud team chooses the trainer (likely TRL+Unsloth),         ║
        ║   handles TRL #5366 / #4543, and produces a fine-tuned             ║
        ║   adapter. Local pipeline waits for the result.                    ║
        ╚════════════════════════════════════════════════════════════════════╝
                                            │
                                            ▼
        ╔════════════════════════════════════════════════════════════════════╗
        ║  STAGE 8 — Eval on UNSEEN paraphrases  (orchestrated locally)      ║
        ║  ─────────────────────────────────                                 ║
        ║   Local pipeline drives eval against the cloud-served model.       ║
        ║   Held-out customer phrasings the model has NEVER seen.            ║
        ║   (NOT a slice of training — different sentences, same intents.)   ║
        ║                                                                    ║
        ║   Same programmatic grader from Stage 4.                           ║
        ║                                                                    ║
        ║   Metrics that matter:                                             ║
        ║     • tool-name accuracy                                           ║
        ║     • argument-match rate (right-tool subset)                      ║
        ║     • refusal precision / recall                                   ║
        ╚════════════════════════════════════════════════════════════════════╝
                                            │
                                            ▼
        ╔════════════════════════════════════════════════════════════════════╗
        ║  STAGE 9 — Deploy  (DEFERRED for v1)                               ║
        ║                                                                    ║
        ║   Existing vLLora gateway already serves vLLM-based inference.    ║
        ║   Revisit when we have a fine-tuned adapter to actually serve.    ║
        ╚════════════════════════════════════════════════════════════════════╝
                                            │
                                            ▼
                                    TRAINED MODEL
```

### Notes on each stage

**Stages 1–5** are summarized by the diagram above and explained in
plain prose under "What traces contribute to a workflow." They are
mechanical extraction with one explicit exception: **Stage 5 (system
prompt) involves a one-shot rewrite at the workflow level**, not pure
extraction. Everything else (topics, records, grader) is pure extraction
with no LLM in the loop.

The part of the diagram worth reading carefully is **Stage 3's record
rule**: one record per LLM decision point inside a turn (not per turn,
not per trace), covering all four patterns A/B/C/D (single-shot, error
recovery, sequential ReAct, parallel tool calls), and emitting **both**
imitation records for successful decisions **and** SCoRe-style
correction records for failed-then-recovered attempts. A multi-tool
flow produces multiple records — one per decision point — each with
a growing context prefix that teaches the model a different reasoning
step.

**Stages 6–9** are where the trace pipeline actually does anything
the document pipeline doesn't do, so they get prose below.

### Stage 6 — The pre-training probe (the only trace-specific gate)

Before any training happens, the pipeline does one thing the document
pipeline doesn't: it measures **how learnable the records actually are**
under the GRPO algorithm.

This matters because tool routing has a known failure mode: most prompts
are easy, the model gets them right on every K rollout, reward variance
collapses to zero, and training learns nothing while the average reward
looks great. The probe catches this before GPU hours get wasted.

What the probe does, conceptually:

1. Run the **untrained base model** on every record, K times (K=8 in our
   pipeline).
2. For each record, count how many of the K rollouts scored above 0.5.
3. Bucket the records:
   - **Trivial:** all K rollouts succeeded. No gradient signal here.
   - **Learnable:** between 1 and K-1 rollouts succeeded. This is where
     GRPO actually learns.
   - **Impossible:** zero rollouts succeeded. The model has no foothold.

**Three gates for tool-routing-specific probing** (adjusted from the
PDF defaults based on tool-routing research):

1. **`learnable_frac ≥ 25%`** — lower than the PDF `≥ 30%` threshold
   because tool routing has a smaller discrete output space, so
   zero-variance groups are more frequent even on good datasets. ToolRL
   (arXiv:2504.13958) and IRC (arXiv:2604.02869) both train successfully
   at K=4 with significant trivial mass, confirming that 25% is realistic
   for this task class.
2. **`trivial_wrong_frac ≤ 10%`** — a new trace-specific gate. Unlike
   PDF records, tool routing can have two kinds of trivial records:
   - **Trivial-correct**: all K rollouts score 1.0 (model knows this
     cold — no gradient signal but not a failure)
   - **Trivial-wrong**: all K rollouts score 0.02 (model locked onto a
     wrong tool — actively harmful to training, indicates the base
     model has a miscalibrated prior)
   The PDF pipeline lumps these together; the trace pipeline tracks
   them separately. If `trivial_wrong_frac > 10%`, the base model has
   a pre-existing bias we need to address with contrastive data
   (rather than hoping GRPO unlearns it).
3. **No single tool > 70% trivial** — grouped by `gt_tool_name`, not
   by topic. If one tool dominates the trivial-correct bucket, GRPO
   will reinforce the base model's existing preference for that tool
   and silently collapse (per `feedback_default_mode_collapse`). Drop
   those records from training or add contrastive examples where
   similar-looking requests should pick a different tool.

**Plus one new check that doesn't exist in the PDF pipeline:**

4. **`refusal_frac ≥ 10%`** (if the workflow supports refusal as an
   output). Trace bundles that contain zero refusal records will train
   a model that never learns to refuse and will hallucinate tool calls
   on every input. If the workflow's tool schema has a "no tool fits"
   fallback path, the training set needs ≥10% refusal records to teach
   it. PDFs don't have this concept because Q/A has no "refuse to
   answer" equivalent.

Trivial records are **not deleted** — they stay in the dataset.
Filtering them out is exactly the wrong move (their ground truth still
anchors the loss). The probe is a gate, not a filter.

The output of this stage is a go/no-go decision. If all four gates
pass, training proceeds. If any gate fails, the pipeline blocks with
an actionable message explaining which gate failed and what to fix.
See the full workflow diagram above (Stage 6) for the gate criteria.

### Stage 7 — Training (GRPO directly on a tool-capable base)

> **Where it runs:** **Stage 7 is owned by the cloud server (LangDB
> Cloud), not the local pipeline.** Our local pipeline produces the
> training artifacts in Stages 1–5, runs the difficulty probe in
> Stage 6, and hands the artifacts to the cloud via the existing
> finetune API. The cloud runs the actual GRPO training. The
> conceptual description below applies to *what training does* — the
> mechanics of the trainer, the choice of TRL/Unsloth, and the
> handling of TRL issues #5366 / #4543 are the cloud team's
> responsibility, not v1's. See `otel-extractor-tooling-survey.md`
> for the local-vs-cloud scope split.

**No BC warm-start stage.** The base model we finetune ships with
tool-calling already baked in from its instruction-tuning phase. It
already knows JSON tool-call syntax, how to parse a tool schema from
a system prompt, how to emit valid arguments given parameter
descriptions, and multi-turn conversation with tool results. Adding a
supervised warm-start on top of that would re-teach things the base
model already knows. See "Why we skip BC warm-start" below for the
full rationale.

**Recommended base model: [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B)**
(Apache 2.0). Verified against the model survey in the tooling
companion doc:

- vLLM tool-call parser: `--tool-call-parser qwen3_coder
  --enable-auto-tool-choice` (mainline vLLM, JSON malformation bug
  fixed in [PR #35347](https://github.com/vllm-project/vllm/pull/35347))
- Unsloth GRPO: supported with `fast_inference=False`
- FP8 GRPO VRAM: ~8–10 GB, fits comfortably on H100 80GB with K=8
  rollout headroom
- Apache 2.0 license, no commercial-use restrictions

**Upgrade tier for complex routing: `Qwen3-8B`** — same Hermes
parser, ~16 GB VRAM with FP8, demonstrated stable fine-tuning across
benchmarks. Use when 4B's capacity isn't enough for the workflow's
tool count or routing complexity.

**Smaller tiers if VRAM is constrained:** `Qwen3.5-2B`,
`Qwen3.5-0.8B` (existing vLLora model size options).

**Earlier drafts said "Qwen 2B/4B or Llama-3.2 or equivalent."**
That was vague and partly wrong: Llama 3.2 3B scores only **55.7% on
BFCL v3** (vs the Qwen3 series at 70%+), uses prompt-engineering-
dependent tool calling rather than a structured parser, and has more
restrictive licensing. Drop "Llama-3.2 or equivalent" — Qwen3.5 is
strictly better for our use case. The full per-model survey is in
[`otel-extractor-tooling-survey.md`](./otel-extractor-tooling-survey.md)
under "Base model survey for tool-routing fine-tuning."

The cloud runs GRPO directly on the tool-capable base:

1. For each extracted record, the base model generates K=8 rollouts at
   temperature.
2. The grader scores each rollout with the programmatic verifier from
   Stage 4.
3. Advantage = score − group mean (standard GRPO formulation).
4. PPO-style clipped policy update pushes toward positive-advantage
   rollouts and away from negative-advantage ones.
5. Early stopping is based on the eval-set **learnable fraction**, not
   the average reward — trivial records dominate the average and will
   plateau early while the real learning signal lives in the learnable
   bucket.

**On-policy sampling is what prevents compounding error here.** GRPO
generates rollouts from the student's own policy, so it sees the
states the student actually reaches — not teacher-forced clean
prefixes. This is the property that fights the O(T²) failure mode BC
would otherwise create. We avoid compounding error by **not cloning in
the first place**, not by cloning and then fixing it.

From here on, the trace pipeline and the document pipeline are
almost identical. GRPO sees a flat list of records and a programmatic
grader, and it doesn't know or care that the records came from a
trace. See the full workflow diagram above (Stage 7) for one record's
K=8 rollout spread and how it becomes a gradient update.

#### Hyperparameter deltas from the PDF default

The PDF pipeline defaults (`lr=1e-6`, `β=0`, `loss_type=dr_grpo`,
`G=8`, `temperature=0.9`, `max_output_tokens` = GT P95 × 1.5,
adaptive epochs) were tuned for document Q&A. Research on
tool-routing-specific GRPO
([ToolRL arXiv:2504.13958](https://arxiv.org/abs/2504.13958),
[IRC arXiv:2604.02869](https://arxiv.org/abs/2604.02869),
[Bespoke Labs](https://www.bespokelabs.ai/blog/improving-multi-turn-tool-use-with-reinforcement-learning),
[RC-GRPO arXiv:2602.03025](https://arxiv.org/abs/2602.03025))
confirms most of those defaults carry over, with **three recommended
adjustments** and **one conditional escalation**:

| Parameter | PDF default | Tool-routing | Rationale |
|---|---|---|---|
| `learning_rate` | `1e-6` | **Same** | Bespoke Labs uses 1e-6 for tool RL; IRC uses 2e-6 to 5e-7. Do NOT use the math-reasoning value (1e-5). |
| `loss_type` | `dr_grpo` | **Same** | Eliminates length bias at algorithm level — relevant for tool routing since longer JSON shouldn't get artificial advantage. |
| `β` (KL coefficient) | `0` | **Same as default, but escalate to `0.001` + ref model refresh every 100 steps if length blowup is observed** | Bespoke Labs explicitly found beta=0 + tool calling → completion length blowup. Their stable config: `β=0.001` with periodic ref model refresh. Conditional, not default. |
| `G` (K rollouts) | `8` | **Keep 8; drop to `4` if `frac_reward_zero_std > 50%`** | ToolRL and IRC both use K=4 for tool routing. Short discrete outputs → harder to achieve diversity at K=8. Monitor early (step 50) and reduce if needed. |
| `temperature` (train) | `0.9` | **Change to `1.0`** | ToolRL uses 1.0 explicitly "to encourage broader policy exploration." Tool routing's smaller output space needs the extra diversity. Eval stays at 0.0 (greedy). |
| `max_output_tokens` | GT P95 × 1.5 | **Change to GT P95 × 1.3** | Tool calls are short (50-200 tokens for JSON). Bespoke Labs' main failure mode was length blowup → tighter cap prevents it. Typical tool-routing cap: 256-512 tokens. |
| `epsilon` (clipping) | asymmetric `(3e-4, 4e-4)` | **Same** | No tool-routing-specific evidence recommends different values. DAPO asymmetric rationale still applies. |
| Epochs | 10-30 (small), 5-10 (large) | **Same** | ToolRL uses 15 epochs on ~4K examples. Same range as PDF. |

**Two tool-routing-specific watch conditions** during training:

1. **Check `frac_reward_zero_std` at step 50.** If >70%, the policy
   has collapsed to single-tool output — the "paradox of perfection"
   from RC-GRPO. The small tool-call output space + already-tool-
   capable base model means policy entropy can collapse faster than
   in reasoning tasks. Defenses in order: (a) reduce K to 4, (b)
   enable `β=0.001` with ref model refresh, (c) add more contrastive
   training data for the dominant tool.
2. **Check `mean_length` growth.** If it grows >30% without a
   corresponding reward increase, length blowup is starting. Defense:
   tighten `max_output_tokens` further, or enable `β=0.001`.

**Hyperparameters NOT in this table** — if you don't see a parameter
here, it means the tool-routing literature doesn't recommend changing
it from the PDF default. Carry those values over verbatim.

### Stage 8 — Evaluation against unseen paraphrases

The eval set is **not** a held-out slice of the training records. It's a
**different set of customer phrasings asking for the same intents** —
either captured from production traffic the agent saw later, or generated
synthetically.

The eval grader is the same programmatic verifier from Stage 4. The
metrics split into three tiers — Tier 1 is always reported, Tier 2 is
computed after every training iteration for diagnostics, Tier 3 is
implemented only if training stalls after 2+ iterations.

#### Tier 1 — required metrics

| Metric | Formula | Target |
|---|---|---|
| **Tool-name accuracy** | fraction where `pred.name == gt.name` | > 0.80 before training, > 0.92 after |
| **Argument-match rate** | fraction where score = 1.0 on the right-tool subset | > 0.70 after |
| **Overall grader mean** | `mean(scores)` over eval set | > 0.70 after |
| **Per-tool grader score** | `mean(scores) grouped by gt_tool_name` | No tool below 0.50 after |
| **Refusal precision / recall** | standard P/R on "no tool call" GT records | > 0.80 both |

These metrics are computed on **never-before-seen customer phrasings**.
The training-set numbers are diagnostic only — they tell you whether
the pipeline ran, not whether the model is useful.

#### Tier 2 — diagnostic metrics (compute after every iteration)

| Metric | What it reveals |
|---|---|
| **Tool confusion matrix** (predicted × GT) | Which tool pairs are confused → drives contrastive data addition |
| **Argument-type error breakdown** | Wrong value vs wrong key vs missing key vs extra key — diagnoses grader calibration |
| **Parallel-call set-accuracy** vs single-call accuracy | Whether Pattern D is harder than Pattern A for this workflow |
| **Refusal vs tool-call confusion** | Model called a tool when it should have refused, or vice versa |
| **Trivial% per tool** | Which tools the model already knows cold — can be removed from training or used only for validation |

#### Tier 3 — advanced (implement if training stalls after 2+ iterations)

**Discriminative power analysis** from [IRC (arXiv:2604.02869)](https://arxiv.org/abs/2604.02869):
for each reward component (tool name, param keys, param values),
compute point-biserial correlation between that component's score and
overall task success. Components with near-zero or negative correlation
are noise — reduce their weight in the grader. This is the
tool-routing equivalent of the PDF pipeline's per-criterion LLM-judge
audit.

#### Weak-tool identification workflow (translates the PDF per-topic flow)

```
1. After each eval run, group records by gt_tool_name.
2. Compute mean grader score per tool.
3. Tools with mean score < 0.50 are WEAK.
4. For each weak tool, inspect the tool confusion matrix row:
   • Is the model confusing it with a semantically similar tool?
     → Add contrastive examples (same-sounding inputs, different
       correct tools)
   • Is the confusion random (many different wrong tools)?
     → Tool is underrepresented → add more records for it
   • Is tool name correct but args wrong?
     → Argument schema is ambiguous → simplify it in the system
       prompt or add worked examples
5. Re-run eval; if still weak after 3 data iterations, escalate to
   hyperparameters (reduce K, enable β=0.001, tighten max tokens).
```

This is a direct translation of the document pipeline's
`analysis-strategy.md` per-topic flow, with "topic" → "tool" and
"subject" → "argument schema." Grader iteration rarely helps because
the deterministic Jaccard grader doesn't have the LLM-judge failure
modes that dominate PDF iteration; data iteration usually does.

#### No published canonical dashboard

**None of Phoenix, Langfuse, or LangSmith ships a canonical
"tool-routing eval dashboard"** that visualizes per-tool confusion
matrices, argument-error breakdowns, or discriminative-power analysis.
They provide trace-level observability but not GRPO-iteration-specific
analysis. We need to build this as a post-eval script that reads from
the vLLora evaluation results API and produces the per-tool breakdown.
One new script — an extension of the existing `analysis-strategy.md`
pattern, not a replacement.

**Stage 9 — Deploy** is **deferred for v1.** The existing vLLora
gateway already serves vLLM-based inference for the production stack,
so deployment isn't blocking the trace finetune pipeline. We'll
revisit Stage 9 once the cloud has trained at least one fine-tuned
adapter from our handoff and there's an actual artifact to serve. See
the tooling survey for the deferred deployment landscape.

---

## Recap of the workflow in one paragraph

A trace bundle arrives at a workflow as a knowledge source. The pipeline
reads its tool schema to make a topic hierarchy and to derive the
per-record `tools` array (with consistency rules: union the tool name
set, exclude never-called tools, use the latest description for
conflicts). It walks each trace's span tree to extract **one record
per successful LLM decision point** (imitation records) plus **one
record per failed-then-corrected attempt** (SCoRe-style correction
records). It derives a programmatic grader from the tool schema. It
**extracts the demonstrator's system prompt as a structural baseline,
rewrites it for the student model** (drops dynamic context, drops
demo-only capability claims, fits the student's context budget), and
applies that one rewritten prompt identically across every record.
Before training starts, it probes the base model to check there are
enough learnable records under GRPO; if not, it blocks. If go, the
local pipeline **hands the artifacts to the cloud server (LangDB
Cloud)** — records, grader, rewritten system prompt, base model
choice, probe report — and the cloud runs **GRPO directly on the
tool-capable base model**. No BC warm-start, because the base already
has tool-calling from its instruction-tuning phase and BC would
re-teach things it already knows. On-policy sampling prevents
compounding error structurally. Once training completes, the local
pipeline drives evaluation against the cloud-served model using
unseen customer paraphrases, not a held-out slice. **Deployment is
deferred for v1** — the existing vLLora gateway already serves
inference. **The local pipeline owns Stages 1–6 and 8 (extract,
grader, prompt rewrite, probe, eval); the cloud owns Stage 7
(training); Stage 9 (deploy) is deferred.**

---

## Why we skip BC warm-start (and why that's defensible)

Training is **one stage**, not two. Our base model is already
tool-capable — and when that's true, skipping BC warm-start is a
principled design choice, not a v1 compromise.

### The base model already knows how to call tools

The small models we finetune (Qwen 2.5/3 series, Llama-3.2, Phi-4,
Mistral Small) all ship from their instruction-tuning phase with
**tool-calling baked in**. Specifically, they already know:

- JSON tool-call syntax and the special tool-call tokens
- How to parse a tool schema from a system prompt
- How to emit valid arguments given parameter type descriptions
- Multi-turn conversation with tool results in context
- General routing (pick a tool given a request)
- Refusal when no tool in the schema fits

That's exactly the stuff a BC warm-start from traces would teach. It's
already done. Adding SFT on top would re-teach things the base model
learned during its own instruction tuning — a training pass that costs
GPU time and gains very little.

### What BC warm-start would add on top of a tool-capable base

| What BC would give us | Already in the tool-capable base? |
|---|---|
| JSON / tool-call syntax | ✅ Yes |
| Schema parsing from the system prompt | ✅ Yes |
| Multi-turn with tool results | ✅ Yes |
| General "pick a tool given a request" routing | ✅ Yes |
| Familiarity with *this specific* tool schema | ❌ No — but the schema is in the system prompt at inference anyway |
| Head-start on the reward landscape for this domain | ❌ No — BC would put the policy in a region where GRPO rollouts start closer to correct |
| Faster GRPO convergence (fewer wasted rollouts) | ❌ No — BC would reduce GPU cost by giving GRPO a better starting point |

**The last three rows are real advantages — but they're efficiency
optimizations, not correctness requirements.** A tool-capable base plus
GRPO directly is *less efficient* than BC plus GRPO, but it is not
*wrong*. Correctness is preserved.

### Compounding error: why GRPO-alone avoids it

Earlier drafts framed BC warm-start as "the thing that gives GRPO
something to refine from" and claimed GRPO was needed to "fix BC's
compounding error." Both framings were misleading. The honest causal
chain:

- **BC would create compounding error** (Ross 2011, O(T²) in horizon T)
  — because BC trains on teacher-forced clean prefixes and the student
  ends up visiting states the demonstrator never showed.
- **GRPO's on-policy sampling avoids this** because it generates
  rollouts from the student's own policy, so the student trains on the
  states it actually reaches.
- **We avoid compounding error by not cloning in the first place.** If
  there's no BC stage, there's no cloned error to correct. GRPO's
  on-policy property is the structural reason, not a patch.

This matches how recent RL-from-base-model work actually operates:
- [DeepSeek-R1 (arXiv:2501.12948)](https://arxiv.org/abs/2501.12948)
  runs pure GRPO on a tool-capable base in the "R1-Zero" variant — no
  SFT stage. The paper specifically demonstrates that RL from the base
  model produces emergent reasoning without behavioral cloning.
- The Llama-3 RLHF pipeline treats SFT as optional when the base is
  already instruction-tuned.
- Tool-learning surveys consistently show that tool-capable base
  models can be refined directly with RL.

**Skipping BC is not a shortcut. It's the DeepSeek-R1-Zero pattern
applied to narrow tool routing.**

### What GRPO-alone accomplishes for our use case

The single GRPO stage does all of the work:

- **Teaches specialization to this tool schema.** The base model knows
  tool-calling in general; GRPO teaches it which tool to pick on THIS
  workflow's specific phrasings.
- **Fights compounding error structurally.** On-policy sampling, per
  above.
- **Generalizes to unseen paraphrases.** GRPO's sampling exposes the
  student to its own near-misses, producing gradient signal on
  generalization gaps that a pure BC pipeline would never see.
- **Fights mode averaging.** Partial-credit scoring lets the policy
  settle on one consistent mode when the demonstrator was bimodal,
  instead of averaging to a wrong third mode.
- **Climbs the partial-credit gradient.** "Find me a tablet" → both
  `{query:"tablet"}` and `{query:"tablet", category:"electronics"}`
  get partial credit, producing distinguishable rewards that GRPO can
  climb.

### What GRPO-alone doesn't fix

- **Causal confusion** if the grader has the same spurious feature
  correlation the student picks up. Unlikely for a schema-derived
  programmatic verifier, but possible.
- **Dataset too small for meaningful variance** — caught by the Stage
  6 pre-training probe.
- **Default-mode collapse on the dominant tool** — caught by the
  balance check in the pre-training probe.

### Is tool routing even a good fit for GRPO? (Honest caveat)

GRPO is designed for tasks where you can't write down the right
answer, only score it. Tool routing on a fixed schema has the opposite
property: the right answer is literally in the trace. **For pure
per-step training-set accuracy, plain SFT on the extracted records
would be a better algorithmic fit than GRPO.**

We use GRPO anyway, for three reasons specific to our case:

1. **Generalization to unseen paraphrases is the actual goal.** SFT
   memorizes training phrasings. GRPO's on-policy sampling exposes the
   model to its own near-misses on paraphrases, which is exactly what
   teaches it to handle phrasings it didn't see.
2. **Partial-credit scoring creates reward variance.** A programmatic
   grader with partial credit produces distinguishable rewards across
   K rollouts; pure SFT doesn't get to climb that gradient.
3. **The base model is already tool-capable.** Skipping SFT means we
   don't pay the cost of a training pass that would teach it things
   it already knows. We go directly to the stage that actually
   specializes it to our schema.

The honest framing: **GRPO on a tool-capable base is the right tool
because the base already knows what SFT would teach, and because
generalization to unseen paraphrases (not training-set memorization)
is what matters.**

### Known risks of GRPO training (each with a defense)

**General GRPO risks (same as PDF pipeline):**

- **Most prompts will be reward-flat** ("Find me a tablet" is trivial —
  K rollouts will all succeed). Defense: the Stage 6 learnable-fraction
  gate blocks training if less than 25% of records are learnable (tool
  routing has a lower threshold than PDF's 30% because smaller discrete
  output spaces produce more zero-variance groups).
- **Variance lives only in edge cases.** Defense: don't filter the
  trivial prompts; rely on early stopping, not selection.
- **Grader returning hard 0.0 kills variance instantly.** Defense:
  the 0.02 floor in the Jaccard grader (see the Grader section above).

**Tool-routing-specific risks (evidence-backed):**

- **"Paradox of perfection" — policy entropy collapses.** Small
  discrete output space + already-tool-capable base model → policy
  can peak quickly → within-group reward variance collapses →
  advantages vanish → training stops working.
  ([RC-GRPO, arXiv:2602.03025](https://arxiv.org/abs/2602.03025)).
  **Defense**: check `frac_reward_zero_std` at step 50. If >70%,
  reduce K to 4, enable `β=0.001` with ref model refresh every 100
  steps, or use RC-GRPO's reward-conditioned sampling.
- **Completion length blowup under β=0.**
  [Bespoke Labs](https://www.bespokelabs.ai/blog/improving-multi-turn-tool-use-with-reinforcement-learning)
  explicitly measured this: β=0 + tool calling can drift the policy
  to produce runaway JSON or gibberish after the tool call closes.
  **Defense**: watch `mean_length` growth. If it grows >30% without
  a corresponding reward increase, enable `β=0.001` with periodic
  ref model refresh. `mask_truncated_completions=True` (default in
  vLLora) prevents the worst case but doesn't stop the underlying
  drift.
- **Default-mode collapse on the dominant tool.** Base model has
  an existing bias toward one tool (e.g. always `product_search`),
  GRPO reinforces it, other tools never get gradient signal. Defense:
  Stage 6 probe's `no single tool > 70% trivial` gate + contrastive
  training data where similar-sounding inputs should pick a
  different tool. Also monitor the tool confusion matrix in Tier 2
  eval metrics.
- **Dataset is likely too small.** A typical real trace bundle is on
  the order of dozens to low hundreds of decisions. GRPO usually
  wants more. Defense: paraphrase synthesis to expand (not
  pre-filtering to shrink). **Rejection-Sampling Fine-Tuning (RFT)**
  — pre-filtering the GRPO record set with the same verifier the
  grader uses — is the most natural v2 addition.
- **Confusion between semantically similar tools.** A common failure
  mode is the model picking `search_one_way_flight` when the GT is
  `search_round_trip`. Defense: Tier 2 eval computes the tool
  confusion matrix; tool pairs with high confusion get contrastive
  training data.

---

## The honest goal statement

> Run **GRPO directly on a tool-capable small open model** (Qwen3.5-4B
> default, Qwen3-8B for complex routing, Qwen3.5-2B/0.8B for tighter
> VRAM budgets) using a partial-credit programmatic grader
> derived from the workflow's tool schema, to specialize the base
> model's general tool-calling ability to the specific schema and
> customer phrasings in the trace bundle. **No BC warm-start stage** —
> the base model already has tool-calling from its instruction-tuning
> phase, and GRPO's on-policy sampling avoids compounding error
> structurally. Success is measured on a held-out set of customer
> paraphrases the model has never seen, not on the training set. The
> pipeline is defensible for single-turn or shallow-horizon
> fixed-schema tool routing — the regime where BFCL "simple" accuracy
> is high and horizon effects don't hurt us. It is NOT appropriate for
> long-horizon agentic workloads where even frontier demonstrators sit
> at 35–70% on τ-bench. This is the
> [DeepSeek-R1-Zero](https://arxiv.org/abs/2501.12948) pattern
> (RL-from-base-model) applied to narrow tool routing.

---

## What changes between the document UI and the trace UI

Almost nothing. The same workflow shell, the same Knowledge node, the same
records page, the same grader page, the same training page. **A trace
bundle appears in the Knowledge node alongside any PDF**, with a different
icon and a different viewer. Clicking the trace bundle row opens a tab
that mounts
**[evilmartians/agent-prism](https://github.com/evilmartians/agent-prism)**'s
`<TraceViewer>` component (span tree + Gantt timeline + per-span details
+ sequence diagram replay). Summary stats on the source row show span
count, tool names, model name, and so on — read directly from
`trace_bundles` columns without parsing the blob. See "UI: Workflow →
Knowledge node → trace bundle viewer" above for the integration details.

There is no separate "traces" route, no global browse-and-pick UI, no
trace-specific workflow type. The trace is a knowledge source, the
workflow is a workflow, the pipeline is the pipeline.

---

## Two skills, shared surfaces

The trace pipeline ships as a **new, parallel skill** —
`finetune-skill-otel/` — that lives alongside the existing
`finetune-skill/` (PDF pipeline). Each skill owns its own pipeline
code. The two share everything above and below the pipeline layer
(UI, gateway, storage, training format, cloud handoff) but **no
pipeline code crosses the boundary.**

### Directory layout

```
~/Documents/GitHub/vllora/ui/
├── finetune-skill/                   ← EXISTING (PDF pipeline)
│   │                                   unchanged, backward-compat
│   ├── SKILL.md                        preserved, users keep current
│   ├── scripts/                        integration
│   │   ├── docling_extract.py
│   │   ├── generate_records.py
│   │   ├── finetune.py                 (orchestrator)
│   │   └── ...
│   ├── reference/
│   │   ├── grader-writing.md           (LLM judge rubric)
│   │   ├── training-metrics-guide.md
│   │   ├── analysis-strategy.md        (per-topic analysis)
│   │   ├── iteration-strategy.md
│   │   └── ... (all existing docs)
│   └── templates/
│
└── finetune-skill-otel/                ← NEW (OTel trace pipeline)
    │                                    parallel, independent
    ├── SKILL.md                         (copy + modify from finetune-skill/)
    ├── scripts/
    │   ├── openinference_to_semconv.py  (moved from finetune-skill/)
    │   ├── otel_extract.py              (moved from finetune-skill/)
    │   ├── otel_distill.py              (new — Stage 3 extraction)
    │   ├── trace_grader_builder.py      (new — Stage 4 Jaccard grader)
    │   ├── trace_hparams.py             (new — Stage 7 delta table)
    │   ├── trace_probe_gates.py         (new — Stage 6 4 gates)
    │   ├── analyze_eval_trace.py        (new — Stage 8 per-tool)
    │   └── finetune-otel.py             (new — orchestrator, parallel to finetune.py)
    └── reference/
        ├── trace-grader-reference.md    (moved from docs/)
        ├── otel-trace-ingestion.md      (moved from finetune-skill/)
        ├── trace-hyperparameters.md     (new, consolidated)
        ├── trace-analysis-strategy.md   (new, per-tool workflow)
        └── trace-iteration-strategy.md  (new, data-focused iteration)
```

### What's shared (doesn't live in either skill)

| Shared surface | Lives where | Change type |
|---|---|---|
| **UI** — workflow shell, Knowledge node, records/grader/training pages | `vllora/ui/src/` | **Additive only** — existing PDF components untouched, new trace components added alongside (dispatch at render time on `content_metadata.kind`) |
| **Gateway API** (`POST /knowledge-sources`, `POST /workflows`, etc.) | `vllora/gateway/` | **Additive only** — `kind="otel-trace"` is a new enum variant; existing `kind="document"` paths unchanged |
| **`knowledge_sources` table** | Gateway SQLite | **Additive migration** — new nullable `trace_bundle_id` FK column; existing rows get NULL automatically |
| **`trace_bundles` table** | Gateway SQLite | **New table** — zero impact on any PDF-related query |
| **Training JSONL format** | OpenAI chat-completion format | **Same for both skills** — no schema change |
| **Cloud handoff API** | LangDB Cloud server | **Extended** with new `source_kind` and `grader.type` variants; existing PDF payloads unchanged |
| **Base model choice** | Qwen3.5-4B default for both | **Same** — per-workflow configurable |
| **Deployment** (Stage 9) | vLLora gateway + vLLM | **Deferred v1, same for both when it ships** |

**Every shared-surface change is additive.** No existing PDF-related
code, column, or API path is modified. The trace skill adds new
variants, new components, new columns, new endpoints — it never
replaces or reshapes existing ones.

### What's NOT shared (lives in exactly one skill)

| Concept | Lives in | Why not shared |
|---|---|---|
| Stage 1: input inspection | Both (separately) | Docling vs span-tree walk — different code paths |
| Stage 2: topics | Both (separately) | LLM clustering vs tool-schema lifting |
| Stage 3: records | Both (separately) | LLM-generated Q/A vs extracted decisions |
| Stage 4: grader | Both (separately) | LLM judge vs Jaccard verifier |
| Stage 5: system prompt | Both (separately) | Built from topics vs lifted+rewritten |
| Stage 6: probe thresholds | Both (separately) | Different gates and thresholds (see Stage 6 section above) |
| Stage 7: hyperparameters | Both (separately) | Different deltas (see Stage 7 section above) |
| Stage 8: analysis | Both (separately) | Per-topic vs per-tool + confusion matrix |
| Reference docs (grader, analysis, iteration) | Both (separately) | Each skill has its own |
| Test samples | Both (separately) | PDF uses `~/test-samples/chess-tactics/`; trace uses `~/test-samples/otel-phoenix/` |

### Sub-agents: the trace skill is architecturally lighter

The PDF skill delegates to **four Claude Code sub-agents**
(`knowledge-extractor`, `relation-builder`, `nemo-data-generator`,
`training-monitor`). Each exists because its corresponding pipeline
stage is **LLM-heavy or long-running**, and sub-agent delegation
isolates that work from the main skill's context.

**The trace skill has zero required sub-agents for v1.** Its
equivalent stages are mechanical, not LLM-heavy:

| Sub-agent role | PDF skill needs it because... | Trace skill equivalent |
|---|---|---|
| Content extraction | Docling runs for minutes on a large PDF | ❌ Not needed — span-tree walk is fast deterministic Python |
| Part-to-topic matching | LLM-based N×M clustering of passages to topic leaves | ❌ Not needed — topics lifted directly from tool schema, no clustering |
| Training data generation | LLM-based Q/A synthesis via NeMo Data Designer | ❌ Not needed — records extracted from trace spans, no generation |
| Cloud job monitoring | Training runs for hours; needs persistent background process | 🟡 **Optional** — `trace-job-monitor` may be added if inline polling of Stages 6/7/8 proves insufficient. Not in v1 by default. |

**The trace skill's entire pipeline has exactly one LLM call**: the
Stage 5 system prompt rewrite, which is a one-shot at workflow-
creation time. One LLM call doesn't justify a sub-agent — it runs
inline in the main skill.

This difference in sub-agent count is **evidence of the architectural
split**, not a gap. The PDF skill has four sub-agents because its
workload needs them; the trace skill has zero because its workload
doesn't. Forcing the trace skill into the PDF skill's sub-agent
shape would add complexity without benefit.

**One open question**: is the PDF skill's `training-monitor` sub-
agent genuinely load-bearing (PDF skill would be broken without it),
or is it a nice-to-have that could be replaced with inline polling?
If it's essential for PDF, the trace skill should add a minimal
`trace-job-monitor` for consistency. If it's optional, the trace
skill can skip it. Defer this decision until the trace skill is
actually being implemented — whichever pattern the cloud handoff
ends up needing, adopt it for both skills.

### Duplication honestly acknowledged

Two skills means some code is copied. Concretely:

- **`SKILL.md`** — copy + modify (~one-time cost, ~200 lines)
- **Pipeline orchestrator** (`finetune-otel.py`) — copy of `finetune.py` with Stage 3–8 dispatch pointing at trace scripts (~one-time cost, ~300 lines)
- **Stage 1 workflow creation helpers** — nearly identical between skills (~50 LOC each)
- **Shared utilities** for POSTing to the cloud handoff API — should be factored into a small shared helper library both skills depend on (`shared-finetune-utils/`), but v1 can live with a local copy in each skill

**Ongoing maintenance burden is small** because the divergent logic
is divergent by design — bug fixes rarely apply to both. The
exception is shared utilities, which should be extracted into a
tiny common library when we notice we're fixing the same bug in two
places.

### Existing files that move from `finetune-skill/` to `finetune-skill-otel/`

Four files we've already added to `finetune-skill/` during this
design work actually belong in the new trace skill:

| Current location | New location | Reason |
|---|---|---|
| `finetune-skill/scripts/openinference_to_semconv.py` | `finetune-skill-otel/scripts/openinference_to_semconv.py` | Trace-specific format adapter |
| `finetune-skill/scripts/otel_extract.py` | `finetune-skill-otel/scripts/otel_extract.py` | Trace-specific Stage 2 extractor |
| `finetune-skill/reference/otel-trace-ingestion.md` | `finetune-skill-otel/reference/otel-trace-ingestion.md` | Trace-specific reference doc |
| `docs/workflow-skill-first-approach/trace-grader-reference.md` | `finetune-skill-otel/reference/trace-grader-reference.md` | Trace-specific grader ref |

These moves happen when `finetune-skill-otel/` is created. Until
then, they remain in their current locations — the moves are
forward-looking, not retroactive.

### The engineering contract

The rules that make the split safe, enforced by
[`trace-pipeline-isolation.md`](./trace-pipeline-isolation.md):

1. **Trace-skill work never modifies files inside `finetune-skill/`.**
   Any PR that touches `finetune-skill/` as part of trace work is
   rejected at review.
2. **Trace-skill work never modifies the existing `grader-writing.md`,
   `analysis-strategy.md`, `iteration-strategy.md`, or any existing
   reference doc in `finetune-skill/`.** The trace skill writes its
   own parallel reference docs.
3. **Shared-surface changes (UI, gateway, DB) must be additive only.**
   No existing column is dropped, renamed, or semantically changed.
   No existing UI component is refactored as part of trace work. No
   existing gateway endpoint signature is changed.
4. **Golden tests run on every PR.** Two independent golden-path
   tests — one for PDF, one for trace — verify the pipeline each
   skill drives produces expected output for its reference fixture.
   Any PR that breaks either test is blocked by CI.
5. **The existing `finetune-skill/` SKILL.md is frozen** until the
   trace skill has shipped and stabilized. After that, the two
   skills can evolve independently at their own pace.

See [`trace-pipeline-isolation.md`](./trace-pipeline-isolation.md)
for the full file-level contract (which files each skill owns,
which are shared, which are forbidden).

---

## The one open conceptual question (resolved)

**Earlier drafts left this open:** "A workflow can in principle have
both trace sources and document sources. What is such a workflow
training?"

**Resolved by the two-skills architecture:**

> **A workflow uses exactly one skill.** If you want to train on both
> PDFs and traces, you run two separate workflows — one PDF-skill
> workflow on your documents, one trace-skill workflow on your traces
> — and combine at the **inference layer**, not the training layer.
> Serve the two fine-tuned LoRA adapters as independent modules that
> the deployment endpoint composes.

This is actually how production tool-using agents with RAG knowledge
work: the tool-router model is one specialized adapter (from the
trace skill), and the knowledge-QA model is another specialized
adapter (from the PDF skill). Inference-time composition, not
training-time mixing.

**Why this is better than the earlier "documents become
inference-time RAG context" answer:** that framing implied one
trained model with two roles, which (a) required the two skills to
cooperate during training (complicated), (b) gave up the independent
iteration loops each skill needs, and (c) didn't match how real
production agents compose capabilities. Two specialized adapters +
composition at inference is the cleaner architecture and matches
industry practice.

This is no longer an open question — the two-skills split makes the
answer trivial: **workflows don't mix kinds. Models can be composed
after training.**

---

## Research references

Every load-bearing claim in this doc is backed by one of these sources.
Citations are inline in the relevant sections; this is the consolidated
list.

### Industry tooling — how existing platforms extract training records from traces

- **LangSmith Fine-Tuning Cookbook** — the closest thing to an industry
  standard for "trace → fine-tuning JSONL." Rule: one LLM run → one
  training example, prior message history as context. Our v1 rule is a
  strict superset of this.
  [github.com/langchain-ai/langsmith-cookbook/fine-tuning-examples/export-to-openai](https://github.com/langchain-ai/langsmith-cookbook/blob/main/fine-tuning-examples/export-to-openai/fine-tuning-on-chat-runs.ipynb)

- **Langfuse — Export for Fine-Tuning** — one JSONL row per Generation
  observation, optional score-filtering. Users manually reshape for
  multi-step flows.
  [langfuse.com/docs/api-and-data-platform/features/fine-tuning](https://langfuse.com/docs/api-and-data-platform/features/fine-tuning)

- **Langfuse — Tracing Data Model** — Sessions → Traces → Observations
  hierarchy; confirms nested span trees are first-class.
  [langfuse.com/docs/tracing-data-model](https://langfuse.com/docs/tracing-data-model)

- **Langfuse — Datasets and Experiments** — how Langfuse separates the
  raw-trace store (`traces` + `observations` tables) from the curated-
  dataset store (`datasets` + `dataset_items`), with `dataset_items`
  carrying a `sourceTraceId` / `sourceObservationId` soft FK. This is
  the precedent for our `knowledge_sources` → `trace_bundles` FK split
  (see "Storage" subsection under "How traces enter the system").
  [langfuse.com/docs/evaluation/experiments/datasets](https://langfuse.com/docs/evaluation/experiments/datasets)

- **Arize Phoenix — Extract Data from Spans** — `span_kind`-based
  filtering, dataframe export, no built-in trace→JSONL transformer
  (users reshape themselves).
  [arize.com/docs/phoenix/tracing/how-to-tracing/importing-and-exporting-traces/extract-data-from-spans](https://arize.com/docs/phoenix/tracing/how-to-tracing/importing-and-exporting-traces/extract-data-from-spans)

- **Phoenix `trace_dataset.py` source** — canonical reference for how
  Phoenix represents spans as dataframe rows.
  [github.com/Arize-ai/phoenix/blob/main/src/phoenix/trace/trace_dataset.py](https://github.com/Arize-ai/phoenix/blob/main/src/phoenix/trace/trace_dataset.py)

- **OpenAI Cookbook — Fine-tuning for Function Calling** — the format
  we match for Pattern D (parallel tool calls): one assistant message
  with `tool_calls: [K]`, followed by K tool messages with matching
  `tool_call_id`s.
  [cookbook.openai.com/examples/fine_tuning_for_function_calling](https://cookbook.openai.com/examples/fine_tuning_for_function_calling)

- **OpenAI Supervised Fine-Tuning Guide** — official format reference
  for chat-completion fine-tuning JSONL.
  [platform.openai.com/docs/guides/supervised-fine-tuning](https://platform.openai.com/docs/guides/supervised-fine-tuning)

### Research — extraction algorithm mechanics

These ground the "Span trees and turn boundaries" subsection. Verified
against actual platform source code and specs to correct earlier-draft
mechanical claims (tree walks, named "user-message diffing" technique,
"one JSONL line per decision" framing) that turned out to be wrong.

- **LangSmith fine-tuning cookbook source** — the canonical reference
  for what production trace-to-JSONL extraction actually does. Filters
  by `run_type="llm"` first, then uses `parent_run_id` for sibling
  lookups on demand. Confirms the "flat query + parent-pointer joins"
  pattern instead of recursive tree traversal.
  [github.com/langchain-ai/langsmith-cookbook/blob/main/fine-tuning-examples/export-to-openai/fine-tuning-on-chat-runs.ipynb](https://github.com/langchain-ai/langsmith-cookbook/blob/main/fine-tuning-examples/export-to-openai/fine-tuning-on-chat-runs.ipynb)

- **Langfuse Sessions docs** — confirms that turn boundaries are
  manual: developers create one trace per conversation turn and tag
  them with the same `sessionId`. There is no automatic turn detection.
  This is the cleanest mapping when present and the one any extractor
  should prefer.
  [langfuse.com/docs/observability/features/sessions](https://langfuse.com/docs/observability/features/sessions)

- **Langfuse Export and Fine-Tuning docs** — flat batch export
  (CSV/JSON/JSONL) with `parentObservationId` as a column for the
  consumer to reconstruct hierarchy. Same pattern as LangSmith.
  [langfuse.com/docs/export-and-fine-tuning](https://langfuse.com/docs/export-and-fine-tuning)

- **OpenInference semantic conventions** — defines `tool_call.id` and
  `message.tool_call_id` for OpenAI-style providers. Source for the
  field-name normalization between OpenAI and Anthropic.
  [github.com/Arize-ai/openinference/blob/main/spec/semantic_conventions.md](https://github.com/Arize-ai/openinference/blob/main/spec/semantic_conventions.md)

- **OpenInference LLM spans spec** — schema for input/output messages,
  tool calls, and tool results in OpenInference traces. Reference for
  what attributes are guaranteed vs. provider-specific.
  [github.com/Arize-ai/openinference/blob/main/spec/llm_spans.md](https://github.com/Arize-ai/openinference/blob/main/spec/llm_spans.md)

- **OTel GenAI agent spans spec** — confirms there is **no per-turn
  span type**. Defines only `create_agent` and `invoke_agent` with
  `chat` / `execute_tool` as children. Source for the correction
  that turn boundaries cannot be read directly from a semconv
  attribute and must be reconstructed from session id + parent span
  conventions + time-gap heuristics.
  [opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/)

- **OTel GenAI attribute registry** — definitive list of attributes
  including `gen_ai.tool.call.id`, `gen_ai.conversation.id`,
  `gen_ai.input.messages`, `gen_ai.output.messages`. The abstraction
  layer over provider-specific naming.
  [opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/)

- **Anthropic tool use implementation docs** — confirms Anthropic's
  tool-result message uses `tool_use_id`, not `tool_call_id`. Reason
  the extractor must normalize provider-specific field names.
  [platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)

- **Together AI multi-turn fine-tuning blog** — independent
  confirmation that the JSONL format is one full conversation per
  line, not one decision point per line. "Every example in the JSONL
  file should be a list of messages."
  [together.ai/blog/fine-tuning-llms-for-multi-turn-conversations-a-technical-deep-dive](https://www.together.ai/blog/fine-tuning-llms-for-multi-turn-conversations-a-technical-deep-dive)

- **Planner fine-tuning on synthetic trajectories
  (krasserm.github.io)** — canonical reference for the "explode a
  trajectory into N training examples, one per step, each with the
  full history-up-to-that-step as context" pattern. Direct source for
  how multi-step ReAct trajectories are rendered as multiple JSONL
  lines.
  [krasserm.github.io/2024/05/31/planner-fine-tuning](http://krasserm.github.io/2024/05/31/planner-fine-tuning/)

- **Instrument LangGraph ReAct agent with OTel (Google Cloud)** —
  reference implementation showing how a real LangGraph agent emits
  spans. Confirms that wrapping `invoke agent` spans are created
  manually by the developer per invocation, not automatically per
  turn.
  [docs.cloud.google.com/stackdriver/docs/instrumentation/ai-agent-langgraph](https://docs.cloud.google.com/stackdriver/docs/instrumentation/ai-agent-langgraph)

- **ASTRA paper (arXiv:2601.21558)** — documents at the algorithmic
  level the failure mode of collapsing multi-step trajectories into
  short-horizon training data: "optimizing precision-only drives
  turns to drop sharply by discouraging tool calls, pushing the
  policy toward overly conservative, short-horizon behavior that is
  brittle in multi-step settings." Confirms the "naive last-successful
  rule is wrong" claim with cited evidence.
  [arxiv.org/html/2601.21558v2](https://arxiv.org/html/2601.21558v2)

### Research — system prompt and tool schema extraction (Topics + System prompt sections)

These ground the "Topics" and "System prompt" subsections under "What
traces contribute to a workflow." Verified against actual fine-tuning
guides, papers, and platform documentation. Earlier drafts of this doc
asserted "lift the system prompt verbatim from the trace" — these
sources show that's what tools do by default but **not** what the
literature recommends. The hybrid extract-and-rewrite approach now in
the doc is grounded in these references.

- **OpenAI Fine-Tuning Best Practices** — primary citation for the
  consistency rule: "Make sure all of your training examples are in
  the same format expected for inference." Direct contradiction of
  earlier verbatim-lift framing.
  [platform.openai.com/docs/guides/fine-tuning-best-practices](https://platform.openai.com/docs/guides/fine-tuning-best-practices)

- **OpenAI community thread on system prompts in fine-tuning** —
  practitioner-level explanation of why varying system prompts breaks
  fine-tuning: "You are not 'baking in' the system prompt — you are
  training a subset of the model for when your system prompt
  appears."
  [community.openai.com/t/system-prompt-in-dataset-fine-tuning-or-assistants-api/1053159](https://community.openai.com/t/system-prompt-in-dataset-fine-tuning-or-assistants-api/1053159)

- **Microsoft Azure Q&A on system prompt changes during fine-tuning** —
  documents the "loss of anchoring effect" failure mode (FM-2) when
  system prompts vary across training records. Source for the warning
  against verbatim lift of dynamic-context prompts.
  [learn.microsoft.com/en-gb/answers/questions/2201586/will-changing-system-prompts-in-fine-tuning-mess-t](https://learn.microsoft.com/en-gb/answers/questions/2201586/will-changing-system-prompts-in-fine-tuning-mess-t)

- **OpenAI Fine-Tuning for Function Calling cookbook** — the
  practical demonstration of consistent system prompt + tools array
  across every training example. The `modified_function_list` pattern
  used identically across all records is the canonical reference for
  our "per-record `tools` array consistency" rule.
  [developers.openai.com/cookbook/examples/fine_tuning_for_function_calling](https://developers.openai.com/cookbook/examples/fine_tuning_for_function_calling)

- **Orca (arXiv:2306.02707)** — uses 15 predefined system instruction
  templates curated separately from the demonstrator (GPT-4). Direct
  precedent for "rewrite, don't lift" — the demonstrator's own system
  prompts are not used in training.
  [arxiv.org/abs/2306.02707](https://arxiv.org/abs/2306.02707)

- **ToolLLM / ToolBench (arXiv:2307.16789)** — concatenates tool
  documentation into prompts as text rather than using a structured
  system message. Different training examples expose different tool
  subsets without global intersection. Source for the "union the tool
  name set across the bundle" rule and the "different records can
  expose different subsets" pattern.
  [arxiv.org/html/2307.16789v2](https://arxiv.org/html/2307.16789v2)
  / [github.com/OpenBMB/ToolBench](https://github.com/OpenBMB/ToolBench)

- **Gorilla (arXiv:2305.15334)** — Retriever-Aware Training (RAT)
  injects API documentation from a retrieval store at training time.
  Documented in the doc as the v2+ alternative to static schema
  reconciliation, but only applicable if we ship a retrieval
  component at inference. Source for FM-7.
  [ar5iv.labs.arxiv.org/html/2305.15334](https://ar5iv.labs.arxiv.org/html/2305.15334)
  / [github.com/ShishirPatil/gorilla](https://github.com/ShishirPatil/gorilla)

- **AWS Bedrock — Best practices for fine-tuning Anthropic Claude** —
  documents Claude's structurally distinct fine-tuning format with a
  top-level `"system"` field. Source for the Anthropic format note in
  the system prompt section.
  [aws.amazon.com/blogs/machine-learning/best-practices-and-lessons-for-fine-tuning-anthropics-claude-3-haiku-on-amazon-bedrock](https://aws.amazon.com/blogs/machine-learning/best-practices-and-lessons-for-fine-tuning-anthropics-claude-3-haiku-on-amazon-bedrock/)

- **krasserm — Planner fine-tuning on synthetic agent trajectories** —
  the most extreme form of "don't lift the demonstrator's prompt":
  omit the tool list from the prompt entirely and let the model learn
  implicitly. Cited in the system prompt strategy comparison and as
  the source for FM-6 (implicit learning breaks for heterogeneous
  bundles).
  [krasserm.github.io/2024/05/31/planner-fine-tuning](http://krasserm.github.io/2024/05/31/planner-fine-tuning/)

- **Unsupervised Discovery of Failure Taxonomies from Deployment Logs
  (arXiv:2506.06570)** — closest related work to "extracting agent
  capability taxonomies from traces" for fine-tuning. It addresses
  the inverse problem (failure categories from logs); cited as
  evidence that the trace-bundle-to-capability-hierarchy problem is
  genuinely unsolved in the literature.
  [arxiv.org/html/2506.06570](https://arxiv.org/html/2506.06570)

### Research — how papers handle the patterns platforms don't solve

- **SCoRe: From Correction to Mastery (arXiv:2509.14257)** — the
  foundation for our promotion of error-recovery records from
  "future" to v1. Shows that `(good_prefix → corrected_next_action)`
  records are the single highest-value training signal in trace data.
  [arxiv.org/abs/2509.14257](https://arxiv.org/abs/2509.14257)

- **Structured Agent Distillation (arXiv:2505.13820)** — span-segmented
  losses for ReAct trajectories. Tags spans as `[REASON]` vs `[ACT]`
  and down-weights reasoning spans. Directly relevant to Pattern E
  (reflection) and why our flat per-decision rule is a heuristic, not
  the state of the art.
  [arxiv.org/abs/2505.13820](https://arxiv.org/abs/2505.13820)

- **MAGDi — Multi-Agent Interaction Graph Distillation (arXiv:2402.01620)** —
  motivation for preserving `parent_span_id` on every record even when
  we flatten for SFT. Flat JSONL loses delegation structure; graph-
  aware distillation recovers it. Pattern F and J.
  [arxiv.org/html/2402.01620](https://arxiv.org/html/2402.01620)

- **ARIA — Self-Improving Agents with HITL (arXiv:2507.17131)** — how
  to treat human-in-the-loop approvals as labels (structured knowledge
  updates) rather than as decision points. Pattern H.
  [arxiv.org/abs/2507.17131](https://arxiv.org/abs/2507.17131)

- **Agent Fine-tuning through Distillation for Microdomains (arXiv:2510.00482)** —
  general reference for behavioral-cloning-from-agent-traces as a
  legitimate technique.
  [arxiv.org/html/2510.00482v1](https://arxiv.org/html/2510.00482v1)

### Research — behavioral cloning foundations and failure modes

These are the foundational references for the "What we're assuming
about the demonstrator" section. Every claim about BC's limitations,
compounding error, and standard mitigations is grounded in one of
these sources.

- **DAgger — Ross, Gordon, Bagnell 2011** — The foundational result:
  behavioral cloning has **O(T²) worst-case compounding error** in
  horizon T, not O(T). The single most-cited caveat in IL literature
  and the reason BC alone is insufficient for long-horizon agentic
  tasks. DAgger itself is the canonical fix: interactively relabel
  states the student visits. Our doc cites this to contradict the
  earlier-draft "95% demonstrator → 95% student" claim.
  [cs.cmu.edu/~sross1/publications/Ross-AIStats11-NoRegret.pdf](https://www.cs.cmu.edu/~sross1/publications/Ross-AIStats11-NoRegret.pdf)

- **Is Behavior Cloning All You Need? (arXiv:2407.15007)** — 2024
  revisit of the horizon dependence question. Shows BC can be
  competitive under log-loss + realizability, but the pessimistic
  O(T²) bound remains the worst case. Used to justify the "shallow-
  horizon defensible, long-horizon not" framing in the defensibility
  table.
  [arxiv.org/pdf/2407.15007](https://arxiv.org/pdf/2407.15007)

- **SFT as Inverse RL (arXiv:2403.12017)** — establishes that SFT on
  curated demonstrations is technically equivalent to BC with
  forward-KL distribution matching. Source for the "BC = SFT on
  demonstrations" equivalence stated explicitly in the doc.
  [arxiv.org/html/2403.12017v1](https://arxiv.org/html/2403.12017v1)

- **SFT on Curated Data is RL (arXiv:2507.12856)** — companion to the
  above, framing curated-data SFT as an RL objective in disguise.
  Supports the same BC = SFT equivalence.
  [arxiv.org/html/2507.12856](https://arxiv.org/html/2507.12856)

- **Causal Confusion in Imitation Learning (de Haan et al. 2019)** —
  BC latches onto spurious features correlated with expert actions.
  Source for failure mode 6 in the demonstrator section.
  [arxiv.org/abs/1905.11979](https://arxiv.org/abs/1905.11979)

- **STaR — Self-Taught Reasoner (arXiv:2203.14465)** — self-training
  via sampling-and-agreement filtering. The correct citation for what
  the earlier draft called "self-consistency filtering" — the Wang
  2022 self-consistency paper is about *inference-time*
  marginalization, not training-data filtering, and was the wrong
  reference.
  [arxiv.org/abs/2203.14465](https://arxiv.org/abs/2203.14465)

- **LLMs Can Self-Improve (Huang et al. 2022, arXiv:2210.11610)** —
  Same space as STaR: re-sample a demonstrator, filter by agreement,
  train on the filtered set. Directly applicable as a v2 mitigation
  for our pipeline.
  [arxiv.org/pdf/2210.11610](https://arxiv.org/pdf/2210.11610)

- **Constitutional AI / RLAIF (Bai et al. 2022, arXiv:2212.08073)** —
  the correct citation for "multi-model voting as a pseudo-label
  source." Doc's "multi-demonstrator voting" mitigation points here.
  [arxiv.org/abs/2212.08073](https://arxiv.org/abs/2212.08073)

- **Expert Iteration (Anthony, Tian, Barber 2017, arXiv:1705.08439)**
  — the AlphaZero-style loop; alternates BC on the current policy's
  best rollouts with re-sampling. Bridges BC and RL; listed as a
  later-roadmap mitigation.
  [arxiv.org/abs/1705.08439](https://arxiv.org/abs/1705.08439)

- **DeepSeek-R1 (arXiv:2501.12948)** — the direct precedent for our
  decision to skip BC warm-start. The "R1-Zero" variant runs pure
  GRPO on a capable base model without any SFT stage, and the paper
  shows that RL-from-base-model produces emergent reasoning behavior.
  We apply the same pattern to narrow tool routing: GRPO directly on
  a tool-capable small model, no BC warm-start required, because the
  base model already has the fundamental skill (tool-calling in their
  case; reasoning in R1-Zero's case). This is the primary citation
  for the "GRPO-only on tool-capable base" architectural choice.
  [arxiv.org/abs/2501.12948](https://arxiv.org/abs/2501.12948)

### Research — clarifying-question and failure-only training (why G and I are deferred)

These ground the deferral of Patterns G and I in the "Which records to
emit" section. Earlier drafts attempted to promote both to v1 with
naive treatments; these papers showed why naive promotion is wrong.

- **Modeling Future Conversation Turns to Teach LLMs to Ask
  Clarifying Questions (ICLR 2025, arXiv:2410.13788)** — primary
  evidence that Pattern G cannot be promoted via naive SFT. Shows that
  SFT on `(user_msg → clarifying_question)` is the **baseline that
  preference-rollout methods beat by 5% F1 / 3% accuracy**, because
  the correct label depends on whether the clarification leads to a
  better tailored response in future turns. SFT on isolated examples
  trains syntax, not judgment. Honest v1 path requires extracting the
  full 4-span arc (request → clarification → response → resolution),
  which we don't yet detect.
  [arxiv.org/abs/2410.13788](https://arxiv.org/abs/2410.13788)

- **AwN — Learning to Ask: When LLMs Meet Unclear Instruction
  (arXiv:2409.00557)** — confirms that Toolformer, Gorilla, and
  ToolLLM all assume unambiguous instructions. Treating clarification
  as a first-class behavior requires a purpose-built dataset
  (NoisyToolBench), not extracted OTel traces.
  [arxiv.org/html/2409.00557v1](https://arxiv.org/html/2409.00557v1)

- **Why Do Multi-Agent LLM Systems Fail? (MAST taxonomy,
  arXiv:2503.13657)** — documents the over-clarification failure mode
  ("Communicative Dehallucination") where agents loop requesting
  details instead of acting. Reason to be careful about training on
  clarifying-question records without future-turn grounding.
  [arxiv.org/html/2503.13657v3](https://arxiv.org/html/2503.13657v3)

- **Learning From Failure: Integrating Negative Examples when
  Fine-tuning LLMs as Agents (NAT, arXiv:2402.11651)** — primary
  evidence that Pattern I cannot be promoted via standalone failure
  extraction. NAT trains on failure trajectories, but **only when
  paired with successful trajectories of the same task** via
  Negative-Aware Training prefixes. Pure failure-only training
  produces "weak contrast" that causes overfitting. The correct v2
  path for failure traces is NAT-style task pairing, not the
  SCoRe-style correction records earlier drafts incorrectly proposed.
  [arxiv.org/html/2402.11651v1](https://arxiv.org/html/2402.11651v1)

- **Co-Evolving Agents: Learning from Failures as Hard Negatives
  (arXiv:2511.22254)** — same point as NAT: failure trajectories must
  be paired with near-success "hard negatives" for contrastive
  signal. Standalone failure extraction does not work.
  [arxiv.org/abs/2511.22254](https://arxiv.org/abs/2511.22254)

- **SCoRe (arXiv:2509.14257) — clarification on what it actually
  does.** Earlier drafts of this doc claimed SCoRe could handle
  failure-only traces via "correction records from the failed prefix."
  That was wrong. SCoRe classifies failure-only traces as
  "Hard-to-Teach" and uses them **only in the RL phase**, where the
  reward function provides the missing positive signal. There is no
  SFT on raw failure-only trajectories in SCoRe's method. The
  in-doc SCoRe citation now correctly applies only to Pattern B
  (turns that eventually recover), not to Pattern I.
  [arxiv.org/abs/2509.14257](https://arxiv.org/abs/2509.14257)

### Research — instruction paraphrasing and synthetic data augmentation

These ground the "Extraction vs. synthesis" subsection. Used to
correct earlier-draft claims about paraphrase-based data augmentation
and to flag known failure modes if we ever add Self-Instruct-style
expansion to small workflows.

- **Self-Instruct (Wang et al. 2022, arXiv:2212.10560)** — the
  foundational paper on bootstrapping instruction data with an LLM.
  Establishes the technique and the failure modes (mode collapse, low
  diversity, fingerprinting). The correct citation for what earlier
  drafts called "paraphrase expansion."
  [arxiv.org/abs/2212.10560](https://arxiv.org/abs/2212.10560)

- **GPT4Tools (arXiv:2305.18752)** — applies Self-Instruct
  specifically to tool-use finetuning. **Critical finding for our
  pipeline:** negative-sample augmentation (wrong tools, wrong
  arguments, out-of-domain requests) was the key factor — paraphrase
  augmentation alone was insufficient. If we ever add paraphrase
  expansion for small bundles, we have to pair positives with
  generated negatives.
  [huggingface.co/papers/2305.18752](https://huggingface.co/papers/2305.18752)

- **Fine-Tuning Can Distort Pretrained Features (arXiv:2202.10054)**
  — bound on how much narrow paraphrase-augmented data you can train
  on before generalization degrades. Don't 10× a tiny dataset and
  expect to win.
  [arxiv.org/abs/2202.10054](https://arxiv.org/abs/2202.10054)

- **A Closer Look at the Limitations of Instruction Tuning (arXiv:2402.05119)**
  — LoRA on paraphrased data mostly teaches response-initiation and
  style tokens, not new capability. Relevant if we LoRA-finetune with
  augmented data.
  [arxiv.org/html/2402.05119v5](https://arxiv.org/html/2402.05119v5)

### Research — tool-routing-specific GRPO (grader, hyperparameters, eval)

These are the primary sources for the Grader section (Jaccard
formula), the Stage 7 hyperparameter deltas, and the Stage 8 Tier 2/3
eval metrics. Earlier drafts inferred these from the PDF pipeline;
these papers replace inference with measured evidence specifically
for tool-routing GRPO.

- **ToolRL: Reward is All Tool Learning Needs (arXiv:2504.13958)** —
  the first systematic study of reward design for tool-use GRPO
  training. Fine-grained Jaccard decomposition (name/param-key/
  param-value) beats coarse exact-match by +1.58 points on Qwen2.5-3B
  in Table 7. **Primary source for our grader scoring formula.** Also
  the source for `temperature=1.0` (vs PDF default 0.9) and `K=4`
  (vs PDF default 8).
  [arxiv.org/abs/2504.13958](https://arxiv.org/abs/2504.13958)

- **Iterative Reward Calibration for Multi-Turn Tool-Calling Agents
  (arXiv:2604.02869)** — "IRC." Source for the Tier 3 eval metric
  (point-biserial correlation discriminative power analysis) and for
  the tool-routing learning rate range (2e-6 to 5e-7). Also uses
  `K=4` rollouts. Confirms the weak-tool-per-group analysis pattern.
  [arxiv.org/abs/2604.02869](https://arxiv.org/abs/2604.02869)

- **RC-GRPO: Reward-Conditioned GRPO for Multi-Turn Tool Calling
  (arXiv:2602.03025)** — identifies the "paradox of perfection"
  failure mode: after strong initialization, policy peaks quickly,
  within-group reward variance collapses, advantages vanish. Source
  for the `frac_reward_zero_std` step-50 check and for the
  reward-conditioned sampling mitigation (an advanced v2+ option).
  [arxiv.org/abs/2602.03025](https://arxiv.org/abs/2602.03025)

- **Bespoke Labs — Improving Multi-Turn Tool Use with RL** — the
  blog post that explicitly measured completion length blowup under
  `β=0` + tool calling, and documented the stable config (`β=0.001`
  with periodic reference model refresh every 100 steps). **Primary
  source** for the "escalate to β=0.001 if length blowup is
  observed" guidance in Stage 7.
  [bespokelabs.ai/blog/improving-multi-turn-tool-use-with-reinforcement-learning](https://www.bespokelabs.ai/blog/improving-multi-turn-tool-use-with-reinforcement-learning)

- **Fission-GRPO: Robust Tool Use via Error Recovery
  (arXiv:2601.15625)** — error-recovery training methodology
  referenced in the Pattern B treatment. Not directly cited in the
  v1 rule because Pattern B uses the simpler SCoRe-style extraction,
  but worth knowing about for v2 refinements.
  [arxiv.org/abs/2601.15625](https://arxiv.org/abs/2601.15625)

- **OTC: Optimal Tool Calls via RL (arXiv:2504.14870)** — strategies
  for choosing when and how many tools to call; tangential to v1
  (which assumes one tool call per decision point) but relevant for
  future Pattern D (parallel) refinements.
  [arxiv.org/abs/2504.14870](https://arxiv.org/abs/2504.14870)

- **Berkeley Function Calling Leaderboard V4 (BFCL)** — source for
  the edge-case rules in the Grader section (case-insensitive enum
  match, int/float type leniency, no float epsilon tolerance). Also
  the source for the "all-or-nothing parallel matching is wrong for
  training" finding: BFCL uses it for benchmarking, we use
  coverage-penalized averages for training because BFCL's rule
  produces excessive zero-variance batches.
  [gorilla.cs.berkeley.edu/leaderboard.html](https://gorilla.cs.berkeley.edu/leaderboard.html)

- **BFCL ICML 2025 paper** — peer-reviewed version of the BFCL
  methodology.
  [proceedings.mlr.press/v267/patil25a.html](https://proceedings.mlr.press/v267/patil25a.html)

### Research — pre-training data hygiene (platform precedent)

These are the platform-side practices for filtering trace records
before training, which the v1 pipeline doesn't yet implement.

- **LangSmith Lilac curation notebook** — the canonical pipeline for
  near-duplicate detection and PII scrubbing on trace data before
  fine-tuning. Worth porting the same hygiene checks into our
  extractor.
  [github.com/langchain-ai/langsmith-cookbook/blob/main/fine-tuning-examples/lilac/lilac.ipynb](https://github.com/langchain-ai/langsmith-cookbook/blob/main/fine-tuning-examples/lilac/lilac.ipynb)

- **OpenAI Stored Completions → Distillation flow** — the cleanest
  example of "capture → filter by tags → reformat → train" with no
  LLM in the middle. Confirmation that pure extraction is the
  industry-standard flow.
  [openai.com/index/api-model-distillation](https://openai.com/index/api-model-distillation/)
  / [Azure Stored Completions docs](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/stored-completions)

- **τ-bench multi-trial reliability (pass^k)** — single-pass accuracy
  under-reports real agent failure rates. The held-out-task evaluation
  methodology that the doc now recommends instead of paraphrased eval
  strings.
  [arxiv.org/abs/2406.12045](https://arxiv.org/abs/2406.12045)
  / [github.com/sierra-research/tau-bench](https://github.com/sierra-research/tau-bench)

### Research — benchmarks for frontier tool-use accuracy

Referenced to contradict the earlier-draft "≥95% demonstrator
accuracy" claim and narrow the assumption's applicability.

- **Berkeley Function Calling Leaderboard (BFCL V4)** — definitive
  benchmark for tool/function-calling accuracy. As of April 2026: best
  frontier models sit at ~70% overall (Claude Opus 4.1 at 70.4%,
  Sonnet 4 at 70.3%, GPT-5 at 59.2%). No model is at 95% overall; the
  ≥95% number is defensible only on BFCL's narrow "simple" category.
  [gorilla.cs.berkeley.edu/leaderboard.html](https://gorilla.cs.berkeley.edu/leaderboard.html)

- **τ-bench (arXiv:2406.12045)** — multi-turn agentic tool-use
  benchmark. GPT-4o at 65.2% retail / 35.2% airline; Claude Sonnet
  4.5 at 86.2% / 70.0%. Used to demonstrate that long-horizon
  frontier accuracy is far below 95%, supporting the "shallow-horizon
  only" narrowing of the BC assumption.
  [arxiv.org/pdf/2406.12045](https://arxiv.org/pdf/2406.12045)

- **τ-bench GitHub** — source code and additional results.
  [github.com/sierra-research/tau-bench](https://github.com/sierra-research/tau-bench)

### Honest assessment (grounded in the above)

The research agent who compiled the sources above rendered the verdict:

> **"One record per successful LLM decision point inside a turn" is a
> reasonable heuristic that matches what LangSmith and Langfuse tooling
> actually produce in practice. It is not the research state of the
> art. Known failure modes: (1) earlier drafts discarded SCoRe-style
> error-recovery signal, (2) "inside a turn" is underspecified at HITL
> / sub-agent / clarification edges, (3) flattens trajectory structure
> that span-segmented losses exploit. Industry standard: there isn't
> one — Langfuse/Phoenix/Weave ship raw span exporters and punt the
> reshape decision to users.**

This doc now addresses (1) explicitly (Capability D promoted, SCoRe
citation inline), addresses (2) with the external-input definition of a
turn boundary, and acknowledges (3) as a deferred improvement tracked
against Patterns E and F.

---

## Out of scope for this doc

- The cloud and local OTel ingest endpoints (sources ① and ②) are a
  separate product roadmap. This doc only assumes a trace bundle can
  reach the workflow somehow.
- Concrete file formats, table schemas, API contracts, code paths,
  filter rules, deletion lists, and per-stage filter pipelines are
  intentionally absent — the previous draft of this doc included them
  and they drowned out the concept. They live in the implementation
  notes / scenario folders, not here.
- Step 6 onward (eval, training, deployment) is unchanged from the
  document pipeline and is not re-described here.

The concept above is the part that has to be right before any
implementation choices make sense.
