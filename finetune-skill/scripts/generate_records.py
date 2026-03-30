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
import tempfile
import threading
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
        parts.append({
            "id": part_id,
            "title": part.get("title", ""),
            "content": part.get("content", ""),
            "type": part.get("type", "text"),
            "content_metadata": part.get("content_metadata"),
        })

    return parts


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
    include_ground_truth: bool = True,
    rag_parts: list[dict] | None = None,
    workflow_id: str | None = None,
    second_retrieval: bool = False,
) -> list[dict]:
    """Generate records for a single leaf topic via LLM."""
    # Find parts linked to this topic via relations.json
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

For each prompt, also provide a "ground_truth" field: a concise excerpt from the source material above that contains the information needed to accurately answer the question. Keep it focused on the relevant passage(s) — complete enough to verify a correct answer, but not the entire source.

Return JSON: {{"items": [{{"prompt": "the question", "ground_truth": "relevant source excerpt"}}, ...]}}"""

    request_data = json.dumps({
        "messages": [{"role": "user", "content": prompt}],
        "model": model,
        "temperature": temperature,
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

    # Support both new {"items": [...]} and legacy {"prompts": [...]} format
    items = response.get("items", [])
    if not items:
        # Fallback: legacy format or LLM returned old structure
        prompts = response.get("prompts", [])
        items = [{"prompt": p, "ground_truth": ""} for p in prompts]

    if not items:
        print(f"  Warning: LLM returned 0 prompts for topic '{topic['id']}'", file=sys.stderr)
        return []

    # Build records with composed system prompt
    records = []
    for i, item in enumerate(items):
        if isinstance(item, str):
            # Handle case where LLM returns plain strings in items array
            item = {"prompt": item, "ground_truth": ""}
        prompt_text = item.get("prompt", "")
        if not prompt_text or not prompt_text.strip():
            continue
        all_source_parts = part_ids + rag_part_ids

        # Second retrieval: re-query with the generated question for sharper context.
        # Unlike the first retrieval (topic-level), this is question-specific —
        # each record gets source_parts and ground_truth tailored to its own question.
        if second_retrieval and workflow_id:
            q_parts = retrieve_parts_by_phrase(
                phrase=prompt_text,
                workflow_id=workflow_id,
                base_url=base_url,
                top_k=5,
                existing_part_ids=set(all_source_parts),
            )
            if q_parts:
                all_source_parts = all_source_parts + [p["id"] for p in q_parts]

        record = {
            "messages": [
                {"role": "system", "content": composed_prompt},
                {"role": "user", "content": prompt_text},
            ],
            "id": f"{topic['id']}-{i + 1:03d}",
            "topic": topic["id"],
            "source_parts": all_source_parts,
        }
        ground_truth = item.get("ground_truth", "")
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

    # Write records to a temp JSONL file
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
    from concurrent.futures import ThreadPoolExecutor, as_completed

    parser = argparse.ArgumentParser(description="Generate training records from topics + knowledge")
    parser.add_argument("--topics", required=True, help="Path to topics.json")
    parser.add_argument("--relations", default=None, help="Path to relations.json (optional with --rag-only)")
    parser.add_argument("--knowledge-dir", default=None, help="Path to knowledge/ directory (optional with --rag-only)")
    parser.add_argument("--system-prompt", required=True, help="System prompt for all records")
    parser.add_argument("--output", required=True, help="Path to output training.jsonl")
    parser.add_argument("--records-per-topic", type=int, default=10, help="Prompts to generate per leaf topic (default: 10)")
    parser.add_argument("--model", default="gpt-4o-mini", help="LLM model for generation (default: gpt-4o-mini)")
    parser.add_argument("--temperature", type=float, default=0.8, help="LLM temperature (default: 0.8)")
    parser.add_argument("--base-url", default="http://localhost:9090", help="Gateway base URL")
    parser.add_argument("--append", action="store_true", help="Append to existing file instead of overwriting")
    parser.add_argument("--no-ground-truth", action="store_true", help="Skip generating ground_truth excerpts for each record")
    parser.add_argument("--parallel", type=int, default=1, help="Number of topics to generate concurrently (default: 1, max: 8)")
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

    print(f"Loaded: {len(topics)} topics ({len(leaves)} leaves), {len(relations)} relations, {len(parts)} parts")
    if args.use_rag:
        mode_label = "RAG-only" if args.rag_only else "relations + RAG"
        print(f"RAG enabled ({mode_label}, top_k={args.rag_top_k})")
    if parallel > 1:
        print(f"Generating with {parallel} parallel workers")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    mode = "a" if args.append else "w"

    # Prepare tasks: (index, topic, ancestors)
    tasks = []
    for i, topic in enumerate(leaves):
        ancestors = get_ancestor_chain(topic, topic_index)
        tasks.append((i, topic, ancestors))

    common_kwargs = dict(
        relations=relations,
        parts=parts,
        system_prompt=args.system_prompt,
        records_per_topic=args.records_per_topic,
        model=args.model,
        temperature=args.temperature,
        base_url=args.base_url,
        scripts_dir=scripts_dir,
        include_ground_truth=not args.no_ground_truth,
        workflow_id=args.workflow_id if getattr(args, "rag_second_retrieval", False) else None,
        second_retrieval=getattr(args, "rag_second_retrieval", False),
    )

    all_results: list[tuple[int, str, list[dict]]] = []
    failed_topics: list[str] = []
    upload_failures: list[str] = []

    # Thread-safe file writer + uploader for parallel mode
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
        if not args.use_rag:
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

    if parallel <= 1:
        # Sequential mode
        for i, topic, ancestors in tasks:
            ancestor_path = " > ".join(a["name"] for a in ancestors)
            path_display = f"{ancestor_path} > {topic['name']}" if ancestors else topic["name"]
            print(f"[{i + 1}/{len(leaves)}] Generating for '{path_display}'...", end=" ", flush=True)

            topic_rag_parts = _get_rag_parts(topic, ancestors)
            if topic_rag_parts:
                print(f"(RAG: +{len(topic_rag_parts)} parts) ", end="", flush=True)

            records = generate_for_topic(topic=topic, ancestors=ancestors, rag_parts=topic_rag_parts, **common_kwargs)
            if not records:
                failed_topics.append(topic["id"])
                print("FAILED (0 records)")
            else:
                all_results.append((i, topic["id"], records))
                _flush_records(records, topic["id"])
                upload_status = f" (uploaded)" if args.upload_incremental else ""
                print(f"{len(records)} records{upload_status}")
    else:
        # Parallel mode
        def _generate(task_tuple: tuple) -> tuple[int, str, str, list[dict]]:
            idx, topic, ancestors = task_tuple
            ancestor_path = " > ".join(a["name"] for a in ancestors)
            path_display = f"{ancestor_path} > {topic['name']}" if ancestors else topic["name"]
            topic_rag_parts = _get_rag_parts(topic, ancestors)
            records = generate_for_topic(topic=topic, ancestors=ancestors, rag_parts=topic_rag_parts, **common_kwargs)
            return (idx, topic["id"], path_display, records)

        with ThreadPoolExecutor(max_workers=parallel) as executor:
            futures = {executor.submit(_generate, t): t for t in tasks}
            for future in as_completed(futures):
                idx, topic_id, path_display, records = future.result()
                if not records:
                    failed_topics.append(topic_id)
                    print(f"[{idx + 1}/{len(leaves)}] '{path_display}' FAILED (0 records)")
                else:
                    all_results.append((idx, topic_id, records))
                    _flush_records(records, topic_id)
                    upload_status = f" (uploaded)" if args.upload_incremental else ""
                    print(f"[{idx + 1}/{len(leaves)}] '{path_display}' → {len(records)} records{upload_status}")

    # Summary
    print(f"\n{'='*50}")
    print(f"Generation complete: {total_records} records across {len(leaves) - len(failed_topics)} topics")
    print(f"Output: {output_path}")
    if args.upload_incremental:
        print(f"Uploaded: {uploaded_records} records to workflow {args.workflow_id}")
        if upload_failures:
            print(f"⚠️  Upload failed for {len(upload_failures)} topic(s): {upload_failures}")

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
