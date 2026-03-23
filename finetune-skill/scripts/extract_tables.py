# /// script
# requires-python = ">=3.10"
# ///
"""
Upgrade text parts to table parts using structured Docling table data.

After the extraction script produces knowledge_parts.json, this script
inspects the original Docling result to find parts that reference tables
(#/tables/N in doc_items) and upgrades them:

  - Changes type from "text" to "table"
  - Adds content_metadata with headers, rows, num_rows, num_cols, caption
  - Keeps the markdown rendering in content (for display)

Usage:
    python extract_tables.py --docling-result docling-result.json --parts-file knowledge_parts.json
    python extract_tables.py --docling-result docling-result.json --parts-file knowledge_parts.json --dry-run
"""

import argparse
import json
import sys
from pathlib import Path


def resolve_ref(pointer: str, doc: dict):
    """Resolve a JSON pointer like '#/texts/115' or '#/tables/0'."""
    parts = pointer.lstrip("#/").split("/")
    if len(parts) != 2:
        return None
    collection, index_str = parts
    try:
        index = int(index_str)
    except ValueError:
        return None
    items = doc.get(collection, [])
    if index < len(items):
        return items[index]
    return None


def extract_table_metadata(table_item: dict, doc: dict) -> dict:
    """Extract structured metadata from a Docling TableItem."""
    data = table_item.get("data", {})
    num_rows = data.get("num_rows", 0)
    num_cols = data.get("num_cols", 0)
    grid = data.get("grid", [])
    table_cells = data.get("table_cells", [])

    headers = []
    rows = []

    if grid and len(grid) > 0:
        # Use grid (2D array of cell dicts) — more reliable
        for row_idx, row in enumerate(grid):
            row_texts = [cell.get("text", "") for cell in row]
            is_header_row = all(
                cell.get("column_header", False) for cell in row
            )
            if row_idx == 0 and is_header_row:
                headers = row_texts
            else:
                rows.append(row_texts)
    elif table_cells:
        # Fallback: reconstruct from flat table_cells list
        cell_grid = [[None] * num_cols for _ in range(num_rows)]
        for cell in table_cells:
            r = cell.get("start_row_offset_idx", 0)
            c = cell.get("start_col_offset_idx", 0)
            if r < num_rows and c < num_cols:
                cell_grid[r][c] = cell.get("text", "")

        for row_idx, row in enumerate(cell_grid):
            row_texts = [t if t is not None else "" for t in row]
            is_header = row_idx == 0 and all(
                cell.get("column_header", False)
                for cell in table_cells
                if cell.get("start_row_offset_idx", -1) == 0
            )
            if is_header:
                headers = row_texts
            else:
                rows.append(row_texts)

    # Extract caption from table's captions refs
    caption = None
    caption_refs = table_item.get("captions", [])
    for ref_obj in caption_refs:
        ref_str = ref_obj.get("$ref", "") if isinstance(ref_obj, dict) else ""
        if ref_str:
            caption_item = resolve_ref(ref_str, doc)
            if caption_item:
                caption = caption_item.get("text", "")
                break

    metadata = {
        "num_rows": num_rows,
        "num_cols": num_cols,
        "headers": headers,
        "rows": rows,
    }
    if caption:
        metadata["caption"] = caption

    return metadata


def build_table_index(docling_result: dict) -> dict:
    """Build a mapping from table JSON pointer to structured metadata."""
    docs = docling_result.get("documents", [])
    if not docs:
        return {}

    content = docs[0].get("content", {})
    json_content = content.get("json_content", content)
    if isinstance(json_content, str):
        json_content = json.loads(json_content)

    tables = json_content.get("tables", [])
    table_index = {}

    for idx, table_item in enumerate(tables):
        pointer = f"#/tables/{idx}"
        metadata = extract_table_metadata(table_item, json_content)
        table_index[pointer] = metadata

    # Propagate headers from first table to continuation tables
    # (common in multi-page tables like USDA nutrient listings)
    # Only propagate if the source headers were from an actual header row
    # (detected by Docling's column_header flag), not a data row
    first_headers = None
    for idx in range(len(tables)):
        pointer = f"#/tables/{idx}"
        meta = table_index[pointer]
        grid = tables[idx].get("data", {}).get("grid", [])
        has_real_header = (
            grid
            and len(grid) > 0
            and all(cell.get("column_header", False) for cell in grid[0])
        )
        # Heuristic: real headers don't contain pure numeric values
        looks_like_real_headers = has_real_header and meta["headers"] and not any(
            h.replace(".", "").replace(",", "").isdigit()
            for h in meta["headers"]
        )
        if meta["headers"] and looks_like_real_headers:
            first_headers = meta["headers"]
        elif not looks_like_real_headers and first_headers and meta["num_cols"] == len(first_headers):
            # Demote false headers back to data rows
            if meta["headers"]:
                table_index[pointer] = {
                    **meta,
                    "headers": first_headers,
                    "rows": [meta["headers"]] + meta["rows"],
                }
            else:
                table_index[pointer] = {**meta, "headers": first_headers}

    return table_index


def build_chunk_table_map(docling_result: dict) -> dict:
    """Map chunk indices to their table pointers."""
    chunks = docling_result.get("chunks", [])
    chunk_map = {}

    for chunk in chunks:
        chunk_idx = chunk.get("chunk_index", -1)
        doc_items = chunk.get("doc_items", [])
        table_refs = [
            item for item in doc_items
            if isinstance(item, str) and "/tables/" in item
        ]
        if table_refs:
            chunk_map[chunk_idx] = table_refs

    return chunk_map


def upgrade_parts(
    parts_data: dict,
    table_index: dict,
    chunk_table_map: dict,
) -> tuple[dict, int]:
    """Upgrade text parts that reference tables to table type."""
    parts = parts_data.get("parts", [])
    upgraded_count = 0
    upgraded_parts = []

    for part in parts:
        new_part = {**part}  # immutable — create new dict

        # Check if this part references a table via extraction_metadata
        ext_meta = part.get("extraction_metadata", {})
        doc_item = ext_meta.get("doc_item", "")
        source_chunks = ext_meta.get("source_chunks", [])

        # Method 1: direct doc_item reference to a table
        if doc_item and "/tables/" in doc_item and doc_item in table_index:
            table_meta = table_index[doc_item]
            new_part = {
                **new_part,
                "type": "table",
                "content_metadata": {
                    **part.get("content_metadata", {}),
                    **table_meta,
                },
            }
            upgraded_count += 1
            upgraded_parts.append(new_part)
            continue

        # Method 2: source_chunks reference chunks that contain tables
        table_refs_for_part = []
        for chunk_idx in source_chunks:
            if chunk_idx in chunk_table_map:
                table_refs_for_part.extend(chunk_table_map[chunk_idx])

        if table_refs_for_part and part.get("type") == "text":
            # Use the first table reference
            primary_ref = table_refs_for_part[0]
            if primary_ref in table_index:
                table_meta = table_index[primary_ref]
                # Only upgrade if the part content looks like a table
                content = part.get("content", "")
                pipe_lines = sum(
                    1 for line in content.split("\n") if "|" in line
                )
                if pipe_lines >= 3:  # at least header + separator + 1 row
                    new_part = {
                        **new_part,
                        "type": "table",
                        "content_metadata": {
                            **part.get("content_metadata", {}),
                            **table_meta,
                        },
                    }
                    upgraded_count += 1

        upgraded_parts.append(new_part)

    return {**parts_data, "parts": upgraded_parts}, upgraded_count


def main():
    parser = argparse.ArgumentParser(
        description="Upgrade text parts to table parts using Docling table data"
    )
    parser.add_argument(
        "--docling-result",
        required=True,
        help="Path to the Docling result JSON file",
    )
    parser.add_argument(
        "--parts-file",
        required=True,
        help="Path to knowledge_parts.json to upgrade",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would change without modifying the file",
    )
    args = parser.parse_args()

    docling_path = Path(args.docling_result)
    parts_path = Path(args.parts_file)

    if not docling_path.exists():
        print(f"[ERROR] Docling result not found: {docling_path}", file=sys.stderr)
        sys.exit(1)
    if not parts_path.exists():
        print(f"[ERROR] Parts file not found: {parts_path}", file=sys.stderr)
        sys.exit(1)

    # Load inputs
    with open(docling_path) as f:
        docling_result = json.load(f)
    with open(parts_path) as f:
        parts_data = json.load(f)

    # Build table index from Docling structured data
    table_index = build_table_index(docling_result)
    chunk_table_map = build_chunk_table_map(docling_result)

    print(f"[INFO] Found {len(table_index)} tables in Docling result")
    print(f"[INFO] Found {len(chunk_table_map)} chunks with table references")

    # Show table summaries
    for pointer, meta in table_index.items():
        caption = meta.get("caption", "untitled")[:60]
        print(
            f"  {pointer}: {meta['num_rows']}×{meta['num_cols']}"
            f" headers={meta['headers'][:3]}... caption=\"{caption}\""
        )

    # Upgrade parts
    original_parts = parts_data.get("parts", [])
    original_text = sum(1 for p in original_parts if p.get("type") == "text")
    original_table = sum(1 for p in original_parts if p.get("type") == "table")

    upgraded_data, upgraded_count = upgrade_parts(
        parts_data, table_index, chunk_table_map
    )

    new_text = sum(
        1 for p in upgraded_data["parts"] if p.get("type") == "text"
    )
    new_table = sum(
        1 for p in upgraded_data["parts"] if p.get("type") == "table"
    )

    print(f"\n[INFO] Before: {original_text} text, {original_table} table")
    print(f"[INFO] After:  {new_text} text, {new_table} table")
    print(f"[INFO] Upgraded {upgraded_count} parts from text → table")

    if args.dry_run:
        print("\n[DRY RUN] No changes written.")
        # Show sample upgraded part
        for p in upgraded_data["parts"]:
            if p.get("type") == "table" and p.get("content_metadata", {}).get("headers"):
                meta = p["content_metadata"]
                print(f"\n  Sample upgraded part: {p.get('id', '?')}")
                print(f"  Headers: {meta.get('headers', [])}")
                print(f"  Rows: {meta.get('num_rows')} × {meta.get('num_cols')}")
                sample_rows = meta.get("rows", [])[:3]
                for row in sample_rows:
                    print(f"    {row}")
                break
        sys.exit(0)

    if upgraded_count == 0:
        print("[INFO] No parts to upgrade — all tables already typed correctly.")
        sys.exit(0)

    # Write updated parts file
    with open(parts_path, "w") as f:
        json.dump(upgraded_data, f, indent=2, ensure_ascii=False)
    print(f"[OK] Updated {parts_path}")


if __name__ == "__main__":
    main()
