"""Paraphrase the LAST user turn of rare-tool decision points, preserving
full prior context + ground truth. Based on Trajectory2Task (arXiv:2601.20144):
add scenario diversity to minority classes without the shortcuts banned by
single-turn synthesis (skip authentication, args-from-nowhere).

Each variant is identical to the source record except `messages[-1].content`,
which the LLM rewrites in a customer's voice. System prompt, tool list,
ground truth, and all prior turns are preserved exactly.

Usage:
    uv run paraphrase_rare_topics.py \\
        --file finetune-project/training.jsonl \\
        --min-per-topic 15 \\
        --model gpt-4o-mini \\
        --base-url http://localhost:9090

Options:
    --dry-run            Show plan without writing
    --variants-per-seed N  Max variants per seed record (default: auto)
"""

# /// script
# dependencies = [
#   "requests",
# ]
# ///

import argparse
import json
import math
import re
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import requests


FLOOR_MIN_PER_TOPIC = 25
MAX_PARAPHRASES_PER_SEED = 8
LLM_TIMEOUT_S = 60
LLM_MAX_TOKENS = 500


PARAPHRASE_PROMPT = """You are helping build training data for a tool-calling customer-service agent.

Below is a real conversation between a customer and an agent. Your job is to rewrite ONLY THE LAST USER TURN in a different style, preserving every factual detail.

### Conversation
{conversation}

### Last user turn (to rewrite)
{last_user}

### Your task
Produce {n} DIFFERENT paraphrases of the last user turn. Each paraphrase must:
1. Express the same intent and any explicit values (order IDs, names, amounts, product options) EXACTLY as the original
2. Match the natural conversational tone of a real customer (casual, imperfect, hurried is fine)
3. NOT mention the agent's next action or any tool the agent will call
4. Be meaningfully different from each other — vary wording, hedging, politeness, sentence structure, use of contractions
5. Keep the user's affect (frustrated, confused, grateful, etc.) consistent with the original

Return ONLY a JSON object of the form:
{{"paraphrases": ["...", "...", ...]}}

No prose, no explanation, no markdown.
"""


def _format_conversation(messages: list[dict]) -> str:
    """Render a conversation for the LLM. Truncate tool responses to keep context bounded."""
    lines: list[str] = []
    for m in messages[:-1]:  # exclude the last user turn — it's shown separately
        role = m.get("role", "?")
        if role == "system":
            continue
        if role == "assistant":
            content = m.get("content") or ""
            tcs = m.get("tool_calls") or []
            if tcs:
                for tc in tcs:
                    fn = tc.get("function", {})
                    name = fn.get("name", "?")
                    args = fn.get("arguments", "")
                    if isinstance(args, str):
                        args_preview = args[:200]
                    else:
                        args_preview = json.dumps(args)[:200]
                    lines.append(f"AGENT called {name}({args_preview})")
            if content:
                lines.append(f"AGENT: {str(content)[:400]}")
            continue
        if role == "tool":
            content = str(m.get("content") or "")[:300]
            lines.append(f"[tool result: {content}]")
            continue
        if role == "user":
            content = str(m.get("content") or "")
            lines.append(f"USER: {content}")
    return "\n".join(lines) if lines else "(no prior turns)"


def _call_llm(base_url: str, model: str, prompt: str) -> str:
    """Call the gateway's chat completions endpoint. Returns raw text or empty string on failure."""
    url = f"{base_url.rstrip('/')}/v1/chat/completions"
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.8,  # enough variation for distinct paraphrases
        "max_tokens": LLM_MAX_TOKENS,
        "response_format": {"type": "json_object"},
    }
    try:
        resp = requests.post(url, json=body, timeout=LLM_TIMEOUT_S)
        if resp.status_code != 200:
            print(f"  LLM call failed: {resp.status_code} {resp.text[:200]}", file=sys.stderr)
            return ""
        data = resp.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "") or ""
    except Exception as e:
        print(f"  LLM call error: {type(e).__name__}: {e}", file=sys.stderr)
        return ""


def _parse_paraphrases(raw: str) -> list[str]:
    """Extract the list of paraphrase strings from the LLM JSON response."""
    if not raw:
        return []
    # Strip common wrappers
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned).rstrip("`").strip()
    try:
        obj = json.loads(cleaned)
    except json.JSONDecodeError:
        return []
    paraphrases = obj.get("paraphrases") or obj.get("variants") or []
    if not isinstance(paraphrases, list):
        return []
    return [str(p).strip() for p in paraphrases if isinstance(p, (str, int, float)) and str(p).strip()]


def _validate_variant(original: dict, variant_text: str) -> tuple[bool, str]:
    """Sanity-check a paraphrase: non-empty, different from original, no tool-call leakage."""
    if not variant_text:
        return False, "empty"
    original_last = (original["messages"][-1].get("content") or "").strip()
    if variant_text.strip().lower() == original_last.lower():
        return False, "identical to original"
    # Reject obvious tool-call leakage patterns
    for leak in ("call get_", "call find_", "call modify_", "<tool_call>", "<function=", "```json"):
        if leak in variant_text.lower():
            return False, f"tool-call leakage ({leak!r})"
    # Keep user voice — disallow anything that looks like agent/assistant output
    low = variant_text.lower().strip()
    if low.startswith(("sure!", "of course!", "i can help you")) and len(variant_text) < 40:
        return False, "sounds like an assistant response"
    return True, ""


def _build_variant(seed: dict, new_last_user: str, idx: int) -> dict:
    """Clone the seed record with only the last user message content replaced."""
    variant = {**seed}
    variant["messages"] = [dict(m) for m in seed["messages"]]
    variant["messages"][-1] = {
        **variant["messages"][-1],
        "content": new_last_user,
    }
    # New ID: trace-<hash>-dp-<n>-p<idx>
    variant["id"] = f"{seed['id']}-p{idx}"
    variant["prompt_type"] = seed.get("prompt_type", "trace_decision_point") + "-paraphrase"
    return variant


def paraphrase_rare_topics(
    file_path: Path,
    min_per_topic: int,
    base_url: str,
    model: str,
    variants_per_seed: int | None,
    dry_run: bool,
) -> dict:
    """Main loop: identify rare topics, generate paraphrases for each seed record."""
    if not file_path.exists():
        print(f"Error: file not found: {file_path}", file=sys.stderr)
        sys.exit(1)

    records = [json.loads(l) for l in file_path.read_text().splitlines() if l.strip()]
    topic_counts: Counter[str] = Counter(r.get("topic", "?") for r in records)
    topic_to_records: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        topic_to_records[r.get("topic", "?")].append(r)

    rare = [(t, c) for t, c in topic_counts.items() if c < min_per_topic]
    rare.sort(key=lambda x: x[1])
    print(f"Records: {len(records)}; topics: {len(topic_counts)}; "
          f"below min-per-topic={min_per_topic}: {len(rare)}")
    if not rare:
        print("No rare topics — nothing to do.")
        return {"records_before": len(records), "records_added": 0, "variants_by_topic": {}}
    for t, c in rare:
        print(f"  {c:3d}  {t}  (need {min_per_topic - c})")

    if dry_run:
        print("\n[--dry-run] Skipping LLM calls; exiting.")
        return {"records_before": len(records), "records_added": 0, "variants_by_topic": {}}

    added_records: list[dict] = []
    variants_by_topic: dict[str, int] = {}
    stats_rejected = Counter()

    for topic, current_count in rare:
        need = min_per_topic - current_count
        seeds = topic_to_records[topic]
        if not seeds:
            continue

        # Round-robin across seeds to spread variants
        per_seed = variants_per_seed or min(MAX_PARAPHRASES_PER_SEED,
                                             math.ceil(need / max(len(seeds), 1)))
        print(f"\nTopic {topic}: {current_count} real, need {need}, "
              f"{len(seeds)} seeds × up to {per_seed} variants each")

        produced = 0
        for seed_idx, seed in enumerate(seeds):
            if produced >= need:
                break
            last_user = (seed["messages"][-1].get("content") or "").strip()
            if not last_user or seed["messages"][-1].get("role") != "user":
                continue

            n_to_request = min(per_seed, need - produced)
            prompt = PARAPHRASE_PROMPT.format(
                conversation=_format_conversation(seed["messages"]),
                last_user=last_user,
                n=n_to_request,
            )
            raw = _call_llm(base_url, model, prompt)
            paraphrases = _parse_paraphrases(raw)
            for i, p in enumerate(paraphrases):
                if produced >= need:
                    break
                ok, reason = _validate_variant(seed, p)
                if not ok:
                    stats_rejected[reason] += 1
                    continue
                added_records.append(_build_variant(seed, p, i + 1))
                produced += 1
            # Small pause to avoid hammering the gateway
            time.sleep(0.2)

        variants_by_topic[topic] = produced
        print(f"  generated {produced} variants ({current_count + produced} total)")

    # Append
    if added_records:
        with file_path.open("a") as f:
            for r in added_records:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"\n✓ Appended {len(added_records)} paraphrase records to {file_path}")

    if stats_rejected:
        print(f"\nRejected variants by reason:")
        for r, c in stats_rejected.most_common():
            print(f"  {c:3d}  {r}")

    return {
        "records_before": len(records),
        "records_added": len(added_records),
        "variants_by_topic": variants_by_topic,
        "rejected": dict(stats_rejected),
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--file", required=True, help="Path to training.jsonl")
    p.add_argument("--min-per-topic", type=int, default=FLOOR_MIN_PER_TOPIC)
    p.add_argument("--base-url", default="http://localhost:9090")
    p.add_argument("--model", default="gpt-4o-mini")
    p.add_argument("--variants-per-seed", type=int, default=None,
                   help="Cap variants per seed record (default: auto-calculated)")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    summary = paraphrase_rare_topics(
        file_path=Path(args.file),
        min_per_topic=args.min_per_topic,
        base_url=args.base_url,
        model=args.model,
        variants_per_seed=args.variants_per_seed,
        dry_run=args.dry_run,
    )

    print(f"\nSummary: added {summary['records_added']} records across "
          f"{len(summary['variants_by_topic'])} rare topics")


if __name__ == "__main__":
    main()
