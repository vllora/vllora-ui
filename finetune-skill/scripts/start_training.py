# /// script
# dependencies = ["requests>=2.31"]
# ///
"""Start a reinforcement fine-tuning job on the vLLora gateway.

Usage:
  uv run scripts/start_training.py --workflow-id WF_ID --dataset-id ds_abc123 --output-model my-model [--base-model Qwen3.5-4B]

Creates a training job under a workflow and polls until complete.
"""

import argparse
import json
import sys
import time
from pathlib import Path

import requests

DEFAULT_BASE_URL = "http://localhost:9090"
DEFAULT_BASE_MODEL = "Qwen3.5-4B"
POLL_INTERVAL = 15
MAX_POLL_ATTEMPTS = 300  # ~75 minutes


def start_training(
    workflow_id: str,
    dataset_id: str,
    output_model: str,
    base_model: str,
    base_url: str,
    display_name: str | None = None,
    output_path: Path | None = None,
) -> dict:
    payload = {
        "job_type": "provider_finetune",  # Required by gateway API
        "dataset": dataset_id,
        "base_model": base_model,
        "output_model": output_model,
        "display_name": display_name or f"Fine-tune {output_model}",
        "training_config": {
            "learning_rate": 0.000001,  # 1e-6: standard GRPO LR (arXiv:2402.03300, arXiv:2503.14476). Higher causes forgetting spiral.
            "lora_rank": 8,
            "gradient_accumulation_steps": 5,
            "epochs": 5,  # Adaptive in finetune.py (8/5/3/2 by dataset size). Reduced to prevent forgetting (arXiv:2505.22257).
            "batch_size": 5,
            "beta": 0.01,  # KL penalty — prevents catastrophic forgetting (arXiv:2509.07430)
            "loss_type": "dr_grpo",  # No length bias (arXiv:2503.20783)
            "mask_truncated_completions": False,  # Prevents kl=nan crash (Unsloth #3006)
            "scale_rewards": "none",  # Dr. GRPO: no std normalization to avoid difficulty bias
            "importance_sampling_level": "sequence",  # GSPO stable training
        },
        "inference_parameters": {
            "max_output_tokens": 2048,  # Starting default — finetune.py auto-adjusts based on dataset content. Bumped from 512 after tau-bench tool-call truncation (2026-04-21).
            "temperature": 1.0,
            "top_p": 1.0,
            "response_candidates_count": 8,  # GRPO minimum: all published work uses G>=8
        },
    }

    resp = requests.post(
        f"{base_url}/finetune/workflows/{workflow_id}/jobs",
        json=payload,
        headers={"Content-Type": "application/json"},
    )
    resp.raise_for_status()
    job_data = resp.json()
    job_id = job_data.get("id")
    print(f"Training job created: {job_id}")
    print(f"  Workflow:     {workflow_id}")
    print(f"  Base model:   {base_model}")
    print(f"  Output model: {output_model}")

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(job_data, indent=2))

    # Poll until complete
    for attempt in range(MAX_POLL_ATTEMPTS):
        time.sleep(POLL_INTERVAL)
        resp = requests.get(f"{base_url}/finetune/workflows/{workflow_id}/jobs/{job_id}/status")
        resp.raise_for_status()
        result = resp.json()

        status = result.get("status", "unknown")
        print(f"  [{attempt + 1}] status={status}")

        if status == "succeeded":
            model_name = result.get("fine_tuned_model", output_model)
            print(f"\nTraining succeeded!")
            print(f"  Fine-tuned model: {model_name}")

            if output_path:
                output_path.write_text(json.dumps(result, indent=2))
                print(f"  Saved to: {output_path}")

            return result

        if status in ("failed", "cancelled"):
            error = result.get("error_message", "unknown error")
            print(f"\nTraining {status}: {error}", file=sys.stderr)
            sys.exit(1)

    print(f"\nTimeout: training still running after {MAX_POLL_ATTEMPTS * POLL_INTERVAL}s", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Start training job on vLLora gateway")
    parser.add_argument("--workflow-id", required=True, help="Workflow ID (UUID)")
    parser.add_argument("--dataset-id", required=True, help="Backend dataset ID")
    parser.add_argument("--output-model", required=True, help="Name for the fine-tuned model")
    parser.add_argument("--base-model", default=DEFAULT_BASE_MODEL, help="Base model to fine-tune")
    parser.add_argument("--display-name", help="Display name for the job")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Gateway base URL")
    parser.add_argument("--output", help="Path to save job response JSON")
    args = parser.parse_args()

    output_path = Path(args.output) if args.output else None

    try:
        start_training(
            args.workflow_id, args.dataset_id, args.output_model, args.base_model,
            args.base_url, args.display_name, output_path,
        )
    except requests.HTTPError as e:
        print(f"Error: Request failed with status {e.response.status_code}", file=sys.stderr)
        print(f"  Response: {e.response.text}", file=sys.stderr)
        sys.exit(1)
    except requests.ConnectionError:
        print(f"Error: Cannot connect to {args.base_url}. Is the gateway running?", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
