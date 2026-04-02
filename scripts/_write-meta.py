#!/usr/bin/env python3
"""
Safely write/update meta.json for finetune runs.

Usage:
  # Create initial meta:
  _write-meta.py <meta.json> --create \
    --run-id RUN_ID --project-dir DIR --gateway-url URL \
    --max-turns N --pdf-count N

  # Finalize after run:
  _write-meta.py <meta.json> --finalize \
    --session-id ID --exit-code N --turns N --tool-calls N \
    --errors N --subagent-count N
"""

import argparse
import json
import sys
from datetime import datetime, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def create(args: argparse.Namespace) -> None:
    meta = {
        "run_id": args.run_id,
        "project_dir": args.project_dir,
        "gateway_url": args.gateway_url,
        "max_turns": args.max_turns,
        "pdf_count": args.pdf_count,
        "started_at": now_iso(),
    }
    with open(args.meta_file, "w") as f:
        json.dump(meta, f, indent=2)


def finalize(args: argparse.Namespace) -> None:
    try:
        with open(args.meta_file) as f:
            meta = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        meta = {}

    meta["finished_at"] = now_iso()
    meta["session_id"] = args.session_id or ""
    meta["exit_code"] = args.exit_code
    meta["turns"] = args.turns
    meta["tool_calls"] = args.tool_calls
    meta["errors"] = args.errors
    meta["subagent_count"] = args.subagent_count

    with open(args.meta_file, "w") as f:
        json.dump(meta, f, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(description="Write/update finetune run meta.json")
    parser.add_argument("meta_file", help="Path to meta.json")

    sub = parser.add_subparsers(dest="command", required=True)

    # create
    c = sub.add_parser("create")
    c.add_argument("--run-id", required=True)
    c.add_argument("--project-dir", required=True)
    c.add_argument("--gateway-url", required=True)
    c.add_argument("--max-turns", type=int, required=True)
    c.add_argument("--pdf-count", type=int, required=True)

    # finalize
    f = sub.add_parser("finalize")
    f.add_argument("--session-id", default="")
    f.add_argument("--exit-code", type=int, required=True)
    f.add_argument("--turns", type=int, required=True)
    f.add_argument("--tool-calls", type=int, required=True)
    f.add_argument("--errors", type=int, default=0)
    f.add_argument("--subagent-count", type=int, default=0)

    args = parser.parse_args()

    if args.command == "create":
        create(args)
    elif args.command == "finalize":
        finalize(args)


if __name__ == "__main__":
    main()
