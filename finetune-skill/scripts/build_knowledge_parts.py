# /// script
# requires-python = ">=3.10"
# ///
"""
Generic extraction: Docling chunks → knowledge_parts.json + parts-index.json

Handles 90% of documents without LLM reasoning. Groups chunks by section
headings, splits oversized chunks, merges undersized ones, and produces
structured parts with typed content (text, table, image).

Usage:
    python3 build_knowledge_parts.py docling-result.json -o knowledge_parts.json --slug doc-slug

For unusual documents, the knowledge-extractor agent falls back to writing
a custom extract.py instead of using this script.
"""

import argparse
import json
import re
import sys
from pathlib import Path


# ─── Configuration ──────────────────────────────────────────────────────────────
MIN_PART_CHARS = 100       # Merge parts smaller than this with neighbors
MAX_PART_CHARS = 3000      # Split parts larger than this
TARGET_PART_CHARS = 800    # Ideal part size
SKIP_HEADINGS = {          # Noise headings to skip entirely
    "table of contents", "contents", "copyright", "disclaimer",
    "blank page", "this page intentionally left blank",
}


def slugify(text: str) -> str:
    """Convert text to a URL-safe slug."""
    s = text.lower().strip()
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'[\s-]+', '-', s)
    return s.strip('-')[:80]


def is_noise(chunk: dict) -> bool:
    """Check if a chunk is noise (TOC, copyright, blank pages)."""
    headings = chunk.get("headings", [])
    text = (chunk.get("text", "") or "").strip()

    # Skip by heading
    for h in headings:
        if h.lower().strip() in SKIP_HEADINGS:
            return True

    # Skip very short chunks with no real content
    if len(text) < 20:
        return True

    return False


def detect_type(chunk: dict) -> str:
    """Detect part type from chunk metadata."""
    text = chunk.get("text", "") or ""
    headings = chunk.get("headings", [])

    # Table detection: pipes, consistent column separators, or "table" in heading
    pipe_lines = sum(1 for line in text.split('\n') if '|' in line)
    if pipe_lines > 3:
        return "table"

    for h in headings:
        h_lower = h.lower()
        # Match "table"/"tables" as a whole word — not inside "vegetables", "acceptable", etc.
        if re.search(r'\btables?\b', h_lower) or "schedule" in h_lower:
            return "table"

    # Image detection (captions)
    captions = chunk.get("captions", [])
    if captions:
        return "image"

    return "text"


def split_large_chunk(text: str, max_chars: int) -> list[str]:
    """Split a large text into smaller segments at paragraph boundaries."""
    paragraphs = re.split(r'\n\s*\n', text)
    segments: list[str] = []
    current = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        if len(current) + len(para) + 2 > max_chars and current:
            segments.append(current.strip())
            current = para
        else:
            current = f"{current}\n\n{para}" if current else para

    if current.strip():
        segments.append(current.strip())

    # If we still have oversized segments, split at sentence boundaries
    final: list[str] = []
    for seg in segments:
        if len(seg) <= max_chars:
            final.append(seg)
        else:
            sentences = re.split(r'(?<=[.!?])\s+', seg)
            current = ""
            for sent in sentences:
                if len(current) + len(sent) + 1 > max_chars and current:
                    final.append(current.strip())
                    current = sent
                else:
                    current = f"{current} {sent}" if current else sent
            if current.strip():
                final.append(current.strip())

    return final if final else [text]


def build_bbox_lookup(data: dict) -> dict[str, list[dict]]:
    """Build a lookup from doc_item ref (e.g. '#/texts/2') to its prov bbox entries.

    Returns: { ref_string: [{ page_no, bbox: {l, t, r, b, coord_origin} }] }
    """
    lookup: dict[str, list[dict]] = {}
    documents = data.get("documents", [])
    if isinstance(documents, dict):
        documents = list(documents.values())
    for doc in documents:
        jc = doc.get("content", {}).get("json_content")
        if not jc:
            continue
        if isinstance(jc, str):
            jc = json.loads(jc)
        for collection in ("texts", "tables", "pictures"):
            for item in jc.get(collection, []):
                ref = item.get("self_ref")
                prov = item.get("prov")
                if ref and prov:
                    lookup[ref] = prov
    return lookup


def collect_bboxes(chunk: dict, bbox_lookup: dict[str, list[dict]]) -> list[dict]:
    """Collect all bboxes for a chunk by resolving its doc_items refs."""
    bboxes: list[dict] = []
    for ref in chunk.get("doc_items", []):
        for prov_entry in bbox_lookup.get(ref, []):
            bbox = prov_entry.get("bbox")
            page_no = prov_entry.get("page_no")
            if bbox and page_no is not None:
                bboxes.append({
                    "page": page_no,
                    "l": bbox.get("l", 0),
                    "t": bbox.get("t", 0),
                    "r": bbox.get("r", 0),
                    "b": bbox.get("b", 0),
                    "coord_origin": bbox.get("coord_origin", "BOTTOMLEFT"),
                })
    return bboxes


def build_parts(
    chunks: list[dict],
    slug: str,
    min_chars: int,
    max_chars: int,
    bbox_lookup: dict[str, list[dict]] | None = None,
) -> list[dict]:
    """Convert Docling chunks into knowledge parts."""
    raw_parts: list[dict] = []

    for chunk in chunks:
        if is_noise(chunk):
            continue

        text = (chunk.get("text", "") or "").strip()
        if not text:
            continue

        headings = chunk.get("headings", [])
        heading = headings[0] if headings else ""
        pages = chunk.get("page_numbers", [])
        part_type = detect_type(chunk)

        # Collect bboxes for this chunk (empty list if no docling data)
        chunk_bboxes = collect_bboxes(chunk, bbox_lookup) if bbox_lookup else []

        # Split oversized chunks
        if len(text) > max_chars:
            segments = split_large_chunk(text, max_chars)
            for j, seg in enumerate(segments):
                suffix = f"-part{j + 1}" if len(segments) > 1 else ""
                raw_parts.append({
                    "heading": heading,
                    "text": seg,
                    "pages": pages,
                    "type": part_type,
                    "suffix": suffix,
                    "bboxes": chunk_bboxes,
                })
        else:
            raw_parts.append({
                "heading": heading,
                "text": text,
                "pages": pages,
                "type": part_type,
                "suffix": "",
                "bboxes": chunk_bboxes,
            })

    # Merge undersized parts with neighbors
    merged: list[dict] = []
    for part in raw_parts:
        if merged and len(part["text"]) < min_chars and len(merged[-1]["text"]) < max_chars:
            prev = merged[-1]
            merged[-1] = {
                **prev,
                "text": f"{prev['text']}\n\n{part['text']}",
                "pages": sorted(set(prev["pages"] + part["pages"])),
                "bboxes": prev.get("bboxes", []) + part.get("bboxes", []),
            }
        else:
            merged.append(part)

    # Build final parts with IDs
    parts: list[dict] = []
    for i, part in enumerate(merged):
        heading = part["heading"]
        heading_slug = slugify(heading) if heading else f"section-{i + 1}"
        part_id = f"{slug}-{heading_slug}{part['suffix']}"

        # Deduplicate IDs
        existing_ids = {p["id"] for p in parts}
        if part_id in existing_ids:
            part_id = f"{part_id}-{i}"

        extraction_path = f"{slug}/{heading_slug}" if heading else f"{slug}/section-{i + 1}"

        # Build extraction_metadata with pages + bboxes (if available)
        em: dict = {"pages": part["pages"]}
        part_bboxes = part.get("bboxes", [])
        if part_bboxes:
            em["bboxes"] = part_bboxes

        parts.append({
            "id": part_id,
            "source_document": slug,
            "extraction_path": extraction_path,
            "heading": heading,
            "content": part["text"],
            "char_count": len(part["text"]),
            "word_count": len(part["text"].split()),
            "type": part["type"],
            "title": heading or f"Section {i + 1}",
            "pages": part["pages"],
            "extraction_metadata": em,
        })

    return parts


def build_index(parts: list[dict]) -> list[dict]:
    """Build a lightweight parts-index from full parts."""
    return [
        {
            "id": p["id"],
            "type": p["type"],
            "title": p["title"],
            "extraction_path": p["extraction_path"],
            "pages": p["pages"],
            "content_preview": p["content"][:150],
            "source_doc": p["source_document"],
        }
        for p in parts
    ]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert Docling chunks to knowledge_parts.json"
    )
    parser.add_argument("docling_result", help="Path to docling-result.json")
    parser.add_argument("-o", "--output", required=True, help="Output knowledge_parts.json path")
    parser.add_argument("--slug", required=True, help="Document slug for part IDs")
    parser.add_argument("--min-part-size", type=int, default=MIN_PART_CHARS,
                        help=f"Merge parts smaller than this (default: {MIN_PART_CHARS})")
    parser.add_argument("--max-part-size", type=int, default=MAX_PART_CHARS,
                        help=f"Split parts larger than this (default: {MAX_PART_CHARS})")
    parser.add_argument("--include-sections", help="Comma-separated heading substrings to include (skip others)")
    parser.add_argument("--exclude-sections", help="Comma-separated heading substrings to exclude")
    parser.add_argument("--tables", choices=["separate", "merge"], default="separate",
                        help="Keep tables as separate parts or merge with text (default: separate)")
    args = parser.parse_args()

    # Load Docling result
    docling_path = Path(args.docling_result)
    if not docling_path.exists():
        print(f"Error: File not found: {docling_path}", file=sys.stderr)
        sys.exit(1)

    data = json.loads(docling_path.read_text())
    chunks = data.get("chunks", [])

    if not chunks:
        print("Error: No chunks found in Docling result", file=sys.stderr)
        sys.exit(1)

    # Apply section filters
    if args.include_sections:
        include = [s.strip().lower() for s in args.include_sections.split(",")]
        chunks = [
            c for c in chunks
            if any(
                inc in h.lower()
                for h in c.get("headings", [""])
                for inc in include
            )
        ]
        print(f"Filtered to {len(chunks)} chunks matching: {include}")

    if args.exclude_sections:
        exclude = [s.strip().lower() for s in args.exclude_sections.split(",")]
        before = len(chunks)
        chunks = [
            c for c in chunks
            if not any(
                exc in h.lower()
                for h in c.get("headings", [""])
                for exc in exclude
            )
        ]
        print(f"Excluded {before - len(chunks)} chunks matching: {exclude}")

    # Build bbox lookup from docling json_content (optional — not all PDFs use docling)
    bbox_lookup = build_bbox_lookup(data) if data.get("documents") else None

    # Build parts
    parts = build_parts(
        chunks, args.slug,
        min_chars=args.min_part_size,
        max_chars=args.max_part_size,
        bbox_lookup=bbox_lookup,
    )

    if not parts:
        print("Error: Produced 0 parts — document may need custom extraction", file=sys.stderr)
        sys.exit(1)

    # Write knowledge_parts.json
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps({"parts": parts}, indent=2, ensure_ascii=False))

    # Write parts-index.json alongside
    index_path = output_path.parent / "parts-index.json"
    index = build_index(parts)
    index_path.write_text(json.dumps({"parts": index}, indent=2, ensure_ascii=False))

    # Summary
    type_counts: dict[str, int] = {}
    for p in parts:
        type_counts[p["type"]] = type_counts.get(p["type"], 0) + 1

    type_summary = ", ".join(f"{c} {t}" for t, c in sorted(type_counts.items()))
    total_chars = sum(p["char_count"] for p in parts)
    avg_chars = total_chars // len(parts) if parts else 0

    print(f"Wrote {len(parts)} parts to {output_path} ({type_summary})")
    print(f"  Avg size: {avg_chars} chars, Total: {total_chars} chars")
    print(f"  Index: {index_path} ({len(index)} entries)")


if __name__ == "__main__":
    main()
