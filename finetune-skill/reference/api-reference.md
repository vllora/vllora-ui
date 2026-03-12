# vLLora Finetune API Reference

Base URL: `http://localhost:9090` (configurable)

All endpoints use JSON unless noted. Auth via `Authorization: Bearer <token>` header when configured.

**Note:** These are the platform APIs for dataset management, evaluation, and training. Data generation, topic design, and grader writing are handled by the agent directly — no LLM API calls needed.

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

---

## 2. Update Evaluator Script

### PATCH `/finetune/datasets/{dataset_id}/evaluator`

Update the evaluation script for an already-uploaded dataset without re-uploading data. Use this when iterating on the grader.

```bash
curl -X PATCH http://localhost:9090/finetune/datasets/ds_abc123/evaluator \
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

**Response:**
```json
{
  "dataset_id": "ds_abc123",
  "updated": true
}
```

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

### POST `/finetune/reinforcement-jobs`

Create a fine-tuning job.

```bash
curl -X POST http://localhost:9090/finetune/reinforcement-jobs \
  -H "Content-Type: application/json" \
  -d '{
    "dataset": "ds_abc123",
    "base_model": "unsloth/Qwen3.5-4B",
    "output_model": "my-custom-model-1234567890",
    "display_name": "Customer Support Fine-tune",
    "training_config": {
      "learning_rate": 0.00001,
      "lora_rank": 8,
      "gradient_accumulation_steps": 40,
      "epochs": 2.0,
      "batch_size": 100
    },
    "inference_parameters": {
      "max_output_tokens": 1000,
      "temperature": 0.7,
      "top_p": 0.9,
      "response_candidates_count": 2
    }
  }'
```

**Training Config Defaults:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `learning_rate` | 0.00001 | Learning rate for LoRA fine-tuning |
| `lora_rank` | 8 | LoRA rank (higher = more parameters, slower) |
| `gradient_accumulation_steps` | 40 | Steps before weight update |
| `epochs` | 2.0 | Number of training epochs |
| `batch_size` | 100 | Training batch size |

**Inference Parameters (used during training evaluation):**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_output_tokens` | 1000 | Max tokens in generated response |
| `temperature` | 0.7 | Sampling temperature |
| `top_p` | 0.9 | Top-p nucleus sampling |
| `response_candidates_count` | 2 | Candidates per response |

**Optional fields:**
| Field | Description |
|-------|-------------|
| `chunk_size` | Chunk size for data processing |
| `node_count` | Nodes for distributed training |

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

### GET `/finetune/reinforcement-jobs`

List all fine-tuning jobs. Optional query params: `limit`, `after` (pagination), `dataset_id` (filter).

### GET `/finetune/reinforcement-jobs/{job_id}/status`

Check training job status.

**Status values:** `pending` → `running` → `succeeded` | `failed` | `cancelled`

**Response includes:**
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

### POST `/finetune/reinforcement-jobs/{job_id}/cancel`

Cancel a running training job.

### POST `/finetune/reinforcement-jobs/{job_id}/resume`

Resume a cancelled training job.

### GET `/finetune/reinforcement-jobs/{job_id}/weights/url`

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

## 6. Topic Hierarchy Generation (Optional — agent can build this directly)

### POST `/finetune/topic-hierarchy/generate`

Backend endpoint to generate a topic hierarchy. Alternatively, the agent can design the hierarchy directly from document content.

```bash
curl -X POST http://localhost:9090/finetune/topic-hierarchy/generate \
  -H "Content-Type: application/json" \
  -d '{
    "goals": "Customer support agent for SaaS platform",
    "depth": 3,
    "degree": 4,
    "records": [{"data": {"input": {"messages": [...]}, "output": {"messages": [...]}}}],
    "max_topics": 5,
    "seed_topics": ["Account Management", "Billing", "Technical Support"]
  }'
```

**Response:**
```json
{
  "success": true,
  "hierarchy": [
    {
      "id": "billing",
      "name": "Billing",
      "description": "Payment and subscription topics",
      "children": [...]
    }
  ]
}
```

---

## 7. Testing Deployed Models

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

## 8. Dataset Analytics (Optional)

### POST `/finetune/datasets/analytics/dry-run`

Run quality analytics on dataset rows without uploading. Quick sanity check.

```bash
curl -X POST http://localhost:9090/finetune/datasets/analytics/dry-run \
  -H "Content-Type: application/json" \
  -d '{"rows": [{"messages": [...]}]}'
```
