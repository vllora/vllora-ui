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
    """Load all parts from {doc-slug}/knowledge_parts.json files, keyed by part ID.

    Also loads relevance labels from all-parts-index.json if available.
    Parts marked as irrelevant (relevant=False) are excluded.
    """
    parts: dict[str, dict] = {}
    pattern = str(knowledge_dir / "*" / "knowledge_parts.json")
    for kp_file in sorted(glob.glob(pattern)):
        try:
            data = json.loads(Path(kp_file).read_text())
            for p in data.get("parts", []):
                parts[p["id"]] = p
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Warning: Failed to load {kp_file}: {e}", file=sys.stderr)

    # Load relevance labels from all-parts-index.json if it exists
    index_path = knowledge_dir / "all-parts-index.json"
    if index_path.exists():
        try:
            index_data = json.loads(index_path.read_text())
            index_parts = index_data.get("parts", index_data) if isinstance(index_data, dict) else index_data
            relevance_map = {p["id"]: p.get("relevant") for p in index_parts if "id" in p}

            # Filter out irrelevant parts
            before_count = len(parts)
            parts = {pid: p for pid, p in parts.items() if relevance_map.get(pid) is not False}
            excluded = before_count - len(parts)
            if excluded > 0:
                print(f"  Filtered out {excluded} irrelevant parts (relevant=false in all-parts-index.json)")
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Warning: Failed to load relevance labels from {index_path}: {e}", file=sys.stderr)

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
    """Compose a hierarchical system prompt: root persona + narrowing context from ancestors + leaf focus.

    Structure:
      - Root prompt: persona and general behavior ("You are a... You should...")
      - Domain (ancestor): narrows the field — ONLY what's new beyond the root
      - Skill (leaf): specific focus area — the exact capability being practiced

    Each child level adds ONLY what the parent doesn't already say.
    The result reads as one coherent instruction, not a list of fragments.
    Target: 50-150 words total.
    """
    # Start with the root persona (this is the only "You are..." statement)
    parts = [root_prompt.rstrip(".") + "."]

    # Add ancestor context — each narrows the scope
    for ancestor in ancestors:
        segment = ancestor.get("system_prompt", "")
        if segment:
            parts.append(segment.rstrip(".") + ".")

    # Add leaf focus — the specific skill being practiced
    leaf_segment = leaf.get("system_prompt", "")
    if leaf_segment:
        parts.append(leaf_segment.rstrip(".") + ".")
    else:
        parts.append(f"Focus on: {leaf['name']}.")

    # Join as a single flowing paragraph instead of separate blocks
    return " ".join(parts)


def build_search_query(topic: dict, ancestors: list[dict]) -> str:
    """Construct a search query from topic metadata for RAG retrieval.

    Combines ancestor names, topic name, and system_prompt to give
    hierarchical context to the semantic search.
    """
    parts = [a["name"] for a in ancestors]
    parts.append(topic["name"])
    if topic.get("system_prompt"):
        parts.append(topic["system_prompt"])
    return " ".join(parts)


def retrieve_rag_parts(
    topic: dict,
    ancestors: list[dict],
    workflow_id: str,
    base_url: str,
    top_k: int = 15,
    existing_part_ids: set[str] | None = None,
) -> list[dict]:
    """Retrieve relevant knowledge parts via the gateway semantic search API.

    Returns parts in the same format as load_all_parts() values.
    Deduplicates against existing_part_ids (from relations.json).
    On failure, prints a warning and returns an empty list.
    """
    import requests  # PEP 723 dependency, available via `uv run`

    query = build_search_query(topic, ancestors)

    try:
        resp = requests.post(
            f"{base_url}/finetune/workflows/{workflow_id}/knowledge/search",
            json={"phrase": query, "top_k": top_k},
            timeout=30,
        )
        resp.raise_for_status()
        matches = resp.json().get("matches", [])
    except (requests.RequestException, ValueError) as e:
        print(f"  Warning: RAG search failed for topic '{topic['id']}': {e}", file=sys.stderr)
        return []

    existing = existing_part_ids or set()
    rag_parts = []
    for m in matches:
        part = m.get("part", {})
        part_id = part.get("id", "")
        if part_id in existing:
            continue
        # Skip parts marked irrelevant (relevance label stored in extraction_metadata)
        ext_meta = part.get("extraction_metadata")
        if isinstance(ext_meta, dict) and ext_meta.get("relevant") is False:
            continue
        rag_parts.append({
            "id": part_id,
            "title": part.get("title", ""),
            "content": part.get("content", ""),
            "type": part.get("type", "text"),
            "content_metadata": part.get("content_metadata"),
        })

    return rag_parts


def retrieve_parts_by_phrase(
    phrase: str,
    workflow_id: str,
    base_url: str,
    top_k: int = 5,
    existing_part_ids: set[str] | None = None,
) -> list[dict]:
    """Retrieve knowledge parts by a raw search phrase (e.g. a generated question).

    Used for the second retrieval pass: after the LLM generates a question,
    re-query the index with that question text to get sharper, question-specific
    context. Returns parts in the same format as load_all_parts() values.
    """
    import requests  # PEP 723 dependency, available via `uv run`

    try:
        resp = requests.post(
            f"{base_url}/finetune/workflows/{workflow_id}/knowledge/search",
            json={"phrase": phrase, "top_k": top_k},
            timeout=30,
        )
        resp.raise_for_status()
        matches = resp.json().get("matches", [])
    except (requests.RequestException, ValueError) as e:
        print(f"  Warning: second RAG search failed: {e}", file=sys.stderr)
        return []

    existing = existing_part_ids or set()
    parts = []
    for m in matches:
        part = m.get("part", {})
        part_id = part.get("id", "")
        if part_id in existing:
            continue
        # Skip parts marked irrelevant (relevance label stored in extraction_metadata)
        ext_meta = part.get("extraction_metadata")
        if isinstance(ext_meta, dict) and ext_meta.get("relevant") is False:
            continue
        parts.append({
            "id": part_id,
            "title": part.get("title", ""),
            "content": part.get("content", ""),
            "type": part.get("type", "text"),
            "content_metadata": part.get("content_metadata"),
        })

    return parts


# ---------------------------------------------------------------------------
# Topic record allocation
# ---------------------------------------------------------------------------

def load_eval_scores(eval_scores_path: Path) -> dict[str, float]:
    """Load per-topic average eval scores from a JSON file.

    Expected format: {"topic_id": avg_score, ...} where scores are 0.0-1.0.
    Can also accept a list of {topic, avg_score} objects.
    """
    data = json.loads(eval_scores_path.read_text())
    if isinstance(data, list):
        return {item["topic"]: item["avg_score"] for item in data}
    return data


def classify_difficulty(avg_score: float) -> str:
    """Classify a topic's difficulty based on base model eval score.

    Hard = model gets 0-30% (most learning signal for GRPO).
    Medium = model gets 30-70% (good variance).
    Easy = model gets 70-100% (quickly becomes zero-variance).

    Based on arXiv:2508.14094 ("Hard Examples Are All You Need"):
    training on hardest 10% yields 47% gains vs 3-15% for easy.
    """
    if avg_score <= 0.3:
        return "hard"
    if avg_score <= 0.7:
        return "medium"
    return "easy"


# Default difficulty weights (arXiv:2508.14094, arXiv:2509.21880)
# Hard topics get the most records because GRPO learning signal is strongest there.
# Easy topics get fewer because they quickly become zero-variance (zero gradient).
DIFFICULTY_WEIGHTS = {
    "hard": 0.45,    # 40-50% of total records
    "medium": 0.35,  # 30-40% of total records
    "easy": 0.20,    # 10-20% of total records
}


def compute_topic_record_counts(
    leaves: list[dict],
    relations: list[dict],
    records_per_topic: int,
    min_per_topic: int,
    max_per_topic: int,
    weight_by_source: bool = False,
    weight_by_difficulty: bool = False,
    eval_scores: dict[str, float] | None = None,
) -> dict[str, int]:
    """Compute per-topic record counts.

    Default: equal distribution — every leaf topic gets ``records_per_topic``.

    With ``weight_by_difficulty=True`` + ``eval_scores``: distributes based on
    base model performance. Hard topics (0-30% success) get 40-50% of records,
    medium (30-70%) get 30-40%, easy (70-100%) get 10-20%. This maximizes GRPO
    learning signal (arXiv:2508.14094: hard examples yield 47% gains;
    arXiv:2509.21880: 30-99% of easy prompts become zero-variance).
    Topics without eval scores default to "medium" difficulty.

    With ``weight_by_source=True``: proportional to linked source parts
    (legacy behaviour). Max imbalance ratio is clamped to 3:1.

    Results are always clamped to [min_per_topic, max_per_topic].
    """
    if weight_by_difficulty:
        # Classify each topic by difficulty
        topic_difficulty: dict[str, str] = {}
        for leaf in leaves:
            score = (eval_scores or {}).get(leaf["id"])
            if score is not None:
                topic_difficulty[leaf["id"]] = classify_difficulty(score)
            else:
                topic_difficulty[leaf["id"]] = "medium"  # default if no eval data

        # Group topics by difficulty tier
        tiers: dict[str, list[str]] = {"hard": [], "medium": [], "easy": []}
        for leaf in leaves:
            tiers[topic_difficulty[leaf["id"]]].append(leaf["id"])

        # Calculate total records budget
        total_budget = records_per_topic * len(leaves)

        # Allocate budget per tier, then distribute within tier
        result: dict[str, int] = {}
        for tier, weight in DIFFICULTY_WEIGHTS.items():
            tier_topics = tiers[tier]
            if not tier_topics:
                continue

            tier_budget = round(total_budget * weight)
            per_topic = max(1, round(tier_budget / len(tier_topics)))

            for topic_id in tier_topics:
                result[topic_id] = max(min_per_topic, min(per_topic, max_per_topic))

        # Ensure all leaves have an entry (edge case: empty tier reassignment)
        for leaf in leaves:
            if leaf["id"] not in result:
                result[leaf["id"]] = max(min_per_topic, min(records_per_topic, max_per_topic))

        return result

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

    result = {}
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

Source material (each section is labeled with a part ID like [p-001]):
{chunk_text}

Each prompt must be a realistic question/request grounded in the source material above.
Do NOT generate generic questions — reference specific concepts, examples, or details from the source.

For each prompt, also provide:
- "ground_truth": a concise excerpt from the source material that contains the information needed to answer the question. Keep it focused — complete enough to verify a correct answer, but not the entire source.
- "used_parts": an array of part IDs (e.g., ["p-001", "p-003"]) — ONLY the specific parts from the source material above that this question is derived from. Most questions should use 1-3 parts, not all of them.

Return JSON: {{"items": [{{"prompt": "the question", "ground_truth": "relevant source excerpt", "used_parts": ["p-001"]}}, ...]}}"""

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
                                    "used_parts": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                },
                                "required": ["prompt", "ground_truth", "used_parts"],
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
    rag_parts: list[dict] | None = None,
    workflow_id: str | None = None,
    second_retrieval: bool = False,
) -> list[dict]:
    """Generate records for a single leaf topic via multiple parallel LLM calls."""
    # Find parts linked to this topic
    part_ids = [
        r["part_identifier"]
        for r in relations
        if r["topic_identifier"] == topic["id"]
    ]
    chunks = [parts[pid] for pid in part_ids if pid in parts]

    # Append RAG-retrieved parts (already deduplicated by caller)
    rag_part_ids = []
    if rag_parts:
        rag_part_ids = [p["id"] for p in rag_parts]
        chunks.extend(rag_parts)

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

    # Over-request by 20% to compensate for LLM under-delivery and empty-prompt
    # filtering, then trim to exact target. This is the standard approach used by
    # Magpie (ICLR 2025) and NeMo — over-generate + trim is simpler and more
    # reliable than retry loops, with negligible extra cost at 1.2x.
    OVER_REQUEST_RATIO = 1.2
    request_count = math.ceil(records_per_topic * OVER_REQUEST_RATIO)
    distribution = distribute_across_prompt_types(request_count)

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
    all_source_parts = part_ids + rag_part_ids
    records: list[dict] = []
    record_idx = 0
    for type_name, items in all_items:
        for item in items:
            if isinstance(item, str):
                item = {"prompt": item, "ground_truth": "", "used_parts": []}
            prompt_text = item.get("prompt", "")
            ground_truth = item.get("ground_truth", "")
            if not prompt_text or not prompt_text.strip():
                continue

            record_idx += 1

            # Use per-record used_parts from LLM, validated against known part_ids + RAG parts.
            # Falls back to all source parts if LLM didn't provide or returned invalid.
            raw_used = item.get("used_parts", [])
            all_known_ids = set(all_source_parts)
            validated_used = [pid for pid in raw_used if pid in all_known_ids]
            record_source_parts = validated_used if validated_used else list(all_source_parts)

            # Second retrieval: re-query with the generated question for sharper context
            if second_retrieval and workflow_id:
                q_parts = retrieve_parts_by_phrase(
                    phrase=prompt_text,
                    workflow_id=workflow_id,
                    base_url=base_url,
                    top_k=5,
                    existing_part_ids=set(record_source_parts),
                )
                if q_parts:
                    record_source_parts.extend([p["id"] for p in q_parts])

            messages = [
                {"role": "system", "content": composed_prompt},
                {"role": "user", "content": prompt_text},
            ]

            record: dict = {
                "messages": messages,
                "id": f"{topic['id']}-{record_idx:03d}-{hash(prompt_text) % 10000:04d}",
                "topic": topic["id"],
                "source_parts": record_source_parts,
                "prompt_type": type_name,
            }
            if include_ground_truth and ground_truth and ground_truth.strip():
                record["ground_truth"] = ground_truth.strip()
            records.append(record)

    # Trim to exact target (we over-requested by 20%).
    # If we still fell short, warn but return what we have.
    if len(records) > records_per_topic:
        records = records[:records_per_topic]
    elif len(records) < records_per_topic:
        shortfall = records_per_topic - len(records)
        print(
            f"  ⚠ Topic '{topic['name']}': generated {len(records)}/{records_per_topic} "
            f"(shortfall: {shortfall}). Use --append to retry.",
            file=sys.stderr,
        )

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
                "--base-url", base_url,
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
    parser.add_argument("--relations", default=None, help="Path to relations.json (optional with --rag-only)")
    parser.add_argument("--knowledge-dir", default=None, help="Path to knowledge/ directory (optional with --rag-only)")
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
        "--weight-by-difficulty", action="store_true",
        help="Weight record counts by base model difficulty. Hard topics (0-30%% success) get 40-50%% "
             "of records, medium (30-70%%) get 30-40%%, easy (70-100%%) get 10-20%%. "
             "Requires --eval-scores. Based on arXiv:2508.14094.",
    )
    parser.add_argument(
        "--eval-scores",
        help="Path to per-topic eval scores JSON (required with --weight-by-difficulty). "
             'Format: {"topic_id": avg_score, ...} where scores are 0.0-1.0.',
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
    parser.add_argument("--workflow-id", help="Workflow ID (required with --upload-incremental and --use-rag)")
    parser.add_argument("--gateway-url", default="http://localhost:9090", help="Gateway URL for incremental upload")
    parser.add_argument("--use-rag", action="store_true",
                        help="Augment relations with RAG-retrieved knowledge parts via semantic search")
    parser.add_argument("--rag-top-k", type=int, default=15,
                        help="Number of RAG results to retrieve per topic (default: 15)")
    parser.add_argument("--rag-only", action="store_true",
                        help="Use only RAG retrieval, skip relations.json entirely (requires --use-rag)")
    parser.add_argument("--rag-second-retrieval", action="store_true",
                        help="After generating each question, re-query the knowledge index with the question "
                             "text to get sharper, question-specific source_parts (requires --use-rag)")
    args = parser.parse_args()

    if args.upload_incremental and not args.workflow_id:
        print("Error: --workflow-id required with --upload-incremental", file=sys.stderr)
        sys.exit(1)
    if args.use_rag and not args.workflow_id:
        print("Error: --workflow-id required with --use-rag", file=sys.stderr)
        sys.exit(1)
    if args.rag_only and not args.use_rag:
        print("Error: --rag-only requires --use-rag", file=sys.stderr)
        sys.exit(1)
    if not args.rag_only and not args.relations:
        print("Error: --relations is required (unless using --rag-only)", file=sys.stderr)
        sys.exit(1)
    if not args.rag_only and not args.knowledge_dir:
        print("Error: --knowledge-dir is required (unless using --rag-only)", file=sys.stderr)
        sys.exit(1)

    if args.weight_by_difficulty and not args.eval_scores:
        print("Error: --eval-scores required with --weight-by-difficulty", file=sys.stderr)
        sys.exit(1)

    topics_path = Path(args.topics)
    relations_path = Path(args.relations) if args.relations else None
    knowledge_dir = Path(args.knowledge_dir) if args.knowledge_dir else None
    output_path = Path(args.output)
    scripts_dir = Path(__file__).parent
    parallel = min(max(args.parallel, 1), 8)

    # Validate inputs
    if not topics_path.exists():
        print(f"Error: Topics file not found: {topics_path}", file=sys.stderr)
        sys.exit(1)
    if relations_path and not relations_path.exists():
        print(f"Error: Relations file not found: {relations_path}", file=sys.stderr)
        sys.exit(1)
    if knowledge_dir and not knowledge_dir.is_dir():
        print(f"Error: Knowledge directory not found: {knowledge_dir}", file=sys.stderr)
        sys.exit(1)

    # Load data
    topics = load_topics(topics_path)
    relations = load_relations(relations_path) if relations_path else []
    parts = load_all_parts(knowledge_dir) if knowledge_dir else {}
    leaves = find_leaf_topics(topics)
    topic_index = build_topic_index(topics)

    # Load eval scores if difficulty-weighted distribution requested
    eval_scores: dict[str, float] | None = None
    if args.eval_scores:
        eval_scores_path = Path(args.eval_scores)
        if not eval_scores_path.exists():
            print(f"Error: Eval scores file not found: {eval_scores_path}", file=sys.stderr)
            sys.exit(1)
        eval_scores = load_eval_scores(eval_scores_path)

    # Compute record counts per topic
    topic_counts = compute_topic_record_counts(
        leaves, relations, args.records_per_topic, args.min_per_topic, args.max_per_topic,
        weight_by_source=args.weight_by_source,
        weight_by_difficulty=args.weight_by_difficulty,
        eval_scores=eval_scores,
    )

    if args.weight_by_difficulty:
        strategy = "weighted by difficulty (hard: 45%, medium: 35%, easy: 20%)"
    elif args.weight_by_source:
        strategy = "weighted by source parts (max 3:1 ratio)"
    else:
        strategy = "equal"
    total_planned = sum(topic_counts.values())
    print(f"Loaded: {len(topics)} topics ({len(leaves)} leaves), {len(relations)} relations, {len(parts)} parts")
    print(f"Planned: {total_planned} records (target {args.records_per_topic}/topic, "
          f"range [{args.min_per_topic}, {args.max_per_topic}], distribution: {strategy})")
    for leaf in leaves:
        part_count = sum(1 for r in relations if r["topic_identifier"] == leaf["id"])
        difficulty_info = ""
        if args.weight_by_difficulty and eval_scores:
            score = eval_scores.get(leaf["id"])
            if score is not None:
                tier = classify_difficulty(score)
                difficulty_info = f", {tier} (score: {score:.2f})"
            else:
                difficulty_info = ", medium (no eval data)"
        print(f"  {leaf['name']}: {topic_counts[leaf['id']]} records ({part_count} source parts{difficulty_info})")
    if getattr(args, 'use_rag', False):
        mode_label = "RAG-only" if args.rag_only else "relations + RAG"
        print(f"RAG enabled ({mode_label}, top_k={args.rag_top_k})")
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

    def _get_rag_parts(topic: dict, ancestors: list[dict]) -> list[dict] | None:
        """Retrieve RAG parts for a topic if --use-rag is enabled."""
        if not getattr(args, 'use_rag', False):
            return None
        relation_part_ids = {
            r["part_identifier"]
            for r in relations
            if r["topic_identifier"] == topic["id"]
        } if not args.rag_only else None
        return retrieve_rag_parts(
            topic=topic,
            ancestors=ancestors,
            workflow_id=args.workflow_id,
            base_url=args.base_url,
            top_k=args.rag_top_k,
            existing_part_ids=relation_part_ids,
        )

    common_kwargs = dict(
        relations=relations,
        parts=parts,
        system_prompt=args.system_prompt,
        model=args.model,
        base_url=args.base_url,
        scripts_dir=scripts_dir,
        include_ground_truth=not args.no_ground_truth,
    )
    if getattr(args, 'use_rag', False):
        common_kwargs["workflow_id"] = args.workflow_id
        common_kwargs["second_retrieval"] = getattr(args, 'rag_second_retrieval', False)

    if parallel <= 1:
        # Sequential mode (inner parallelism still active)
        for i, topic, ancestors, rpt in tasks:
            ancestor_path = " > ".join(a["name"] for a in ancestors)
            path_display = f"{ancestor_path} > {topic['name']}" if ancestors else topic["name"]
            print(f"[{i + 1}/{len(leaves)}] Generating {rpt} records for '{path_display}'...",
                  end=" ", flush=True)

            topic_rag_parts = _get_rag_parts(topic, ancestors)
            if topic_rag_parts:
                print(f"(RAG: +{len(topic_rag_parts)} parts) ", end="", flush=True)

            records = generate_for_topic(
                topic=topic, ancestors=ancestors, records_per_topic=rpt,
                rag_parts=topic_rag_parts, **common_kwargs,
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
            topic_rag_parts = _get_rag_parts(topic, ancestors)
            records = generate_for_topic(
                topic=topic, ancestors=ancestors, records_per_topic=rpt,
                rag_parts=topic_rag_parts, **common_kwargs,
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
