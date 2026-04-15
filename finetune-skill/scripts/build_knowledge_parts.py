# /// script
# requires-python = ">=3.10"
# ///
"""
Generic extraction: OpenDataLoader `kids[]` → knowledge_parts.json + parts-index.json

Handles 90% of documents without LLM reasoning. Walks the OpenDataLoader tree,
merges undersized fragments, splits oversized sections, and produces
structured parts with typed content (text, table, image).

Usage:
    python3 build_knowledge_parts.py extraction-result.json -o knowledge_parts.json --slug doc-slug

For unusual documents, the knowledge-extractor agent falls back to writing
a custom extract.py instead of using this script.
"""

import argparse
import base64
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


# ─── OpenDataLoader path ────────────────────────────────────────────────────────

# Element types ODL emits that we treat as noise and skip entirely
ODL_NOISE_TYPES = {"header", "footer"}
ODL_PROSE_SEMANTIC_TYPES = {"paragraph", "text", "text_block"}
ODL_SHORT_TEXT_EXEMPT_TYPES = {"caption", "list", "list_item"}


def _odl_bbox(el: dict) -> dict | None:
    """Translate ODL's `[l, b, r, t]` array into the bbox object that
    PdfHighlightViewer expects: `{page, l, t, r, b, coord_origin}`."""
    page = el.get("page number")
    bbox_arr = el.get("bounding box")
    if page is None or not isinstance(bbox_arr, list) or len(bbox_arr) != 4:
        return None
    l, b, r, t = bbox_arr
    return {
        "page": page,
        "l": l,
        "t": t,
        "r": r,
        "b": b,
        "coord_origin": "BOTTOMLEFT",
    }


def _odl_tag_source(kids: list[dict]) -> str:
    has_typed_headings = any(
        k.get("type") == "heading" and k.get("heading level") is not None
        for k in kids
    )
    return "structure_tree" if has_typed_headings else "xycut_fallback"


def _normalize_semantic_type(raw_type: str) -> str:
    mapping = {
        "text block": "text_block",
        "list item": "list_item",
    }
    return mapping.get(raw_type, raw_type.replace(" ", "_"))


def _escape_md_cell(text: str) -> str:
    return (text or "").replace("|", "\\|").replace("\n", "<br>").strip()


def flatten_odl_text(node_or_kids) -> str:
    """Recursively flatten ODL content nodes into readable text."""
    if not node_or_kids:
        return ""

    if isinstance(node_or_kids, list):
        parts = [flatten_odl_text(child) for child in node_or_kids]
        return "\n".join(p for p in parts if p).strip()

    if not isinstance(node_or_kids, dict):
        return str(node_or_kids).strip()

    el_type = node_or_kids.get("type", "")
    if el_type in ODL_NOISE_TYPES or el_type == "image":
        return ""
    if el_type == "list":
        return render_odl_list(node_or_kids)

    parts: list[str] = []
    content = (node_or_kids.get("content", "") or "").strip()
    if content:
        parts.append(content)

    kids = node_or_kids.get("kids", [])
    if isinstance(kids, list) and kids:
        child_text = "\n".join(
            text for text in (flatten_odl_text(child) for child in kids) if text
        ).strip()
        if child_text and child_text not in parts:
            parts.append(child_text)

    return "\n".join(parts).strip()


def render_odl_list(element: dict, depth: int = 0) -> str:
    """Render an ODL list element as markdown text."""
    items = element.get("list items", [])
    style = (element.get("numbering style", "") or "").lower()
    ordered = any(token in style for token in ("ordered", "number", "decimal"))
    indent = "  " * depth
    lines: list[str] = []

    for idx, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            continue
        marker = f"{idx}." if ordered else "-"
        item_parts: list[str] = []
        content = (item.get("content", "") or "").strip()
        if content:
            item_parts.append(content)

        nested_blocks: list[str] = []
        for kid in item.get("kids", []) or []:
            if not isinstance(kid, dict):
                continue
            kid_type = kid.get("type", "")
            if kid_type == "list":
                nested = render_odl_list(kid, depth + 1)
                if nested:
                    nested_blocks.append(nested)
                continue
            nested_text = flatten_odl_text(kid)
            if nested_text and nested_text not in item_parts:
                item_parts.append(nested_text)

        body = " ".join(part.replace("\n", " ").strip() for part in item_parts if part).strip()
        if body:
            lines.append(f"{indent}{marker} {body}")
        else:
            lines.append(f"{indent}{marker}")

        for block in nested_blocks:
            for line in block.splitlines():
                lines.append(line)

    return "\n".join(lines).strip()


def extract_odl_table_grid(element: dict) -> tuple[list[str], list[list[str]], int, int]:
    """Extract headers and rows from an ODL table element."""
    table_rows = element.get("rows", []) or []
    num_rows = element.get("number of rows") or max(
        (row.get("row number", 0) for row in table_rows if isinstance(row, dict)),
        default=0,
    )
    num_cols = element.get("number of columns") or max(
        (
            cell.get("column number", 0) + max(0, cell.get("column span", 1) - 1)
            for row in table_rows
            if isinstance(row, dict)
            for cell in row.get("cells", []) or []
            if isinstance(cell, dict)
        ),
        default=0,
    )

    if num_rows <= 0 or num_cols <= 0:
        return [], [], 0, 0

    grid = [["" for _ in range(num_cols)] for _ in range(num_rows)]
    for row in table_rows:
        if not isinstance(row, dict):
            continue
        row_idx = max(0, row.get("row number", 1) - 1)
        for cell in row.get("cells", []) or []:
            if not isinstance(cell, dict):
                continue
            cell_text = flatten_odl_text(cell.get("kids", []))
            col_idx = max(0, cell.get("column number", 1) - 1)
            row_span = max(1, cell.get("row span", 1))
            col_span = max(1, cell.get("column span", 1))
            for rr in range(row_idx, min(num_rows, row_idx + row_span)):
                for cc in range(col_idx, min(num_cols, col_idx + col_span)):
                    if not grid[rr][cc]:
                        grid[rr][cc] = cell_text

    if num_rows >= 2 and all(cell.strip() for cell in grid[0]):
        headers = grid[0]
        rows = grid[1:]
    else:
        headers = [f"Col {idx}" for idx in range(1, num_cols + 1)]
        rows = grid

    return headers, rows, num_rows, num_cols


def render_table_markdown(headers: list[str], rows: list[list[str]]) -> str:
    """Render a markdown table for UI display and retrieval."""
    if not headers:
        return ""
    header_row = "| " + " | ".join(_escape_md_cell(cell) for cell in headers) + " |"
    separator = "| " + " | ".join("---" for _ in headers) + " |"
    body_rows = [
        "| " + " | ".join(_escape_md_cell(cell) for cell in row[: len(headers)]) + " |"
        for row in rows
    ]
    return "\n".join([header_row, separator, *body_rows]).strip()


def build_odl_caption_links(kids: list[dict]) -> dict[int, int]:
    """Map caption element IDs to linked content IDs where available."""
    links: dict[int, int] = {}
    for el in kids:
        if not isinstance(el, dict) or el.get("type") != "caption":
            continue
        el_id = el.get("id")
        linked_id = el.get("linked content id")
        if isinstance(el_id, int) and isinstance(linked_id, int):
            links[el_id] = linked_id
    return links


def _guess_image_mimetype(fmt: str | None) -> str:
    if not fmt:
        return "image/png"
    fmt = fmt.lower()
    if fmt == "jpeg":
        return "image/jpeg"
    return f"image/{fmt}"


def _resolve_odl_image_content(element: dict, asset_base_dir: Path) -> tuple[str | None, dict]:
    """Resolve ODL image payload to a data URI when possible."""
    meta: dict = {}
    fmt = element.get("format")
    if fmt:
        meta["mimetype"] = _guess_image_mimetype(fmt)

    data = element.get("data")
    if isinstance(data, str) and data.strip():
        if data.startswith("data:image"):
            return data, meta
        mimetype = meta.get("mimetype", "image/png")
        return f"data:{mimetype};base64,{data.strip()}", meta

    source = element.get("source")
    if isinstance(source, str) and source.strip():
        img_path = asset_base_dir / source
        if img_path.exists() and img_path.is_file():
            payload = base64.b64encode(img_path.read_bytes()).decode("ascii")
            mimetype = meta.get("mimetype", _guess_image_mimetype(img_path.suffix.lstrip(".")))
            meta["mimetype"] = mimetype
            return f"data:{mimetype};base64,{payload}", meta

    return None, meta


def _odl_bbox_distance(a: dict | None, b: dict | None) -> float | None:
    if not a or not b or a.get("page") != b.get("page"):
        return None
    ax = (a.get("l", 0) + a.get("r", 0)) / 2
    ay = (a.get("t", 0) + a.get("b", 0)) / 2
    bx = (b.get("l", 0) + b.get("r", 0)) / 2
    by = (b.get("t", 0) + b.get("b", 0)) / 2
    return ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5


def _current_odl_heading_context(
    heading_stack: list[tuple[int, str]],
    slug: str,
    fallback_index: int,
) -> tuple[str, str, int | None, str | None]:
    heading = heading_stack[-1][1] if heading_stack else ""
    level = heading_stack[-1][0] if heading_stack else None
    parent = heading_stack[-2][1] if len(heading_stack) > 1 else None
    heading_slug = slugify(heading) if heading else f"section-{fallback_index}"
    extraction_path = f"{slug}/{heading_slug}"
    title = heading or f"Section {fallback_index}"
    return title, extraction_path, level, parent


def _build_odl_intermediate_items(
    odl_data: dict,
    slug: str,
    asset_base_dir: Path,
) -> tuple[list[dict], str]:
    kids = odl_data.get("kids", [])
    tag_source = _odl_tag_source(kids)
    caption_links = build_odl_caption_links(kids)
    heading_stack: list[tuple[int, str]] = []
    items: list[dict] = []

    for el in kids:
        if not isinstance(el, dict):
            continue
        el_type = el.get("type", "")
        if el_type in ODL_NOISE_TYPES:
            continue

        if el_type == "heading":
            level = el.get("heading level") or 1
            text = (el.get("content", "") or "").strip()
            while heading_stack and heading_stack[-1][0] >= level:
                heading_stack.pop()
            if text:
                heading_stack.append((level, text))
            continue

        page = el.get("page number")
        bbox = _odl_bbox(el)
        title, extraction_path, heading_level, parent_section = _current_odl_heading_context(
            heading_stack, slug, len(items) + 1
        )
        semantic_type = _normalize_semantic_type(el_type) or "text"
        item: dict = {
            "type": "text",
            "content": "",
            "title": title,
            "extraction_path": extraction_path,
            "pages": [page] if page is not None else [],
            "bboxes": [bbox] if bbox else [],
            "heading_level": heading_level,
            "parent_section": parent_section,
            "semantic_type": semantic_type,
            "content_metadata": {},
            "_odl_element_ids": [el.get("id")] if el.get("id") is not None else [],
            "_odl_caption_target_id": caption_links.get(el.get("id")) if isinstance(el.get("id"), int) else None,
            "_odl_prev_table_id": el.get("previous table id"),
            "_odl_next_table_id": el.get("next table id"),
        }

        if el_type == "table":
            headers, rows, num_rows, num_cols = extract_odl_table_grid(el)
            markdown = render_table_markdown(headers, rows)
            item["type"] = "table"
            item["content"] = markdown
            item["content_metadata"] = {
                "num_rows": num_rows,
                "num_cols": num_cols,
                "headers": headers,
                "rows": rows,
            }
        elif el_type == "image":
            image_content, image_meta = _resolve_odl_image_content(el, asset_base_dir)
            if not image_content:
                continue
            item["type"] = "image"
            item["content"] = image_content
            item["content_metadata"] = image_meta
        elif el_type == "list":
            item["content"] = render_odl_list(el)
        elif el_type == "text block":
            item["content"] = flatten_odl_text(el.get("kids", []))
        elif el_type in {"paragraph", "caption", "list item"}:
            item["content"] = (el.get("content", "") or "").strip() or flatten_odl_text(el.get("kids", []))
        else:
            item["semantic_type"] = _normalize_semantic_type(el_type) if el_type else "text"
            item["content"] = (el.get("content", "") or "").strip() or flatten_odl_text(el.get("kids", []))

        if item["content"]:
            items.append(item)

    return items, tag_source


def merge_odl_table_chain(items: list[dict]) -> list[dict]:
    """Merge linked multi-page ODL table chains into one logical table item."""
    table_items = {
        item["_odl_element_ids"][0]: item
        for item in items
        if item.get("type") == "table" and item.get("_odl_element_ids")
    }
    visited: set[int] = set()
    merged_by_first_id: dict[int, dict] = {}
    carried_ids: set[int] = set()

    for table_id, item in table_items.items():
        if table_id in visited:
            continue

        chain_ids = {table_id}
        stack = [table_id]
        while stack:
            current = stack.pop()
            if current in visited:
                continue
            visited.add(current)
            current_item = table_items.get(current)
            if not current_item:
                continue
            for neighbor in (
                current_item.get("_odl_prev_table_id"),
                current_item.get("_odl_next_table_id"),
            ):
                if isinstance(neighbor, int) and neighbor in table_items and neighbor not in chain_ids:
                    chain_ids.add(neighbor)
                    stack.append(neighbor)

        chain = [table_items[cid] for cid in chain_ids]
        if len(chain) == 1:
            merged_by_first_id[table_id] = chain[0]
            continue

        start = next(
            (
                entry for entry in chain
                if not isinstance(entry.get("_odl_prev_table_id"), int)
                or entry.get("_odl_prev_table_id") not in chain_ids
            ),
            min(chain, key=lambda entry: items.index(entry)),
        )

        ordered = [start]
        seen_chain = {start["_odl_element_ids"][0]}
        current = start
        while True:
            next_id = current.get("_odl_next_table_id")
            if not isinstance(next_id, int) or next_id not in table_items or next_id in seen_chain:
                break
            nxt = table_items[next_id]
            if nxt not in chain:
                break
            ordered.append(nxt)
            seen_chain.add(next_id)
            current = nxt

        for entry in chain:
            if entry["_odl_element_ids"][0] not in seen_chain:
                ordered.append(entry)

        merged = dict(ordered[0])
        merged["pages"] = sorted({
            page for entry in ordered for page in entry.get("pages", [])
        })
        merged["bboxes"] = [
            bbox for entry in ordered for bbox in entry.get("bboxes", [])
        ]
        merged["_odl_element_ids"] = [
            element_id
            for entry in ordered
            for element_id in entry.get("_odl_element_ids", [])
        ]

        first_meta = dict(ordered[0].get("content_metadata", {}))
        headers = first_meta.get("headers", [])
        rows = []
        for idx, entry in enumerate(ordered):
            meta = entry.get("content_metadata", {})
            if idx == 0:
                rows.extend(meta.get("rows", []))
                continue
            entry_headers = meta.get("headers", [])
            entry_rows = list(meta.get("rows", []))
            if headers and entry_headers and entry_rows and entry_headers == headers and entry_rows[0] == headers:
                entry_rows = entry_rows[1:]
            rows.extend(entry_rows)

        merged["content_metadata"] = {
            **first_meta,
            "headers": headers,
            "rows": rows,
            "num_rows": len(rows) + (1 if headers else 0),
            "num_cols": len(headers) if headers else first_meta.get("num_cols", 0),
        }
        merged["content"] = render_table_markdown(headers, rows)
        merged_by_first_id[start["_odl_element_ids"][0]] = merged
        carried_ids.update(chain_ids - {start["_odl_element_ids"][0]})

    result: list[dict] = []
    for item in items:
        element_ids = item.get("_odl_element_ids", [])
        primary_id = element_ids[0] if element_ids else None
        if primary_id in carried_ids:
            continue
        if primary_id in merged_by_first_id:
            result.append(merged_by_first_id[primary_id])
        else:
            result.append(item)
    return result


def _merge_odl_text_item(prev: dict, item: dict) -> dict:
    content = f"{prev['content']}\n\n{item['content']}".strip()
    merged = {
        **prev,
        "content": content,
        "pages": sorted(set(prev.get("pages", []) + item.get("pages", []))),
        "bboxes": prev.get("bboxes", []) + item.get("bboxes", []),
        "_odl_element_ids": prev.get("_odl_element_ids", []) + item.get("_odl_element_ids", []),
    }
    if prev.get("content_metadata") or item.get("content_metadata"):
        merged["content_metadata"] = {
            **prev.get("content_metadata", {}),
            **item.get("content_metadata", {}),
        }
    return merged


def _split_odl_item(item: dict, max_chars: int) -> list[dict]:
    if item.get("type") != "text" or len(item.get("content", "")) <= max_chars:
        return [item]
    segments = split_large_chunk(item["content"], max_chars)
    if len(segments) <= 1:
        return [item]
    split_items: list[dict] = []
    for idx, segment in enumerate(segments, start=1):
        new_item = dict(item)
        new_item["content"] = segment
        new_item["_odl_part_suffix"] = f"-part{idx}"
        split_items.append(new_item)
    return split_items


def consolidate_odl_items(items: list[dict], min_chars: int, max_chars: int) -> list[dict]:
    """Merge adjacent prose-like ODL text items and drop noisy fragments."""
    merged: list[dict] = []
    for item in items:
        semantic = item.get("semantic_type")
        is_mergeable = (
            item.get("type") == "text"
            and semantic in ODL_PROSE_SEMANTIC_TYPES
        )
        if (
            merged
            and is_mergeable
            and merged[-1].get("type") == "text"
            and merged[-1].get("semantic_type") in ODL_PROSE_SEMANTIC_TYPES
            and merged[-1].get("extraction_path") == item.get("extraction_path")
        ):
            merged[-1] = _merge_odl_text_item(merged[-1], item)
        else:
            merged.append(item)

    filtered: list[dict] = []
    for item in merged:
        if item.get("type") != "text":
            filtered.extend(_split_odl_item(item, max_chars))
            continue
        semantic = item.get("semantic_type")
        content = item.get("content", "")
        if len(content) < min_chars and semantic not in ODL_SHORT_TEXT_EXEMPT_TYPES:
            continue
        filtered.extend(_split_odl_item(item, max_chars))
    return filtered


def link_odl_captions(items: list[dict]) -> None:
    """Link caption parts to table/image parts via explicit IDs or proximity."""
    targets = [
        item for item in items
        if item.get("type") in {"table", "image"}
    ]
    target_by_id: dict[int, dict] = {}
    for item in targets:
        for element_id in item.get("_odl_element_ids", []):
            if isinstance(element_id, int):
                target_by_id[element_id] = item

    captions = [
        item for item in items
        if item.get("type") == "text" and item.get("semantic_type") == "caption"
    ]

    for caption in captions:
        target = None
        linked_id = caption.get("_odl_caption_target_id")
        if isinstance(linked_id, int):
            target = target_by_id.get(linked_id)

        if target is None and caption.get("pages") and caption.get("bboxes"):
            same_page = [
                candidate for candidate in targets
                if candidate.get("pages") and candidate["pages"][0] == caption["pages"][0]
                and candidate.get("bboxes")
            ]
            distances = []
            for candidate in same_page:
                distance = _odl_bbox_distance(caption["bboxes"][0], candidate["bboxes"][0])
                if distance is not None:
                    distances.append((distance, candidate))
            distances.sort(key=lambda item: item[0])
            if distances:
                best_distance, best_target = distances[0]
                second_distance = distances[1][0] if len(distances) > 1 else None
                if best_distance <= 140 and (second_distance is None or second_distance - best_distance > 40):
                    target = best_target

        if target is None:
            continue

        caption.setdefault("content_metadata", {})["caption_for_part_id"] = target["id"]
        target_meta = target.setdefault("content_metadata", {})
        target_meta.setdefault("caption", caption.get("content", ""))
        target_meta.setdefault("caption_part_id", caption["id"])


def finalize_odl_parts(items: list[dict], slug: str, tag_source: str) -> list[dict]:
    parts: list[dict] = []
    for idx, item in enumerate(items, start=1):
        part_id = f"{slug}-p-{idx:03d}{item.get('_odl_part_suffix', '')}"
        extraction_metadata: dict = {"pages": item.get("pages", [])}
        if item.get("bboxes"):
            extraction_metadata["bboxes"] = item["bboxes"]
        if item.get("semantic_type") is not None:
            extraction_metadata["semantic_type"] = item["semantic_type"]
        if item.get("heading_level") is not None:
            extraction_metadata["heading_level"] = item["heading_level"]
        if item.get("parent_section") is not None:
            extraction_metadata["parent_section"] = item["parent_section"]
        extraction_metadata["tag_source"] = tag_source

        part = {
            "id": part_id,
            "source_document": slug,
            "extraction_path": item.get("extraction_path", f"{slug}/section-{idx}"),
            "heading": item.get("title", ""),
            "content": item.get("content", ""),
            "char_count": len(item.get("content", "")),
            "word_count": len(item.get("content", "").split()),
            "type": item.get("type", "text"),
            "title": item.get("title", f"Section {idx}"),
            "pages": item.get("pages", []),
            "extraction_metadata": extraction_metadata,
        }
        content_metadata = item.get("content_metadata", {})
        if content_metadata:
            part["content_metadata"] = content_metadata
        parts.append(part)
        item["id"] = part_id

    link_odl_captions(items)
    # Copy post-link metadata back into finalized parts
    for part, item in zip(parts, items):
        content_metadata = item.get("content_metadata", {})
        if content_metadata:
            part["content_metadata"] = content_metadata
    return parts


def build_odl_parts(
    odl_data: dict,
    slug: str,
    min_chars: int,
    max_chars: int,
    asset_base_dir: Path,
) -> tuple[list[dict], str]:
    items, tag_source = _build_odl_intermediate_items(odl_data, slug, asset_base_dir)
    items = merge_odl_table_chain(items)
    items = consolidate_odl_items(items, min_chars=min_chars, max_chars=max_chars)
    parts = finalize_odl_parts(items, slug, tag_source)
    return parts, tag_source


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
        description="Convert OpenDataLoader extraction output to knowledge_parts.json"
    )
    parser.add_argument("extraction_result",
                        help="Path to OpenDataLoader extraction-result.json")
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

    input_path = Path(args.extraction_result)
    if not input_path.exists():
        print(f"Error: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    data = json.loads(input_path.read_text())

    if "kids" not in data:
        print("Error: Expected OpenDataLoader extraction output with top-level `kids[]`", file=sys.stderr)
        sys.exit(1)

    source_unit_count = len(data.get("kids", []))
    parts, tag_source = build_odl_parts(
        data,
        args.slug,
        min_chars=args.min_part_size,
        max_chars=args.max_part_size,
        asset_base_dir=input_path.parent,
    )
    print(
        f"Detected OpenDataLoader input: {source_unit_count} elements "
        f"(tag_source={tag_source})"
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

    # Auto-journal milestone
    from pipeline_journal import find_project_dir, log_milestone
    proj = find_project_dir(output_path)
    if proj:
        log_milestone(proj, "step_2_extraction", "build_parts", "completed",
                       f"Built {len(parts)} knowledge parts ({type_summary}) from {source_unit_count} elements. Avg {avg_chars} chars.",
                       {"total_parts": len(parts), "type_counts": type_counts, "total_chars": total_chars, "slug": args.slug})
    print(f"  Index: {index_path} ({len(index)} entries)")


if __name__ == "__main__":
    main()
