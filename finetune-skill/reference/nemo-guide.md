# NeMo Data Designer Guide

NeMo Data Designer turns documents into synthetic training data. It reads source files (PDF, DOCX, TXT, MD), chunks them into seed rows, then runs a recipe of LLM generation and judge columns to produce final dataset rows.

Architecture: **seed -> recipe -> preview -> full job -> dataset rows -> convert to training.jsonl**

Base URL: `http://localhost:8000/api/data-recipe`

Requires `OPENAI_API_KEY` in `nemo/.env`. Copy `.env.example` and set your key. All columns use `openai-text` when relying on Data Designer's default OpenAI model settings.

---

## API Endpoints

### Seed Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/seed/upload-unstructured-file` | POST | Upload a file for text extraction and chunking |
| `/seed/inspect-upload` | POST | Chunk uploaded files and return preview seed rows |

**Upload a file:**
```bash
curl -sS -X POST "$NEMO_BASE_URL/seed/upload-unstructured-file"   -F "file=@document.pdf"   -F "block_id=$BLOCK_ID"
```

Response: `{"file_id": "...", "filename": "document.pdf"}`

**Inspect uploaded files (chunk and preview):**
```bash
curl -sS -X POST "$NEMO_BASE_URL/seed/inspect-upload"   -H "Content-Type: application/json"   -d '{
    "block_id": "'$BLOCK_ID'",
    "file_ids": ["file-id-1", "file-id-2"],
    "file_names": ["doc1.pdf", "doc2.pdf"],
    "preview_size": 10,
    "seed_source_type": "unstructured",
    "unstructured_chunk_size": 1200,
    "unstructured_chunk_overlap": 200
  }'
```

Response includes:
- `columns` - list of column names in seed rows (for example `chunk_text`, `source_file`)
- `preview` - sample seed rows
- `resolved_paths` - internal paths to use in recipe `seed_config.source.paths`

### Job Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/jobs` | POST | Create a preview or full generation job |
| `/jobs/{job_id}/status` | GET | Poll job status (`pending`, `active`, `completed`, `error`) |
| `/jobs/{job_id}/dataset` | GET | Fetch generated rows (paginated with `?limit=200&offset=0`) |
| `/jobs/{job_id}/analysis` | GET | Fetch Data Designer analysis for the completed job |

---

## Seed Types

### Unstructured Seeds

Used for turning documents into chunked text for synthetic data generation.

**Supported file types:**
- `.pdf` - extracted via `pymupdf4llm` -> markdown
- `.docx` - extracted via `mammoth` -> markdown
- `.txt` / `.md` - read directly as text

**Chunking parameters:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `unstructured_chunk_size` | 1200 | Target characters per chunk |
| `unstructured_chunk_overlap` | 200 | Overlap between consecutive chunks |

**Output seed columns:**
- `chunk_text` - extracted and chunked text content
- `source_file` - original filename

Each chunk becomes a seed row. Recipes use those chunk rows to synthesize prompt records and metadata.

---

## Recipe Structure

A recipe is the complete job payload sent to `POST /jobs`.

```json
{
  "recipe": {
    "seed_config": {
      "source": { ... }
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

### `seed_config`

```json
"seed_config": {
  "source": {
    "seed_type": "unstructured",
    "paths": ["<resolved_path_from_inspect>"],
    "chunk_size": 1200,
    "chunk_overlap": 200
  }
}
```

### `columns`

For RFT-oriented prompt generation, the recommended column set is:
- `system_prompt`
- `user_message`
- optional metadata such as `grading_rubric` and `supporting_passage`
- optional `judge_*` quality columns for filtering

`model_alias` should be `openai-text` when using Data Designer's default OpenAI configuration.

### `run`

| Field | Default | Description |
|-------|---------|-------------|
| `rows` | - | Number of rows to generate |
| `execution_type` | `full` | `preview` or `full` |
| `run_name` | - | Optional descriptive name |

---

## Column Types

| Type | Description | Typical Use |
|------|-------------|-------------|
| `llm-text` | Calls an LLM to produce text | `system_prompt`, `user_message`, `grading_rubric`, `supporting_passage` |
| `llm-judge` | Scores a generated row for quality | `judge_prompt_quality`, `judge_groundedness` |
| `sampler` | Selects from a predefined list | `difficulty`, `persona`, `tone` |

### `llm-text`

Use these to turn `chunk_text` into RFT prompt fields. The generated text can reference seed fields and earlier columns using `{{variable}}` placeholders.

### `llm-judge`

Judge columns are for dataset QA, not for the training objective. In the RFT flow here, the judge should score whether the prompt row is grounded, specific, and worth training on. This is different from the runtime `grader.js` used by vLLora.

### `sampler`

Categorical variation should use:

```json
{
  "name": "difficulty",
  "column_type": "sampler",
  "sampler_type": "category",
  "params": {
    "values": ["beginner", "intermediate", "advanced"]
  }
}
```

---

## Recommended RFT Row Shape

### Final NeMo Row (before conversion)

| Field | Type | Purpose | Goes to training? |
|-------|------|---------|-------------------|
| `system_prompt` | string | Assistant role and boundaries | Yes -> `messages[0]` |
| `user_message` | string | Prompt the model will respond to during RFT | Yes -> `messages[1]` |
| `grading_rubric` | string | Notes for grader writing and offline review | No, metadata |
| `supporting_passage` | string | Evidence excerpt from source material | No, metadata |
| `chunk_text` | string | Original seed chunk | No, metadata |
| `source_file` | string | Original filename | No, metadata |
| `judge_prompt_quality` | object | Judge scores/reasoning for row quality | No, metadata |

### Converted vLLora Training Record

```json
{
  "messages": [
    {"role": "system", "content": "<system_prompt>"},
    {"role": "user", "content": "<user_message>"}
  ],
  "id": "nemo-0001"
}
```

No assistant message is included because vLLora uses reinforcement fine-tuning: the model generates its own response and `grader.js` scores it.

### Metadata Sidecar

Everything else stays in `nemo-metadata.jsonl`, for example:

```json
{
  "id": "nemo-0001",
  "chunk_text": "...",
  "source_file": "chess.pdf",
  "grading_rubric": "- explain the centralization principle\n- ground claims in the cited game...",
  "supporting_passage": "...",
  "judge_prompt_quality": {
    "groundedness": {"score": "high", "reasoning": "..."},
    "prompt_quality": {"score": "high", "reasoning": "..."}
  }
}
```

Use metadata for:
- grader writing
- offline evaluation
- filtering weak prompt rows before training
- tracing rows back to source chunks

---

## vLLora Integration

Workflow:
1. Upload documents -> `POST /seed/upload-unstructured-file`
2. Inspect seeds -> `POST /seed/inspect-upload`
3. Write recipe -> start from `templates/nemo-recipe-template.json`
4. Preview -> `POST /jobs` with `execution_type: "preview"`
5. Review preview rows -> `GET /jobs/{id}/dataset`
6. Review preview analysis -> `GET /jobs/{id}/analysis`
7. Full run -> `POST /jobs` with `execution_type: "full"`
8. Fetch dataset -> `GET /jobs/{id}/dataset`
9. Convert -> `scripts/convert_nemo_rows.py`
10. Validate -> `scripts/validate_dataset.py --nemo`
11. Upload to gateway -> `scripts/finetune.py upload-records`

### NeMo Judge vs vLLora Grader

| | NeMo Judge | vLLora Grader |
|---|-----------|---------------|
| When | During data generation | During evaluation and training |
| What it scores | Synthetic prompt rows | Model responses |
| Purpose | Filter weak rows before training | Define the training objective |
| Where | `judge_*` recipe columns | `grader.js` |

### Conversion

```bash
uv run ui/finetune-skill/scripts/convert_nemo_rows.py   --input finetune-project/nemo-preview.json   --output finetune-project/training.jsonl
```

The converter keeps `system_prompt` and `user_message` in training messages and writes all other row fields to `nemo-metadata.jsonl`.


---

## Preview Health Gate

Use both preview endpoints before scaling from a small run to a larger one:

- `/jobs/{job_id}/dataset` is the semantic check. Read sampled rows and confirm the prompts are grounded, specific, and worth training on.
- `/jobs/{job_id}/analysis` is the structural check. It reports Data Designer analysis such as record counts, side-effect columns, null/unique counts, sampler distribution, and token usage by column.

Analysis is useful for answering:
- Did the run produce the expected number of rows?
- Are sampler columns distributed sensibly?
- Are any columns mostly null or obviously broken?
- Which columns are seed side effects such as `chunk_text` and `source_file`?

Analysis does not automatically tell you whether a row is semantically good. For that, inspect preview rows and any judge columns you added.

A preview is healthy enough to scale when:
- sampled rows are useful, not just front matter or table-of-contents chunks
- judge scores match what you see in the rows
- required training and metadata fields are present
- analysis shows the expected row count and no obviously broken columns

If those checks fail, adjust chunking, seed selection, prompts, or judge criteria and run preview again before starting the full job.
