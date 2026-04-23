#!/usr/bin/env python3
"""
Seed a workflow with mockup-matching data for side-by-side UI comparison.

Creates:
  - 1 workflow ("Chess Tutor (Mockup)")
  - 13 topics in 3-group hierarchy (Basic Tactical Patterns, Advanced Combinations, Endgame & Mating)
  - 113 records across all topics (correctly encoded)
  - 3 knowledge source documents with extracted parts
  - Topic ↔ source part relations via /topics/relations endpoint

Usage:
    python3 docs/workflow-skill-first-approach/seed-mockup-data.py [--gateway http://localhost:9090]

To reset (delete and recreate):
    python3 docs/workflow-skill-first-approach/seed-mockup-data.py --reset
"""

import argparse
import json
import io
import uuid
import urllib.request
import urllib.error

WORKFLOW_ID = "26ba505e-0129-46ef-92c0-99bded030c5b"
WORKFLOW_NAME = "Chess Tutor (Mockup)"
WORKFLOW_OBJECTIVE = "Train a chess tutor assistant that can explain chess concepts clearly to intermediate players."

# ─── Topic hierarchy (parent → children) ───

TOPIC_HIERARCHY = [
    {
        "id": "p1", "name": "Basic Tactical Patterns", "children": [
            {"id": "p1-forks", "name": "Forks"},
            {"id": "p1-pins", "name": "Pins and Skewers"},
            {"id": "p1-disc", "name": "Discovered Attacks"},
            {"id": "p1-sac", "name": "Sacrifices"},
            {"id": "p1-over", "name": "Overloading"},
        ],
    },
    {
        "id": "p2", "name": "Advanced Combinations", "children": [
            {"id": "p2-open", "name": "Opening Principles"},
            {"id": "p2-pos", "name": "Positional Themes"},
        ],
    },
    {
        "id": "p3", "name": "Endgame & Mating", "children": [
            {"id": "p3-back", "name": "Back Rank Mates"},
            {"id": "p3-promo", "name": "Pawn Promotion"},
            {"id": "p3-test", "name": "Test Topic"},
        ],
    },
]

# Flatten for record generation: leaf topic id → concept list
TOPIC_CONCEPTS = {
    "p1-forks": ["knight forks", "double attacks", "family forks", "royal forks"],
    "p1-pins": ["absolute pins", "relative pins", "skewer attacks", "pin breaking"],
    "p1-disc": ["discovered checks", "discovered attacks", "battery tactics"],
    "p1-sac": ["exchange sacrifices", "piece sacrifices", "pawn sacrifices"],
    "p1-over": ["overloaded pieces", "deflection", "decoy tactics"],
    "p2-open": ["center control", "rapid development", "king safety", "Italian Game", "Sicilian Defense", "Queens Gambit"],
    "p2-pos": ["pawn structure", "weak squares", "outposts", "space advantage", "piece activity", "prophylaxis"],
    "p3-back": ["back rank checkmate", "Anastasia's mate", "corridor mate"],
    "p3-promo": ["pawn queening", "underpromotion", "passed pawns"],
    "p3-test": ["test concept A", "test concept B"],
}

# ─── Knowledge sources with parts ───

KNOWLEDGE_SOURCES = [
    {
        "name": "chess-tactics.pdf",
        "description": "Comprehensive chess tactics reference",
        "metadata": {"pageCount": 156, "fileSize": 8400000},
        "parts": [
            {"title": "Introduction", "content": "Chess tactics are short sequences of moves that result in a tangible gain. Understanding fundamental tactical motifs is essential for any serious player.", "extraction_path": "Chapter 1"},
            {"title": "Forks", "content": "A fork is a tactic in which a single piece attacks two or more of the opponent's pieces simultaneously. Knight forks are especially dangerous because knights can attack pieces that cannot attack back.", "extraction_path": "Chapter 2"},
            {"title": "Pins and Skewers", "content": "A pin restricts a piece from moving because it would expose a more valuable piece behind it. The absolute pin prevents the piece from moving legally. Skewers work in reverse.", "extraction_path": "Chapter 3"},
            {"title": "Discovered Attacks", "content": "A discovered attack occurs when one piece moves to reveal an attack from another piece behind it. Discovered checks are particularly powerful as the moving piece can capture freely.", "extraction_path": "Chapter 4"},
            {"title": "Forks (continued)", "content": "Double attacks and family forks where the knight attacks multiple pieces including the king and queen are the most devastating tactical patterns in chess.", "extraction_path": "Chapter 5"},
            {"title": "Sacrifices", "content": "A sacrifice involves giving up material for a greater positional or tactical advantage. Exchange sacrifices, piece sacrifices, and pawn sacrifices each serve different strategic goals.", "extraction_path": "Chapter 6"},
            {"title": "Deflection and Overloading", "content": "Deflection forces a defending piece away from a critical square or duty. An overloaded piece is one that must perform two defensive tasks simultaneously.", "extraction_path": "Chapter 7"},
            {"title": "Checkmate Patterns", "content": "Back rank mates, Anastasia's mate, and corridor mates are common mating patterns every player must recognize. Pattern recognition speeds up calculation.", "extraction_path": "Chapter 8"},
            {"title": "Opening Index", "content": "Quick reference for common opening lines including the Italian Game, Sicilian Defense, and Queen's Gambit with key tactical themes in each.", "extraction_path": "Appendix A"},
            {"title": "Endgame Fundamentals", "content": "Pawn promotion, underpromotion tactics, and king activity in the endgame. Passed pawns must be pushed, and the king becomes a strong piece.", "extraction_path": "Appendix B"},
        ],
    },
    {
        "name": "strategy-guide.pdf",
        "description": "Positional chess strategy guide",
        "metadata": {"pageCount": 92, "fileSize": 5200000},
        "parts": [
            {"title": "Opening Principles", "content": "Opening principles form the foundation of good chess play. Control the center, develop your pieces, and castle early. Avoid moving the same piece twice in the opening.", "extraction_path": "Chapter 1"},
            {"title": "Pawn Structure", "content": "Pawn structure determines the character of the position. Isolated pawns are weak because they cannot be defended by other pawns. Pawn chains create a solid foundation but can become targets at the base.", "extraction_path": "Chapter 2"},
            {"title": "Good vs Bad Bishops", "content": "A good bishop has open diagonals with pawns on the opposite color. A bad bishop is restricted by its own pawns on the same color squares.", "extraction_path": "Chapter 3"},
            {"title": "Piece Coordination", "content": "Piece coordination is about making your pieces work together harmoniously. Well-coordinated pieces can create threats that are greater than the sum of their parts.", "extraction_path": "Chapter 4"},
            {"title": "Minority Attack", "content": "The minority attack uses a smaller group of pawns to undermine a larger pawn group on the opposite wing. It creates weaknesses that can be exploited in the endgame.", "extraction_path": "Chapter 5"},
            {"title": "Prophylaxis", "content": "Prophylactic thinking means preventing your opponent's plans before executing your own. Ask 'what does my opponent want?' before every move.", "extraction_path": "Chapter 6"},
        ],
    },
    {
        "name": "opening-theory.pdf",
        "description": "Opening theory reference for intermediate players",
        "metadata": {"pageCount": 64, "fileSize": 3100000},
        "parts": [
            {"title": "Italian Game", "content": "The Italian Game (1.e4 e5 2.Nf3 Nc6 3.Bc4) is one of the oldest openings. White develops the bishop to an active square targeting f7. The Giuoco Piano and Evans Gambit are main lines.", "extraction_path": "Part 1"},
            {"title": "Sicilian Defense", "content": "The Sicilian Defense (1.e4 c5) is Black's most popular and aggressive response to 1.e4. It leads to asymmetrical positions where both sides have winning chances.", "extraction_path": "Part 2"},
            {"title": "Queens Gambit", "content": "The Queen's Gambit (1.d4 d5 2.c4) is not a true gambit since White can always recover the pawn. Black can accept (QGA) or decline (QGD) the gambit.", "extraction_path": "Part 3"},
        ],
    },
]

# Topic → part title mappings for creating relations
# Each mapping connects a topic to relevant source parts by title
TOPIC_PART_LINKS = {
    "p1-forks": ["Forks", "Forks (continued)", "Opening Principles"],
    "p1-pins": ["Pins and Skewers", "Pawn Structure"],
    "p1-disc": ["Discovered Attacks", "Good vs Bad Bishops"],
    "p1-sac": ["Sacrifices"],
    "p1-over": ["Deflection and Overloading", "Introduction"],
    "p2-open": ["Italian Game", "Sicilian Defense", "Queens Gambit"],
    "p2-pos": ["Piece Coordination", "Minority Attack", "Prophylaxis"],
    "p3-back": ["Checkmate Patterns", "Endgame Fundamentals"],
    "p3-promo": ["Endgame Fundamentals", "Opening Index"],
    "p3-test": ["Piece Coordination", "Pawn Structure"],
}

# ─── Templates for record generation ───

SYSTEM_MSG = "You are an expert chess tutor. Explain concepts clearly and concisely."

USER_TEMPLATES = [
    "Explain the {concept}",
    "What is {concept} in chess?",
    "How do I use {concept}?",
    "Show me an example of {concept}",
    "Why is {concept} important?",
    "When should I apply {concept}?",
    "What are common mistakes with {concept}?",
    "How does {concept} relate to strategy?",
    "Can you break down {concept}?",
    "Give me a practical tip about {concept}",
]

ASSISTANT_TEMPLATES = [
    "The {concept} is a fundamental chess concept. It involves strategic thinking and pattern recognition to gain an advantage. Understanding this helps improve your overall game.",
    "In chess, {concept} refers to a key tactical or strategic element. Mastering it requires practice — study master games that showcase this pattern.",
    "{concept} is essential for chess improvement. Focus on recognizing key features: piece placement, pawn structure, and king safety all play a role.",
    "Here's how {concept} works: identify critical squares, calculate main variations, and choose the move that maintains your advantage.",
    "Understanding {concept} separates intermediate players from advanced ones. Practice regularly with puzzles that feature this theme.",
]


def api(gateway: str, method: str, path: str, data=None):
    """Make an API request and return parsed JSON (or None)."""
    url = f"{gateway}{path}"
    payload = json.dumps(data).encode() if data else None
    headers = {"Content-Type": "application/json"} if data else {}
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        print(f"  ERROR {e.code} {method} {path}: {e.read().decode()[:200]}")
        return None


def upload_file(gateway: str, path: str, filename: str, content: bytes, content_type: str = "application/pdf"):
    """Upload a file via multipart form."""
    boundary = f"----boundary{uuid.uuid4().hex}"
    body = io.BytesIO()

    body.write(f"--{boundary}\r\n".encode())
    body.write(f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode())
    body.write(f"Content-Type: {content_type}\r\n\r\n".encode())
    body.write(content)
    body.write(b"\r\n")
    body.write(f"--{boundary}--\r\n".encode())

    url = f"{gateway}{path}"
    req = urllib.request.Request(
        url,
        data=body.getvalue(),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"  ERROR {e.code} POST {path}: {e.read().decode()[:200]}")
        return None


def seed_workflow(gateway: str):
    """Create the mockup workflow."""
    print(f"Creating workflow {WORKFLOW_ID}...")
    result = api(gateway, "POST", "/finetune/workflows", {
        "id": WORKFLOW_ID,
        "name": WORKFLOW_NAME,
        "objective": WORKFLOW_OBJECTIVE,
    })
    if result:
        print(f"  Created: {result.get('id', WORKFLOW_ID)}")
    return WORKFLOW_ID


def seed_topics(gateway: str, wf_id: str) -> dict[str, str]:
    """Create 2-level topic hierarchy and return name→id map."""
    print("Creating topics...")
    topic_id_map: dict[str, str] = {}
    base = f"/finetune/workflows/{wf_id}/topics"

    # Build flat list with parent_id for PUT /topics
    flat_topics = []
    for group in TOPIC_HIERARCHY:
        flat_topics.append({
            "id": group["id"],
            "name": group["name"],
            "selected": True,
        })
        for child in group.get("children", []):
            flat_topics.append({
                "id": child["id"],
                "name": child["name"],
                "parent_id": group["id"],
                "selected": True,
            })
            topic_id_map[child["name"]] = child["id"]
        topic_id_map[group["name"]] = group["id"]

    result = api(gateway, "PUT", base, flat_topics)
    if result:
        print(f"  Created {len(flat_topics)} topics")
    else:
        print(f"  Failed to create topics, trying individual POST...")
        for t in flat_topics:
            api(gateway, "POST", base, t)
            topic_id_map[t["name"]] = t["id"]

    print(f"  Total: {len(topic_id_map)} topics")
    return topic_id_map


def seed_records(gateway: str, wf_id: str):
    """Create records for all leaf topics."""
    print("Creating records...")
    records = []

    for topic_id, concepts in TOPIC_CONCEPTS.items():
        for i, concept in enumerate(concepts):
            user_text = USER_TEMPLATES[i % len(USER_TEMPLATES)].format(concept=concept)
            asst_text = ASSISTANT_TEMPLATES[i % len(ASSISTANT_TEMPLATES)].format(concept=concept)

            records.append({
                "id": str(uuid.uuid4()),
                "data": {
                    "input": {
                        "messages": [
                            {"role": "system", "content": SYSTEM_MSG},
                            {"role": "user", "content": user_text},
                        ]
                    },
                    "output": {
                        "messages": [
                            {"role": "assistant", "content": asst_text},
                        ]
                    },
                },
                "topic_id": topic_id,
                "is_generated": True,
            })

    # POST in batches
    batch_size = 50
    base = f"/finetune/workflows/{wf_id}/records"
    for i in range(0, len(records), batch_size):
        batch = records[i : i + batch_size]
        api(gateway, "POST", base, {"records": batch})
        print(f"  Batch {i // batch_size + 1}: {len(batch)} records")

    print(f"  Total: {len(records)} records")


def seed_knowledge_sources(gateway: str, wf_id: str):
    """Create knowledge sources with parts."""
    print("Creating knowledge sources...")

    for ks in KNOWLEDGE_SOURCES:
        filename = ks["name"]
        dummy_content = f"%%PDF-1.4 dummy content for {filename}".encode()

        result = upload_file(
            gateway,
            f"/finetune/workflows/{wf_id}/knowledge",
            filename,
            dummy_content,
        )
        if not result:
            print(f"  SKIP {filename} (upload failed)")
            continue

        source_id = result.get("id", "")
        print(f"  + {filename} ({source_id[:8]}...)")

        # Create parts — endpoint expects an array
        parts_payload = []
        for part in ks["parts"]:
            parts_payload.append({
                "id": str(uuid.uuid4()),
                "title": part["title"],
                "content": part["content"],
                "type": "text",
                "extraction_path": part.get("extraction_path"),
            })

        api(gateway, "POST", f"/finetune/workflows/{wf_id}/knowledge/{source_id}/parts", parts_payload)
        print(f"    {len(parts_payload)} parts")


def seed_topic_relations(gateway: str, wf_id: str):
    """Create topic ↔ source part relations via POST /topics/relations."""
    print("Creating topic-source relations...")

    # Fetch all sources to build title→partId map
    sources_resp = api(gateway, "GET", f"/finetune/workflows/{wf_id}/knowledge")
    if not sources_resp:
        print("  Could not fetch sources")
        return

    sources = sources_resp.get("knowledge_sources", [])
    title_to_part_id: dict[str, str] = {}
    for s in sources:
        for part in s.get("part", []):
            title_to_part_id[part["title"]] = part["id"]

    if not title_to_part_id:
        print("  No parts found")
        return

    # Build relations
    relations = []
    for topic_id, part_titles in TOPIC_PART_LINKS.items():
        for title in part_titles:
            part_id = title_to_part_id.get(title)
            if part_id:
                relations.append({
                    "topic_identifier": topic_id,
                    "part_identifier": part_id,
                })

    if not relations:
        print("  No relations to create")
        return

    result = api(gateway, "POST", f"/finetune/workflows/{wf_id}/topics/relations", {
        "relations": relations,
    })
    if result:
        print(f"  Created {result.get('created', len(relations))} relations")
    else:
        print(f"  Failed to create relations")


def reset(gateway: str, wf_id: str):
    """Delete all data for the workflow."""
    print(f"Resetting workflow {wf_id}...")

    # Delete relations first
    relations = api(gateway, "GET", f"/finetune/workflows/{wf_id}/topics/relations")
    if relations:
        rel_list = relations.get("relations", [])
        if rel_list:
            identifiers = [r["id"] for r in rel_list]
            api(gateway, "DELETE", f"/finetune/workflows/{wf_id}/topics/relations", {
                "identifiers": identifiers,
            })
            print(f"  Deleted {len(identifiers)} relations")

    api(gateway, "DELETE", f"/finetune/workflows/{wf_id}/records")
    print("  Deleted records")

    topics = api(gateway, "GET", f"/finetune/workflows/{wf_id}/topics")
    if topics:
        topic_list = topics.get("topics", [])
        for t in topic_list:
            api(gateway, "DELETE", f"/finetune/workflows/{wf_id}/topics/{t['id']}")
        print(f"  Deleted {len(topic_list)} topics")

    sources = api(gateway, "GET", f"/finetune/workflows/{wf_id}/knowledge")
    if sources:
        source_list = sources.get("knowledge_sources", [])
        for s in source_list:
            api(gateway, "DELETE", f"/finetune/workflows/{wf_id}/knowledge/{s['id']}")
        print(f"  Deleted {len(source_list)} sources")


def main():
    parser = argparse.ArgumentParser(description="Seed mockup workflow data")
    parser.add_argument("--gateway", default="http://localhost:9090", help="Gateway URL")
    parser.add_argument("--reset", action="store_true", help="Delete and recreate all data")
    args = parser.parse_args()

    if args.reset:
        reset(args.gateway, WORKFLOW_ID)

    # Check if workflow exists
    existing = api(args.gateway, "GET", f"/finetune/workflows/{WORKFLOW_ID}")
    if not existing:
        seed_workflow(args.gateway)

    # Check if topics exist
    topics = api(args.gateway, "GET", f"/finetune/workflows/{WORKFLOW_ID}/topics")
    topic_list = topics.get("topics", []) if topics else []

    if not topic_list:
        seed_topics(args.gateway, WORKFLOW_ID)
    else:
        print(f"Topics already exist ({len(topic_list)}), skipping")

    # Check if records exist
    records = api(args.gateway, "GET", f"/finetune/workflows/{WORKFLOW_ID}/records")
    rec_list = records.get("records", []) if records else []

    if not rec_list:
        seed_records(args.gateway, WORKFLOW_ID)
    else:
        print(f"Records already exist ({len(rec_list)}), skipping")

    # Check if sources exist
    sources = api(args.gateway, "GET", f"/finetune/workflows/{WORKFLOW_ID}/knowledge")
    src_list = sources.get("knowledge_sources", []) if sources else []

    if not src_list:
        seed_knowledge_sources(args.gateway, WORKFLOW_ID)
    else:
        print(f"Sources already exist ({len(src_list)}), skipping")

    # Check if relations exist
    relations = api(args.gateway, "GET", f"/finetune/workflows/{WORKFLOW_ID}/topics/relations")
    rel_list = relations.get("relations", []) if relations else []

    if not rel_list:
        seed_topic_relations(args.gateway, WORKFLOW_ID)
    else:
        print(f"Relations already exist ({len(rel_list)}), skipping")

    print("\nDone! Open http://localhost:5173 and select 'Chess Tutor (Mockup)' workflow.")


if __name__ == "__main__":
    main()
