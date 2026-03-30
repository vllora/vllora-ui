# NeMo Data Designer — Column Reference

Complete reference for all column types available in the vLLora NeMo service (`data-designer==0.5.2`), including built-in types and the two custom plugins shipped with this service.

---

## Column Execution Model

Columns run in dependency order. Each column can reference any **earlier** column value using `{{column_name}}` (Jinja2) in prompts and expressions. This enables **programmatic composition**: generate individual pieces across multiple columns, then assemble them into a final `user_message` or `system_prompt`.

```
seed columns (topic, chunk_text, topic_path, ...)
      ↓
rag-retrieval       → retrieved_chunks
      ↓
sampler             → difficulty, persona, doc_type
      ↓
llm-structured      → extracted_fields   (JSON: {"header": ..., "line_items": [...]})
      ↓
expression          → formatted_context  (Jinja2: combine extracted_fields + chunk_text)
      ↓
llm-text            → system_prompt      (references {{topic_path}}, {{difficulty}})
llm-text            → user_message       (references {{formatted_context}}, {{doc_type}})
llm-text            → reference_answer   (references {{user_message}}, {{retrieved_chunks}})
      ↓
llm-judge ×3        → judge_answerable, judge_groundedness, judge_specificity
rag-relevancy       → score_relevancy
```

**Columns NOT in the final dataset** use `"drop": true` — useful for intermediate extraction steps you don't want in training records.

---

## Built-in Column Types

### `sampler` — Categorical and statistical sampling

Generates values without an LLM. Use for variation axes: difficulty, persona, document type, tone.

```json
{
  "name": "difficulty",
  "column_type": "sampler",
  "sampler_type": "category",
  "params": {
    "values": ["beginner", "intermediate", "advanced"],
    "weights": [0.3, 0.4, 0.3]
  }
}
```

**Fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sampler_type` | string | required | See sampler types below |
| `params` | object | required | Type-specific params object |
| `conditional_params` | object | `{}` | Override params based on another column value: `{"easy": {"values": [...]}}` |
| `convert_to` | string | null | Cast output to `"int"`, `"float"`, `"str"`, `"bool"` |

**Sampler types:**

| `sampler_type` | Params fields | Use for |
|----------------|--------------|---------|
| `category` | `values: list`, `weights?: list[float]` | Pick from a fixed list (with optional weights) |
| `subcategory` | `category: str`, `values: dict[str, list]` | Pick from sublists keyed by a parent column's value |
| `uuid` | `prefix?: str`, `short_form?: bool`, `uppercase?: bool` | Unique IDs |
| `uniform` | `low: float`, `high: float`, `decimal_places?: int` | Random float in range |
| `gaussian` | `mean: float`, `stddev: float`, `decimal_places?: int` | Normal distribution |
| `bernoulli` | `p: float` | Binary 0/1 with probability p |
| `bernoulli_mixture` | `p: float`, `dist_name: str`, `dist_params: dict` | Bernoulli + continuous mix |
| `binomial` | `n: int`, `p: float` | Count of successes in n trials |
| `poisson` | `mean: float` | Count with Poisson rate |
| `scipy` | `dist_name: str`, `dist_params: dict`, `decimal_places?: int` | Any `scipy.stats` distribution |
| `datetime` | `start: str`, `end: str`, `unit?: "Y"\|"M"\|"D"\|"h"\|"m"\|"s"` | Random datetime in range |
| `timedelta` | `dt_min: int`, `dt_max: int`, `reference_column_name: str`, `unit?` | Offset from another datetime column |
| `person` | `locale?: str`, `sex?: "Male"\|"Female"`, `city?`, `age_range?: [min,max]` | Realistic persona object (name, address, email, …) |
| `person_from_faker` | same as person (uses Faker library) | Persona without Nemotron personas dataset |

**`subcategory` example** (pick invoice type, then pick a sub-field based on that type):
```json
{
  "name": "invoice_section",
  "column_type": "sampler",
  "sampler_type": "subcategory",
  "params": {
    "category": "doc_type",
    "values": {
      "invoice": ["header", "line_items", "totals", "payment_terms"],
      "purchase_order": ["vendor_info", "shipping", "line_items", "approval"],
      "receipt": ["merchant", "items", "taxes", "total"]
    }
  }
}
```

---

### `llm-text` — Free-form LLM text generation

The workhorse for `system_prompt`, `user_message`, `reference_answer`, and any narrative column.

```json
{
  "name": "user_message",
  "column_type": "llm-text",
  "model_alias": "openai-text",
  "prompt": "Generate a question about {{invoice_section}} of a {{doc_type}} document...\n\nContext:\n{{retrieved_chunks}}"
}
```

**Fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `prompt` | string | required | Jinja2 template. Reference any earlier column with `{{col_name}}` |
| `model_alias` | string | required | Model to call (use `"openai-text"` for OpenAI) |
| `system_prompt` | string | null | Optional system prompt (Jinja2, same variable access) |
| `with_trace` | string | `"none"` | Capture conversation trace: `"none"`, `"last_message"`, `"all_messages"` |
| `extract_reasoning_content` | bool | `false` | Extract `<think>` blocks into `{name}__reasoning_content` column |
| `tool_alias` | string | null | Reference a ToolConfig for MCP tool use |
| `drop` | bool | `false` | Generate but exclude from final dataset |

**Side effects** (auto-created columns):
- `{name}__trace` — when `with_trace` is not `"none"`
- `{name}__reasoning_content` — when `extract_reasoning_content` is `true`

**Temperature/max_tokens:** Pass via the model alias config in the server, not per-column.

---

### `llm-code` — Code generation

Like `llm-text` but auto-extracts code from markdown fences and validates syntax.

```json
{
  "name": "extraction_script",
  "column_type": "llm-code",
  "model_alias": "openai-text",
  "code_lang": "python",
  "prompt": "Write a Python function that extracts the total amount from this invoice text:\n\n{{chunk_text}}"
}
```

**Additional field:**

| Field | Type | Required | Description |
|-------|------|---------|-------------|
| `code_lang` | string | yes | Language: `"python"`, `"javascript"`, `"typescript"`, `"sql:postgres"`, `"sql:sqlite"`, `"sql:mysql"`, `"sql:tsql"`, `"sql:bigquery"`, `"sql:ansi"`, `"go"`, `"rust"`, `"java"`, `"cpp"`, `"csharp"`, `"bash"`, `"ruby"`, `"kotlin"`, `"scala"`, `"swift"`, `"c"`, `"cobol"` |

All `llm-text` fields apply.

---

### `llm-structured` — Structured JSON output (schema-guaranteed)

Generates JSON that strictly validates against a Pydantic model or JSON schema. Essential for **programmatic composition** — extract structured sub-fields from documents, then reference individual fields downstream.

```json
{
  "name": "invoice_fields",
  "column_type": "llm-structured",
  "model_alias": "openai-text",
  "drop": true,
  "prompt": "Extract key fields from this invoice excerpt.\n\n{{chunk_text}}",
  "output_format": {
    "type": "object",
    "properties": {
      "vendor_name": {"type": "string"},
      "invoice_number": {"type": "string"},
      "total_amount": {"type": "number"},
      "line_items": {
        "type": "array",
        "items": {"type": "object", "properties": {"description": {"type": "string"}, "amount": {"type": "number"}}}
      }
    },
    "required": ["vendor_name", "invoice_number", "total_amount"]
  }
}
```

Downstream columns can then reference `{{invoice_fields}}` (full JSON string) or combine it via an `expression` column to access sub-fields.

**Additional field:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `output_format` | object | yes | JSON schema dict or Pydantic model class. Output guaranteed to validate. |

All `llm-text` fields apply.

---

### `llm-judge` — LLM scoring / quality gate

Scores a row on one or more dimensions. Used for dataset quality filtering — not the training objective (that's `grader.js`).

```json
{
  "name": "judge_groundedness",
  "column_type": "llm-judge",
  "model_alias": "openai-text",
  "prompt": "How well is the answer supported by the context?\n\nQuestion: {{user_message}}\nAnswer: {{reference_answer}}\nContext: {{retrieved_chunks}}",
  "scores": [
    {
      "name": "groundedness",
      "description": "Whether every claim in the answer is directly supported by the retrieved context.",
      "options": {
        "0": "Not grounded — answer contains claims absent from context.",
        "0.5": "Partially grounded — most claims supported but some require outside knowledge.",
        "1": "Fully grounded — every claim is directly supported by context."
      }
    }
  ]
}
```

**`scores` field:**

Each entry in the `scores` list defines one scoring dimension:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Dimension name — becomes a sub-column |
| `description` | string | yes | Guides the LLM on how to evaluate |
| `options` | `dict[int\|str, str]` | yes | Maps score value → description. Supports integers, floats as strings (`"0.5"`), or labels |

**Score option patterns:**

| Pattern | Use for | Example |
|---------|---------|---------|
| `{"0": "...", "1": "..."}` | Binary (AspectCritic, Specificity) | Answerable yes/no |
| `{"0": "...", "0.5": "...", "1": "..."}` | 3-level (Groundedness) | None/partial/full |
| `{"1": "...", "2": "...", "3": "...", "4": "...", "5": "..."}` | 5-point rubric | Helpfulness, fluency |

Multiple scores in one column = multiple dimensions evaluated in one LLM call:
```json
"scores": [
  {"name": "relevance", "description": "...", "options": {"1": "...", "2": "...", "3": "..."}},
  {"name": "fluency",   "description": "...", "options": {"1": "...", "2": "...", "3": "..."}}
]
```

All `llm-text` fields apply.

---

### `expression` — Jinja2 transformation (no LLM)

Derive a new column from existing ones using Jinja2 templates. Free, instant, no tokens. Use for:
- Reformatting/combining extracted fields
- Conditional logic
- Building context strings to pass to later LLM columns

```json
{
  "name": "invoice_context",
  "column_type": "expression",
  "drop": true,
  "expr": "Vendor: {{invoice_fields.vendor_name}}\nTotal: ${{invoice_fields.total_amount}}\nSection: {{invoice_section}}\n\nSource Text:\n{{chunk_text}}"
}
```

**Fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `expr` | string | required | Jinja2 expression. Supports filters, conditionals, arithmetic |
| `dtype` | string | `"str"` | Cast output to `"int"`, `"float"`, `"str"`, or `"bool"` |

**Jinja2 capabilities:**
```
{{col}}                          — plain substitution
{{col | upper}}                  — string filters (upper, lower, strip, replace, …)
{{col | truncate(200)}}          — truncate long text
{% if difficulty == "advanced" %}...{% endif %}  — conditionals
{{val | int + 1}}                — arithmetic
{{col | default("fallback")}}    — default if empty
```

---

### `embedding` — Vector embeddings

Generates a dense vector for a text column. Use for downstream similarity/clustering — rarely needed in recipe files.

```json
{
  "name": "chunk_embedding",
  "column_type": "embedding",
  "target_column": "chunk_text",
  "model_alias": "openai-embedding"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `target_column` | string | yes | Column containing text to embed |
| `model_alias` | string | yes | Embedding model alias |

---

### `validation` — Rule-based quality checks

Validates column values against rules. Returns pass/fail. Use for checking generated code compiles, JSON parses, or custom business logic.

```json
{
  "name": "code_valid",
  "column_type": "validation",
  "target_columns": ["extraction_script"],
  "validator_type": "code",
  "validator_params": {"code_lang": "python"}
}
```

| Validator type | `validator_params` fields | Use for |
|----------------|--------------------------|---------|
| `"code"` | `code_lang: str` | Syntax-check generated code |
| `"local_callable"` | `validation_function: callable`, `output_schema?: dict` | Custom Python function check |
| `"remote"` | `endpoint_url: str`, `timeout?: float`, `max_retries?: int` | Call external validation API |

**Additional fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `target_columns` | list[str] | required | Columns to validate |
| `batch_size` | int | `10` | Rows per validation batch |

---

### `image` — Image generation

Generates images from prompt text using a configured image model.

```json
{
  "name": "diagram",
  "column_type": "image",
  "model_alias": "openai-image",
  "prompt": "Technical diagram showing {{topic_name}} concept"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | yes | Jinja2 image description template |
| `model_alias` | string | yes | Image model alias |
| `multi_modal_context` | list | null | Input images for image-to-image workflows |

---

### `seed-dataset` — Seed column passthrough

Passes a column from the seed dataset through unchanged. Rarely used directly — seed columns are already available to all other columns.

---

### `custom` — Python function generator

Call any Python function as a column generator. Registered via `@custom_column_generator` decorator.

```python
from data_designer.plugins import custom_column_generator

@custom_column_generator(
    required_columns=["user_message", "reference_answer"],
    side_effect_columns=[],
)
def bleu_score_generator(row: dict) -> float:
    from nltk.translate.bleu_score import sentence_bleu
    ref = row["reference_answer"].split()
    hyp = row["user_message"].split()
    return sentence_bleu([ref], hyp)
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `generator_function` | callable | required | Function decorated with `@custom_column_generator` |
| `generation_strategy` | string | `"cell_by_cell"` | `"cell_by_cell"` (row dict) or `"full_column"` (full DataFrame) |
| `generator_params` | BaseModel | null | Extra config passed to the function |

Function signature variants:
- `fn(row: dict) -> value`
- `fn(df: pd.DataFrame) -> value`  (with `full_column` strategy)
- `fn(row, params: BaseModel) -> value`
- `fn(row, params, models: dict) -> value`  (for LLM access)

---

## Custom vLLora Plugins

Two custom `COLUMN_GENERATOR` plugins are registered in this NeMo service (see `nemo/pyproject.toml`).

---

### `rag-retrieval` — Gateway knowledge search per row

Calls `POST /finetune/workflows/{workflow_id}/knowledge/search` for each row and writes concatenated chunk text into the column. Enriches each seed row with fresh, query-specific knowledge at generation time.

```json
{
  "name": "retrieved_chunks",
  "column_type": "rag-retrieval",
  "workflow_id": "YOUR_WORKFLOW_ID",
  "gateway_url": "http://localhost:9090",
  "top_k": 15,
  "query_field": "topic_path"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `workflow_id` | string | required | Gateway workflow ID |
| `gateway_url` | string | `"http://localhost:9090"` | Gateway base URL |
| `top_k` | int (1–100) | `15` | Number of chunks to retrieve |
| `query_field` | string | `"topic_query"` | Seed column to use as search phrase. Use `"topic_path"` for curated seeds |

**Output:** Chunks concatenated with `\n\n---\n\n` separator. Reference as `{{retrieved_chunks}}` in downstream columns.

**Required columns:** `[query_field]`

---

### `rag-relevancy` — ResponseRelevancy proxy (Jaccard similarity)

Searches the gateway with two row fields and returns the **Jaccard similarity** (0.0–1.0) of the returned part ID sets. Implements the paper's *ResponseRelevancy* metric using retrieval overlap rather than embedding similarity.

```json
{
  "name": "score_relevancy",
  "column_type": "rag-relevancy",
  "workflow_id": "YOUR_WORKFLOW_ID",
  "gateway_url": "http://localhost:9090",
  "top_k": 10,
  "query_field_a": "user_message",
  "query_field_b": "reference_answer"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `workflow_id` | string | required | Gateway workflow ID |
| `gateway_url` | string | `"http://localhost:9090"` | Gateway base URL |
| `top_k` | int (1–100) | `10` | Chunks to retrieve per query |
| `query_field_a` | string | `"user_message"` | First field (typically the question) |
| `query_field_b` | string | `"reference_answer"` | Second field (typically the answer) |

**Output:** Float 0.0–1.0. Score > 0.5 = question and answer retrieve the same knowledge → semantically aligned.

**Paper mapping:** *ResponseRelevancy* from RAGAS (arXiv 2509.25736). Paper threshold: `> 0.5`.

**Required columns:** `[query_field_a, query_field_b]`

---

## Programmatic Composition Patterns

### Pattern 1: Extract → Compose → Generate

For structured documents (invoices, contracts, specs), extract fields first, then compose into prompts:

```json
[
  {
    "name": "doc_section",
    "column_type": "sampler",
    "sampler_type": "subcategory",
    "params": {
      "category": "doc_type",
      "values": {
        "invoice": ["header", "line_items", "totals", "payment_terms"],
        "purchase_order": ["vendor_info", "line_items", "shipping"]
      }
    }
  },
  {
    "name": "extracted_fields",
    "column_type": "llm-structured",
    "model_alias": "openai-text",
    "drop": true,
    "prompt": "Extract the {{doc_section}} section from this document.\n\n{{chunk_text}}",
    "output_format": {
      "type": "object",
      "properties": {
        "section_title": {"type": "string"},
        "key_values": {"type": "object"},
        "summary": {"type": "string"}
      }
    }
  },
  {
    "name": "structured_context",
    "column_type": "expression",
    "drop": true,
    "expr": "Section: {{doc_section}}\nKey fields: {{extracted_fields}}\n\nFull text:\n{{retrieved_chunks}}"
  },
  {
    "name": "user_message",
    "column_type": "llm-text",
    "model_alias": "openai-text",
    "prompt": "Generate a realistic question about the {{doc_section}} of this {{doc_type}} for a {{difficulty}} learner.\n\n{{structured_context}}\n\nReturn only the question."
  }
]
```

### Pattern 2: Multi-aspect scoring

Score the same row on multiple independent dimensions in separate judge columns, then filter downstream:

```json
[
  {"name": "judge_answerable", "column_type": "llm-judge", ...},
  {"name": "judge_groundedness", "column_type": "llm-judge", ...},
  {"name": "judge_specificity", "column_type": "llm-judge", ...},
  {"name": "score_relevancy", "column_type": "rag-relevancy", ...}
]
```

Filter in `convert_nemo_rows.py` using `--min-accuracy` and `--min-completeness` flags.

### Pattern 3: Conditional variation via `conditional_params`

Generate harder questions for advanced difficulty:

```json
{
  "name": "question_style",
  "column_type": "sampler",
  "sampler_type": "category",
  "params": {"values": ["definition lookup", "application", "analysis"]},
  "conditional_params": {
    "advanced": {"values": ["synthesis", "evaluation", "edge case analysis"]},
    "beginner": {"values": ["definition lookup", "basic comparison"]}
  }
}
```

Note: `conditional_params` keys match values from a **parent column** specified in the seed. This requires a column named after the key category — works when the parent column is `difficulty`.

### Pattern 4: Drop intermediate columns

Use `"drop": true` to generate intermediate extraction/transformation results that feed downstream columns but should NOT appear in the final training records:

```json
{
  "name": "raw_extraction",
  "column_type": "llm-structured",
  "drop": true,
  ...
}
```

The column is computed and available as `{{raw_extraction}}` but omitted from the dataset output and from `training.jsonl` conversion.

---

## RAGAS-Aligned Scoring Columns (vLLora Standard)

The default recipe template (`templates/nemo-recipe-template.json`) uses these 4 scoring columns aligned to the paper (arXiv 2509.25736):

| Column | Type | Paper Metric | Options | Filter Threshold |
|--------|------|-------------|---------|-----------------|
| `judge_answerable` | `llm-judge` | AspectCritic | `{"0": "...", "1": "..."}` | `= 1` (hard filter) |
| `judge_groundedness` | `llm-judge` | ResponseGroundedness | `{"0": "...", "0.5": "...", "1": "..."}` | `≥ 0.5` |
| `judge_specificity` | `llm-judge` | Tele-Specificity | `{"0": "...", "1": "..."}` | `= 1` |
| `score_relevancy` | `rag-relevancy` | ResponseRelevancy | 0.0–1.0 Jaccard | `> 0.5` |

These score for **dataset quality filtering** (via `convert_nemo_rows.py`). They are NOT the training objective — `grader.js` handles that at eval/training time.

---

## Shared Fields (All Column Types)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | required | Unique column identifier. Referenced as `{{name}}` in downstream prompts |
| `column_type` | string | required | Discriminator literal (see each type above) |
| `drop` | bool | `false` | Compute but exclude from final dataset output |
| `allow_resize` | bool | `false` | Allow column to be resized during generation |
