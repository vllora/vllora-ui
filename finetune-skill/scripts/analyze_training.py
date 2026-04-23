# /// script
# dependencies = ["requests>=2.31"]
# ///
"""Fetch and analyze training metrics from a finetune job.

Usage:
  uv run scripts/analyze_training.py --workflow-id WF_ID --job-id JOB_ID [--output-dir finetune-project/training-jobs]
  uv run scripts/analyze_training.py --metrics-file finetune-project/training-jobs/job-v1-metrics.json  # Analyze saved file

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


def fetch_epoch_evals(base_url: str, workflow_id: str, provider_job_id: str) -> dict:
    """Fetch ALL per-epoch per-record evaluations from the gateway API.

    NOTE: The finetune-evaluations endpoint requires the PROVIDER job ID
    (not the internal job ID). The UI uses job.provider_job_id for this call.
    Pass include_rollout_content=true to get actual model outputs per epoch.
    Backend defaults limit=20; we paginate through all rows.
    """
    url = f"{base_url}/finetune/workflows/{workflow_id}/finetune-evaluations"
    all_results = []
    page_size = 100
    offset = 0

    while True:
        resp = requests.get(url, params={
            "finetune_job_id": provider_job_id,
            "include_rollout_content": "true",
            "limit": str(page_size),
            "offset": str(offset),
        }, timeout=60)
        resp.raise_for_status()
        page = resp.json()
        results = page.get("results", [])
        if not results:
            break
        all_results.extend(results)
        if len(results) < page_size:
            break
        offset += len(results)

    return {"results": all_results}


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

    # KL divergence — NOT diagnostic on our backend.
    # Ref: DAPO (arXiv:2503.14476) removes KL entirely (β=0); TRL defaults β=0.
    # Our backend reports un-normalized KL that oscillates by 6 orders of magnitude
    # step-to-step (correlated with completion length, not policy divergence).
    # With β=0, KL is informational only. We skip automated KL analysis.
    kl_values = [s.get("kl", 0) for s in steps]
    kl_max = max(kl_values)
    kl_final = last.get("kl", 0)

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

    # Loss and grad_norm — our backend reports UN-NORMALIZED values that oscillate by
    # 6 orders of magnitude step-to-step (correlated with completion length).
    # Verified from real training data: loss ranges from 0.1 to 1,637,409 within the
    # same run, grad_norm from 1.5 to 60,149,276. This is NOT instability — it's
    # a normalization artifact. ZClip z-score detection would false-positive on every run.
    #
    # We only flag: NaN/Inf (catastrophic), all-zero loss (no learning signal).
    # For training health, rely on REWARD metrics (which ARE on correct TRL scale).
    #
    # Ref: TRL#2995 (normalization), Unsloth gradient accumulation blog,
    #      Unsloth issues #3006/#2824 (loss=0 + NaN grad bug)
    loss_values = [s.get("loss", 0) for s in steps]
    grad_values = [s.get("grad_norm", 0) for s in steps]
    has_nan_loss = any(math.isnan(v) or math.isinf(v) for v in loss_values if isinstance(v, (int, float)))
    has_nan_grad = any(
        isinstance(v, (int, float)) and not math.isfinite(v) for v in grad_values
    )

    if has_nan_loss:
        alerts.append({
            "severity": "CRITICAL",
            "metric": "loss",
            "message": "NaN/Inf detected in loss — training numerically unstable. Check for zero-length completions or degenerate batches.",
        })
    elif has_nan_grad:
        if len(loss_values) > 3 and all(v == 0.0 for v in loss_values):
            # Unsloth-specific: loss=0 + grad_norm=NaN = known bug
            # Ref: Unsloth issues #3006, #2824
            alerts.append({
                "severity": "CRITICAL",
                "metric": "loss",
                "message": "Loss stuck at 0 with NaN gradients — known Unsloth issue. Verify LoRA adapters applied (FastLanguageModel.get_peft_model) and try gradient_accumulation_steps=1.",
            })
        else:
            alerts.append({
                "severity": "CRITICAL",
                "metric": "grad_norm",
                "message": "NaN/Inf grad_norm — numerical overflow, likely from zero-length completions or bad chat template.",
            })
    elif len(loss_values) > 3 and all(v == 0.0 for v in loss_values):
        alerts.append({
            "severity": "CRITICAL",
            "metric": "loss",
            "message": "Loss stuck at exactly 0.0 — zero advantages, model learning nothing. Check grader signal (reward_std, frac_reward_zero_std).",
        })

    # Weak training signal
    # Thresholds: healthy 0.05-0.3, warn <0.05, critical <0.01
    # Ref: training-metrics-guide.md §Reward Std; empirical heuristic for [0,1] grader scale
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

    # frac_reward_zero_std: warn >0.5+reward_flat, critical >0.8+reward_flat
    # Ref: "No Prompt Left Behind" (arXiv:2509.21880) — 30-99% normal in GRPO
    # These thresholds are empirical; only meaningful when reward is also stagnant
    zero_std_values = [s.get("frac_reward_zero_std", 0) for s in steps]
    zero_std_avg = sum(zero_std_values) / len(zero_std_values) if zero_std_values else 0
    # Only alert on high zero-std when reward is ALSO flat — 30-99% zero-std is normal
    # in GRPO (arXiv:2509.21880). High zero-std with rising reward = healthy learning.
    if zero_std_avg > 0.80 and reward_trend != "improving":
        alerts.append({
            "severity": "CRITICAL",
            "metric": "zero_std",
            "message": f"{zero_std_avg:.0%} avg zero-std fraction with {reward_trend} reward — training gets no useful gradient from most examples",
        })
    elif zero_std_avg > 0.50 and reward_trend != "improving":
        alerts.append({
            "severity": "WARNING",
            "metric": "zero_std",
            "message": f"{zero_std_avg:.0%} avg zero-std fraction with {reward_trend} reward — over half the batch provides no learning signal (note: 30-99% zero-std is normal in GRPO if reward is still improving)",
        })

    # Reward hacking detection
    # Heuristic: reward improving but reward_std collapsing → model converges on single
    # exploitable pattern. No single paper sources this exact rule — it follows from GRPO
    # mechanics (diversity collapse). DAPO (arXiv:2503.14476) describes entropy collapse
    # as a related failure mode. We use reward_std instead of KL (un-normalized on our backend).
    if len(steps) >= 6:
        mid = len(steps) // 2
        first_half_std = sum(s.get("reward_std", 0) for s in steps[:mid]) / mid
        last_half_std = sum(s.get("reward_std", 0) for s in steps[mid:]) / (len(steps) - mid)
        if (reward_trend == "improving"
                and first_half_std > 0.01
                and last_half_std < first_half_std * 0.5):  # reward_std dropped by 50%+
            alerts.append({
                "severity": "WARNING",
                "metric": "reward_hacking",
                "message": f"Possible reward hacking: reward improving but reward_std dropped 50%+ ({first_half_std:.3f} → {last_half_std:.3f}) — model may be converging on a single high-scoring pattern. Inspect outputs manually.",
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
        # NOTE: kl, loss, grad_norm are un-normalized on our backend (oscillate by
        # 6 orders of magnitude step-to-step). Values are informational only.
        # Use reward, reward_std, frac_reward_zero_std for training health assessment.
        "kl": {
            "final": round(kl_final, 4),
            "max": round(kl_max, 4),
            "_note": "un-normalized (informational only)",
        },
        "clipping": {
            "avg": round(clip_avg, 4),
            "max": round(clip_max, 4),
        },
        "loss": {
            "start": round(first.get("loss", 0), 4),
            "end": round(last.get("loss", 0), 4),
            "has_nan": has_nan_loss,
            "_note": "un-normalized (informational only)",
        },
        "grad_norm": {
            "has_nan": has_nan_grad,
            "_note": "un-normalized (informational only)",
        },
        "alerts": alerts,
    }


# ---------------------------------------------------------------------------
# Per-epoch evaluation analysis
# ---------------------------------------------------------------------------

def analyze_epoch_evals(data: dict, top_n: int = 5) -> dict:
    """Analyze per-epoch per-record evaluations for learning trajectories.

    Returns aggregate counts, per-topic summaries, and the top N biggest
    regressions and improvements with their content for diagnosis.
    """
    results = data.get("results", [])
    if not results:
        return {"error": "No per-epoch evaluation data"}

    improved = 0
    stagnant = 0
    degraded = 0
    topic_deltas: dict[str, list[float]] = {}
    all_records: list[dict] = []

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

        row = record.get("row", {})
        topic = row.get("topic", "unknown")
        topic_deltas.setdefault(topic, []).append(delta)

        # Collect per-epoch trajectory
        trajectory = []
        for ek in epoch_keys:
            ep = epochs[ek]
            trajectory.append(round(ep[0].get("score", 0), 3) if ep else 0)

        # Collect record info for top regressions/improvements
        messages = row.get("messages", [])
        user_msg = next((m.get("content", "") for m in messages if m.get("role") == "user"), "")
        first_output = first_epoch_data[0].get("rollout_content", "") if first_epoch_data else ""
        last_output = last_epoch_data[0].get("rollout_content", "") if last_epoch_data else ""
        first_reason = first_epoch_data[0].get("reason", "") if first_epoch_data else ""
        last_reason = last_epoch_data[0].get("reason", "") if last_epoch_data else ""

        all_records.append({
            "row_index": record.get("row_index", "?"),
            "topic": topic,
            "input": user_msg[:200],
            "delta": round(delta, 4),
            "first_score": round(first_score, 4),
            "last_score": round(last_score, 4),
            "trajectory": trajectory,
            "first_output": first_output[:300] if first_output else "",
            "last_output": last_output[:300] if last_output else "",
            "first_reason": first_reason[:200] if first_reason else "",
            "last_reason": last_reason[:200] if last_reason else "",
        })

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

    # Top regressions and improvements — these are the most diagnostic records.
    # Regressions tell you what training broke. Improvements tell you what's working.
    sorted_by_delta = sorted(all_records, key=lambda r: r["delta"])
    top_regressions = sorted_by_delta[:top_n]
    top_improvements = sorted_by_delta[-top_n:][::-1]

    # --- Pattern detection on per-record epoch data ---
    epoch_alerts: list[dict] = []

    # 1. Epoch-level collapse detection: scores fine through epoch N, then crash at N+1.
    #    Look at per-epoch averages — if any epoch drops >0.1 from the previous.
    if all_records and all_records[0].get("trajectory"):
        num_epochs = len(all_records[0]["trajectory"])
        epoch_avgs = []
        for e in range(num_epochs):
            scores_at_e = [r["trajectory"][e] for r in all_records if len(r.get("trajectory", [])) > e]
            epoch_avgs.append(sum(scores_at_e) / len(scores_at_e) if scores_at_e else 0)

        for e in range(1, len(epoch_avgs)):
            drop = epoch_avgs[e - 1] - epoch_avgs[e]
            if drop > 0.08:
                epoch_alerts.append({
                    "type": "epoch_collapse",
                    "message": f"Score collapsed at epoch {e}: {epoch_avgs[e-1]:.3f} → {epoch_avgs[e]:.3f} (Δ={-drop:+.3f}). Model was fine through epoch {e-1}. Consider using fewer epochs (stop at {e-1}).",
                    "collapse_epoch": e,
                    "epoch_avgs": [round(a, 3) for a in epoch_avgs],
                })
                break  # report first collapse only

    # 2. Over-prediction pattern: top regressions all show high recall + low precision
    #    (model learned to list everything). Detect from grader reason fields.
    over_predict_count = 0
    for r in top_regressions:
        reason = r.get("last_reason", "")
        if "R=1.00" in reason and ("P=0.1" in reason or "P=0.2" in reason):
            over_predict_count += 1
    if over_predict_count >= 3:
        epoch_alerts.append({
            "type": "over_prediction",
            "message": f"{over_predict_count}/{len(top_regressions)} top regressions show R=1.00 with low precision — model learned to over-predict (list all possible answers to maximize recall). Fix: add hard penalty for false positives in grader, not just F1.",
        })

    # 3. Identical output collapse: top regressions all have the same last_output
    if top_regressions:
        outputs = [r.get("last_output", "").strip() for r in top_regressions if r.get("last_output")]
        if outputs and len(set(outputs)) == 1 and outputs[0]:
            epoch_alerts.append({
                "type": "output_collapse",
                "message": f"All top regressions produce identical output — model collapsed to a single strategy: '{outputs[0][:100]}'. Fix: inspect grader for exploitable shortcut.",
            })

    return {
        "total_records": total,
        "improved": improved,
        "stagnant": stagnant,
        "degraded": degraded,
        "topics": topic_summary,
        "top_regressions": top_regressions,
        "top_improvements": top_improvements,
        "epoch_alerts": epoch_alerts,
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

        # Top regressions — most diagnostic for understanding what training broke
        regressions = epoch_result.get("top_regressions", [])
        if regressions and regressions[0]["delta"] < -0.1:
            print("Biggest regressions (what training broke):")
            for rec in regressions:
                if rec["delta"] >= -0.1:
                    break
                print(f"  #{rec['row_index']} [{rec['topic']}] score: {rec['first_score']:.2f} → {rec['last_score']:.2f} (Δ={rec['delta']:+.2f})")
                print(f"    Input: {rec['input'][:120]}")
                if rec.get("last_output"):
                    print(f"    Last output: {rec['last_output'][:120]}")
                if rec.get("last_reason"):
                    print(f"    Last reason: {rec['last_reason'][:120]}")
                print()

        # Top improvements — what's working
        improvements = epoch_result.get("top_improvements", [])
        if improvements and improvements[0]["delta"] > 0.1:
            print("Biggest improvements (what training helped):")
            for rec in improvements:
                if rec["delta"] <= 0.1:
                    break
                print(f"  #{rec['row_index']} [{rec['topic']}] score: {rec['first_score']:.2f} → {rec['last_score']:.2f} (Δ={rec['delta']:+.2f})")
                print(f"    Input: {rec['input'][:120]}")
                print()

        # Epoch-level pattern alerts
        epoch_alerts = epoch_result.get("epoch_alerts", [])
        if epoch_alerts:
            print("⚠️  Epoch-level patterns detected:")
            for alert in epoch_alerts:
                print(f"  [{alert['type']}] {alert['message']}")
                if alert.get("epoch_avgs"):
                    avgs = alert["epoch_avgs"]
                    print(f"    Per-epoch averages: {' → '.join(f'{a:.3f}' for a in avgs)}")
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
    parser.add_argument("--output-dir", default="finetune-project/training-jobs", help="Directory to save fetched data (default: finetune-project/training-jobs)")
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

    # Fetch job status first — we need provider_job_id for epoch evals
    job_status = None
    provider_job_id = None
    if has_api_args:
        try:
            job_status = fetch_job_status(args.base_url, args.workflow_id, args.job_id)
            provider_job_id = job_status.get("provider_job_id")
        except requests.RequestException as e:
            print(f"Warning: Could not fetch job status: {e}", file=sys.stderr)

    # Fetch or load epoch evals
    # NOTE: finetune-evaluations endpoint requires the PROVIDER job ID, not the internal one.
    epoch_data = None
    if args.epoch_evals_file:
        epoch_data = json.loads(Path(args.epoch_evals_file).read_text())
    elif has_api_args and provider_job_id:
        try:
            epoch_data = fetch_epoch_evals(args.base_url, args.workflow_id, provider_job_id)
        except requests.RequestException as e:
            print(f"Warning: Could not fetch epoch evals: {e}", file=sys.stderr)
    elif has_api_args:
        print("Warning: Could not resolve provider_job_id — epoch evals unavailable", file=sys.stderr)

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
