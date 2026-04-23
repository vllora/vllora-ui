# /// script
# requires-python = ">=3.10"
# dependencies = ["opendataloader-pdf[hybrid]>=2.0"]
# ///
"""
Route each PDF to the right extractor.

Digital PDFs (selectable text) → OpenDataLoader (hybrid=off): fast, local Java.
Scanned PDFs (no selectable text) → OpenDataLoader Hybrid
(hybrid=docling-fast): client-side ODL pointing at the hybrid backend server.

Both paths produce the same kids[] JSON format. The downstream
build_knowledge_parts.py always hits the ODL branch.

Single file:
    uv run scripts/extract_router.py document.pdf -o knowledge/doc-slug/extraction-result.json

Batch mode:
    uv run scripts/extract_router.py --batch \
      doc1.pdf:knowledge/doc1/extraction-result.json \
      doc2.pdf:knowledge/doc2/extraction-result.json
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import odl_extract  # noqa: E402


def is_digital_pdf(pdf_path: Path) -> bool:
    """Detect if a PDF has selectable text (digital) or needs OCR (scanned)."""
    try:
        result = subprocess.run(
            ["pdftotext", "-f", "3", "-l", "6", str(pdf_path), "-"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        word_count = len(result.stdout.split())
        return word_count > 50
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def route(pdf_path: Path, force_backend: str | None = None) -> str:
    """Return 'odl' or 'odl_hybrid' based on PDF type."""
    if force_backend:
        return force_backend
    return "odl" if is_digital_pdf(pdf_path) else "odl_hybrid"


def parse_pair(s: str) -> tuple[Path, Path]:
    """Parse 'pdf_path:output_path' — last colon is the separator."""
    if ":" not in s:
        raise argparse.ArgumentTypeError(f"Invalid pair (need 'pdf:output'): {s}")
    idx = s.rfind(":")
    return Path(s[:idx]), Path(s[idx + 1:])


def _resolve_hybrid_backend_force_ocr(args: argparse.Namespace, auto_routed: bool) -> bool:
    if args.backend_force_ocr:
        return True
    if args.force_ocr:
        return True
    return auto_routed


def _resolve_hybrid_backend_ocr_lang(args: argparse.Namespace) -> str | None:
    return args.backend_ocr_lang or args.ocr_lang


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Auto-route PDFs to OpenDataLoader (digital) or ODL Hybrid (scanned)"
    )
    parser.add_argument("inputs", nargs="+",
                        help="Single: PDF path. Batch (with --batch): 'pdf:output' pairs.")
    parser.add_argument("-o", "--output",
                        help="Output JSON path (single-file mode only)")
    parser.add_argument("--batch", action="store_true",
                        help="Batch mode: inputs are 'pdf:output' pairs")
    parser.add_argument("--force", choices=["odl", "odl_hybrid"],
                        help="Override auto-detection and force a specific backend")
    parser.add_argument("--skip-existing", action="store_true",
                        help="Skip PDFs whose output JSON already exists with valid data")
    parser.add_argument("--no-struct-tree", action="store_true",
                        help="[ODL] Disable structure tree (force XY-Cut++ layout)")
    parser.add_argument("--table-method", choices=["default", "cluster"], default="cluster",
                        help="[ODL] Table detection method (default: cluster)")
    parser.add_argument("--hybrid-url", default=None,
                        help="[ODL Hybrid] Explicit hybrid backend URL")
    parser.add_argument("--hybrid-host", default=odl_extract.odl_hybrid_backend.DEFAULT_HYBRID_HOST,
                        help="[ODL Hybrid] Host for auto-managed hybrid backend")
    parser.add_argument("--hybrid-port", type=int, default=odl_extract.odl_hybrid_backend.DEFAULT_HYBRID_PORT,
                        help="[ODL Hybrid] Port for auto-managed hybrid backend")
    parser.add_argument("--hybrid-mode", default=None,
                        help="[ODL Hybrid] Client mode, e.g. 'full' for picture descriptions")
    parser.add_argument("--hybrid-autostart", action=argparse.BooleanOptionalAction, default=True,
                        help="[ODL Hybrid] Start a local hybrid backend automatically (default: True)")
    parser.add_argument("--hybrid-fallback", action=argparse.BooleanOptionalAction, default=True,
                        help="[ODL Hybrid] Fall back to Java-only on error (default: True)")
    parser.add_argument("--hybrid-timeout", type=int, default=60000,
                        help="[ODL Hybrid] Backend timeout in ms (default: 60000)")
    parser.add_argument("--backend-force-ocr", action=argparse.BooleanOptionalAction, default=False,
                        help="[ODL Hybrid] Start auto-managed backend with --force-ocr")
    parser.add_argument("--backend-ocr-lang", default=None,
                        help="[ODL Hybrid] Start auto-managed backend with --ocr-lang")
    parser.add_argument("--backend-enrich-picture-description",
                        action=argparse.BooleanOptionalAction, default=False,
                        help="[ODL Hybrid] Start auto-managed backend with picture description enrichment")
    parser.add_argument("--ocr-lang", default=None,
                        help="[ODL Hybrid] DEPRECATED alias for --backend-ocr-lang")
    parser.add_argument("--force-ocr", action="store_true",
                        help="[ODL Hybrid] DEPRECATED alias for --backend-force-ocr")
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

    odl_pairs: list[tuple[Path, Path]] = []
    odl_hybrid_pairs: list[tuple[Path, Path]] = []
    hybrid_auto_routed = False

    for pdf_path, output_path in pairs:
        if not pdf_path.exists():
            print(f"ERROR: PDF not found: {pdf_path}", file=sys.stderr)
            sys.exit(1)
        backend = route(pdf_path, force_backend=args.force)
        auto_routed = args.force is None and backend == "odl_hybrid"
        if backend == "odl":
            print(f"Routing {pdf_path.name} → OpenDataLoader (digital PDF)")
            odl_pairs.append((pdf_path, output_path))
        elif backend == "odl_hybrid":
            print(f"Routing {pdf_path.name} → OpenDataLoader Hybrid (scanned PDF, backend server)")
            hybrid_auto_routed = hybrid_auto_routed or auto_routed
            odl_hybrid_pairs.append((pdf_path, output_path))

    all_ok = True

    if odl_pairs:
        ok = odl_extract.extract_batch(
            odl_pairs,
            use_struct_tree=not args.no_struct_tree,
            table_method=args.table_method,
            skip_existing=args.skip_existing,
        )
        all_ok = all_ok and ok

    if odl_hybrid_pairs:
        ok = odl_extract.extract_batch(
            odl_hybrid_pairs,
            use_struct_tree=not args.no_struct_tree,
            table_method=args.table_method,
            skip_existing=args.skip_existing,
            hybrid="docling-fast",
            hybrid_url=args.hybrid_url,
            hybrid_host=args.hybrid_host,
            hybrid_port=args.hybrid_port,
            hybrid_mode=args.hybrid_mode,
            hybrid_autostart=args.hybrid_autostart,
            hybrid_fallback=args.hybrid_fallback,
            hybrid_timeout=args.hybrid_timeout,
            backend_force_ocr=_resolve_hybrid_backend_force_ocr(args, hybrid_auto_routed),
            backend_ocr_lang=_resolve_hybrid_backend_ocr_lang(args),
            backend_enrich_picture_description=args.backend_enrich_picture_description,
            ocr_lang=args.ocr_lang,
            force_ocr=args.force_ocr,
        )
        all_ok = all_ok and ok

    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
