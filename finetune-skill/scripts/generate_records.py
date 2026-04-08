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
# ─────────────────────────────────────────────────────────────────────
# Prompt types — normal and hard mode variants
#
# Normal mode: balanced mix for initial generation (unknown difficulty)
# Hard mode: Evol-Instruct operators (arXiv:2304.12244) for generating
#   harder records that target the learnable zone (0.20-0.65 pass rate).
#   Reduces trivial records from ~60% to ~30% by:
#   1. Adding constraints (2+ conditions per question)
#   2. Requiring multi-step reasoning (not single fact recall)
#   3. Using indirect/alias information (not explicit names)
#   4. Increasing input complexity (more items, distractors)
# ─────────────────────────────────────────────────────────────────────

PROMPT_TYPES_NORMAL = [
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

PROMPT_TYPES_HARD = [
    {
        "name": "multi_step",
        "weight": 0.30,
        "temperature": 0.8,
        "instruction": (
            "Generate {n} user prompts that require MULTI-STEP REASONING. "
            "Each question must require combining 2 or more rules, facts, or conditions "
            "to arrive at the answer. The answer must NOT be obtainable from a single "
            "fact lookup. Frame as: 'Given X and Y, what is the combined effect?', "
            "'Does rule A still apply when condition B holds?', 'What changes when "
            "both C and D are true?'. Use specific details, not abstract placeholders."
        ),
    },
    {
        "name": "indirect",
        "weight": 0.25,
        "temperature": 0.9,
        "instruction": (
            "Generate {n} user prompts that use INDIRECT or ALIAS information. "
            "Do NOT use the obvious/common terms — use derived forms, trade names, "
            "technical synonyms, or functional descriptions instead. The model must "
            "know that the indirect term maps to the target concept. "
            "Frame as realistic inputs where the indirect form appears naturally "
            "(product labels, technical documents, recipes, specifications)."
        ),
    },
    {
        "name": "edge_case",
        "weight": 0.25,
        "temperature": 1.0,
        "instruction": (
            "Generate {n} user prompts covering EDGE CASES, EXCEPTIONS, and "
            "BOUNDARY conditions. Target situations where a general rule breaks down "
            "or where the answer is counterintuitive. Include: negation cases "
            "('which does NOT apply?'), exemptions ('when is this rule overridden?'), "
            "and confusable items ('is X actually a Y?'). These should be the hardest "
            "questions that are still answerable from the source material."
        ),
    },
    {
        "name": "complex_input",
        "weight": 0.20,
        "temperature": 0.85,
        "instruction": (
            "Generate {n} user prompts with COMPLEX INPUTS containing many items, "
            "distractors, and mixed signals. The input should have 10-20 items where "
            "only some are relevant. Include red herrings (items that look relevant but "
            "aren't) and buried targets (relevant items hidden among irrelevant ones). "
            "The model must carefully parse the full input, not just spot the obvious items."
        ),
    },
]

# Default to normal mode; --difficulty flag switches to hard
PROMPT_TYPES = PROMPT_TYPES_NORMAL


def load_topics(topics_path: Path) -> list[dict]:
    data = json.loads(topics_path.read_text())
    return data if isinstance(data, list) else data.get("topics", [])


def load_relations(relations_path: Path, topics: list[dict] | None = None) -> list[dict]:
    data = json.loads(relations_path.read_text())
    relations = data if isinstance(data, list) else data.get("relations", [])
    # Normalize key names: accept both topic_id/part_id and topic_identifier/part_identifier.
    # Agents may generate either format depending on how they read the schema.
    for r in relations:
        if "topic_id" in r and "topic_identifier" not in r:
            r["topic_identifier"] = r.pop("topic_id")
        if "part_id" in r and "part_identifier" not in r:
            r["part_identifier"] = r.pop("part_id")

    # Normalize topic_identifier: if relations use topic names instead of IDs,
    # remap to IDs so downstream matching works. Agents may write either format
    # (e.g., "Milk Detection" vs "milk-detection").
    if topics:
        name_to_id = {t["name"]: t["id"] for t in topics if "name" in t and "id" in t}
        for r in relations:
            tid = r.get("topic_identifier", "")
            if tid and tid not in {t["id"] for t in topics} and tid in name_to_id:
                r["topic_identifier"] = name_to_id[tid]

    return relations


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
    composed = " ".join(parts)

    # Warn if the composed prompt exceeds the 200-word guideline (target: 50-150 words).
    # Overly long system prompts waste token budget during training.
    word_count = len(composed.split())
    if word_count > 200:
        print(
            f"  ⚠ System prompt for '{leaf.get('name', leaf.get('id', '?'))}' is {word_count} words "
            f"(target: 50-150). Consider shortening topic system_prompt fields.",
            file=sys.stderr,
        )

    return composed


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

    Used by --enrich-sources: after the LLM generates a question,
    re-query the index with that question text to find sharper, question-specific
    source parts. Returns parts in the same format as load_all_parts() values.
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

def distribute_across_prompt_types(total: int, prompt_types: list[dict] | None = None) -> list[tuple[dict, int]]:
    """Distribute total records across prompt types by weight.

    Returns list of (prompt_type, count) with sum == total.
    For small totals (<5), collapses to fewer types to avoid 1-prompt calls.
    """
    if total <= 0:
        return []

    types_to_use = prompt_types if prompt_types is not None else PROMPT_TYPES
    # For very small counts, use fewer types to avoid many 1-item calls
    active_types = types_to_use if total >= 5 else types_to_use[:max(2, total)]

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

MAX_LLM_RETRIES = 2  # Retry once on transient failures (network, timeout, bad JSON)


def _call_llm_for_type(
    prompt_type: dict,
    count: int,
    topic: dict,
    chunk_text: str,
    model: str,
    base_url: str,
    scripts_dir: Path,
    include_ground_truth: bool,
    ground_truth_format: str | None = None,
    input_format: str | None = None,
) -> list[dict]:
    """Make one LLM call for a specific prompt type. Returns raw items.

    Retries up to MAX_LLM_RETRIES times on transient failures (network errors,
    timeouts, invalid JSON). Each retry is logged to stderr.
    """
    focus = topic.get("system_prompt", topic.get("name", ""))
    type_instruction = prompt_type["instruction"].format(n=count)

    # When ground_truth_format is set, every prompt must be answerable in that format.
    # Open-ended prompts ("Explain...", "Compare...") produce refusals when the model
    # is trained to output structured answers. Convert all prompt types to scenario-based.
    structured_constraint = ""
    if ground_truth_format:
        structured_constraint = f"""
CRITICAL: The model is trained to output ONLY structured answers in this format:
  {ground_truth_format}
Rules:
1. Every user_input MUST be a concrete scenario with specific values (names, numbers,
   dates, conditions) that can be answered in that exact format. Do NOT generate
   open-ended questions like "Explain...", "Describe...", "Compare..." — frame as
   specific cases.
2. The ground truth MUST use ONLY the exact vocabulary/values specified in the format
   above. If the format lists specific valid values (e.g., category names, status codes),
   use ONLY those values — never synonyms, alternative phrasings, or domain substitutes.
3. Each item in the ground truth should appear exactly once — no duplicates.
4. Do NOT use "OR" in the ground truth — pick the single correct answer.
"""

    input_constraint = ""
    if input_format:
        input_constraint = f"""
USER INPUT SHAPE (CRITICAL — strictly enforced):
  {input_format}
Every user_input MUST match this shape exactly. Do NOT add framing, do NOT rephrase
as a question unless the shape requires it, do NOT add narration unless the shape
allows it. The user_input is the literal content the model will see at inference time.
"""

    prompt = f"""{type_instruction}

Topic: {topic['name']}
Domain rules (from the topic's system prompt — these are critical constraints for the ground truth):
{focus}
{structured_constraint}{input_constraint}
Source material (each section is numbered [1], [2], etc.):
{chunk_text}

Each user_input must be realistic and grounded in the source material above.
Do NOT generate generic content — reference specific concepts, examples, or details from the source.
The ground truth MUST be consistent with both the domain rules above AND the source material values.

For each item, also provide:
- "ground_truth": {f'Answer in this exact format: {ground_truth_format}. CRITICAL RULES: (1) Every value (numbers, limits, thresholds, categories) MUST come directly from the source material — look them up, do NOT guess. If the source shows a special designation (like TT for treatment technique), use that exact designation. (2) COMPLETENESS: If the answer is a list, check EVERY input element independently. Do NOT stop after finding the first match. (3) Do NOT include explanations or source excerpts — only the structured answer.' if ground_truth_format else 'a concise excerpt from the source material that contains the information needed to answer. Keep it focused.'}
- "used_parts": an array of section numbers as strings (e.g., ["1", "3"]) — ONLY the specific sections from the source material above that this item is derived from. Most items should use 1-3 sections, not all of them.

Return JSON: {{"items": [{{"user_input": "the literal user message content matching the required shape", "ground_truth": "{'structured answer' if ground_truth_format else 'relevant source excerpt'}", "used_parts": ["1"]}}, ...]}}"""

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
                                    # "user_input" is the literal user message; the
                                    # generator should respect --input-format. The
                                    # old name "prompt" biased LLMs toward question
                                    # shapes regardless of the task.
                                    "user_input": {"type": "string"},
                                    "ground_truth": {"type": "string"},
                                    "used_parts": {
                                        "type": "array",
                                        "items": {"type": "string"},
                                    },
                                },
                                "required": ["user_input", "ground_truth", "used_parts"],
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

    last_error = ""
    for attempt in range(1, MAX_LLM_RETRIES + 1):
        result = subprocess.run(
            [sys.executable, str(chat_script), "--base-url", base_url],
            input=request_data,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            last_error = f"LLM call failed: {result.stderr[:200]}"
            if attempt < MAX_LLM_RETRIES:
                print(f"    [{prompt_type['name']}] {last_error} (retry {attempt}/{MAX_LLM_RETRIES - 1})", file=sys.stderr)
                continue
            print(f"    [{prompt_type['name']}] {last_error} (no retries left)", file=sys.stderr)
            return []

        try:
            response = json.loads(result.stdout)
        except json.JSONDecodeError:
            last_error = f"Invalid JSON: {result.stdout[:200]}"
            if attempt < MAX_LLM_RETRIES:
                print(f"    [{prompt_type['name']}] {last_error} (retry {attempt}/{MAX_LLM_RETRIES - 1})", file=sys.stderr)
                continue
            print(f"    [{prompt_type['name']}] {last_error} (no retries left)", file=sys.stderr)
            return []

        if isinstance(response, dict) and "error" in response:
            last_error = f"LLM error: {response['error']}"
            if attempt < MAX_LLM_RETRIES:
                print(f"    [{prompt_type['name']}] {last_error} (retry {attempt}/{MAX_LLM_RETRIES - 1})", file=sys.stderr)
                continue
            print(f"    [{prompt_type['name']}] {last_error} (no retries left)", file=sys.stderr)
            return []

        # Success. Normalize legacy key names so downstream code has a single
        # contract: each item has a "user_input" field.
        items = response.get("items", [])
        if not items:
            prompts = response.get("prompts", [])
            items = [{"user_input": p, "ground_truth": ""} for p in prompts]
        # Back-compat: accept "prompt" from older generators / caches
        for it in items:
            if "user_input" not in it and "prompt" in it:
                it["user_input"] = it.pop("prompt")

        if attempt > 1:
            print(f"    [{prompt_type['name']}] Succeeded on attempt {attempt}", file=sys.stderr)
        return items

    return []  # Should not reach here, but safety fallback


# ---------------------------------------------------------------------------
# Inline record validation (task-agnostic structural checks)
# ---------------------------------------------------------------------------
#
# This script is generic across finetune tasks (classification, extraction,
# QA, SQL generation, code completion, ...). The ONLY safe deterministic
# checks here are structural: empty messages, missing roles, malformed shape.
# Anything task-specific (format, vocabulary, label consistency, question vs
# narrative) must be enforced by the task's grader — not by this generator.


def _validate_record(
    record: dict,
    topic: dict,
    ground_truth_format: str | None,
    input_format: str | None = None,
) -> str | None:
    """Validate a generated record structurally. Returns rejection reason or None.

    Only universal checks — missing/empty user message, malformed shape.

    Note: `input_format` is intentionally NOT enforced here. Its purpose is
    to shape the generator's prompt (so it produces the right kind of
    records), not to do post-hoc keyword filtering. Enforcement via keywords
    is fragile and task-specific:
    - "no questions" is wrong for QA tasks
    - "contains the data" requires semantic understanding
    - Phrasing diversity (question/statement/narrative with the same data)
      is GOOD training signal and should NOT be filtered.

    Records whose user message doesn't actually contain the data the GT
    references will be caught by the grader at training time: the model
    can't extract what isn't there, so those records score low and get
    filtered or hardened by the downstream pipeline.
    """
    messages = record.get("messages", [])
    if not isinstance(messages, list) or not messages:
        return "no messages"

    user_msg = ""
    for m in messages:
        if isinstance(m, dict) and m.get("role") == "user":
            user_msg = (m.get("content") or "").strip()
            break

    if not user_msg:
        return "empty user message"

    return None


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
    ground_truth_format: str | None = None,
    input_format: str | None = None,
    rag_parts: list[dict] | None = None,
    workflow_id: str | None = None,
    enrich_sources: bool = False,
    topic_prompt_types: list[dict] | None = None,
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

    # Guard: skip topics with no source material. Generating without context
    # produces hallucinated questions — the same problem as blind-question-first
    # (arXiv:2509.25736). Better to skip and warn than produce bad data.
    if not chunks:
        print(
            f"  ⚠ SKIPPED topic '{topic.get('name', topic['id'])}': "
            f"no source parts found (0 relations, 0 RAG parts). "
            f"Add relations via relation-builder or use --use-rag.",
            file=sys.stderr,
        )
        return []

    # Build source material text with numbered labels for reliable LLM tagging.
    # Full IDs like "irs-pub596-earned-income-credit-2025-p-016" are too long for
    # the LLM to reproduce accurately in used_parts. We label each section with
    # [1], [2], etc. and maintain a map back to full IDs.
    chunk_segments = []
    alias_to_id: dict[str, str] = {}
    for idx, c in enumerate(chunks[:20]):
        label = str(idx + 1)
        alias_to_id[label] = c["id"]
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
                f"[{label}] {title}\n"
                f"[TABLE: {caption} — {num_rows} rows × {num_cols} cols{header_str}]\n"
                f"{content}"
            )
        else:
            chunk_segments.append(f"[{label}] {title}\n{content}")

    chunk_text = "\n---\n".join(chunk_segments)

    # Compose hierarchical system prompt for this topic
    composed_prompt = compose_system_prompt(system_prompt, ancestors, topic)

    # Over-request by 20% to compensate for LLM under-delivery and empty-prompt
    # filtering, then trim to exact target. This is the standard approach used by
    # Magpie (ICLR 2025) and NeMo — over-generate + trim is simpler and more
    # reliable than retry loops, with negligible extra cost at 1.2x.
    OVER_REQUEST_RATIO = 1.2
    request_count = math.ceil(records_per_topic * OVER_REQUEST_RATIO)
    distribution = distribute_across_prompt_types(request_count, prompt_types=topic_prompt_types)

    # Run all prompt-type calls in parallel (inner parallelism)
    all_items: list[tuple[str, list[dict]]] = []
    failed_types: list[str] = []
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
                ground_truth_format=ground_truth_format,
                input_format=input_format,
            ): pt["name"]
            for pt, count in distribution
        }
        for future in as_completed(futures):
            type_name = futures[future]
            try:
                items = future.result()
                if items:
                    all_items.append((type_name, items))
                else:
                    failed_types.append(type_name)
            except Exception as e:
                failed_types.append(type_name)
                print(
                    f"    [{type_name}] Exception: {e}",
                    file=sys.stderr,
                )

    if failed_types:
        print(
            f"  ⚠ Topic '{topic.get('name', topic['id'])}': {len(failed_types)} prompt type(s) "
            f"failed after retries: {', '.join(failed_types)}",
            file=sys.stderr,
        )

    # Build records from all collected items
    all_source_parts = part_ids + rag_part_ids
    records: list[dict] = []
    record_idx = 0
    rejected_count = 0

    # Cache for --enrich-sources: avoid redundant gateway calls for similar questions
    # within the same topic. Key = frozenset of first 6 significant words, value = [part IDs].
    enrich_cache: dict[frozenset, list[str]] = {}

    def _enrich_key(text: str) -> frozenset:
        """Extract key words from question for cache lookup."""
        words = [w.lower() for w in text.split() if len(w) > 3][:6]
        return frozenset(words)

    for type_name, items in all_items:
        for item in items:
            if isinstance(item, str):
                item = {"user_input": item, "ground_truth": "", "used_parts": []}
            # Back-compat: old items may still use "prompt"
            prompt_text = item.get("user_input") or item.get("prompt", "")
            ground_truth = item.get("ground_truth", "")
            if not prompt_text or not prompt_text.strip():
                continue

            record_idx += 1

            # Map LLM's short aliases (S1, S2, ...) back to real part IDs.
            # Falls back to all source parts if LLM didn't tag or returned invalid aliases.
            raw_used = item.get("used_parts", [])
            resolved_used = [alias_to_id[alias] for alias in raw_used if alias in alias_to_id]
            record_source_parts = resolved_used if resolved_used else list(all_source_parts)

            # Enrich sources: re-query with the generated question for sharper context.
            # Uses a per-topic cache to avoid redundant gateway calls for similar questions.
            if enrich_sources and workflow_id:
                cache_key = _enrich_key(prompt_text)
                if cache_key in enrich_cache:
                    # Use cached results, filtering out already-present parts
                    cached_ids = [pid for pid in enrich_cache[cache_key] if pid not in set(record_source_parts)]
                    record_source_parts.extend(cached_ids)
                else:
                    q_parts = retrieve_parts_by_phrase(
                        phrase=prompt_text,
                        workflow_id=workflow_id,
                        base_url=base_url,
                        top_k=5,
                        existing_part_ids=set(record_source_parts),
                    )
                    enriched_ids = [p["id"] for p in q_parts] if q_parts else []
                    enrich_cache[cache_key] = enriched_ids
                    record_source_parts.extend(enriched_ids)

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

            # Inline validation: reject records that fail deterministic quality checks.
            # Catches format violations before they reach training.jsonl.
            rejection = _validate_record(record, topic, ground_truth_format, input_format)
            if rejection:
                rejected_count += 1
                if rejected_count <= 10:
                    print(f"    ⚠ Rejected record: {rejection} | user: {prompt_text[:60]}...", file=sys.stderr)
                continue

            records.append(record)

    if rejected_count:
        print(f"  ℹ Rejected {rejected_count} record(s) inline (format/quality validation)", file=sys.stderr)

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
                "--base-url", gateway_url,
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
        "--ground-truth-format", default=None,
        help="Override default ground_truth instruction. Describe the expected format, e.g. "
             "'Structured answer: Eligible. EIC: $[amount] or Not eligible. Reason: [rule]'. "
             "When set, ground truths are generated in this format instead of source excerpts.",
    )
    parser.add_argument(
        "--input-format", default=None,
        help="Describe the expected SHAPE of the user message (the training input). "
             "Injected into the generator prompt so the LLM produces records that match "
             "the task at inference time. Example for extraction tasks:\n"
             "  'The user message MUST contain the literal data the model should extract "
             "from (e.g. the ingredient list itself). The phrasing can be a raw list, a "
             "question containing the list, or a narrative mentioning the list — any is "
             "fine. Do NOT generate records that ask the model to recall/imagine data '\n"
             "  'from world knowledge (e.g. \"what is in a cookie?\" is wrong because the "
             "data isn't literally present).'\n"
             "Shape is enforced via generator prompting, not post-hoc keyword filtering. "
             "Records that still slip through are caught by the grader at training time.",
    )
    parser.add_argument(
        "--parallel", type=int, default=1,
        help="Number of topics to generate concurrently (default: 1, max: 8). "
             "Inner parallelism (prompt-type calls) is always on.",
    )
    parser.add_argument("--upload-incremental", action="store_true",
                        help="Upload each topic's records to gateway immediately after generation")
    parser.add_argument("--workflow-id", help="Workflow ID (required with --upload-incremental, --use-rag, and --enrich-sources)")
    parser.add_argument("--gateway-url", default="http://localhost:9090", help="Gateway URL for incremental upload")
    parser.add_argument("--use-rag", action="store_true",
                        help="Augment relations with RAG-retrieved knowledge parts via semantic search")
    parser.add_argument("--rag-top-k", type=int, default=15,
                        help="Number of RAG results to retrieve per topic (default: 15)")
    parser.add_argument("--rag-only", action="store_true",
                        help="Use only RAG retrieval, skip relations.json entirely (requires --use-rag)")
    parser.add_argument("--enrich-sources", action="store_true",
                        help="After generating each question, re-query the knowledge index with the question "
                             "text to enrich source_parts with question-specific matches (requires --workflow-id)")
    parser.add_argument("--difficulty", choices=["normal", "hard", "adaptive"], default="normal",
                        help="Difficulty mode for generation (default: normal). "
                             "'hard': Evol-Instruct operators for harder records (arXiv:2304.12244). "
                             "'adaptive': per-topic difficulty from --eval-scores (easy topics get hard mode).")
    parser.add_argument("--probe-and-rewrite", action="store_true",
                        help="After generation, run K=1 probe on base model and rewrite trivial records "
                             "(score > 0.85) to be harder. Requires --workflow-id. (arXiv:2505.17063: +2.6pp)")
    parser.add_argument("--probe-model", default=None,
                        help="Base model for --probe-and-rewrite probing (default: Qwen3.5-4B). "
                             "Defaults to 4B (largest) as conservative filter — if 4B aces a record, "
                             "it's trivial for all models. Override with a specific model after Step 7b.")
    args = parser.parse_args()

    if args.upload_incremental and not args.workflow_id:
        print("Error: --workflow-id required with --upload-incremental", file=sys.stderr)
        sys.exit(1)
    if args.use_rag and not args.workflow_id:
        print("Error: --workflow-id required with --use-rag", file=sys.stderr)
        sys.exit(1)
    if args.enrich_sources and not args.workflow_id:
        print("Error: --workflow-id required with --enrich-sources", file=sys.stderr)
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
    if args.difficulty == "adaptive" and not args.eval_scores:
        print("Error: --eval-scores required with --difficulty adaptive", file=sys.stderr)
        sys.exit(1)
    if args.probe_and_rewrite and not args.workflow_id:
        print("Error: --workflow-id required with --probe-and-rewrite", file=sys.stderr)
        sys.exit(1)

    # Apply difficulty mode globally
    # Priority 1: --difficulty flag controls prompt type selection
    global PROMPT_TYPES
    if args.difficulty == "hard":
        PROMPT_TYPES = PROMPT_TYPES_HARD
        print(f"Difficulty mode: HARD (Evol-Instruct operators, targeting learnable zone 0.20-0.65)")
    elif args.difficulty == "adaptive":
        # Will be applied per-topic below — default to normal, override per topic
        PROMPT_TYPES = PROMPT_TYPES_NORMAL
        print(f"Difficulty mode: ADAPTIVE (per-topic based on eval scores)")
    else:
        PROMPT_TYPES = PROMPT_TYPES_NORMAL
        print(f"Difficulty mode: NORMAL")

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
    relations = load_relations(relations_path, topics) if relations_path else []
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
    # Pre-flight: check relations coverage for every leaf topic
    uncovered_topics = []
    for leaf in leaves:
        part_count = sum(1 for r in relations if r["topic_identifier"] == leaf["id"])
        if part_count == 0:
            uncovered_topics.append(leaf)
    if uncovered_topics and not getattr(args, 'rag_only', False):
        print(f"\n⚠ WARNING: {len(uncovered_topics)} leaf topic(s) have ZERO relations (no source material):")
        for t in uncovered_topics:
            print(f"  - {t['name']} ({t['id']})")
        if not getattr(args, 'use_rag', False) and not args.enrich_sources:
            print("  These topics will be SKIPPED. Add relations via relation-builder or use --use-rag.")
        elif getattr(args, 'use_rag', False):
            print("  Will attempt RAG retrieval for these topics.")
        print()

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
    existing_topics: set[str] = set()
    if not args.append:
        output_path.open("w").close()
    elif output_path.exists():
        # In append mode, detect topics already present in the output file
        # to avoid regenerating them (prevents duplicates after crash+retry).
        with output_path.open() as f:
            for line in f:
                try:
                    rec = json.loads(line)
                    existing_topics.add(rec.get("topic", ""))
                except json.JSONDecodeError:
                    pass
        if existing_topics:
            original_count = len(tasks)
            tasks = [t for t in tasks if t[1]["id"] not in existing_topics]
            skipped = original_count - len(tasks)
            print(
                f"Append mode: skipping {skipped} topic(s) already in {output_path.name}: "
                f"{', '.join(sorted(existing_topics))}",
                file=sys.stderr,
            )

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
        ground_truth_format=getattr(args, 'ground_truth_format', None),
        input_format=getattr(args, 'input_format', None),
    )
    if getattr(args, 'use_rag', False) or args.enrich_sources:
        common_kwargs["workflow_id"] = args.workflow_id
    if args.enrich_sources:
        common_kwargs["enrich_sources"] = True

    # Priority 3: Per-topic difficulty targeting (adaptive mode)
    # Easy topics (base model >0.70) get hard-mode prompts;
    # hard topics (base model <0.30) get normal prompts;
    # medium topics get normal with higher edge_case weight.
    topic_difficulty_modes: dict[str, list[dict]] = {}
    if args.difficulty == "adaptive" and eval_scores:
        for leaf in leaves:
            tid = leaf["id"]
            score = eval_scores.get(tid, 0.5)
            if score > 0.70:
                topic_difficulty_modes[tid] = PROMPT_TYPES_HARD
                print(f"  {tid}: HARD mode (base score={score:.2f} > 0.70)")
            elif score < 0.30:
                topic_difficulty_modes[tid] = PROMPT_TYPES_NORMAL
                print(f"  {tid}: NORMAL mode (base score={score:.2f} < 0.30)")
            else:
                topic_difficulty_modes[tid] = PROMPT_TYPES_NORMAL
                print(f"  {tid}: NORMAL mode (base score={score:.2f})")

    # Pass per-topic prompt types into common_kwargs for generate_for_topic
    def _get_topic_prompt_types(topic_id: str) -> list[dict] | None:
        if args.difficulty == "adaptive" and topic_id in topic_difficulty_modes:
            return topic_difficulty_modes[topic_id]
        return None  # Use global PROMPT_TYPES

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
                rag_parts=topic_rag_parts,
                topic_prompt_types=_get_topic_prompt_types(topic["id"]),
                **common_kwargs,
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
                rag_parts=topic_rag_parts,
                topic_prompt_types=_get_topic_prompt_types(topic["id"]),
                **common_kwargs,
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

    # Per-topic summary table
    topic_record_counts: dict[str, int] = {}
    topic_type_counts: dict[str, dict[str, int]] = {}
    topic_source_counts: dict[str, int] = {}
    for _, topic_id, records in all_results:
        topic_record_counts[topic_id] = len(records)
        type_counts: dict[str, int] = {}
        source_ids: set[str] = set()
        for r in records:
            t = r.get("prompt_type", "unknown")
            type_counts[t] = type_counts.get(t, 0) + 1
            source_ids.update(r.get("source_parts", []))
        topic_type_counts[topic_id] = type_counts
        topic_source_counts[topic_id] = len(source_ids)

    if topic_record_counts:
        print(f"\n{'Topic':<40} {'Target':>6} {'Got':>5} {'Sources':>7} {'Prompt Types'}")
        print("-" * 90)
        for leaf in leaves:
            tid = leaf["id"]
            target = topic_counts.get(tid, 0)
            got = topic_record_counts.get(tid, 0)
            sources = topic_source_counts.get(tid, 0)
            types = topic_type_counts.get(tid, {})
            type_str = ", ".join(f"{k}={v}" for k, v in sorted(types.items())) if types else "SKIPPED"
            status = " ⚠" if got < target else ""
            print(f"  {leaf['name']:<38} {target:>6} {got:>5} {sources:>7}   {type_str}{status}")

    # Per-type summary
    type_totals: dict[str, int] = {}
    for _, _, records in all_results:
        for r in records:
            t = r.get("prompt_type", "unknown")
            type_totals[t] = type_totals.get(t, 0) + 1
    if type_totals:
        print(f"\nBy prompt type: {', '.join(f'{k}={v}' for k, v in sorted(type_totals.items()))}")

    if args.upload_incremental:
        print(f"Uploaded: {uploaded_records} records to workflow {args.workflow_id}")
        if upload_failures:
            print(f"  Upload failed for {len(upload_failures)} topic(s): {upload_failures}")

    # Auto-journal milestone
    from pipeline_journal import find_project_dir, log_milestone
    proj = find_project_dir(output_path)
    if proj:
        difficulty_mode = "hard" if args.difficulty == "hard" else ("adaptive" if args.difficulty == "adaptive" else "normal")
        log_milestone(proj, "step_4_generation", "generate_stage1", "completed",
                       f"Generated {total_records} records across {len(leaves) - len(failed_topics)}/{len(leaves)} topics. "
                       f"Mode: {difficulty_mode}. Uploaded: {uploaded_records}.",
                       {"total_records": total_records, "topics_succeeded": len(leaves) - len(failed_topics),
                        "topics_failed": len(failed_topics), "uploaded": uploaded_records,
                        "per_topic": topic_record_counts, "prompt_types": type_totals,
                        "difficulty_mode": difficulty_mode})

    if failed_topics:
        print(f"\n{len(failed_topics)} topic(s) failed:")
        for t in failed_topics:
            print(f"  - {t}")
        print("Re-run with --append to retry failed topics.")
        sys.exit(1)

    # Priority 2: Probe-and-rewrite — quick K=1 check + rewrite trivials before upload
    # This is the pre-eval version of harden-records (arXiv:2505.17063: +2.6pp).
    # Runs the base model on each record, rewrites those scoring >0.85.
    if args.probe_and_rewrite and total_records > 0:
        import requests as req_lib

        print(f"\n── Probe-and-Rewrite (--probe-and-rewrite) ──")
        print(f"Probing {total_records} records with base model (K=1)...")

        # Load all generated records
        all_records = []
        with open(output_path) as f:
            for line in f:
                line = line.strip()
                if line:
                    all_records.append(json.loads(line))

        trivials = []
        for rec in all_records:
            messages = rec.get("messages", [])
            gt = rec.get("ground_truth", "")
            if not messages or not gt:
                continue

            # Quick K=1 probe: send to base model, score with grader
            system_msg = ""
            user_msg = ""
            for m in messages:
                if m.get("role") == "system":
                    system_msg = m.get("content", "")
                elif m.get("role") == "user":
                    user_msg = m.get("content", "")

            try:
                # Get base model response
                probe_resp = req_lib.post(
                    f"{args.base_url}/v1/chat/completions",
                    json={
                        "model": getattr(args, "probe_model", None) or "Qwen3.5-4B",
                        "messages": [{"role": "system", "content": system_msg}, {"role": "user", "content": user_msg}],
                        "temperature": 0.0,
                        "max_tokens": 200,
                    },
                    timeout=30,
                )
                probe_resp.raise_for_status()
                model_output = probe_resp.json()["choices"][0]["message"]["content"].strip()

                # Score through grader
                score_resp = req_lib.post(
                    f"{args.base_url}/finetune/workflows/{args.workflow_id}/evaluate",
                    json={"row": {
                        "messages": messages + [{"role": "assistant", "content": model_output}],
                        "ground_truth": gt,
                    }},
                    timeout=30,
                )
                score_resp.raise_for_status()
                score_data = score_resp.json()
                score = score_data.get("score", score_data.get("result", {}).get("score", 0))

                if score is not None and score > 0.85:
                    trivials.append(rec)
            except Exception:
                continue

        print(f"  Probed: {len(all_records)} records, {len(trivials)} trivial (>{0.85})")

        if trivials:
            print(f"  Rewriting {len(trivials)} trivial records to be harder...")
            rewritten = 0
            for rec in trivials:
                user_msg = ""
                system_msg = ""
                for m in rec.get("messages", []):
                    if m.get("role") == "user":
                        user_msg = m.get("content", "")
                    elif m.get("role") == "system":
                        system_msg = m.get("content", "")

                gt = rec.get("ground_truth", "")
                try:
                    rewrite_resp = req_lib.post(
                        f"{args.base_url}/v1/chat/completions",
                        json={
                            "model": "gpt-4.1-mini",
                            "messages": [
                                {"role": "system", "content": "Create a harder variant of this question. Keep the same correct answer but make the question require deeper reasoning or indirect knowledge."},
                                {"role": "user", "content": f"Question: {user_msg}\nCorrect answer: {gt}\n\nCreate a harder variant. Return ONLY the new question."},
                            ],
                            "temperature": 0.7,
                            "max_tokens": 500,
                        },
                        timeout=30,
                    )
                    rewrite_resp.raise_for_status()
                    new_user_msg = rewrite_resp.json()["choices"][0]["message"]["content"].strip()
                    if new_user_msg and len(new_user_msg) > 10:
                        # Add as new variant (keep original)
                        new_rec = {
                            "messages": [{"role": "system", "content": system_msg}, {"role": "user", "content": new_user_msg}],
                            "id": f"{rec.get('id', 'unknown')}-hard",
                            "topic": rec.get("topic", ""),
                            "source_parts": rec.get("source_parts", []),
                            "ground_truth": gt,
                            "hardened_from": rec.get("id", ""),
                        }
                        all_records.append(new_rec)
                        rewritten += 1
                except Exception:
                    continue

            # Write back with harder variants added
            with open(output_path, "w") as f:
                for rec in all_records:
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")

            print(f"  Added {rewritten} harder variants. Total: {len(all_records)} records.")
            print(f"  Trivial%: ~{len(trivials) / len(all_records) * 100:.0f}% → ~{len(trivials) / len(all_records) * 100 * len(trivials) / (len(trivials) + rewritten):.0f}% (estimated)")

    print(f"\nAll {len(leaves)} topics generated successfully!")


if __name__ == "__main__":
    main()
