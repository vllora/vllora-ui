# /// script
# requires-python = ">=3.10"
# ///
"""
Pipeline checkpointing — tracks which steps have completed so the agent
can resume from the last successful step after a crash.

Usage:
    # Mark a step as done
    python3 checkpoint.py done --step extract --project-dir finetune-project

    # Check if a step is done
    python3 checkpoint.py check --step extract --project-dir finetune-project
    # Exit 0 = done, Exit 1 = not done

    # Show all checkpoint state
    python3 checkpoint.py status --project-dir finetune-project

    # Reset a step (e.g., to re-run extraction)
    python3 checkpoint.py reset --step extract --project-dir finetune-project

    # Reset everything
    python3 checkpoint.py reset-all --project-dir finetune-project
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

CHECKPOINT_FILE = ".checkpoint.json"

PIPELINE_STEPS = [
    "create-workflow",
    "extract",
    "topics",
    "relations",
    "generate-data",
    "grader",
    "validate",
    "upload-records",
    "upload-grader",
    "eval",
    "training",
    "analyze",
]


def load_checkpoint(project_dir: Path) -> dict:
    """Load checkpoint state from disk."""
    cp_path = project_dir / CHECKPOINT_FILE
    if not cp_path.exists():
        return {"steps": {}, "workflow_id": None, "created_at": None}
    return json.loads(cp_path.read_text())


def save_checkpoint(project_dir: Path, state: dict) -> None:
    """Save checkpoint state to disk."""
    cp_path = project_dir / CHECKPOINT_FILE
    cp_path.write_text(json.dumps(state, indent=2))


def cmd_done(args: argparse.Namespace) -> None:
    """Mark a step as completed."""
    project_dir = Path(args.project_dir)
    state = load_checkpoint(project_dir)

    if state["created_at"] is None:
        state["created_at"] = datetime.now(timezone.utc).isoformat()

    if args.workflow_id:
        state["workflow_id"] = args.workflow_id

    state["steps"][args.step] = {
        "status": "completed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "note": args.note or "",
    }

    save_checkpoint(project_dir, state)
    print(f"Checkpoint: {args.step} → completed")


def cmd_check(args: argparse.Namespace) -> None:
    """Check if a step is done. Exit 0 = done, Exit 1 = not done."""
    project_dir = Path(args.project_dir)
    state = load_checkpoint(project_dir)
    step_state = state.get("steps", {}).get(args.step, {})

    if step_state.get("status") == "completed":
        print(f"{args.step}: completed at {step_state.get('completed_at', '?')}")
        sys.exit(0)
    else:
        print(f"{args.step}: not completed")
        sys.exit(1)


def cmd_status(args: argparse.Namespace) -> None:
    """Show full checkpoint status."""
    project_dir = Path(args.project_dir)
    state = load_checkpoint(project_dir)

    wf_id = state.get("workflow_id", "none")
    created = state.get("created_at", "none")
    print(f"Workflow: {wf_id}")
    print(f"Created:  {created}")
    print()

    steps = state.get("steps", {})
    for step in PIPELINE_STEPS:
        info = steps.get(step, {})
        status = info.get("status", "pending")
        completed = info.get("completed_at", "")
        note = info.get("note", "")
        marker = "✅" if status == "completed" else "⬜"
        line = f"  {marker} {step}"
        if completed:
            line += f" ({completed})"
        if note:
            line += f" — {note}"
        print(line)

    done_count = sum(1 for s in steps.values() if s.get("status") == "completed")
    print(f"\n{done_count}/{len(PIPELINE_STEPS)} steps completed")


def cmd_reset(args: argparse.Namespace) -> None:
    """Reset a single step."""
    project_dir = Path(args.project_dir)
    state = load_checkpoint(project_dir)
    if args.step in state.get("steps", {}):
        del state["steps"][args.step]
        save_checkpoint(project_dir, state)
        print(f"Reset: {args.step}")
    else:
        print(f"{args.step}: was not completed (nothing to reset)")


def cmd_reset_all(args: argparse.Namespace) -> None:
    """Reset all checkpoint state."""
    project_dir = Path(args.project_dir)
    cp_path = project_dir / CHECKPOINT_FILE
    if cp_path.exists():
        cp_path.unlink()
        print("All checkpoints cleared")
    else:
        print("No checkpoint file found")


def main() -> None:
    parser = argparse.ArgumentParser(description="Pipeline checkpointing")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("done", help="Mark a step as completed")
    p.add_argument("--step", required=True, choices=PIPELINE_STEPS, help="Step name")
    p.add_argument("--project-dir", required=True, help="Path to finetune-project/")
    p.add_argument("--workflow-id", help="Workflow ID (stored in checkpoint)")
    p.add_argument("--note", help="Optional note about the step result")

    p = sub.add_parser("check", help="Check if a step is done")
    p.add_argument("--step", required=True, choices=PIPELINE_STEPS, help="Step name")
    p.add_argument("--project-dir", required=True, help="Path to finetune-project/")

    p = sub.add_parser("status", help="Show all checkpoint state")
    p.add_argument("--project-dir", required=True, help="Path to finetune-project/")

    p = sub.add_parser("reset", help="Reset a single step")
    p.add_argument("--step", required=True, choices=PIPELINE_STEPS, help="Step name")
    p.add_argument("--project-dir", required=True, help="Path to finetune-project/")

    p = sub.add_parser("reset-all", help="Reset all checkpoints")
    p.add_argument("--project-dir", required=True, help="Path to finetune-project/")

    args = parser.parse_args()
    {
        "done": cmd_done,
        "check": cmd_check,
        "status": cmd_status,
        "reset": cmd_reset,
        "reset-all": cmd_reset_all,
    }[args.command](args)


if __name__ == "__main__":
    main()
