# vLLora Finetune API Reference

Base URL: `http://localhost:9090` (configurable)

All endpoints use JSON unless noted. Auth via `Authorization: Bearer <token>` header when configured.

> **Auto-uploads:** The gateway auto-uploads workflow data to the cloud when creating evaluations or training jobs via `ensure_dataset_uploaded()`. No manual dataset upload step is needed. The old `POST /finetune/datasets` endpoint has been removed.

**Note:** These are the platform APIs for workflow management, evaluation, and training. Data generation uses `scripts/generate_records.py` which calls the LLM via `scripts/chat_completion.py` (through the `/v1/chat/completions` endpoint). Topic design and grader writing are handled by the agent directly.

---

## Quick Reference (76 endpoints)

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
| **Logs** (workflow-scoped) | | | |
| 19 | GET | `/finetune/workflows/{id}/logs` | List workflow logs |
| 20 | POST | `/finetune/workflows/{id}/logs/bulk` | Create workflow logs (bulk) |
| **Topics** (workflow-scoped) | | | |
| 21 | GET | `/finetune/workflows/{id}/topics` | List topics |
| 22 | POST | `/finetune/workflows/{id}/topics` | Create topics |
| 23 | PUT | `/finetune/workflows/{id}/topics` | Update topics |
| 24 | DELETE | `/finetune/workflows/{id}/topics` | Delete topics |
| 25 | GET | `/finetune/workflows/{id}/topics/relations` | List topic-source relations |
| 26 | POST | `/finetune/workflows/{id}/topics/relations` | Create topic-source relations |
| 27 | PUT | `/finetune/workflows/{id}/topics/relations` | Update topic-source relations |
| 28 | DELETE | `/finetune/workflows/{id}/topics/relations` | Delete topic-source relations |
| 29 | POST | `/finetune/workflows/{id}/topics/generate` | Generate topics for workflow |
| **Knowledge Sources** (workflow-scoped) | | | |
| 30 | GET | `/finetune/workflows/{id}/knowledge` | List knowledge sources |
| 31 | POST | `/finetune/workflows/{id}/knowledge` | Create knowledge source |
| 32 | PUT | `/finetune/workflows/{id}/knowledge` | Upsert knowledge source |
| 33 | DELETE | `/finetune/workflows/{id}/knowledge` | Soft delete all knowledge sources |
| 34 | GET | `/finetune/workflows/{id}/knowledge/count` | Count knowledge sources |
| 35 | POST | `/finetune/workflows/{id}/knowledge/chunk` | Chunk knowledge for extraction |
| 36 | POST | `/finetune/workflows/{id}/knowledge/trace` | Create knowledge trace |
| 37 | DELETE | `/finetune/workflows/{id}/knowledge/trace/{trace_id}` | Delete knowledge trace |
| 38 | GET | `/finetune/workflows/{id}/knowledge/{ks_id}` | Get single knowledge source |
| 39 | DELETE | `/finetune/workflows/{id}/knowledge/{ks_id}` | Soft delete single knowledge source |
| 40 | GET | `/finetune/workflows/{id}/knowledge/{ks_id}/file` | Download knowledge source file |
| 41 | POST | `/finetune/workflows/{id}/knowledge/{ks_id}/parts` | Add parts to knowledge source |
| 42 | GET | `/finetune/workflows/{id}/knowledge/{ks_id}/parts` | List knowledge source parts |
| 43 | DELETE | `/finetune/workflows/{id}/knowledge/{ks_id}/parts/{part_id}` | Delete single part |
| 43a | POST | `/finetune/workflows/{id}/knowledge/search` | Semantic search top-k knowledge parts |
| **Eval Jobs** (workflow-scoped) | | | |
| 44 | GET | `/finetune/workflows/{id}/eval-jobs` | List eval jobs |
| 45 | POST | `/finetune/workflows/{id}/eval-jobs` | Create eval job record |
| 46 | DELETE | `/finetune/workflows/{id}/eval-jobs` | Delete all eval jobs for workflow |
| 47 | GET | `/finetune/workflows/{id}/eval-jobs/{job_id}` | Get eval job |
| 48 | PATCH | `/finetune/workflows/{id}/eval-jobs/{job_id}` | Update eval job status |
| 49 | DELETE | `/finetune/workflows/{id}/eval-jobs/{job_id}` | Delete eval job |
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
| 58 | GET | `/finetune/workflows/{id}/jobs` | List training jobs |
| 59 | GET | `/finetune/workflows/{id}/jobs/{job_id}/status` | Get job status |
| 60 | GET | `/finetune/workflows/{id}/jobs/{job_id}/metrics` | Get training metrics |
| 61 | POST | `/finetune/workflows/{id}/jobs/{job_id}/cancel` | Cancel job |
| 62 | POST | `/finetune/workflows/{id}/jobs/{job_id}/resume` | Resume cancelled job |
| 63 | GET | `/finetune/workflows/{id}/jobs/{job_id}/weights/url` | Download weights URL |
| **Analytics & Evaluations** (workflow-scoped, read-only) | | | |
| 64 | GET | `/finetune/workflows/{id}/analytics` | Get dataset analytics |
| 65 | GET | `/finetune/workflows/{id}/finetune-evaluations` | Per-epoch training evaluations |
| **Cross-Workflow Eval Jobs** | | | |
| 66 | GET | `/finetune/eval-jobs` | List eval jobs by status (cross-workflow) |
| 67 | GET | `/finetune/eval-jobs/{job_id}` | Get eval job by ID (cross-workflow) |
| 68 | PATCH | `/finetune/eval-jobs/{job_id}` | Update eval job by ID (cross-workflow) |
| 69 | DELETE | `/finetune/eval-jobs/{job_id}` | Delete eval job by ID (cross-workflow) |
| **Analytics** (non-workflow-scoped) | | | |
| 70 | POST | `/finetune/analytics/dry-run` | Dataset analytics dry run |
| **Evaluations** (non-workflow-scoped, cloud) | | | |
| 71 | POST | `/finetune/evaluations` | Create evaluation run |
| 72 | GET | `/finetune/evaluations/{evaluation_run_id}` | Poll evaluation results |
| **Deployments** | | | |
| 73 | POST | `/finetune/deployments` | Deploy model |
| 74 | DELETE | `/finetune/deployments/{deployment_id}` | Delete deployment |
| **Topic Hierarchy AI** | | | |
| 75 | POST | `/finetune/topic-hierarchy/generate` | Generate topic hierarchy |
| 76 | POST | `/finetune/topic-hierarchy/adjust` | Adjust topic hierarchy |

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

### DELETE `/finetune/workflows/{workflow_id}`

Soft delete a workflow.

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

## 7. Eval Jobs (workflow-scoped + cross-workflow)

Track evaluation runs locally per workflow. These complement the cloud evaluation endpoints -- the cloud runs the eval, and these endpoints store the job metadata locally for history and comparison.

### POST `/finetune/workflows/{workflow_id}/eval-jobs`

Create a local eval job record to track a cloud evaluation run.

```bash
curl -X POST http://localhost:9090/finetune/workflows/WORKFLOW_ID/eval-jobs \
  -H "Content-Type: application/json" \
  -d '{
    "cloud_run_id": "eval_xyz789",
    "sample_size": 50,
    "rollout_model": "gpt-4o-mini"
  }'
```

### GET `/finetune/workflows/{workflow_id}/eval-jobs`

List all eval jobs for a workflow. Shows history of evaluation runs with their statuses.

### DELETE `/finetune/workflows/{workflow_id}/eval-jobs`

Delete all eval jobs for a workflow.

### GET `/finetune/workflows/{workflow_id}/eval-jobs/{job_id}`

Get a single eval job by ID.

### PATCH `/finetune/workflows/{workflow_id}/eval-jobs/{job_id}`

Update eval job status (e.g., `running` -> `completed`) and store results.

```bash
curl -X PATCH http://localhost:9090/finetune/workflows/WORKFLOW_ID/eval-jobs/JOB_ID \
  -H "Content-Type: application/json" \
  -d '{"status": "completed", "results": {...}}'
```

### DELETE `/finetune/workflows/{workflow_id}/eval-jobs/{job_id}`

Delete a single eval job.

### Cross-Workflow Eval Job Endpoints

These endpoints operate outside workflow scope, useful for dashboards and status checks.

#### GET `/finetune/eval-jobs`

List eval jobs by status across all workflows.

```bash
curl "http://localhost:9090/finetune/eval-jobs?status=running"
```

#### GET `/finetune/eval-jobs/{job_id}`

Get an eval job by ID regardless of workflow.

#### PATCH `/finetune/eval-jobs/{job_id}`

Update an eval job by ID regardless of workflow.

#### DELETE `/finetune/eval-jobs/{job_id}`

Delete an eval job by ID regardless of workflow.

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
    "job_type": "provider_finetune",
    "dataset": "ds_abc123",
    "base_model": "unsloth/Qwen3.5-4B",
    "output_model": "my-custom-model-1234567890",
    "display_name": "Customer Support Fine-tune",
    "training_config": {
      "learning_rate": 0.00001,
      "lora_rank": 8,
      "gradient_accumulation_steps": 5,
      "epochs": 2.0,
      "batch_size": 5
    },
    "inference_parameters": {
      "max_output_tokens": 1000,
      "temperature": 1.0,
      "top_p": 1.0,
      "response_candidates_count": 2
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
    "job_type": "provider_finetune",
    "base_model": "finetuned/2b08db0e-6a5e-4d62-b89f-8d2e8b246d44",
    "output_model": "my-model-v2"
  }'
```

Example (`checkpointed` + full-state):
```bash
curl -X POST http://localhost:9090/finetune/workflows/WORKFLOW_ID/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "job_type": "provider_finetune",
    "base_model": "checkpointed/2b08db0e-6a5e-4d62-b89f-8d2e8b246d44",
    "resume_mode": "full-state",
    "output_model": "my-model-v3"
  }'
```

**Validation gate:**
- `finetuned/{cloud_job_id}` requires source job success (`succeeded`) and provider success.
- `checkpointed/{cloud_job_id}` allows any terminal source state (`succeeded`, `failed`, `cancelled`) as long as provider status is also terminal.

**Training Config Defaults:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `learning_rate` | 0.00001 | Learning rate for LoRA fine-tuning |
| `lora_rank` | 8 | LoRA rank (higher = more parameters, slower) |
| `gradient_accumulation_steps` | 5 | Steps before weight update |
| `epochs` | 2.0 | Number of training epochs |
| `batch_size` | 5 | Training batch size |

**Inference Parameters (used during training evaluation):**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_output_tokens` | 1000 | Max tokens in generated response |
| `temperature` | 1.0 | Sampling temperature |
| `top_p` | 1.0 | Top-p nucleus sampling |
| `response_candidates_count` | 2 | Candidates per response |

**Optional fields:**
| Field | Description |
|-------|-------------|
| `chunk_size` | Chunk size for data processing |
| `node_count` | Nodes for distributed training |
| `evaluator_version` | Which evaluator version to use |
| `resume_mode` | Only for `checkpointed/{cloud_job_id}`. `weights-only` (default) or `full-state` |

**Response:**
```json
{
  "id": "ft_job_001",
  "provider_job_id": "ftjob-abc123",
  "status": "pending",
  "base_model": "unsloth/Qwen3.5-4B",
  "dataset_id": "ds_abc123",
  "created_at": "2026-03-05T10:00:00Z"
}
```

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
  "base_model": "unsloth/Qwen3.5-4B",
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

### POST `/finetune/evaluations`

Create an evaluation run. The backend generates model responses for each row and scores them using the configured grader.

```bash
curl -X POST http://localhost:9090/finetune/evaluations \
  -H "Content-Type: application/json" \
  -d '{
    "dataset_id": "ds_abc123",
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

**Query params:** `finetune_job_id`, `row_index`, `epoch` (all optional filters)

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
