# /// script
# requires-python = ">=3.10"
# dependencies = ["requests>=2.31", "opendataloader-pdf>=2.0"]
# ///
"""
Route each PDF to the right extractor.

Digital PDFs (selectable text) → OpenDataLoader: fast, local, deterministic.
Scanned PDFs (no selectable text) → Docling Serve: OCR-capable.

The downstream build_knowledge_parts.py detects which backend produced the
output by sniffing the JSON structure (kids[] = ODL, chunks[] = Docling).

Single file:
    uv run scripts/extract_router.py document.pdf -o knowledge/doc-slug/extraction-result.json

Batch mode:
    uv run scripts/extract_router.py --batch \\
      doc1.pdf:knowledge/doc1/extraction-result.json \\
      doc2.pdf:knowledge/doc2/extraction-result.json
"""

import argparse
import sys
from pathlib import Path

# Both sibling modules live next to this script.
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from docling_extract import is_digital_pdf  # noqa: E402
import docling_extract  # noqa: E402
import odl_extract  # noqa: E402


def route(pdf_path: Path, force_backend: str | None = None) -> str:
    """Return 'odl' or 'docling' based on PDF digital/scanned detection."""
    if force_backend:
        return force_backend
    return "odl" if is_digital_pdf(pdf_path) else "docling"


def parse_pair(s: str) -> tuple[Path, Path]:
    """Parse 'pdf_path:output_path' — last colon is the separator."""
    if ":" not in s:
        raise argparse.ArgumentTypeError(f"Invalid pair (need 'pdf:output'): {s}")
    idx = s.rfind(":")
    return Path(s[:idx]), Path(s[idx + 1:])


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Auto-route PDFs to OpenDataLoader (digital) or Docling (scanned)"
    )
    parser.add_argument("inputs", nargs="+",
                        help="Single: PDF path. Batch (with --batch): 'pdf:output' pairs.")
    parser.add_argument("-o", "--output",
                        help="Output JSON path (single-file mode only)")
    parser.add_argument("--batch", action="store_true",
                        help="Batch mode: inputs are 'pdf:output' pairs")
    parser.add_argument("--force", choices=["odl", "docling"],
                        help="Override the auto-detection and force a specific backend")
    parser.add_argument("--skip-existing", action="store_true",
                        help="Skip PDFs whose output JSON already exists with valid data")
    # ODL-specific pass-through
    parser.add_argument("--no-struct-tree", action="store_true",
                        help="[ODL] Disable structure tree (force XY-Cut++ layout)")
    parser.add_argument("--table-method", choices=["default", "cluster"], default="cluster",
                        help="[ODL] Table detection method (default: cluster)")
    # Docling-specific pass-through
    parser.add_argument("--docling-url", default="http://127.0.0.1:5001",
                        help="[Docling] Service URL (default: http://127.0.0.1:5001)")
    parser.add_argument("--docling-max-tokens", type=int, default=1024,
                        help="[Docling] Max tokens per chunk (default: 1024)")
    parser.add_argument("--docling-poll-interval", type=int, default=15,
                        help="[Docling] Poll interval in seconds (default: 15)")
    parser.add_argument("--docling-max-wait", type=int, default=1800,
                        help="[Docling] Max wait per PDF in seconds (default: 1800)")
    args = parser.parse_args()

    if args.batch:
        pairs = [parse_pair(s) for s in args.inputs]
    else:
        if not args.output:
            print("ERROR: --output is required for single-file mode", file=sys.stderr)
            sys.exit(1)
        if len(args.inputs) != 1:
            print("ERROR: single mode takes exactly one PDF input", file=sys.stderr)
            sys.exit(1)
        pairs = [(Path(args.inputs[0]), Path(args.output))]

    # Partition by backend
    odl_pairs: list[tuple[Path, Path]] = []
    docling_pairs: list[tuple[Path, Path]] = []
    for pdf_path, output_path in pairs:
        if not pdf_path.exists():
            print(f"ERROR: PDF not found: {pdf_path}", file=sys.stderr)
            sys.exit(1)
        backend = route(pdf_path, force_backend=args.force)
        if backend == "odl":
            print(f"Routing {pdf_path.name} → OpenDataLoader (digital PDF)")
            odl_pairs.append((pdf_path, output_path))
        else:
            print(f"Routing {pdf_path.name} → Docling (scanned PDF, needs OCR)")
            docling_pairs.append((pdf_path, output_path))

    all_ok = True

    if odl_pairs:
        ok = odl_extract.extract_batch(
            odl_pairs,
            use_struct_tree=not args.no_struct_tree,
            table_method=args.table_method,
            skip_existing=args.skip_existing,
        )
        all_ok = all_ok and ok

    if docling_pairs:
        ok = docling_extract.extract_batch(
            args.docling_url,
            docling_pairs,
            max_tokens=args.docling_max_tokens,
            poll_interval=args.docling_poll_interval,
            max_wait=args.docling_max_wait,
            skip_existing=args.skip_existing,
        )
        all_ok = all_ok and ok

    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
