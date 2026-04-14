# /// script
# requires-python = ">=3.10"
# dependencies = ["opendataloader-pdf>=2.0"]
# ///
"""
Extract PDFs using OpenDataLoader PDF — local, deterministic, no Docker.

Fast path for digital PDFs. For scanned PDFs needing OCR, use
docling_extract.py. Use extract_router.py to auto-route between them.

Single file:
    uv run scripts/odl_extract.py document.pdf -o knowledge/doc-slug/odl-result.json

Batch mode:
    uv run scripts/odl_extract.py --batch \\
      doc1.pdf:knowledge/doc1/odl-result.json \\
      doc2.pdf:knowledge/doc2/odl-result.json
"""

import argparse
import json
import sys
import time
from pathlib import Path

try:
    import opendataloader_pdf
except ImportError:
    print("ERROR: opendataloader-pdf not installed.", file=sys.stderr)
    print("       Run: pip install -U opendataloader-pdf", file=sys.stderr)
    print("       Requires Java 11+ on PATH.", file=sys.stderr)
    sys.exit(1)


def _write_status(output_path: Path, status_data: dict) -> None:
    """Write extraction status alongside the output file for downstream consumers."""
    status_path = output_path.parent / "extraction-status.json"
    status_path.write_text(json.dumps(status_data, indent=2))


def _detect_used_struct_tree(odl_json: dict) -> bool:
    """Best-effort: did ODL actually use the PDF structure tree?

    ODL doesn't expose this flag directly. Heuristic: any element of type=heading
    with an explicit heading_level field means the tag tree was consumed.
    Returns False for XY-Cut++ fallback output (no typed headings).
    """
    for k in odl_json.get("kids", []):
        if k.get("type") == "heading" and k.get("heading level") is not None:
            return True
    return False


def extract_single(
    pdf_path: Path,
    output_path: Path,
    use_struct_tree: bool = True,
    table_method: str = "cluster",
    skip_existing: bool = False,
) -> bool:
    """Extract a single PDF via ODL. Returns True on success."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if skip_existing and output_path.exists():
        try:
            data = json.loads(output_path.read_text())
            if data.get("kids"):
                size_mb = output_path.stat().st_size / (1024 * 1024)
                print(f"Reusing existing extraction: {output_path} ({size_mb:.1f}MB, {len(data['kids'])} elements)")
                _write_status(output_path, {
                    "backend": "odl",
                    "status": "reused_existing",
                    "pdf": pdf_path.name,
                    "note": "odl-result.json already existed with valid data — skipped re-extraction",
                })
                return True
        except (json.JSONDecodeError, OSError):
            print(f"  Existing {output_path} is invalid — re-extracting")

    start = time.time()
    out_dir = output_path.parent
    print(f"Extracting {pdf_path.name} via OpenDataLoader (use_struct_tree={use_struct_tree}, table_method={table_method})...")

    try:
        opendataloader_pdf.convert(
            input_path=[str(pdf_path)],
            output_dir=str(out_dir),
            format="json",
            reading_order="xycut",
            use_struct_tree=use_struct_tree,
            table_method=table_method,
        )
    except Exception as e:
        print(f"ERROR: ODL extraction failed: {e}", file=sys.stderr)
        _write_status(output_path, {
            "backend": "odl",
            "status": "failed",
            "error": str(e),
            "pdf": pdf_path.name,
        })
        return False

    emitted = out_dir / f"{pdf_path.stem}.json"
    if emitted.exists() and emitted.resolve() != output_path.resolve():
        emitted.rename(output_path)
    if not output_path.exists():
        print(f"ERROR: ODL output not found at {emitted} or {output_path}", file=sys.stderr)
        return False

    duration = time.time() - start
    try:
        result = json.loads(output_path.read_text())
    except json.JSONDecodeError as e:
        print(f"ERROR: ODL produced invalid JSON: {e}", file=sys.stderr)
        return False

    elements = len(result.get("kids", []))
    pages = result.get("number of pages", 0)
    used_tree = _detect_used_struct_tree(result)

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"Saved: {output_path} ({size_mb:.2f}MB, {pages} pages, {elements} elements, {duration:.1f}s)")
    print(f"  used_struct_tree: {used_tree} (requested: {use_struct_tree})")

    _write_status(output_path, {
        "backend": "odl",
        "status": "success",
        "pdf": pdf_path.name,
        "pages": pages,
        "elements": elements,
        "duration_seconds": round(duration, 2),
        "used_struct_tree": used_tree,
        "requested_struct_tree": use_struct_tree,
        "reading_order": "xycut",
        "table_method": table_method,
        "last_checked": time.strftime("%Y-%m-%dT%H:%M:%S"),
    })
    return True


def extract_batch(
    pairs: list[tuple[Path, Path]],
    use_struct_tree: bool = True,
    table_method: str = "cluster",
    skip_existing: bool = False,
) -> bool:
    """Batch-extract via a single ODL convert() call when possible.

    ODL spawns a JVM per convert() call, so one call with all inputs is fastest.
    Only works when all target outputs share a parent directory; otherwise falls
    back to per-file extraction.
    """
    to_extract: list[tuple[Path, Path]] = []
    for pdf_path, output_path in pairs:
        if not pdf_path.exists():
            print(f"ERROR: PDF not found: {pdf_path}", file=sys.stderr)
            return False
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if skip_existing and output_path.exists():
            try:
                data = json.loads(output_path.read_text())
                if data.get("kids"):
                    size_mb = output_path.stat().st_size / (1024 * 1024)
                    print(f"Reusing: {output_path} ({size_mb:.1f}MB)")
                    continue
            except (json.JSONDecodeError, OSError):
                pass
        to_extract.append((pdf_path, output_path))

    if not to_extract:
        return True

    parents = {op.parent.resolve() for _, op in to_extract}
    if len(parents) != 1:
        all_ok = True
        for pdf_path, output_path in to_extract:
            if not extract_single(
                pdf_path, output_path,
                use_struct_tree=use_struct_tree,
                table_method=table_method,
            ):
                all_ok = False
        return all_ok

    out_dir = next(iter(parents))
    start = time.time()
    print(f"Batch-extracting {len(to_extract)} PDFs via ODL into {out_dir}...")
    try:
        opendataloader_pdf.convert(
            input_path=[str(p) for p, _ in to_extract],
            output_dir=str(out_dir),
            format="json",
            reading_order="xycut",
            use_struct_tree=use_struct_tree,
            table_method=table_method,
        )
    except Exception as e:
        print(f"ERROR: Batch extraction failed: {e}", file=sys.stderr)
        return False
    duration = time.time() - start

    all_ok = True
    for pdf_path, output_path in to_extract:
        emitted = out_dir / f"{pdf_path.stem}.json"
        if emitted.exists() and emitted.resolve() != output_path.resolve():
            emitted.rename(output_path)
        if not output_path.exists():
            print(f"ERROR: Missing ODL output for {pdf_path.name}", file=sys.stderr)
            all_ok = False
            continue
        try:
            result = json.loads(output_path.read_text())
        except json.JSONDecodeError:
            print(f"ERROR: Invalid JSON for {pdf_path.name}", file=sys.stderr)
            all_ok = False
            continue
        pages = result.get("number of pages", 0)
        elements = len(result.get("kids", []))
        used_tree = _detect_used_struct_tree(result)
        _write_status(output_path, {
            "backend": "odl",
            "status": "success",
            "pdf": pdf_path.name,
            "pages": pages,
            "elements": elements,
            "duration_seconds": round(duration / len(to_extract), 2),
            "used_struct_tree": used_tree,
            "requested_struct_tree": use_struct_tree,
            "reading_order": "xycut",
            "table_method": table_method,
            "last_checked": time.strftime("%Y-%m-%dT%H:%M:%S"),
        })
        size_mb = output_path.stat().st_size / (1024 * 1024)
        print(f"  {pdf_path.name} → {output_path.name} ({size_mb:.2f}MB, {pages} pages, {elements} elements)")
    print(f"Batch extraction completed in {duration:.1f}s")
    return all_ok


def parse_pair(s: str) -> tuple[Path, Path]:
    """Parse 'pdf_path:output_path' into (Path, Path). Last colon is the separator
    (supports Windows drive letters in input paths)."""
    if ":" not in s:
        raise argparse.ArgumentTypeError(f"Invalid pair (need 'pdf:output'): {s}")
    idx = s.rfind(":")
    return Path(s[:idx]), Path(s[idx + 1:])


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract PDFs via OpenDataLoader (local, deterministic)"
    )
    parser.add_argument("inputs", nargs="+",
                        help="Single: PDF path. Batch (with --batch): 'pdf:output' pairs.")
    parser.add_argument("-o", "--output",
                        help="Output JSON path (single-file mode only)")
    parser.add_argument("--batch", action="store_true",
                        help="Batch mode: inputs are 'pdf:output' pairs")
    parser.add_argument("--no-struct-tree", action="store_true",
                        help="Disable structure tree (force XY-Cut++ layout)")
    parser.add_argument("--table-method", choices=["default", "cluster"], default="cluster",
                        help="Table detection method (default: cluster)")
    parser.add_argument("--skip-existing", action="store_true",
                        help="Skip PDFs whose output JSON already exists with valid data")
    args = parser.parse_args()

    use_struct_tree = not args.no_struct_tree

    if args.batch:
        pairs = [parse_pair(s) for s in args.inputs]
        ok = extract_batch(
            pairs,
            use_struct_tree=use_struct_tree,
            table_method=args.table_method,
            skip_existing=args.skip_existing,
        )
    else:
        if not args.output:
            print("ERROR: --output is required for single-file mode", file=sys.stderr)
            sys.exit(1)
        if len(args.inputs) != 1:
            print("ERROR: single mode takes exactly one PDF input", file=sys.stderr)
            sys.exit(1)
        ok = extract_single(
            Path(args.inputs[0]), Path(args.output),
            use_struct_tree=use_struct_tree,
            table_method=args.table_method,
            skip_existing=args.skip_existing,
        )

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
