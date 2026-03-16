# /// script
# dependencies = ["requests>=2.31"]
# ///
"""Dry-run a grader script against a single row on the vLLora gateway.

Usage:
  uv run scripts/dry_run_grader.py --workflow-id <id> --script grader.js --row '{"messages": [...]}'
  uv run scripts/dry_run_grader.py --workflow-id <id> --script grader.js --row-file sample-row.json

Sends the grader JS source and a single row to the dry-run endpoint,
prints score/reason/logs, and exits 0 on success or 1 on failure.
"""

import argparse
import json
import sys
from pathlib import Path

import requests

DEFAULT_BASE_URL = "http://localhost:9090"


def dry_run_grader(
    workflow_id: str,
    script_path: Path,
    row: dict,
    base_url: str,
) -> dict:
    script_content = script_path.read_text()

    resp = requests.post(
        f"{base_url}/finetune/workflows/{workflow_id}/evaluator/dry-run",
        json={"script": script_content, "row": row},
        headers={"Content-Type": "application/json"},
    )
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    parser = argparse.ArgumentParser(description="Dry-run a grader script on a single row")
    parser.add_argument("--workflow-id", required=True, help="Workflow UUID")
    parser.add_argument("--script", required=True, help="Path to grader JS file")
    parser.add_argument("--row", help="Inline JSON string with the row to test")
    parser.add_argument("--row-file", help="Path to JSON file with the row")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Gateway base URL")
    args = parser.parse_args()

    if not args.row and not args.row_file:
        parser.error("one of --row or --row-file is required")
    if args.row and args.row_file:
        parser.error("use --row or --row-file, not both")

    script_path = Path(args.script)
    if not script_path.is_file():
        print(f"Error: script file not found: {script_path}", file=sys.stderr)
        sys.exit(1)

    if args.row_file:
        row_path = Path(args.row_file)
        if not row_path.is_file():
            print(f"Error: row file not found: {row_path}", file=sys.stderr)
            sys.exit(1)
        row = json.loads(row_path.read_text())
    else:
        row = json.loads(args.row)

    try:
        result = dry_run_grader(args.workflow_id, script_path, row, args.base_url)
    except requests.HTTPError as e:
        print(f"Error: Request failed with status {e.response.status_code}", file=sys.stderr)
        print(f"  Response: {e.response.text}", file=sys.stderr)
        sys.exit(1)
    except requests.ConnectionError:
        print(f"Error: Cannot connect to {args.base_url}. Is the gateway running?", file=sys.stderr)
        sys.exit(1)

    score = result.get("score", "N/A")
    reason = result.get("reason", "")
    is_success = result.get("is_success", False)
    logs = result.get("logs", [])

    print(f"Score:      {score}")
    print(f"Success:    {is_success}")
    print(f"Reason:     {reason}")

    if logs:
        print(f"\nLogs:")
        for log in logs:
            print(f"  {log}")

    if not is_success:
        sys.exit(1)


if __name__ == "__main__":
    main()
