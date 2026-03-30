# /// script
# dependencies = ["requests>=2.31"]
# ///
"""Generate training records from topics, relations, and knowledge parts.

For each leaf topic, gathers linked source material via relations.json,
makes multiple LLM calls (one per prompt type) to generate diverse,
grounded user prompts, and writes records to training.jsonl incrementally.

Features:
  - Multi-call generation: 5 prompt types per topic for better diversity
  - Equal distribution by default; --weight-by-source for source-proportional
  - Inner parallelism: prompt-type calls within a topic run concurrently
  - Outer parallelism: multiple topics generated concurrently

Usage:
  uv run scripts/generate_records.py \
    --topics finetune-project/topics.json \
    --relations finetune-project/relations.json \
    --knowledge-dir finetune-project/knowledge \
    --system-prompt "You are an expert chess tutor..." \
    --output finetune-project/training.jsonl \
    --records-per-topic 25

Exit codes:
  0 - success (all topics generated)
  1 - error (some topics failed, partial output written)
"""

import glob
import json
import math
import subprocess
import sys
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# ---------------------------------------------------------------------------
# Prompt types: each type targets a different question style for diversity.
# Weight determines the proportion of records allocated to each type.
# Temperature varies per type to control creativity vs precision.
# ---------------------------------------------------------------------------
PROMPT_TYPES = [
    {
        "name": "explain",
        "weight": 0.25,
        "temperature": 0.7,
        "instruction": (
            "Generate {n} user prompts that ask the model to EXPLAIN concepts, "
            "definitions, or processes. These should be foundational questions: "
            "\"What is...\", \"How does... work\", \"Explain the concept of...\", "
            "\"Describe the process for...\". Vary difficulty from beginner to advanced."
        ),
    },
    {
        "name": "scenario",
        "weight": 0.25,
        "temperature": 0.9,
        "instruction": (
            "Generate {n} user prompts that present REALISTIC SCENARIOS or "
            "situations requiring advice. Frame as: \"I'm dealing with...\", "
            "\"My situation is...\", \"I need to...\". Include specific details "
            "(names, numbers, dates, conditions) to make them concrete. "
            "Vary the user's emotion: neutral, confused, frustrated, curious."
        ),
    },
    {
        "name": "compare_analyze",
        "weight": 0.20,
        "temperature": 0.8,
        "instruction": (
            "Generate {n} user prompts that require COMPARISON or ANALYSIS. "
            "These ask the model to weigh trade-offs, contrast approaches, or "
            "evaluate options: \"Compare X vs Y\", \"What are the pros and cons of...\", "
            "\"Which approach is better when...\", \"Analyze why... happens\". "
            "Require reasoning, not just recall."
        ),
    },
    {
        "name": "edge_case",
        "weight": 0.15,
        "temperature": 1.0,
        "instruction": (
            "Generate {n} user prompts covering EDGE CASES, exceptions, and "
            "unusual situations. These test the model's depth: \"What happens if...\", "
            "\"Is it possible to...\", \"What's the exception when...\", "
            "\"How do you handle the case where...\". Target uncommon but valid "
            "scenarios from the source material."
        ),
    },
    {
        "name": "application",
        "weight": 0.15,
        "temperature": 0.85,
        "instruction": (
            "Generate {n} user prompts that require APPLYING knowledge to solve "
            "a problem or complete a task. Frame as step-by-step requests: "
            "\"Walk me through how to...\", \"Help me figure out...\", "
            "\"I want to do X, what steps should I take?\", \"Given this situation, "
            "what should I do?\". Make them multi-step where possible."
        ),
    },
]


def load_topics(topics_path: Path) -> list[dict]:
    data = json.loads(topics_path.read_text())
    return data if isinstance(data, list) else data.get("topics", [])


def load_relations(relations_path: Path) -> list[dict]:
    data = json.loads(relations_path.read_text())
    return data if isinstance(data, list) else data.get("relations", [])


def load_all_parts(knowledge_dir: Path) -> dict[str, dict]:
    """Load all parts from {doc-slug}/knowledge_parts.json files, keyed by part ID."""
    parts: dict[str, dict] = {}
    pattern = str(knowledge_dir / "*" / "knowledge_parts.json")
    for kp_file in sorted(glob.glob(pattern)):
        try:
            data = json.loads(Path(kp_file).read_text())
            for p in data.get("parts", []):
                parts[p["id"]] = p
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Warning: Failed to load {kp_file}: {e}", file=sys.stderr)
    return parts


def find_leaf_topics(topics: list[dict]) -> list[dict]:
    """Find topics that are not parents of any other topic."""
    parent_ids = {t["parent_id"] for t in topics if t.get("parent_id")}
    return [t for t in topics if t["id"] not in parent_ids]


def build_topic_index(topics: list[dict]) -> dict[str, dict]:
    """Build a lookup from topic ID to topic dict."""
    return {t["id"]: t for t in topics}


def get_ancestor_chain(topic: dict, topic_index: dict[str, dict]) -> list[dict]:
    """Walk up the hierarchy from a leaf topic to root. Returns [root, ..., parent] (excludes the leaf itself)."""
    chain: list[dict] = []
    current = topic
    while current.get("parent_id") and current["parent_id"] in topic_index:
        parent = topic_index[current["parent_id"]]
        chain.append(parent)
        current = parent
    chain.reverse()  # root first, immediate parent last
    return chain


def compose_system_prompt(root_prompt: str, ancestors: list[dict], leaf: dict) -> str:
    """Compose a hierarchical system prompt: root persona + ancestor specializations + leaf focus.

    Each level adds specificity without contradicting the parent.
    Target: 50-150 words total.
    """
    segments = [root_prompt]

    for ancestor in ancestors:
        segment = ancestor.get("system_prompt")
        if not segment:
            segment = f"Specialize in: {ancestor['name']}"
        segments.append(segment)

    leaf_segment = leaf.get("system_prompt")
    if not leaf_segment:
        leaf_segment = f"Focus on: {leaf['name']}"
    segments.append(leaf_segment)

    return "\n\n".join(segments)


# ---------------------------------------------------------------------------
# Topic record allocation
# ---------------------------------------------------------------------------

def compute_topic_record_counts(
    leaves: list[dict],
    relations: list[dict],
    records_per_topic: int,
    min_per_topic: int,
    max_per_topic: int,
    weight_by_source: bool = False,
) -> dict[str, int]:
    """Compute per-topic record counts.

    Default: equal distribution — every leaf topic gets ``records_per_topic``.
    This matches expected inference distribution (users query all topics)
    and avoids over-investing in topics with verbose source material.
    See OpenAI RFT Guide: training distribution should approximate
    inference distribution; arXiv:2508.14094: difficulty >> volume.

    With ``weight_by_source=True``: proportional to linked source parts
    (legacy behaviour). Max imbalance ratio is clamped to 3:1 to prevent
    majority-topic overfitting (OpenAI SFT best practices).

    Results are always clamped to [min_per_topic, max_per_topic].
    """
    if not weight_by_source:
        clamped = max(min_per_topic, min(records_per_topic, max_per_topic))
        return {leaf["id"]: clamped for leaf in leaves}

    # Source-weighted: proportional to linked source parts
    parts_per_topic: dict[str, int] = {}
    for leaf in leaves:
        count = sum(1 for r in relations if r["topic_identifier"] == leaf["id"])
        parts_per_topic[leaf["id"]] = max(count, 1)  # min 1 to avoid div-by-zero

    avg_parts = sum(parts_per_topic.values()) / len(parts_per_topic) if parts_per_topic else 1

    # Clamp weight ratio to 3:1 max imbalance (OpenAI SFT best practices:
    # severe imbalance at 10:1, keep tighter for small datasets)
    MAX_WEIGHT_RATIO = 3.0

    result: dict[str, int] = {}
    for leaf in leaves:
        raw_weight = parts_per_topic[leaf["id"]] / avg_parts
        weight = min(raw_weight, MAX_WEIGHT_RATIO)
        raw = round(records_per_topic * weight)
        result[leaf["id"]] = max(min_per_topic, min(raw, max_per_topic))

    return result


# ---------------------------------------------------------------------------
# Per-prompt-type distribution
# ---------------------------------------------------------------------------

def distribute_across_prompt_types(total: int) -> list[tuple[dict, int]]:
    """Distribute total records across prompt types by weight.

    Returns list of (prompt_type, count) with sum == total.
    For small totals (<5), collapses to fewer types to avoid 1-prompt calls.
    """
    if total <= 0:
        return []

    # For very small counts, use fewer types to avoid many 1-item calls
    active_types = PROMPT_TYPES if total >= 5 else PROMPT_TYPES[:max(2, total)]

    # Normalize weights for active types
    total_weight = sum(pt["weight"] for pt in active_types)

    # Distribute proportionally, rounding down
    distribution: list[tuple[dict, int]] = []
    allocated = 0
    for pt in active_types:
        count = math.floor(total * (pt["weight"] / total_weight))
        count = max(count, 1)  # at least 1 per active type
        distribution.append((pt, count))
        allocated += count

    # Distribute remainder to highest-weighted types first
    remainder = total - allocated
    idx = 0
    while remainder > 0 and idx < len(distribution):
        pt, count = distribution[idx]
        distribution[idx] = (pt, count + 1)
        remainder -= 1
        idx += 1

    # If we over-allocated (from the min-1 guarantee), trim from the end
    while sum(c for _, c in distribution) > total and len(distribution) > 1:
        pt, count = distribution[-1]
        if count > 1:
            distribution[-1] = (pt, count - 1)
        else:
            distribution.pop()

    return distribution


# ---------------------------------------------------------------------------
# Single LLM call for one prompt type
# ---------------------------------------------------------------------------

def _call_llm_for_type(
    prompt_type: dict,
    count: int,
    topic: dict,
    chunk_text: str,
    model: str,
    base_url: str,
    scripts_dir: Path,
    include_ground_truth: bool,
) -> list[dict]:
    """Make one LLM call for a specific prompt type. Returns raw items."""
    focus = topic.get("system_prompt", topic.get("name", ""))
    type_instruction = prompt_type["instruction"].format(n=count)

    prompt = f"""{type_instruction}

Topic: {topic['name']}
Focus: {focus}

Source material:
{chunk_text}

Each prompt must be a realistic question/request grounded in the source material above.
Do NOT generate generic questions — reference specific concepts, examples, or details from the source.

For each prompt, also provide a "ground_truth" field: a concise excerpt from the source material above that contains the information needed to accurately answer the question. Keep it focused on the relevant passage(s) — complete enough to verify a correct answer, but not the entire source.

Return JSON: {{"items": [{{"prompt": "the question", "ground_truth": "relevant source excerpt"}}, ...]}}"""

    request_data = json.dumps({
        "messages": [{"role": "user", "content": prompt}],
        "model": model,
        "temperature": prompt_type["temperature"],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "training_prompts",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "prompt": {"type": "string"},
                                    "ground_truth": {"type": "string"},
                                },
                                "required": ["prompt", "ground_truth"],
                                "additionalProperties": False,
                            },
                        },
                    },
                    "required": ["items"],
                    "additionalProperties": False,
                },
            },
        },
    })

    chat_script = scripts_dir / "chat_completion.py"
    result = subprocess.run(
        [sys.executable, str(chat_script), "--base-url", base_url],
        input=request_data,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print(
            f"    [{prompt_type['name']}] LLM call failed: {result.stderr[:200]}",
            file=sys.stderr,
        )
        return []

    try:
        response = json.loads(result.stdout)
    except json.JSONDecodeError:
        print(
            f"    [{prompt_type['name']}] Invalid JSON: {result.stdout[:200]}",
            file=sys.stderr,
        )
        return []

    if isinstance(response, dict) and "error" in response:
        print(
            f"    [{prompt_type['name']}] LLM error: {response['error']}",
            file=sys.stderr,
        )
        return []

    items = response.get("items", [])
    if not items:
        prompts = response.get("prompts", [])
        items = [{"prompt": p, "ground_truth": ""} for p in prompts]

    return items


# ---------------------------------------------------------------------------
# Per-topic generation (multi-call with inner parallelism)
# ---------------------------------------------------------------------------

def generate_for_topic(
    topic: dict,
    ancestors: list[dict],
    relations: list[dict],
    parts: dict[str, dict],
    system_prompt: str,
    records_per_topic: int,
    model: str,
    base_url: str,
    scripts_dir: Path,
    include_ground_truth: bool = True,
) -> list[dict]:
    """Generate records for a single leaf topic via multiple parallel LLM calls."""
    # Find parts linked to this topic
    part_ids = [
        r["part_identifier"]
        for r in relations
        if r["topic_identifier"] == topic["id"]
    ]
    chunks = [parts[pid] for pid in part_ids if pid in parts]

    # Build source material text (limit to 20 chunks to avoid context overflow)
    chunk_segments = []
    for c in chunks[:20]:
        part_id = c["id"]
        title = c.get("title", "")
        content = c.get("content", "")
        meta = c.get("content_metadata", {})

        if c.get("type") == "table" and meta:
            headers = meta.get("headers", [])
            num_rows = meta.get("num_rows", 0)
            num_cols = meta.get("num_cols", 0)
            caption = meta.get("caption", "Data table")
            header_str = f" — columns: {', '.join(headers)}" if headers else ""
            chunk_segments.append(
                f"[{part_id}] {title}\n"
                f"[TABLE: {caption} — {num_rows} rows × {num_cols} cols{header_str}]\n"
                f"{content}"
            )
        else:
            chunk_segments.append(f"[{part_id}] {title}\n{content}")

    chunk_text = "\n---\n".join(chunk_segments)

    # Compose hierarchical system prompt for this topic
    composed_prompt = compose_system_prompt(system_prompt, ancestors, topic)

    # Distribute records across prompt types
    distribution = distribute_across_prompt_types(records_per_topic)

    # Run all prompt-type calls in parallel (inner parallelism)
    all_items: list[tuple[str, list[dict]]] = []
    with ThreadPoolExecutor(max_workers=len(distribution)) as inner_pool:
        futures = {
            inner_pool.submit(
                _call_llm_for_type,
                prompt_type=pt,
                count=count,
                topic=topic,
                chunk_text=chunk_text,
                model=model,
                base_url=base_url,
                scripts_dir=scripts_dir,
                include_ground_truth=include_ground_truth,
            ): pt["name"]
            for pt, count in distribution
        }
        for future in as_completed(futures):
            type_name = futures[future]
            try:
                items = future.result()
                all_items.append((type_name, items))
            except Exception as e:
                print(
                    f"    [{type_name}] Exception: {e}",
                    file=sys.stderr,
                )

    # Build records from all collected items
    records: list[dict] = []
    record_idx = 0
    for type_name, items in all_items:
        for item in items:
            if isinstance(item, str):
                item = {"prompt": item, "ground_truth": ""}
            prompt_text = item.get("prompt", "")
            ground_truth = item.get("ground_truth", "")
            if not prompt_text or not prompt_text.strip():
                continue

            record_idx += 1
            messages = [
                {"role": "system", "content": composed_prompt},
                {"role": "user", "content": prompt_text},
            ]

            record: dict = {
                "messages": messages,
                "id": f"{topic['id']}-{record_idx:03d}",
                "topic": topic["id"],
                "source_parts": part_ids,
                "prompt_type": type_name,
            }
            if include_ground_truth and ground_truth and ground_truth.strip():
                record["ground_truth"] = ground_truth.strip()
            records.append(record)

    return records


def upload_records_batch(
    records: list[dict],
    workflow_id: str,
    gateway_url: str,
    scripts_dir: Path,
) -> bool:
    """Upload a batch of records to the gateway. Returns True on success."""
    if not records:
        return True

    with tempfile.NamedTemporaryFile(mode="w", suffix=".jsonl", delete=False) as tmp:
        for r in records:
            tmp.write(json.dumps(r) + "\n")
        tmp_path = tmp.name

    try:
        result = subprocess.run(
            [
                sys.executable,
                str(scripts_dir / "finetune.py"),
                "upload-records",
                "--workflow-id", workflow_id,
                "--file", tmp_path,
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(f"  Upload failed: {result.stderr[:200]}", file=sys.stderr)
            return False
        return True
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Generate training records from topics + knowledge")
    parser.add_argument("--topics", required=True, help="Path to topics.json")
    parser.add_argument("--relations", required=True, help="Path to relations.json")
    parser.add_argument("--knowledge-dir", required=True, help="Path to knowledge/ directory")
    parser.add_argument("--system-prompt", required=True, help="System prompt for all records")
    parser.add_argument("--output", required=True, help="Path to output training.jsonl")
    parser.add_argument(
        "--records-per-topic", type=int, default=25,
        help="Target records per leaf topic (default: 25). Equal across all topics unless --weight-by-source is set.",
    )
    parser.add_argument(
        "--min-per-topic", type=int, default=10,
        help="Minimum records per topic regardless of weighting (default: 10)",
    )
    parser.add_argument(
        "--max-per-topic", type=int, default=50,
        help="Maximum records per topic regardless of weighting (default: 50)",
    )
    parser.add_argument(
        "--weight-by-source", action="store_true",
        help="Weight record counts by number of linked source parts instead of equal distribution. "
             "Max imbalance ratio clamped to 3:1.",
    )
    parser.add_argument("--model", default="gpt-4o-mini", help="LLM model for generation (default: gpt-4o-mini)")
    parser.add_argument("--base-url", default="http://localhost:9090", help="Gateway base URL")
    parser.add_argument("--append", action="store_true", help="Append to existing file instead of overwriting")
    parser.add_argument("--no-ground-truth", action="store_true", help="Skip generating ground_truth excerpts")
    parser.add_argument(
        "--parallel", type=int, default=1,
        help="Number of topics to generate concurrently (default: 1, max: 8). "
             "Inner parallelism (prompt-type calls) is always on.",
    )
    parser.add_argument("--upload-incremental", action="store_true",
                        help="Upload each topic's records to gateway immediately after generation")
    parser.add_argument("--workflow-id", help="Workflow ID (required with --upload-incremental)")
    parser.add_argument("--gateway-url", default="http://localhost:9090", help="Gateway URL for incremental upload")
    args = parser.parse_args()

    if args.upload_incremental and not args.workflow_id:
        print("Error: --workflow-id required with --upload-incremental", file=sys.stderr)
        sys.exit(1)

    topics_path = Path(args.topics)
    relations_path = Path(args.relations)
    knowledge_dir = Path(args.knowledge_dir)
    output_path = Path(args.output)
    scripts_dir = Path(__file__).parent
    parallel = min(max(args.parallel, 1), 8)

    # Validate inputs
    for p, label in [(topics_path, "Topics"), (relations_path, "Relations")]:
        if not p.exists():
            print(f"Error: {label} file not found: {p}", file=sys.stderr)
            sys.exit(1)
    if not knowledge_dir.is_dir():
        print(f"Error: Knowledge directory not found: {knowledge_dir}", file=sys.stderr)
        sys.exit(1)

    # Load data
    topics = load_topics(topics_path)
    relations = load_relations(relations_path)
    parts = load_all_parts(knowledge_dir)
    leaves = find_leaf_topics(topics)
    topic_index = build_topic_index(topics)

    # Compute record counts per topic (equal by default, source-weighted with --weight-by-source)
    topic_counts = compute_topic_record_counts(
        leaves, relations, args.records_per_topic, args.min_per_topic, args.max_per_topic,
        weight_by_source=args.weight_by_source,
    )

    strategy = "weighted by source parts (max 3:1 ratio)" if args.weight_by_source else "equal"
    total_planned = sum(topic_counts.values())
    print(f"Loaded: {len(topics)} topics ({len(leaves)} leaves), {len(relations)} relations, {len(parts)} parts")
    print(f"Planned: {total_planned} records (target {args.records_per_topic}/topic, "
          f"range [{args.min_per_topic}, {args.max_per_topic}], distribution: {strategy})")
    for leaf in leaves:
        part_count = sum(1 for r in relations if r["topic_identifier"] == leaf["id"])
        print(f"  {leaf['name']}: {topic_counts[leaf['id']]} records ({part_count} source parts)")
    if parallel > 1:
        print(f"Outer parallelism: {parallel} topics | Inner parallelism: up to {len(PROMPT_TYPES)} calls/topic")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Prepare tasks: (index, topic, ancestors, records_count)
    tasks = []
    for i, topic in enumerate(leaves):
        ancestors = get_ancestor_chain(topic, topic_index)
        tasks.append((i, topic, ancestors, topic_counts[topic["id"]]))

    all_results: list[tuple[int, str, list[dict]]] = []
    failed_topics: list[str] = []
    upload_failures: list[str] = []

    write_lock = threading.Lock()
    total_records = 0
    uploaded_records = 0

    def _flush_records(records: list[dict], topic_id: str) -> None:
        """Write records to file and optionally upload to gateway."""
        nonlocal total_records, uploaded_records
        with write_lock:
            with output_path.open("a") as out:
                for r in records:
                    out.write(json.dumps(r) + "\n")
            total_records += len(records)

        if args.upload_incremental:
            ok = upload_records_batch(records, args.workflow_id, args.gateway_url, scripts_dir)
            if ok:
                with write_lock:
                    uploaded_records += len(records)
            else:
                upload_failures.append(topic_id)

    # Initialize output file (clear if not appending)
    if not args.append:
        output_path.open("w").close()

    common_kwargs = dict(
        relations=relations,
        parts=parts,
        system_prompt=args.system_prompt,
        model=args.model,
        base_url=args.base_url,
        scripts_dir=scripts_dir,
        include_ground_truth=not args.no_ground_truth,
    )

    if parallel <= 1:
        # Sequential mode (inner parallelism still active)
        for i, topic, ancestors, rpt in tasks:
            ancestor_path = " > ".join(a["name"] for a in ancestors)
            path_display = f"{ancestor_path} > {topic['name']}" if ancestors else topic["name"]
            print(f"[{i + 1}/{len(leaves)}] Generating {rpt} records for '{path_display}'...",
                  end=" ", flush=True)

            records = generate_for_topic(
                topic=topic, ancestors=ancestors, records_per_topic=rpt, **common_kwargs,
            )
            if not records:
                failed_topics.append(topic["id"])
                print("FAILED (0 records)")
            else:
                all_results.append((i, topic["id"], records))
                _flush_records(records, topic["id"])
                type_breakdown = {}
                for r in records:
                    t = r.get("prompt_type", "unknown")
                    type_breakdown[t] = type_breakdown.get(t, 0) + 1
                breakdown_str = ", ".join(f"{k}={v}" for k, v in sorted(type_breakdown.items()))
                upload_status = " (uploaded)" if args.upload_incremental else ""
                print(f"{len(records)} records [{breakdown_str}]{upload_status}")
    else:
        # Parallel mode (outer + inner)
        def _generate(task_tuple: tuple) -> tuple[int, str, str, int, list[dict]]:
            idx, topic, ancestors, rpt = task_tuple
            ancestor_path = " > ".join(a["name"] for a in ancestors)
            path_display = f"{ancestor_path} > {topic['name']}" if ancestors else topic["name"]
            records = generate_for_topic(
                topic=topic, ancestors=ancestors, records_per_topic=rpt, **common_kwargs,
            )
            return (idx, topic["id"], path_display, rpt, records)

        with ThreadPoolExecutor(max_workers=parallel) as executor:
            futures = {executor.submit(_generate, t): t for t in tasks}
            for future in as_completed(futures):
                idx, topic_id, path_display, rpt, records = future.result()
                if not records:
                    failed_topics.append(topic_id)
                    print(f"[{idx + 1}/{len(leaves)}] '{path_display}' (target {rpt}) FAILED (0 records)")
                else:
                    all_results.append((idx, topic_id, records))
                    _flush_records(records, topic_id)
                    type_breakdown = {}
                    for r in records:
                        t = r.get("prompt_type", "unknown")
                        type_breakdown[t] = type_breakdown.get(t, 0) + 1
                    breakdown_str = ", ".join(f"{k}={v}" for k, v in sorted(type_breakdown.items()))
                    upload_status = " (uploaded)" if args.upload_incremental else ""
                    print(f"[{idx + 1}/{len(leaves)}] '{path_display}' → "
                          f"{len(records)}/{rpt} records [{breakdown_str}]{upload_status}")

    # Summary
    print(f"\n{'='*60}")
    print(f"Generation complete: {total_records} records across "
          f"{len(leaves) - len(failed_topics)}/{len(leaves)} topics")
    print(f"Output: {output_path}")

    # Per-type summary
    type_totals: dict[str, int] = {}
    for _, _, records in all_results:
        for r in records:
            t = r.get("prompt_type", "unknown")
            type_totals[t] = type_totals.get(t, 0) + 1
    if type_totals:
        print(f"By prompt type: {', '.join(f'{k}={v}' for k, v in sorted(type_totals.items()))}")

    if args.upload_incremental:
        print(f"Uploaded: {uploaded_records} records to workflow {args.workflow_id}")
        if upload_failures:
            print(f"  Upload failed for {len(upload_failures)} topic(s): {upload_failures}")

    if failed_topics:
        print(f"\n{len(failed_topics)} topic(s) failed:")
        for t in failed_topics:
            print(f"  - {t}")
        print("Re-run with --append to retry failed topics.")
        sys.exit(1)
    else:
        print(f"\nAll {len(leaves)} topics generated successfully!")


if __name__ == "__main__":
    main()
