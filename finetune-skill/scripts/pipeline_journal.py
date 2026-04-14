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
    observation: str | dict | None = None,
    analysis: str | dict | None = None,
    decision: str | dict | None = None,
    evidence: dict | None = None,
) -> None:
    """Append a milestone entry to pipeline-journal.json.

    Lightweight alternative to finetune.py's _auto_journal — used by
    standalone scripts (build_knowledge_parts, generate_records, etc.)
    to log progress without subprocess calls.

    Smart deduplication + retry tracking:
    - If the last entry is byte-identical → skip (polling duplicates).
    - If a previous entry with the same (step, action) + status="completed"
      exists → mark this as a RETRY and include attempt number in summary.
    - If a previous entry with same (step, action) is "in_progress" →
      close it (update status to "completed" via a new closing entry rather
      than mutating history — append-only journal is user-friendly).
    """
    project_dir = Path(project_dir)
    journal_file = project_dir / "pipeline-journal.json"

    if not journal_file.exists():
        return  # No journal yet — agent hasn't created the workflow

    try:
        journal = json.loads(journal_file.read_text())
    except (json.JSONDecodeError, OSError):
        return

    entries = journal.get("entries", [])

    # Deduplication: skip if the last entry is byte-identical
    if entries:
        last = entries[-1]
        if (last.get("step") == step and last.get("action") == action
                and last.get("status") == status and last.get("summary") == summary):
            return  # exact duplicate — e.g., a polling loop re-logged

    # Retry detection: count previous COMPLETED entries for this (step, action).
    # If any exist and we're logging a new "completed" or "fail" status, this
    # is a retry. Annotate the summary so the user can see the loop convergence.
    prior_completed = [
        e for e in entries
        if e.get("step") == step and e.get("action") == action
        and e.get("status") in ("completed", "fail")
    ]
    is_retry = len(prior_completed) > 0 and status in ("completed", "fail")
    if is_retry:
        attempt = len(prior_completed) + 1
        summary = f"[retry {attempt}] {summary}"
        if details is None:
            details = {}
        details = {**details, "retry_attempt": attempt}

    # In-progress resolver: if there's an open "in_progress" entry for this
    # same (step, action) and we're now logging a terminal status, that old
    # entry is now stale. Mark it resolved by updating it in-place with a
    # `resolved_by_id` pointer to the new entry. (We do NOT mutate the original
    # summary — we only add a pointer so the history stays readable.)
    timestamp = datetime.now(timezone.utc).isoformat()
    next_id = max((e["id"] for e in entries), default=0) + 1

    if status in ("completed", "fail"):
        for e in entries:
            if (e.get("step") == step and e.get("action") == action
                    and e.get("status") == "in_progress"
                    and "resolved_by_id" not in e):
                e["resolved_by_id"] = next_id

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
    if observation:
        entry["observation"] = observation
    if analysis:
        entry["analysis"] = analysis
    if decision:
        entry["decision"] = decision
    if evidence:
        entry["evidence"] = evidence

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
