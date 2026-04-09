# vLLora Finetune API Reference

Base URL: `http://localhost:9090` (configurable)

All endpoints use JSON unless noted. Auth via `Authorization: Bearer <token>` header when configured.

> **Auto-uploads:** The gateway auto-uploads workflow data to the cloud when creating evaluations or training jobs via `ensure_dataset_uploaded()`. No manual dataset upload step is needed. The old `POST /finetune/datasets` endpoint has been removed.

**Note:** These are the platform APIs for workflow management, evaluation, and training. Data generation uses `scripts/generate_records.py` which calls the LLM via `scripts/chat_completion.py` (through the `/v1/chat/completions` endpoint). Topic design and grader writing are handled by the agent directly.

---

## Quick Reference (74 endpoints)

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| **Workflow CRUD** | | | |
| 1 | GET | `/finetune/workflows` | List all workflows |
| 2 | POST | `/finetune/workflows` | Create workflow |
| 3 | GET | `/finetune/workflows/{id}` | Get workflow |
| 4 | PUT | `/finetune/workflows/{id}` | Update workflow |
| 5 | DELETE | `/finetune/workflows/{id}` | Soft delete workflow |
| **Records** (workflow-scoped) | | | |
| 6 | GET | `/finetune/workflows/{id}/records` | List records |
| 7 | GET | `/finetune/workflows/{id}/records/count` | Count records |
| 8 | POST | `/finetune/workflows/{id}/records` | Add records |
| 9 | PUT | `/finetune/workflows/{id}/records` | Replace all records |
| 10 | DELETE | `/finetune/workflows/{id}/records` | Delete all records |
| 11 | PATCH | `/finetune/workflows/{id}/records/topics` | Batch update topics |
| 12 | DELETE | `/finetune/workflows/{id}/records/topics` | Clear all topics |
| 13 | PATCH | `/finetune/workflows/{id}/records/rename-topic` | Rename topic across records |
| 14 | DELETE | `/finetune/workflows/{id}/records/topics/{topic_id}` | Clear topic from records |
| 15 | PATCH | `/finetune/workflows/{id}/records/{record_id}` | Update record topic |
| 16 | DELETE | `/finetune/workflows/{id}/records/{record_id}` | Delete single record |
| 17 | PATCH | `/finetune/workflows/{id}/records/{record_id}/data` | Update record data |
| 18 | GET | `/finetune/workflows/{id}/records/scores` | List record scores |
| **Pipeline Journal** (workflow-scoped) | | | |
| 19a | GET | `/finetune/workflows/{id}/journal` | Get pipeline journal |
| 19b | POST | `/finetune/workflows/{id}/journal/entries` | Append journal entries (atomic) |
| **Logs** (workflow-scoped) | | | |
| 20 | GET | `/finetune/workflows/{id}/logs` | List workflow logs |
| 21 | POST | `/finetune/workflows/{id}/logs/bulk` | Create workflow logs (bulk) |
| **Topics** (workflow-scoped) | | | |
| 22 | GET | `/finetune/workflows/{id}/topics` | List topics |
| 23 | POST | `/finetune/workflows/{id}/topics` | Create topics |
| 24 | PUT | `/finetune/workflows/{id}/topics` | Update topics |
| 25 | DELETE | `/finetune/workflows/{id}/topics` | Delete topics |
| 26 | GET | `/finetune/workflows/{id}/topics/relations` | List topic-source relations |
| 27 | POST | `/finetune/workflows/{id}/topics/relations` | Create topic-source relations |
| 28 | PUT | `/finetune/workflows/{id}/topics/relations` | Update topic-source relations |
| 29 | DELETE | `/finetune/workflows/{id}/topics/relations` | Delete topic-source relations |
| 30 | POST | `/finetune/workflows/{id}/topics/generate` | Generate topics for workflow |
| **Knowledge Sources** (workflow-scoped) | | | |
| 31 | GET | `/finetune/workflows/{id}/knowledge` | List knowledge sources |
| 32 | POST | `/finetune/workflows/{id}/knowledge` | Create knowledge source |
| 33 | PUT | `/finetune/workflows/{id}/knowledge` | Upsert knowledge source |
| 34 | DELETE | `/finetune/workflows/{id}/knowledge` | Soft delete all knowledge sources |
| 35 | GET | `/finetune/workflows/{id}/knowledge/count` | Count knowledge sources |
| 36 | POST | `/finetune/workflows/{id}/knowledge/chunk` | Chunk knowledge for extraction |
| 37 | POST | `/finetune/workflows/{id}/knowledge/trace` | Create knowledge trace |
| 38 | DELETE | `/finetune/workflows/{id}/knowledge/trace/{trace_id}` | Delete knowledge trace |
| 39 | GET | `/finetune/workflows/{id}/knowledge/{ks_id}` | Get single knowledge source |
| 40 | DELETE | `/finetune/workflows/{id}/knowledge/{ks_id}` | Soft delete single knowledge source |
| 41 | GET | `/finetune/workflows/{id}/knowledge/{ks_id}/file` | Download knowledge source file |
| 42 | POST | `/finetune/workflows/{id}/knowledge/{ks_id}/parts` | Add parts to knowledge source |
| 43 | GET | `/finetune/workflows/{id}/knowledge/{ks_id}/parts` | List knowledge source parts |
| 44 | DELETE | `/finetune/workflows/{id}/knowledge/{ks_id}/parts/{part_id}` | Delete single part |
| 45 | PATCH | `/finetune/workflows/{id}/knowledge/{ks_id}/parts` | Batch update parts extraction_metadata |
| 46 | POST | `/finetune/workflows/{id}/knowledge/search` | Semantic search top-k knowledge parts |
| **Evaluations (workflow-scoped metadata)** | | | |
| 47 | GET | `/finetune/workflows/{id}/evaluations` | List evaluation metadata rows for workflow |
| 48 | DELETE | `/finetune/workflows/{id}/evaluations` | Delete all evaluation metadata rows for workflow |
| 49 | GET | `/finetune/workflows/{id}/evaluations/{job_id}` | Get evaluation metadata row by ID |
| **Dataset** (workflow-scoped, cloud sync) | | | |
| 50 | POST | `/finetune/workflows/{id}/dataset/generate` | Generate dataset JSONL from workflow |
| 51 | POST | `/finetune/workflows/{id}/dataset/generate/status` | Check dataset generation status |
| **Evaluator** (workflow-scoped) | | | |
| 52 | POST | `/finetune/workflows/{id}/evaluator/run` | Run evaluator on workflow data |
| 53 | GET | `/finetune/workflows/{id}/evaluator/run/status` | Check evaluator run status |
| 54 | PATCH | `/finetune/workflows/{id}/evaluator` | Update evaluator script |
| 55 | POST | `/finetune/workflows/{id}/evaluator/dry-run` | Test grader on single row |
| 56 | GET | `/finetune/workflows/{id}/evaluator/versions` | Evaluator version history |
| **Training Jobs** (workflow-scoped) | | | |
| 57 | POST | `/finetune/workflows/{id}/jobs` | Create training job |
| 58 | POST | `/finetune/workflows/{id}/jobs/estimate` | Estimate training time and cost |
| 59 | GET | `/finetune/workflows/{id}/jobs` | List training jobs |
| 60 | GET | `/finetune/workflows/{id}/jobs/{job_id}/status` | Get job status |
| 61 | GET | `/finetune/workflows/{id}/jobs/{job_id}/metrics` | Get training metrics |
| 62 | POST | `/finetune/workflows/{id}/jobs/{job_id}/cancel` | Cancel job |
| 63 | POST | `/finetune/workflows/{id}/jobs/{job_id}/resume` | Resume cancelled job |
| 64 | GET | `/finetune/workflows/{id}/jobs/{job_id}/weights/url` | Download weights URL |
| **Analytics & Evaluations** (workflow-scoped, read-only) | | | |
| 65 | GET | `/finetune/workflows/{id}/analytics` | Get dataset analytics |
| 66 | GET | `/finetune/workflows/{id}/finetune-evaluations` | Per-epoch training evaluations |
| **Analytics** (non-workflow-scoped) | | | |
| 67 | POST | `/finetune/analytics/dry-run` | Dataset analytics dry run |
| **Evaluations** (non-workflow-scoped, cloud) | | | |
| 68 | POST | `/finetune/evaluations` | Create evaluation run |
| 69 | GET | `/finetune/evaluations/{evaluation_run_id}` | Poll evaluation results |
| **Deployments** | | | |
| 70 | POST | `/finetune/deployments` | Deploy model |
| 71 | DELETE | `/finetune/deployments/{deployment_id}` | Delete deployment |
| **Topic Hierarchy AI** | | | |
| 72 | POST | `/finetune/topic-hierarchy/generate` | Generate topic hierarchy |
| 73 | POST | `/finetune/topic-hierarchy/adjust` | Adjust topic hierarchy |

---

## 1. Workflow CRUD

### GET `/finetune/workflows`

List all workflows.

### POST `/finetune/workflows`

Create a new workflow.

### GET `/finetune/workflows/{workflow_id}`

Get a single workflow by ID.

### PUT `/finetune/workflows/{workflow_id}`

Update a workflow.

**Body** (all fields optional):
```json
{
  "name": "string",
  "objective": "string",
  "eval_script": "string",
  "state": "string",
  "iteration_state": "string",
  "pipeline_journal": "string (JSON-encoded PipelineJournal)"
}
```

The `pipeline_journal` field stores the full pipeline journal as a JSON string. See `finetune-skill/reference/pipeline-journal-schema.md` for the schema. The skill writes this after each pipeline step to provide explainable evidence of the workflow execution.

### DELETE `/finetune/workflows/{workflow_id}`

Soft delete a workflow.

---

## 1b. Pipeline Journal (workflow-scoped)

The pipeline journal is the structured execution log of the finetune pipeline. It captures every decision, analysis, and job result as the skill runs. See `pipeline-journal-schema.md` for the full entry schema.

### GET `/finetune/workflows/{workflow_id}/journal`

Returns the pipeline journal for a workflow.

**Response:**
```json
{
  "workflow_id": "uuid",
  "pipeline_journal": {
    "version": "1.0",
    "workflow_id": "uuid",
    "objective": "...",
    "entries": [...]
  }
}
```

`pipeline_journal` is `null` if no journal has been written yet.

### POST `/finetune/workflows/{workflow_id}/journal/entries`

Append entries to the pipeline journal. The server performs atomic read-modify-write so no entries are lost from concurrent calls during pipeline execution. If no journal exists yet, one is created automatically.

**Body:**
```json
{
  "entries": [
    {
      "id": 1,
      "timestamp": "2026-04-05T15:04:58Z",
      "step": "step_1_objective",
      "action": "define_objective",
      "status": "completed",
      "summary": "Created workflow. Objective: ...",
      "analysis": "optional",
      "decision": "optional"
    }
  ],
  "objective": "optional — set on first call, ignored after"
}
```

**Response:** Same as GET — returns the full updated journal.

---

## 2. Records (workflow-scoped)

### GET `/finetune/workflows/{workflow_id}/records`

List records for a workflow.

### GET `/finetune/workflows/{workflow_id}/records/count`

Get the total count of records in a workflow.

### POST `/finetune/workflows/{workflow_id}/records`

Add records to a workflow.

### PUT `/finetune/workflows/{workflow_id}/records`

Replace all records in a workflow (full overwrite).

### DELETE `/finetune/workflows/{workflow_id}/records`

Delete all records in a workflow.

### PATCH `/finetune/workflows/{workflow_id}/records/{record_id}`

Update a single record's topic assignment.

### DELETE `/finetune/workflows/{workflow_id}/records/{record_id}`

Delete a single record.

### PATCH `/finetune/workflows/{workflow_id}/records/{record_id}/data`

Update a record's data (messages, metadata).

### GET `/finetune/workflows/{workflow_id}/records/scores`

List evaluation scores for all records in a workflow. Use after an eval run to see per-record scores.

### PATCH `/finetune/workflows/{workflow_id}/records/topics`

Batch update topic assignments across multiple records.

```bash
curl -X PATCH http://localhost:9090/finetune/workflows/WORKFLOW_ID/records/topics \
  -H "Content-Type: application/json" \
  -d '{"updates": [...]}'
```

### PATCH `/finetune/workflows/{workflow_id}/records/rename-topic`

Rename a topic across all records and the topic tree.

```bash
curl -X PATCH http://localhost:9090/finetune/workflows/WORKFLOW_ID/records/rename-topic \
  -H "Content-Type: application/json" \
  -d '{"old_topic": "Tactics/Pins", "new_topic": "Tactics/Pin Attacks"}'
```

### DELETE `/finetune/workflows/{workflow_id}/records/topics/{topic_id}`

Clear a specific topic from all records (records remain, topic field set to null).

### DELETE `/finetune/workflows/{workflow_id}/records/topics`

Clear all topic assignments from all records.

---

## 3. Logs (workflow-scoped)

### GET `/finetune/workflows/{workflow_id}/logs`

List logs for a workflow. Returns execution history and status messages.

### POST `/finetune/workflows/{workflow_id}/logs/bulk`

Create multiple log entries at once.

```bash
curl -X POST http://localhost:9090/finetune/workflows/WORKFLOW_ID/logs/bulk \
  -H "Content-Type: application/json" \
  -d '{"logs": [{"message": "Started evaluation", "level": "info"}]}'
```

---

## 4. Topics (workflow-scoped)

### GET `/finetune/workflows/{workflow_id}/topics`

List all topics for a workflow.

### POST `/finetune/workflows/{workflow_id}/topics`

Create topics.

```bash
curl -X POST http://localhost:9090/finetune/workflows/WORKFLOW_ID/topics \
  -H "Content-Type: application/json" \
  -d '{"topics": [
    {"name": "Topic A", "parent_id": null},
    {"name": "Subtopic A1", "parent_id": "topic-a-id"}
  ]}'
```

### PUT `/finetune/workflows/{workflow_id}/topics`

Update existing topics.

### DELETE `/finetune/workflows/{workflow_id}/topics`

Delete all topics for a workflow.

### GET `/finetune/workflows/{workflow_id}/topics/relations`

List topic-to-source relations.

### POST `/finetune/workflows/{workflow_id}/topics/relations`

Create topic-source relations (link topics to knowledge sources).

### PUT `/finetune/workflows/{workflow_id}/topics/relations`

Update topic-source relations.

### DELETE `/finetune/workflows/{workflow_id}/topics/relations`

Delete topic-source relations.

### POST `/finetune/workflows/{workflow_id}/topics/generate`

Generate topics for a workflow using AI. The gateway calls the cloud to produce topics based on the workflow's knowledge sources and configuration.

### Topic Regeneration Flow

When you need to restructure topics entirely:

```bash
# 1. Delete old topic tree
curl -X DELETE http://localhost:9090/finetune/workflows/WORKFLOW_ID/topics

# 2. Generate new hierarchy (via LLM)
curl -X POST http://localhost:9090/finetune/topic-hierarchy/generate \
  -H "Content-Type: application/json" \
  -d '{"goals": "...", "depth": 3, "degree": 4}'

# 3. Save new topics (flat format with parent_id)
curl -X POST http://localhost:9090/finetune/workflows/WORKFLOW_ID/topics \
  -H "Content-Type: application/json" \
  -d '{"topics": [
    {"name": "Topic A", "parent_id": null},
    {"name": "Subtopic A1", "parent_id": "topic-a-id"}
  ]}'

# 4. Re-categorize records
curl -X PATCH http://localhost:9090/finetune/workflows/WORKFLOW_ID/records/topics \
  -H "Content-Type: application/json" \
  -d '{"updates": [...]}'
```

---

## 5. Knowledge Sources (workflow-scoped)

### GET `/finetune/workflows/{workflow_id}/knowledge`

List all knowledge sources for a workflow.

### POST `/finetune/workflows/{workflow_id}/knowledge`

Create a new knowledge source (multipart upload).

### PUT `/finetune/workflows/{workflow_id}/knowledge`

Upsert a knowledge source. Creates if it doesn't exist, updates if it does.

### DELETE `/finetune/workflows/{workflow_id}/knowledge`

Soft delete all knowledge sources for a workflow.

### GET `/finetune/workflows/{workflow_id}/knowledge/count`

Get the count of knowledge sources in a workflow.

### POST `/finetune/workflows/{workflow_id}/knowledge/chunk`

Chunk knowledge source content for extraction. Splits large documents into processable chunks.

### POST `/finetune/workflows/{workflow_id}/knowledge/trace`

Create a knowledge trace record linking extracted data back to its source.

### DELETE `/finetune/workflows/{workflow_id}/knowledge/trace/{trace_id}`

Delete a specific knowledge trace.

### GET `/finetune/workflows/{workflow_id}/knowledge/{ks_id}`

Get a single knowledge source by ID.

### DELETE `/finetune/workflows/{workflow_id}/knowledge/{ks_id}`

Soft delete a single knowledge source.

### GET `/finetune/workflows/{workflow_id}/knowledge/{ks_id}/file`

Download the original file for a knowledge source.

### POST `/finetune/workflows/{workflow_id}/knowledge/{ks_id}/parts`

Add parts (pages, sections) to a knowledge source.

### GET `/finetune/workflows/{workflow_id}/knowledge/{ks_id}/parts`

List all parts of a knowledge source.

### DELETE `/finetune/workflows/{workflow_id}/knowledge/{ks_id}/parts/{part_id}`

Delete a single part from a knowledge source.

### PATCH `/finetune/workflows/{workflow_id}/knowledge/{ks_id}/parts`

Batch update extraction_metadata on knowledge source parts. Used to set relevance labels after objective-based filtering in Step 3.

Request body (array of updates):
```json
[
  {"part_identifier": "p-001", "extraction_metadata": {"pages": [1, 2], "relevant": true}},
  {"part_identifier": "p-002", "extraction_metadata": {"pages": [3], "relevant": false}}
]
```

Response: `{"updated": 2}`

Parts are resolved by `id` or `reference_id`. The `extraction_metadata` field is fully replaced per-part (merge with existing data before sending).

### POST `/finetune/workflows/{workflow_id}/knowledge/search`

Semantic search over knowledge source parts for a workflow. The gateway embeds the input phrase and returns top-k parts ranked by cosine similarity.

Request body:

```json
{
  "phrase": "how does startup embedding resume work?",
  "top_k": 5
}
```

- `phrase` (required): text query to embed and search.
- `top_k` (optional): max number of matches. Defaults to `5`, capped at `100`.

Response shape:

```json
{
  "matches": [
    {
      "part": {
        "id": "part_123",
        "reference_id": null,
        "source_id": "source_abc",
        "type": "text",
        "content": "Knowledge part content...",
        "content_metadata": null,
        "title": "Section title",
        "extraction_path": null,
        "extraction_metadata": null,
        "embeddings": null
      },
      "score": 0.8123
    }
  ]
}
```

Notes:
- Only parts that already have stored embeddings are searchable.
- Search response intentionally omits embedding vectors (`embeddings` is `null`).

---

## 6. Evaluator (workflow-scoped)

### PATCH `/finetune/workflows/{workflow_id}/evaluator`

Update the evaluation script for a workflow. Also syncs to the cloud dataset's evaluator. Use this when iterating on the grader.

> **Request format:** This endpoint expects `multipart/form-data` with a `file` field containing the grader JavaScript source.
>
> If you send JSON (for example `Content-Type: application/json` with `{"evaluator": ...}`), Multipart parsing fails before the handler can read the payload, and you will see errors like:
> `Invalid multipart field: Multipart boundary is not found`.

```bash
curl -X PATCH http://localhost:9090/finetune/workflows/WORKFLOW_ID/evaluator \
  -F "file=@grader.js"
```

### GET `/finetune/workflows/{workflow_id}/evaluator/versions`

View evaluator version history with git-style diffs between consecutive versions.

### POST `/finetune/workflows/{workflow_id}/evaluator/dry-run`

Test a grader script against a single row without creating an evaluation run.

```bash
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/evaluator/dry-run \
  -H "Content-Type: application/json" \
  -d '{"script": "function evaluate(input) { ... }", "row": {"messages": [...]}}'
```

**Request body** (JSON):
| Field | Type | Description |
|-------|------|-------------|
| `script` | string | Full JS source of the grader function |
| `row` | object | Single row with `messages` array |

**Response:**
```json
{"score": 0.8, "reason": "Good response", "logs": [], "is_success": true}
```

**Notes:** The QuickJS sandbox does NOT support `console.log` -- use the `reason` field for debug output.

### POST `/finetune/workflows/{workflow_id}/evaluator/run`

Run the evaluator against the full workflow dataset. This triggers a cloud-side evaluation using the current evaluator script and records.

### GET `/finetune/workflows/{workflow_id}/evaluator/run/status`

Check the status of a running evaluator. Poll until complete.

---

## 7. Evaluations Metadata (workflow-scoped + cross-workflow)

Track evaluation runs locally per workflow. These endpoints store eval metadata/history in the gateway DB. They do **not** start or stop cloud evaluation execution by themselves.

For actual run lifecycle:
- Start eval run: `POST /finetune/evaluations`
- Poll eval run: `GET /finetune/evaluations/{eval_id}`
- Cancel eval run: `POST /finetune/workflows/{workflow_id}/jobs/{eval_id}/cancel`

### GET `/finetune/workflows/{workflow_id}/evaluations`

List all eval jobs for a workflow. Shows history of evaluation runs with their statuses.

### DELETE `/finetune/workflows/{workflow_id}/evaluations`

Delete all eval jobs for a workflow.

### GET `/finetune/workflows/{workflow_id}/evaluations/{job_id}`

Get a single eval job by ID.

> Use this endpoint for local tracking only. To cancel a real evaluation run, use:
> `POST /finetune/workflows/{workflow_id}/jobs/{job_id}/cancel`

### Scope

Evaluation metadata endpoints are workflow-scoped only. There are no cross-workflow
evaluation metadata listing/get endpoints.

---

## 8. Training Jobs (workflow-scoped)

All training job endpoints are scoped under a workflow.

### POST `/finetune/workflows/{workflow_id}/jobs`

Create a fine-tuning job.

> **Required field:** `job_type` is mandatory.
>
> For training jobs, set `"job_type": "provider_finetune"`.
> Valid enum values are:
> - `provider_finetune`
> - `evaluation_run`
>
> If `job_type` is missing, the API returns: `Json deserialize error: missing field 'job_type'`.

```bash
curl -X POST http://localhost:9090/finetune/workflows/WORKFLOW_ID/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "job_type": "finetune",
    "dataset": "ds_abc123",
    "base_model": "Qwen3.5-4B",
    "output_model": "my-custom-model-1234567890",
    "display_name": "Customer Support Fine-tune",
    "training_config": {
      "learning_rate": 0.000001,
      "lora_rank": 8,
      "gradient_accumulation_steps": 5,
      "epochs": 3,
      "batch_size": 5,
      "load_precision": "bf16",
      "mask_truncated_completions": false,
      "loss_type": "dr_grpo",
      "importance_sampling_level": "sequence",
      "scale_rewards": "none",
      "beta": 0.01
    },
    "inference_parameters": {
      "max_output_tokens": 512,
      "temperature": 1.0,
      "top_p": 1.0,
      "response_candidates_count": 8,
      "enable_thinking": false,
      "reasoning_effort": "medium"
    },
    "chunk_size": 100,
    "node_count": 1,
    "evaluator_version": 2
  }'
```

#### Continuing from a previous job

You can continue from a prior successful cloud finetune job by setting `base_model` to one of:

- `finetuned/{cloud_job_id}`: load final adapter weights from the prior job.
- `checkpointed/{cloud_job_id}`: load latest checkpoint from the prior job.

When using `checkpointed/{cloud_job_id}`, you can optionally control resume depth with `resume_mode`:

- `weights-only` (default): restore checkpoint adapter weights only.
- `full-state`: restore checkpoint adapter + optimizer state when available.

Example (`finetuned`):
```bash
curl -X POST http://localhost:9090/finetune/workflows/WORKFLOW_ID/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "job_type": "finetune",
    "base_model": "finetuned/2b08db0e-6a5e-4d62-b89f-8d2e8b246d44",
    "output_model": "my-model-v2"
  }'
```

Example (`checkpointed` + full-state):
```bash
curl -X POST http://localhost:9090/finetune/workflows/WORKFLOW_ID/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "job_type": "finetune",
    "base_model": "checkpointed/2b08db0e-6a5e-4d62-b89f-8d2e8b246d44",
    "resume_mode": "full-state",
    "output_model": "my-model-v3"
  }'
```

**Validation gate:**
- `finetuned/{cloud_job_id}` requires source job success (`succeeded`) and provider success.
- `checkpointed/{cloud_job_id}` allows any terminal source state (`succeeded`, `failed`, `cancelled`) as long as provider status is also terminal.

**Training Config Defaults (gateway fallbacks if omitted):**
| Parameter | Gateway Default | GRPO-Optimized (used by `finetune.py`) | Description |
|-----------|----------------|----------------------------------------|-------------|
| `learning_rate` | 0.00001 (1e-5) | **0.000001 (1e-6)** | Learning rate. Standard GRPO LR (arXiv:2402.03300, arXiv:2503.14476). Higher values cause forgetting spiral (arXiv:2509.07430). |
| `lora_rank` | 8 | 8 | LoRA rank (higher = more parameters, slower) |
| `gradient_accumulation_steps` | 5 | 5 | Steps before weight update |
| `epochs` | 2.0 | **adaptive (2-8)** | Auto-set by dataset size: <50→8, <200→5, <500→3, 500+→2. Reduced to prevent forgetting (arXiv:2505.22257). |
| `batch_size` | 5 | 5 | Training batch size |
| `load_precision` | `bf16` (omitted = bf16) | workload-dependent | Base model weights: `bf16` (full precision, default), `4bit` (QLoRA, lowest VRAM), `8bit` (middle ground). |
| `mask_truncated_completions` | `true` | **`false`** | Unsloth: "we recommend to disable it." `true` causes kl=nan when all completions truncate (Unsloth #3006). |
| `loss_type` | `"dr_grpo"` | `"dr_grpo"` | GRPO variant: `dr_grpo` (no length bias, arXiv:2503.20783), `dapo` (TRL default, also no length bias). Avoid `grpo` (length bias) and `bnpo` (TRL bug #3823 with sequence IS). |
| `importance_sampling_level` | `"token"` | **`"sequence"`** | Unsloth: "GSPO shows sequence-level often gives more stable training." |
| `scale_rewards` | `"group"` | **`false`** | Unsloth + Dr. GRPO: "recommends not scaling to avoid difficulty bias from std scaling." `false` = raw advantages, helps with bimodal distributions. |
| `beta` | `0.0` | **`0.01`** | KL penalty prevents forgetting (arXiv:2509.07430: 15% forgetting without KL). Unsloth: 0.0 = "no reference model loaded (lower memory, faster)". We use 0.01 for stability. |

**Inference Parameters (used during training rollouts):**
| Parameter | Gateway Default | GRPO-Optimized (used by `finetune.py`) | Description |
|-----------|----------------|----------------------------------------|-------------|
| `max_output_tokens` | 1000 | **512** | Max tokens. Start low, increase only if >50% clipping |
| `temperature` | 1.0 | 1.0 | Sampling temperature |
| `top_p` | 1.0 | 1.0 | Top-p nucleus sampling |
| `response_candidates_count` | 2 | **8** | Candidates per prompt. GRPO needs G≥8 for meaningful gradients |
| `enable_thinking` | provider/model default | model-dependent | Enables/disables explicit reasoning mode for models that support it (e.g. Qwen thinking mode) |
| `reasoning_effort` | provider/model default | model-dependent | Optional effort hint (for example `low`, `medium`, `high`) used only by models/providers that support it |

> **Note:** `finetune.py create-training` sends GRPO-optimized values by default. If you call the API directly (raw curl), you must set these explicitly or you'll get the gateway fallbacks, which are SFT-oriented and produce weak GRPO training signal.

**Optional fields:**
| Field | Description |
|-------|-------------|
| `chunk_size` | Chunk size for data processing |
| `node_count` | Nodes for distributed training |
| `evaluator_version` | Which evaluator version to use |
| `resume_mode` | Only for `checkpointed/{cloud_job_id}`. `weights-only` (default) or `full-state` |
| `load_precision` | Optional. `bf16`, `4bit`, or `8bit` (see training config table). Omitted means `bf16`. |

**Thinking/reasoning notes:**
- `enable_thinking` and `reasoning_effort` are optional pass-through inference parameters.
- If `reasoning_effort` is provided, it must be a non-empty string.
- Unsupported providers/models ignore these fields safely.

**Response:**
```json
{
  "id": "ft_job_001",
  "provider_job_id": "ftjob-abc123",
  "status": "pending",
  "base_model": "Qwen3.5-4B",
  "dataset_id": "ds_abc123",
  "created_at": "2026-03-05T10:00:00Z"
}
```

### POST `/finetune/workflows/{workflow_id}/jobs/estimate`

Estimate one or more reinforcement training runs before creating jobs. Returns grouped projected duration and USD cost per input config using the configured/default instance profile (`VERTEX_NVIDIA_L4`) and current workflow row count.

```bash
curl -X POST http://localhost:9090/finetune/workflows/WORKFLOW_ID/jobs/estimate \
  -H "Content-Type: application/json" \
  -d '[
    {
      "base_model": "Qwen3.5-4B",
      "training_config": {
        "epochs": 2.0,
        "batch_size": 5
      },
      "inference_parameters": {
        "max_output_tokens": 256,
        "response_candidates_count": 4
      }
    },
    {
      "base_model": "Qwen3.5-2B",
      "training_config": {
        "epochs": 1.0,
        "batch_size": 5
      },
      "inference_parameters": {
        "max_output_tokens": 256,
        "response_candidates_count": 4
      }
    }
  ]'
```

**Estimate response:**
```json
[
  {
    "config_index": 0,
    "estimations": [
      {
        "workflow_id": "2f90adcc-9ff4-4c3c-a8f6-734d7f920bf9",
        "job_type": "provider_finetune",
        "instance": "VERTEX_NVIDIA_L4",
        "base_model": "Qwen3.5-4B",
        "total_rows": 200,
        "estimated_duration_seconds": 4540,
        "estimated_cost_usd": 1.21
      }
    ]
  },
  {
    "config_index": 1,
    "estimations": [
      {
        "workflow_id": "2f90adcc-9ff4-4c3c-a8f6-734d7f920bf9",
        "job_type": "provider_finetune",
        "instance": "VERTEX_NVIDIA_L4",
        "base_model": "Qwen3.5-2B",
        "total_rows": 200,
        "estimated_duration_seconds": 1180,
        "estimated_cost_usd": 0.31
      }
    ]
  }
]
```

**Notes:**
- Request body is a root JSON array. Each item is nearly identical to training create payload (base model + optional training/inference settings).
- Response is grouped by input item via `config_index`.
- Each group has an `estimations` array; today it returns one default instance estimate, but this is future-ready for multiple instance types.
- Estimation can be inaccurate and should be used only as a reference.
- The estimator currently does not reserve capacity; it is a planning estimate only.
- Every request item must include non-empty `base_model`.

### GET `/finetune/workflows/{workflow_id}/jobs`

List training jobs for a workflow. Optional query params: `limit`, `after` (pagination), `dataset_id` (filter).

### GET `/finetune/workflows/{workflow_id}/jobs/{job_id}/status`

Check training job status.

**Status values:** `pending` -> `running` -> `succeeded` | `failed` | `cancelled`

**Response:**
```json
{
  "id": "ft_job_001",
  "provider_job_id": "ftjob-abc123",
  "status": "running",
  "base_model": "Qwen3.5-4B",
  "fine_tuned_model": null,
  "training_config": {},
  "created_at": "...",
  "updated_at": "...",
  "completed_at": null,
  "error_message": null
}
```

### GET `/finetune/workflows/{workflow_id}/jobs/{job_id}/metrics`

Get real-time GRPO/GSPO reinforcement training metrics. Poll this while training is running to detect problems early.

```bash
curl -s "http://localhost:9090/finetune/workflows/WORKFLOW_ID/jobs/JOB_ID/metrics"
```

**Response:**
```json
{
  "provider_job_id": "ftjob-abc123",
  "metrics": [
    {
      "metrics": {
        "global_step": 100,
        "max_steps": 500,
        "epoch": 0.4,
        "learning_rate": 0.00001,
        "reward": 0.65,
        "reward_std": 0.15,
        "loss": 0.42,
        "grad_norm": 1.2,
        "kl": 0.05,
        "completions/clipped_ratio": 0.02,
        "completions/mean_length": 150,
        "frac_reward_zero_std": 0.1
      },
      "created_at": "2026-03-10T12:10:00Z"
    }
  ]
}
```

**Metric categories:**
| Category | Metrics | What they tell you |
|----------|---------|-------------------|
| Progress | `global_step`, `max_steps`, `epoch` | How far training has progressed |
| Reward quality | `reward`, `reward_std`, `frac_reward_zero_std` | Whether the model is learning (reward up) with good signal diversity |
| Optimization | `loss`, `grad_norm`, `kl` | Training stability -- watch for NaN, spikes, or KL divergence rising |
| Completions | `completions/clipped_ratio`, `completions/mean_length` | Whether outputs are being truncated (clipped_ratio > 0.7 = critical) |

**Alert thresholds:**
| Condition | Severity | Action |
|-----------|----------|--------|
| NaN/Inf in loss, reward, KL, grad_norm | Critical | Training numerically unstable -- cancel and investigate |
| `completions/clipped_ratio` > 0.70 | Critical | Increase `max_output_tokens` in inference parameters |
| KL rising > 1.5x over last steps | Warning | Policy drifting -- lower learning rate |
| `grad_norm` spikes > 3x median | Warning | Instability -- may need gradient clipping |
| `frac_reward_zero_std` > 0.60 | Warning | Weak training signal -- grader not differentiating |
| `reward_std` < 0.05 | Info | Collapsed diversity -- model converging on single pattern |

### POST `/finetune/workflows/{workflow_id}/jobs/{job_id}/cancel`

Cancel a running training job.

### POST `/finetune/workflows/{workflow_id}/jobs/{job_id}/resume`

Resume a cancelled training job.

### GET `/finetune/workflows/{workflow_id}/jobs/{job_id}/weights/url`

Get a signed download URL for trained model weights (only after `succeeded`).

```json
{
  "download_url": "https://...",
  "expires_at": "2026-03-06T10:00:00Z"
}
```

---

## 9. Evaluations (non-workflow-scoped, cloud)

These endpoints create and poll cloud evaluation runs. The gateway auto-uploads the workflow dataset before running.

**Evaluating finetuned or checkpointed models:** set `rollout_model_params.model` to `finetuned/{provider_job_id}` for final adapter weights, or `checkpointed/{provider_job_id}` for the latest checkpoint from that job. To target a specific checkpoint step, use `checkpointed/{provider_job_id}:{step}` (for example `checkpointed/job_f7e174ac6e4c453da89b095c7053fe76:70`). Do not use raw `fine_tuned_model` or raw `provider_job_id`; the eval service will not resolve those as loadable rollout models.

### POST `/finetune/evaluations`

Create an evaluation run. The backend generates model responses for each row and scores them using the configured grader.

```bash
curl -X POST http://localhost:9090/finetune/evaluations \
  -H "Content-Type: application/json" \
  -d '{
    "workflow_id": "ds_abc123",
    "rollout_model_params": {
      "model": "gpt-4o-mini",
      "temperature": 0.7
    },
    "offset": 0,
    "limit": 50
  }'
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dataset_id` | string | Yes | Backend dataset ID |
| `rollout_model_params` | object | Yes | Model config for generating responses to evaluate |
| `rollout_model_params.model` | string | Yes | Which model generates the responses being evaluated |
| `offset` | number | No | Start row index (for partial evaluation) |
| `limit` | number | No | Max rows to evaluate |

**Response:**
```json
{
  "evaluation_run_id": "eval_xyz789",
  "status": "running",
  "total_rows": 50
}
```

### GET `/finetune/evaluations/{evaluation_run_id}`

Poll for evaluation results. Call every 2-3 seconds until `status` is `completed` or `failed`.

```bash
curl http://localhost:9090/finetune/evaluations/eval_xyz789
```

Optional query params let you sort and trim returned row results without changing the run itself:

| Query param | Type | Description |
|-------------|------|-------------|
| `limit` | number | Maximum number of rows to return in `results` |
| `sort` | string | Sort key. Currently supported: `score` |
| `order` | string | Sort direction for `sort`: `asc` (lowest first) or `desc` (highest first) |

Examples:

```bash
# Lowest-scoring 20 rows (best for failure analysis)
curl "http://localhost:9090/finetune/evaluations/eval_xyz789?sort=score&order=asc&limit=20"

# Highest-scoring 10 rows
curl "http://localhost:9090/finetune/evaluations/eval_xyz789?sort=score&order=desc&limit=10"
```

**Response:**
```json
{
  "evaluation_run_id": "eval_xyz789",
  "status": "completed",
  "total_rows": 50,
  "completed_rows": 48,
  "failed_rows": 2,
  "results": [
    {
      "row_index": 0,
      "row": {
        "id": "record-1",
        "messages": []
      },
      "epochs": {
        "0": [{
          "dataset_row_id": "record-1",
          "status": "completed",
          "score": 0.85,
          "reason": "Response accurately addresses the query with good detail",
          "logs": []
        }]
      }
    }
  ],
  "summary": {
    "average_score": 0.72,
    "passed_count": 40,
    "failed_count": 10
  }
}
```

---

## 10. Analytics

### GET `/finetune/workflows/{workflow_id}/analytics`

Get dataset analytics for a workflow (record count, token stats, quality metrics).

### POST `/finetune/analytics/dry-run`

Run quality analytics on a dataset without persisting results.

### GET `/finetune/workflows/{workflow_id}/finetune-evaluations`

Get per-epoch evaluation results showing how the model improves during training.

```bash
curl "http://localhost:9090/finetune/workflows/WORKFLOW_ID/finetune-evaluations?finetune_job_id=ftjob-abc123&epoch=1"
```

**Query params:** `finetune_job_id`, `row_index`, `epoch`, `include_rollout_content` (all optional filters)

**Response:**
```json
{
  "results": [{
    "row_index": 0,
    "row": {"id": "record-1", "messages": []},
    "epochs": {
      "0": [{"score": 0.5, "reason": "...", "status": "completed", "rollout_content": "Answer A"}],
      "1": [{"score": 0.7, "reason": "...", "status": "completed", "rollout_content": "Answer B"}],
      "2": [{"score": 0.85, "reason": "...", "status": "completed", "rollout_content": "Answer C"}]
    }
  }]
}
```

---

## 11. Dataset Generation (workflow-scoped)

### POST `/finetune/workflows/{workflow_id}/dataset/generate`

Generate a JSONL dataset from the workflow's records, topics, and evaluator. Packages local data and syncs to the cloud.

### POST `/finetune/workflows/{workflow_id}/dataset/generate/status`

Check the status of a dataset generation operation.

---

## 12. Deployments

### POST `/finetune/deployments`

Deploy a fine-tuned model.

```bash
curl -X POST http://localhost:9090/finetune/deployments \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "my-custom-model-1234567890",
    "display_name": "Production Model v1"
  }'
```

### DELETE `/finetune/deployments/{deployment_id}`

Delete a deployment.

---

## 13. Topic Hierarchy AI

### POST `/finetune/topic-hierarchy/generate`

Generate a topic hierarchy using AI based on goals, depth, and degree constraints.

```bash
curl -X POST http://localhost:9090/finetune/topic-hierarchy/generate \
  -H "Content-Type: application/json" \
  -d '{"goals": "...", "depth": 3, "degree": 4}'
```

### POST `/finetune/topic-hierarchy/adjust`

Adjust an existing topic hierarchy (merge, split, rename, rebalance).
