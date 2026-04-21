# /// script
# dependencies = ["requests>=2.31"]
# ///
"""Generate Step 4 text candidates for the distilabel backend.

This backend consumes the same local artifacts as the native generator and
writes intermediate rows under `finetune-project/distilabel/` for the DEITA
selection pass.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from distilabel_shared import (  # noqa: E402
    build_chunk_text,
    build_topic_index,
    compose_system_prompt,
    compute_topic_record_counts,
    ensure_distilabel_available,
    ensure_workspace,
    find_leaf_topics,
    gateway_chat_completion,
    get_distilabel_config,
    load_all_parts,
    load_project_config,
    load_relations,
    load_topics,
    load_trace_priority,
    load_trace_prompts,
    parse_json_payload,
    resolve_generation_backend,
    validate_distilabel_config,
    write_json,
    write_jsonl,
)


GENERATOR_SYSTEM_PROMPT = (
    "You generate high-quality instruction-following training prompts from grounded source text. "
    "Return only valid JSON. Prefer realistic, specific user requests. Avoid generic restatements."
)


def _topic_part_ids(topic_id: str, relations: list[dict]) -> list[str]:
    return [
        relation["part_identifier"]
        for relation in relations
        if relation.get("topic_identifier") == topic_id
    ]


def _normalize_source_refs(
    source_refs: list[str] | None,
    alias_to_id: dict[str, str],
    fallback_ids: list[str],
) -> list[str]:
    if not source_refs:
        return list(fallback_ids[:3])
    resolved = [alias_to_id.get(str(ref).strip()) for ref in source_refs]
    resolved = [ref for ref in resolved if ref]
    return resolved or list(fallback_ids[:3])


def _truncate_ground_truth(text: str, limit: int = 600) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def build_seed_query_candidates(
    *,
    topic: dict,
    composed_prompt: str,
    seed_queries: list[str],
    source_parts: list[str],
    fallback_ground_truth: str,
) -> list[dict]:
    rows: list[dict] = []
    for idx, query in enumerate(seed_queries):
        rows.append(
            {
                "messages": [
                    {"role": "system", "content": composed_prompt},
                    {"role": "user", "content": query},
                ],
                "id": f"{topic['id']}-seedbt-{idx + 1:03d}",
                "topic": topic["id"],
                "source_parts": list(source_parts),
                "prompt_type": "backtranslation",
                "ground_truth": fallback_ground_truth,
                "metadata": {
                    "distilabel": {
                        "method": "instruction_backtranslation",
                        "candidate_score": None,
                        "selection_reason": "seed_query",
                    }
                },
            }
        )
    return rows


def generate_backtranslation_batch(
    *,
    topic: dict,
    composed_prompt: str,
    chunk_text: str,
    alias_to_id: dict[str, str],
    fallback_ids: list[str],
    model: str,
    base_url: str,
    count: int,
    seed_examples: list[str] | None = None,
    batch_index: int = 0,
) -> list[dict]:
    seed_block = ""
    if seed_examples:
        rendered = "\n".join(f"- {example}" for example in seed_examples[:5])
        seed_block = f"\nReal user phrasing examples:\n{rendered}\n"

    user_prompt = (
        f"Generate {count} diverse instruction-backtranslation training records for topic "
        f"'{topic['id']}' using only the grounded source text below.\n"
        f"{seed_block}"
        "Return JSON with shape "
        '{"records":[{"user_message":"...","ground_truth":"...","source_refs":["1","2"]}]}. '
        "The `user_message` must be a realistic user request, not a summary request to the model writer. "
        "The `ground_truth` should be a concise grounded answer or source excerpt useful to a grader. "
        "Use source_refs labels from the provided context.\n\n"
        f"Topic focus:\n{topic.get('system_prompt', topic.get('name', topic['id']))}\n\n"
        f"Composed training system prompt:\n{composed_prompt}\n\n"
        f"Grounded source text:\n{chunk_text}\n"
    )

    response_text = gateway_chat_completion(
        base_url=base_url,
        model=model,
        messages=[
            {"role": "system", "content": GENERATOR_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
        max_tokens=1800,
        response_format={"type": "json_object"},
    )
    payload = parse_json_payload(response_text, default={"records": []})
    records = payload.get("records", []) if isinstance(payload, dict) else []
    rows: list[dict] = []
    for row_index, item in enumerate(records, start=1):
        if not isinstance(item, dict):
            continue
        user_message = str(item.get("user_message", "")).strip()
        ground_truth = _truncate_ground_truth(str(item.get("ground_truth", "")).strip())
        if not user_message:
            continue
        resolved_parts = _normalize_source_refs(item.get("source_refs"), alias_to_id, fallback_ids)
        rows.append(
            {
                "messages": [
                    {"role": "system", "content": composed_prompt},
                    {"role": "user", "content": user_message},
                ],
                "id": f"{topic['id']}-bt-{batch_index + 1:02d}-{row_index:03d}",
                "topic": topic["id"],
                "source_parts": resolved_parts,
                "prompt_type": "backtranslation",
                "ground_truth": ground_truth,
                "metadata": {
                    "distilabel": {
                        "method": "instruction_backtranslation",
                        "candidate_score": None,
                        "selection_reason": "candidate_generation",
                    }
                },
            }
        )
    return rows


def build_text_candidates(
    *,
    topics: list[dict],
    relations: list[dict],
    parts: dict[str, dict],
    system_prompt: str,
    model: str,
    base_url: str,
    target_records_per_topic: int,
    min_records_per_topic: int,
    trace_priority_scores: dict[str, float] | None = None,
    trace_prompts: dict | None = None,
) -> tuple[list[dict], dict]:
    leaves = find_leaf_topics(topics)
    topic_index = build_topic_index(topics)
    targets = compute_topic_record_counts(
        leaves=leaves,
        relations=relations,
        records_per_topic=target_records_per_topic,
        min_per_topic=min_records_per_topic,
        max_per_topic=max(target_records_per_topic, min_records_per_topic * 3),
        weight_by_trace_priority=bool(trace_priority_scores),
        trace_priority_scores=trace_priority_scores,
    )

    seed_queries_map = {}
    if trace_prompts:
        seed_queries_map = trace_prompts.get("seed_queries", {}) or {}

    all_rows: list[dict] = []
    topic_counts: dict[str, dict[str, int]] = {}

    for leaf in leaves:
        part_ids = _topic_part_ids(leaf["id"], relations)
        chunks = [parts[part_id] for part_id in part_ids if part_id in parts]
        if not chunks:
            print(
                f"Warning: skipping distilabel text generation for '{leaf['id']}' because it has no linked parts.",
                file=sys.stderr,
            )
            continue

        chunk_text, alias_to_id = build_chunk_text(chunks)
        ancestors = []
        current = leaf
        while current.get("parent_id") and current["parent_id"] in topic_index:
            parent = topic_index[current["parent_id"]]
            ancestors.append(parent)
            current = parent
        ancestors.reverse()
        composed_prompt = compose_system_prompt(system_prompt, ancestors, leaf)

        target = targets.get(leaf["id"], target_records_per_topic)
        seed_queries = list(seed_queries_map.get(leaf["id"], []))
        seed_budget = min(max(1, target // 5), len(seed_queries)) if seed_queries else 0
        fallback_ground_truth = _truncate_ground_truth(
            " ".join(
                str(chunk.get("content", "")).strip()
                for chunk in chunks[:2]
                if chunk.get("content")
            )
        )
        seed_rows = build_seed_query_candidates(
            topic=leaf,
            composed_prompt=composed_prompt,
            seed_queries=seed_queries[:seed_budget],
            source_parts=part_ids[:3] or part_ids,
            fallback_ground_truth=fallback_ground_truth,
        )

        candidate_budget = max(target * 2 - len(seed_rows), target)
        per_call = 6
        llm_rows: list[dict] = []
        total_batches = max(1, math.ceil(candidate_budget / per_call))
        for batch_index in range(total_batches):
            request_count = min(per_call, max(0, candidate_budget - len(llm_rows)))
            if request_count <= 0:
                break
            llm_rows.extend(
                generate_backtranslation_batch(
                    topic=leaf,
                    composed_prompt=composed_prompt,
                    chunk_text=chunk_text,
                    alias_to_id=alias_to_id,
                    fallback_ids=part_ids,
                    model=model,
                    base_url=base_url,
                    count=request_count,
                    seed_examples=seed_queries[:5] if seed_queries else None,
                    batch_index=batch_index,
                )
            )

        topic_rows = seed_rows + llm_rows
        topic_counts[leaf["id"]] = {
            "target": target,
            "seed_candidates": len(seed_rows),
            "llm_candidates": len(llm_rows),
            "total_candidates": len(topic_rows),
        }
        all_rows.extend(topic_rows)

    metadata = {
        "backend": "distilabel",
        "text_recipe": "instruction_backtranslation_deita",
        "topic_targets": targets,
        "topic_counts": topic_counts,
        "system_prompt_source": "trace-prompts"
        if trace_prompts and trace_prompts.get("system_prompt") == system_prompt
        else "manual",
    }
    return all_rows, metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate distilabel text candidates for Step 4")
    parser.add_argument("--project-dir", default="finetune-project", help="Path to finetune-project")
    parser.add_argument("--system-prompt", help="Root system prompt. Falls back to trace prompts in combined mode.")
    args = parser.parse_args()

    project_dir = Path(args.project_dir)
    config = load_project_config(project_dir / "config.json")
    if resolve_generation_backend(config) != "distilabel":
        print(
            "Error: generation_backend is not set to 'distilabel' in config.json.",
            file=sys.stderr,
        )
        sys.exit(1)

    ensure_distilabel_available()
    settings = get_distilabel_config(config)
    validate_distilabel_config(settings)
    workspace = ensure_workspace(project_dir, keep_intermediate=bool(settings["keep_intermediate"]))

    topics = load_topics(project_dir / "topics.json")
    relations = load_relations(project_dir / "relations.json", topics=topics)
    parts = load_all_parts(project_dir / "knowledge")

    trace_priority_path = project_dir / "trace-analysis" / "priority.json"
    trace_prompts_path = project_dir / "trace-analysis" / "prompts.json"
    trace_priority = load_trace_priority(trace_priority_path) if trace_priority_path.exists() else None
    trace_prompts = load_trace_prompts(trace_prompts_path) if trace_prompts_path.exists() else None

    system_prompt = args.system_prompt or ""
    if not system_prompt and trace_prompts:
        system_prompt = str(trace_prompts.get("system_prompt", "")).strip()
    if not system_prompt:
        print(
            "Error: a root system prompt is required. Pass --system-prompt or provide trace-analysis/prompts.json.",
            file=sys.stderr,
        )
        sys.exit(1)

    rows, metadata = build_text_candidates(
        topics=topics,
        relations=relations,
        parts=parts,
        system_prompt=system_prompt,
        model=str(settings["model"]),
        base_url=str(settings["base_url"]),
        target_records_per_topic=int(settings["target_records_per_topic"]),
        min_records_per_topic=int(settings["min_records_per_topic"]),
        trace_priority_scores=trace_priority,
        trace_prompts=trace_prompts,
    )
    metadata["text_recipe"] = str(settings["text_recipe"])

    write_jsonl(workspace / "text-candidates.jsonl", rows)
    write_json(workspace / "pipeline-metadata.json", metadata)
    print(
        f"Generated {len(rows)} distilabel text candidate rows → {workspace / 'text-candidates.jsonl'}"
    )


if __name__ == "__main__":
    main()
