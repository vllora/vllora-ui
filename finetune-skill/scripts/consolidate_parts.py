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
import re
import sys
import argparse
from collections import Counter
from pathlib import Path


MERGEABLE_TEXT_SEMANTIC_TYPES = {"paragraph", "text", "text_block", None}
SHORT_TEXT_EXEMPT_SEMANTIC_TYPES = {"caption", "list", "list_item"}


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


# OCR garble repair (runs on table headers before validation).
# Some PDFs produce cells like "Error Message EEErrorrorror Mr Mr Meeessssssaaagggeee"
# where the extractor duplicates the word with character repetitions. Pattern is
# always: <clean word(s)> <garbled suffix with 3+ identical consecutive chars>.
# Strip everything from the first run of 3+ identical chars onward.
_OCR_GARBLE_RE = re.compile(r"([A-Za-z])\1{2,}")


def _clean_ocr_garbled_cell(cell: str) -> str:
    """If `cell` contains the 3+-identical-char OCR garble pattern, truncate to
    the clean prefix. Returns the original cell if no garble detected."""
    if not cell:
        return cell
    m = _OCR_GARBLE_RE.search(cell)
    if not m:
        return cell
    # Walk backwards from match to the end of the last clean word
    cut = m.start()
    head = cell[:cut].rstrip(" \t")
    # If head ended with a lowercased prefix of the garble word (e.g. "E" before
    # "EEError"), drop it too — the extractor left the first letter un-doubled.
    # Remove trailing single-letter-then-space patterns that match the garble
    # letter case-insensitively.
    tokens = head.rsplit(" ", 1)
    if len(tokens) == 2 and len(tokens[1]) <= 2 and tokens[1].lower() == tokens[1][0].lower() * len(tokens[1]):
        head = tokens[0]
    return head


def _fix_ocr_garbled_tables(parts: list[dict]) -> tuple[list[dict], int]:
    """Scan pipe-table rows for OCR garble and rewrite cells in place.

    Returns (parts, cleaned_row_count). Only touches header rows — body rows
    with garbled values are passed through unchanged because heuristics there
    risk destroying legitimate values like 'Error: 404' or product codes.
    """
    cleaned = 0
    for p in parts:
        content = p.get("content")
        if not isinstance(content, str) or "|" not in content:
            continue
        lines = content.split("\n")
        if not lines:
            continue
        # Only rewrite the first pipe line (header) and any line where the
        # garble pattern is present — body rows with 3+ repeats could be valid
        # (product codes). Be conservative.
        new_lines = []
        hit = False
        for i, line in enumerate(lines):
            stripped = line.strip()
            if not stripped.startswith("|") or not _OCR_GARBLE_RE.search(line):
                new_lines.append(line)
                continue
            cells = line.split("|")
            new_cells = [
                _clean_ocr_garbled_cell(c) if _OCR_GARBLE_RE.search(c) else c
                for c in cells
            ]
            new_lines.append("|".join(new_cells))
            hit = True
            cleaned += 1
        if hit:
            p["content"] = "\n".join(new_lines)
            p.setdefault("extraction_metadata", {})["ocr_garble_repaired"] = True
    return parts, cleaned


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

    When the extractor marks bold/italic text as section headers, the extraction
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


def _merge_repeated_title_sequences(parts: list[dict]) -> list[dict]:
    """Merge sequences of parts with generic repeated titles into paired parts.

    Academic papers (especially clinical guidelines) repeat section headings
    like "Recommendation" and "Rationale" for every topic. The extractor creates
    separate parts for each, losing the recommendation↔rationale association.

    This function detects repeated generic titles and merges each instance
    with its following context (e.g., Recommendation + Rationale pair) into
    a single part with a disambiguated title.

    Example: "Recommendation" → "Rationale" → "Recommendation" → "Rationale"
    becomes: "Recommendation 1 + Rationale" → "Recommendation 2 + Rationale"
    """
    if not parts:
        return parts

    # Detect generic repeated titles (same title appears 5+ times)
    title_counts: dict[str, int] = {}
    for p in parts:
        title = p.get("title", "").strip()
        if title and p.get("type") == "text":
            title_counts[title] = title_counts.get(title, 0) + 1

    repeated_titles = {t for t, c in title_counts.items() if c >= 5}
    if not repeated_titles:
        return parts

    # Find the dominant repeated title (the one that appears most)
    dominant_title = max(repeated_titles, key=lambda t: title_counts[t])

    # Merge strategy: each instance of a repeated title starts a new group.
    # All parts until the next repeated-title instance are merged into one part.
    # The merged part gets a numbered title: "Rationale 1", "Rationale 2", etc.
    merged: list[dict] = []
    current_group: list[dict] = []
    group_counter: dict[str, int] = {}

    def _flush_group():
        if not current_group:
            return
        # First part's title is the group title
        base_title = current_group[0].get("title", "untitled")
        count = group_counter.get(base_title, 0) + 1
        group_counter[base_title] = count

        if len(current_group) == 1:
            # Single part — just number the title
            result = {**current_group[0]}
            result["title"] = f"{base_title} {count}"
            merged.append(result)
        else:
            # Multiple parts — merge content, combine titles
            combined_content_parts = []
            sub_titles = []
            all_pages: list = []
            all_chunks: list = []
            all_bboxes: list = []
            for p in current_group:
                t = p.get("title", "")
                c = p.get("content", "")
                if t and t != base_title and t not in sub_titles:
                    sub_titles.append(t)
                if c:
                    if t and t != base_title:
                        combined_content_parts.append(f"### {t}\n\n{c}")
                    else:
                        combined_content_parts.append(c)
                all_pages.extend(p.get("extraction_metadata", {}).get("pages", []))
                all_chunks.extend(p.get("extraction_metadata", {}).get("source_chunks", []))
                all_bboxes.extend(p.get("extraction_metadata", {}).get("bboxes", []))

            title_suffix = f" + {', '.join(sub_titles)}" if sub_titles else ""
            result = {**current_group[0]}
            result["title"] = f"{base_title} {count}{title_suffix}"
            result["content"] = "\n\n".join(combined_content_parts)
            result["char_count"] = len(result["content"])
            result["word_count"] = len(result["content"].split())
            if all_pages:
                result.setdefault("extraction_metadata", {})["pages"] = sorted(set(all_pages))
            if all_chunks:
                result.setdefault("extraction_metadata", {})["source_chunks"] = sorted(set(all_chunks))
            if all_bboxes:
                result.setdefault("extraction_metadata", {})["bboxes"] = all_bboxes
            merged.append(result)

    for part in parts:
        title = part.get("title", "").strip()
        is_text = part.get("type") == "text"

        if is_text and title in repeated_titles:
            # This starts a new group — flush the previous one
            _flush_group()
            current_group = [part]
        elif current_group and is_text:
            # Check if this part has a distinct section heading (e.g., "A.1", "B.4", "D.12")
            # that indicates it's a separate knowledge unit, not a continuation.
            # Don't merge Q&A parts — they're individually valuable for topic linking.
            has_section_id = bool(re.match(r'^[A-Z]\.\d+', title))
            if has_section_id:
                # Flush current group and start this as a standalone part
                _flush_group()
                current_group = []
                merged.append(part)
            else:
                # Continue the current group (this part follows a repeated-title part)
                current_group.append(part)
        else:
            # Non-text part or no active group
            _flush_group()
            current_group = []
            merged.append(part)

    _flush_group()
    return merged


def consolidate_parts(
    parts: list[dict],
    min_chars: int = 50,
) -> list[dict]:
    """Merge adjacent text parts sharing the same extraction_path, drop short fragments."""
    if not parts:
        return parts

    # Phase 0: Fix false headings before merging
    parts = _fix_false_headings(parts)

    # Phase 0.25: Repair OCR-garbled table headers (repeated-char pattern
    # like "EEErrorrorror Mr Mr Meeessssssaaagggeee"). Left unchecked, these
    # propagate into training records and confuse the grader's header-aware logic.
    parts, ocr_cleaned = _fix_ocr_garbled_tables(parts)
    if ocr_cleaned:
        print(f"  Repaired OCR-garble in {ocr_cleaned} pipe-row(s)")

    # Phase 0.5: Merge repeated-title sequences (e.g., Recommendation/Rationale pairs)
    parts = _merge_repeated_title_sequences(parts)

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
        elif (
            part.get("extraction_path") == buffer.get("extraction_path")
            and _is_mergeable_text_part(part)
            and _is_mergeable_text_part(buffer)
        ):
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

    # Consolidate table fragments with the same title.
    # The extractor splits multi-page tables (e.g., EIC lookup table) into many fragments
    # per page, all with the same title. These are NOT duplicates — each contains
    # a different portion of the table (different income ranges, etc.).
    # Strategy: merge all fragments with the same title into one combined table part,
    # but drop tiny fragments (<50 chars) that are just headers like "(Continued)".
    table_by_title: dict[str, list[dict]] = {}
    non_table_parts: list[dict] = []
    for p in merged:
        if p["type"] == "table":
            title = p.get("title", "").strip()
            if title:
                table_by_title.setdefault(title, []).append(p)
            else:
                non_table_parts.append(p)
        else:
            non_table_parts.append(p)

    merged_tables = 0
    for title, table_parts in table_by_title.items():
        if len(table_parts) <= 1:
            non_table_parts.append(table_parts[0])
            continue

        # Drop tiny fragments (<50 chars) like "(Continued)" headers
        substantial = [p for p in table_parts if len(p.get("content", "")) >= 50]
        if not substantial:
            substantial = table_parts  # keep all if none are substantial

        if len(substantial) == 1:
            non_table_parts.append(substantial[0])
            merged_tables += len(table_parts) - 1
        else:
            # Merge all substantial fragments into one combined table part
            combined = dict(substantial[0])
            combined["content"] = "\n\n".join(p.get("content", "") for p in substantial)
            # Merge page ranges and bboxes
            all_pages = []
            all_bboxes = []
            for p in substantial:
                all_pages.extend(p.get("extraction_metadata", {}).get("pages", []))
                all_bboxes.extend(p.get("extraction_metadata", {}).get("bboxes", []))
            if all_pages:
                combined.setdefault("extraction_metadata", {})["pages"] = sorted(set(all_pages))
            if all_bboxes:
                combined.setdefault("extraction_metadata", {})["bboxes"] = all_bboxes
            non_table_parts.append(combined)
            merged_tables += len(table_parts) - 1

    # Preserve original ordering
    id_order = {p.get("id", ""): i for i, p in enumerate(merged)}
    merged = sorted(non_table_parts, key=lambda p: id_order.get(p.get("id", ""), 999))

    if merged_tables:
        print(f"  [INFO] Consolidated {merged_tables} table fragments into combined table parts (by title)")

    # Drop short text parts
    before_count = len(merged)
    consolidated = [
        p for p in merged
        if p["type"] != "text"
        or len(p.get("content", "")) >= min_chars
        or _is_short_text_exempt(p)
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


def _semantic_type(part: dict) -> str | None:
    return part.get("extraction_metadata", {}).get("semantic_type")


def _is_mergeable_text_part(part: dict) -> bool:
    semantic = _semantic_type(part)
    return semantic in MERGEABLE_TEXT_SEMANTIC_TYPES


def _is_short_text_exempt(part: dict) -> bool:
    semantic = _semantic_type(part)
    if semantic in SHORT_TEXT_EXEMPT_SEMANTIC_TYPES:
        return True
    content_meta = part.get("content_metadata", {}) or {}
    return "caption_for_part_id" in content_meta


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
    # Extend bboxes
    buf_bboxes = buffer.get("extraction_metadata", {}).get("bboxes", [])
    new_bboxes = part.get("extraction_metadata", {}).get("bboxes", [])
    if new_bboxes:
        buffer.setdefault("extraction_metadata", {})["bboxes"] = buf_bboxes + new_bboxes


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
            # FAIL if <50% diverse (most parts share one title)
            # WARN if 50-70% diverse (many repeated titles, consider merging)
            # OK if >=70% diverse
            "status": "OK" if diversity >= 0.70 else "WARN" if diversity >= 0.50 else "FAIL",
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
    parser.add_argument("--preserve-ids", action="store_true",
                        help="Keep original part IDs instead of reassigning sequential ones")
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

    # Reassign IDs (unless --preserve-ids)
    if not args.preserve_ids:
        prefix = args.id_prefix
        if not prefix:
            # Derive prefix from the parent directory name of the input file,
            # which is the document slug (e.g., "usda-protein-foods-reference")
            prefix = input_path.parent.name or "doc"
        reassign_ids(consolidated, prefix)
    else:
        print("  Preserving original part IDs")

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
    # Derive source_doc: prefer source.name, fall back to part's source_document,
    # then infer from the parent directory name (which is the doc slug).
    source_name = source.get("name", "")
    if not source_name:
        # Try first part's source_document field (set by build_knowledge_parts.py)
        for p in consolidated:
            if p.get("source_document"):
                source_name = p["source_document"]
                break
    if not source_name:
        # Fall back to parent directory name (the doc slug)
        source_name = input_path.parent.name

    if index_path.exists() or True:  # always produce index
        index = []
        for part in consolidated:
            index.append({
                "id": part["id"],
                "type": part["type"],
                "title": part.get("title", ""),
                "extraction_path": part.get("extraction_path", ""),
                "pages": part.get("pages", []) or part.get("extraction_metadata", {}).get("pages", []),
                "content_preview": part.get("content", "")[:200],
                "source_doc": part.get("source_document", source_name),
            })
        with open(index_path, "w", encoding="utf-8") as f:
            json.dump(index, f, indent=2, ensure_ascii=False)
        print(f"Wrote {len(index)} entries to {index_path}")

    # Auto-journal milestone
    from pipeline_journal import find_project_dir, log_milestone
    proj = find_project_dir(input_path)
    if proj:
        log_milestone(proj, "step_2_extraction", "consolidate_parts", "completed",
                       f"Consolidated {original_count}→{len(consolidated)} parts (dropped {dropped} short). Quality: {results['overall']}",
                       {"before": original_count, "after": len(consolidated), "dropped": dropped, "quality": results["overall"]})

    sys.exit(0 if results["overall"] == "PASS" else 1)


if __name__ == "__main__":
    main()
