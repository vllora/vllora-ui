# /// script
# dependencies = ["requests>=2.31"]
# ///
"""Fetch and analyze training metrics from a finetune job.

Usage:
  uv run scripts/analyze_training.py --workflow-id WF_ID --job-id JOB_ID [--output-dir training-jobs]
  uv run scripts/analyze_training.py --metrics-file training-jobs/job-v1-metrics.json  # Analyze saved file

Fetches real-time metrics from the gateway API (or reads a saved file),
computes derived diagnostics (reward trend, KL health, clipping ratio,
loss stability, grad norm spikes, signal strength), and prints a
structured summary with severity-tagged alerts.

Also fetches per-epoch evaluations when --workflow-id is provided,
showing per-record learning trajectories and per-topic breakdowns.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import requests

DEFAULT_BASE_URL = "http://localhost:9090"


# ---------------------------------------------------------------------------
# Metrics analysis
# ---------------------------------------------------------------------------

def fetch_metrics(base_url: str, workflow_id: str, job_id: str) -> dict:
    """Fetch metrics timeseries from the gateway API."""
    url = f"{base_url}/finetune/workflows/{workflow_id}/jobs/{job_id}/metrics"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_job_status(base_url: str, workflow_id: str, job_id: str) -> dict:
    """Fetch job status from the gateway API."""
    url = f"{base_url}/finetune/workflows/{workflow_id}/jobs/{job_id}/status"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.json()


def fetch_epoch_evals(base_url: str, workflow_id: str, job_id: str) -> dict:
    """Fetch per-epoch per-record evaluations from the gateway API."""
    url = f"{base_url}/finetune/workflows/{workflow_id}/finetune-evaluations"
    resp = requests.get(url, params={"finetune_job_id": job_id}, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _parse_metrics_list(data) -> list[dict]:
    """Handle both API formats: {"metrics": [...]} or bare list."""
    if isinstance(data, list):
        return data
    return data.get("metrics", [])


def analyze_metrics(data) -> dict:
    """Analyze metrics timeseries and return structured diagnostics."""
    metrics_list = _parse_metrics_list(data)
    if not metrics_list:
        return {"error": "No metrics data available"}

    steps = [m["metrics"] if "metrics" in m else m for m in metrics_list]
    first = steps[0]
    last = steps[-1]

    alerts: list[dict] = []

    # Reward trend
    # Ref: training-metrics-guide.md §Reward; DeepSeekMath §3.2 — "steady upward trend"
    r_start = first.get("reward", 0)
    r_end = last.get("reward", 0)
    r_delta = r_end - r_start
    if r_delta > 0.05:
        reward_trend = "improving"
    elif r_delta < -0.05:
        reward_trend = "declining"
    else:
        reward_trend = "flat"

    if reward_trend == "declining":
        alerts.append({
            "severity": "HIGH",
            "metric": "reward",
            "message": f"Reward declined {r_start:.3f} → {r_end:.3f} (delta={r_delta:+.3f})",
        })

    # KL divergence — GRPO-aware: KL alone is NOT diagnostic with beta=0
    # Ref: training-metrics-guide.md §KL; DAPO/TRL default beta=0 (no KL penalty)
    # High KL + improving reward = NORMAL for GRPO. Only alert if KL is high AND reward isn't improving.
    kl_values = [s.get("kl", 0) for s in steps]
    kl_max = max(kl_values)
    kl_final = last.get("kl", 0)
    if kl_max > 100.0 and reward_trend != "improving":
        alerts.append({
            "severity": "CRITICAL",
            "metric": "kl",
            "message": f"KL divergence peaked at {kl_max:.2f} with {reward_trend} reward — catastrophic drift without improvement",
        })
    elif kl_max > 10.0 and reward_trend != "improving":
        alerts.append({
            "severity": "WARNING",
            "metric": "kl",
            "message": f"KL divergence peaked at {kl_max:.2f} with {reward_trend} reward — monitor output quality",
        })
    elif kl_max > 100.0:
        # KL very high but reward is improving — informational only
        alerts.append({
            "severity": "INFO",
            "metric": "kl",
            "message": f"KL divergence {kl_max:.2f} (high but reward is improving — expected with beta=0)",
        })

    # Clipping ratio (completions truncated at max_output_tokens)
    # Thresholds: healthy <0.1, warn >0.1, critical >0.5
    # Ref: training-metrics-guide.md §Completions; DAPO overlong filtering; TRL docs
    clip_values = [s.get("completions/clipped_ratio", 0) for s in steps]
    clip_max = max(clip_values)
    clip_avg = sum(clip_values) / len(clip_values) if clip_values else 0
    if clip_max > 0.50:
        alerts.append({
            "severity": "CRITICAL",
            "metric": "clipping",
            "message": f"Clipping ratio {clip_max:.0%} — majority of completions truncated, increase max_output_tokens",
        })
    elif len(clip_values) >= 3:
        # Check for increasing trend — model getting longer each step
        first_third = clip_values[:len(clip_values) // 3]
        last_third = clip_values[-(len(clip_values) // 3):]
        if first_third and last_third:
            first_avg = sum(first_third) / len(first_third)
            last_avg = sum(last_third) / len(last_third)
            if last_avg > first_avg + 0.15 and last_avg > 0.2:
                alerts.append({
                    "severity": "WARNING",
                    "metric": "clipping",
                    "message": f"Clipping ratio rising ({first_avg:.0%} → {last_avg:.0%}) — model generating longer responses, may need higher max_output_tokens",
                })

    # Loss stability
    # Ref: training-metrics-guide.md §Loss; DeepSeekMath — GRPO loss starts near 0, rises slightly
    # Stuck at 0 = zero advantages; NaN = catastrophic failure (Unsloth docs)
    loss_values = [s.get("loss", 0) for s in steps]
    has_nan = any(math.isnan(v) or math.isinf(v) for v in loss_values if isinstance(v, (int, float)))
    if has_nan:
        alerts.append({
            "severity": "CRITICAL",
            "metric": "loss",
            "message": "NaN/Inf detected in loss — training numerically unstable",
        })
    elif len(loss_values) > 3 and all(v == 0.0 for v in loss_values):
        # Ref: arXiv:2503.06639 — GRPO loss = 0 when all advantages are zero
        alerts.append({
            "severity": "CRITICAL",
            "metric": "loss",
            "message": "Loss stuck at exactly 0.0 — zero advantages, model learning nothing. Check grader signal (reward_std, frac_reward_zero_std)",
        })

    # Grad norm spikes
    # Ref: training-metrics-guide.md §Grad Norm; healthy 0.5-2.0 with default max_grad_norm=1.0
    # NaN = catastrophic (Unsloth: often from zero-length truncated completions)
    grad_values = [s.get("grad_norm", 0) for s in steps]
    grad_finite = [v for v in grad_values if isinstance(v, (int, float)) and math.isfinite(v)]
    grad_median = sorted(grad_finite)[len(grad_finite) // 2] if grad_finite else 0
    grad_max = max(grad_finite) if grad_finite else 0
    has_nan_grad = any(not math.isfinite(v) for v in grad_values if isinstance(v, (int, float)))
    if has_nan_grad:
        alerts.append({
            "severity": "CRITICAL",
            "metric": "grad_norm",
            "message": "NaN/Inf grad_norm — numerical overflow, likely from zero-length completions or bad chat template",
        })
    elif grad_max > 1000:
        alerts.append({
            "severity": "CRITICAL",
            "metric": "grad_norm",
            "message": f"Grad norm {grad_max:.1f} (median={grad_median:.1f}) — catastrophic instability, halve learning rate",
        })
    elif grad_max > 100:
        alerts.append({
            "severity": "WARNING",
            "metric": "grad_norm",
            "message": f"Grad norm spike {grad_max:.1f} (median={grad_median:.1f}) — training instability, consider reducing LR",
        })

    # Weak training signal
    # Thresholds: healthy 0.05-0.3, warn <0.05, critical <0.01
    # Ref: training-metrics-guide.md §Reward Std; Dr. GRPO (arXiv:2503.20783)
    reward_std_values = [s.get("reward_std", 0) for s in steps]
    reward_std_final = last.get("reward_std", 0)
    if reward_std_final < 0.01 and len(steps) > 5:
        alerts.append({
            "severity": "CRITICAL",
            "metric": "reward_std",
            "message": f"Reward std near zero ({reward_std_final:.3f}) — all completions score identically, zero learning signal",
        })
    elif reward_std_final < 0.05 and len(steps) > 5:
        alerts.append({
            "severity": "WARNING",
            "metric": "reward_std",
            "message": f"Reward std low ({reward_std_final:.3f}) — limited diversity between completions (healthy: 0.05-0.3)",
        })

    # frac_reward_zero_std: healthy <0.2, warn >0.5, critical >0.8
    # Ref: training-metrics-guide.md §frac_reward_zero_std; Dr. GRPO (arXiv:2503.20783)
    zero_std_values = [s.get("frac_reward_zero_std", 0) for s in steps]
    zero_std_avg = sum(zero_std_values) / len(zero_std_values) if zero_std_values else 0
    if zero_std_avg > 0.80:
        alerts.append({
            "severity": "CRITICAL",
            "metric": "zero_std",
            "message": f"{zero_std_avg:.0%} avg zero-std fraction — training gets no useful gradient from most examples",
        })
    elif zero_std_avg > 0.50:
        alerts.append({
            "severity": "WARNING",
            "metric": "zero_std",
            "message": f"{zero_std_avg:.0%} avg zero-std fraction — over half the batch provides no learning signal",
        })

    # Reward hacking detection
    # Ref: training-metrics-guide.md §Reward Hacking; GRPO++ (Wolfe) — reward up + KL rising + reward_std dropping
    # Signature: model converges on a single high-scoring response pattern
    if len(steps) >= 6:
        mid = len(steps) // 2
        first_half_std = sum(s.get("reward_std", 0) for s in steps[:mid]) / mid
        last_half_std = sum(s.get("reward_std", 0) for s in steps[mid:]) / (len(steps) - mid)
        first_half_kl = sum(s.get("kl", 0) for s in steps[:mid]) / mid
        last_half_kl = sum(s.get("kl", 0) for s in steps[mid:]) / (len(steps) - mid)
        if (reward_trend == "improving"
                and last_half_std < first_half_std * 0.5  # reward_std dropped by 50%+
                and last_half_kl > first_half_kl * 2.0):  # KL doubled
            alerts.append({
                "severity": "WARNING",
                "metric": "reward_hacking",
                "message": f"Possible reward hacking: reward improving but reward_std dropped ({first_half_std:.3f} → {last_half_std:.3f}) while KL rose — inspect outputs manually",
            })

    # High reward + low std = base model already good, grader too lenient
    # Ref: rft-grpo-training-explained.md §Why The Grader is EVERYTHING
    if r_end > 0.9 and reward_std_final < 0.10 and reward_trend == "flat":
        alerts.append({
            "severity": "HIGH",
            "metric": "grader_signal",
            "message": f"Reward {r_end:.3f} with std {reward_std_final:.3f} — base model already scores 90%+, GRPO has minimal learning signal. Make grader harder.",
        })

    return {
        "steps_completed": last.get("global_step", 0),
        "max_steps": last.get("max_steps", 0),
        "epochs": last.get("epoch", 0),
        "reward": {
            "start": round(r_start, 4),
            "end": round(r_end, 4),
            "delta": round(r_delta, 4),
            "trend": reward_trend,
        },
        "kl": {
            "final": round(kl_final, 4),
            "max": round(kl_max, 4),
        },
        "clipping": {
            "avg": round(clip_avg, 4),
            "max": round(clip_max, 4),
        },
        "loss": {
            "start": round(first.get("loss", 0), 4),
            "end": round(last.get("loss", 0), 4),
            "has_nan": has_nan,
        },
        "grad_norm": {
            "median": round(grad_median, 2),
            "max": round(grad_max, 2),
        },
        "alerts": alerts,
    }


# ---------------------------------------------------------------------------
# Per-epoch evaluation analysis
# ---------------------------------------------------------------------------

def analyze_epoch_evals(data: dict) -> dict:
    """Analyze per-epoch per-record evaluations for learning trajectories."""
    results = data.get("results", [])
    if not results:
        return {"error": "No per-epoch evaluation data"}

    improved = 0
    stagnant = 0
    degraded = 0
    topic_deltas: dict[str, list[float]] = {}

    for record in results:
        epochs = record.get("epochs", {})
        epoch_keys = sorted(epochs.keys(), key=int)
        if len(epoch_keys) < 2:
            continue

        first_epoch_data = epochs[epoch_keys[0]]
        last_epoch_data = epochs[epoch_keys[-1]]
        first_score = first_epoch_data[0].get("score", 0) if first_epoch_data else 0
        last_score = last_epoch_data[0].get("score", 0) if last_epoch_data else 0
        delta = last_score - first_score

        if delta > 0.1:
            improved += 1
        elif delta < -0.1:
            degraded += 1
        else:
            stagnant += 1

        topic = record.get("row", {}).get("topic", "unknown")
        topic_deltas.setdefault(topic, []).append(delta)

    total = improved + stagnant + degraded

    topic_summary = []
    for topic, deltas in sorted(topic_deltas.items(), key=lambda x: sum(x[1]) / len(x[1])):
        avg_delta = sum(deltas) / len(deltas)
        topic_summary.append({
            "topic": topic,
            "avg_delta": round(avg_delta, 4),
            "record_count": len(deltas),
            "label": "improved" if avg_delta > 0.1 else "degraded" if avg_delta < -0.1 else "stagnant",
        })

    return {
        "total_records": total,
        "improved": improved,
        "stagnant": stagnant,
        "degraded": degraded,
        "topics": topic_summary,
    }


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------

def print_summary(
    metrics_result: dict,
    epoch_result: dict | None = None,
    job_status: dict | None = None,
) -> None:
    """Print a human-readable summary to stdout."""
    if "error" in metrics_result:
        print(f"ERROR: {metrics_result['error']}")
        return

    status_str = job_status.get("status", "unknown") if job_status else "unknown"
    r = metrics_result["reward"]
    kl = metrics_result["kl"]
    clip = metrics_result["clipping"]
    loss = metrics_result["loss"]

    print(f"=== Training Analysis ===")
    print(f"Status: {status_str} | Steps: {metrics_result['steps_completed']}/{metrics_result['max_steps']} | Epochs: {metrics_result['epochs']:.1f}")
    print(f"Reward: {r['start']:.3f} → {r['end']:.3f} ({r['trend']}, delta={r['delta']:+.3f})")
    print(f"KL: final={kl['final']:.4f}, max={kl['max']:.4f}")
    print(f"Clipping: avg={clip['avg']:.0%}, max={clip['max']:.0%}")
    print(f"Loss: {loss['start']:.4f} → {loss['end']:.4f}")
    print()

    # Alerts
    alerts = metrics_result.get("alerts", [])
    if alerts:
        print("Issues found:")
        for alert in alerts:
            print(f"  [{alert['severity']}] {alert['message']}")
        print()
    else:
        print("No issues detected ✅")
        print()

    # Per-epoch evaluations
    if epoch_result and "error" not in epoch_result:
        print(f"Record trajectories: {epoch_result['improved']} improved, {epoch_result['stagnant']} stagnant, {epoch_result['degraded']} degraded (of {epoch_result['total_records']})")
        print()
        print("Per-topic learning:")
        for topic_info in epoch_result["topics"]:
            label_char = "+" if topic_info["label"] == "improved" else "-" if topic_info["label"] == "degraded" else "="
            print(f"  [{label_char}] {topic_info['topic']}: avg delta={topic_info['avg_delta']:+.3f} ({topic_info['record_count']} records)")
        print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze training metrics from a finetune job")
    parser.add_argument("--workflow-id", help="Workflow ID (for fetching from API)")
    parser.add_argument("--job-id", help="Job ID (for fetching from API)")
    parser.add_argument("--metrics-file", help="Path to saved metrics JSON (skip API fetch)")
    parser.add_argument("--epoch-evals-file", help="Path to saved epoch evals JSON (skip API fetch)")
    parser.add_argument("--output-dir", default="training-jobs", help="Directory to save fetched data (default: training-jobs)")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"Gateway base URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--json", action="store_true", help="Output as JSON instead of human-readable text")
    parser.add_argument("--save", action="store_true", help="Save fetched data to output-dir")
    args = parser.parse_args()

    has_api_args = args.workflow_id and args.job_id
    has_file_args = args.metrics_file

    if not has_api_args and not has_file_args:
        parser.error("Provide either --workflow-id + --job-id (fetch from API) or --metrics-file (analyze saved file)")

    # Fetch or load metrics
    if has_file_args:
        metrics_data = json.loads(Path(args.metrics_file).read_text())
    else:
        metrics_data = fetch_metrics(args.base_url, args.workflow_id, args.job_id)

    # Fetch or load epoch evals
    epoch_data = None
    if args.epoch_evals_file:
        epoch_data = json.loads(Path(args.epoch_evals_file).read_text())
    elif has_api_args:
        try:
            epoch_data = fetch_epoch_evals(args.base_url, args.workflow_id, args.job_id)
        except requests.RequestException as e:
            print(f"Warning: Could not fetch epoch evals: {e}", file=sys.stderr)

    # Fetch job status
    job_status = None
    if has_api_args:
        try:
            job_status = fetch_job_status(args.base_url, args.workflow_id, args.job_id)
        except requests.RequestException as e:
            print(f"Warning: Could not fetch job status: {e}", file=sys.stderr)

    # Save fetched data
    if args.save and has_api_args:
        output_dir = Path(args.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / f"{args.job_id}-metrics.json").write_text(json.dumps(metrics_data, indent=2))
        if epoch_data:
            (output_dir / f"{args.job_id}-epoch-evals.json").write_text(json.dumps(epoch_data, indent=2))
        if job_status:
            (output_dir / f"{args.job_id}-status.json").write_text(json.dumps(job_status, indent=2))

    # Analyze
    metrics_result = analyze_metrics(metrics_data)
    epoch_result = analyze_epoch_evals(epoch_data) if epoch_data else None

    # Output
    if args.json:
        output = {"metrics": metrics_result}
        if epoch_result:
            output["epoch_evals"] = epoch_result
        print(json.dumps(output, indent=2))
    else:
        print_summary(metrics_result, epoch_result, job_status)

    # Exit with non-zero if critical alerts
    critical_alerts = [a for a in metrics_result.get("alerts", []) if a["severity"] == "CRITICAL"]
    if critical_alerts:
        sys.exit(1)


if __name__ == "__main__":
    main()
