# /// script
# dependencies = ["requests>=2.31"]
# ///
"""Upload a training dataset to the vLLora gateway.

Usage:
  uv run scripts/upload_dataset.py --file training.jsonl --grader grader.js [--base-url http://localhost:9090]

Generates a UUID for dataset_id, uploads the JSONL file and grader script,
and prints the backend dataset ID on success.
"""

import argparse
import json
import sys
import uuid
from pathlib import Path

import requests

DEFAULT_BASE_URL = "http://localhost:9090"
DEFAULT_EVAL_MODEL = "gpt-4o-mini"


def upload_dataset(
    file_path: Path,
    grader_path: Path | None,
    base_url: str,
    eval_model: str,
    topic_hierarchy_path: Path | None = None,
) -> dict:
    dataset_id = str(uuid.uuid4())

    files = {
        "file": (file_path.name, file_path.open("rb"), "application/x-ndjson"),
    }
    data = {"dataset_id": dataset_id}

    if grader_path and grader_path.exists():
        grader_content = grader_path.read_text()
        files["eval_script"] = (grader_path.name, grader_content, "text/javascript")
        data["evaluator"] = json.dumps({
            "type": "js",
            "config": {
                "script": "",
                "completion_params": {
                    "model": eval_model,
                    "temperature": 0.0,
                    "max_tokens": 300,
                },
            },
        })

    if topic_hierarchy_path and topic_hierarchy_path.exists():
        data["topic_hierarchy"] = topic_hierarchy_path.read_text()

    resp = requests.post(f"{base_url}/finetune/datasets", files=files, data=data)
    resp.raise_for_status()
    result = resp.json()

    print(f"Dataset uploaded successfully.")
    print(f"  Local UUID:      {dataset_id}")
    print(f"  Backend ID:      {result.get('dataset_id', 'unknown')}")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload dataset to vLLora gateway")
    parser.add_argument("--file", required=True, help="Path to training JSONL file")
    parser.add_argument("--grader", help="Path to grader JS file")
    parser.add_argument("--topics", help="Path to topic hierarchy JSON file")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Gateway base URL")
    parser.add_argument("--eval-model", default=DEFAULT_EVAL_MODEL, help="Model for LLM-as-judge")
    args = parser.parse_args()

    file_path = Path(args.file)
    if not file_path.exists():
        print(f"Error: File not found: {file_path}", file=sys.stderr)
        sys.exit(1)

    grader_path = Path(args.grader) if args.grader else None
    topics_path = Path(args.topics) if args.topics else None

    try:
        upload_dataset(file_path, grader_path, args.base_url, args.eval_model, topics_path)
    except requests.HTTPError as e:
        print(f"Error: Upload failed with status {e.response.status_code}", file=sys.stderr)
        print(f"  Response: {e.response.text}", file=sys.stderr)
        sys.exit(1)
    except requests.ConnectionError:
        print(f"Error: Cannot connect to {args.base_url}. Is the gateway running?", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
