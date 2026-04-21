# Tool-Calling Training Data — Design Document

> **Purpose**: Fix the fundamental gap where training records lack tool-calling format, making the model unable to learn when/how to invoke tools.
> **Problem**: Current `training.jsonl` has `{system, user, ground_truth_text}` but the retail agent must CALL TOOLS. Without tool schemas and `tool_calls` in records, the model generates text instead of tool invocations.
> **Date**: 2026-04-15
> **Status**: Implemented for canonical trace decision points, with distilabel APIGen augmentation added as an optional Step 4 backend

## Current Implementation Boundary

The current skill does **not** generate a new canonical tool-calling dataset from scratch.

Instead:

- canonical tool-calling records come from `trace-analysis/decision-points.jsonl`
- the final exported tool-calling `ground_truth` shape is `{name, arguments}`
- when `generation_backend: "distilabel"`, APIGen is used only to add augmentation rows around underrepresented tool topics
- canonical trace rows remain byte-for-byte unchanged in the merged `training.jsonl`

## The Gap

| What the model needs to learn | Current training data | What's missing |
|------------------------------|---------------------|----------------|
| WHEN to call a tool | User query + text GT | No tool schema, model doesn't know tools exist |
| WHICH tool to call | Text GT mentions tool name | No structured `tool_calls` format |
| WHAT parameters to pass | Text GT has some params | No parameter schema, no structured args |
| HOW to use tool results | Not covered | No multi-turn with tool responses |
| WHEN to respond vs call tool | Not covered | No "one tool call per turn" training signal |

## Research Summary

### ToolRL (arXiv:2504.13958) — Key findings
- Fine-grained rewards (tool name + param Jaccard) beat outcome-only by 17%
- Model must generate `tool_calls` as output, not text
- Single composite reward per decision point > decomposed training

### Tool Zero (arXiv:2511.01934, EMNLP 2025)
- Pure RL (no SFT) can teach tool calling from scratch
- Requires: tool schema in every prompt + structured output + parseable reward

### OpenAI function-calling finetuning format
```json
{"messages": [
  {"role": "system", "content": "..."},
  {"role": "user", "content": "Cancel my order #W123"},
  {"role": "assistant", "content": null, "tool_calls": [
    {"type": "function", "function": {"name": "get_order_details", "arguments": "{\"order_id\": \"W123\"}"}}
  ]},
  {"role": "tool", "tool_call_id": "call_1", "content": "{\"status\": \"pending\", ...}"},
  {"role": "assistant", "content": null, "tool_calls": [
    {"type": "function", "function": {"name": "cancel_pending_order", "arguments": "{\"order_id\": \"W123\", \"reason\": \"no longer needed\"}"}}
  ]}
], "tools": [{"type": "function", "function": {"name": "cancel_pending_order", ...}}]}
```

### What already exists in our codebase

`finetune-skill-otel/scripts/otel_distill.py` already produces the correct format:
- Per-decision-point records from OTel traces
- `messages`: context up to the decision point (includes prior tool calls + results)
- `tools`: full tool schema extracted from traces
- `ground_truth`: the demonstrated `tool_calls`

## Design

### Two sources of tool-calling training data

| Source | What it produces | When to use |
|--------|-----------------|-------------|
| **OTel traces** (real) | Exact tool call sequences from production | Canonical source whenever traces are available |
| **APIGen augmentation** | Additional rare-topic and edge-case tool call scenarios | Optional distilabel augmentation around the canonical trace dataset |

### Tool routing: when to call vs when to respond with text

**Every record includes the `tools` array** (so the model always knows tools exist), but GT format varies by topic:

| Topic type | `tools` field | GT format | Purpose |
|-----------|--------------|-----------|---------|
| Tool-action (cancel-pending-order) | Yes (full schema) | `{"name": "cancel_pending_order", "arguments": {...}}` | Learn WHEN and HOW to call tools |
| Text-response (greeting, policy QA) | Yes (full schema) | `"text string"` | Learn WHEN NOT to call tools |

This is mandatory for correct tool routing (ToolRL, arXiv:2504.13958; OpenAI docs; Qwen format). Without text-response examples that include tools, the model becomes "tool-happy" — it calls tools even when unnecessary. Aim for 20-30% text-response records to prevent tool-call bias.

### Record format for tool-calling GRPO

Each record = one **decision point** where the model must choose an action:

```json
{
  "id": "cancel-pending-order-001",
  "topic": "cancel-pending-order",
  "messages": [
    {"role": "system", "content": "You are a retail CS agent..."},
    {"role": "user", "content": "I want to cancel my order #W123"}
  ],
  "tools": [
    {"type": "function", "function": {
      "name": "get_order_details",
      "description": "Get details of an order",
      "parameters": {"type": "object", "properties": {"order_id": {"type": "string"}}}
    }},
    {"type": "function", "function": {
      "name": "cancel_pending_order",
      "description": "Cancel a pending order",
      "parameters": {"type": "object", "properties": {
        "order_id": {"type": "string"},
        "reason": {"type": "string", "enum": ["no longer needed", "ordered by mistake"]}
      }}
    }}
  ],
  "ground_truth": {
    "tool_calls": [{"type": "function", "function": {
      "name": "get_order_details",
      "arguments": {"order_id": "W123"}
    }}]
  },
  "prompt_type": "tool_call",
  "source_parts": ["p-003", "p-005"]
}
```

### Three types of training records

| Type | Source | Has GT? | Purpose |
|------|--------|---------|---------|
| **Decision points** | `decision-points.jsonl` (from traces) | Yes — tool_call dict | Primary tool-calling training signal |
| **Synthetic records** | `generate_records.py` (LLM-generated) | Yes — tool_call dict or text | Augmented scenarios with tool routing |
| **Seed queries** | First user messages from traces | **No** — prompt diversity only | Real user phrasing (no GT because first message lacks tool call arguments) |

**Why seeds don't get tool-call GT**: The user's first message (e.g., "Hi, help with my orders") doesn't contain the arguments needed for the tool call (order_id, email come from later turns). Attaching the trace's tool call as GT creates unverifiable reward — the model can't predict args it hasn't seen (ToolRL, arXiv:2504.18176; DeepSeek-R1, arXiv:2501.12948).

### Multi-turn records (from traces)

For conversations with multiple tool calls, each decision point is a separate record:

**Record 1** (first decision: authenticate):
```json
{
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "Hi, I want to cancel my order"}
  ],
  "tools": [...],
  "ground_truth": {"tool_calls": [{"function": {"name": "find_user_id_by_email", "arguments": {"email": "..."}}}]}
}
```

**Record 2** (second decision: look up order):
```json
{
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "Hi, I want to cancel my order"},
    {"role": "assistant", "content": null, "tool_calls": [...]},
    {"role": "tool", "content": "{\"user_id\": \"U123\"}"},
    {"role": "assistant", "content": "I found your account. What's the order ID?"},
    {"role": "user", "content": "It's W123"}
  ],
  "tools": [...],
  "ground_truth": {"tool_calls": [{"function": {"name": "get_order_details", "arguments": {"order_id": "W123"}}}]}
}
```

### Where tool schemas come from

1. **From OTel traces**: `otel_distill.py` extracts tool schemas from `gen_ai.request.tools` span attributes
2. **From PDF knowledge**: Tool reference sections in the policy doc (Section 10 in tau-bench) describe available tools
3. **From SKILL.md configuration**: Agent specifies available tools in config.json

### Implementation plan

#### Phase 1: Extract tool schemas from traces (immediate)

`trace_analyze.py` already extracts tool names. Extend it to also extract full tool schemas (parameter types, descriptions) from the trace spans.

New artifact: `trace-analysis/tool-schemas.json`
```json
{
  "tools": [
    {"type": "function", "function": {
      "name": "cancel_pending_order",
      "description": "Cancel a pending order",
      "parameters": {...}
    }}
  ]
}
```

#### Phase 2: Generate tool-calling records (immediate)

Extend `generate_records.py` to produce tool-calling format when `--tools-file` is provided:

```bash
uv run generate_records.py \
  --topics topics.json \
  --knowledge-dir knowledge/ \
  --system-prompt "..." \
  --tools-file trace-analysis/tool-schemas.json \
  --output training.jsonl \
  --records-per-topic 30
```

When `--tools-file` is provided:
- Each record includes the `tools` array
- GT format changes from text to `{"tool_calls": [...]}`
- LLM prompt asks for tool invocation scenarios, not text Q&A
- Prompt types include: `tool_selection` (which tool?), `param_extraction` (what args?), `multi_step` (sequence of calls), `edge_case` (error handling)

#### Phase 3: Mix trace + synthetic records

- Seed records from traces (otel_distill format) = real decision points
- Synthetic records from generate_records.py = augmented scenarios
- Both use the same `tools` schema and `tool_calls` GT format
- Grader uses Jaccard scoring (ToolRL pattern): `score = 0.4 * name_match + 0.3 * param_key_jaccard + 0.3 * param_value_match`

### What changes

| File | Change |
|------|--------|
| `trace_analyze.py` | Extract tool schemas → `tool-schemas.json` |
| `generate_records.py` | New `--tools-file` flag, tool-calling record format, tool-aware LLM prompt |
| `data_quality_gate.py` | New check: "records have tools when use case is tool-calling" |
| `SKILL.md` | Auto-detect tool-calling use case, use tool-calling record format |
| `grader_from_traces.py` | Generate Jaccard-based tool-call grader (not text-match grader) |

## Distilabel APIGen Augmentation

APIGen sits on top of the canonical trace export, not instead of it.

Flow:

1. read `trace-analysis/decision-points.jsonl`
2. read `trace-analysis/tool-schemas.json`
3. group canonical rows by existing leaf topic slug
4. detect underrepresented topics below the minimum count
5. generate APIGen candidates from existing examples
6. run semantic checking always
7. run execution checking only if the user provides `distilabel.apigen_tool_module`
8. append selected rows after the raw canonical lines when writing `training.jsonl`

Why this matters:

- the strongest supervision signal already exists in the trace-derived rows
- augmentation helps coverage without introducing unnecessary distribution shift
- downstream validators and upload tooling continue to work because the merged dataset preserves the established record contract

### Grader for tool-calling GRPO

```javascript
function evaluate(input) {
  // Parse model output as tool_calls
  var toolCalls = parseToolCalls(input.response);
  var expectedCalls = input.expected.tool_calls;
  
  // Score: name match (0.4) + param keys (0.3) + param values (0.3)
  var nameScore = toolCalls[0]?.name === expectedCalls[0]?.name ? 1.0 : 0.0;
  var paramKeys = jaccard(Object.keys(toolCalls[0]?.args || {}), Object.keys(expectedCalls[0]?.args || {}));
  var paramValues = matchValues(toolCalls[0]?.args, expectedCalls[0]?.args);
  
  return { score: 0.4 * nameScore + 0.3 * paramKeys + 0.3 * paramValues };
}
```

## Model Selection for Tool-Calling

When the use case requires tool calling, model selection must filter by tool-calling support:

| Model | Tool-calling support | Eval? |
|-------|---------------------|-------|
| Qwen3.5-4B | Full support (Qwen3-Coder XML format) | Yes |
| Qwen3.5-2B | Supported | Yes |
| Qwen3.5-0.8B | Limited — may not generate valid tool calls | Skip for tool-calling tasks |

Auto-detection: if `tool-schemas.json` exists, the agent should only evaluate models with tool-calling support. This prevents wasted eval compute on models that will always score 0.

## Model-Neutral Format (no chicken-and-egg)

Training records use **model-neutral OpenAI-compatible JSON** for tool calls. This avoids the chicken-and-egg problem: we generate data before model selection, but different models use different tool-call formats.

```
Generation time:  Model-neutral JSON (OpenAI-compatible)
                  {"name": "cancel_pending_order", "arguments": {"order_id": "W123"}}

Training time:    tokenizer.apply_chat_template() converts to model format
                  Qwen3.5 → <function=cancel_pending_order><parameter=order_id>W123</parameter></function>
                  Llama   → [TOOL_CALL] cancel_pending_order(order_id="W123")

Eval time:        Model outputs in ITS native format
                  Grader's parseToolCall() normalizes back to JSON for Jaccard scoring
```

No format-specific data generation needed. The tokenizer handles conversion at training time. The stack is: Unsloth (optimization wrapper) → TRL GRPOTrainer (training loop) → HuggingFace tokenizer (`apply_chat_template(messages, tools=tools)` converts to model format). The grader handles parsing at eval time.

**VERIFY**: The cloud training endpoint (LangDB Cloud) must pass the `tools` field from records through to the tokenizer. If the endpoint strips `tools` before tokenization, tool-calling training won't work. Check `cloud/src/server/rest.rs` for how training records are processed.

## Grader Output Format

The Jaccard grader must parse multiple tool-call output formats:
1. **Qwen3.5 XML**: `<function=name><parameter=key>value</parameter></function>`
2. **Hermes JSON**: `<tool_call>{"name": ...}</tool_call>`
3. **Raw JSON**: `{"name": "...", "arguments": {...}}`
4. **OpenAI object**: `{"tool_calls": [{"function": {"name": "...", "arguments": "..."}}]}`

The grader's `parseToolCall()` handles all 4 formats — it normalizes to `{name, arguments}` before Jaccard scoring.

## References

- ToolRL (arXiv:2504.13958) — Reward design for tool-calling GRPO
- Tool Zero (arXiv:2511.01934) — Pure RL for tool calling
- OTC (arXiv:2504.14870) — Optimal tool calls via RL
- Multi-Turn RL (arXiv:2604.02869) — Multi-turn tool-calling agents
- Fission-GRPO (arXiv:2601.15625) — Recovery from execution errors
- tau-bench (arXiv:2406.12045) — Tool-agent-user benchmark
- OpenAI Function Calling Finetuning — Platform format spec
- Qwen Function Calling — Native tool-calling support
