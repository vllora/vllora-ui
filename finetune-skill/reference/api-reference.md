# vLLora Finetune API Reference

Base URL: `http://localhost:9090` (configurable)

All endpoints use JSON unless noted. Auth via `Authorization: Bearer <token>` header when configured.

**Note:** These are the platform APIs for dataset management, evaluation, and training. Data generation, topic design, and grader writing are handled by the agent directly — no LLM API calls needed.

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
| **Records** (scoped to workflow) | | | |
| 23 | GET | `/finetune/workflows/{id}/records` | List records |
| 24 | POST | `/finetune/workflows/{id}/records` | Add records |
| 25 | PUT | `/finetune/workflows/{id}/records` | Replace all records |
| 26 | DELETE | `/finetune/workflows/{id}/records` | Delete all records |
| 27 | PATCH | `/finetune/workflows/{id}/records/{record_id}` | Update record topic |
| 28 | PATCH | `/finetune/workflows/{id}/records/{record_id}/data` | Update record data |
| 29 | PATCH | `/finetune/workflows/{id}/records/topics` | Batch update topics |
| **Topics** (scoped to workflow) | | | |
| 30 | GET | `/finetune/workflows/{id}/topics` | List topics |
| 31 | POST | `/finetune/workflows/{id}/topics` | Create topics |
| 32 | DELETE | `/finetune/workflows/{id}/topics` | Delete all topics |
| **Topic Hierarchy AI** | | | |
| 33 | POST | `/finetune/topic-hierarchy/generate` | Generate topic hierarchy |
| 34 | POST | `/finetune/topic-hierarchy/adjust` | Adjust topic hierarchy |
| **Knowledge Sources** (scoped to workflow) | | | |
| 35 | GET | `/finetune/workflows/{id}/knowledge` | List knowledge sources |
| 36 | POST | `/finetune/workflows/{id}/knowledge` | Create knowledge source |
| 37 | DELETE | `/finetune/workflows/{id}/knowledge` | Delete all |

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

```bash
curl -X PATCH http://localhost:9090/finetune/workflows/WORKFLOW_ID/evaluator \
  -H "Content-Type: application/json" \
  -d '{
    "evaluator": {
      "type": "js",
      "config": {
        "script": "async function evaluate(input) { ... }"
      }
    }
  }'
```

### GET `/finetune/workflows/{workflow_id}/evaluator/versions`

View evaluator version history with git-style diffs between consecutive versions.

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

```bash
curl -X POST http://localhost:9090/finetune/workflows/WORKFLOW_ID/jobs \
  -H "Content-Type: application/json" \
  -d '{
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

Get real-time training metrics (reward, loss, grad_norm, KL, completion length, etc.).

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

## 6. Workflow CRUD (Local)

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

## 7. Workflow Records (Local)

### POST `/finetune/workflows/{workflow_id}/records`

Add records to a workflow.

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

### PATCH `/finetune/workflows/{workflow_id}/records/topics`

Batch update record topics.

```bash
curl -X PATCH http://localhost:9090/finetune/workflows/WORKFLOW_ID/records/topics \
  -H "Content-Type: application/json" \
  -d '{"updates": [{"record_id": "uuid1", "topic": "Tactics/Pins"}]}'
```

---

## 8. Workflow Topics (Local)

### POST `/finetune/workflows/{workflow_id}/topics`

Save topic hierarchy.

### GET `/finetune/workflows/{workflow_id}/topics`

List topics.

### DELETE `/finetune/workflows/{workflow_id}/topics`

Delete all topics.

---

## 9. Topic Hierarchy Generation (AI)

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

## 10. Deployments

### POST `/finetune/deployments`

Deploy a fine-tuned model for inference.

### DELETE `/finetune/deployments/{deployment_id}`

Delete deployment.

---

## 11. Testing Deployed Models

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

## 12. Dataset Analytics (Optional)

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

# 2. Upload records
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/records \
  -H "Content-Type: application/json" \
  -d '{"records": [...]}'

# 3. Save topics
curl -X POST http://localhost:9090/finetune/workflows/$WORKFLOW_ID/topics \
  -H "Content-Type: application/json" \
  -d '{"topics": [...]}'

# 4. Save evaluator
curl -X PATCH http://localhost:9090/finetune/workflows/$WORKFLOW_ID/evaluator \
  -H "Content-Type: application/json" \
  -d '{"evaluator": {"type": "js", "config": {"script": "..."}}}'

# 5. Tell user to open the UI
echo "Open vLLora UI → select '$WORKFLOW_NAME' → Lucy will take over from evaluation step"
```

## Mode B Pipeline (Full CLI)

When running the full pipeline from CLI:

```bash
# 1. Upload dataset to cloud
uv run scripts/upload_dataset.py --file training.jsonl --grader grader.js
# → Returns backend dataset ID (ds_abc123)

# 2. Run evaluation
uv run scripts/run_evaluation.py --dataset-id ds_abc123 --output evaluations/eval-v1.json

# 3. (If grader changes only) Update evaluator
curl -X PATCH http://localhost:9090/finetune/workflows/WORKFLOW_ID/evaluator \
  -H "Content-Type: application/json" \
  -d '{"evaluator": {"type": "js", "config": {"script": "..."}}}'

# 4. Start training (requires workflow_id)
uv run scripts/start_training.py --workflow-id WORKFLOW_ID --dataset-id ds_abc123 \
  --output-model my-model --output training-jobs/job-001.json

# 5. Check per-epoch scores
curl "http://localhost:9090/finetune/datasets/ds_abc123/finetune-evaluations?finetune_job_id=JOB_ID"

# 6. Test the model
curl -X POST http://localhost:9090/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "my-model", "messages": [{"role": "user", "content": "Test query"}]}'
```
