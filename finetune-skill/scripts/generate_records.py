# /// script
# dependencies = ["requests>=2.31"]
# ///
"""Generate training records from topics, relations, and knowledge parts.

For each leaf topic, gathers linked source material via relations.json,
calls the LLM to generate grounded user prompts, and writes records to
training.jsonl incrementally.

Usage:
  uv run scripts/generate_records.py \
    --topics finetune-project/topics.json \
    --relations finetune-project/relations.json \
    --knowledge-dir finetune-project/knowledge \
    --system-prompt "You are an expert chess tutor..." \
    --output finetune-project/training.jsonl \
    --records-per-topic 10

Exit codes:
  0 - success (all topics generated)
  1 - error (some topics failed, partial output written)
"""

import glob
import json
import subprocess
import sys
from pathlib import Path


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


def generate_for_topic(
    topic: dict,
    ancestors: list[dict],
    relations: list[dict],
    parts: dict[str, dict],
    system_prompt: str,
    records_per_topic: int,
    model: str,
    temperature: float,
    base_url: str,
    scripts_dir: Path,
) -> list[dict]:
    """Generate records for a single leaf topic via LLM."""
    # Find parts linked to this topic
    part_ids = [
        r["part_identifier"]
        for r in relations
        if r["topic_identifier"] == topic["id"]
    ]
    chunks = [parts[pid] for pid in part_ids if pid in parts]

    # Build source material text (limit to 20 chunks to avoid context overflow)
    # For table parts, include structured context alongside markdown rendering
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

    # Build LLM request — use topic focus to guide generation
    focus = topic.get("system_prompt", topic.get("name", ""))
    prompt = f"""Generate {records_per_topic} diverse user prompts for fine-tuning.

Topic: {topic['name']}
Focus: {focus}

Source material:
{chunk_text}

Each prompt should be a realistic question/request grounded in the source material.
Vary: difficulty, tone, type (explain-why, compare, what-if, analyze, teach-me).
Return JSON: {{"prompts": ["prompt1", "prompt2", ...]}}"""

    request_data = json.dumps({
        "messages": [{"role": "user", "content": prompt}],
        "model": model,
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    })

    chat_script = scripts_dir / "chat_completion.py"
    result = subprocess.run(
        ["uv", "run", str(chat_script), "--base-url", base_url],
        input=request_data,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print(f"  Error: LLM call failed for topic '{topic['id']}'", file=sys.stderr)
        print(f"  stderr: {result.stderr[:300]}", file=sys.stderr)
        return []

    try:
        response = json.loads(result.stdout)
    except json.JSONDecodeError:
        print(f"  Error: Invalid JSON from LLM for topic '{topic['id']}'", file=sys.stderr)
        print(f"  Raw output: {result.stdout[:300]}", file=sys.stderr)
        return []

    # Handle error responses from chat_completion.py
    if isinstance(response, dict) and "error" in response:
        print(f"  Error: LLM returned error for topic '{topic['id']}': {response['error']}", file=sys.stderr)
        return []

    prompts = response.get("prompts", [])
    if not prompts:
        print(f"  Warning: LLM returned 0 prompts for topic '{topic['id']}'", file=sys.stderr)
        return []

    # Build records with composed system prompt
    records = []
    for i, prompt_text in enumerate(prompts):
        if not prompt_text or not prompt_text.strip():
            continue
        records.append({
            "messages": [
                {"role": "system", "content": composed_prompt},
                {"role": "user", "content": prompt_text},
            ],
            "id": f"{topic['id']}-{i + 1:03d}",
            "topic": topic["id"],
            "source_parts": part_ids,
        })

    return records


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Generate training records from topics + knowledge")
    parser.add_argument("--topics", required=True, help="Path to topics.json")
    parser.add_argument("--relations", required=True, help="Path to relations.json")
    parser.add_argument("--knowledge-dir", required=True, help="Path to knowledge/ directory")
    parser.add_argument("--system-prompt", required=True, help="System prompt for all records")
    parser.add_argument("--output", required=True, help="Path to output training.jsonl")
    parser.add_argument("--records-per-topic", type=int, default=10, help="Prompts to generate per leaf topic (default: 10)")
    parser.add_argument("--model", default="gpt-4o-mini", help="LLM model for generation (default: gpt-4o-mini)")
    parser.add_argument("--temperature", type=float, default=0.8, help="LLM temperature (default: 0.8)")
    parser.add_argument("--base-url", default="http://localhost:9090", help="Gateway base URL")
    parser.add_argument("--append", action="store_true", help="Append to existing file instead of overwriting")
    args = parser.parse_args()

    topics_path = Path(args.topics)
    relations_path = Path(args.relations)
    knowledge_dir = Path(args.knowledge_dir)
    output_path = Path(args.output)
    scripts_dir = Path(__file__).parent

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

    print(f"Loaded: {len(topics)} topics ({len(leaves)} leaves), {len(relations)} relations, {len(parts)} parts")

    # Generate records for each leaf topic
    output_path.parent.mkdir(parents=True, exist_ok=True)
    mode = "a" if args.append else "w"
    total_records = 0
    failed_topics: list[str] = []

    with output_path.open(mode) as out:
        for i, topic in enumerate(leaves):
            ancestors = get_ancestor_chain(topic, topic_index)
            ancestor_path = " > ".join(a["name"] for a in ancestors)
            path_display = f"{ancestor_path} > {topic['name']}" if ancestors else topic["name"]
            print(f"[{i + 1}/{len(leaves)}] Generating for '{path_display}'...", end=" ", flush=True)

            records = generate_for_topic(
                topic=topic,
                ancestors=ancestors,
                relations=relations,
                parts=parts,
                system_prompt=args.system_prompt,
                records_per_topic=args.records_per_topic,
                model=args.model,
                temperature=args.temperature,
                base_url=args.base_url,
                scripts_dir=scripts_dir,
            )

            if not records:
                failed_topics.append(topic["id"])
                print("FAILED (0 records)")
                continue

            for r in records:
                out.write(json.dumps(r) + "\n")
            total_records += len(records)
            print(f"{len(records)} records")

    # Summary
    print(f"\n{'='*50}")
    print(f"Generation complete: {total_records} records across {len(leaves) - len(failed_topics)} topics")
    print(f"Output: {output_path}")

    if failed_topics:
        print(f"\n⚠️  {len(failed_topics)} topic(s) failed:")
        for t in failed_topics:
            print(f"  - {t}")
        print("Re-run with --append to retry failed topics.")
        sys.exit(1)
    else:
        print(f"\n✅ All {len(leaves)} topics generated successfully!")


if __name__ == "__main__":
    main()
