# /// script
# requires-python = ">=3.10"
# ///
"""
trace_topics.py — Stage 2: build a two-level topic hierarchy from
training records.

Level 0 (roots): **Agent identity** — derived from the normalized
system prompt. Each distinct agent (system prompt) becomes one root
topic. Multi-agent OTel datasets naturally produce multiple roots;
single-agent datasets produce one.

Level 1 (leaves): **Tool-call pattern** — within each root, records
are grouped by the tool(s) called at the decision point. Single-tool
records produce a leaf named after the tool; parallel-call records
(Pattern D) produce a leaf named after the sorted set of tools.

This replaces the earlier flat "one leaf per tool schema entry"
approach, which assumed a single global tool schema and failed on
multi-agent datasets (99.97% topic miss rate on Nemotron).

The per-record `tools` array (for training JSONL) is unchanged — it's
the union of all tools actually called, attached to every record.

Usage:
    python3 trace_topics.py training.jsonl \\
        --topic-hierarchy-output hierarchy.json \\
        --per-record-tools-output tools.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path


# ─── System prompt normalization ──────────────────────────────────────────────


def _extract_identity_sentence(text: str) -> str:
    """Extract the first sentence of the system prompt.

    The first sentence typically declares the agent's role and is
    stable across sessions ("You are a customer service agent for
    ShopSmart."). Everything after that is dynamic context injection
    (dates, user IDs, session tokens) that varies per conversation.
    """
    # Split on sentence boundaries (period followed by space or end)
    first = text.split(".")[0].strip()
    return first + "." if first else ""


# Minimal patterns stripped from the identity sentence to handle
# numbers/IDs that leak into the role declaration itself (e.g.,
# "employee count: 2,847"). Generic — no domain-specific patterns.
_IDENTITY_STRIP_PATTERNS = [
    re.compile(r"\b\d{1,3}(?:,\d{3})+\b"),  # comma-separated numbers
    re.compile(r"\b\d{4,}\b"),  # long numeric IDs
    re.compile(r"\([^)]*\d[^)]*\)"),  # parenthetical with numbers
]


def normalize_system_prompt(text: str) -> str:
    """Extract the agent identity from a system prompt for grouping.

    Uses the **first sentence** as the identity key — this is where
    agents declare their role ("You are a X for Y."). The rest of
    the prompt is dynamic context (dates, user IDs, etc.) that varies
    per session.

    Only strips numbers/IDs from the first sentence to handle edge
    cases like "employee count: 2,847" embedded in the role line.
    No domain-specific patterns — works on any OTel dataset.
    """
    identity = _extract_identity_sentence(text)
    for pat in _IDENTITY_STRIP_PATTERNS:
        identity = pat.sub("", identity)
    return re.sub(r"\s+", " ", identity).strip()


def _prompt_hash(normalized: str) -> str:
    """Short hash for a normalized prompt (for dedup keys)."""
    return hashlib.sha256(normalized.encode()).hexdigest()[:12]


_ROLE_PATTERN = re.compile(
    r"You are (?:a |an )?(.+?)(?:\.|,|for\b)", re.IGNORECASE
)


def _extract_agent_label(raw_prompt: str) -> str:
    """Extract a short agent label from the system prompt.

    Tries "You are a/an <role>" first, falls back to the first
    sentence (truncated to 60 chars).
    """
    match = _ROLE_PATTERN.search(raw_prompt)
    if match:
        label = match.group(1).strip()
        # Title case, cap length
        return label[:60].title() if label else "Agent"
    # Fallback: first sentence
    first_sentence = raw_prompt.split(".")[0].strip()
    return first_sentence[:60] if first_sentence else "Agent"


# ─── Record introspection ────────────────────────────────────────────────────


def _record_system_prompt(record: dict) -> str:
    """Extract the system prompt text from a training record."""
    for msg in record.get("messages") or []:
        if msg.get("role") == "system":
            return msg.get("content") or ""
    return ""


def _extract_gt_tool_calls(record: dict) -> list[dict]:
    """Extract ground-truth tool calls from a record.

    Checks `ground_truth` field first (GRPO format: GT stored separately,
    messages end with user turn), falls back to last assistant message (legacy).
    """
    import json as _json
    gt_raw = record.get("ground_truth")
    if gt_raw is not None:
        parsed = _json.loads(gt_raw) if isinstance(gt_raw, str) else gt_raw
        return parsed if isinstance(parsed, list) else []
    for msg in reversed(record.get("messages") or []):
        if msg.get("role") != "assistant":
            continue
        return msg.get("tool_calls") or []
    return []


def _record_tool_pattern(record: dict) -> str:
    """Extract the tool-call pattern from a training record.

    Returns the sorted, comma-separated tool names from the ground truth
    tool calls. Single-tool records return just the tool name;
    parallel-call records return "tool_a, tool_b".
    """
    tool_calls = _extract_gt_tool_calls(record)
    names = sorted(
        tc.get("function", {}).get("name", "?") for tc in tool_calls
    )
    return ", ".join(names) if names else ""


def _record_first_tool_name(record: dict) -> str | None:
    """First tool_call name from the ground truth.

    Used for topic assignment in the publish flow.
    """
    tool_calls = _extract_gt_tool_calls(record)
    if tool_calls:
        return tool_calls[0].get("function", {}).get("name")
    return None


# ─── Tool schema helpers (for per-record tools array) ────────────────────────


def _tool_name(tool: dict) -> str | None:
    """Extract the tool name from a tool schema entry."""
    if not isinstance(tool, dict):
        return None
    if tool.get("type") == "function" and isinstance(tool.get("function"), dict):
        return tool["function"].get("name")
    return tool.get("name")


# ─── Functional category classification ─────────────────────────────────────

# Verb keywords mapped to semantic categories.  Scanned in ALL word
# positions so that both ``get_weather`` and ``weather_get`` match.
# Order matters: first match wins.  Categories are based on ToolACE's
# 30-domain taxonomy and BFCL's call-complexity axis (arXiv:2409.00920,
# gorilla.cs.berkeley.edu/blogs/8_berkeley_function_calling_leaderboard).
_CATEGORY_KEYWORDS: list[tuple[str, list[str]]] = [
    ("search",    ["search", "find", "query", "lookup", "browse", "filter",
                   "autocomplete", "suggest"]),
    ("get",       ["get", "fetch", "retrieve", "read", "load", "show",
                   "view", "details", "info", "detail"]),
    ("list",      ["list", "all", "categories", "index", "catalog"]),
    ("create",    ["create", "add", "insert", "register", "new", "post",
                   "submit", "write"]),
    ("update",    ["update", "set", "edit", "modify", "change", "patch",
                   "rename"]),
    ("delete",    ["delete", "remove", "cancel", "clear", "unsubscribe"]),
    ("calculate", ["calculate", "compute", "estimate", "convert", "count",
                   "sum", "average", "total"]),
    ("analyze",   ["analyze", "summarize", "extract", "parse", "process",
                   "classify", "sentiment", "analysis"]),
    ("generate",  ["generate", "random", "create_random", "synthesize",
                   "produce"]),
    ("send",      ["send", "notify", "publish", "email", "message", "alert",
                   "broadcast"]),
    ("check",     ["check", "verify", "validate", "test", "confirm",
                   "exists", "available"]),
    ("book",      ["book", "order", "reserve", "schedule", "subscribe",
                   "appointment"]),
    ("download",  ["download", "upload", "export", "import", "transfer"]),
    ("auth",      ["login", "authenticate", "authorize", "sign", "token",
                   "oauth"]),
]

# Domain keywords — matched if no verb category matches.
_DOMAIN_KEYWORDS: list[tuple[str, list[str]]] = [
    ("weather",   ["weather", "forecast", "climate", "temperature"]),
    ("finance",   ["stock", "price", "currency", "exchange", "market",
                   "balance", "payment", "transaction", "invoice"]),
    ("geo",       ["location", "address", "geocode", "map", "place",
                   "airport", "city", "country", "region", "zip"]),
    ("media",     ["image", "photo", "video", "audio", "media", "qr",
                   "barcode"]),
    ("social",    ["social", "hashtag", "tweet", "post", "follower",
                   "profile", "user"]),
    ("news",      ["news", "article", "headline", "feed", "trending"]),
    ("food",      ["recipe", "food", "restaurant", "menu", "nutrition",
                   "diet", "meal", "keto"]),
    ("sports",    ["sport", "match", "team", "league", "player", "score",
                   "game", "fixture"]),
    ("travel",    ["hotel", "flight", "travel", "airline", "booking",
                   "trip", "tour"]),
    ("health",    ["health", "medical", "drug", "pharmacy", "symptom",
                   "diagnosis", "bmi"]),
    ("comms",     ["sms", "phone", "call", "contact", "chat",
                   "conversation"]),
]

# Minimum records per leaf topic.  Leaves below this threshold are
# merged into an "other" catch-all within the same agent.  Value chosen
# so that GRPO with K=8 has a reasonable chance of non-zero variance
# across multiple training steps (ToolRLA recommends ≥400/stratum;
# we use a much lower floor because individual tool topics are narrower
# than their "scenario complexity" strata).
MIN_RECORDS_PER_LEAF = 5


def _classify_tool(tool_name: str) -> str:
    """Classify a tool name into a functional category.

    Scans all underscore-separated words for keyword matches.
    Returns the category name or "other".
    """
    words = set(tool_name.lower().replace("-", "_").split("_"))

    # Try verb categories first (action-oriented)
    for category, keywords in _CATEGORY_KEYWORDS:
        if words & set(keywords):
            return category

    # Fall back to domain categories
    for category, keywords in _DOMAIN_KEYWORDS:
        if words & set(keywords):
            return category

    return "other"


# ─── Two-level hierarchy builder ─────────────────────────────────────────────


def build_topic_hierarchy(
    records: list[dict],
    agent_root_name: str = "Root",
) -> dict:
    """Build a two-level topic hierarchy from training records.

    Level 0: agent identity (normalized system prompt).
    Level 1: functional category — tools grouped by verb/domain keyword
    (e.g., "search", "get", "calculate", "weather", "finance").

    Leaf topics with fewer than MIN_RECORDS_PER_LEAF records are merged
    into an "other" catch-all within the same agent.

    Rationale: ToolACE (arXiv:2409.00920) uses 30 semantic domains for
    26K APIs; one-topic-per-tool explodes with diverse datasets and
    produces zero-variance GRPO groups (arXiv:2509.21880).

    Returns::

        {
          "name": "Root",
          "children": [
            {
              "name": "Customer Service Agent",
              "description": "You are a customer service agent...",
              "prompt_hash": "a1b2c3d4e5f6",
              "children": [
                {"name": "search", "record_count": 715},
                {"name": "get", "record_count": 1671},
                {"name": "other", "record_count": 42},
              ]
            },
            ...
          ]
        }
    """
    # Group records: prompt_hash → {label, description, categories}
    agents: dict[str, dict] = {}
    agent_order: list[str] = []

    for record in records:
        raw_prompt = _record_system_prompt(record)
        normalized = normalize_system_prompt(raw_prompt)
        ph = _prompt_hash(normalized) if normalized else "__no_prompt__"

        if ph not in agents:
            agent_order.append(ph)
            label = (
                _extract_agent_label(raw_prompt) if raw_prompt else "Unknown Agent"
            )
            agents[ph] = {
                "label": label,
                "description": raw_prompt[:200] if raw_prompt else "",
                "prompt_hash": ph,
                "categories": {},  # category_name → count
            }

        # Classify by the primary tool (first in sorted parallel set)
        pattern = _record_tool_pattern(record)
        if not pattern:
            continue
        primary_tool = pattern.split(", ")[0].strip()
        category = _classify_tool(primary_tool)

        agents[ph]["categories"][category] = (
            agents[ph]["categories"].get(category, 0) + 1
        )

    # Build the hierarchy, merging small categories into "other"
    children = []
    for ph in agent_order:
        agent = agents[ph]
        cats = agent["categories"]

        # Separate above-threshold from below-threshold
        leaves = []
        other_count = 0
        for cat, count in sorted(cats.items(), key=lambda x: -x[1]):
            if cat == "other" or count < MIN_RECORDS_PER_LEAF:
                other_count += count
            else:
                leaves.append({"name": cat, "record_count": count})

        if other_count > 0:
            leaves.append({"name": "other", "record_count": other_count})

        # Sort by record_count descending for readability
        leaves.sort(key=lambda x: -x["record_count"])

        children.append({
            "name": agent["label"],
            "description": agent["description"],
            "prompt_hash": agent["prompt_hash"],
            "children": leaves,
        })

    return {"name": agent_root_name, "children": children}


def flatten_hierarchy_leaves(hierarchy: dict) -> list[dict]:
    """Flatten a two-level hierarchy into a list of leaves.

    Each leaf gets a ``full_path`` field: ``"AgentLabel / pattern"``,
    used as the unique topic name for gateway upload and record
    assignment. Also includes ``parent_name`` for the root topic.
    """
    leaves: list[dict] = []
    for agent in hierarchy.get("children", []):
        agent_name = agent.get("name", "Agent")
        for child in agent.get("children", []):
            leaves.append({
                "name": child["name"],
                "full_path": f"{agent_name} / {child['name']}",
                "parent_name": agent_name,
                "record_count": child.get("record_count", 0),
            })
    return leaves


# ─── Record → topic assignment ───────────────────────────────────────────────


def build_record_topic_index(
    records: list[dict],
) -> dict[int, str]:
    """Build a mapping from record index → topic full_path.

    Returns ``{record_index: "AgentLabel / category"}`` for every
    record. Records with no tool calls map to ``None`` (excluded).

    Must stay in sync with ``build_topic_hierarchy`` — both use
    ``_classify_tool`` on the primary tool name.
    """
    # First pass: build the hierarchy to know which categories survive
    # the MIN_RECORDS_PER_LEAF threshold (small ones merge into "other").
    hierarchy = build_topic_hierarchy(records)
    surviving: dict[str, set[str]] = {}  # prompt_hash → set of category names
    for agent in hierarchy.get("children", []):
        ph = agent.get("prompt_hash", "")
        surviving[ph] = {c["name"] for c in agent.get("children", [])}

    # Second pass: assign each record
    index: dict[int, str | None] = {}
    for i, record in enumerate(records):
        raw_prompt = _record_system_prompt(record)
        normalized = normalize_system_prompt(raw_prompt)
        ph = _prompt_hash(normalized) if normalized else "__no_prompt__"
        label = (
            _extract_agent_label(raw_prompt) if raw_prompt else "Unknown Agent"
        )
        pattern = _record_tool_pattern(record)
        if not pattern:
            index[i] = None
            continue

        primary_tool = pattern.split(", ")[0].strip()
        category = _classify_tool(primary_tool)

        # If this category was merged into "other" by the hierarchy builder
        alive = surviving.get(ph, set())
        if category not in alive:
            category = "other"

        index[i] = f"{label} / {category}"
    return index


# ─── Per-record tools array (training concept) ──────────────────────────────


def count_records_per_tool(records: list[dict]) -> dict[str, int]:
    """Count how many training records call each tool.

    For Pattern D (parallel) records, every tool_call in the set
    increments its respective tool's count. Refusal records don't
    contribute.
    """
    counts: dict[str, int] = {}
    for record in records:
        tool_calls = _extract_gt_tool_calls(record)
        for tc in tool_calls:
            fn = tc.get("function") or {}
            name = fn.get("name")
            if name:
                counts[name] = counts.get(name, 0) + 1
    return counts


def build_per_record_tools_array(
    tool_schema: list[dict],
    record_counts: dict[str, int],
) -> list[dict]:
    """Build the per-record ``tools`` array (training concept).

    Include ONLY tools that were called at least once. Preserves
    first-seen order from ``tool_schema``.
    """
    by_name: dict[str, dict] = {}
    order: list[str] = []
    for tool in tool_schema:
        name = _tool_name(tool)
        if not name:
            continue
        if name not in by_name:
            order.append(name)
        by_name[name] = tool

    return [by_name[name] for name in order if record_counts.get(name, 0) > 0]


# ─── Top-level convenience ──────────────────────────────────────────────────


def build_both(
    tool_schema: list[dict],
    records: list[dict],
    agent_root_name: str = "Root",
) -> tuple[dict, list[dict]]:
    """Top-level convenience: build hierarchy + per-record tools array.

    Returns ``(topic_hierarchy, per_record_tools)``.
      - ``topic_hierarchy``: two-level (agent → pattern) from records
      - ``per_record_tools``: union of tools actually called (from schema)
    """
    hierarchy = build_topic_hierarchy(records, agent_root_name=agent_root_name)
    record_counts = count_records_per_tool(records)
    per_record = build_per_record_tools_array(tool_schema, record_counts)
    return hierarchy, per_record


def load_jsonl(path: Path) -> list[dict]:
    """Load a JSONL file into a list of dicts."""
    records: list[dict] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        records.append(json.loads(line))
    return records


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build topic hierarchy + per-record tools array from training records"
    )
    parser.add_argument(
        "tool_schema", type=Path, help="Tool schema JSON file (union of all per-trace schemas)"
    )
    parser.add_argument(
        "records", type=Path, help="Training records JSONL (from otel_distill.py)"
    )
    parser.add_argument(
        "--agent-name",
        default="Root",
        help="Root topic name (default: 'Root')",
    )
    parser.add_argument(
        "--topic-hierarchy-output",
        type=Path,
        required=True,
        help="Output JSON for the topic hierarchy",
    )
    parser.add_argument(
        "--per-record-tools-output",
        type=Path,
        required=True,
        help="Output JSON for the per-record tools array (training concept)",
    )
    args = parser.parse_args()

    if not args.tool_schema.exists():
        print(f"error: tool schema not found: {args.tool_schema}", file=sys.stderr)
        return 2
    if not args.records.exists():
        print(f"error: records not found: {args.records}", file=sys.stderr)
        return 2

    tool_schema = json.loads(args.tool_schema.read_text())
    if not isinstance(tool_schema, list):
        print("error: tool schema must be a JSON array", file=sys.stderr)
        return 2

    records = load_jsonl(args.records)
    hierarchy, per_record_tools = build_both(
        tool_schema, records, agent_root_name=args.agent_name
    )

    args.topic_hierarchy_output.parent.mkdir(parents=True, exist_ok=True)
    args.topic_hierarchy_output.write_text(
        json.dumps(hierarchy, indent=2, ensure_ascii=False)
    )
    args.per_record_tools_output.parent.mkdir(parents=True, exist_ok=True)
    args.per_record_tools_output.write_text(
        json.dumps(per_record_tools, indent=2, ensure_ascii=False)
    )

    agent_count = len(hierarchy.get("children", []))
    leaf_count = sum(
        len(agent.get("children", []))
        for agent in hierarchy.get("children", [])
    )
    used_tools = len(per_record_tools)
    print(
        f"topic hierarchy: {agent_count} agents, {leaf_count} patterns → "
        f"{args.topic_hierarchy_output}"
    )
    print(
        f"per-record tools: {used_tools} tools → {args.per_record_tools_output}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
