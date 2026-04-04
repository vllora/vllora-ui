# /// script
# dependencies = ["requests>=2.31"]
# ///
"""Dry-run a grader script against a single row on the vLLora gateway.

Usage:
  uv run scripts/dry_run_grader.py --workflow-id <id> --script grader.js --row '{"messages": [...]}'
  uv run scripts/dry_run_grader.py --workflow-id <id> --script grader.js --row-file sample-row.json
  uv run scripts/dry_run_grader.py --workflow-id <id> --script grader.js --live

The --live flag picks a random record from the workflow, generates a real
LLM response, and grades it. This catches graders that pass on hand-crafted
inputs but score 0.0 on real model outputs (e.g., format mismatches).

Sends the grader JS source and a single row to the dry-run endpoint,
prints score/reason/logs, and exits 0 on success or 1 on failure.
"""

import argparse
import json
import random
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


def fetch_random_record(workflow_id: str, base_url: str) -> dict:
    """Fetch a random record from the workflow."""
    resp = requests.get(f"{base_url}/finetune/workflows/{workflow_id}/records")
    resp.raise_for_status()
    data = resp.json()
    records = data.get("records", data) if isinstance(data, dict) else data
    if not records:
        print("Error: No records found in workflow", file=sys.stderr)
        sys.exit(1)
    return random.choice(records)


def generate_llm_response(messages: list, model: str, base_url: str) -> str:
    """Call the gateway's chat completion endpoint to generate a response."""
    resp = requests.post(
        f"{base_url}/v1/chat/completions",
        json={"model": model, "messages": messages, "temperature": 0.7},
        headers={"Content-Type": "application/json"},
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def build_live_row(record: dict, model: str, base_url: str) -> dict:
    """Build a grader row from a real record + live LLM response.

    Takes a training record, extracts the prompt messages (system + user),
    generates a real LLM response, and returns the complete row for grading.
    """
    data = record.get("data", record)
    # Gateway may return data as a JSON string — parse it
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except (json.JSONDecodeError, TypeError):
            data = record
    messages = data.get("messages", data.get("input", {}).get("messages", []))
    ground_truth = data.get("ground_truth", "")

    if not messages:
        print("Error: Record has no messages", file=sys.stderr)
        sys.exit(1)

    # Keep only system + user messages as the prompt (drop any assistant message)
    prompt_messages = [m for m in messages if m.get("role") != "assistant"]

    if not prompt_messages:
        print("Error: Could not extract prompt from record", file=sys.stderr)
        sys.exit(1)

    print(f"  Generating response with {model}...")
    user_msg = next((m["content"] for m in reversed(prompt_messages) if m["role"] == "user"), "")
    print(f"  Prompt: {user_msg[:120]}...")

    response_content = generate_llm_response(prompt_messages, model, base_url)
    print(f"  Response: {response_content[:120]}...")

    # Build the row exactly as the eval runner would
    return {
        "messages": prompt_messages + [{"role": "assistant", "content": response_content}],
        "ground_truth": ground_truth,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Dry-run a grader script on a single row")
    parser.add_argument("--workflow-id", required=True, help="Workflow UUID")
    parser.add_argument("--script", required=True, help="Path to grader JS file")
    parser.add_argument("--row", help="Inline JSON string with the row to test")
    parser.add_argument("--row-file", help="Path to JSON file with the row")
    parser.add_argument("--live", action="store_true",
        help="Pick a random record, generate a real LLM response, and grade it")
    parser.add_argument("--live-samples", type=int, default=3,
        help="Number of records to test in --live mode (default: 3)")
    parser.add_argument("--model", default="gpt-4o-mini",
        help="Model to use for --live response generation (default: gpt-4o-mini)")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Gateway base URL")
    args = parser.parse_args()

    sources = [args.row, args.row_file, args.live]
    if not any(sources):
        parser.error("one of --row, --row-file, or --live is required")
    if sum(bool(x) for x in sources) > 1:
        parser.error("use exactly one of --row, --row-file, or --live")

    script_path = Path(args.script)
    if not script_path.is_file():
        print(f"Error: script file not found: {script_path}", file=sys.stderr)
        sys.exit(1)

    if args.live:
        _run_live_mode(args, script_path)
        return

    if args.row_file:
        row_path = Path(args.row_file)
        if not row_path.is_file():
            print(f"Error: row file not found: {row_path}", file=sys.stderr)
            sys.exit(1)
        row = json.loads(row_path.read_text())
    else:
        row = json.loads(args.row)

    _run_single(args.workflow_id, script_path, row, args.base_url)


def _run_single(workflow_id: str, script_path: Path, row: dict, base_url: str) -> None:
    """Run grader dry-run on a single row and print results."""
    try:
        result = dry_run_grader(workflow_id, script_path, row, base_url)
    except requests.HTTPError as e:
        print(f"Error: Request failed with status {e.response.status_code}", file=sys.stderr)
        print(f"  Response: {e.response.text}", file=sys.stderr)
        sys.exit(1)
    except requests.ConnectionError:
        print(f"Error: Cannot connect to {base_url}. Is the gateway running?", file=sys.stderr)
        sys.exit(1)

    score = result.get("score", "N/A")
    reason = result.get("reason", "")
    is_success = result.get("is_success", False)
    logs = result.get("logs", [])

    print(f"Score:      {score}")
    print(f"Success:    {is_success}")
    print(f"Reason:     {reason}")

    if logs:
        print("\nLogs:")
        for log in logs:
            print(f"  {log}")

    if not is_success:
        sys.exit(1)


def _run_live_mode(args: argparse.Namespace, script_path: Path) -> None:
    """Run grader against real LLM responses from random workflow records.

    Tests multiple samples and reports aggregate results. Exits 1 if
    all samples score 0.0 (strong signal that the grader is broken).
    """
    num_samples = args.live_samples
    print(f"=== Live dry-run: {num_samples} sample(s) with {args.model} ===\n")

    scores = []
    for i in range(num_samples):
        print(f"--- Sample {i + 1}/{num_samples} ---")
        record = fetch_random_record(args.workflow_id, args.base_url)
        row = build_live_row(record, args.model, args.base_url)

        try:
            result = dry_run_grader(args.workflow_id, script_path, row, args.base_url)
        except requests.HTTPError as e:
            print(f"  Error: {e.response.status_code} — {e.response.text[:200]}", file=sys.stderr)
            scores.append(0.0)
            continue
        except requests.ConnectionError:
            print(f"  Error: Cannot connect to {args.base_url}", file=sys.stderr)
            sys.exit(1)

        score = result.get("score", 0.0)
        reason = result.get("reason", "")
        scores.append(score if isinstance(score, (int, float)) else 0.0)
        print(f"  Score: {score}  Reason: {reason[:150]}")
        print()

    # Summary
    avg = sum(scores) / len(scores) if scores else 0
    print(f"=== Summary: {len(scores)} samples, avg score = {avg:.3f} ===")
    for i, s in enumerate(scores):
        print(f"  Sample {i + 1}: {s}")

    if avg < 0.01:
        print(
            "\n⚠ ALL LIVE SAMPLES SCORED ~0. The grader is almost certainly broken "
            "against real model outputs. The model likely responds in a format "
            "the grader doesn't expect. Fix the grader before proceeding.",
            file=sys.stderr,
        )
        sys.exit(1)

    if avg < 0.1:
        print(
            f"\n⚠ Low average score ({avg:.3f}). The grader may have format "
            "assumptions that don't match real model outputs. Consider fixing.",
            file=sys.stderr,
        )
        sys.exit(1)

    print("\n✓ Live dry-run passed.")


if __name__ == "__main__":
    main()
