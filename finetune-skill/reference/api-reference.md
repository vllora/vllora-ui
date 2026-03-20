# vLLora Finetune API Reference

Base URL: `http://localhost:9090` (configurable)

All endpoints use JSON unless noted. Auth via `Authorization: Bearer <token>` header when configured.

**Note:** These are the platform APIs for dataset management, evaluation, and training. Data generation uses `scripts/generate_records.py` which calls the LLM via `scripts/chat_completion.py` (through the `/v1/chat/completions` endpoint). Topic design and grader writing are handled by the agent directly.

---

## Quick Reference

| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| **Cloud Endpoints** | | | |
| 1 | POST | `/finetune/datasets` | Upload dataset (multipart) |
| 2 | POST | `/finetune/evaluations` | Create evaluation run |
| 3 | GET | `/finetune/evaluations/{id}` | Poll evaluation results |
| 4 | POST | `/finetune/deployments` | Deploy model |
| 5 | DELETE | `/finetune/deployments/{id}` | Delete deployment |
| 6 | GET | `/finetune/datasets/{id}/finetune-evaluations` | Per-epoch training evaluations |
| 7 | POST | `/finetune/datasets/analytics/dry-run` | Dataset analytics |
| 8 | GET | `/finetune/datasets/{id}/analytics` | Get dataset analytics |
| **Workflow CRUD** | | | |
| 9 | GET | `/finetune/workflows` | List all workflows |
| 10 | POST | `/finetune/workflows` | Create workflow |
| 11 | GET | `/finetune/workflows/{id}` | Get workflow |
| 12 | PUT | `/finetune/workflows/{id}` | Update workflow |
| 13 | DELETE | `/finetune/workflows/{id}` | Soft delete workflow |
| **Training Jobs** (scoped to workflow) | | | |
| 14 | POST | `/finetune/workflows/{id}/jobs` | Create training job |
| 15 | GET | `/finetune/workflows/{id}/jobs` | List training jobs |
| 16 | GET | `/finetune/workflows/{id}/jobs/{job_id}/status` | Get job status |
| 17 | GET | `/finetune/workflows/{id}/jobs/{job_id}/metrics` | Get training metrics |
| 18 | POST | `/finetune/workflows/{id}/jobs/{job_id}/cancel` | Cancel job |
| 19 | POST | `/finetune/workflows/{id}/jobs/{job_id}/resume` | Resume job |
| 20 | GET | `/finetune/workflows/{id}/jobs/{job_id}/weights/url` | Download weights URL |
| **Evaluator** (scoped to workflow) | | | |
| 21 | PATCH | `/finetune/workflows/{id}/evaluator` | Update evaluator script |
| 22 | GET | `/finetune/workflows/{id}/evaluator/versions` | Evaluator version history |
| 23 | POST | `/finetune/workflows/{id}/evaluator/dry-run` | Test grader on single row |
| **Dataset Package** (workflow → cloud) | | | |
| 23 | POST | `/finetune/workflows/{id}/dataset/upload` | Package records+topics+evaluator → cloud JSONL |
| 24 | POST | `/finetune/workflows/{id}/dataset/analytics/dry-run` | Dataset analytics (workflow-scoped) |
| 25 | GET | `/finetune/workflows/{id}/dataset/analytics` | Get dataset analytics (workflow-scoped) |
| 26 | GET | `/finetune/workflows/{id}/dataset/finetune-evaluations` | Per-epoch evals (workflow-scoped) |
| **Eval Jobs** (local tracking, scoped to workflow) | | | |
| 27 | POST | `/finetune/workflows/{id}/eval-jobs` | Create eval job record |
| 28 | GET | `/finetune/workflows/{id}/eval-jobs` | List eval jobs |
| 29 | GET | `/finetune/workflows/{id}/eval-jobs/{job_id}` | Get eval job |
| 30 | PATCH | `/finetune/workflows/{id}/eval-jobs/{job_id}` | Update eval job status |
| 31 | DELETE | `/finetune/workflows/{id}/eval-jobs/{job_id}` | Delete eval job |
| 32 | DELETE | `/finetune/workflows/{id}/eval-jobs` | Delete all eval jobs |
| 33 | GET | `/finetune/eval-jobs?status=X` | Cross-workflow eval job query |
| **Records** (scoped to workflow) | | | |
| 34 | GET | `/finetune/workflows/{id}/records` | List records |
| 35 | POST | `/finetune/workflows/{id}/records` | Add records |
| 36 | PUT | `/finetune/workflows/{id}/records` | Replace all records |
| 37 | DELETE | `/finetune/workflows/{id}/records` | Delete all records |
| 38 | DELETE | `/finetune/workflows/{id}/records/{record_id}` | Delete single record |
| 39 | PATCH | `/finetune/workflows/{id}/records/{record_id}` | Update record topic |
| 40 | PATCH | `/finetune/workflows/{id}/records/{record_id}/data` | Update record data |
| 41 | PATCH | `/finetune/workflows/{id}/records/{record_id}/scores` | Write-back eval scores |
| 42 | PATCH | `/finetune/workflows/{id}/records/topics` | Batch update topics |
| 43 | PATCH | `/finetune/workflows/{id}/records/rename-topic` | Rename topic across records |
| 44 | DELETE | `/finetune/workflows/{id}/records/topics/{name}` | Clear topic from records |
| 45 | DELETE | `/finetune/workflows/{id}/records/topics` | Clear all topics |
| **Topics** (scoped to workflow) | | | |
| 46 | GET | `/finetune/workflows/{id}/topics` | List topics |
| 47 | POST | `/finetune/workflows/{id}/topics` | Create topics |
| 48 | PUT | `/finetune/workflows/{id}/topics` | Update topics |
| 49 | DELETE | `/finetune/workflows/{id}/topics` | Delete topics |
| 50 | GET | `/finetune/workflows/{id}/topics/relations` | List topic-source relations |
| 51 | POST | `/finetune/workflows/{id}/topics/relations` | Create topic-source relations |
| 52 | PUT | `/finetune/workflows/{id}/topics/relations` | Update topic-source relations |
| 53 | DELETE | `/finetune/workflows/{id}/topics/relations` | Delete topic-source relations |
| **Topic Hierarchy AI** | | | |
| 54 | POST | `/finetune/topic-hierarchy/generate` | Generate topic hierarchy |
| 55 | POST | `/finetune/topic-hierarchy/adjust` | Adjust topic hierarchy |
| **Knowledge Sources** (scoped to workflow) | | | |
| 56 | GET | `/finetune/workflows/{id}/knowledge` | List knowledge sources |
| 57 | GET | `/finetune/workflows/{id}/knowledge/{ks_id}` | Get single knowledge source |
| 58 | GET | `/finetune/workflows/{id}/knowledge/count` | Count knowledge sources |
| 59 | POST | `/finetune/workflows/{id}/knowledge` | Create knowledge source (multipart) |
| 60 | POST | `/finetune/workflows/{id}/knowledge/{ks_id}/parts` | Add parts |
| 61 | GET | `/finetune/workflows/{id}/knowledge/{ks_id}/parts` | List parts |
| 62 | DELETE | `/finetune/workflows/{id}/knowledge/{ks_id}/parts/{part_id}` | Delete single part |
| 63 | DELETE | `/finetune/workflows/{id}/knowledge/{ks_id}` | Soft delete single |
| 64 | DELETE | `/finetune/workflows/{id}/knowledge` | Soft delete all |

---

## 1. Dataset Upload

### POST `/finetune/datasets`

Upload a training dataset (JSONL format) with optional topic hierarchy and evaluation script. Uses `multipart/form-data`.

```bash
curl -X POST http://localhost:9090/finetune/datasets \
  -F "file=@training.jsonl;type=application/x-ndjson" \
  -F "dataset_id=$(uuidgen | tr '[:upper:]' '[:lower:]')" \
  -F "topic_hierarchy={...}" \
  -F "eval_script=function evaluate(input) { ... }" \
  -F 'evaluator={"type":"js","config":{"script":"","completion_params":{"model":"gpt-4o-mini","temperature":0.0,"max_tokens":300}}}'
```

**Form fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | JSONL training data file |
| `dataset_id` | string | Yes | Unique dataset identifier — **must be a valid UUID** (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890`). Generate one with `uuidgen | tr '[:upper:]' '[:lower:]'` |
| `topic_hierarchy` | string | No | JSON string of topic hierarchy |
| `eval_script` | string | No | JavaScript evaluator script |
| `evaluator` | string | No | JSON evaluator config (required if eval_script is provided) |

**Evaluator config format** (required when uploading eval_script):
```json
{
  "type": "js",
  "config": {
    "script": "",
    "completion_params": {
      "model": "gpt-4o-mini",
      "temperature": 0.0,
      "max_tokens": 300
    }
  }
}
```

The backend merges the `eval_script` content into `evaluator.config.script`.

**Response:**
```json
{
  "dataset_id": "ds_abc123"
}
```

The returned `dataset_id` is the **cloud/backend dataset ID** — different from the local workflow ID. This ID is used for evaluations, training jobs, and per-epoch evaluations.

---

## 2. Update Evaluator Script

### PATCH `/finetune/workflows/{workflow_id}/evaluator`

Update the evaluation script for a workflow without re-uploading data. Also syncs to the cloud dataset's evaluator. Use this when iterating on the grader.

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

**Notes:** The QuickJS sandbox does NOT support `console.log` — use the `reason` field for debug output.

---

## 3. Evaluation (Dry Run)

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
| `dataset_id` | string | Yes | Backend dataset ID (from upload response) |
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
        "messages": [...]
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

## 4. Training Jobs

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

**Status values:** `pending` → `running` → `succeeded` | `failed` | `cancelled`

**Response:**
```json
{
  "id": "ft_job_001",
  "provider_job_id": "ftjob-abc123",
  "status": "running",
  "base_model": "unsloth/Qwen3.5-4B",
  "fine_tuned_model": null,
  "training_config": {...},
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
| Optimization | `loss`, `grad_norm`, `kl` | Training stability — watch for NaN, spikes, or KL divergence rising |
| Completions | `completions/clipped_ratio`, `completions/mean_length` | Whether outputs are being truncated (clipped_ratio > 0.7 = critical) |

**Alert thresholds:**
| Condition | Severity | Action |
|-----------|----------|--------|
| NaN/Inf in loss, reward, KL, grad_norm | Critical | Training numerically unstable — cancel and investigate |
| `completions/clipped_ratio` > 0.70 | Critical | Increase `max_output_tokens` in inference parameters |
| KL rising > 1.5x over last steps | Warning | Policy drifting — lower learning rate |
| `grad_norm` spikes > 3x median | Warning | Instability — may need gradient clipping |
| `frac_reward_zero_std` > 0.60 | Warning | Weak training signal — grader not differentiating |
| `reward_std` < 0.05 | Info | Collapsed diversity — model converging on single pattern |

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

## 5. Finetune Evaluation Results (per-epoch, during training)

### GET `/finetune/datasets/{dataset_id}/finetune-evaluations`

Get per-epoch evaluation results showing how the model improves during training.

```bash
curl "http://localhost:9090/finetune/datasets/ds_abc123/finetune-evaluations?finetune_job_id=ftjob-abc123&epoch=1"
```

**Query params:** `finetune_job_id`, `row_index`, `epoch` (all optional filters)

**Response:**
```json
{
  "results": [{
    "row_index": 0,
    "row": {"id": "record-1", "messages": [...]},
    "epochs": {
      "0": [{"score": 0.5, "reason": "...", "status": "completed"}],
      "1": [{"score": 0.7, "reason": "...", "status": "completed"}],
      "2": [{"score": 0.85, "reason": "...", "status": "completed"}]
    }
  }]
}
```

---

## 6. Dataset Package (Workflow → Cloud)

These endpoints package local workflow data (records, topics, evaluator) into a JSONL snapshot and push it to the cloud. **This is the bridge between local CRUD and cloud operations (eval, training).**

### POST `/finetune/workflows/{workflow_id}/dataset/upload`

Package the workflow's records + topics + evaluator from local SQLite into JSONL and upload to the cloud. **Must be called before every evaluation or training run** if local data has changed.

```bash
curl -X POST http://localhost:9090/finetune/workflows/WORKFLOW_ID/dataset/upload
```

This replaces the standalone `POST /finetune/datasets` when you use local CRUD. The gateway reads from `workflow_records`, `workflow_topics`, and `workflows.eval_script`, packages them into JSONL, and uploads to `api.langdb.cloud`.

**When to use which upload:**
| Scenario | Endpoint | Why |
|----------|----------|-----|
| Using local CRUD (records/topics/evaluator via API) | `POST /workflows/{id}/dataset/upload` | Packages from SQLite automatically |
| Direct file upload (no local CRUD) | `POST /finetune/datasets` (multipart) | Uploads JSONL file directly |

> **Important:** After ANY record, topic, or evaluator change, you must call `dataset/upload` again before the next eval or training run. The cloud snapshot is immutable — it doesn't auto-sync.

### POST `/finetune/workflows/{workflow_id}/dataset/analytics/dry-run`

Run quality analytics on the workflow's dataset. Workflow-scoped version of `POST /finetune/datasets/analytics/dry-run`.

### GET `/finetune/workflows/{workflow_id}/dataset/analytics`

Get analytics for the workflow's uploaded dataset (record count, token stats).

### GET `/finetune/workflows/{workflow_id}/dataset/finetune-evaluations`

Get per-epoch evaluation results during training. Workflow-scoped version of `GET /finetune/datasets/{id}/finetune-evaluations`.

```bash
curl "http://localhost:9090/finetune/workflows/WORKFLOW_ID/dataset/finetune-evaluations?finetune_job_id=JOB_ID"
```

---

## 7. Eval Jobs (Local Tracking)

Track evaluation runs locally per workflow. These complement the cloud evaluation endpoints — the cloud runs the eval, and these endpoints store the job metadata locally for history and comparison.

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

### PATCH `/finetune/workflows/{workflow_id}/eval-jobs/{job_id}`

Update eval job status (e.g., `running` → `completed`) and store results.

```bash
curl -X PATCH http://localhost:9090/finetune/workflows/WORKFLOW_ID/eval-jobs/JOB_ID \
  -H "Content-Type: application/json" \
  -d '{"status": "completed", "results": {...}}'
```

### GET `/finetune/eval-jobs?status=running`

Cross-workflow query — find eval jobs by status across all workflows. Useful for checking if any evaluations are still running.

---

## 8. Record Score Write-back

### PATCH `/finetune/workflows/{workflow_id}/records/{record_id}/scores`

Write evaluation scores back to individual records after an eval run completes. This enables per-record analysis — sort records by score to find weak spots.

```bash
curl -X PATCH http://localhost:9090/finetune/workflows/WORKFLOW_ID/records/RECORD_ID/scores \
  -H "Content-Type: application/json" \
  -d '{"dry_run_score": 0.85}'
```

**Full eval → score write-back flow:**
```bash
# 1. Upload dataset
curl -X POST http://localhost:9090/finetune/workflows/WORKFLOW_ID/dataset/upload

# 2. Create eval job (cloud)
EVAL=$(curl -s -X POST http://localhost:9090/finetune/evaluations \
  -H "Content-Type: application/json" \
  -d '{"dataset_id": "...", "rollout_model_params": {"model": "gpt-4o-mini"}}')

# 3. Track locally
curl -X POST http://localhost:9090/finetune/workflows/WORKFLOW_ID/eval-jobs \
  -H "Content-Type: application/json" \
  -d "{\"cloud_run_id\": \"$(echo $EVAL | python3 -c 'import sys,json;print(json.load(sys.stdin)[\"evaluation_run_id\"])')\"}"

# 4. Poll until complete, then write scores back to each record
# (parse results, loop over records, PATCH scores)
```

---

## 9. Topic Management (Extended)

### PATCH `/finetune/workflows/{workflow_id}/records/rename-topic`

Rename a topic across all records and the topic tree.

```bash
curl -X PATCH http://localhost:9090/finetune/workflows/WORKFLOW_ID/records/rename-topic \
  -H "Content-Type: application/json" \
  -d '{"old_topic": "Tactics/Pins", "new_topic": "Tactics/Pin Attacks"}'
```

### DELETE `/finetune/workflows/{workflow_id}/records/topics/{topicName}`

Clear a specific topic from all records (records remain, topic field set to null).

### DELETE `/finetune/workflows/{workflow_id}/records/topics`

Clear all topic assignments from all records.

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

## 10. Knowledge Sources (Extended)

### POST `/finetune/workflows/{workflow_id}/knowledge`

Create a knowledge source. Uses `multipart/form-data` — the file is required.

```bash
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/knowledge \
  -F "file=@document.pdf" \
  -F "name=document.pdf" \
  -F "reference_id=doc-001" \
  -F "description=Product manual v2" \
  -F 'metadata={"total_pages":84,"extraction_method":"docling_hybrid"}' \
  -F 'parts=[{"type":"text","content":"Chapter 1...","title":"Introduction","extraction_path":"[\"Introduction\"]"}]'
```

**Form fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | The source document (PDF, etc.) |
| `name` | string | Yes | Display name for the knowledge source |
| `reference_id` | string | No | External reference ID (unique per workflow) |
| `description` | string | No | Description of the document |
| `metadata` | JSON string | No | Extraction metadata (total_pages, extraction_method, etc.) |
| `parts` | JSON string | No | Array of parts to create inline (same format as POST /parts) |

**Response:**
```json
{
  "knowledge_source": {
    "id": "a1b2c3d4-...",
    "reference_id": "doc-001",
    "workflow_id": "wf_abc123",
    "name": "document.pdf",
    "description": "Product manual v2",
    "metadata": {"total_pages": 84, "extraction_method": "docling_hybrid"},
    "parts": [...]
  },
  "document_path": ".knowledge_store/wf_abc123/a1b2c3d4-.../document.pdf"
}
```

### POST `/finetune/workflows/{workflow_id}/knowledge/{ks_id}/parts`

Add extracted parts to a knowledge source. Body is a JSON array of parts.

```bash
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/knowledge/$KS_ID/parts \
  -H "Content-Type: application/json" \
  -d '[
    {
      "type": "text",
      "content": "The dominant sequence transduction models...",
      "title": "Abstract",
      "extraction_path": "[\"Abstract\"]",
      "reference_id": "p-001",
      "content_metadata": null,
      "extraction_metadata": {"pages": [1], "source_chunks": [2]}
    },
    {
      "type": "table",
      "content": "| Layer Type | Complexity |\n|---|---|\n| Self-Attention | O(n²·d) |",
      "title": "3.4 Embeddings",
      "extraction_path": "[\"3 Model Architecture\", \"3.4 Embeddings\"]",
      "content_metadata": {"num_rows": 5, "num_cols": 4, "headers": ["Layer Type", "Complexity"]},
      "extraction_metadata": {"pages": [6], "doc_item": "#/tables/0"}
    }
  ]'
```

**Part fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `text`, `table`, or `image` |
| `content` | string | Yes | Text content, markdown table, or base64 data URI |
| `id` | string | No | Custom ID (auto-generated UUID if omitted) |
| `reference_id` | string | No | External reference (used for topic-source linking) |
| `title` | string | No | Section title |
| `extraction_path` | string | No | JSON-encoded heading hierarchy |
| `content_metadata` | object | No | Type-specific metadata (table headers/rows, image dimensions) |
| `extraction_metadata` | object | No | Provenance (pages, source_chunks, doc_item) |

**Response:**
```json
{
  "parts": [
    {"id": "uuid-1", "reference_id": "p-001", "source_id": "ks-id", "type": "text", ...},
    {"id": "uuid-2", "source_id": "ks-id", "type": "table", ...}
  ]
}
```

### GET `/finetune/workflows/{workflow_id}/knowledge/{ks_id}/parts`

List all parts for a knowledge source.

```bash
curl http://localhost:9090/finetune/workflows/$WORKFLOW_ID/knowledge/$KS_ID/parts
```

### DELETE `/finetune/workflows/{workflow_id}/knowledge/{ks_id}/parts/{part_id}`

Delete a single part.

```bash
curl -X DELETE http://localhost:9090/finetune/workflows/$WORKFLOW_ID/knowledge/$KS_ID/parts/$PART_ID
```

### GET `/finetune/workflows/{workflow_id}/knowledge/{ks_id}`

Get a single knowledge source with its parts.

### GET `/finetune/workflows/{workflow_id}/knowledge/count`

Get count of active (non-deleted) knowledge sources.

### DELETE `/finetune/workflows/{workflow_id}/knowledge/{ks_id}`

Soft delete a single knowledge source.

### Adding Knowledge Mid-Workflow

```bash
# 1. Upload the document (multipart)
KS=$(curl -s -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/knowledge \
  -F "file=@new-doc.pdf" \
  -F "name=new-doc.pdf" \
  -F "description=Additional reference document")
KS_ID=$(echo "$KS" | python3 -c "import sys,json; print(json.load(sys.stdin)['knowledge_source']['id'])")

# 2. Add extracted parts
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/knowledge/$KS_ID/parts \
  -H "Content-Type: application/json" \
  -d '[{"type": "text", "content": "...", "title": "...", "reference_id": "p-001"}]'

# 3. Link parts to topics via relations (optional)
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/topics/relations \
  -H "Content-Type: application/json" \
  -d '{"relations": [{"topic_identifier": "billing", "part_identifier": "p-001"}]}'

# 4. Re-upload dataset before next eval
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/dataset/upload
```

---

## 11. Workflow CRUD (Local)

> Sections 11-17 cover the original endpoint details. For the extended endpoints added above (sections 6-10), curl examples and response formats follow the same patterns.

---

Workflows are the local representation of a finetune dataset project. Each workflow stores records, topics, knowledge sources, evaluator, and state.

### POST `/finetune/workflows`

Create a new workflow.

```bash
curl -X POST http://localhost:9090/finetune/workflows \
  -H "Content-Type: application/json" \
  -d '{"name": "Chess Tutor", "objective": "Expert chess tutor helping students improve"}'
```

**Response:** Full workflow object with `id`, `name`, `objective`, `state`, timestamps.

### GET `/finetune/workflows`

List all workflows.

### GET `/finetune/workflows/{workflow_id}`

Get a single workflow.

### PUT `/finetune/workflows/{workflow_id}`

Update workflow fields (name, objective, eval_script, state). All fields optional.

### DELETE `/finetune/workflows/{workflow_id}`

Soft delete.

---

## 12. Workflow Records (Local)

### POST `/finetune/workflows/{workflow_id}/records`

Add records to a workflow.

> **Prerequisite:** Create/upload topics first. Records have a foreign key on `topic`, so you should do topics first, then records.
>
> Topics need to be uploaded first — the records have a foreign key on topic. Let me do topics first, then records.

```bash
curl -X POST http://localhost:9090/finetune/workflows/WORKFLOW_ID/records \
  -H "Content-Type: application/json" \
  -d '{
    "records": [
      {
        "id": "record-uuid",
        "data": {"input": {"messages": [...]}, "output": {}},
        "topic": "billing/refunds",
        "is_generated": false
      }
    ]
  }'
```

### GET `/finetune/workflows/{workflow_id}/records`

List all records for a workflow.

### PUT `/finetune/workflows/{workflow_id}/records`

Replace all records atomically.

### DELETE `/finetune/workflows/{workflow_id}/records`

Delete all records.

### DELETE `/finetune/workflows/{workflow_id}/records/{record_id}`

Delete a single record.

### PATCH `/finetune/workflows/{workflow_id}/records/topics`

Batch update record topics.

```bash
curl -X PATCH http://localhost:9090/finetune/workflows/WORKFLOW_ID/records/topics \
  -H "Content-Type: application/json" \
  -d '{"updates": [{"record_id": "uuid1", "topic": "Tactics/Pins"}]}'
```

---

## 13. Workflow Topics (Local)

### POST `/finetune/workflows/{workflow_id}/topics`

Create topics. Topics use a flat structure with `parent_id` for hierarchy (no nested `children[]`).

```bash
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/topics \
  -H "Content-Type: application/json" \
  -d '{"topics": [
    {"id": "billing", "name": "Billing", "parent_id": null, "system_prompt": "Focus on payment and subscription questions"},
    {"id": "billing-refunds", "name": "Refunds", "parent_id": "billing", "system_prompt": "Focus on refund policies and processing"},
    {"id": "technical", "name": "Technical Support", "parent_id": null}
  ]}'
```

**Topic fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | No | Custom ID (auto-generated UUID if omitted) |
| `reference_id` | string | No | External reference ID |
| `name` | string | Yes | Display name |
| `parent_id` | string | No | Parent topic ID (null for root topics) |
| `system_prompt` | string | No | System prompt context for this topic |

### GET `/finetune/workflows/{workflow_id}/topics`

List all topics for a workflow.

### PUT `/finetune/workflows/{workflow_id}/topics`

Update existing topics.

```bash
curl -X PUT http://localhost:9090/finetune/workflows/$WORKFLOW_ID/topics \
  -H "Content-Type: application/json" \
  -d '{"topics": [
    {"identifier": "billing-refunds", "name": "Refund Policies", "system_prompt": "Updated prompt"}
  ]}'
```

**Update fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `identifier` | string | Yes | Topic ID or reference_id to update |
| `name` | string | No | New display name |
| `reference_id` | string | No | New reference ID |
| `parent_id` | string | No | New parent topic ID |
| `system_prompt` | string | No | New system prompt |

### DELETE `/finetune/workflows/{workflow_id}/topics`

Delete specific topics by identifier.

```bash
curl -X DELETE http://localhost:9090/finetune/workflows/$WORKFLOW_ID/topics \
  -H "Content-Type: application/json" \
  -d '{"identifiers": ["billing-refunds", "technical"]}'
```

### Topic-Source Relations

Link topics to knowledge source parts. This replaces the old `sourceChunkRefs` approach — instead of embedding references in the topic node, use a separate relations API.

#### GET `/finetune/workflows/{workflow_id}/topics/relations`

List all topic-source relations.

```bash
curl http://localhost:9090/finetune/workflows/$WORKFLOW_ID/topics/relations
```

#### POST `/finetune/workflows/{workflow_id}/topics/relations`

Create topic-source relations. Links topics to knowledge source parts.

```bash
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/topics/relations \
  -H "Content-Type: application/json" \
  -d '{"relations": [
    {"topic_identifier": "billing", "part_identifier": "p-001", "reference_id": "rel-001"},
    {"topic_identifier": "billing-refunds", "part_identifier": "p-002"}
  ]}'
```

**Relation fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic_identifier` | string | Yes | Topic ID or reference_id |
| `part_identifier` | string | Yes | Knowledge source part ID or reference_id (alias: `source_identifier`) |
| `id` | string | No | Custom relation ID |
| `reference_id` | string | No | External reference for this relation |

#### PUT `/finetune/workflows/{workflow_id}/topics/relations`

Update existing relations.

```bash
curl -X PUT http://localhost:9090/finetune/workflows/$WORKFLOW_ID/topics/relations \
  -H "Content-Type: application/json" \
  -d '{"relations": [
    {"identifier": "rel-001", "topic_identifier": "billing-updated", "part_identifier": "p-003"}
  ]}'
```

#### DELETE `/finetune/workflows/{workflow_id}/topics/relations`

Delete specific relations by identifier.

```bash
curl -X DELETE http://localhost:9090/finetune/workflows/$WORKFLOW_ID/topics/relations \
  -H "Content-Type: application/json" \
  -d '{"identifiers": ["rel-001"]}'
```

---

## 14. Topic Hierarchy Generation (AI)

### POST `/finetune/topic-hierarchy/generate`

Backend endpoint to generate a topic hierarchy. Alternatively, the agent can design the hierarchy directly from document content.

```bash
curl -X POST http://localhost:9090/finetune/topic-hierarchy/generate \
  -H "Content-Type: application/json" \
  -d '{
    "goals": "Customer support agent for SaaS platform",
    "depth": 3,
    "degree": 4,
    "records": [],
    "max_topics": 5,
    "seed_topics": ["Account Management", "Billing", "Technical Support"]
  }'
```

### POST `/finetune/topic-hierarchy/adjust`

Adjust an existing topic hierarchy.

---

## 15. Deployments

### POST `/finetune/deployments`

Deploy a fine-tuned model for inference.

### DELETE `/finetune/deployments/{deployment_id}`

Delete deployment.

---

## 16. Testing Deployed Models

### POST `/v1/chat/completions`

Standard OpenAI-compatible endpoint for testing the fine-tuned model after deployment.

```bash
curl -X POST http://localhost:9090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "my-finetuned-model",
    "messages": [
      {"role": "system", "content": "You are a customer support agent..."},
      {"role": "user", "content": "I need help with my billing"}
    ]
  }'
```

---

## 17. Dataset Analytics (Standalone)

### POST `/finetune/datasets/analytics/dry-run`

Run quality analytics on dataset rows without uploading. Quick sanity check.

```bash
curl -X POST http://localhost:9090/finetune/datasets/analytics/dry-run \
  -H "Content-Type: application/json" \
  -d '{"rows": [{"messages": [...]}]}'
```

---

## Mode A Pipeline (CLI → UI Handoff)

When handing off to the vLLora UI, create a workflow and populate it with data so Lucy can pick it up:

```bash
# 1. Create workflow
WORKFLOW=$(curl -s -X POST http://localhost:9090/finetune/workflows \
  -H "Content-Type: application/json" \
  -d '{"name": "My Project", "objective": "..."}')
WORKFLOW_ID=$(echo "$WORKFLOW" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 2. Upload knowledge sources (if documents were extracted)
KS=$(curl -s -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/knowledge \
  -F "file=@document.pdf" \
  -F "name=document.pdf" \
  -F "description=Source document")
KS_ID=$(echo "$KS" | python3 -c "import sys,json; print(json.load(sys.stdin)['knowledge_source']['id'])")

# 2b. Add extracted parts (if knowledge_parts.json exists)
PARTS=$(python3 -c "import json; d=json.load(open('knowledge/knowledge_parts.json')); print(json.dumps(d['parts']))")
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/knowledge/$KS_ID/parts \
  -H "Content-Type: application/json" -d "$PARTS"

# 3. Upload records
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/records \
  -H "Content-Type: application/json" \
  -d '{"records": [...]}'

# 4. Save topics
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/topics \
  -H "Content-Type: application/json" \
  -d '{"topics": [...]}'

# 5. Save evaluator
curl -X PATCH http://localhost:9090/finetune/workflows/$WORKFLOW_ID/evaluator \
  -F "file=@grader.js"

# 6. Tell user to open the UI
echo "Open vLLora UI → select '$WORKFLOW_NAME' → Lucy will take over from evaluation step"
```

## Mode B Pipeline (Full CLI) — Workflow-Integrated

**Recommended approach.** Uses local CRUD + `dataset/upload` for the full pipeline. All data is tracked in the gateway, visible in the UI, and supports iteration history.

```bash
# 1. Create workflow
WORKFLOW=$(curl -s -X POST http://localhost:9090/finetune/workflows \
  -H "Content-Type: application/json" \
  -d '{"name": "My Project", "objective": "..."}')
WORKFLOW_ID=$(echo "$WORKFLOW" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 2. Upload knowledge sources (if documents were extracted)
KS=$(curl -s -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/knowledge \
  -F "file=@document.pdf" \
  -F "name=document.pdf" \
  -F "description=Source document")
KS_ID=$(echo "$KS" | python3 -c "import sys,json; print(json.load(sys.stdin)['knowledge_source']['id'])")

# 2b. Add extracted parts (if knowledge_parts.json exists)
PARTS=$(python3 -c "import json; d=json.load(open('knowledge/knowledge_parts.json')); print(json.dumps(d['parts']))")
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/knowledge/$KS_ID/parts \
  -H "Content-Type: application/json" -d "$PARTS"

# 3. Upload records
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/records \
  -H "Content-Type: application/json" \
  -d '{"records": [...]}'

# 4. Save topics
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/topics \
  -H "Content-Type: application/json" \
  -d '{"topics": [...]}'

# 5. Save evaluator
curl -X PATCH http://localhost:9090/finetune/workflows/$WORKFLOW_ID/evaluator \
  -F "file=@grader.js"

# 6. Package and upload to cloud
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/dataset/upload

# 7. Run evaluation
curl -s -X POST http://localhost:9090/finetune/evaluations \
  -H "Content-Type: application/json" \
  -d '{"dataset_id": "'$WORKFLOW_ID'", "rollout_model_params": {"model": "gpt-4o-mini"}}'
# Track eval job locally
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/eval-jobs \
  -H "Content-Type: application/json" \
  -d '{"cloud_run_id": "EVAL_RUN_ID", "rollout_model": "gpt-4o-mini"}'

# 8. Poll, analyze, write scores back to records
# (for each record in results:)
curl -X PATCH http://localhost:9090/finetune/workflows/$WORKFLOW_ID/records/RECORD_ID/scores \
  -H "Content-Type: application/json" \
  -d '{"dry_run_score": 0.85}'

# 9. Iterate: fix grader or data, then re-upload and re-eval
curl -X PATCH http://localhost:9090/finetune/workflows/$WORKFLOW_ID/evaluator \
  -F "file=@grader.js"
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/dataset/upload
# Run eval again...

# 10. Start training
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/jobs \
  -H "Content-Type: application/json" \
  -d '{"job_type": "provider_finetune", "dataset": "'$WORKFLOW_ID'", "base_model": "unsloth/Qwen3.5-4B", "output_model": "my-model"}'

# 11. Monitor metrics
curl -s "http://localhost:9090/finetune/workflows/$WORKFLOW_ID/jobs/JOB_ID/metrics"

# 12. Check per-epoch scores
curl "http://localhost:9090/finetune/workflows/$WORKFLOW_ID/dataset/finetune-evaluations?finetune_job_id=JOB_ID"

# 13. Test the model
curl -X POST http://localhost:9090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "my-model", "messages": [{"role": "user", "content": "Test query"}]}'
```

## Mode B Pipeline (Full CLI) — Standalone Upload

**Simpler approach.** Uploads JSONL directly without using local CRUD. Data lives only in local files and on the cloud — not tracked in the gateway. Use this if you don't need UI visibility or iteration history.

```bash
# 1. Upload dataset to cloud (standalone — no local CRUD)
uv run scripts/upload_dataset.py --file training.jsonl --grader grader.js
# → Returns backend dataset ID (ds_abc123)

# 2. Run evaluation
uv run scripts/run_evaluation.py --dataset-id ds_abc123 --output evaluations/eval-v1.json

# 3. Create workflow (needed for training job scoping)
WORKFLOW=$(curl -s -X POST http://localhost:9090/finetune/workflows \
  -H "Content-Type: application/json" \
  -d '{"name": "My Project", "objective": "..."}')
WORKFLOW_ID=$(echo "$WORKFLOW" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 4. Start training
uv run scripts/start_training.py --workflow-id $WORKFLOW_ID --dataset-id ds_abc123 \
  --output-model my-model --output training-jobs/job-001.json

# 5. Test the model
curl -X POST http://localhost:9090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "my-model", "messages": [{"role": "user", "content": "Test query"}]}'
```
