# /// script
# requires-python = ">=3.10"
# ///
"""
upload_trace_analysis.py — Upload trace analysis artifacts + trace bundle to gateway.

After trace_analyze.py produces the 4 artifacts, this script:
1. Uploads the OTel traces as a trace bundle (so they appear in UI Sources view)
2. Registers the trace bundle as a knowledge source (kind=otel-trace)
3. Uploads the 4 trace analysis artifacts to the trace-analysis endpoint

Usage:
    python3 upload_trace_analysis.py \\
        --workflow-id <ID> \\
        --traces source_traces_semconv.json \\
        --project-dir finetune-project/ \\
        [--gateway http://localhost:9090] \\
        [--max-upload-traces 500]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError


def _gateway_post(gateway: str, path: str, body: dict, timeout: int = 60) -> dict:
    """POST JSON to gateway, return parsed response."""
    data = json.dumps(body).encode()
    req = Request(
        f"{gateway}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        error_body = e.read().decode() if e.fp else str(e)
        raise RuntimeError(f"Gateway POST {path} failed ({e.code}): {error_body}") from e


def _gateway_put(gateway: str, path: str, body: dict) -> dict:
    """PUT JSON to gateway, return parsed response."""
    data = json.dumps(body).encode()
    req = Request(
        f"{gateway}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    try:
        with urlopen(req) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        error_body = e.read().decode() if e.fp else str(e)
        raise RuntimeError(f"Gateway PUT {path} failed ({e.code}): {error_body}") from e


def _gateway_multipart(gateway: str, path: str, fields: dict) -> dict:
    """POST multipart form to gateway (for knowledge source registration)."""
    import uuid
    boundary = uuid.uuid4().hex
    body_parts: list[bytes] = []
    for key, value in fields.items():
        body_parts.append(f"--{boundary}\r\n".encode())
        body_parts.append(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode())
        body_parts.append(f"{value}\r\n".encode())
    body_parts.append(f"--{boundary}--\r\n".encode())
    data = b"".join(body_parts)

    req = Request(
        f"{gateway}{path}",
        data=data,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urlopen(req) as resp:
            body = resp.read()
            try:
                return json.loads(body)
            except json.JSONDecodeError:
                # Some gateway responses aren't JSON (e.g., plain text ID)
                return {"id": body.decode().strip(), "raw": True}
    except HTTPError as e:
        error_body = e.read().decode() if e.fp else str(e)
        raise RuntimeError(f"Gateway multipart POST {path} failed ({e.code}): {error_body}") from e


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Upload trace analysis artifacts + trace bundle to gateway"
    )
    parser.add_argument("--workflow-id", required=True, help="Workflow ID")
    parser.add_argument("--traces", required=True, help="Path to source_traces_semconv.json")
    parser.add_argument("--project-dir", required=True, help="Path to finetune-project/")
    parser.add_argument("--gateway", default="http://localhost:9090", help="Gateway URL")
    parser.add_argument("--max-upload-traces", type=int, default=20,
                        help="Max traces to upload as bundle (default: 20, keeps UI loading fast). "
                             "Full trace analysis uses ALL traces; only the bundle for UI display is subsampled.")
    parser.add_argument("--name", default="OTel Traces", help="Name for the trace bundle")
    args = parser.parse_args()

    project_dir = Path(args.project_dir)
    gateway = args.gateway.rstrip("/")
    wf_path = f"/finetune/workflows/{args.workflow_id}"

    # Step 1: Upload trace bundle (subsampled for size)
    print("Step 1: Uploading trace bundle...")
    traces_path = Path(args.traces)
    if not traces_path.exists():
        print(f"Error: Traces file not found: {traces_path}", file=sys.stderr)
        sys.exit(1)

    with open(traces_path) as f:
        all_spans = json.load(f)

    # Subsample by trace_id to stay within limits
    by_trace: dict[str, list[dict]] = {}
    for span in all_spans:
        tid = span.get("trace_id", "__unknown__")
        by_trace.setdefault(tid, []).append(span)

    if len(by_trace) > args.max_upload_traces:
        # Diverse subsample: mix success + failure traces, pick shorter ones first
        # (shorter traces = less data, faster UI loading)
        trace_info = []
        for tid, spans_list in by_trace.items():
            reward = None
            for s in spans_list:
                r = (s.get("attributes") or {}).get("tau_bench.reward")
                if r is not None:
                    reward = float(r)
                    break
            trace_info.append((tid, len(spans_list), reward))
        # Sort by span count (smallest first) to minimize payload
        trace_info.sort(key=lambda x: x[1])
        # Take half successes, half failures (diverse sample)
        successes = [t for t in trace_info if t[2] == 1.0]
        failures = [t for t in trace_info if t[2] == 0.0]
        others = [t for t in trace_info if t[2] not in (0.0, 1.0, None)]
        half = args.max_upload_traces // 2
        selected_ids = set()
        for t in successes[:half]:
            selected_ids.add(t[0])
        for t in failures[:half]:
            selected_ids.add(t[0])
        for t in others:
            if len(selected_ids) >= args.max_upload_traces:
                break
            selected_ids.add(t[0])
        # Fill remaining from shortest traces
        for t in trace_info:
            if len(selected_ids) >= args.max_upload_traces:
                break
            selected_ids.add(t[0])
        subset_traces = {tid: by_trace[tid] for tid in selected_ids}
        upload_spans = [s for tspans in subset_traces.values() for s in tspans]
        print(f"  Subsampled {len(by_trace)} traces -> {len(subset_traces)} traces ({len(upload_spans)} spans)")
    else:
        upload_spans = all_spans
        print(f"  Uploading all {len(by_trace)} traces ({len(upload_spans)} spans)")

    try:
        bundle = _gateway_post(gateway, f"{wf_path}/trace-bundles", {
            "name": args.name,
            "semconv_spans": upload_spans,
        })
        bundle_id = bundle.get("id", "?")
        print(f"  Bundle: {bundle_id} ({bundle.get('span_count', '?')} spans)")
    except RuntimeError as e:
        print(f"  Warning: trace bundle upload failed: {e}", file=sys.stderr)
        bundle_id = None

    # Step 2: Register as knowledge source
    if bundle_id:
        print("Step 2: Registering as knowledge source...")
        try:
            ks = _gateway_multipart(gateway, f"{wf_path}/knowledge", {
                "name": args.name,
                "kind": "otel-trace",
                "trace_bundle_id": bundle_id,
            })
            ks_id = ks.get("id", "?")
            print(f"  Knowledge source: {ks_id}")
        except RuntimeError as e:
            print(f"  Warning: knowledge source registration failed: {e}", file=sys.stderr)

    # Step 3: Upload trace analysis artifacts
    print("Step 3: Uploading trace analysis artifacts...")
    artifacts: dict = {}

    for field, filename in [
        ("priority", "trace_priority.json"),
        ("topics", "trace_topics.json"),
        ("prompts", "trace_prompts.json"),
        ("graderHints", "trace_grader_hints.json"),
    ]:
        artifact_path = project_dir / filename
        if artifact_path.exists():
            artifacts[field] = json.loads(artifact_path.read_text())
            print(f"  Loaded {filename}")
        else:
            print(f"  Skipped {filename} (not found)")

    if artifacts:
        try:
            result = _gateway_put(gateway, f"{wf_path}/trace-analysis", artifacts)
            print(f"  Uploaded trace analysis ({len(artifacts)} artifacts)")
        except RuntimeError as e:
            print(f"  Warning: trace analysis upload failed: {e}", file=sys.stderr)
            print(f"  (This is OK if the gateway hasn't been updated with the trace_analyses table yet)")

    print("\nDone.")


if __name__ == "__main__":
    main()
