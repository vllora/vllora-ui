"""
Consolidate extracted knowledge parts for quality.

Merges adjacent text parts under the same heading, drops short fragments,
fixes Unicode encoding, and validates title diversity. Run this AFTER
the extraction script produces knowledge_parts.json and BEFORE uploading.

Usage:
    python consolidate_parts.py knowledge/chess-tactics/knowledge_parts.json
    python consolidate_parts.py knowledge/chess-tactics/knowledge_parts.json --min-chars 100
    python consolidate_parts.py knowledge/chess-tactics/knowledge_parts.json --dry-run
"""

import json
import sys
import argparse
from collections import Counter
from pathlib import Path


def fix_unicode_escapes(text: str) -> str:
    """Decode any remaining \\uXXXX escape sequences in a string."""
    if not text:
        return text
    try:
        # If the string contains literal \uXXXX sequences (not actual unicode),
        # decode them. This handles cases where json.dumps was called with
        # ensure_ascii=True or strings were double-escaped.
        if "\\u0" in text or "\\u04" in text:
            return text.encode("utf-8").decode("unicode_escape").encode("latin1").decode("utf-8")
    except (UnicodeDecodeError, UnicodeEncodeError):
        pass
    return text


def _looks_like_false_heading(title: str) -> bool:
    """Detect titles that are sentence fragments, not real section headings.

    Real headings: "Body composition", "Key points", "Protein timing"
    False headings: "The message is simple: eat real food.", "This changes today."
    """
    if not title:
        return False
    # Sentences end with periods (headings rarely do)
    if title.endswith(".") and len(title) > 15:
        return True
    # Sentences start with articles/pronouns/conjunctions followed by lowercase
    sentence_starters = (
        "the ", "a ", "an ", "this ", "that ", "these ", "those ",
        "it ", "we ", "they ", "our ", "for ", "in ", "on ", "to ",
        "america", "together",
    )
    lower = title.lower()
    if any(lower.startswith(s) for s in sentence_starters) and len(title) > 20:
        return True
    return False


def _fix_false_headings(parts: list[dict]) -> list[dict]:
    """Re-parent parts with false heading titles to the previous real heading.

    When Docling marks bold/italic text as section headers, the extraction
    script creates separate parts for them. This merges them back by
    changing their extraction_path to match the previous real-headed part.
    """
    if not parts:
        return parts

    fixed = []
    last_real_path = None
    last_real_title = None

    for part in parts:
        new_part = {**part}  # immutable copy
        title = part.get("title", "")
        part_type = part.get("type", "text")

        # Only fix text parts
        if part_type != "text":
            fixed.append(new_part)
            continue

        if _looks_like_false_heading(title):
            if last_real_path is not None:
                # Re-parent this part under the last real heading
                new_part = {
                    **new_part,
                    "extraction_path": last_real_path,
                    "title": last_real_title or title,
                }
            # Don't update last_real_path — this was a false heading
        else:
            last_real_path = part.get("extraction_path", "")
            last_real_title = title

        fixed.append(new_part)

    return fixed


def consolidate_parts(
    parts: list[dict],
    min_chars: int = 50,
) -> list[dict]:
    """Merge adjacent text parts sharing the same extraction_path, drop short fragments."""
    if not parts:
        return parts

    # Phase 0: Fix false headings before merging
    parts = _fix_false_headings(parts)

    merged: list[dict] = []
    buffer: dict | None = None

    for part in parts:
        # Fix Unicode in content, title, extraction_path
        part["content"] = fix_unicode_escapes(part.get("content", ""))
        if part.get("title"):
            part["title"] = fix_unicode_escapes(part["title"])
        if part.get("extraction_path"):
            part["extraction_path"] = fix_unicode_escapes(part["extraction_path"])

        # Never merge tables or images — only text parts
        if part["type"] != "text":
            if buffer:
                merged.append(buffer)
                buffer = None
            merged.append(part)
            continue

        # Start new buffer or merge into existing
        if buffer is None:
            buffer = _start_buffer(part)
        elif part.get("extraction_path") == buffer.get("extraction_path"):
            _merge_into_buffer(buffer, part)
        else:
            merged.append(buffer)
            buffer = _start_buffer(part)

    if buffer:
        merged.append(buffer)

    # Finalize source_chunks in extraction_metadata
    for p in merged:
        chunks = p.pop("_source_chunks", None)
        if chunks:
            p.setdefault("extraction_metadata", {})["source_chunks"] = sorted(set(chunks))

    # Drop short text parts
    before_count = len(merged)
    consolidated = [
        p for p in merged
        if p["type"] != "text" or len(p.get("content", "")) >= min_chars
    ]
    dropped = before_count - len(consolidated)

    return consolidated, dropped


def _start_buffer(part: dict) -> dict:
    """Create a new merge buffer from a part."""
    buf = dict(part)
    buf["content"] = part.get("content", "")
    buf["_source_chunks"] = list(
        part.get("extraction_metadata", {}).get("source_chunks", [])
    )
    return buf


def _merge_into_buffer(buffer: dict, part: dict) -> None:
    """Merge a part into the existing buffer."""
    buffer["content"] += "\n\n" + part.get("content", "")
    buffer["_source_chunks"].extend(
        part.get("extraction_metadata", {}).get("source_chunks", [])
    )
    # Extend page list
    buf_pages = buffer.get("extraction_metadata", {}).get("pages", [])
    new_pages = part.get("extraction_metadata", {}).get("pages", [])
    buffer.setdefault("extraction_metadata", {})["pages"] = sorted(
        set(buf_pages + new_pages)
    )


def reassign_ids(parts: list[dict], prefix: str) -> None:
    """Reassign sequential IDs after consolidation."""
    for i, part in enumerate(parts):
        part["id"] = f"{prefix}-p-{i + 1:03d}"


def validate_quality(parts: list[dict], total_pages: int | None = None) -> dict:
    """Run quality gate checks, return results dict."""
    text_parts = [p for p in parts if p["type"] == "text"]
    results = {}

    # Parts-per-page ratio
    if total_pages and total_pages > 0:
        ppp = len(parts) / total_pages
        results["parts_per_page"] = {
            "value": round(ppp, 1),
            "status": "OK" if 1 <= ppp <= 15 else "FAIL",
        }

    # Short parts
    short = [p for p in text_parts if len(p.get("content", "")) < 50]
    short_pct = len(short) / max(len(text_parts), 1)
    results["short_parts"] = {
        "count": len(short),
        "total": len(text_parts),
        "pct": round(short_pct * 100, 1),
        "status": "OK" if short_pct < 0.05 else "WARN" if short_pct < 0.2 else "FAIL",
    }

    # Title diversity
    titles = [p.get("title", "") for p in parts]
    title_counts = Counter(titles)
    if title_counts:
        top_title, top_count = title_counts.most_common(1)[0]
        diversity = 1 - (top_count / max(len(parts), 1))
        results["title_diversity"] = {
            "diversity_pct": round(diversity * 100),
            "top_title": top_title,
            "top_count": top_count,
            "status": "OK" if diversity >= 0.5 else "FAIL",
        }

    # Average content length
    if text_parts:
        avg_len = sum(len(p.get("content", "")) for p in text_parts) / len(text_parts)
        results["avg_content_length"] = {
            "value": round(avg_len),
            "status": "OK" if avg_len >= 200 else "WARN" if avg_len >= 100 else "FAIL",
        }

    # Unicode encoding issues
    unicode_issues = sum(
        1 for p in parts
        if any(
            "\\u0" in str(p.get(f, ""))
            for f in ("content", "title", "extraction_path")
        )
    )
    results["unicode_issues"] = {
        "count": unicode_issues,
        "status": "OK" if unicode_issues == 0 else "FAIL",
    }

    # Unique extraction paths
    paths = set(p.get("extraction_path", "") for p in parts)
    results["unique_paths"] = {"count": len(paths)}

    # Distribution
    results["distribution"] = {
        "text": len(text_parts),
        "table": len([p for p in parts if p["type"] == "table"]),
        "image": len([p for p in parts if p["type"] == "image"]),
    }

    # Overall
    statuses = [v.get("status") for v in results.values() if isinstance(v, dict) and "status" in v]
    results["overall"] = "PASS" if all(s in ("OK", "WARN") for s in statuses) else "FAIL"

    return results


def print_report(results: dict) -> None:
    """Print a human-readable quality report."""
    print("\n=== Extraction Quality Report ===\n")

    if "parts_per_page" in results:
        r = results["parts_per_page"]
        print(f"[{r['status']}] Parts/page: {r['value']}")

    if "short_parts" in results:
        r = results["short_parts"]
        print(f"[{r['status']}] Short parts (<50 chars): {r['count']}/{r['total']} ({r['pct']}%)")

    if "title_diversity" in results:
        r = results["title_diversity"]
        print(f"[{r['status']}] Title diversity: {r['diversity_pct']}% (most common: '{r['top_title']}' x{r['top_count']})")

    if "avg_content_length" in results:
        r = results["avg_content_length"]
        print(f"[{r['status']}] Avg text part length: {r['value']} chars")

    if "unicode_issues" in results:
        r = results["unicode_issues"]
        print(f"[{r['status']}] Unicode encoding issues: {r['count']}")

    if "unique_paths" in results:
        print(f"[INFO] Unique extraction paths: {results['unique_paths']['count']}")

    if "distribution" in results:
        d = results["distribution"]
        print(f"[INFO] Distribution: {d['text']} text, {d['table']} table, {d['image']} image")

    overall = results.get("overall", "UNKNOWN")
    action = "Ready to upload" if overall == "PASS" else "Fix extraction before uploading"
    print(f"\n{overall}: {action}")


def main():
    parser = argparse.ArgumentParser(description="Consolidate knowledge parts")
    parser.add_argument("input", help="Path to knowledge_parts.json")
    parser.add_argument("--min-chars", type=int, default=50,
                        help="Minimum content length for text parts (default: 50)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Validate only — don't modify the file")
    parser.add_argument("--id-prefix", type=str, default=None,
                        help="Part ID prefix (default: derived from source name)")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"ERROR: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)

    parts = data.get("parts", [])
    source = data.get("source", {})
    total_pages = source.get("metadata", {}).get("total_pages")

    original_count = len(parts)
    print(f"Input: {original_count} parts from '{source.get('name', '?')}'")

    if args.dry_run:
        results = validate_quality(parts, total_pages)
        print_report(results)
        sys.exit(0 if results["overall"] == "PASS" else 1)

    # Consolidate
    consolidated, dropped = consolidate_parts(parts, min_chars=args.min_chars)
    print(f"Consolidated: {original_count} → {len(consolidated)} parts "
          f"(merged adjacent, dropped {dropped} short fragments)")

    # Reassign IDs
    prefix = args.id_prefix
    if not prefix:
        name = source.get("name", "doc")
        # Slugify
        import re
        prefix = re.sub(r"[^a-z0-9]", "-", name.lower().rsplit(".", 1)[0])
        prefix = re.sub(r"-+", "-", prefix).strip("-")
    reassign_ids(consolidated, prefix)

    # Validate after consolidation
    results = validate_quality(consolidated, total_pages)
    print_report(results)

    # Write output
    data["parts"] = consolidated
    with open(input_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"\nWrote {len(consolidated)} parts to {input_path}")

    # Also update parts-index.json if it exists alongside
    index_path = input_path.parent / "parts-index.json"
    if index_path.exists() or True:  # always produce index
        index = []
        for part in consolidated:
            index.append({
                "id": part["id"],
                "type": part["type"],
                "title": part.get("title", ""),
                "extraction_path": part.get("extraction_path", ""),
                "pages": part.get("extraction_metadata", {}).get("pages", []),
                "content_preview": part.get("content", "")[:200],
                "source_doc": source.get("name", ""),
            })
        with open(index_path, "w", encoding="utf-8") as f:
            json.dump(index, f, indent=2, ensure_ascii=False)
        print(f"Wrote {len(index)} entries to {index_path}")

    sys.exit(0 if results["overall"] == "PASS" else 1)


if __name__ == "__main__":
    main()
