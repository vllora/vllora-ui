"""Lightweight journal helper for pipeline scripts.

Scripts import this to auto-log milestones to pipeline-journal.json
without depending on finetune.py. Entries are appended locally and
synced to the gateway if workflow_id is available.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path


def log_milestone(
    project_dir: str | Path,
    step: str,
    action: str,
    status: str,
    summary: str,
    details: dict | None = None,
) -> None:
    """Append a milestone entry to pipeline-journal.json.

    Lightweight alternative to finetune.py's _auto_journal — used by
    standalone scripts (build_knowledge_parts, generate_records, etc.)
    to log progress without subprocess calls.
    """
    project_dir = Path(project_dir)
    journal_file = project_dir / "pipeline-journal.json"

    if not journal_file.exists():
        return  # No journal yet — agent hasn't created the workflow

    try:
        journal = json.loads(journal_file.read_text())
    except (json.JSONDecodeError, OSError):
        return

    timestamp = datetime.now(timezone.utc).isoformat()
    next_id = max((e["id"] for e in journal.get("entries", [])), default=0) + 1

    entry: dict = {
        "id": next_id,
        "timestamp": timestamp,
        "step": step,
        "action": action,
        "status": status,
        "summary": summary,
        "auto_logged": True,
    }
    if details:
        entry["details"] = details

    journal.setdefault("entries", []).append(entry)

    try:
        journal_file.write_text(json.dumps(journal, indent=2))
    except OSError:
        pass

    print(f"  [auto-journal #{next_id}] {action} ({status}): {summary}", file=sys.stderr)


def find_project_dir(file_path: str | Path) -> Path | None:
    """Walk up from a file path to find the finetune-project directory.

    Looks for pipeline-journal.json or config.json as markers.
    """
    path = Path(file_path).resolve()
    for parent in [path.parent, path.parent.parent, path.parent.parent.parent]:
        if (parent / "pipeline-journal.json").exists():
            return parent
        if (parent / "config.json").exists():
            return parent
    return None
