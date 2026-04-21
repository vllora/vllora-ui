# /// script
# dependencies = ["requests>=2.31"]
# ///
"""Augment canonical decision-point datasets with APIGen-style rows."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from distilabel_shared import (  # noqa: E402
    ensure_distilabel_available,
    ensure_workspace,
    find_leaf_topics,
    gateway_chat_completion,
    get_distilabel_config,
    load_project_config,
    load_topics,
    load_python_tool_module,
    parse_json_payload,
    read_jsonl,
    read_jsonl_with_raw,
    resolve_generation_backend,
    stable_record_signature,
    trigram_similarity,
    validate_distilabel_config,
    write_json,
    write_jsonl,
)


def load_tool_schemas(path: Path) -> list[dict]:
    data = json.loads(path.read_text())
    if isinstance(data, dict):
        tools = data.get("tools", [])
    else:
        tools = data
    return [tool for tool in tools if isinstance(tool, dict)]


def extract_tool_ground_truth(record: dict) -> dict | None:
    gt = record.get("ground_truth")
    if isinstance(gt, dict) and gt.get("name") and "arguments" in gt:
        return {"name": gt["name"], "arguments": gt.get("arguments", {})}
    if isinstance(gt, dict) and isinstance(gt.get("tool_calls"), list) and gt["tool_calls"]:
        call = gt["tool_calls"][0]
        function = call.get("function", {}) if isinstance(call, dict) else {}
        if function.get("name") and "arguments" in function:
            return {"name": function["name"], "arguments": function["arguments"]}
    return None


def build_tool_index(tool_schemas: list[dict]) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for tool in tool_schemas:
        function = tool.get("function", {})
        name = function.get("name")
        if name:
            index[name] = function
    return index


def required_arguments(function_schema: dict) -> set[str]:
    parameters = function_schema.get("parameters", {})
    required = parameters.get("required", [])
    return {str(arg) for arg in required if isinstance(arg, str)}


def semantic_check_answer(answer: dict, tool_index: dict[str, dict]) -> tuple[bool, str]:
    name = str(answer.get("name", "")).strip()
    arguments = answer.get("arguments", {})
    if not name:
        return False, "missing_tool_name"
    function_schema = tool_index.get(name)
    if not function_schema:
        return False, "unknown_tool"
    if not isinstance(arguments, dict):
        return False, "arguments_not_object"

    parameters = function_schema.get("parameters", {})
    properties = parameters.get("properties", {}) if isinstance(parameters, dict) else {}
    missing = sorted(required_arguments(function_schema) - set(arguments.keys()))
    if missing:
        return False, f"missing_required:{','.join(missing)}"
    unknown = sorted(set(arguments.keys()) - set(properties.keys()))
    if unknown:
        return False, f"unknown_arguments:{','.join(unknown)}"
    return True, "ok"


def execution_check_answer(answer: dict, tool_module) -> tuple[bool, str]:
    if tool_module is None:
        return True, "skipped"
    func = getattr(tool_module, answer["name"], None)
    if not callable(func):
        return False, "missing_callable"
    try:
        func(**answer.get("arguments", {}))
    except Exception as exc:  # pragma: no cover - exercised via integration only
        return False, f"execution_failed:{exc.__class__.__name__}"
    return True, "ok"


def examples_for_topic(records: list[dict], topic: str, limit: int = 3) -> list[dict]:
    matches = []
    for record in records:
        if record.get("topic") != topic:
            continue
        gt = extract_tool_ground_truth(record)
        if not gt:
            continue
        user_messages = [
            message.get("content", "")
            for message in record.get("messages", [])
            if message.get("role") == "user"
        ]
        matches.append(
            {
                "source_record_id": record.get("id", ""),
                "query": user_messages[-1] if user_messages else "",
                "answer": gt,
                "system_prompt": next(
                    (
                        message.get("content", "")
                        for message in record.get("messages", [])
                        if message.get("role") == "system"
                    ),
                    "",
                ),
            }
        )
        if len(matches) >= limit:
            break
    return matches


def build_generation_prompt(topic: str, examples: list[dict], tools: list[dict], count: int) -> str:
    rendered_examples = []
    for example in examples:
        rendered_examples.append(
            json.dumps(
                {
                    "query": example["query"],
                    "answer": example["answer"],
                },
                ensure_ascii=False,
            )
        )
    tools_json = json.dumps(tools, ensure_ascii=False, indent=2)
    example_block = "\n".join(rendered_examples) if rendered_examples else "(no examples)"
    return (
        f"Generate {count} diverse user queries and tool-call answers for topic '{topic}'.\n"
        "Return JSON only with shape "
        '{"records":[{"query":"...","answer":{"name":"tool_name","arguments":{"arg":"value"}}}]}. '
        "Every answer must choose one tool from the provided schema and include valid arguments.\n\n"
        f"Few-shot examples:\n{example_block}\n\n"
        f"Available tools:\n{tools_json}\n"
    )


def generate_candidates_for_topic(
    *,
    topic: str,
    examples: list[dict],
    tools: list[dict],
    model: str,
    base_url: str,
    count: int,
) -> list[dict]:
    if not examples:
        return []
    response_text = gateway_chat_completion(
        base_url=base_url,
        model=model,
        messages=[
            {
                "role": "system",
                "content": "You generate verifiable APIGen-style function-calling data. Return JSON only.",
            },
            {
                "role": "user",
                "content": build_generation_prompt(topic, examples, tools, count),
            },
        ],
        temperature=0.7,
        max_tokens=1800,
        response_format={"type": "json_object"},
    )
    payload = parse_json_payload(response_text, default={"records": []})
    records = payload.get("records", []) if isinstance(payload, dict) else []
    return [record for record in records if isinstance(record, dict)]


def convert_apigen_outputs_to_records(
    *,
    topic: str,
    candidate_items: list[dict],
    examples: list[dict],
    tool_schemas: list[dict],
    tool_index: dict[str, dict],
    tool_module,
) -> tuple[list[dict], list[dict]]:
    selected_rows: list[dict] = []
    rejected: list[dict] = []
    system_prompt = examples[0].get("system_prompt", "") if examples else ""

    for idx, item in enumerate(candidate_items, start=1):
        query = str(item.get("query", "")).strip()
        answer = item.get("answer")
        if not query or not isinstance(answer, dict):
            rejected.append({"reason": "invalid_shape", "item": item})
            continue

        semantic_ok, semantic_reason = semantic_check_answer(answer, tool_index)
        if not semantic_ok:
            rejected.append({"reason": semantic_reason, "item": item})
            continue

        exec_ok, exec_reason = execution_check_answer(answer, tool_module)
        if not exec_ok:
            rejected.append({"reason": exec_reason, "item": item})
            continue

        row = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query},
            ],
            "id": f"{topic}-apigen-{idx:03d}",
            "topic": topic,
            "tools": tool_schemas,
            "ground_truth": {
                "name": answer["name"],
                "arguments": answer.get("arguments", {}),
            },
            "prompt_type": "apigen",
            "metadata": {
                "distilabel": {
                    "method": "apigen",
                    "candidate_score": 1.0,
                    "selection_reason": "semantic_checker",
                    "source_record_id": examples[0].get("source_record_id", "") if examples else "",
                }
            },
        }
        selected_rows.append(row)

    return selected_rows, rejected


def dedupe_against_canonical(
    canonical_rows: list[dict],
    new_rows: list[dict],
    similarity_threshold: float = 0.9,
) -> tuple[list[dict], int]:
    canonical_signatures = {stable_record_signature(row) for row in canonical_rows}
    deduped: list[dict] = []
    removed = 0
    for row in new_rows:
        signature = stable_record_signature(row)
        if signature in canonical_signatures:
            removed += 1
            continue
        user_prompt = next(
            (msg.get("content", "") for msg in row.get("messages", []) if msg.get("role") == "user"),
            "",
        )
        duplicate = False
        for existing in deduped:
            existing_prompt = next(
                (msg.get("content", "") for msg in existing.get("messages", []) if msg.get("role") == "user"),
                "",
            )
            if trigram_similarity(user_prompt, existing_prompt) >= similarity_threshold:
                duplicate = True
                break
        if duplicate:
            removed += 1
            continue
        deduped.append(row)
    return deduped, removed


def write_merged_training_jsonl(
    output_path: Path,
    canonical_entries: list[tuple[str, dict]],
    new_rows: list[dict],
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        for raw_line, _ in canonical_entries:
            f.write(raw_line + "\n")
        for row in new_rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate APIGen-style augmentations for tool-calling Step 4")
    parser.add_argument("--project-dir", default="finetune-project", help="Path to finetune-project")
    parser.add_argument("--output", help="Merged training.jsonl output path")
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

    decision_points_path = project_dir / "trace-analysis" / "decision-points.jsonl"
    tool_schemas_path = project_dir / "trace-analysis" / "tool-schemas.json"
    if not decision_points_path.exists() or not tool_schemas_path.exists():
        print(
            "Error: APIGen backend requires trace-analysis/decision-points.jsonl and tool-schemas.json.",
            file=sys.stderr,
        )
        sys.exit(1)

    canonical_entries = read_jsonl_with_raw(decision_points_path)
    canonical_rows = [row for _, row in canonical_entries]
    tool_schemas = load_tool_schemas(tool_schemas_path)
    tool_index = build_tool_index(tool_schemas)
    topics_path = project_dir / "topics.json"
    leaf_topics = []
    if topics_path.exists():
        leaf_topics = [topic["id"] for topic in find_leaf_topics(load_topics(topics_path))]
    tool_module = None
    execution_checker_used = False
    if settings.get("apigen_tool_module"):
        tool_module = load_python_tool_module(str(settings["apigen_tool_module"]))
        execution_checker_used = True

    counts = Counter(str(row.get("topic", "")) for row in canonical_rows)
    target = int(settings["target_records_per_topic"])
    minimum = int(settings["min_records_per_topic"])
    candidate_topics = leaf_topics or list(counts.keys())
    underrepresented_topics = {
        topic: max(0, target - counts.get(topic, 0))
        for topic in candidate_topics
        if counts.get(topic, 0) < minimum
    }

    all_candidates: list[dict] = []
    selected_rows: list[dict] = []
    rejected_summary: list[dict] = []
    skipped_topics: dict[str, str] = {}

    for topic, gap in underrepresented_topics.items():
        examples = examples_for_topic(canonical_rows, topic)
        if not examples:
            skipped_topics[topic] = "no_seed_examples"
            continue
        candidate_items = generate_candidates_for_topic(
            topic=topic,
            examples=examples,
            tools=tool_schemas,
            model=str(settings["model"]),
            base_url=str(settings["base_url"]),
            count=max(1, gap),
        )
        all_candidates.extend(candidate_items)
        converted_rows, rejected = convert_apigen_outputs_to_records(
            topic=topic,
            candidate_items=candidate_items,
            examples=examples,
            tool_schemas=tool_schemas,
            tool_index=tool_index,
            tool_module=tool_module,
        )
        selected_rows.extend(converted_rows)
        rejected_summary.extend(rejected)

    write_jsonl(workspace / "apigen-candidates.jsonl", all_candidates)

    deduped_new_rows, removed_duplicates = dedupe_against_canonical(canonical_rows, selected_rows)
    write_jsonl(workspace / "apigen-selected.jsonl", deduped_new_rows)

    output_path = Path(args.output) if args.output else project_dir / "training.jsonl"
    write_merged_training_jsonl(output_path, canonical_entries, deduped_new_rows)

    write_json(
        workspace / "apigen-merge-report.json",
        {
            "backend": "distilabel",
            "tool_recipe": "apigen",
            "canonical_rows": len(canonical_rows),
            "candidate_rows": len(all_candidates),
            "selected_rows": len(deduped_new_rows),
            "duplicates_removed": removed_duplicates,
            "execution_checker_used": execution_checker_used,
            "execution_checker_reason": (
                "enabled via distilabel.apigen_tool_module"
                if execution_checker_used
                else "skipped intentionally because distilabel.apigen_tool_module is not configured"
            ),
            "rejected": rejected_summary[:50],
            "skipped_topics": skipped_topics,
            "underrepresented_topics": underrepresented_topics,
        },
    )
    print(f"Merged {len(deduped_new_rows)} APIGen rows with canonical dataset → {output_path}")


if __name__ == "__main__":
    main()
