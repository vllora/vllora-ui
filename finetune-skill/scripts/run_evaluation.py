# /// script
# dependencies = ["requests>=2.31"]
# ///
"""Create and poll an evaluation job on the vLLora gateway.

Usage:
  uv run scripts/run_evaluation.py --dataset-id ds_abc123 [--model gpt-4o-mini] [--output eval-v1.json]
  uv run scripts/run_evaluation.py --dataset-id ds_abc123 --create-only  # Just create, return ID

Creates an evaluation run, polls until complete, prints summary stats,
and optionally saves the full response to a file.

Use --create-only to create the eval job and print the ID without polling.
This lets the agent poll manually alongside other jobs (e.g., training).
"""

import argparse
import json
import sys
import time
from pathlib import Path

import requests

DEFAULT_BASE_URL = "http://localhost:9090"
DEFAULT_MODEL = "gpt-4o-mini"
POLL_INTERVAL = 3
MAX_POLL_ATTEMPTS = 600  # ~30 minutes (large datasets with 200+ records need 20-30 min)


def run_evaluation(
    dataset_id: str,
    model: str,
    base_url: str,
    output_path: Path | None = None,
    limit: int | None = None,
) -> dict:
    # Create evaluation
    payload: dict = {
        "dataset_id": dataset_id,
        "rollout_model_params": {"model": model},
    }
    if limit:
        payload["limit"] = limit

    resp = requests.post(
        f"{base_url}/finetune/evaluations",
        json=payload,
        headers={"Content-Type": "application/json"},
    )
    resp.raise_for_status()
    eval_data = resp.json()
    eval_id = eval_data.get("evaluation_run_id", eval_data.get("id"))
    print(f"Evaluation created: {eval_id}")

    # Poll until complete
    for attempt in range(MAX_POLL_ATTEMPTS):
        time.sleep(POLL_INTERVAL)
        resp = requests.get(f"{base_url}/finetune/evaluations/{eval_id}")
        resp.raise_for_status()
        result = resp.json()

        status = result.get("status", "unknown")
        completed = result.get("completed_rows", 0)
        total = result.get("total_rows", "?")
        print(f"  [{attempt + 1}] status={status}, progress={completed}/{total}")

        if status == "completed":
            summary = result.get("summary", {})
            avg = summary.get("average_score", "N/A")
            passed = summary.get("passed_count", "N/A")
            failed = summary.get("failed_count", "N/A")
            print(f"\nEvaluation complete!")
            print(f"  Average score: {avg}")
            print(f"  Passed: {passed}, Failed: {failed}")

            if output_path:
                output_path.write_text(json.dumps(result, indent=2))
                print(f"  Saved to: {output_path}")

            return result

        if status == "failed":
            print(f"\nEvaluation failed: {result.get('error', 'unknown error')}", file=sys.stderr)
            sys.exit(1)

    print(f"\nTimeout: evaluation still running after {MAX_POLL_ATTEMPTS * POLL_INTERVAL}s", file=sys.stderr)
    sys.exit(1)


def create_evaluation(
    dataset_id: str,
    model: str,
    base_url: str,
    limit: int | None = None,
) -> str:
    """Create an eval job and return its ID without polling."""
    payload: dict = {
        "dataset_id": dataset_id,
        "rollout_model_params": {"model": model},
    }
    if limit:
        payload["limit"] = limit

    resp = requests.post(
        f"{base_url}/finetune/evaluations",
        json=payload,
        headers={"Content-Type": "application/json"},
    )
    resp.raise_for_status()
    eval_data = resp.json()
    eval_id = eval_data.get("evaluation_run_id", eval_data.get("id"))
    print(f"Evaluation created: {eval_id}")
    return eval_id


def main() -> None:
    parser = argparse.ArgumentParser(description="Run evaluation on vLLora gateway")
    parser.add_argument("--dataset-id", required=True, help="Backend dataset ID")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Rollout model")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Gateway base URL")
    parser.add_argument("--output", help="Path to save full response JSON")
    parser.add_argument("--limit", type=int, help="Max rows to evaluate")
    parser.add_argument("--timeout", type=int, default=1800, help="Max seconds to wait (default: 1800)")
    parser.add_argument("--create-only", action="store_true", help="Create eval job and print ID without polling")
    args = parser.parse_args()

    output_path = Path(args.output) if args.output else None

    try:
        if args.create_only:
            eval_id = create_evaluation(args.dataset_id, args.model, args.base_url, args.limit)
            # Print just the ID for easy capture: EVAL_ID=$(uv run ... --create-only | tail -1)
            print(eval_id)
        else:
            run_evaluation(args.dataset_id, args.model, args.base_url, output_path, args.limit)
    except requests.HTTPError as e:
        print(f"Error: Request failed with status {e.response.status_code}", file=sys.stderr)
        print(f"  Response: {e.response.text}", file=sys.stderr)
        sys.exit(1)
    except requests.ConnectionError:
        print(f"Error: Cannot connect to {args.base_url}. Is the gateway running?", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
