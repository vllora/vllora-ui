# OTel Traces as Finetune Input — Concept

> **Status:** Concept doc (2026-04-08). Implementation detail intentionally
> excluded — see the run/test scenarios for the concrete plumbing.
> Backed by inspection of a real Phoenix shopping-agent fixture
> (`agents-toolcalling-tracesv2.parquet`, 609 spans, 6 tools, GPT-4o).
>
> **Companion doc**: [`otel-extractor-tooling-survey.md`](./otel-extractor-tooling-survey.md)
> records what existing libraries (Phoenix, LangSmith, Langfuse,
> LiteLLM, OpenAI Cookbook) can and cannot do for the extraction
> step, and what we have to build ourselves. Read it before writing
> any extractor code.

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
fast open model (e.g. Qwen 2B/4B) — without losing the ability to pick the
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
        │ invent topics                    │ read topics from schema
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

Topics for traces are **the agent's tool capabilities, not extracted
concepts.** Each tool the agent had access to is one skill the model
needs to learn. The trace already lists them — there's nothing to
discover. **Note this is our invention**: none of LangSmith, Langfuse,
or Phoenix produces a topic hierarchy on fine-tuning export. Their
exports are flat lists of records. The "topic hierarchy from a trace
bundle" concept is a UI affordance we add on top of the trace data,
not an industry-standard primitive.

#### Topic hierarchy vs. per-record `tools` array — two different concepts

Earlier drafts of this doc collapsed two distinct things into one
"topics" idea. They are actually different and have different rules.

**Topic hierarchy (UI concept):** the union of all tool names ever
defined across all traces in the bundle, organized as a tree under the
agent root. **Empty topics are kept** for visibility — a tool defined
but never called in the available traces still represents a capability
the agent is supposed to have, and future trace uploads might fill it
in. The hierarchy exists for the user to browse what skills the
workflow is training; it does not directly drive training.

**Per-record `tools` array (training concept):** the list of tool
schemas attached to every training record in the OpenAI fine-tuning
JSONL. This has a **stricter** rule set, derived from the literature:

| Rule | Why | Source |
|---|---|---|
| **Same `tools` array on every training record** | OpenAI's fine-tuning guide explicitly requires consistency: *"Make sure all of your training examples are in the same format expected for inference."* The cookbook demonstrates this with one `modified_function_list` used identically across every example. | [OpenAI Fine-tuning for Function Calling](https://developers.openai.com/cookbook/examples/fine_tuning_for_function_calling), [OpenAI Fine-Tuning Best Practices](https://platform.openai.com/docs/guides/fine-tuning-best-practices) |
| **Union the tool name set across the bundle** (not intersection) | ToolBench precedent: different training records expose different tool subsets without global intersection. Intersection would destroy capability coverage on agents that grew their tool set mid-recording. | [ToolLLM (arXiv:2307.16789)](https://arxiv.org/html/2307.16789v2) |
| **For description conflicts on the same tool name, use the most recent** | Developer intent evolved toward the latest description. Training on older descriptions teaches the model to call the tool the way the developer no longer intends. ToolBench has no explicit conflict resolution; this rule fills the gap. | (no direct precedent — derived from the developer-intent principle) |
| **Exclude tools never called in any trace** from the per-record `tools` array (but keep them in the topic hierarchy) | Including dead-weight tools adds prompt tokens without gradient signal, and the model may learn to call them incorrectly by interpolating from similar tools it did see called. The OpenAI cookbook strips tool descriptions for similar token-budget reasons. | [OpenAI cookbook](https://developers.openai.com/cookbook/examples/fine_tuning_for_function_calling) |
| **For parameter-shape drift on the same tool name (schema versioning), use the latest shape and filter out training records that use the old shape** | Mixing old and new parameter shapes in training produces a model that interpolates between calling conventions, which is worse than either alone. No documented industry solution; this is the least-bad option. Gorilla sidesteps this architecturally via runtime retrieval ([arXiv:2305.15334](https://ar5iv.labs.arxiv.org/html/2305.15334)), but that requires shipping a retrieval component we don't have. | (Gorilla's retrieval workaround doesn't apply to us) |

**The two concepts can disagree.** The topic hierarchy might show 6
tools (the developer defined `customer_support` even though it was
never called); the per-record `tools` array would only contain the 4
tools that were actually called. That's correct: the UI shows
capability coverage, the trainer sees only what's demonstrated.

The only thing the trace can't tell us is the **name of the agent
itself** (the root topic label). That comes from the workflow name,
or from a one-shot LLM inference over the tool list, or from a
generic fallback. Cheap, deterministic, no real complexity.

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
// One JSONL line = one full conversation up to the decision being trained on
{"messages": [
  {"role": "system", "content": "You are a shopping assistant ..."},
  {"role": "user", "content": "Compare the dishwasher and the toaster"},
  {"role": "assistant", "tool_calls": [{"id": "c02", "function": {"name": "product_search", "arguments": "..."}}, {"id": "c03", ...}]},
  {"role": "tool", "tool_call_id": "c02", "content": "..."},
  {"role": "tool", "tool_call_id": "c03", "content": "..."},
  // ↑ context up to this point ↑
  {"role": "assistant", "tool_calls": [{"id": "c04", "function": {"name": "product_search", "arguments": "{...page=2...}"}}]}
  // ↑ this is the assistant turn the model is trained to predict ↑
],
 "tools": [...full schema...]}
```

**Multi-step ReAct trajectories produce N JSONL lines per turn**, not
one. The "Compare the dishwasher and the toaster" turn (3 decision
points) becomes **3 separate JSONL lines**:

| Line # | `messages` content (the conversation prefix) | What the model is trained to predict |
|---|---|---|
| 1 | `[system, user]` | The two parallel `product_search` calls |
| 2 | `[system, user, assistant#1, tool_result_c02, tool_result_c03]` | The pagination `product_search(page=2)` call |
| 3 | `[system, user, assistant#1, tools, assistant#2, tool_c04]` | The final `product_comparison(8, 7)` call |

Each line is a **complete conversation** (system + user + all prior
assistant/tool turns) ending right before the assistant turn the model
should learn to produce. The "growing context prefix" pattern from the
walkthrough is what produces this — same `(prefix, predicted_action)`
shape, just rendered as the OpenAI chat-completion format the trainer
expects. This matches the [planner fine-tuning approach on synthetic
trajectories](http://krasserm.github.io/2024/05/31/planner-fine-tuning/),
which is the canonical reference for "explode a trajectory into N
training examples, one per step."

> **Earlier drafts framed "one record per decision point" as if it
> meant one JSONL line per tool call.** It doesn't. One *training
> example* per decision point, yes — but each example is rendered as
> a full conversation in JSONL format. The trainer learns from the
> last assistant turn in each line; the prior turns are context.

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
— string match on tool names, JSON-shape match on arguments.

There is **no LLM judge.** No rubric, no scoring dimensions, no second
model deciding "was this good." The grader is a deterministic verifier
derived from the same tool schema the topics came from.

**Single tool call output** (Patterns A, B, and each step of C): score =
tool name match + argument match. Wrong tool → floor (`0.02`). Right
tool → `0.2` base + up to `0.8` partial credit proportional to matched
arguments.

**Set output** (Pattern D — parallel tool calls): score = **set match**.
The model's output is a set of tool calls; the ground truth is also a
set. Score is the per-call average, with a penalty for missing or extra
calls. Concretely: if ground truth has `K` tool calls and the model
emits `M` calls, compute single-call scores for each matched pair by
tool name, average them, and multiply by `min(K, M) / max(K, M)` so
emitting too few or too many calls both hurt. Order does not matter
inside a parallel set.

The set-match grader is exercised by the fixture — the "Compare the
dishwasher and the toaster" trace has a parallel `[product_search,
product_search]` output that any grader has to handle as a set or lose
real signal.

This is why traces are a much cleaner training source than documents in
one specific way: the reward is fully verifiable, with zero ambiguity
and zero risk of grader gaming.

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
        ╔════════════════════════════════════════════════════════════════════╗
        ║  STAGE 7 — Training  (GRPO on tool-capable base, no BC warm-start) ║
        ║  ─────────────────                                                 ║
        ║                                                                    ║
        ║   base model = Qwen 2B/4B (or equiv.) — already tool-capable       ║
        ║   from instruction tuning, so no SFT warm-start is needed          ║
        ║                                                                    ║
        ║   for each record:                                                 ║
        ║     base model emits K=8 rollouts at temperature                   ║
        ║     grader scores each rollout                                     ║
        ║                                                                    ║
        ║     example spread across 8 rollouts for one record:               ║
        ║       [1.00, 0.47, 0.02, 1.00, 0.47, 1.00, 0.02, 1.00]             ║
        ║         ↑perfect ↑partial ↑wrong-tool  group_mean = 0.625          ║
        ║                                                                    ║
        ║     advantage = score − group_mean                                 ║
        ║     PPO-style clipped policy update                                ║
        ║     (push toward +advantage, away from −advantage)                 ║
        ║                                                                    ║
        ║   on-policy sampling = no compounding error in the first place     ║
        ║   (we don't clone, so there's no cloned error to correct)          ║
        ║                                                                    ║
        ║   early stop on eval-set LEARNABLE_FRAC (NOT avg reward —          ║
        ║   trivial records dominate the average and will plateau early)    ║
        ╚════════════════════════════════════════════════════════════════════╝
                                            │
                                            ▼
        ╔════════════════════════════════════════════════════════════════════╗
        ║  STAGE 8 — Eval on UNSEEN paraphrases                              ║
        ║  ─────────────────────────────────                                 ║
        ║   held-out customer phrasings the model has NEVER seen             ║
        ║   (NOT a slice of the training records — different sentences,      ║
        ║    same intents)                                                   ║
        ║                                                                    ║
        ║   same programmatic grader from Stage 4                            ║
        ║                                                                    ║
        ║   metrics that matter:                                             ║
        ║     • tool-name accuracy                                           ║
        ║     • argument-match rate (right-tool subset)                      ║
        ║     • refusal precision / recall                                   ║
        ╚════════════════════════════════════════════════════════════════════╝
                                            │
                                            ▼
        ╔════════════════════════════════════════════════════════════════════╗
        ║  STAGE 9 — Deploy  (identical to document pipeline)                ║
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

If the **learnable bucket is too small** (we propose `< 30%` of records),
training is **blocked** with an explicit message: "this dataset is too
easy or too hard for GRPO to learn from — add harder examples, add easier
examples, or expand with paraphrase synthesis."

If a single tool's records are **mostly trivial** (e.g. `> 70% trivial`
for `product_search`), training is **blocked or warned** with a
default-mode-collapse message: the base model already prefers this tool
too strongly and GRPO will just reinforce that prior.

Trivial records are **not deleted** — they stay in the dataset. Filtering
them out is exactly the wrong move (their ground truth still anchors the
loss). The probe is a gate, not a filter.

The output of this stage is a go/no-go decision. If go, training proceeds.
See the full workflow diagram above (Stage 6) for the gate criteria.

### Stage 7 — Training (GRPO directly on a tool-capable base)

**No BC warm-start stage.** The base model we finetune (Qwen 2B/4B,
Llama-3.2, or equivalent) ships with tool-calling already baked in
from its instruction-tuning phase. It already knows JSON tool-call
syntax, how to parse a tool schema from a system prompt, how to emit
valid arguments given parameter descriptions, and multi-turn
conversation with tool results. Adding a supervised warm-start on top
of that would re-teach things the base model already knows. See "Why
we skip BC warm-start" below for the full rationale.

The pipeline runs GRPO directly on the tool-capable base:

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
identical. GRPO sees a flat list of records and a programmatic
grader, and it doesn't know or care that the records came from a
trace. See the full workflow diagram above (Stage 7) for one record's
K=8 rollout spread and how it becomes a gradient update.

### Stage 8 — Evaluation against unseen paraphrases

The eval set is **not** a held-out slice of the training records. It's a
**different set of customer phrasings asking for the same intents** —
either captured from production traffic the agent saw later, or generated
synthetically (e.g. "rephrase 'find me a tablet' 5 ways without changing
the intent").

The eval grader is the same programmatic verifier from Stage 4. The
metrics that matter:

- **Tool-name accuracy:** what fraction of held-out paraphrases got the
  right tool?
- **Argument-match rate:** for the right-tool subset, what fraction of
  ground-truth arguments did the model reproduce?
- **Refusal precision/recall:** for held-out paraphrases that have no
  matching tool, did the model correctly refuse?

These three numbers, on **never-before-seen phrasings**, are the real
test. The training-set numbers are diagnostic only — they tell you
whether the pipeline ran, not whether the model is useful.

**Stage 9 — Deploy** is identical to the document pipeline and worth no
further words.

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
pipeline runs **GRPO directly on the tool-capable base model** — no
BC warm-start, because the base already has tool-calling from its
instruction-tuning phase and BC would re-teach things it already
knows. On-policy sampling prevents compounding error structurally.
Evaluation is against unseen customer paraphrases, not a held-out
slice. Deployment is identical to the document pipeline. **The whole
flow is mechanical extraction plus one rewrite step plus one go/no-go
probe — no LLM is called between bundle arrival and training start
(except optionally to rewrite the system prompt once at the workflow
level).**

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

- **Most prompts will be reward-flat** ("Find me a tablet" is trivial —
  K rollouts will all succeed). Defense: the Stage 6 learnable-fraction
  gate blocks training if less than 30% of records are learnable.
- **Variance lives only in edge cases.** Defense: don't filter the
  trivial prompts; rely on early stopping, not selection.
- **Default-mode collapse on the dominant tool.** Defense: balance
  check before training, possibly clip-higher.
- **Grader returning hard 0.0 kills variance instantly.** Defense:
  tpFloor pattern — wrong tool is `0.02`, partial-arg-match is
  `0.2 + 0.8 × matched_fraction`.
- **Dataset is likely too small.** A typical real trace bundle is on
  the order of dozens to low hundreds of decisions. GRPO usually wants
  more. Defense: paraphrase synthesis to expand, not pre-filtering to
  shrink. **Rejection-Sampling Fine-Tuning (RFT)** — pre-filtering
  the GRPO record set with the same verifier the grader uses — is
  the most natural v2 addition.

---

## The honest goal statement

> Run **GRPO directly on a tool-capable small open model** (Qwen 2B/4B,
> Llama-3.2, or equivalent) using a partial-credit programmatic grader
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
icon and a different viewer (a message-bubble timeline instead of a PDF
reader). Summary stats on the source row show span count, tool names,
model name, and so on.

There is no separate "traces" route, no global browse-and-pick UI, no
trace-specific workflow type. The trace is a knowledge source, the
workflow is a workflow, the pipeline is the pipeline.

---

## The one open conceptual question

A workflow can in principle have both trace sources and document sources.
**What is such a workflow training, conceptually?**

Two possible answers:

| Answer | Implication |
|---|---|
| **(a)** It trains a tool-using agent that also knows things. Tools are the skill, documents are reference material the agent consults at inference time. One model, two roles. | Trace sources dominate the workflow's identity. Documents become inference-time RAG context, not training-time system prompt content. |
| **(b)** Two different models, two different training runs, one workflow. | Conceptually weird and probably wrong — workflows are supposed to produce one trained model. |

The honest answer is **(a)**, with the rule: **a workflow with any trace
source is fundamentally a behavior workflow. Documents inside it become
inference-time reference material, not training-time system prompt
content.** This mirrors how real agents work in production — they have
tools and a knowledge base, and the knowledge base is queried at inference
rather than baked into model weights.

This is the only conceptual question this doc leaves open. It needs to be
resolved before any workflow ever has both kinds of source at the same
time.

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
  raw-trace store from the curated-dataset store. Mirrors our
  "knowledge_sources table holds the blob" separation at row
  granularity.
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
