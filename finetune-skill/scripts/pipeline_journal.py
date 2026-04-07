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

    Deduplication: skips the log if the last entry has the same
    (step, action, status, summary) — prevents duplicate entries when
    a script is called multiple times (e.g., polling).
    """
    project_dir = Path(project_dir)
    journal_file = project_dir / "pipeline-journal.json"

    if not journal_file.exists():
        return  # No journal yet — agent hasn't created the workflow

    try:
        journal = json.loads(journal_file.read_text())
    except (json.JSONDecodeError, OSError):
        return

    # Deduplication: skip if the last entry is identical
    entries = journal.get("entries", [])
    if entries:
        last = entries[-1]
        if (last.get("step") == step and last.get("action") == action
                and last.get("status") == status and last.get("summary") == summary):
            return  # Duplicate — skip

    timestamp = datetime.now(timezone.utc).isoformat()
    next_id = max((e["id"] for e in entries), default=0) + 1

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

    # Ensure workflow_id is set — read from config.json if missing
    if not journal.get("workflow_id"):
        for config_candidate in [project_dir / "config.json", project_dir.parent / "config.json"]:
            if config_candidate.exists():
                try:
                    cfg = json.loads(config_candidate.read_text())
                    wf_id = cfg.get("workflow_id", "")
                    if wf_id:
                        journal["workflow_id"] = wf_id
                        break
                except (json.JSONDecodeError, OSError):
                    pass

    try:
        journal_file.write_text(json.dumps(journal, indent=2))
    except OSError:
        pass

    print(f"  [auto-journal #{next_id}] {action} ({status}): {summary}", file=sys.stderr)

    # Sync to gateway if workflow_id is available (best-effort, non-blocking)
    workflow_id = journal.get("workflow_id", "")
    if workflow_id:
        gateway_url = "http://localhost:9090"
        # Allow override from config.json
        for config_candidate in [project_dir / "config.json", project_dir.parent / "config.json"]:
            if config_candidate.exists():
                try:
                    cfg = json.loads(config_candidate.read_text())
                    gateway_url = cfg.get("gateway_url", gateway_url)
                    break
                except (json.JSONDecodeError, OSError):
                    pass

        try:
            import requests
            requests.put(
                f"{gateway_url}/finetune/workflows/{workflow_id}",
                json={"pipeline_journal": json.dumps(journal)},
                timeout=5,
            )
        except Exception:
            pass  # Non-fatal — local file is source of truth


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
