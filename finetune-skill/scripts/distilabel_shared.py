# /// script
# dependencies = ["requests>=2.31"]
# ///
"""Shared helpers for Step 4 backends.

This module centralizes the local artifact contracts used by the native,
NeMo, and distilabel-backed generation paths so new backends can consume the
same `finetune-project/` state without inventing new source files.
"""

from __future__ import annotations

import glob
import importlib.util
import json
import math
import os
import sys
from copy import deepcopy
from pathlib import Path

import requests

DEFAULT_DISTILABEL_CONFIG: dict[str, object] = {
    "model": "gpt-4o-mini",
    "base_url": "http://localhost:9090/v1",
    "keep_intermediate": True,
    "text_recipe": "instruction_backtranslation_deita",
    "tool_recipe": "apigen",
    "apigen_tool_module": None,
    "min_records_per_topic": 25,
    "target_records_per_topic": 30,
}

SUPPORTED_TEXT_RECIPES = {"instruction_backtranslation_deita"}
SUPPORTED_TOOL_RECIPES = {"apigen"}

DIFFICULTY_WEIGHTS = {
    "hard": 0.45,
    "medium": 0.35,
    "easy": 0.20,
}


def load_project_config(config_path: Path) -> dict:
    if not config_path.exists():
        return {}
    return json.loads(config_path.read_text())


def resolve_generation_backend(config: dict | None) -> str:
    if not config:
        return "native"
    explicit = config.get("generation_backend")
    if isinstance(explicit, str) and explicit:
        return explicit
    if config.get("use_nemo") is True:
        return "nemo"
    return "native"


def _deep_merge(base: dict, override: dict) -> dict:
    result = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def get_distilabel_config(config: dict | None) -> dict:
    config = config or {}
    override = config.get("distilabel")
    if isinstance(override, dict):
        return _deep_merge(DEFAULT_DISTILABEL_CONFIG, override)
    return deepcopy(DEFAULT_DISTILABEL_CONFIG)


def validate_distilabel_config(settings: dict) -> None:
    text_recipe = str(settings.get("text_recipe", ""))
    if text_recipe not in SUPPORTED_TEXT_RECIPES:
        print(
            "Error: unsupported distilabel text recipe "
            f"'{text_recipe}'. Supported values: {', '.join(sorted(SUPPORTED_TEXT_RECIPES))}.",
            file=sys.stderr,
        )
        sys.exit(1)

    tool_recipe = str(settings.get("tool_recipe", ""))
    if tool_recipe not in SUPPORTED_TOOL_RECIPES:
        print(
            "Error: unsupported distilabel tool recipe "
            f"'{tool_recipe}'. Supported values: {', '.join(sorted(SUPPORTED_TOOL_RECIPES))}.",
            file=sys.stderr,
        )
        sys.exit(1)


def ensure_distilabel_available() -> None:
    if importlib.util.find_spec("distilabel") is None:
        print(
            "Error: distilabel is not installed.\n"
            "Install it with one of:\n"
            '  pip install "distilabel>=1.5"\n'
            '  pip install "distilabel @ git+https://github.com/argilla-io/distilabel.git@develop" --upgrade',
            file=sys.stderr,
        )
        sys.exit(1)


def ensure_workspace(project_dir: Path, keep_intermediate: bool = True) -> Path:
    workspace = project_dir / "distilabel"
    workspace.mkdir(parents=True, exist_ok=True)
    if not keep_intermediate:
        for child in workspace.iterdir():
            if child.is_file():
                child.unlink()
    return workspace


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def read_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    if not path.exists():
        return rows
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def read_jsonl_with_raw(path: Path) -> list[tuple[str, dict]]:
    rows: list[tuple[str, dict]] = []
    if not path.exists():
        return rows
    with path.open(encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.rstrip("\n")
            if not line.strip():
                continue
            rows.append((line, json.loads(line)))
    return rows


def load_topics(topics_path: Path) -> list[dict]:
    data = json.loads(topics_path.read_text())
    return data if isinstance(data, list) else data.get("topics", [])


def load_relations(relations_path: Path, topics: list[dict] | None = None) -> list[dict]:
    data = json.loads(relations_path.read_text())
    relations = data if isinstance(data, list) else data.get("relations", [])

    for row in relations:
        if "topic_id" in row and "topic_identifier" not in row:
            row["topic_identifier"] = row.pop("topic_id")
        if "part_id" in row and "part_identifier" not in row:
            row["part_identifier"] = row.pop("part_id")

    if topics:
        valid_ids = {topic["id"] for topic in topics if "id" in topic}
        name_to_id = {
            topic["name"]: topic["id"]
            for topic in topics
            if "name" in topic and "id" in topic
        }
        orphaned = 0
        for row in relations:
            topic_id = row.get("topic_identifier", "")
            if not topic_id or topic_id in valid_ids:
                continue
            if topic_id in name_to_id:
                row["topic_identifier"] = name_to_id[topic_id]
            else:
                orphaned += 1
        if orphaned:
            print(
                f"Warning: {orphaned} relations reference topic IDs not in topics.json. "
                "Those relations will be ignored.",
                file=sys.stderr,
            )

    return relations


def _is_relevant(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value >= 0.5
    if isinstance(value, str):
        return value.lower() not in ("false", "no", "0", "irrelevant")
    return True


def load_all_parts(knowledge_dir: Path) -> dict[str, dict]:
    parts: dict[str, dict] = {}
    pattern = str(knowledge_dir / "*" / "knowledge_parts.json")
    for kp_file in sorted(glob.glob(pattern)):
        try:
            data = json.loads(Path(kp_file).read_text())
            for part in data.get("parts", []):
                parts[part["id"]] = part
        except (json.JSONDecodeError, KeyError) as exc:
            print(f"Warning: Failed to load {kp_file}: {exc}", file=sys.stderr)

    index_path = knowledge_dir / "all-parts-index.json"
    if index_path.exists():
        try:
            index_data = json.loads(index_path.read_text())
            index_parts = index_data.get("parts", index_data) if isinstance(index_data, dict) else index_data
            relevance_map = {
                part["id"]: part.get("relevant")
                for part in index_parts
                if isinstance(part, dict) and "id" in part
            }
            parts = {
                part_id: part
                for part_id, part in parts.items()
                if _is_relevant(relevance_map.get(part_id))
            }
        except (json.JSONDecodeError, KeyError) as exc:
            print(f"Warning: Failed to load relevance labels from {index_path}: {exc}", file=sys.stderr)

    return parts


def find_leaf_topics(topics: list[dict]) -> list[dict]:
    parent_ids = {topic["parent_id"] for topic in topics if topic.get("parent_id")}
    return [topic for topic in topics if topic["id"] not in parent_ids]


def build_topic_index(topics: list[dict]) -> dict[str, dict]:
    return {topic["id"]: topic for topic in topics}


def get_ancestor_chain(topic: dict, topic_index: dict[str, dict]) -> list[dict]:
    chain: list[dict] = []
    current = topic
    while current.get("parent_id") and current["parent_id"] in topic_index:
        parent = topic_index[current["parent_id"]]
        chain.append(parent)
        current = parent
    chain.reverse()
    return chain


def compose_system_prompt(root_prompt: str, ancestors: list[dict], leaf: dict) -> str:
    parts = [root_prompt.rstrip(".") + "."] if root_prompt else []
    for ancestor in ancestors:
        segment = ancestor.get("system_prompt", "")
        if segment:
            parts.append(segment.rstrip(".") + ".")
    leaf_segment = leaf.get("system_prompt", "")
    if leaf_segment:
        parts.append(leaf_segment.rstrip(".") + ".")
    elif leaf.get("name"):
        parts.append(f"Focus on: {leaf['name']}.")
    composed = " ".join(parts).strip()
    if len(composed.split()) > 200:
        print(
            f"  ⚠ System prompt for '{leaf.get('name', leaf.get('id', '?'))}' is "
            f"{len(composed.split())} words (target: 50-150).",
            file=sys.stderr,
        )
    return composed


def build_search_query(topic: dict, ancestors: list[dict]) -> str:
    parts = [ancestor["name"] for ancestor in ancestors]
    parts.append(topic["name"])
    if topic.get("system_prompt"):
        parts.append(topic["system_prompt"])
    return " ".join(parts)


def load_trace_priority(trace_priority_path: Path) -> dict[str, float]:
    data = json.loads(trace_priority_path.read_text())
    result: dict[str, float] = {}
    for topic, info in data.items():
        if isinstance(info, dict):
            result[topic] = float(info.get("priority_score", 0.0))
        else:
            result[topic] = float(info)
    return result


def load_trace_prompts(trace_prompts_path: Path) -> dict:
    if not trace_prompts_path.exists():
        return {}
    data = json.loads(trace_prompts_path.read_text())
    return data if isinstance(data, dict) else {}


def classify_difficulty(avg_score: float) -> str:
    if avg_score <= 0.3:
        return "hard"
    if avg_score <= 0.7:
        return "medium"
    return "easy"


def compute_topic_record_counts(
    leaves: list[dict],
    relations: list[dict],
    records_per_topic: int,
    min_per_topic: int,
    max_per_topic: int,
    weight_by_source: bool = False,
    weight_by_difficulty: bool = False,
    weight_by_trace_priority: bool = False,
    eval_scores: dict[str, float] | None = None,
    trace_priority_scores: dict[str, float] | None = None,
) -> dict[str, int]:
    if weight_by_trace_priority:
        def _normalize(name: str) -> str:
            return name.lower().replace("_", "-").strip()

        normalized_scores = {
            _normalize(key): value
            for key, value in (trace_priority_scores or {}).items()
        }
        leaf_scores: dict[str, float] = {}
        for leaf in leaves:
            leaf_scores[leaf["id"]] = normalized_scores.get(_normalize(leaf["id"]), 0.01)
        total_budget = records_per_topic * len(leaves)
        floor_total = min_per_topic * len(leaves)
        remaining_budget = max(0, total_budget - floor_total)
        total_score = sum(leaf_scores.values())
        result: dict[str, int] = {}
        for leaf in leaves:
            score = leaf_scores[leaf["id"]]
            proportional = round(remaining_budget * score / total_score) if total_score > 0 else 0
            count = min_per_topic + proportional
            result[leaf["id"]] = max(min_per_topic, min(count, max_per_topic))
        return result

    if weight_by_difficulty:
        topic_difficulty: dict[str, str] = {}
        for leaf in leaves:
            score = (eval_scores or {}).get(leaf["id"])
            topic_difficulty[leaf["id"]] = classify_difficulty(score) if score is not None else "medium"
        tiers: dict[str, list[str]] = {"hard": [], "medium": [], "easy": []}
        for leaf in leaves:
            tiers[topic_difficulty[leaf["id"]]].append(leaf["id"])
        total_budget = records_per_topic * len(leaves)
        result: dict[str, int] = {}
        for tier, weight in DIFFICULTY_WEIGHTS.items():
            tier_topics = tiers[tier]
            if not tier_topics:
                continue
            tier_budget = round(total_budget * weight)
            per_topic = max(1, round(tier_budget / len(tier_topics)))
            for topic_id in tier_topics:
                result[topic_id] = max(min_per_topic, min(per_topic, max_per_topic))
        for leaf in leaves:
            result.setdefault(leaf["id"], max(min_per_topic, min(records_per_topic, max_per_topic)))
        return result

    if not weight_by_source:
        clamped = max(min_per_topic, min(records_per_topic, max_per_topic))
        return {leaf["id"]: clamped for leaf in leaves}

    parts_per_topic: dict[str, int] = {}
    for leaf in leaves:
        count = sum(1 for relation in relations if relation["topic_identifier"] == leaf["id"])
        parts_per_topic[leaf["id"]] = max(count, 1)
    avg_parts = sum(parts_per_topic.values()) / len(parts_per_topic) if parts_per_topic else 1
    result: dict[str, int] = {}
    for leaf in leaves:
        raw_weight = parts_per_topic[leaf["id"]] / avg_parts
        raw = round(records_per_topic * min(raw_weight, 3.0))
        result[leaf["id"]] = max(min_per_topic, min(raw, max_per_topic))
    return result


def build_chunk_text(chunks: list[dict], max_chunks: int = 20) -> tuple[str, dict[str, str]]:
    chunk_segments: list[str] = []
    alias_to_id: dict[str, str] = {}
    for idx, chunk in enumerate(chunks[:max_chunks]):
        label = str(idx + 1)
        alias_to_id[label] = chunk["id"]
        title = chunk.get("title", "")
        content = chunk.get("content", "")
        meta = chunk.get("content_metadata", {}) or {}
        if chunk.get("type") == "table" and meta:
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
    return "\n---\n".join(chunk_segments), alias_to_id


def gateway_chat_completion(
    base_url: str,
    model: str,
    messages: list[dict],
    temperature: float = 0.2,
    max_tokens: int = 1200,
    response_format: dict | None = None,
) -> str:
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_format:
        payload["response_format"] = response_format
    resp = requests.post(
        f"{base_url.rstrip('/')}/chat/completions",
        json=payload,
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]


def parse_json_payload(text: str, default: object | None = None) -> object:
    stripped = text.strip()
    if not stripped:
        return [] if default is None else default
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        start = stripped.find("[")
        end = stripped.rfind("]")
        if start != -1 and end != -1 and start < end:
            return json.loads(stripped[start:end + 1])
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start != -1 and end != -1 and start < end:
            return json.loads(stripped[start:end + 1])
        raise


def _trigrams(text: str) -> set[str]:
    text = text.lower().strip()
    if len(text) < 3:
        return {text} if text else set()
    return {text[i:i + 3] for i in range(len(text) - 2)}


def trigram_similarity(a: str, b: str) -> float:
    ta, tb = _trigrams(a), _trigrams(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def stable_record_signature(record: dict) -> tuple[str, str, str]:
    topic = str(record.get("topic", ""))
    user_messages = [
        str(message.get("content", ""))
        for message in record.get("messages", [])
        if message.get("role") == "user"
    ]
    user_text = "\n".join(user_messages).strip()
    gt = record.get("ground_truth")
    if isinstance(gt, dict):
        gt_text = json.dumps(gt, sort_keys=True, ensure_ascii=False)
    else:
        gt_text = str(gt or "").strip()
    return (topic, user_text, gt_text)


def load_python_tool_module(module_path: str | None):
    if not module_path:
        return None
    path = Path(module_path)
    if not path.exists():
        raise FileNotFoundError(f"APIGen tool module not found: {module_path}")

    if path.is_dir():
        module = type(sys)("distilabel_apigen_tool_module")
        for child in sorted(path.glob("*.py")):
            if child.name.startswith("_"):
                continue
            spec = importlib.util.spec_from_file_location(child.stem, child)
            if spec is None or spec.loader is None:
                continue
            child_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(child_module)
            func = getattr(child_module, child.stem, None)
            if callable(func):
                setattr(module, child.stem, func)
        return module

    spec = importlib.util.spec_from_file_location("distilabel_apigen_tool_module", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to import APIGen tool module from {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def get_openai_api_key() -> str:
    return os.environ.get("OPENAI_API_KEY") or os.environ.get("VLLORA_OPENAI_API_KEY") or "dummy"
