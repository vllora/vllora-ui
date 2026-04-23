# /// script
# requires-python = ">=3.10"
# dependencies = ["opendataloader-pdf[hybrid]>=2.0"]
# ///
"""
Extract PDFs using OpenDataLoader PDF — local Java for digital PDFs plus a
server-backed hybrid path for scanned or complex documents.

Hybrid mode in OpenDataLoader uses a separate backend server
(`opendataloader-pdf-hybrid`). The client-side convert() call points at that
backend via `hybrid_url`.

Use extract_router.py to auto-route between the two modes.

Single file:
    uv run scripts/odl_extract.py document.pdf -o knowledge/doc-slug/odl-result.json

Scanned PDF with hybrid OCR:
    uv run scripts/odl_extract.py scanned.pdf -o knowledge/doc-slug/odl-result.json --hybrid docling-fast

Batch mode:
    uv run scripts/odl_extract.py --batch \
      doc1.pdf:knowledge/doc1/odl-result.json \
      doc2.pdf:knowledge/doc2/odl-result.json
"""

from __future__ import annotations

import argparse
import inspect
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import odl_hybrid_backend  # noqa: E402

try:
    import opendataloader_pdf
except ImportError:
    print("ERROR: opendataloader-pdf not installed.", file=sys.stderr)
    print('       Run: pip install -U "opendataloader-pdf[hybrid]"', file=sys.stderr)
    print("       Requires Java 11+ on PATH.", file=sys.stderr)
    sys.exit(1)

try:
    _SUPPORTED_CONVERT_KWARGS = set(inspect.signature(opendataloader_pdf.convert).parameters)
except (TypeError, ValueError):
    _SUPPORTED_CONVERT_KWARGS = None


@dataclass
class HybridRuntimeContext:
    session: odl_hybrid_backend.HybridBackendSession
    requested_backend_force_ocr: bool = False
    requested_backend_ocr_lang: str | None = None
    requested_backend_enrich_picture_description: bool = False


def _warn(message: str) -> None:
    print(f"WARNING: {message}", file=sys.stderr)


def _write_status(output_path: Path, status_data: dict) -> None:
    """Write extraction status alongside the output file for downstream consumers."""
    status_path = output_path.parent / "extraction-status.json"
    status_path.write_text(json.dumps(status_data, indent=2))


def _detect_used_struct_tree(odl_json: dict) -> bool:
    """Best-effort: did ODL actually use the PDF structure tree?"""
    for kid in odl_json.get("kids", []):
        if kid.get("type") == "heading" and kid.get("heading level") is not None:
            return True
    return False


def _filter_convert_kwargs(convert_kwargs: dict) -> tuple[dict, list[str]]:
    """Drop kwargs unsupported by the installed opendataloader_pdf version."""
    if _SUPPORTED_CONVERT_KWARGS is None:
        return convert_kwargs, []
    unsupported = sorted(k for k in convert_kwargs if k not in _SUPPORTED_CONVERT_KWARGS)
    if not unsupported:
        return convert_kwargs, []
    filtered = {k: v for k, v in convert_kwargs.items() if k in _SUPPORTED_CONVERT_KWARGS}
    return filtered, unsupported


def _record_requested_or_applied(
    status_data: dict,
    key: str,
    requested: bool | str | None,
    applied: bool | str | None,
) -> None:
    if requested in (None, False, ""):
        return
    if applied in (None, False, ""):
        status_data[f"requested_{key}"] = requested
    else:
        status_data[key] = applied


def _prepare_hybrid_context(
    hybrid: str,
    hybrid_url: str | None,
    hybrid_host: str,
    hybrid_port: int,
    hybrid_autostart: bool,
    hybrid_fallback: bool,
    backend_force_ocr: bool,
    backend_ocr_lang: str | None,
    backend_enrich_picture_description: bool,
    ocr_lang: str | None,
    force_ocr: bool,
) -> HybridRuntimeContext | None:
    if hybrid == "off":
        return None

    explicit_hybrid_url = hybrid_url is not None
    requested_backend_force_ocr = backend_force_ocr
    requested_backend_ocr_lang = backend_ocr_lang
    requested_backend_enrich_picture_description = backend_enrich_picture_description

    if force_ocr:
        _warn("--force-ocr is deprecated; use --backend-force-ocr instead.")
        requested_backend_force_ocr = True
    if ocr_lang:
        _warn("--ocr-lang is deprecated; use --backend-ocr-lang instead.")
        if requested_backend_ocr_lang is None:
            requested_backend_ocr_lang = ocr_lang

    if explicit_hybrid_url:
        if hybrid_autostart:
            _warn("--hybrid-autostart is ignored when --hybrid-url is set; using the provided backend URL as-is.")
        if requested_backend_force_ocr or requested_backend_ocr_lang or requested_backend_enrich_picture_description:
            _warn(
                "Backend server flags cannot reconfigure an explicit --hybrid-url target; "
                "recording them as requested but not applied."
            )

    session = odl_hybrid_backend.ensure_backend(
        hybrid_url=hybrid_url,
        hybrid_host=hybrid_host,
        hybrid_port=hybrid_port,
        autostart=hybrid_autostart and not explicit_hybrid_url,
        backend_force_ocr=requested_backend_force_ocr if not explicit_hybrid_url else False,
        backend_ocr_lang=requested_backend_ocr_lang if not explicit_hybrid_url else None,
        backend_enrich_picture_description=(
            requested_backend_enrich_picture_description if not explicit_hybrid_url else False
        ),
    )

    if session.preflight == "unreachable":
        if session.startup_error:
            _warn(session.startup_error)
        if hybrid_fallback:
            _warn("Proceeding with hybrid_fallback=True; OpenDataLoader may fall back to Java-only extraction.")
        else:
            _warn("Hybrid backend is unavailable and hybrid_fallback=False; extraction may fail.")

    return HybridRuntimeContext(
        session=session,
        requested_backend_force_ocr=requested_backend_force_ocr,
        requested_backend_ocr_lang=requested_backend_ocr_lang,
        requested_backend_enrich_picture_description=requested_backend_enrich_picture_description,
    )


def _build_convert_kwargs(
    pdf_paths: list[Path],
    output_dir: Path,
    use_struct_tree: bool,
    table_method: str,
    hybrid: str,
    hybrid_fallback: bool,
    hybrid_timeout: int,
    hybrid_mode: str | None,
    hybrid_context: HybridRuntimeContext | None,
) -> tuple[dict, list[str]]:
    convert_kwargs: dict = dict(
        input_path=[str(path) for path in pdf_paths],
        output_dir=str(output_dir),
        format="json",
        reading_order="xycut",
        use_struct_tree=use_struct_tree,
        table_method=table_method,
    )
    if hybrid != "off":
        convert_kwargs["hybrid"] = hybrid
        convert_kwargs["hybrid_fallback"] = hybrid_fallback
        convert_kwargs["hybrid_timeout"] = str(hybrid_timeout)
        if hybrid_context is not None:
            convert_kwargs["hybrid_url"] = hybrid_context.session.url
        if hybrid_mode:
            convert_kwargs["hybrid_mode"] = hybrid_mode

    convert_kwargs, unsupported_kwargs = _filter_convert_kwargs(convert_kwargs)
    if unsupported_kwargs:
        _warn(
            "Installed opendataloader-pdf does not support "
            f"{', '.join(unsupported_kwargs)}; continuing without them."
        )
    return convert_kwargs, unsupported_kwargs


def _apply_hybrid_status(
    status_data: dict,
    hybrid: str,
    hybrid_mode: str | None,
    hybrid_fallback: bool,
    hybrid_timeout: int,
    hybrid_context: HybridRuntimeContext | None,
    unsupported_kwargs: list[str],
) -> None:
    if hybrid == "off" or hybrid_context is None:
        return

    status_data["hybrid_backend"] = hybrid
    status_data["hybrid_mode"] = hybrid_mode or "default"
    status_data["hybrid_url"] = hybrid_context.session.url
    status_data["hybrid_fallback"] = hybrid_fallback
    status_data["hybrid_timeout"] = hybrid_timeout
    status_data["hybrid_backend_managed"] = hybrid_context.session.managed
    status_data["hybrid_backend_start"] = hybrid_context.session.start_state
    status_data["backend_preflight"] = hybrid_context.session.preflight
    if hybrid_context.session.preflight == "unreachable" and hybrid_fallback:
        status_data["fallback_expected"] = True
    if hybrid_context.session.startup_error:
        status_data["hybrid_backend_error"] = hybrid_context.session.startup_error

    _record_requested_or_applied(
        status_data,
        "backend_force_ocr",
        hybrid_context.requested_backend_force_ocr,
        hybrid_context.session.backend_force_ocr_applied,
    )
    _record_requested_or_applied(
        status_data,
        "backend_ocr_lang",
        hybrid_context.requested_backend_ocr_lang,
        hybrid_context.session.backend_ocr_lang_applied,
    )
    _record_requested_or_applied(
        status_data,
        "backend_enrich_picture_description",
        hybrid_context.requested_backend_enrich_picture_description,
        hybrid_context.session.backend_enrich_picture_description_applied,
    )
    if unsupported_kwargs:
        status_data["unsupported_options"] = unsupported_kwargs


def _extract_single_impl(
    pdf_path: Path,
    output_path: Path,
    use_struct_tree: bool,
    table_method: str,
    hybrid: str,
    hybrid_fallback: bool,
    hybrid_timeout: int,
    hybrid_mode: str | None,
    hybrid_context: HybridRuntimeContext | None,
) -> bool:
    start = time.time()
    out_dir = output_path.parent
    hybrid_info = f", hybrid={hybrid}" if hybrid != "off" else ""
    print(
        f"Extracting {pdf_path.name} via OpenDataLoader "
        f"(use_struct_tree={use_struct_tree}, table_method={table_method}{hybrid_info})..."
    )

    convert_kwargs, unsupported_kwargs = _build_convert_kwargs(
        [pdf_path],
        out_dir,
        use_struct_tree,
        table_method,
        hybrid,
        hybrid_fallback,
        hybrid_timeout,
        hybrid_mode,
        hybrid_context,
    )
    backend = "odl_hybrid" if hybrid != "off" else "odl"

    try:
        opendataloader_pdf.convert(**convert_kwargs)
    except Exception as exc:
        print(f"ERROR: ODL extraction failed: {exc}", file=sys.stderr)
        status_data: dict = {
            "backend": backend,
            "status": "failed",
            "error": str(exc),
            "pdf": pdf_path.name,
        }
        _apply_hybrid_status(
            status_data,
            hybrid,
            hybrid_mode,
            hybrid_fallback,
            hybrid_timeout,
            hybrid_context,
            unsupported_kwargs,
        )
        _write_status(output_path, status_data)
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
    except json.JSONDecodeError as exc:
        print(f"ERROR: ODL produced invalid JSON: {exc}", file=sys.stderr)
        return False

    elements = len(result.get("kids", []))
    pages = result.get("number of pages", 0)
    used_tree = _detect_used_struct_tree(result)

    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"Saved: {output_path} ({size_mb:.2f}MB, {pages} pages, {elements} elements, {duration:.1f}s)")
    print(f"  used_struct_tree: {used_tree} (requested: {use_struct_tree})")

    status_data = {
        "backend": backend,
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
    }
    _apply_hybrid_status(
        status_data,
        hybrid,
        hybrid_mode,
        hybrid_fallback,
        hybrid_timeout,
        hybrid_context,
        unsupported_kwargs,
    )
    _write_status(output_path, status_data)
    return True


def extract_single(
    pdf_path: Path,
    output_path: Path,
    use_struct_tree: bool = True,
    table_method: str = "cluster",
    skip_existing: bool = False,
    hybrid: str = "off",
    hybrid_fallback: bool = True,
    hybrid_timeout: int = 60000,
    hybrid_url: str | None = None,
    hybrid_mode: str | None = None,
    hybrid_autostart: bool = True,
    hybrid_host: str = odl_hybrid_backend.DEFAULT_HYBRID_HOST,
    hybrid_port: int = odl_hybrid_backend.DEFAULT_HYBRID_PORT,
    backend_force_ocr: bool = False,
    backend_ocr_lang: str | None = None,
    backend_enrich_picture_description: bool = False,
    ocr_lang: str | None = None,
    force_ocr: bool = False,
) -> bool:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if skip_existing and output_path.exists():
        try:
            data = json.loads(output_path.read_text())
            if data.get("kids"):
                size_mb = output_path.stat().st_size / (1024 * 1024)
                print(
                    f"Reusing existing extraction: {output_path} "
                    f"({size_mb:.1f}MB, {len(data['kids'])} elements)"
                )
                _write_status(output_path, {
                    "backend": "odl_hybrid" if hybrid != "off" else "odl",
                    "status": "reused_existing",
                    "pdf": pdf_path.name,
                    "note": "odl-result.json already existed with valid data — skipped re-extraction",
                })
                return True
        except (json.JSONDecodeError, OSError):
            print(f"  Existing {output_path} is invalid — re-extracting")

    hybrid_context = _prepare_hybrid_context(
        hybrid=hybrid,
        hybrid_url=hybrid_url,
        hybrid_host=hybrid_host,
        hybrid_port=hybrid_port,
        hybrid_autostart=hybrid_autostart,
        hybrid_fallback=hybrid_fallback,
        backend_force_ocr=backend_force_ocr,
        backend_ocr_lang=backend_ocr_lang,
        backend_enrich_picture_description=backend_enrich_picture_description,
        ocr_lang=ocr_lang,
        force_ocr=force_ocr,
    )
    try:
        return _extract_single_impl(
            pdf_path=pdf_path,
            output_path=output_path,
            use_struct_tree=use_struct_tree,
            table_method=table_method,
            hybrid=hybrid,
            hybrid_fallback=hybrid_fallback,
            hybrid_timeout=hybrid_timeout,
            hybrid_mode=hybrid_mode,
            hybrid_context=hybrid_context,
        )
    finally:
        if hybrid_context is not None:
            hybrid_context.session.close()


def extract_batch(
    pairs: list[tuple[Path, Path]],
    use_struct_tree: bool = True,
    table_method: str = "cluster",
    skip_existing: bool = False,
    hybrid: str = "off",
    hybrid_fallback: bool = True,
    hybrid_timeout: int = 60000,
    hybrid_url: str | None = None,
    hybrid_mode: str | None = None,
    hybrid_autostart: bool = True,
    hybrid_host: str = odl_hybrid_backend.DEFAULT_HYBRID_HOST,
    hybrid_port: int = odl_hybrid_backend.DEFAULT_HYBRID_PORT,
    backend_force_ocr: bool = False,
    backend_ocr_lang: str | None = None,
    backend_enrich_picture_description: bool = False,
    ocr_lang: str | None = None,
    force_ocr: bool = False,
) -> bool:
    """Batch-extract via a single ODL convert() call when possible."""
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

    hybrid_context = _prepare_hybrid_context(
        hybrid=hybrid,
        hybrid_url=hybrid_url,
        hybrid_host=hybrid_host,
        hybrid_port=hybrid_port,
        hybrid_autostart=hybrid_autostart,
        hybrid_fallback=hybrid_fallback,
        backend_force_ocr=backend_force_ocr,
        backend_ocr_lang=backend_ocr_lang,
        backend_enrich_picture_description=backend_enrich_picture_description,
        ocr_lang=ocr_lang,
        force_ocr=force_ocr,
    )
    try:
        parents = {output_path.parent.resolve() for _, output_path in to_extract}
        if len(parents) != 1:
            all_ok = True
            for pdf_path, output_path in to_extract:
                if not _extract_single_impl(
                    pdf_path=pdf_path,
                    output_path=output_path,
                    use_struct_tree=use_struct_tree,
                    table_method=table_method,
                    hybrid=hybrid,
                    hybrid_fallback=hybrid_fallback,
                    hybrid_timeout=hybrid_timeout,
                    hybrid_mode=hybrid_mode,
                    hybrid_context=hybrid_context,
                ):
                    all_ok = False
            return all_ok

        out_dir = next(iter(parents))
        start = time.time()
        hybrid_info = f", hybrid={hybrid}" if hybrid != "off" else ""
        print(f"Batch-extracting {len(to_extract)} PDFs via ODL into {out_dir}{hybrid_info}...")

        convert_kwargs, unsupported_kwargs = _build_convert_kwargs(
            [pdf_path for pdf_path, _ in to_extract],
            out_dir,
            use_struct_tree,
            table_method,
            hybrid,
            hybrid_fallback,
            hybrid_timeout,
            hybrid_mode,
            hybrid_context,
        )

        try:
            opendataloader_pdf.convert(**convert_kwargs)
        except Exception as exc:
            print(f"ERROR: Batch extraction failed: {exc}", file=sys.stderr)
            return False
        duration = time.time() - start

        backend = "odl_hybrid" if hybrid != "off" else "odl"
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
            status_data = {
                "backend": backend,
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
            }
            _apply_hybrid_status(
                status_data,
                hybrid,
                hybrid_mode,
                hybrid_fallback,
                hybrid_timeout,
                hybrid_context,
                unsupported_kwargs,
            )
            _write_status(output_path, status_data)
            size_mb = output_path.stat().st_size / (1024 * 1024)
            print(
                f"  {pdf_path.name} → {output_path.name} "
                f"({size_mb:.2f}MB, {pages} pages, {elements} elements)"
            )
        print(f"Batch extraction completed in {duration:.1f}s")
        return all_ok
    finally:
        if hybrid_context is not None:
            hybrid_context.session.close()


def parse_pair(s: str) -> tuple[Path, Path]:
    """Parse 'pdf_path:output_path' into (Path, Path)."""
    if ":" not in s:
        raise argparse.ArgumentTypeError(f"Invalid pair (need 'pdf:output'): {s}")
    idx = s.rfind(":")
    return Path(s[:idx]), Path(s[idx + 1:])


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract PDFs via OpenDataLoader (local Java + optional hybrid backend)"
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
    parser.add_argument("--hybrid", choices=["off", "docling-fast"], default="off",
                        help="Hybrid backend to use: 'off' or 'docling-fast' (default: off)")
    parser.add_argument("--hybrid-url", default=None,
                        help="Explicit hybrid backend URL (e.g. http://127.0.0.1:5002)")
    parser.add_argument("--hybrid-host", default=odl_hybrid_backend.DEFAULT_HYBRID_HOST,
                        help=f"Host for auto-managed hybrid backend (default: {odl_hybrid_backend.DEFAULT_HYBRID_HOST})")
    parser.add_argument("--hybrid-port", type=int, default=odl_hybrid_backend.DEFAULT_HYBRID_PORT,
                        help=f"Port for auto-managed hybrid backend (default: {odl_hybrid_backend.DEFAULT_HYBRID_PORT})")
    parser.add_argument("--hybrid-mode", default=None,
                        help="Hybrid client mode (e.g. 'full' for picture description output)")
    parser.add_argument("--hybrid-autostart", action=argparse.BooleanOptionalAction, default=True,
                        help="Start a local hybrid backend automatically when needed (default: True)")
    parser.add_argument("--hybrid-fallback", action=argparse.BooleanOptionalAction, default=True,
                        help="Fall back to Java-only if hybrid backend errors (default: True)")
    parser.add_argument("--hybrid-timeout", type=int, default=60000,
                        help="Hybrid backend timeout in milliseconds (default: 60000)")
    parser.add_argument("--backend-force-ocr", action=argparse.BooleanOptionalAction, default=False,
                        help="When auto-managing the backend, start it with --force-ocr")
    parser.add_argument("--backend-ocr-lang", default=None,
                        help="When auto-managing the backend, start it with --ocr-lang")
    parser.add_argument("--backend-enrich-picture-description",
                        action=argparse.BooleanOptionalAction, default=False,
                        help="When auto-managing the backend, enable picture description enrichment")
    parser.add_argument("--ocr-lang", default=None,
                        help="DEPRECATED: use --backend-ocr-lang")
    parser.add_argument("--force-ocr", action="store_true",
                        help="DEPRECATED: use --backend-force-ocr")
    args = parser.parse_args()

    use_struct_tree = not args.no_struct_tree

    common_kwargs = dict(
        use_struct_tree=use_struct_tree,
        table_method=args.table_method,
        skip_existing=args.skip_existing,
        hybrid=args.hybrid,
        hybrid_fallback=args.hybrid_fallback,
        hybrid_timeout=args.hybrid_timeout,
        hybrid_url=args.hybrid_url,
        hybrid_mode=args.hybrid_mode,
        hybrid_autostart=args.hybrid_autostart,
        hybrid_host=args.hybrid_host,
        hybrid_port=args.hybrid_port,
        backend_force_ocr=args.backend_force_ocr,
        backend_ocr_lang=args.backend_ocr_lang,
        backend_enrich_picture_description=args.backend_enrich_picture_description,
        ocr_lang=args.ocr_lang,
        force_ocr=args.force_ocr,
    )

    if args.batch:
        pairs = [parse_pair(s) for s in args.inputs]
        ok = extract_batch(pairs, **common_kwargs)
    else:
        if not args.output:
            print("ERROR: --output is required for single-file mode", file=sys.stderr)
            sys.exit(1)
        if len(args.inputs) != 1:
            print("ERROR: single mode takes exactly one PDF input", file=sys.stderr)
            sys.exit(1)
        ok = extract_single(Path(args.inputs[0]), Path(args.output), **common_kwargs)

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
