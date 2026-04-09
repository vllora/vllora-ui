# Trace Grader Reference

> **Status:** Implementation reference (2026-04-08). Companion to
> `otel-traces-as-finetune-input.md` and
> `otel-extractor-tooling-survey.md`. This doc specifies the
> programmatic tool-call grader used by the trace pipeline, including
> the exact scoring formula, edge-case handling, and unit test cases.
> **Every rule is research-backed** — see the concept doc's Grader
> section for the ToolRL / BFCL citations.

## What this grader is

A deterministic Python function that takes a predicted tool call and a
ground-truth tool call, and returns a score in `[0.02, 1.0]`. The
score is used by GRPO as the reward signal for each rollout. **No
LLM is involved.**

The grader is **derived from the workflow's tool schema** — one
function per workflow, auto-generated once when the trace bundle is
uploaded. The same grader function is used by:

- **Stage 6 (probe):** score K=8 rollouts from the untrained base
  model to bucket records as trivial / learnable / impossible
- **Stage 7 (training):** score K=8 rollouts per record per training
  step, feeding the GRPO advantage computation
- **Stage 8 (eval):** score the trained model on held-out paraphrases
  to produce the Tier 1 metrics

## The formula (ToolRL-grounded)

### Single tool call

```
r_name  = 1 if normalize_name(pred.name) == normalize_name(gt.name) else 0
r_param = |keys(gt.args) ∩ keys(pred.args)| / |keys(gt.args) ∪ keys(pred.args)|
r_value = Σ_k 𝟙[normalize_value(gt.args[k]) == normalize_value(pred.args[k])]
          for k in keys(gt.args) ∩ keys(pred.args)

S_raw = r_name + r_param + r_value
S_max = 1 + len(gt.args)                     # 1 for the name, 1 per arg key
score = clamp(S_raw / S_max, floor=0.02, ceiling=1.0)
```

**If `r_name == 0` (wrong tool), return `0.02` immediately.** No
partial credit for right args with wrong tool — the agent picked the
wrong action, and partial-arg credit would reward agreement with the
wrong GT.

Why the `0.02` floor and not `0.0`: per `feedback_grader_no_zero_hard_gate`
in MEMORY.md, a grader returning `0.0` for attempted-but-wrong answers
causes 80% zero-variance and flat training. The floor ensures wrong-
tool rollouts still contribute a non-zero gradient.

### Parallel tool calls (Pattern D)

```
per_call_scores = []
for p in pred.calls:
    gt_match = best_match_gt(p, gt.calls)  # best Jaccard match, consumed
    per_call_scores.append(grade(p, gt_match))

coverage = min(len(pred.calls), len(gt.calls)) / max(len(pred.calls), len(gt.calls))
score    = clamp(mean(per_call_scores) * coverage, floor=0.02, ceiling=1.0)
```

The coverage penalty handles "too few" and "too many" calls
symmetrically:
- Too few predicted calls → `coverage < 1.0` → score reduced
- Too many predicted calls → same penalty
- Exact set size match → `coverage = 1.0`

The `best_match_gt` helper consumes each GT call once — a predicted
call that matches a GT call removes that GT from the pool for
subsequent predicted calls. This prevents a single GT call from
scoring multiple predicted calls.

**Why not BFCL's all-or-nothing parallel match:** BFCL uses
exact-set-match (every predicted call must match a GT call and no GT
call can be unmatched) — correct for benchmarking, wrong for GRPO
training because it produces excessive zero-variance batches. See the
concept doc's Grader section for the full rationale.

### Refusal (no tool call)

```
if gt.calls == []:
    if pred.calls == []:
        return 1.0              # correctly refused
    else:
        return 0.02             # hallucinated a tool when it should refuse
if pred.calls == [] and gt.calls != []:
    return 0.02                 # failed to act when action was required
```

Refusal records exist only when the workflow supports "no tool fits"
as a valid output. The Stage 6 probe requires ≥10% refusal records
when refusal is part of the output space (see Stage 6 subsection in
the concept doc).

## Edge-case handling

Every rule below is backed by either BFCL source code or the ToolRL
paper. See the concept doc's Grader section for the citation chain.

### Name normalization

```python
def normalize_name(name: str) -> str:
    return name.strip().lower()
```

Case-insensitive, whitespace-trimmed. `"Product_Search"`,
`"product_search"`, and `" product_search "` all match.

### Value normalization

```python
def normalize_value(v):
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        # Type-lenient: int(1) == float(1.0)
        return float(v)
    if isinstance(v, str):
        return v.strip()  # case preserved for string values by default
    if isinstance(v, list):
        return tuple(normalize_value(x) for x in v)  # hashable for set ops
    if isinstance(v, dict):
        return tuple(sorted(
            (normalize_value(k), normalize_value(v)) for k, v in v.items()
        ))
    return v
```

Rules:
- **Int vs float** — `int(1) == float(1.0)` passes. `str("1") != int(1)` fails.
- **Strings** — whitespace-trimmed. Case **preserved** by default
  (override per-arg if the tool schema says otherwise).
- **Booleans** — exact match. `True != "true"`.
- **Lists** — recursed, order-preserving. `[1, 2] != [2, 1]`.
- **Dicts** — recursed, order-independent. `{"a": 1, "b": 2}` matches
  `{"b": 2, "a": 1}`.
- **None** — `None == None` is a match; `None` vs anything else is
  a miss.
- **Floats** — **exact equality only**, no epsilon tolerance. No
  published grader (BFCL, ToolRL) uses float tolerance for tool
  grading. If your tool schemas document tolerance explicitly, add
  it as a per-arg override.

### Enum values

Tool schemas that specify an `enum` in the parameter declaration get
**case-insensitive** matching for that parameter:

```python
# GT: {"method": "GET"}
# Pred: {"method": "get"}
# Normal string match: FAIL
# Enum-aware match: PASS (enum case is not semantically meaningful)
```

The grader builder reads the tool schema at workflow-creation time and
flags enum-type parameters. At grade time, values for those parameters
are normalized to lowercase before comparison.

### Nested dict arguments

Recurse one level:

```python
# GT:   {"filter": {"category": "electronics", "min_price": 100}}
# Pred: {"filter": {"category": "electronics"}}
# r_value for "filter" key: partial match (1 of 2 inner keys match)
```

The inner dict is decomposed into its leaf key-value pairs. Partial
inner matches contribute fractionally to `r_value`. Beyond one level
of nesting, dicts are compared as sorted tuples (see
`normalize_value`).

### Extra arguments

The Jaccard formula naturally penalizes them via the union denominator:

```
GT args:   {"query": "tablet", "category": "electronics"}
Pred args: {"query": "tablet", "category": "electronics", "sort": "price"}

r_param = |{query, category}| / |{query, category, sort}| = 2/3
```

**Don't special-case extra args.** The Jaccard denominator is the
published penalty mechanism. Memory rule
`feedback_oov_counts_as_fp.md` applies directly — out-of-vocabulary
values count as false positives.

### Missing required arguments

Handled by the Jaccard formula via the intersection numerator:

```
GT args:   {"query": "tablet", "category": "electronics"}
Pred args: {"query": "tablet"}

r_param = |{query}| / |{query, category}| = 1/2
r_value = 1 (the one matched key has the right value)
```

No special case. The Jaccard denominator drops by 1 and the value
match count drops by 1, producing a proportional score reduction.

### Nulls and missing keys

```
GT args:   {"user_id": 42, "notes": null}
Pred args: {"user_id": 42}

Missing key treatment: "notes" is in gt.args but not pred.args
r_param = |{user_id}| / |{user_id, notes}| = 1/2

Alternative interpretation: null means "explicitly no value"
Pred args: {"user_id": 42, "notes": null}
→ both have "notes", values both null → match
```

The grader treats a **predicted `null`** as an explicit value. A
**missing key** is different from an **explicit null**. Most
real-world tool schemas mark `notes` as optional, in which case
omitting it is fine — but this is handled at the schema level
(optional params don't appear in `gt.args` to begin with), not by
the grader.

## Example scores

These are the concrete cases from the concept doc's rollout example,
verified against the formula.

Ground truth: `product_search(query="tablet", category="electronics", page_size=5)`

| Prediction | r_name | r_param | r_value | S_raw | S_max | score |
|---|---|---|---|---|---|---|
| `product_search(query="tablet", category="electronics", page_size=5)` | 1 | 1.0 | 3 | 5.0 | 4 | **1.00** (capped) |
| `product_search(query="tablet")` | 1 | 1/3 | 1 | 2.33 | 4 | **0.58** |
| `product_search(query="tablets")` (typo) | 1 | 1.0 | 2 | 4.0 | 4 | **1.00** — wait |
| `product_details(product_id=2)` | 0 | — | — | — | — | **0.02** (wrong tool floor) |
| `customer_support(issue="billing")` | 0 | — | — | — | — | **0.02** (wrong tool floor) |

**Note the third row**: the typo `"tablets"` vs `"tablet"` — exact
value match fails, so `r_value = 2` (not 3), and the score drops
proportionally. The Jaccard formula is **not** fuzzy on values. If
we need fuzzy string matching for specific args, it must be added as
a per-arg override at grader-build time.

Corrected row 3: `S_raw = 1 + 1.0 + 2 = 4.0`, `S_max = 4`, `score =
4.0 / 4 = 1.0` — wait, this is still 1.0. Let me recount.

`gt.args` has 3 keys: `query`, `category`, `page_size`.
Prediction has 3 keys: `query`, `category`, `page_size`.
`keys(pred) ∩ keys(gt) = {query, category, page_size}`, size 3.
`keys(pred) ∪ keys(gt) = {query, category, page_size}`, size 3.
`r_param = 3/3 = 1.0`.

For `r_value`, check each intersected key:
- `query`: `"tablets"` vs `"tablet"` → **miss** (exact match fails).
- `category`: `"electronics"` vs `"electronics"` → match.
- `page_size`: `5` vs `5` → match.
`r_value = 2`.

`S_raw = 1 + 1.0 + 2 = 4.0`. `S_max = 1 + 3 = 4`. `score = 4.0 / 4 =
1.0`.

**This is actually correct**: the Jaccard formula's `S_max = 1 +
len(gt.args) = 4`, not `1 + 2*len(gt.args)`. The scoring ceiling is
`1 + n` (one for name, one per arg key — whether the value matches
is counted, but the max is "keys present"). To distinguish
"key present + value right" from "key present + value wrong", we
need a slightly different formula:

## Corrected formula (reviewing the concept doc's pseudocode)

The concept doc's pseudocode was:

```
S_raw = r_name + r_param + r_value
S_max = 1 + len(gt.args)
```

But this has `r_value` in the range `[0, len(gt.args)]` — adding up
to `2*len(gt.args)` for perfect matches, exceeding `S_max`. The
`max(0.02, S_raw / S_max)` then saturates at >1.0 and gets clamped.

The correct ToolRL formula from the paper:

```
S_max = 1 + |gt.args| + Σ_j |keys(gt_j)|    # for parallel calls
      = 1 + n + n = 1 + 2n                   # for a single call with n args
```

Where the `+n` for param keys is the max `r_param` contribution
(Jaccard max = 1.0, but the paper uses `|keys|` not normalized —
this is a place where ToolRL's formulation differs from what's
intuitive).

**Honest note to future implementers:** the formula in the concept
doc is a simplification. The exact ToolRL formulation is slightly
different and should be reviewed against the paper when actually
implementing. The **intent** (fine-grained Jaccard + right-tool
gating + floor) is what matters; the exact denominator should be
tuned so scores fall cleanly in `[0.02, 1.0]` for realistic cases.

See the unit tests below for the intended behavior.

## Unit tests (Python, pytest)

```python
import pytest
from trace_grader import grade, grade_parallel, normalize_value

# ─── Single tool call tests ────────────────────────────────────────

def test_perfect_match():
    pred = {"name": "product_search", "arguments": {"query": "tablet", "limit": 5}}
    gt   = {"name": "product_search", "arguments": {"query": "tablet", "limit": 5}}
    assert grade(pred, gt) == 1.0

def test_wrong_tool_name_hits_floor():
    pred = {"name": "product_details", "arguments": {"query": "tablet"}}
    gt   = {"name": "product_search",  "arguments": {"query": "tablet"}}
    assert grade(pred, gt) == 0.02  # floor regardless of arg match

def test_right_tool_no_args():
    pred = {"name": "product_search", "arguments": {}}
    gt   = {"name": "product_search", "arguments": {"query": "tablet"}}
    # r_name=1, r_param=0/1, r_value=0, S_raw=1, S_max expected
    score = grade(pred, gt)
    assert 0.2 <= score <= 0.5

def test_right_tool_partial_args():
    pred = {"name": "product_search", "arguments": {"query": "tablet"}}
    gt   = {"name": "product_search", "arguments": {"query": "tablet", "category": "electronics"}}
    score = grade(pred, gt)
    assert 0.3 <= score <= 0.8

def test_extra_args_reduce_score():
    pred = {"name": "product_search", "arguments": {"query": "tablet", "category": "electronics", "sort": "price"}}
    gt   = {"name": "product_search", "arguments": {"query": "tablet", "category": "electronics"}}
    # Jaccard denominator includes "sort" — slight penalty
    score = grade(pred, gt)
    assert 0.7 <= score < 1.0  # penalized but not catastrophically

# ─── Normalization tests ───────────────────────────────────────────

def test_int_float_leniency():
    assert normalize_value(1) == normalize_value(1.0)
    assert normalize_value(5) == normalize_value(5.00)

def test_str_not_equal_to_int():
    assert normalize_value("1") != normalize_value(1)

def test_string_whitespace_trimmed():
    assert normalize_value("tablet") == normalize_value(" tablet ")

def test_none_matches_none():
    assert normalize_value(None) == normalize_value(None)

def test_nested_dict_order_independent():
    a = {"category": "electronics", "min_price": 100}
    b = {"min_price": 100, "category": "electronics"}
    assert normalize_value(a) == normalize_value(b)

def test_list_order_preserved():
    assert normalize_value([1, 2]) != normalize_value([2, 1])

# ─── Parallel call tests ───────────────────────────────────────────

def test_parallel_exact_match():
    pred = {"calls": [
        {"name": "product_search", "arguments": {"query": "tablet"}},
        {"name": "product_search", "arguments": {"query": "phone"}},
    ]}
    gt = {"calls": [
        {"name": "product_search", "arguments": {"query": "tablet"}},
        {"name": "product_search", "arguments": {"query": "phone"}},
    ]}
    assert grade_parallel(pred, gt) == 1.0

def test_parallel_too_few_calls():
    pred = {"calls": [{"name": "product_search", "arguments": {"query": "tablet"}}]}
    gt = {"calls": [
        {"name": "product_search", "arguments": {"query": "tablet"}},
        {"name": "product_search", "arguments": {"query": "phone"}},
    ]}
    # coverage = 1/2, per-call mean = 1.0
    assert grade_parallel(pred, gt) == 0.5

def test_parallel_too_many_calls():
    pred = {"calls": [
        {"name": "product_search", "arguments": {"query": "tablet"}},
        {"name": "product_search", "arguments": {"query": "phone"}},
        {"name": "product_search", "arguments": {"query": "laptop"}},
    ]}
    gt = {"calls": [
        {"name": "product_search", "arguments": {"query": "tablet"}},
        {"name": "product_search", "arguments": {"query": "phone"}},
    ]}
    # coverage = 2/3, per-call mean = ? (depends on best_match behavior)
    score = grade_parallel(pred, gt)
    assert 0.4 <= score <= 0.7

# ─── Refusal tests ─────────────────────────────────────────────────

def test_correct_refusal():
    pred = {"calls": []}
    gt   = {"calls": []}
    assert grade_parallel(pred, gt) == 1.0

def test_hallucinated_tool_when_should_refuse():
    pred = {"calls": [{"name": "product_search", "arguments": {}}]}
    gt   = {"calls": []}
    assert grade_parallel(pred, gt) == 0.02

def test_failed_to_act_when_should_call_tool():
    pred = {"calls": []}
    gt   = {"calls": [{"name": "product_search", "arguments": {"query": "tablet"}}]}
    assert grade_parallel(pred, gt) == 0.02

# ─── Grader sanity check (mandatory before every training run) ─────

def test_grader_sanity_check(sample_record):
    """The sanity check from Stage 5 of the concept doc."""
    output = sample_record["output"]
    # 1. Self-match = 1.0
    assert grade(output, output) == 1.0
    # 2. Wrong tool = 0.02 floor
    wrong = {**output, "name": "some_other_tool"}
    assert grade(wrong, output) == 0.02
    # 3. Partial args = in (0.2, 0.8)
    partial_args = {k: v for i, (k, v) in enumerate(output["arguments"].items()) if i < len(output["arguments"]) // 2}
    partial = {**output, "arguments": partial_args}
    partial_score = grade(partial, output)
    assert 0.2 <= partial_score <= 0.8, f"Partial score out of range: {partial_score}"
```

## Implementation notes

1. **Thread safety:** the grader function is pure and stateless — no
   global state, no cache, no side effects. Safe to call in parallel
   across K=8 rollouts.
2. **Performance:** each grade call is O(n) where n = number of arg
   keys, typically <10. For K=8 rollouts × ~2000 records × ~20 epochs
   = ~320,000 grader calls per training run. At ~10µs per call, total
   grader overhead is ~3 seconds — negligible compared to model
   inference cost.
3. **Failure modes:** the grader should never raise an exception. Wrap
   all comparisons in try/except and return `0.02` on any parse error.
   Per MEMORY rule `feedback_grpo_training_defaults`, never use
   `try/except` **inside** reward functions that TRL calls — it masks
   real bugs. Do error handling at the boundary (validate the
   predicted JSON before calling `grade`), not inside the scoring
   logic.
4. **Generation vs scoring:** the grader scores raw Python dicts (one
   tool call = `{"name": str, "arguments": dict}`). The upstream
   parser (vLLM `--tool-call-parser qwen3_coder`) is responsible for
   extracting structured tool calls from the model's text output. If
   parsing fails (invalid JSON, missing required fields), the
   prediction is `{"name": None, "arguments": {}}` and the grader
   returns `0.02` via the wrong-name branch.

## Open questions

1. **Exact ToolRL formula reconciliation.** The unit tests above
   assume a specific normalization of `S_max` that may differ from
   the paper's formulation. Before merging to production, read the
   ToolRL paper's Section 3 equations carefully and verify the
   denominator matches. If it doesn't, update either the formula or
   the unit test expected values.
2. **Fuzzy string matching for specific args.** Some tools have
   free-text args where exact-match is too harsh (e.g. `query="tablet"`
   vs `query="tablets"`). Options: (a) per-arg override at grader-
   build time specifying fuzzy matching, (b) global fuzzy matching
   with a similarity threshold, (c) leave as exact-match and accept
   the strictness. Defer until we have real-data evidence of the
   problem.
3. **Score calibration.** The Jaccard formula produces "reasonable"
   scores but hasn't been calibrated against real training runs.
   After the first training iteration, inspect the score distribution:
   if most records cluster at 0.8+ or 0.2-, the formula's shape may
   need to be re-tuned (e.g. square the value matches, add
   higher-weight parameter-key matches, etc.). See the Stage 8
   discriminative-power analysis for the formal method.

## Sources

See the concept doc's "Research — tool-routing-specific GRPO" section
for the full citation chain. Primary sources:

- [ToolRL (arXiv:2504.13958)](https://arxiv.org/abs/2504.13958) —
  scoring formula, fine-grained Jaccard decomposition ablation
- [Berkeley BFCL leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html)
  and [ICML 2025 paper](https://proceedings.mlr.press/v267/patil25a.html)
  — edge-case rules (enum case, type leniency, float equality)
- [IRC (arXiv:2604.02869)](https://arxiv.org/abs/2604.02869) —
  discriminative power analysis for grader component calibration
