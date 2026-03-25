#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""
Print a metrics table (per-epoch reward averages) from a vLLora gateway metrics payload.

You can either:

1) Pipe JSON on stdin:
   curl -s "http://localhost:9090/finetune/.../metrics" | python3 scripts/print_metrics_table.py

2) Fetch by IDs (no curl):
   python3 scripts/print_metrics_table.py --workflow-id <WF_ID> --job-id <JOB_ID>

It expects the response JSON shape:
  { "metrics": [ { "metrics": { "epoch": <int>, "reward": <float>, ... } }, ... ] }
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from typing import Any

from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def _to_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip())
    except (ValueError, TypeError):
        return None


def _to_float(value: Any) -> float | None:
    # Alias for readability at call sites (epoch is fractional in gateway metrics).
    return _to_number(value)


def _to_int(value: Any) -> int | None:
    if value is None:
        return None
    # Epoch is often a float (fractional progress), so we intentionally truncate.
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    try:
        # Reward metrics often come back as strings.
        return int(str(value).strip())
    except (ValueError, TypeError):
        return None


def fetch_metrics_json(base_url: str, workflow_id: str, job_id: str) -> dict[str, Any]:
    url = f"{base_url}/finetune/workflows/{workflow_id}/jobs/{job_id}/metrics"
    req = Request(url, method="GET", headers={"Accept": "application/json"})
    try:
        with urlopen(req, timeout=30) as resp:
            payload = resp.read().decode("utf-8", errors="replace")
    except HTTPError as e:
        raise RuntimeError(f"HTTP error {e.code} fetching {url}: {e.read().decode('utf-8', errors='replace')[:500]}")
    except URLError as e:
        raise RuntimeError(f"Connection error fetching {url}: {e}")
    try:
        d = json.loads(payload)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Invalid JSON from {url}: {e}") from e
    if not isinstance(d, dict):
        raise RuntimeError(f"Unexpected JSON type from {url}: {type(d)}")
    return d


def main() -> int:
    parser = argparse.ArgumentParser(description="Print finetune metrics as per-epoch or per-step table.")
    parser.add_argument(
        "--base-url",
        default="http://localhost:9090",
        help="Gateway base URL (default: http://localhost:9090).",
    )
    parser.add_argument(
        "--workflow-id",
        default=None,
        help="Finetune workflow id. If provided, the script fetches metrics from the gateway.",
    )
    parser.add_argument(
        "--job-id",
        default=None,
        help="Finetune job id. Used with --workflow-id to fetch metrics.",
    )
    parser.add_argument(
        "--min-reward",
        type=float,
        default=0.0,
        help="Only include rewards strictly greater than this threshold (default: 0.0).",
    )
    parser.add_argument(
        "--mode",
        choices=["epoch", "step"],
        default="epoch",
        help="Display mode: epoch (aggregate) or step (raw rows). Default: epoch.",
    )
    args = parser.parse_args()

    d: dict[str, Any] | None = None
    if args.workflow_id and args.job_id:
        try:
            d = fetch_metrics_json(args.base_url, args.workflow_id, args.job_id)
        except RuntimeError as e:
            print(str(e), file=sys.stderr)
            return 2
    elif args.workflow_id or args.job_id:
        print("Both --workflow-id and --job-id are required together (or provide stdin JSON).", file=sys.stderr)
        return 2
    else:
        raw = sys.stdin.read()
        if not raw.strip():
            print("No stdin received (expected JSON payload).", file=sys.stderr)
            return 2

        try:
            d = json.loads(raw)
        except json.JSONDecodeError as e:
            print(f"Invalid JSON on stdin: {e}", file=sys.stderr)
            return 2

    assert d is not None

    metrics_entries = d.get("metrics", [])
    if not isinstance(metrics_entries, list):
        print("Unexpected payload: `metrics` is not a list.", file=sys.stderr)
        return 2

    # Extract the inner `metrics` object, matching your original one-liner logic.
    metrics: list[dict[str, Any]] = []
    for entry in metrics_entries:
        if not isinstance(entry, dict):
            continue
        inner = entry.get("metrics")
        if not isinstance(inner, dict):
            continue
        reward = _to_number(inner.get("reward"))
        if reward is None:
            continue
        if reward > args.min_reward:
            metrics.append(inner)

    if not metrics:
        print(f"No metrics with reward > {args.min_reward} found.")
        return 0

    # Print a simple fixed-width table (no extra deps).
    def print_table(headers: list[str], rows: list[list[str]]) -> None:
        widths = [len(h) for h in headers]
        for row in rows:
            for i, cell in enumerate(row):
                widths[i] = max(widths[i], len(cell))
        widths = [max(5, w) for w in widths]

        def fmt_row(cols: list[str]) -> str:
            padded = [c.ljust(w) for c, w in zip(cols, widths)]
            return " | ".join(padded)

        print(fmt_row(headers))
        print("-+-".join("-" * w for w in widths))
        for row in rows:
            print(fmt_row(row))

    if args.mode == "step":
        step_rows: list[list[str]] = []
        overall_rewards: list[float] = []
        for idx, m in enumerate(metrics, start=1):
            reward = _to_number(m.get("reward"))
            if reward is None:
                continue
            epoch = _to_float(m.get("epoch"))
            epoch_cell = f"{epoch:.4f}" if epoch is not None else "NA"
            overall_rewards.append(reward)
            step_rows.append([
                epoch_cell,
                str(_to_int(m.get("global_step")) or idx),
                f"{reward:.3f}",
                f"{(_to_number(m.get('loss')) or 0.0):.3f}",
                f"{(_to_number(m.get('kl')) or 0.0):.3f}",
                f"{(_to_number(m.get('grad_norm')) or 0.0):.3f}",
                f"{(_to_number(m.get('learning_rate')) or 0.0):.8f}",
            ])

        if not step_rows:
            print("No valid per-step rows found after filtering.")
            return 0

        print("Per-step metrics (filtered)")
        print_table(
            ["Epoch", "Step", "Reward", "Loss", "KL", "Grad", "Learning_Rate"],
            step_rows,
        )
        print(
            f"Overall avg reward: {sum(overall_rewards)/len(overall_rewards):.3f} | "
            f"Peak reward: {max(overall_rewards):.3f} | Total: {len(overall_rewards)}"
        )
        return 0

    # Default: epoch mode
    epoch_rewards: dict[int, list[float]] = defaultdict(list)
    epoch_peak: dict[int, float] = {}
    overall_rewards: list[float] = []
    for m in metrics:
        epoch = _to_int(m.get("epoch"))
        reward = _to_number(m.get("reward"))
        if epoch is None or reward is None:
            continue
        epoch_rewards[epoch].append(reward)
        epoch_peak[epoch] = max(epoch_peak.get(epoch, float("-inf")), reward)
        overall_rewards.append(reward)

    if not overall_rewards:
        print("Metrics had rewards but none had valid numeric `epoch` values.")
        return 0

    rows: list[list[str]] = []
    for ep in sorted(epoch_rewards.keys()):
        rs = epoch_rewards[ep]
        avg = sum(rs) / len(rs)
        peak = epoch_peak.get(ep, max(rs))
        rows.append([str(ep), f"{avg:.3f}", f"{peak:.3f}", str(len(rs))])

    print("Per-epoch reward summary (filtered)")
    print_table(["Epoch", "AvgReward", "PeakReward", "N"], rows)
    print(f"Overall avg: {sum(overall_rewards)/len(overall_rewards):.3f} | Peak: {max(overall_rewards):.3f} | Total: {len(overall_rewards)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

