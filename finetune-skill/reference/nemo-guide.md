# NeMo Data Designer Guide

NeMo Data Designer generates synthetic training data from curated seed rows. It takes a pre-materialized parquet file as its seed, enriches each row at generation time using the gateway knowledge search (via the `rag-retrieval` plugin), then runs LLM columns to produce final prompt records.

**Architecture:**
```
materialize_seed.py → curated parquet
    → POST /seed/upload-curated
    → Recipe: curated seed + rag-retrieval column + llm-text columns
    → Preview job → review → Full job
    → GET /jobs/{id}/dataset
    → convert_nemo_rows.py → training.jsonl
    → validate_dataset.py --nemo
    → finetune.py upload-records
```

Base URL: `http://localhost:8000/api/data-recipe`

Requires `OPENAI_API_KEY` in `nemo/.env`. All LLM columns use `openai-text` by default.

---

## Prerequisites

- NeMo server running: `uv run uvicorn server:app --host 0.0.0.0 --port 8000` (from `nemo/`)
- Gateway running at `localhost:9090` with knowledge parts already uploaded and embedded
- `OPENAI_API_KEY` set in `nemo/.env`
- Topics and knowledge extracted (Steps 1–3 of the main pipeline)

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/seed/upload-curated` | POST | Upload a curated parquet seed file |
| `/seed/inspect-curated` | POST | Preview rows from an uploaded parquet |
| `/jobs` | POST | Create a preview or full generation job |
| `/jobs/{job_id}/status` | GET | Poll job status (`pending`, `active`, `completed`, `error`) |
| `/jobs/{job_id}/dataset` | GET | Fetch generated rows (paginated: `?limit=200&offset=0`) |
| `/jobs/{job_id}/analysis` | GET | Fetch Data Designer analysis for the completed job |

---

## Curated Seed

### Materialize the parquet

The seed parquet tells NeMo which rows to generate. All knowledge retrieval happens at generation time via `rag-retrieval` querying vLLora — the parquet just needs topic context.

**Topics-only mode (recommended for NeMo):** one row per leaf topic, no relations needed:

```bash
uv run nemo/materialize_seed.py \
  --topics finetune-project/topics.json \
  --output finetune-project/curated-seed.parquet
```

**Relations mode (legacy):** one row per (topic × part) pair — only needed if you want `chunk_text` pre-linked in the seed:

```bash
uv run nemo/materialize_seed.py \
  --topics finetune-project/topics.json \
  --relations finetune-project/relations.json \
  --knowledge finetune-project/knowledge/all-parts-index.json \
  --output finetune-project/curated-seed.parquet
```

Or per-topic (one parquet per leaf topic) with `--per-topic` (relations mode only).

**Parquet schema:**

| Column | Description |
|--------|-------------|
| `topic` | Topic ID (e.g., `csf-govern`) |
| `topic_name` | Topic display name (e.g., `GOVERN Function`) |
| `topic_path` | Full path (e.g., `CSF Core Functions > GOVERN Function`) |
| `part_id` | Knowledge part ID |
| `chunk_text` | Content of the knowledge part |
| `title` | Part title |
| `source_file` | Source document name |
| `source_parts` | JSON array of part IDs |

Each row = one topic × one knowledge part pair. Rows become the seed for NeMo generation.

### Upload the parquet

```bash
BLOCK_ID=$(date +%s)
curl -sS -X POST "http://localhost:8000/api/data-recipe/seed/upload-curated" \
  -F "file=@finetune-project/curated-seed.parquet" \
  -F "block_id=$BLOCK_ID" \
  > finetune-project/nemo-seed-upload.json

cat finetune-project/nemo-seed-upload.json
# Response: { "file_id": "...", "columns": [...], "num_rows": N, "topics": [...] }
```

Save the `file_id` — you'll use it in `inspect-curated` and in the recipe `path`.

### Inspect (preview rows)

```bash
FILE_ID=$(jq -r '.file_id' finetune-project/nemo-seed-upload.json)
curl -sS -X POST "http://localhost:8000/api/data-recipe/seed/inspect-curated" \
  -H "Content-Type: application/json" \
  -d "{\"block_id\": \"$BLOCK_ID\", \"file_id\": \"$FILE_ID\", \"preview_size\": 10}" \
  > finetune-project/nemo-seed-inspect.json
```

Optionally add `"topic_filter": "csf-govern"` to preview a single topic.

The `resolved_path` in the response is the internal server path to use as `seed_config.source.path` in the recipe.

---

## `rag-retrieval` Column Plugin

The `rag-retrieval` plugin is a custom NeMo Data Designer column generator that calls the gateway knowledge search API for each row. It enriches each seed row with freshly retrieved chunks at generation time — sharper and more question-specific than the static seed content.

**Config fields:**

| Field | Default | Description |
|-------|---------|-------------|
| `workflow_id` | (required) | Gateway workflow ID |
| `gateway_url` | `http://localhost:9090` | Gateway base URL |
| `top_k` | `15` | Number of chunks to retrieve |
| `query_field` | `topic_query` | Row field used as the search query |

**Recommended `query_field`:** Use `"topic_path"` for curated seeds — it contains the full hierarchical path (e.g., `CSF Core Functions > GOVERN Function`) which gives a good search query.

**What it does:** For each row, it POSTs `{"phrase": row[query_field], "top_k": top_k}` to `POST /finetune/workflows/{workflow_id}/knowledge/search` and writes the concatenated chunk content into the named column (separated by `\n\n---\n\n`).

**In the recipe:**
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

Downstream LLM columns reference `{{retrieved_chunks}}` in their prompts.

---

## Column Types

> **Full reference:** See [`nemo-columns-reference.md`](nemo-columns-reference.md) for all column types, every config field, sampler params, and programmatic composition patterns.

| Type | Description | Typical Use |
|------|-------------|-------------|
| `rag-retrieval` | Fetches chunks from gateway per row | `retrieved_chunks` |
| `rag-relevancy` | Scores relevancy between two row fields via retrieval overlap | `score_relevancy` |
| `llm-text` | Calls an LLM to produce text | `system_prompt`, `user_message`, `reference_answer` |
| `llm-structured` | LLM output guaranteed to match a JSON schema | Extract structured fields from documents |
| `llm-code` | LLM code generation with auto-extraction from markdown fences | Code generation tasks |
| `llm-judge` | Scores a row for quality (binary, 3-level, or custom scale) | `judge_answerable`, `judge_groundedness`, `judge_specificity` |
| `sampler` | Samples from a list, distribution, or statistical function | `difficulty`, `persona`, `tone`, `doc_type` |
| `expression` | Jinja2 template transformation (no LLM, instant) | Combine/reformat columns into a context string |
| `embedding` | Generate vector embeddings for a text column | Similarity/clustering downstream |
| `validation` | Syntax/logic check on generated code or JSON | Quality gate for `llm-code` outputs |

### `rag-relevancy` Column

Searches the gateway with two row fields and returns the **Jaccard similarity** of the returned part ID sets as a 0.0–1.0 score. Implements the paper's *ResponseRelevancy* metric using retrieval overlap rather than embedding cosine similarity.

**Config fields:**

| Field | Default | Description |
|-------|---------|-------------|
| `workflow_id` | (required) | Gateway workflow ID |
| `gateway_url` | `http://localhost:9090` | Gateway base URL |
| `top_k` | `10` | Chunks to retrieve per query |
| `query_field_a` | `user_message` | First field (e.g. the question) |
| `query_field_b` | `reference_answer` | Second field (e.g. the answer) |

**Interpretation:** if question and answer retrieve the same knowledge chunks, they're semantically aligned. Paper threshold: `> 0.5`.

### `llm-judge` Columns (RAGAS-Aligned)

The recipe template uses 3 `llm-judge` columns that map to paper metrics. `Score.options` keys can be integers for numeric filtering:

| Column | Paper Metric | Options | Threshold |
|--------|-------------|---------|-----------|
| `judge_answerable` | AspectCritic | `{0, 1}` | `= 1` (hard filter) |
| `judge_groundedness` | ResponseGroundedness | `{0, 0.5, 1}` | `≥ 0.5` |
| `judge_specificity` | Tele-Specificity | `{0, 1}` | `= 1` |

Judge columns are for dataset QA — filter weak rows before training. They are NOT the training objective. That remains `grader.js` running at evaluation/training time.

### `llm-text`

Use `{{variable}}` to reference seed columns and earlier columns in prompts. Set `model_alias: "openai-text"` for the default OpenAI integration.

### `sampler`

```json
{
  "name": "difficulty",
  "column_type": "sampler",
  "sampler_type": "category",
  "params": { "values": ["beginner", "intermediate", "advanced"] }
}
```

---

## Recipe Design

**Output contract (fixed — always required):**

| Column | Goes to | Notes |
|--------|---------|-------|
| `system_prompt` | `messages[0]` in training.jsonl | Required by our export format; not a paper-specific stage |
| `user_message` | `messages[1]` in training.jsonl | Required; this is the final refined question |
| `reference_answer` | metadata sidecar | Strongly recommended for grader writing + review |
| Everything else | metadata sidecar or dropped | Design choice |

Any intermediate column that feeds downstream columns but shouldn't appear in the dataset should use `"drop": true`.

**Choose your pipeline based on domain type:**

| Domain type | Approach | Template |
|-------------|----------|----------|
| Topic-based Q&A (policies, tutorials, knowledge bases) | Direct generation — `rag-retrieval` → `llm-text` for each output | `templates/nemo-recipe-template.json` |
| Structured documents (invoices, contracts, forms, specs) | Programmatic composition — extract fields first, compose context, then generate | `templates/nemo-recipe-structured-template.json` |

**Two-stage question generation pattern (recommended — both templates use this):**

Based on arxiv 2509.25736: generate a diverse question from topic context first, then retrieve chunks specific to that question and ground it.

The paper defines the generation and filtering method. Our exported `training.jsonl` rows still require final `system_prompt` and `user_message` fields because that is the fixed message contract used by the rest of the finetune pipeline.

```
topic_path ──→ rag-retrieval   → retrieved_chunks  (broad topic context, for system_prompt)
                     ↓
               raw_question    (drop: true — diverse question, no retrieved text to avoid bias)
                     ↓
raw_question ──→ rag-retrieval → question_chunks   (drop: true — question-specific retrieval)
                     ↓
               user_message    (refines raw_question using question_chunks)
                reference_answer, judges (all use question_chunks)
```

**Programmatic composition pattern (structured documents):**

```
rag-retrieval      → retrieved_chunks
sampler            → doc_section        (which section to focus on — subcategory per topic)
llm-structured     → extracted_fields   (drop: true — JSON fields extracted from chunk)
expression         → composed_context   (drop: true — Jinja2 combine fields + text)
raw_question       → (drop: true — Stage 1 question, topic + section only)
rag-retrieval      → question_chunks    (drop: true — question-specific retrieval)
llm-text           → system_prompt, user_message, reference_answer
judge/score cols   → filtering metadata
```

Use `"drop": true` on any intermediate column that exists only to feed later `{{variable}}` references. Dropped columns are computed but excluded from the final dataset and metadata sidecar.

See `reference/nemo-columns-reference.md` for complete column type documentation.

---

## Recipe Structure

```json
{
  "recipe": {
    "seed_config": {
      "source": {
        "seed_type": "curated",
        "path": "<resolved_path from inspect-curated>",
        "topic_filter": null
      }
    },
    "columns": [ ... ]
  },
  "run": {
    "rows": 100,
    "execution_type": "full",
    "run_name": "my-project-run"
  }
}
```

Set `execution_type: "preview"` and `rows: 10` first, then switch to `"full"` after the preview passes.

**Simple domain (topic Q&A):** Copy `templates/nemo-recipe-template.json`, replace placeholders, adapt prompts.
**Structured docs:** Copy `templates/nemo-recipe-structured-template.json`, adapt `output_format` schema and section sampler values.

> **Important:** `_comment` fields are **not allowed inside column objects** — NeMo's pydantic schema uses `extra="forbid"` and will reject the job with "Extra inputs are not permitted". The templates only use `_comment` at the top level of the JSON (outside `"recipe"`/`"run"`), which is safe. Never add `_comment` inside a column definition.

> **Important:** Seed columns (e.g., `topic_path`) can become unavailable in Jinja2 template contexts for `llm-text` and `llm-structured` columns that run after `drop:true` columns. The templates work around this by including a `topic_context` expression column immediately after the first `rag-retrieval`:
> ```json
> {"name": "topic_context", "column_type": "expression", "expr": "{{ topic_path }}"}
> ```
> This re-materializes `topic_path` as a regular generated column guaranteed to stay in the row context. All llm-text prompts use `{{topic_context}}` instead of `{{topic_path}}`. The `rag-retrieval` `query_field` still references `"topic_path"` directly (that's a field lookup, not Jinja2, so seed data is always accessible there).

---

## Preview Health Gate

Always preview before the full job. Use both endpoints for different checks:

- **`/jobs/{id}/dataset`** — semantic check: are the generated rows coherent, domain-grounded prompts? Is `retrieved_chunks` populated with relevant text? Are `system_prompt` / `user_message` useful?
- **`/jobs/{id}/analysis`** — structural check: expected row count, no null columns, sampler distribution balanced, no obviously broken columns

A preview is healthy when:
- `retrieved_chunks` contains relevant domain text (not empty)
- `user_message` is a specific, answerable question
- Judge scores align with what you see in the rows
- Analysis shows expected row count and no broken columns

If not healthy, fix the recipe (adjust prompts, `top_k`, `query_field`) and re-run preview.

---

## Running Jobs

**Preview:**
```bash
# Set execution_type: "preview", rows: 10 in the recipe file
curl -sS -X POST "http://localhost:8000/api/data-recipe/jobs" \
  -H "Content-Type: application/json" \
  -d @finetune-project/nemo-recipe.json \
  > finetune-project/nemo-preview.json

PREVIEW_JOB_ID=$(jq -r '.job_id' finetune-project/nemo-preview.json)

# Poll until completed
curl -sS "http://localhost:8000/api/data-recipe/jobs/$PREVIEW_JOB_ID/status"

# Inspect
curl -sS "http://localhost:8000/api/data-recipe/jobs/$PREVIEW_JOB_ID/dataset?limit=20" \
  > finetune-project/nemo-preview-dataset.json
curl -sS "http://localhost:8000/api/data-recipe/jobs/$PREVIEW_JOB_ID/analysis" \
  > finetune-project/nemo-preview-analysis.json
```

**Full job** (after preview passes — update execution_type to "full" and rows to target count):
```bash
JOB_ID=$(jq -r '.job_id' finetune-project/nemo-job.json)
curl -sS "http://localhost:8000/api/data-recipe/jobs/$JOB_ID/status"

# Page through dataset (200 rows at a time)
curl -sS "http://localhost:8000/api/data-recipe/jobs/$JOB_ID/dataset?limit=200&offset=0" \
  > finetune-project/nemo-dataset-page-1.json
```

---

## Conversion and Validation

**Convert NeMo rows to training.jsonl:**
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/convert_nemo_rows.py \
  --input finetune-project/nemo-dataset-page-1.json \
  --output finetune-project/training.jsonl \
  --include-ground-truth
```

Filter by RAGAS-aligned judge scores with `--min-answerable 1.0 --min-groundedness 0.5 --min-specificity 1.0 --min-relevancy 0.5`. The converter detects all `judge_*`/`score_*` columns dynamically — no hardcoded field lists. It writes `nemo-metadata.jsonl` alongside `training.jsonl` with reference_answer, judge scores, and source fields.

**Validate:**
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/validate_dataset.py \
  finetune-project/training.jsonl --nemo
```

The `--nemo` flag checks for accidentally included metadata fields (e.g. reference_answer, chunk_text) that should be in the sidecar, not the training records.

**Upload to gateway:**
```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/finetune.py upload-records \
  --workflow-id $WORKFLOW_ID --file finetune-project/training.jsonl
```

---

## Recommended Row Shape

### Final NeMo Row (before conversion)

| Field | Goes to training? | Notes |
|-------|-------------------|-------|
| `system_prompt` | Yes → `messages[0]` | Role definition |
| `user_message` | Yes → `messages[1]` | The RFT prompt |
| `reference_answer` | No → metadata sidecar | For grader writing and offline review |
| `retrieved_chunks` | No → metadata sidecar | Source material used during generation |
| `chunk_text` | No → metadata sidecar | Original seed chunk |
| `topic_path` | No → metadata sidecar | Topic context |
| `judge_answerable` | No → metadata sidecar | AspectCritic score (0/1) — filter: = 1 |
| `judge_groundedness` | No → metadata sidecar | ResponseGroundedness (0/0.5/1) — filter: ≥ 0.5 |
| `judge_specificity` | No → metadata sidecar | Tele-Specificity (0/1) — filter: = 1 |
| `score_relevancy` | No → metadata sidecar | ResponseRelevancy Jaccard (0–1) — filter: > 0.5 |

### vLLora Training Record

```json
{
  "messages": [
    {"role": "system", "content": "You are a NIST CSF 2.0 expert..."},
    {"role": "user", "content": "What are the six categories under GOVERN?"}
  ],
  "id": "nemo-0001"
}
```

No assistant message — vLLora uses reinforcement fine-tuning where the model generates its own response and `grader.js` scores it.

---

## Troubleshooting

### `topic_path` columns are missing (PromptTemplateRenderError)

**Symptom**: NeMo logs `"The following ['topic_path'] columns are missing!"` for `system_prompt`, `user_message`, or `reference_answer`. All rows fail for those columns.

**Cause**: NeMo DataDesigner drops seed columns from the Jinja2 context after any `drop:true` column processes. In a two-stage recipe, `raw_question` and `question_chunks` are both `drop:true`, so by the time `system_prompt` runs, `topic_path` is gone from the row context.

**Fix**: Never reference `{{topic_path}}` directly in `llm-text` or `llm-structured` prompts. The provided templates include a `topic_context` expression column (column #2, right after `retrieved_chunks`) that re-materializes `topic_path` as a non-dropped generated column. Use `{{topic_context}}` in all prompts. This column survives the post-drop:true context reset.

If you wrote a custom recipe by hand and see this error, add the passthrough column:
```json
{"name": "topic_context", "column_type": "expression", "expr": "{{ topic_path }}"}
```
Place it early in the column list (before any `drop:true` column), then replace all `{{topic_path}}` in prompts with `{{topic_context}}`.

---

### `retrieved_chunks` not found in dataset

**Symptom**: `"Error profiling preview dataset: Column 'retrieved_chunks' not found in dataset"`. The rag-retrieval column simply doesn't appear.

**Cause**: The rag-retrieval plugin threw an HTTP exception (4xx/5xx from the gateway or a connection error). NeMo previously silenced this completely. The plugin now prints a `[rag-retrieval] ERROR ...` line to NeMo server stdout with the actual HTTP status and response body — check there first.

**Common causes:**
- Wrong `workflow_id` → gateway returns 404
- Knowledge not indexed for this workflow (embeddings not generated yet) → gateway returns 404 or empty matches
- Gateway not running at the configured `gateway_url`

**Use `gateway-ping` to diagnose before running a job:**
```bash
curl -sS -X POST "http://localhost:8000/api/data-recipe/gateway-ping" \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "YOUR_WORKFLOW_ID", "query": "test"}'
```

Returns `{"ok": true, "status": 200, "body": {"matches": [...]}}` if working, or `{"ok": false, "status": 404, ...}` / `{"ok": false, "error": "Connection refused"}` if not.

**If `retrieved_chunks` exists but is empty**: the HTTP call succeeded but the search returned no matches. The workflow's knowledge base is empty or embeddings haven't been generated yet. Ensure knowledge sources for this workflow have been processed by the gateway.

---

## NeMo Judge vs vLLora Grader

| | NeMo Judge | vLLora Grader |
|---|-----------|---------------|
| When | During data generation | During evaluation and training |
| What it scores | Synthetic prompt rows | Model responses at rollout time |
| Purpose | Filter weak rows before training | Define the training objective |
| Where | `judge_*` columns in NeMo recipe | `grader.js` |
| Required? | No — optional quality gate | Yes — required for training |
