# /// script
# requires-python = ">=3.10"
# dependencies = ["camelot-py", "opencv-python-headless"]
# ///
"""
Camelot-based table extraction fallback for PDFs with complex tables.

Activates when validate_extraction.py detects table quality issues (inconsistent
columns, mixed content, missing metadata). Uses Camelot's stream mode which handles
multi-column regulatory tables that the default extractor may still garble.

Proven 99.1-99.7% accuracy on EPA Drinking Water Standards tables (12 columns,
12 pages, multi-row headers) where ODL output produced shifted columns.

Usage:
    # Extract tables from PDF and replace broken parts in knowledge_parts.json
    python camelot_extract_tables.py \
        --pdf pdfs/EPA-Drinking-Water-Standards-2018.pdf \
        --parts finetune-project/knowledge/epa-drinking-water-standards-2018/knowledge_parts.json

    # Preview only (don't modify knowledge_parts.json)
    python camelot_extract_tables.py \
        --pdf pdfs/EPA-Drinking-Water-Standards-2018.pdf \
        --parts finetune-project/knowledge/epa-drinking-water-standards-2018/knowledge_parts.json \
        --preview

    # Extract specific pages
    python camelot_extract_tables.py --pdf doc.pdf --parts kp.json --pages 9-20
"""

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import camelot
except ImportError:
    print(
        "Error: camelot-py not installed. Run: pip install camelot-py opencv-python-headless",
        file=sys.stderr,
    )
    sys.exit(1)


def extract_tables_from_pdf(
    pdf_path: str,
    pages: str = "all",
    flavor: str = "stream",
) -> list[dict]:
    """Extract tables from PDF using Camelot.

    Returns a list of table dicts with headers, rows, and metadata.
    Uses stream mode by default (best for whitespace-aligned tables).
    Falls back to lattice mode if stream finds nothing.
    """
    tables_out: list[dict] = []

    try:
        tables = camelot.read_pdf(pdf_path, pages=pages, flavor=flavor)
    except Exception as e:
        print(f"  Camelot {flavor} failed: {e}", file=sys.stderr)
        return []

    if not tables and flavor == "stream":
        # Fallback to lattice
        try:
            tables = camelot.read_pdf(pdf_path, pages=pages, flavor="lattice")
            if tables:
                print(f"  Stream found 0 tables, lattice found {len(tables)}", file=sys.stderr)
        except Exception:
            pass

    for t in tables:
        df = t.df
        if df.shape[0] < 2 or df.shape[1] < 2:
            continue  # skip trivial tables

        accuracy = t.accuracy
        page = t.page

        # Detect header rows (rows where most cells are column-name-like)
        header_rows = _detect_header_rows(df)
        data_start = header_rows + 1 if header_rows >= 0 else 0

        # Build headers from header rows
        if header_rows >= 0:
            headers = _build_headers(df, header_rows)
        else:
            headers = [f"col_{i}" for i in range(df.shape[1])]

        # Build data rows (skip separator/divider rows)
        rows: list[list[str]] = []
        for i in range(data_start, df.shape[0]):
            row = [str(v).strip() if v else "-" for v in df.iloc[i]]
            # Skip rows that are all dashes or empty
            if all(v in ("-", "", "—") for v in row):
                continue
            # Skip rows that look like section dividers (one cell spans all columns)
            non_empty = [v for v in row if v not in ("-", "", "—")]
            if len(non_empty) == 1 and len(row) > 3:
                # Section header row (e.g., "ORGANICS", "INORGANICS")
                rows.append(row)  # keep it — useful context
                continue
            rows.append(row)

        tables_out.append({
            "headers": headers,
            "rows": rows,
            "num_rows": len(rows),
            "num_cols": df.shape[1],
            "page": page,
            "accuracy": accuracy,
        })

    return tables_out


def _detect_header_rows(df) -> int:
    """Find the last header row index. Returns -1 if no headers detected.

    Header rows typically contain column names with units (mg/L, µg/m³)
    or standard column identifiers. We look for the row where most cells
    contain alphabetic text (not numeric data).
    """
    max_header_row = -1
    for i in range(min(6, df.shape[0])):  # check first 6 rows
        row = [str(v).strip() for v in df.iloc[i]]
        non_empty = [v for v in row if v and v != "-"]
        if not non_empty:
            continue

        # Count cells that look like headers (contain letters, not just numbers)
        header_like = sum(
            1 for v in non_empty
            if re.search(r'[a-zA-Z]', v) and not re.match(r'^[\d.,\-]+$', v)
        )

        if header_like >= len(non_empty) * 0.5:
            max_header_row = i

    return max_header_row


def _build_headers(df, last_header_row: int) -> list[str]:
    """Build column headers from multi-row header rows.

    Camelot splits multi-level PDF headers into separate rows. For example:

        Row 0: [blank]  [blank]  "Drinking Water Standards"(title)  ...
        Row 1: "March 2018"  [blank]  [blank]  ...  "Page 1 of 12"
        Row 2: [blank]  [blank]  "Standards"(group)  ...  "Health Advisories"(group)
        Row 3: [blank]  [blank]  [blank]  ...  "10-kg Child"(subgroup)
        Row 4: [blank]  "CASRN"  "Status"  "MCLG"  "MCL"  "Status HA"  "One-day"  ...
        Row 5: "Chemicals"  "Number"  "Reg."  "(mg/L)"  "(mg/L)"  "Document"  ...

    Strategy: for each column, collect non-empty values from the LAST TWO
    header rows only (these contain the actual column name + units). Skip
    earlier rows which are spanning group headers and page noise.

    This avoids both hardcoding specific noise strings AND losing column names
    by taking only the deepest row.
    """
    page_noise = re.compile(
        r'((?:January|February|March|April|May|June|July|August|September|'
        r'October|November|December)\s+\d{4}'
        r'|Page\s+\d+\s+of\s+\d+)',
        re.IGNORECASE,
    )

    # Identify the "detail rows" — the last 2 header rows that contain
    # actual column names (not spanning group headers).
    # Spanning group rows have mostly empty cells; detail rows have mostly filled cells.
    row_fill_rates = []
    for row in range(last_header_row + 1):
        filled = sum(
            1 for col in range(df.shape[1])
            if str(df.iloc[row, col]).strip() not in ("", "-")
        )
        row_fill_rates.append(filled / df.shape[1])

    # Detail rows: the last N rows with >40% filled cells (typically 2 rows)
    detail_rows = [
        row for row in range(last_header_row + 1)
        if row_fill_rates[row] > 0.4
    ]
    # If none qualify, fall back to the last 2 rows
    if not detail_rows:
        detail_rows = list(range(max(0, last_header_row - 1), last_header_row + 1))

    headers: list[str] = []
    for col in range(df.shape[1]):
        parts = []
        for row in detail_rows:
            val = str(df.iloc[row, col]).strip()
            val = re.sub(r'\s+', ' ', val)
            if val and val != "-":
                # Strip page noise
                val = page_noise.sub('', val).strip()
                if val:
                    parts.append(val)

        header = " ".join(parts).strip() if parts else f"col_{col}"
        headers.append(header)
    return headers


def stitch_multi_page_tables(tables: list[dict]) -> list[dict]:
    """Stitch tables that span multiple pages.

    Multi-page tables have the same column count and similar headers.
    The first occurrence defines the headers; subsequent pages contribute
    only data rows. Repeating header rows in continuation pages are detected
    and removed.

    Ref: Camelot Issue #278 — multi-page tables require manual stitching.
    """
    if not tables:
        return []

    # Group tables by column count — same col count likely = same table
    by_cols: dict[int, list[dict]] = {}
    for t in tables:
        by_cols.setdefault(t["num_cols"], []).append(t)

    stitched: list[dict] = []

    for num_cols, group in sorted(by_cols.items()):
        if len(group) == 1:
            stitched.append(group[0])
            continue

        # Sort by page number
        group.sort(key=lambda t: t["page"])

        # Check if headers are similar (same column structure = continuation)
        primary = group[0]
        primary_headers = [h.lower().strip() for h in primary["headers"]]

        combined_rows: list[list[str]] = list(primary["rows"])
        combined_pages: list[int] = [primary["page"]]

        for t in group[1:]:
            t_headers = [h.lower().strip() for h in t["headers"]]

            # Check header similarity (at least 60% match)
            if primary_headers and t_headers:
                matches = sum(
                    1 for a, b in zip(primary_headers, t_headers)
                    if a == b or a in b or b in a
                )
                similarity = matches / max(len(primary_headers), len(t_headers))
            else:
                similarity = 0

            if similarity >= 0.5:
                # Continuation of the same table — skip repeating header rows
                for row in t["rows"]:
                    # Check if row is a repeating header
                    row_lower = [v.lower().strip() for v in row]
                    is_header_repeat = sum(
                        1 for a, b in zip(row_lower, primary_headers)
                        if a == b or a in b or b in a
                    ) >= len(row) * 0.4
                    if not is_header_repeat:
                        combined_rows.append(row)
                combined_pages.append(t["page"])
            else:
                # Different table — start a new group
                stitched.append({
                    **primary,
                    "rows": combined_rows,
                    "num_rows": len(combined_rows),
                    "pages": combined_pages,
                })
                primary = t
                primary_headers = t_headers
                combined_rows = list(t["rows"])
                combined_pages = [t["page"]]

        # Flush last group
        stitched.append({
            **primary,
            "rows": combined_rows,
            "num_rows": len(combined_rows),
            "pages": combined_pages,
        })

    return stitched


def table_to_markdown(table: dict) -> str:
    """Convert a table dict to markdown pipe-delimited format."""
    headers = table["headers"]
    rows = table["rows"]

    lines: list[str] = []
    # Header row
    lines.append("| " + " | ".join(headers) + " |")
    # Separator
    lines.append("| " + " | ".join("---" for _ in headers) + " |")
    # Data rows
    for row in rows:
        # Pad/trim to match header count
        padded = row[:len(headers)] + ["-"] * max(0, len(headers) - len(row))
        lines.append("| " + " | ".join(padded) + " |")

    return "\n".join(lines)


def replace_table_parts(
    parts_data: dict,
    stitched_tables: list[dict],
    pdf_name: str,
) -> tuple[dict, int]:
    """Replace broken table parts in knowledge_parts.json with Camelot-extracted tables.

    Matching strategy:
    1. Match by page overlap (Camelot table pages vs part pages)
    2. Match by content similarity (contaminant names appearing in both)
    3. For unmatched Camelot tables, add as new parts

    Returns (updated_parts_data, replaced_count).
    """
    parts = parts_data.get("parts", [])
    replaced_count = 0

    # Build a map of existing table parts by page
    table_part_indices: list[int] = []
    for i, p in enumerate(parts):
        if p.get("type") == "table":
            table_part_indices.append(i)

    # Sort stitched tables by size (largest first) — largest tables should match
    # largest parts, preventing small junk tables from claiming big part slots.
    stitched_tables = sorted(stitched_tables, key=lambda t: t["num_rows"], reverse=True)

    # Sort table parts by content size (largest first) for size-based matching
    table_part_indices_by_size = sorted(
        table_part_indices,
        key=lambda i: len(parts[i].get("content", "")),
        reverse=True,
    )

    # For each stitched table, find the best matching part to replace
    used_part_indices: set[int] = set()
    replacements: list[tuple[int, dict]] = []  # (part_index, new_part)

    for st in stitched_tables:
        st_pages = set(st.get("pages", [st.get("page", 0)]))

        # Strategy 1: Match by page overlap
        best_match = -1
        best_overlap = 0
        for idx in table_part_indices:
            if idx in used_part_indices:
                continue
            part = parts[idx]
            part_pages = set(part.get("pages", []))
            if not part_pages:
                ext_pages = part.get("extraction_metadata", {}).get("pages", [])
                part_pages = set(ext_pages)

            overlap = len(st_pages & part_pages)
            if overlap > best_overlap:
                best_overlap = overlap
                best_match = idx

        # Strategy 2: Match by size — largest Camelot table → largest part
        if best_match == -1:
            for idx in table_part_indices_by_size:
                if idx in used_part_indices:
                    continue
                best_match = idx
                break

        # Strategy 3: Content matching as last resort
        if best_match == -1:
            sample_values = set()
            for row in st["rows"][:10]:
                for cell in row:
                    if cell and cell != "-" and len(cell) > 2:
                        sample_values.add(cell.strip().lower())

            for idx in table_part_indices:
                if idx in used_part_indices:
                    continue
                part_content = parts[idx].get("content", "").lower()
                matches = sum(1 for v in sample_values if v in part_content)
                if matches >= len(sample_values) * 0.3:
                    best_match = idx
                    break

        if best_match >= 0:
            used_part_indices.add(best_match)
            old_part = parts[best_match]
            md_content = table_to_markdown(st)

            # Determine a good title
            title = old_part.get("title", "")
            if not title or title.lower() == "abbreviations":
                # Infer from content
                if any("mcl" in h.lower() or "standard" in h.lower() for h in st["headers"]):
                    title = "Drinking Water Standards and Health Advisories"
                elif any("naaqs" in h.lower() or "pollutant" in h.lower() for h in st["headers"]):
                    title = "NAAQS Criteria Pollutants"
                else:
                    first_header = st["headers"][0] if st["headers"] else "Data Table"
                    title = f"Table: {first_header}"

            new_part = {
                **old_part,
                "title": title,
                "type": "table",
                "content": md_content,
                "content_metadata": {
                    "num_rows": st["num_rows"],
                    "num_cols": st["num_cols"],
                    "headers": st["headers"],
                    "extraction_method": "camelot_stream",
                    "accuracy": st.get("accuracy"),
                    "pages": st.get("pages", [st.get("page")]),
                },
            }
            replacements.append((best_match, new_part))
            replaced_count += 1

    # Apply replacements and remove old fragments of the same table.
    # When the extractor splits a multi-page table across chunks, multiple parts
    # share the same title (e.g., 13 parts all titled "ABBREVIATIONS").
    # The Camelot replacement is the stitched whole — remove the fragments.
    replaced_titles: set[str] = set()
    replaced_indices: set[int] = set()
    for idx, new_part in replacements:
        replaced_indices.add(idx)
        old_title = parts[idx].get("title", "").strip().lower()
        if old_title:
            replaced_titles.add(old_title)

    new_parts: list[dict] = []
    removed_fragments = 0
    for i, part in enumerate(parts):
        if i in replaced_indices:
            # Replace with the Camelot version
            for idx, new_part in replacements:
                if idx == i:
                    new_parts.append(new_part)
                    break
        else:
            # Remove fragments: same title as a replaced part AND is a table
            part_title = part.get("title", "").strip().lower()
            if (
                part.get("type") == "table"
                and part_title in replaced_titles
                and part_title  # don't remove untitled parts
            ):
                removed_fragments += 1
                continue  # skip — this is an old fragment
            new_parts.append(part)

    if removed_fragments:
        print(
            f"  Removed {removed_fragments} old table fragment(s) "
            f"with same title as replaced tables",
            file=sys.stderr,
        )

    return {**parts_data, "parts": new_parts}, replaced_count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Camelot-based table extraction fallback for complex PDFs",
    )
    parser.add_argument("--pdf", required=True, help="Path to source PDF")
    parser.add_argument("--parts", required=True, help="Path to knowledge_parts.json to update")
    parser.add_argument(
        "--pages", default="all",
        help="Pages to extract (e.g., '9-20', '1,3,5', 'all'). Default: all",
    )
    parser.add_argument(
        "--flavor", default="stream", choices=["stream", "lattice"],
        help="Camelot extraction mode (default: stream — best for whitespace-aligned tables)",
    )
    parser.add_argument(
        "--preview", action="store_true",
        help="Preview extracted tables without modifying knowledge_parts.json",
    )
    parser.add_argument(
        "--min-rows", type=int, default=3,
        help="Minimum rows for a table to be included (default: 3)",
    )
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    parts_path = Path(args.parts)

    if not pdf_path.exists():
        print(f"Error: PDF not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)
    if not parts_path.exists():
        print(f"Error: Parts file not found: {parts_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Extracting tables from: {pdf_path.name}")
    print(f"Pages: {args.pages}, Flavor: {args.flavor}")

    # Step 1: Extract tables page by page
    raw_tables = extract_tables_from_pdf(str(pdf_path), args.pages, args.flavor)

    # Filter by min rows and accuracy — skip junk tables from non-table pages
    min_accuracy = 90.0
    before_filter = len(raw_tables)
    raw_tables = [
        t for t in raw_tables
        if t["num_rows"] >= args.min_rows and t["accuracy"] >= min_accuracy
    ]

    print(f"Raw tables extracted: {len(raw_tables)} (filtered {before_filter - len(raw_tables)} with <{min_accuracy}% accuracy or <{args.min_rows} rows)")
    for t in raw_tables:
        print(f"  Page {t['page']}: {t['num_rows']}r × {t['num_cols']}c (accuracy={t['accuracy']:.1f}%)")

    if not raw_tables:
        print("No tables found. Try --flavor lattice or check --pages range.")
        sys.exit(0)

    # Step 2: Stitch multi-page tables
    stitched = stitch_multi_page_tables(raw_tables)
    print(f"\nStitched tables: {len(stitched)}")
    for i, st in enumerate(stitched):
        pages = st.get("pages", [st.get("page")])
        print(f"  Table {i}: {st['num_rows']}r × {st['num_cols']}c, pages={pages}")
        print(f"    Headers: {st['headers'][:6]}{'...' if len(st['headers']) > 6 else ''}")
        # Show sample data row
        if st["rows"]:
            sample = st["rows"][min(2, len(st["rows"]) - 1)]
            sample_str = [v[:14] for v in sample[:6]]
            print(f"    Sample: {sample_str}")

    if args.preview:
        # Just show the tables, don't modify anything
        for i, st in enumerate(stitched):
            md = table_to_markdown(st)
            print(f"\n{'='*60}")
            print(f"Table {i} ({st['num_rows']} rows × {st['num_cols']} cols)")
            print(f"{'='*60}")
            # Show first 10 + last 3 rows
            lines = md.split("\n")
            if len(lines) > 15:
                for line in lines[:12]:
                    print(line)
                print(f"... ({len(lines) - 15} more rows) ...")
                for line in lines[-3:]:
                    print(line)
            else:
                print(md)
        sys.exit(0)

    # Step 3: Replace broken table parts
    parts_data = json.loads(parts_path.read_text())
    updated_data, replaced = replace_table_parts(
        parts_data, stitched, pdf_path.stem,
    )

    if replaced == 0:
        print("\nNo matching table parts found to replace.")
        print("Tables will be added as new parts.")
        # Add as new parts
        existing_parts = updated_data.get("parts", [])
        doc_slug = parts_path.parent.name
        for i, st in enumerate(stitched):
            md = table_to_markdown(st)
            new_id = f"{doc_slug}-camelot-table-{i+1:03d}"
            new_part = {
                "id": new_id,
                "type": "table",
                "title": f"Table {i+1}" if not st["headers"] else st["headers"][0],
                "content": md,
                "content_metadata": {
                    "num_rows": st["num_rows"],
                    "num_cols": st["num_cols"],
                    "headers": st["headers"],
                    "extraction_method": "camelot_stream",
                    "accuracy": st.get("accuracy"),
                    "pages": st.get("pages", [st.get("page")]),
                },
                "extraction_path": f"{doc_slug}/camelot-table-{i+1}",
                "pages": st.get("pages", [st.get("page")]),
                "source_doc": doc_slug,
            }
            existing_parts.append(new_part)
            replaced += 1
        updated_data = {**updated_data, "parts": existing_parts}

    # Write updated parts
    parts_path.write_text(json.dumps(updated_data, indent=2, ensure_ascii=False))
    print(f"\nReplaced/added {replaced} table part(s) in {parts_path.name}")

    # Also update parts-index.json if it exists
    index_path = parts_path.parent / "parts-index.json"
    if index_path.exists():
        index_data = json.loads(index_path.read_text())
        index_parts = index_data if isinstance(index_data, list) else index_data.get("parts", [])

        # Rebuild index from updated parts
        new_index = []
        for p in updated_data.get("parts", []):
            new_index.append({
                "id": p["id"],
                "type": p["type"],
                "title": p.get("title", ""),
                "extraction_path": p.get("extraction_path", ""),
                "pages": p.get("pages", []),
                "content_preview": p.get("content", "")[:200],
                "source_doc": p.get("source_doc", ""),
            })

        if isinstance(index_data, list):
            index_path.write_text(json.dumps(new_index, indent=2, ensure_ascii=False))
        else:
            index_path.write_text(json.dumps({"parts": new_index}, indent=2, ensure_ascii=False))
        print(f"Updated {index_path.name}")


if __name__ == "__main__":
    main()
